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
import { lookupPrices } from '../price/src/lookup.ts';
import { recordCorrection } from '../price/src/corrections.ts';
import { ATTRIBUTION } from './src/attribution.ts';
import { packScope, packVersion, servePack } from './src/pack-route.ts';

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
let catalogueWhyNot = 'not attempted yet';
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
};

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
async function identify(query: {
  gtin?: string;
  text?: string;
  brand?: string;
  sizeValue?: number;
  sizeUnit?: string;
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
        leafCategory: string | null;
        categoryPath: string[];
        source: string;
      }[];
    ring: { label: string; members: { code: string; name: string }[] } | null;
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
        result = (await searchService!.search({ ...query, vectors: vectorsOn })) as Result;
      }
    } else {
      result = (await searchService!.search({ ...query, vectors: vectorsOn })) as Result;
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
 * a megabyte-sized mouth to feed for the sake of a route none of them are. When
 * the upload route lands it passes its own limit here, and this one does not
 * move.
 *
 * The number is deliberately small. It is not tuned for memory (8 KiB is
 * nothing); it is tuned to say what the routes accept, so that anything else
 * is refused at the first chunk rather than parsed and then argued with.
 */
const MAX_JSON_BODY_BYTES = 8 * 1024;

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

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
  const refuseTooLarge = () => {
    const answer = () => {
      if (res.writableEnded) return;
      res.writeHead(413, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'close',
      });
      res.end(JSON.stringify({ error: `body is over the ${MAX_JSON_BODY_BYTES} byte limit` }));
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

  try {
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
      const text = url.searchParams.get('text') ?? undefined;
      if (!gtin && !text) return json(400, { error: 'gtin or text is required' });
      const sizeValue = Number(url.searchParams.get('sizeValue') ?? '');
      return json(
        200,
        await identify({
          gtin,
          text,
          brand: url.searchParams.get('brand') ?? undefined,
          sizeValue: Number.isFinite(sizeValue) && sizeValue > 0 ? sizeValue : undefined,
          sizeUnit: url.searchParams.get('sizeUnit') ?? undefined,
        }),
      );
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
        const result = (await searchService.search({ text, limit, vectors: vectorsOn })) as {
          band: 'confident' | 'ambiguous' | 'miss';
          matchedBy: 'gtin' | 'hybrid' | 'none';
          candidates: unknown[];
          ring: unknown;
        };
        return json(200, { catalogueUp: true, vectorsOn, ...result, ms: Date.now() - started });
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

    if (url.pathname === '/api/price') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === TOO_LARGE) return refuseTooLarge();
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const q = body as Record<string, unknown>;
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
      return json(200, await priceIt(query, defaultDeps()));
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
      const kind = c.kind === 'promotional' ? 'promotional' : 'regular';
      const result = recordCorrection({
        clientId,
        deviceId,
        code: str(c.code),
        productId: str(c.productId),
        label: str(c.label),
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

      return result.ok
        ? json(200, { stored: true, id: result.id })
        : json(200, { stored: false, why: result.why });
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
        return json(200, {
          catalogueUp: false,
          heading: 'The catalogue is not attached, so nothing was looked up.',
          alternatives: [],
        });
      }

      // byGtin, not a bespoke code lookup: it already tries the UPC-A and
      // EAN-13 forms of the same code, and "a barcode or a code identifying
      // the product" is exactly the ambiguity that exists to resolve.
      const original = fastLookup.byGtin(code) as Candidate | null;
      if (!original) {
        return json(200, {
          catalogueUp: true,
          heading: 'We have not seen this one.',
          alternatives: [],
        });
      }

      const alternatives = await alternativesFor(catalogueDb, original, askingCents, lookupPrices);
      return json(200, {
        catalogueUp: true,
        heading: alternativesHeading(original, alternatives.length),
        alternatives,
      });
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
      return json(200, await packVersion(scope));
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
      'cache-control': 'no-store',
    });
    res.end(file);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'EISDIR') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('server error');
    console.error(err);
  }
});

server.listen(PORT, () => {
  console.log(`Shin is running.  http://localhost:${PORT}`);
  console.log('The engine behind it knows 7 products, because 7 is what has been priced by hand.');
  // Attached after the port is open, never before: the screens have to come up
  // whether or not a 3.47 GB file is sitting where this expects it.
  void attachCatalogue();
});
