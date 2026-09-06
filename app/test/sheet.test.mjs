/**
 * The sheet layout, checked outside the browser.
 *
 * camera.js has carried this line since the sheets were split out:
 *
 *   "Exported for the sheet-layout check (`node scripts/check-sheet.mjs`)"
 *
 * That file was never written. Six functions were exported for a test that did
 * not exist, so the rules the export comment describes -- the peek carries the
 * primary, a refusal carries one action, a refusal is never red -- were held by
 * nothing but the next reader's memory. This is that check.
 *
 * It asserts on the markup string rather than through a DOM, for the same
 * reason tokens.test.mjs reads tokens.css as text: the whole app is
 * zero-runtime-dependency by decision, and pulling in a parser to read seven
 * template literals would be a worse trade than a forty-line scanner. Where
 * source ORDER is the thing being asserted -- the primary action landing before
 * any half-detent markup -- a string index is the honest measurement anyway,
 * because that order is exactly what the browser lays out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  verdictSheet,
  refusalSheet,
  pricePadSheet,
  goingRateCard,
  workingSheet,
  textRouteSheet,
  keypadHtml,
  pricePadDisplay,
  parsePadPrice,
} from '../public/js/screens/camera.js';

/* ----------------------------------------------------------------- fixtures */

/** A verdict at a given confidence band. The engine's own shape, nothing more. */
const verdict = (band = 'high', tier = 'walk_away') => ({
  kind: 'verdict',
  tier,
  askingCents: 499,
  category: 'grocery',
  identity: { id: 'demo-1', label: 'Test item 500 g' },
  spread: { lowCents: 299, highCents: 429, medianCents: 349 },
  pointCount: 3,
  comparisonSet: [
    { seller: 'Walmart', amountCents: 299, observedAt: '2026-08-01', kind: 'shelf' },
    { seller: 'Loblaws', amountCents: 389, observedAt: '2026-08-02', kind: 'shelf' },
    { seller: 'Metro', amountCents: 429, observedAt: '2026-08-03', kind: 'shelf' },
  ],
  confidence: { band, distinctSellers: 3, because: 'Three sellers agreed within a dollar.' },
  disagreement: { detail: 'One seller sits well above the rest. The other two agree closely.' },
  lines: ['Shin used three shelf prices from the last week.'],
});

const refusal = (reason, detail = 'Something specific and true happened here. And then a second sentence.') => ({
  kind: 'refusal',
  reason,
  detail,
  identity: null,
  evidence: [],
});

/** Every reason refusalSheet branches on, so no branch is checked by proxy. */
const REFUSAL_REASONS = [
  'category_unsupported',
  'identity_unsure',
  'no_identity',
  'too_few_points',
  'points_too_stale',
  'no_source_response',
  'comparison_incoherent',
];

const scenario = { text: 'Test item 500 g', category: 'grocery', observed: true };
const padItem = { text: 'Test item 500 g', category: 'grocery' };

/** Every sheet the camera can mount, named. */
const ALL_SHEETS = () => [
  ['verdict, certain', verdictSheet(verdict('high'), scenario, null)],
  ['verdict, fairly sure', verdictSheet(verdict('medium'), scenario, null)],
  ['verdict, thin', verdictSheet(verdict('low'), scenario, null)],
  ['verdict, acknowledged save', verdictSheet(verdict('high'), scenario, null, true)],
  ...REFUSAL_REASONS.map((r) => [`refusal, ${r}`, refusalSheet(refusal(r), scenario, ['Groceries', 'Household'])]),
  ['price pad, empty', pricePadSheet(padItem, '', null, null)],
  ['price pad, typed', pricePadSheet(padItem, '4.99', null, null)],
  ['price pad, percent off', pricePadSheet(padItem, '4.99', { kind: 'percent', pct: 20 }, null)],
  ['price pad, N for', pricePadSheet(padItem, '4.99', { kind: 'nfor', n: 3 }, null)],
  ['going rate', goingRateCard(
    { ...refusal('no_asking_price'), evidence: verdict().comparisonSet, identity: { id: 'demo-1', label: 'Test item 500 g' } },
    padItem,
  )],
  ['working, step 0', workingSheet('Test item 500 g', 0)],
  ['working, slow', workingSheet('Test item 500 g', 1, { slow: true })],
  ['type-it route', textRouteSheet()],
];

