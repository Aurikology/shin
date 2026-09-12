// mac/checkpoint-wal.mjs
//
// Run this on WINDOWS, before copying catalogue.db to the Mac, not on the
// Mac. catalogue/src/schema.ts and catalogue/src/gaps.ts both open the
// catalogue in WAL mode (PRAGMA journal_mode = WAL), which means recent
// writes can sit in a separate catalogue.db-wal file instead of inside
// catalogue.db itself. Copying catalogue.db alone while a -wal file with
// real content sits next to it would copy a database that is missing
// whatever is in that WAL file. A full checkpoint folds the WAL back into
// the main file so a single-file copy is actually complete.
//
// Not run by this write-up. Run it with:
//   node mac/checkpoint-wal.mjs C:\shin\catalogue\data\catalogue.db
//
// Expected output: a line "checkpoint done, wal file size after: 0" (or a
// small number of bytes if SQLite left a header behind, which is normal).
// If the command errors instead, the database is open elsewhere (a running
// server, a stray node process) and must be closed first.

import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('usage: node mac/checkpoint-wal.mjs <path-to-catalogue.db>');
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: false });
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
db.close();

let walSize = 0;
try {
  walSize = statSync(dbPath + '-wal').size;
} catch {
  // no -wal file at all is also a pass: nothing was pending.
}

console.log(`checkpoint done, wal file size after: ${walSize}`);
