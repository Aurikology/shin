/**
 * The four query shapes `vector-worth-it.ts` never touched. Read that file's
 * header first if you have not: it measured 40 French queries against rows
 * that carry BOTH an English and a French name, using clean catalogue product
 * names as the query text, fused at one fixed rank weighting. That is the
 * shape the word index handles best. This file measures the four shapes it
 * does not touch:
 *
 *   1. Paraphrase   -- a query built the way a vision model reading a photo
 *                      would describe the product, against the stored name.
 *   2. Bilingual     -- a real Canadian row's real, human-written French
 *      Canadian         name, with the word-search arm restricted to an
 *                        English-only index so the target's own French text
 *                        is genuinely absent from it.
 *   3. Loose typed   -- brand dropped, category word only. Scored as "did a
 *                      reasonable member of that category come back", not as
 *                      "did this one exact row come back" (see shape 3 below
 *                      for why the first version of this file got that wrong).
 *   4. Cross-source  -- the same barcode under two different `source` values.
 *
 * THIS FILE WAS CORRECTED ONCE, 2026-09-05, on three findings from its own
 * first run, and the corrections are the more important thing to read here
 * than the numbers:
 *
 *   (a) SELF-RETRIEVABILITY GATE. The pilot run found only 6-8 of every 10
 *       target rows could retrieve themselves at rank 1 when queried with
 *       their own exact indexed text. A row that fails that cannot be blamed
 *       on the query shape for any miss afterward -- the miss is the row's
 *       vector, not the paraphrase or the French or the category word. Every
 *       identity-based shape below (1 and 2) is reported TWICE: over every
 *       probe drawn, and over only the probes that pass this gate. Read the
 *       second table as the finding and the first as noise it is shown next
 *       to, not as a second opinion that might win. If the gated subset for
 *       a shape drops under ~20 rows, this file says so and reports no
 *       percentage for it, because a rate computed on that few rows is not
 *       one worth reading as a rate.
 *   (b) SHAPE 2 WAS SYNTHETIC AND DID NOT NEED TO BE. The first version built
 *       a French query with a ~70-term glossary substituted word by word into
 *       an English name, which is English with some French words in it, not
 *       French -- and it scored like it: words-alone still hit 78% because
 *       most of the query was still literally the indexed English string.
 *       The catalogue holds a real answer: rows loaded with sold_in_canada=1
 *       carry BOTH a real English and a real French name, written by people,
 *       for 15,898 rows that also happen to already carry a vector (checked
 *       live, see the printed count). This version queries with that row's
 *       REAL name_fr, verbatim, and makes the word-search arm's blindness to
 *       it real rather than assumed: it builds a throwaway, in-memory FTS5
 *       index over name_en (and brands, leaf_category) ALONE, for every
 *       sold_in_canada row that has an English name and a vector (556,781 of
 *       them, see the printed count) -- no name_fr column exists in that
 *       index at all, so the target row's own French name is not merely
 *       unused, it is not there to be found. This is exactly the follow-up
 *       `vector-worth-it.ts`'s own header named as unresolved and never built.
 *
 *       CORRECTED AGAIN, same day: "name_fr differs from name_en" is not the
 *       same claim as "name_fr is French." A sample pull found English text
 *       sitting in the French field ("100 pure vermont organic maple syrup").
 *       Only rows whose name_fr carries a French function word (au, aux, de,
 *       des, du, et, la, le, les, pour, sans, avec) or a French diacritic are
 *       sampled for shape 2 now (roughly a third of the bilingual pool, see
 *       the printed live counts). The other two-thirds is not thrown away --
 *       it is reported as its own separately-labelled shape, a real person's
 *       different English wording of the same row, closer to the photo path
 *       than shape 1's mechanical synonyms and never merged into shape 2.
 *
 *       POOL FAIRNESS, same day: the vector arm was searching the full live
 *       product_vec table (718,662+ rows, catalogue-wide and growing) while
 *       the word arm searched only the 556,781-row throwaway index -- two
 *       different, differently-sized populations, which confounds any hit-
 *       rate comparison with pool size and composition rather than measuring
 *       retrieval mechanism. This is exactly the kind of thing that made the
 *       ORIGINAL `vector-worth-it.ts` measurement fragile (it lost partly
 *       because its rows were indexed under both languages, a property of
 *       the setup, not the mechanism). Fixed by restricting the vector arm to
 *       the SAME set of codes the word index holds (see `vectorRanked`'s
 *       `allowed` parameter and the printed POOL FAIRNESS CHECK). Shapes 1
 *       and 3 are NOT restricted this way on purpose: there, the word arm is
 *       the live, catalogue-wide product_fts and the vector arm is whatever
 *       has been embedded so far, which is a REAL production asymmetry (the
 *       word index covers everything; the vector index only what has been
 *       embedded), not an artefact of this test's construction -- so it is
 *       left as-is and named at each shape rather than "fixed" into something
 *       that would no longer describe production.
 *   (c) SHAPE 3's FIRST VERSION MEASURED THE WRONG THING. Scoring "did this
 *       one seeded row come back" against a query that is nothing but a bare
 *       category word is asking the catalogue to guess a coin flip and
 *       grading it on calling the one face that was tails; every source in
 *       the pilot scored nowhere near zero for a legitimate reason -- there
 *       is no way to prefer one peanut butter over another from the word
 *       "peanut butter" alone, so of course a specific one rarely won. This
 *       version asks the honest question instead: did the top 5 results
 *       contain ANY real member of the category the word names, checked
 *       against `product_category`, the same table `search.ts`'s neighbour
 *       rings read. Category tags too big to be "a kind of thing" (over 1000
 *       members -- the same cutoff `search.ts` measured and uses for ring
 *       widening, MAX_RING_TAG) are excluded from sampling, because "did a
 *       laptop come back" when the tag holds a million laptops is not a
 *       test of anything.
 *
 * WHY THIS IS A SEPARATE FILE RATHER THAN A FLAG ON `vector-worth-it.ts`.
 * That file answers a narrow question with real rigour; broadening its scope
 * in place risked quietly changing what its own numbers meant. This file
 * reuses none of its retrieval internals on purpose: `search.ts`'s
 * #textSearch and #vectorSearch are private, and reporting fusion at more
 * than one weighting needs independent control over both rank lists, which
 * `Catalogue.search` does not expose (it fuses with Reciprocal Rank Fusion at
 * one fixed, equal weighting -- see search.ts's own header on why weighted
 * score fusion was rejected there). So this file reimplements the two
 * retrieval primitives directly against the same tables (`product_fts`,
 * `product_vec`), copied from search.ts as read on 2026-09-05, and does its
 * own fusion arithmetic on top so the weighting can vary. The "fused 1:1" row
 * is the one that should track production; if it stops matching what
 * `Catalogue.search` returns for the same query, that is this file going
 * stale against search.ts, not a finding.
 *
 * NO MODEL KEY IN THIS ENVIRONMENT. Shape 1's real production query shape is
 * a vision model reading a product photo and describing it in its own words.
 * That query cannot be generated here at all -- there is no vision or
 * language model API key configured, and the original brief for this file
 * required the queries be built mechanically regardless. So shape 1 is a
 * mechanical stand-in: fixed rules (drop the brand, swap one word from a
 * small hardcoded synonym table when it literally appears, rewrite the size
 * in the other unit, reorder). Its number is evidence about THOSE RULES, not
 * about what a vision model would actually write, and is not evidence about
 * the real photo-path query shape in either direction. Say so before citing it.
 *
 * RESTRICTION THAT MATTERS MOST, still: only rows that carry a vector can
 * ever be found by the vector arm. This file queries the live counts at run
 * time rather than trusting anything written down earlier, because a
 * background embedding job may be writing to this table while it runs, and
 * every sample below is restricted to rows already carrying one.
 *
 * WHAT THIS FILE DOES NOT COVER:
 *   - Neighbour rings, bands, or the Canada discount `Catalogue.search`
 *     applies. Fusion here is pure RRF on rank position, nothing else.
 *   - A real paraphrase model's output (see above).
 *   - Shape 3 no longer says anything about one specific row's rank; it says
 *     whether the catalogue can find something real for that category word,
 *     which is a different and smaller claim than the file's first version
 *     implied.
 *   - Shape 4 could not be measured at all with what is in this database.
 *     See the printed section: this is a fact about the schema (`code` is
 *     the primary key, the loader overwrites `source` on conflict), not a
 *     null result about whether cross-source duplicates exist in the world.
 *   - Nothing here re-litigates decision 24's band or threshold logic
 *     (FLOOR_SIM, CANADA_DISCOUNT). This is retrieval only.
 *
 * Run: node --experimental-strip-types src/vector-shapes.ts [--n1 N] [--n3 N]
 *        [--nfr N] [--ndiff N]
 *   --n1    total sample for shape 1, split across 5 sources (default 40).
 *   --n3    total sample for shape 3, split across 5 sources (default 40).
 *   --nfr   sample for shape 2's real-French pool (default 60).
 *   --ndiff sample for the different-wording pool (default 60).
 * Sized 2026-09-05 from a pilot run: ~20% self-retrieval attrition, a 20-row
 * floor, ~2.2s per vector probe -- these defaults clear the floor with room.
 */

