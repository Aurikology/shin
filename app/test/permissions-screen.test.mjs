/**
 * The permission ask standing on its own (screens/permissions.js).
 *
 * WHAT WENT WRONG THAT THIS HOLDS. `docs/mvp-plan.md` (Jamin, 2026-09-21)
 * switches the welcome flow off and keeps the permission ask, and those two
 * could not both be true: the ask was step 24 INSIDE the flow, markup and
 * handlers in onboarding's own render, so switching the flow off took it with
 * it. It is now a panel (permissions-panel.js) drawn from two places, and the
 * screen below is the second one.
 *
 * WHAT EACH TEST IS FOR, each written to go red if the extraction is undone:
 *
 *   1. There is one panel, not two. The welcome flow's step 24 and this screen
 *      draw the same switches from the same function, so a change to one is a
 *      change to both. A copy would pass every other test in this file.
 *   2. Switching the flow off puts the ask in front of a first launch, and
 *      changes nothing else about the order (setup, consent, camera, once each).
 *   3. The flag is still ON. Flipping it is the owner's call, not the build's.
 *   4. The two screens write the camera answer to one place, so the switch
 *      shows the same thing whichever one asked.
 *   5. Nothing here blocks: Continue works with both switches untouched.
 *
 * NOT A BROWSER, the same caveat onboarding.test.mjs carries: this is the
 * hand-built DOM that stores innerHTML without parsing it, so layout and the
 * look of any of this were seen by nobody here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
const doc = makeDocument();
installBrowser({ doc, storage });

const store = await import('../public/js/store.js');
const screen = (await import('../public/js/screens/permissions.js')).default;
const onboarding = (await import('../public/js/screens/onboarding.js')).default;
const panel = await import('../public/js/permissions-panel.js');
const { firstScreen } = await import('../public/js/onboarding-flow.js');
const { FLAGS } = await import('../public/js/flags.js');

const readJs = (rel) => readFileSync(fileURLToPath(new URL(`../public/js/${rel}`, import.meta.url)), 'utf8');

function resetStore() {
  const queue = storage.getItem('shin.track.queue');
  storage.clear();
  if (queue !== null) storage.setItem('shin.track.queue', queue);
  store.reset();
}

/** Renders the standalone screen and hands back what a test needs to click. */
function render({ identifyDemo } = {}) {
  const root = doc.createElement('div');
  const calls = [];
  const cleanup = screen.render(root, {
    params: {},
    api: { postConsent() {}, postEvent() {}, identifyDemo },
    go: (...a) => calls.push(['go', ...a]),
    replace: (...a) => calls.push(['replace', ...a]),
  });
  const html = root.innerHTML;
  // This DOM does not parse innerHTML. paintPanel() no-ops on a selector that
  // resolves to null, which is what the real switches would be here.
  root.querySelector = () => null;
  const listener = root.listeners.find((l) => l.type === 'click')?.fn;
  return {
    root,
    html,
    calls,
    cleanup,
    async click(hits) {
      await listener({ target: { closest: (sel) => hits[sel] ?? null } });
    },
  };
}

const CONTINUE = { '[data-act]': { dataset: { act: 'go' } } };
const CAMERA_SWITCH = { '[data-perm]': { dataset: { perm: 'camera' } } };

/* ------------------------------------------------- 1. one panel, not two */

test('the welcome flow and the screen draw the SAME panel, from one function', () => {
  const r = render();
  r.cleanup();
  const fromPanel = panel.panelHtml();
  assert.ok(r.html.includes(fromPanel), 'the screen does not draw permissions-panel.js output: it has its own copy');

  // And step 24 draws it too, so the two cannot drift apart.
  const onbRoot = doc.createElement('div');
  const onbCleanup = onboarding.render(onbRoot, {
    params: { step: 'permissions' },
    api: { postConsent() {}, postEvent() {} },
    go: () => {},
    replace: () => {},
  });
  const onbHtml = onbRoot.innerHTML;
  onbCleanup();
  assert.ok(onbHtml.includes(fromPanel), 'the welcome flow no longer draws the shared panel');
});

test('the screen file holds no markup of its own for the switches or the demo', () => {
  const src = readJs('screens/permissions.js');
  for (const marker of ['data-perm=', 'onb-switch', 'data-demo-slot', 'onb-demo-link']) {
    assert.ok(!src.includes(`"${marker}`) && !src.includes(`${marker}"`),
      `screens/permissions.js writes ${marker} itself instead of asking the panel for it`);
  }
});

