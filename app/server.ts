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

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize as normalizePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { priceIt } from '../spine/src/spine.ts';
import { defaultDeps } from '../spine/src/sources/registry.ts';
import { RecordedSource } from '../spine/src/sources/recorded.ts';
import { CATEGORY_RULES } from '../spine/src/categories.ts';
import type { SpineQuery } from '../spine/src/contract.ts';
import { categoryFor } from './src/category-map.ts';
import { alternativesFor, alternativesHeading } from '../catalogue/src/alternatives.ts';
import type { Candidate } from '../catalogue/src/search.ts';
/*
 * TYPES ONLY, AND THE VALUES ARRIVE BY DYNAMIC IMPORT BELOW.
 *
 * `identify/src/model.ts` imports `@anthropic-ai/sdk`, which is installed in
 * `identify/node_modules` and in no other package. A static import here would
 * make the whole server -- every screen, every route that has nothing to do
 * with a photo -- refuse to boot on a worktree where that install has not been
 * run, which CLAUDE.md records as a state fresh worktrees are actually in. So
 * the photo path is loaded on its first request and its absence is one route
 * answering a named failure rather than a server that will not start.
 */
import type {
  CatalogueCandidate,
  CatalogueLookup,
  CatalogueResult,
  IdentifyOutcome,
} from '../identify/src/identify.ts';
import type { FailureClass, Identifier, MessagesClient, Tier } from '../identify/src/model.ts';
import { lookupPrices } from '../price/src/lookup.ts';
import { recordCorrection } from '../price/src/corrections.ts';
import { ATTRIBUTION } from './src/attribution.ts';
import { packScope, packVersion, servePack } from './src/pack-route.ts';
import {
  correctScan,
  getScan,
  lastAnsweredScan,
  openScanStore,
  recentCategories,
  recordScan,
  updateScan,
  type ScanKind,
} from './src/scans.ts';
import { summariseScans, UNATTRIBUTED } from './src/scan-summary.ts';
import { keepLocation, keepPhoto, readConsent, writeConsent } from './src/consent.ts';
import { deleteRating, isRating, isRatingReason, rateScan, scanExists } from './src/ratings.ts';
import { recordEvent, serialisePayload } from './src/events.ts';
import { parseCell, storesNear, type StoreFetcher } from './src/stores.ts';
import { INVITE_EXEMPT, INVITE_HEADER, INVITE_REFUSAL, inviteAllows, inviteRequired } from './src/invite.ts';
import { logError } from './src/errlog.ts';
import { listenProblem, startupProblems } from './src/startup.ts';
import { estimatedCostCents } from './src/model-cost.ts';
import { recordAccess } from './src/access-log.ts';
import { handleAdmin } from './src/admin.ts';
import { recordShutterRequest, saveShutterFrame } from './src/shutter-log.ts';
import { savePhoto, sweepPhotos } from './src/photos.ts';
import { dailyLatency } from './src/latency.ts';

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
/**
 * The /api/alternatives response body, built in one place.
 *
 * GENERIC OVER THE ROW ON PURPOSE, and that is the whole point of the
 * function. The catalogue decides what an alternative is and what is written
 * on it; this route decides nothing. `ring` and `ringTag` -- the leaf/parent
 * distinction the verdict sheet labels a looser swap with -- arrive on the row
 * and leave on the row, and a `T` the server never names cannot be narrowed,
 * reshaped or picked apart on the way through. Equally it cannot be INVENTED:
 * an older catalogue build that sends no `ring` produces a response with no
 * `ring`, and the client's rule (missing is leaf, never looser) is the one
 * place that absence is interpreted.
 *
 * Exported for app/test/cheaper-rings.test.mjs, which hands it a row carrying
 * the new fields and asserts the body came back identical. A passthrough is
 * exactly the kind of claim that is true until somebody adds a `.map`.
 */
export function alternativesPayload<T>(
  catalogueUp: boolean,
  heading: string,
  alternatives: readonly T[],
): { catalogueUp: boolean; heading: string; alternatives: readonly T[] } {
  return { catalogueUp, heading, alternatives };
}

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
 * `identify/src/identify.ts` has been written and tested since 2026-09-05 and
 * was imported by nothing (D-024, D-047). This is the import. The eye already
 * produces the right thing -- a burst-scored, object-cropped, 1568 px PNG --
 * and `camera.js` has been holding it as `lastCrop` and never sending it.
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
 * The model, built once and lazily.
 *
 * Lazily because constructing it reads credentials and loads an SDK, and this
 * server has to boot on a machine with neither. Once because it is stateless
 * across calls and the daily spend cap it enforces lives in its module, not in
 * the instance.
 */
