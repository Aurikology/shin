/**
 * D-268 H36: the "Where this comes from" page shows what `/api/attribution`
 * sends, as written. It sent the maintainers' record: ISO dates ("counted
 * 2026-10-06", "between 2020-02-01 and 2026-08-26"), "T and T", and the legal
 * notes on four sources ("Verdict: automated reading and reuse are both
 * unlicensed; written permission ... needed").
 *
 * What the phone reads is name, what, licence and url (public/js/screens/
 * licences.js); those four fields stay, in a shopper's words.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-attribution-shopper-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;

const { server } = await import('../server.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

interface Source {
  name: string;
  what: string;
  licence: string;
  url: string;
  [k: string]: unknown;
}

async function sources(): Promise<Source[]> {
  const res = await fetch(`http://127.0.0.1:${port}/api/attribution`, { headers: { connection: 'close' } });
  assert.equal(res.status, 200);
  return ((await res.json()) as { sources: Source[] }).sources;
}

test('every source carries the four fields the screen reads, and nothing else leaves the server', async () => {
  const list = await sources();
  assert.ok(list.length >= 8, `only ${list.length} sources`);
  for (const s of list) {
    assert.deepEqual(Object.keys(s).sort(), ['licence', 'name', 'url', 'what'], `${s.name} sends fields the screen does not read`);
    for (const f of [s.name, s.what, s.licence, s.url]) assert.ok(typeof f === 'string' && f.trim().length > 0, `${s.name} has an empty field`);
    assert.match(s.url, /^https:\/\//);
  }
});

test('no shopper text carries an ISO date', async () => {
  for (const s of await sources()) {
    for (const f of [s.what, s.licence]) {
      assert.doesNotMatch(f, /\b(19|20)\d{2}-(0[1-9]|1[0-2])(-\d{2})?\b/, `${s.name}: ${f.slice(0, 120)}`);
    }
  }
});

test('dates read as a month and a year', async () => {
  const by = (name: RegExp) => (async () => (await sources()).find((s) => name.test(s.name))!)();
  const prices = await by(/^Open Prices$/);
  assert.match(prices.what, /seen from February 2020 to August 2026/);
  assert.match(prices.what, /counted October 2026/);
  const stat = await by(/Statistics Canada/);
  assert.match(stat.what, /newest month September 2026/);
  const usda = await by(/USDA/);
  assert.match(usda.what, /December 2025 release/);
});

test('T&T is written as T&T', async () => {
  const hammer = (await sources()).find((s) => /Hammer/.test(s.name))!;
  assert.match(hammer.what, /\bT&T\b/);
  assert.doesNotMatch(hammer.what, /T and T/);
});

test('no licence or legal note is shown to a shopper', async () => {
  const text = JSON.stringify(await sources());
  for (const banned of [/Verdict/i, /written permission/i, /robots\.txt/i, /unlicensed/i, /No reuse licence/i, /scrap/i, /automated (script|reader|crawler)/i, /No licence stated/i, /Terms and Conditions/i]) {
    assert.doesNotMatch(text, banned);
  }
});

test('the sources no answer uses are not credited as sources', async () => {
  const names = (await sources()).map((s) => s.name).join('|');
  for (const gone of [/ANBL|Alcool NB/, /Walmart Canada/, /Return-It/, /Consignaction/]) assert.doesNotMatch(names, gone);
});

test('the Icecat notice and the ODbL credits still print', async () => {
  const list = await sources();
  const icecat = list.find((s) => /Icecat/.test(s.name))!;
  assert.match(icecat.what, /Database Right data-sheet 2026 Icecat\. All rights reserved\./);
  assert.match(icecat.what, /Provided AS IS, without warranty\./);
  assert.match(list.find((s) => /^Open Food Facts$/.test(s.name))!.what, /Open Food Facts contributors/);
  assert.match(list.find((s) => /OpenStreetMap/.test(s.name))!.licence, /OpenStreetMap contributors/);
});

test('every recorded source is either shown in plain words or deliberately withheld, so none vanishes by accident', async () => {
  const { ATTRIBUTION, SHOPPER_WORDS, WITHHELD } = await import('../src/attribution.ts');
  for (const e of ATTRIBUTION) {
    const shown = e.keys.some((k) => k in SHOPPER_WORDS);
    const withheld = e.keys.some((k) => WITHHELD.includes(k));
    assert.ok(shown !== withheld, `${e.name} must be in exactly one of SHOPPER_WORDS and WITHHELD`);
  }
  assert.equal((await sources()).length, ATTRIBUTION.filter((e) => e.keys.some((k) => k in SHOPPER_WORDS)).length);
});
