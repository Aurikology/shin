/**
 * The app server. Static files plus a thin API over the real price spine.
 *
 * No framework and no dependencies, so `node server.ts` is the whole install
 * step. Node runs the TypeScript directly.
 *
 * The API is deliberately thin. Every judgement lives in ../spine and this file
 * is only allowed to move it, never to make it. If a rule about prices appears
 * in here, it is in the wrong place.
 */

import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize as normalizePath, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as settings from '../settings/src/index.ts';
import { priceIt } from '../spine/src/spine.ts';
import { defaultDeps } from '../spine/src/sources/registry.ts';
import { RecordedSource } from '../spine/src/sources/recorded.ts';
import { CATEGORY_RULES } from '../spine/src/categories.ts';
import type { SpineQuery } from '../spine/src/contract.ts';
import { categoryFor } from './src/category-map.ts';
import { countryCodeOf, marketFromLocation } from '../catalogue/src/market.ts';
import {
  probeCatalogue,
  type UserCatalogue,
} from '../catalogue/src/user-catalogue.ts';
import { ATTRIBUTION } from './src/attribution.ts';
import { packScope, packVersion, servePack } from './src/pack-route.ts';
import {
  correctScan,
  getScan,
  lastAnsweredScan,
  openScanStore,
  recentCategories,
  recordScan,
  recordPick,
  recordShopperCall,
  updateScan,
} from './src/scans.ts';
import { customerDataFaults } from './src/customer-data-faults.ts';
import { canonicalBarcode, canonicalGtin } from './src/barcode.ts';
import { createCategoryGuard, defaultFaultsFile, ringLeaf, type CategoryGuard } from './src/category-guard.ts';
import {
  answerBarcodeFromCatalogue,
  answerNamedItem,
  catalogueFaults,
  catalogueFirstOn,
  lastRungRange,
  matchText,
  packReadSettings,
  pickCandidate,
  rangeAskSettings,
  readMatchTextBody,
  resolveTypedName,
  typedIdentity,
  type Identity,
  safeEstimate,
  shownVerdict,
  type BarcodeDeps,
  type MatchTextAnswer,
  type NamedElsewhere,
  type NoRangeReason,
  type TypedRow,
} from './src/catalogue-first.ts';
import { isNeverSentToAModel } from '../catalogue/src/source-rights.ts';
import { onceAsk, readShelfCents, readThresholdsRaw, shownRange, sortByName, verdictRecord, type RangeAsk } from './src/distribution.ts';
import type { Verdict } from '../price/src/estimate.ts';
import { PRICES_DB_PATH } from '../price/src/store.ts';
import { loadTable as loadStatcanTable, nationalAverageFor } from '../price/src/statcan.ts';
import type { Provider } from '../identify/src/provider.ts';
import { lookupOpenFoodFactsWithReason } from './src/open-food-facts.ts';
import { activeGapLog, recordGap } from '../catalogue/src/gaps.ts';
import { rangeFaults } from '../price/src/range.ts';
import { summariseScans, summariseDeviceScans, UNATTRIBUTED } from './src/scan-summary.ts';
import { keepLocation, keepPhoto, readConsent, writeConsent } from './src/consent.ts';
import { deleteRating, isRating, isRatingReason, rateScan, ratingFor, scanExists } from './src/ratings.ts';
import { deviceFromHeaders, entitlementStartupWarning, freeScanLimit, isPlus, isScanOutcome, quotaFor, recordScanOutcome, scanLimitRefusal } from './src/scan-quota.ts';
import { recordEvent, serialisePayload } from './src/events.ts';
import { chainsFromData, parseCell, storesNear, type StoreFetcher } from './src/stores.ts';
import { fileTypedReport, recordShelfPrice, shopperReportField } from './src/shopper-report.ts';
import { PRICE_MATCH_POLICIES } from './src/price-match.ts';
import { INVITE_EXEMPT, INVITE_HEADER, INVITE_REFUSAL, inviteAllows, inviteRequired, inviteWho, reportWitness } from './src/invite.ts';
import { KeyedLimiter, addressWindows, clientAddress, codeWindows, doorWindows, freeScanAddressWindows, isLocalRequest } from './src/rate-limit.ts';
import { logError } from './src/errlog.ts';
import { listenProblem, startupProblems } from './src/startup.ts';
import { sweepRequestLog, sweepScanData, sweepShopperPrices } from './src/retention.ts';
import { recordAccess } from './src/access-log.ts';
import { ADMIN_HEADER, adminAllows, handleAdmin } from './src/admin.ts';
import { DEVICE_REFUSAL, bindDevice, deviceHeaderOf, ownsDevice, provesDevice } from './src/device-key.ts';
import { recordShutterRequest, shutterDir, shutterLogOn } from './src/shutter-log.ts';
import { saveCappedShutterFrame } from './src/shutter-frame.ts';
import { diskHasRoom } from './src/disk-guard.ts';
import { saveShelfFrame, MAX_SHELF_FRAME_BYTES } from './src/shelf.ts';
import { savePhoto, sweepPhotos } from './src/photos.ts';
import {
  sweepGrounded,
} from './src/grounded-record.ts';
import { dailyLatency } from './src/latency.ts';
import { defaultPricesPath, lookupOwnPrices, lookupOwnPricesByBarcode, OWN_DATA_SOURCE, type OwnMatch } from './src/own-prices.ts';
import { checkPricesAtStart, notePricesOpened, pricesHealth } from './src/prices-health.ts';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const PORT = Number(settings.PORT() ?? 4173);

/**
 * The catalogue, attached two different ways on purpose.
 *
 * A barcode is answered on this thread, from this file's own read-only handle,
 * because it costs 0.2 ms against all 5,182,591 rows and because it is the one
 * request that has to keep working while something expensive is running. It is
 * also the free unlimited path in the tier table, so it must never be able to
 * queue behind a metered one.
 *
 * Everything else goes to a worker thread, because `node:sqlite` is synchronous
 * and a text search that falls through to the vector arm blocks its thread for
 * as long as the scan takes, measured at 735 ms with 6% of the index built.
 *
 * Both are optional. The app has to boot and serve every screen with no
 * catalogue at all, or nobody can work on the screens.
 */
const CATALOGUE_DB =
  settings.SHIN_CATALOGUE() ?? fileURLToPath(new URL('../catalogue/data/catalogue.db', import.meta.url));

let fastLookup: { byGtin(code: string): unknown } | null = null;
/** What the server needs of the search worker; `gaps` is the worker's count of misses it could not write down. */
interface SearchService {
  search(q: unknown): Promise<unknown>;
  gaps?(): { readonly dropped: number; readonly why: string };
}
let searchService: SearchService | null = null;
/*
 * The routing priors, loaded beside the catalogue because they are useless
 * without one: a route narrows a search, and there is nothing to narrow when
 * the catalogue is not attached. Null here is the same state as a device with
 * no history -- search everything -- so nothing downstream needs a second
 * branch for it.
 */
let routing: {
  decideRoute(input: unknown): { categories: readonly string[]; confidence: number; why: string };
  restrictedSearch(
    catalogue: unknown,
    query: unknown,
    route: unknown,
  ): Promise<{ result: unknown; restricted: boolean; fellBack: boolean; confidenceAdjustment: number }>;
} | null = null;
let catalogueWhyNot = 'not attempted yet';

/**
 * TEST ONLY. Nothing in the product calls this.
 *
 * The barcode half of `/api/identify` needs a `byGtin`, and on every machine
 * that runs the test suite the only thing that can provide one is a 4.13 GB
 * catalogue file that is not there. Without this seam the GET identify route
 * is untestable at the socket: it answers `catalogueUp: false`, writes no scan
 * row, and every assertion about a scan id would be an assertion about the
 * offline path instead of about the route.
 *
 * It replaces exactly one thing, the same way `setIdentifierForTests` does.
 * The routing, the category verdict, the scan write, the telemetry columns and
 * the response shape are all the shipped code in the tests that use it.
 */

/*
 * The serve-time category safeguard (src/category-guard.ts; docs/category-
 * safeguards-2026-10-08.md, A2 and A5). Built once at start. If the taxonomy
 * file is missing the guard is OFF, logs `[category-fault] taxonomy_unavailable`,
 * and `/api/health` says "category check off". It never blocks or changes an answer.
 */
let categoryGuard: CategoryGuard = createCategoryGuard({
  taxonomyPath: fileURLToPath(new URL('../catalogue/data/off-categories.json', import.meta.url)),
  baselinePath: fileURLToPath(new URL('../catalogue/category-baseline.json', import.meta.url)),
  faultsFile: defaultFaultsFile(),
});

/**
 * The swallowed-error counters `/api/health` adds (category-check.ts, A7). `gapsDropped` is the misses
 * the gap log could not take, summed over this thread's log and the search worker's (which has its own
 * memory, so the service carries its count back with each reply), with the latest reason. The two
 * fault maps count what range.ts and catalogue-first.ts could not read; each is `{}` when none.
 */
function faultHealth(): {
  gapsDropped: number;
  gapsDroppedWhy: string;
  rangeFaults: Record<string, number>;
  catalogueFaults: Record<string, number>;
  customerDataFaults: Record<string, number>;
} {
  const worker = searchService?.gaps?.() ?? { dropped: 0, why: '' };
  const here = activeGapLog();
  return {
    gapsDropped: worker.dropped + (here?.dropped ?? 0),
    gapsDroppedWhy: worker.why || here?.droppedWhy || '',
    rangeFaults: rangeFaults(),
    catalogueFaults: catalogueFaults(),
    // Requirements 3.9, 5.1, 5.6 (customer-data-faults.ts): `{}` when none.
    customerDataFaults: customerDataFaults(),
  };
}

/** TEST ONLY: replace the category guard (a guard built on a fixture taxonomy, or on a missing one). */
export function setCategoryGuardForTests(guard: CategoryGuard): void {
  categoryGuard = guard;
}

/** TEST ONLY: replace the catalogue search worker `/api/search` calls, to drive a ring through the route. */
export function setSearchServiceForTests(fake: SearchService | null): void {
  searchService = fake;
}

export function setCatalogueForTests(fake: { byGtin(code: string): unknown } | null): void {
  fastLookup = fake;
  catalogueWhyNot = fake ? 'a test double' : 'not attempted yet';
}

/**
 * TEST ONLY, for the catalogue-first path (src/catalogue-first.ts). Replaces the
 * three things a test machine cannot have: the search worker (a real
 * in-memory `Catalogue` stands in), the catalogue handle the range ladder and
 * the brand lookup read, and the Claude provider the range ask would build from
 * ANTHROPIC_API_KEY. With a provider injected, no socket is ever opened. Null
 * restores the shipped wiring.
 */
let catalogueFirstTest: {
  searcher?: { search(q: unknown): Promise<unknown> } | null;
  db?: DatabaseSync | null;
  rangeAskProvider?: Provider;
  /** Test the real consent check. Otherwise a test's fake provider counts as the shopper's yes. */
  requireClaudeConsent?: boolean;
  /** The Claude provider the frame read (identify/src/pack-read.ts) would build from ANTHROPIC_API_KEY. */
  packReadProvider?: Provider;
  /** How long a verdict waits for the Claude ask (design case 27), shortened under test. */
  claudeWaitMs?: number;
} | null = null;
export function setCatalogueFirstForTests(fake: typeof catalogueFirstTest): void {
  catalogueFirstTest = fake;
}
/**
 * The same read-only handle `fastLookup` was built from, kept so `/api/alternatives`
 * can query `product_category` directly (what `alternativesFor` needs) without
 * opening a second connection to the same file. `fastLookup` keeps its own handle
 * private, so this is the one place outside `attachCatalogue` that gets to see it.
 */
let catalogueDb: DatabaseSync | null = null;

/**
 * Whether the meaning half of search is affordable right now.
 *
 * The vector index is scanned in full on every query. Measured 2026-09-05 at
 * 2.8 microseconds per row, three times, on both the real index and a synthetic
 * one, and flat across 100k, 300k and 1M rows, which is what a linear scan looks
 * like. At the 512,326 rows embedded this afternoon that is 1.4 seconds of the
 * 1.5 second search; at all 5,182,591 it is roughly fourteen.
 *
 * So the ceiling is arithmetic rather than taste: a quarter second of vector
 * time buys 250,000 / 2.8 = about 89,000 rows. Rounded to 90,000. Past that the
 * arm is switched off and search runs on the text index alone, which measured
 * 24 to 113 ms and is what actually answers today.
 *
 * THE STRUCTURAL FIX IS KNOWN AND DELIBERATELY NOT BUILT YET. Quantizing the
 * vectors to one bit per dimension makes the table 373 MB instead of 8 GB, and
 * partitioning it on whether a product is sold in Canada cuts the common case
 * another nine times; measured on synthetic data at the same scale, the two
 * together land near 90 ms. Both are native to the vector extension already
 * installed, so it is a schema change and a re-quantize pass, not a new
 * dependency.
 *
 * It is not built because nothing has shown the vector arm earns its place. On
 * the twenty probes the band calibration already uses, text-only retrieval
 * matched or beat vector-only, 8 of 10 against 6 of 10. Those probes are all
 * English, so they do not test the case the multilingual embedder was chosen
 * for: a French query reaching an English row.
 *
 * `catalogue/src/vector-worth-it.ts` runs that test, and until 2026-09-05 this
 * comment named that path while the file did not exist, which made an open
 * question look like one command away from settled. It exists now, and its
 * ground truth is the catalogue's own 17,489 Canadian rows carrying an English
 * and a French name that differ, so nothing is hand-labelled.
 *
 * FIRST RESULT, 40 French queries, 2026-09-05:
 *
 *   text only, top 5      30 of 40   436 ms each
 *   with vectors, top 5   25 of 40   2,405 ms each
 *   found only by vectors  0
 *   found by text, then lost by fusing  5
 *
 * So fusing is not free: it lost the right row five times and cost 5.5x the
 * time, and rescued nothing. The arm stays off.
 *
 * What that does NOT establish, stated because the number is quotable and the
 * limit is not: these rows are indexed under both names, so the word index can
 * read the exact French string being searched. That is where vectors can add
 * least. A product held in English only, queried in French, is still untested,
 * and testing it needs a throwaway FTS table built from English names alone.
 * Until that runs, decision 24 is not dead, only unpaid.
 */
const VECTOR_ROW_CEILING = 90_000;
let embeddedRows = 0;
let vectorsOn = false;

