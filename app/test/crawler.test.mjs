/**
 * The screen crawler's own tests (scripts/crawler). Two jobs:
 *
 *  (a) a small crawl of the CURRENT app runs, reaches screens and writes its report. It does not
 *      assert "no failures": a crawl that finds a real bug must not turn this test red.
 *  (b) a NEGATIVE CONTROL: a bug planted through the harness's server stub (the identify route
 *      answers a product whose name is the word "undefined", which a screen then prints) must be
 *      found by the crawler and shrunk to a few taps. A crawler that cannot find a planted bug
 *      proves nothing when it finds nothing.
 *
 * Everything runs in this process (no worker processes) and writes to a temp folder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// The crawler's fast timers must be in place before the harness (and so before the crawler) loads.
import '../../scripts/crawler/lib/fast-timers.mjs';
import { crawl } from '../../scripts/crawler/crawl.mjs';
import { identifyRoute, KD, settle } from './ux/ux-b5-harness.test.mjs';

/** The planted-bug crawls pin the start to a returning shopper with consent and a healthy server, so none of their runs is spent on first-launch screens or injected failures. */
const RETURNING_NO_FAULTS = { first: false, consent: { photos: true, location: false }, claude: true, faults: [], search: '' };

function tempOut() {
  return mkdtempSync(join(tmpdir(), 'pexi-crawl-test-'));
}