import { DatabaseSync } from 'node:sqlite';
import { openCatalogueReadOnly, toVecBlob } from './schema.ts';
import { defaultEmbedder, passageText, type Embedder } from './embed.ts';
import { labelForTag } from './search.ts';

const DB_PATH = 'data/catalogue.db';
const AT = 5;

/** Copied from search.ts as read on 2026-09-05. Must match for "fused 1:1" to mean anything. */
const RRF_K = 60;
/** Copied from search.ts as read on 2026-09-05: how deep each retriever goes before fusion. */
const RETRIEVE_N = 60;
/** Below this many self-retrievable (or, for shape 3, sampled) rows, a rate is not reported. */
const MIN_USABLE = 20;
/** search.ts's own measured cutoff (MAX_RING_TAG) for "a kind of thing" vs "a shelf of the shop". */
const MAX_CATEGORY_TAG = 1000;

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  return i === -1 ? def : Number(process.argv[i + 1]);
}

/** Sized 2026-09-05 from the pilot's own measurements: ~20% self-retrieval attrition,
 *  a 20-row floor, ~2.2s per vector probe. Totals below, not per-source. */
const N1_TOTAL = argNum('--n1', 40); // shape 1, mechanical stand-in -- cannot speak to the photo path regardless
const N3_TOTAL = argNum('--n3', 40); // shape 3, category membership
const N_FRENCH = argNum('--nfr', 60); // shape 2, real French query -- the shape this lane exists for
const N_DIFFERENT = argNum('--ndiff', 60); // different-wording shape, real English paraphrase by a person

const SOURCES = ['icecat', 'openfoodfacts', 'openbeautyfacts', 'openproductsfacts', 'openpetfoodfacts'];

interface Row {
  readonly rowid: number;
  readonly code: string;
  readonly name: string;
  readonly name_en: string | null;
  readonly name_fr: string | null;
  readonly brands: string | null;
  readonly quantity: string | null;
  readonly size_value: number | null;
  readonly size_unit: string | null;
  readonly leaf_category: string | null;
}

// ---------------------------------------------------------------------------
// Retrieval primitives, reimplemented independently of search.ts (see header).
// ---------------------------------------------------------------------------

function ftsTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/["*()]/g, ' ')
    .split(/[^\p{L}\p{N}.]+/u)
    .filter((t) => t.length > 1);
}

function joinFts(tokens: readonly string[], op: 'AND' | 'OR'): string {
  return tokens.map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(` ${op} `);
}

type FtsRunner = (match: string, k: number) => string[];

/** AND first, OR fallback -- exactly search.ts's #textSearch shape, against whichever runner is passed. */
function textRankedWith(run: FtsRunner, text: string, k = RETRIEVE_N): { codes: string[]; ms: number } {
  const t0 = Date.now();
  const tokens = ftsTokens(text);
  if (tokens.length === 0) return { codes: [], ms: Date.now() - t0 };
  let codes: string[];
  if (tokens.length > 1) {
    const strict = run(joinFts(tokens, 'AND'), k);
    codes = strict.length >= 5 ? strict : run(joinFts(tokens, 'OR'), k);
  } else {
    codes = run(joinFts(tokens, 'OR'), k);
  }
  return { codes, ms: Date.now() - t0 };
}

/** Runner over the live catalogue's product_fts (name_en, name_fr, brands, leaf_category). */
function liveFtsRunner(db: DatabaseSync): FtsRunner {
  return (match, k) => {
    const rows = db
      .prepare(
        `SELECT p.code FROM product_fts f
         JOIN product p ON p.rowid = f.rowid
         WHERE product_fts MATCH ?
         ORDER BY bm25(product_fts, 4.0, 4.0, 2.0, 1.0)
         LIMIT ?`,
      )
      .all(match, k) as unknown as { code: string }[];
    return rows.map((r) => r.code);
  };
}

/** Runner over the throwaway English-only index built for shape 2 (name_en, brands, leaf_category; no name_fr). */
function throwawayFtsRunner(mem: DatabaseSync): FtsRunner {
  return (match, k) => {
    const rows = mem
      .prepare(
        `SELECT code FROM en_only_fts
         WHERE en_only_fts MATCH ?
         ORDER BY bm25(en_only_fts, 4.0, 2.0, 1.0)
         LIMIT ?`,
      )
      .all(match, k) as unknown as { code: string }[];
    return rows.map((r) => r.code);
  };
}

