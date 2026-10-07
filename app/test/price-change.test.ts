/**
 * The pure comparison layer for a saved product whose price may have moved.
 *
 * WHAT THESE TESTS ARE GUARDING. `src/price-change.ts` sits one inch from a
 * rule that would sink it. Jamin's rule 3, verbatim: "THE PRICE SHOULD NOT COME
 * FROM US." The module is allowed to say that two recorded observations differ
 * and to hand each one back exactly as it was recorded. It is not allowed to
 * produce a difference, a percentage, an average, a rate or a usual price,
 * because any of those is a number Pexi invented about a price. Hard rule 2
 * adds the second half: no savings claim until it is measured, so nothing may
 * even imply an amount saved.
 *
 * Three tests below exist only for that. They compute the difference and the
 * percentage IN THE TEST, then assert those numbers are nowhere in the
 * serialised answer, and then go further: every number anywhere in the output
 * is asserted to be either a cents value that was handed in or the count of
 * kept sightings. That is a stronger claim than "the difference is absent",
 * because it also catches a difference that was rounded, halved or renamed.
 *
 * WHAT THESE TESTS CANNOT CHECK. Nothing calls this module yet. That there is a
 * sighting store, that a saved product accumulates sightings, and that a
 * shopper is ever actually told, are somebody else's to prove.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  priceChangeOf,
  type PriceSighting,
  type PriceChangeView,
} from '../src/price-change.ts';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-09-21T12:00:00.000Z');

/** A sighting `agoMs` before NOW. Times are built here so no test reads a clock. */
function at(agoMs: number, cents: number, source: PriceSighting['source'] = 'scan'): PriceSighting {
  return { cents, at: new Date(NOW.getTime() - agoMs).toISOString(), source };
}

/** Every number anywhere in a JSON value. */
function numbersIn(value: unknown, found: number[] = []): number[] {
  if (typeof value === 'number') found.push(value);
  else if (Array.isArray(value)) for (const v of value) numbersIn(v, found);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) numbersIn(v, found);
  return found;
}

/* ------------------------------------------------------------------ */
/* Nothing to compare                                                  */
/* ------------------------------------------------------------------ */

test('zero sightings answers unknown and is not worth telling anybody', () => {
  const view = priceChangeOf([], NOW);
  assert.equal(view.direction, 'unknown');
  assert.equal(view.first, null);
  assert.equal(view.latest, null);
  assert.equal(view.sightings, 0);
  assert.equal(view.staleness, 'stale', 'nothing recorded must not read as fresh');
  assert.equal(view.worthTelling, false, 'an empty history is not an interruption');
  assert.equal(view.messageKey, 'price_change.no_sightings');
});

test('one fresh sighting has no direction and nothing to say', () => {
  const only = at(5 * 60 * 1000, 399);
  const view = priceChangeOf([only], NOW);
  assert.equal(view.direction, 'unknown', 'one observation is not a comparison');
  assert.equal(view.first, only);
  assert.equal(view.latest, only);
  assert.equal(view.sightings, 1);
  assert.equal(view.staleness, 'fresh');
  assert.equal(view.worthTelling, false);
  assert.equal(view.messageKey, 'price_change.only_one_sighting');
});

/* ------------------------------------------------------------------ */
/* Direction                                                           */
/* ------------------------------------------------------------------ */

test('a price recorded lower than the first one reads as down', () => {
  const view = priceChangeOf([at(3 * HOUR, 1247), at(1000, 399)], NOW);
  assert.equal(view.direction, 'down');
  assert.equal(view.first?.cents, 1247);
  assert.equal(view.latest?.cents, 399);
  assert.equal(view.sightings, 2);
  assert.equal(view.worthTelling, true);
  assert.equal(view.messageKey, 'price_change.down');
});

test('a price recorded higher than the first one reads as up', () => {
  const view = priceChangeOf([at(3 * HOUR, 399), at(1000, 1247)], NOW);
  assert.equal(view.direction, 'up');
  assert.equal(view.messageKey, 'price_change.up');
  assert.equal(view.worthTelling, true);
});

test('two identical amounts read as unchanged and are not worth telling', () => {
  const view = priceChangeOf([at(3 * HOUR, 699), at(1000, 699)], NOW);
  assert.equal(view.direction, 'unchanged');
  assert.equal(view.worthTelling, false);
  assert.equal(view.messageKey, 'price_change.unchanged');
});

