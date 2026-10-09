/**
 * UX build 3: camera permission persistence. Block R-11 of
 * docs/design/ux-evidence-2026-10-09.md (section 13, build 3).
 *
 * R-11 pass number: zero repeat camera prompts across 5 relaunches and 5 trips
 * from the camera to Saved and back; the viewfinder must not be torn down and
 * re-asked on a page change.
 *
 * THE CONTRACT THESE TESTS PIN (the build meets it, or edits this file in the
 * same commit and says why). One new module owns the camera stream:
 *   public/js/camera-session.js exports
 *     cameraPermission(nav?)   resolves 'granted' | 'denied' | 'prompt' |
 *                              'unsupported' ('unsupported' = the browser
 *                              cannot answer; an explicit value, never a
 *                              guess). Any other state string THROWS (rejects).
 *     acquire({nav?})          resolves { stream, reused }. Calls
 *                              getUserMedia only when no live stream is held;
 *                              otherwise re-enables and returns the held one
 *                              (reused: true). A refusal REJECTS with the
 *                              browser's own error (NotAllowedError), it is not
 *                              turned into a falsy value. A successful grant
 *                              is remembered in localStorage (shin.camera.granted).
 *     suspend()                the camera page was left: tracks are disabled,
 *                              not stopped, the stream is kept.
 *     release()                stops every track and forgets the stream.
 *   If the grant was remembered but the browser's permission state is
 *   'prompt' again (a relaunch that lost the decision), acquire reports it
 *   through the app's error path, track('camera_prompt_repeat', ...), before
 *   it asks. That is how a repeating prompt becomes a number instead of a
 *   rumour.
 *   Nothing outside camera-session.js and permissions-panel.js (the one-time
 *   priming ask, which stops its stream at once) calls getUserMedia: not
 *   screens/camera.js, not the eye (src/eye/camera.ts and its built bundle
 *   public/js/eye.js).
 *
 * EXPECTED RESULT BEFORE THE BUILD LANDS
 *   GREEN (KEEP, 2): the priming ask classifies granted / denied / unavailable
 *   and stops its stream; the camera screen still tells a denial from a
 *   missing camera (test/camera-permission.test.mjs holds that in depth).
 *   RED (unbuilt, 8): every other test; first failure reads "public/js/
 *   camera-session.js does not exist" or "getUserMedia is called outside ...".
 *   Run against a throwaway reference camera-session.js in a scratch folder,
 *   all 10 passed.
 *
 * NOT AUTOMATABLE, so not tested: whether a real iPhone's installed web app
 * actually re-prompts (R-11 rests on a single snippet source and the spec says
 * test first on a device, build the fix only if a prompt repeats). These tests
 * pin what the app does so the device trial can be read: they cannot decide
 * whether WebKit persists the decision.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(here(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const panel = await import('../public/js/permissions-panel.js');
await import('../public/js/track.js');

const SESSION_URL = '../public/js/camera-session.js';
const sessionExists = existsSync(here(SESSION_URL));
let launches = 0;
/** A fresh module instance is a fresh launch: module state is gone, localStorage is not. */
async function relaunch() {
  assert.ok(sessionExists, 'R-11 not built: public/js/camera-session.js does not exist');
  launches += 1;
  return import(`${SESSION_URL}?launch=${launches}`);
}

/** A phone. `persist` false models an installed web app that forgets the decision on relaunch. */
function makePhone({ persist = true, state = 'prompt' } = {}) {
  const phone = { state, prompts: 0, asks: 0, streams: [] };
  const makeStream = () => {
    const tracks = [{ enabled: true, readyState: 'live', stop() { this.readyState = 'ended'; } }];
    const s = { getTracks: () => tracks, getVideoTracks: () => tracks, tracks };
    phone.streams.push(s);
    return s;
  };
  phone.nav = {
    permissions: { query: async () => ({ state: phone.state }) },
    mediaDevices: {
      getUserMedia: async () => {
        phone.asks += 1;
        if (phone.state === 'denied') throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
        if (phone.state === 'prompt') { phone.prompts += 1; phone.state = 'granted'; }
        return makeStream();
      },
    },
  };
  phone.relaunch = () => { for (const s of phone.streams) for (const t of s.tracks) t.readyState = 'ended'; if (!persist) phone.state = 'prompt'; };
  return phone;
}

const queued = (type) => JSON.parse(storage.getItem('shin.track.queue') || '[]').filter((e) => e.type === type);

/* ---------------------------------------------------------------- tests */

test('R-11: five trips from the camera to Saved and back ask the phone for the camera once', async () => {
  storage.clear();
  const { acquire, suspend } = await relaunch();
  const phone = makePhone();
  const first = await acquire({ nav: phone.nav });
  assert.equal(first.reused, false);
  for (let trip = 1; trip <= 5; trip += 1) {
    suspend(); // the camera page is left for Saved
    const back = await acquire({ nav: phone.nav }); // and returned to
    assert.equal(back.reused, true, `trip ${trip}: the viewfinder was torn down and re-asked`);
    assert.equal(back.stream, first.stream, `trip ${trip}: a different stream came back`);
  }
  assert.equal(phone.asks, 1, `getUserMedia was called ${phone.asks} times for 5 trips`);
  assert.equal(phone.prompts, 1, 'the phone prompted more than once');
});