let photoModel: Identifier | null = null;

/**
 * TEST ONLY. Nothing in the product calls this.
 *
 * The HTTP edge is the thing worth testing here -- a real socket, a real body,
 * a real 413 -- and the one thing that cannot be real in a test is the vision
 * call, because there is no API key on this machine and a test that needed one
 * would be a test that never runs. So the model and the catalogue are the two
 * things this seam can replace, and it replaces nothing else: the body
 * reading, the magic-byte check, the rate limit, the outcome mapping and the
 * scan row are all the shipped code in every test below.
 *
 * `model` is a real `Identifier` built with a fake `MessagesClient`, which is
 * how `identify/test/model.test.ts` does it, so the retry policy, the timeout
 * and the failure classification are the real ones.
 */
export function setIdentifierForTests(
  fake: { model?: Identifier; lookup?: CatalogueLookup } | null,
): void {
  photoTestDouble = fake;
  photoModel = null;
}
let photoTestDouble: { model?: Identifier; lookup?: CatalogueLookup } | null = null;

/**
 * The daily dollar cap, wired. Plan item 13c.
 *
 * WHAT WAS WRONG UNTIL 2026-09-11: this function built a bare `Identifier`,
 * which constructs its own Anthropic client with no ceiling on it. The cap had
 * been written, tested and merged in `identify/src/cap.ts`, and it was
 * protecting nothing, because nothing in the running server ever went through
 * it. That is worse than having no cap: every person downstream, including the
 * one putting a card on the account, believes there is one.
 *
 * WRAPPED AT THE CLIENT, not at the call sites, and that is `cap.ts`'s design
 * rather than a choice made here. `Identifier` builds both of its calls -- the
 * read and the pick -- out of one `#send` that ends at
 * `client.messages.create`, so a wrapper around the client is a ceiling that a
 * third call site added next month cannot get around by forgetting to ask.
 * The constructor's second argument exists for exactly this.
 *
 * The API key is still the constructor's to find. Passing `undefined` is what
 * the bare version did and keeps `loadDotEnv` in charge of it, so wiring the
 * cap did not quietly become a change to how credentials are read.
 *
 * WHAT HAPPENS WHEN IT TRIPS: `withSpendCap` throws a `ModelCallError` whose
 * failure class is `spend_cap_reached`, that class travels out through
 * `IdentifyStage` as the outcome's `failure`, and the scan row records it
 * verbatim (see the `recordScan` call on the photo route, which passes
 * `answer.failure` and has never had a default). So a capped day reads back as
 * a capped day rather than as a beta full of unreadable photographs, which is
 * the whole reason `failure_class` is a column.
 */
async function modelOnce(): Promise<Identifier> {
  if (photoTestDouble?.model) return photoTestDouble.model;
  if (!photoModel) {
    const [{ Identifier }, { withSpendCap }, { loadDotEnv }] = await Promise.all([
      import('../identify/src/model.ts'),
      import('../identify/src/cap.ts'),
      import('../identify/src/env.ts'),
    ]);
    /*
     * THE SDK IS RESOLVED THROUGH `identify`, AND IT HAS TO BE.
     *
     * `@anthropic-ai/sdk` is installed in `identify/node_modules` and nowhere
     * else, which is this repo's arrangement (CLAUDE.md: each package installs
     * its own dependencies) and is the reason the type imports at the top of
     * this file are types only. A bare `import('@anthropic-ai/sdk')` from here
     * resolves from `app/` and fails with ERR_MODULE_NOT_FOUND; checked on
     * 2026-09-11 rather than assumed. `model.ts`'s own static import works
     * because the specifier is resolved relative to the file that wrote it.
     *
     * So the package is located from `identify`'s own directory and imported
     * by path. It is one line of indirection, and the alternative is either a
     * dependency duplicated into `app/package.json` (a second copy of an SDK,
     * free to drift from the one the identify package is tested against) or an
     * uncapped model client, which is the thing being fixed.
     *
     * A FAILURE HERE IS LOUD. If the SDK cannot be found, this throws, the
     * photo route classifies it like any other model failure, and the scan row
     * says so. It must never fall back to a bare `new Identifier()`, because
     * that is an uncapped client arriving silently through the one code path
     * written to prevent it.
     */
    const { createRequire } = await import('node:module');
    const { pathToFileURL } = await import('node:url');
    const fromIdentify = createRequire(fileURLToPath(new URL('../identify/package.json', import.meta.url)));
    const sdk = await import(pathToFileURL(fromIdentify.resolve('@anthropic-ai/sdk')).href);
    const Anthropic = (sdk.default ?? sdk.Anthropic) as new (options: { maxRetries: number }) => unknown;

    /*
     * `loadDotEnv` by hand, because passing a client turns off the
     * constructor's own call to it (`if (!apiKey && !client) loadDotEnv()`).
     * Without this line the key would stop being read from the environment
     * file the moment the cap was wired, which is the kind of thing that looks
     * like the cap breaking the beta.
     *
     * `maxRetries: 0` is copied from `model.ts`'s own construction and is load
     * bearing twice over: that file runs its own two-attempt policy, so an SDK
     * retrying underneath it would mean the visible policy is not the one that
     * runs, and every hidden retry would be a call that spends without the cap
     * ever being asked.
     */
    loadDotEnv();
    const client = new Anthropic({ maxRetries: 0 }) as MessagesClient;
    photoModel = new Identifier(undefined, withSpendCap(client));
  }
  return photoModel;
}