async function attachCatalogue(): Promise<void> {
  try {
    const [{ openCatalogueReadOnly }, { Catalogue }, { defaultEmbedder }, { startCatalogueService }] =
      await Promise.all([
        import('../catalogue/src/schema.ts'),
        import('../catalogue/src/search.ts'),
        import('../catalogue/src/embed.ts'),
        import('../catalogue/src/service.ts'),
      ]);
    routing = (await import('../catalogue/src/routing.ts')) as unknown as typeof routing;
    const db = openCatalogueReadOnly(CATALOGUE_DB);
    catalogueDb = db;
    // The embedder handed to this one is never used: byGtin does no embedding,
    // and it loads its model lazily, so constructing it costs nothing here.
    fastLookup = new Catalogue(db, defaultEmbedder()) as unknown as { byGtin(code: string): unknown };
    const n = db.prepare('SELECT count(*) AS n FROM product').get() as { n: number };
    const ca = db
      .prepare('SELECT count(*) AS n FROM product WHERE sold_in_canada = 1')
      .get() as { n: number };
    try {
      embeddedRows = (
        db.prepare('SELECT count(*) AS n FROM product_vec_rowids').get() as { n: number }
      ).n;
    } catch {
      embeddedRows = 0;
    }
    vectorsOn =
      settings.SHIN_VECTORS() === 'on' ||
      (settings.SHIN_VECTORS() !== 'off' && embeddedRows > 0 && embeddedRows <= VECTOR_ROW_CEILING);
    // D40: the embedding model is pre-loaded only when meaning search is on. With
    // it off nothing embeds a query, and the load used to log a Protobuf failure
    // for a model that is not on the answer path.
    searchService = startCatalogueService(CATALOGUE_DB, { warm: vectorsOn }) as unknown as SearchService;

    catalogueWhyNot = '';
    console.log(
      `catalogue attached: ${n.n.toLocaleString()} products, ${ca.n.toLocaleString()} sold in Canada`,
    );
    console.log(
      vectorsOn
        ? `meaning search on (${embeddedRows.toLocaleString()} rows embedded)`
        : settings.SHIN_VECTORS() === 'off'
          ? 'meaning search off: SHIN_VECTORS is off. Text search still runs.'
          : embeddedRows === 0
            ? 'meaning search off: no rows are embedded. Text search still runs.'
            : `meaning search off: ${embeddedRows.toLocaleString()} rows embedded is past the ${VECTOR_ROW_CEILING.toLocaleString()} row ceiling, one query would scan all of them. Text search still runs.`,
    );
  } catch (err) {
    // Named, not swallowed. "The catalogue is missing" and "we have never seen
    // this product" are different sentences and the screen has to pick one.
    catalogueWhyNot = err instanceof Error ? err.message : String(err);
    console.log(`catalogue not attached: ${catalogueWhyNot}`);
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  /* Added 2026-09-06 with the self-hosted fonts. Without it these fall through
     to application/octet-stream below. Browsers do parse them anyway, because
     the format('woff2') hint in the @font-face rule is what actually drives
     parsing -- but an octet-stream is not cacheable the same way and it is the
     kind of thing that works on a desktop and fails behind a proxy. */
  '.woff2': 'font/woff2',
  /* Added 2026-09-07, and this one is not cosmetic the way the fonts were.
     Without it a .wasm falls through to application/octet-stream, and
     `WebAssembly.compileStreaming` refuses an octet-stream outright: the
     console reads "Incorrect response MIME type. Expected 'application/wasm'"
     and the loader falls back to buffering the whole module and compiling it
     from an ArrayBuffer. That works, which is exactly why nobody noticed, but
     it gives up the streaming compile on a 1.1 MB reader on the one screen
     the product opens on. Measured in Chrome against this server. */
  '.wasm': 'application/wasm',
  /* The on-device detector's model. Named here rather than left to fall
     through, so the type is a decision rather than an accident if it is ever
     served. See build-eye.mjs for why it may legitimately be absent. */
  '.tflite': 'application/octet-stream',
  /* Source maps, so a devtools fetch of one is not an octet-stream download. */
  '.map': 'application/json; charset=utf-8',
};

/**
 * Third-party binaries that never change without their filename changing.
 *
 * Everything else here stays `no-store`, because this is also the dev server
 * and an edited screen has to be one reload away. These are different: they are
 * vendored blobs, they are the largest things served, and leaving them
 * uncacheable is what makes the camera unable to read a barcode with no signal
 * -- the reader re-fetches its WebAssembly every time it starts, so the moment
 * the network goes, the scanner aborts and the screen says "no barcode there"
 * about a barcode it is looking straight at.
 */
function longLived(path: string): boolean {
  return path.includes(`${sep}vendor${sep}`);
}

/**
 * The catalogue the app can actually answer for.
 *
 * Seven items, because seven is what has been priced by hand. This is exposed to
 * the client on purpose: a scan screen that pretends to know everything and then
 * fails is worse than one that shows its shelf.
 */
/**
 * Which of the recorded items Shin can actually answer for, asked by asking it.
 *
 * The count matters because a screen that says "Shin can answer for 7 things"
 * when 5 of them refuse is the app overstating its own coverage, which is the
 * one thing this product cannot do and still be worth opening. Two of the seven
 * come back with a verdict, which is the hand pilot's own headline rather than a
 * coincidence: two ranges, three partials, two blanks.
 *
 * It is measured on every request instead of hardcoded, so it corrects itself
 * the day an observation is added rather than going quietly stale.
 */
async function answerable(items: { id: string; label: string; category: string }[]) {
  const deps = defaultDeps();
  const results = await Promise.all(
    items.map(async (i) => {
      // A nominal asking price only decides the tier, never whether the answer
      // is a verdict or a refusal, which is the only thing being counted here.
      const r = await priceIt(
        { text: i.label, category: i.category as SpineQuery['category'], askingCents: 999 },
        deps,
      );
      return [i.id, r.kind === 'verdict'] as const;
    }),
  );
  return new Map(results);
}

async function catalogue() {
  const recorded = new RecordedSource();
  // The source keeps its store private, so read the same file it reads. Widening
  // the source interface to give a demo screen a product list would be the tail
  // wagging the dog.
  const store = JSON.parse(
    readFileSync(fileURLToPath(new URL('../spine/data/observations.json', import.meta.url)), 'utf8'),
  ) as { products: { id: string; label: string; category: string; gtin?: string; points: unknown[] }[] };
  const items = store.products.map((p) => ({
    id: p.id,
    label: p.label,
    category: p.category,
    gtin: p.gtin ?? null,
    pointCount: p.points.length,
  }));
  const canAnswer = await answerable(items);
  return {
    recordedAt: recorded.recordedAt,
    provenance: recorded.provenance,
    // The honest headline. `items.length` is the shelf; this is the answer rate.
    answerableCount: [...canAnswer.values()].filter(Boolean).length,
    items: items.map((i) => ({ ...i, answerable: canAnswer.get(i.id) === true })),
  };
}

/**
 * The scan scenarios: what Shin could plausibly be pointed at, with the real
 * asking price the hand pilot recorded for each.
 *
 * This exists because the camera cannot identify anything yet. Rather than the
 * app inventing an asking price to make a demo flow, it offers the seven the
 * pilot actually priced, and carries `askingProvenance` straight through so a
 * stated stand-in can be labelled as one on screen. A stand-in presented as an
 * observed shelf price would be fabricated evidence, which is the one thing this
 * product cannot do and still be worth opening.
 */
function scenarios() {
  const corpus = JSON.parse(
    readFileSync(fileURLToPath(new URL('../spine/data/corpus.json', import.meta.url)), 'utf8'),
  ) as {
    asOf: string;
    items: {
      id: string;
      query: { text: string; category: string };
      askingCents: number;
      askingSeller?: string;
      askingProvenance?: string;
    }[];
  };
  return {
    asOf: corpus.asOf,
    items: corpus.items.map((i) => ({
      id: i.id,
      text: i.query.text,
      category: i.query.category,
      askingCents: i.askingCents,
      askingSeller: i.askingSeller ?? null,
      // "observed" means a person read it off a real tag or page. Anything else
      // is a stand-in and the screen has to say so.
      observed: (i.askingProvenance ?? '').startsWith('observed'),
      provenance: i.askingProvenance ?? null,
    })),
  };
}

function categories() {
  return Object.values(CATEGORY_RULES).map((r) => ({
    id: r.id,
    label: r.label,
    unsupported: r.unsupported ? { why: r.unsupported.why, reversedBy: r.unsupported.reversedBy } : null,
    minPoints: r.minPoints,
    minDistinctSellers: r.minDistinctSellers,
    maxAgeDays: r.maxAgeDays,
    reasoning: r.reasoning,
  }));
}

/**
 * What the catalogue said, plus what the price engine can do with it.
 *
 * One object, assembled once, because the plan is explicit that the saved
 * record and the screen must read from the same object. Two objects is how the
 * app being copied ended up showing "Fair Price" on a list and "Outrageous" on
 * the detail screen for the same scan, thirty seconds apart.
 */
interface Identified {
  /** null when the catalogue has never seen it, which is a state, not an error. */
  readonly product: {
    readonly code: string;
    readonly name: string;
    /**
     * The catalogue's own French name for this product, when it has one.
     *
     * A SEPARATE COLUMN AND NOT A TRANSLATION. catalogue/src/schema.ts keeps
     * `name_en` and `name_fr` apart deliberately, and these are real names
     * written by whoever published the row, not machine output: "Croustilles
     * ondulees" is what the bag says in Quebec, and no translator would produce
     * it from "Wavy Chips". So the French client prefers this and falls back to
     * `name` when it is absent, which is most rows.
     *
     * Null is the normal case and never an error. The client's own fallback is
     * what makes it safe to ship before the catalogue is filled in.
     */
    readonly nameFr: string | null;
    readonly brands: string | null;
    readonly quantity: string | null;
    readonly sizeValue: number | null;
    readonly sizeUnit: string | null;
    readonly soldInCanada: boolean;
  } | null;
  readonly matchedBy: 'gtin' | 'hybrid' | 'none';
  readonly band: 'confident' | 'ambiguous' | 'miss';
  /** The five-kind label the price engine needs, or null when we will not guess. */
  readonly category: string | null;
  readonly categoryWhy: string;
  /** "We do not have that one, here are other oranges." Named, never implied. */
  readonly ring: { readonly label: string; readonly members: { code: string; name: string }[] } | null;
  /**
   * How many OTHER rows the same search turned up behind `product`.
   *
   * Added 2026-09-08 for "not this?", which needs a question `band` cannot
   * answer. A text-only query is `ambiguous` by construction -- with no brand
   * and no size pinned, `#band` has nothing to agree with and never reaches
   * `confident` -- so a screen gating an alternatives affordance on the band
   * alone would offer alternatives on every typed scan, including the ones
   * where there is nothing else to offer. That is the "face-saving" case
   * `/api/search`'s own comment warns about, and this is the number that tells
   * the two apart.
   *
   * 0 for a resolved barcode, which has exactly one answer by definition, and
   * 0 when the catalogue is not attached.
   */
  readonly otherCandidates: number;
  /**
   * The narrowing this device's own scan history argued for, or null when the
   * search ran against the whole catalogue.
   *
   * Reported rather than kept internal because it changes the answer, and an
   * app that narrows a search on a guess about somebody without being able to
   * say so is the shape of thing this repo's priority-1 rule exists to stop.
   * `why` is plain words and safe to show.
   */
  readonly route: { readonly categories: readonly string[]; readonly confidence: number; readonly why: string } | null;
  /** False when the catalogue process is not running. The screen must not read this as a miss. */
  readonly catalogueUp: boolean;
  readonly ms: number;
}

function offline(ms: number): Identified {
  return {
    product: null,
    matchedBy: 'none',
    band: 'miss',
    category: null,
    categoryWhy: `The catalogue is not attached, so nothing was looked up. ${catalogueWhyNot}`.trim(),
    ring: null,
    otherCandidates: 0,
    route: null,
    catalogueUp: false,
    ms,
  };
}

/**
 * Ask the catalogue.
 *
 * The timeout is not decoration. A text search is 24 to 113 ms measured, but a
 * search that falls through to the vector arm was measured at 735 ms with only
 * 6% of the index built and scales with the index, so a request that hangs is a
 * real outcome and the screen has to be told rather than left spinning. The
 * plan names a spinner that never resolves as the specific failure being
 * designed out.
 */
/**
 * The route this device's own history argues for, or null for "search
 * everything".
 *
 * Null in three cases that are one case: no routing module (no catalogue), no
 * device id, or a history that gave `decideRoute` nothing to be sure about.
 * All three mean the same thing to every caller, so they are collapsed here
 * rather than branched on three times downstream.
 *
 * Never throws and never blocks an answer. A prior is an optimisation on
 * relevance; a scan log that will not open must not be able to stop a scan.
 */
function routeFor(deviceId: string | null): { categories: readonly string[]; confidence: number; why: string } | null {
  if (!routing || !deviceId) return null;
  try {
    const history = recentCategories(deviceId);
    if (history.length === 0) return null;
    const route = routing.decideRoute({ history });
    // decideRoute says "no narrowing" by returning all five. Passing that on as
    // a route would make every answer look routed in the response while
    // changing nothing about the search.
    return route.categories.length >= 5 ? null : route;
  } catch (err) {
    console.error('routing failed, searching everything:', err);
    return null;
  }
}

/** What `decideRoute` hands back, named so two callers can pass it around. */
type Route = { categories: readonly string[]; confidence: number; why: string };

/**
 * One search, narrowed by a device's history when there is one.
 *
 * Lifted out of `identify()` on 2026-09-09 so the photo door can run the
 * SAME search rather than a second one that drifts from it. `restrictedSearch`
 * owns every safety rule about narrowing (a barcode is never restricted, an
 * empty narrowed result falls back to the whole catalogue rather than
 * reporting a miss it did not check for), so this wrapper adds none of its
 * own. It exists to keep "is there a route" in one place.
 */
async function searchRouted(
  q: Record<string, unknown>,
  deviceId: string | null,
): Promise<{ result: unknown; route: Route | null; restricted: boolean; fellBack: boolean }> {
  const route = routeFor(deviceId);
  if (!route || !routing) {
    return { result: await searchService!.search(q), route: null, restricted: false, fellBack: false };
  }
  const out = await routing.restrictedSearch(searchService, q, route);
  return { result: out.result, route, restricted: out.restricted, fellBack: out.fellBack };
}

async function identify(query: {
  gtin?: string;
  text?: string;
  brand?: string;
  sizeValue?: number;
  sizeUnit?: string;
  /** Whose history to route by. Omitted means no prior, which is not an error. */
  deviceId?: string | null;
}): Promise<Identified> {
  const started = Date.now();
  if (!fastLookup) return offline(Date.now() - started);

  type Result = {
    band: Identified['band'];
      matchedBy: Identified['matchedBy'];
      candidates: {
        code: string;
        name: string;
        brands: string | null;
        quantity: string | null;
        sizeValue: number | null;
        sizeUnit: string | null;
        soldInCanada: boolean;
        nameFr: string | null;
        leafCategory: string | null;
        categoryPath: string[];
        source: string;
      }[];
    ring: { label: string; members: { code: string; name: string }[] } | null;
  };

  let routeUsed: Route | null = null;

  /** The shared helper above, with this route's result type on it. */
  const routedSearch = async (q: Record<string, unknown>) => {
    const out = await searchRouted(q, query.deviceId ?? null);
    return { ...out, result: out.result as Result };
  };

  try {
    let result: Result;

    /*
     * Barcode first, on this thread. The pipeline orders the attempts cheapest
     * first and this is the cheapest thing in the product: an indexed lookup
     * that also tries the UPC-A and EAN-13 forms of the same code, because
     * retailers publish both and a padding difference reading as "never seen
     * this" would be a self-inflicted miss.
     */
    if (query.gtin) {
      const hit = (fastLookup.byGtin(query.gtin) ?? null) as Result['candidates'][number] | null;
      if (hit) {
        result = { band: 'confident', matchedBy: 'gtin', candidates: [hit], ring: null };
      } else if (!query.text) {
        // Read fine, and we do not have it. A gap, not a camera failure.
        result = { band: 'miss', matchedBy: 'none', candidates: [], ring: null };
      } else {
        result = (await routedSearch({ ...query, vectors: vectorsOn })).result;
      }
    } else {
      const routed = await routedSearch({ ...query, vectors: vectorsOn });
      result = routed.result;
      routeUsed = routed.route;
      /*
       * A NARROWED ANSWER IS NEVER A CONFIDENT ONE.
       *
       * routing.ts hands back a confidence adjustment strictly below 1 when it
       * actually restricted, and says why in its own header: narrowing can hide
       * the true best match, so finding something despite the narrowing is not
       * evidence the narrowing was right. This interface has no number to
       * multiply -- it reports a band -- so the adjustment lands as the one
       * discrete move that means the same thing, and it only ever moves
       * downward.
       *
       * It also lands where it can be acted on. "Not this?" is gated on
       * `ambiguous` plus a rival, so a restricted answer that had rivals now
       * offers the shopper the list, which is exactly the repair somebody needs
       * when a prior about them picked the wrong shelf.
       */
      if (routed.restricted && !routed.fellBack && result.band === 'confident') {
        result = { ...result, band: 'ambiguous' };
      }
    }

    const top = result.candidates[0] ?? null;
    if (!top) {
      return {
        product: null,
        matchedBy: result.matchedBy,
        band: result.band,
        category: null,
        categoryWhy: 'We have not seen this one.',
        ring: result.ring
          ? { label: result.ring.label, members: result.ring.members.map((m) => ({ code: m.code, name: m.name })) }
          : null,
        otherCandidates: 0,
        route: routeUsed,
        catalogueUp: true,
        ms: Date.now() - started,
      };
    }

    const verdict = categoryFor({
      source: top.source,
      categoryPath: top.categoryPath,
      leafCategory: top.leafCategory,
    });

    return {
      product: {
        code: top.code,
        name: top.name,
        /* `?? null` rather than passed straight through: this field is declared
           on the catalogue's Candidate and the local type above is a structural
           copy, so a build whose catalogue predates the column hands back
           undefined here and the contract says null. */
        nameFr: top.nameFr ?? null,
        brands: top.brands,
        quantity: top.quantity,
        sizeValue: top.sizeValue,
        sizeUnit: top.sizeUnit,
        soldInCanada: top.soldInCanada,
      },
      matchedBy: result.matchedBy,
      band: result.band,
      category: verdict.category,
      categoryWhy: verdict.why,
      ring: result.ring
        ? { label: result.ring.label, members: result.ring.members.map((m) => ({ code: m.code, name: m.name })) }
        : null,
      otherCandidates: Math.max(0, result.candidates.length - 1),
      route: routeUsed,
      catalogueUp: true,
      ms: Date.now() - started,
    };
  } catch (err) {
    // A search that threw is not a product we do not have. Saying so.
    //
    // The thrown message goes to the log, never to the screen. It is a sqlite
    // or a worker string addressed to whoever is running this, and the person
    // holding the phone can do nothing with it; the app side made the same fix
    // this week. What they get is the one sentence that is true and actionable.
    console.error('identify failed:', err);
    return {
      ...offline(Date.now() - started),
      catalogueUp: true,
      categoryWhy: 'The catalogue could not answer that one. Try again in a moment.',
    };
  }
}

/* ========================= THE PHOTO DOOR =========================
 *
 * The eye produces the right thing -- a burst-scored, object-cropped, 1568 px
 * PNG -- and `camera.js` holds it as `lastCrop`. This is where it is sent.
 *
 * This paragraph used to say `identify/src/identify.ts` "has been written and
 * tested since 2026-09-05 and was imported by nothing (D-024, D-047). This is
 * the import." That file was deleted on 2026-09-19 (`d3e4f0b`) when the
 * catalogue-pick identify pipeline was retired and Gemini became the
 * identifier. Corrected 2026-09-21; see the head of NOW.md.
 *
 * Everything about WHAT the picture is stays in `identify/`. This file is only
 * allowed to move an answer, never to make one, which is the same constraint
 * the top of this file states about prices. So there is no confidence
 * arithmetic here, no prompt, and no decision about whether a candidate is
 * good enough; there is a catalogue adapter, a body reader, a scan row and a
 * rate limit.
 */

/**
 * How big a photo body may be.
 *
 * A 1568 px long-edge PNG off the eye measures a few hundred kilobytes and
 * base64 adds a third. 3 MiB is roughly five times the largest crop the
 * capture path can produce, which leaves room for a JPEG from a picker or a
 * future higher-resolution pass without anybody having to think about this
 * number again, and is still small enough that a body over it is refused at
 * the first chunk rather than buffered.
 */
const MAX_PHOTO_BODY_BYTES = 3 * 1024 * 1024;

/** A whole camera frame for the shutter log, base64 in JSON: a 4K JPEG fits. */
const MAX_SHUTTER_FRAME_BYTES = 16 * 1024 * 1024;

/**
 * Is this actually an image, checked on the bytes rather than on a header.
 *
 * A content-type is whatever the client typed. The first four bytes are what
 * the decoder will see, so they are what is checked: PNG's 89 50 4E 47 and
 * JPEG's FF D8 FF. Anything else is refused here rather than sent to a vision
 * model, which is the expensive way to find out the same thing.
 */
function imageKind(bytes: Buffer): 'png' | 'jpeg' | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  return null;
}

/**
 * The ceiling on the calls that cost money, per invite code and per network address.
 *
 * Applied at every place a Gemini call is about to be made (`/api/identify`, the photo route and
 * the price route when it has no stored answer to serve), and NOT on the ones that cost nothing:
 * health, search, corrections, a price sheet served from a scan already held. See
 * `src/rate-limit.ts` for the numbers and for what this is and is not. A refusal is a 429 with a
 * `Retry-After`, sent before any Gemini call is made and before anything is counted against the
 * dollar cap. The limiters are built once so their counts outlive a request; tests replace them
 * through `resetPaidCallLimitersForTests`.
 */
let codeLimiter = new KeyedLimiter(codeWindows());
let addressLimiter = new KeyedLimiter(addressWindows());
let doorLimiter = new KeyedLimiter(doorWindows());
let freeScanAddressLimiter = new KeyedLimiter(freeScanAddressWindows());
export function resetPaidCallLimitersForTests(env: NodeJS.ProcessEnv = process.env): void {
  codeLimiter = new KeyedLimiter(codeWindows(env));
  addressLimiter = new KeyedLimiter(addressWindows(env));
  doorLimiter = new KeyedLimiter(doorWindows(env));
  freeScanAddressLimiter = new KeyedLimiter(freeScanAddressWindows(env));
  matchTextCodeLimiter = new KeyedLimiter(codeWindows(env));
  matchTextAddressLimiter = new KeyedLimiter(addressWindows(env));
}

/*
 * `POST /api/match-text` gets the same limiter, with the same per-code and
 * per-address windows (the same SHIN_RATE_* settings), but its OWN buckets. It
 * makes no paid call, and it fires passively on every frame of text the camera
 * reads, so sharing the paid buckets would let passive reading use up the
 * budget a barcode scan's Gemini call needs.
 */
let matchTextCodeLimiter = new KeyedLimiter(codeWindows());
let matchTextAddressLimiter = new KeyedLimiter(addressWindows());

function matchTextRefusal(req: IncomingMessage): { retryAfterSeconds: number } | null {
  const who = inviteWho(req.headers[INVITE_HEADER]) ?? 'open';
  const byCode = matchTextCodeLimiter.check(`code:${who}`);
  if (!byCode.allowed) return { retryAfterSeconds: byCode.retryAfterSeconds };
  const byAddress = matchTextAddressLimiter.check(`ip:${clientAddress(req.headers, req.socket.remoteAddress)}`);
  if (!byAddress.allowed) return { retryAfterSeconds: byAddress.retryAfterSeconds };
  return null;
}

/**
 * Has this shopper said yes to product names going to Claude? Anything but the phone's `1` is no, so
 * an older app and an unanswered screen fail toward not sharing. The suite's fake provider counts as
 * a yes unless a test asks for the real check: no name leaves the machine in a test.
 */
function claudeAllowed(req: IncomingMessage): boolean {
  if (req.headers['x-shin-claude'] === '1') return true;
  return catalogueFirstTest !== null && catalogueFirstTest !== undefined && catalogueFirstTest.requireClaudeConsent !== true;
}

/** Item 4: every API request, counted by address before anything else happens to it. The uptime ping is exempt. */
function doorRefusal(req: IncomingMessage, pathname: string): { retryAfterSeconds: number } | null {
  if (!pathname.startsWith('/api/') || INVITE_EXEMPT.includes(pathname)) return null;
  if (isLocalRequest(req.headers, req.socket.remoteAddress)) return null;
  const decision = doorLimiter.check(`ip:${clientAddress(req.headers, req.socket.remoteAddress)}`);
  return decision.allowed ? null : { retryAfterSeconds: decision.retryAfterSeconds };
}

/**
 * Item 4: free barcode scans per address per day. On only while the free limit is on, so it changes
 * nothing until the limits go on. Subscribers are not counted: they paid and they have their own cap.
 */
async function freeScanAddressRefusal(req: IncomingMessage, device: string): Promise<{ retryAfterSeconds: number } | null> {
  if (freeScanLimit() === null || isLocalRequest(req.headers, req.socket.remoteAddress)) return null;
  if (await isPlus(device, req.headers)) return null;
  const decision = freeScanAddressLimiter.check(`ip:${clientAddress(req.headers, req.socket.remoteAddress)}`);
  return decision.allowed ? null : { retryAfterSeconds: decision.retryAfterSeconds };
}

function paidCallRefusal(req: IncomingMessage): { retryAfterSeconds: number } | null {
  // When no code is required (a laptop, the suite) every caller is the one bucket "open".
  const who = inviteWho(req.headers[INVITE_HEADER]) ?? 'open';
  const byCode = codeLimiter.check(`code:${who}`);
  if (!byCode.allowed) return { retryAfterSeconds: byCode.retryAfterSeconds };
  const byAddress = addressLimiter.check(`ip:${clientAddress(req.headers, req.socket.remoteAddress)}`);
  if (!byAddress.allowed) return { retryAfterSeconds: byAddress.retryAfterSeconds };
  return null;
}


/**
 * THE USER STORE FOLLOWS THE SCAN STORE, added 2026-09-26, and this is a fix for
 * a real leak rather than tidying.
 *
 * Until today this resolved to `app/data/user-catalogue.db` unless
 * `SHIN_USER_CATALOGUE` was set, and it is the ONE store a test could not redirect
 * by redirecting everything else: the gap log already resolves its user catalogue
 * beside itself (`gaps.ts`), `SHIN_USER_CATALOGUE` is not in `DATABASE_ENV`, and so
 * **17 of the 21 tests that boot this server were writing into the live user
 * store**, counted 2026-09-26. That store is the one the plan's cleanup unit
 * exists to empty: it held 18 products, of which the nine "Kraft Dinner" rows
 * keyed 1 through 9, and two rows created by tests run tonight, are test scans
 * that a person never made. Deleting them without this change means the next
 * `node --test` puts them back.
 *
 * So the rule is now the one `admin.ts` already uses for `people.db`: this file
 * lives beside the scan store. A test that points `SHIN_SCANS` at a temp file gets
 * its user store there too, automatically and without editing 17 files.
 * Production sets neither variable, so the path is unchanged, byte for byte.
 */
const SHIN_SCANS_FOR_USER_CATALOGUE = settings.SHIN_SCANS()?.trim();
const USER_CATALOGUE_PATH =
  settings.SHIN_USER_CATALOGUE()
  ?? (SHIN_SCANS_FOR_USER_CATALOGUE
    ? join(dirname(resolve(SHIN_SCANS_FOR_USER_CATALOGUE)), 'user-catalogue.db')
    : fileURLToPath(new URL('./data/user-catalogue.db', import.meta.url)));
let userCatalogue: UserCatalogue | null = null;
export function setUserCatalogueForTests(uc: UserCatalogue | null): void {
  userCatalogue = uc;
}

interface ScanContext {
  readonly market?: string | null;
  readonly currency?: string | null;
  readonly language?: string | null;
  readonly userInput?: string | null;
  /** Province, state or similar, when the client knows it. */
  readonly region?: string | null;
  /** The ISO 3166-1 alpha-2 code of the market, sent beside the name so any country resolves. */
  readonly countryCode?: string | null;
  /**
   * The shop the user picked, as the client held it: the name and OpenStreetMap's
   * own kind word ("supermarket", "convenience store"). Only the TYPE derived
   * from them reaches the prompt; the name does not.
   */
  readonly storeName?: string | null;
  readonly storeHint?: string | null;
  /** An explicit alternatives mode, if a client ever sends one. */
  readonly mode?: string | null;
  /** What the picture shows: `price_tag` in the app's Price Tag mode (W30). */
  readonly hint?: string | null;
  /**
   * Answer sources the client can word, comma separated, beyond the ones every build knows. Today only
   * `national_average` (Statistics Canada): a build without its label refuses a basis it does not know.
   */
  readonly knows?: string | null;
}

function contextFrom(get: (key: string) => unknown): ScanContext {
  const text = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' && v.length <= 80 ? v.trim() : null;
  return {
    market: text(get('market')) ?? text(get('country')),
    currency: text(get('currency')),
    language: text(get('language')) ?? text(get('lang')),
    userInput: text(get('userInput')),
    region: text(get('region')),
    countryCode: text(get('countryCode')),
    storeName: text(get('storeName')),
    storeHint: text(get('storeHint')),
    mode: text(get('mode')),
    hint: text(get('hint')),
    knows: text(get('knows')),
  };
}

/**
 * ITEMS 18 AND 19, what the one scan call carries about the user beyond the
 * product. The market is the user's own (their chosen market, with an ISO code
 * when the name is one we know), never defaulted: an unrecognised country is the
 * unknown market and the prompt says so. The store type is read from the shop's
 * OpenStreetMap kind word first (it is a real tag) and its name second.
 */
function marketOfContext(ctx: ScanContext) {
  // The code the client sent wins; the name is the fallback for an older client.
  // The region is read as sent: it only means something with a country, and
  // `marketFromLocation` drops it otherwise. Unknown stays unknown.
  return {
    ...marketFromLocation({
      country: countryCodeOf(ctx.countryCode) ?? countryCodeOf(ctx.market),
      region: ctx.region ?? null,
      currency: ctx.currency ?? null,
    }),
    // The Statistics Canada rung runs only for a client that can say where its answer came from.
    knowsNationalAverage: (ctx.knows ?? '').split(',').some((k) => k.trim() === 'national_average'),
  };
}

/**
 * The Statistics Canada rung (price/src/statcan.ts) over the committed table. The table is read once;
 * a missing file is logged `[statcan-fault]` and the rung answers `no_table`, never a crash.
 */
const statcanRung: NonNullable<BarcodeDeps['nationalAverage']> = (q) => nationalAverageFor(q, loadStatcanTable());