test('onboarding.js no longer builds the permission step itself', () => {
  const src = readJs('screens/onboarding.js');
  assert.ok(!src.includes('function permissionsBody'), 'step 24 still has its own body function');
  assert.ok(!src.includes('async function askCamera'), 'step 24 still has its own copy of the camera prompt');
  assert.match(src, /from '\.\.\/permissions-panel\.js'/);
});

/* ------------------------------------- 2. the flow off puts the ask first */

test('with the welcome flow off, a first launch lands on the permission ask', () => {
  const off = { onboarding: false };
  assert.equal(firstScreen({}, off), 'permissions');
  assert.equal(firstScreen({ permissionsSeen: true }, off), 'setup');
  assert.equal(firstScreen({ permissionsSeen: true, seenIntro: true }, off), 'consent');
  assert.equal(firstScreen({ permissionsSeen: true, seenIntro: true, consentSeen: true }, off), 'camera');
});

test('with the flow on, nothing about the order changed, and the ask stays inside it', () => {
  assert.equal(firstScreen({}), 'onboarding');
  assert.equal(firstScreen({ onboarding: { doneAt: 'x' } }), 'setup');
  // Never sent to the standalone screen while the flow is the one asking.
  assert.notEqual(firstScreen({ onboarding: { doneAt: 'x' }, seenIntro: true, consentSeen: true }), 'permissions');
});

test('main.js registers the screen and reads the flag', () => {
  const main = readJs('main.js');
  assert.match(main, /import permissions from '\.\/screens\/permissions\.js'/);
  assert.match(main, /for \(const s of \[[^\]]*\bpermissions\b[^\]]*\]\)/);
  assert.match(main, /firstScreen\(store\.get\(\), \{ onboarding: FLAGS\.onboarding !== false \}\)/);
  assert.equal(screen.id, 'permissions');
});

/* ----------------------------------------------- 3. the flag is still on */

test('the welcome flow is still switched ON: building the screen is not flipping the switch', () => {
  assert.equal(FLAGS.onboarding, true);
});

/* --------------------------------------- 4. one place for the camera answer */

test('the camera switch is recorded where the welcome flow records it, so both screens agree', async () => {
  resetStore();
  // No mediaDevices in this DOM, so the prompt answers "unavailable", which is
  // still an answer and still goes on record.
  const r = render();
  await r.click(CAMERA_SWITCH);
  r.cleanup();
  const answers = store.get().onboarding?.answers ?? {};
  assert.equal(answers.cameraPermission, 'unavailable');
  // And that is the field the shared panel reads back for the switch.
  assert.equal(panel.panelStates().camera, false);
});

test('the panel shows granted only when the record says granted', () => {
  resetStore();
  store.update((s) => ({ ...s, onboarding: { ...(s.onboarding ?? {}), answers: { cameraPermission: 'granted' } } }));
  assert.equal(panel.panelStates().camera, true);
  resetStore();
});

/* ------------------------------------------------------ 5. nothing blocks */

test('Continue works with both switches untouched, and marks the screen seen once', async () => {
  resetStore();
  assert.equal(store.permissionsSeen(), false);
  const r = render();
  await r.click(CONTINUE);
  r.cleanup();
  assert.equal(store.permissionsSeen(), true, 'Continue did not put the screen on record');
  assert.deepEqual(r.calls.at(-1), ['replace', 'setup'], 'Continue must land where the launch order says next');
});

test('Continue never bounces back into the welcome flow, whatever the flag says', async () => {
  resetStore();
  const r = render();
  await r.click(CONTINUE);
  r.cleanup();
  assert.notEqual(r.calls.at(-1)[1], 'onboarding');
});

test('the demo scan is reachable here too, and degrades honestly with no route', async () => {
  resetStore();
  let slotHtml = '';
  const r = render({ identifyDemo: async () => null });
  r.root.querySelector = (sel) => (sel === '[data-demo-slot]'
    ? { get innerHTML() { return slotHtml; }, set innerHTML(v) { slotHtml = v; } }
    : null);
  await r.click({ '[data-act]': { dataset: { act: 'see-demo' } } });
  r.cleanup();
  assert.ok(!slotHtml.includes('onb-demo-badge'), 'a missing route painted a demo card anyway');
  assert.ok(slotHtml.length > 0, 'the demo link did nothing at all');
});
