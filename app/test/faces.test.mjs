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

test('thinking has three mouth dots for think-dots to animate', () => {
  const mouth = faceInner('deadpan', 'thinking').match(/<g class="face-mouth">([\s\S]*?)<\/g>/)[1];
  assert.equal((mouth.match(/<circle/g) ?? []).length, 3);
});

test('unknown is a slow blink, never a dashed or red refusal marker', () => {
  const svg = standaloneSvg('deadpan', 'unknown');
  assert.doesNotMatch(svg, /stroke-dasharray/);
  assert.doesNotMatch(svg, /#F0431F|#FF6A45|red/i);
});
