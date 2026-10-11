/**
 * Jamin, 2026-10-10: "the flash system is broken on the app. Test it out yourself".
 *
 * These walk the REAL `Camera` (the eye's frame loop, its torch rules and its
 * hardware call) with a stubbed video track, a flat grey frame whose brightness
 * the test sets, and a clock the test moves, so a dark aisle, a phone with no
 * torch and an app sent to the background each take a millisecond.
 *
 * The stub follows the spec where it matters: `applyConstraints({advanced:[{torch}]})`
 * RESOLVES on a phone with no torch (an unsatisfiable `advanced` constraint is
 * skipped, never rejected), and answers a tenth of a second later, not at once.
 *
 * NOT verified here, and only a real phone can: that a phone's torch lights, that
 * iOS exposes a torch to the web view at all, and what the OS does to the torch
 * when the app is backgrounded.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Camera } from '../src/eye/camera.ts';

const W = 320;
const H = 240;
const APPLY_MS = 100;
const FRAME_MS = 16;

interface Rig {
  camera: Camera;
  track: FakeTrack;
  /** Runs n frames of the loop, moving the clock. */
  frames(n: number): Promise<void>;
  setBrightness(luma: number): void;
  torchEvents: boolean[];
  coach: (string | null)[];
  doc: FakeDocument;
  done(): void;
}

class FakeTrack extends EventTarget {
  muted = false;
  readyState = 'live';
  /** What the LED is really doing. */
  lit = false;
  /** Every torch constraint the page asked for, in order. */
  torchCalls: boolean[] = [];
  readonly rig: { now(): number; pending: { due: number; run(): void }[] };
  readonly hasTorch: boolean;
  readonly refuses: boolean;
  constructor(rigState: { now(): number; pending: { due: number; run(): void }[] }, hasTorch: boolean, refuses: boolean) {
    super();
    this.rig = rigState;
    this.hasTorch = hasTorch;
    this.refuses = refuses;
  }
  getCapabilities() {
    return this.hasTorch ? { torch: true } : {};
  }
  applyConstraints(c: { advanced?: Record<string, unknown>[] }): Promise<void> {
    const adv = c.advanced?.[0] ?? {};
    if (!('torch' in adv)) return Promise.resolve();
    const want = Boolean(adv.torch);
    this.torchCalls.push(want);
    return new Promise((resolve, reject) => {
      this.rig.pending.push({
        due: this.rig.now() + APPLY_MS,
        run: () => {
          if (this.refuses) return reject(new DOMException('refused', 'OverconstrainedError'));
          // The spec: no torch means the advanced constraint is skipped, and the promise resolves.
          if (this.hasTorch) this.lit = want;
          resolve();
        },
      });
    });
  }
  stop() {
    this.readyState = 'ended';
    this.lit = false;
  }
}

class FakeDocument extends EventTarget {
  hidden = false;
}

async function flush() {
  await new Promise((r) => setImmediate(r));
}

