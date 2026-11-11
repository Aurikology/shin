/**
 * Child process for scripts/scorecard/run.mjs: builds a temp prices file (and a matching catalogue file)
 * with the real schema, optionally with planted rows, runs the price data rules on it, and prints one
 * JSON line {counts, exit, why, rows}. Runs in its own process so it imports price/src and
 * scripts/data-checks fresh, after whatever mutation the parent has applied.
 *
 *   node scripts/scorecard/data-child.mjs --dir <tempdir> [--spec <mutation.json>]
 *
 * Only ever writes inside --dir, which the parent makes under the system temp folder. Nothing real is read.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation } from '../../price/src/store.ts';
import { runChecks } from '../data-checks/rules.mts';
import { exitCodeFor } from '../data-checks/run.mts';

const { values } = parseArgs({ options: { dir: { type: 'string' }, spec: { type: 'string' } }, strict: true });
const dir = resolve(values.dir);
if (dir.split(sep).includes('data')) throw new Error(`refusing to build inside a data folder: ${dir}`);
mkdirSync(dir, { recursive: true });

const AS_OF = '2026-11-11';
const AS_OF_MS = Date.parse(`${AS_OF}T00:00:00Z`);
const daysAgo = (n) => new Date(AS_OF_MS - n * 86_400_000).toISOString().slice(0, 10);

const base = {
  code: null, seller: 's1', sellerSku: 'x', sellerName: 'x', sellerBrand: null, priceCents: 1000, kind: 'regular',
  unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin',
  seenOn: daysAgo(10), url: null, imageUrl: null, inStock: null, storeName: null, storeCity: null,
};

/** The clean baseline: five products, 3 to 4 shops each, every shop in its own city, all rules quiet. */
const catalogue = new Map();
const CITIES = ['Hamilton', 'Vancouver', 'Halifax', 'Calgary', 'Ottawa'];
function product(code, size, shops) {
  catalogue.set(code, size);
  return shops.map(([seller, cents], i) =>
    ({ ...base, code, seller, sellerSku: `BASE-${code}-${seller}`, sellerName: `Acme Thing ${size}`, priceCents: cents,
       storeName: seller, storeCity: CITIES[(i + code.length) % CITIES.length], seenOn: daysAgo(3 + i), inStock: 1 }));
}
const rows = [
  ...product('0000000000017', '500 g', [['s1', 400], ['s2', 420], ['s3', 380]]),
  ...product('0000000000024', '1 kg', [['s1', 900], ['s2', 880], ['s3', 920]]),
  ...product('0000000000031', '1 kg', [['s1', 700], ['s2', 690], ['s3', 710]]),
  ...product('0000000000032', '1 kg', [['s1', 650], ['s2', 640], ['s3', 660]]),
  ...product('0000000000040', '1 kg', [['s1', 1000], ['s2', 1050], ['s3', 980], ['s4', 1020]]),
];

if (values.spec) {
  const spec = JSON.parse(readFileSync(values.spec, 'utf8'));
  if (spec.kind !== 'data') throw new Error(`${values.spec} is not a data mutation`);
  for (const r of spec.rows) {
    const { daysAgo: d, ...rest } = r;
    rows.push({ ...base, ...rest, ...(d !== undefined ? { seenOn: daysAgo(d) } : {}) });
  }
}

const pricesPath = join(dir, 'prices.db');
const cataloguePath = join(dir, 'catalogue.db');
const db = openPrices(pricesPath);
for (const r of rows) recordObservation(db, r);
db.close();
const cat = new DatabaseSync(cataloguePath);
cat.exec('CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT)');
const ins = cat.prepare('INSERT INTO product (code, name, quantity) VALUES (?, ?, ?)');
for (const [code, size] of catalogue) ins.run(code, `Catalogue ${code}`, size);
cat.close();

const p = new DatabaseSync(pricesPath, { readOnly: true });
const c = new DatabaseSync(cataloguePath, { readOnly: true });
const run = runChecks(p, { asOf: AS_OF, maxExamples: 20, catalogue: c });
p.close();
c.close();
const exit = exitCodeFor(run);
const counts = Object.fromEntries(run.rules.map((r) => [r.id, r.count]));
console.log(JSON.stringify({ counts, exit: exit.code, why: exit.why, errors: run.errors, rows: run.totalRows }));
