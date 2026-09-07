/**
 * voice.js's own rule, enforced.
 *
 * The file opens with it in capitals: "NO STRING SHIN SAYS IS WRITTEN INSIDE A
 * SCREEN. If a screen needs a new line, it gets a new key here with all three
 * variants, or it does not ship." docs/design/AVATAR.md puts the same thing as
 * a count -- thirteen states times three personalities is thirty-nine cells,
 * and a state with a missing cell does not ship.
 *
 * It was an unenforced rule until 2026-09-06, and it had already been broken:
 * the UI pass added four lines inline, one in a lib and three in the correction
 * screen, each written once with no personality variants. They are keys here
 * now. This file is why the next four will be too.
 *
 * The table is read out of the source rather than imported because voice.js
 * deliberately does not export LINES -- a screen is meant to ask `say()` for
 * one line, never to hold the table.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PERSONALITIES, DEFAULT_PERSONALITY, say, wordFor } from '../public/js/voice.js';

const SRC = readFileSync(
  fileURLToPath(new URL('../public/js/voice.js', import.meta.url)), 'utf8',
).replace(/\r\n/g, '\n');

/**
 * Every `key: { ... }` block inside the LINES table, with the block body.
 * Not a JS parser: it only has to read one file whose shape is one level of
 * object literal, and a dependency to count three properties would be a worse
 * trade than this regex.
 */
function lineBlocks() {
  const start = SRC.indexOf('const LINES');
  assert.notEqual(start, -1, 'voice.js no longer declares LINES');
  const open = SRC.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < SRC.length; end++) {
    if (SRC[end] === '{') depth++;
    else if (SRC[end] === '}' && --depth === 0) break;
  }
  const body = SRC.slice(open + 1, end);

  const blocks = new Map();
  // A key at the table's own indent level, then its brace-balanced body.
  const keyRe = /\n {2}([a-z][a-z0-9_]*):\s*\{/g;
  for (const m of body.matchAll(keyRe)) {
    let d = 0;
    let i = body.indexOf('{', m.index);
    const from = i;
    for (; i < body.length; i++) {
      if (body[i] === '{') d++;
      else if (body[i] === '}' && --d === 0) break;
    }
    blocks.set(m[1], body.slice(from + 1, i));
  }
  return blocks;
}

const BLOCKS = lineBlocks();
const IDS = PERSONALITIES.map((p) => p.id);

test('the personality list is the three the picker offers', () => {
  assert.deepEqual(IDS, ['deadpan', 'warm', 'blunt']);
  assert.ok(IDS.includes(DEFAULT_PERSONALITY), 'the default is not one of the personalities');
});

test('voice.js has lines in it at all', () => {
  assert.ok(BLOCKS.size > 20, `found only ${BLOCKS.size} keys; the parser has probably stopped matching`);
});

/**
 * The rule. A key missing a personality silently falls back to deadpan in
 * `say()`, so the app keeps working and the user quietly gets somebody else's
 * Shin -- which is exactly the failure the attitude picker exists to avoid.
 */
test('every line has all three personalities', () => {
  const missing = [];
  for (const [key, body] of BLOCKS) {
    for (const id of IDS) {
      if (!new RegExp(`(^|[\\s,{])${id}\\s*:`).test(body)) missing.push(`${key} has no ${id}`);
    }
  }
  assert.deepEqual(missing, [], `lines with a missing cell:\n${missing.join('\n')}`);
});

/**
 * The full fact bag, one place, used by the three tests below. Any name a line
 * interpolates has to appear here or that line looks broken to the suite,
 * which is the point: a new fact name is a deliberate addition.
 */
const ALL_FACTS = {
  price: '$4.99', cents: '$4.99', amount: '$4.99', asking: '$4.99', usual: '$3.49',
  item: 'Kraft Dinner', seller: 'Metro', day: 'today', count: '3',
  category: 'grocery', verdict: 'walk away', word: 'Walk away', what: 'the list', label: 'Kraft Dinner 225g',
  scanned: '4', callable: '2', low: '$0.55', high: '$1.47', n: '2',
};

test('every line actually returns something when it is given its facts', () => {
  const empty = [];
  for (const key of BLOCKS.keys()) {
    for (const id of IDS) {
      const out = say(key, ALL_FACTS, id);
      if (typeof out !== 'string' || out.trim() === '') empty.push(`${key}/${id}`);
    }
  }
  assert.deepEqual(empty, [], `keys returning nothing: ${empty.join(', ')}`);
});

/**
 * D-021, and the reason this test replaced the one that used to live here.
 *
 * The old test rendered every key with `{}` and asserted the result was a
 * non-empty string. "Saved at undefined, Metro, undefined." is a non-empty
 * string, so the one test that touched every line was the test certifying the
 * defect green. Rendering with nothing is still the right probe; the assertion
 * was the wrong one.
 */
test('no line ever puts a missing fact on the screen', () => {
  const leaking = [];
  for (const key of BLOCKS.keys()) {
    for (const id of IDS) {
      const out = say(key, {}, id);
      if (/\bundefined\b|\bnull\b|\bNaN\b/.test(out)) leaking.push(`${key}/${id}: ${out}`);
    }
  }
  assert.deepEqual(leaking, [], `lines shipping a missing fact:\n${leaking.join('\n')}`);
});

/**
 * The caller-side shape of the same defect. A default parameter only fires on
 * undefined, so a screen passing an explicit null threw a TypeError instead of
 * printing "undefined". watchlist.js did exactly that.
 */
test('say survives a caller that hands it nothing at all', () => {
  for (const key of BLOCKS.keys()) {
    for (const id of IDS) {
      assert.doesNotThrow(() => say(key, null, id), `${key}/${id} threw on null facts`);
      assert.doesNotThrow(() => say(key, undefined, id), `${key}/${id} threw on undefined facts`);
    }
  }
});

/**
 * "The attitude changes the words and never the number" -- the promise printed
 * under the picker. Nothing in voice.js may take a price, a count, a seller or
 * a date and alter it, so a line that interpolates a fact must carry that fact
 * through unchanged in all three voices.
 */
test('a fact passed to a line survives it identically in all three voices', () => {
  const FACT = '$4.99';
  for (const [key, body] of BLOCKS) {
    if (!body.includes('facts') && !body.includes('({')) continue;
    const said = IDS.map((id) => say(key, {
      price: FACT, cents: FACT, amount: FACT, item: 'Kraft Dinner', seller: 'Metro',
      day: 'today', count: '3', category: 'grocery', verdict: 'walk away',
    }, id));
    const carrying = said.filter((s) => s.includes(FACT));
    if (carrying.length === 0) continue;   // this key does not use a price
    assert.equal(carrying.length, said.length,
      `${key} shows the price in ${carrying.length} of ${said.length} voices; the number must not depend on the attitude`);
  }
});

test('the verdict words exist for all four tiers', () => {
  for (const tier of ['good', 'fair', 'walk_away', 'unknown']) {
    const word = wordFor(tier);
    assert.ok(word && word.trim(), `no verdict word for ${tier}`);
    // DESIGN.md section 2: sentence case, never shouting caps.
    assert.notEqual(word, word.toUpperCase(), `the verdict word for ${tier} is shouting: ${word}`);
  }
});

test('the four lines the UI pass added are keys here, not inline in a screen', () => {
  for (const key of ['storage_not_kept', 'correct_gate_both', 'correct_gate_price', 'correct_gate_seller']) {
    assert.ok(BLOCKS.has(key), `${key} is missing from voice.js`);
  }
});
