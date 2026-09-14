/**
 * Naming the thing you just wrote a price for.
 *
 * THE FOUNDER'S WORDS: "there should be a feature where the user can manually
 * add the price in and name it. this should also run if we cannot identify
 * it." The price half shipped on 2026-09-13 (`price-only.test.mjs`); this is
 * the name.
 *
 * WHY IT IS WORTH A FIELD, AND IT IS NOT A UI ARGUMENT. An unidentified
 * observation has no key. It carries no barcode and no product id, so
 * `correctionsFor` can never match it, it can never become a price point, and
 * it can never join the comparison set for the thing it was actually about. It
 * hangs off `scan.typed_price_cents` and stops there. A typed name is the
 * first handle that row has ever had -- the only thing a later rejoin, by a
 * person reading Past scans or by a matcher run over the corpus, can work
 * from. docs/plan-always-a-price.md's rung (a), "only unconfirmed shopper
 * prices", is exactly where a name-plus-price lands once that rejoin exists.
 * Without the name the number is a fact about nothing.
 *
 * OPTIONAL IS THE HALF THAT CAN BE GOT WRONG, so most of this file is about
 * it. Empty still files the price. The confirm key never consults the field.
 * Nothing is required, nothing is gated, and an empty box files `null` rather
 * than `""` -- an empty string is a VALUE, and it would shadow a label a later
 * pass managed to resolve out of the server's own
 * `str(c.label) ?? scanRow?.resolved_label`.
 *
 * NOTHING HERE HAS BEEN SEEN IN A BROWSER. The pad and the card are pure
 * exported builders and are rendered for real; the input listener and the
 * submit live inside `render(root, ctx)`'s closure, which this package has no
 * DOM to mount, so that half is asserted against the source, the same trade
 * `price-only.test.mjs` makes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pricePadSheet, observationCard } from '../public/js/screens/camera.js';
import { t } from '../public/js/ui-strings.js';

const CAMERA = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8');

/** The locale swap the rest of the suite uses. */
function inLocale(id, fn) {
  const hadStore = 'localStorage' in globalThis;
  const before = hadStore ? globalThis.localStorage : undefined;
  const cell = new Map([['shin.locale', id]]);
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
  try {
    return fn();
  } finally {
    if (hadStore) globalThis.localStorage = before;
    else delete globalThis.localStorage;
  }
}

/** The pad as `priceonly` opens it: a price, no identity, no category. */
const observationPad = (typed = '', label = '') =>
  pricePadSheet(
    { text: t('cam_no_name_for_it'), category: null, observationOnly: true },
    typed, null, null, null, false, label,
  );

/** The same pad on the ordinary route, where the product is already known. */
const identifiedPad = (typed = '') =>
  pricePadSheet({ text: 'Kraft Dinner 225 g', category: 'grocery' }, typed, null, null, null, false, '');

/* ------------------------------------------------------------------ *
 * The field is there, and only where it means something.
 * ------------------------------------------------------------------ */

test('the no-identity pad asks what it is', () => {
  assert.match(observationPad(), /data-obs-label/, 'no way to name the thing the price is about');
});

test('the pad for a product Shin already named does not ask', () => {
  assert.doesNotMatch(
    identifiedPad(),
    /data-obs-label/,
    'the product is on the sheet two lines up; asking the shopper to retype it is the app charging a person for nothing',
  );
});

test('the question is asked in the reader\'s own language', () => {
  for (const id of ['en', 'fr']) {
    inLocale(id, () => {
      const html = observationPad();
      assert.ok(html.includes(t('cam_what_is_it')), `${id}: the label is not cam_what_is_it`);
      assert.ok(html.includes(t('cam_what_is_it_hint')), `${id}: the placeholder is not cam_what_is_it_hint`);
    });
  }
  // And the two locales really do say different things, or the test above
  // would pass with one hardcoded English string in the screen.
  assert.notEqual(
    inLocale('en', () => t('cam_what_is_it')),
    inLocale('fr', () => t('cam_what_is_it')),
  );
});

/* ------------------------------------------------------------------ *
 * Optional. This is the half that can be got wrong.
 * ------------------------------------------------------------------ */

test('the field is not required and nothing is gated on it', () => {
  const html = observationPad('4.99');
  assert.doesNotMatch(html, /\brequired\b/, 'a required name blocks a price somebody is standing in front of');
  assert.doesNotMatch(html, /aria-required/, 'same, said the other way');
});

