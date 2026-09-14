/**
 * A DECLINED CATEGORY MUST SAY WHY IN A CODE, not only in English.
 *
 * `test/structured-prose.test.ts` proves every sentence rebuilds byte for byte
 * from its facts. `refusal_category_not_served` passed that test while still
 * failing a French reader, because one of its facts WAS the English: the frame
 * translated and `why`, 350 characters of recorded reasoning owned by
 * `categories.ts`, came through verbatim. So the facts grew a `whyCode` and the
 * raw `whyFacts` the paragraph interpolates, and this file holds that line.
 *
 * What it asserts, and each one is a way the mechanism has to fail:
 *
 *   1. Every rule that declines carries a code, and no two share one.
 *   2. The refusal ships the code and the raw facts, not just the prose.
 *   3. The English is untouched. Adding facts must never move a byte.
 *   4. The raw facts still match the words. A paragraph rewritten without its
 *      numbers being rewritten is the drift this catches.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceIt } from '../src/spine.ts';
import { CATEGORY_RULES } from '../src/categories.ts';
import type { CategoryId, CategoryReasonCode, Refusal } from '../src/contract.ts';
import { CATEGORY_IDS } from '../src/contract.ts';
import { AS_OF, StubSource, identity, point } from './helpers.ts';

/**
 * The union at runtime, the same trick and the same reason as `ALL_CODES` in
 * `test/structured-prose.test.ts`: a type is erased by the time this runs, and
 * the point of the list is to FAIL when the two drift. Every entry here must be
 * produced by a real refusal below, and every declining rule's code must be
 * here.
 */
const ALL_REASON_CODES: readonly CategoryReasonCode[] = ['produce_no_shelf_price_source'];

/** The categories that decline, found rather than hard-coded, so a new one joins by itself. */
const DECLINED: readonly CategoryId[] = CATEGORY_IDS.filter(
  (id) => CATEGORY_RULES[id].unsupported !== undefined,
);

/** A real engine run for a declined category. Never a hand-built object. */
async function refusalFor(category: CategoryId): Promise<Refusal> {
  const src = new StubSource(identity(category), [point('Metro', 699), point('Food Basics', 599)]);
  const r = await priceIt({ text: 'something', askingCents: 699, asOf: AS_OF }, { sources: [src] });
  assert.equal(r.kind, 'refusal', `${category} should refuse`);
  const refusal = r as Refusal;
  assert.equal(refusal.reason, 'category_unsupported');
  return refusal;
}

test('there is at least one declined category, or this whole file is vacuous', () => {
  assert.ok(DECLINED.length > 0, 'no category declines, so nothing below proves anything');
});

test('every declining category rule carries a reason code and its raw facts', () => {
  const seen = new Set<CategoryReasonCode>();
  for (const id of DECLINED) {
    const { unsupported } = CATEGORY_RULES[id];
    assert.ok(unsupported, `${id} is in DECLINED so it has an unsupported block`);
    assert.ok(
      ALL_REASON_CODES.includes(unsupported.whyCode),
      `${id} uses ${unsupported.whyCode}, which is not in ALL_REASON_CODES`,
    );
    assert.equal(seen.has(unsupported.whyCode), false, `${unsupported.whyCode} is used twice`);
    seen.add(unsupported.whyCode);
    // Facts are what a renderer rebuilds the reason from. An empty record means
    // the code exists and the client still has nothing but our English.
    assert.ok(
      Object.keys(unsupported.whyFacts).length > 0,
      `${id} carries a code with no facts under it`,
    );
    assert.ok(unsupported.why.length > 0, `${id} must keep its English reasoning`);
    assert.ok(unsupported.reversedBy.length > 0, `${id} must keep what reverses the call`);
  }
});

test('every reason code was produced by a real refusal, not just declared', async () => {
  const produced = new Set<CategoryReasonCode>();
  for (const id of DECLINED) {
    const r = await refusalFor(id);
    produced.add(r.structuredDetail.fragments[0]!.facts.whyCode as CategoryReasonCode);
  }
  const missing = ALL_REASON_CODES.filter((c) => !produced.has(c));
  assert.deepEqual(missing, [], `reason codes no refusal produces: ${missing.join(', ')}`);
});

test('the category refusal ships the code and the raw facts beside the English', async () => {
  for (const id of DECLINED) {
    const rule = CATEGORY_RULES[id];
    const r = await refusalFor(id);
    assert.equal(r.structuredDetail.shape, 'single');
    assert.equal(r.structuredDetail.fragments.length, 1);
    const f = r.structuredDetail.fragments[0]!;
    assert.equal(f.code, 'refusal_category_not_served');
    assert.equal(f.facts.category, id, 'the raw category id, which is what a renderer keys on');
    assert.equal(f.facts.categoryLabel, rule.label);
    assert.equal(f.facts.whyCode, rule.unsupported!.whyCode);
    assert.deepEqual(f.facts.whyFacts, rule.unsupported!.whyFacts);
  }
});

test('the English detail is byte for byte what it always was', async () => {
  for (const id of DECLINED) {
    const rule = CATEGORY_RULES[id];
    const r = await refusalFor(id);
    // Spelled out rather than rebuilt from the facts on purpose. The round-trip
    // test rebuilds; this one pins the literal shape, so a fact rename that the
    // renderer follows cannot quietly take the sentence with it.
    assert.equal(r.detail, `${rule.label} is not something Shin can price yet. ${rule.unsupported!.why}`);
    // `why` stays on the facts unchanged. It is the fallback a client uses for a
    // code it has not been taught, and dropping it would blank the sentence.
    assert.equal(r.structuredDetail.fragments[0]!.facts.why, rule.unsupported!.why);
  }
});

test("produce's raw facts still match the words they were pulled out of", () => {
  const { unsupported } = CATEGORY_RULES.produce;
  assert.ok(unsupported);
  assert.equal(unsupported.whyCode, 'produce_no_shelf_price_source');
  const facts = unsupported.whyFacts;
  assert.equal(facts.problemCount, 3);
  assert.equal(facts.plu, '4011');
  assert.equal(facts.pluMeaning, 'bananas');
  assert.equal(facts.pluInUseSince, 1990);
  // The prose and the facts are two statements of one decision and they drift
  // silently. If the paragraph is rewritten, this fails and the facts get
  // rewritten with it.
  assert.match(unsupported.why, /Three problems/);
  assert.match(unsupported.why, /4011/);
  assert.match(unsupported.why, /bananas/);
  assert.match(unsupported.why, /1990/);
});
