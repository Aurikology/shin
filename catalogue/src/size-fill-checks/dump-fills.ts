import { openCatalogueReadOnly } from '../schema.ts';
import { computeFills, FOOD_WHERE, type CandidateRow } from '../size-fill.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const db = openCatalogueReadOnly(DB_PATH);
db.exec('PRAGMA busy_timeout = 120000');

const rows = db
  .prepare(`SELECT code, name, name_en, name_fr, quantity FROM product WHERE ${FOOD_WHERE} AND size_value IS NULL`)
  .all() as unknown as CandidateRow[];

const byCode = new Map(rows.map((r) => [r.code, r]));
const { quantityFills, nameFills } = computeFills(rows);

console.log('=== QUANTITY FILLS ===');
for (const f of quantityFills) {
  const r = byCode.get(f.code)!;
  const display = r.name_en || r.name_fr || r.name;
  console.log(JSON.stringify({ code: f.code, name: display, quantity: r.quantity, fromText: f.fromText, value: f.value, unit: f.unit }));
}

console.log('\n=== NAME FILLS ===');
for (const f of nameFills) {
  const r = byCode.get(f.code)!;
  const display = r.name_en || r.name_fr || r.name;
  console.log(JSON.stringify({ code: f.code, name: display, quantity: r.quantity, fromText: f.fromText, value: f.value, unit: f.unit }));
}

db.close();
