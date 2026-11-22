#!/usr/bin/env node
// scripts/us-coverage.mjs -- how much of the 200 most popular US products Pexi can answer.
//
//   node scripts/us-coverage.mjs <prices.db> [barcodes.txt] [--catalogue <catalogue.db>]
//   node scripts/us-coverage.mjs --fetch-top200            (re-make the saved list; the only network use)
//
// <prices.db>     a Pexi price database (the `observation` table). Opened read-only.
// barcodes.txt    one barcode per line (blank lines and #-comments ignored). Default:
//                 scripts/data/us-top-200.txt, the 200 most-scanned products Open Food Facts tags as sold
//                 in the United States (countries_tags en:united-states, sorted by unique_scans_n),
//                 fetched once and saved so every later run reads the same list.
// --catalogue     a catalogue database (the `product` table) for the name count. Without it the name
//                 column is reported as "not checked", never as zero.
//
// Output: one table, the barcodes with a USD price row by source (the `seller` column; a price row
// counts through its `code` or, for an unjoined row, its `page_gtin`), then the totals and one
// summary line. Exit 0 on a result, 2 on bad input (missing or unreadable file, no observation table,
// an empty or malformed list).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LIST = join(HERE, 'data', 'us-top-200.txt');
const SEARCH = 'https://search.openfoodfacts.org/search';

function die(msg) {
  console.error(`us-coverage: ${msg}`);
  process.exit(2);
}

/** Catalogue and price codes are 13 digits, zero padded (the same rule as price/src/openprices.ts pad13). */
export function pad13(code) {
  const digits = String(code).replace(/\D/g, '');
  return digits.length >= 13 ? digits.slice(-13) : digits.padStart(13, '0');
}

