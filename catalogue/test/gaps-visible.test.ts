/**
 * A MISS THAT COULD NOT BE WRITTEN DOWN MUST BE SEEN (category-check.ts, A7, search.ts #recordGap).
 *
 * `gapsDropped` and `gapsDroppedWhy` already counted a lost miss, but nothing read them: the
 * counter was a number in a field no screen or health check ever opened, which is a silence
 * with extra steps. The search must still never fail for it (a lost gap is never worth a
 * lost answer), so the fix is a `[catalogue-fault]` line carrying the reason, and the same
 * numbers on `/api/health` (app/test/health-faults.test.ts).
 */
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalogue } from '../src/schema.ts';
import { Catalogue } from '../src/search.ts';
import { openGapLog, recordGap } from '../src/gaps.ts';
import type { Embedder } from '../src/embed.ts';

/** An embedder that must never be asked: these searches are by barcode only. */
const noEmbedder: Embedder = {
  id: 'test:none',
  dim: 4,
  async embedPassages() { throw new Error('not used'); },
  async embedQuery() { throw new Error('not used'); },
};

/** A gap log that cannot open: a file sits where its directory has to be. */
function brokenLog() {
  const dir = mkdtempSync(join(tmpdir(), 'shin-gaps-visible-'));
  const blocker = join(dir, 'blocker');
  writeFileSync(blocker, 'not a directory');
  return openGapLog(join(blocker, 'sub', 'gaps.db'));
}

let lines: string[] = [];
beforeEach(() => {
  lines = [];
  mock.method(console, 'warn', (...a: unknown[]) => { lines.push(a.join(' ')); });
});
afterEach(() => mock.restoreAll());

test('recordGap: a miss it cannot write is still counted, and now logged with the reason', () => {
  const log = brokenLog();
  assert.doesNotThrow(() => recordGap({ gtin: '0000000000017' }));
  assert.equal(log.dropped, 1);
  assert.ok(
    lines.some((l) => l.startsWith('[catalogue-fault] gap_dropped') && l.includes(log.droppedWhy)),
    `no [catalogue-fault] gap_dropped line carrying the reason "${log.droppedWhy}": ${lines.join('|')}`,
  );
});

test('recordGap: the same reason repeating logs once, and the count keeps rising', () => {
  const log = brokenLog();
  recordGap({ gtin: '0000000000017' });
  recordGap({ gtin: '0000000000024' });
  recordGap({ gtin: '0000000000031' });
  assert.equal(log.dropped, 3);
  assert.equal(lines.filter((l) => l.startsWith('[catalogue-fault] gap_dropped')).length, 1, lines.join('|'));
});

test('search: a recordGap that throws is logged and counted, and the search still answers', async () => {
  const log = brokenLog();
  // A log whose counter cannot be written makes recordGap itself throw from inside its own catch.
  Object.freeze(log);
  const cat = new Catalogue(openCatalogue(':memory:'), noEmbedder);
  const r = await cat.search({ gtin: '0000000000017' });
  assert.equal(r.band, 'miss', 'the shopper still gets an answer');
  assert.ok(cat.gapsDropped >= 1, 'counted');
  assert.ok(cat.gapsDroppedWhy.length > 0, 'with the reason');
  assert.ok(
    lines.some((l) => l.startsWith('[catalogue-fault] gap_not_recorded') && l.includes(cat.gapsDroppedWhy)),
    `no [catalogue-fault] gap_not_recorded line: ${lines.join('|')}`,
  );
});

test('control: a miss on a log that works writes the gap, logs nothing, drops nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-gaps-visible-ok-'));
  const log = openGapLog(join(dir, 'gaps.db'));
  const cat = new Catalogue(openCatalogue(':memory:'), noEmbedder);
  const r = await cat.search({ gtin: '0000000000017' });
  assert.equal(r.band, 'miss');
  assert.equal(log.dropped, 0);
  assert.equal(cat.gapsDropped, 0);
  assert.deepEqual(lines, []);
  assert.equal((log.db!.prepare('SELECT count(*) AS n FROM gap').get() as { n: number }).n, 1);
});