async function rig(
  opts: { hasTorch?: boolean; refuses?: boolean; mode?: 'auto' | 'off'; luma?: number; boxLuma?: number } = {},
): Promise<Rig> {
  let T = 1_000_000;
  let luma = opts.luma ?? 200;
  const queue: (() => void)[] = [];
  const pending: { due: number; run(): void }[] = [];
  const saved = {
    raf: (globalThis as any).requestAnimationFrame,
    oc: (globalThis as any).OffscreenCanvas,
    id: (globalThis as any).ImageData,
    doc: (globalThis as any).document,
    nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  };
  mock.method(Date, 'now', () => T);
  mock.method(performance, 'now', () => T);
  (globalThis as any).requestAnimationFrame = (cb: () => void) => queue.push(cb);
  (globalThis as any).ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
  (globalThis as any).OffscreenCanvas = class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      const { width, height } = this;
      return {
        drawImage() {},
        getImageData() {
          const data = new Uint8ClampedArray(width * height * 4);
          const box = opts.boxLuma ?? luma;
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const inBox = x > width * 0.25 && x < width * 0.75 && y > height * 0.25 && y < height * 0.75;
              const v = inBox ? box : luma;
              const p = (y * width + x) * 4;
              data[p] = data[p + 1] = data[p + 2] = v;
              data[p + 3] = 255;
            }
          }
          return { data, width, height };
        },
      };
    }
  };
  const doc = new FakeDocument();
  (globalThis as any).document = doc;

  const state = { now: () => T, pending };
  const track = new FakeTrack(state, opts.hasTorch ?? true, opts.refuses ?? false);
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: async () => stream } },
    configurable: true,
  });

  const torchEvents: boolean[] = [];
  const coach: (string | null)[] = [];
  const video = { srcObject: null, videoWidth: W, videoHeight: H, play: async () => {} } as unknown as HTMLVideoElement;
  const noop = () => {};
  const camera = new Camera({
    video,
    barcodeMode: false,
    autoCapture: false,
    autoZoom: false,
    torch: { mode: opts.mode ?? 'auto', threshold: 52 },
    events: {
      onBarcode: noop,
      onBoxes: noop,
      onCapture: noop,
      onTorch: (on: boolean) => torchEvents.push(on),
      onCoach: (key: string | null) => coach.push(key),
    },
  } as never);
  await camera.start();

  return {
    camera,
    track,
    torchEvents,
    coach,
    doc,
    setBrightness: (v) => { luma = v; },
    async frames(n) {
      for (let i = 0; i < n; i += 1) {
        T += FRAME_MS;
        for (const p of pending.splice(0).filter((q) => {
          if (q.due <= T) return true;
          pending.push(q);
          return false;
        })) p.run();
        const cbs = queue.splice(0);
        for (const cb of cbs) cb();
        await flush();
      }
    },
    done() {
      camera.stop();
      mock.restoreAll();
      (globalThis as any).requestAnimationFrame = saved.raf;
      (globalThis as any).OffscreenCanvas = saved.oc;
      (globalThis as any).ImageData = saved.id;
      (globalThis as any).document = saved.doc;
      if (saved.nav) Object.defineProperty(globalThis, 'navigator', saved.nav);
    },
  };
}

const seconds = (s: number) => Math.round((s * 1000) / FRAME_MS);

test('a phone with no torch: tapping the torch button says no and the icon stays unlit', async () => {
  const r = await rig({ hasTorch: false, mode: 'off' });
  try {
    await r.frames(2);
    const p = r.camera.setTorch(true);
    await r.frames(20);
    assert.equal(await p, false, 'the button reported success on a phone that has no torch');
    assert.deepEqual(r.torchEvents, [], 'the screen was told the torch is on, with no torch there');
  } finally {
    r.done();
  }
});

test('auto mode on a phone with no torch never claims the torch is on, and says it is too dark instead', async () => {
  const r = await rig({ hasTorch: false, mode: 'auto', luma: 15 });
  try {
    await r.frames(seconds(3));
    assert.deepEqual(r.torchEvents, [], 'auto mode said the torch was on, with no torch on the phone');
    assert.ok(r.coach.includes('dark'), 'auto mode on a phone with no torch gave the shopper nothing at all');
  } finally {
    r.done();
  }
});

test('a phone that refuses the torch is asked once, not on every frame', async () => {
  const r = await rig({ hasTorch: true, refuses: true, mode: 'auto', luma: 15 });
  try {
    await r.frames(seconds(3));
    assert.ok(r.track.torchCalls.length <= 1, `the torch was requested ${r.track.torchCalls.length} times in three seconds`);
  } finally {
    r.done();
  }
});

test('auto mode in a dark aisle switches the torch on exactly once', async () => {
  const r = await rig({ mode: 'auto', luma: 15 });
  try {
    await r.frames(seconds(3));
    assert.deepEqual(r.track.torchCalls, [true], `the hardware was asked ${r.track.torchCalls.length} times`);
    assert.equal(r.track.lit, true);
    assert.deepEqual(r.torchEvents, [true]);
  } finally {
    r.done();
  }
});

test('auto mode puts the torch out when the aisle is clearly bright again (still works)', async () => {
  const r = await rig({ mode: 'auto', luma: 15 });
  try {
    await r.frames(seconds(2));
    assert.equal(r.track.lit, true);
    r.setBrightness(150);
    await r.frames(seconds(2));
    assert.equal(r.track.lit, false, 'the torch stayed lit in a bright aisle');
    assert.equal(r.torchEvents.at(-1), false, 'the screen was never told the torch went out');
  } finally {
    r.done();
  }
});

test('the shopper turns the torch on in a lit aisle and it stays on', async () => {
  const r = await rig({ mode: 'auto', luma: 200 });
  try {
    await r.frames(5);
    assert.equal(await Promise.all([r.camera.setTorch(true), r.frames(10)]).then(([ok]) => ok), true);
    await r.frames(seconds(2));
    assert.equal(r.track.lit, true, 'the app switched off the torch the shopper had just turned on');
  } finally {
    r.done();
  }
});

