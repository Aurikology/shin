/**
 * Item 11, 2026-09-17: the torch is a setting with two modes.
 *
 * His words: "set the torch to automatically turn on at a certain brightness
 * level (we can give a slider and the slide starts at our default brightness
 * level). Or, they can have it not automatically turn on which in that case, we
 * will give prompts on screen for when its too dark to see an item".
 *
 * The decision is pure, so both modes are walked here through a dark aisle with
 * an explicit clock. The slider, the storage and the camera wiring are pinned
 * against their sources. NOT verified here: that a real phone's torch responds,
 * or what luminance a real aisle reads; both need a phone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  decideTorch,
  normaliseTorchSetting,
  DEFAULT_TORCH_THRESHOLD,
  DARK_HOLD_MS,
  TORCH_THRESHOLD_MIN,
  TORCH_THRESHOLD_MAX,
} from '../src/eye/torch.ts';
import { chooseCoach } from '../src/eye/framing.ts';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const AUTO = { mode: 'auto' as const, threshold: 60 };
const OFF = { mode: 'off' as const, threshold: 60 };
const dark = { mean: 30, torchOn: false, blocked: false };

/** Walks a dark scene from t=0 and reports what the decision said at each step. */
function walk(setting: typeof AUTO | typeof OFF, over: Partial<typeof dark> = {}) {
  let darkSince: number | null = null;
  const seen: { at: number; action: string | null; tooDark: boolean }[] = [];
  for (let at = 0; at <= 2000; at += 100) {
    const d = decideTorch({ setting, now: at, darkSince, ...dark, ...over });
    darkSince = d.darkSince;
    seen.push({ at, action: d.action, tooDark: d.tooDark });
  }
  return seen;
}

test('auto: the torch comes on once it has stayed dark, not on the first dark frame', () => {
  const seen = walk(AUTO);
  assert.equal(seen[0].action, null, 'the torch flashed on for a passing shadow');
  const first = seen.find((s) => s.action === 'on');
  assert.ok(first, 'auto mode never turned the torch on in a dark aisle');
  assert.ok(first.at >= DARK_HOLD_MS);
  assert.ok(seen.every((s) => !s.tooDark), 'auto mode also shows the too-dark prompt');
});

test('off: the torch is never switched on, and the too-dark prompt appears instead', () => {
  const seen = walk(OFF);
  assert.ok(seen.every((s) => s.action === null), 'off mode touched the torch');
  assert.equal(seen[0].tooDark, false, 'the prompt fired on the first dark frame');
  assert.ok(seen.some((s) => s.tooDark), 'off mode never told the user it was too dark');
});

test('the too-dark prompt is ONLY for off mode', () => {
  for (const over of [{ mean: 5 }, { torchOn: true }, { blocked: true }]) {
    assert.ok(walk(AUTO, over).every((s) => !s.tooDark), 'auto mode produced a too-dark prompt');
  }
});

test('a bright frame clears the prompt and the dark clock', () => {
  const d = decideTorch({ setting: OFF, now: 5000, darkSince: 100, mean: 200, torchOn: false, blocked: false });
  assert.equal(d.tooDark, false);
  assert.equal(d.darkSince, null);
});

test("the threshold is the user's: the same frame is dark under one setting and fine under another", () => {
  const at = (threshold: number) =>
    decideTorch({ setting: { mode: 'auto', threshold }, now: 2000, darkSince: 0, mean: 70, torchOn: false, blocked: false });
  assert.equal(at(90).action, 'on');
  assert.equal(at(40).action, null);
});

test('auto: it goes back out only once the aisle is clearly bright, with a margin', () => {
  const on = (mean: number) =>
    decideTorch({ setting: AUTO, now: 3000, darkSince: null, mean, torchOn: true, blocked: false }).action;
  assert.equal(on(65), null, 'the torch switched itself off just over the line and will flicker');
  assert.equal(on(60 * 1.7), 'off');
});

test('a torch the glare check blocked stays off in auto mode', () => {
  assert.ok(walk(AUTO, { blocked: true }).every((s) => s.action === null));
});

