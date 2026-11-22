// scripts/test/us-coverage.test.mjs -- the US coverage table: counts, the saved default list, and bad input.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { parseList, summarise, render, pad13 } from '../us-coverage.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'us-coverage.mjs');
const root = mkdtempSync(join(tmpdir(), 'shin-us-coverage-'));
after(() => rmSync(root, { recursive: true, force: true }));

const run = (...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
};

function prices(rows, withGtin = true) {
  const path = join(root, `p-${Math.random().toString(36).slice(2)}.db`);
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE observation (code TEXT, ${withGtin ? 'page_gtin TEXT,' : ''} seller TEXT NOT NULL, currency TEXT NOT NULL)`);
  const ins = db.prepare(`INSERT INTO observation (code, ${withGtin ? 'page_gtin,' : ''} seller, currency) VALUES (${withGtin ? '?,?,?,?' : '?,?,?'})`);
  for (const r of rows) ins.run(...(withGtin ? [r.code ?? null, r.gtin ?? null, r.seller, r.currency] : [r.code, r.seller, r.currency]));
  db.close();
  return path;
}
function catalogue(codes) {
  const path = join(root, `c-${Math.random().toString(36).slice(2)}.db`);
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT)');
  for (const [c, n] of codes) db.prepare('INSERT INTO product VALUES (?, ?)').run(c, n);
  db.close();
  return path;
}
function list(...codes) {
  const path = join(root, `l-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(path, codes.join('\n'));
  return path;
}

const A = '0000000000017';
const B = '0000000000024';
const C = '0000000000031';

test('pad13 and parseList: 13-digit spelling, comments and repeats ignored, a bad line named', () => {
  assert.equal(pad13('49000028911'), '0049000028911');
  assert.deepEqual(parseList('# top\n49000028911\n\n0049000028911 # same\n3017620425035\n'), ['0049000028911', '3017620425035']);
  assert.throws(() => parseList('123\n'), /line 1 is not a barcode/);
  assert.throws(() => parseList('4900002891x\n'), /line 1/);
});

test('summarise counts a barcode once per source and once overall, only from the list', () => {
  const s = summarise(
    [A, B, C],
    [
      { code: A, seller: 'openprices' },
      { code: A, seller: 'openprices' },
      { code: A, seller: 'kroger' },
      { code: B, seller: 'openprices' },
      { code: '0000000009999', seller: 'openprices' },
    ],
    new Set([A, C]),
  );
  assert.equal(s.total, 3);
  assert.equal(s.priced, 2);
  assert.equal(s.named, 2);
  assert.deepEqual(s.sellers, [{ seller: 'openprices', n: 2 }, { seller: 'kroger', n: 1 }]);
  assert.match(render(s), /us-coverage: 2 of 3 with a USD price, 2 of 3 with a name/);
});

test('the command line counts USD rows only, joined by code or by page_gtin, and names from the catalogue', () => {
  const p = prices([
    { code: A, seller: 'openprices', currency: 'USD' },
    { code: null, gtin: B, seller: 'openprices', currency: 'USD' }, // unjoined, found by its page_gtin
    { code: C, seller: 'openprices', currency: 'CAD' }, // wrong market: must not count
  ]);
  const r = run(p, list(A, B, C), '--catalogue', catalogue([[A, 'Oats'], [C, 'Tuna'], [B, '  ']]));
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /openprices\s+2 of 3/);
  assert.match(r.out, /us-coverage: 2 of 3 with a USD price, 2 of 3 with a name/);
});

test('without a catalogue the name count says not checked, never zero', () => {
  const r = run(prices([{ code: A, seller: 'x', currency: 'USD' }]), list(A));
  assert.equal(r.status, 0);
  assert.match(r.out, /1 of 1 with a USD price, names not checked/);
});

test('the saved default list is 200 distinct 13-digit barcodes', () => {
  const codes = parseList(readFileSync(join(HERE, '..', 'data', 'us-top-200.txt'), 'utf8'));
  assert.equal(codes.length, 200);
  assert.ok(codes.every((c) => /^\d{13}$/.test(c)));
  const r = run(prices([]));
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /0 of 200 with a USD price/);
});

test('bad input exits non-zero with a reason', () => {
  const ok = prices([{ code: A, seller: 'x', currency: 'USD' }]);
  assert.equal(run().status, 2);
  assert.equal(run(join(root, 'missing.db'), list(A)).status, 2);
  assert.equal(run(ok, join(root, 'missing.txt')).status, 2);
  assert.equal(run(ok, list()).status, 2); // empty list
  const bad = run(ok, list('hello'));
  assert.equal(bad.status, 2);
  assert.match(bad.err, /not a barcode/);
  assert.equal(run(ok, list(A), '--catalogue', join(root, 'none.db')).status, 2);
  assert.equal(run(ok, list(A), '--nonsense').status, 2);
  const notDb = join(root, 'notdb.db');
  writeFileSync(notDb, 'this is not sqlite');
  assert.equal(run(notDb, list(A)).status, 2);
  const noTable = join(root, 'empty.db');
  new DatabaseSync(noTable).close();
  assert.equal(run(noTable, list(A)).status, 2);
});