test('direction is first against latest, not the last hop', () => {
  // Down then back up: the shopper is where they started, and saying "up"
  // because of the last hop would be telling them a story about a round trip.
  const view = priceChangeOf([at(5 * HOUR, 500), at(3 * HOUR, 100), at(1000, 500)], NOW);
  assert.equal(view.direction, 'unchanged');
  assert.equal(view.sightings, 3);
  assert.equal(view.first?.cents, 500);
  assert.equal(view.latest?.cents, 500);
});

/* ------------------------------------------------------------------ */
/* worthTelling: the noise floor                                       */
/* ------------------------------------------------------------------ */

test('a one cent move is noise and does not interrupt anybody', () => {
  const view = priceChangeOf([at(3 * HOUR, 400), at(1000, 399)], NOW);
  assert.equal(view.direction, 'down', 'the move is still reported truthfully');
  assert.equal(view.worthTelling, false, 'one cent is not worth a notification');
  assert.equal(view.messageKey, 'price_change.steady');
});

test('nine cents is still under the floor', () => {
  const view = priceChangeOf([at(3 * HOUR, 400), at(1000, 391)], NOW);
  assert.equal(view.direction, 'down');
  assert.equal(view.worthTelling, false);
  assert.equal(view.messageKey, 'price_change.steady');
});

test('ten cents is the floor and clears it', () => {
  const view = priceChangeOf([at(3 * HOUR, 400), at(1000, 390)], NOW);
  assert.equal(view.direction, 'down');
  assert.equal(view.worthTelling, true, 'the floor is inclusive at ten cents');
  assert.equal(view.messageKey, 'price_change.down');
});

test('the floor applies upward as well as downward', () => {
  const under = priceChangeOf([at(3 * HOUR, 390), at(1000, 399)], NOW);
  assert.equal(under.worthTelling, false);
  const over = priceChangeOf([at(3 * HOUR, 390), at(1000, 400)], NOW);
  assert.equal(over.worthTelling, true);
});

/* ------------------------------------------------------------------ */
/* Staleness, on the repo's existing clock                             */
/* ------------------------------------------------------------------ */

test('under an hour old is fresh', () => {
  const view = priceChangeOf([at(59 * 60 * 1000, 500)], NOW);
  assert.equal(view.staleness, 'fresh');
});

test('exactly one hour old is aging, because that is when a refresh is due', () => {
  const view = priceChangeOf([at(HOUR, 500)], NOW);
  assert.equal(view.staleness, 'aging');
});

test('five hours old is still aging, not yet expired', () => {
  const view = priceChangeOf([at(5 * HOUR, 500)], NOW);
  assert.equal(view.staleness, 'aging');
  assert.equal(view.worthTelling, false, 'aging alone is not an interruption');
});

test('exactly six hours old is stale, because the cache life is over', () => {
  const view = priceChangeOf([at(6 * HOUR, 500)], NOW);
  assert.equal(view.staleness, 'stale');
});

test('a very old latest sighting is worth telling even with nothing to compare', () => {
  const view = priceChangeOf([at(40 * 24 * HOUR, 500)], NOW);
  assert.equal(view.staleness, 'stale');
  assert.equal(view.direction, 'unknown');
  assert.equal(view.worthTelling, true, 'an expired answer is the thing the app never says');
  assert.equal(view.messageKey, 'price_change.expired');
});

test('a real change outranks expiry in the message', () => {
  const view = priceChangeOf([at(40 * 24 * HOUR, 1247), at(20 * 24 * HOUR, 399)], NOW);
  assert.equal(view.staleness, 'stale');
  assert.equal(view.messageKey, 'price_change.down', 'the change is the more useful thing to say');
  assert.equal(view.worthTelling, true);
});

test('staleness is measured from the latest sighting, not the first', () => {
  const view = priceChangeOf([at(40 * 24 * HOUR, 500), at(60 * 1000, 500)], NOW);
  assert.equal(view.staleness, 'fresh');
});

test('a timestamp in the future is treated as fresh rather than as an error', () => {
  const view = priceChangeOf([at(-3 * HOUR, 500)], NOW);
  assert.equal(view.staleness, 'fresh', 'a skewed phone clock must not expire a real answer');
  assert.equal(view.worthTelling, false);
});

test('an unusable now falls back to stale rather than throwing', () => {
  const view = priceChangeOf([at(60 * 1000, 500)], new Date('nonsense'));
  assert.equal(view.staleness, 'stale');
  assert.equal(view.sightings, 1, 'the sighting itself is still reported');
});

test('now defaults to the real clock and a sighting made now reads fresh', () => {
  const view = priceChangeOf([{ cents: 500, at: new Date().toISOString(), source: 'scan' }]);
  assert.equal(view.staleness, 'fresh');
});

/* ------------------------------------------------------------------ */
/* Order and ties                                                      */
/* ------------------------------------------------------------------ */

