/**
 * UX build 5, the price pad: R-26 (cents first). docs/design/ux-evidence-2026-10-09.md,
 * block R-26, section 13 build 5, journeys J1 and J2 (the pad is 3 to 5 taps of both).
 *
 * BLOCKS COVERED: R-26.
 *
 * TESTS EXPECTED RED UNTIL BUILT: every test that types a price (including the two
 * modifier labels, which are computed from the typed number), because today
 * the pad reads "4 9 9" as $499 (a point key and dollars first). Green today and
 * kept green on purpose: Skip, the confirm key staying off at zero, the two
 * modifiers existing, the digit keys and backspace not throwing. Those are the
 * parts of the pad the build must not lose, so they are tested as controls.
 *
 * THE PAD IS ASSUMED ON BY DEFAULT. Section 13 says the cents-first pad ships
 * "behind a switch". If the build keeps the old pad as the default and puts the
 * new one behind a flag, these tests need that flag set in `launchReturning`'s
 * seed; the tests themselves do not change.
 *
 * WHAT IS REAL AND WHAT IS STUBBED. The real camera screen and every module
 * under public/js run (see ux-b5-harness.test.mjs). Stubbed: the camera reader,
 * the server (it records every request, so "what price was sent" is read from the
 * request the screen made, not from the screen's own word) and the phone APIs.
 *
 * FAILS LOUDLY (the founder: "all code should contain things that ensure things
 * fail loudly"). The pad must throw on any key that is not one digit or
 * backspace: a stray character, a decimal point, a two-digit value or an empty
 * value is a bug in whoever built the key, and silently appending it to the
 * price is how a wrong price reaches a verdict. The test injects each one into
 * the real keypad and requires a thrown error AND an unchanged amount.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchReturning, pressScan, typePrice, identifyRoute, CODE,
} from './ux-b5-harness.test.mjs';

const amount = (app) => app.find('.pad-amount').textContent.replace(/\s+/g, '');
const lastIdentify = (app) => app.server.callsTo('/api/identify').at(-1);

async function openPad() {
  const app = await launchReturning();
  await pressScan(app);
  assert.equal(app.state, 'asking', `setup: the pad did not open (state=${app.state})`);
  assert.equal(amount(app), '$0.00', 'setup: the pad does not start at $0.00');
  return app;
}

/* ---------------------------------------------------------- the digits */

test('R-26: a lone 4 reads $0.04, and 49 reads $0.49 (pass: $0.04 then $0.49)', async () => {
  const app = await openPad();
  await app.key('4');
  assert.equal(amount(app), '$0.04', `one key press reads ${amount(app)}; cents come first`);
  await app.key('9');
  assert.equal(amount(app), '$0.49', `two key presses read ${amount(app)}`);
  app.stop();
});

test('R-26: 4 then 9 then 9 reads $4.99, and backspace takes it back to $0.49 (pass: $4.99 then $0.49)', async () => {
  const app = await openPad();
  for (const k of ['4', '9', '9']) await app.key(k);
  assert.equal(amount(app), '$4.99', `4 9 9 reads ${amount(app)}; the tag says $4.99`);
  await app.key('⌫');
  assert.equal(amount(app), '$0.49', `backspace reads ${amount(app)}`);
  await app.key('⌫');
  await app.key('⌫');
  assert.equal(amount(app), '$0.00', 'backspace past the first digit does not return to $0.00');
  await app.key('⌫');
  assert.equal(amount(app), '$0.00', 'backspace on an empty price changed it');
  app.stop();
});

test('R-26: there is no point key (pass: 0 point keys, 10 digit keys, 1 backspace)', async () => {
  const app = await openPad();
  assert.equal(app.all('[data-pad="."]').length, 0, 'the pad still has a decimal point key; with cents first it can only make a price wrong');
  for (const d of '0123456789') assert.equal(app.all(`[data-pad="${d}"]`).length, 1, `the digit ${d} is missing from the pad`);
  assert.equal(app.all('[data-pad="⌫"]').length, 1, 'the backspace key is missing');
  app.stop();
});

