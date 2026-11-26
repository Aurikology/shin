// linux/count-rows.mjs -- print "<file>\t<table>\t<rows>" for every table of every SQLite database in a folder.
// Run it on the Mac (server stopped) and on the VPS, then `diff` the two outputs: that is the row-count check of the cutover.
//
//   node linux/count-rows.mjs /Users/worker/shin-data      > /tmp/rows-mac.tsv
//   node linux/count-rows.mjs /var/lib/pexi                > /tmp/rows-vps.tsv
//   diff /tmp/rows-mac.tsv /tmp/rows-vps.tsv && echo SAME
//
// Opens each database read-only. Skips the catalogue unless --catalogue is given (5.7M products: counting takes a while,
// and the catalogue is verified by its SHA-256 instead). Exit 1 when a database cannot be read: a count that silently
// skipped a file would make the diff look clean.

import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const withCatalogue = args.includes('--catalogue');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error('usage: node linux/count-rows.mjs <data folder> [--catalogue]');
  process.exit(2);
}

let failed = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.db')).sort()) {
  if (f === 'catalogue.db' && !withCatalogue) {
    console.log(`${f}\t(skipped: use sha256sum, or pass --catalogue)\t-`);
    continue;
  }
  try {
    const db = new DatabaseSync(join(dir, f), { readOnly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    for (const { name } of tables) {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM "${String(name).replace(/"/g, '""')}"`).get().n;
      console.log(`${f}\t${name}\t${n}`);
    }
    if (!tables.length) console.log(`${f}\t(no tables)\t0`);
    db.close();
  } catch (e) {
    failed++;
    console.log(`${f}\tUNREADABLE\t${e.message}`);
    console.error(`could not read ${f}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
