#!/usr/bin/env node
/**
 * R15 / R93 measurement. How long does a typed-name search, and a 200-event batch, hold the one
 * server thread, on a generated table of a size you choose?
 *
 *   node scripts/load/bench-typed-search.mjs [rows=1000000] [--keep]
 *
 * It builds a throwaway prices file with `rows` observation rows (real schema, via the price package),
 * then reports, for typed searches that match a lot, a little and nothing:
 *   - "blocked ms": how long the event loop could not run anything else while the search ran. This
 *     is the number a shopper's other requests wait behind.
 *   - total ms, as the caller sees it.
 * and for a batch of 200 events: ms with one commit per event (before R93) and in one transaction (after).
 *
 * Fails loudly: a non-zero exit and a message on stderr if the table could not be built, a search
 * returned nothing it should have, or the numbers are not finite.
 *
 * Numbers differ by machine and disk. Report the machine with them (the first line prints it).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, cpus, platform } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

const rows = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 1_000_000);
const keep = process.argv.includes('--keep');
if (!Number.isInteger(rows) || rows < 1000) {
  console.error('rows must be an integer of at least 1000');
  process.exit(2);
}

const { openPrices } = await import('../../price/src/store.ts');
const { lookupOwnPrices, lookupOwnPricesAsync } = await import('../../app/src/own-prices.ts');
const { openScanStore } = await import('../../app/src/scans.ts');
const events = await import('../../app/src/events.ts');

console.log(`machine: ${platform()} ${cpus()[0]?.model ?? '?'} x${cpus().length}, node ${process.version}, rows ${rows.toLocaleString()}`);

const dir = mkdtempSync(join(tmpdir(), 'pexi-bench-'));
const pricesPath = join(dir, 'prices.db');

/* ---- build the table -------------------------------------------------- */
const BRANDS = ['Neilson', 'Sealtest', 'Natrel', 'Lactantia', 'Kraft', 'Heinz', 'Campbells', 'Maple Leaf', 'President Choice', 'No Name', 'Great Value', 'Dempsters', 'Oasis', 'Tropicana', 'Quaker', 'Kelloggs', 'Barilla', 'Primo', 'Compliments', 'Selection'];
const FOODS = ['milk', 'butter', 'cheddar cheese', 'yogurt', 'cereal', 'pasta', 'tomato sauce', 'orange juice', 'bread', 'bagels', 'chicken breast', 'ground beef', 'rice', 'peanut butter', 'jam', 'soup', 'chips', 'cookies', 'coffee', 'tea', 'olive oil', 'eggs', 'apples', 'bananas', 'ketchup', 'mustard', 'crackers', 'granola bars', 'frozen pizza', 'ice cream'];
const SIZES = ['1 L', '2 L', '500 g', '750 mL', '1 kg', '4 L', '12 pack', '300 g'];
const SELLERS = ['walmart', 'loblaws', 'saveonfoods', 'canadiantire', 'openprices'];
const t0 = performance.now();
const db = openPrices(pricesPath, { enforceSources: false });
db.exec('BEGIN');
const ins = db.prepare(
  `INSERT INTO observation (code, seller, seller_sku, seller_name, seller_brand, price_cents, kind, currency, country, join_method, seen_on)
   VALUES (?, ?, ?, ?, ?, ?, 'shelf', 'CAD', 'CA', 'barcode', ?)`,
);
for (let i = 0; i < rows; i += 1) {
  const brand = BRANDS[i % BRANDS.length];
  const food = FOODS[(i * 7) % FOODS.length];
  const size = SIZES[(i * 3) % SIZES.length];
  const code = String(100000000000 + (i % 400_000)).padStart(13, '0');
  ins.run(code, SELLERS[i % SELLERS.length], `sku${i}`, `${brand} ${food} ${size} v${i % 97}`, brand, 100 + (i % 900), '2026-11-0' + (1 + (i % 9)));
}
db.exec('COMMIT');
db.close();
console.log(`built ${rows.toLocaleString()} rows in ${Math.round(performance.now() - t0)} ms`);

/* ---- measure ----------------------------------------------------------- */
/** Run `fn` while a 5 ms ticker watches the loop; report the longest gap the ticker saw. */
async function measure(label, fn) {
  let last = performance.now();
  let worst = 0;
  const tick = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 5);
    last = now;
  }, 5);
  await new Promise((r) => setTimeout(r, 20));
  last = performance.now();
  worst = 0;
  const started = performance.now();
  const out = await fn();
  const total = performance.now() - started;
  await new Promise((r) => setTimeout(r, 20));
  clearInterval(tick);
  const blocked = Math.max(0, worst);
  if (!Number.isFinite(total) || !Number.isFinite(blocked)) {
    console.error(`FAIL ${label}: measurement is not a number`);
    process.exit(1);
  }
  console.log(`${label.padEnd(44)} total ${total.toFixed(0).padStart(6)} ms   event loop blocked ${blocked.toFixed(0).padStart(6)} ms`);
  return out;
}

const sources = { pricesDbPath: pricesPath, userCatalogueDb: null, userCataloguePath: null, catalogueProbe: null };
const QUERIES = [
  ['common word ("milk")', 'neilson milk 2 L'],
  ['rare word', 'zzqqxx marmalade'],
  ['two common words', 'maple leaf chicken breast'],
];

console.log('\ntyped-name search, as the server runs it today (synchronous):');
for (const [name, q] of QUERIES) await measure(`before: ${name}`, async () => lookupOwnPrices(q, sources));

if (typeof lookupOwnPricesAsync === 'function') {
  console.log('\ntyped-name search, scan moved off the main thread:');
  for (const [name, q] of QUERIES) {
    const out = await measure(`after:  ${name}`, () => lookupOwnPricesAsync(q, sources));
    const sync = lookupOwnPrices(q, sources);
    if (JSON.stringify(out.match?.name ?? null) !== JSON.stringify(sync.match?.name ?? null)) {
      console.error(`FAIL: the off-thread answer for "${q}" differs from the synchronous one`);
      process.exit(1);
    }
  }
}

/* ---- the event batch --------------------------------------------------- */
console.log('\n200-event batch on the scan store:');
const scans = openScanStore(join(dir, 'scans.db'));
if (!scans.db) {
  console.error('FAIL: the scan store would not open: ' + scans.droppedWhy);
  process.exit(1);
}
const batch = (tag) => Array.from({ length: 200 }, (_, i) => ({ deviceId: 'bench-device', type: 'bench_' + tag, payload: { i } }));
await measure('before: one commit per event', async () => { for (const e of batch('a')) events.recordEvent(e); });
if (typeof events.inEventTransaction === 'function') {
  await measure('after:  one transaction', async () => events.inEventTransaction(() => { for (const e of batch('b')) events.recordEvent(e); }));
}
const n = scans.db.prepare('SELECT COUNT(*) AS n FROM event').get().n;
if (n !== (typeof events.inEventTransaction === 'function' ? 400 : 200)) {
  console.error(`FAIL: expected the events to be stored, found ${n}`);
  process.exit(1);
}

scans.db.close();
if (!keep) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { console.log('(temp folder left behind: ' + dir + ')'); }
} else console.log('kept ' + dir);
void DatabaseSync;
