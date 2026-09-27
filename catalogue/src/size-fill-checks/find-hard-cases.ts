import { openCatalogueReadOnly } from '../schema.ts';
import { FOOD_WHERE, fillFromName, fillFromQuantity } from '../size-fill.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const db = openCatalogueReadOnly(DB_PATH);
db.exec('PRAGMA busy_timeout = 120000');

function search(label: string, sql: string, limit = 5) {
  const rows = db.prepare(sql).all() as { code: string; name: string; name_en: string | null; name_fr: string | null; quantity: string | null }[];
  console.log(`\n--- ${label} (${rows.length} found, showing up to ${limit}) ---`);
  for (const r of rows.slice(0, limit)) {
    const display = r.name_en || r.name_fr || r.name;
    const f = fillFromQuantity(r.quantity) || fillFromName(display);
    console.log(JSON.stringify({ code: r.code, name: display, quantity: r.quantity, wouldFill: f }));
  }
}

const W = `${FOOD_WHERE} AND size_value IS NULL`;

search('names ending in a percentage', `SELECT code, name, name_en, name_fr, quantity FROM product WHERE ${W} AND (name_en LIKE '%2%' OR name_fr LIKE '%2%') AND (name_en LIKE '%\\%' ESCAPE '\\' OR name_fr LIKE '%\\%' ESCAPE '\\') LIMIT 20`);
search('names with a hyphen range before LB/lb', `SELECT code, name, name_en, name_fr, quantity FROM product WHERE ${W} AND (name_en LIKE '%-%lb' OR name_fr LIKE '%-%lb' OR name LIKE '%-%lb' OR name_en LIKE '%-%LB' OR name LIKE '%-%LB') LIMIT 20`);
search('names with a milligram dose', `SELECT code, name, name_en, name_fr, quantity FROM product WHERE ${W} AND (name_en LIKE '%Mg%' OR name_en LIKE '%mg)%' OR name_en LIKE '%mg%') LIMIT 20`);
search('quantity column bare counts with no unit', `SELECT code, name, name_en, name_fr, quantity FROM product WHERE ${W} AND quantity GLOB '[0-9]*' AND quantity NOT GLOB '*[a-zA-Z]*' LIMIT 20`);

db.close();