/** The market type every catalogue-first answer is priced with. */
type PricingMarket = { country: string | null; currency: string | null; region?: string | null; knowsNationalAverage?: boolean };

/** The sentence a typed search gets when Shin holds no item with a price for it. */
const TYPED_NO_OWN_PRICE = 'Pexi does not have a price for that yet. Scan the barcode instead.';

/**
 * A typed name, answered from Shin's own data (Jamin, 2026-09-23; the full
 * reasoning is on `/api/identify`). No Gemini call, no network, nothing spent.
 *
 * A match is shaped as the grounded wire the answer sheet already renders,
 * with `block.source` marking it as Shin's own data so the sheet does not
 * call it a Google result, and every offer carrying its currency and the date
 * it was seen. `fetchedAt` is the newest of those dates, never "now": the
 * sheet prints it as when the price was checked.
 *
 * Never throws: `lookupOwnPrices` degrades a missing or broken file into "no
 * match", and a scan row that cannot be written is a null id.
 */
/**
 * What a typed answer's verdict needs beyond the text: the shelf price and the
 * shopper's lines, the market, and the capped Claude ask (design case 8: a
 * typed name that matches nothing is asked of Claude from the typed name).
 */
interface TypedVerdictContext {
  readonly shopper: { cents: number; thresholds?: unknown } | null;
  readonly market: PricingMarket;
  readonly askRange?: RangeAsk;
}

/**
 * The typed answer's verdict (design cases 7 and 8). A match is priced as its
 * barcode would be; no match is priced from the typed words alone, sorted by
 * the catalogue search and, when that finds nothing, asked of Claude once.
 *
 * D-241 / requirement 3.1: the answer always carries a range. A verdict's own bell is that range;
 * a too-thin or empty estimate (no verdict) gets the same last rung a no-price barcode gets
 * (`lastRungRange`: the fixed wide bell, `fixed_prior`), which carries no verdict and so no word.
 */
async function typedVerdict(
  text: string,
  match: OwnMatch | null,
  ctx: TypedVerdictContext,
  device: string,
  /** The typed words resolved to a product whose identity rests only on Open Icecat: no model sees it (decision 2026-11-05). */
  modelBarred = false,
  /** D-270: how sure the product behind `match` is; absent is a guess, priced from `text`. */
  identity: Identity = { grade: 'guess', words: text },
): Promise<{ verdict: Verdict | null; last: ReturnType<typeof lastRungRange>; noRangeReason: NoRangeReason }> {
  const prices = openPricesReadOnly(defaultPricesPath(), device);
  try {
    const once = modelBarred ? null : onceAsk(ctx.askRange);
    const est = await safeEstimate(
      match
        ? { barcode: match.code, name: match.name, brand: match.brand, size: match.size, region: ctx.market.region ?? null, country: ctx.market.country, currency: ctx.market.currency ?? 'CAD', asOf: new Date().toISOString().slice(0, 10) }
        : { barcode: null, name: text, region: ctx.market.region ?? null, country: ctx.market.country, currency: ctx.market.currency ?? 'CAD', asOf: new Date().toISOString().slice(0, 10) },
      ctx.shopper,
      {
        prices,
        catalogue: catalogueFirstTest?.db !== undefined ? catalogueFirstTest.db : catalogueDb,
        taxonomy: categoryGuard.taxonomy(),
        ...(once ? { askClaude: once.askClaude } : {}),
        sortName: sortByName(catalogueFirstTest?.searcher !== undefined ? catalogueFirstTest.searcher : searchService),
        ...(catalogueFirstTest?.claudeWaitMs !== undefined ? { claudeWaitMs: catalogueFirstTest.claudeWaitMs } : {}),
        ...(ctx.market.knowsNationalAverage ? { nationalAverage: statcanRung } : {}),
      },
      match ? identity : { grade: 'sure' },
    );
    // D-233: a too-thin estimate is no verdict, logged loudly (catalogue-first.ts shownVerdict).
    const verdict = shownVerdict(est, `typed:${match?.code ?? text.slice(0, 40)}`);
    return {
      verdict,
      last: lastRungRange(est, ctx.market.currency ?? 'CAD'),
      noRangeReason: est?.trace.tooThin ? 'pool_too_wide' : 'no_shin_prices',
    };
  } finally {
    try {
      prices?.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * The catalogue search a typed name goes through: the very search `/api/search`
 * runs for the client's pick list (same routing by this device's history, same
 * band downgrade), asked for five rows so a rival behind the top three is seen.
 * A search that fails is an empty list, never a thrown request.
 */
/** Whether the catalogue `typedCatalogueSearch` searches is attached: the test seam's, else the worker. */
function typedCatalogueAttached(): boolean {
  const seam = catalogueFirstTest?.searcher;
  return seam !== undefined ? seam !== null : !!searchService;
}

async function typedCatalogueSearch(text: string, device: string): Promise<{ rows: TypedRow[]; band: string }> {
  const seam = catalogueFirstTest?.searcher;
  const q = { text, limit: 5, vectors: vectorsOn };
  try {
    let raw: { band?: string; candidates?: unknown[] };
    let downgrade = false;
    if (seam !== undefined) {
      if (seam === null) return { rows: [], band: 'miss' };
      raw = (await seam.search(q)) as typeof raw;
    } else {
      if (!searchService) return { rows: [], band: 'miss' };
      const out = await searchRouted(q, device === UNATTRIBUTED ? null : device);
      raw = out.result as typeof raw;
      downgrade = out.restricted && !out.fellBack;
    }
    const rows = (raw.candidates ?? []).filter(
      (c): c is TypedRow => !!c && typeof c === 'object' && typeof (c as TypedRow).code === 'string' && typeof (c as TypedRow).name === 'string',
    );
    return { rows, band: downgrade && raw.band === 'confident' ? 'ambiguous' : (raw.band ?? 'ambiguous') };
  } catch (err) {
    logError({ where: 'identify.typed_search', deviceId: device, scanId: null, err });
    return { rows: [], band: 'miss' };
  }
}

/** `product.source` of a barcode in the attached catalogue, or null (no code, no catalogue, no row, a lookup that threw). */
function catalogueSourceOf(code: string | null | undefined): string | null {
  if (!code || !fastLookup) return null;
  try {
    const hit = fastLookup.byGtin(code) as { source?: unknown } | null;
    return typeof hit?.source === 'string' ? hit.source : null;
  } catch {
    return null;
  }
}

async function typedFromOwnData(
  text: string,
  device: string,
  telemetry: ReturnType<typeof telemetryFrom>,
  where: ReturnType<typeof locationFor>,
  startedAt: number,
  /** `/api/price` naming a typed scan already has its row: it is reused, never duplicated. */
  existingScanId: number | null = null,
  verdictCtx: TypedVerdictContext | null = null,
): Promise<Record<string, unknown> & { scanId?: number }> {
  const first = verdictCtx !== null && catalogueFirstOn();
  /*
   * D04: one answer for one product however it is reached. The typed words go
   * to the catalogue search the client's pick list uses; when they resolve to one
   * product (`resolveTypedName`), that product is answered by the barcode's own
   * function, `catalogueFirstBarcode`, so the two cannot diverge. The top three
   * ride along so the shopper can change the pick.
   */
  const searched = first ? await typedCatalogueSearch(text, device) : null;
  const resolution = searched ? resolveTypedName(text, searched.rows, searched.band) : null;
  const pickCandidates = searched ? searched.rows.slice(0, 3).map(pickCandidate) : [];

  let match: OwnMatch | null = null;
  /** The catalogue product the typed words named, even when no store prices it. */
  let named: { name: string; brand: string | null; size: string | null; code: string } | null = null;
  try {
    if (resolution?.row) {
      const id = pickCandidate(resolution.row);
      named = { name: id.name, brand: id.brand, size: id.size, code: id.barcode };
      const own = lookupOwnPricesByBarcode(id.barcode, {
        pricesDbPath: defaultPricesPath(),
        userCatalogueDb: userCatalogue?.db ?? null,
        userCataloguePath: USER_CATALOGUE_PATH,
        catalogueProbe: catalogueDb ? probeCatalogue(catalogueDb) : null,
      }).match;
      if (own) match = { name: id.name, brand: id.brand, size: id.size, code: id.barcode, score: 1, prices: own.prices };
    } else {
      match = lookupOwnPrices(text, {
        pricesDbPath: defaultPricesPath(),
        userCatalogueDb: userCatalogue?.db ?? null,
        userCataloguePath: USER_CATALOGUE_PATH,
        catalogueProbe: catalogueDb ? probeCatalogue(catalogueDb) : null,
      }).match;
      if (match) named = { name: match.name, brand: match.brand, size: match.size, code: match.code ?? '' };
    }
  } catch (err) {
    logError({ where: 'identify.own_data', deviceId: device, scanId: null, err });
  }
  // Every typed answer carries the verdict when the caller passed its context (catalogue first on).
  let verdict: Verdict | null = null;
  let barcodeAnswer: Awaited<ReturnType<typeof catalogueFirstBarcode>> | null = null;
  /** The typed estimate's range when no barcode answer brought one (D-241, requirement 3.1). */
  let typedRange: Awaited<ReturnType<typeof typedVerdict>> | null = null;
  /* D-270: sure only for a product the catalogue resolved to one item of one size, or an own-price text match that covers the product's whole name with the size settled; anything else is a guess. */
  const typedId = typedIdentity(text, searched?.rows ?? [], resolution, resolution?.row ? null : match);
  if (first && verdictCtx) {
    const code = resolution?.row?.code ?? match?.code ?? null;
    const canonical = code ? canonicalBarcode(code) : null;
    // A guessed product never takes the barcode route: its range card would be the guessed product's
    // (live 2026-11-11, "milk" showed a coconut milk's $2.29 to $3.49). The words are priced instead.
    if (canonical && typedId.grade === 'sure') {
      try {
        barcodeAnswer = await catalogueFirstBarcode(verdictCtx.askRange, canonical, verdictCtx.market, device, verdictCtx.shopper, undefined, typedId);
      } catch (err) {
        logError({ where: 'identify.typed_barcode_answer', deviceId: device, scanId: null, err });
      }
    }
    if (barcodeAnswer?.answer.verdict) verdict = barcodeAnswer.answer.verdict;
    else {
      const own = await typedVerdict(text, match, verdictCtx, device, isNeverSentToAModel(resolution?.row?.source) || isNeverSentToAModel(catalogueSourceOf(match?.code)), typedId);
      verdict = own.verdict;
      // 3.1: a barcode answer brings its own range; anything else takes the typed estimate's last rung.
      if (!(barcodeAnswer && barcodeAnswer.answer.outcome === 'catalogue_hit' && barcodeAnswer.answer.range)) typedRange = own;
    }
  }
  const ms = Date.now() - startedAt;
  const label = named ? [named.brand && !named.name.toLowerCase().includes(named.brand.toLowerCase()) ? named.brand : null, named.name, named.size].filter(Boolean).join(' ') : null;
  const scanId = existingScanId ?? recordScan({
    deviceId: device,
    kind: 'text',
    query: text,
    resolvedCode: named?.code || null,
    resolvedLabel: label,
    source: OWN_DATA_SOURCE,
    outcome: named ? 'answered' : 'refused',
    failureClass: named ? null : 'not_in_catalogue',
    ...(barcodeAnswer && barcodeAnswer.answer.outcome === 'catalogue_hit'
      ? {
          answerPath: barcodeAnswer.record.answerPath,
          rangeSource: barcodeAnswer.record.rangeSource,
          rangeBasis: barcodeAnswer.record.rangeBasis,
          rangeMissReason: barcodeAnswer.record.rangeMissReason,
        }
      : // D-235: a typed answer with no barcode ladder behind it still says what its shown verdict stood on;
        // with no verdict, its last-rung range is recorded the way the barcode's is (source 'none', basis named).
        { ...(shownRange(verdict) ?? (typedRange ? { rangeSource: 'none' as const, rangeBasis: typedRange.last.range.basis } : {})) }),
    ...verdictRecord(verdict),
    appVersion: telemetry.appVersion,
    platform: telemetry.platform,
    latencyMs: ms,
    cell: where.cell,
    storeId: where.storeId,
    storeName: where.storeName,
    exactLat: where.exactLat,
    exactLon: where.exactLon,
    exactAccuracy: where.exactAccuracy,
    exactAt: where.exactAt,
  });
  // Requirement 3.9: a verdict this scan already showed is kept; a different one goes beside it.
  if (existingScanId !== null && verdict) updateScan(existingScanId, verdictRecord(verdict), 'api_price_typed');
  const common = {
    ownData: true,
    source: OWN_DATA_SOURCE,
    // The fields a typed answer has always carried, so no older reader trips on a missing one.
    product: null,
    matchedBy: 'none',
    band: 'miss',
    category: null,
    categoryWhy: '',
    ring: null,
    otherCandidates: 0,
    route: null,
    // D-241: whether the catalogue the typed words were searched in is attached (it was always false).
    catalogueUp: typedCatalogueAttached(),
    ms,
    model: null,
    failure: null,
    verdict,
    // D04: the catalogue's top three for the typed words (the pick list), and how the answer's product was chosen.
    pickCandidates,
    resolvedBy: resolution?.row ? resolution.rule : null,
    ...(barcodeAnswer && barcodeAnswer.answer.outcome === 'catalogue_hit'
      ? {
          identity: barcodeAnswer.answer.identity,
          range: barcodeAnswer.answer.range,
          rangeSource: barcodeAnswer.answer.rangeSource,
          noRangeReason: barcodeAnswer.answer.noRangeReason,
        }
      : {}),
    /*
     * D-241 / 3.1: no barcode answer brought a range, so the typed estimate's last rung does. With no
     * verdict it is the broad guess (`rangeSource` and `range.basis` 'fixed_prior', `confidence: 'low'`),
     * the very range a no-price barcode gets, and carries no verdict, so no word is read off it (D-239).
     */
    ...(typedRange ? { range: typedRange.last.range, rangeSource: typedRange.last.source, noRangeReason: typedRange.noRangeReason } : {}),
    ...shopperReportField(device, named?.code || match?.code || null),
    ...(scanId === null ? {} : { scanId }),
  };
  if (!match) {
    return {
      ...common,
      ...(resolution?.row && named ? { ownMatch: { name: named.name, brand: named.brand, size: named.size, code: named.code, score: 1 } } : {}),
      found: false,
      reason: 'no_own_price',
      lowConfidence: true,
      confidenceReasons: ['no_answer:no_own_price'],
      message: TYPED_NO_OWN_PRICE,
    };
  }
  const offers = match.prices.map((p) => ({
    retailer: p.store,
    price: p.amount,
    currency: p.currency,
    observedAt: p.observedAt,
    // The day alone, for the sheet to print as it is.
    seenOn: p.observedAt.slice(0, 10),
    url: p.url,
    hasLink: p.url !== null,
    kind: p.kind,
    from: p.from,
    trusted: p.trusted,
    sizeValue: null,
    sizeUnit: null,
    packCount: null,
    memberOnly: null,
    marketplace: null,
  }));
  const newest = match.prices.reduce((a, p) => (p.observedAt > a ? p.observedAt : a), '');
  return {
    ...common,
    found: true,
    reason: 'own_data',
    lowConfidence: false,
    confidenceReasons: [],
    ownMatch: { name: match.name, brand: match.brand, size: match.size, code: match.code, score: match.score },
    grounded: {
      kind: 'grounded',
      forDevice: device,
      fetchedAt: newest || null,
      suggestionsHtml: '',
      block: {
        kind: 'prices',
        source: OWN_DATA_SOURCE,
        checked: false,
        name: match.name,
        brand: match.brand,
        size: match.size,
        facts: [],
        description: null,
        offers,
        reviews: [],
        verdict: null,
        noLineReason: null,
        searchQueries: [],
        citations: [],
        alternatives: [],
        lowConfidence: false,
        confidenceReasons: [],
      },
    },
  };
}

/**
 * THE CATALOGUE-FIRST BARCODE ANSWER, behind SHIN_CATALOGUE_FIRST (default on
 * since 2026-09-28). RULINGS.md "Catalogue first; Claude, with no web search,
 * is the capped price-range fallback". The logic and the answer shape are in
 * src/catalogue-first.ts; this is the wiring: the catalogue lookup is
 * `fastLookup.byGtin` (catalogue/src/search.ts `Catalogue.byGtin`, the same
 * lookup attached for barcodes) and the prices are `PRICES_DB_PATH` opened
 * read-only for this one answer. The model calls are the capped Claude range
 * ask, made only when Shin's own prices give no range, and, for a barcode
 * nothing names, the capped Claude read of the frame (`nameElsewhere`).
 */
async function catalogueFirstBarcode(
  askRange: RangeAsk | undefined,
  canonical: NonNullable<ReturnType<typeof canonicalBarcode>>,
  market: PricingMarket,
  device: string,
  shopper: { cents: number; thresholds?: unknown } | null = null,
  nameElsewhere?: BarcodeDeps['nameElsewhere'],
  /** D-270: absent for a scanned or picked barcode; a barcode a loose text match supplied passes `guess`. */
  identity?: Identity,
): Promise<Awaited<ReturnType<typeof answerBarcodeFromCatalogue>>> {
  return withCatalogueFirstDeps(askRange, market, device, shopper, nameElsewhere, (deps) =>
    answerBarcodeFromCatalogue(canonical, identity ? { ...deps, identity } : deps),
  );
}

/** The deps every catalogue-first answer is priced with, the price file open for exactly the length of `fn`. */
async function withCatalogueFirstDeps<T>(
  askRange: RangeAsk | undefined,
  market: PricingMarket,
  device: string,
  shopper: { cents: number; thresholds?: unknown } | null,
  nameElsewhere: BarcodeDeps['nameElsewhere'] | undefined,
  fn: (deps: BarcodeDeps) => Promise<T>,
): Promise<T> {
  let prices: DatabaseSync | null = null;
  try {
    if (existsSync(PRICES_DB_PATH)) prices = new DatabaseSync(PRICES_DB_PATH, { readOnly: true });
  } catch (err) {
    logError({ where: 'identify.catalogue_first.prices', deviceId: device, scanId: null, err });
    prices = null;
  }
  // D-231: a prices file that cannot answer (no observation table, say) is counted for /api/health, never only per scan.
  notePricesOpened(prices, PRICES_DB_PATH);
  try {
    return await fn({
      lookup: fastLookup,
      prices,
      catalogue: catalogueFirstTest?.db !== undefined ? catalogueFirstTest.db : catalogueDb,
      categoryGuard,
      country: market.country,
      currency: market.currency ?? 'CAD',
      asOf: new Date().toISOString().slice(0, 10),
      // Only when Pexi has no price: one Claude ask, no web search, capped per
      // month (identify/src/range-ask.ts). No shopper answer comes from Gemini
      // (Jamin, 2026-09-28, "We are not using gemini at all for the client side answers").
      askRange,
      region: market.region ?? null,
      shopper,
      sortName: sortByName(catalogueFirstTest?.searcher !== undefined ? catalogueFirstTest.searcher : searchService),
      ...(catalogueFirstTest?.claudeWaitMs !== undefined ? { claudeWaitMs: catalogueFirstTest.claudeWaitMs } : {}),
      ...(nameElsewhere ? { nameElsewhere } : {}),
      ...(market.knowsNationalAverage ? { nationalAverage: statcanRung } : {}),
    });
  } finally {
    try {
      prices?.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * The capped Claude range ask, no web search (identify/src/range-ask.ts), behind
 * the paid-call limiter. The one model call any catalogue-first answer may make,
 * and only when Shin's own data cannot answer. RULINGS.md "Catalogue first;
 * Claude, with no web search, is the capped price-range fallback".
 *
 * Undefined without the shopper's yes (Jamin's App Store list, item 9; screens/agree.js): the
 * product name stays here and the answer is the broad-guess range every unpriced item can get.
 */
function claudeRangeAsk(req: IncomingMessage): RangeAsk | undefined {
  if (!claudeAllowed(req)) return undefined;
  return async (identity) => {
    // Checked here, not at the top of the route: only this call can cost money.
    if (paidCallRefusal(req)) return { ok: false, reason: 'rate_limited' as const };
    const { askTypicalRange } = await import('../identify/src/range-ask.ts');
    const s = rangeAskSettings();
    return askTypicalRange(identity, {
      monthlyCap: s.monthlyCap,
      ceilingCents: s.ceilingCents,
      ...(s.storePath ? { storePath: s.storePath } : {}),
      ...(catalogueFirstTest?.rangeAskProvider ? { provider: catalogueFirstTest.rangeAskProvider } : {}),
    });
  };
}

/**
 * The capped Claude read of one camera frame, no tools and no web search
 * (identify/src/pack-read.ts), behind the same paid-call limiter as the range
 * ask. RULINGS.md "A scan never ends with no result": only after the catalogue
 * and Open Food Facts both missed, and the frame goes to Claude, never Gemini.
 */
function claudePackRead(req: IncomingMessage): (frame: Buffer, gtin: string | null) => Promise<{ ok: true; named: NamedElsewhere } | { ok: false; reason: string }> {
  return async (frame, gtin) => {
    if (!claudeAllowed(req)) return { ok: false, reason: 'no_claude_consent' };
    if (paidCallRefusal(req)) return { ok: false, reason: 'rate_limited' };
    const { readPack } = await import('../identify/src/pack-read.ts');
    const s = packReadSettings();
    const r = await readPack({ bytes: new Uint8Array(frame), mediaType: imageKind(frame) === 'png' ? 'image/png' : 'image/jpeg' }, gtin, {
      monthlyCap: s.monthlyCap,
      ...(s.storePath ? { storePath: s.storePath } : {}),
      ...(catalogueFirstTest?.packReadProvider ? { provider: catalogueFirstTest.packReadProvider } : {}),
    });
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, named: { name: r.reading.name, brand: r.reading.brand, size: r.reading.size, source: 'claude_reading' } };
  };
}

/** The reason a refused pack read carries, in the answer, the loud log and the scan row. */
const PACK_READ_DEVELOPER_ONLY = 'pack_read_developer_only';

/**
 * Whether this request may have its frame read by Claude. RULINGS.md "A scan
 * never ends with no result", amended 2026-10-10 (Jamin: "sending picture to
 * claude is a developer only setting"): off for every shopper. The client's
 * own switch is not proof (a flag is one query parameter, and the call costs
 * money), so the server decides: a developer is a device listed in
 * SHIN_DEVELOPER_DEVICES (comma-separated) that proves it with its bound secret,
 * or a request carrying the admin token. Null when allowed, otherwise the reason.
 */
function packReadRefusal(req: IncomingMessage, device: string): string | null {
  if (adminAllows(req.headers[ADMIN_HEADER])) return null;
  const listed = (settings.SHIN_DEVELOPER_DEVICES() ?? '').split(',').map((d) => d.trim()).filter((d) => d !== '');
  // Item 5: a listed id is not enough, because an id is a name. The request has to carry its bound secret.
  return device !== UNATTRIBUTED && listed.includes(device) && provesDevice(device, req.headers) ? null : PACK_READ_DEVELOPER_ONLY;
}

/**
 * The steps after a catalogue miss, in the ruling's order (RULINGS.md "A scan
 * never ends with no result"): a live Open Food Facts lookup by barcode,
 * identity only; a reading Claude already made of this pack (saved by
 * barcode, so the next scan costs no call); then the frame read by Claude.
 * With no frame in hand: `canSendFrame` (the client says it holds one) asks for
 * it; otherwise the reason is `no_frame`. `readFrame` absent (the preview) never
 * calls Claude. Every miss carries its reason, one per step, for the loud log.
 */
function nameElsewhereFor(opts: {
  frame: Buffer | null;
  canSendFrame: boolean;
  readFrame: ReturnType<typeof claudePackRead> | null;
  /** Set when the pack read is refused for this request (`packReadRefusal`): the reason step (2) did not run. */
  refusedWhy?: string | null;
}): NonNullable<BarcodeDeps['nameElsewhere']> {
  return async (gtin) => {
    const reasons: string[] = [];
    const off = await lookupOpenFoodFactsWithReason(gtin);
    if (off.product) {
      return { ok: true, named: { name: off.product.name, brand: off.product.brand, size: off.product.size, source: 'open_food_facts' } };
    }
    reasons.push(off.miss);
    const { savedPackReading, DEFAULT_PACK_STORE_PATH } = await import('../identify/src/pack-read.ts');
    const saved = savedPackReading(packReadSettings().storePath ?? DEFAULT_PACK_STORE_PATH, gtin);
    if (saved) return { ok: true, named: { name: saved.name, brand: saved.brand, size: saved.size, source: 'claude_reading' } };
    if (!opts.frame || !opts.readFrame) {
      if (opts.refusedWhy) return { ok: false, reasons: [...reasons, opts.refusedWhy], frameWanted: false };
      if (opts.canSendFrame && opts.readFrame) return { ok: false, reasons: [...reasons, 'frame_wanted'], frameWanted: true };
      return { ok: false, reasons: [...reasons, 'no_frame'], frameWanted: false };
    }
    const read = await opts.readFrame(opts.frame, gtin);
    if (read.ok) return { ok: true, named: read.named };
    return { ok: false, reasons: [...reasons, `claude_${read.reason}`], frameWanted: false };
  };
}

/**
 * A scan that ended with typing the name is the one result the ruling allows
 * only after every step failed, so it is never quiet (RULINGS.md "Errors fail
 * loudly"): one error line naming the barcode and every step's reason, joined
 * to the scan row by its id.
 */
function logNoName(answer: { outcome: string; noNameReasons?: readonly string[]; barcode: string }, device: string, scanId: number | null): void {
  if (answer.outcome !== 'not_in_catalogue' || !answer.noNameReasons) return;
  logError({
    where: 'identify.no_name',
    deviceId: device,
    scanId,
    err: new Error(`SCAN ENDED WITH NO NAME: nothing named barcode ${answer.barcode || '(none)'}; the shopper was asked to type it (${answer.noNameReasons.join(', ')})`),
    detail: { gtin: answer.barcode, reasons: answer.noNameReasons.join(',') },
  });
}

/**
 * The scan row, the gap, the conflict event and the loud no-name line for one
 * catalogue-first barcode answer, and the body sent back. Shared by
 * `/api/identify` and `/api/identify/pack`, so the two routes cannot drift on
 * what a scan writes.
 */
function finishCatalogueScan(s: {
  device: string;
  query: string;
  /** The canonical code a catalogue miss is logged under, or null for a misread (no code to log). */
  gapGtin: string | null;
  answer: Awaited<ReturnType<typeof answerBarcodeFromCatalogue>>['answer'];
  record: Awaited<ReturnType<typeof answerBarcodeFromCatalogue>>['record'];
  telemetry: ReturnType<typeof telemetryFrom>;
  where: ReturnType<typeof locationFor>;
  startedAt: number;
}): { scanId: number | null; body: Record<string, unknown> } {
  const { answer, record, where } = s;
  // A barcode the catalogue was asked about and does not hold is the most
  // actionable miss the gap log can hold (`what-to-price` reads it), named elsewhere or not.
  if (s.gapGtin && answer.catalogueUp && (answer.outcome === 'not_in_catalogue' || answer.outcome === 'named_outside_catalogue')) {
    recordGap({ gtin: s.gapGtin, catalogueMissing: true });
  }
  const ms = Date.now() - s.startedAt;
  const scanId = recordScan({
    deviceId: s.device,
    kind: 'barcode',
    query: s.query,
    resolvedCode: record.resolvedCode,
    resolvedLabel: record.resolvedLabel,
    source: 'catalogue',
    outcome: record.outcome,
    failureClass: record.failureClass,
    answerPath: record.answerPath,
    rangeSource: record.rangeSource,
    rangeBasis: record.rangeBasis,
    rangeMissReason: record.rangeMissReason,
    ...verdictRecord(record.verdict),
    appVersion: s.telemetry.appVersion,
    platform: s.telemetry.platform,
    latencyMs: ms,
    cell: where.cell,
    storeId: where.storeId,
    storeName: where.storeName,
    exactLat: where.exactLat,
    exactLon: where.exactLon,
    exactAccuracy: where.exactAccuracy,
    exactAt: where.exactAt,
  });
  // Design case 9: the catalogue and the store row disagree on size. Logged, never shown.
  if (record.conflict) recordEvent({ deviceId: s.device, type: 'identity_conflict', payload: { ...record.conflict, scanId } });
  logNoName(answer, s.device, scanId);
  return {
    scanId,
    body: { ...answer, ms, ...shopperReportField(s.device, record.resolvedCode), ...(scanId === null ? {} : { scanId }) },
  };
}

/** The shelf price and the shopper's own lines a request carries, or null when it carries no price. */
function shopperFrom(cents: unknown, thresholds: unknown): { cents: number; thresholds?: unknown } | null {
  const c = readShelfCents(cents);
  if (c === null) return null;
  const t = readThresholdsRaw(thresholds);
  return t === undefined ? { cents: c } : { cents: c, thresholds: t };
}

/** The price file, read-only, for one answer. Null when it is missing or will not open. */
function openPricesReadOnly(path: string, device: string): DatabaseSync | null {
  try {
    return existsSync(path) ? new DatabaseSync(path, { readOnly: true }) : null;
  } catch (err) {
    logError({ where: 'verdict.prices', deviceId: device, scanId: null, err });
    return null;
  }
}

/**
 * The catalogue-first answer for a request no model may answer (Jamin,
 * 2026-09-28: "We are not using gemini at all for the client side answers"):
 * not in the catalogue, so the client offers manual entry.
 */
function noModelCatalogueAnswer(barcode: string, startedAt: number) {
  return {
    kind: 'catalogue' as const,
    outcome: 'not_in_catalogue' as const,
    offerManualEntry: true,
    catalogueUp: fastLookup !== null,
    barcode,
    identity: null,
    range: null,
    rangeSource: null,
    rangeAskedAt: null,
    noRangeReason: null,
    shelfPrice: null,
    verdict: null,
    storeIdentity: null,
    ms: Date.now() - startedAt,
  };
}

/**
 * The verdict for the top text-match candidate, with the shelf price read off
 * the tag as the shopper's price (a "2 for $5" tag counts per item). No Claude
 * ask here: text reading can run passively, so it spends nothing, and the
 * shopper's pick goes through the barcode answer, which may ask. Null when
 * nothing matched.
 */
async function matchTextVerdict(matched: MatchTextAnswer, posted: Record<string, unknown>, device: string): Promise<Verdict | null> {
  const top = matched.candidates[0];
  if (!top) return null;
  const market = marketOfContext(contextFrom((key) => posted[key]));
  const shelf = matched.shelfPrice;
  const shopperCents = shelf ? Math.round(shelf.cents / Math.max(1, shelf.forCount)) : null;
  const prices = openPricesReadOnly(PRICES_DB_PATH, device);
  try {
    const est = await safeEstimate(
      {
        barcode: top.barcode,
        name: top.name,
        brand: top.brand,
        size: top.size,
        region: market.region ?? null,
        country: market.country,
        currency: market.currency ?? 'CAD',
        asOf: new Date().toISOString().slice(0, 10),
      },
      shopperFrom(shopperCents, posted.thresholds),
      {
        prices,
        catalogue: catalogueFirstTest?.db !== undefined ? catalogueFirstTest.db : catalogueDb,
        taxonomy: categoryGuard.taxonomy(),
        ...(market.knowsNationalAverage ? { nationalAverage: statcanRung } : {}),
      },
      // D-270: the pack's text is sure of a product only when that product reads strictly better than
      // every other candidate; a tie is a guess, priced as the kind of thing it names.
      matched.candidates.length === 1 || top.score > (matched.candidates[1]?.score ?? -Infinity)
        ? { grade: 'sure' }
        : { grade: 'guess', words: top.name },
    );
    // D-233: a too-thin estimate is no verdict, logged loudly (catalogue-first.ts shownVerdict).
    return shownVerdict(est, `match_text:${top.barcode ?? top.productId}`);
  } finally {
    try {
      prices?.close();
    } catch {
      /* already closed */
    }
  }
}

/** `POST /api/match-text`'s search, through the worker in the product and a stand-in under test. */
async function catalogueFirstMatchText(lines: readonly string[], device: string): Promise<MatchTextAnswer> {
  const searcher = catalogueFirstTest?.searcher !== undefined ? catalogueFirstTest.searcher : searchService;
  const db = catalogueFirstTest?.db !== undefined ? catalogueFirstTest.db : catalogueDb;
  try {
    return await matchText(lines, { searcher, catalogue: db });
  } catch (err) {
    // A search that failed (a worker timeout, say) is an empty list, never a thrown request.
    logError({ where: 'match_text.search', deviceId: device, scanId: null, err });
    return { kind: 'text_match', catalogueUp: searcher !== null, candidates: [], shelfPrice: null };
  }
}

/**
 * How many bytes of JSON a request is allowed to spend before it is refused.
 *
 * ONE NUMBER FOR EVERY ROUTE THAT TAKES A BODY TODAY, because both of them
 * (`/api/price` and `/api/correction`) carry the same kind of thing: a flat
 * JSON object of a dozen short scalars. The largest legitimate body in the
 * product is a correction, and a fat one measures about 450 bytes: two UUIDs,
 * a barcode, a product id, a label, a category, a shop name typed by hand, a
 * price, a kind and a date. 8 KiB is eighteen times that, so a long label in
 * multi-byte UTF-8, or a field somebody adds next month, has room without
 * anybody having to think about this constant again.
 *
 * It is a PARAMETER rather than a constant read inside the reader, and that is
 * the whole provision made for the photo upload door named in `NOW.md` and in
 * DEFECTS.md D-032. An upload needs a limit in megabytes, and the wrong way to
 * give it one is to raise this number, because that would hand every JSON route
 * a megabyte-sized mouth to feed for the sake of a route none of them are.
 *
 * THE DOOR NOW EXISTS, 2026-09-09. `POST /api/identify/photo` is the route
 * this paragraph was written for. It passes `MAX_PHOTO_BODY_BYTES` (3 MiB) as
 * the parameter and this number did not move, which is the provision working
 * as described rather than a plan for it. `/api/price` and `/api/correction`
 * still take the 8 KiB default, so the two routes that carry a dozen short
 * scalars are still refused at the first chunk if they are sent anything else.
 *
 * The number is deliberately small. It is not tuned for memory (8 KiB is
 * nothing); it is tuned to say what the routes accept, so that anything else
 * is refused at the first chunk rather than parsed and then argued with.
 */
const MAX_JSON_BODY_BYTES = 8 * 1024;

/**
 * `POST /api/events/batch`'s own door, sized for what it actually carries:
 * up to `MAX_EVENTS_PER_BATCH` events at up to `MAX_EVENT_PAYLOAD_BYTES`
 * (events.ts, 4 KiB) each, plus the type string and JSON overhead per item.
 * 200 * 4 KiB is 800 KiB in the worst case; 1 MiB leaves room for that
 * without being large enough to invite anything the per-event caps below do
 * not already refuse.
 */
const MAX_EVENTS_BATCH_BODY_BYTES = 1024 * 1024;

/**
 * `track.js`'s own `BATCH_SIZE` is 150, sent per flush; this is the server's
 * independent ceiling, not a mirror of the client's, because the client's
 * number is free to change without this door changing shape underneath it.
 * Anything past this many events in one request is silently truncated, the
 * same "never a 500 over a log line" contract `/api/event` states above.
 */
const MAX_EVENTS_PER_BATCH = 200;

/**
 * The body was bigger than the route accepts. A value rather than a throw,
 * because `price/src/corrections.ts` states the contract this file works
 * under: a phone correcting a price must never be able to take the server
 * down, so nothing on this path throws at a request handler.
 */
const TOO_LARGE = Symbol('body over the cap');

/**
 * Read a JSON body, refusing before the bytes accumulate.
 *
 * CAP BEFORE READ, WHICH IS THE POINT (D-032). The old version buffered the
 * whole request and then parsed, so a large non-JSON body exhausted memory
 * before the parse even failed. Here the running total is checked on every
 * chunk and the buffer is dropped the moment it is crossed, so the peak is one
 * chunk over the limit rather than whatever the client felt like sending.
 *
 * `content-length` is checked first when it is present, so an honest client is
 * refused without a byte being read. It is not trusted as the only check: a
 * client can lie about it, omit it, or send chunked, and the running total is
 * what actually holds. The header is an optimisation, never the gate.
 *
 * Events rather than `for await`, on purpose: exiting a `for await` early
 * destroys the request, which on HTTP/1.1 destroys the socket the 413 still has
 * to go out on. This pauses instead, leaving the caller to answer and then end
 * the socket itself once the response has flushed.
 *
 * Returns the parsed value, `{}` for an empty body, `null` for something that
 * did not parse or a socket that died mid-body, or `TOO_LARGE`.
 */
function readBody(
  req: import('node:http').IncomingMessage,
  limit: number = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) return Promise.resolve(TOO_LARGE);

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const onData = (c: Buffer) => {
      total += c.length;
      if (total > limit) {
        // Drop what was collected before answering. Holding it costs nothing
        // useful, and the request is about to be refused anyway.
        chunks.length = 0;
        req.pause();
        done(TOO_LARGE);
        return;
      }
      chunks.push(c);
    };
    const onEnd = () => {
      if (chunks.length === 0) return done({});
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        done(null);
      }
    };
    // A socket that died mid-body is not a parse failure and is not ours to
    // throw about. It reads as an unusable body, which is what it is.
    const onDead = () => done(null);

    /**
     * Settle once and then let go of the stream. Detaching matters rather than
     * being tidy: the caller answering a 413 puts its own reader on this
     * request to drain it, and a listener from here still calling `pause` on
     * every chunk would fight that reader for control of the socket.
     */
    function done(value: unknown) {
      if (settled) return;
      settled = true;
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('aborted', onDead);
      req.off('error', onDead);
      resolve(value);
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('aborted', onDead);
    req.on('error', onDead);
  });
}