test('R-26: confirm sends 499 cents for 4 9 9, in 4 taps from the open pad (pass: shelfPriceCents 499, 4 taps)', async () => {
  const app = await openPad();
  const base = app.taps;
  await typePrice(app, ['4', '9', '9']);
  assert.equal(app.taps - base, 4, 'a $4.99 tag took other than 3 digits and a confirm');
  const sent = lastIdentify(app);
  assert.ok(sent, 'no price request went out');
  assert.equal(sent.query.shelfPriceCents, '499', `the server was told ${sent.query.shelfPriceCents} cents for a $4.99 tag`);
  assert.equal(app.atVerdict(), true, 'the verdict is not up after confirm');
  app.stop();
});

test('R-26: a $5.00 tag is 4 taps (5 0 0 confirm) and a $12.49 tag is 5 (1 2 4 9 confirm) (pass: 500 and 1249)', async () => {
  const five = await openPad();
  const b5 = five.taps;
  await typePrice(five, ['5', '0', '0']);
  assert.equal(five.taps - b5, 4, 'five dollars took other than 4 taps');
  assert.equal(lastIdentify(five).query.shelfPriceCents, '500', `$5.00 was sent as ${lastIdentify(five).query.shelfPriceCents} cents`);
  five.stop();
  const twelve = await openPad();
  const b12 = twelve.taps;
  await typePrice(twelve, ['1', '2', '4', '9']);
  assert.equal(twelve.taps - b12, 5, 'twelve forty-nine took other than 5 taps');
  assert.equal(lastIdentify(twelve).query.shelfPriceCents, '1249', `$12.49 was sent as ${lastIdentify(twelve).query.shelfPriceCents} cents`);
  twelve.stop();
});

/* ------------------------------------------------- what the pad must keep */

test('R-26 keeps: confirm is off at $0.00 and stays off after typing zeros (pass: disabled, disabled)', async () => {
  const app = await openPad();
  assert.ok(app.find('[data-act="pad-confirm"]').hasAttribute('disabled'), 'confirm is on with no price typed');
  await app.key('0');
  await app.key('0');
  assert.match(amount(app), /^\$0+\.00$/, `zeros read ${amount(app)}`);
  assert.ok(app.find('[data-act="pad-confirm"]').hasAttribute('disabled'), 'confirm is on at $0.00');
  assert.equal(app.server.callsTo('/api/identify').length, 0, 'a price request went out with no price');
  app.stop();
});

test('R-26 keeps: Skip is on the pad and goes out with no price at all (pass: 1 request, no shelfPriceCents)', async () => {
  const app = await openPad();
  await app.tap('[data-act="pad-skip"]', 'Skip');
  const sent = lastIdentify(app);
  assert.ok(sent, 'Skip sent nothing');
  assert.equal(sent.query.shelfPriceCents, undefined, 'Skip sent a price');
  app.stop();
});

test('R-26: 20% off shows the effective price under the typed one and sends it (pass: $3.99 after 20% off, 399)', async () => {
  const app = await openPad();
  for (const k of ['4', '9', '9']) await app.key(k);
  await app.tap('[data-modtoggle="percent"]', '% off');
  const label = app.find('[data-pad-effective]').textContent.replace(/\s+/g, ' ').trim();
  assert.match(label, /\$3\.99 after 20% off/, `a $4.99 tag at 20% off reads "${label}"`);
  await app.tap('[data-act="pad-confirm"]', 'pad confirm');
  assert.equal(lastIdentify(app).query.shelfPriceCents, '399', 'the sticker price was sent instead of the effective one');
  app.stop();
});

test('R-26: 3 for $4.99 shows the price each and sends it (pass: $1.66 each, 166)', async () => {
  const app = await openPad();
  for (const k of ['4', '9', '9']) await app.key(k);
  await app.tap('[data-modtoggle="nfor"]', 'N for');
  const label = app.find('[data-pad-effective]').textContent.replace(/\s+/g, ' ').trim();
  assert.match(label, /\$1\.66 each/, `3 for $4.99 reads "${label}"`);
  await app.tap('[data-act="pad-confirm"]', 'pad confirm');
  assert.equal(lastIdentify(app).query.shelfPriceCents, '166', 'the whole deal price was sent instead of the price each');
  app.stop();
});

