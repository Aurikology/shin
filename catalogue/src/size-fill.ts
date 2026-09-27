/**
 * Unit 7, "Fill the missing sizes" (docs/catalogue-build-plan-2026-09-26.md).
 *
 * A product with no size cannot be priced per unit and cannot be compared to
 * anything. This fills `size_value`/`size_unit` on Canadian food-and-drink
 * rows (sold_in_canada = 1 AND source = 'openfoodfacts' -- the same predicate
 * export-pack.ts uses for the grocery pack) from two sources, in the order
 * the plan ranks them:
 *
 *   1. The `quantity` column, a human string like "503 mL" or "2 x 1.5 L".
 *      Parsed with units.ts's own `parseQuantity` + `toComparison` -- NOT a
 *      second parser. `size_value`/`size_unit` are stored in Shin's base
 *      units (g, ml or ea), which is exactly what `toComparison` returns and
 *      exactly what the existing rows already contain (verified against
 *      `prepare_rows.py`'s `parse_size`, which converts to the same base
 *      units at load time).
 *   2. The product's own name, only when a size is unambiguous: exactly one
 *      valid unit match in the whole name, anchored at the very end (nothing
 *      but closing punctuation/whitespace after it), and not part of a
 *      hyphen range ("1 1/2-2 LB"). A size read from a name is weaker
 *      evidence than one from the quantity column, so it is counted and
 *      reported separately and never overrides a quantity-column fill.
 *
 * DRY RUN BY DEFAULT. `--apply` opens the database for writing and commits
 * the UPDATEs in one transaction; without it, the database is opened with
 * `openCatalogueReadOnly` and nothing is written. Tonight this must run
 * dry-run only -- a second registry load and a cleanup pass are queued
 * behind this lane and own the only write access.
 */
import { openCatalogue, openCatalogueReadOnly } from './schema.ts';
import { parseQuantity, toComparison } from './units.ts';

const FOOD_WHERE = "sold_in_canada = 1 AND source = 'openfoodfacts'";

export interface CandidateRow {
  code: string;
  name: string;
  name_en: string | null;
  name_fr: string | null;
  quantity: string | null;
}

export interface Fill {
  code: string;
  source: 'quantity' | 'name';
  /** The exact string the size was read from. */
  fromText: string;
  value: number;
  unit: string; // base unit: 'g' | 'ml' | 'ea'
}

/**
 * The regex parseQuantity itself uses (kept identical on purpose -- see the
 * file header: reusing units.ts's own vocabulary, not inventing a rival
 * one). Used here with `g` (global) because a full product name can contain
 * unrelated numbers before the real size ("Family Size" packs, percentages),
 * and unlike the `quantity` column -- which is normally size text and
 * nothing else -- a name needs every candidate found and filtered, not just
 * the first.
 */
const SIZE_TOKEN = /(?:(\d+)\s*[x*]\s*)?(\d+(?:\.\d+)?|\.\d+)\s*(fl\.?\s*oz|[a-z]+)\b/g;

/**
 * A name-derived size above 50 kg or 50 L is a model number, a lot count or a
 * misprint wearing a unit, not a package -- the same cap `prepare_rows.py`'s
 * `size_from_name` already applies at load time, carried over here because a
 * name gives no second field to sanity-check against. Found live: "ME
 * BOUCHÉE FRAMBOISE 240KG" is not a 240 kilogram raspberry bite.
 */
const MAX_NAME_DERIVED_BASE_VALUE = 50000;

/**
 * Units this catalogue's OpenFoodFacts rows sometimes carry that describe a
 * per-serving active-ingredient dose, not the size of the package: "L-lysine
 * 1000 Mg" and "Caffeine 200 Mg" are supplements, and the milligram figure in
 * the name is the dose per capsule, never the weight of the bottle. There is
 * no legitimate retail food package sized in milligrams, so any name ending
 * in a milligram figure is excluded here rather than written as a 0.1-1 g
 * "size" that would make a per-100g unit price nonsense. Found live during
 * the unit's own hand-check, not guessed in advance.
 */
const DOSE_UNITS = new Set(['mg', 'milligram', 'milligrams']);

/** A size read straight out of the `quantity` column, via units.ts alone. */
export function fillFromQuantity(quantity: string | null): { value: number; unit: string; matchedText: string } | null {
  if (!quantity || quantity.trim() === '') return null;
  const parsed = parseQuantity(quantity);
  if (!parsed) return null;
  const comp = toComparison(parsed.value, parsed.unit);
  if (!comp) return null;
  return { value: comp.baseValue, unit: comp.baseUnit, matchedText: quantity.trim() };
}

