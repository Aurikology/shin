import { openCatalogueReadOnly } from '../schema.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const db = openCatalogueReadOnly(DB_PATH);
db.exec('PRAGMA busy_timeout = 120000');

const code = process.argv[2];
const row = db.prepare('SELECT code, name, name_en, name_fr, brands, quantity, category_path, leaf_category, source, sold_in_canada FROM product WHERE code = ?').get(code);
console.log(JSON.stringify(row, null, 2));
db.close();
