import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../doc-classes.mjs';

test('RULINGS.md is the register', () => {
  assert.equal(classify('RULINGS.md'), 'register');
});

test('CLAUDE.md is the constitution', () => {
  assert.equal(classify('CLAUDE.md'), 'constitution');
});

test('docs/decisions.md is a log', () => {
  assert.equal(classify('docs/decisions.md'), 'log');
});

test('NOW.md is status', () => {
  assert.equal(classify('NOW.md'), 'status');
});

test('a dated build-plan doc under docs/ is a snapshot', () => {
  assert.equal(classify('docs/catalogue-build-plan-2026-09-26.md'), 'snapshot');
});

test('a plain doc under docs/ is a live-doc', () => {
  assert.equal(classify('docs/jamin-gemini-rules.md'), 'live-doc');
});

test('a plain doc under docs/walkthrough/ is a live-doc', () => {
  assert.equal(classify('docs/walkthrough/barcode-to-verdict.md'), 'live-doc');
});

test('a file under app/test/ is a test, even with a .ts extension', () => {
  assert.equal(classify('app/test/barcode-own-prices-route.test.ts'), 'test');
});

test('identify/src/providers/gemini-scan.ts is code', () => {
  assert.equal(classify('identify/src/providers/gemini-scan.ts'), 'code');
});

test('app/package.json is config', () => {
  assert.equal(classify('app/package.json'), 'config');
});

test('research/competitors/x.md is a snapshot', () => {
  assert.equal(classify('research/competitors/x.md'), 'snapshot');
});

// Order matters: log is checked by EXACT path, before the snapshot dated-name
// rule ever runs. A dated file that merely lives under docs/ and merely
// starts with "decisions" is NOT the log — it is a snapshot, because it is
// not literally docs/decisions.md. If a wrong implementation matched log by
// prefix (startsWith('docs/decisions')) instead of exact equality, this
// assertion is the one that goes red.
test('a dated docs/decisions-*.md file is a snapshot, not the log (order/exactness check)', () => {
  assert.equal(classify('docs/decisions-2026-09-26-superseded.md'), 'snapshot');
  assert.notEqual(classify('docs/decisions-2026-09-26-superseded.md'), 'log');
});