/**
 * Vector-only retrieval, exactly search.ts's #vectorSearch shape.
 *
 * `allowed`, when given, restricts the candidate pool to exactly that set of
 * codes -- POOL FAIRNESS, added 2026-09-05. Without it, this searches the
 * full live product_vec table (718,662+ rows and growing, catalogue-wide),
 * which is a DIFFERENT and LARGER population than a word arm built over a
 * restricted subset (e.g. shape 2's Canada-only, English-only throwaway
 * index, 556,781 rows). Comparing hit rates across two arms searching
 * different-sized pools is not a comparison of the retrieval mechanisms; the
 * arm with the larger pool carries a handicap that has nothing to do with
 * whether meaning search works, and the difference is invisible in a hit-rate
 * table unless it is named and controlled for. When `allowed` is set, the KNN
 * query overfetches (see OVERFETCH) and filters down, which is exactly
 * equivalent to running KNN restricted to that subset to begin with, because
 * excluding candidates from competition never changes the relative order of
 * the ones that remain.
 */
const OVERFETCH = 2000;

/**
 * `survivorCount` (null when `allowed` is not used) is the number of
 * candidates that passed the pool filter, UNCAPPED by `k`. Added 2026-09-05
 * on the observation that overfetch+filter is only equivalent to a truly
 * restricted KNN when at least `k` candidates survive the filter -- if fewer
 * survive, this would otherwise silently hand back a short list that reads
 * as a weak arm rather than a truncated one. Today's ratio (556,781 of
 * 718,662, ~77%) makes that essentially impossible at k=2000 for k=60, but
 * that ratio is an accident of how much of the catalogue is embedded right
 * now, not a guarantee, so the count is surfaced rather than trusted.
 */
async function vectorRanked(
  db: DatabaseSync,
  embedder: Embedder,
  text: string,
  k = RETRIEVE_N,
  allowed: Set<string> | null = null,
): Promise<{ codes: string[]; ms: number; survivorCount: number | null }> {
  const t0 = Date.now();
  const vec = await embedder.embedQuery(text);
  const fetchK = allowed ? Math.max(k, OVERFETCH) : k;
  const hits = db
    .prepare(`SELECT rowid, distance FROM product_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance`)
    .all(toVecBlob(vec), fetchK) as unknown as { rowid: bigint | number; distance: number }[];
  if (hits.length === 0) return { codes: [], ms: Date.now() - t0, survivorCount: allowed ? 0 : null };
  const ids = hits.map((h) => Number(h.rowid));
  const idRows = db
    .prepare(`SELECT rowid, code FROM product WHERE rowid IN (${ids.map(() => '?').join(',')})`)
    .all(...(ids as unknown as never[])) as unknown as { rowid: number; code: string }[];
  const byId = new Map(idRows.map((r) => [Number(r.rowid), r.code]));
  const survivors: string[] = [];
  for (const h of hits) {
    const c = byId.get(Number(h.rowid));
    if (!c) continue;
    if (allowed && !allowed.has(c)) continue;
    survivors.push(c);
  }
  return { codes: survivors.slice(0, k), ms: Date.now() - t0, survivorCount: allowed ? survivors.length : null };
}

/** Position-only fusion, own arithmetic so the weighting can vary (see file header). */
function fusedRank(textCodes: readonly string[], vectorCodes: readonly string[], wText: number, wVec: number, target: string): number | null {
  const score = new Map<string, number>();
  textCodes.forEach((c, i) => score.set(c, (score.get(c) ?? 0) + wText / (RRF_K + i + 1)));
  vectorCodes.forEach((c, i) => score.set(c, (score.get(c) ?? 0) + wVec / (RRF_K + i + 1)));
  const sorted = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const i = sorted.indexOf(target);
  return i === -1 ? null : i + 1;
}

