/**
 * Unit 14 of docs/catalogue-build-plan-2026-09-26.md: "Prove the catalogue
 * work changed an answer."
 *
 * Every other acceptance test in that plan counts rows loaded. This one asks
 * the app's real question -- `Catalogue.byGtin` in ./search.ts, which is what
 * a scan actually calls -- against the catalogue as it stood BEFORE tonight's
 * loads and AFTER them, and counts how many more of those questions get a
 * real answer.
 *
 * As written, unit 14 wants its held set to come from real user scans. It
 * cannot be met that way tonight: the scan store (app/data/scans.db) holds 3
 * distinct barcodes and all 3 already resolve, and the miss log
 * (catalogue/data/gaps.db) has 94 text misses and 0 barcode misses. There is
 * no demand-weighted set to hold out. Fabricating one would be worse than
 * not having one, so this script measures what CAN be measured honestly:
 *
 *   1. What the loads made scannable -- each new source's own barcodes,
 *      before and after. A rise here is partly true by construction: these
 *      are the exact barcodes the loads carried.
 *   2. The price store's barcodes (sellers bcldb, anbl) -- put there by the
 *      price lanes, not chosen to make this number move. This is the
 *      independent, honest half of the measurement.
 *   3. Whether the answer got BETTER, not just present -- for barcodes in
 *      set 2 that resolve both before and after, whether they now carry a
 *      size, a category, a brand they did not carry before.
 *   4. Two controls that must behave a fixed way or the whole run is void.
 *
 * FALSIFIER, decided before looking: if set 2's hit rate does not rise, that
 * IS the result. It is reported as the result, not softened, and it means
 * the sources added products nobody prices/scans through Shin yet.
 *
 * Read-only throughout. Every database is opened with `readOnly: true` and
 * `PRAGMA busy_timeout = 120000`. Nothing is written anywhere. Re-runnable:
 * run it again any time with
 *
 *   node --experimental-strip-types catalogue/src/answer-change-2026-09-26.ts
 *
 * from the repo root (or anywhere; every path below is resolved off this
 * file's own location, not off the current working directory).
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Catalogue, type Candidate } from './search.ts';

// ---------------------------------------------------------------- paths ---

const BEFORE_PATH = fileURLToPath(new URL('../data/catalogue.db.before-dedupe.2026-09-14', import.meta.url));
const AFTER_PATH = fileURLToPath(new URL('../data/catalogue.db', import.meta.url));
const PRICES_PATH = fileURLToPath(new URL('../../price/data/prices.db', import.meta.url));

const SOURCE_FILES: Record<string, string> = {
  consignaction: fileURLToPath(new URL('../data/rows-consignaction.jsonl', import.meta.url)),
  returnit: fileURLToPath(new URL('../data/rows-returnit.jsonl', import.meta.url)),
  usda: fileURLToPath(new URL('../data/rows-usda.jsonl', import.meta.url)),
};

// usda is 432,132 rows; reading it twice through byGtin in full is roughly
// three minutes end to end, which this script will do -- but if that ever
// becomes "too slow" (per the unit's own instruction), lower this instead of
// hand-sampling. A random sample this size at a real hit rate still lands
// the 95% margin of error under 1 percentage point (computed below, printed
// with the row, not asserted here).
const USDA_SAMPLE_SIZE = 20000;
const USDA_SAMPLE_SEED = 20260926; // fixed so the sample -- and this report -- is reproducible.

// Decided before looking, per the plan's falsifier clause.
const POSITIVE_CONTROL = '0068100084245'; // must resolve in BOTH databases.
const NEGATIVE_CONTROL = '0000000000093'; // must resolve in NEITHER.

// --------------------------------------------------------------- helpers --

/** Deterministic PRNG (mulberry32) so the usda sample is the same on every run. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle driven by the seeded PRNG; mutates and returns `arr`. */
function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Same barcode, different spelling, folded to one key for SET MEMBERSHIP
 * ONLY (never used for the actual lookup -- byGtin does its own canonical
 * matching). Needed because the price store keeps a row's barcode in `code`
 * (padded, e.g. 0081753830175) and `page_gtin` (the seller's raw claim, e.g.
 * 81753830175) at once for every bcldb row, and counting both spellings as
 * two barcodes inflates the independent set by construction.
 */
function canonKey(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 13) return digits.padStart(13, '0');
  return digits.replace(/^0+/, '').padStart(13, '0');
}

