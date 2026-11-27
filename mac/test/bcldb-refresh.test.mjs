// mac/test/bcldb-refresh.test.mjs
// mac/bcldb-refresh.sh finds BC Liquor's newest monthly price file, downloads it once, loads it, and remembers it.
// Launch review 2026-11-27 G5: the BC liquor list ran by hand only (no job anywhere), so its prices aged silently.
// Stubs stand in for node (the loader and the newest-file lookup) and curl (the download).
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'bcldb-refresh.sh');
const posix = (p) => String(p).replace(/\\/g, '/');
const root = mkdtempSync(join(tmpdir(), 'shin-bcldb-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

const URL = 'https://catalogue.data.gov.bc.ca/x/download/bc_liquor_store_product_price_list_august_2026.csv';
const NAME = 'bc_liquor_store_product_price_list_august_2026.csv';

function setup({ failNodeOn = '', curlBytes = 200000, curlFails = false, url = URL } = {}) {
  const dir = mkdtempSync(join(root, 't-'));
  const calls = join(dir, 'calls.log');
  const node = join(dir, 'fakenode');
  // The lookup is `node -e <script> <api url>`: answer with the file's address. Anything else is the loader.
  writeFileSync(
    node,
    // One log line per call: the lookup script itself spans lines.
    `#!/bin/sh\necho "node $*" | tr '\\n' ' ' >> '${posix(calls)}'\necho >> '${posix(calls)}'\ncase "$*" in *"${failNodeOn || 'NEVER-MATCHES'}"*) exit 3;; esac\n` +
      `if [ "$1" = "-e" ]; then echo '${url}'; fi\nexit 0\n`,
  );
  const curl = join(dir, 'fakecurl');
  // Writes curlBytes bytes to the -o target.
  writeFileSync(
    curl,
    `#!/bin/sh\necho "curl $*" >> '${posix(calls)}'\n${curlFails ? 'exit 22\n' : ''}` +
      `out=''; while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; shift; fi; shift; done\n` +
      `head -c ${curlBytes} /dev/zero > "$out"\nexit 0\n`,
  );
  chmodSync(node, 0o755);
  chmodSync(curl, 0o755);
  const prices = join(dir, 'prices.db');
  writeFileSync(prices, '');
  const cfg = join(dir, 'config.env');
  writeFileSync(cfg, `SHIN_PRICES='${posix(prices)}'\nNODE_BIN='${posix(node)}'\nCURL_BIN='${posix(curl)}'\n`);
  const run = (cfgPath = cfg) => {
    const r = spawnSync('sh', [posix(SCRIPT), posix(cfgPath)], { encoding: 'utf8', cwd: dir });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  const called = () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : []);
  return { run, called, dir, dataDir: join(dir, 'bcldb') };
}

test('a new month is looked up, downloaded under its own name, loaded, then remembered', () => {
  const t = setup();
  const r = t.run();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /bcldb-refresh: done/);
  const c = t.called();
  assert.match(c[0], /^node -e .* https:\/\/catalogue\.data\.gov\.bc\.ca\/api\/3\/action\/package_show/);
  assert.match(c[1], new RegExp(`^curl .*${URL.replace(/[.?]/g, '\\$&')}`));
  // The loader reads the month from the file name (bcSeenOn), so the name must survive the download.
  assert.match(c[2], new RegExp(`^node price/src/bcldb\\.ts .*/bcldb/${NAME.replace(/\./g, '\\.')}$`));
  assert.ok(existsSync(join(t.dataDir, `${NAME}.loaded`)), 'the month is remembered');
});

test('a month already loaded is not downloaded or loaded again', () => {
  const t = setup();
  assert.equal(t.run().status, 0);
  const before = t.called().length;
  const r = t.run();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /already loaded/);
  assert.equal(t.called().length, before + 1, 'only the lookup ran');
});

test('a failed load names the step and is not remembered, so next week retries', () => {
  const t = setup({ failNodeOn: 'src/bcldb.ts' });
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /bcldb-refresh: FAILED at load/);
  assert.ok(!existsSync(join(t.dataDir, `${NAME}.loaded`)));
});

test('a failed or truncated download stops before the loader runs', () => {
  for (const opts of [{ curlFails: true }, { curlBytes: 10 }]) {
    const t = setup(opts);
    const r = t.run();
    assert.notEqual(r.status, 0);
    assert.match(r.out, /bcldb-refresh: FAILED at download/);
    assert.ok(!t.called().some((l) => l.includes('src/bcldb.ts')), 'the loader never saw a bad file');
  }
});

test('a lookup that answers something other than a CSV is refused', () => {
  const t = setup({ url: 'https://example.org/not-a-csv.html' });
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /bcldb-refresh: FAILED at lookup/);
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