/** Parse a barcode list: one per line, digits only after trimming, # comments and blanks ignored. Throws on a bad line. */
export function parseList(text) {
  const out = [];
  const seen = new Set();
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    if (!/^\d{8,14}$/.test(line)) throw new Error(`line ${i + 1} is not a barcode: ${JSON.stringify(raw)}`);
    const code = pad13(line);
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

/** The report, from plain data so it can be tested without a database. */
export function summarise(list, usdRows, names) {
  const bySeller = new Map();
  const priced = new Set();
  const want = new Set(list);
  for (const { code, seller } of usdRows) {
    if (!code || !want.has(code)) continue;
    priced.add(code);
    if (!bySeller.has(seller)) bySeller.set(seller, new Set());
    bySeller.get(seller).add(code);
  }
  const named = names === null ? null : list.filter((c) => names.has(c)).length;
  return {
    total: list.length,
    priced: priced.size,
    named,
    sellers: [...bySeller].map(([seller, set]) => ({ seller, n: set.size })).sort((a, b) => b.n - a.n || a.seller.localeCompare(b.seller)),
  };
}

export function render(s) {
  const lines = [];
  lines.push(`${'source'.padEnd(24)} barcodes with a USD price`);
  lines.push(`${'-'.repeat(24)} ${'-'.repeat(26)}`);
  if (s.sellers.length === 0) lines.push(`${'(none)'.padEnd(24)} 0`);
  for (const r of s.sellers) lines.push(`${r.seller.padEnd(24)} ${String(r.n).padStart(3)} of ${s.total}`);
  lines.push(`${'-'.repeat(24)} ${'-'.repeat(26)}`);
  lines.push(`${'any source'.padEnd(24)} ${String(s.priced).padStart(3)} of ${s.total}`);
  lines.push(`${'catalogue name'.padEnd(24)} ${s.named === null ? 'not checked (no --catalogue)' : `${String(s.named).padStart(3)} of ${s.total}`}`);
  lines.push('');
  lines.push(`us-coverage: ${s.priced} of ${s.total} with a USD price, ${s.named === null ? 'names not checked' : `${s.named} of ${s.total} with a name`}`);
  return lines.join('\n');
}

async function fetchTop200() {
  const codes = [];
  for (let page = 1; page <= 3; page += 1) {
    const url = `${SEARCH}?q=${encodeURIComponent('countries_tags:"en:united-states"')}&sort_by=-unique_scans_n&page_size=100&page=${page}&fields=code`;
    const res = await fetch(url, { headers: { 'user-agent': 'Pexi-server/1.0 (grocery price scanner)', accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) die(`the search API answered HTTP ${res.status} for page ${page}`);
    const body = await res.json();
    for (const h of body.hits ?? []) codes.push(pad13(h.code));
    await new Promise((r) => setTimeout(r, 1000));
  }
  const unique = [...new Set(codes)].slice(0, 200);
  if (unique.length < 200) die(`the search API gave ${unique.length} usable barcodes, not 200; nothing saved`);
  mkdirSync(dirname(DEFAULT_LIST), { recursive: true });
  const header =
    `# The 200 most-scanned products Open Food Facts tags as sold in the United States\n` +
    `# (search-a-licious: countries_tags en:united-states, sort unique_scans_n descending, fields code).\n` +
    `# Fetched ${new Date().toISOString().slice(0, 10)} and saved so later runs use the same list. One barcode per line, 13 digits.\n`;
  writeFileSync(DEFAULT_LIST, header + unique.join('\n') + '\n');
  console.log(`us-coverage: saved ${unique.length} barcodes to ${DEFAULT_LIST}`);
}

function openReadOnly(path, what) {
  if (!existsSync(path)) die(`${what} not found: ${path}`);
  try {
    return new DatabaseSync(path, { readOnly: true });
  } catch (e) {
    die(`${what} cannot be opened: ${path} (${String(e.message ?? e)})`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--fetch-top200')) return fetchTop200();
  const catAt = argv.indexOf('--catalogue');
  let catPath = null;
  if (catAt !== -1) {
    catPath = argv[catAt + 1] ?? null;
    if (!catPath) die('--catalogue needs a path');
    argv.splice(catAt, 2);
  }
  const unknownFlag = argv.find((a) => a.startsWith('--'));
  if (unknownFlag) die(`unknown option ${unknownFlag}`);
  const [pricesPath, listPath = DEFAULT_LIST] = argv;
  if (!pricesPath || argv.length > 2) die('usage: node scripts/us-coverage.mjs <prices.db> [barcodes.txt] [--catalogue <catalogue.db>]');

  if (!existsSync(listPath)) die(`barcode list not found: ${listPath}`);
  let list;
  try {
    list = parseList(readFileSync(listPath, 'utf8'));
  } catch (e) {
    die(`barcode list ${listPath}: ${String(e.message ?? e)}`);
  }
  if (list.length === 0) die(`barcode list ${listPath} holds no barcodes`);

  const prices = openReadOnly(pricesPath, 'price database');
  let usdRows;
  try {
    const have = new Set(prices.prepare('PRAGMA table_info(observation)').all().map((c) => c.name));
    if (!have.has('seller') || !have.has('currency') || !have.has('code')) throw new Error('no observation table with seller, currency and code');
    const gtin = have.has('page_gtin') ? 'page_gtin' : 'NULL';
    usdRows = prices
      .prepare(`SELECT DISTINCT code, ${gtin} AS page_gtin, seller FROM observation WHERE currency = 'USD'`)
      .all()
      .map((r) => ({ code: r.code ? pad13(r.code) : r.page_gtin ? pad13(r.page_gtin) : null, seller: String(r.seller) }));
  } catch (e) {
    die(`price database ${pricesPath}: ${String(e.message ?? e)}`);
  } finally {
    prices.close();
  }

  let names = null;
  if (catPath) {
    const cat = openReadOnly(catPath, 'catalogue');
    try {
      const q = cat.prepare("SELECT 1 FROM product WHERE code = ? AND trim(coalesce(name, '')) <> ''");
      names = new Set(list.filter((c) => q.get(c) !== undefined));
    } catch (e) {
      die(`catalogue ${catPath}: ${String(e.message ?? e)}`);
    } finally {
      cat.close();
    }
  }

  console.log(render(summarise(list, usdRows, names)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => die(String(e.message ?? e)));
}
