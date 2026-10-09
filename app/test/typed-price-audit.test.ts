/**
 * Requirement 5.2, plan item 5.2: "The server alone marks a typed price as a
 * shopper report", falsified by "a typed price stored any other way", checked
 * by an audit. This file is the audit's own test, the guard that only one
 * function in the app can write a shopper report, and the fault count.
 *
 * Every database here is a temp file built by hand, so each failure class the
 * audit claims to find is put in front of it on purpose.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'shin-typed-audit-'));
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

const { auditTypedPrices } = await import('../src/typed-price-audit.ts');

function correctionsDb(path: string, rows: { device: string; code: string | null; capture: string | null }[]): void {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE correction (id INTEGER PRIMARY KEY, client_id TEXT, device_id TEXT NOT NULL, subject TEXT,
           code TEXT, product_id TEXT, seller TEXT, price_cents INTEGER, kind TEXT, seen_on TEXT, recorded_at TEXT, capture TEXT)`);
  const ins = db.prepare('INSERT INTO correction (client_id, device_id, code, seller, price_cents, capture) VALUES (?,?,?,?,?,?)');
  rows.forEach((r, i) => ins.run(`c${i}`, r.device, r.code, 'Metro', 500 + i, r.capture));
  db.close();
}

function scansDb(path: string, rows: { device: string; cents: number | null; store: string | null; code: string | null }[]): void {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE scan (id INTEGER PRIMARY KEY, device_id TEXT, typed_price_cents INTEGER, store_name TEXT, resolved_code TEXT)');
  const ins = db.prepare('INSERT INTO scan (device_id, typed_price_cents, store_name, resolved_code) VALUES (?,?,?,?)');
  for (const r of rows) ins.run(r.device, r.cents, r.store, r.code);
  db.close();
}

function userCatalogueDb(path: string, prices: (number | null)[]): void {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE user_observation (id INTEGER PRIMARY KEY, store_type TEXT NOT NULL, price_cents INTEGER, observed_at TEXT NOT NULL, device_key TEXT)');
  const ins = db.prepare("INSERT INTO user_observation (store_type, price_cents, observed_at, device_key) VALUES ('grocery', ?, '2026-10-01', 'k')");
  for (const p of prices) ins.run(p);
  db.close();
}

test('an observed price with no shopper-report mark is counted as a failure', () => {
  const c = join(dir, 'c1.db');
  correctionsDb(c, [
    { device: 'a', code: '0000000000017', capture: 'typed' },
    { device: 'b', code: '0000000000017', capture: null },
    { device: 'c', code: '0000000000017', capture: 'typed' },
  ]);
  const audit = auditTypedPrices({ corrections: c, scans: null, userCatalogue: null });
  assert.equal(audit.checked.reports, 3);
  assert.equal(audit.unmarkedReports, 1);
  assert.equal(audit.failing, 1);
});

test('a photographed tag is a different marking, not a failure', () => {
  const c = join(dir, 'c2.db');
  correctionsDb(c, [{ device: 'a', code: '0000000000017', capture: 'photo' }]);
  const audit = auditTypedPrices({ corrections: c, scans: null, userCatalogue: null });
  assert.equal(audit.unmarkedReports, 0);
  assert.equal(audit.failing, 0);
});

test('a typed price with a shop and a product but no shopper report is a failure; one with no shop is kept on the scan only', () => {
  const c = join(dir, 'c3.db');
  const s = join(dir, 's3.db');
  correctionsDb(c, [{ device: 'filed', code: '0000000000017', capture: 'typed' }]);
  scansDb(s, [
    // Filed: the report exists for this device and product (codes compared without their zero padding).
    { device: 'filed', cents: 500, store: 'Metro', code: '17' },
    // Not filed though it had all it needed: a typed price stored another way.
    { device: 'lost', cents: 400, store: 'Metro', code: '0000000000017' },
    // No shop named, or no product resolved: an observed price cannot be made, so it stays on the scan.
    { device: 'noshop', cents: 300, store: null, code: '17' },
    { device: 'blankshop', cents: 300, store: '  ', code: '17' },
    { device: 'noproduct', cents: 300, store: 'Metro', code: null },
    // No typed price at all: not in the audit.
    { device: 'none', cents: null, store: 'Metro', code: '17' },
  ]);
  const audit = auditTypedPrices({ corrections: c, scans: s, userCatalogue: null });
  assert.equal(audit.checked.scanPrices, 5);
  assert.equal(audit.typedNotReported, 1);
  assert.equal(audit.keptOnScanOnly, 3);
  assert.equal(audit.failing, 1);
});

test('a typed price kept as a priced row in the user catalogue is outside the shopper-report store and counted', () => {
  const u = join(dir, 'u4.db');
  userCatalogueDb(u, [349, null, 129]);
  const audit = auditTypedPrices({ corrections: null, scans: null, userCatalogue: u });
  assert.equal(audit.checked.userCataloguePrices, 2);
  assert.equal(audit.outsideReportStore, 2);
  assert.equal(audit.failing, 2);
});

test('a missing or unreadable file is named, never a silent pass', () => {
  const audit = auditTypedPrices({ corrections: join(dir, 'nope.db'), scans: join(dir, 'nope2.db'), userCatalogue: join(dir, 'nope3.db') });
  assert.deepEqual([...audit.unavailable].sort(), ['corrections', 'scans', 'user_catalogue']);
  assert.equal(audit.failing, 0);
});

test('the audit opens every file read-only: nothing it reads is changed', () => {
  const c = join(dir, 'c6.db');
  correctionsDb(c, [{ device: 'a', code: '17', capture: null }]);
  const before = statSync(c).mtimeMs;
  const bytes = readFileSync(c);
  auditTypedPrices({ corrections: c, scans: null, userCatalogue: null });
  assert.equal(statSync(c).mtimeMs, before);
  assert.deepEqual(readFileSync(c), bytes);
});

/* ------------------------------------------------- the server alone marks -- */