test('off mode leaves a torch the user lit alone, even in a bright frame', () => {
  const d = decideTorch({ setting: OFF, now: 3000, darkSince: null, mean: 250, torchOn: true, blocked: false });
  assert.equal(d.action, null);
});

test("the default is Shin's current threshold and storage is made safe", () => {
  assert.equal(DEFAULT_TORCH_THRESHOLD, 52, 'the default moved from the level the camera has always used');
  assert.deepEqual(normaliseTorchSetting(undefined), { mode: 'auto', threshold: DEFAULT_TORCH_THRESHOLD });
  assert.deepEqual(normaliseTorchSetting({ mode: 'sideways', threshold: 'x' }), { mode: 'auto', threshold: DEFAULT_TORCH_THRESHOLD });
  assert.equal(normaliseTorchSetting({ mode: 'off', threshold: 9999 }).threshold, TORCH_THRESHOLD_MAX);
  assert.equal(normaliseTorchSetting({ mode: 'auto', threshold: -4 }).threshold, TORCH_THRESHOLD_MIN);
  assert.equal(normaliseTorchSetting({ mode: 'off' }).mode, 'off');
});

test('the dark line reaches the coach and outranks everything else', () => {
  const base = { cropWidth: 800, glare: 0.5, choices: 3, codeFrames: 2, canZoom: false };
  assert.equal(chooseCoach({ ...base, tooDark: true }), 'dark');
  assert.notEqual(chooseCoach({ ...base }), 'dark');
});

/* ------------------------------------------- the slider, storage, wiring */

test("the slider starts where Shin's default is, and the two copies of the range agree", () => {
  const store = src('../public/js/store.js');
  const torch = src('../src/eye/torch.ts');
  const num = (text: string, name: string) => Number(new RegExp(`${name} = (\\d+)`).exec(text)?.[1]);
  const range = /TORCH_RANGE = \{ min: (\d+), max: (\d+), start: (\d+) \}/.exec(store);
  assert.ok(range, 'store.js has no TORCH_RANGE');
  assert.equal(Number(range[1]), num(torch, 'TORCH_THRESHOLD_MIN'));
  assert.equal(Number(range[2]), num(torch, 'TORCH_THRESHOLD_MAX'));
  assert.equal(Number(range[3]), num(torch, 'DEFAULT_TORCH_THRESHOLD'), "the slider does not start at Shin's default");
  assert.match(store, /torchMode: 'auto',\n\s*torchThreshold: 52,/, "the stored default is not auto at Shin's level");
});

test('the You screen has both modes and a slider, and stores what they change', () => {
  const you = src('../public/js/screens/you.js');
  assert.ok(you.includes('data-torch="${m}"'), 'no torch mode control');
  assert.ok(you.includes("['auto', 'off']"), 'the two modes are not both offered');
  assert.ok(you.includes('type="range" id="you-torch-level"'), 'no brightness slider');
  assert.ok(you.includes('store.update({ torchThreshold: n })'), 'the slider does not store its value');
  assert.ok(you.includes('store.update({ torchMode: mode })'), 'the mode is not stored');
  assert.ok(
    you.includes("data-torch-slider${torchMode === 'auto' ? '' : ' hidden'}"),
    'the slider shows in off mode, where it means nothing',
  );
});

test('the camera passes the stored setting to the eye, which decides through torch.ts', () => {
  const screen = src('../public/js/screens/camera.js');
  assert.ok(
    screen.includes('torch: { mode: store.get().torchMode, threshold: store.get().torchThreshold }'),
    'the camera screen does not hand the stored torch setting to the eye',
  );
  const eye = src('../src/eye/camera.ts');
  assert.ok(eye.includes('decideTorch({'), 'the eye no longer decides the torch through torch.ts');
  assert.ok(!eye.includes('DARK_THRESHOLD'), 'the old hard-coded threshold is back in the eye');
  assert.ok(eye.includes('tooDark: this.#tooDark'), 'the too-dark state never reaches the coach');
});
