import { openCatalogueReadOnly } from '../schema.ts';
import { parseQuantity, toComparison } from '../units.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const db = openCatalogueReadOnly(DB_PATH);
db.exec('PRAGMA busy_timeout = 120000');

const FOOD_WHERE = "sold_in_canada = 1 AND source = 'openfoodfacts'";
const rows = db
  .prepare(`SELECT quantity FROM product WHERE ${FOOD_WHERE} AND size_value IS NULL AND quantity IS NOT NULL AND trim(quantity) <> ''`)
  .all() as { quantity: string }[];

let fail = 0;
const failSamples: string[] = [];
for (const r of rows) {
  const p = parseQuantity(r.quantity);
  const ok = p && toComparison(p.value, p.unit);
  if (!ok) {
    fail++;
    if (failSamples.length < 60) failSamples.push(r.quantity);
  }
}
console.log(`total with quantity text: ${rows.length}, fail: ${fail}`);
console.log(failSamples.join('\n'));
db.close();
