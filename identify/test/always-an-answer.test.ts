/**
 * REQUIREMENTS 3 AND 4, 2026-09-15: Gemini and its Claude fallback failing
 * together still leave the shopper an answer wherever one was read, and a
 * hung Gemini no longer uses up Claude's time.
 *
 * Jamin: "Having a response that is not checked is infinitely better than
 * having the user scan something, wait 10 seconds, only to get told the app
 * doesn't know". Seen live the same day: "gemini failed, and the fallback
 * anthropic also failed".
 *
 * Real `Identifier`, real `IdentifyStage`, real `withFallback`; the two
 * vendors are doubles that answer or fail per pass. No network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Identifier } from '../src/model.ts';
import { IdentifyStage, type CatalogueLookup } from '../src/identify.ts';
import {
  ProviderError,
  withFallback,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
} from '../src/provider.ts';

const READING = {
  front_text: ['KRAFT DINNER', 'Original', '225 g'],
  barcode_digits: null,
  count: null,
  language_seen: 'en',
  brand: 'Kraft',
  name: 'Dinner',
  variant: 'Original',
  size_value: 225,
  size_unit: 'g',
  category: 'grocery',
  visible_text: 'KRAFT DINNER Original 225 g',
  alternates: [],
  self_confidence: 'medium',
  uncertainty: null,
};

const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: null, cacheCreationTokens: null };

type Behaviour = 'answer' | 'fail' | 'hang';

function vendor(name: string, onExtract: Behaviour, onPick: Behaviour): Provider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name,
    calls,
    send<T>(request: ProviderRequest): Promise<ProviderResponse<T>> {
      const pass = request.schema.name;
      calls.push(pass);
      const behaviour = pass === 'catalogue_pick' ? onPick : onExtract;
      if (behaviour === 'hang') {
        return new Promise((_, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      if (behaviour === 'fail') return Promise.reject(new ProviderError('model_outage', `${name} is down`, 503));
      const value = pass === 'catalogue_pick' ? { chosen_index: 1, size_question: null, confidence: 'high', why: 'x' } : READING;
      return Promise.resolve({ value: value as T, usage: USAGE, provider: name, model: name });
    },
  };
}

const candidate = (code: string, name: string, similarity: number) => ({
  code,
  name,
  brands: 'Kraft',
  quantity: '225 g',
  sizeValue: 225,
  sizeUnit: 'g',
  categoryPath: [],
  allergens: [],
  signals: { similarity, brandAgrees: true, sizeAgrees: true },
});

/** Two close rows, so pass one does not settle it and the pick pass runs. */
const TWO_CLOSE: CatalogueLookup = async () => ({
  band: 'ambiguous',
  candidates: [candidate('0068100084245', 'Kraft Dinner Original', 0.81), candidate('0068100084246', 'Kraft Dinner Original Family', 0.8)],
  ring: null,
  matchedBy: 'hybrid',
});

async function quietly<T>(body: () => Promise<T>): Promise<T> {
  const before = console.error;
  console.error = () => {};
  try {
    return await body();
  } finally {
    console.error = before;
  }
}

test('REQUIREMENT 3: both vendors failing the pick pass still answers with the best catalogue match', async () => {
  const gemini = vendor('gemini', 'answer', 'fail');
  const anthropic = vendor('anthropic', 'answer', 'fail');
  const stage = new IdentifyStage(TWO_CLOSE, new Identifier(undefined, undefined, withFallback(gemini, anthropic)));
  const outcome = await quietly(() => stage.fromCrop(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), null, 'basic', 90));
  assert.equal(anthropic.calls.includes('catalogue_pick'), true, 'the fallback was never asked for the pick');
  assert.equal(outcome.kind, 'identified', `a scan with a reading ended as ${outcome.kind}`);
  assert.equal(outcome.kind === 'identified' && outcome.chosen.code, '0068100084245');
});

test('REQUIREMENT 3: nothing in the catalogue, and the reading still comes back to be shown unchecked', async () => {
  const stage = new IdentifyStage(
    async () => ({ band: 'miss', candidates: [], ring: null, matchedBy: 'none' }),
    new Identifier(undefined, undefined, withFallback(vendor('gemini', 'answer', 'fail'), vendor('anthropic', 'answer', 'fail'))),
  );
  const outcome = await stage.fromCrop(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), null, 'basic', 90);
  assert.equal(outcome.kind, 'not_in_catalogue');
  assert.equal(outcome.kind === 'not_in_catalogue' && outcome.readAs, 'Kraft Dinner Original');
});

test('REQUIREMENT 4: a Gemini that hangs on the read still leaves Claude its own clock', async () => {
  const saved = process.env.SHIN_MODEL_TIMEOUT_MS;
  process.env.SHIN_MODEL_TIMEOUT_MS = '60';
  try {
    const gemini = vendor('gemini', 'hang', 'answer');
    const anthropic = vendor('anthropic', 'answer', 'answer');
    const identifier = new Identifier(undefined, undefined, withFallback(gemini, anthropic));
    const started = Date.now();
    const reading = await identifier.read(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), null, 'basic');
    assert.equal(reading.product.brand, 'Kraft');
    assert.deepEqual(anthropic.calls, ['product_identity']);
    assert.ok(Date.now() - started < 1_000);
  } finally {
    if (saved === undefined) delete process.env.SHIN_MODEL_TIMEOUT_MS;
    else process.env.SHIN_MODEL_TIMEOUT_MS = saved;
  }
});

/*
 * THE ONE REFUSAL LEFT ON THIS PATH, pinned so it is a known quantity: the
 * READ itself failing at both vendors. Nothing was read, so there is no label
 * to show and nothing to search the catalogue or Google with.
 */
test('both vendors failing the read itself is still the one unreadable outcome, with its class', async () => {
  const stage = new IdentifyStage(TWO_CLOSE, new Identifier(undefined, undefined, withFallback(vendor('gemini', 'fail', 'fail'), vendor('anthropic', 'fail', 'fail'))));
  const outcome = await quietly(() => stage.fromCrop(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), null, 'basic', 90));
  assert.equal(outcome.kind, 'unreadable');
  assert.equal(outcome.kind === 'unreadable' && outcome.failure, 'model_outage');
});