/*
 * Exported for the tests only, and for one thing: closing it.
 *
 * `app/test/photo-route.test.ts` imports this file so it can hand the photo
 * route a fake model through `setIdentifierForTests`, which a child process
 * cannot be given. An imported server that nothing can close leaves the test
 * runner holding an open listener and the process never exits. Nothing in the
 * product reads this binding; `node server.ts` still starts it below.
 */
/** When this process came up. The uptime ping subtracts from it. Plan item 39c. */
const STARTED_AT = Date.now();

/**
 * TEST ONLY. The shop lookup's network seam, hoisted to the server so a route
 * test can hand `/api/stores` a fixture instead of calling OpenStreetMap.
 *
 * Nothing in the product calls this. It exists because the alternative -- a
 * test that calls `parseOverpass` directly and declares the route covered --
 * is a test that agrees with the code rather than one that hits the route, and
 * this lane's contract says the route is what gets checked.
 */
let storeFetcherDouble: StoreFetcher | null = null;
export function setStoreFetcherForTests(fake: StoreFetcher | null): void {
  storeFetcherDouble = fake;
}

/**
 * The three things a client may tell us about itself, read off a query string
 * or off a JSON body.
 *
 * NAMED AND BOUNDED, never copied wholesale. `appVersion` and `platform` are
 * free text from a phone and they land in a database column, so each is capped
 * and trimmed here rather than trusted. The cap is generous (64 characters is
 * four times any build string this project will produce) and its job is to
 * stop a column, not to validate a format we have not fixed yet.
 *
 * THE CELL IS NOT READ HERE. It is read by `locationFor`, which is the
 * function that also asks about consent, so that there is no path on which a
 * cell is parsed into a variable that something later writes down without
 * having asked.
 */
function telemetryFrom(source: URLSearchParams | Record<string, unknown>): {
  appVersion: string | null;
  platform: string | null;
} {
  const read = (key: string): string | null => {
    const raw = source instanceof URLSearchParams ? source.get(key) : source[key];
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    return value === '' ? null : value.slice(0, 64);
  };
  return { appVersion: read('appVersion'), platform: read('platform') };
}

/**
 * The location fields a scan row may carry, after consent has been consulted.
 *
 * THE REFUSAL IS HERE AND NOWHERE ELSE, which is plan item 6c's second half:
 * "the server refuses to keep a location when the flag is absent". A device
 * that has not said yes gets nulls across the board, whatever it sent, and the
 * sending is not an error worth answering with -- a client built before the
 * consent screen shipped is exactly the case this has to be silent about.
 *
 * The cell is snapped onto the kilometre grid by `parseCell` before it can be
 * returned, so what is stored is coarse whether or not the client coarsened it.
 *
 * THE EXACT READING IS NEVER WRITTEN. Migration 8 (2026-09-14) added four
 * columns for the GPS point the cell was snapped from, and for one push this
 * function filled them under the same consent gate as the cell. Aurik ruled
 * the same day for the design he approved on 2026-09-13: the kilometre-wide
 * cell is the one location fact kept, never the exact spot, which is also
 * what the consent screen tells the reader. So the four come back null here
 * whatever a client sends, old client or new, and the columns stay in the
 * schema empty rather than being dropped, because a migration that removes a
 * column is a second decision this ruling did not ask for. `exactRaw` is
 * still accepted so the call sites and an older client need no change.
 */
function locationFor(
  deviceId: string,
  cellRaw: unknown,
  storeIdRaw: unknown,
  storeNameRaw: unknown,
  exactRaw: { lat?: unknown; lon?: unknown; accuracy?: unknown; at?: unknown } = {},
): {
  cell: string | null;
  storeId: string | null;
  storeName: string | null;
  exactLat: number | null;
  exactLon: number | null;
  exactAccuracy: number | null;
  exactAt: string | null;
} {
  const none = {
    cell: null,
    storeId: null,
    storeName: null,
    exactLat: null,
    exactLon: null,
    exactAccuracy: null,
    exactAt: null,
  };
  if (deviceId === UNATTRIBUTED) return none;
  if (!keepLocation(deviceId)) return none;
  const cell = parseCell(typeof cellRaw === 'string' ? cellRaw : null);
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 120) : null;
  // Absent is null, never zero: `Number(null)` and `Number('')` are both `0`,
  // which for a coordinate is a real place (the Gulf of Guinea) rather than
  // "not sent". A missing query parameter (`URLSearchParams.get` returning
  // null) and a missing JSON field (`undefined`) both have to read as absent
  // here, not as a reading of 0,0 -- HARD RULE 3 in the agent repo governs
  // measurements the same way: a value not taken is null, not a default.
  // Read and dropped on purpose, see the header: the exact point is not kept.
  void exactRaw;
  return {
    cell: cell?.text ?? null,
    storeId: text(storeIdRaw),
    storeName: text(storeNameRaw),
    exactLat: null,
    exactLon: null,
    exactAccuracy: null,
    exactAt: null,
  };
}

/*
 * THE NET UNDER BUILD STANDARD 9, and the reason it is a net and not a rule.
 *
 * Node 24 exits the process on an unhandled rejection. This server has died
 * that way twice, in two places that have nothing to do with each other:
 * 2026-09-08, `new URL` on a malformed `Host` header, thrown on the first line
 * of an async handler outside the try that answers everything else; and D-129,
 * 2026-09-19, a boot-time `warm` pre-load missing a 5,000 ms deadline and
 * rejecting a promise nothing in the repo awaits. Both ended the same way: the
 * server gone for everybody, no body, no second packet.
 *
 * Each was fixed where it happened, and each fix was right. This is the
 * admission that there will be a third. A shopper-facing server has exactly
 * one failure mode worse than answering badly, and that is not answering, so
 * the default of dying is the wrong default here -- rule 6's 'always an
 * answer' cannot hold on a process that is not running.
 *
 * IT LOGS LOUDLY AND IT DOES NOT HIDE ANYTHING. Every rejection that reaches
 * here is a real defect that still has to be found and fixed at its source;
 * this only decides that the shopper in an aisle is not the one who pays for
 * it. The line goes through the same `logError` every other fault uses, so it
 * lands in the same place people already read.
 *
 * `uncaughtException` is deliberately NOT caught alongside it. A synchronous
 * throw that escaped every try leaves the process in a state nothing here can
 * reason about, and continuing to serve from it is how a crash becomes
 * corrupt data. A rejected promise is a value; an escaped exception is a
 * wrecked stack, and the two do not deserve the same answer.
 */
process.on('unhandledRejection', (reason) => {
  logError({
    where: 'process.unhandledRejection',
    err: reason,
    detail: { survived: true, standard: 9 },
  });
});

