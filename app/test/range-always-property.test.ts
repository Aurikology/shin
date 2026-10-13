/**
 * REQUIREMENT 3.1, PROVEN BY RANDOM INPUT: every request that names an item ends in a range.
 *
 * docs/price-category-requirements-2026-10-01.md 3.1: "Return a range for every request that has a
 * scan left. Pass when 0 requests end without a range." The plan (Part 6, 3.1): "A fallback ladder
 * that ends in an answer, proven by random-input testing. Fails when: any request with a scan left
 * and no range. Diagnose by: replay the failing request; which rung threw."
 *
 * What this test does: thousands of generated requests through the two catalogue-first entry points
 * (`answerBarcodeFromCatalogue`, `answerNamedItem`), drawn from a seeded generator so any failure
 * replays exactly (its seed and case number are printed). Each request draws, independently:
 *   - the item: a catalogue row, a synthetic row with a malformed size, an unknown or French or empty
 *     department, a missing barcode (a misread), an empty name;
 *   - the price file: a real one, an empty one, none, or one that throws on every read (a closed handle);
 *   - the catalogue handle: real, none, or throwing;
 *   - the Claude ask: absent, answering, every refusal code, throwing, rejecting, hanging, slow, or
 *     handing back a malformed "ok";
 *   - the name sorter, the naming steps after a miss, the category guard: absent, working or throwing;
 *   - the market, the date, the shopper's price: sane or junk.
 *
 * THE PROPERTY: the call resolves (never throws, never hangs), and an answer that names an item
 * (`identity` or `storeIdentity`) carries a range: whole cents, 0 < low <= high. An answer that names
 * nothing is only ever `not_in_catalogue` or `frame_wanted`, the naming steps' own ending (RULINGS
 * "A scan never ends with no result"), which hands the shopper to typing the name, and the typed name
 * comes back through `answerNamedItem`, which this test also drives.
 *
 * Every database is in memory; no network, no model, no file outside the OS temp folder.
 */
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openPrices } from '../../price/src/store.ts';
import * as cf from '../src/catalogue-first.ts';
import type { CanonicalBarcode } from '../src/barcode.ts';
import {
  AS_OF, COOKIES, EXTRA_CODES, NAMES, OWN, PATHS, SIZES, TAGS, buildWorld, pick, rangeOk, rng, throwingDb, type World,
} from './range-world.ts';

afterEach(() => mock.restoreAll());

type AskBehaviour =
  | 'absent' | 'good' | 'throws_sync' | 'rejects' | 'hangs' | 'slow' | 'ok_low_above_high' | 'ok_range_null'
  | 'ok_wrong_currency' | 'ok_not_integer' | 'monthly_cap_reached' | 'model_error' | 'model_does_not_know' | 'no_api_key'
  | 'rate_limited' | 'cap_store_error' | 'invalid_json' | 'circuit_open';
const ASKS: readonly AskBehaviour[] = [
  'absent', 'good', 'throws_sync', 'rejects', 'hangs', 'slow', 'ok_low_above_high', 'ok_range_null', 'ok_wrong_currency',
  'ok_not_integer', 'monthly_cap_reached', 'model_error', 'model_does_not_know', 'no_api_key', 'rate_limited',
  'cap_store_error', 'invalid_json', 'circuit_open',
];

function askFor(how: AskBehaviour, currency: string): cf.BarcodeDeps['askRange'] {
  const range = (over: Record<string, unknown> = {}) => ({
    ok: true as const,
    cached: false,
    range: { lowCents: 399, highCents: 649, currency, unit: 'each', confidence: 'low' as const, askedAt: '2026-09-30T00:00:00.000Z', model: 'fake', ...over },
  });
  switch (how) {
    case 'absent': return undefined;
    case 'good': return async () => range();
    case 'throws_sync': return (() => { throw new Error('boom'); }) as never;
    case 'rejects': return async () => { throw new Error('socket hang up'); };
    case 'hangs': return () => new Promise(() => {});
    case 'slow': return () => new Promise((res) => setTimeout(() => res(range()), 40));
    case 'ok_low_above_high': return async () => range({ lowCents: 900, highCents: 100 });
    case 'ok_range_null': return async () => ({ ok: true, cached: false, range: null }) as never;
    case 'ok_wrong_currency': return async () => range({ currency: 'EUR' });
    case 'ok_not_integer': return async () => range({ lowCents: Number.NaN, highCents: 1.5 });
    default: return async () => ({ ok: false, reason: how }) as never;
  }
}

export interface Case {
  readonly label: string;
  readonly run: () => Promise<{ answer: cf.CatalogueAnswer; record: cf.CatalogueRecord }>;
}

