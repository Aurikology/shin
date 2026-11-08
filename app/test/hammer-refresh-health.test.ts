/**
 * The weekly Project Hammer refresh is loud when it stops (Jamin, 2026-11-08: "go"). The refresh's
 * last step marks the prices file (price/src/hammer.ts `markRefreshed`); `/api/health` reports the
 * mark (`hammerRefreshedAt`); the GitHub outage alarm fails when it is missing or stale
 * (scripts/data-freshness.mjs, its own test). These pin the middle link: the health reading sees
 * the mark the refresh wrote, and says null, never a guess, when there is none.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openPrices } from '../../price/src/store.ts';
import { markRefreshed } from '../../price/src/hammer.ts';
import { hammerRefreshedAt } from '../src/prices-health.ts';

test('health reads the mark the refresh wrote, and a later refresh moves it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hammer-mark-'));
  try {
    const file = join(dir, 'prices.db');
    const db = openPrices(file);
    assert.equal(hammerRefreshedAt(file), null, 'no refresh has run: the answer is null');
    markRefreshed(db, new Date('2026-11-08T05:30:00Z'));
    assert.equal(hammerRefreshedAt(file), '2026-11-08T05:30:00.000Z');
    markRefreshed(db, new Date('2026-11-15T05:31:00Z'));
    assert.equal(hammerRefreshedAt(file), '2026-11-15T05:31:00.000Z', 'the second refresh did not move the mark');
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing file, or one with no store_meta table, reads as null and never throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hammer-mark-'));
  try {
    assert.equal(hammerRefreshedAt(join(dir, 'nothing.db')), null);
    const bare = join(dir, 'bare.db');
    const db = new DatabaseSync(bare);
    db.exec('CREATE TABLE observation (id INTEGER PRIMARY KEY)');
    db.close();
    assert.equal(hammerRefreshedAt(bare), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
