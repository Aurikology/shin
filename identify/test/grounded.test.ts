/**
 * What the Grounded Result box actually guarantees, one sentence per test.
 *
 * Three of these read source files off disk rather than calling anything, the
 * way `app/test/refusal-swaps.test.mjs` does, because they are claims about
 * what a module DOES NOT DO, and the only way to prove a negative about a
 * module is to read it rather than run it. A file that never calls `seal` can
 * be exercised all day without that being visible.
 *
 * The rest are runtime, and every one of them was watched failing by breaking
 * the code it covers before being left green (noted in this lane's report).
 *
 * NO NETWORK ANYWHERE IN HERE. Nothing in this file constructs a provider that
 * could open a socket.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  seal,
  toWire,
  resubmitText,
  historyText,
  discard,
  provenanceOf,
  GroundedLeak,
  GroundedOwnership,
  ANONYMOUS_DEVICE,
  type GroundedEnvelope,
} from '../src/grounded.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..');

/** Directories that are not this repo's own source. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  'dist',
  'build',
  'data',
  'research',
  'photos',
  'results',
]);
const CODE = /\.(ts|js|mjs|cjs)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (CODE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Repo-relative, forward slashes, so the assertions read the same on any OS. */
function rel(path: string): string {
  return relative(REPO, path).split(sep).join('/');
}

const ALL_CODE = walk(REPO).map(rel);

/** A path inside a `test/`, `tests/` or `eval/` directory, at any depth. */
function isTestPath(path: string): boolean {
  return path.split('/').some((seg) => seg.toLowerCase() === 'test' || seg.toLowerCase() === 'tests' || seg.toLowerCase() === 'eval');
}

function read(path: string): string {
  return readFileSync(join(REPO, path), 'utf8');
}

/* --------------------------------------------------------- 1, 2 and 11: reach */

