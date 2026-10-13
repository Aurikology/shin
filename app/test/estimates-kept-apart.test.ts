/**
 * REQUIREMENT 6.3, the storage half: "Store Claude answers as estimates, never observed prices."
 *
 * Checked where it would show: a real scan that ends in Claude's range (the real ask, the real
 * Anthropic provider over a fake Messages client) leaves the price database's `observation` table
 * exactly as it was, and the answer is in the ask's own estimates log, where the one read-back path
 * (price/src/estimate-gate.ts) reads it as `kind: 'estimate'` and keeps it out of a category with
 * 5+ observed prices. A source check pins that the ask's code never names the price store.
 *
 * In memory and OS temp folders only; no socket opens.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicProvider, type MessagesClient } from '../../identify/src/providers/anthropic.ts';
import { askTypicalRange, type RangeIdentity } from '../../identify/src/range-ask.ts';
import { rangeAnswersPath } from '../../identify/src/range-ask-store.ts';
import { estimatesForCategory, observedPricesIn, readStoredEstimates } from '../../price/src/estimate-gate.ts';
import * as cf from '../src/catalogue-first.ts';
import type { CanonicalBarcode } from '../src/barcode.ts';
import { AS_OF, LONELY, buildWorld } from './range-world.ts';

const up: MessagesClient = {
  messages: {
    async create(body) {
      return {
        id: 'msg', type: 'message', role: 'assistant', model: body.model,
        content: [{ type: 'text', text: JSON.stringify({ known: true, low_cents: 450, high_cents: 900, currency: 'CAD', unit: 'one 15 ml tube', confidence: 'low' }), citations: null }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
      } as never;
    },
  },
};

const observations = (db: ReturnType<typeof buildWorld>['prices']) => (db.prepare('SELECT COUNT(*) AS n FROM observation').get() as { n: number }).n;

test('6.3: a scan answered by Claude adds 0 observed prices; the answer is stored as an estimate and read back as one', async () => {
  const world = buildWorld();
  const storePath = join(mkdtempSync(join(tmpdir(), 'shin-kept-apart-')), 'range-ask.json');
  const before = observations(world.prices);
  const row: cf.CatalogueRow = { code: '0626990000086', name: 'Lip Balm', brands: 'Nobody', quantity: '15 ml', leafCategory: 'en:lonely-things', categoryPath: LONELY };
  const { answer } = await cf.answerBarcodeFromCatalogue({ gtin: row.code, how: 'as_read', variableMeasure: null } as unknown as CanonicalBarcode, {
    lookup: { byGtin: () => row }, prices: world.prices, catalogue: world.catalogue, country: 'CA', currency: 'CAD', asOf: AS_OF, claudeWaitMs: 2000,
    askRange: (identity: RangeIdentity) => askTypicalRange(identity, { provider: new AnthropicProvider(up), storePath, breaker: null }),
  });
  assert.equal(answer.rangeSource, 'claude_typical');
  assert.equal(observations(world.prices), before, 'not one observed price was written');

  const { estimates } = readStoredEstimates(rangeAnswersPath(storePath));
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0]!.kind, 'estimate');
  assert.deepEqual([estimates[0]!.lowCents, estimates[0]!.highCents], [450, 900]);

  // Its category holds no observed price, so the gate lets it in; the 8-price cookie category reads none of it.
  const lonely = observedPricesIn(world.prices, world.catalogue, 'en:lonely-things');
  assert.equal(lonely, 0);
  assert.equal(estimatesForCategory('en:lonely-things', estimates, lonely).length, 1);
  const asCookies = estimates.map((e) => ({ ...e, category: 'Cookies' }));
  assert.equal(estimatesForCategory('en:cookies', asCookies, observedPricesIn(world.prices, world.catalogue, 'en:cookies')).length, 0);
});

test('6.3: the ask\'s code never names the price store or its observation table', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  for (const f of ['range-ask.ts', 'range-ask-store.ts']) {
    const src = readFileSync(join(here, '..', '..', 'identify', 'src', f), 'utf8');
    assert.equal(/price\/src\/store|recordObservation|INSERT INTO observation/.test(src), false, f);
  }
});
