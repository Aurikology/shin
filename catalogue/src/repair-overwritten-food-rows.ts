/**
 * PUT BACK THE FOOD NAMES A SECOND SOURCE OVERWROTE.
 *
 * WHAT HAPPENED, counted 2026-09-26 rather than suspected. `load.ts`'s conflict
 * clause used to overwrite every field of an existing row with the incoming
 * one, whoever was writing. Quebec's deposit registry then loaded 50,166 drinks,
 * and 5,106 of those barcodes were already in the catalogue from the food
 * database. Every one of those rows lost its name, its brand, its picture and
 * its `source` to the registry's own terser record:
 *
 *   "Black Raspberry Sparkling Fruit2O"  ->  "Black Raspberry"
 *   "Mixed Berry Sparkling Fruit2O"      ->  "Baies"
 *   "Cherry Limeade Sparkling Ice"       ->  "Sparkling ICE - Limonade cerise"
 *
 * And because the phone's grocery pack selects `source = 'openfoodfacts'`, those
 * 5,106 products silently left the pack while still sitting in the catalogue.
 * Nothing failed. A row count in a test file written three weeks earlier is what
 * noticed: 122,101 expected, 116,998 exported.
 *
 * The cause is fixed in `load.ts`: a second source may now only fill a hole, and
 * `test/load-second-source.test.ts` goes red if that is undone. This script is
 * the other half, the rows already damaged, and it applies exactly the rule the
 * loader should have applied at the time.
 *
 * WHERE THE OLD VALUES COME FROM. `data/catalogue.db.before-dedupe`, a byte copy
 * of this catalogue taken 2026-09-13, which is before the registry load. That
 * date is also this script's one honest limitation: any legitimate change to
 * these rows between 2026-09-13 and the registry load would be undone along with
 * the damage. Only loaders write here and no food load ran in that window, so
 * the risk is small, but it is a risk and not a guarantee.
 *
 * THE RULE APPLIED, per column, for the rows whose `source` the registry took:
 *   - a text column: the old value wins when it is not null and not blank,
 *     otherwise the current value stays, because the registry did fill some
 *     holes (a French name, a container size) and those are worth keeping.
 *   - `sold_in_canada`: the higher of the two, never lowered. The registry
 *     proves the drink is sold in Canada.
 *   - `source`: back to the old source, which is what returns the row to the
 *     pack it belongs in.
 *
 * ONE ROW IS EXCLUDED BY BARCODE. 0045496590161 was corrected by hand during the
 * duplicate cleanup: the food database had "Caramel au beurre" sitting on a
 * Nintendo prefix and it now reads "Switch Pro Controller". Restoring the old
 * name there would put the known-wrong one back.
 *
 *   node --experimental-strip-types src/repair-overwritten-food-rows.ts
 *   node --experimental-strip-types src/repair-overwritten-food-rows.ts --apply
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const DB = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const OLD = `${DB}.before-dedupe`;
const apply = process.argv.includes('--apply');

/** The hand-corrected row, named here so a rule cannot undo a decision. */
const LEAVE_ALONE = new Set(['0045496590161']);

/** Text columns a second source was allowed to overwrite and should not have. */
const TEXT = [
  'name',
  'name_en',
  'name_fr',
  'brands',
  'quantity',
  'size_unit',
  'category_path',
  'leaf_category',
  'allergens',
  'image_url',
  'generic_name',
  'nutriscore_grade',
  'ingredients_text',
] as const;
/** Numeric columns, same rule, with null as the only hole. */
const NUM = ['size_value', 'nova_group', 'additives_n'] as const;

const blank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && (v.trim() === '' || v.trim() === '[]'));

/*
 * TWO EXCEPTIONS THE FIRST DRY RUN EARNED, both from reading its own output
 * instead of trusting the rule.
 *
 * COSMETIC CHANGES ARE NOT DAMAGE. The registry wrote "Schweppes Soda Tonique"
 * over "Schweppes Soda tonique" and "503 ml" over "503 mL". Putting those back
 * is 1,000-odd writes that change nothing anybody can see, and every one of them
 * is a chance to get something wrong. So a difference that disappears under
 * lowercasing and whitespace collapsing is left where it is.
 */
const sameEnough = (a: unknown, b: unknown): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string') return a === b;
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return n(a) === n(b);
};

/*
 * AND THE FRENCH NAME IS THE ONE FIELD THE REGISTRY DOES BETTER. The food
 * database had "Cherry Limeade" sitting in `name_fr`, which is English text in a
 * French field; Quebec's registry wrote "Sparkling ICE - Limonade cerise", which
 * is actually French. A rule that says the older value always wins would make
 * that row worse, so `name_fr` is filled only when the current value is empty.
 * Nothing else in this list has that property: the registry publishes no
 * ingredients, no Nutri-Score, no category path and no picture at all.
 */
