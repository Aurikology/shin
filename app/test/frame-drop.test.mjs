/**
 * Item 16, 2026-09-19: an explicit busy flag drops frames arriving while a
 * capture is in flight, made observable with a counter, instead of the drop
 * only being true by accident of how `#loop`/`#tick` chain their promises.
 *
 * His build order's own "why": camera.ts's loop already cannot run two ticks
 * at once, because `#loop()` only schedules the next `requestAnimationFrame`
 * inside `.finally()` after `#tick()` has fully resolved (camera.md A16.5).
 * What was NOT explicit is the one real overlap: the manual shutter
 * (`capture()`) is called from outside that chain entirely, so a tick already
 * in flight when the shutter fires still runs its own decode/detect work for
 * nothing. This item names that drop and counts it, and does NOT touch
 * `barcode.ts`'s `DECODE_CEILING_MS`/`WEDGE_STRIKES` race, which is a
 * different job: recovering a wedged WebAssembly module (D-128), not
 * de-duplicating in-flight frames.
 *
 * Camera itself needs a real getUserMedia/video element to run, so this is
 * pinned as source text, the convention `barcode-button.test.mjs` and
 * `back-to-camera.test.mjs` use for the same class.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

/** A slice between two literal markers that FAILS LOUDLY rather than running away. */
function between(text, from, to, what) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${what}: the opening marker ${JSON.stringify(from)} is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${what}: the closing marker ${JSON.stringify(to)} is gone`);
  const slice = text.slice(a, b);
  assert.ok(slice.length < text.length / 2, `${what}: the slice swept past its end`);
  return slice;
}

const EYE = read('../src/eye/camera.ts');
const BARCODE = read('../src/eye/barcode.ts');

test('there is an explicit busy flag, not just the old private capturing field', () => {
  assert.ok(EYE.includes('#busy'), 'no #busy field: the drop is still only implicit in the promise chain');
  assert.ok(EYE.includes('get busy()'), 'the busy state cannot be read from outside the class');
});

test('a tick dropped while busy is counted, and the count can be read', () => {
  const tick = between(EYE, 'async #tick()', '/** The pick, if the detectors', '#tick()');
  assert.ok(/if \(this\.#busy\) \{[\s\S]*?#framesDropped[\s\S]*?return;/.test(tick), 'a busy tick is not counted before it returns');
  assert.ok(EYE.includes('get framesDropped()'), 'the dropped-frame count cannot be read from outside the class');
});

test('the tick body other tests pin is otherwise untouched: the decode still happens with no press needed', () => {
  const tick = between(EYE, 'async #tick()', '/** The pick, if the detectors', '#tick()');
  assert.ok(tick.includes('this.#scanner.read(frame)'), 'the tick no longer decodes frames into the vote');
  assert.ok(tick.includes('this.#vote.push('), 'decoded frames no longer reach the vote');
  assert.ok(
    /if \(this\.#decoding\) \{\n\s*const seen = await this\.#scanner\.read\(frame\);/.test(tick),
    'the decode gate regex other tests pin no longer matches',
  );
});

test("barcode.ts's dead-module recovery race is untouched: it is a different job", () => {
  assert.ok(BARCODE.includes('DECODE_CEILING_MS'), 'the per-decode ceiling was removed');
  assert.ok(BARCODE.includes('WEDGE_STRIKES'), 'the wedge-strike counter was removed');
  assert.ok(BARCODE.includes('Promise.race'), 'the race against the ceiling was removed');
});