/* ------------------------------------------------------------------ scanner */

/**
 * Every opening tag in a markup string, as { tag, attrs, raw }.
 *
 * Deliberately not a parser. It reads one well-formed template literal that
 * this repo wrote itself, and the only question it is ever asked is what
 * attributes sit on which element.
 */
function tags(html) {
  const out = [];
  for (const [raw, tag, attrText] of html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const attrs = {};
    for (const [, name, value] of attrText.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) {
      attrs[name] = value ?? '';
    }
    out.push({ tag, attrs, raw });
  }
  return out;
}

/** Elements the browser puts in the tab order without being asked. */
const NATIVELY_FOCUSABLE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'details']);

const count = (html, needle) => html.split(needle).length - 1;

/* ------------------------------------------------------- the peek's primary */

/**
 * DESIGN.md section 4 / USAGE.md section 7: the peek is what lands with no
 * drag, and it ends in the sheet's one primary action. If a primary can be
 * pushed below the fold by half-detent content, the user has an answer on
 * screen and nothing to do about it.
 */
test('every outcome sheet carries its primary action inside the peek', () => {
  const outcomes = [
    ['verdict', verdictSheet(verdict('high'), scenario, null)],
    ['going rate', goingRateCard(
      { ...refusal('no_asking_price'), evidence: verdict().comparisonSet, identity: { id: 'd', label: 'x' } },
      padItem,
    )],
    ...REFUSAL_REASONS.map((r) => [`refusal ${r}`, refusalSheet(refusal(r), scenario, ['Groceries'])]),
  ];
  for (const [name, html] of outcomes) {
    const peekAt = html.indexOf('class="sheet-peek"');
    const primaryAt = html.indexOf('actions-primary');
    assert.notEqual(peekAt, -1, `${name}: no peek block at all`);
    assert.notEqual(primaryAt, -1, `${name}: no primary action anywhere`);
    assert.ok(primaryAt > peekAt, `${name}: the primary action is not inside the peek`);
  }
});

test('nothing from the half or full detent is printed before the peek is finished', () => {
  for (const [name, html] of ALL_SHEETS()) {
    const halfAt = html.indexOf('class="sheet-half"');
    if (halfAt === -1) continue;
    const primaryAt = html.indexOf('actions-primary');
    assert.notEqual(primaryAt, -1, `${name}: has a half detent and no primary`);
    assert.ok(
      primaryAt < halfAt,
      `${name}: half-detent markup starts at ${halfAt}, before the primary action at ${primaryAt}`,
    );
  }
});

/* --------------------------------------------------------------- the refusal */

/**
 * USAGE.md section 4 ("the single action, by reason") and section 7 ("on a
 * refusal: one action only... there is no share and no watch on a refusal").
 * Two pills on a refusal is the failure this guards: the second one is always
 * something like "Try again", which is what the downward drag already does.
 */
test('a refusal offers exactly one action', () => {
  for (const reason of REFUSAL_REASONS) {
    const html = refusalSheet(refusal(reason), scenario, ['Groceries', 'Household']);
    const pills = count(html, 'class="pill');
    if (reason === 'category_unsupported') {
      // The category refusal's repair is a list of what Shin CAN price, on this
      // same sheet, plus the labelled way back. It is one repair, not a pill.
      assert.equal(pills, 0, `${reason}: expected the chip list as the repair, found ${pills} pill(s)`);
      assert.ok(html.includes('cat-chips'), `${reason}: no chip list to repair with`);
    } else {
      assert.equal(pills, 1, `${reason}: a refusal carries one action, found ${pills}`);
    }
    assert.ok(!html.includes('data-act="share"'), `${reason}: a refusal has no share`);
    assert.ok(!html.includes('data-act="watch"'), `${reason}: a refusal has no watch`);
  }
});

/**
 * The first item on FLAWS.md's "what is right, and should not be changed" list:
 * "The refusal is a first-class outcome with its own colour, face and copy, and
 * it is grey and never red." Red means the price is bad. A refusal is not a bad
 * price, it is no price, and the two must never look alike in a screenshot.
 */
