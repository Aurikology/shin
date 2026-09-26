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
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize as normalizePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { priceIt } from '../spine/src/spine.ts';
import { defaultDeps } from '../spine/src/sources/registry.ts';
import { RecordedSource } from '../spine/src/sources/recorded.ts';
import { CATEGORY_RULES } from '../spine/src/categories.ts';
import type { ProductIdentity, SpineQuery } from '../spine/src/contract.ts';
import { categoryFor } from './src/category-map.ts';
import type { Candidate } from '../catalogue/src/search.ts';
import { countryCodeOf, marketFromLocation, marketPromptFields } from '../catalogue/src/market.ts';
import { normalizeStoreType } from '../catalogue/src/product-kind.ts';
import {
  createUserCatalogue,
  probeCatalogue,
  recordUserScan,
  type UserCatalogue,
} from '../catalogue/src/user-catalogue.ts';
import type { Tier } from '../identify/src/model.ts';
import type { GroundedTransport } from '../identify/src/providers/gemini-grounded.ts';
import type { AnswerBlock, GeminiRun, ScanType } from '../identify/src/providers/gemini-scan.ts';
import type { VerifierTransport } from '../identify/src/providers/price-verifier.ts';
import { sealScanAnswer, cleanUrl } from '../identify/src/providers/gemini-grounded.ts';
import { chargeSpend, usdCentsToCad, type SpendDecision } from '../identify/src/cap.ts';
import { recordCorrection } from '../price/src/corrections.ts';
import { ATTRIBUTION } from './src/attribution.ts';
import { packScope, packVersion, servePack } from './src/pack-route.ts';
import {
  correctScan,
  enrichScan,
  getScan,
  lastAnsweredScan,
  openScanStore,
  DEFAULT_PREFERENCES,
  markGeminiMath,
  markPriceVerification,
  readPreferences,
  recentCategories,
  recordGeminiCall,
  recordScan,
  updateScan,
  type ScanKind,
} from './src/scans.ts';
import { canonicalGtin } from './src/barcode.ts';
import { lookupOpenFoodFacts } from './src/open-food-facts.ts';
import {
  claimRefresh,
  recallCachedScan,
  releaseRefresh,
  rememberCachedScan,
} from './src/repeat-cache.ts';
import { recordGap, activeGapLog, openGapLog } from '../catalogue/src/gaps.ts';
import { summariseScans, UNATTRIBUTED } from './src/scan-summary.ts';
import { keepLocation, keepPhoto, readConsent, writeConsent } from './src/consent.ts';
import { deleteRating, isRating, isRatingReason, rateScan, scanExists } from './src/ratings.ts';
import { deviceFromHeaders, entitlementStartupWarning, isScanOutcome, quotaFor, recordScanOutcome, scanLimitRefusal } from './src/scan-quota.ts';
import { priceMatchLine } from './src/price-match-line.ts';
import { recordEvent, serialisePayload } from './src/events.ts';
import { parseCell, storesNear, type StoreFetcher } from './src/stores.ts';
import { INVITE_EXEMPT, INVITE_HEADER, INVITE_REFUSAL, inviteAllows, inviteRequired, inviteWho } from './src/invite.ts';
import { KeyedLimiter, addressWindows, clientAddress, codeWindows } from './src/rate-limit.ts';
import { logError } from './src/errlog.ts';
import { markScan } from './src/scan-marks.ts';
import { listenProblem, startupProblems } from './src/startup.ts';
import { estimatedCostCents, groundedScanCapChargeUsdCents } from './src/model-cost.ts';
import { recordAccess } from './src/access-log.ts';
import { handleAdmin } from './src/admin.ts';
import { recordShutterRequest, saveShutterFrame } from './src/shutter-log.ts';
import { saveShelfFrame, MAX_SHELF_FRAME_BYTES } from './src/shelf.ts';
import { savePhoto, sweepPhotos } from './src/photos.ts';
import {
  groundedModule,
  keepGroundedForOwner,
  markGroundedShown,
  sweepGrounded,
  type Grounded,
  type GroundedWire,
} from './src/grounded-record.ts';
import { dailyLatency } from './src/latency.ts';
import { defaultPricesPath, lookupOwnPrices, OWN_DATA_SOURCE, type OwnMatch } from './src/own-prices.ts';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);

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
  process.env.SHIN_CATALOGUE ?? fileURLToPath(new URL('../catalogue/data/catalogue.db', import.meta.url));

let fastLookup: { byGtin(code: string): unknown } | null = null;
let searchService: { search(q: unknown): Promise<unknown> } | null = null;
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

export function setCatalogueForTests(fake: { byGtin(code: string): unknown } | null): void {
  fastLookup = fake;
  catalogueWhyNot = fake ? 'a test double' : 'not attempted yet';
}
/**
 * The same read-only handle `fastLookup` was built from, kept so `/api/alternatives`
 * can query `product_category` directly (what `alternativesFor` needs) without
 * opening a second connection to the same file. `fastLookup` keeps its own handle
 * private, so this is the one place outside `attachCatalogue` that gets to see it.
 */
let catalogueDb: DatabaseSync | null = null;

/**
 * Write down that Shin's own catalogue did not have this barcode.
 *
 * WHY THIS EXISTS AT ALL, and it is not the plumbing. Measured 2026-09-26 across
 * all three gap logs on this machine: 102 misses over 279 hits, and NOT ONE of
 * them a barcode. The recorder was never broken -- `gaps.ts` classifies a
 * barcode miss and `test/gemini-miss-gap.test.ts` proves a barcode row gets
 * written. What was missing is the FACT. The only barcode gap this server could
 * write came from the Gemini path and means "the model could not name it", while
 * every catalogue decision needs "our catalogue does not hold it". The identify
 * route says why in its own words: "The catalogue is not consulted for a
 * barcode's answer." So that second fact was never observable, and with Gemini
 * leaving, the one path that wrote barcode gaps leaves with it.
 *
 * THIS CHANGES NO ANSWER. It looks the barcode up and writes a log row. The
 * shopper sees exactly what they saw before.
 *
 * WHAT IT COSTS, measured rather than assumed, against the real 4.13 GB
 * catalogue on 2026-09-26, 2,000 calls each after a warm-up: **0.151 ms for a
 * miss and 0.072 ms for a hit.** A miss is the dearer one because `byGtin`
 * (`catalogue/src/search.ts:998`) is NOT one lookup: it tries up to five code
 * forms, the padded and stripped EAN/UPC variants plus UPC-E, and only a miss
 * pays for all of them. Bounded and negligible beside anything else on this
 * route, but it is five statements on the server's thread, not one, and an
 * earlier version of this comment claimed otherwise.
 *
 * WHERE THE LOG FILE GOES, and this is the part that needed fixing. `recordGap`
 * opens a log lazily the first time one is needed, and its default is
 * `data/gaps.db` **relative to the current directory** (`gaps.ts:102`). Before
 * this change only a Gemini failure could trigger that first open, so the
 * cwd-relative default was rarely reached; putting a check on every barcode scan
 * would have made a stray `data/gaps.db` appear under whatever directory the
 * process happened to start in. So the path is resolved here, absolutely, beside
 * this file, which is where the server's existing log already sits. `SHIN_GAPS`
 * still wins, which is what the tests and the deployment config set.
 *
 * NO CATALOGUE MEANS NO RECORD, and that is the important half. The server is
 * required to boot and serve every screen with no catalogue attached (see the
 * comment above `CATALOGUE_DB`). In that state "we cannot look" is not "we do
 * not have it", and a logger that confuses the two fills the log with
 * fabricated misses, after which every count taken from it is wrong. So the
 * absence of a catalogue returns early and records nothing. `gemini-miss-gap.
 * test.ts` runs with no catalogue and asserts exact row counts, so if this ever
 * starts inventing misses, that file goes red.
 *
 * It never throws, for the same reason `recordGap` never does: a scan that
 * worked must not fail because its bookkeeping did.
 */
const GAPS_DB = process.env.SHIN_GAPS ?? fileURLToPath(new URL('./data/gaps.db', import.meta.url));

