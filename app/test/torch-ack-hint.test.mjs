/**
 * D-236: a torch tap inside the camera's first four seconds had its line
 * ("This phone has no torch I can reach.", "Torch on") overwritten 0.4 s later
 * by the four-second hint escalation, an unrelated timer. The torch
 * acknowledgement is the one line while it shows: the escalation waits until it
 * ends (and is skipped when the camera has moved past idle by then). Tapped
 * later, the acknowledgement already held its 2.6 s.
 *
 * The functions live in camera.js's render closure, so, as in
 * camera-permission.test.mjs, their source is cut out and RUN here against stubs
 * under fake timers. Nothing leaves the process.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CAMERA = readFileSync(fileURLToPath(new URL('../public/js/screens/camera.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

function between(from, to) {
  const a = CAMERA.indexOf(from);
  assert.notEqual(a, -1, `the opening marker ${JSON.stringify(from)} is gone`);
  const b = CAMERA.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `the closing marker ${JSON.stringify(to)} is gone`);
  return CAMERA.slice(a, b);
}

// showAimHint, the escalation and its arming; the torch tap; the no-torch line.
const HINTS = between('function showAimHint(anim) {', 'function showInitialIdleContent() {');
const TORCH = between('function setTorch(on) {', 'let gen = 0;');
const NO_TORCH = between('function noTorchLine() {', 'function wantTorchOnStart(applyFn) {');

/** The closure's own state, stubbed; `said` is every line the dock was told to say, in order. */
function rig({ state = 'idle', canInterrupt = true } = {}) {
  const said = [];
  const cam = { dataset: { state } };
  const env = {
    said,
    cam,
    budget: { interruptions: 0 },
  };
  const body = `
    let hintTimer = null, torchAckTimer = null, hintEscalated = false, coachKey = null, torchOn = false, dead = false;
    let torchAckActive = false, pendingEscalation = null;
    const camShinEl = { querySelector: () => ({ dataset: {} }) };
    const FLAGS = { photoId: false };
    const root = { querySelector: () => null };
    const store = { canInterrupt: () => ${canInterrupt}, recordInterruption: () => { env.budget.interruptions += 1; } };
    const track = () => {};
    const dockSay = (stateWord, key) => { env.said.push(key); };
    ${HINTS}
    ${TORCH}
    ${NO_TORCH}
    return { armHintEscalation, setTorch, noTorchLine, last: () => env.said[env.said.length - 1] };
  `;
  const api = new Function('env', 'cam', body)(env, cam);
  return { ...api, said, cam, env };
}

test('a torch tap at 3.6 s holds its line the full 2.6 s; the escalation comes after it, not over it', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = rig();
    r.armHintEscalation();
    mock.timers.tick(3600);
    r.setTorch(true);
    assert.equal(r.last(), 'cam_torch_on');
    mock.timers.tick(400); // 4.0 s: the escalation's moment
    assert.equal(r.last(), 'cam_torch_on', 'the four-second escalation overwrote the torch line');
    mock.timers.tick(2199); // 6.199 s: 2.599 s after the tap
    assert.equal(r.last(), 'cam_torch_on', 'the torch line ended before its 2.6 s');
    mock.timers.tick(1); // 6.2 s
    assert.equal(r.last(), 'hint_escalated_barcode', 'the escalation did not follow the torch line');
    assert.equal(r.env.budget.interruptions, 1, 'the escalation is one interruption, counted once');
  } finally {
    mock.timers.reset();
  }
});

test('the no-torch line tapped at 3.6 s holds the same way', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = rig();
    r.armHintEscalation();
    mock.timers.tick(3600);
    r.noTorchLine();
    assert.equal(r.last(), 'cam_torch_none');
    mock.timers.tick(400);
    assert.equal(r.last(), 'cam_torch_none', 'the four-second escalation overwrote the no-torch line');
    mock.timers.tick(2200);
    assert.equal(r.last(), 'hint_escalated_barcode');
  } finally {
    mock.timers.reset();
  }
});

test('a tap after the escalation fired holds its 2.6 s and goes back to the escalated hint', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = rig();
    r.armHintEscalation();
    mock.timers.tick(4000);
    assert.equal(r.last(), 'hint_escalated_barcode');
    r.setTorch(true);
    mock.timers.tick(2599);
    assert.equal(r.last(), 'cam_torch_on');
    mock.timers.tick(1);
    assert.equal(r.last(), 'hint_escalated_barcode');
  } finally {
    mock.timers.reset();
  }
});

test('if the camera is past idle when the torch line ends, the escalation is skipped', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = rig();
    r.armHintEscalation();
    mock.timers.tick(3600);
    r.setTorch(true);
    mock.timers.tick(400);
    r.cam.dataset.state = 'framing';
    const before = r.said.length;
    mock.timers.tick(5000);
    assert.equal(r.said.length, before, 'a line was said over a camera that is no longer idle');
    assert.equal(r.env.budget.interruptions, 0);
  } finally {
    mock.timers.reset();
  }
});

test('a spent interruption budget skips the escalation after the torch line, falling to the plain hint', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = rig({ canInterrupt: false });
    r.armHintEscalation();
    mock.timers.tick(3600);
    r.setTorch(true);
    mock.timers.tick(400 + 2200);
    assert.equal(r.last(), 'cam_aim_barcode');
    assert.equal(r.env.budget.interruptions, 0);
  } finally {
    mock.timers.reset();
  }
});

test('the torch turned off during the hold releases a waiting escalation at once', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = rig();
    r.armHintEscalation();
    mock.timers.tick(3600);
    r.setTorch(true);
    mock.timers.tick(400);
    r.setTorch(false);
    assert.equal(r.last(), 'hint_escalated_barcode');
  } finally {
    mock.timers.reset();
  }
});