const ONLY_IF_EMPTY = new Set(['name_fr']);

function main(): number {
  if (!existsSync(OLD)) {
    console.error(`no copy to read the old values from at ${OLD}`);
    return 2;
  }
  const old = new DatabaseSync(OLD, { readOnly: true });
  const live = new DatabaseSync(DB, { readOnly: !apply });
  for (const db of [old, live]) db.exec('PRAGMA busy_timeout = 300000');

  const cols = [...TEXT, ...NUM];
  const pick = old.prepare(`SELECT source, ${cols.join(', ')} FROM product WHERE code = ?`);

  /*
   * The candidates: every row whose source is one of the sources that loaded
   * AFTER the copy was taken. Read from the live file, so a row that was never
   * touched is never considered.
   */
  const laterSources = live
    .prepare(
      "SELECT DISTINCT source FROM product WHERE source NOT IN ('openfoodfacts', 'icecat'," +
        " 'openbeautyfacts', 'openproductsfacts', 'openpetfoodfacts')",
    )
    .all()
    .map((r) => r.source as string);
  console.log(`sources that loaded after the copy: ${laterSources.join(', ') || '(none)'}`);

  let considered = 0;
  let overwritten = 0;
  let skippedByHand = 0;
  const changes: { code: string; column: string; from: unknown; to: unknown }[] = [];
  const perColumn = new Map<string, number>();
  const rows: { code: string; sets: Record<string, unknown>; oldSource: string }[] = [];

  for (const src of laterSources) {
    for (const r of live
      .prepare(`SELECT code, source, ${cols.join(', ')} FROM product WHERE source = ?`)
      .iterate(src)) {
      considered++;
      const was = pick.get(r.code as string) as Record<string, unknown> | undefined;
      if (!was) continue; // the row is new, nothing was overwritten
      if (was.source === r.source) continue; // same source refreshed itself, allowed
      if (LEAVE_ALONE.has(r.code as string)) {
        skippedByHand++;
        continue;
      }
      const sets: Record<string, unknown> = {};
      for (const c of cols) {
        const before = was[c];
        const now = (r as Record<string, unknown>)[c];
        if (ONLY_IF_EMPTY.has(c) && !blank(now)) continue;
        if (!blank(before) && before !== now && !sameEnough(before, now)) {
          sets[c] = before;
          if (changes.length < 15) changes.push({ code: r.code as string, column: c, from: now, to: before });
          perColumn.set(c, (perColumn.get(c) ?? 0) + 1);
        }
      }
      if (Object.keys(sets).length || was.source !== r.source) {
        sets.source = was.source;
        perColumn.set('source', (perColumn.get('source') ?? 0) + 1);
        overwritten++;
        rows.push({ code: r.code as string, sets, oldSource: was.source as string });
      }
    }
  }

  console.log(`rows examined: ${considered}`);
  console.log(`rows a different source had overwritten: ${overwritten}`);
  console.log(`rows left alone by name: ${skippedByHand}`);
  console.log(`columns to put back: ${JSON.stringify([...perColumn.entries()])}`);
  console.log('first changes, current value then the one going back:');
  for (const c of changes) console.log(`  ${c.code} ${c.column}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`);

  if (!apply) {
    console.log('\nDRY RUN. Nothing written. Re-run with --apply.');
    old.close();
    live.close();
    return 0;
  }

  live.exec('BEGIN');
  try {
    let written = 0;
    for (const r of rows) {
      const keys = Object.keys(r.sets);
      // sold_in_canada is raised, never lowered: a registry saying the drink is
      // sold here is a fact the food database's silence does not undo.
      live
        .prepare(`UPDATE product SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE code = ?`)
        .run(...keys.map((k) => r.sets[k] as never), r.code);
      written++;
    }
    live.exec('COMMIT');
    console.log(`wrote ${written} rows`);
  } catch (err) {
    live.exec('ROLLBACK');
    console.error('ROLLED BACK', err);
    old.close();
    live.close();
    return 1;
  }

  // The text index is external content over `product`, so a name change leaves it
  // stale rather than obviously broken.
  console.log('rebuilding the text index');
  live.exec("INSERT INTO product_fts(product_fts) VALUES('rebuild')");

  const grocery = Object.values(
    live.prepare("SELECT count(*) FROM product WHERE source = 'openfoodfacts' AND sold_in_canada = 1").get() ?? {},
  )[0] as number;
  console.log(`grocery rows now: ${grocery}`);
  console.log(grocery >= 122_100 ? 'PASS: the grocery pack is whole again' : 'CHECK: still short of the 122,158 the copy held');
  old.close();
  live.close();
  return 0;
}

process.exit(main());