test('crawler: a small crawl of the current app runs, reaches screens and writes its report', async () => {
  const out = tempOut();
  try {
    const r = await crawl({ runs: 6, steps: 15, seed: 7, workers: 0, coverage: true, out, maxShrinks: 2, shrinkBudget: 30 });
    assert.equal(r.runs, 6, 'every run completed');
    assert.ok(r.stepsTaken >= 8, `steps were taken (${r.stepsTaken})`);
    const real = r.reached.screens.filter((s) => r.inventory.screens.includes(s));
    assert.ok(real.length >= 3, `reached at least 3 screens, got ${real.join(', ') || 'none'}`);
    assert.ok(r.cov.lines[1] > 0 && r.cov.lines[0] > 0, 'coverage was measured over the app files');
    assert.ok(existsSync(join(out, 'report.md')) && existsSync(join(out, 'failures.jsonl')), 'report files written');
    const first = readFileSync(join(out, 'report.md'), 'utf8').split('\n')[0];
    assert.match(first, /^Crawl: 6 runs, \d+ steps, \d+ distinct failures .*coverage [\d.]+% of lines/, `first line: ${first}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('crawler: a planted "undefined on screen" bug is found and shrunk to a few taps', async () => {
  const out = tempOut();
  try {
    const planted = identifyRoute({ identity: { ...KD, name: 'undefined' } });
    const r = await crawl({
      runs: 20, steps: 12, seed: 11, workers: 0, coverage: false, out, shrinkBudget: 60, pin: RETURNING_NO_FAULTS,
      routes: { '/api/identify': planted },
    });
    const hit = r.failures.find((f) => f.rule === 'bad-text' && /undefined/.test(f.message));
    assert.ok(hit, `the planted bug was found; failures were: ${r.failures.map((f) => f.sig).join(' | ') || 'none'}`);
    assert.ok(hit.reproduced, 'the failure reproduced on replay, so it could be shrunk');
    assert.ok(hit.minimal.length >= 1 && hit.minimal.length <= 5, `shrunk to ${hit.minimal.length} steps (limit 5)`);
    assert.equal(r.exitCode, 1, 'a high-severity failure makes the crawl exit 1');
    const lines = readFileSync(join(out, 'failures.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const row = lines.find((l) => l.rule === 'bad-text');
    assert.ok(row && row.signature && row.start && Array.isArray(row.steps) && row.seed !== undefined, 'failures.jsonl row has signature, start state, steps and seed');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('crawler: a planted throw inside a callback is found as an uncaught error', async () => {
  const out = tempOut();
  try {
    // The identify route answers with a body that throws when the app reads it (a field with a throwing
    // getter): the lookup callback in the camera screen throws, as a broken reader callback would.
    const inner = identifyRoute({ identity: KD });
    const bomb = async (call) => {
      const answer = await inner(call);
      return Object.defineProperty({ ...answer }, 'identity', { enumerable: true, get() { throw new Error('planted: broken lookup callback'); } });
    };
    const r = await crawl({
      runs: 20, steps: 12, seed: 5, workers: 0, coverage: false, out, shrinkBudget: 60, pin: RETURNING_NO_FAULTS,
      routes: { '/api/identify': bomb },
    });
    const hit = r.failures.find((f) => /planted: broken lookup callback/.test(f.message));
    assert.ok(hit, `the planted throw was found; failures were: ${r.failures.map((f) => f.sig).join(' | ') || 'none'}`);
    assert.ok(hit.minimal.length <= 5, `shrunk to ${hit.minimal.length} steps (limit 5)`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

/* ---------------------------------------------------------------------------------------------
 * Negative controls for the rules that need a screen to misbehave. The app is never edited: each test
 * registers a fake screen with the app's own router (before the crawl's first look) and the crawl must
 * flag it. A rule that cannot be made to fire here does not ship.
 * ------------------------------------------------------------------------------------------- */

/** A setup hook that registers fake screens and opens `home`. `screens` is { id: (root, ctx) => void }. */
function fakeScreens(screens, home) {
  return async (app) => {
    const router = await app.mod('router.js');
    for (const [id, render] of Object.entries(screens)) router.register({ id, title: id, render });
    router.go(home);
    await settle();
  };
}

/** Crawl only the fake screens: few runs, few steps, a healthy returning shopper. */
async function crawlFake(screens, home, extra = {}) {
  const out = tempOut();
  try {
    return await crawl({
      runs: 4, steps: 8, seed: 3, workers: 0, coverage: false, out, shrinkBudget: 40,
      pin: RETURNING_NO_FAULTS, setup: fakeScreens(screens, home), ...extra,
    });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const sigs = (r) => r.failures.map((f) => `${f.rule}/${f.severity}`).join(' | ') || 'none';

test('crawler rule bad-route: a screen that calls a route the server does not have is flagged', async () => {
  const r = await crawlFake({
    'plant-home': (root) => {
      root.innerHTML = '<p>Plant</p><button type="button">Load</button>';
      root.querySelector('button').addEventListener('click', () => { fetch('/api/planted-missing').catch(() => {}); });
    },
  }, 'plant-home');
  const hit = r.failures.find((f) => f.rule === 'bad-route' && /planted-missing/.test(f.message));
  assert.ok(hit, `bad-route was flagged; got ${sigs(r)}`);
  assert.equal(hit.severity, 'high');
  assert.ok(hit.minimal.length <= 2, `shrunk to ${hit.minimal.length} steps`);
  assert.equal(r.exitCode, 1);
});

test('crawler rule dead-end: a screen with nothing to tap and no way back is flagged', async () => {
  const r = await crawlFake({
    'plant-home': (root, ctx) => {
      root.innerHTML = '<p>Plant</p><button type="button">Next</button>';
      root.querySelector('button').addEventListener('click', () => ctx.go('plant-dead'));
    },
    'plant-dead': (root) => { root.innerHTML = '<p>The end. Nothing else here.</p>'; },
  }, 'plant-home');
  const hit = r.failures.find((f) => f.rule === 'dead-end' && f.screen === 'plant-dead');
  assert.ok(hit, `dead-end was flagged; got ${sigs(r)}`);
  assert.equal(hit.severity, 'high');
  assert.equal(hit.minimal.length, 1, 'one tap reaches the dead end');
});

test('crawler rule stuck-after-fault: a camera left "reading" after the server failed is flagged', async () => {
  const r = await crawlFake({
    'plant-home': (root) => {
      root.innerHTML = '<div class="cam" data-state="idle"><p>Plant</p><button type="button">Look up</button></div>';
      const cam = root.querySelector('.cam');
      root.querySelector('button').addEventListener('click', () => {
        cam.dataset.state = 'reading';
        // The planted bug: the failure is swallowed and "reading" is never cleared.
        fetch('/api/search?q=milk').then((res) => { if (res.ok) cam.dataset.state = 'idle'; }, () => {});
      });
    },
  }, 'plant-home', { pin: { ...RETURNING_NO_FAULTS, faults: [{ kind: '500', path: '/api/search', rate: 1 }] } });
  const hit = r.failures.find((f) => f.rule === 'stuck-after-fault');
  assert.ok(hit, `stuck-after-fault was flagged; got ${sigs(r)}`);
  assert.equal(hit.severity, 'high');
  assert.ok(hit.minimal.length <= 2, `shrunk to ${hit.minimal.length} steps`);
});

test('crawler rule tap-does-nothing: an enabled button that changes nothing twice in a row is flagged (low severity)', async () => {
  const r = await crawlFake({
    'plant-home': (root) => { root.innerHTML = '<p>Plant</p><button type="button">Save</button>'; },
  }, 'plant-home', {
    // A scripted visit: tap Save three times. The chooser's own picks are random and may press back, which leaves the fake screen.
    runs: 1,
    plan: Array.from({ length: 3 }, () => ({ k: 'tap', key: 'button|||button||||||Save', nth: 0 })),
  });
  const hit = r.failures.find((f) => f.rule === 'tap-does-nothing');
  assert.ok(hit, `tap-does-nothing was flagged; got ${sigs(r)}`);
  assert.equal(hit.severity, 'low');
  assert.equal(hit.minimal.length, 2, 'two taps are the minimum');
  assert.ok(!r.failures.some((f) => f.severity === 'high'), `a low-severity failure alone is not a high one; got ${sigs(r)}`);
});

test('crawler allow-list: a deliberate loud log is counted as expected, and an unlisted one stays a failure', async () => {
  const r = await crawlFake({
    'plant-home': (root) => {
      root.innerHTML = '<p>Plant</p><button type="button" data-n="a">Say</button><button type="button" data-n="b">Shout</button>';
      // On the list (camera.js:4218): a scan that ended on typing the name.
      root.querySelector('[data-n="a"]').addEventListener('click', () => console.error('scan ended with no name:', { code: '1', reasons: ['misread'] }));
      // Not on the list: any other console.error is a real failure.
      root.querySelector('[data-n="b"]').addEventListener('click', () => console.error('planted: something nobody listed'));
    },
  }, 'plant-home', { steps: 10, runs: 6 });
  assert.ok(r.failures.some((f) => f.rule === 'console-error' && /nobody listed/.test(f.message) && f.severity === 'high'), `the unlisted log failed; got ${sigs(r)}`);
  assert.ok(!r.failures.some((f) => /scan ended with no name/.test(f.message)), 'the listed log is not a failure');
  assert.ok(r.expected.some((e) => /scan ended with no name/.test(e.what) && e.count > 0), 'the listed log is counted');
});