/**
 * A size read out of a display name, only when unambiguous:
 *   - exactly one position in the name has a digit run followed by a unit
 *     token units.ts actually recognises (so "12 Grain" and "2%" never
 *     match: "grain" and "%" are not units),
 *   - that match sits at the very end of the name (only whitespace or
 *     closing punctuation after it), because that is where a package size
 *     is actually printed and a number picked up from the middle of a name
 *     is the shape most likely to be something else entirely,
 *   - it is not the tail of a hyphenated range ("1 1/2-2 LB"), where the
 *     single matched number is real text but not the whole size,
 *   - it is not a milligram dose ("L-lysine 1000 Mg"), which is a supplement's
 *     per-capsule active ingredient, not the size of the bottle,
 *   - it is not above 50 kg / 50 L, which is a misprint or a lot count
 *     wearing a unit ("ME BOUCHEE FRAMBOISE 240KG" is not a 240 kg raspberry
 *     bite), the same cap `prepare_rows.py`'s `size_from_name` already
 *     applies at load time.
 */
export function fillFromName(displayName: string | null): { value: number; unit: string; matchedText: string } | null {
  if (!displayName) return null;
  const original = displayName.trim();
  const lower = original.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');

  const valid: { start: number; end: number; value: number; unit: string }[] = [];
  SIZE_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SIZE_TOKEN.exec(lower))) {
    const pack = m[1] ? Number(m[1]) : null;
    if (pack !== null && pack <= 0) continue; // "0 x 88 ml": not a real multiplier, skip this token.
    const each = Number(m[2]);
    const unit = m[3];
    const comp = toComparison(each, unit);
    if (comp) {
      valid.push({ start: m.index, end: m.index + m[0].length, value: pack !== null ? pack * each : each, unit });
    }
  }
  if (valid.length !== 1) return null; // zero: nothing found; more than one: ambiguous.

  const hit = valid[0];
  if (DOSE_UNITS.has(hit.unit)) return null; // "L-lysine 1000 Mg": a dose, not a package size.
  const tail = lower.slice(hit.end);
  if (!/^[\s).,;:!]*$/.test(tail)) return null; // not anchored at the end.

  const before = lower.slice(0, hit.start);
  if (/\d\s*-\s*$/.test(before) || /\bto\s*$/.test(before)) return null; // tail of a range.

  const comp = toComparison(hit.value, hit.unit);
  if (!comp) return null;
  if (comp.baseUnit !== 'ea' && comp.baseValue > MAX_NAME_DERIVED_BASE_VALUE) return null; // model number / lot count / misprint, not a package.
  return { value: comp.baseValue, unit: comp.baseUnit, matchedText: original.slice(hit.start, hit.end) };
}

/** Computes every fill this unit would make, without touching the database. */
export function computeFills(rows: CandidateRow[]): { quantityFills: Fill[]; nameFills: Fill[] } {
  const quantityFills: Fill[] = [];
  const nameFills: Fill[] = [];
  for (const r of rows) {
    const q = fillFromQuantity(r.quantity);
    if (q) {
      quantityFills.push({ code: r.code, source: 'quantity', fromText: q.matchedText, value: q.value, unit: q.unit });
      continue;
    }
    const display = r.name_en || r.name_fr || r.name;
    const n = fillFromName(display);
    if (n) {
      nameFills.push({ code: r.code, source: 'name', fromText: n.matchedText, value: n.value, unit: n.unit });
    }
  }
  return { quantityFills, nameFills };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
  const db = apply ? openCatalogue(DB_PATH) : openCatalogueReadOnly(DB_PATH);
  db.exec('PRAGMA busy_timeout = 120000');

  const before = (db.prepare(`SELECT count(*) AS n FROM product WHERE ${FOOD_WHERE} AND size_value IS NULL`).get() as { n: number }).n;
  const total = (db.prepare(`SELECT count(*) AS n FROM product WHERE ${FOOD_WHERE}`).get() as { n: number }).n;

  const rows = db
    .prepare(`SELECT code, name, name_en, name_fr, quantity FROM product WHERE ${FOOD_WHERE} AND size_value IS NULL`)
    .all() as unknown as CandidateRow[];

  const { quantityFills, nameFills } = computeFills(rows);

  console.log(`Canadian food & drink rows: ${total}`);
  console.log(`No-size before: ${before}`);
  console.log(`Would fill from quantity column: ${quantityFills.length}`);
  console.log(`Would fill from product name: ${nameFills.length}`);
  console.log(`Total would fill: ${quantityFills.length + nameFills.length}`);
  console.log(`No-size after (projected): ${before - quantityFills.length - nameFills.length}`);

  if (!apply) {
    console.log('\nDRY RUN -- nothing written. Pass --apply to write.');
    db.close();
    return;
  }

  const update = db.prepare('UPDATE product SET size_value = ?, size_unit = ? WHERE code = ? AND size_value IS NULL');
  db.exec('BEGIN');
  try {
    for (const f of [...quantityFills, ...nameFills]) {
      update.run(f.value, f.unit, f.code);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const after = (db.prepare(`SELECT count(*) AS n FROM product WHERE ${FOOD_WHERE} AND size_value IS NULL`).get() as { n: number }).n;
  console.log(`\nAPPLIED. No-size after (from database): ${after}`);
  db.close();
}

if (process.argv[1] && process.argv[1].endsWith('size-fill.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