/**
 * The catalogue, in the shape `IdentifyStage` asks for.
 *
 * It is the SAME machinery `/api/identify` runs: `fastLookup.byGtin` for a
 * barcode (which also tries the UPC-A and EAN-13 forms of one code) and
 * `searchRouted` for everything else, including the confident-to-ambiguous
 * downgrade a narrowed search earns. Written as a factory rather than a
 * constant because it closes over one request's device id and hands back the
 * raw catalogue rows, which carry the source and the category path this file
 * needs to name a category and which `CatalogueCandidate` does not declare.
 */
function photoLookup(
  deviceId: string | null,
  seen: { route: Route | null; rows: Map<string, Candidate> },
): CatalogueLookup {
  const miss: CatalogueResult = { band: 'miss', candidates: [], ring: null, matchedBy: 'none' };

  return async (q) => {
    if (!fastLookup || !searchService) return miss;
    // Cap 10, per the lane contract. Past that the fused list is noise and the
    // pick pass is being asked to read a page of it.
    const limit = Math.min(Math.max(1, Math.round(q.limit ?? 5)), 10);

    const keep = (result: CatalogueResult): CatalogueResult => {
      for (const c of result.candidates) seen.rows.set(c.code, c as unknown as Candidate);
      return result;
    };

    /*
     * Barcode first and on this thread, the same order and the same reason
     * `/api/identify` gives: a fact beats an opinion, and this one costs
     * 0.2 ms against all 5,182,591 rows.
     */
    if (q.gtin) {
      const hit = (fastLookup.byGtin(q.gtin) ?? null) as Candidate | null;
      if (hit) {
        return keep({
          band: 'confident',
          candidates: [hit as unknown as CatalogueCandidate],
          ring: null,
          matchedBy: 'gtin',
        });
      }
      // Read fine and we do not have it. A gap, not a camera failure -- unless
      // there is text to fall back to, which is what the cascade is for.
      if (!q.text) return miss;
    }

    const routed = await searchRouted(
      {
        text: q.text,
        brand: q.brand,
        sizeValue: q.sizeValue,
        sizeUnit: q.sizeUnit,
        limit,
        vectors: vectorsOn,
      },
      deviceId,
    );
    seen.route = routed.route;
    const raw = routed.result as {
      band: CatalogueResult['band'];
      matchedBy: CatalogueResult['matchedBy'];
      candidates: CatalogueCandidate[];
      ring: { label: string; members: CatalogueCandidate[] } | null;
    };
    // A narrowed answer is never a confident one. `/api/identify` and
    // `/api/search` both apply this; a third caller of the same search does not
    // get to skip it.
    const band = routed.restricted && !routed.fellBack && raw.band === 'confident' ? 'ambiguous' : raw.band;
    return keep({ band, candidates: raw.candidates, ring: raw.ring, matchedBy: raw.matchedBy });
  };
}

/**
 * What the photo route answers with: everything `/api/identify` returns, plus
 * the three things only a model-read identity has.
 */
