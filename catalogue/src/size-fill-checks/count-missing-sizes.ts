/**
 * Unit 7 acceptance test, read side. Counts Canadian food-and-drink rows
 * (sold_in_canada = 1 AND source = 'openfoodfacts', the same predicate
 * export-pack.ts uses for the grocery pack) with no size at all.
 *
 * Read-only: opens with openCatalogueReadOnly and a long busy_timeout so it
 * never contends with the load/cleanup lane that owns writes tonight.
 */
import { openCatalogueReadOnly } from '../schema.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';

const db = openCatalogueReadOnly(DB_PATH);
db.exec('PRAGMA busy_timeout = 120000');

const FOOD_WHERE = "sold_in_canada = 1 AND source = 'openfoodfacts'";

const total = db.prepare(`SELECT count(*) AS n FROM product WHERE ${FOOD_WHERE}`).get() as { n: number };
const noSize = db
  .prepare(`SELECT count(*) AS n FROM product WHERE ${FOOD_WHERE} AND size_value IS NULL`)
  .get() as { n: number };
const allCanadian = db.prepare('SELECT count(*) AS n FROM product WHERE sold_in_canada = 1').get() as { n: number };
const allProducts = db.prepare('SELECT count(*) AS n FROM product').get() as { n: number };

console.log(`Canadian food & drink rows (sold_in_canada=1 AND source='openfoodfacts'): ${total.n}`);
console.log(`  of which no size (size_value IS NULL): ${noSize.n}`);
console.log(`All Canadian rows (sold_in_canada=1): ${allCanadian.n}`);
console.log(`All rows in catalogue: ${allProducts.n}`);

db.close();
