/**
 * The client's encoders, checked against the server's own predicates.
 *
 * D-094 is the reason this file exists. `geocell.js` wrote a cell in one format
 * and `app/src/stores.ts` read a different one, and BOTH SIDES WERE RIGHT ABOUT
 * THEMSELVES: each was internally consistent, each was separately covered, and
 * nothing in the suite ever ran one against the other. The failure was silent
 * for the worst possible reason -- a rejected value and an absent value were
 * the same shape, so a broken feature and a correctly-disabled one looked
 * identical from every angle anyone was looking from.
 *
 * The rule this file holds: WHERE THE CLIENT ENCODES AND THE SERVER PARSES,
 * something must run the two against each other. Not the client's belief about
 * the format, and not the server's -- the actual pair.
 *
 * The server's predicates are READ OUT OF ITS SOURCE rather than restated here,
 * for build standard 4's reason: a claim about a value is computed from the
 * declaration, never from prose near it. If a guard on the server changes shape,
 * these fail and tell you to come and look, instead of passing against a copy of
 * a rule that no longer exists.
 *
 * The cell seam itself lives in `shops.test.mjs` beside the rest of the shop
 * work; it is not duplicated here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parsePadPrice } from '../public/js/screens/camera.js';

const serverSrc = () =>
  readFileSync(fileURLToPath(new URL('../server.ts', import.meta.url)), 'utf8');

test('the server still guards a wire price with a typeof number check', () => {
  // If this fails the guard moved or changed shape. The next test's assumption
  // rests on it, so it is asserted rather than assumed.
  assert.match(
    serverSrc(),
    /typeof\s+c\.priceCents\s*===\s*'number'/,
    "the server no longer type-checks c.priceCents the way this file assumes; re-read the handler",
  );
});

test('a price off the pad is a number or null, never a string the server would drop', () => {
  // The server writes `typeof c.priceCents === 'number' ? Math.round(...) : NaN`
  // (and `: null` on the observation path). A string reaches neither branch it
  // wants: it becomes NaN or null SILENTLY, and a price that was typed and then
  // quietly discarded is worse than one that was refused out loud.
  const buffers = ['4.99', '0.05', '19', '1234.56', '0', '00.99', '9.999'];
  for (const buf of buffers) {
    const cents = parsePadPrice(buf);
    assert.equal(typeof cents, 'number', `"${buf}" did not produce a number`);
    assert.ok(Number.isFinite(cents), `"${buf}" produced a non-finite number`);
    assert.equal(cents, Math.round(cents), `"${buf}" produced a non-integer cent value`);
  }
});

test('a price the pad cannot read is null, not NaN and not a string', () => {
  // null is the honest "nothing typed". NaN would survive a typeof check as a
  // number and then poison the row it landed in, which is the failure mode that
  // is harder to see than an outright refusal.
  for (const buf of ['', null, undefined, 'abc', '.', '-']) {
    const cents = parsePadPrice(buf);
    assert.ok(
      cents === null || (typeof cents === 'number' && Number.isFinite(cents)),
      `${JSON.stringify(buf)} produced ${String(cents)}, which is neither null nor a finite number`,
    );
    assert.ok(!Number.isNaN(cents), `${JSON.stringify(buf)} produced NaN, which passes a typeof check`);
  }
});

test('the photo route is sent bare base64, with no data: prefix', () => {
  // `api.js`'s own comment: the route takes a bare base64 PNG, no `data:`
  // prefix (docs/the-photo-path.md section 3). Asserted against the client
  // source, because a prefix would be decoded as garbage rather than refused.
  const apiSrc = readFileSync(
    fileURLToPath(new URL('../public/js/api.js', import.meta.url)), 'utf8');
  assert.ok(
    !/image:\s*`?data:/.test(apiSrc),
    'the photo payload looks like it carries a data: prefix; the route expects bare base64',
  );
  assert.match(apiSrc, /btoa\(/, 'the base64 encoder is gone; re-check what the photo route now receives');
});
