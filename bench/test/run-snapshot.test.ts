/**
 * run.ts scores a frozen snapshot of prices.db: a loader writing the live file mid-run changes neither the
 * scores nor the "changed during the run" check, and the snapshot is deleted afterwards.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/run.ts';
import { catalogueDb, fixtureRow, pricesDb } from './fixture.ts';
import { recordObservation, openPrices } from '../../price/src/store.ts';

function fileCopy(db: DatabaseSync, path: string): void {
  db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
}

function snapshotDirs(): string[] {
  return readdirSync(tmpdir()).filter((n) => n.startsWith('bench-snapshot-'));
}

/** Runs the bench on a fixture db; returns the printed report, the exit code and the snapshot line. */
function runOnce(dir: string, mutate: ((path: string) => void) | undefined): { report: string; code: number | undefined; snapshotLine: string } {
  const dbPath = join(dir, 'prices.db');
  const catPath = join(dir, 'catalogue.db');
  rmSync(dbPath, { force: true });
  rmSync(catPath, { force: true });
  fileCopy(pricesDb(), dbPath);
  fileCopy(catalogueDb(), catPath);

  const savedArgv = process.argv;
  const savedLog = console.log;
  const savedErr = console.error;
  const savedCode = process.exitCode;
  const lines: string[] = [];
  process.argv = [savedArgv[0]!, 'run.ts', '--db', dbPath, '--catalogue', catPath, '--no-write', '--no-sealed'];
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  console.error = () => {};
  process.exitCode = undefined;
  try {
    main({ afterSnapshot: mutate });
    const code = process.exitCode as number | undefined;
    const all = lines.join('\n').split('\n');
    const snapshotLine = all.find((l) => l.startsWith('snapshot:')) ?? '';
    return { report: all.filter((l) => !l.startsWith('snapshot:')).join('\n'), code, snapshotLine };
  } finally {
    process.argv = savedArgv;
    console.log = savedLog;
    console.error = savedErr;
    process.exitCode = savedCode;
  }
}

test('a write to the live prices db between snapshot and scoring changes no score and trips no warning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-run-snap-'));
  try {
    const before = new Set(snapshotDirs());
    const calm = runOnce(dir, undefined);
    let rowsBefore = -1;
    let rowsAfter = -1;
    const busy = runOnce(dir, (original) => {
      // A loader at work: many new rows into the live file, after the snapshot was taken.
      const live = new DatabaseSync(original);
      rowsBefore = (live.prepare('SELECT count(*) AS n FROM observation').get() as { n: number }).n;
      live.close();
      const w = openPrices(original);
      for (let i = 0; i < 200; i++) {
        recordObservation(w, fixtureRow({ code: `99${String(i).padStart(10, '0')}`, seller: 'Z', sellerSku: `Z-${i}`, priceCents: 100 + i, seenOn: '2026-09-20' }));
      }
      rowsAfter = (w.prepare('SELECT count(*) AS n FROM observation').get() as { n: number }).n;
      w.close();
    });
    assert.ok(rowsAfter > rowsBefore, 'the hook really wrote to the live db');
    assert.equal(busy.report, calm.report, 'scores and counts are the same as a run with no concurrent write');
    assert.notEqual(busy.code, 2, 'no "changed during the run" warning');
    assert.equal(calm.code, busy.code);
    assert.match(busy.snapshotLine, /^snapshot: frozen copy of prices\.db taken \d{4}-/);
    assert.deepEqual(snapshotDirs().filter((n) => !before.has(n)), [], 'the snapshot is deleted after the run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