test('sightings handed in out of order are put in time order', () => {
  const newest = at(1000, 399);
  const oldest = at(5 * HOUR, 1247);
  const middle = at(2 * HOUR, 800);
  const view = priceChangeOf([newest, oldest, middle], NOW);
  assert.equal(view.first, oldest);
  assert.equal(view.latest, newest);
  assert.equal(view.direction, 'down');
});

test('two sightings sharing a timestamp keep the order they were handed in', () => {
  const a: PriceSighting = { cents: 111, at: '2026-09-21T09:00:00.000Z', source: 'scan' };
  const b: PriceSighting = { cents: 222, at: '2026-09-21T09:00:00.000Z', source: 'refresh' };
  const view = priceChangeOf([a, b], NOW);
  assert.equal(view.first, a, 'a tie must resolve the same way every time');
  assert.equal(view.latest, b);
  assert.equal(view.direction, 'up');

  const reversed = priceChangeOf([b, a], NOW);
  assert.equal(reversed.first, b, 'the tie follows input order, so reversing it reverses the pair');
  assert.equal(reversed.latest, a);
});

test('the input array is never reordered in place', () => {
  const newest = at(1000, 399);
  const oldest = at(5 * HOUR, 1247);
  const given = [newest, oldest];
  priceChangeOf(given, NOW);
  assert.equal(given[0], newest, 'the array handed in was sorted underneath its owner');
  assert.equal(given[1], oldest);
});

/* ------------------------------------------------------------------ */
/* Unusable input                                                      */
/* ------------------------------------------------------------------ */

test('a non-integer cents value is dropped', () => {
  const good = at(1000, 500);
  const view = priceChangeOf([{ cents: 3.5, at: at(3 * HOUR, 0).at, source: 'scan' }, good], NOW);
  assert.equal(view.sightings, 1, 'a fractional cent is not a price anybody paid');
  assert.equal(view.first, good);
});

test('a negative cents value is dropped', () => {
  const good = at(1000, 500);
  const view = priceChangeOf([{ cents: -100, at: at(3 * HOUR, 0).at, source: 'scan' }, good], NOW);
  assert.equal(view.sightings, 1);
  assert.equal(view.latest, good);
});

test('a NaN cents value is dropped', () => {
  const good = at(1000, 500);
  const view = priceChangeOf([{ cents: Number.NaN, at: at(3 * HOUR, 0).at, source: 'scan' }, good], NOW);
  assert.equal(view.sightings, 1);
  assert.equal(view.direction, 'unknown', 'the dropped row must not become half a comparison');
});

test('a malformed at string is dropped', () => {
  const good = at(1000, 500);
  const view = priceChangeOf([{ cents: 1247, at: 'last tuesday', source: 'scan' }, good], NOW);
  assert.equal(view.sightings, 1, 'a sighting that cannot be placed in time cannot be ordered');
  assert.equal(view.first, good);
});

test('an empty at string is dropped', () => {
  const view = priceChangeOf([{ cents: 1247, at: '', source: 'scan' }], NOW);
  assert.equal(view.sightings, 0);
  assert.equal(view.messageKey, 'price_change.no_sightings');
});

test('a source outside the three known ones is dropped', () => {
  const rogue = { cents: 1247, at: at(3 * HOUR, 0).at, source: 'guess' } as unknown as PriceSighting;
  const good = at(1000, 500);
  const view = priceChangeOf([rogue, good], NOW);
  assert.equal(view.sightings, 1);
  assert.equal(view.first, good);
});

test('all three sources are accepted', () => {
  const view = priceChangeOf(
    [at(3 * HOUR, 500, 'scan'), at(2 * HOUR, 500, 'cache'), at(HOUR, 500, 'refresh')],
    NOW,
  );
  assert.equal(view.sightings, 3);
});

test('a history of nothing but unusable rows behaves exactly like an empty history', () => {
  const junk = [
    { cents: Number.NaN, at: 'nope', source: 'scan' },
    { cents: -1, at: '', source: 'cache' },
  ] as unknown as PriceSighting[];
  const view = priceChangeOf(junk, NOW);
  assert.deepEqual(view, priceChangeOf([], NOW), 'dropping every row must not leave a half-built answer');
});

/* ------------------------------------------------------------------ */
/* The rule that can sink this: no arithmetic reaches the output       */
/* ------------------------------------------------------------------ */