test('R-11: leaving the camera page suspends the stream (tracks off, not stopped) and returning turns them on', async () => {
  storage.clear();
  const { acquire, suspend } = await relaunch();
  const phone = makePhone();
  const { stream } = await acquire({ nav: phone.nav });
  suspend();
  assert.ok(stream.tracks.every((t) => t.enabled === false && t.readyState === 'live'), 'suspend stopped the tracks or left them on');
  await acquire({ nav: phone.nav });
  assert.ok(stream.tracks.every((t) => t.enabled === true), 'returning did not turn the tracks back on');
});

test('R-11: release() stops the tracks and the next acquire asks again', async () => {
  storage.clear();
  const { acquire, release } = await relaunch();
  const phone = makePhone();
  const { stream } = await acquire({ nav: phone.nav });
  release();
  assert.ok(stream.tracks.every((t) => t.readyState === 'ended'), 'release left the camera running');
  const again = await acquire({ nav: phone.nav });
  assert.equal(again.reused, false);
  assert.equal(phone.asks, 2);
});

test('R-11: five relaunches on a phone that remembers the decision prompt once in total and report nothing', async () => {
  storage.clear();
  const phone = makePhone({ persist: true });
  for (let launch = 1; launch <= 5; launch += 1) {
    const { acquire } = await relaunch();
    await acquire({ nav: phone.nav });
    phone.relaunch();
  }
  assert.equal(phone.prompts, 1, `the phone prompted ${phone.prompts} times over 5 relaunches`);
  assert.equal(queued('camera_prompt_repeat').length, 0, 'a repeat prompt was reported on a phone that did not repeat');
});

test('R-11 (fails loudly): a relaunch where the phone asks again after a grant is reported as camera_prompt_repeat', async () => {
  storage.clear();
  const phone = makePhone({ persist: false });
  const first = await relaunch();
  await first.acquire({ nav: phone.nav });
  phone.relaunch(); // the installed web app lost the decision
  const second = await relaunch();
  await second.acquire({ nav: phone.nav });
  assert.equal(phone.prompts, 2, 'the stub phone did not model a repeat prompt');
  assert.equal(queued('camera_prompt_repeat').length, 1, 'the repeat prompt reached the user and nobody was told');
});

test('R-11 (fails loudly): a denial rejects with the browser\'s own error instead of becoming a falsy value', async () => {
  storage.clear();
  const { acquire } = await relaunch();
  const phone = makePhone({ state: 'denied' });
  await assert.rejects(acquire({ nav: phone.nav }), (err) => err.name === 'NotAllowedError');
});

test('R-11 (fails loudly): a permission state that is not granted, denied or prompt throws; an API that cannot say is "unsupported"', async () => {
  const { cameraPermission } = await relaunch();
  for (const state of ['granted', 'denied', 'prompt']) {
    assert.equal(await cameraPermission({ permissions: { query: async () => ({ state }) } }), state);
  }
  for (const state of ['maybe', '', undefined, null, 1, 'GRANTED']) {
    await assert.rejects(cameraPermission({ permissions: { query: async () => ({ state }) } }), undefined, `state ${JSON.stringify(state)} was accepted`);
  }
  // Safari without a 'camera' permission name throws TypeError from query(): that is "cannot say", said out loud.
  assert.equal(await cameraPermission({ permissions: { query: async () => { throw new TypeError('bad name'); } } }), 'unsupported');
  assert.equal(await cameraPermission({}), 'unsupported');
});

test('R-11: only camera-session.js and the one-time priming ask call getUserMedia; the screen and the eye go through the session', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (!['vendor', 'chunks'].includes(name)) walk(p); } else if (name.endsWith('.js')) files.push(p);
    }
  };
  walk(here('../public/js'));
  files.push(here('../src/eye/camera.ts'));
  const allowed = new Set(['camera-session.js', 'permissions-panel.js']);
  const offenders = files
    .filter((p) => !allowed.has(p.split(/[\\/]/).pop()))
    .filter((p) => /getUserMedia\s*\(/.test(stripComments(readFileSync(p, 'utf8'))))
    .map((p) => relative(here('..'), p));
  assert.deepEqual(offenders, [], `getUserMedia is called outside the session, so a page change can re-ask: ${offenders.join(', ')}`);
  assert.ok(sessionExists, 'public/js/camera-session.js does not exist');
});

test('R-11 (KEEP): the priming ask names granted, denied or unavailable and stops its stream at once', async () => {
  const ended = [];
  const stream = { getTracks: () => [{ stop: () => ended.push(1) }] };
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const set = (nav) => Object.defineProperty(globalThis, 'navigator', { value: nav, writable: true, configurable: true });
  try {
    set({ mediaDevices: { getUserMedia: async () => stream } });
    assert.equal(await panel.askCamera(), 'granted');
    assert.equal(ended.length, 1, 'the priming ask left the camera running');
    set({ mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); } } });
    assert.equal(await panel.askCamera(), 'denied');
    set({ mediaDevices: undefined });
    assert.equal(await panel.askCamera(), 'unavailable');
  } finally {
    Object.defineProperty(globalThis, 'navigator', prior);
  }
});

test('R-11 (KEEP): the camera screen still tells a denied permission from a missing camera', () => {
  const camera = read('../public/js/screens/camera.js');
  assert.match(camera, /err\.name === 'NotAllowedError' \? 'denied' : 'unavailable'|reason === 'denied'/, 'the denied / unavailable split is gone from the camera screen');
  assert.match(camera, /camera_denied/);
});