interface PhotoAnswer extends Identified {
  /** How many vision calls it took. 1 today; the pick pass makes it 2. */
  readonly passes: 1 | 2;
  /** The class of what went wrong, for the log and for the screen's copy. Null when nothing did. */
  readonly failure: FailureClass | 'not_in_catalogue' | null;
  /** Up to five, populated only when the answer is unsure and the shopper has to pick. */
  readonly candidates: readonly { code: string; brand: string | null; name: string; size: string | null }[];
  /** One word the client maps to a screen, so it never has to infer one from three fields. */
  readonly reason: 'identified' | 'identity_unsure' | 'not_in_catalogue' | FailureClass;
  /** The band, the score and the plain sentence naming what limits it. */
  readonly confidence: { readonly band: 'high' | 'medium' | 'low'; readonly score: number; readonly because: string } | null;
  /** Decision 19: set when two sizes of one product were both plausible. */
  readonly sizeQuestion: readonly { code: string; name: string; size: string | null }[] | null;
  /**
   * What the model actually read off the pack, brand then name, before the
   * catalogue was asked. Null when it read nothing.
   *
   * The screen can say "we read that as X" on a miss, and it is what the scan
   * row files as the query: on this route the query IS the reading, the same
   * way the barcode digits are the query on `/api/identify`.
   */
  readonly readAs: string | null;
}

const sizeText = (c: { sizeValue: number | null; sizeUnit: string | null; quantity?: string | null }): string | null =>
  c.sizeValue !== null && c.sizeUnit ? `${c.sizeValue} ${c.sizeUnit}` : (c.quantity ?? null);

/**
 * Run one photo through identification and turn the outcome into an answer.
 *
 * NEVER THROWS AND NEVER 500s ON A MODEL FAILURE. `IdentifyStage` already
 * turns every `ModelCallError` into an `unreadable` outcome carrying its
 * class, which is an answer: the person gets one sentence and a repair they
 * can perform, and the log gets the distinction the sentence deliberately
 * does not carry. A 500 here would tell the screen to retry around it.
 */