test('a refusal is grey and never tier-red', () => {
  for (const reason of REFUSAL_REASONS) {
    const html = refusalSheet(refusal(reason), scenario, ['Groceries']);
    const section = tags(html).find((t) => t.tag === 'section');
    assert.equal(section.attrs['data-tier'], 'unknown', `${reason}: refusal bound to a tier that is not unknown`);
    assert.equal(section.attrs['data-conf'], 'refuses', `${reason}: refusal not on the refuses treatment`);
    for (const red of ['walk_away', '--walk', 'walk-bright']) {
      assert.ok(!html.includes(red), `${reason}: refusal markup names ${red}`);
    }
  }
});

/* ------------------------------------------------------- aria-hidden and focus */

/**
 * The defect this test exists for, in the exact shape it shipped in: the two
 * grabbers were `<span aria-hidden="true" role="button" tabindex="0"
 * aria-label="Show more">` with no key handler anywhere in the repo. Focusable,
 * named a button, hidden from the accessibility tree, and inert. A keyboard
 * user reached it, was told it was a button, and nothing happened.
 *
 * `aria-hidden` on anything reachable is the general form of that bug, so this
 * checks the general form.
 */
test('no sheet puts aria-hidden on a focusable element', () => {
  for (const [name, html] of ALL_SHEETS()) {
    for (const { tag, attrs, raw } of tags(html)) {
      if (attrs['aria-hidden'] !== 'true') continue;
      assert.ok(
        !NATIVELY_FOCUSABLE.has(tag),
        `${name}: <${tag}> is focusable and carries aria-hidden -- ${raw}`,
      );
      assert.ok(
        attrs.tabindex === undefined || attrs.tabindex === '-1',
        `${name}: aria-hidden element is in the tab order -- ${raw}`,
      );
      assert.ok(
        attrs.role !== 'button',
        `${name}: aria-hidden element is announced as a button -- ${raw}`,
      );
    }
  }
});

/**
 * The grabber is one of two things and never a third: a real <button> on the
 * sheets that have a detent to step to, or a decorative <span> with nothing to
 * do on the five that top out at peek. What it may not be again is a span
 * dressed as a control.
 */
test('every grabber is either a real button or plainly decorative', () => {
  for (const [name, html] of ALL_SHEETS()) {
    for (const { tag, attrs, raw } of tags(html)) {
      if (!(attrs.class ?? '').split(/\s+/).includes('grabber')) continue;
      if (tag === 'button') {
        assert.ok(attrs['aria-label'], `${name}: grabber button has no accessible name -- ${raw}`);
        assert.ok(attrs['data-act'], `${name}: grabber button is wired to nothing -- ${raw}`);
        assert.equal(attrs['aria-hidden'], undefined, `${name}: grabber button is hidden from AT -- ${raw}`);
      } else {
        assert.equal(attrs['aria-hidden'], 'true', `${name}: decorative grabber is not hidden -- ${raw}`);
        assert.equal(attrs.role, undefined, `${name}: decorative grabber claims a role -- ${raw}`);
        assert.equal(attrs.tabindex, undefined, `${name}: decorative grabber is in the tab order -- ${raw}`);
      }
    }
  }
});

/**
 * A grabber only exists where it can do something. The two sheets with a half
 * or full detent get the button; the five that stop at peek get the span. The
 * previous state of this was the reverse of a rule: two sheets had a focusable
 * grabber and five did not, and which was which was not written down anywhere.
 */
test('a button grabber appears exactly on the sheets that have a detent to reach', () => {
  for (const [name, html] of ALL_SHEETS()) {
    const hasDetent = html.includes('class="sheet-half"') || html.includes('class="sheet-full"');
    const hasButton = html.includes('<button type="button" class="grabber"');
    assert.equal(hasButton, hasDetent, `${name}: grabber button ${hasButton ? 'present' : 'missing'} on a sheet with ${hasDetent ? 'a' : 'no'} deeper detent`);
  }
});

/**
 * camera.js focuses the sheet itself on mount, because the bottom bar (and the
 * shutter the press came from) slides away on `data-state="result"` and
 * `"choosing"` and takes the focus with it. That only works if the section is a
 * focus target.
 */
test('every sheet can take focus without joining the tab order', () => {
  for (const [name, html] of ALL_SHEETS()) {
    const section = tags(html).find((t) => t.tag === 'section');
    assert.ok(section, `${name}: no section element`);
    assert.equal(section.attrs.tabindex, '-1', `${name}: sheet is not a focus target`);
  }
});

