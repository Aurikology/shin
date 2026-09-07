/**
 * The face set against its contract, docs/design/AVATAR.md section 6:
 * thirteen named states, one 88 by 88 viewBox, xmlns on every file, the
 * outline colour settable at render time, flat vector with no gradients or
 * filters. Also that the files on disk are what the module draws, so the
 * deliverable and the running app cannot drift apart.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Compare content, not line endings. Git hands these files back with CRLF on a
 * Windows checkout while the module always emits LF, and that difference is not
 * a stale face.
 */
const lf = (s) => s.replace(/\r\n/g, '\n');

import { fileURLToPath } from 'node:url';
import { FACE_SETS, FACE_STATES, standaloneSvg, faceInner, INK_DEFAULT } from '../public/js/face-art.js';
import { contractProblems } from '../scripts/build-faces.mjs';

const CONTRACT = [
  'idle', 'thinking', 'asking', 'good', 'delighted', 'fair', 'walk', 'angry',
  'unknown', 'pleased', 'nudging', 'asleep', 'proud',
];

test('tokens.css --face-ink matches the module INK_DEFAULT', () => {
  const css = lf(readFileSync(fileURLToPath(new URL('../public/css/tokens.css', import.meta.url)), 'utf8'));
  const m = /--face-ink:\s*(#[0-9a-fA-F]{3,8})/.exec(css);
  assert.ok(m, 'tokens.css no longer defines --face-ink');
  assert.equal(
    m[1].toUpperCase(), INK_DEFAULT.toUpperCase(),
    "the CSS copy of Shin's outline colour has drifted from face-art.js",
  );
});

test('the thirteen states are exactly the contract list', () => {
  assert.deepEqual([...FACE_STATES].sort(), [...CONTRACT].sort());
});

for (const who of Object.keys(FACE_SETS)) {
  for (const state of CONTRACT) {
    test(`${who}/${state} honours the file contract`, () => {
      const svg = standaloneSvg(who, state);
      assert.deepEqual(contractProblems(svg), []);
    });

    test(`${who}/${state} carries the groups the app morphs and animates`, () => {
      const inner = faceInner(who, state);
      for (const cls of ['face-disc', 'face-body', 'face-head', 'face-hat', 'face-brows', 'face-eyes', 'face-mouth', 'face-extras', 'face-ring']) {
        assert.match(inner, new RegExp(`class="${cls}"`), `missing .${cls}`);
      }
    });

    test(`${who}/${state}.svg on disk matches the module`, () => {
      const file = fileURLToPath(new URL(`../public/faces/${who}/${state}.svg`, import.meta.url));
      assert.ok(existsSync(file), `${file} missing; run npm run faces`);
      assert.equal(lf(readFileSync(file, 'utf8')), lf(standaloneSvg(who, state)), 'stale; run npm run faces');
    });
  }
}

test('the three personalities of the contract all exist as face sets', () => {
  // voice.js ships lines for deadpan, warm and blunt, and `faceParts` falls
  // back to DEADPAN for anything it does not know. A missing set is therefore
  // silent: the picker renders three identical faces beside three different
  // voices, which is the one thing that screen exists not to do.
  assert.deepEqual(Object.keys(FACE_SETS).sort(), ['blunt', 'deadpan', 'warm']);
});

for (const who of Object.keys(FACE_SETS)) {
  test(`${who} defines all thirteen states itself, with no fallback`, () => {
    assert.deepEqual(Object.keys(FACE_SETS[who]).sort(), [...CONTRACT].sort());
  });
}

test('the three personalities are actually drawn differently, state by state', () => {
  // The regression this guards is a silent revert: delete a set, or let a state
  // fall through to DEADPAN, and everything above still passes while the
  // attitude picker goes back to showing one face three times. Byte identity is
  // the right test because these are generated strings - two sets that agree on
  // every part produce the same bytes, and any real difference in brow, eye,
  // mouth, pose or lift produces different ones.
  const sets = Object.keys(FACE_SETS);
  for (const state of CONTRACT) {
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        assert.notEqual(
          faceInner(sets[i], state), faceInner(sets[j], state),
          `${sets[i]} and ${sets[j]} draw an identical ${state}`,
        );
      }
    }
  }
});

test('every set differs from the others in the eyes, not only in the mouth', () => {
  // A set could pass the test above on mouths alone, and the mouth is the one
  // feature a 28px row face renders in about two pixels. The eyes are the
  // largest feature and the one that has to carry the distinction at row size,
  // so each pair must differ there too, in every one of the thirteen.
  //
  // This asked for ten of thirteen until 2026-09-07. The three that were
  // allowed to match were pleased, asleep and proud, which draw a closed eye,
  // and closedEye was one shared function with no personality argument. Now
  // that each treatment has its own closed eye, the exemption is spent, and
  // the number is the point: it is the standing evidence that a redraw
  // differentiated the three sets rather than quietly converging them.
  const group = (who, state) => faceInner(who, state).match(/<g class="face-eyes">([\s\S]*?)<\/g>/)[1];
  const sets = Object.keys(FACE_SETS);
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const differing = CONTRACT.filter((s) => group(sets[i], s) !== group(sets[j], s));
      assert.ok(
        differing.length === CONTRACT.length,
        `${sets[i]} and ${sets[j]} draw the same eyes in ${CONTRACT.length - differing.length} of ${CONTRACT.length} states`,
      );
    }
  }
});

for (const who of Object.keys(FACE_SETS)) {
  test(`${who}/thinking has three mouth dots for think-dots to animate`, () => {
    const mouth = faceInner(who, 'thinking').match(/<g class="face-mouth">([\s\S]*?)<\/g>/)[1];
    assert.equal((mouth.match(/<circle/g) ?? []).length, 3);
  });

  test(`${who}/unknown is a slow blink, never a dashed or red refusal marker`, () => {
    const svg = standaloneSvg(who, 'unknown');
    assert.doesNotMatch(svg, /stroke-dasharray/);
    assert.doesNotMatch(svg, /#F0431F|#FF6A45|red/i);
  });
}