test('the confirm key reads the price and never the name', () => {
  // A price and no name confirms; a name and no price does not. The gate is
  // the number, exactly as it was before the field existed.
  assert.doesNotMatch(
    observationPad('4.99', ''),
    /class="btn btn--key key-confirm"[^>]*\sdisabled/,
    'a price was typed and confirm is dead, so the name is gating the number',
  );
  assert.match(
    observationPad('', 'Kraft Dinner'),
    /class="btn btn--key key-confirm"[^>]*\sdisabled/,
    'a name with no price is not a price; confirm has nothing to send',
  );
});

/* ------------------------------------------------------------------ *
 * What was typed survives a repaint, and cannot carry markup.
 * ------------------------------------------------------------------ */

test('the typed name is rendered back into the field', () => {
  assert.match(
    observationPad('4.99', 'Kraft Dinner 225 g'),
    /value="Kraft Dinner 225 g"/,
    'a modifier toggle repaints the whole pad from padHtml; a name held only in the DOM vanishes on the first tap of "% off"',
  );
});

test('the typed name is escaped on the way back in', () => {
  const html = observationPad('4.99', '"><img src=x onerror=alert(1)>');
  assert.doesNotMatch(
    html,
    /<img src=x/,
    'this field is the one string on the pad a person typed, which is the class of input that got a script onto a refusal sheet on 2026-09-08',
  );
});

/* ------------------------------------------------------------------ *
 * The card says the name when there is one.
 * ------------------------------------------------------------------ */

test('the observation card shows the typed name instead of "no name for it"', () => {
  const named = observationCard(499, 'Metro', null, 'Kraft Dinner 225 g');
  assert.match(named, /Kraft Dinner 225 g/, 'the shopper named it and the card still says nobody did');
  assert.ok(
    !named.includes(t('cam_no_name_for_it')),
    '"No name for it" is the honest caption when nobody said anything and a false one the moment somebody did',
  );
});

test('the card falls back to "no name for it" when nothing was typed', () => {
  for (const name of [undefined, null, '', '   ']) {
    const html = observationCard(499, 'Metro', null, name);
    assert.ok(
      html.includes(t('cam_no_name_for_it')),
      `${JSON.stringify(name)}: an empty field is not a name, and the caption has to say so`,
    );
  }
});

test('naming it does not turn the observation into a verdict', () => {
  const named = observationCard(499, 'Metro', null, 'Kraft Dinner 225 g');
  assert.match(named, /data-tier="unknown"/, 'a typed name is not a resolved identity and cannot earn a tier');
  assert.doesNotMatch(named, /data-act="share"/, 'still nothing to share: nothing was judged');
  assert.doesNotMatch(named, /data-act="watch"/, 'still nothing to follow: nothing was judged');
});

test('the card escapes the name it was handed', () => {
  const html = observationCard(499, 'Metro', null, '<img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<img src=x/, 'the one string on this card a person typed reached innerHTML raw');
});

/* ------------------------------------------------------------------ *
 * The wiring, read off the source. The negative test that matters.
 * ------------------------------------------------------------------ */

test('the observation carries the typed name', () => {
  assert.match(
    CAMERA,
    /label: typedName \|\| null,/,
    [
      'The label is gone from the observation payload, so the price goes to the server',
      'with nothing naming it and the row keeps the one property that makes it useless:',
      'no key at all. Strip this line and this test goes red, which is the only reason',
      'it is written against the source.',
    ].join('\n'),
  );
});

test('an empty field files null, never an empty string', () => {
  assert.match(
    CAMERA,
    /const typedName = padLabel\.trim\(\);/,
    'whitespace is not a name, and "" is a VALUE: it would shadow the label the server resolves out of scanRow.resolved_label',
  );
});

test('what was typed is kept in the screen\'s own state, not read off the DOM at confirm', () => {
  assert.match(
    CAMERA,
    /padLabel = nameInput\.value;/,
    'nothing records what is typed, so a repaint loses it',
  );
  assert.match(
    CAMERA,
    /padLabel = '';/,
    'the name from the last observation is not cleared when the pad opens, so it would ride along on the next one',
  );
});

test('the name reaches the card that reports the write', () => {
  assert.match(
    CAMERA,
    /observationCard\(cents, seller, scanThumb, typedName \|\| null\)/,
    'the card is built without the name, so the shopper types one and is told there is none',
  );
});