function readJsonlCodes(path: string): string[] {
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return [];
  const codes: string[] = [];
  for (const line of text.split('\n')) {
    const row = JSON.parse(line) as { code?: unknown };
    if (typeof row.code === 'string' && row.code) codes.push(row.code);
  }
  return codes;
}

function pct(n: number, d: number): string {
  if (d === 0) return 'n/a';
  return `${((100 * n) / d).toFixed(1)}%`;
}

/** 95% normal-approximation margin of error for a sample proportion. */
function marginOfError95(hits: number, n: number): string {
  if (n === 0) return 'n/a';
  const p = hits / n;
  const moe = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return `±${(100 * moe).toFixed(2)}pp`;
}

function hasSize(c: Candidate): boolean {
  return c.sizeValue !== null || (c.sizeUnit !== null && c.sizeUnit !== '');
}
function hasCategory(c: Candidate): boolean {
  return c.leafCategory !== null && c.leafCategory !== '';
}
function hasBrand(c: Candidate): boolean {
  return c.brands !== null && c.brands.trim() !== '';
}

function openCatalogue(path: string): { catalogue: Catalogue; db: DatabaseSync } {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 120000');
  // The embedder is never called: byGtin does one indexed SELECT on `product`
  // and nothing else. A real Embedder would need a network-capable model
  // client this script has no business opening for a read-only barcode count.
  const catalogue = new Catalogue(db, {} as unknown as ConstructorParameters<typeof Catalogue>[1]);
  return { catalogue, db };
}

function hit(catalogue: Catalogue, code: string): Candidate | null {
  return catalogue.byGtin(code);
}

// ----------------------------------------------------------------- main ---

