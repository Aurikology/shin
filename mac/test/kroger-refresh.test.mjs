// mac/test/kroger-refresh.test.mjs
// mac/kroger-refresh.sh picks the stalest Kroger barcodes, runs kroger-api.ts on them within the call budget,
// skips while the bulk driver runs, and fails loudly. A stub stands in for node; a stub pgrep stands in for pgrep.
// mac/kroger-codes.mjs (the selection) is tested on a real temp database.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { pickCodes } from '../kroger-codes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'kroger-refresh.sh');
const CODES_JS = join(HERE, '..', 'kroger-codes.mjs');
const posix = (p) => String(p).replace(/\\/g, '/');
const root = mkdtempSync(join(tmpdir(), 'shin-kroger-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

/* ------------------------------------------------------------------ the selection */
function fixtureDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE observation (code TEXT, page_gtin TEXT, seller TEXT NOT NULL, seen_on TEXT NOT NULL);
           CREATE TABLE crawl_attempt (code TEXT NOT NULL, seller TEXT NOT NULL, attempted_on TEXT NOT NULL);`);
  const obs = db.prepare('INSERT INTO observation (code, page_gtin, seller, seen_on) VALUES (?,?,?,?)');
  return { db, obs, att: db.prepare('INSERT INTO crawl_attempt (code, seller, attempted_on) VALUES (?,?,?)') };
}

test('selection: Kroger codes only, distinct, oldest latest-seen first, cut to the budget', () => {
  const { db, obs } = fixtureDb();
  obs.run('3', null, 'Kroger', '2026-11-20');
  obs.run('3', null, 'Kroger', '2026-11-01'); // an older row of the same code: the LATEST (11-20) counts
  obs.run('1', null, 'Kroger', '2026-11-05');
  obs.run('2', null, 'Kroger', '2026-11-10');
  obs.run('9', null, 'Walmart', '2026-01-01'); // another seller: never selected
  assert.deepEqual(pickCodes(db, 10), ['1', '2', '3']);
  assert.deepEqual(pickCodes(db, 2), ['1', '2'], 'cut to the budget, keeping the oldest');
});

test('selection: an unjoined row is picked by its page_gtin', () => {
  const { db, obs } = fixtureDb();
  obs.run(null, '7', 'Kroger', '2026-11-01');
  obs.run('8', null, 'Kroger', '2026-11-02');
  assert.deepEqual(pickCodes(db, 10), ['7', '8']);
});

test('selection: a recent attempt with no new observation rotates a code to the back', () => {
  const { db, obs, att } = fixtureDb();
  obs.run('1', null, 'Kroger', '2026-11-01');
  obs.run('2', null, 'Kroger', '2026-11-10');
  att.run('1', 'Kroger', '2026-11-21'); // Kroger no longer returns code 1, but it was just tried
  att.run('5', 'Kroger', '2026-11-01'); // an attempt for a code with no observation is not a candidate
  assert.deepEqual(pickCodes(db, 10), ['2', '1']);
});

test('selection CLI: writes one code per line and refuses bad arguments', () => {
  const dir = mkdtempSync(join(root, 's-'));
  const dbFile = join(dir, 'p.db');
  const db = new DatabaseSync(dbFile);
  db.exec(`CREATE TABLE observation (code TEXT, page_gtin TEXT, seller TEXT NOT NULL, seen_on TEXT NOT NULL);
           CREATE TABLE crawl_attempt (code TEXT NOT NULL, seller TEXT NOT NULL, attempted_on TEXT NOT NULL);
           INSERT INTO observation VALUES ('1', NULL, 'Kroger', '2026-11-02'), ('2', NULL, 'Kroger', '2026-11-01');`);
  db.close();
  const out = join(dir, 'codes.txt');
  const r = spawnSync(process.execPath, [CODES_JS, dbFile, out, '5'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(out, 'utf8'), '2\n1\n');
  const bad = spawnSync(process.execPath, [CODES_JS, dbFile, out, 'x'], { encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /kroger-codes: FAILED/);
});

/* ------------------------------------------------------------------ the shell script */
function setup({ failOn = '', bulkRunning = false, noCodes = false, creds = true } = {}) {
  const dir = mkdtempSync(join(root, 't-'));
  const calls = join(dir, 'calls.log');
  const stub = join(dir, 'fakenode');
  // The stub plays mac/kroger-codes.mjs (argument 3 is the output file) and kroger-api.ts.
  writeFileSync(
    stub,
    `#!/bin/sh\necho "$*" >> '${posix(calls)}'\n` +
      `case "$*" in *"${failOn || 'NEVER-MATCHES'}"*) exit 3;; esac\n` +
      `case "$1" in *kroger-codes.mjs) ${noCodes ? ': > "$3"' : 'echo 0012345678905 > "$3"'};; esac\nexit 0\n`,
  );
  chmodSync(stub, 0o755);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'pgrep'), `#!/bin/sh\nexit ${bulkRunning ? 0 : 1}\n`);
  chmodSync(join(bin, 'pgrep'), 0o755);
  const prices = join(dir, 'prices.db');
  const catalogue = join(dir, 'catalogue.db');
  writeFileSync(prices, '');
  writeFileSync(catalogue, '');
  const cfg = join(dir, 'config.env');
  writeFileSync(
    cfg,
    `SHIN_PRICES='${posix(prices)}'\nSHIN_CATALOGUE='${posix(catalogue)}'\nNODE_BIN='${posix(stub)}'\nTMPDIR='${posix(dir)}'\n` +
      (creds ? `KROGER_CLIENT_ID='test-id'\nKROGER_CLIENT_SECRET='test-secret'\n` : ''),
  );
  const run = (cfgPath = cfg) => {
    const r = spawnSync('sh', [posix(SCRIPT), posix(cfgPath)], {
      encoding: 'utf8',
      cwd: dir,
      env: { ...process.env, PATH: posix(bin) + delimiter + process.env.PATH },
    });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  const called = () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : []);
  return { run, called, dir, prices, catalogue };
}