/**
 * The Origin a PACKAGED build of this app sends, which is never this server's
 * own host and never can be.
 *
 * MEASURED, 2026-11-07, from this server's own access log. A Capacitor build
 * loads the page from the device over a custom scheme, so the browser inside
 * the wrapper sends `Origin: capacitor://localhost` and treats every call to
 * the real server as cross-origin. `new URL('capacitor://localhost').host` is
 * `'localhost'`, so `originRefused` below compared `localhost` against
 * `relay.anjiawenda.com` and refused it -- correctly, by its own rule, and
 * fatally for the only client the testers actually have.
 *
 * What that cost: between 2026-10-28T04:28Z, when the packaged build first
 * appears in the log, and 2026-11-07T03:39Z, it made 78168 OPTIONS requests
 * and exactly one GET. Not one completed call. Every POST route answered the
 * preflight 405 at its own `req.method !== 'POST'` check, the scan routes
 * answered 403 here, and `/api/catalogue`, `/api/categories`,
 * `/api/scenarios` and `/api/health` answered 200 only because they never
 * look at the method at all -- an accident, not CORS support. Nothing in this
 * repo sent an `Access-Control-Allow-*` header of any kind.
 *
 * THE SET HAS THREE ENTRIES BECAUSE THE BUILD IN THE FIELD AND THE BUILD THE
 * CONFIG WOULD PRODUCE DISAGREE. `native/capacitor.config.json` today sets
 * `hostname: localhost` with `androidScheme: https` and `iosScheme: https`,
 * so a rebuild from this tree serves the bundle from `https://localhost` and
 * sends that as its Origin. The app actually on the testers' phones predates
 * that and sends `capacitor://localhost` -- which is why that is the only one
 * of the three the log has ever seen (78332 times, against 6065 for the web
 * origin and a single refused `https://evil.example`). Allowing only the
 * measured value would fix the phones now and break them again on the next
 * native build, which is the same outage twice. `ionic://localhost` is the
 * same wrapper's older scheme and costs a line.
 *
 * `https://localhost` is a claimable origin in a way the custom schemes are
 * not, so it is worth saying why it is not a widening. To send it, a page must
 * already be served from localhost on the tester's own device, which means
 * code already running there -- and such code can call this server with NO
 * Origin header at all, which `originRefused` allows by design and documents
 * below. So the set grants a local attacker nothing it did not already have,
 * while a remote page still cannot claim any of the three.
 *
 * This is NOT a hole in item 18's ruling. That ruling refuses a present and
 * mismatched Origin so a page on someone else's site cannot spend a tester's
 * scans. These two values are not someone else's site; they are the fixed,
 * unregisterable scheme-and-host a local wrapper serves its own bundle from,
 * and no remote page can claim either as its Origin. A missing Origin was
 * already allowed for exactly this client (the comment below says so, citing
 * the wrapper) -- the wrapper simply turned out to send one.
 */
const APP_ORIGINS: ReadonlySet<string> = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
]);

/**
 * Every request header `public/js/api.js` can attach, which is what a
 * preflight asks permission for. A header missing here fails the preflight
 * and the real request is never sent, so this list and `headers()` in api.js
 * have to move together.
 *
 * `content-type` is here for the POST bodies; the rest are read from
 * `headers()` in api.js (invite, shutter, locale, lang, device, device-key,
 * plus). `x-shin-admin` is deliberately absent: the admin routes are for the
 * team's own tools, not the app, and a preflight is not how they are reached.
 */
const CORS_ALLOW_HEADERS =
  'content-type, x-shin-invite, x-shin-shutter, x-shin-locale, x-shin-lang, x-shin-device, x-shin-device-key, x-shin-plus';

/**
 * The value to echo in `Access-Control-Allow-Origin`, or null when this
 * request gets no CORS headers at all.
 *
 * A request with no Origin gets null and that is correct: it is not a
 * cross-origin request, nothing is checking the header, and answering with
 * one would be noise. Same-host Origins get echoed so the browser build keeps
 * working if it is ever served from a different port than it calls.
 *
 * NEVER `*`. A wildcard would let any page on the internet read the answers,
 * and the answers here are a tester's own scans.
 */
function corsOriginFor(req: IncomingMessage): string | null {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin) return null;
  // One source of truth for "is this origin ours": the same predicate the
  // scan routes gate on, which APP_ORIGINS now passes through.
  return originRefused(req) ? null : origin;
}

/**
 * ITEM 18 (docs/scanner-build-order-2026-09-19.md section 18): the routes
 * the same-origin check runs in front of. The paid-call routes plus the demo
 * route (item 19), which is the same shape of request even though it spends
 * nothing -- not every `/api/` path, which would also gate corrections,
 * consent and telemetry that a cross-site page calling on somebody's behalf
 * is not the threat model for.
 */
const SCAN_ROUTES: ReadonlySet<string> = new Set([
  '/api/identify',
  '/api/identify/pack',
  '/api/identify/photo',
  '/api/identify/demo',
  '/api/price',
]);

/**
 * ITEM 18's origin rule, as one function so a route that is only live behind a
 * setting (`/api/match-text`) can apply it after that setting is checked, and
 * answer exactly as an unknown path does while the setting is off. A missing
 * Origin is allowed (and marked by the access log); a present, mismatched or
 * unparseable one is refused.
 */
function originRefused(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin) return false;
  // The packaged app's own scheme-and-host, allowed before the host
  // comparison below, which it can never satisfy. See APP_ORIGINS.
  if (APP_ORIGINS.has(origin)) return false;
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  const requestHost = typeof req.headers.host === 'string' ? req.headers.host : null;
  return originHost === null || requestHost === null || originHost !== requestHost;
}

/**
 * D-161: will the door turn this request away? The same two checks the
 * handler makes before any route runs (the admin token on `/api/admin/`, the
 * invite on every other `/api/` path but the exempt ones), asked early and
 * without side effects so nothing is written for a request that is refused.
 * Static files are not gated and are not refused here.
 */
function refusedAtTheDoor(req: IncomingMessage, pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/api/admin/')) return !adminAllows(req.headers[ADMIN_HEADER]);
  if (INVITE_EXEMPT.includes(pathname)) return false;
  return !inviteAllows(req.headers[INVITE_HEADER]);
}

/** ITEM 19's fixed sample answer. Never Gemini's; never billed. */
const DEMO_SAMPLE = {
  label: 'Kraft Dinner Original, 225 g',
  brand: 'Kraft',
  name: 'Kraft Dinner Original',
  size: '225 g',
  zone: 'middle',
} as const;

