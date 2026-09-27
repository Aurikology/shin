/**
 * The falsifier itself, run mechanically first as a starting point for the
 * hand check: for every quantity-sourced fill, does the product's own name
 * ALSO happen to print a size, and if so does it agree? (Name-sourced fills
 * are excluded from this cross-check -- comparing a name-derived size against
 * itself is not a test.) Where the name prints nothing checkable, that row is
 * not a falsifier data point either way.
 */
import { openCatalogueReadOnly } from '../schema.ts';
import { computeFills, fillFromName, FOOD_WHERE, type CandidateRow } from '../size-fill.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const db = openCatalogueReadOnly(DB_PATH);
db.exec('PRAGMA busy_timeout = 120000');

const rows = db
  .prepare(`SELECT code, name, name_en, name_fr, quantity FROM product WHERE ${FOOD_WHERE} AND size_value IS NULL`)
  .all() as unknown as CandidateRow[];
const byCode = new Map(rows.map((r) => [r.code, r]));
const { quantityFills } = computeFills(rows);

let checkable = 0;
let agree = 0;
let disagree = 0;
const disagreements: string[] = [];

for (const f of quantityFills) {
  const r = byCode.get(f.code)!;
  const display = r.name_en || r.name_fr || r.name;
  const nameSaid = fillFromName(display);
  if (!nameSaid) continue; // name prints no checkable size; not a data point.
  checkable++;
  // Same family and same base value (within float noise) counts as agreement.
  const sameUnit = nameSaid.unit === f.unit;
  const sameValue = Math.abs(nameSaid.value - f.value) < 0.01;
  if (sameUnit && sameValue) {
    agree++;
  } else {
    disagree++;
    disagreements.push(`${f.code} "${display}" quantity="${r.quantity}" -> quantity-fill ${f.value}${f.unit}, name-fill ${nameSaid.value}${nameSaid.unit}`);
  }
}

console.log(`Quantity-sourced fills: ${quantityFills.length}`);
console.log(`Of those, name ALSO prints a checkable size: ${checkable}`);
console.log(`Agree: ${agree}`);
console.log(`Disagree: ${disagree}`);
if (checkable > 0) console.log(`Disagreement rate: ${((disagree / checkable) * 100).toFixed(1)}%`);
disagreements.forEach((d) => console.log('  ' + d));

db.close();