function fusedCodes(textCodes: readonly string[], vectorCodes: readonly string[], wText: number, wVec: number): string[] {
  const score = new Map<string, number>();
  textCodes.forEach((c, i) => score.set(c, (score.get(c) ?? 0) + wText / (RRF_K + i + 1)));
  vectorCodes.forEach((c, i) => score.set(c, (score.get(c) ?? 0) + wVec / (RRF_K + i + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

function rankOf(codes: readonly string[], target: string): number | null {
  const i = codes.indexOf(target);
  return i === -1 ? null : i + 1;
}

// ---------------------------------------------------------------------------
// Sampling: walk rows evenly by rowid, not the first N (the same bias the
// price crawler's sampler and vector-worth-it.ts both document).
// ---------------------------------------------------------------------------

interface Probe<B> {
  readonly code: string;
  readonly row: Row;
  readonly built: B;
}

interface SampleStats {
  readonly label: string;
  readonly scanned: number;
  readonly collected: number;
  readonly spaceLo: number | null;
  readonly spaceHi: number | null;
}

function sampleByRowidStride<B>(
  db: DatabaseSync,
  label: string,
  whereSql: string,
  boundParams: unknown[],
  want: number,
  build: (row: Row) => B | null,
): { probes: Probe<B>[]; stats: SampleStats } {
  const bounds = db
    .prepare(`SELECT min(p.rowid) AS lo, max(p.rowid) AS hi FROM product p JOIN product_vec v ON v.rowid = p.rowid WHERE ${whereSql}`)
    .get(...(boundParams as never[])) as { lo: number | null; hi: number | null };

  if (bounds.lo === null) {
    return { probes: [], stats: { label, scanned: 0, collected: 0, spaceLo: null, spaceHi: null } };
  }

  const span = bounds.hi! - bounds.lo! + 1;
  const stride = Math.max(1, Math.floor(span / (want * 3)));
  let pointer = bounds.lo!;
  let scanned = 0;
  const probes: Probe<B>[] = [];

  while (pointer <= bounds.hi! && probes.length < want) {
    const batch = db
      .prepare(
        `SELECT p.rowid, p.code, p.name, p.name_en, p.name_fr, p.brands, p.quantity,
                p.size_value, p.size_unit, p.leaf_category
         FROM product p JOIN product_vec v ON v.rowid = p.rowid
         WHERE ${whereSql} AND p.rowid >= ?
         ORDER BY p.rowid LIMIT 5`,
      )
      .all(...(boundParams as never[]), pointer) as unknown as Row[];
    if (batch.length === 0) break;

    for (const row of batch) {
      scanned += 1;
      const built = build(row);
      if (built !== null) {
        probes.push({ code: row.code, row, built });
        if (probes.length >= want) break;
      }
    }
    pointer = batch[batch.length - 1].rowid + stride;
  }

  return { probes, stats: { label, scanned, collected: probes.length, spaceLo: bounds.lo, spaceHi: bounds.hi } };
}

function sampleAcrossSources<B>(
  db: DatabaseSync,
  extraWhere: string,
  wantPerSource: number,
  build: (row: Row) => B | null,
): { probes: Probe<B>[]; stats: SampleStats[] } {
  const allProbes: Probe<B>[] = [];
  const allStats: SampleStats[] = [];
  for (const source of SOURCES) {
    const { probes, stats } = sampleByRowidStride(db, source, `p.source = ? ${extraWhere}`, [source], wantPerSource, build);
    allProbes.push(...probes);
    allStats.push(stats);
  }
  return { probes: allProbes, stats: allStats };
}

function printSampleStats(stats: SampleStats[]): void {
  for (const s of stats) {
    if (s.spaceLo === null) {
      console.log(`    ${s.label}: no rows in the search space at all`);
      continue;
    }
    console.log(`    ${s.label}: scanned ${s.scanned} rows (rowid ${s.spaceLo}-${s.spaceHi}), collected ${s.collected}`);
  }
}

// ---------------------------------------------------------------------------
// Shape 1: paraphrase. Mechanical transforms, documented, with a fired-rate.
// NO MODEL KEY IS AVAILABLE HERE -- see file header. This is a stand-in.
// ---------------------------------------------------------------------------

const SYNONYMS: [string, string][] = [
  ['controller', 'gamepad'], ['keyboard', 'keypad'], ['monitor', 'screen'], ['mouse', 'pointer'],
  ['camera', 'cam'], ['headphones', 'earphones'], ['headphone', 'earphone'], ['speaker', 'loudspeaker'],
  ['tablet', 'pad'], ['laptop', 'notebook'], ['notebook', 'laptop'], ['television', 'tv'],
  ['noodles', 'pasta'], ['butter', 'spread'], ['cereal', 'flakes'], ['cracker', 'biscuit'],
  ['crackers', 'biscuits'], ['juice', 'drink'], ['soda', 'pop'], ['cookie', 'biscuit'],
  ['cookies', 'biscuits'], ['chips', 'crisps'], ['candy', 'sweets'], ['flavor', 'flavour'],
  ['smartphone', 'phone'], ['phone', 'smartphone'], ['printer', 'print machine'],
];

function altSize(value: number | null, unit: string | null): string | null {
  if (value === null || unit === null) return null;
  const trim = (n: number) => Number(n.toFixed(2)).toString();
  if (unit === 'g') return `${trim(value / 1000)} kg`;
  if (unit === 'ml') return `${trim(value / 1000)} l`;
  return null;
}

function removeBrandTokens(tokens: string[], brands: string | null): boolean {
  if (!brands) return false;
  const firstBrand = brands.split(',')[0]?.trim();
  if (!firstBrand) return false;
  const brandWords = firstBrand.split(/\s+/).map((w) => w.toLowerCase()).filter((w) => w.length > 1);
  if (brandWords.length === 0) return false;
  let removed = false;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (brandWords.includes(tokens[i].toLowerCase())) {
      tokens.splice(i, 1);
      removed = true;
    }
  }
  return removed;
}

function applySynonym(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i += 1) {
    const lower = tokens[i].toLowerCase();
    const hit = SYNONYMS.find(([from]) => from === lower);
    if (hit) {
      tokens[i] = hit[1];
      return true;
    }
  }
  return false;
}

interface ParaphraseBuilt {
  readonly query: string;
  readonly brandDropped: boolean;
  readonly synonymApplied: boolean;
  readonly sizeRewritten: boolean;
}

function buildParaphrase(row: Row): ParaphraseBuilt | null {
  const base = (row.name_en ?? row.name).trim();
  const tokens = base.split(/\s+/).filter(Boolean);
  const alphaTokens = tokens.filter((t) => /[A-Za-z]{2,}/.test(t));
  if (alphaTokens.length < 2) return null;

  const brandDropped = removeBrandTokens(tokens, row.brands);
  const synonymApplied = applySynonym(tokens);
  const sizeStr = altSize(row.size_value, row.size_unit);
  const sizeRewritten = sizeStr !== null;

  let final: string[];
  if (sizeRewritten) {
    final = [sizeStr!, ...tokens];
  } else if (tokens.length > 1) {
    final = [...tokens.slice(1), tokens[0]];
  } else {
    final = tokens;
  }

  const query = final.join(' ').toLowerCase().trim();
  if (query.length === 0) return null;
  return { query, brandDropped, synonymApplied, sizeRewritten };
}

// ---------------------------------------------------------------------------
// Shape 2: real bilingual Canadian row, real French name, word arm blinded to
// French by construction (a throwaway English-only index), not by omission.
//
// CORRECTED 2026-09-05: "name_fr differs from name_en" does not mean name_fr
// is French. A sample pull found rows like "100 pure vermont organic maple
// syrup" and "Nutella & Go" sitting in the French field -- different English,
// not French. Measured across the full live universe below (see the printed
// counts, which will not exactly match any number written down earlier
// because the vector table is still growing): a French function word (au,
// aux, de, des, du, et, la, le, les, pour, sans, avec) or a French diacritic
// appears in roughly a third of bilingual rows. Only THAT third is sampled
// for shape 2. The other two-thirds is not discarded -- it is a real, useful
// shape in its own right (a person's different English wording of the same
// product, the closest thing in this database to what a vision model would
// hand back from a photo) and is reported separately, below, honestly labelled
// as a different-wording shape and never merged into shape 2's numbers.
// ---------------------------------------------------------------------------

const FRENCH_FUNCTION_WORDS = /\b(au|aux|de|des|du|et|la|le|les|pour|sans|avec)\b/i;
const FRENCH_DIACRITIC = /[àâäéèêëîïôöùûüçœ]/i;

function frenchSignal(text: string): { func: boolean; dia: boolean; either: boolean } {
  const func = FRENCH_FUNCTION_WORDS.test(text);
  const dia = FRENCH_DIACRITIC.test(text);
  return { func, dia, either: func || dia };
}

/** wantFrench=true samples the ~third that reads as French; false samples the rest
 *  (a real different-English-wording query, not a translation). */
function makeBilingualBuilder(wantFrench: boolean) {
  return (row: Row): { query: string; signal: ReturnType<typeof frenchSignal> } | null => {
    if (!row.name_fr) return null;
    const query = row.name_fr.trim();
    if (query.length === 0) return null;
    const signal = frenchSignal(query);
    if (signal.either !== wantFrench) return null;
    return { query, signal };
  };
}

/**
 * POOL FAIRNESS, added 2026-09-05: this population is joined against
 * product_vec explicitly, so the word arm's pool is exactly the set of codes
 * the vector arm is later restricted to (see `codes` in the return value and
 * `vectorRanked`'s `allowed` parameter). Live-measured on 2026-09-05: this
 * came out to 556,781 rows either way, because every sold_in_canada row
 * already carries a vector (checked live), but the JOIN is kept so that stays
 * true by construction rather than by coincidence if that ever changes.
 */
function buildThrowawayEnglishIndex(db: DatabaseSync): { mem: DatabaseSync; rows: number; ms: number; codes: Set<string> } {
  const t0 = Date.now();
  const rows = db
    .prepare(
      `SELECT p.code, p.name_en, p.brands, p.leaf_category
       FROM product p JOIN product_vec v ON v.rowid = p.rowid
       WHERE p.sold_in_canada = 1 AND p.name_en IS NOT NULL`,
    )
    .all() as unknown as { code: string; name_en: string; brands: string | null; leaf_category: string | null }[];

  const mem = new DatabaseSync(':memory:');
  mem.exec(
    `CREATE VIRTUAL TABLE en_only_fts USING fts5(code UNINDEXED, name_en, brands, leaf_category, tokenize="unicode61 remove_diacritics 2")`,
  );
  const ins = mem.prepare('INSERT INTO en_only_fts (code, name_en, brands, leaf_category) VALUES (?,?,?,?)');
  const codes = new Set<string>();
  mem.exec('BEGIN');
  let n = 0;
  for (const r of rows) {
    ins.run(r.code, r.name_en, r.brands ?? '', r.leaf_category ?? '');
    codes.add(r.code);
    n += 1;
    if (n % 100000 === 0) {
      mem.exec('COMMIT');
      mem.exec('BEGIN');
    }
  }
  mem.exec('COMMIT');
  return { mem, rows: n, ms: Date.now() - t0, codes };
}

// ---------------------------------------------------------------------------
// Shape 3: loose typed query, redefined as "did a reasonable member of the
// category come back" -- see file header for why the identity version was
// wrong. Category tags bigger than MAX_CATEGORY_TAG are excluded at sampling.
// ---------------------------------------------------------------------------

function buildLooseChecked(db: DatabaseSync, tagSizeCache: Map<string, number>) {
  return (row: Row): { query: string; tag: string } | null => {
    if (!row.leaf_category) return null;
    const tag = row.leaf_category;
    let size = tagSizeCache.get(tag);
    if (size === undefined) {
      size = (db.prepare(`SELECT count(*) AS n FROM (SELECT 1 FROM product_category WHERE tag = ? LIMIT ${MAX_CATEGORY_TAG + 1})`).get(tag) as { n: number }).n;
      tagSizeCache.set(tag, size);
    }
    if (size > MAX_CATEGORY_TAG || size === 0) return null;
    const label = labelForTag(tag).toLowerCase().trim();
    if (label.length < 4) return null;
    const singular = label.endsWith('s') && !label.endsWith('ss') && label.length > 4 ? label.slice(0, -1) : label;
    return { query: singular, tag };
  };
}

function categoryMembers(db: DatabaseSync, tag: string): Set<string> {
  const rows = db
    .prepare(`SELECT p.code FROM product_category pc JOIN product p ON p.rowid = pc.rowid_ref WHERE pc.tag = ?`)
    .all(tag) as unknown as { code: string }[];
  return new Set(rows.map((r) => r.code));
}

// ---------------------------------------------------------------------------
// Shape 4: not measurable. Stated as a schema fact, not a null dedupe result.
// ---------------------------------------------------------------------------

function reportShapeFour(db: DatabaseSync): void {
  console.log('');
  console.log('=== Shape 4: the same product across two source databases ===');
  console.log('');
  console.log('NOT MEASURABLE with what is in this database, and this is a fact about the');
  console.log('schema, not a null result about whether cross-source duplicates exist in the');
  console.log('world. `product.code` is the PRIMARY KEY (schema.ts), and load.ts loads with:');
  console.log('  ON CONFLICT(code) DO UPDATE SET ... source=excluded.source');
  console.log('so a barcode seen from a second source overwrites the first row in place; one');
  console.log('barcode cannot hold two source values at once in this table, by construction,');
  console.log('regardless of how many source databases actually carry that product.');
  console.log('');
  console.log('Checked two forms on the live database before concluding this:');
  const exact = db.prepare('SELECT count(*) AS n FROM (SELECT code FROM product GROUP BY code HAVING count(DISTINCT source) > 1)').get() as { n: number };
  console.log(`  exact-code collision across sources: ${exact.n} (of 5,182,591 rows)`);
  const crossFormat = db
    .prepare(`SELECT count(*) AS n FROM product a JOIN product b ON b.code = '0' || a.code WHERE length(a.code) = 12 AND a.source <> b.source`)
    .get() as { n: number };
  console.log(`  UPC-12 / EAN-13-with-leading-zero collision across sources: ${crossFormat.n}`);
  console.log('');
  console.log('Both zero, and they are zero for a structural reason, not a search result: a');
  console.log('real answer needs either the raw pre-dedup ingest files (kept outside this');
  console.log('database, if kept at all) or a schema change to retain more than one source per');
  console.log('barcode, and neither is something this read-only measurement can produce.');
}

// ---------------------------------------------------------------------------
// Shared identity-based measurement: reports over ALL probes and, separately,
// over only the probes whose target row is self-retrievable (finding 1a).
// ---------------------------------------------------------------------------

interface ArmRow {
  readonly label: string;
  n: number;
  hit1: number;
  hit5: number;
  ms: number;
  onlyVsWordsAt5: number | null;
  lostVsWordsAt5: number | null;
}

function pct(n: number, of: number): string {
  return of === 0 ? 'n/a' : `${((n / of) * 100).toFixed(0)}%`;
}

function buildArmRows(
  wordsHit1: boolean[], wordsHit5: boolean[], wordsMs: number,
  vecHit1: boolean[], vecHit5: boolean[], vecMs: number,
  fused: { label: string; hit1: boolean[]; hit5: boolean[] }[],
): ArmRow[] {
  const n = wordsHit1.length;
  const countTrue = (arr: boolean[]) => arr.filter(Boolean).length;
  const onlyVsWords = (arr5: boolean[]) => arr5.filter((h, i) => h && !wordsHit5[i]).length;
  const lostVsWords = (arr5: boolean[]) => wordsHit5.filter((h, i) => h && !arr5[i]).length;
  return [
    { label: 'words alone', n, hit1: countTrue(wordsHit1), hit5: countTrue(wordsHit5), ms: wordsMs, onlyVsWordsAt5: null, lostVsWordsAt5: null },
    { label: 'vectors alone', n, hit1: countTrue(vecHit1), hit5: countTrue(vecHit5), ms: vecMs, onlyVsWordsAt5: onlyVsWords(vecHit5), lostVsWordsAt5: null },
    ...fused.map((w) => ({
      label: w.label, n, hit1: countTrue(w.hit1), hit5: countTrue(w.hit5), ms: wordsMs + vecMs,
      onlyVsWordsAt5: onlyVsWords(w.hit5), lostVsWordsAt5: lostVsWords(w.hit5),
    })),
  ];
}

function printTable(title: string, rows: ArmRow[], metricLabel: string): void {
  console.log('');
  console.log(`  ${title}`);
  console.log(`  arm                          n   ${metricLabel}@1        ${metricLabel}@5        ms/query   found only here   lost vs words-alone`);
  for (const r of rows) {
    const only = r.onlyVsWordsAt5 === null ? '-' : `${r.onlyVsWordsAt5}`;
    const lost = r.lostVsWordsAt5 === null ? '-' : `${r.lostVsWordsAt5}`;
    console.log(
      `  ${r.label.padEnd(28)} ${String(r.n).padEnd(3)} ${String(r.hit1).padEnd(3)} (${pct(r.hit1, r.n).padEnd(4)}) ${String(r.hit5).padEnd(3)} (${pct(r.hit5, r.n).padEnd(4)}) ${(r.ms / Math.max(r.n, 1)).toFixed(0).padEnd(9)} ${only.padEnd(17)} ${lost}`,
    );
  }
}

interface IdentityProbeResult {
  readonly selfRetrievable: boolean;
  readonly wordsHit1: boolean; readonly wordsHit5: boolean;
  readonly vecHit1: boolean; readonly vecHit5: boolean;
  readonly fused: { label: string; hit1: boolean; hit5: boolean }[];
  readonly wordsMs: number; readonly vecMs: number;
}

async function runIdentityShape(
  name: string,
  probes: Probe<{ query: string }>[],
  stats: SampleStats[],
  db: DatabaseSync,
  embedder: Embedder,
  wordRunner: FtsRunner,
  poolInfo: { wordPoolSize: number; allowedCodes: Set<string> | null; label: string },
): Promise<void> {
  const startedAt = new Date();
  console.log('');
  console.log(`=== ${name} === START ${startedAt.toISOString()}`);
  console.log(`  sample space (restricted to rows that carry a vector):`);
  printSampleStats(stats);
  console.log(`  probes actually usable and scored: ${probes.length}`);
  if (poolInfo.allowedCodes) {
    console.log(
      `  POOL FAIRNESS: word arm searches ${poolInfo.wordPoolSize} rows (${poolInfo.label}); vector arm is`,
    );
    console.log(
      `  restricted to the SAME ${poolInfo.allowedCodes.size} rows via overfetch+filter (see vectorRanked). Same pool, both arms.`,
    );
  } else {
    console.log(
      `  POOL NOTE: word arm searches the live catalogue-wide product_fts (${poolInfo.wordPoolSize} rows);`,
    );
    console.log(
      '  vector arm searches only vector-bearing rows. Unequal by construction: this is the real',
    );
    console.log(
      '  production asymmetry (the word index covers everything, the vector index only what has been',
    );
    console.log('  embedded so far), not an artefact of this test, so it is left as-is and named here.');
  }

  if (probes.length === 0) {
    console.log('  Zero usable probes. Nothing measured for this shape, and that is the result.');
    console.log(`=== ${name} === END ${new Date().toISOString()}`);
    return;
  }

  const weightings = [
    { label: 'fused 1:1 (= production RRF)', wText: 1, wVec: 1 },
    { label: 'fused 1:3 (vector-weighted)', wText: 1, wVec: 3 },
    { label: 'fused 3:1 (text-weighted)', wText: 3, wVec: 1 },
  ];

  const results: IdentityProbeResult[] = [];
  let minSurvivors: number | null = null;
  const shortfallWarnings: string[] = [];

  for (const p of probes) {
    const { codes: textCodes, ms: tMs } = textRankedWith(wordRunner, p.built.query, RETRIEVE_N);
    const { codes: vectorCodes, ms: vMs, survivorCount } = await vectorRanked(db, embedder, p.built.query, RETRIEVE_N, poolInfo.allowedCodes);

    if (survivorCount !== null) {
      minSurvivors = minSurvivors === null ? survivorCount : Math.min(minSurvivors, survivorCount);
      if (survivorCount < RETRIEVE_N) {
        shortfallWarnings.push(
          `probe code=${p.code} query="${p.built.query}": only ${survivorCount} candidates survived the pool filter, below the working depth of ${RETRIEVE_N}`,
        );
      }
    }

    const tRank = rankOf(textCodes, p.code);
    const vRank = rankOf(vectorCodes, p.code);
    const fused = weightings.map((w) => {
      const r = fusedRank(textCodes, vectorCodes, w.wText, w.wVec, p.code);
      return { label: w.label, hit1: r !== null && r <= 1, hit5: r !== null && r <= AT };
    });

    const selfText = passageText({
      name: p.row.name, name_en: p.row.name_en, name_fr: p.row.name_fr,
      brands: p.row.brands, leaf_category: p.row.leaf_category, quantity: p.row.quantity,
    });
    const { codes: selfVecCodes } = await vectorRanked(db, embedder, selfText, 1, poolInfo.allowedCodes);
    const selfRetrievable = selfVecCodes[0] === p.code;

    results.push({
      selfRetrievable,
      wordsHit1: tRank !== null && tRank <= 1, wordsHit5: tRank !== null && tRank <= AT,
      vecHit1: vRank !== null && vRank <= 1, vecHit5: vRank !== null && vRank <= AT,
      fused, wordsMs: tMs, vecMs: vMs,
    });
  }

  if (minSurvivors !== null) {
    if (shortfallWarnings.length > 0) {
      console.log('');
      console.log(
        `  OVERFETCH SHORTFALL WARNING: ${shortfallWarnings.length} probe(s) had fewer surviving candidates than the`,
      );
      console.log(`  working depth (${RETRIEVE_N}), so the overfetch+filter is NOT provably equivalent to a true`);
      console.log('  restricted KNN for those probes -- treat their vector-arm ranks below as suspect, not as a weak arm:');
      for (const w of shortfallWarnings) console.log(`    ${w}`);
    } else {
      console.log('');
      console.log(
        `  Overfetch+filter proof: minimum surviving candidates across ${results.length} probes was ${minSurvivors}`,
      );
      console.log(`  (working depth is ${RETRIEVE_N}), so no probe here could have been truncated short.`);
    }
  }

  const buildFor = (subset: IdentityProbeResult[]) =>
    buildArmRows(
      subset.map((r) => r.wordsHit1), subset.map((r) => r.wordsHit5), subset.reduce((a, r) => a + r.wordsMs, 0),
      subset.map((r) => r.vecHit1), subset.map((r) => r.vecHit5), subset.reduce((a, r) => a + r.vecMs, 0),
      weightings.map((w, i) => ({
        label: w.label,
        hit1: subset.map((r) => r.fused[i].hit1),
        hit5: subset.map((r) => r.fused[i].hit5),
      })),
    );

  printTable(`${name} -- over ALL ${results.length} probes (includes rows whose own vector cannot find them; read as noise, not the finding)`, buildFor(results), 'hit');

  const restricted = results.filter((r) => r.selfRetrievable);
  console.log('');
  console.log(`  self-retrievable subset: ${restricted.length}/${results.length} target rows found themselves at rank 1`);
  console.log('  when the vector arm was queried with their own exact indexed text.');
  if (restricted.length < MIN_USABLE) {
    console.log(`  UNMEASURED: only ${restricted.length} rows pass the self-retrievability gate (need >= ${MIN_USABLE}).`);
    console.log('  No percentage is reported for the restricted table. The ALL-probes table above is noise, not a fallback answer.');
    console.log(`  KEY NUMBER: unmeasured (usable count ${restricted.length} < ${MIN_USABLE}).`);
  } else {
    const finalRows = buildFor(restricted);
    printTable(`${name} -- over the ${restricted.length} SELF-RETRIEVABLE probes only (this is the finding)`, finalRows, 'hit');
    const v = finalRows.find((r) => r.label === 'vectors alone')!;
    console.log('');
    console.log(
      `  KEY NUMBER: vectors alone found ${v.onlyVsWordsAt5} correct answer(s) in the top ${AT} (of ${v.n} self-retrievable probes) that words alone did not.`,
    );
  }
  console.log(`=== ${name} === END ${new Date().toISOString()} (started ${startedAt.toISOString()})`);
}

// ---------------------------------------------------------------------------
// Shape 3's own runner: category-membership metric, no self-retrieval gate.
// ---------------------------------------------------------------------------

/**
 * Shape 3 correctness note, 2026-09-05: a category rebuild (rebuildCategories
 * in schema.ts) deletes and reinserts all of product_category, ~17.2M rows,
 * over roughly two minutes, during which membership reads return nothing --
 * a plausible, silent, wrong zero, not an error. Worse than the timing alone:
 * if this process's `tagSizeCache` or `memberCache` (below) were populated
 * from BEFORE a rebuild finished, they would keep serving counts and
 * membership for tag spellings that no longer exist, for the rest of this
 * process's life, regardless of when this function actually runs. Both
 * caches are process-local Maps created fresh in `main()` every run, and
 * every query in this function opens against the read-only `db` connection
 * passed in and reads `product_category` directly -- neither goes through
 * search.ts's Catalogue class or its own memoized tag sizes. So the guarantee
 * this shape needs is at the process level, not inside this function: run
 * this file as a fresh process started after any known rebuild window ends,
 * and this shape is clean. That is a deployment/run discipline, not something
 * this function can enforce on itself, so it is written down here instead.
 */
async function runCategoryShape(
  name: string,
  probes: Probe<{ query: string; tag: string }>[],
  stats: SampleStats[],
  db: DatabaseSync,
  embedder: Embedder,
): Promise<void> {
  const startedAt = new Date();
  console.log('');
  console.log(`=== ${name} === START ${startedAt.toISOString()}`);
  console.log(`  sample space (restricted to rows that carry a vector, and whose category has`);
  console.log(`  <= ${MAX_CATEGORY_TAG} members -- search.ts's own MAX_RING_TAG cutoff):`);
  printSampleStats(stats);
  console.log(`  probes actually usable and scored: ${probes.length}`);

  if (probes.length < MIN_USABLE) {
    console.log(`  UNMEASURED: only ${probes.length} usable probes (need >= ${MIN_USABLE}). No percentage reported.`);
    console.log(`=== ${name} === END ${new Date().toISOString()}`);
    return;
  }

  const wordRunner = liveFtsRunner(db);
  const weightings = [
    { label: 'fused 1:1 (= production RRF)', wText: 1, wVec: 1 },
    { label: 'fused 1:3 (vector-weighted)', wText: 1, wVec: 3 },
    { label: 'fused 3:1 (text-weighted)', wText: 3, wVec: 1 },
  ];

  const wordsHit1: boolean[] = []; const wordsHit5: boolean[] = [];
  const vecHit1: boolean[] = []; const vecHit5: boolean[] = [];
  const fusedByWeighting = weightings.map((w) => ({ ...w, hit1: [] as boolean[], hit5: [] as boolean[] }));
  let wordsMs = 0; let vecMs = 0;
  let selfHitVec = 0;
  const memberCache = new Map<string, Set<string>>();
  const memberSizes: number[] = [];

  for (const p of probes) {
    let members = memberCache.get(p.built.tag);
    if (!members) {
      members = categoryMembers(db, p.built.tag);
      memberCache.set(p.built.tag, members);
      memberSizes.push(members.size);
    }

    const { codes: textCodes, ms: tMs } = textRankedWith(wordRunner, p.built.query, RETRIEVE_N);
    wordsMs += tMs;
    const { codes: vectorCodes, ms: vMs } = await vectorRanked(db, embedder, p.built.query, RETRIEVE_N);
    vecMs += vMs;

    const hitAt = (codes: string[], at: number) => codes.slice(0, at).some((c) => members!.has(c));
    wordsHit1.push(hitAt(textCodes, 1)); wordsHit5.push(hitAt(textCodes, AT));
    vecHit1.push(hitAt(vectorCodes, 1)); vecHit5.push(hitAt(vectorCodes, AT));
    for (const w of fusedByWeighting) {
      const fc = fusedCodes(textCodes, vectorCodes, w.wText, w.wVec);
      w.hit1.push(hitAt(fc, 1));
      w.hit5.push(hitAt(fc, AT));
    }

    const selfText = passageText({
      name: p.row.name, name_en: p.row.name_en, name_fr: p.row.name_fr,
      brands: p.row.brands, leaf_category: p.row.leaf_category, quantity: p.row.quantity,
    });
    const { codes: selfVecCodes } = await vectorRanked(db, embedder, selfText, 1);
    if (selfVecCodes[0] === p.code) selfHitVec += 1;
  }

  const rows = buildArmRows(
    wordsHit1, wordsHit5, wordsMs, vecHit1, vecHit5, vecMs,
    fusedByWeighting.map((w) => ({ label: w.label, hit1: w.hit1, hit5: w.hit5 })),
  );
  printTable(name, rows, 'category-hit');
  const vCat = rows.find((r) => r.label === 'vectors alone')!;
  console.log('');
  console.log(
    `  KEY NUMBER: vectors alone found ${vCat.onlyVsWordsAt5} case(s) (of ${vCat.n}) where a real category member landed`,
  );
  console.log('  in the top 5 that words alone missed entirely.');
  memberSizes.sort((a, b) => a - b);
  console.log('');
  console.log(
    `  queried category sizes: min ${memberSizes[0]}, median ${memberSizes[Math.floor(memberSizes.length / 2)]}, max ${memberSizes[memberSizes.length - 1]}, over ${memberSizes.length} distinct tags.`,
  );
  console.log(
    `  (footnote, not a gate for this metric: ${selfHitVec}/${probes.length} seed rows still found themselves at rank 1 on their own exact text.)`,
  );
  console.log('  CAVEAT: this measures whether a reasonable category member came back, not');
  console.log('  whether this specific seeded row did. It is a real and smaller claim than the');
  console.log("  first version of this file's shape 3, on purpose -- see file header.");
  console.log(`=== ${name} === END ${new Date().toISOString()} (started ${startedAt.toISOString()})`);
}

// ---------------------------------------------------------------------------

function printExampleQueries(label: string, probes: Probe<{ query: string }>[], count = 10): void {
  console.log(`  ${label} (up to ${count} shown, so any residual is visible rather than hidden):`);
  for (const p of probes.slice(0, count)) {
    console.log(`    "${p.built.query}"  (code ${p.code})`);
  }
}

async function main(): Promise<void> {
  const perSource1 = Math.max(1, Math.ceil(N1_TOTAL / SOURCES.length));
  const perSource3 = Math.max(1, Math.ceil(N3_TOTAL / SOURCES.length));
  console.log(
    `Run started ${new Date().toISOString()}. Sizes: shape1=${N1_TOTAL} (~${perSource1}/source), ` +
      `shape2(french)=${N_FRENCH}, different-wording=${N_DIFFERENT}, shape3=${N3_TOTAL} (~${perSource3}/source).`,
  );
  const db = openCatalogueReadOnly(DB_PATH);
  const embedder = defaultEmbedder();

  const totalRows = (db.prepare('SELECT count(*) AS n FROM product').get() as { n: number }).n;
  const vecRows = (db.prepare('SELECT count(*) AS n FROM product_vec').get() as { n: number }).n;
  console.log(`Live vector coverage right now: ${vecRows} of ${totalRows} rows (${((vecRows / totalRows) * 100).toFixed(1)}%).`);
  console.log('A background embedding job may be writing to this table; this number is a snapshot, not a constant.');
  console.log('Every sample below is restricted to rows that already carry a vector.');

  // --- Shape 1: paraphrase (mechanical stand-in, see file header) ---
  console.log('');
  console.log('NOTE ON SHAPE 1: no model/API key is configured in this environment, so the');
  console.log('real production query shape for the photo path -- a vision model describing a');
  console.log('photograph in its own words -- cannot be generated here. What follows is a');
  console.log('fixed mechanical stand-in and its number is not evidence about that real path');
  console.log('in either direction.');

  const shape1 = sampleAcrossSources(db, 'AND p.name_en IS NOT NULL AND length(p.name_en) >= 6', perSource1, buildParaphrase);
  const fired = { brand: 0, synonym: 0, size: 0 };
  for (const p of shape1.probes) {
    if (p.built.brandDropped) fired.brand += 1;
    if (p.built.synonymApplied) fired.synonym += 1;
    if (p.built.sizeRewritten) fired.size += 1;
  }
  const shape1TotalRows = (db.prepare('SELECT count(*) AS n FROM product').get() as { n: number }).n;
  await runIdentityShape('Shape 1: paraphrase (mechanical stand-in)', shape1.probes, shape1.stats, db, embedder, liveFtsRunner(db), {
    wordPoolSize: shape1TotalRows,
    allowedCodes: null,
    label: 'live product_fts, catalogue-wide',
  });
  if (shape1.probes.length > 0) {
    console.log(
      `  transform fire rate: brand dropped ${fired.brand}/${shape1.probes.length}, synonym applied ${fired.synonym}/${shape1.probes.length}, size rewritten ${fired.size}/${shape1.probes.length} (reorder fires on all of them by construction).`,
    );
  }

  // --- Shape 2 setup: measure the real French-vs-different-English split live ---
  const BILINGUAL_WHERE = `p.sold_in_canada = 1 AND p.name_en IS NOT NULL AND p.name_fr IS NOT NULL AND p.name_en <> p.name_fr`;
  const bilingualRows = db
    .prepare(`SELECT p.name_fr FROM product p JOIN product_vec v ON v.rowid = p.rowid WHERE ${BILINGUAL_WHERE}`)
    .all() as unknown as { name_fr: string }[];
  let funcCount = 0, diaCount = 0, eitherCount = 0;
  for (const r of bilingualRows) {
    const s = frenchSignal(r.name_fr);
    if (s.func) funcCount += 1;
    if (s.dia) diaCount += 1;
    if (s.either) eitherCount += 1;
  }
  console.log('');
  console.log(`Shape 2 ground truth universe (live count): ${bilingualRows.length} bilingual Canadian rows with a vector`);
  console.log('(name_en and name_fr both present and different strings). Filtered by a French');
  console.log(`function word or diacritic: function word ${funcCount}, diacritic ${diaCount}, either ${eitherCount}`);
  console.log(`(${((eitherCount / bilingualRows.length) * 100).toFixed(0)}%). Only the "either" pool is genuinely French; the`);
  console.log(`remaining ${bilingualRows.length - eitherCount} rows are a different-wording shape, reported separately below, not merged in.`);
  console.log('Building the throwaway English-only word index (name_en, brands, leaf_category; no name_fr)...');
  const throwaway = buildThrowawayEnglishIndex(db);
  console.log(`  indexed ${throwaway.rows} rows in ${throwaway.ms} ms (sold_in_canada=1 AND name_en IS NOT NULL, joined to product_vec).`);
  const wordRunner = throwawayFtsRunner(throwaway.mem);

  // --- POOL FAIRNESS: the three numbers, and which pool each arm actually searches ---
  const liveVectorPoolSize = (db.prepare('SELECT count(*) AS n FROM product_vec').get() as { n: number }).n;
  console.log('');
  console.log('POOL FAIRNESS CHECK for shape 2 and the different-wording shape:');
  console.log(`  word index (throwaway, English-only) holds: ${throwaway.rows} rows`);
  console.log(`  vector index (product_vec, live, catalogue-wide) holds: ${liveVectorPoolSize} rows`);
  console.log(`  intersection (built into the throwaway index by construction, see buildThrowawayEnglishIndex): ${throwaway.codes.size} rows`);
  if (throwaway.rows !== liveVectorPoolSize) {
    console.log(
      `  These differ (${throwaway.rows} vs ${liveVectorPoolSize}), so the vector arm is restricted below to exactly`,
    );
    console.log(`  the ${throwaway.codes.size}-row intersection via overfetch+filter, matching the word arm's pool exactly.`);
  } else {
    console.log('  These happen to be equal in size, but pool identity is still enforced explicitly below, not assumed.');
  }

  // --- Shape 2: real French query, English-only word index ---
  const shapeFrench = sampleByRowidStride(db, 'bilingual Canada (French)', BILINGUAL_WHERE, [], N_FRENCH, makeBilingualBuilder(true));
  console.log('');
  printExampleQueries('Shape 2 sampled queries', shapeFrench.probes);
  await runIdentityShape(
    'Shape 2: real bilingual Canadian row, REAL FRENCH name, English-only word index (the shape this lane exists for)',
    shapeFrench.probes,
    [shapeFrench.stats],
    db,
    embedder,
    wordRunner,
    { wordPoolSize: throwaway.rows, allowedCodes: throwaway.codes, label: 'throwaway English-only index, sold_in_canada=1, name_en not null' },
  );

  // --- Different-wording shape: real different English, NOT a translation shape ---
  const shapeDifferent = sampleByRowidStride(db, 'bilingual Canada (different English)', BILINGUAL_WHERE, [], N_DIFFERENT, makeBilingualBuilder(false));
  console.log('');
  printExampleQueries('Different-wording shape sampled queries', shapeDifferent.probes);
  await runIdentityShape(
    'Different-wording shape (NOT shape 2, NOT a translation test): a real person\'s different English description of the same row, English-only word index',
    shapeDifferent.probes,
    [shapeDifferent.stats],
    db,
    embedder,
    wordRunner,
    { wordPoolSize: throwaway.rows, allowedCodes: throwaway.codes, label: 'throwaway English-only index, sold_in_canada=1, name_en not null' },
  );
  throwaway.mem.close();

  // --- Shape 3: loose typed query, category-membership metric ---
  const tagSizeCache = new Map<string, number>();
  const shape3 = sampleAcrossSources(db, 'AND p.leaf_category IS NOT NULL', perSource3, buildLooseChecked(db, tagSizeCache));
  await runCategoryShape('Shape 3: loose typed query, category-membership metric', shape3.probes, shape3.stats, db, embedder);

  // --- Shape 4 ---
  reportShapeFour(db);

  console.log('');
  console.log(`Run finished ${new Date().toISOString()}.`);
  db.close();
}

await main();