/**
 * What a page from this server may load (Jamin's App Store list, item 6). Scripts come only from
 * this server's own files, so text that reached the page unescaped cannot run. `wasm-unsafe-eval`
 * is the barcode and vision readers' WebAssembly and allows no JavaScript eval; inline styles stay
 * because the screens set them throughout. `native/scripts/sync-web.mjs` carries the same list for
 * the phone build, which is served from the phone and never sees this header.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const server = createServer(async (req, res) => {
  /*
   * THE HOST HEADER IS NOT PARSED, AND THAT IS THE FIX RATHER THAN THE
   * SHORTCUT.
   *
   * This line used to interpolate `req.headers.host` into the base URL, and it
   * sat outside the try below, in an async handler. A request whose Host does
   * not parse as an authority -- `Host: [zzz` is enough -- threw
   * ERR_INVALID_URL as an unhandled rejection, which on Node 24 kills the
   * process. One packet, no body, no credentials, and the server is gone for
   * everybody. Reproduced against this file on 2026-09-08: 200, one socket
   * write, then ECONNREFUSED on every connection after it.
   *
   * Nothing in this file reads the host. Every route matches on pathname and
   * searchParams, and every response is relative. So the base is a constant
   * placeholder that exists only to make the URL parser work on a path, and
   * the attacker-controlled header is not part of it at all. Keeping the host
   * and wrapping the parse in a try would answer 400 instead of dying, which
   * is better, but it would leave a value nothing needs in the one expression
   * that runs before any error handling exists.
   *
   * `req.url` on a server request is a path, never absolute, so the parse
   * cannot fail on it -- but it is wrapped anyway, because that argument is
   * exactly the kind that was true until a proxy sent an absolute-form request
   * line.
   */
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'http://localhost');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'that request line could not be read as a path' }));
    return;
  }

  // Before any route reads the body: a request carrying a shutter press id is
  // copied, sent and returned, into that press's folder (src/shutter-log.ts).
  //
  // D-161 (2026-09-22): ONLY FOR A REQUEST THE GATES BELOW WILL LET IN. Both
  // loggers used to run first, so a refused caller could create a folder and
  // a JSON file per request, about 589 a second, with no invite at all. The
  // decision is the same one the invite check and `handleAdmin` make, taken
  // here without reading anything, so a refusal writes nothing to disk.
  const floodRefused = doorRefusal(req, url.pathname);
  if (floodRefused) {
    req.resume();
    res.writeHead(429, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': String(floodRefused.retryAfterSeconds),
    });
    res.end(JSON.stringify({ error: 'That is a lot of requests in a short time. Give it a few minutes and try again.', retryAfterSeconds: floodRefused.retryAfterSeconds }));
    return;
  }
  if (!refusedAtTheDoor(req, url.pathname)) {
    recordAccess(req, res);
    // The same low-disk floor the frames have (D-160), asked only when the
    // request carries a press id, since only then is there a folder to write.
    if (req.headers['x-shin-shutter'] && diskHasRoom(shutterDir())) recordShutterRequest(req, res, url.pathname);
  }
  // A phone's first request carrying its secret ties its id to it
  // (src/device-key.ts). After the door, for the same reason as the logs.
  if (!refusedAtTheDoor(req, url.pathname)) bindDevice(req.headers);

  /*
   * ITEM 18 (docs/scanner-build-order-2026-09-19.md section 18): the
   * frame-embedding block. Set once, here, with `setHeader` rather than on
   * every `res.writeHead(...)` call site: Node merges headers set this way
   * into whatever a later `writeHead` sends, unless that call names the same
   * header itself, and nothing in this file ever does. So every response
   * this server sends, the camera page included, carries both, and the page
   * that runs the camera can never be loaded inside someone else's frame.
   */
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);

  /*
   * CORS, and why it sits in front of every gate below rather than inside the
   * routes.
   *
   * A preflight carries no invite header, no device header and no body -- the
   * browser strips all of it. So every gate below is guaranteed to refuse one:
   * the invite check would 401 it, the scan routes would 403 it, and a
   * POST-only route answers `405 POST only` to the OPTIONS itself. All three
   * happened, for ten days, and a refused preflight means the browser never
   * sends the real request at all. The answer therefore has to be given before
   * anything that reads a credential, which is here.
   *
   * It is set with `setHeader`, like the two frame headers above, so it lands
   * on EVERY response and not just the preflight. That half matters just as
   * much: a preflight that passes and a real response with no
   * `Access-Control-Allow-Origin` still ends as a CORS error in the client,
   * with the request made and the answer thrown away -- which on the paid scan
   * routes means money spent for nothing.
   *
   * `Vary: Origin` because the value depends on the request's Origin, and
   * without it any cache in front of this (the tunnel included) could hand one
   * origin's answer to another.
   *
   * No `Access-Control-Allow-Credentials`: nothing in api.js sets
   * `credentials`, so fetch defaults to same-origin and no cookie is sent
   * cross-origin. Claiming otherwise would widen what a browser will do with
   * these answers for no caller that needs it.
   */
  const corsOrigin = corsOriginFor(req);
  if (corsOrigin !== null) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    /*
     * An unknown Origin is told no, in the only way a preflight can be told:
     * 403 with no allow headers. The browser then cancels the real request.
     * This is the same answer item 18's ruling gives a mismatched Origin, moved
     * one step earlier so it is given before a credential is read.
     */
    if (corsOrigin === null) {
      res.writeHead(403, { 'content-length': '0', 'cache-control': 'no-store' });
      res.end();
      return;
    }
    /*
     * GET and POST are every method api.js uses. OPTIONS is named because the
     * spec expects the preflight's own method in the list.
     *
     * Max-Age is ten minutes, which is the whole reason the log showed 78168
     * preflights: with no cache lifetime a browser re-asks before every single
     * call. Ten rather than the 86400 Chromium caps at, because this list is
     * the thing most likely to change next (a new header in api.js) and a
     * stale allow-list is a silent outage of exactly this kind.
     */
    res.writeHead(204, {
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': CORS_ALLOW_HEADERS,
      'access-control-max-age': '600',
      'content-length': '0',
      'cache-control': 'no-store',
    });
    res.end();
    return;
  }

  const json = (status: number, body: unknown) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(payload);
  };

  /*
   * D-145, D-155 to D-159: a route that answers about a device asks this
   * first. A device that has bound a secret (src/device-key.ts) is answered
   * only for a request carrying that secret; a device that has not yet is
   * answered as before, so no tester's phone is locked out by the update.
   */
  const owns = (deviceId: string) => ownsDevice(deviceId, req.headers);
  const notYours = () => json(403, { error: DEVICE_REFUSAL });

  // The refusal for `paidCallRefusal`: nothing has been sent to Google and nothing counted against the cap.
  const tooManyCalls = (retryAfterSeconds: number) => {
    res.writeHead(429, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': String(retryAfterSeconds),
    });
    res.end(
      JSON.stringify({
        error: 'That is a lot of lookups in a short time. Give it a few minutes and try again.',
        retryAfterSeconds,
      }),
    );
  };

  /**
   * The answer to a body over the cap.
   *
   * DRAIN FIRST, THEN ANSWER, and that order was measured rather than reasoned.
   * The obvious shape is to write the 413 and destroy the request, and it does
   * not work: on HTTP/1.1 the request and the response are one socket, so
   * closing it with bytes still arriving is a TCP reset, and a reset entitles
   * the peer to throw away everything it has already received, the refusal
   * included. A client streaming a megabyte read a status of nothing at all.
   * Half-closing instead of destroying was no better; the unread bytes still
   * sat in a buffer, and the reset arrived when it filled. The break was
   * repeatable and sat between 64 KB and 256 KB, which is the size of the
   * socket buffers rather than anything about this code.
   *
   * So what is still coming is read and thrown on the floor first, and the
   * refusal goes out to a socket with nothing unread behind it, which closes
   * cleanly and gets heard. It is what nginx calls a lingering close and does
   * for this exact response.
   *
   * DISCARDING IS NOT BUFFERING and that is what keeps this a fix rather than
   * the defect wearing a hat: the chunks are counted and dropped, never
   * assembled, so the drain is flat in memory no matter how much is sent. What
   * it costs is a socket, and that is bounded twice: two seconds, or eight
   * megabytes read and dropped, whichever lands first, after which the socket
   * is destroyed and the client gets no answer at all. A client past either
   * bound has stopped being a phone correcting a price.
   *
   * The byte bound is far above anything a JSON route could be sent by
   * accident, because cutting the drain short is itself the reset this whole
   * arrangement exists to avoid. It is there for the case the clock cannot
   * catch: a sender going as fast as loopback allows, measured here at about a
   * megabyte every five milliseconds.
   */
  const LINGER_MS = 2_000;
  const LINGER_BYTES = 8 * 1024 * 1024;
  // The limit is a parameter because the routes no longer share one: a photo
  // is allowed 3 MiB and the JSON routes are allowed 8 KiB, and a refusal that
  // quoted the wrong one would send somebody looking for the wrong bug.
  const refuseTooLarge = (limit: number = MAX_JSON_BODY_BYTES) => {
    const answer = () => {
      if (res.writableEnded) return;
      res.writeHead(413, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'close',
      });
      res.end(JSON.stringify({ error: `body is over the ${limit} byte limit` }));
    };

    if (req.readableEnded || !req.readable) return answer();

    let discarded = 0;
    let stop: NodeJS.Timeout;
    const detach = () => {
      clearTimeout(stop);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', detach);
    };
    const onData = (c: Buffer) => {
      discarded += c.length;
      if (discarded > LINGER_BYTES) {
        detach();
        req.destroy();
      }
    };
    const onEnd = () => {
      detach();
      answer();
    };

    stop = setTimeout(() => {
      detach();
      req.destroy();
    }, LINGER_MS);
    stop.unref();
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', detach);
    req.resume();
  };

  /*
   * THE SCAN THIS REQUEST IS ABOUT, for the error log at the bottom.
   *
   * Plan item 39a asks for a structured error log carrying the scan id, and
   * this is how the id gets to the catch: every route that writes or is handed
   * a scan row sets it, and a failure anywhere after that point is logged
   * against the row a tester can point at. Before any row exists it is null,
   * which is the honest answer and not a gap.
   */
  let scanForLog: number | null = null;
  let deviceForLog: string | null = null;

  try {
    /*
     * THE INVITE CODE, checked before any route runs. Plan item 1j.
     *
     * Every `/api/` path, with one exemption named in `invite.ts`: the uptime
     * ping, which carries nothing and is polled by something that is not the
     * app. Static files are not gated -- the screens are not the expensive
     * thing and a locked-out browser that cannot even load a stylesheet
     * reports as a broken site rather than as a closed beta.
     *
     * 401, not 403, and not 404. A 403 says "you are known and not allowed"
     * and a 404 hides a route that is plainly there under a hostname somebody
     * was given on purpose; 401 is the one that means "this needs a credential
     * you did not send", which is exactly the situation.
     *
     * When SHIN_INVITE_CODE is unset this is a function call that returns true,
     * which is why it can sit in front of every route from today.
     */
    // Read-only data for the team, behind its own token (src/admin.ts).
    if (url.pathname.startsWith('/api/admin/')) return handleAdmin(req, res, url);

    if (url.pathname.startsWith('/api/') && !INVITE_EXEMPT.includes(url.pathname)) {
      if (!inviteAllows(req.headers[INVITE_HEADER])) {
        return json(401, { error: INVITE_REFUSAL });
      }
    }

    /*
     * ITEM 18 (docs/scanner-build-order-2026-09-19.md section 18), ruling 8
     * (docs/decisions.md, "Nine rulings", 2026-09-19): "A missing Origin
     * header is allowed and marked; a wrong one is refused." Scoped to the
     * scan endpoints named there, not every `/api/` route: those are the
     * ones a page embedded somewhere else, or a cross-site script, would
     * want to call on somebody's behalf.
     *
     * MISSING IS ALLOWED, NOT IGNORED. It is not refused because a native
     * app wrapper can legitimately send no Origin at all (`api.js`'s own
     * `platform` comment already accounts for a wrapper-set global) --
     * refusing the absent case would break a real client to stop a
     * hypothetical one. It is still MARKED: `access-log.ts`'s `recordAccess`
     * (already called above, before this check runs) writes the Origin
     * header verbatim, present or not, on every request including this one.
     *
     * A PRESENT AND MISMATCHED Origin is refused outright, per the ruling.
     * The comparison is on `host` (hostname plus port), read directly off
     * the request's own `Host` header as a string -- never parsed as a URL,
     * the same caution this file's own top-of-request comment gives for why
     * the request line is parsed against a placeholder base rather than the
     * real Host.
     */
    if (SCAN_ROUTES.has(url.pathname) && originRefused(req)) {
      return json(403, { error: 'that origin is not allowed to call this route' });
    }

    if (url.pathname === '/api/shutter/frame') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      // Off (the default): the picture is never read into memory.
      if (!shutterLogOn()) {
        req.resume();
        return json(404, { error: 'the shutter log is off' });
      }
      const body = await readBody(req, MAX_SHUTTER_FRAME_BYTES);
      if (body === TOO_LARGE) return refuseTooLarge(MAX_SHUTTER_FRAME_BYTES);
      // D-160: the frame is counted against the device that sent it, and
      // against everybody, and not written at all to a nearly full disk.
      const frameDevice = deviceHeaderOf(req.headers);
      if (frameDevice && !owns(frameDevice)) return notYours();
      const status = saveCappedShutterFrame(body, process.env, { deviceId: frameDevice });
      if (status === 204) {
        res.writeHead(204, { 'cache-control': 'no-store' });
        res.end();
        return;
      }
      return json(status, {
        error:
          status === 404
            ? 'the shutter log is off'
            : status === 429
              ? 'daily frame limit reached'
              : status === 507
                ? 'the server is low on disk space'
                : 'frame not saved',
      });
    }

    /*
     * Continuous shelf capture (item 16, 2026-09-17): a picture of what the
     * camera sees while it is open, stored and NOT sent to any model. Photo
     * consent is checked inside `saveShelfFrame`, and the phone checks it too.
     * Behind the invite check above like every /api/ route.
     */
    if (url.pathname === '/api/shelf/frame') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const cap = Math.ceil(MAX_SHELF_FRAME_BYTES * 1.4);
      const body = await readBody(req, cap);
      if (body === TOO_LARGE) return refuseTooLarge(cap);
      // D-155: only the device itself may send its pictures. Photo
      // identification, consent and the caps are checked inside the store.
      const shelfDevice = body !== null && typeof body === 'object' ? (body as { deviceId?: unknown }).deviceId : null;
      if (typeof shelfDevice === 'string' && !owns(shelfDevice)) return notYours();
      const saved = saveShelfFrame(body);
      if (saved.status === 204) {
        res.writeHead(204, { 'cache-control': 'no-store' });
        res.end();
        return;
      }
      return json(saved.status, { error: saved.error ?? 'frame not saved' });
    }

    if (url.pathname === '/api/catalogue') return json(200, await catalogue());
    if (url.pathname === '/api/categories') return json(200, categories());
    if (url.pathname === '/api/scenarios') return json(200, scenarios());

    /*
     * ITEM 19 (docs/scanner-build-order-2026-09-19.md section 19). A
     * scripted demo scan: a fixed sample answer, no provider call, no cost.
     * Built for the case nothing in this codebase answers today (failure.md
     * D19): a person who has not granted camera permission yet, or a
     * machine with no catalogue attached, has no way to see what a real scan
     * result looks like.
     *
     * MARKED, NEVER COUNTED. C:\agent CLAUDE.md HARD RULE 3, "no fabricated
     * evidence": a row that recorded this the way a real Gemini answer is
     * recorded would be a log claiming an identification happened when none
     * did. `isDemo: true` on the write is what keeps this compliant; every
     * reader that computes a rate over real scans (`scan-summary.ts`'s
     * `summariseScans`, `weeklyCount`) already excludes `is_demo` rows.
     *
     * The screen that shows this, and any on-screen "this is a demo" label,
     * is client work (`app/public/js`) and belongs to another session; this
     * route and the marked row are the whole of the server half.
     */
    if (url.pathname === '/api/identify/demo') {
      let posted: Record<string, unknown> | null = null;
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (body === TOO_LARGE) return refuseTooLarge();
        if (body !== null && typeof body === 'object') posted = body as Record<string, unknown>;
      }
      const deviceId =
        (posted && typeof posted.deviceId === 'string' && posted.deviceId.trim()) ||
        url.searchParams.get('deviceId')?.trim() ||
        UNATTRIBUTED;
      deviceForLog = deviceId;
      const demoScanId = recordScan({
        deviceId,
        kind: 'text',
        query: 'demo',
        resolvedLabel: DEMO_SAMPLE.label,
        outcome: 'answered',
        source: 'demo',
        isDemo: true,
      });
      scanForLog = demoScanId;
      recordEvent({ deviceId, type: 'demo_scan_shown', payload: { scanId: demoScanId } });
      return json(200, {
        demo: true,
        product: {
          label: DEMO_SAMPLE.label,
          brand: DEMO_SAMPLE.brand,
          name: DEMO_SAMPLE.name,
          size: DEMO_SAMPLE.size,
        },
        matchedBy: 'demo',
        band: DEMO_SAMPLE.zone,
        catalogueUp: false,
        model: 'demo-sample-v1',
        modelFamily: null,
        lowConfidence: false,
        confidenceReasons: [],
        ...(demoScanId === null ? {} : { scanId: demoScanId }),
      });
    }

    /*
     * The real catalogue, in front of a user for the first time.
     *
     * GET so a barcode read can fire it without a body and so it is cacheable
     * later. The barcode path costs 0.2 ms in the catalogue process against all
     * 5,182,591 rows, which is why the pipeline puts it first and why it is
     * unmetered: it is the cheapest thing in the product and it settles
     * identity outright.
     */
    /*
     * The free-scan quota and what the shopper did after an answer
     * (src/scan-quota.ts). The device is `?deviceId=` / body `deviceId`, or
     * the `x-shin-device` header.
     */
    if (url.pathname === '/api/quota') {
      if (req.method !== 'GET') return json(405, { error: 'GET only' });
      const quotaDevice = url.searchParams.get('deviceId')?.trim() || deviceFromHeaders(req.headers) || '';
      if (quotaDevice === '') return json(400, { error: 'deviceId is required' });
      if (!owns(quotaDevice)) return notYours();
      deviceForLog = quotaDevice;
      return json(200, await quotaFor(quotaDevice, req.headers));
    }
    const outcomePath = /^\/api\/scan\/(\d+)\/outcome$/.exec(url.pathname);
    if (outcomePath) {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') return json(400, { error: 'body did not parse as JSON' });
      const o = body as Record<string, unknown>;
      const outcomeScan = Number(outcomePath[1]);
      if (!scanExists(outcomeScan)) return json(404, { error: 'no scan with that id' });
      scanForLog = outcomeScan;
      if (!isScanOutcome(o.outcome)) {
        return json(400, { error: "outcome must be 'bought_elsewhere', 'price_matched', 'bought_here' or 'not_bought'" });
      }
      const outcomeDevice = (typeof o.deviceId === 'string' ? o.deviceId.trim() : '') || deviceFromHeaders(req.headers);
      // Item 3: only the device that made this scan says what happened after it.
      if (!outcomeDevice || outcomeDevice !== getScan(outcomeScan)?.device_id || !owns(outcomeDevice)) return notYours();
      deviceForLog = outcomeDevice;
      const kept = recordScanOutcome(outcomeScan, outcomeDevice, o.outcome);
      return json(200, kept ? { stored: true } : { stored: false, why: 'that outcome could not be written down' });
    }

    if (url.pathname === '/api/identify') {
      /*
       * A BARCODE IS ONE GEMINI CALL, NOTHING ELSE. A TYPED NAME IS NEVER ONE.
       *
       * A barcode: beta gap items 1, 2, 3 and 6. Jamin: "The server will not
       * check shins own product list for now. The only thing the server will
       * do is call gemini." The barcode goes to Gemini as text digits, never an
       * image (rule 2). The catalogue is not consulted for a barcode's answer.
       *
       * A typed name (`text` and no `gtin`): Jamin, 2026-09-23, "typing a
       * product should only search our catalogue and only return when we have
       * both the item and price." So it searches Shin's own data and nothing
       * else (`src/own-prices.ts`: the prices file, the user catalogue, and the
       * big catalogue for names only), makes no Gemini or other network call,
       * and answers only when a product matched AND Shin holds at least one
       * dated price for it. Otherwise it answers, as a 200, that Shin has no
       * price for that yet and to scan the barcode; there is no Gemini
       * fallback. FOR TYPED SEARCHES ONLY this reverses two of Jamin's earlier
       * rules in docs/jamin-gemini-rules.md, that the price never comes from
       * Shin's own data and that there is always an answer, by his ruling of
       * 2026-09-23. Barcodes and
       * photos still follow both. A typed search spends nothing, so the weekly
       * free-scan limit and the paid-call limiter do not apply to it (the
       * limiter's budget is for calls that cost money; a typed search counted
       * there would use up a tester's paid scans on free lookups). It still
       * writes its scan row, kind 'text', answered or refused. Defect D-142.
       *
       * GET carries the request in the query string, and the shelf price and
       * the user's lines travel as `shelfPriceCents` and `thresholds` (one JSON
       * parameter, the object exactly as the client store holds it). POST
       * carries the same names in a JSON body. Neither is required: a missing
       * shelf price still gets an answer, a missing `thresholds` gets the
       * default range (or this device's saved lines).
       *
       * FOR A BARCODE THE ANSWER ALWAYS COMES BACK, marked when it is not fully confident:
       * `lowConfidence` and `confidenceReasons`, and `failure` when Gemini gave
       * nothing at all. It carries the same block `/api/price` will serve, in
       * `grounded.block`: identity, offers, reviews and Gemini's own verdict.
       */
      let posted: Record<string, unknown> | null = null;
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (body === TOO_LARGE) return refuseTooLarge();
        if (body === null || typeof body !== 'object') return json(400, { error: 'body did not parse as JSON' });
        posted = body as Record<string, unknown>;
      }
      const pick = (key: string): unknown => (posted ? posted[key] : (url.searchParams.get(key) ?? undefined));
      const pickText = (key: string): string | undefined => {
        const v = pick(key);
        return typeof v === 'string' ? v : undefined;
      };
      const rawGtin = pickText('gtin')?.trim() || undefined;
      // Trimmed, as `/api/search` trims `q`: `?text=%20%20` is not a query.
      const text = pickText('text')?.trim() || undefined;
      if (!rawGtin && !text) return json(400, { error: 'gtin or text is required' });
      const device = pickText('deviceId')?.trim() || deviceFromHeaders(req.headers) || UNATTRIBUTED;
      if (!owns(device)) return notYours();
      deviceForLog = device;
      const identifyStarted = Date.now();
      const telemetry = telemetryFrom(posted ?? url.searchParams);
      const where = locationFor(device, pick('cell'), pick('storeId'), pick('storeName'), {
        lat: pick('lat'),
        lon: pick('lon'),
        accuracy: pick('accuracy'),
        at: pick('locatedAt'),
      });

      /*
       * ITEM 2 (docs/scanner-build-order-2026-09-19.md section 2), ruling 2
       * (docs/decisions.md, "Nine rulings", 2026-09-19). The check digit and
       * the zero-pad normalization run BEFORE anything is spent: a barcode
       * that cannot be made to check out in any padding is refused here,
       * before the paid call, rather than sent to Gemini as a reading that
       * could never have been trusted. `gtin` from this point on is the one
       * canonical digit string ruling 2 requires; nothing later in this
       * route ever sees the raw, unvalidated reading again.
       */
      const gtin = rawGtin ? canonicalGtin(rawGtin) ?? undefined : undefined;

      /*
       * `preview=1` (UX build 5, R-36): the app asks what a barcode IS the moment it
       * is read, so the price pad can name the item before a price is typed. It is
       * a name and nothing else: no scan row, no free-scan counted (usageFor counts
       * scan rows), no gap logged, no Claude range asked, no answer to act on. The
       * priced request that follows the pad is the scan. A preview that cannot be
       * answered (a malformed code, catalogue first off) says so with a null
       * identity and the app keeps the digits on the pad.
       */
      if (rawGtin && pickText('preview') === '1') {
        const canonical = gtin && catalogueFirstOn() ? canonicalBarcode(rawGtin) : null;
        if (!canonical) return json(200, { kind: 'catalogue', outcome: 'preview_unavailable', barcode: rawGtin, identity: null, preview: true });
        // Open Food Facts and a saved Claude reading name it here too, both free; no frame, so no Claude call.
        const { answer } = await catalogueFirstBarcode(
          undefined,
          canonical,
          marketOfContext(contextFrom(pick)),
          device,
          null,
          nameElsewhereFor({ frame: null, canSendFrame: false, readFrame: null }),
        );
        return json(200, {
          kind: 'catalogue',
          outcome: answer.outcome,
          barcode: answer.barcode,
          identity: answer.identity ?? answer.storeIdentity ?? null,
          ...(answer.identitySource ? { identitySource: answer.identitySource } : {}),
          preview: true,
        });
      }

      if (rawGtin && !gtin) {
        const invalidScanId = recordScan({
          deviceId: device,
          kind: 'barcode',
          query: rawGtin,
          outcome: 'refused',
          failureClass: 'invalid_barcode',
          appVersion: telemetry.appVersion,
          platform: telemetry.platform,
          latencyMs: Date.now() - identifyStarted,
          cell: where.cell,
          storeId: where.storeId,
          storeName: where.storeName,
          exactLat: where.exactLat,
          exactLon: where.exactLon,
          exactAccuracy: where.exactAccuracy,
          exactAt: where.exactAt,
        });
        scanForLog = invalidScanId;
        return json(200, {
          product: null,
          matchedBy: 'none',
          band: 'miss',
          category: null,
          categoryWhy: '',
          ring: null,
          otherCandidates: 0,
          route: null,
          catalogueUp: false,
          ms: Date.now() - identifyStarted,
          reason: 'invalid_barcode',
          failure: 'invalid_barcode',
          lowConfidence: true,
          confidenceReasons: ['no_answer:invalid_barcode'],
          ...(invalidScanId === null ? {} : { scanId: invalidScanId }),
        });
      }

      // A typed name: Shin's own data only, never a paid call (see the comment above).
      if (!gtin && text) {
        const typedAnswer = await typedFromOwnData(text, device, telemetry, where, identifyStarted, null, {
          shopper: shopperFrom(pick('shelfPriceCents'), pick('thresholds')),
          market: marketOfContext(contextFrom(pick)),
          askRange: claudeRangeAsk(req),
        });
        if (typeof typedAnswer.scanId === 'number') scanForLog = typedAnswer.scanId;
        return json(200, typedAnswer);
      }

      /*
       * CATALOGUE FIRST, when SHIN_CATALOGUE_FIRST is on, its default since
       * 2026-09-28 (RULINGS.md "Catalogue first; Claude, with no web search,
       * is the capped price-range fallback"). Off, this block is skipped and
       * the route below answers exactly as it always has. On, the catalogue
       * names the product, Shin's prices give the range, and no model is
       * called: Jamin, 2026-09-28, "We are not using gemini at all for the
       * client side answers". The weekly free-scan limit applies as it does to
       * any barcode scan.
       */
      if (gtin && rawGtin && catalogueFirstOn()) {
        const overLimitFirst = await scanLimitRefusal(device, req.headers);
        if (overLimitFirst) return json(402, overLimitFirst);
        const overAddress = await freeScanAddressRefusal(req, device);
        if (overAddress) return tooManyCalls(overAddress.retryAfterSeconds);
        const canonical = canonicalBarcode(rawGtin);
        if (canonical) {
          // The pack read is developer-only: a shopper's `canSendFrame` is ignored and the miss goes to typing, with the reason.
          const packRefused = packReadRefusal(req, device);
          const { answer, record } = await catalogueFirstBarcode(
            claudeRangeAsk(req),
            canonical,
            marketOfContext(contextFrom(pick)),
            device,
            shopperFrom(pick('shelfPriceCents'), pick('thresholds')),
            // RULINGS.md "A scan never ends with no result": a catalogue miss is named elsewhere before "not found".
            nameElsewhereFor({
              frame: null,
              canSendFrame: !packRefused && pickText('canSendFrame') === '1',
              readFrame: packRefused ? null : claudePackRead(req),
              refusedWhy: packRefused,
            }),
          );
          // The client holds a frame and Pexi needs it: asked for, with no scan row yet. The frame's own request is the scan.
          if (answer.outcome === 'frame_wanted') return json(200, { ...answer, ms: Date.now() - identifyStarted });
          const finished = finishCatalogueScan({ device, query: gtin, gapGtin: gtin, answer, record, telemetry, where, startedAt: identifyStarted });
          scanForLog = finished.scanId;
          return json(200, finished.body);
        }
      }

      // Whatever the block above did not answer gets manual entry. No model is called for a
      // barcode or a typed name here (Jamin, 2026-11-07, RULINGS "Pexi uses Gemini for nothing").
      return json(200, noModelCatalogueAnswer(gtin ?? '', identifyStarted));
    }

    /*
     * TEXT OFF A PACK OR A SHELF TAG, IN; THE TOP 3 CATALOGUE ROWS, OUT.
     * RULINGS.md "Catalogue first; Gemini is a capped fallback, never the
     * identity". Live only when SHIN_CATALOGUE_FIRST is on; off, it answers
     * exactly what an unknown path answers, the same 404 as before it existed.
     *
     * Guards, the same as `/api/identify`'s: the invite code (above, every
     * `/api/` path), the origin rule (`originRefused`, applied here after the
     * setting so the off case stays a plain 404), the 8 KiB JSON body cap, and
     * the per-code and per-address limiter windows, in this route's own buckets
     * (`matchTextRefusal`) because it spends nothing. No Gemini call of any kind.
     * The shopper picks one candidate and the client sends its barcode to
     * `/api/identify`. Passive reading never writes a catalogue miss
     * (`recordMiss: false`), but every call writes its scan row.
     */
    if (url.pathname === '/api/match-text') {
      if (!catalogueFirstOn()) return json(404, { error: 'no such endpoint' });
      if (originRefused(req)) return json(403, { error: 'that origin is not allowed to call this route' });
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const limitedMatch = matchTextRefusal(req);
      if (limitedMatch) return tooManyCalls(limitedMatch.retryAfterSeconds);
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      const read = readMatchTextBody(body);
      if (!read.ok) return json(400, { error: read.error });
      const posted = body as Record<string, unknown>;
      const device =
        (typeof posted.deviceId === 'string' ? posted.deviceId.trim() : '') || deviceFromHeaders(req.headers) || UNATTRIBUTED;
      if (!owns(device)) return notYours();
      deviceForLog = device;
      const started = Date.now();
      const telemetry = telemetryFrom(posted);
      const where = locationFor(device, posted.cell, posted.storeId, posted.storeName, {
        lat: posted.lat,
        lon: posted.lon,
        accuracy: posted.accuracy,
        at: posted.locatedAt,
      });
      const matched = await catalogueFirstMatchText(read.lines, device);
      const textVerdict = await matchTextVerdict(matched, posted, device);
      const ms = Date.now() - started;
      /*
       * The lines are kept in `query_text`, joined by newlines, following the
       * precedent a typed search set: `typedFromOwnData` writes the typed text
       * there too. They are capped (60 lines of 200 characters, inside the 8 KiB
       * body cap) before they get this far.
       */
      const matchScanId = recordScan({
        deviceId: device,
        kind: 'text',
        query: read.lines.join('\n'),
        source: 'catalogue',
        outcome: matched.candidates.length > 0 ? 'answered' : 'refused',
        failureClass: matched.candidates.length > 0 ? null : 'not_in_catalogue',
        answerPath: 'text_match',
        matchLines: read.lines.length,
        matchCandidates: matched.candidates.length,
        matchPriceRead: matched.shelfPrice !== null,
        ...verdictRecord(textVerdict),
        appVersion: telemetry.appVersion,
        platform: telemetry.platform,
        latencyMs: ms,
        cell: where.cell,
        storeId: where.storeId,
        storeName: where.storeName,
        exactLat: where.exactLat,
        exactLon: where.exactLon,
        exactAccuracy: where.exactAccuracy,
        exactAt: where.exactAt,
      });
      scanForLog = matchScanId;
      return json(200, { ...matched, verdict: textVerdict, ms, ...(matchScanId === null ? {} : { scanId: matchScanId }) });
    }

    /*
     * The ranked list behind `/api/identify`'s single pick.
     *
     * `/api/identify` collapses a search to the one product it will price;
     * this is the other half a scan screen needs when that pick might be
     * wrong -- "not this?" only works if there is a second candidate to
     * offer, and the band tells the screen whether offering one is honest
     * ("ambiguous", several rows are plausible) or face-saving ("confident",
     * there was nothing else to pick). Same catalogue process, same 5 second
     * timeout and the same "not running" state, because this is optional for
     * exactly the reason `/api/identify` is.
     */
    if (url.pathname === '/api/search') {
      const text = url.searchParams.get('q')?.trim();
      if (!text) return json(400, { error: 'q is required' });
      const limitRaw = Number(url.searchParams.get('limit') ?? '5');
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 20) : 5;
      const started = Date.now();
      if (!searchService) {
        return json(200, {
          catalogueUp: false,
          band: 'miss',
          matchedBy: 'none',
          candidates: [],
          ring: null,
          ms: Date.now() - started,
          why: catalogueWhyNot,
        });
      }
      try {
        // Same ceiling `identify()` obeys: past 90,000 embedded rows a KNN
        // scans the whole table (2.8 microseconds a row, measured), and this
        // endpoint is not exempt just because it shows more than one result.
        const query = { text, limit, vectors: vectorsOn };
        /*
         * Routed by the same history `/api/identify` used, and the matching
         * matters here more than the narrowing does.
         *
         * This endpoint is what "not this?" calls: a shopper saying the pick
         * was wrong and asking what else was found. Running it unrouted while
         * identify ran routed answers a different question from the one that
         * produced the pick, and the list would then hold rows the pick could
         * never have come from.
         */
        const route = routeFor(url.searchParams.get('deviceId')?.trim() || null);
        const routed =
          route && routing
            ? await routing.restrictedSearch(searchService, query, route)
            : {
                result: await searchService.search(query),
                restricted: false,
                fellBack: false,
                confidenceAdjustment: 1,
              };
        const raw = routed.result as {
          band: 'confident' | 'ambiguous' | 'miss';
          matchedBy: 'gtin' | 'hybrid' | 'none';
          candidates: unknown[];
          ring: unknown;
        };
        /*
         * The same downgrade `/api/identify` applies, which this route dropped:
         * routing returns a confidence adjustment below 1 on a restricted
         * result and this interface reports a band, so the adjustment lands
         * as confident -> ambiguous. It was unreachable here only because
         * this route pins neither brand nor size, so the band could not be
         * `confident` -- a safety rule holding on an invariant nothing
         * asserted. Now it holds on a line.
         */
        const result =
          routed.restricted && !routed.fellBack && raw.band === 'confident'
            ? { ...raw, band: 'ambiguous' as const }
            : raw;
        /*
         * The category safeguard for the ring (category-guard.ts, A2). A parent
         * ring is one step wider than the leaf, and the tag it was drawn at must
         * be an ancestor of the leaf in the taxonomy. A fault is logged and
         * counted; the ring is returned exactly as it was.
         */
        const ringSeen = result.ring as { tag?: unknown; ring?: unknown } | null;
        const ringPick = result.candidates[0] as { code?: unknown; leafCategory?: unknown; categoryPath?: unknown } | undefined;
        if (ringSeen && ringSeen.ring === 'parent' && typeof ringSeen.tag === 'string' && ringPick && typeof ringPick.code === 'string' && Array.isArray(ringPick.categoryPath)) {
          const path = ringPick.categoryPath.filter((t): t is string => typeof t === 'string');
          categoryGuard.check({
            via: 'ring',
            barcode: ringPick.code,
            leaf: ringLeaf(path, ringSeen.tag) ?? (typeof ringPick.leafCategory === 'string' ? ringPick.leafCategory : null),
            parent: ringSeen.tag,
          });
        }
        return json(200, {
          catalogueUp: true,
          vectorsOn,
          ...result,
          route: routed.restricted ? route : null,
          fellBack: routed.fellBack,
          ms: Date.now() - started,
        });
      } catch (err) {
        // A search that threw is not the same as a search that found nothing;
        // identify() names this distinction too and this endpoint keeps it.
        //
        // The caught message is logged, not returned. Same reason identify()
        // gives: an internal string on the screen of somebody who cannot act on
        // it is not an answer, and this one would be the only place in the API
        // where a raw exception reaches a client.
        console.error('search failed:', err);
        return json(200, {
          catalogueUp: true,
          band: 'miss',
          matchedBy: 'none',
          candidates: [],
          ring: null,
          ms: Date.now() - started,
          error: 'the catalogue could not answer that one',
        });
      }
    }

    /*
     * A photograph becomes an identity.
     *
     * POST because it carries a megabyte of image, and the third rung of the
     * ladder rather than the first: the client tries the barcode, then the
     * catalogue by text, and arrives here only when a person is pointing at
     * something whose barcode is not visible. That is the expensive path and
     * it is the only one with a rate limit.
     *
     * A REFUSAL IS A 200 HERE, the same rule `/api/price` states for a refused
     * verdict and for the same reason. A photo nobody could read, a model that
     * timed out and a product the catalogue does not have are all correct
     * answers about the input, and a client that treats them as errors will
     * retry around the one thing telling it the truth. The only non-200s are
     * about the REQUEST: a body over the cap, a body that is not JSON, a
     * payload that is not an image, and a device asking too often.
     */
    /*
     * THE FRAME OF A BARCODE NOTHING NAMES. RULINGS.md "A scan never ends with
     * no result" (2026-10-10): "when Pexi cannot name a scanned item itself, it
     * asks Claude before it ever shows 'not found'". Two ways in, both from the
     * camera: `/api/identify` answered `frame_wanted` (the catalogue, Open Food
     * Facts and any saved reading all missed), or the camera saw only misreads
     * (a check digit that fails) for a few seconds. The body is
     * `{ gtin?, frame, shelfPriceCents?, thresholds?, deviceId, ...context }`,
     * `frame` one JPEG or PNG as bare base64.
     *
     * A valid `gtin` takes the whole catalogue-first path again (a catalogue hit
     * still wins), with the frame as its last step; a misread has no code, so
     * the frame is read straight away and the name is priced with no barcode.
     * The frame goes to Claude (identify/src/pack-read.ts: no tools, no web
     * search, capped per month, behind the paid-call limiter), never to Gemini,
     * and it is kept on disk only when the device said yes to photos.
     */
    if (url.pathname === '/api/identify/pack') {
      if (!catalogueFirstOn()) return json(404, { error: 'no such endpoint' });
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req, MAX_PHOTO_BODY_BYTES);
      if (body === TOO_LARGE) return refuseTooLarge(MAX_PHOTO_BODY_BYTES);
      if (body === null || typeof body !== 'object') return json(400, { error: 'body did not parse as JSON' });
      const p = body as Record<string, unknown>;
      const frame = typeof p.frame === 'string' && p.frame.trim() !== '' ? Buffer.from(p.frame, 'base64') : null;
      if (!frame || frame.length === 0) return json(400, { error: 'frame is required and must be a base64 JPEG or PNG' });
      if (imageKind(frame) === null) return json(400, { error: 'frame must be a PNG or a JPEG' });
      const device = typeof p.deviceId === 'string' && p.deviceId.trim() !== '' ? p.deviceId.trim() : deviceFromHeaders(req.headers) || UNATTRIBUTED;
      if (!owns(device)) return notYours();
      deviceForLog = device;
      /* Developer-only (2026-10-10). The phone sends a frame only with its Developer switch on, but that switch
         is the client's word; this is the check that holds. Refused before anything is spent, and said out loud. */
      const packRefused = packReadRefusal(req, device);
      if (packRefused) {
        logError({
          where: 'identify.pack_refused',
          deviceId: device,
          scanId: null,
          err: new Error(`PACK READ REFUSED: device ${device} is not a developer (SHIN_DEVELOPER_DEVICES or the admin token); the frame was not read`),
          detail: { gtin: typeof p.gtin === 'string' ? p.gtin.trim() : '', reason: packRefused },
        });
        return json(403, { error: 'the Claude read of the pack is a developer-only setting', failure: packRefused });
      }
      const overLimitPack = await scanLimitRefusal(device, req.headers);
      if (overLimitPack) return json(402, overLimitPack);
      const packStarted = Date.now();
      const telemetry = telemetryFrom(p);
      const where = locationFor(device, p.cell, p.storeId, p.storeName, { lat: p.lat, lon: p.lon, accuracy: p.accuracy, at: p.locatedAt });
      const rawGtin = typeof p.gtin === 'string' ? p.gtin.trim() : '';
      const canonical = rawGtin ? canonicalBarcode(rawGtin) : null;
      const market = marketOfContext(contextFrom((key) => p[key]));
      const shopper = shopperFrom(p.shelfPriceCents, p.thresholds);
      const readFrame = claudePackRead(req);

      let result: Awaited<ReturnType<typeof answerBarcodeFromCatalogue>>;
      if (canonical) {
        result = await catalogueFirstBarcode(
          claudeRangeAsk(req),
          canonical,
          market,
          device,
          shopper,
          nameElsewhereFor({ frame, canSendFrame: false, readFrame }),
        );
      } else {
        // A misread: no code to look up or save under. The frame is the only thing that can name it.
        const read = await readFrame(frame, null);
        result = await withCatalogueFirstDeps(claudeRangeAsk(req), market, device, shopper, undefined, async (deps) => {
          if (read.ok) return answerNamedItem(read.named, rawGtin, null, deps);
          const reasons = ['misread', `claude_${read.reason}`];
          return {
            answer: {
              kind: 'catalogue',
              outcome: 'not_in_catalogue',
              offerManualEntry: true,
              catalogueUp: deps.lookup !== null,
              barcode: rawGtin,
              identity: null,
              range: null,
              rangeSource: null,
              rangeAskedAt: null,
              noRangeReason: null,
              shelfPrice: null,
              verdict: null,
              storeIdentity: null,
              noNameReasons: reasons,
            },
            record: {
              resolvedCode: null,
              resolvedLabel: null,
              outcome: 'refused',
              failureClass: 'not_in_catalogue',
              answerPath: 'not_in_catalogue',
              rangeSource: null,
              rangeBasis: null,
              rangeMissReason: `no_name:${reasons.join(',')}`,
              verdict: null,
              conflict: null,
            },
          };
        });
      }
      const finished = finishCatalogueScan({
        device,
        query: canonical?.gtin ?? rawGtin,
        gapGtin: canonical?.gtin ?? null,
        answer: result.answer,
        record: result.record,
        telemetry,
        where,
        startedAt: packStarted,
      });
      scanForLog = finished.scanId;
      // The frame, only if they said so: the same three conditions as the photo route's photograph.
      if (finished.scanId !== null && device !== UNATTRIBUTED && keepPhoto(device)) {
        const kind = imageKind(frame);
        if (kind) {
          const stored = await savePhoto(finished.scanId, frame, kind);
          if (stored) updateScan(finished.scanId, { photoPath: stored });
        }
      }
      return json(200, finished.body);
    }

    if (url.pathname === '/api/identify/photo') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      /*
       * Before the body is read, so on a server that may not send photographs
       * the photograph never enters this process at all.
       *
       * A 200 with a `failure` code rather than a 5xx, by this route's own
       * rule above: `identifyPhoto` in `public/js/api.js` turns every status it
       * was not built against into `offline`, and telling a shopper standing in
       * an aisle with four bars that they are offline is the class of wrong
       * answer hard rule 3 exists to stop. `says` carries the server's own
       * sentence for whoever is reading a log or a curl.
       */
      // A photograph is never sent to a model (Jamin, 2026-11-07, RULINGS "Pexi uses Gemini for
      // nothing, and photo scanning is not a shipped feature"). The phone reads the text itself
      // and uses /api/match-text.
      return json(200, {
        product: null,
        matchedBy: 'none',
        band: 'miss',
        catalogueUp: fastLookup !== null,
        failure: 'no_model_call',
        reason: 'no_model_call',
        lowConfidence: true,
        confidenceReasons: ['no_answer:no_model_call'],
        offerManualEntry: true,
        says: 'Photographs are not sent to a model.',
      });
    }

    if (url.pathname === '/api/price') {
      /*
       * THE PRICE SHEET SHOWS THE SAME ONE CALL THE SCAN MADE. Beta gap items
       * 2 and 3. Shin's own price engine is not run here any more (Jamin: "Shin
       * will not run its own pricing system"), and no median, placement or
       * verdict is computed on this server: they are Gemini's, inside the
       * answer the scan already holds. The body's `scanId` and `priceQuery`
       * (echoed by the scan) find that answer; when there is none (a server
       * restart, or a price asked about something nobody scanned) this route
       * makes the one call itself.
       *
       * `askingCents` (or `shelfPriceCents`) and `thresholds` are read only for
       * that fallback call. If the scan was made without a shelf price, the
       * answer has no placement for it and says so (`shelfPriceLate`); a
       * second call to add one would break "one call per scan", which is
       * Jamin's call to change, not this route's.
       */
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const q = body as Record<string, unknown>;
      const pricedScan = Number(q.scanId);
      const scanKnown = Number.isInteger(pricedScan) && pricedScan > 0;
      if (scanKnown) scanForLog = pricedScan;
      const echo = q.priceQuery && typeof q.priceQuery === 'object' ? (q.priceQuery as Record<string, unknown>) : null;
      const textOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
      const searchText = textOf(echo?.text) ?? textOf(q.text);
      // Item 2: canonicalized so this route's cache key (item 1) matches the
      // one `/api/identify` wrote under. Falls back to the raw reading when
      // it cannot be validated, rather than refusing: unlike `/api/identify`,
      // this route has never refused a request over the shape of its input.
      const rawSearchGtin = textOf(echo?.gtin) ?? textOf(q.gtin);
      const searchGtin = rawSearchGtin ? (canonicalGtin(rawSearchGtin) ?? rawSearchGtin) : rawSearchGtin;
      if (!searchText && !searchGtin && !scanKnown) {
        // A refusal is a 200 here, as it always was on this route: it is a
        // correct answer about the input, and a client that treats it as an
        // error retries around it.
        return json(200, { kind: 'gemini', reason: 'nothing_to_price', lowConfidence: true, confidenceReasons: ['no_query'] });
      }
      const pricedDevice =
        typeof q.deviceId === 'string' && q.deviceId.trim() !== '' ? q.deviceId.trim() : UNATTRIBUTED;
      if (!owns(pricedDevice)) return notYours();
      deviceForLog = pricedDevice;

      // A typed name is answered from Pexi's own data; nothing else here calls a model for a price
      // (Jamin, 2026-11-07, RULINGS "Pexi uses Gemini for nothing"). The `kind: 'gemini'` word is
      // only the name the phone app reads this answer under.
      const row = scanKnown ? getScan(pricedScan) : null;
      if (!searchGtin && searchText && (row === null || row.kind === 'text')) {
        const own = await typedFromOwnData(
          searchText,
          pricedDevice,
          telemetryFrom(q),
          locationFor(pricedDevice, q.cell, q.storeId, q.storeName),
          Date.now(),
          row !== null && row.device_id === pricedDevice ? pricedScan : null,
          {
            shopper: shopperFrom(q.askingCents ?? q.shelfPriceCents, q.thresholds),
            market: marketOfContext(contextFrom((key) => q[key])),
            askRange: claudeRangeAsk(req),
          },
        );
        if (typeof own.scanId === 'number') scanForLog = own.scanId;
        return json(200, { ...own, kind: 'gemini' });
      }
      return json(200, { kind: 'gemini', failure: 'no_model_call', lowConfidence: true, confidenceReasons: ['no_answer:no_model_call'] });
    }

    /*
     * A price somebody read off a tag with their own eyes.
     *
     * POST, and the only write in this API. It is the whole of the correction
     * loop's server side: what lands here is read back by the spine's
     * corrections source on the next verdict for the same product, so this route
     * is the difference between the mascot's "counts once a second tag agrees"
     * being a mechanism and being a sentence.
     *
     * TWO HUNDRED FOR A REFUSED CORRECTION, the same rule /api/price states for a
     * refused verdict: a correction we decline to store because the shop is
     * missing or the price is not a number is a correct answer about the input,
     * not a server failure, and a client that treats it as one will retry around
     * the validation forever. The body says `stored: false` and carries the
     * sentence, which is what the client queue reads to decide between dropping
     * the item and sending it again.
     *
     * IDEMPOTENT ON `clientId`. The client generates it and re-sends anything it
     * has no acknowledgement for, because the place this feature is used is a
     * supermarket aisle and the network there is the worst one the product will
     * ever see. Without that key, one price read once becomes three witnesses
     * agreeing with each other.
     *
     * This route makes no judgement about the number. It validates shape, stores
     * the row, and stops. Every rule about whether a price counts lives in the
     * spine, per this file's own standing constraint.
     */
    if (url.pathname === '/api/correction') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const c = body as Record<string, unknown>;
      const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

      const clientId = str(c.clientId);
      const deviceId = str(c.deviceId);
      if (clientId === null || deviceId === null) {
        return json(200, { stored: false, why: 'a correction needs its own id and the device it came from' });
      }
      deviceForLog = deviceId;
      // Item 3: a price is filed only as the device it says it came from.
      if (!owns(deviceId)) return notYours();

      /*
       * THE SCAN THIS PRICE IS ABOUT. Plan item 7c.
       *
       * When the client sends an id, that is the scan, full stop. The
       * device-and-code lookup below stays as the fallback and nothing else:
       * it is what a client built before today uses, and it is a guess -- "the
       * last scan this device made of this product" -- which is right almost
       * always and silently wrong in the case that matters (two scans of the
       * same thing, a correction typed about the first).
       */
      const sentScanId = Number(c.scanId);
      const scanRow = Number.isInteger(sentScanId) && sentScanId > 0 ? getScan(sentScanId) : null;
      // Item 3: and only that device may change its scan's price or mark it wrong.
      if (scanRow && scanRow.device_id !== deviceId) return notYours();
      if (scanRow) scanForLog = scanRow.id;

      /*
       * A CORRECTION WITH NO PRODUCT ON IT. The defect in plan item 19d, and
       * the scan id is what fixes it rather than merely reports it.
       *
       * What went wrong: a correction is filed under the most specific key it
       * has, and `subjectOf` in price/src/corrections.ts will happily fall back
       * to `text:<whatever was on screen>` when the body carries no barcode and
       * no product id. It stores, the route answers `stored: true`, and the
       * tester sees the price accepted. But `correctionsFor` -- the only reader,
       * the one the spine calls on every verdict -- takes a code and a product
       * id and returns nothing at all when both are null. It cannot match a
       * text subject and never will. So that price was accepted, kept, backed
       * up, and can never appear in any verdict for the rest of its life.
       *
       * It is not a rare shape either: it is what the corrections screen sends
       * for anything the catalogue refused, which is precisely the case where a
       * tester is most motivated to type a price in.
       *
       * The fix is in two halves. First, fill the identity in from the scan
       * the correction is about, which is why this sits under the scan lookup:
       * a scan that named a product carries the code, and the client not
       * echoing it back is a client detail, not a missing fact. Second, when
       * there is still no code and no product id after that, refuse -- in the
       * route's documented shape, a 200 with `stored: false` and a sentence,
       * which the client queue reads as "drop it" rather than retrying forever.
       * Refusing is better than storing because the person finds out now,
       * while they are standing in front of the tag.
       */
      const code = str(c.code) ?? scanRow?.resolved_code ?? null;
      const productId = str(c.productId);
      const label = str(c.label) ?? scanRow?.resolved_label ?? null;
      if (code === null && productId === null) {
        /*
         * A PRICE WITH NO PRODUCT, RECORDED AS AN OBSERVATION. Added
         * 2026-09-13 for "type the price when the barcode is not visible".
         *
         * The refusal above stands and is not weakened: a price with no code
         * and no product id still may not enter the corrections store, for
         * exactly the reason the comment above gives -- `correctionsFor` takes
         * a code and a product id, so a text-subject correction is accepted
         * and then unreadable forever. Nothing about that has changed.
         *
         * What has changed is that there is now a second, honest home for the
         * number. A photo that could not be identified STILL WROTE A SCAN ROW
         * (`/api/identify/photo` records on its failure paths too, on purpose)
         * and still returned that row's id, and `scan.typed_price_cents` is a
         * column that exists for precisely this -- migration 2, item 9c, "the
         * price somebody typed off the tag for this scan". So when the body
         * names a real scan and carries a real price, the price goes on that
         * row, beside the photo and the store, and the route says so.
         *
         * IT IS NOT A CORRECTION AND IT DOES NOT PRETEND TO BE ONE. Nothing
         * here files a shopper report (`fileTypedReport`), so this number never becomes evidence
         * in anybody's verdict; it is an observation, readable by the scan log
         * and by the person who took it, and that is the whole claim. The card
         * the shopper sees says the same thing.
         *
         * `stored: true` because the server HAS it. The client queue's whole
         * contract is that `stored` means stop resending, and a row the server
         * has written is not a row to resend.
         */
        const observedCents = typeof c.priceCents === 'number' ? Math.round(c.priceCents) : Number.NaN;
        if (scanRow && Number.isFinite(observedCents) && observedCents > 0) {
          const observedWhere = locationFor(deviceId, c.cell, c.storeId, c.storeName);
          updateScan(scanRow.id, {
            typedPriceCents: observedCents,
            cell: observedWhere.cell ?? undefined,
            storeId: observedWhere.storeId ?? undefined,
            storeName: observedWhere.storeName ?? undefined,
          });
          return json(200, { stored: true, observation: true, scanId: scanRow.id });
        }
        return json(200, {
          stored: false,
          why: 'that price has no product attached to it, so nothing could ever read it back. Scan the item first, then type the price.',
        });
      }

      const kind = c.kind === 'promotional' ? 'promotional' : 'regular';
      // Requirement 5.2: every price on this route is typed by hand (the
      // correction screen, "Report a wrong price", the price-only card), and the
      // server marks it a typed shopper report in `fileTypedReport`. Nothing the
      // body says about its own source (`capture`, `shopperReport`) is read.
      const result = fileTypedReport({
        clientId,
        deviceId,
        code,
        productId,
        label,
        category: str(c.category),
        seller: typeof c.seller === 'string' ? c.seller : '',
        priceCents: typeof c.priceCents === 'number' ? Math.round(c.priceCents) : Number.NaN,
        kind,
        // The client's own date, not the server's. A correction queued in an
        // aisle with no signal and flushed the next morning is evidence about
        // the day the tag was read, and dating it on arrival would quietly
        // refresh stale prices every time a phone came back online.
        seenOn: str(c.seenOn) ?? new Date().toISOString().slice(0, 10),
        // D-059: the witness is the invite this request carried, not the device id the body names.
        witness: reportWitness(req.headers[INVITE_HEADER]),
      });

      /*
       * A stored correction marks the scan it corrects.
       *
       * Decision 44's rule lives in `scans.ts`: a scan a person had to correct
       * is a scan we got wrong, so it stops counting as answered and stops
       * counting against their free week. That rule was written and nothing
       * ever set the flag it reads, so every wrong answer this product has
       * given still counts in its own favour. It does not from here.
       *
       * A correction with no matching scan is normal, not a fault: a price
       * typed on the corrections screen for a product scanned before scans
       * were written down, or on another device, has nothing to point at. It
       * is still stored as a price; only the marking is skipped.
       */
      const correctedCode = code;
      /*
       * ONLY A FRESH STORE MARKS A SCAN. A retry -- the aisle-with-no-signal
       * case the client id exists for -- used to reach here too, because
       * `recordCorrection` reported it with the same shape as a first store.
       * The scan marked the first time no longer reads `answered`, so the
       * second lookup found the device's PREVIOUS scan of the same product and
       * marked that one wrong: corrections inflated, the named rate deflated,
       * and a correct answer stopped being metered, all from one resend.
       */
      if (result.ok && !result.alreadyStored && correctedCode) {
        // The id the client sent, or the guess. Plan item 7c: by id when
        // present, the last-answered lookup only when it is not.
        const scanId = scanRow?.id ?? lastAnsweredScan(deviceId, correctedCode);
        if (scanId !== null) correctScan(scanId, correctedCode);
      }

      /*
       * THE TYPED PRICE, ON THE SCAN ROW. Plan item 9c, and 11c for the store.
       *
       * The correction itself lives in the corrections database, which is the
       * spine's evidence store and is not this package's. What goes here is the
       * link: the price a person typed for THIS scan, and the shop they were
       * in. Without it, the complete scan record has a hole exactly where the
       * most valuable thing a tester does is recorded.
       *
       * Written on a retry as well as on a fresh store, unlike the marking
       * above. The marking must not run twice because it moves an outcome; this
       * writes the same values to the same row, which is the definition of
       * something a resend may do.
       */
      if (result.ok && scanRow) {
        const priceCents = typeof c.priceCents === 'number' ? Math.round(c.priceCents) : null;
        const typedWhere = locationFor(deviceId, c.cell, c.storeId, c.storeName);
        updateScan(scanRow.id, {
          typedPriceCents: Number.isFinite(priceCents) ? priceCents : null,
          cell: typedWhere.cell ?? undefined,
          storeId: typedWhere.storeId ?? undefined,
          storeName: typedWhere.storeName ?? undefined,
        });
      }

      return result.ok
        ? json(200, { stored: true, id: result.id })
        : json(200, { stored: false, why: result.why });
    }

    /*
     * The scan log, read back as the figures the vision asks for.
     *
     * `docs/the-vision.md` says of three of its four Want-and-Reliance figures
     * "Nothing measures this today", and names the cause on one of them: the
     * scan record has no reader. This is the reader, and it is a route rather
     * than a script because the numbers are shown to the person on the profile
     * screen. `deviceId` adds that person's own week to the answer; without it
     * the reply is about the whole log.
     */
    if (url.pathname === '/api/scans') {
      /*
       * D-156, D-157: a device's own week only for that device, and the
       * whole-log reply only for the admin token. Without a device this used
       * to hand fleet-wide figures to anybody with the invite; the phone
       * always sends its id, so nothing on a screen asks for that shape.
       */
      const scansDevice = url.searchParams.get('deviceId')?.trim() || '';
      if (scansDevice === '') {
        if (!adminAllows(req.headers[ADMIN_HEADER])) return json(400, { error: 'deviceId is required' });
        return json(200, summariseScans(undefined));
      }
      if (!owns(scansDevice)) return notYours();
      /* D14 (2026-10-07): a device is told about itself only. `summariseScans`
         carries every device's counts, so it never answers a request that
         merely names a device, bound or not. */
      return json(200, summariseDeviceScans(scansDevice));
    }

    /*
     * WAS THAT ANSWER ANY GOOD. Plan item 8b.
     *
     * POST, like every other write in this API, and for the reason stated on
     * `/api/correction`: this server routes on pathname alone and every write
     * it already has is a POST. A PUT here would be the only one and would buy
     * nothing, since the overwrite is the schema's job (the table's key is the
     * scan id) rather than the verb's.
     *
     * A 400 WITHOUT A VALID SCAN ID, and this is the one place in the API
     * where a refusal is a 4xx rather than a 200 with a sentence. The
     * difference is who is wrong. A refused correction is a correct answer
     * about a person's input (no shop, a price that is not a number) and the
     * client should drop it. A rating with no scan id is a CLIENT that did not
     * keep the id it was given in the identify response, which is a bug to
     * find in a log, not a sentence to put on a screen.
     */
    if (url.pathname === '/api/scan-rating') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const r = body as Record<string, unknown>;
      const deviceId = typeof r.deviceId === 'string' ? r.deviceId.trim() : '';
      if (deviceId === '') return json(400, { error: 'deviceId is required' });
      if (!owns(deviceId)) return notYours();
      deviceForLog = deviceId;
      const ratedScan = Number(r.scanId);
      if (!scanExists(ratedScan)) {
        return json(400, { error: 'scanId must be the id of a scan this server recorded' });
      }
      scanForLog = ratedScan;
      // D-159: a device rates its own scans. Thumbs are how accuracy is
      // measured during the beta, so a thumb on somebody else's scan is noise.
      if (getScan(ratedScan)?.device_id !== deviceId) return notYours();
      if (!isRating(r.rating)) return json(400, { error: "rating must be 'up' or 'down'" });
      // A reason that is not one of the four is dropped rather than refused.
      // It is a client sending a chip this server has not shipped yet, and
      // losing the thumb over it would lose the signal we were actually given.
      const reason = isRatingReason(r.reason) ? r.reason : null;

      const stored = rateScan({ scanId: ratedScan, deviceId, rating: r.rating, reason });
      if (!stored) return json(200, { stored: false, why: 'that rating could not be written down' });
      recordEvent({ deviceId, type: 'thumbs', payload: { scanId: ratedScan, rating: r.rating, reason } });
      return json(200, { stored: true });
    }

    /*
     * The undo behind the four-second window on the phone. Plan item 8c.
     *
     * A POST to its own path rather than a DELETE, because this file routes on
     * pathname and every write in it is a POST; a DELETE would be the only
     * request in the product that needs a different method on the same path,
     * for an operation the client already sends as a normal write.
     *
     * DELETING NOTHING IS SUCCESS. The client's question is "is it gone", and
     * a double-tapped undo asking twice must not read as a failure to a queue
     * that would then retry it.
     */
    if (url.pathname === '/api/scan-rating/delete') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const r = body as Record<string, unknown>;
      const deviceId = typeof r.deviceId === 'string' ? r.deviceId.trim() : '';
      if (deviceId === '') return json(400, { error: 'deviceId is required' });
      deviceForLog = deviceId;
      const ratedScan = Number(r.scanId);
      if (!Number.isInteger(ratedScan) || ratedScan <= 0) {
        return json(400, { error: 'scanId must be the id of a scan this server recorded' });
      }
      scanForLog = ratedScan;
      if (!owns(deviceId)) return notYours();
      // D-159: only the device that gave the thumb can take it back.
      const standing = ratingFor(ratedScan);
      if (standing && standing.device_id !== deviceId) return notYours();
      const deleted = deleteRating(ratedScan);
      if (deleted) recordEvent({ deviceId, type: 'thumbs_undo', payload: { scanId: ratedScan } });
      return json(200, { deleted });
    }

    /*
     * WHAT THIS DEVICE HAS AGREED TO. Plan item 6c.
     *
     * Two shapes on one path: GET reads, POST writes. Both default to false,
     * and a device that has never answered reads exactly the same as a device
     * that answered no, which is the only honest default for a question nobody
     * has been asked yet.
     *
     * THE REFUSAL THIS BACKS IS NOT HERE. It is in `locationFor` and in the
     * photo branch of `/api/identify/photo`, which is the point: a consent
     * route that stores a flag nothing reads is the shape of privacy theatre.
     * The two readers are named in `consent.ts`.
     */
    if (url.pathname === '/api/consent') {
      if (req.method === 'GET') {
        const deviceId = url.searchParams.get('deviceId')?.trim() ?? '';
        if (deviceId === '') return json(400, { error: 'deviceId is required' });
        if (!owns(deviceId)) return notYours();
        return json(200, readConsent(deviceId));
      }
      if (req.method !== 'POST') return json(405, { error: 'GET or POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const k = body as Record<string, unknown>;
      const deviceId = typeof k.deviceId === 'string' ? k.deviceId.trim() : '';
      if (deviceId === '') return json(400, { error: 'deviceId is required' });
      // D-155: the consent record the photo store checks is written only by its own device.
      if (!owns(deviceId)) return notYours();
      deviceForLog = deviceId;
      /*
       * ANYTHING THAT IS NOT LITERALLY `true` IS NO. Not truthiness: a missing
       * field, a string, a 1, an object all read as no. Consent is the one
       * place in this server where a client bug must fail towards keeping
       * less, and `photos: "false"` is a real thing a client sends.
       */
      const photos = k.photos === true;
      const location = k.location === true;
      const stored = writeConsent(deviceId, photos, location);
      if (!stored) {
        // Reported rather than swallowed. A person who just turned photo
        // consent on and was told nothing would go on believing their photos
        // are being kept when they are not, and the reverse is worse.
        return json(200, { stored: false, why: 'that choice could not be written down, so nothing changed' });
      }
      recordEvent({ deviceId, type: 'consent_change', payload: { photos, location } });
      return json(200, { stored: true });
    }

    /*
     * The event log's door. Plan item 10.
     *
     * ONE EVENT PER REQUEST HERE, a batch on the door below. Six testers on a
     * home network were nowhere near the volume that made batching worth the
     * partial-failure semantics it brings, and this route is kept exactly as
     * it was for the handful of direct callers that still fire one event at a
     * time (`consent-actions.js`, `eye-attach.js`). `track.js`, added
     * 2026-09-14 to collect everything the client does, is a different shape
     * of caller -- app opens, every tap, screen views -- and forcing that
     * through one request per event would be a request per tap.
     *
     * A DROPPED EVENT IS A 200 WITH `stored: false`, never a 500. Logging is
     * ours; the person's request was fine, and a client that treats a failed
     * event as an error will retry a log line in a loop.
     */
    if (url.pathname === '/api/event') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const e = body as Record<string, unknown>;
      const deviceId = typeof e.deviceId === 'string' ? e.deviceId.trim() : '';
      const type = typeof e.type === 'string' ? e.type.trim() : '';
      if (deviceId === '') return json(400, { error: 'deviceId is required' });
      if (type === '') return json(400, { error: 'type is required' });
      // D-158: an event is filed only under the device that sent it.
      if (!owns(deviceId)) return notYours();
      deviceForLog = deviceId;
      const payload = serialisePayload(e.payload);
      if ('why' in payload) return json(400, { error: payload.why });
      const id = recordEvent({ deviceId, type, payload: e.payload });
      return json(200, id === null ? { stored: false } : { stored: true });
    }

    /*
     * The event log's other door: `track.js`'s queue, flushed every five
     * seconds and on every tab hide. Up to `MAX_EVENTS_PER_BATCH` events in
     * one request, each one exactly the shape `/api/event` above takes one
     * of, and each one still runs through `recordEvent` and `serialisePayload`
     * one at a time -- there is no bulk insert here, only one request instead
     * of two hundred.
     *
     * PARTIAL FAILURE IS THE NORMAL CASE AND IS NOT AN ERROR. A batch is a
     * bundle of independent facts, not a transaction: one event with a bad
     * shape (a client bug, a future field this build does not know) must never
     * cost the other hundred and ninety-nine their place in the log. The
     * per-event cap on `MAX_JSON_BODY_BYTES` style refusals is not applied
     * per-item either, for the same reason `recordEvent` itself never throws --
     * a malformed item is silently skipped rather than answered with detail
     * that would have to be matched back to a position in an array nothing
     * client-side keeps an index into.
     *
     * THE BODY CAP IS SIZED FOR THE BATCH, not for one event: two hundred
     * events at up to four kilobytes of payload each (`events.ts`'s own cap)
     * is 800 KB in the worst case, so the door is a full megabyte rather than
     * the 8 KiB every other JSON route takes.
     */
    if (url.pathname === '/api/events/batch') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req, MAX_EVENTS_BATCH_BODY_BYTES);
      if (body === TOO_LARGE) return refuseTooLarge(MAX_EVENTS_BATCH_BODY_BYTES);
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const events = (body as Record<string, unknown>).events;
      if (!Array.isArray(events)) return json(400, { error: 'events must be an array' });
      const batch = events.slice(0, MAX_EVENTS_PER_BATCH);
      let stored = 0;
      let dropped = 0;
      for (const raw of batch) {
        if (!raw || typeof raw !== 'object') { dropped += 1; continue; }
        const e = raw as Record<string, unknown>;
        const deviceId = typeof e.deviceId === 'string' ? e.deviceId.trim() : '';
        const type = typeof e.type === 'string' ? e.type.trim() : '';
        if (deviceId === '' || type === '') { dropped += 1; continue; }
        // D-158: dropped like any other bad item, not a refusal of the batch.
        if (!owns(deviceId)) { dropped += 1; continue; }
        deviceForLog = deviceId;
        const payload = serialisePayload(e.payload);
        if ('why' in payload) { dropped += 1; continue; }
        const id = recordEvent({
          deviceId,
          type,
          payload: e.payload,
          createdAt: typeof e.createdAt === 'string' ? e.createdAt : undefined,
        });
        if (id === null) dropped += 1;
        else stored += 1;
      }
      return json(200, { stored, dropped, received: events.length });
    }

    /*
     * WHICH SHOPS ARE NEAR THIS SQUARE. Plan item 11b.
     *
     * GET, and it stores nothing at all. What comes in is a coarse cell and
     * what goes out is a fact about the world (OpenStreetMap's shops), so
     * there is nothing here for the consent flag to gate: the flag gates
     * WRITING a cell onto a scan row, which happens on the identify and
     * correction routes and nowhere else.
     *
     * AN EMPTY LIST IS A 200, the same rule `/api/alternatives` states. A cell
     * with no mapped shops in it, an Overpass outage and a timeout are all the
     * same answer to the screen -- type the price without a store -- and a
     * client that treated them as errors would block a correction over a
     * nicety.
     */
    if (url.pathname === '/api/stores') {
      const cell = parseCell(url.searchParams.get('cell'));
      if (!cell) {
        return json(400, { error: 'cell is required, as "lat,lon" rounded to two decimal places' });
      }
      const stores = await storesNear(cell, storeFetcherDouble ? { fetch: storeFetcherDouble } : {});
      return json(200, { stores });
    }

    /*
     * THE SHOPS SHIN'S OWN PRICE DATA ALREADY NAMES (walkthrough D03).
     *
     * GET, no location, nothing about anybody: it is a list of chain names read
     * from the price file, so the shop picker has something to show the instant
     * it opens and never waits on OpenStreetMap. The client bundles the same
     * list as a floor; this is the fresher copy it swaps in when it arrives.
     */
    if (url.pathname === '/api/store-chains') {
      return json(200, { chains: chainsFromData(defaultPricesPath(), { named: PRICE_MATCH_POLICIES.map((p) => p.displayName) }) });
    }

    /*
     * THE SHELF PRICE THE SHOPPER TYPED ON THE PAD (walkthrough D05).
     *
     * Requirement 5.1 puts the typed shelf price on every scan's record and 5.2
     * turns it into an observed price marked as a shopper report. The pad's
     * number used to stay on the phone, so `typed_price_cents` was NULL for
     * every scan until somebody posted a correction by hand.
     *
     * Two things are written and the answer says which: the number on the scan
     * row (always, when the scan is this device's own), and an observed price
     * in the corrections store (only when a shop is named and the scan resolved
     * a product, because a price with no shop or no product can never be read
     * back). `stored: true` means the scan row has it; `report.stored` says
     * whether the observed price exists, with the reason when it does not.
     * Nothing here judges the number, and the range does not move for it:
     * requirement 5.3 keeps a lone shopper report out of a range.
     */
    if (url.pathname === '/api/scan-price') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const p = body as Record<string, unknown>;
      const deviceId = typeof p.deviceId === 'string' ? p.deviceId.trim() : '';
      if (deviceId === '') return json(400, { error: 'deviceId is required' });
      if (!owns(deviceId)) return notYours();
      deviceForLog = deviceId;
      const priceScan = Number(p.scanId);
      if (Number.isInteger(priceScan) && priceScan > 0) scanForLog = priceScan;
      const seenOn = typeof p.seenOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.seenOn) ? p.seenOn : new Date().toISOString().slice(0, 10);
      const res = recordShelfPrice({
        deviceId,
        scanId: priceScan,
        priceCents: typeof p.priceCents === 'number' ? p.priceCents : Number.NaN,
        storeName: typeof p.storeName === 'string' ? p.storeName : null,
        code: typeof p.code === 'string' ? p.code : null,
        today: seenOn,
        // D-059: the witness is the invite this request carried, not the device id the body names.
        witness: reportWitness(req.headers[INVITE_HEADER]),
      });
      return json(200, res);
    }

    /*
     * THE SHOPPER'S OWN CALL, requirement 5.1 ("the shopper's own good/bad/great
     * call") and 5.8 (only calls given before the verdict was shown count).
     * One of great, good, reasonable or bad, on one of this device's own scans,
     * once: a second call is refused and the first is kept (3.9). A refusal is a
     * 200 with `stored: false` and why, the shape `/api/scan-price` answers with.
     */
    if (url.pathname === '/api/scan-call') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const p = body as Record<string, unknown>;
      const deviceId = typeof p.deviceId === 'string' ? p.deviceId.trim() : '';
      if (deviceId === '') return json(400, { error: 'deviceId is required' });
      if (!owns(deviceId)) return notYours();
      deviceForLog = deviceId;
      const callScan = Number(p.scanId);
      if (!Number.isInteger(callScan) || callScan <= 0) return json(200, { stored: false, why: 'that scan is not one this server recorded' });
      scanForLog = callScan;
      return json(200, recordShopperCall(deviceId, callScan, p.call, p.beforeVerdict === true));
    }

    /*
     * A PICK, requirement 5.1 ("picks"): which product the shopper chose from a
     * list one of their scans offered (the typed name's three matches, "not
     * this?"). Append-only; this device's own scans only.
     */
    if (url.pathname === '/api/scan-pick') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const p = body as Record<string, unknown>;
      const deviceId = typeof p.deviceId === 'string' ? p.deviceId.trim() : '';
      if (deviceId === '') return json(400, { error: 'deviceId is required' });
      if (!owns(deviceId)) return notYours();
      deviceForLog = deviceId;
      const pickScan = Number(p.scanId);
      if (!Number.isInteger(pickScan) || pickScan <= 0) return json(200, { stored: false, why: 'that scan is not one this server recorded' });
      scanForLog = pickScan;
      return json(200, recordPick(deviceId, pickScan, p.code, p.source));
    }

    /*
     * IS IT UP. Plan item 39c, first half.
     *
     * The one route that answers without an invite code (see `invite.ts`), so
     * it carries nothing worth having: whether the process is alive, how long
     * it has been alive, and whether the scan log and the catalogue attached.
     * No counts, no device, no scan.
     *
     * WHY THOSE TWO FLAGS AND NOTHING ELSE. A ping that only says the process
     * is running is green through the exact outage this beta is most likely to
     * have -- the Mac reboots, the server comes up, the external disk with the
     * catalogue on it did not mount, and every scan answers "we have not seen
     * this one" while the monitor says fine.
     */
    if (url.pathname === '/api/health') {
      const scans = openScanStore();
      return json(200, {
        ok: true,
        uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
        startedAt: new Date(STARTED_AT).toISOString(),
        scanLog: scans.db !== null,
        catalogueUp: fastLookup !== null,
        // A2 and A5: "on", or exactly "category check off"; faults counted by kind.
        ...categoryGuard.health(),
        // A7: every fault that used to be swallowed. Health stays ok: the shopper is served.
        ...faultHealth(),
        // D-231: whether Pexi's own prices can answer at all, and how many scans a broken prices file touched.
        ...pricesHealth(),
      });
    }

    /*
     * HOW LONG THE ANSWERS TOOK, by day and by kind. Plan item 39c, second half.
     *
     * Behind the invite code, unlike the ping, because this one is operational
     * detail about a running service rather than a liveness bit.
     *
     * p95 rather than an average, and by kind rather than across all three
     * paths: the reasoning is in `latency.ts` and it comes down to the mean of
     * a barcode read and a vision call describing no scan anybody performed.
     */
    if (url.pathname === '/api/latency') {
      const daysRaw = Number(url.searchParams.get('days') ?? '7');
      const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), 90) : 7;
      return json(200, { days, latency: dailyLatency(days) });
    }

    /*
     * The ODbL and Icecat credits this app is required to show somewhere.
     * Frozen list, not a query -- see app/src/attribution.ts for why.
     */
    if (url.pathname === '/api/attribution') {
      return json(200, { sources: ATTRIBUTION });
    }

    if (url.pathname === '/api/pack-version') {
      const scope = packScope(url.searchParams.get('scope'));
      if (!scope) return json(400, { error: 'scope must be grocery or canada' });
      const version = await packVersion(scope);
      // The same sentence servePack uses for the same state, in JSON, from a
      // JSON endpoint. A pack that was never built is a fact about this
      // deployment, not a mistyped URL, and the two used to be indistinguishable.
      if (!version) return json(404, { error: 'pack not built', scope });
      return json(200, version);
    }
    if (url.pathname === '/api/pack') {
      const scope = packScope(url.searchParams.get('scope'));
      if (!scope) return json(400, { error: 'scope must be grocery or canada' });
      return servePack(req, res, scope);
    }

    if (url.pathname.startsWith('/api/')) return json(404, { error: 'no such endpoint' });

    // Static. Path is normalised and then confined to public/ before any read.
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const resolved = join(PUBLIC_DIR, normalizePath(requested));
    if (!resolved.startsWith(PUBLIC_DIR.replace(/[\\/]$/, '') + sep)) {
      return json(403, { error: 'outside the public directory' });
    }
    // Item 6: a source map left in the folder by an older build is never served.
    if (extname(resolved) === '.map') return json(404, { error: 'no such file' });
    const file = await readFile(resolved);
    res.writeHead(200, {
      'content-type': TYPES[extname(resolved)] ?? 'application/octet-stream',
      'cache-control': longLived(resolved) ? 'public, max-age=31536000, immutable' : 'no-store',
    });
    res.end(file);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    const missing = code === 'ENOENT' || code === 'EISDIR';
    /*
     * AN API ROUTE THAT THROWS ANSWERS IN JSON, AND NAMES ITS STATE.
     *
     * This catch was written for missing static files, and every `/api/`
     * route that threw landed in it too: `text/plain: not found` from a JSON
     * endpoint, indistinguishable from a mistyped URL. D-051 patched one route
     * by hand; this is the mechanism that produced it. The reachable case
     * today is `/api/alternatives` on a machine with a catalogue and no prices
     * database: `lookupPrices` throws SQLITE_CANTOPEN and the client got a
     * plain-text 500 it could not parse.
     *
     * The message stays out of the body. It is an internal string on the
     * screen of somebody who cannot act on it (D-011); it goes to the console,
     * where somebody can.
     */
    if (url.pathname.startsWith('/api/')) {
      /*
       * STRUCTURED, AND CARRYING THE SCAN ID. Plan item 39a.
       *
       * This used to be `console.error(path, err)`: a line of English and a
       * stack, from which the one question a beta actually asks -- a tester
       * says it broke on the cereal, and the cereal's scan row is right there
       * with an id -- could not be answered by searching. `scanForLog` is set
       * by every route that wrote or was handed a row, so the line joins.
       */
      if (!missing) {
        logError({ where: url.pathname, scanId: scanForLog, deviceId: deviceForLog, err });
      }
      res.writeHead(missing ? 404 : 500, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(
        JSON.stringify({
          error: missing
            ? 'something this endpoint reads is not on this machine'
            : 'this endpoint could not answer just now',
        }),
      );
      return;
    }
    if (missing) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('server error');
    console.error(err);
  }
});