test('seal() is called in exactly two files of production source: its own declaration and the Gemini grounded adapter', () => {
  // `seal<T>(` and `seal(` both count, which is why the character class is
  // there: the declaration is generic and a call site need not be.
  const CALLS_SEAL = /\bseal\s*[(<]/;
  const found = ALL_CODE.filter((p) => !isTestPath(p)).filter((p) => CALLS_SEAL.test(read(p)));
  assert.deepEqual(found.sort(), [
    'identify/src/grounded.ts',
    'identify/src/providers/gemini-grounded.ts',
  ]);
});

test('the set of files that import grounded.ts equals a written allowlist', () => {
  // The leading slash is load bearing: it keeps `providers/gemini-grounded.ts`
  // from matching a rule about `grounded.ts`.
  const IMPORTS_GROUNDED = /from\s+['"][^'"]*\/grounded\.ts['"]/;
  const found = ALL_CODE.filter((p) => IMPORTS_GROUNDED.test(read(p)));
  // Sorted, because the left side is. A new entry goes in its sorted place.
  assert.deepEqual(found.sort(), [
    /*
     * Added 2026-09-14 when this test caught it, which is the test working
     * rather than the test being wrong. `app/src/grounded-record.ts` is the
     * one thing that writes a Grounded Result to disk, so it needs
     * `historyText`, the door built for exactly that. It is on the list
     * because somebody read it and decided, which is the only way anything
     * gets on this list.
     */
    'app/src/grounded-record.ts',
    /*
     * Added 2026-09-16, read and decided rather than waved through. The price
     * harness opens boxes with `toWire` to count offers and compare medians
     * against the hand-priced pilot, and it is the only way to find out whether
     * the number a shopper sees is true. It PERSISTS NOTHING: every figure is
     * computed in memory and printed, so no Grounded Result reaches disk. That
     * the arithmetic happens on our side at all is the crossing D-111 records.
     */
    'identify/eval/price-truth.ts',
    'identify/src/provider.ts',
    'identify/src/providers/gemini-grounded.ts',
    // Added 2026-09-15: the adapter's own test opens the boxes it seals with `toWire`, and nothing else.
    'identify/test/gemini-grounded.test.ts',
    'identify/test/grounded-types.ts',
    'identify/test/grounded.test.ts',
  ]);
});

test('the ungrounded Gemini adapter asks for no search tool and cannot reach the box', () => {
  const path = join(REPO, 'identify', 'src', 'providers', 'gemini.ts');
  if (!existsSync(path)) {
    // Another lane owns that file and it is not written yet. Asserting on its
    // absence rather than skipping means this test still says something true
    // today, and it starts checking the real thing the moment the file lands.
    assert.equal(existsSync(path), false);
    return;
  }
  // Comments are stripped first, and that is not a nicety. That file's header
  // explains at length WHY it never sends a `google_search` tool, so a naive
  // substring search over the whole text finds the word in the prose that
  // promises not to use it, and the test would fail on the very comment that
  // makes it true. What matters is the code.
  const source = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.equal(source.includes('google_search'), false);
  assert.equal(/from\s+['"][^'"]*\/grounded\.ts['"]/.test(source), false);
});

/* ------------------------------------------------------------------ fixtures */

const DEVICE_A = 'device-A';
const DEVICE_B = 'device-B';

function envelope<T>(value: T, over: Partial<GroundedEnvelope<T>> = {}): GroundedEnvelope<T> {
  return {
    value,
    suggestionsHtml: '<div class="container">Search Suggestions</div>',
    forDevice: DEVICE_A,
    promptId: 'prices_reviews_description',
    fetchedAt: '2026-09-14T12:00:00.000Z',
    provider: 'gemini',
    searchQueries: 2,
    ...over,
  };
}

const OFFERS = {
  offers: [
    { retailer: 'Loblaws', price: 4.79, url: 'https://example.invalid/a' },
    { retailer: 'Metro', price: 5.29, url: null },
  ],
};

/* -------------------------------------------------------------- 3 and 4: leak */

test('a sealed box carries no enumerable own properties and JSON.stringify of anything holding one throws', () => {
  const box = seal(envelope(OFFERS));
  assert.deepEqual(Object.keys(box), []);
  assert.deepEqual(Reflect.ownKeys(box), []);
  assert.throws(() => JSON.stringify({ a: box }), GroundedLeak);
});

test('String(box), a template literal and box + \'\' each throw instead of quietly concatenating', () => {
  const box = seal(envelope(OFFERS));
  assert.throws(() => String(box), GroundedLeak);
  assert.throws(() => `${box}`, GroundedLeak);
  // `as unknown as string` only so the line compiles: the point of the test is
  // that the RUNTIME refuses, and the type refusing too is the other half of
  // the guard, proved in `grounded-types.ts`.
  assert.throws(() => (box as unknown as string) + '', GroundedLeak);
});

/* ------------------------------------------------------- 5, 6 and 7: ownership */

test('a box sealed for one device is refused to another device', () => {
  const box = seal(envelope(OFFERS));
  assert.throws(() => toWire(box, DEVICE_B), GroundedOwnership);
  assert.doesNotThrow(() => toWire(box, DEVICE_A));
});

test('an anonymous device is refused by both seal and toWire', () => {
  assert.throws(() => seal(envelope(OFFERS, { forDevice: ANONYMOUS_DEVICE })), GroundedOwnership);
  assert.throws(() => seal(envelope(OFFERS, { forDevice: '' })), GroundedOwnership);
  const box = seal(envelope(OFFERS));
  assert.throws(() => toWire(box, ANONYMOUS_DEVICE), GroundedOwnership);
  assert.throws(() => toWire(box, ''), GroundedOwnership);
  assert.throws(() => historyText(box, ANONYMOUS_DEVICE), GroundedOwnership);
});

/*
 * REVERSED 2026-09-15. This test used to require the refusal. Jamin's ruling
 * that day ("don't prevent something from functioning just because of legal
 * issues") turned a missing Search Suggestions widget from a lost answer into
 * an answer shown without it.
 */
test('seal accepts an answer that arrived with no Search Suggestions, and it still reaches its owner', () => {
  for (const suggestionsHtml of ['', '   ']) {
    const box = seal(envelope(OFFERS, { suggestionsHtml }));
    const wire = toWire(box, DEVICE_A);
    assert.equal(wire.suggestionsHtml, suggestionsHtml);
    assert.equal(wire.block.offers.length, 2);
  }
});

/* --------------------------------------------------------- 8: will not modify */

test('sort, push and a field assignment on the wire block each throw a TypeError', () => {
  const box = seal(envelope(OFFERS));
  const wire = toWire(box, DEVICE_A);
  // The wire block is the same frozen object seal was handed, not a copy.
  assert.equal(wire.block, OFFERS);
  const block = wire.block as { offers: { retailer: string; price: number }[] };
  assert.throws(() => block.offers.sort(), TypeError);
  assert.throws(() => block.offers.push({ retailer: 'Sobeys', price: 1 }), TypeError);
  assert.throws(() => {
    block.offers[0].price = 0.01;
  }, TypeError);
  assert.throws(() => {
    block.offers = [];
  }, TypeError);
});

/* ----------------------------------------------------------- 9: resubmit door */

test('resubmitText hands back the text byte for byte as it was sealed', () => {
  const text = 'Loblaws: CAD $4.79; Metro: CAD $5.29 (accents: crème brûlée, 2 × 355 mL)';
  const box = seal(envelope(text));
  assert.equal(resubmitText(box), text);
  assert.deepEqual(Buffer.from(resubmitText(box), 'utf8'), Buffer.from(text, 'utf8'));
  assert.equal(historyText(box, DEVICE_A), text);
});

/* ---------------------------------------------------------- 10: the destructor */

test('after discard, all three doors throw', () => {
  const box = seal(envelope(OFFERS));
  assert.doesNotThrow(() => toWire(box, DEVICE_A));
  discard(box);
  assert.throws(() => toWire(box, DEVICE_A), GroundedLeak);
  assert.throws(() => resubmitText(box), GroundedLeak);
  assert.throws(() => historyText(box, DEVICE_A), GroundedLeak);
  assert.throws(() => provenanceOf(box), GroundedLeak);
});
