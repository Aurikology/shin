/**
 * Items 7 and 8, 2026-09-17: the barcode vote.
 *
 * His words: the barcode is read "out of every single frame" but does "not
 * automatically pop up the results"; "The frames should act like a shift
 * register, the user might point it at a barcode and decide they want to point
 * it at another instead"; "Not all frames will agree ... set a bar where the
 * majority of frames agree"; the button shows "once multiple frames agree (this
 * should last 1-2 seconds)".
 *
 * Every case here is a pure walk of frames through `BarcodeVote` with an
 * explicit clock, so a hundred frames cost nothing and none of it needs a phone
 * or a camera. What CANNOT be checked here is that zxing decodes a real frame
 * and that the button appears on a real device; those are the phone's to prove.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BarcodeVote, type Sighting } from '../src/eye/votes.ts';

const box = (x: number) => ({ x, y: 100, width: 120, height: 40 });
const code = (value: string, x = 100): Sighting => ({ value, format: 'EAN13', box: box(x) });

/** Feed `n` frames at `stepMs` intervals from `t0`, each frame built by `frame(i)`. Returns the last time used. */
function feed(v: BarcodeVote, t0: number, n: number, frame: (i: number) => Sighting[], stepMs = 100): number {
  let t = t0;
  for (let i = 0; i < n; i += 1) {
    v.push(t, frame(i));
    t += stepMs;
  }
  return t - stepMs;
}

test('a code on every frame for over a second earns the button', () => {
  const v = new BarcodeVote();
  const last = feed(v, 0, 13, () => [code('111')]);
  const won = v.confirmed(last);
  assert.ok(won, 'a code seen on every frame for 1.2s never confirmed, so the button would never show');
  assert.equal(won.value, '111');
});

test('the button does not show before the window has run for about a second', () => {
  const v = new BarcodeVote();
  const last = feed(v, 0, 6, () => [code('111')]); // 500ms of perfect frames
  assert.equal(v.confirmed(last), null, 'confirmed after half a second: the 1 to 2 second hold is gone');
});

test('a code that decodes on most frames wins; empty frames count against it', () => {
  const v = new BarcodeVote();
  // 70 percent of frames decode it, the rest find nothing.
  const last = feed(v, 0, 15, (i) => (i % 10 < 7 ? [code('111')] : []));
  assert.ok(v.confirmed(last), 'a code on 70 percent of frames should be a majority');

  const flaky = new BarcodeVote();
  const lastFlaky = feed(flaky, 0, 15, (i) => (i % 10 < 3 ? [code('111')] : []));
  assert.equal(
    flaky.confirmed(lastFlaky),
    null,
    'a code on 30 percent of frames was confirmed: empty frames are not being counted as frames',
  );
});

test('exactly half is not a majority', () => {
  const v = new BarcodeVote();
  const last = feed(v, 0, 16, (i) => (i % 2 === 0 ? [code('111')] : []));
  assert.equal(v.confirmed(last), null);
});

test('pointing at another barcode moves the focus once it holds a majority', () => {
  const v = new BarcodeVote();
  let t = feed(v, 0, 15, () => [code('111')]);
  assert.equal(v.confirmed(t)?.value, '111');

  // The shopper swings to a different code. The old one is gone from every frame.
  t = feed(v, t + 100, 20, () => [code('222', 400)]);
  const won = v.confirmed(t);
  assert.ok(won, 'the window slid past the old code and nothing took over: the shift register is not shifting');
  assert.equal(won.value, '222', 'the focus stayed on the code that has left the frame');
  assert.equal(
    v.tracks(t).find((x) => x.value === '111'),
    undefined,
    'the departed code is still being drawn',
  );
});

test('while the old code is leaving, it does not keep the button', () => {
  const v = new BarcodeVote();
  let t = feed(v, 0, 15, () => [code('111')]);
  // Seven frames after the swing (past the linger), the new code has no
  // majority yet and the old one is out of view: nothing may be offered.
  t = feed(v, t + 100, 7, () => [code('222', 400)]);
  assert.equal(v.confirmed(t), null, 'the button is offered for a code that is no longer in view');
  assert.equal(v.focus(t)?.value, '222', 'the focus did not move to the code now in view');
});

test('every code in view is a track, and exactly one is focused', () => {
  const v = new BarcodeVote();
  const last = feed(v, 0, 15, (i) => [code('111', 100), code('222', 300), ...(i % 3 === 0 ? [code('333', 500)] : [])]);
  const tracks = v.tracks(last);
  assert.deepEqual(tracks.map((x) => x.value).sort(), ['111', '222', '333'], 'not every barcode in view is tracked');
  assert.equal(tracks.filter((x) => x.focused).length, 1, 'there must be exactly one focused code');
  assert.equal(tracks.filter((x) => x.confirmed).length <= 1, true);
  assert.equal(tracks[0].focused, true, 'the focused code is not first');
  for (const x of tracks) assert.ok(x.box, 'a track lost its box, so it could not be drawn');
});

test('two codes at equal share do not swap the focus frame to frame', () => {
  const v = new BarcodeVote();
  let t = feed(v, 0, 10, () => [code('111', 100), code('222', 300)]);
  const first = v.focus(t)?.value;
  const seen = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    t += 100;
    v.push(t, [code('111', 100), code('222', 300)]);
    seen.add(v.focus(t)!.value);
  }
  assert.equal(seen.size, 1, `the focus flipped between ${[...seen].join(' and ')} on a tie`);
  assert.equal([...seen][0], first);
});

test('a code that stops being seen stops being drawn after a moment', () => {
  const v = new BarcodeVote({ lingerMs: 500 });
  const last = feed(v, 0, 12, () => [code('111')]);
  assert.equal(v.tracks(last).length, 1);
  assert.equal(v.tracks(last + 800).length, 0, 'a code seen 800ms ago is still drawn');
});

test('reset forgets everything, so a stale winner cannot be pressed on the next visit', () => {
  const v = new BarcodeVote();
  const last = feed(v, 0, 15, () => [code('111')]);
  assert.ok(v.confirmed(last));
  v.reset();
  assert.equal(v.confirmed(last), null);
  assert.deepEqual(v.tracks(last), []);
});

test('the vote has no way to emit a result by itself', () => {
  // The whole of "results never pop up on their own": this class exposes state
  // to be READ. No callback, no event, nothing that pushes.
  const v = new BarcodeVote() as unknown as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(v))) {
    assert.doesNotMatch(name, /^(on|emit|fire|subscribe)/, `${name} looks like a push channel`);
  }
});
