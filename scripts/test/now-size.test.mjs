import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// NOW.md is the board every session reads as the current state. On 2026-09-27 it
// had grown to 2,347 lines of mostly dated history, and three clean sessions read
// that history as current (photo scans "two calls", old free-scan counts, old model
// tiers). It was cut to 73. Past this cap, move finished sections to
// docs/archive/now-history-<date>.md instead of raising the number.
const CAP = 150;

test(`NOW.md stays state, not history: at most ${CAP} lines`, () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const lines = readFileSync(join(root, 'NOW.md'), 'utf8').split(/\r?\n/).length;
  assert.ok(
    lines <= CAP,
    `NOW.md is ${lines} lines. Move finished or dated sections to docs/archive/now-history-<today>.md.`,
  );
});