/* ------------------------------------------------------------------ the pad */

/**
 * The keypad is one component with two hosts as of 2026-09-06 (correct.js is
 * the other). These are the parts of its markup contract the other host builds
 * against: the data attribute the key handler reads, the twelve characters, and
 * Foundation's key class rather than a per-screen copy of the same fill.
 */
test('the keypad emits the twelve keys, on the shared class, with the char in data-pad', () => {
  const pad = keypadHtml();
  for (const char of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']) {
    assert.ok(pad.includes(`data-pad="${char}"`), `keypad is missing the ${char} key`);
  }
  assert.equal(count(pad, 'class="btn btn--key"'), 12, 'every key carries the Foundation key class');
  assert.ok(!/class="[^"]*\bkey\b[^"]*"/.test(pad.replace(/btn--key/g, '')),
    'a key still carries the bare `.key` class, which correct.css styles unscoped');
  assert.ok(pad.includes('aria-label="Backspace"'), 'the backspace key has no accessible name');
});

test('the confirm key appears only when asked for, and disables until it can be pressed', () => {
  assert.ok(!keypadHtml().includes('key-confirm'), 'a pad with no confirm rendered one anyway');
  assert.ok(keypadHtml().includes('keypad-bottom-3'), 'a pad with no confirm did not narrow its bottom row');

  const off = keypadHtml({ confirm: true, canConfirm: false });
  assert.ok(off.includes('data-act="pad-confirm"'), 'the confirm key is not wired to pad-confirm');
  assert.ok(off.includes(' disabled'), 'the confirm key is pressable with nothing typed');

  const on = keypadHtml({ confirm: true, canConfirm: true, confirmLabel: 'File it' });
  assert.ok(!on.includes(' disabled'), 'the confirm key stayed disabled with a usable price typed');
  assert.ok(on.includes('aria-label="File it"'), 'the confirm key ignored its label');
});

/**
 * USAGE.md A1 0:13.4: nothing submits until the confirm key is pressed, and it
 * is disabled until the effective price parses above zero. The pad sheet's own
 * end of that, since the key's state is computed there and not in the builder.
 */
test('the pad sheet enables its confirm key exactly when there is a price to send', () => {
  assert.ok(pricePadSheet(padItem, '', null, null).includes(' disabled'), 'empty pad offered to price nothing');
  assert.ok(pricePadSheet(padItem, '0', null, null).includes(' disabled'), 'a typed zero is not a price');
  assert.ok(!pricePadSheet(padItem, '4.99', null, null).includes(' disabled'), '$4.99 could not be confirmed');
  // Row 43: a modifier that wipes the price out has to disable it again.
  assert.ok(
    pricePadSheet(padItem, '4.99', { kind: 'percent', pct: 100 }, null).includes('4.99'),
    'the typed number stopped being shown once a modifier was on',
  );
});

/**
 * The display and the parser travel with the builder because correct.js had a
 * verbatim copy of the first and its own reading of the second. A pad that
 * renders the same digits and reads them back differently is the same
 * duplication one layer down.
 */
test('the typed price is shown with a ghosted remainder, never a fake number', () => {
  assert.equal(pricePadDisplay(''), '<span class="ghosted">0.00</span>');
  assert.equal(pricePadDisplay('4'), '4<span class="ghosted">.00</span>');
  assert.equal(pricePadDisplay('4.'), '4.');
  assert.equal(pricePadDisplay('4.9'), '4.9<span class="ghosted">0</span>');
  assert.equal(pricePadDisplay('4.99'), '4.99');
  // A leading decimal is typed as "0." by the key handler, but the display must
  // not invent a whole number if it ever arrives without one.
  assert.equal(pricePadDisplay('.5'), '0.5<span class="ghosted">0</span>');
});

test('the pad buffer reads back as cents, or as nothing at all', () => {
  assert.equal(parsePadPrice(''), null);
  assert.equal(parsePadPrice('.'), null);
  assert.equal(parsePadPrice('4'), 400);
  assert.equal(parsePadPrice('4.99'), 499);
  assert.equal(parsePadPrice('0.05'), 5);
});
