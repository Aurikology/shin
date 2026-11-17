// Remove what shoppers typed or picked for ONE barcode (security finding F9, 2026-11-16).
//
//   node scripts/security/remove-shopper-input.mjs --code <barcode>          dry run: counts only
//   node scripts/security/remove-shopper-input.mjs --code <barcode> --yes    deletes, then prints the counts
//
// Deletes, for that barcode (any zero padding):
//   typed prices : rows of shopper_price in the corrections database
//   picks        : rows of scan_pick in the scans database whose scan was of that barcode (the "this is that
//                  product" links that rename an unknown barcode)
// Nothing else is touched. To turn the typed voice and learned picks off for everything, set SHIN_SHOPPER_VOICE=off.
//
// Database paths: --corrections <file> and --scans <file>, else SHIN_CORRECTIONS / SHIN_SCANS, else the defaults
// (price/data/corrections.db, data/scans.db). Plain node, no build step.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const code = (arg('--code') ?? '').trim();
const yes = process.argv.includes('--yes');
if (!/^\d{6,14}$/.test(code)) {
  console.error('usage: node scripts/security/remove-shopper-input.mjs --code <barcode digits> [--yes] [--corrections <db>] [--scans <db>]');
  process.exit(2);
}
const bare = code.replace(/^0+/, '') || code;
const corrections = resolve(arg('--corrections') ?? process.env.SHIN_CORRECTIONS ?? 'price/data/corrections.db');
const scans = resolve(arg('--scans') ?? process.env.SHIN_SCANS ?? 'data/scans.db');

function open(file) {
  if (!existsSync(file)) return null;
  return new DatabaseSync(file);
}
function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

let prices = 0;
let picks = 0;

const cdb = open(corrections);
if (cdb && hasTable(cdb, 'shopper_price')) {
  // Stored under the code without zero padding (shopperCodeKey), but match any padding of old rows too.
  const where = "(code = ? OR ltrim(code, '0') = ?)";
  prices = Number(cdb.prepare(`SELECT COUNT(*) AS n FROM shopper_price WHERE ${where}`).get(bare, bare).n);
  if (yes && prices > 0) cdb.prepare(`DELETE FROM shopper_price WHERE ${where}`).run(bare, bare);
}
cdb?.close();

const sdb = open(scans);
if (sdb && hasTable(sdb, 'scan_pick') && hasTable(sdb, 'scan')) {
  const where = "scan_id IN (SELECT id FROM scan WHERE kind = 'barcode' AND ltrim(query_text, '0') = ?)";
  picks = Number(sdb.prepare(`SELECT COUNT(*) AS n FROM scan_pick WHERE ${where}`).get(bare).n);
  // scan_pick refuses edits, not deletes (migration 21), so a delete is allowed.
  if (yes && picks > 0) sdb.prepare(`DELETE FROM scan_pick WHERE ${where}`).run(bare);
}
sdb?.close();

console.log(yes ? `deleted for barcode ${code}:` : `dry run for barcode ${code} (nothing deleted; add --yes to delete):`);
console.log(`  typed prices: ${prices}`);
console.log(`  picks: ${picks}`);
