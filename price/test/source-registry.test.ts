/**
 * Requirement 4.8 (docs/price-category-requirements-2026-10-01.md): record each
 * source's basis for use (a licence, the site's terms, or pages he browses and
 * saves by hand); run no automated reader on a site whose terms forbid one.
 * Pass: every source has a recorded basis; 0 automated readers on a forbidding
 * site.
 *
 * Plan Part 6, 4.8: a source registry the database enforces, each with its
 * basis. Fails when a source has no basis, or an automated reader runs on a
 * forbidding site. Diagnosed by the registry audit.
 *
 * Every database here is a temp file or in memory. The live price/data
 * prices.db is never opened.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../src/store.ts';
import { runIntake, ALL_WHEN_KNOWN } from '../src/intake.ts';
import {
  SOURCE_SEEDS,
  REGISTRY_TRIGGERS,
  registerSource,
  currentRegistry,
  enforceSourceRegistry,
  isEnforced,
  requireSourceUse,
  registryAudit,
  assertSourceRegistry,
  SourceRegistryError,
  type SourceEntry,
} from '../src/registry.ts';

const DAY = '2026-10-09';
const tmp = () => join(mkdtempSync(join(tmpdir(), 'shin-registry-')), 'prices.db');

function row(over: Partial<ObservationRow> = {}): ObservationRow {
  return {
    code: '0068100084245',
    seller: 'bcldb',
    sellerSku: 'sku-1',
    sellerName: 'A product',
    sellerBrand: null,
    priceCents: 499,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: 'BC',
    joinMethod: 'gtin',
    seenOn: DAY,
    url: null,
    imageUrl: null,
    inStock: null,
    storeName: null,
    storeCity: null,
    storeOsm: null,
    ...over,
  };
}

const RAW_INSERT = `INSERT INTO observation (code, seller, seller_sku, seller_name, price_cents, kind, currency, country, join_method, seen_on)
                    VALUES ('0068100084245', ?, 'raw-1', 'raw', 100, 'regular', 'CAD', 'CA', 'gtin', '${DAY}')`;

const TOY: SourceEntry = {
  seller: 'toy-licensed',
  access: 'automated',
  basis: 'licence',
  evidence: 'toy source that exists only in this test, under a made-up open licence',
  evidenceUrl: null,
  readOn: null,
  automated: 'permitted',
  cite: 'price/test/source-registry.test.ts',
};

/* ------------------------------------------------------------ the table */

test('4.8 a fresh database carries the registry, seeded for every seller that writes observations today', () => {
  const db = openPrices(':memory:');
  const reg = currentRegistry(db);
  for (const seller of ['Walmart', 'Canadian Tire', 'Save-On-Foods', 'openprices', 'bcldb', 'anbl']) {
    assert.ok(reg.some((e) => e.seller === seller && e.access === 'automated'), `${seller} has an automated-reader entry`);
  }
  assert.ok(reg.some((e) => e.seller === 'Walmart' && e.access === 'by_hand' && e.basis === 'hand_saved'), 'the printout path is hand-saved');
  assert.equal(reg.length, SOURCE_SEEDS.length);
  for (const e of reg) assert.ok(e.cite.trim().length > 0 && e.evidence.trim().length > 0, `${e.seller}/${e.access} cites where it came from`);
});

test('4.8 each seed is what the repo records: two licences, two terms readings that forbid automation, two unknown', () => {
  const byKey = new Map(SOURCE_SEEDS.map((s) => [`${s.seller}/${s.access}`, s]));
  assert.equal(byKey.get('bcldb/automated')?.basis, 'licence');
  assert.match(byKey.get('bcldb/automated')!.evidence, /BC Open Government Licence/);
  assert.equal(byKey.get('openprices/automated')?.basis, 'licence');
  assert.match(byKey.get('openprices/automated')!.evidence, /ODbL/);
  for (const k of ['Walmart/automated', 'anbl/automated']) {
    const e = byKey.get(k)!;
    assert.equal(e.basis, 'terms', `${k}: terms read 2026-10-06 (app/src/attribution.ts)`);
    assert.equal(e.readOn, '2026-10-06');
    assert.equal(e.automated, 'forbidden');
    assert.match(e.cite, /app\/src\/attribution\.ts/);
  }
  for (const k of ['Canadian Tire/automated', 'Save-On-Foods/automated']) {
    assert.equal(byKey.get(k)?.basis, 'unknown', `${k}: the repo records no licence and no terms reading`);
  }
  assert.equal(SOURCE_SEEDS.filter((s) => s.automated === 'permitted').length, 0, 'no recorded basis says an automated reader is permitted');
});