async function identifyPhoto(
  image: Buffer,
  tier: Tier,
  sharpness: number,
  deviceId: string | null,
): Promise<PhotoAnswer> {
  const started = Date.now();
  const base = (over: Partial<PhotoAnswer>): PhotoAnswer => ({
    product: null,
    matchedBy: 'none',
    band: 'miss',
    category: null,
    categoryWhy: '',
    ring: null,
    otherCandidates: 0,
    route: null,
    catalogueUp: fastLookup !== null,
    ms: Date.now() - started,
    passes: 1,
    failure: null,
    candidates: [],
    reason: 'identified',
    confidence: null,
    sizeQuestion: null,
    readAs: null,
    ...over,
  });

  /** Brand then name, as the model read them. The catalogue has not spoken yet. */
  const readingOf = (o: IdentifyOutcome): string | null => {
    const p = o.reading?.product;
    if (!p) return null;
    return [p.brand, p.name].filter(Boolean).join(' ').trim() || null;
  };

  const seen: { route: Route | null; rows: Map<string, Candidate> } = { route: null, rows: new Map() };
  const { IdentifyStage } = await import('../identify/src/identify.ts');
  const stage = new IdentifyStage(photoTestDouble?.lookup ?? photoLookup(deviceId, seen), await modelOnce());
  const outcome: IdentifyOutcome = await stage.fromCrop(new Uint8Array(image), null, tier, sharpness);
  // Added on the outcome by lane A; absent until then, and 1 is the truth in
  // that case rather than a placeholder.
  const passes = ((outcome as { passes?: 1 | 2 }).passes ?? 1) as 1 | 2;

  if (outcome.kind === 'unreadable') {
    return base({
      passes,
      failure: outcome.failure,
      reason: outcome.failure,
      categoryWhy: outcome.because,
      route: seen.route,
      readAs: readingOf(outcome),
    });
  }

  if (outcome.kind === 'not_in_catalogue') {
    return base({
      passes,
      failure: 'not_in_catalogue',
      reason: 'not_in_catalogue',
      categoryWhy: `We read that as ${outcome.readAs} and we do not have it.`,
      ring: outcome.ring
        ? { label: outcome.ring.label, members: outcome.ring.members.map((m) => ({ code: m.code, name: m.name })) }
        : null,
      route: seen.route,
      readAs: readingOf(outcome) ?? outcome.readAs,
    });
  }

  /*
   * Identified. The raw catalogue row is preferred over the structural
   * candidate because only the raw row carries the source and the category
   * path, and `category-map.ts` needs both to name a kind. A fake lookup in a
   * test hands back the structural shape alone, so this falls back to it
   * rather than requiring the richer one.
   */
  const chosen = outcome.chosen;
  const row = (seen.rows.get(chosen.code) ?? chosen) as Candidate;
  const verdict =
    row.source !== undefined
      ? categoryFor({ source: row.source, categoryPath: row.categoryPath, leafCategory: row.leafCategory ?? null })
      : { category: null, why: '' };

  /*
   * Decision 17 as the lane contract states it: there is no `unsure` arm.
   * Unsure is a low band with somewhere else to go, and the candidate list is
   * what makes it a question rather than a shrug.
   */
  const unsure = outcome.confidence.band === 'low' && outcome.alternates.length > 0;

  return base({
    product: {
      code: chosen.code,
      name: chosen.name,
      /* The raw row when there is one, because only it carries the column; the
         structural candidate a test hands back does not, and null is the
         honest answer there rather than a thrown property access. */
      nameFr: row.nameFr ?? null,
      brands: chosen.brands,
      quantity: chosen.quantity,
      sizeValue: chosen.sizeValue,
      sizeUnit: chosen.sizeUnit,
      soldInCanada: row.soldInCanada ?? false,
    },
    matchedBy: outcome.reading === null ? 'gtin' : 'hybrid',
    band: outcome.confidence.band === 'high' ? 'confident' : 'ambiguous',
    category: verdict.category,
    categoryWhy: verdict.why || outcome.confidence.because,
    otherCandidates: outcome.alternates.length,
    route: seen.route,
    passes,
    reason: unsure ? 'identity_unsure' : 'identified',
    confidence: {
      band: outcome.confidence.band,
      score: outcome.confidence.score,
      because: outcome.confidence.because,
    },
    candidates: unsure
      ? [chosen, ...outcome.alternates].slice(0, 5).map((c) => ({
          code: c.code,
          brand: c.brands,
          name: c.name,
          size: sizeText(c),
        }))
      : [],
    sizeQuestion:
      outcome.sizeQuestion?.options.map((c) => ({ code: c.code, name: c.name, size: sizeText(c) })) ?? null,
    readAs: readingOf(outcome),
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
 * THE EXACT FIX, added migration 8, 2026-09-14. `exact` carries what the
 * device's own GPS read before it was snapped to the cell: latitude,
 * longitude, the OS's own accuracy figure, and when the reading was taken.
 * Gated by the exact same consent check as the cell, because it is the same
 * consent question ("may we keep where you are") answered at higher
 * precision, not a second question. A device that sent a cell but no exact
 * reading (no OS permission, or an older client) gets nulls for these four and
 * the cell as before -- the two halves are independent on the wire and only
 * share the one gate.
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
  const num = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  // A timestamp is kept only when it actually parses as one -- HARD RULE 3 in
  // the agent repo governs here too: a reading with no honest time is not
  // given the server's own arrival time as a stand-in for the OS's.
  const at = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  };
  const lat = num(exactRaw.lat);
  const lon = num(exactRaw.lon);
  return {
    cell: cell?.text ?? null,
    storeId: text(storeIdRaw),
    storeName: text(storeNameRaw),
    // Both coordinates or neither: a lone latitude with no longitude names no
    // point on earth and is not a partial fact worth keeping.
    exactLat: lat !== null && lon !== null ? lat : null,
    exactLon: lat !== null && lon !== null ? lon : null,
    exactAccuracy: lat !== null && lon !== null ? num(exactRaw.accuracy) : null,
    exactAt: lat !== null && lon !== null ? at(exactRaw.at) : null,
  };
}

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

  const json = (status: number, body: unknown) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(payload);
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

    if (url.pathname === '/api/catalogue') return json(200, await catalogue());
    if (url.pathname === '/api/categories') return json(200, categories());
    if (url.pathname === '/api/scenarios') return json(200, scenarios());

    /*
     * The real catalogue, in front of a user for the first time.
     *
     * GET so a barcode read can fire it without a body and so it is cacheable
     * later. The barcode path costs 0.2 ms in the catalogue process against all
     * 5,182,591 rows, which is why the pipeline puts it first and why it is
     * unmetered: it is the cheapest thing in the product and it settles
     * identity outright.
     */
    if (url.pathname === '/api/identify') {
      const gtin = url.searchParams.get('gtin') ?? undefined;
      // Trimmed, as `/api/search` trims `q`: `?text=%20%20` used to pass the
      // presence guard, run a real search on whitespace, and write a refused
      // scan row that dragged the identity rate down for nothing.
      const text = url.searchParams.get('text')?.trim() || undefined;
      if (!gtin && !text) return json(400, { error: 'gtin or text is required' });
      const sizeValue = Number(url.searchParams.get('sizeValue') ?? '');
      const device = url.searchParams.get('deviceId')?.trim() || UNATTRIBUTED;
      deviceForLog = device;
      /*
       * ON A QUERY STRING RATHER THAN A BODY, and it is the one place this
       * lane's contract had to be read rather than copied. The contract names
       * `appVersion`, `platform` and `cell` as "client-sent telemetry fields on
       * identify bodies"; this identify route is a GET and has no body, by a
       * deliberate decision above (a barcode read fires it with no body and it
       * is cacheable later). So the same three names arrive as query
       * parameters here and in the body on the photo route, which is the only
       * reading that leaves both routes as they are.
       */
      const identifyStarted = Date.now();
      const telemetry = telemetryFrom(url.searchParams);
      const where = locationFor(
        device,
        url.searchParams.get('cell'),
        url.searchParams.get('storeId'),
        url.searchParams.get('storeName'),
        {
          lat: url.searchParams.get('lat'),
          lon: url.searchParams.get('lon'),
          accuracy: url.searchParams.get('accuracy'),
          at: url.searchParams.get('locatedAt'),
        },
      );
      const answer = await identify({
        gtin,
        text,
        brand: url.searchParams.get('brand') ?? undefined,
        sizeValue: Number.isFinite(sizeValue) && sizeValue > 0 ? sizeValue : undefined,
        sizeUnit: url.searchParams.get('sizeUnit') ?? undefined,
        /*
         * The same id the scan is filed under, which is what makes the prior
         * this device's own rather than everybody's. An unattributed scan
         * routes on the unattributed history, which is the honest reading of
         * "we do not know who this is": it is one bucket, it is disclosed on
         * the answer like any other route, and it never reaches across to a
         * device that did identify itself.
         */
        deviceId: device,
      });

      /*
       * One row per scan, written here and nowhere else.
       *
       * HERE, because this is the act: a person pointed at a thing and asked
       * what it is. Pricing is a second question about an answer they already
       * have, and writing a row there too would count one scan twice and make
       * every rate depend on how far down the screen somebody got.
       *
       * WHAT 'answered' MEANS ON THIS ROW is that the catalogue NAMED the
       * thing, not that anybody was given a price. The two numbers are far
       * apart (three products can be priced in a store, measured 2026-09-05)
       * and `scan-summary.ts` never calls this one the answer rate without the
       * word identity in front of it.
       *
       * A scan whose catalogue was not attached is not recorded at all: it is
       * a fact about this machine's setup, and mixing it into the answer rate
       * would report a missing file as a product that could not be identified.
       */
      let scanId: number | null = null;
      if (answer.catalogueUp) {
        scanId = recordScan({
          deviceId: device,
          kind: (gtin ? 'barcode' : 'text') as ScanKind,
          query: gtin ?? text ?? '',
          resolvedCode: answer.product?.code ?? null,
          resolvedLabel: answer.product?.name ?? null,
          source: answer.matchedBy,
          outcome: answer.product ? 'answered' : 'refused',
          /*
           * What the app decided this was, so the next scan can be routed. It
           * is category-map.ts's verdict on the product's own tags, taken at
           * the moment it was made; null when it would not name a kind, and a
           * null is skipped by the reader rather than counted as a vote.
           */
          category: answer.category,
          /*
           * WHY IT WAS REFUSED, 2026-09-08.
           *
           * The beta readiness audit's point: a bare 'refused' cannot tell an
           * outage from a photo nobody could have read, so a beta spent inside
           * one would look like a beta full of bad photographs. This route only
           * ever produces one of them: the catalogue answered and did not have
           * the thing. The model-side classes reach this column from the vision
           * path (identify/src/model.ts's FailureClass), which has no route yet.
           */
          failureClass: answer.product ? null : 'not_in_catalogue',
          /*
           * The conditions the answer was produced under. Plan item 9e.
           *
           * The latency is measured here and not on the client, because what
           * this column has to be comparable against is other rows in the same
           * column; a phone's own stopwatch includes a network the server
           * cannot see and varies by handset. The client's round trip is a
           * different and also useful number, and it belongs in the event log.
           */
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
        scanForLog = scanId;
        /*
         * Which source answered, as an event. Plan item 10b's server half.
         * One line per identify, so a week of rows says how often the barcode
         * path settled it outright and how often the catalogue was asked to
         * search, which is the number that decides whether the vision path is
         * worth its cost.
         */
        recordEvent({
          deviceId: device,
          type: answer.product ? 'source_used' : 'refusal',
          payload: {
            scanId,
            kind: gtin ? 'barcode' : 'text',
            matchedBy: answer.matchedBy,
            reason: answer.product ? null : 'not_in_catalogue',
            ms: Date.now() - identifyStarted,
          },
        });
      }

      /*
       * THE SCAN ID GOES BACK WITH THE ANSWER. Plan item 7a.
       *
       * It is what lets a rating, a correction and a typed price attach to the
       * exact scan they are about instead of being matched back to one by
       * guessing from the device and the product code. The guess is still
       * there as a fallback (`lastAnsweredScan`, on the correction route) and
       * it is still the only thing a client built before today can use.
       *
       * ABSENT WHEN THE WRITE DROPPED, never zero and never a placeholder. A
       * scan the log could not record has no id, and a client holding a made-up
       * one would file a rating against a row that does not exist.
       */
      return json(200, scanId === null ? answer : { ...answer, scanId });
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
      const answer = await identifyPhoto(image, tier, sharpness, device === UNATTRIBUTED ? null : device);
      const photoMs = Date.now() - photoStarted;

      /*
       * WHAT THE MODEL ACTUALLY SAID, kept whole. Plan item 9b.
       *
       * Until now the candidates never left the server and only the chosen
       * label was written down, which means the one question worth asking
       * about a wrong identification -- was the right row in the list and did
       * we pick the wrong one, or was it never in the list at all -- could not
       * be answered from the record at all. Those are opposite defects with
       * opposite fixes (the ranker, or the catalogue), and telling them apart
       * needs the list.
       *
       * WHAT IS NOT IN IT: the image, in any form. This is a JSON column in a
       * database that gets backed up nightly to a laptop, and a photograph
       * belongs in the photos folder behind the consent flag or nowhere.
       */
      const modelJson = JSON.stringify({
        readAs: answer.readAs,
        matchedBy: answer.matchedBy,
        band: answer.band,
        confidence: answer.confidence,
        reason: answer.reason,
        failure: answer.failure,
        passes: answer.passes,
        chosen: answer.product ? { code: answer.product.code, name: answer.product.name } : null,
        otherCandidates: answer.otherCandidates,
        candidates: answer.candidates,
        sizeQuestion: answer.sizeQuestion,
        ring: answer.ring,
        route: answer.route,
        tier,
        sharpness,
      });

      /*
       * A call that never reached the model cost nothing, and `reachedModel`
       * is how that is said rather than assumed. The two failure classes that
       * are decided before the request goes out are the spend cap and a photo
       * the local checks rejected; everything else, including a timeout and an
       * outage, was a call that was made and may well be billed.
       */
      const reachedModel = answer.failure !== 'spend_cap_reached';

      /*
       * One row per call, the same rule `/api/identify` states: this is the
       * act, and pricing is a second question about an answer somebody already
       * has. Unlike that route, this one records even when the catalogue is
       * not attached, because the model failure classes are facts about US and
       * a beta run inside an outage has to be readable afterwards -- which is
       * the whole reason `failure_class` exists.
       */
      const scanId = recordScan({
        deviceId: device,
        kind: 'photo' as ScanKind,
        // What was READ, not what was matched. A row whose query is the
        // catalogue's own name for the product cannot be used afterwards to
        // ask why the match was wrong.
        query: answer.readAs ?? '',
        resolvedCode: answer.product?.code ?? null,
        resolvedLabel: answer.product?.name ?? null,
        source: answer.matchedBy,
        outcome: answer.product ? 'answered' : 'refused',
        category: answer.category,
        failureClass: answer.failure,
        modelJson,
        modelCostCents: estimatedCostCents(tier, answer.passes, reachedModel),
        appVersion: telemetry.appVersion,
        platform: telemetry.platform,
        latencyMs: photoMs,
        cell: where.cell,
        storeId: where.storeId,
        storeName: where.storeName,
        exactLat: where.exactLat,
        exactLon: where.exactLon,
        exactAccuracy: where.exactAccuracy,
        exactAt: where.exactAt,
      });
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

      // The server half of the event log, plan item 10b: a model call was
      // made, at what tier, over how many passes, and what it cost by estimate.
      recordEvent({
        deviceId: device,
        type: 'model_call',
        payload: {
          scanId,
          tier,
          passes: answer.passes,
          failure: answer.failure,
          reachedModel,
          costCents: estimatedCostCents(tier, answer.passes, reachedModel),
          ms: photoMs,
        },
      });

      return json(200, scanId === null ? answer : { ...answer, scanId });
    }

    if (url.pathname === '/api/price') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const q = body as Record<string, unknown>;
      /*
       * Noted before the work, not after, so that a failure inside the pricing
       * is logged against the scan it was about. An assignment after the call
       * only ever runs when nothing went wrong, which is the one case the
       * error log does not need (plan item 39a).
       */
      const pricedScan = Number(q.scanId);
      if (Number.isInteger(pricedScan) && pricedScan > 0) scanForLog = pricedScan;
      const query: SpineQuery = {
        text: typeof q.text === 'string' ? q.text : undefined,
        gtin: typeof q.gtin === 'string' ? q.gtin : undefined,
        category: q.category as SpineQuery['category'],
        askingCents: typeof q.askingCents === 'number' ? q.askingCents : undefined,
        askingSeller: typeof q.askingSeller === 'string' ? q.askingSeller : undefined,
        asOf: typeof q.asOf === 'string' ? q.asOf : undefined,
      };
      // A refusal is a 200. It is a correct answer, and any client that treats
      // it as an error will start retrying around the one safety mechanism here.
      const priced = await priceIt(query, defaultDeps());

      /*
       * THE VERDICT AS IT WAS SHOWN, written onto the scan it belongs to.
       * Plan item 9d.
       *
       * AS SHOWN, not as recomputable, and that is the entire reason this is a
       * column rather than a query. A verdict is a function of the price
       * evidence at one moment, and the evidence moves every time the crawler
       * runs. Re-deriving next week what a tester saw today answers a different
       * question from the one they will be asked about.
       *
       * The scan id is optional on this body: a price lookup can be asked
       * about a product nobody scanned (the catalogue screen does exactly
       * that), and a body without one prices the thing and writes nothing.
       * A refusal writes nothing either, because there was no verdict to show.
       */
      if (Number.isInteger(pricedScan) && pricedScan > 0 && priced.kind === 'verdict') {
        updateScan(pricedScan, {
          verdictTier: priced.tier,
          verdictConfidence: priced.confidence.band,
          verdictSellers: priced.confidence.distinctSellers,
        });
      }
      return json(200, priced);
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
     * Cheaper same-category alternatives for a product, given the price the
     * shopper is being asked to pay.
     *
     * GET, matching /api/identify: this is a lookup with two simple scalar
     * inputs (a code and a price), it changes nothing, and a GET is what a
     * scan screen can fire straight from a query string and retry safely,
     * the same reasoning /api/identify already gives for its own shape.
     *
     * An empty list is a 200 with the heading, not a 404 and not an error --
     * the same rule /api/price documents above: a refusal to name a cheaper
     * option is a correct answer, and a client that treats an empty list as
     * failure will retry around it exactly the way a client retrying a
     * refused verdict would.
     *
     * No timeout wrapper, unlike /api/identify and /api/search: this route
     * never reaches `searchService` (the worker) or the network. `byGtin`,
     * the `product_category` query inside `alternativesFor`, and the price
     * lookup are all synchronous, in-process, indexed reads with no scan that
     * grows unbounded the way a fallen-through vector search does, so there
     * is nothing here the identify()/search() timeout exists to guard against.
     */
    if (url.pathname === '/api/alternatives') {
      const code = url.searchParams.get('code')?.trim();
      const askingRaw = Number(url.searchParams.get('askingCents') ?? '');
      if (!code || !Number.isFinite(askingRaw) || askingRaw <= 0) {
        return json(400, { error: 'code and askingCents (a positive number of cents) are required' });
      }
      const askingCents = Math.round(askingRaw);

      if (!fastLookup || !catalogueDb) {
        return json(200, alternativesPayload(false, 'The catalogue is not attached, so nothing was looked up.', []));
      }

      // byGtin, not a bespoke code lookup: it already tries the UPC-A and
      // EAN-13 forms of the same code, and "a barcode or a code identifying
      // the product" is exactly the ambiguity that exists to resolve.
      const original = fastLookup.byGtin(code) as Candidate | null;
      if (!original) {
        return json(200, alternativesPayload(true, 'We have not seen this one.', []));
      }

      const alternatives = await alternativesFor(catalogueDb, original, askingCents, lookupPrices);
      return json(200, alternativesPayload(true, alternativesHeading(original, alternatives.length), alternatives));
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
const problems = startupProblems();
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error('Shin did not start. Nothing was changed on disk.');
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
  };
  sweep();
  setInterval(sweep, 24 * 60 * 60 * 1000).unref();

  // Attached after the port is open, never before: the screens have to come up
  // whether or not a 3.47 GB file is sitting where this expects it.
  void attachCatalogue();
});