test('the shopper turns the torch off in the dark and the app leaves it off', async () => {
  const r = await rig({ mode: 'auto', luma: 15 });
  try {
    await r.frames(seconds(2));
    assert.equal(r.track.lit, true, 'precondition: auto mode lit the torch');
    await Promise.all([r.camera.setTorch(false), r.frames(10)]);
    await r.frames(seconds(3));
    assert.equal(r.track.lit, false, 'auto mode switched the torch back on after the shopper turned it off');
  } finally {
    r.done();
  }
});

test('glare does not put out a torch the shopper lit themselves', async () => {
  // A blown white box in the middle of the frame: the rule that protects a
  // label from the app's own torch must not overrule the shopper's own tap.
  const r = await rig({ mode: 'off', luma: 120, boxLuma: 255 });
  try {
    await r.frames(5);
    await Promise.all([r.camera.setTorch(true), r.frames(10)]);
    await r.frames(seconds(2));
    assert.equal(r.track.lit, true, 'the torch the shopper tapped on went out by itself');
  } finally {
    r.done();
  }
});

test('changing the setting to off puts out a torch that auto mode lit', async () => {
  const r = await rig({ mode: 'auto', luma: 15 });
  try {
    await r.frames(seconds(2));
    assert.equal(r.track.lit, true, 'precondition: auto mode lit the torch');
    r.camera.setTorchSetting({ mode: 'off', threshold: 52 });
    await r.frames(seconds(1));
    assert.equal(r.track.lit, false, 'the torch stayed on after the setting was switched to off');
  } finally {
    r.done();
  }
});

test('the app comes back from the background and the torch comes back with it', async () => {
  const r = await rig({ mode: 'off', luma: 120 });
  try {
    await Promise.all([r.camera.setTorch(true), r.frames(10)]);
    assert.equal(r.track.lit, true);
    // What a phone does: the capture session is taken away, the LED goes dark.
    r.doc.hidden = true;
    r.doc.dispatchEvent(new Event('visibilitychange'));
    r.track.lit = false;
    r.track.muted = true;
    r.track.dispatchEvent(new Event('mute'));
    await r.frames(5);
    r.doc.hidden = false;
    r.track.muted = false;
    r.track.dispatchEvent(new Event('unmute'));
    r.doc.dispatchEvent(new Event('visibilitychange'));
    await r.frames(10);
    assert.equal(r.track.lit, true, 'the icon says torch on and the light is dark after coming back');
  } finally {
    r.done();
  }
});

test('the camera track ends while the torch is on: the screen is told it is off', async () => {
  const r = await rig({ mode: 'off', luma: 120 });
  try {
    await Promise.all([r.camera.setTorch(true), r.frames(10)]);
    assert.deepEqual(r.torchEvents, [true]);
    r.track.lit = false;
    r.track.readyState = 'ended';
    r.track.dispatchEvent(new Event('ended'));
    await r.frames(2);
    assert.equal(r.torchEvents.at(-1), false, 'the icon stayed lit over a dead camera');
  } finally {
    r.done();
  }
});

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

test('the screen says so when the phone has no torch, in all three voices and both languages', () => {
  for (const file of ['../public/js/voice.js', '../public/js/voice-fr.js']) {
    const text = src(file);
    const at = text.indexOf('cam_torch_none');
    assert.notEqual(at, -1, `${file} has no line for a tap on a phone with no torch`);
    const block = text.slice(at, at + 600);
    for (const voice of ['deadpan', 'warm', 'blunt']) assert.ok(block.includes(`${voice}:`), `${file}: no ${voice} version`);
  }
});

test('the plain camera (no eye) and a tap before the camera starts both reach the hardware', () => {
  const camera = src('../public/js/screens/camera.js');
  const req = camera.slice(camera.indexOf('function requestTorch'), camera.indexOf('function endMisreadWait'));
  assert.ok(req.includes('applyPlainTorch'), 'with the eye off, the torch button still never touches the camera');
  assert.ok(req.includes('wantTorchOnStart'), 'a tap before the camera starts leaves the icon lit over an unlit LED');
  const mount = camera.slice(camera.indexOf('attachEye(video, {'));
  assert.ok(mount.includes('wantTorchOnStart(() => e.setTorch(true))'), 'the early tap is dropped when the eye comes up');
});
