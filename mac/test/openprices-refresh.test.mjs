// mac/test/openprices-refresh.test.mjs
// mac/openprices-refresh.sh runs the import, then the refresh mark, and fails loudly at the step that broke.
// A stub stands in for node: it records its arguments and can be told to fail on one of them.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'openprices-refresh.sh');
const posix = (p) => String(p).replace(/\\/g, '/');
const root = mkdtempSync(join(tmpdir(), 'shin-oprefresh-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

function setup(failOn = '') {
  const dir = mkdtempSync(join(root, 't-'));
  const calls = join(dir, 'calls.log');
  const stub = join(dir, 'fakenode');
  writeFileSync(
    stub,
    `#!/bin/sh\necho "$*" >> '${posix(calls)}'\ncase "$*" in *"${failOn || 'NEVER-MATCHES'}"*) exit 3;; esac\nexit 0\n`,
  );
  chmodSync(stub, 0o755);
  const prices = join(dir, 'prices.db');
  const catalogue = join(dir, 'catalogue.db');
  writeFileSync(prices, '');
  writeFileSync(catalogue, '');
  const cfg = join(dir, 'config.env');
  writeFileSync(cfg, `SHIN_PRICES='${posix(prices)}'\nSHIN_CATALOGUE='${posix(catalogue)}'\nNODE_BIN='${posix(stub)}'\n`);
  const run = (cfgPath = cfg) => {
    const r = spawnSync('sh', [posix(SCRIPT), posix(cfgPath)], { encoding: 'utf8', cwd: dir });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  const called = () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : []);
  return { run, called, dir };
}

test('a good run imports, then marks the refresh, in that order', () => {
  const t = setup();
  const r = t.run();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /openprices-refresh: done/);
  assert.deepEqual(t.called(), ['price/src/openprices.ts', 'price/src/openprices.ts --mark-refreshed']);
});

test('a failed import stops the run, names the step, and never writes the mark', () => {
  const t = setup('src/openprices.ts');
  // Fail only the first (import) call: the stub matches on the whole argument string.
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /openprices-refresh: FAILED at import/);
  assert.equal(t.called().length, 1, 'the mark step must not run after a failed import');
});

test('a failed mark is reported as its own step', () => {
  const t = setup('--mark-refreshed');
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /openprices-refresh: FAILED at mark refreshed/);
});

test('missing config is refused before anything runs', () => {
  const t = setup();
  const bad = join(t.dir, 'empty.env');
  writeFileSync(bad, `NODE_BIN='${posix(join(t.dir, 'fakenode'))}'\n`);
  const r = t.run(bad);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /FAILED at config: SHIN_PRICES is not set/);
  assert.equal(t.called().length, 0);
});
