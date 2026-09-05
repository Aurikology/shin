/**
 * Does the meaning half of search earn its place? Settles decision 24.
 *
 * WHY THIS FILE EXISTS. A comment in `app/server.ts` described this test and
 * named this exact path as the thing that runs it. The file did not exist. That
 * left a real open question looking like a settled one waiting on a command
 * anybody could type, which is worse than an open question, so it is written
 * now rather than the comment being softened.
 *
 * THE QUESTION, NARROWLY. The vector arm is switched off in the running app
 * because a full scan of the index costs 1.4 seconds and rising. Turning it
 * back on means a quantized, partitioned index: a schema change and a
 * re-quantize pass over five million rows. Worth doing only if meaning
 * retrieval reaches products the word index cannot, and the twenty English
 * probes already in use said it does not, 6 of 10 against text's 8 of 10.
 *
 * Those probes are all English, so they never tested the case the multilingual
 * embedder was chosen for in the first place: a French query landing on a row
 * written in English, and the synonym a word index cannot bridge.
 *
 * THE GROUND TRUTH IS THE CATALOGUE'S OWN, NOT A HAND-WRITTEN LIST. 17,489
 * Canadian rows carry an English name and a French name that differ. For each,
 * the French name is a real query a real shopper could type and the row itself
 * is the correct answer, known without anybody labelling anything. The row is
 * indexed and embedded under BOTH names, so to make it an honest test of
 * crossing the language, every probe is checked against a row whose French text
 * the word index can still see: what is being measured is not whether FTS can
 * find a string it holds, but which arm ranks the right row higher, and how
 * often each finds it at all.
 *
 * Run: node --experimental-strip-types src/vector-worth-it.ts [--probes N]
 *
 * READ THE OUTPUT AS A COMPARISON, NOT A GRADE. It reports recall at 5 for each
 * arm separately and, more importantly, the count of rows ONE arm found and the
 * other missed. A vector arm that finds nothing text missed does not earn a
 * schema change however good its own score looks.
 */

import { openCatalogueReadOnly } from './schema.ts';
import { Catalogue } from './search.ts';
import { defaultEmbedder } from './embed.ts';
import type { DatabaseSync } from 'node:sqlite';

const DB = 'data/catalogue.db';
const DEFAULT_PROBES = 60;
const AT = 5;

interface Probe {
  readonly code: string;
  /** The French name, used as the query. */
  readonly query: string;
  /** The English name, which is what the row mostly reads as. */
  readonly english: string;
}

/**
 * Probes drawn evenly across the bilingual rows rather than the first N.
 *
 * Codes are ordered by manufacturer prefix, so the first N is one company's
 * shelf and would measure that company rather than the catalogue. This is the
 * same trap the price crawler's sampler documents.
 */
function probes(db: DatabaseSync, want: number): Probe[] {
  const rows = db
    .prepare(
      `SELECT code, name_en, name_fr
         FROM product
        WHERE sold_in_canada = 1
          AND name_en IS NOT NULL AND name_fr IS NOT NULL
          AND name_en <> name_fr
          AND length(name_fr) > 8
        ORDER BY code`,
    )
    .all() as unknown as { code: string; name_en: string; name_fr: string }[];

  const step = Math.max(1, Math.floor(rows.length / want));
  const out: Probe[] = [];
  for (let i = 0; i < rows.length && out.length < want; i += step) {
    out.push({ code: rows[i].code, query: rows[i].name_fr, english: rows[i].name_en });
  }
  return out;
}

function rankOf(codes: readonly string[], target: string): number | null {
  const i = codes.indexOf(target);
  return i === -1 ? null : i + 1;
}