export function makeCase(r: () => number, world: World, i: number): Case {
  const currency = pick(r, ['CAD', 'CAD', 'CAD', 'USD', '']);
  const pricesKind = pick(r, ['real', 'real', 'real', 'empty', 'none', 'throws'] as const);
  const catKind = pick(r, ['real', 'real', 'none', 'throws'] as const);
  const ask = pick(r, ASKS);
  const sortKind = pick(r, ['absent', 'cookies', 'null', 'throws', 'garbage'] as const);
  const elsewhereKind = pick(r, ['absent', 'named', 'frame', 'nothing', 'throws'] as const);
  const guardKind = pick(r, ['absent', 'absent', 'working', 'throws'] as const);
  const lookupKind = pick(r, ['hit', 'hit', 'synthetic', 'malformed', 'miss', 'throws', 'none'] as const);
  const entry = pick(r, ['barcode', 'barcode', 'named'] as const);

  const prices = pricesKind === 'real' ? world.prices : pricesKind === 'empty' ? openPrices(':memory:') : pricesKind === 'none' ? null : throwingDb();
  const catalogue = catKind === 'real' ? world.catalogue : catKind === 'none' ? null : throwingDb();
  const rowPick = pick(r, world.rows);
  const synthetic: cf.CatalogueRow = {
    code: pick(r, [...EXTRA_CODES, OWN]),
    name: pick(r, NAMES),
    brands: pick(r, [null, 'Oreo', '', ',,,', 'Kraft, Heinz']),
    quantity: pick(r, SIZES),
    sizeValue: pick(r, [null, 0, -1, Number.NaN, 500, Number.POSITIVE_INFINITY]),
    sizeUnit: pick(r, [null, 'g', 'ml', 'zz', '']),
    leafCategory: pick(r, TAGS),
    categoryPath: pick(r, PATHS),
  };
  // A row of the right shape at the top and the wrong types underneath: no path, a number for a brand.
  const malformed = { code: rowPick.code, name: pick(r, NAMES), brands: 5, quantity: 7, leafCategory: 3, categoryPath: undefined } as unknown as cf.CatalogueRow;
  const row = lookupKind === 'synthetic' ? synthetic : lookupKind === 'malformed' ? malformed : rowPick;
  const lookup: cf.BarcodeDeps['lookup'] =
    lookupKind === 'none' ? null
    : lookupKind === 'throws' ? { byGtin: () => { throw new Error('database disk image is malformed'); } }
    : lookupKind === 'miss' ? { byGtin: () => null }
    : { byGtin: () => row };
  const taxonomy = null;
  const deps: cf.BarcodeDeps = {
    lookup,
    prices,
    catalogue,
    country: pick(r, ['CA', 'CA', 'US', null, 'ZZ']),
    currency,
    asOf: pick(r, [AS_OF, AS_OF, AS_OF, 'not-a-date', '']),
    askRange: askFor(ask, currency || 'CAD'),
    region: pick(r, [null, 'Ontario', 'British Columbia']),
    shopper: pick(r, [null, null, { cents: 499 }, { cents: -5 }, { cents: Number.NaN }, { cents: 100_000_000_000 }]),
    sortName:
      sortKind === 'absent' ? undefined
      : sortKind === 'cookies' ? async () => ({ leafCategory: 'en:cookies', categoryPath: COOKIES })
      : sortKind === 'null' ? async () => null
      : sortKind === 'throws' ? async () => { throw new Error('search down'); }
      : async () => ({ leafCategory: 7, categoryPath: null }) as never,
    claudeWaitMs: pick(r, [5, 20]),
    ...(guardKind === 'absent' ? {}
      : guardKind === 'working' ? { categoryGuard: { check: () => null, taxonomy: () => taxonomy, health: () => ({}) } as never }
      : { categoryGuard: { check: () => { throw new Error('guard'); }, taxonomy: () => { throw new Error('taxonomy'); }, health: () => ({}) } as never }),
    ...(elsewhereKind === 'absent' ? {}
      : elsewhereKind === 'named' ? { nameElsewhere: async () => ({ ok: true, named: { name: pick(r, NAMES), brand: null, size: pick(r, SIZES), source: 'open_food_facts' } }) as const }
      : elsewhereKind === 'frame' ? { nameElsewhere: async () => ({ ok: false, reasons: ['off_not_found'], frameWanted: true }) as const }
      : elsewhereKind === 'nothing' ? { nameElsewhere: async () => ({ ok: false, reasons: ['off_not_found', 'no_frame'], frameWanted: false }) as const }
      : { nameElsewhere: async () => { throw new Error('off down'); } }),
  };
  const gtin = pick(r, [row.code, ...EXTRA_CODES]);
  const how = pick(r, ['as_read', 'as_read', 'variable_measure'] as const);
  const barcode = {
    gtin,
    how,
    variableMeasure: how === 'variable_measure' ? { embeddedPriceCents: pick(r, [null, 499, 0]) } : null,
  } as unknown as CanonicalBarcode;
  const named = { name: pick(r, NAMES), brand: pick(r, [null, 'Oreo', '']), size: pick(r, SIZES), source: pick(r, ['open_food_facts', 'claude_reading'] as const) };
  const priceBarcode = pick(r, [gtin, null]);
  const label =
    `case ${i}: entry=${entry} lookup=${lookupKind} prices=${pricesKind} catalogue=${catKind} ask=${ask} sort=${sortKind} ` +
    `elsewhere=${elsewhereKind} guard=${guardKind} currency=${JSON.stringify(currency)} asOf=${JSON.stringify(deps.asOf)} ` +
    `row=${JSON.stringify(entry === 'named' ? named : { code: row.code, name: row.name, q: row.quantity, leaf: row.leafCategory, path: row.categoryPath })}`;
  return {
    label,
    run: () => (entry === 'named' ? cf.answerNamedItem(named, gtin, priceBarcode, deps) : cf.answerBarcodeFromCatalogue(barcode, deps)),
  };
}

