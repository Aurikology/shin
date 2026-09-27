import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRetired, findHits, repoFiles, isVague } from '../one-source.mjs';

test('a one- or two-word phrase with no digit is too vague to search for', () => {
  assert.equal(isVague('leaderboard'), true);
  assert.equal(isVague('Shin Ramen'), true);
  assert.equal(isVague('gemini-3.5-flash-lite'), false);
  assert.equal(isVague('$1,000 a year'), false);
  assert.equal(isVague('gitlab.com/jaminke/shin'), false);
  assert.equal(isVague('no_asking_price refusal'), false);
  assert.equal(isVague('a wrong verdict is worse than no verdict'), false);
});

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('parseRetired reads every backticked phrase and skips "none" and short ones', () => {
  const register = [
    '### Default model',
    'Retired wording: `gemini-3.5-flash-lite`, `gemini-2.5-flash as the flat default`',
    '### Something',
    'Retired wording: none',
    'Retired wording: `x`',
    'Retired wording (too common to search): leaderboard',
  ].join('\n');
  // `x` is returned, not dropped: the repo check rejects it as vague, loudly.
  assert.deepEqual(parseRetired(register), [
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash as the flat default',
    'x',
  ]);
});

test('a phrase wrapped across lines, or across a wrapped code comment, still matches', () => {
  const phrases = ['Gemini 2.5 by default'];
  const hits = findHits(
    [
      { path: 'README.md', text: 'Model: Gemini\n2.5 by default.' },
      { path: 'app/server.ts', text: '// the model is Gemini 2.5\n  // by default' },
      { path: 'docs/x.md', text: '> Gemini 2.5\n> BY DEFAULT' },
    ],
    phrases,
  );
  assert.equal(hits.length, 3);
});

test('a retired phrase in a live file is a hit; in the log, a snapshot or a test it is not', () => {
  const phrases = ['THE PRICE SHOULD NOT COME FROM US'];
  const text = 'rule 3: the price should not come from us';
  const hits = findHits(
    [
      { path: 'docs/jamin-gemini-rules.md', text },
      { path: 'CLAUDE.md', text },
      { path: 'app/server.ts', text },
      { path: 'docs/decisions.md', text },
      { path: 'research/old-notes.md', text },
      { path: 'docs/plan-2026-09-01.md', text },
      { path: 'app/test/x.test.ts', text },
      { path: 'RULINGS.md', text },
    ],
    phrases,
  );
  assert.deepEqual(hits, [
    'CLAUDE.md :: THE PRICE SHOULD NOT COME FROM US',
    'app/server.ts :: THE PRICE SHOULD NOT COME FROM US',
    'docs/jamin-gemini-rules.md :: THE PRICE SHOULD NOT COME FROM US',
  ]);
});

// The ratchet. The baseline is the drift that existed when this check was
// built; each entry is cleaned out by fixing the file AND deleting its line.
test('no live file carries wording RULINGS.md retired, beyond the shrinking baseline', () => {
  const registerPath = join(root, 'RULINGS.md');
  assert.ok(existsSync(registerPath), 'RULINGS.md is missing: the one list of current rulings must exist');
  const phrases = parseRetired(readFileSync(registerPath, 'utf8'));
  assert.ok(phrases.length > 0, 'RULINGS.md lists no retired wording, so this check would pass on anything');
  const vague = phrases.filter(isVague);
  assert.deepEqual(
    vague,
    [],
    'Retired wording in RULINGS.md must be three words or carry a digit, or it matches innocent prose. ' +
      'Quote the stale sentence instead of:\n  ' + vague.join('\n  '),
  );

  const hits = findHits(repoFiles(root), phrases);
  const baseline = new Set(JSON.parse(readFileSync(join(root, 'scripts', 'one-source-baseline.json'), 'utf8')));

  const fresh = hits.filter((h) => !baseline.has(h));
  const hitSet = new Set(hits);
  const cleaned = [...baseline].filter((b) => !hitSet.has(b));

  assert.deepEqual(
    fresh,
    [],
    'A live file now says something RULINGS.md retired. Change the file to match RULINGS.md ' +
      '(or, if he changed the ruling, change RULINGS.md first):\n  ' + fresh.join('\n  '),
  );
  assert.deepEqual(
    cleaned,
    [],
    'These are fixed; delete their lines from scripts/one-source-baseline.json so they cannot come back:\n  ' +
      cleaned.join('\n  '),
  );
});