function noteCatalogueBarcodeMiss(gtin: string): void {
  if (!fastLookup) return;
  try {
    if (fastLookup.byGtin(gtin) !== null) return;
    if (!activeGapLog()) openGapLog(GAPS_DB);
    /*
     * `catalogueMissing` carries the fact; the note is only for a person reading
     * the log by eye. Measured in the running app 2026-09-26: the Gemini path
     * records a gap for the same barcode microseconds later, and the log's upsert
     * gives the last writer the note, so a live absent scan came back saying
     * `gemini_miss:model_client_error` with a count of 2. Both writes had landed
     * and the meaning had been overwritten by the one thing it must be told apart
     * from. The column is raised with `max` and never cleared, so write order
     * stops mattering. See the comment on MIGRATIONS in gaps.ts.
     */
    recordGap({ gtin, note: 'catalogue_miss', catalogueMissing: true });
  } catch {
    /* a lookup or a log that failed is not a reason to fail the scan */
  }
}

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
    searchService = startCatalogueService(CATALOGUE_DB) as unknown as {
      search(q: unknown): Promise<unknown>;
    };
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
      process.env.SHIN_VECTORS === 'on' ||
      (process.env.SHIN_VECTORS !== 'off' && embeddedRows > 0 && embeddedRows <= VECTOR_ROW_CEILING);

    catalogueWhyNot = '';
    console.log(
      `catalogue attached: ${n.n.toLocaleString()} products, ${ca.n.toLocaleString()} sold in Canada`,
    );
    console.log(
      vectorsOn
        ? `meaning search on (${embeddedRows.toLocaleString()} rows embedded)`
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
 * THE FREE TIER IS A TRAINING PIPELINE, AND A USER'S PHOTOGRAPH MUST NEVER
 * REACH IT.
 *
 * Google's free tier trains on what is sent to it. That is a fine trade for
 * the eval, which uses a free key against public photographs of products on
 * shelves, and it is not a trade anybody made on behalf of the person who
 * pointed their phone at their own kitchen counter. The two keys differ by one
 * environment variable, the eval and the server run from the same tree, and
 * the mistake is one shell away in both directions.
 *
 * UNDECLARED IS FREE. The first version of this guard fired only on the exact
 * string `free`, so an unset variable read as safe -- and unset is what every
 * machine in this project actually is, `.env` included, which made the guard
 * inert on exactly the machines it was written for. A safety property whose
 * default is "assume the safe case" is not a safety property, so the default
 * is now the unsafe case and `paid` is the only thing that opens the door.
 *
 * AND DECLARING THE TRUTH MUST NOT BRICK THE SERVER, which is why this is no
 * longer a refusal to start. A `free` machine that will not boot at all is a
 * machine whose operator unsets the variable to get their work back, and the
 * point of the variable, settled for the eval half in D-112, is that a run
 * NAMES which kind of key it is spending before it spends it. So the server
 * comes up, says what it is, and refuses at the one route that carries a
 * photograph. The barcode and typed paths send digits and words, never an
 * image (rule 2), so they are not the hazard and they keep working.
 */
type GeminiTier = 'paid' | 'free';

function geminiTier(env: NodeJS.ProcessEnv = process.env): { tier: GeminiTier; declared: boolean } {
  const raw = (env.SHIN_GEMINI_TIER ?? '').trim().toLowerCase();
  if (raw === 'paid') return { tier: 'paid', declared: true };
  return { tier: 'free', declared: raw === 'free' };
}

/**
 * The sentence the photo route refuses with, or null when photographs may go.
 *
 * Two different sentences because they are two different mistakes and each has
 * its own repair: a declared free key is a deliberate choice about which key
 * is in the shell, an undeclared one is a machine that has never been asked.
 * Neither claims to know whether the key is really free -- that is not
 * knowable from here -- only what this server was told and what it does about
 * being told nothing.
 */
function photoTierRefusal(env: NodeJS.ProcessEnv = process.env): string | null {
  const { tier, declared } = geminiTier(env);
  if (tier === 'paid') return null;
  if (declared) {
    return 'SHIN_GEMINI_TIER is set to free, and Google trains on everything sent to a free key, so Shin will not send a shopper\'s photograph through it. The barcode and typing it still work. Set SHIN_GEMINI_TIER=paid on a server holding a paid key, and keep the free one for the eval.';
  }
  return 'SHIN_GEMINI_TIER is not set, so this server does not know whether its Gemini key is free -- and Google trains on everything sent to a free key -- so it will not send a shopper\'s photograph. The barcode and typing it still work. Set SHIN_GEMINI_TIER to paid or free.';
}

/**
 * Thirty photo calls per device per rolling ten minutes.
 *
 * ONLY THIS ROUTE. A barcode is free and unlimited by design (it is the
 * cheapest thing in the product) and a text search costs a local index read;
 * this one costs a vision call, so it is the only one with a ceiling. Thirty
 * in ten minutes is well above a person shopping -- the capture path takes a
 * burst and sends one crop -- and well below anything that could spend the
 * daily model cap in a sitting.
 *
 * In memory on purpose, and it is stated rather than hidden: a restart forgets
 * every count, and this is one process. It is a spend guard, not a security
 * boundary, and a spend guard that needed a database to start would be a
 * reason not to have one at all. The daily cap in `identify/src/model.ts` is
 * the backstop underneath it.
 */
const PHOTO_RATE_WINDOW_MS = 10 * 60 * 1000;
const PHOTO_RATE_LIMIT = 30;
const photoCalls = new Map<string, number[]>();

function photoRateAllows(deviceId: string): boolean {
  const now = Date.now();
  const recent = (photoCalls.get(deviceId) ?? []).filter((t) => now - t < PHOTO_RATE_WINDOW_MS);
  if (recent.length >= PHOTO_RATE_LIMIT) {
    photoCalls.set(deviceId, recent);
    return false;
  }
  recent.push(now);
  photoCalls.set(deviceId, recent);
  /*
   * Devices that stopped scanning are dropped rather than kept forever. The
   * map is one entry per device that has ever posted a photo to this process,
   * and without this it is a leak with a nice name.
   */
  if (photoCalls.size > 5_000) {
    for (const [id, times] of photoCalls) {
      if (times.every((t) => now - t >= PHOTO_RATE_WINDOW_MS)) photoCalls.delete(id);
    }
  }
  return true;
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
export function resetPaidCallLimitersForTests(env: NodeJS.ProcessEnv = process.env): void {
  codeLimiter = new KeyedLimiter(codeWindows(env));
  addressLimiter = new KeyedLimiter(addressWindows(env));
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
 * One grounded lookup, described without naming Google.
 *
 * Two methods and no more, because there are exactly two places in this file
 * where a Grounded Result is allowed to appear: a barcode the catalogue does
 * not know, and the price sheet's separate section. The photo route is
 * deliberately not one of them.
 *
 * `forDevice` is on every call rather than on the provider, and that is the
 * whole shape of the thing. Google's terms say a Grounded Result is shown only
 * to the end user who submitted the prompt, so the device that asked travels
 * with the request and is sealed into the box that comes back; `toWire` throws
 * if anybody later asks for that box on behalf of a different one.
 */
export interface GroundedPriceQuery {
  readonly text?: string;
  readonly gtin?: string;
  readonly brand?: string | null;
  /** The shelf price typed, so the lookup can place it on a line. */
  readonly askingCents?: number;
  readonly sizeValue?: number | null;
  readonly sizeUnit?: string | null;
  readonly packCount?: number | null;
}

/**
 * Who a grounded answer is sealed for.
 *
 * A device that sent no id used to get no grounded lookup at all, because
 * "the end user who submitted the prompt" had no referent in the shared
 * unattributed bucket. Jamin, 2026-09-15: "don't prevent something from
 * functioning just because of legal issues". So an anonymous request gets an
 * owner of its own, for that one request: the box can be opened on the way
 * out of this response and by nobody else, and nothing is kept against the
 * shared bucket's scan rows.
 */
function groundedOwner(device: string): string {
  return device === UNATTRIBUTED ? `unattributed-request-${randomUUID()}` : device;
}

/*
 * ===========================================================================
 * THE ONE GEMINI CALL A SCAN MAKES (beta gap items 1 to 6, 12 and 14).
 * ===========================================================================
 *
 * Jamin, 2026-09-16 to 09-19: "The server will not check shins own product
 * list for now. The only thing the server will do is call gemini." One call
 * returns the product, the prices, the reviews AND the price math against the
 * user's own thresholds (`identify/src/providers/gemini-scan.ts`, and the
 * prompt in `Shin_Gemini_Pricing_Engine/`). Shin never shows its own price
 * math, and Claude is not used anywhere on this path.
 *
 * WHAT THIS REPLACED: `IdentifyStage` and the Claude identifier on the photo
 * route, the catalogue lookup in front of Gemini on the barcode route, a
 * prefetched grounded search that `/api/price` collected, and `computeGauge`
 * run over the offers. The catalogue code is untouched and stays in the repo;
 * it is simply not consulted for a scan's answer. `/api/search` and the
 * catalogue screens still use it.
 *
 * `/api/price` no longer runs Shin's price engine either: it returns the
 * answer the scan already holds (the same one call), or makes that one call
 * when nobody scanned first.
 */

type ScanModule = typeof import('../identify/src/providers/gemini-scan.ts');
let scanModule: Promise<ScanModule> | null = null;
const geminiScanModule = (): Promise<ScanModule> =>
  (scanModule ??= import('../identify/src/providers/gemini-scan.ts'));

/**
 * Loaded lazily, the same way `geminiScanModule` is, so a route that never
 * verifies a price never pays to load the module that does it.
 */
type VerifierModule = typeof import('../identify/src/providers/price-verifier.ts');
let verifierModule: Promise<VerifierModule> | null = null;
const priceVerifierModule = (): Promise<VerifierModule> =>
  (verifierModule ??= import('../identify/src/providers/price-verifier.ts'));

let geminiTransportDouble: GroundedTransport | null = null;

/**
 * TEST ONLY. There is no Gemini key on a build machine and rule 8 says the key
 * is for live phone testing alone, so every test hands the real request
 * builder and the real reader a recorded reply through this seam.
 */
export function setGeminiTransportForTests(transport: GroundedTransport | null): void {
  geminiTransportDouble = transport;
  scanned.clear();
}

let verifierTransportDouble: VerifierTransport | null = null;

/**
 * TEST ONLY, same reason as `setGeminiTransportForTests`: no test may reach a
 * real retailer page, so every test that exercises `schedulePriceVerify` hands
 * it a recorded reply through this seam. Production gets the real `fetch`
 * (see `schedulePriceVerify`), never this double.
 */
export function setVerifierTransportForTests(transport: VerifierTransport | null): void {
  verifierTransportDouble = transport;
}

/**
 * The daily spend cap stands in front of every Gemini call that spends money
 * (identify/src/cap.ts, Jamin's earlier call), CHANGED 2026-09-19 (audit rows 16
 * and 32): crossing the soft cap does NOT refuse a scan. The call goes out, the
 * scan row gets `over_cap = 1` and a loud line is logged (see
 * `flagOverCap`). Only the hard runaway ceiling (10 times the soft cap) returns
 * a marked, kind, retryable answer instead of calling Gemini. A recorded
 * transport spends nothing, so it is not counted, unless a test installs a guard
 * of its own here (a plain `false` is the hard ceiling; `{ allowed: true, overCap:
 * true }` is a soft crossing).
 */
type SpendGuard = () => boolean | SpendDecision;
let spendGuardDouble: SpendGuard | null = null;
export function setSpendGuardForTests(guard: SpendGuard | null): void {
  spendGuardDouble = guard;
}
function spendGuardFor(): SpendGuard {
  if (spendGuardDouble) return spendGuardDouble;
  if (geminiTransportDouble) return () => true;
  return () => chargeSpend(usdCentsToCad(groundedScanCapChargeUsdCents()));
}

/**
 * The loud line for a scan made past the daily soft cap, or stopped at the hard
 * ceiling. Through the same `logError` every other server fault uses, so it is
 * in the log a person reads, carrying the scan id. It marks and reports; it
 * never refuses anything (his rule: always an answer).
 */
function flagOverCap(run: GeminiRun, device: string, scanId: number | null): void {
  if (!run.overCap) return;
  const stopped = run.failure === 'spend_cap_reached';
  logError({
    where: 'spend.over_cap',
    deviceId: device,
    scanId,
    err: new Error(
      stopped
        ? 'DAILY SPEND HARD CEILING REACHED: this scan was NOT sent to Gemini and got a retryable answer'
        : 'DAILY SPEND SOFT CAP EXCEEDED: this scan was answered and marked over_cap',
    ),
    detail: { overCap: true, hardCeilingStopped: stopped },
  });
}

interface ScannedEntry {
  readonly at: number;
  readonly device: string;
  readonly scanId: number | null;
  readonly callId: number | null;
  readonly run: GeminiRun;
  readonly block: AnswerBlock;
}

/**
 * The answers held between the scan and the price sheet, so the price sheet
 * shows the SAME one call instead of making another. Keyed by scan id and by
 * device plus barcode or name; a restart loses them, and `/api/price` then
 * makes the one call for that scan.
 */
const scanned = new Map<string, ScannedEntry>();
const SCANNED_TTL_MS = 30 * 60_000;
const SCANNED_MAX = 500;

function scannedKeys(device: string, scanId: number | null, gtin?: string, text?: string): string[] {
  const keys: string[] = [];
  if (scanId !== null) keys.push(`${device}|id:${scanId}`);
  const digits = gtin?.replace(/\D/g, '').replace(/^0+/, '');
  if (digits) keys.push(`${device}|gtin:${digits}`);
  const words = text?.toLowerCase().replace(/\s+/g, ' ').trim();
  if (words) keys.push(`${device}|text:${words}`);
  return keys;
}

function rememberScan(entry: ScannedEntry, keys: string[]): void {
  for (const k of keys) scanned.set(k, entry);
  if (scanned.size > SCANNED_MAX) {
    const now = Date.now();
    for (const [k, v] of scanned) {
      if (now - v.at >= SCANNED_TTL_MS || scanned.size > SCANNED_MAX) scanned.delete(k);
      if (scanned.size <= SCANNED_MAX) break;
    }
  }
}

function recallScan(device: string, scanId: number | null, gtin?: string, text?: string): ScannedEntry | null {
  const now = Date.now();
  for (const k of scannedKeys(device, scanId, gtin, text)) {
    const found = scanned.get(k);
    if (found && now - found.at < SCANNED_TTL_MS) return found;
  }
  return null;
}

/** The hidden math checks still running. Awaited only by tests. */
const backgroundChecks = new Set<Promise<void>>();
export function settleBackgroundChecks(): Promise<void> {
  return Promise.all([...backgroundChecks]).then(() => undefined);
}

/**
 * ITEM 15. What every scan teaches the user catalogue. Jamin: user data builds
 * the catalogue, taken with a grain of salt. The catalogue is FED here and never
 * consulted to answer the scan: this runs after the answer is built, on the next
 * turn of the event loop, and nothing it does is awaited by the request.
 *
 * The user catalogue is its own small file (catalogue/src/user-catalogue.ts) so
 * the read-only catalogue connection stays read-only. The read-only catalogue is
 * consulted only here, after the response, to attach the user's data to a product
 * it already holds (closest size when two exist); an unmatched scan becomes a new
 * user-sourced, untrusted entry.
 */
const USER_CATALOGUE_PATH =
  process.env.SHIN_USER_CATALOGUE ?? fileURLToPath(new URL('./data/user-catalogue.db', import.meta.url));
let userCatalogue: UserCatalogue | null = null;
export function setUserCatalogueForTests(uc: UserCatalogue | null): void {
  userCatalogue = uc;
}

function scheduleCatalogueFeed(
  run: GeminiRun,
  named: { label: string; brand: string | null; name: string | null; size: string | null } | null,
  a: CompleteArgs,
  scanId: number | null,
): void {
  if (named === null) return; // Gemini identified nothing: there is no product to add
  const task = new Promise<void>((resolve) => {
    setImmediate(() => {
      try {
        // The model number rides in the raw answer; ReadAnswer does not carry it. A
        // model number is what identifies tech, which is compared by model and spec.
        let model: string | null = null;
        try {
          const raw = JSON.parse(run.answerText ?? '') as { product?: { model?: unknown } };
          model = typeof raw.product?.model === 'string' && raw.product.model.trim() !== '' ? raw.product.model.trim() : null;
        } catch {
          /* a repaired or partial answer has no readable model; the entry is still made */
        }
        const result = recordUserScan(
          {
            gtin: a.kind === 'barcode' ? (a.gtin ?? null) : null,
            name: named.name ?? named.label,
            brand: named.brand,
            quantity: named.size,
            kind: model ? 'tech' : null,
            model,
            storeName: a.where.storeName,
            priceCents: a.shelfPriceCents,
            market: marketOfContext(a.context),
            scanId: scanId === null ? null : String(scanId),
            // Audit row 39: the offers and reviews Gemini returned are kept with the entry
            // (untrusted, with this scan id) and never read to answer a scan. No verdict is
            // stored here: Gemini's zone is Gemini's own answer, and the median back-computed
            // from users (audit row 21) reads only the user's own rating and typed price.
            deviceId: a.device,
            offers: (run.answer?.offers ?? []).map((o) => ({
              retailer: o.retailer,
              price: o.price,
              unitPrice: o.unitPrice,
              inMedian: o.inMedian,
              raw: o.raw,
            })),
            reviews: (run.answer?.reviews ?? []).map((r) => ({ rating: r.rating, count: r.count, summary: r.summary, url: r.url })),
          },
          {
            log: (userCatalogue ??= createUserCatalogue(USER_CATALOGUE_PATH)),
            probe: catalogueDb ? probeCatalogue(catalogueDb) : null,
          },
        );
        if (result.outcome === 'dropped') {
          logError({ where: 'catalogue.feed', deviceId: a.device, scanId, err: new Error(result.reason ?? 'dropped') });
        }
      } catch (err) {
        logError({ where: 'catalogue.feed', deviceId: a.device, scanId, err });
      }
      resolve();
    });
  });
  backgroundChecks.add(task);
  void task.finally(() => backgroundChecks.delete(task));
}

/**
 * ITEM 14. After the answer has gone out, re-run the arithmetic Gemini claims
 * to have done and mark the stored call if it disagrees. Never shown, never
 * waited on, and it can only ever write a mark.
 */
function scheduleMathCheck(
  mod: ScanModule,
  run: GeminiRun,
  callId: number | null,
  device: string,
  scanId: number | null,
  currency: string | null,
): void {
  const task = new Promise<void>((resolve) => {
    setImmediate(() => {
      try {
        // Dollar mode needs what the user typed and their currency; both are already known here.
        const check = mod.checkMath(run.answer, run.thresholds, { shelfPriceCents: run.shelfPriceCents, currency });
        if (callId !== null) {
          // 'partial' is a check whose dollar zone was skipped (no typed price, another currency,
          // no shelf size): the reasons ride in the mismatches column, and it is not a mismatch.
          if (!check.checked) markGeminiMath(callId, 'unchecked', null);
          else if (check.mismatches.length > 0) markGeminiMath(callId, 'mismatch', check.mismatches);
          else if (check.skipped.length > 0) markGeminiMath(callId, 'partial', check.skipped);
          else markGeminiMath(callId, 'ok', null);
        }
      } catch (err) {
        logError({ where: 'gemini.math_check', deviceId: device, scanId, err });
      }
      resolve();
    });
  });
  backgroundChecks.add(task);
  void task.finally(() => backgroundChecks.delete(task));
}

/**
 * Ruling 3 (docs/decisions.md, "Nine rulings so the competitor-survey build
 * could start", 2026-09-19): after the answer has gone out, fetch the one
 * cited, allowlisted retailer page (if any) and mark whether it agrees with
 * the price Gemini stated. A CHECK, never a second call to any model, and it
 * NEVER changes what the person was already shown -- exactly `scheduleMathCheck`'s
 * shape, above, for the same reason: never shown, never waited on, and it can
 * only ever write a mark. `verifyPrice` itself decides there is nothing to
 * verify (`not_verifiable`, the common case); this only decides whether the
 * fetch is worth spending at all.
 */
function schedulePriceVerify(run: GeminiRun, callId: number | null, device: string, scanId: number | null): void {
  if (callId === null) return; // nothing to mark the result on
  const offers = run.answer?.offers ?? [];
  if (offers.length === 0 || run.citations.length === 0) return; // verifyPrice would only ever say not_verifiable
  const task = new Promise<void>((resolve) => {
    setImmediate(() => {
      priceVerifierModule()
        .then((mod) =>
          mod.verifyPrice(
            offers.map((o) => ({ retailer: o.retailer, url: cleanUrl(o.raw.url), price: o.price })),
            run.citations,
            { transport: verifierTransportDouble ?? ((url, init) => fetch(url, init)) },
          ),
        )
        .then((result) => {
          markPriceVerification(callId, result);
        })
        .catch((err: unknown) => {
          logError({ where: 'gemini.price_verify', deviceId: device, scanId, err });
        })
        .finally(resolve);
    });
  });
  backgroundChecks.add(task);
  void task.finally(() => backgroundChecks.delete(task));
}

/** The user's lines: the request's own, else what this device saved on the server, else the default range. */
function thresholdsFor(mod: ScanModule, raw: unknown, device: string) {
  const sent = mod.readThresholds(raw);
  if (sent.source === 'user') return sent;
  if (device !== UNATTRIBUTED) {
    const saved = readPreferences(device);
    if (saved !== DEFAULT_PREFERENCES) {
      return { underPct: saved.goodUnderPct, overPct: saved.highOverPct, source: 'user' as const };
    }
  }
  return sent;
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
}

/** The sentence a picture hint becomes in the prompt's "Additional user information". */
const PICTURE_HINTS: Readonly<Record<string, string>> = {
  price_tag: 'The image is a photo of a shelf price tag: read the product name and the price printed on the tag.',
};

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
  return marketFromLocation({
    country: countryCodeOf(ctx.countryCode) ?? countryCodeOf(ctx.market),
    region: ctx.region ?? null,
    currency: ctx.currency ?? null,
  });
}

function userContextFor(ctx: ScanContext, shelfPriceCents: number | null, mod: ScanModule) {
  const market = marketOfContext(ctx);
  const byHint = normalizeStoreType(ctx.storeHint);
  const storeType = byHint !== 'other' && byHint !== 'unknown' ? byHint : normalizeStoreType(ctx.storeName);
  return {
    marketFields: marketPromptFields(market),
    alternatives: {
      mode: mod.alternativesModeFor(shelfPriceCents, ctx.mode),
      storeType: storeType === 'unknown' ? null : storeType,
    },
  };
}

interface CompleteArgs {
  readonly device: string;
  readonly kind: ScanType;
  readonly gtin?: string;
  readonly text?: string;
  readonly image?: Buffer;
  readonly imageMediaType?: string;
  readonly sharpness?: number;
  readonly shelfPriceCents: number | null;
  readonly thresholdsRaw: unknown;
  readonly context: ScanContext;
  readonly telemetry: ReturnType<typeof telemetryFrom>;
  readonly where: ReturnType<typeof locationFor>;
  readonly startedAt: number;
  /** The scan row that already exists (a price call after a restart); no second row is written. */
  readonly existingScanId?: number | null;
  /** False on `/api/price`: it must not write a second row for a scan that has one. */
  readonly writeScanRow: boolean;
}

interface Completed {
  readonly mod: ScanModule;
  readonly run: GeminiRun;
  readonly block: AnswerBlock;
  readonly label: { label: string; brand: string | null; name: string | null; size: string | null } | null;
  readonly scanId: number | null;
  readonly callId: number | null;
  readonly ms: number;
  /*
   * WHEN THE ANSWER WAS ACTUALLY MADE, or null when it was made by the call
   * this request just paid for.
   *
   * Ruling 1 lets a repeat scan be served from a stored Gemini answer on one
   * stated condition: the price is "always shown with when it was checked".
   * `wireFor` stamped `new Date()` on every response, so a cache hit up to six
   * hours old went out saying it was checked now. The client says so out loud
   * since 2026-09-21 (`geminiCheckedLine`), which turned a silent staleness
   * into a printed untruth, which is why this field exists.
   */
  readonly checkedAt: string | null;
}

/**
 * The one sentence a person sees when the answer is a refusal Shin can explain. Only a spent budget has one: taking the photo again cannot help then, so that sentence must survive the route.
 */
function whyNot(c: Pick<Completed, 'run'>): string {
  return c.run.failure === 'spend_cap_reached' ? (c.run.failureMessage ?? '') : '';
}

/**
 * THE ONE CALL, and everything that has to happen because it was made: the
 * scan row, the whole request and response stored (item 12), the answer held
 * for the price sheet, the hidden math check scheduled (item 14). Never
 * throws at the person: `runGeminiScan` returns a marked run for every failure.
 */
async function completeGeminiScan(a: CompleteArgs): Promise<Completed> {
  const mod = await geminiScanModule();
  const thresholds = thresholdsFor(mod, a.thresholdsRaw, a.device);

  /*
   * ITEM 1 (docs/scanner-build-order-2026-09-19.md section 1), ruling 1
   * (docs/decisions.md, "Nine rulings", 2026-09-19). A repeat scan of a
   * barcode Shin already asked Gemini about is answered from that answer:
   * zero further Gemini calls, not a second one. See `src/repeat-cache.ts`
   * for the age policy (served under 6 hours, a background refresh past 1).
   *
   * Barcode scans only: a photo or a typed name has no stable key to cache
   * against (rule 2's whole point is that a barcode is the one input Shin
   * can key on without asking anybody).
   */
  if (a.kind === 'barcode' && a.gtin) {
    const market = a.context.market ?? null;
    const currency = a.context.currency ?? null;
    const hit = recallCachedScan<GeminiRun, AnswerBlock>(a.gtin, market, currency);
    if (hit) {
      if (hit.needsRefresh && claimRefresh(a.gtin, market, currency)) {
        // Tracked the same way `scheduleMathCheck`'s task is: never awaited by
        // the request that triggered it, only by `settleBackgroundChecks` in
        // a test, so a test can prove the refresh actually ran rather than
        // guessing from a timeout.
        const task = refreshCachedBarcode(a, mod, thresholds, market, currency, hit.scanId);
        backgroundChecks.add(task);
        void task.finally(() => backgroundChecks.delete(task));
      }
      const named = mod.labelOf(hit.run);
      const label = named ?? { label: a.gtin, brand: null, name: null, size: null };
      let scanId: number | null = a.existingScanId ?? hit.scanId;
      if (a.writeScanRow) {
        scanId = recordScan({
          deviceId: a.device,
          kind: 'barcode',
          query: a.gtin,
          resolvedCode: a.gtin,
          resolvedLabel: named?.label ?? null,
          confidence: hit.run.answer?.overallConfidence ?? null,
          source: 'gemini_cache',
          category: null,
          outcome: named ? 'answered' : 'refused',
          failureClass: hit.run.failure,
          appVersion: a.telemetry.appVersion,
          platform: a.telemetry.platform,
          latencyMs: Date.now() - a.startedAt,
          cell: a.where.cell,
          storeId: a.where.storeId,
          storeName: a.where.storeName,
          exactLat: a.where.exactLat,
          exactLon: a.where.exactLon,
          exactAccuracy: a.where.exactAccuracy,
          exactAt: a.where.exactAt,
        });
      }
      return { mod, run: hit.run, block: hit.block, label, scanId, callId: null, ms: Date.now() - a.startedAt, checkedAt: hit.checkedAt };
    }
  }

  /*
   * ITEM 6 (docs/scanner-build-order-2026-09-19.md section 6), ruling 5
   * (docs/decisions.md, "Nine rulings", 2026-09-19): a LIVE Open Food Facts
   * lookup, identity only, before the paid call. It never substitutes for
   * the Gemini call and it never touches price: it only gives Gemini a head
   * start, the same way a typed name already does through `userInput`.
   */
  const offHint =
    a.kind === 'barcode' && a.gtin
      ? await lookupOpenFoodFacts(a.gtin).then((off) =>
          off ? `Open Food Facts identifies this barcode as: ${off.name}${off.brand ? ` by ${off.brand}` : ''}${off.size ? `, ${off.size}` : ''}.` : null,
        )
      : null;

  const run = await mod.runGeminiScan(
    {
      kind: a.kind,
      barcode: a.kind === 'barcode' ? (a.gtin ?? null) : null,
      text: a.kind === 'text' ? (a.text ?? null) : null,
      image: a.kind === 'photo' && a.image ? { bytes: a.image, mediaType: a.imageMediaType ?? 'image/jpeg' } : null,
      sharpness: a.sharpness ?? null,
      shelfPriceCents: a.shelfPriceCents,
      thresholds,
      market: a.context.market ?? null,
      currency: a.context.currency ?? null,
      language: a.context.language ?? null,
      userInput: [
        a.kind === 'barcode' && a.text ? a.text : (a.context.userInput ?? null),
        a.kind === 'photo' && a.context.hint ? (PICTURE_HINTS[a.context.hint] ?? null) : null,
        offHint,
      ].filter(Boolean).join(' ') || null,
      ...userContextFor(a.context, a.shelfPriceCents, mod),
    },
    {
      deviceId: a.device,
      ...(geminiTransportDouble ? { transport: geminiTransportDouble } : {}),
      spendGuard: spendGuardFor(),
    },
  );
  const block = mod.toAnswerBlock(run);
  const named = mod.labelOf(run);
  const label = named ?? (a.kind === 'barcode' && a.gtin ? { label: a.gtin, brand: null, name: null, size: null } : null);
  const ms = Date.now() - a.startedAt;

  // ITEM 14 (docs/scanner-build-order-2026-09-19.md section 14). The gap
  // table and report already exist and were wired only to catalogue-search
  // misses; a Gemini-path miss is a finding too. Recorded here rather than
  // after the scan row insert below, since both are about the same failure
  // and neither depends on the other having run.
  //
  // Checked against `named`, NOT `label`: a barcode scan's `label` falls back
  // to the digits themselves (a few lines up) so the rest of this function
  // always has something to call the scan by, and that fallback would make
  // `label` truthy on EVERY barcode miss, so a check against `label` here
  // would never fire at all for the one kind of scan this item is mostly
  // about.
  if (!named && (a.gtin || a.text)) {
    recordGap({ gtin: a.gtin, queryText: a.text, note: `gemini_miss:${run.failure ?? 'unknown'}` });
  }

  let scanId: number | null = a.existingScanId ?? null;
  if (a.writeScanRow) {
    scanId = recordScan({
      deviceId: a.device,
      kind: a.kind as ScanKind,
      // What was asked, never what came back: the digits, the typed name, or
      // for a photo what Gemini read it as.
      query: a.kind === 'barcode' ? (a.gtin ?? '') : a.kind === 'text' ? (a.text ?? '') : (named?.label ?? ''),
      resolvedCode: a.kind === 'barcode' ? (a.gtin ?? null) : null,
      resolvedLabel: named?.label ?? null,
      confidence: run.answer?.overallConfidence ?? null,
      source: 'gemini',
      category: null,
      outcome: label ? 'answered' : 'refused',
      failureClass: run.failure,
      modelJson: JSON.stringify({
        readAs: label?.label ?? null,
        failureMessage: run.failureMessage ?? null,
        model: run.model,
        family: run.family,
        via: run.via,
        parseStatus: run.parseStatus,
        lowConfidence: run.lowConfidence,
        confidenceReasons: run.confidenceReasons,
        searchQueries: run.searchQueries.length,
        inputTokens: run.usage.inputTokens,
        outputTokens: run.usage.outputTokens,
        shelfPriceSent: run.shelfPriceCents !== null,
        thresholds: run.thresholds,
        // How the alternatives section arrived (ok, empty, partial, missing): a bad one is marked, never silent.
        alternatives: run.answer?.alternatives.status ?? 'missing',
        alternativesDropped: run.answer?.alternatives.dropped.length ?? 0,
      }),
      modelCostCents: null,
      appVersion: a.telemetry.appVersion,
      platform: a.telemetry.platform,
      latencyMs: ms,
      cell: a.where.cell,
      storeId: a.where.storeId,
      storeName: a.where.storeName,
      exactLat: a.where.exactLat,
      exactLon: a.where.exactLon,
      exactAccuracy: a.where.exactAccuracy,
      exactAt: a.where.exactAt,
    });
  }

  // Audit row 20: the good-deal verdict is its own field on the scan row (the zone
  // Gemini returned against the user's lines, and the lines used), not only
  // derivable from the stored answer. Rows 16 and 32: `over_cap` marks a scan made
  // past the daily soft cap, and a loud line says so. Neither can refuse anything.
  markScan(scanId, {
    verdictZone: run.answer?.verdict?.shelf?.zone ?? null,
    verdictThresholdsJson: JSON.stringify(run.thresholds),
    overCap: run.overCap,
  });
  flagOverCap(run, a.device, scanId);

  const callId = recordGeminiCall({
    scanId,
    deviceId: a.device,
    model: run.model,
    family: run.family,
    via: run.via,
    scanType: run.scanType,
    ms: run.ms,
    requestJson: run.requestJson,
    systemText: run.systemText,
    promptText: run.promptText,
    inputRef: run.inputRef,
    thresholdsJson: JSON.stringify(run.thresholds),
    shelfPriceCents: run.shelfPriceCents,
    responseRaw: run.responseRaw,
    answerText: run.answerText,
    httpStatus: run.httpStatus,
    parseStatus: run.parseStatus,
    failureClass: run.failure,
    inputTokens: run.usage.inputTokens,
    outputTokens: run.usage.outputTokens,
    searchQueries: run.searchQueries.length,
    billingBasis: run.family === '2.5' ? 'per_prompt' : 'per_query',
    lowConfidence: run.lowConfidence,
    // Grounded with Google Search: the terms are a mark, never a block (rule 5).
    grounded: true,
  });

  const entry: ScannedEntry = { at: Date.now(), device: a.device, scanId, callId, run, block };
  rememberScan(entry, scannedKeys(a.device, scanId, a.gtin, a.text ?? label?.label));
  // ITEM 1: every real barcode answer refreshes the persistent repeat-scan
  // cache, so `checked_at` always reflects the most recent real call.
  //
  // EXCEPT a spend-cap refusal. `run.failure === 'spend_cap_reached'` means
  // the hard ceiling stopped this scan before it ever reached Gemini (see
  // `spendGuardFor`): it is Shin's own local refusal, never "Gemini's
  // answer", and ruling 1 only ever asks for the latter to be cached.
  // Caching it anyway would mean the one scan that happened to run while the
  // daily cap was tripped gets served, marked as a cap refusal, to every
  // OTHER device scanning the same barcode for up to six hours afterward,
  // long after the cap has reset -- a local outage turned into a poisoned
  // answer for everybody. A genuine Gemini-side failure (an outage, a parse
  // miss) is different: the call really was made, that IS Gemini's answer
  // for now, and the one-hour background refresh already exists to try
  // again.
  if (a.kind === 'barcode' && a.gtin && run.failure !== 'spend_cap_reached') {
    rememberCachedScan(a.gtin, a.context.market ?? null, a.context.currency ?? null, run, block, scanId);
  }
  scheduleMathCheck(mod, run, callId, a.device, scanId, a.context.currency ?? null);
  scheduleCatalogueFeed(run, named, a, scanId);
  schedulePriceVerify(run, callId, a.device, scanId);

  recordEvent({
    deviceId: a.device,
    type: 'model_call',
    payload: {
      scanId,
      tier: null,
      model: run.model,
      family: run.family,
      passes: 1,
      failure: run.failure,
      reachedModel: run.failure !== 'model_client_error',
      parseStatus: run.parseStatus,
      lowConfidence: run.lowConfidence,
      searchQueries: run.searchQueries.length,
      costCents: null,
      ms: run.ms,
    },
  });
  return { mod, run, block, label, scanId, callId, ms, checkedAt: null };
}

/**
 * ITEM 1's background half: the one Gemini call a cache hit older than one
 * hour earns, run AFTER the cached answer has already gone out and never
 * awaited by the request it was triggered from.
 *
 * NEVER TOUCHES `verdict_zone` / `verdict_thresholds_json` / `typed_price_
 * cents` / `verdict_tier` -- it does not call `recordScan` or `markScan`, so
 * the scan row the person already saw cannot move under this. What it CAN
 * change: the repeat-scan cache itself (`rememberCachedScan`, so the NEXT
 * hit is fresh), and, per ruling 7 (item 11), `enrichScan`'s columns on the
 * scan row that was served from cache -- beside the shown value, never over
 * it.
 *
 * Never throws at its caller: it is `void`d the moment it is started.
 * Whatever goes wrong here is a missed refresh, not a broken scan.
 */
async function refreshCachedBarcode(
  a: CompleteArgs,
  mod: ScanModule,
  thresholds: ReturnType<typeof thresholdsFor>,
  market: string | null,
  currency: string | null,
  cachedScanId: number | null,
): Promise<void> {
  const gtin = a.gtin;
  if (!gtin) return;
  try {
    const freshRun = await mod.runGeminiScan(
      {
        kind: 'barcode',
        barcode: gtin,
        text: null,
        image: null,
        sharpness: null,
        shelfPriceCents: a.shelfPriceCents,
        thresholds,
        market,
        currency,
        language: a.context.language ?? null,
        userInput: null,
        ...userContextFor(a.context, a.shelfPriceCents, mod),
      },
      {
        deviceId: a.device,
        ...(geminiTransportDouble ? { transport: geminiTransportDouble } : {}),
        spendGuard: spendGuardFor(),
      },
    );
    // Same rule as the main path (see completeGeminiScan): a spend-cap
    // refusal never reached Gemini and is not "Gemini's answer", so it must
    // not overwrite a good cached one. The claim is released instead of kept,
    // so the NEXT hit past the refresh age tries again rather than being
    // silently stuck at `refreshing = 1` forever.
    if (freshRun.failure === 'spend_cap_reached') {
      releaseRefresh(gtin, market, currency);
      return;
    }
    const freshBlock = mod.toAnswerBlock(freshRun);
    rememberCachedScan(gtin, market, currency, freshRun, freshBlock, cachedScanId);
    if (cachedScanId !== null) {
      const median = freshRun.answer?.verdict?.median;
      enrichScan(cachedScanId, {
        priceCents: typeof median === 'number' ? Math.round(median * 100) : undefined,
        verdictZone: freshRun.answer?.verdict?.shelf?.zone ?? null,
      });
    }
  } catch (err) {
    releaseRefresh(gtin, market, currency);
    logError({ where: 'repeat_cache.refresh', deviceId: a.device, scanId: cachedScanId, err });
  }
}

/**
 * The grounded wire for the answer. `toWire` is the normal door; if it refuses
 * for any reason the same block goes out in the same shape anyway, because an
 * answer with a "not fully confident" mark beats no answer (rule 6) and a
 * terms check is a mark, never a block (rule 5).
 */
function wireFor(
  c: Pick<Completed, 'block' | 'run' | 'scanId' | 'checkedAt'>,
  owner: string,
  device: string,
): GroundedWire<unknown> {
  // A replayed answer carries the time of the call that produced it; only an
  // answer made by this request is checked now. See Completed.checkedAt.
  const fetchedAt = c.checkedAt ?? new Date().toISOString();
  let wire: GroundedWire<unknown>;
  try {
    const box = sealScanAnswer({
      value: c.block as unknown,
      suggestionsHtml: c.run.suggestionsHtml,
      forDevice: owner,
      promptId: 'scan_answer',
      fetchedAt,
      provider: 'gemini',
      searchQueries: c.run.searchQueries.length,
      model: c.run.model,
      usage: c.run.usage,
    });
    // Stored for the device's history when the device is named, before it is served.
    if (c.scanId !== null && owner === device && device !== UNATTRIBUTED) keepGroundedForOwner(c.scanId, owner, box);
    wire = groundedModule().toWire(box, owner) as GroundedWire<unknown>;
  } catch (err) {
    logError({ where: 'grounded.wire', deviceId: owner, scanId: c.scanId, err });
    wire = { kind: 'grounded', forDevice: owner, fetchedAt, block: c.block, suggestionsHtml: c.run.suggestionsHtml };
  }
  markGroundedShown(c.scanId);
  return wire;
}

/** The fields every scan answer carries about the model that answered and how sure it is. */
function answerMarks(c: Pick<Completed, 'run'>) {
  return {
    model: c.run.model,
    modelFamily: c.run.family,
    lowConfidence: c.run.lowConfidence,
    confidenceReasons: c.run.confidenceReasons,
    parseStatus: c.run.parseStatus,
    failure: c.run.failure,
    // Past the daily soft cap: the answer is a real one, only marked. Never shown as a refusal.
    overCap: c.run.overCap,
    // The hard ceiling stopped the call: the answer is a kind "try again in a little while", and trying again is right.
    retryable: c.run.failure === 'spend_cap_reached',
  };
}

/** The sentence a typed search gets when Shin holds no item with a price for it. */
export const TYPED_NO_OWN_PRICE = 'Shin does not have a price for that yet. Scan the barcode instead.';

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
function typedFromOwnData(
  text: string,
  device: string,
  telemetry: ReturnType<typeof telemetryFrom>,
  where: ReturnType<typeof locationFor>,
  startedAt: number,
  /** `/api/price` naming a typed scan already has its row: it is reused, never duplicated. */
  existingScanId: number | null = null,
): Record<string, unknown> & { scanId?: number } {
  let match: OwnMatch | null = null;
  try {
    match = lookupOwnPrices(text, {
      pricesDbPath: defaultPricesPath(),
      userCatalogueDb: userCatalogue?.db ?? null,
      userCataloguePath: USER_CATALOGUE_PATH,
      catalogueProbe: catalogueDb ? probeCatalogue(catalogueDb) : null,
    }).match;
  } catch (err) {
    logError({ where: 'identify.own_data', deviceId: device, scanId: null, err });
  }
  const ms = Date.now() - startedAt;
  const label = match ? [match.brand && !match.name.toLowerCase().includes(match.brand.toLowerCase()) ? match.brand : null, match.name, match.size].filter(Boolean).join(' ') : null;
  const scanId = existingScanId ?? recordScan({
    deviceId: device,
    kind: 'text',
    query: text,
    resolvedCode: match?.code ?? null,
    resolvedLabel: label,
    source: OWN_DATA_SOURCE,
    outcome: match ? 'answered' : 'refused',
    failureClass: match ? null : 'not_in_catalogue',
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
    catalogueUp: false,
    ms,
    model: null,
    failure: null,
    ...(scanId === null ? {} : { scanId }),
  };
  if (!match) {
    return {
      ...common,
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
 * What the catalogue says a barcode is, in the shape the price engine takes.
 *
 * Added 2026-09-14 after the founder's phone showed `/api/identify` naming a
 * Kirkland Signature water bottle by barcode and `/api/price`, carrying that
 * same code, answering "Could not work out what this is". No price source held
 * a row for the code, and the price route never asked the catalogue. The
 * engine asks this only after every price source has said it does not know.
 *
 * Barcode only. A text match is a guess with its own confidence, and the
 * engine already retries by words on its own sources; a catalogue row found by
 * its code is the fact `/api/identify` already acted on.
 *
 * THE CATEGORY IS NEVER INVENTED. It is the one the client sent (which is the
 * one `/api/identify` gave it) or the one `category-map.ts` names for the row.
 * When neither exists this answers null rather than defaulting, because the
 * category picks the comparison rule, and shopper-typed prices under this code
 * (the corrections source prices by code) could otherwise reach a verdict under
 * a rule nobody chose.
 */
function catalogueIdentityForPrice(query: SpineQuery): Promise<ProductIdentity | null> {
  if (!fastLookup || !query.gtin) return Promise.resolve(null);
  const row = (fastLookup.byGtin(query.gtin) ?? null) as Candidate | null;
  if (!row) return Promise.resolve(null);
  const mapped =
    row.source !== undefined
      ? categoryFor({ source: row.source, categoryPath: row.categoryPath ?? [], leafCategory: row.leafCategory ?? null })
          .category
      : null;
  const category = query.category ?? mapped;
  if (!category) return Promise.resolve(null);

  const name = String(row.name ?? '').trim();
  const brand = String(row.brands ?? '').split(',')[0].trim();
  const fold = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const parts: string[] = [];
  if (brand && !fold(name).startsWith(fold(brand))) parts.push(brand);
  parts.push(name);
  const quantity = row.quantity ? String(row.quantity).trim() : '';
  if (quantity && !fold(name).includes(fold(quantity))) parts.push(quantity);
  const label = parts.join(' ').trim() || row.code;

  return Promise.resolve({
    id: `catalogue:${row.code}`,
    label,
    category,
    ...(brand ? { brand } : {}),
    gtin: row.code,
    // 1.0 for a barcode match, per docs/plan-always-a-price.md.
    confidence: 1,
    resolvedBy: 'catalogue',
  });
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
 * ITEM 18 (docs/scanner-build-order-2026-09-19.md section 18): the routes
 * the same-origin check runs in front of. The paid-call routes plus the demo
 * route (item 19), which is the same shape of request even though it spends
 * nothing -- not every `/api/` path, which would also gate corrections,
 * consent and telemetry that a cross-site page calling on somebody's behalf
 * is not the threat model for.
 */
const SCAN_ROUTES: ReadonlySet<string> = new Set([
  '/api/identify',
  '/api/identify/photo',
  '/api/identify/demo',
  '/api/price',
]);

/** ITEM 19's fixed sample answer. Never Gemini's; never billed. */
const DEMO_SAMPLE = {
  label: 'Kraft Dinner Original, 225 g',
  brand: 'Kraft',
  name: 'Kraft Dinner Original',
  size: '225 g',
  zone: 'middle',
} as const;

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
  recordAccess(req, res);
  recordShutterRequest(req, res, url.pathname);

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
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");

  const json = (status: number, body: unknown) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(payload);
  };

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
    if (SCAN_ROUTES.has(url.pathname)) {
      const origin = req.headers.origin;
      if (typeof origin === 'string' && origin) {
        let originHost: string | null = null;
        try {
          originHost = new URL(origin).host;
        } catch {
          originHost = null;
        }
        const requestHost = typeof req.headers.host === 'string' ? req.headers.host : null;
        if (originHost === null || requestHost === null || originHost !== requestHost) {
          return json(403, { error: 'that origin is not allowed to call this route' });
        }
      }
    }

    if (url.pathname === '/api/shutter/frame') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req, MAX_SHUTTER_FRAME_BYTES);
      if (body === TOO_LARGE) return refuseTooLarge(MAX_SHUTTER_FRAME_BYTES);
      const status = saveShutterFrame(body);
      if (status === 204) {
        res.writeHead(204, { 'cache-control': 'no-store' });
        res.end();
        return;
      }
      return json(status, { error: status === 404 ? 'the shutter log is off' : 'frame not saved' });
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
      if (outcomeDevice) deviceForLog = outcomeDevice;
      const kept = recordScanOutcome(outcomeScan, outcomeDevice ?? null, o.outcome);
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
       * rules in docs/jamin-gemini-rules.md, "no price from Shin's own data"
       * and "always an answer", by his ruling of 2026-09-23. Barcodes and
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

      /*
       * Write down whether Shin's own catalogue held this barcode, before
       * anything else happens to it. Placed here, above the paid-call limiter
       * and the weekly free-scan limit, on purpose: a shopper who scans a
       * product we do not stock has told us something true whether or not we
       * were willing to spend a call answering them, and a miss log that only
       * sees the scans we chose to answer is biased towards whatever we could
       * already afford. Changes no answer; see `noteCatalogueBarcodeMiss`.
       */
      if (gtin) noteCatalogueBarcodeMiss(gtin);

      // A typed name: Shin's own data only, never a paid call (see the comment above).
      if (!gtin && text) {
        const typedAnswer = typedFromOwnData(text, device, telemetry, where, identifyStarted);
        if (typeof typedAnswer.scanId === 'number') scanForLog = typedAnswer.scanId;
        return json(200, typedAnswer);
      }

      const limitedIdentify = paidCallRefusal(req);
      if (limitedIdentify) return tooManyCalls(limitedIdentify.retryAfterSeconds);
      // The weekly free-scan limit (src/scan-quota.ts), before anything is spent. Off unless set.
      const overLimit = gtin ? await scanLimitRefusal(device, req.headers) : null;
      if (overLimit) return json(402, overLimit);

      let completed: Completed;
      try {
        const mod = await geminiScanModule();
        completed = await completeGeminiScan({
          device,
          kind: gtin ? 'barcode' : 'text',
          gtin,
          text,
          shelfPriceCents: mod.readShelfPriceCents(pick('shelfPriceCents')),
          thresholdsRaw: pick('thresholds'),
          context: contextFrom(pick),
          telemetry,
          where,
          startedAt: identifyStarted,
          writeScanRow: true,
        });
      } catch (err) {
        // Only reachable if the scan module itself cannot load or the request
        // could not be built. Still an answer: marked, and nothing thrown at the person.
        logError({ where: 'gemini.identify', deviceId: device, scanId: null, err });
        return json(200, {
          product: null,
          matchedBy: 'none',
          band: 'miss',
          catalogueUp: false,
          failure: 'model_client_error',
          reason: 'model_client_error',
          lowConfidence: true,
          confidenceReasons: ['no_answer:model_client_error'],
        });
      }
      scanForLog = completed.scanId;

      const label = completed.label;
      const scanId = completed.scanId;
      const priceQuery: GroundedPriceQuery | null = label
        ? { text: label.name ? label.label : undefined, gtin }
        : gtin
          ? { gtin }
          : null;
      const unchecked = label
        ? {
            checked: false,
            source: 'search',
            label: label.label,
            brand: label.brand,
            name: label.name,
            size: label.size,
            gtin: gtin ?? null,
          }
        : null;
      if (unchecked) {
        recordEvent({
          deviceId: device,
          type: 'unchecked_answer',
          payload: { scanId, source: gtin ? 'barcode' : 'text', failure: completed.run.failure, readAs: label?.label ?? null },
        });
      }
      const wire = wireFor(completed, groundedOwner(device), device);
      // The cashier line (src/price-match-line.ts). The store name is read for this answer only, never kept past consent.
      const priceMatch = priceMatchLine(
        completed.block.offers,
        pickText('storeName')?.trim() || where.storeName,
        completed.mod.readShelfPriceCents(pick('shelfPriceCents')),
      );
      return json(200, {
        ...(priceMatch ? { priceMatch } : {}),
        // Shin's own product list is not consulted, so there is never a catalogue product here.
        product: null,
        matchedBy: 'none',
        band: 'miss',
        category: null,
        categoryWhy: whyNot(completed),
        ring: null,
        otherCandidates: 0,
        route: null,
        catalogueUp: false,
        ms: completed.ms,
        reason: unchecked ? 'unchecked' : (completed.run.failure ?? 'identity_unsure'),
        ...(scanId === null ? {} : { scanId }),
        ...(priceQuery ? { priceQuery } : {}),
        ...(unchecked ? { unchecked } : {}),
        ...answerMarks(completed),
        grounded: wire,
      });
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
      const tierRefusal = photoTierRefusal();
      if (tierRefusal) {
        return json(200, {
          product: null,
          matchedBy: 'none',
          band: 'miss',
          catalogueUp: false,
          failure: 'photo_tier_unsafe',
          reason: 'photo_tier_unsafe',
          lowConfidence: true,
          confidenceReasons: ['no_answer:photo_tier_unsafe'],
          says: tierRefusal,
        });
      }
      const body = await readBody(req, MAX_PHOTO_BODY_BYTES);
      if (body === TOO_LARGE) return refuseTooLarge(MAX_PHOTO_BODY_BYTES);
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const p = body as Record<string, unknown>;
      if (typeof p.image !== 'string' || p.image.trim() === '') {
        return json(400, { error: 'image is required and must be a base64 string' });
      }
      const image = Buffer.from(p.image, 'base64');
      // Buffer.from ignores what it cannot decode rather than throwing, so an
      // empty result is the only signal that the string was not base64 at all.
      if (image.length === 0) {
        return json(400, { error: 'image did not decode as base64' });
      }
      if (imageKind(image) === null) {
        return json(400, { error: 'image must be a PNG or a JPEG' });
      }

      const device = typeof p.deviceId === 'string' && p.deviceId.trim() !== '' ? p.deviceId.trim() : UNATTRIBUTED;
      deviceForLog = device;
      /*
       * Counted after the body is read, which is deliberate and is the cost of
       * putting the device id in the body: there is nothing to count before
       * the bytes arrive. The 3 MiB cap is what bounds a flood, and this is
       * what bounds the spending.
       */
      if (!photoRateAllows(device)) {
        return json(429, {
          error: 'That is a lot of photos in a short time. Give it a few minutes and try again.',
        });
      }

      const tier: Tier = p.tier === 'pro' ? 'pro' : 'basic';
      const sharpnessRaw = Number(p.sharpness);
      const sharpness = Number.isFinite(sharpnessRaw) ? sharpnessRaw : 0;

      const photoStarted = Date.now();
      const telemetry = telemetryFrom(p);
      const where = locationFor(device, p.cell, p.storeId, p.storeName, {
        lat: p.lat,
        lon: p.lon,
        accuracy: p.accuracy,
        at: p.locatedAt,
      });
      /*
       * A PHOTO IS ONE GEMINI CALL: the image, the grounded search and the price
       * math in a single request (rule 1). No Claude, no catalogue lookup, no
       * second pass. The shelf price and the user's lines ride in this body
       * (`shelfPriceCents`, `thresholds`) so the verdict comes back inside the
       * same answer. `tier` is still read from old clients and ignored: the
       * model is picked per scan by `modelForScan` (2.5 and 3.x side by side).
       */
      const limitedPhoto = paidCallRefusal(req);
      if (limitedPhoto) return tooManyCalls(limitedPhoto.retryAfterSeconds);

      let completed: Completed;
      try {
        const mod = await geminiScanModule();
        completed = await completeGeminiScan({
          device,
          kind: 'photo',
          image,
          imageMediaType: imageKind(image) === 'png' ? 'image/png' : 'image/jpeg',
          sharpness,
          shelfPriceCents: mod.readShelfPriceCents(p.shelfPriceCents),
          thresholdsRaw: p.thresholds,
          context: contextFrom((key) => p[key]),
          telemetry,
          where,
          startedAt: photoStarted,
          writeScanRow: true,
        });
      } catch (err) {
        logError({ where: 'gemini.photo', deviceId: device, scanId: null, err });
        return json(200, {
          product: null,
          matchedBy: 'none',
          band: 'miss',
          catalogueUp: false,
          failure: 'model_client_error',
          reason: 'model_client_error',
          lowConfidence: true,
          confidenceReasons: ['no_answer:model_client_error'],
        });
      }
      const scanId = completed.scanId;
      scanForLog = scanId;

      /*
       * THE PHOTOGRAPH, ONLY IF THEY SAID SO. Plan items 9a and 6c.
       *
       * Three conditions, all of them necessary. The scan row has to exist,
       * because the file is named after its id and a photo with no row is a
       * photo nothing can ever find or delete. The device has to be a real
       * device, because the unattributed bucket is shared and a consent answer
       * cannot be attributed to it. And the device has to have said yes.
       *
       * The write is awaited rather than fired and forgotten: the path goes on
       * the row, and a row claiming a file that is still being written is the
       * kind of inconsistency that only shows up in the retention sweep three
       * months later.
       */
      if (scanId !== null && device !== UNATTRIBUTED && keepPhoto(device)) {
        const kind = imageKind(image);
        if (kind) {
          const stored = await savePhoto(scanId, image, kind);
          if (stored) updateScan(scanId, { photoPath: stored });
        }
      }

      const label = completed.label;
      const priceQuery: GroundedPriceQuery | null = label ? { text: label.label } : null;
      const unchecked = label
        ? { checked: false, source: 'photo', label: label.label, brand: label.brand, name: label.name, size: label.size, gtin: null }
        : null;
      if (unchecked) {
        recordEvent({
          deviceId: device,
          type: 'unchecked_answer',
          payload: { scanId, source: 'photo', failure: completed.run.failure, readAs: label?.label ?? null },
        });
      }
      const wire = wireFor(completed, groundedOwner(device), device);
      return json(200, {
        product: null,
        matchedBy: 'none',
        band: 'miss',
        category: null,
        categoryWhy: whyNot(completed),
        ring: null,
        otherCandidates: 0,
        route: null,
        catalogueUp: false,
        ms: completed.ms,
        passes: 1,
        candidates: [],
        confidence: null,
        sizeQuestion: null,
        readAs: label?.label ?? null,
        reason: unchecked ? 'unchecked' : (completed.run.failure ?? 'identity_unsure'),
        ...(scanId === null ? {} : { scanId }),
        ...(priceQuery ? { priceQuery } : {}),
        ...(unchecked ? { unchecked } : {}),
        ...answerMarks(completed),
        grounded: wire,
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
      deviceForLog = pricedDevice;
      const owner = groundedOwner(pricedDevice);

      /*
       * THE SECOND STALE PATH, and it is the one a tester hits first. This
       * bridge holds an answer for 30 minutes so the price sheet shows the
       * same call the scan made, and it has always known when that call
       * happened (`ScannedEntry.at`). Nothing read it, so a sheet reopened 20
       * minutes later said the price was checked now. The cache hit below was
       * the same bug with a six hour ceiling instead of a thirty minute one.
       */
      const recalled = recallScan(pricedDevice, scanKnown ? pricedScan : null, searchGtin, searchText);
      let answered: Pick<Completed, 'block' | 'run' | 'scanId' | 'checkedAt'> | null = recalled
        ? { run: recalled.run, block: recalled.block, scanId: recalled.scanId, checkedAt: new Date(recalled.at).toISOString() }
        : null;
      if (!answered) {
        const priceStarted = Date.now();
        // A scan row that exists and is this device's is attached to, not duplicated.
        const row = scanKnown ? getScan(pricedScan) : null;
        const attach = row !== null && row.device_id === pricedDevice;
        /*
         * A TYPED NAME IS NEVER A PAID CALL HERE EITHER. Jamin, 2026-09-23:
         * "typing a product should only search our catalogue and only return
         * when we have both the item and price." Free text with no barcode,
         * about no scan or about a typed scan, is answered from Shin's own data
         * exactly as `/api/identify` answers it, with no Gemini call and no
         * limiter (it spends nothing). A barcode, or a photo or barcode scan
         * this body names, still makes the one call below as before.
         */
        if (!searchGtin && searchText && (row === null || row.kind === 'text')) {
          const own = typedFromOwnData(
            searchText,
            pricedDevice,
            telemetryFrom(q),
            locationFor(pricedDevice, q.cell, q.storeId, q.storeName),
            priceStarted,
            attach ? pricedScan : null,
          );
          if (typeof own.scanId === 'number') scanForLog = own.scanId;
          return json(200, { ...own, kind: 'gemini' });
        }
        const limitedPrice = paidCallRefusal(req);
        if (limitedPrice) return tooManyCalls(limitedPrice.retryAfterSeconds);
        try {
          const mod = await geminiScanModule();
          answered = await completeGeminiScan({
            device: pricedDevice,
            kind: searchGtin ? 'barcode' : 'text',
            gtin: searchGtin,
            text: searchText,
            shelfPriceCents: mod.readShelfPriceCents(q.askingCents ?? q.shelfPriceCents),
            thresholdsRaw: q.thresholds,
            context: contextFrom((key) => q[key]),
            telemetry: telemetryFrom(q),
            where: locationFor(pricedDevice, q.cell, q.storeId, q.storeName),
            startedAt: priceStarted,
            existingScanId: attach ? pricedScan : null,
            writeScanRow: !attach,
          });
        } catch (err) {
          logError({ where: 'gemini.price', deviceId: pricedDevice, scanId: scanForLog, err });
          return json(200, {
            kind: 'gemini',
            failure: 'model_client_error',
            lowConfidence: true,
            confidenceReasons: ['no_answer:model_client_error'],
          });
        }
      }
      const asked = (await geminiScanModule()).readShelfPriceCents(q.askingCents ?? q.shelfPriceCents);
      return json(200, {
        kind: 'gemini',
        ...(answered.scanId === null ? {} : { scanId: answered.scanId }),
        ...answerMarks(answered),
        shelfPriceLate: asked !== null && answered.run.shelfPriceCents === null,
        grounded: wireFor(answered, owner, pricedDevice),
      });
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
         * here calls `recordCorrection`, so this number never becomes evidence
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
      const result = recordCorrection({
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
      return json(200, summariseScans(url.searchParams.get('deviceId')?.trim() || undefined));
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
      deviceForLog = deviceId;
      const ratedScan = Number(r.scanId);
      if (!scanExists(ratedScan)) {
        return json(400, { error: 'scanId must be the id of a scan this server recorded' });
      }
      scanForLog = ratedScan;
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
const SCAN_DB = process.env.SHIN_SCANS ?? fileURLToPath(new URL('./data/scans.db', import.meta.url));

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
/**
 * A MACHINE HALFWAY THROUGH THE SWITCH TO GEMINI IS THE DANGEROUS STATE.
 *
 * `SHIN_MODEL_PROVIDER=gemini` with no `GEMINI_API_KEY` is one environment
 * variable short of a working server, and the shape of the failure is what
 * makes it worth refusing to start over: the provider selection happens per
 * call, deep inside `identify/src/model.ts`, so a key-less gemini machine does
 * not fail at boot. It comes up, answers `/api/health`, serves every screen,
 * and then either quietly answers with Anthropic -- which is the OPPOSITE of
 * what the person setting that variable asked for, and is billed to a
 * different account -- or, once the provider throws instead of falling back,
 * refuses every single scan with the same nothing that a bad photo gives.
 * Both are invisible from outside, and the second is invisible until a shopper
 * is standing in an aisle.
 *
 * So it is checked here, with the free-tier guard and the database guard, in
 * `startupProblems`' own shape: one sentence naming the fix, reported with
 * everything else that is wrong rather than instead of it.
 *
 * NOT A CHECK ON THE KEY'S VALIDITY. This file cannot know whether a key
 * works, and a guard that pretended to would have to make a network call
 * before the port opens. Present and non-empty is the whole claim.
 */
function geminiKeyProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  if ((env.SHIN_MODEL_PROVIDER ?? '').trim().toLowerCase() !== 'gemini') return null;
  if ((env.GEMINI_API_KEY ?? '').trim() !== '') return null;
  return 'SHIN_MODEL_PROVIDER is set to gemini and GEMINI_API_KEY is empty, so every scan would fail. Set GEMINI_API_KEY; Gemini is the only provider a scan uses and Claude does not take over.';
}

const problems = startupProblems();
const keyProblem = geminiKeyProblem();
if (keyProblem) problems.push(keyProblem);
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error('Shin did not start. Nothing was changed on disk.');
  process.exit(1);
}

/*
 * Said at boot rather than only at the moment a shopper's photo is turned
 * away, because whoever starts this server is the only person who can change
 * the answer, and they are reading this screen now. It is not a problem in
 * `startupProblems`' sense: the server is starting, and every path but one is
 * whole.
 */
const tierRefusalAtBoot = photoTierRefusal();
if (tierRefusalAtBoot) console.error(tierRefusalAtBoot);

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
  console.error(sentence ?? `Shin could not open port ${PORT}: ${err instanceof Error ? err.message : String(err)}`);
  logError({ where: 'server.listen', err, detail: { port: PORT } });
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Shin is running.  http://localhost:${PORT}`);
  console.log('The engine behind it knows 7 products, because 7 is what has been priced by hand.');
  const scans = openScanStore(SCAN_DB);
  console.log(
    scans.db
      ? `Scans are being written down: ${scans.path}`
      : `Scans are NOT being written down (${scans.droppedWhy}). Everything else still works.`,
  );
  if (inviteRequired()) console.log('An invite code is required on every API call.');
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
  };
  sweep();
  setInterval(sweep, 24 * 60 * 60 * 1000).unref();

  // Attached after the port is open, never before: the screens have to come up
  // whether or not a 3.47 GB file is sitting where this expects it.
  void attachCatalogue();
});