/**
 * The scan log, opened at boot rather than on the first scan.
 *
 * Opening it lazily would move the one thing that can fail here (a directory
 * that will not create, a locked file) into the middle of somebody's first
 * scan, where the only place it could be reported is a screen that is trying
 * to answer them. Opened here, a failure is a line on the console at start-up
 * and every later write is a counted drop, which is the contract scans.ts was
 * written to keep.
 */
const SCAN_DB = settings.SHIN_SCANS() ?? fileURLToPath(new URL('./data/scans.db', import.meta.url));

/**
 * The startup guard. Plan item 1i, and plan item 19c as a tester-visible
 * defect.
 *
 * CHECKED BEFORE THE PORT IS OPENED, because the whole point is not to come up
 * half-working. A server listening on a hostname six people were given, with
 * its catalogue path pointing at a disk that did not mount, answers "we have
 * not seen this one" to every barcode they scan, and the only sign anything is
 * wrong is on the tester's screen.
 *
 * The rule for what counts as a missing database is in `startup.ts` and it is
 * narrow on purpose: a file missing inside a folder that exists is a database
 * not copied yet, which every development machine in this project is, while a
 * path whose folder is not there is always a typo or an unmounted disk.
 */
const problems = startupProblems();
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error('Pexi did not start. Nothing was changed on disk.');
  process.exit(1);
}