test('4.8 the Walmart crawl and the ANBL loader are refused as automated readers; Walmart printouts saved by hand are not', () => {
  const db = openPrices(':memory:');
  assert.throws(() => requireSourceUse(db, 'Walmart', 'automated'), /forbids an automated reader/);
  assert.throws(() => requireSourceUse(db, 'anbl', 'automated'), /forbids an automated reader/);
  assert.equal(requireSourceUse(db, 'Walmart', 'by_hand').basis, 'hand_saved');
});

test('4.8 the registry is append-only: an entry is never edited or deleted, a change is a new entry', () => {
  const db = openPrices(':memory:');
  assert.throws(() => db.exec("UPDATE source_registry SET basis = 'licence'"), /append-only/);
  assert.throws(() => db.exec('DELETE FROM source_registry'), /append-only/);
  registerSource(db, { ...SOURCE_SEEDS.find((s) => s.seller === 'anbl')!, evidence: 'a later reading: written permission granted (test only)', automated: 'permitted' });
  const anbl = currentRegistry(db).filter((e) => e.seller === 'anbl');
  assert.equal(anbl.length, 1, 'one current entry per seller and access');
  assert.equal(anbl[0]!.automated, 'permitted', 'the newest entry is the one in force');
});

test('4.8 known-bad: an entry with no basis evidence is refused by the database itself', () => {
  const db = openPrices(':memory:');
  assert.throws(() => registerSource(db, { ...TOY, evidence: '' }), /evidence/);
  assert.throws(() => registerSource(db, { ...TOY, cite: ' ' }), /cite/);
  assert.throws(() => registerSource(db, { ...TOY, basis: 'terms', evidenceUrl: null, readOn: null }), /terms/);
  assert.throws(() => registerSource(db, { ...TOY, basis: 'hand_saved' }), /hand_saved|by_hand/);
  assert.throws(() => registerSource(db, { ...TOY, basis: 'guessed' as never }), /basis/);
  // The same rules hold for a writer that goes around registerSource.
  assert.throws(
    () => db.exec(`INSERT INTO source_registry (seller, access, basis, evidence, automated, cite, recorded_at)
                   VALUES ('raw', 'automated', 'terms', 'read them', 'permitted', 'x', '${DAY}')`),
    /CHECK|constraint/i,
  );
});

/* ------------------------------------------------------------ enforcement */

test('4.8 an enforced database refuses an observation from a seller with no registry entry, at the database', () => {
  const db = openPrices(':memory:');
  enforceSourceRegistry(db);
  assert.equal(isEnforced(db), true);
  assert.throws(() => db.prepare(RAW_INSERT).run('nobody-registered-me'), /source registry/);
  assert.throws(() => recordObservation(db, row({ seller: 'nobody-registered-me' })), /source registry/);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 0);
  // A registered seller loads, whatever its basis: bcldb (licence) or Canadian Tire (recorded as unknown).
  recordObservation(db, row({ seller: 'bcldb' }));
  recordObservation(db, row({ seller: 'Canadian Tire', region: null }));
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 2);
});

test('4.8 known-bad: moving a row to an unregistered seller by UPDATE is refused too', () => {
  const db = openPrices(':memory:');
  enforceSourceRegistry(db);
  recordObservation(db, row());
  assert.throws(() => db.exec("UPDATE observation SET seller = 'nobody-registered-me'"), /source registry/);
});

