/**
 * The catalogue-first settings (settings/src/index.ts, ruling "Catalogue
 * first; Claude, with no web search, is the capped price-range fallback"): on
 * by default since 2026-09-28, and the three range-ask numbers fall back to
 * range-ask.ts's own defaults.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogueFirstOn, rangeAskSettings, readMatchTextBody } from '../src/catalogue-first.ts';
import { DEFAULT_CEILING_CENTS, DEFAULT_MONTHLY_CAP } from '../../identify/src/range-ask.ts';

test('SHIN_CATALOGUE_FIRST is on unless it says 0, off or false', () => {
  assert.equal(catalogueFirstOn({}), true);
  for (const v of ['0', 'off', 'false', ' OFF ', 'False']) assert.equal(catalogueFirstOn({ SHIN_CATALOGUE_FIRST: v }), false, v);
  for (const v of ['', '1', 'on', 'true', 'yes', ' ON ']) assert.equal(catalogueFirstOn({ SHIN_CATALOGUE_FIRST: v }), true, v);
});

test('the range-ask settings default to the numbers range-ask.ts already uses, and junk is the default', () => {
  assert.deepEqual(rangeAskSettings({}), { monthlyCap: DEFAULT_MONTHLY_CAP, ceilingCents: DEFAULT_CEILING_CENTS, storePath: undefined });
  assert.deepEqual(
    rangeAskSettings({ SHIN_RANGE_ASK_MONTHLY_CAP: '0', SHIN_RANGE_ASK_CEILING_CENTS: '5000', SHIN_RANGE_ASK_STORE_PATH: ' /tmp/r.json ' }),
    { monthlyCap: 0, ceilingCents: 5000, storePath: '/tmp/r.json' },
  );
  assert.deepEqual(
    rangeAskSettings({ SHIN_RANGE_ASK_MONTHLY_CAP: '-3', SHIN_RANGE_ASK_CEILING_CENTS: '1.5' }),
    { monthlyCap: DEFAULT_MONTHLY_CAP, ceilingCents: DEFAULT_CEILING_CENTS, storePath: undefined },
  );
});

test('readMatchTextBody takes 1 to 60 strings of at most 200 characters', () => {
  assert.deepEqual(readMatchTextBody({ lines: ['a', ''] }), { ok: true, lines: ['a', ''] });
  assert.equal(readMatchTextBody(null).ok, false);
  assert.equal(readMatchTextBody({ lines: [null] }).ok, false);
  assert.equal(readMatchTextBody({ lines: Array(61).fill('a') }).ok, false);
  assert.equal(readMatchTextBody({ lines: Array(60).fill('a'.repeat(200)) }).ok, true);
});