/*
 * A TAKEN PORT IS A SENTENCE, NOT A STACK.
 *
 * Without this handler, `listen` on a port something else holds emits an
 * unhandled `error` event: nine lines of Error, errno, syscall, address and
 * stack, exit code 1, and under a process manager that is what a restart loop
 * writes to a log file every few seconds. The cause -- a second copy of this
 * server is already running -- is one of the nine and never the first.
 */
server.on('error', (err) => {
  const sentence = listenProblem(err, PORT);
  console.error(sentence ?? `Pexi could not open port ${PORT}: ${err instanceof Error ? err.message : String(err)}`);
  logError({ where: 'server.listen', err, detail: { port: PORT } });
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Pexi is running.  http://localhost:${PORT}`);
  console.log('The engine behind it knows 7 products, because 7 is what has been priced by hand.');
  const scans = openScanStore(SCAN_DB);
  console.log(
    scans.db
      ? `Scans are being written down: ${scans.path}`
      : `Scans are NOT being written down (${scans.droppedWhy}). Everything else still works.`,
  );
  if (inviteRequired()) console.log('An invite code is required on every API call.');
  // D-231: a prices file with no observation table is said here once, not only as one failure per scan.
  checkPricesAtStart(PRICES_DB_PATH);
  const plusWarning = entitlementStartupWarning();
  if (plusWarning) console.warn(plusWarning);

  /*
   * PHOTO RETENTION. Plan item 39d.
   *
   * At start and then once a day. At start because a server that was off for a
   * week has a week of photographs that are now past their date and nobody is
   * going to run a command; once a day because ninety days is the promise and
   * an hourly sweep would be reading the same rows twenty-four times to find
   * nothing.
   *
   * `unref` so the timer is not a reason this process stays alive. A server
   * with nothing else holding it open should exit, and a retention sweep
   * scheduled for tomorrow is not a reason to keep a machine running.
   */
  const sweep = () => {
    const result = sweepPhotos();
    if (result.deleted > 0) {
      console.log(`Deleted ${result.deleted} photo(s) older than the retention window (before ${result.cutoff}).`);
    }
    /*
     * GROUNDED RETENTION JOINS THE TIMER THAT ALREADY EXISTS. One timer, two
     * sweeps. A second `setInterval` would be a second thing that can be
     * removed, left unscheduled by a refactor, or forgotten on a machine where
     * only one of them got wired, and the failure would be silent: text
     * sitting past the two years Google's terms allow, with nothing on any
     * screen to say so. `grounded-retention.test.ts` reads this closure out of
     * the source and fails if either call leaves it.
     */
    const g = sweepGrounded();
    if (g.cleared > 0 || g.interimCleared > 0) {
      console.log(
        `Cleared ${g.cleared} grounded result(s) past two years (before ${g.cutoff}) and ${g.interimCleared} never shown to anybody.`,
      );
    }
    /*
     * What the privacy policy promises (src/retention.ts): usage events at 12 months, device ids off
     * scans, ratings and shopper prices at 24, request logs at 90 days. Same timer, same reason.
     */
    const kept = sweepScanData();
    const shopperPrices = sweepShopperPrices();
    if (kept.eventsDeleted > 0 || kept.deviceIdsRemoved > 0 || shopperPrices.removed > 0) {
      console.log(`Retention: deleted ${kept.eventsDeleted} usage event(s); took the device id off ${kept.deviceIdsRemoved} scan row(s) and ${shopperPrices.removed} shopper price(s).`);
    }
    const retentionFailures = [...kept.failed, ...(shopperPrices.failed ? [`corrections: ${shopperPrices.failed}`] : [])];
    if (retentionFailures.length > 0) logError({ where: 'retention.sweep', err: new Error(retentionFailures.join('; ')) });
    void sweepRequestLog().then((log) => {
      if (log.deleted > 0) console.log(`Retention: deleted ${log.deleted} request-log line(s) past 90 days.`);
      if (log.failed) logError({ where: 'retention.request_log', err: new Error(log.failed) });
    });
  };
  sweep();
  setInterval(sweep, 24 * 60 * 60 * 1000).unref();

  // Attached after the port is open, never before: the screens have to come up
  // whether or not a 3.47 GB file is sitting where this expects it.
  void attachCatalogue();
});