test('4.8 enforcement is a property of the file: reopening restores a dropped trigger', () => {
  const path = tmp();
  const db = openPrices(path);
  enforceSourceRegistry(db);
  for (const t of REGISTRY_TRIGGERS) db.exec(`DROP TRIGGER ${t}`);
  db.close();
  const again = openPrices(path);
  assert.equal(isEnforced(again), true);
  assert.throws(() => again.prepare(RAW_INSERT).run('nobody-registered-me'), /source registry/);
  again.close();
});

test('4.8 openPrices({ enforceSources: true }) enforces on open', () => {
  const db = openPrices(':memory:', { enforceSources: true });
  assert.equal(isEnforced(db), true);
  assert.throws(() => db.prepare(RAW_INSERT).run('nobody-registered-me'), /source registry/);
});

test('4.8 a database not put under enforcement keeps loading any seller (fixtures in other packages rely on it), and the audit names them', () => {
  const db = openPrices(':memory:');
  assert.equal(isEnforced(db), false);
  recordObservation(db, row({ seller: 'Test Mart' }));
  const a = registryAudit(db);
  assert.equal(a.enforced, false);
  assert.deepEqual(a.unregistered.map((u) => u.seller), ['Test Mart']);
  assert.equal(a.pass, false);
});

test('4.8 existing rows keep loading: enforcing a database that already holds an unregistered seller records it as basis unknown', () => {
  const path = tmp();
  // A database written before the registry existed: plain DDL, no registry table.
  const old = openPrices(path);
  recordObservation(old, row({ seller: 'Legacy Grocer', sellerSku: 'l-1' }));
  recordObservation(old, row({ seller: 'Legacy Grocer', sellerSku: 'l-2' }));
  old.close();
  const db = openPrices(path);
  const added = enforceSourceRegistry(db);
  assert.deepEqual(added, ['Legacy Grocer']);
  const e = currentRegistry(db).find((x) => x.seller === 'Legacy Grocer')!;
  assert.equal(e.basis, 'unknown');
  assert.match(e.evidence, /2 rows held before/);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 2, 'nothing removed');
  recordObservation(db, row({ seller: 'Legacy Grocer', sellerSku: 'l-3' }));
  assert.throws(() => recordObservation(db, row({ seller: 'Brand New Grocer' })), /source registry/);
  assert.deepEqual(enforceSourceRegistry(db), [], 'idempotent');
  db.close();
});

/* ------------------------------------------------------------ readers */

test('4.8 runIntake refuses a reader whose seller has no registry entry, before reading anything', async () => {
  const db = openPrices(':memory:');
  let read = 0;
  const reader = { seller: 'toy-unregistered', supplies: ALL_WHEN_KNOWN, read: () => { read += 1; return []; } };
  await assert.rejects(runIntake(db, reader, { on: DAY }), SourceRegistryError);
  assert.equal(read, 0);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM intake_batch').get() as { n: number }).n, 0);
});

test('4.8 known-bad: runIntake refuses an automated reader on a source marked forbidding, and logs the refusal', async () => {
  const db = openPrices(':memory:');
  registerSource(db, { ...TOY, automated: 'forbidden', basis: 'terms', evidenceUrl: 'https://toy.example/terms', readOn: DAY, evidence: 'terms s.4: no robots' });
  let read = 0;
  const reader = { seller: TOY.seller, supplies: ALL_WHEN_KNOWN, read: () => { read += 1; return [row({ seller: TOY.seller })]; } };
  await assert.rejects(runIntake(db, reader, { on: DAY }), /forbid/);
  await assert.rejects(runIntake(db, { ...reader, access: 'automated' as const }, { on: DAY }), /forbid/);
  assert.equal(read, 0, 'the reader never ran');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 0);
  const uses = db.prepare('SELECT access, allowed FROM source_use').all() as { access: string; allowed: number }[];
  assert.deepEqual(uses.map((u) => [u.access, u.allowed]), [['automated', 0], ['automated', 0]]);
  assert.equal(registryAudit(db).automatedOnForbidding.length, 0, 'refused runs are not automated readers on the site');
});

