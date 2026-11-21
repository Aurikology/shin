/**
 * scripts/funnel-report.mjs on a fixture database (review 2026-11-21: business 9, premortem 22, cost 12).
 *
 * The fixture is built through the app's own migrations (openScanStore), so a column the report reads
 * that the app does not have fails here. Every device below is invented. Nothing touches real data
 * and nothing is sent anywhere: the live path is exercised with a fake fetch.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { fileQuery, formatReport, funnelSql, liveQuery, resolveRange, runReport } from '../funnel-report.mjs';

const { openScanStore } = await import('../../app/src/scans.ts');

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'funnel-report.mjs');
const root = mkdtempSync(join(tmpdir(), 'shin-funnel-'));
after(() => rmSync(root, { recursive: true, force: true }));
const dbPath = join(root, 'scans.db');
openScanStore(dbPath).db?.close();

const db = new DatabaseSync(dbPath);
const ev = (device, type, at, payload = null) =>
  db.prepare('INSERT INTO event (device_id, type, payload, created_at) VALUES (?, ?, ?, ?)').run(device, type, payload === null ? null : JSON.stringify(payload), at);
const scan = (device, at, { outcome = 'answered', sellers = null, source = 'shin_prices', demo = 0 } = {}) =>
  db
    .prepare("INSERT INTO scan (device_id, kind, outcome, scanned_at, verdict_sellers, range_source, is_demo) VALUES (?, 'barcode', ?, ?, ?, ?, ?)")
    .run(device, outcome, at, sellers, source, demo);

// A: the whole funnel, and back on day 7.
ev('A', 'app_open', '2026-11-22T10:00:00.000Z', { appVersion: 'x' });
scan('A', '2026-11-22T10:05:00.000Z', { sellers: 3 });
ev('A', 'scan_limit_hit', '2026-11-22T11:00:00.000Z', { limit: 5, used: 5 });
ev('A', 'screen_view', '2026-11-22T11:00:01.000Z', { screen: 'paywall', previousScreen: 'camera' });
ev('A', 'screen_view', '2026-11-22T11:09:00.000Z', { screen: 'paywall', previousScreen: 'you' }); // a second view is still one phone
ev('A', 'paywall_buy', '2026-11-22T11:00:30.000Z', { plan: 'yearly', outcome: 'tapped' });
ev('A', 'paywall_buy', '2026-11-22T11:00:50.000Z', { plan: 'yearly', outcome: 'done' });
ev('A', 'agreement', '2026-11-22T10:01:00.000Z', { claude: true });
ev('A', 'app_open', '2026-11-29T09:00:00.000Z', {});
// B: an answer from a Claude estimate, changed its mind on consent (latest answer counts), back on day 7.
ev('B', 'app_open', '2026-11-23T10:00:00.000Z', {});
scan('B', '2026-11-23T10:05:00.000Z', { sellers: 0, source: 'claude_typical' });
ev('B', 'agreement', '2026-11-23T10:01:00.000Z', { claude: false });
ev('B', 'agreement', '2026-11-24T10:01:00.000Z', { claude: true });
ev('B', 'app_open', '2026-11-30T09:00:00.000Z', {});
// C: hit the limit, saw the paywall, did not tap; came back on day 8, not day 7.
ev('C', 'app_open', '2026-11-24T10:00:00.000Z', {});
ev('C', 'scan_limit_hit', '2026-11-24T10:10:00.000Z', { limit: 5, used: 5 });
ev('C', 'screen_view', '2026-11-24T10:10:01.000Z', { screen: 'paywall' });
ev('C', 'agreement', '2026-11-24T10:01:00.000Z', { claude: false });
ev('C', 'app_open', '2026-12-02T10:00:00.000Z', {});
// D: last second of the range, a refused scan, never agreed.
ev('D', 'app_open', '2026-11-28T23:59:59.900Z', {});
scan('D', '2026-11-28T23:59:59.950Z', { outcome: 'refused' });
// E: a probe device doing everything. Must appear nowhere.
ev('probe-fix-ops-tooling-1', 'app_open', '2026-11-22T10:00:00.000Z', {});
scan('probe-fix-ops-tooling-1', '2026-11-22T10:05:00.000Z', { sellers: 9, source: 'claude_typical' });
ev('probe-fix-ops-tooling-1', 'screen_view', '2026-11-22T10:06:00.000Z', { screen: 'paywall' });
ev('probe-fix-ops-tooling-1', 'paywall_buy', '2026-11-22T10:07:00.000Z', { outcome: 'done' });
ev('probe-fix-ops-tooling-1', 'agreement', '2026-11-22T10:08:00.000Z', { claude: true });
// F: first seen BEFORE the range; its in-range Claude answer counts for the ask rate only.
ev('F', 'app_open', '2026-11-21T10:00:00.000Z', {});
scan('F', '2026-11-25T10:05:00.000Z', { sellers: 1, source: 'claude_typical' });
// G: first seen after the range.
ev('G', 'app_open', '2026-11-29T00:00:00.000Z', {});
scan('G', '2026-11-29T00:01:00.000Z', { sellers: 1, source: 'claude_typical' });
// H: only a demo scan answered; the demo scan counts nowhere.
ev('H', 'app_open', '2026-11-25T10:00:00.000Z', {});
scan('H', '2026-11-25T10:02:00.000Z', { sellers: 2, source: 'claude_typical', demo: 1 });
// I: an answer priced from Pexi's own shop prices with no shelf price typed (verdict_sellers stays null).
// It has shop prices: the first live run (2026-11-21) read 0 because it keyed on verdict_sellers.
ev('I', 'app_open', '2026-11-26T10:00:00.000Z', {});
scan('I', '2026-11-26T10:05:00.000Z', { sellers: null, source: 'shin_prices' });
// J: an id that only ever sent a usage event, never opened the app or scanned. Not a phone: the events
// route takes any id, and the first live run counted 1,287 such ids as "new phones".
ev('J', 'screen_view', '2026-11-26T11:00:00.000Z', { screen: 'camera' });
// A malformed payload must not break the report.
db.exec("INSERT INTO event (device_id, type, payload, created_at) VALUES ('C', 'screen_view', 'not json', '2026-11-24T10:11:00.000Z')");
db.close();

const before = statSync(dbPath);
const dbBytes = readFileSync(dbPath);
const NOW = new Date('2026-12-10T12:00:00Z');

test('the funnel counts each step once per phone, for phones first seen in the range', async () => {
  const { numbers } = await runReport(fileQuery(dbPath), { from: '2026-11-22', to: '2026-11-28', now: NOW });
  assert.deepEqual(
    { ...numbers },
    {
      new_phones: 6, // A B C D H I (J only sent a usage event)
      other_ids: 1, // J
      first_answer: 3, // A B I (D was refused, H's answer was a demo)
      with_shop_prices: 2, // A and I (B's range was a Claude estimate)
      hit_limit: 2, // A C
      paywall_views: 2, // A (twice) and C, one each
      tapped_subscribe: 1,
      purchases: 1,
      hit_limit_and_tapped: 1,
      day7_eligible: 6,
      day7_returned: 2, // A on 11-29, B on 11-30; C came on day 8
      answered_scans: 4, // A, B, F, I in the range; D refused, H demo, G after, probe excluded
      claude_scans: 2, // B and F
      agreed_phones: 3, // A B C
      claude_yes_phones: 2, // A, and B by its LATEST answer
    },
  );
});

test('the day-7 denominator holds back phones that are not 7 days old yet', async () => {
  const { numbers } = await runReport(fileQuery(dbPath), { from: '2026-11-22', to: '2026-11-28', now: new Date('2026-11-30T12:00:00Z') });
  assert.equal(numbers.day7_eligible, 2); // A (22 -> 29) and B (23 -> 30)
  assert.equal(numbers.day7_returned, 2);
});

test('probe devices appear in no count, even when they do everything', async () => {
  const { numbers } = await runReport(fileQuery(dbPath), { from: '2026-11-22', to: '2026-11-22', now: NOW });
  assert.equal(numbers.new_phones, 1); // A only; the probe also started on the 22nd
  assert.equal(numbers.purchases, 1);
  assert.equal(numbers.agreed_phones, 1);
});

test('an empty range prints n/a, not a division by zero', async () => {
  const { range, numbers } = await runReport(fileQuery(dbPath), { from: '2026-01-01', to: '2026-01-07', now: NOW });
  const text = formatReport(numbers, range);
  assert.equal(numbers.new_phones, 0);
  assert.match(text, /first answer\s+0\s+of\s+0\s+n\/a/);
  assert.doesNotMatch(text, /NaN|Infinity/);
});

test('the printed report names every figure that was asked for', async () => {
  const { range, numbers } = await runReport(fileQuery(dbPath), { from: '2026-11-22', to: '2026-11-28', now: NOW });
  const text = formatReport(numbers, range);
  for (const label of ['new phones', 'first answer', 'paywall views', 'purchases', 'day-7 return', 'other ids', 'ask rate', 'consent rate', 'hit limit, tapped']) {
    assert.ok(text.includes(label), `missing "${label}"`);
  }
  assert.match(text, /purchases\s+1\s+of\s+6\s+16\.7%/);
  assert.match(text, /consent rate\s+2\s+of\s+3\s+66\.7%/);
});

test('the report only reads: the database file is byte for byte the same afterwards', async () => {
  await runReport(fileQuery(dbPath), { from: '2026-11-22', to: '2026-11-28', now: NOW });
  assert.deepEqual(readFileSync(dbPath), dbBytes);
  assert.equal(statSync(dbPath).mtimeMs, before.mtimeMs);
  const ro = new DatabaseSync(dbPath, { readOnly: true });
  try {
    assert.throws(() => ro.exec('DELETE FROM event'), /readonly/i);
  } finally {
    ro.close();
  }
});

test('dates are checked before they reach the SQL text', () => {
  assert.throws(() => resolveRange({ from: "2026-11-22'; DROP TABLE scan; --", to: '2026-11-28' }), /must be a date/);
  assert.throws(() => resolveRange({ from: '2026-13-45', to: '2026-11-28' }), /must be a date/);
  assert.throws(() => resolveRange({ from: '2026-11-29', to: '2026-11-28' }), /after/);
  const r = resolveRange({ now: new Date('2026-12-10T12:00:00Z') });
  assert.deepEqual([r.from, r.to, r.toExclusive], ['2026-11-27', '2026-12-10', '2026-12-11']);
  assert.match(funnelSql(r), /device_id NOT LIKE 'probe-%'/);
});

test('--live sends one POST of read-only SQL with the admin header and nothing else', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ rows: [{ new_phones: 7 }], count: 1, truncated: false }) };
  };
  const { numbers } = await runReport(liveQuery({ origin: 'https://example.test/', token: 'tok', fetchFn: fakeFetch }), { from: '2026-11-22', to: '2026-11-28', now: NOW });
  assert.equal(numbers.new_phones, 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/api/admin/sql');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['x-shin-admin'], 'tok');
  assert.match(calls[0].init.body, /^\s*WITH /);
  assert.doesNotMatch(calls[0].init.body, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|ATTACH|PRAGMA)\b/i);
});

test('a failing admin route stops the report loudly', async () => {
  const bad = liveQuery({ origin: 'https://example.test', token: 't', fetchFn: async () => ({ ok: false, status: 404 }) });
  await assert.rejects(runReport(bad, {}), /404/);
});

test('the command line prints the report, and --json prints the numbers', () => {
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, SHIN_ADMIN_TOKEN: '' } });
  const text = run('--db', dbPath, '--from', '2026-11-22', '--to', '2026-11-28');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Funnel for phones first seen 2026-11-22 to 2026-11-28/);
  assert.match(text.stdout, /new phones\s+6/);
  assert.match(text.stdout, /other ids\s+1/);
  const json = run('--db', dbPath, '--from', '2026-11-22', '--to', '2026-11-28', '--json');
  assert.equal(JSON.parse(json.stdout).new_phones, 6);
  const noSource = run('--from', '2026-11-22');
  assert.notEqual(noSource.status, 0);
  assert.match(noSource.stderr, /--db/);
  const noToken = run('--live');
  assert.notEqual(noToken.status, 0);
  assert.match(noToken.stderr, /SHIN_ADMIN_TOKEN/);
});