const APP = fileURLToPath(new URL('..', import.meta.url));

function appSources(): string[] {
  const out = [join(APP, 'server.ts')];
  for (const f of readdirSync(join(APP, 'src'), { recursive: true }) as string[]) {
    if (f.endsWith('.ts')) out.push(join(APP, 'src', f));
  }
  return out;
}

test('only shopper-report.ts writes a shopper report: no other app file imports recordCorrection', () => {
  const callers = appSources().filter((f) => /import\s*\{[^}]*\brecordCorrection\b[^}]*\}\s*from/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(
    callers.map((f) => f.slice(APP.length).replace(/\\/g, '/')),
    ['src/shopper-report.ts'],
    'a second writer of shopper reports exists, and it does not go through the one that marks them',
  );
});

test('the mark is set by the server: no client field is read into it', () => {
  const src = readFileSync(join(APP, 'src', 'shopper-report.ts'), 'utf8');
  assert.match(src, /capture:\s*SHOPPER_REPORT_CAPTURE/);
  const server = readFileSync(join(APP, 'server.ts'), 'utf8');
  assert.doesNotMatch(server, /\b[cp]\.capture\b|\b[cp]\.shopperReport\b/, 'the route reads a client-sent marking');
});

test('a report the store kept without its mark is counted as a customer-data fault', async () => {
  const { fileTypedReport } = await import('../src/shopper-report.ts');
  const { customerDataFaults, resetCustomerDataFaultsForTests } = await import('../src/customer-data-faults.ts');
  resetCustomerDataFaultsForTests();
  let sent: Record<string, unknown> | null = null;
  const input = {
    clientId: 'x',
    deviceId: 'd',
    code: '17',
    productId: null,
    label: null,
    category: null,
    seller: 'Metro',
    priceCents: 500,
    kind: 'regular' as const,
    seenOn: '2026-10-09',
  };
  // Whatever extra field the caller's object carries, the write gets the server's mark.
  const res = fileTypedReport({ ...input, capture: 'photo' } as typeof input, {
    write: (w) => {
      sent = w as unknown as Record<string, unknown>;
      return { ok: true, id: 9, replaced: false, alreadyStored: false };
    },
    readBack: () => null,
  });
  assert.equal(res.ok, true);
  assert.equal(sent!.capture, 'typed');
  assert.equal(customerDataFaults().typed_price_unmarked, 1);

  // Kept with its mark: no fault.
  fileTypedReport(input, { write: () => ({ ok: true, id: 10, replaced: false, alreadyStored: false }), readBack: () => 'typed' });
  assert.equal(customerDataFaults().typed_price_unmarked, 1);
  resetCustomerDataFaultsForTests();
});