/* ------------------------------------------------------ the x100 guard */

test('R-26: a $499.00 price (4 9 9 0 0) is asked back as "did you mean $4.99" and one tap takes it (pass: 49900 sent, 1 suggestion, $4.99 after 1 tap)', async () => {
  const app = await launchReturning({
    server: { '/api/identify': identifyRoute({ suspectOver: { atLeast: 20000, suggest: 499 } }) },
  });
  await pressScan(app);
  // Control: the right price raises no question.
  for (const k of ['4', '9', '9']) await app.key(k);
  await app.tap('[data-act="pad-confirm"]', 'pad confirm');
  assert.equal(app.atVerdict(), true, 'setup: $4.99 did not reach a verdict');
  assert.equal(lastIdentify(app).query.shelfPriceCents, '499', `the control price 4 9 9 was sent as ${lastIdentify(app).query.shelfPriceCents} cents, so the guard below cannot be told apart from a wrong pad`);
  assert.equal(app.all('[data-act="dist-suspect"]').length, 0, 'a normal price was asked back as "did you mean"');
  app.stop();

  const bad = await launchReturning({
    server: { '/api/identify': identifyRoute({ suspectOver: { atLeast: 20000, suggest: 499 } }) },
  });
  await pressScan(bad);
  for (const k of ['4', '9', '9', '0', '0']) await bad.key(k);
  assert.equal(amount(bad), '$499.00', `4 9 9 0 0 reads ${amount(bad)}`);
  await bad.tap('[data-act="pad-confirm"]', 'pad confirm');
  assert.equal(lastIdentify(bad).query.shelfPriceCents, '49900', `five digits sent ${lastIdentify(bad).query.shelfPriceCents} cents`);
  const ask = bad.find('[data-act="dist-suspect"]');
  assert.equal(ask.dataset.cents, '499');
  assert.match(ask.textContent, /4\.99/, 'the question does not name $4.99');
  const base = bad.taps;
  await bad.tap(ask, 'did you mean $4.99');
  assert.equal(bad.taps - base, 1);
  assert.match(bad.find('.sheet.dist').textContent, /4\.99/, 'the verdict does not show $4.99 after the suggestion was taken');
  bad.stop();
});

/* --------------------------------------------------------- fails loudly */

test('R-26 fails loudly: the pad throws on a key that is not one digit or backspace and leaves the price alone (pass: 4 of 4 refused, 11 of 11 real keys accepted)', async () => {
  const app = await openPad();
  // Positive controls first: every real key is accepted without a throw.
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫']) {
    await app.key(k);
    assert.deepEqual(app.takeErrors().map(String), [], `the real key ${k} raised an error`);
  }
  for (let i = 0; i < 14; i += 1) await app.key('⌫');
  assert.equal(amount(app), '$0.00', 'setup: could not clear the pad');
  await app.key('7');
  const before = amount(app);

  const refused = [];
  const accepted = [];
  for (const bad of ['x', '.', '12', '']) {
    app.root.querySelector('.keypad-bottom').insertAdjacentHTML('beforeend', `<button type="button" class="btn btn--key" data-bad="1" data-pad="${bad}">?</button>`);
    const inj = app.all('[data-bad="1"]').at(-1);
    let sync = null;
    try { await app.tap(inj, `injected pad key "${bad}"`); } catch (e) { sync = e; }
    const loud = sync ?? app.takeErrors()[0];
    app.takeErrors();
    if (loud) refused.push(bad); else accepted.push(bad);
    inj.remove();
    assert.equal(amount(app), before, `the pad took the key "${bad}" into the price: ${before} became ${amount(app)}`);
  }
  assert.deepEqual(accepted, [], `the pad silently accepted these keys: ${JSON.stringify(accepted)}; it must throw`);
  assert.equal(refused.length, 4);
  app.stop();
});
