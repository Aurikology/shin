/*
 * Fills `product.name_derived` for single-language rows, then rebuilds the index.
 *
 * Offline and deterministic: the only inputs are the catalogue and the shipped
 * lexicon (src/lexicon-fr-en.json, itself built from the catalogue by
 * build-lexicon.ts). No network, no key, no translation service -- rule 8 of
 * docs/jamin-gemini-rules.md.
 *
 * WHAT IT WRITES, AND WHAT IT REFUSES TO TOUCH. `name_en` and `name_fr` are
 * never modified. A derived name is not the product's name, and overwriting the
 * source with a machine alignment would turn an unverified guess into what looks
 * like fact for every reader downstream. The derivation lands in its own column
 * with `derived_source` beside it saying what produced it.
 *
 * Rows it skips, and why each is correct to skip:
 *   - bilingual rows: nothing to derive, both languages are already indexed.
 *   - rows with no name at all: nothing to derive from.
 *   - rows whose name carries no marker of its own language: 82.7% of the
 *     Canadian single-language population, and already findable from either
 *     language because FTS5 MATCH does not filter by column. See crosslang.ts.
 *
 * Usage:  node src/backfill-derived.ts [--db path] [--dry]
 */
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { openCatalogue, rebuildFts } from './schema.ts';
import { LanguageModel, derive, type Lexicon, type Lang } from './crosslang.ts';

export function loadLexicon(path?: string): Lexicon {
  const p = path ?? new URL('./lexicon-fr-en.json', import.meta.url);
  return JSON.parse(readFileSync(p, 'utf8')) as Lexicon;
}

export interface BackfillReport {
  readonly scanned: number;
  readonly gated: number;      // skipped: no marker of their own language
  readonly derived: number;    // wrote a derivation
  readonly empty: number;      // marked, but the lexicon knew none of its tokens
  readonly cleared: number;    // had a stale derivation, now bilingual or renamed
  readonly nameOnly: number;   // rows rescued from having no indexed name at all
}

export function backfillDerived(db: DatabaseSync, lex: Lexicon, dry = false): BackfillReport {
  const lm = LanguageModel.fromCatalogue(db);
  const set = (c: string) => `trim(coalesce(${c},'')) <> ''`;
  const rows = db.prepare(
    `SELECT rowid, name_en, name_fr, brands, name_derived FROM product
     WHERE (${set('name_en')}) <> (${set('name_fr')})`,
  ).all() as unknown as {
    rowid: number; name_en: string | null; name_fr: string | null;
    brands: string | null; name_derived: string | null;
  }[];

  const write = db.prepare('UPDATE product SET name_derived = ?, derived_source = ? WHERE rowid = ?');
  let gated = 0, derived = 0, empty = 0, cleared = 0;
  for (const r of rows) {
    const from: Lang = r.name_fr ? 'fr' : 'en';
    const name = from === 'fr' ? r.name_fr : r.name_en;
    const d = derive({ name, brands: r.brands }, from, lex, lm);
    if (!d) {
      if (!lm.carriesMarkers(name, from, r.brands)) gated++; else empty++;
      // A row that no longer derives must lose whatever it derived last time,
      // or a re-run after a lexicon change leaves stale text in the index and
      // the index stops being a function of the data.
      if (r.name_derived !== null) { cleared++; if (!dry) write.run(null, null, r.rowid); }
      continue;
    }
    derived++;
    if (!dry) write.run(d.text, d.source, r.rowid);
  }
  // Bilingual rows can also carry a stale derivation from an earlier run where
  // one of their names was still missing.
  const stale = db.prepare(
    `SELECT count(*) AS n FROM product WHERE name_derived IS NOT NULL
     AND ${set('name_en')} AND ${set('name_fr')}`,
  ).get() as unknown as { n: number };
  if (stale.n > 0 && !dry) {
    db.exec(`UPDATE product SET name_derived = NULL, derived_source = NULL
             WHERE name_derived IS NOT NULL AND ${set('name_en')} AND ${set('name_fr')}`);
  }
  /*
   * The rows with no language name at all. `product_fts` indexes name_en and
   * name_fr, so a row carrying only `name` has no name text in the index and
   * 96.9% of them cannot be found by their own name -- measured, not assumed.
   * Copying `name` here makes them searchable without adding `name` as an FTS
   * column, which would duplicate the 184,302 rows where `name` is a verbatim
   * copy of a language column and carries nothing new.
   */
  const nameOnly = db.prepare(
    `SELECT count(*) AS n FROM product
     WHERE NOT ${set('name_en')} AND NOT ${set('name_fr')} AND ${set('name')}`,
  ).get() as unknown as { n: number };
  if (!dry) {
    db.exec(
      `UPDATE product SET name_derived = name, derived_source = 'name-only'
       WHERE NOT ${set('name_en')} AND NOT ${set('name_fr')} AND ${set('name')}`,
    );
  }

  return { scanned: rows.length, gated, derived, empty, cleared: cleared + Number(stale.n), nameOnly: Number(nameOnly.n) };
}

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--db');
  const path = i >= 0 ? args[i + 1] : (process.env.SHIN_DB ?? 'data/catalogue.db');
  const dry = args.includes('--dry');
  // openCatalogue runs migrateFts, which is what puts name_derived INTO the
  // index on a catalogue built before today. Backfilling without it writes a
  // column nothing searches.
  const db = openCatalogue(path);
  const rep = backfillDerived(db, loadLexicon(), dry);
  console.log(`scanned ${rep.scanned} single-language rows`);
  console.log(`  gated (no marker of own language, already cross-language findable): ${rep.gated}`);
  console.log(`  derived: ${rep.derived}`);
  console.log(`  marked but no lexicon coverage: ${rep.empty}`);
  console.log(`  stale derivations cleared: ${rep.cleared}`);
  console.log(`  rows with no language name, now searchable via name_derived: ${rep.nameOnly}`);
  if (!dry) { rebuildFts(db); console.log('product_fts rebuilt'); }
  else console.log('(dry run: nothing written, index not rebuilt)');
  db.close();
}