/** The request's ending: 'range', 'unnamed' (the naming steps' own end), or the defect. */
export async function judge(c: Case): Promise<'range' | 'unnamed' | string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<'hung'>((res) => { timer = setTimeout(() => res('hung'), 3000); });
  let out: Awaited<ReturnType<Case['run']>> | 'hung';
  try {
    out = await Promise.race([c.run(), hung]);
  } catch (err) {
    return `threw: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    clearTimeout(timer);
  }
  if (out === 'hung') return 'hung';
  const a = out.answer;
  const named = a.identity !== null || a.storeIdentity !== null;
  if (!named) {
    return a.outcome === 'not_in_catalogue' || a.outcome === 'frame_wanted' ? 'unnamed' : `no identity on outcome ${a.outcome}`;
  }
  if (!rangeOk(a.range)) return `named, no range: range=${JSON.stringify(a.range)} noRangeReason=${a.noRangeReason}`;
  return 'range';
}

const SEED = Number(process.env.SHIN_PROPERTY_SEED ?? 20261013);
const N = Number(process.env.SHIN_PROPERTY_N ?? 2000);

test(`3.1: ${N} random requests (seed ${SEED}); every one that names an item ends in a range, none throws or hangs`, async () => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  const world = buildWorld();
  const r = rng(SEED);
  let failures = 0;
  /** The first replay of each distinct defect, so one run names every rung that broke. */
  const firstOf = new Map<string, string>();
  const tally: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const c = makeCase(r, world, i);
    const end = await judge(c);
    const key = end === 'range' || end === 'unnamed' ? end : end.split(':')[0]!;
    tally[key] = (tally[key] ?? 0) + 1;
    if (end !== 'range' && end !== 'unnamed') {
      failures += 1;
      const kind = end.slice(0, 100);
      if (!firstOf.has(kind)) firstOf.set(kind, `${end}\n    replay: ${c.label}`);
    }
  }
  // The generator must actually reach both endings, or a green here proves nothing.
  assert.ok(N - (tally.unnamed ?? 0) > N / 2, `too few named requests reached: ${JSON.stringify(tally)}`);
  assert.ok((tally.unnamed ?? 0) > 0, `the unnamed ending was never reached: ${JSON.stringify(tally)}`);
  assert.equal(
    failures,
    0,
    `${failures} of ${N} requests ended without a range (tally ${JSON.stringify(tally)}). First of each kind:\n${[...firstOf.values()].slice(0, 12).join('\n')}`,
  );
});

test('3.1 negative control: the judge calls a named answer with no range a failure, and a thrown request a failure', async () => {
  const base: cf.CatalogueAnswer = {
    kind: 'catalogue', outcome: 'catalogue_hit', offerManualEntry: false, catalogueUp: true, barcode: '1',
    identity: { name: 'X', brand: null, size: null, barcode: '1', category: null }, range: null, rangeSource: null,
    rangeAskedAt: null, noRangeReason: 'no_shin_prices', shelfPrice: null, verdict: null, storeIdentity: null,
  };
  const record = {} as cf.CatalogueRecord;
  assert.match(await judge({ label: 'c', run: async () => ({ answer: base, record }) }), /^named, no range/);
  assert.match(await judge({ label: 'c', run: async () => { throw new Error('x'); } }), /^threw/);
  assert.match(
    await judge({ label: 'c', run: async () => ({ answer: { ...base, range: { lowCents: 9, highCents: 3, medianCents: null, n: null, basis: 'this_product', category: null, currency: 'CAD', unit: null } }, record }) }),
    /^named, no range/,
  );
  assert.equal(await judge({ label: 'c', run: async () => ({ answer: { ...base, identity: null, outcome: 'not_in_catalogue' }, record }) }), 'unnamed');
});