function main(): void {
  const before = openCatalogue(BEFORE_PATH);
  const after = openCatalogue(AFTER_PATH);

  try {
    // ---------------------------------------------------------- controls --
    const posBefore = !!hit(before.catalogue, POSITIVE_CONTROL);
    const posAfter = !!hit(after.catalogue, POSITIVE_CONTROL);
    const negBefore = !!hit(before.catalogue, NEGATIVE_CONTROL);
    const negAfter = !!hit(after.catalogue, NEGATIVE_CONTROL);

    console.log('=== Unit 14: controls (decided before looking) ===');
    console.table([
      { control: POSITIVE_CONTROL, expected: 'resolves in BOTH', before: posBefore, after: posAfter },
      { control: NEGATIVE_CONTROL, expected: 'resolves in NEITHER', before: negBefore, after: negAfter },
    ]);

    const controlsHeld = posBefore && posAfter && !negBefore && !negAfter;
    if (!controlsHeld) {
      console.log(
        '\nCONTROLS DID NOT HOLD. The measurement below is VOID and none of it is reported as a result.\n' +
          'This means byGtin, one of these two database files, or one of the two control barcodes is not ' +
          'behaving as this unit assumed, and that has to be fixed before any hit rate here means anything.',
      );
      return;
    }
    console.log('\nControls held. The measurement below is trusted.\n');

    // ------------------------------------------------- set 1: the loads ---
    console.log('=== Set 1: what the loads made scannable (their own barcodes) ===');
    console.log(
      'A rise here is PARTLY BY CONSTRUCTION: these are exactly the barcodes the loads carried into the ' +
        'catalogue, so of course more of them resolve after. This set alone cannot answer whether the ' +
        'work mattered to anyone -- set 2 does that.\n',
    );

    const set1Rows: Record<string, unknown>[] = [];
    for (const [source, path] of Object.entries(SOURCE_FILES)) {
      const allCodes = readJsonlCodes(path);
      const distinct = Array.from(new Set(allCodes));
      let codes = distinct;
      let sampleNote = 'full population, enumerated';
      if (source === 'usda' && distinct.length > USDA_SAMPLE_SIZE) {
        const rng = mulberry32(USDA_SAMPLE_SEED);
        codes = shuffleInPlace(distinct.slice(), rng).slice(0, USDA_SAMPLE_SIZE);
        sampleNote = `RANDOM sample, n=${codes.length} of ${distinct.length}`;
      }
      let beforeHits = 0;
      let afterHits = 0;
      for (const code of codes) {
        if (hit(before.catalogue, code)) beforeHits++;
        if (hit(after.catalogue, code)) afterHits++;
      }
      set1Rows.push({
        source,
        population_distinct: distinct.length,
        asked: codes.length,
        sampling: sampleNote,
        before_hits: beforeHits,
        before_rate: pct(beforeHits, codes.length),
        after_hits: afterHits,
        after_rate: pct(afterHits, codes.length),
        margin_of_error_95: source === 'usda' ? marginOfError95(afterHits, codes.length) : 'n/a (full population)',
      });
    }
    console.table(set1Rows);

    // --------------------------------------------- set 2: the honest half -
    console.log('\n=== Set 2: the price store\'s own barcodes (bcldb, anbl) -- the independent set ===');
    console.log(
      'These barcodes were put in price/data/prices.db by the BC and NB price lanes, not chosen to make ' +
        'this number move. This is the one set in this report that was not selected for this test.\n',
    );

    const pricesDb = new DatabaseSync(PRICES_PATH, { readOnly: true });
    pricesDb.exec('PRAGMA busy_timeout = 120000');
    let priceRows: { code: unknown; page_gtin: unknown }[];
    try {
      priceRows = pricesDb
        .prepare(`SELECT code, page_gtin FROM observation WHERE seller IN ('bcldb', 'anbl')`)
        .all() as { code: unknown; page_gtin: unknown }[];
    } finally {
      pricesDb.close();
    }

    const independentSet = new Map<string, string>(); // canonical key -> a real spelling to query with
    for (const r of priceRows) {
      if (typeof r.code === 'string' && r.code) {
        const k = canonKey(r.code);
        if (!independentSet.has(k)) independentSet.set(k, r.code);
      }
      if (typeof r.page_gtin === 'string' && r.page_gtin) {
        const k = canonKey(r.page_gtin);
        if (!independentSet.has(k)) independentSet.set(k, r.page_gtin);
      }
    }

    let set2BeforeHits = 0;
    let set2AfterHits = 0;
    const resolvedBothBefore = new Map<string, Candidate>();
    const resolvedBothAfter = new Map<string, Candidate>();
    for (const [key, spelling] of independentSet) {
      const b = hit(before.catalogue, spelling);
      const a = hit(after.catalogue, spelling);
      if (b) set2BeforeHits++;
      if (a) set2AfterHits++;
      if (b && a) {
        resolvedBothBefore.set(key, b);
        resolvedBothAfter.set(key, a);
      }
    }

    console.table([
      {
        set: 'price store (bcldb + anbl), distinct barcodes',
        rows_in_price_store: priceRows.length,
        distinct_barcodes: independentSet.size,
        before_hits: set2BeforeHits,
        before_rate: pct(set2BeforeHits, independentSet.size),
        after_hits: set2AfterHits,
        after_rate: pct(set2AfterHits, independentSet.size),
      },
    ]);

    const rose = set2AfterHits > set2BeforeHits;
    console.log(
      `\nFALSIFIER (decided before looking): the independent set's hit rate ${rose ? 'ROSE' : 'DID NOT RISE'} ` +
        `(${pct(set2BeforeHits, independentSet.size)} -> ${pct(set2AfterHits, independentSet.size)}). ` +
        (rose
          ? 'Falsifier did not fire.'
          : 'FALSIFIER FIRED: this is reported as the result, unsoftened. It means the sources added ' +
            'products nobody prices through Shin (yet), and the next catalogue decision should aim at the ' +
            'miss log, not at whatever is downloadable.'),
    );

    // ------------------------------------------- set 3: a changed answer --
    console.log(
      "\n=== Set 3: for barcodes that resolve BOTH before and after, did the answer get better? ===",
    );
    const denom = resolvedBothBefore.size;
    const fields: { name: string; test: (c: Candidate) => boolean }[] = [
      { name: 'size', test: hasSize },
      { name: 'category', test: hasCategory },
      { name: 'brand', test: hasBrand },
    ];
    const set3Rows: Record<string, unknown>[] = [];
    for (const f of fields) {
      let beforeCount = 0;
      let afterCount = 0;
      let gained = 0; // missing before, present after -- a changed answer, not just a present one.
      let lost = 0;
      for (const [key, beforeCand] of resolvedBothBefore) {
        const afterCand = resolvedBothAfter.get(key)!;
        const b = f.test(beforeCand);
        const a = f.test(afterCand);
        if (b) beforeCount++;
        if (a) afterCount++;
        if (!b && a) gained++;
        if (b && !a) lost++;
      }
      set3Rows.push({
        field: f.name,
        denominator_resolves_both: denom,
        before_count: beforeCount,
        before_rate: pct(beforeCount, denom),
        after_count: afterCount,
        after_rate: pct(afterCount, denom),
        gained_missing_to_present: gained,
        lost_present_to_missing: lost,
      });
    }
    console.table(set3Rows);
  } finally {
    before.db.close();
    after.db.close();
  }
}

main();
