/**
 * What a grounded call actually costs, D-117.
 *
 * `tokenCostCents`, `searchCostCents` and `realCostCents` had NO CALLER
 * anywhere in this repo, tests included, until 2026-09-16. That is why nobody
 * noticed they were reading token counts by names the adapter stopped sending
 * on 2026-09-14: `identify/src/providers/gemini.ts` switched to the
 * Interactions API's `total_input_tokens` / `total_output_tokens` and surfaces
 * them as `inputTokens` / `outputTokens`, while this file was still asking for
 * `promptTokenCount` and `candidatesTokenCount`.
 *
 * Wired up as it stood, every grounded call would have reported a null cost
 * while the entire argument for the model switch is knowing what it costs.
 * These tests exist so that the two packages cannot drift apart again in
 * silence.
 *
 * THE FIGURES BELOW ARE ARITHMETIC OVER PUBLISHED LIST PRICES, not bills.
 * Nothing here has ever been invoiced, and both rates are documented as
 * doubling on 2027-01-01.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_RATES_USD_PER_MTOK,
  SEARCH_FREE_PER_MONTH,
  realCostCents,
  searchCostCents,
  tokenCostCents,
} from '../src/model-cost.ts';

const LITE = 'gemini-3.5-flash-lite';
const FLASH = 'gemini-3.8-flash';

/* 2,459 input tokens is the repo's own figure for a 1568 px crop; 600 output
 * is a whole prices-and-reviews answer well inside the 2,600 cap. */
const IN = 2459;
const OUT = 600;

test('the shape the adapter ACTUALLY sends is priced, not read as absent', () => {
  // This is the regression. Before D-117 this returned null.
  const cost = tokenCostCents(LITE, { inputTokens: IN, outputTokens: OUT });
  assert.notEqual(cost, null, 'the current usage shape priced as unknown, which is the whole defect');
  assert.equal(cost, 0.2238);
});

test('the legacy shape still prices, and to the identical number', () => {
  // Same tokens, old names, thinking split out the way the old surface sent it.
  const legacy = tokenCostCents(LITE, {
    promptTokenCount: IN,
    candidatesTokenCount: 400,
    thoughtsTokenCount: 200,
  });
  assert.equal(legacy, 0.2238, 'the two shapes describe the same call and must cost the same');
});

test('thinking tokens are never billed twice', () => {
  /*
   * The trap in accepting both shapes: `outputTokens` ALREADY has the thinking
   * tokens added into it (gemini.ts assumption 9), while the legacy
   * `candidatesTokenCount` does not. A response carrying both must not have
   * its thinking budget counted once inside `outputTokens` and again from
   * `thoughtsTokenCount`.
   */
  const both = tokenCostCents(LITE, {
    inputTokens: IN,
    outputTokens: OUT,
    candidatesTokenCount: 400,
    thoughtsTokenCount: 200,
  });
  assert.equal(both, 0.2238, 'the thinking budget was billed twice');
});

test('a response that measured nothing is unknown, never a measured zero', () => {
  assert.equal(tokenCostCents(LITE, {}), null);
  assert.equal(tokenCostCents(LITE, null), null);
  assert.equal(tokenCostCents(LITE, { inputTokens: null, outputTokens: null }), null);
  // A model nobody has a rate for is also unknown rather than free.
  assert.equal(tokenCostCents('gemini-4-imaginary', { inputTokens: IN, outputTokens: OUT }), null);
});

test('zero input with real output still prices, because that is a measurement', () => {
  assert.equal(tokenCostCents(LITE, { inputTokens: 0, outputTokens: OUT }), 0.15);
});

test('the free search bucket is monthly, so the same call costs differently in it and past it', () => {
  // One grounded price search ran four search queries, measured 2026-09-16.
  assert.equal(searchCostCents(4, 0), 0, 'inside the free allowance');
  assert.equal(searchCostCents(4, SEARCH_FREE_PER_MONTH), 5.6, 'past it, at $14 per thousand');
  // Straddling the boundary: three of the four are still free.
  assert.equal(searchCostCents(4, SEARCH_FREE_PER_MONTH - 3), 1.4);
});

test('one whole grounded call is its tokens plus its searching', () => {
  const usage = { inputTokens: IN, outputTokens: OUT };
  assert.equal(realCostCents(LITE, usage, 4, 0), 0.2238, 'free searches add nothing');
  assert.equal(realCostCents(LITE, usage, 4, SEARCH_FREE_PER_MONTH), 5.8238);
  // A partial measurement is still closer to the truth than an unknown.
  assert.equal(realCostCents(LITE, null, 4, SEARCH_FREE_PER_MONTH), 5.6);
  assert.equal(realCostCents(LITE, null, 0, 0), null, 'nothing measured at all');
});

test('the better model costs more per call, and by how much is now a number', () => {
  /*
   * THE DECISION THIS EXISTS TO INFORM. The 2026-09-16 browser run found the
   * cheap model returning no prices where the better one returned several, so
   * whether to switch turns on what the switch costs. Tokens only; the search
   * charge does not change with the model.
   */
  const usage = { inputTokens: IN, outputTokens: OUT };
  const lite = tokenCostCents(LITE, usage);
  const flash = tokenCostCents(FLASH, usage);
  // lite:  (2459 x 0.30 + 600 x 2.50) / 1e6 USD = 0.0022377 -> 0.2238 cents
  // flash: (2459 x 0.75 + 600 x 3.75) / 1e6 USD = 0.0040943 -> 0.4094 cents
  assert.equal(lite, 0.2238);
  assert.equal(flash, 0.4094);
  assert.ok(flash > lite);
  // 1.83x on this token mix, NOT the 2.5x a glance at the input rates
  // suggests: input and output do not scale by the same factor, and this mix
  // is mostly output. The honest number to take into the decision is this one.
  assert.equal(Math.round((flash / lite) * 100) / 100, 1.83);
});

test('both rate rows are the ones the adapter can actually name', () => {
  // A rate table that does not cover the models in use prices them as unknown,
  // which is the quiet version of the same defect.
  assert.deepEqual(Object.keys(MODEL_RATES_USD_PER_MTOK).sort(), [FLASH, LITE].sort());
});