test('4.8 a hand-saved reader may load a site whose terms forbid automated readers, only under a hand_saved entry', async () => {
  const db = openPrices(':memory:');
  registerSource(db, { ...TOY, automated: 'forbidden', basis: 'terms', evidenceUrl: 'https://toy.example/terms', readOn: DAY, evidence: 'terms s.4: no robots' });
  const reader = { seller: TOY.seller, supplies: ALL_WHEN_KNOWN, access: 'by_hand' as const, read: () => [row({ seller: TOY.seller })] };
  await assert.rejects(runIntake(db, reader, { on: DAY }), /by_hand|hand/);
  registerSource(db, { ...TOY, access: 'by_hand', basis: 'hand_saved', automated: 'not_recorded', evidence: 'pages he saves by hand' });
  const r = await runIntake(db, reader, { on: DAY });
  assert.equal(r.stored, 1);
});

test('4.8 requireSourceUse is the same gate for the legacy writers that do not go through runIntake', () => {
  const db = openPrices(':memory:');
  assert.throws(() => requireSourceUse(db, 'nobody', 'automated'), SourceRegistryError);
  const e = requireSourceUse(db, 'bcldb', 'automated');
  assert.equal(e.basis, 'licence');
  assert.throws(() => requireSourceUse(db, 'anbl', 'automated'), /forbid/);
  registerSource(db, { ...SOURCE_SEEDS.find((s) => s.seller === 'anbl')!, evidence: 'written permission (test only)', automated: 'permitted' });
  assert.equal(requireSourceUse(db, 'anbl', 'automated').automated, 'permitted', 'a newer entry lifts the refusal');
});

/* ------------------------------------------------------------ the audit */

test('4.8 the registry audit fails today and names every source whose basis is unknown', () => {
  const db = openPrices(':memory:');
  enforceSourceRegistry(db);
  const a = registryAudit(db);
  assert.equal(a.pass, false);
  assert.deepEqual(
    a.unknownBasis.map((e) => `${e.seller}/${e.access}`).sort(),
    ['Canadian Tire/automated', 'Save-On-Foods/automated'],
  );
  assert.throws(() => assertSourceRegistry(db), (e: Error) => e instanceof SourceRegistryError && /Save-On-Foods/.test(e.message) && /basis unknown/.test(e.message));
});

test('4.8 the audit counts an automated reader that ran on a source while it was marked forbidding', () => {
  const path = tmp();
  const db = openPrices(path);
  registerSource(db, { ...TOY, automated: 'permitted' });
  requireSourceUse(db, TOY.seller, 'automated');
  registerSource(db, { ...TOY, automated: 'forbidden', basis: 'terms', evidenceUrl: 'https://toy.example/terms', readOn: DAY, evidence: 'new terms: no robots' });
  // A run recorded as allowed under an entry that forbids: only a writer going around requireSourceUse can make one.
  const forbidId = (db.prepare("SELECT MAX(id) id FROM source_registry WHERE seller = ?").get(TOY.seller) as { id: number }).id;
  db.prepare("INSERT INTO source_use (seller, access, registry_id, allowed, used_at) VALUES (?, 'automated', ?, 1, ?)").run(TOY.seller, forbidId, DAY);
  const a = registryAudit(db);
  assert.equal(a.automatedOnForbidding.length, 1);
  assert.equal(a.automatedOnForbidding[0]!.seller, TOY.seller);
  db.close();
});

test('4.8 the audit passes once every source has a basis and nothing automated ran on a forbidding site', () => {
  const db = openPrices(':memory:');
  for (const s of SOURCE_SEEDS.filter((x) => x.basis === 'unknown')) {
    registerSource(db, { ...s, basis: 'licence', evidence: `toy licence for ${s.seller}, test only`, cite: 'price/test/source-registry.test.ts' });
  }
  enforceSourceRegistry(db);
  const a = assertSourceRegistry(db);
  assert.equal(a.pass, true);
  assert.equal(a.unknownBasis.length, 0);
});

test('4.8 the registry lives in prices.db itself, so a plain SQLite reader sees it', () => {
  const path = tmp();
  openPrices(path).close();
  const raw = new DatabaseSync(path);
  const n = (raw.prepare('SELECT COUNT(*) n FROM source_registry').get() as { n: number }).n;
  assert.equal(n, SOURCE_SEEDS.length);
  raw.close();
});