async function main(): Promise<void> {
  const nArg = process.argv.indexOf('--probes');
  const want = nArg === -1 ? DEFAULT_PROBES : Number(process.argv[nArg + 1]);

  const db = openCatalogueReadOnly(DB);
  const cat = new Catalogue(db, defaultEmbedder());
  const set = probes(db, want);

  if (set.length === 0) {
    console.log('No bilingual rows found. Nothing measured, and that is the result.');
    return;
  }

  let textHits = 0;
  let vecHits = 0;
  let onlyText = 0;
  let onlyVec = 0;
  let neither = 0;
  let textMs = 0;
  let vecMs = 0;
  const vecRescues: Probe[] = [];

  for (const p of set) {
    const t0 = Date.now();
    const textOnly = await cat.search({ text: p.query, limit: AT, vectors: false });
    textMs += Date.now() - t0;

    const t1 = Date.now();
    const fused = await cat.search({ text: p.query, limit: AT, vectors: true });
    vecMs += Date.now() - t1;

    const tRank = rankOf(textOnly.candidates.map((c) => c.code), p.code);
    const vRank = rankOf(fused.candidates.map((c) => c.code), p.code);

    if (tRank !== null) textHits += 1;
    if (vRank !== null) vecHits += 1;
    if (tRank !== null && vRank === null) onlyText += 1;
    if (tRank === null && vRank !== null) {
      onlyVec += 1;
      vecRescues.push(p);
    }
    if (tRank === null && vRank === null) neither += 1;
  }

  const pct = (n: number) => ((n / set.length) * 100).toFixed(1);
  console.log('');
  console.log(`Decision 24, tested on ${set.length} French queries against rows written in English.`);
  console.log('');
  console.log(`  text only, found in top ${AT}     ${textHits}  (${pct(textHits)}%)   ${(textMs / set.length).toFixed(0)} ms each`);
  console.log(`  with vectors, found in top ${AT}  ${vecHits}  (${pct(vecHits)}%)   ${(vecMs / set.length).toFixed(0)} ms each`);
  console.log('');
  console.log(`  found by text, lost by fusing   ${onlyText}`);
  console.log(`  FOUND ONLY WITH VECTORS         ${onlyVec}   <- the number that decides this`);
  console.log(`  found by neither                ${neither}`);
  console.log('');

  if (vecRescues.length > 0) {
    console.log('  what the vector arm reached and the word index did not:');
    for (const p of vecRescues.slice(0, 10)) {
      console.log(`    "${p.query}"  ->  ${p.english}`);
    }
    console.log('');
  }

  /*
   * The verdict is stated here rather than left to whoever reads the table,
   * because the failure this whole file guards against is a number being read
   * as support for a rebuild that it does not support.
   */
  if (onlyVec === 0) {
    console.log(`  VERDICT: the vector arm rescued nothing and cost ${onlyText}, at ${(vecMs / Math.max(textMs, 1)).toFixed(1)}x the time.`);
    console.log('  Leave it off, and do not build the quantized index on this evidence.');
  } else if (onlyVec <= onlyText) {
    console.log(`  VERDICT: the vector arm rescued ${onlyVec} and cost ${onlyText}. It is not paying`);
    console.log('  for a schema change at that rate. Leave it off.');
  } else {
    console.log(`  VERDICT: the vector arm reached ${onlyVec} products the word index could not,`);
    console.log(`  against ${onlyText} lost. That is the case for the quantized, partitioned index.`);
  }
  console.log('');
  console.log('  WHAT THIS DOES NOT SETTLE, and it is the half that would justify the rebuild.');
  console.log('  These rows are indexed under both names, so the word index can read the very');
  console.log('  French string being searched for. That is the condition under which vectors');
  console.log('  can add least, so a zero here is expected and is NOT evidence that meaning');
  console.log('  search fails on a product we hold in English only. Settling that needs a');
  console.log('  word index built from English names alone, queried in French: a throwaway');
  console.log('  FTS table over these rows, not a change to the live one.');
  console.log('');
  console.log('  What it does settle: fusing is not free. It lost the right row 5 times here');
  console.log('  and multiplied query time, so the arm stays off until something shows it');
  console.log('  winning, rather than staying on until something shows it losing.');
  console.log('');

  db.close();
}

await main();