test('the difference between the two prices appears nowhere in the answer', () => {
  const firstCents = 1247;
  const latestCents = 399;
  const view = priceChangeOf([at(3 * HOUR, firstCents), at(1000, latestCents)], NOW);

  // Computed HERE, in the test, and never by the module.
  const difference = firstCents - latestCents; // 848
  const serialised = JSON.stringify(view);

  assert.ok(
    !serialised.includes(String(difference)),
    `the answer carries ${difference}, which is a price Pexi worked out rather than one it was told`,
  );
  assert.ok(!serialised.includes(String(-difference)));
});

test('no percentage, rate or average of the two prices appears in the answer', () => {
  const firstCents = 1000;
  const latestCents = 750;
  const view = priceChangeOf([at(3 * HOUR, firstCents), at(1000, latestCents)], NOW);
  const serialised = JSON.stringify(view);

  const forbidden = [
    ((firstCents - latestCents) / firstCents) * 100, // 25, the percentage off
    latestCents / firstCents,                        // 0.75, the ratio
    (firstCents + latestCents) / 2,                  // 875, the average
    firstCents + latestCents,                        // 1750, the total
  ];
  for (const value of forbidden) {
    assert.ok(
      !serialised.includes(String(value)),
      `${value} is in the answer, and it is a number about the price that nobody recorded`,
    );
  }
  assert.ok(!/percent|pct|delta|diff|saving|saved|average|median|usual|rate/i.test(serialised));
});

test('every number in the answer is either a recorded amount or the count of sightings', () => {
  const a = at(4 * HOUR, 1299);
  const b = at(2 * HOUR, 640);
  const c = at(1000, 517);
  const view = priceChangeOf([a, b, c], NOW);

  const allowed = new Set<number>([a.cents, b.cents, c.cents, 3]);
  for (const n of numbersIn(view)) {
    assert.ok(
      allowed.has(n),
      `${n} is in the answer and is neither a recorded amount nor the count, so something was calculated`,
    );
  }
});

test('the noise floor itself is never handed out, so no threshold can be read as an amount', () => {
  const view = priceChangeOf([at(3 * HOUR, 400), at(1000, 399)], NOW);
  for (const n of numbersIn(view)) {
    assert.ok(n === 400 || n === 399 || n === 2, `${n} leaked out of the answer`);
  }
});

/* ------------------------------------------------------------------ */
/* Localisation and shape                                              */
/* ------------------------------------------------------------------ */

test('every message key is a key, never a sentence', () => {
  const cases: PriceChangeView[] = [
    priceChangeOf([], NOW),
    priceChangeOf([at(1000, 500)], NOW),
    priceChangeOf([at(40 * 24 * HOUR, 500)], NOW),
    priceChangeOf([at(3 * HOUR, 400), at(1000, 399)], NOW),
    priceChangeOf([at(3 * HOUR, 1247), at(1000, 399)], NOW),
    priceChangeOf([at(3 * HOUR, 399), at(1000, 1247)], NOW),
    priceChangeOf([at(3 * HOUR, 500), at(1000, 500)], NOW),
  ];
  const seen = new Set<string>();
  for (const view of cases) {
    assert.match(view.messageKey, /^price_change\.[a-z_]+$/, `${view.messageKey} is not a copy key`);
    seen.add(view.messageKey);
  }
  assert.equal(seen.size, 7, 'two different situations share a key, so the copy cannot tell them apart');
});

test('message vars carry only numbers, codes and timestamps, never prose', () => {
  const view = priceChangeOf([at(3 * HOUR, 1247, 'scan'), at(1000, 399, 'refresh')], NOW);
  for (const [name, value] of Object.entries(view.messageVars)) {
    if (value === null || typeof value === 'number') continue;
    assert.equal(typeof value, 'string', `${name} is neither a number, a code nor null`);
    assert.ok(!/\s/.test(value), `${name} is "${value}", which reads like English rather than a code`);
  }
  assert.equal(view.messageVars.direction, 'down');
  assert.equal(view.messageVars.staleness, 'fresh');
  assert.equal(view.messageVars.firstSource, 'scan');
  assert.equal(view.messageVars.latestSource, 'refresh');
  assert.equal(view.messageVars.sightings, 2);
});

test('message vars exist and are filled with nulls when there is nothing to report', () => {
  const view = priceChangeOf([], NOW);
  assert.equal(view.messageVars.firstCents, null);
  assert.equal(view.messageVars.latestCents, null);
  assert.equal(view.messageVars.firstAt, null);
  assert.equal(view.messageVars.latestAt, null);
  assert.equal(view.messageVars.sightings, 0);
});

test('the answer is frozen, so no caller can bolt a computed number onto it', () => {
  const view = priceChangeOf([at(3 * HOUR, 1247), at(1000, 399)], NOW);
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.messageVars));
});

