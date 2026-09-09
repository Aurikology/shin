/**
 * Keep it, and the two conditions it is not allowed to skip.
 *
 * AVATAR.md section 3 row 39 gives the thin refusal exactly one action and
 * names it Keep it. DESIGN.md section 5 says it "records what the user read,
 * dated and attributed to a named seller". Both halves of that sentence are
 * conditions rather than description, and this file is what stops them being
 * quietly relaxed into an action that records a number attributed to nowhere.
 *
 * The gate is a pure function, so it is tested as one. What it decides is
 * whether a shopper is offered a one-tap action or is sent to a form; getting
 * that wrong in the permissive direction writes unusable rows into the one
 * table in this product that a re-crawl cannot rebuild.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(new URL('../public/js/screens/camera.js', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

/**
 * camera.js is a screen module: importing it reaches for `document` and for
 * every sibling screen. The gate and the reason list are extracted from the
 * source and evaluated on their own, which is the same technique
 * `voice.test.mjs` uses on the copy table and for the same reason.
 */
function extract(name, kind = 'function') {
  const start = SRC.indexOf(kind === 'function' ? `function ${name}(` : `const ${name} =`);
  assert.notEqual(start, -1, `camera.js no longer declares ${name}`);
  let depth = 0;
  let i = SRC.indexOf(kind === 'function' ? '{' : '[', start);
  const open = SRC[i];
  const close = open === '{' ? '}' : ']';
  for (; i < SRC.length; i++) {
    if (SRC[i] === open) depth++;
    else if (SRC[i] === close && --depth === 0) break;
  }
  return SRC.slice(start, i + 1);
}

const THIN_REASONS = new Set(
  [...extract('THIN_REASONS', 'const').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
);
assert.ok(THIN_REASONS.size >= 4, `parsed only ${THIN_REASONS.size} thin reasons from camera.js`);
// eslint-disable-next-line no-new-func
const keepableFrom = new Function(`${extract('keepableFrom')}; return keepableFrom;`)();

const identity = { id: 'tide-simply-2720ml', label: 'Tide Simply 2.72L' };
const refusal = (reason) => ({ reason, identity });
const scenario = (over = {}) => ({
  text: 'tide simply 2.72',
  category: 'grocery',
  askingSeller: 'Walmart',
  scannedGtin: null,
  ...over,
});

const isThin = (reason) => THIN_REASONS.has(reason);

test('a thin refusal with a price and a named shop can be kept', () => {
  const k = keepableFrom(refusal('all_points_from_asking_seller'), scenario(), 1197, true);
  assert.ok(k, 'the one case Keep it exists for was refused');
  assert.equal(k.askingCents, 1197);
  assert.equal(k.seller, 'Walmart');
  assert.equal(k.productId, 'tide-simply-2720ml');
});

test('no named shop, no Keep it', () => {
  // DESIGN.md: "attributed to a named seller". A correction with no seller
  // cannot be excluded from its own comparison later, so it is not evidence.
  for (const seller of [undefined, '', '   ']) {
    assert.equal(
      keepableFrom(refusal('too_few_points'), scenario({ askingSeller: seller }), 1197, true),
      null,
      `a correction was offered with seller ${JSON.stringify(seller)}`,
    );
  }
});

test('no price, no Keep it', () => {
  // There is nothing to keep. The honest action is the one that asks for it.
  for (const cents of [undefined, null, 0, -50, Number.NaN, Infinity, '1197']) {
    assert.equal(
      keepableFrom(refusal('too_few_points'), scenario(), cents, true),
      null,
      `a correction was offered with askingCents ${JSON.stringify(cents)}`,
    );
  }
});

test('only the thin refusals offer it', () => {
  // The other three are a different problem. No identity and unsure-which-one
  // do not know what the price would be about; an unsupported category has
  // already said it will not price this at all.
  for (const reason of ['no_identity', 'identity_unsure', 'category_unsupported', 'no_asking_price']) {
    assert.equal(isThin(reason), false, `${reason} is being treated as thin`);
    assert.equal(
      keepableFrom(refusal(reason), scenario(), 1197, isThin(reason)),
      null,
      `${reason} offered Keep it`,
    );
  }
});

test('every reason the engine can answer with is classified one way or the other', () => {
  // The list in camera.js and the union in the engine are one fact written
  // twice. A reason in the engine and not in either list here falls through to
  // the wrong refusal title, which is how D-011 reached a shopper.
  const contract = readFileSync(
    fileURLToPath(new URL('../../spine/src/contract.ts', import.meta.url)),
    'utf8',
  );
  const block = contract.slice(contract.indexOf('RefusalReason'));
  const reasons = [...block.slice(0, block.indexOf(';')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(reasons.length >= 8, `parsed only ${reasons.length} reasons; the union has moved`);

  const known = new Set([
    ...THIN_REASONS,
    'no_identity',
    'identity_unsure',
    'category_unsupported',
    'no_asking_price',
    // These three stopped being emitted 2026-09-08 when the thin-verdict path landed.
    'unusable_price_kinds',
    'points_too_stale',
    'all_points_from_asking_seller',
  ]);
  const orphans = reasons.filter((r) => !known.has(r));
  assert.deepEqual(orphans, [], `the engine can refuse with reasons no screen classifies: ${orphans.join(', ')}`);
});