test('a good run selects 30,000 codes, then imports at 10 stores within 6,000 product calls', () => {
  const t = setup();
  const r = t.run();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /kroger-refresh: done/);
  const [pick, imp] = t.called();
  assert.match(pick, /kroger-codes\.mjs .*prices\.db \S+ 30000$/, 'budget 6000 calls * 50 ids / 10 stores');
  assert.match(imp, /^price\/src\/kroger-api\.ts --zips 45202,30303,75201,90012,98101 --stores-per-zip 2 --codes \S+ /);
  assert.match(imp, /--max-calls 6000/);
  assert.match(imp, /--id-form body/);
  assert.ok(imp.includes(`--db ${posix(t.prices)}`) && imp.includes(`--catalogue ${posix(t.catalogue)}`));
  assert.doesNotMatch(r.out, /test-secret/, 'the secret is never printed');
});

test('while the bulk driver runs the job skips cleanly: exit 0, a logged line, nothing else runs', () => {
  const t = setup({ bulkRunning: true });
  const r = t.run();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /kroger-refresh: skipped, the one-off bulk driver/);
  assert.equal(t.called().length, 0);
});

test('a failed import is reported as its own step with a non-zero exit', () => {
  const t = setup({ failOn: 'kroger-api.ts' });
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /kroger-refresh: FAILED at import/);
});

test('a failed selection stops the run before any import', () => {
  const t = setup({ failOn: 'kroger-codes.mjs' });
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /kroger-refresh: FAILED at select barcodes/);
  assert.equal(t.called().length, 1);
});

test('no Kroger rows to refresh is a failure, not a quiet success', () => {
  const t = setup({ noCodes: true });
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /FAILED at select barcodes: none found/);
  assert.equal(t.called().length, 1);
});

test('missing credentials or config are refused before anything runs', () => {
  const t = setup({ creds: false });
  const r = t.run();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /FAILED at config: KROGER_CLIENT_ID is not set/);
  assert.equal(t.called().length, 0);
  const bad = join(t.dir, 'empty.env');
  writeFileSync(bad, `NODE_BIN='${posix(join(t.dir, 'fakenode'))}'\n`);
  const r2 = t.run(bad);
  assert.notEqual(r2.status, 0);
  assert.match(r2.out, /FAILED at config: SHIN_PRICES is not set/);
});

test('the temp codes file is removed when the run ends', () => {
  const t = setup();
  t.run();
  const left = spawnSync('sh', ['-c', `ls '${posix(t.dir)}' | grep -c '^kroger-codes\\.' || true`], { encoding: 'utf8' });
  assert.equal(left.stdout.trim(), '0');
});