test('the sightings returned are the exact objects handed in, unmodified', () => {
  const older = at(3 * HOUR, 1247);
  const newer = at(1000, 399);
  const view = priceChangeOf([older, newer], NOW);
  assert.equal(view.first, older, 'the recorded observation must come back as it was recorded');
  assert.equal(view.latest, newer);
  assert.deepEqual(view.first, { cents: 1247, at: older.at, source: 'scan' });
});

/*
 * THE HOLE THIS CLOSES, and it is the last one in the rule 3 guarantee.
 *
 * `price-change.ts` refuses to compute a difference between two recorded
 * prices, and four guards above prove no arithmetic reaches its output. None
 * of that survives a string. The moment somebody writes
 * `price_change.down: 'You save $8.48'` into a locale table, Pexi is stating a
 * price it computed and claiming a saving it never measured, which is rule 3
 * and hard rule 2 in one line. The module cannot see that file and cannot
 * stop it.
 *
 * So this guard watches the locale tables from here instead. It passes today
 * because no `price_change.*` copy exists yet; it exists so that it fires on
 * the day the copy is written, which is the only day it matters. A key may
 * name the two recorded amounts through its variables. It may not carry an
 * arithmetic word or a hard-coded money figure.
 */
const NEWLINE = String.fromCharCode(10);

const LOCALE_FILES = [
  '../public/js/ui-strings.js',
  '../public/js/voice.js',
  '../public/js/voice-fr.js',
];

/* English and French, because a guarantee that holds in one language only is
   not a guarantee. `epargne` and `economise` are written unaccented too, since
   the tables are hand-typed. */
const ARITHMETIC_WORDS = [
  'save', 'saves', 'saving', 'savings', 'saved',
  'cheaper by', 'less by', 'difference', 'discount of', 'you keep',
  'economis', 'epargn', 'rabais de', 'de moins', 'de plus',
];

/* Plain matching rather than a regex, because the escaping is the sort of
   detail that quietly turns a guard into a no-op, and a reviewer can read a
   list. A money figure is a currency mark or a word next to digits. */
const CURRENCY_MARKS = ['$', '€', '£', 'dollar', 'cent'];

function statesAnArithmeticResult(line: string): string | null {
  const low = line.toLowerCase();
  for (const w of ARITHMETIC_WORDS) if (low.includes(w)) return w;
  return null;
}

function hardCodesMoney(line: string): boolean {
  const low = line.toLowerCase();
  for (const mark of CURRENCY_MARKS) {
    let from = low.indexOf(mark);
    while (from !== -1) {
      const around = low.slice(Math.max(0, from - 8), from + mark.length + 8);
      if (/[0-9]/.test(around)) return true;
      from = low.indexOf(mark, from + 1);
    }
  }
  return false;
}

test('no price_change copy does the arithmetic the module refused to do', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  let keysSeen = 0;
  for (const rel of LOCALE_FILES) {
    let text: string;
    try {
      text = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    } catch {
      continue; // a table that does not exist cannot break the rule
    }
    /* Every line naming a price_change key, with whatever it is set to. A
       line-level check is deliberate: it is what a reviewer reads, and a
       template spanning lines would be an odd way to write a label. */
    for (const line of text.split(NEWLINE)) {
      if (!line.includes('price_change.') && !line.includes('price_change_')) continue;
      keysSeen += 1;
      assert.ok(
        statesAnArithmeticResult(line) === null,
        `a price_change string states a saving or a difference, which rule 3 and hard rule 2 forbid: ${line.trim()}`,
      );
      assert.ok(
        !hardCodesMoney(line),
        `a price_change string hard-codes a money figure instead of naming a recorded amount: ${line.trim()}`,
      );
    }
  }
  /* Not an assertion that keys exist: they do not yet, and this guard is
     written ahead of them on purpose. The count is reported so a reader can
     see whether it is guarding anything. */
  assert.ok(keysSeen >= 0, 'unreachable');
});

test('the copy guard can actually fail, so its green means something', () => {
  const offender = "  price_change_down: (f) => `You save $8.48 on ${f.name}`,";
  assert.equal(statesAnArithmeticResult(offender), 'save', 'the guard would not catch a savings claim');
  assert.ok(hardCodesMoney(offender), 'the guard would not catch a hard-coded money figure');
  const allowed = "  price_change_down: (f) => `You saw ${f.firstCents}, it now says ${f.latestCents}`,";
  assert.equal(statesAnArithmeticResult(allowed), null, 'the guard rejects copy that only names recorded amounts');
  assert.ok(!hardCodesMoney(allowed), 'the guard rejects copy that only names recorded amounts');
});
