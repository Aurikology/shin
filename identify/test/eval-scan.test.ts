/**
 * The Gemini-scan eval, proven without a key and without a socket.
 *
 * Everything here feeds recorded or synthesised shapes through the real
 * scoring path and asserts the bucket it lands in. NO LIVE CALL IS MADE, so
 * nothing in this file is evidence about Gemini's accuracy -- it is evidence
 * that the harness that will measure it works.
 *
 * (It lives in `test/` rather than beside the harness in `eval/` because
 * `identify/package.json`'s test script globs `test/*.test.ts`; a test file
 * outside that directory silently never runs. That was D-124.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  brandAgreement,
  coverage,
  matchName,
  parseSize,
  sizeAgreement,
  substantiveTokens,
  tokens,
  MATCH_THRESHOLDS,
} from '../eval/name-match.ts';
import {
  buildReport,
  identCounts,
  mathCounts,
  offerYield,
  parseCounts,
  printableReport,
  scoreRow,
  type ManifestRow,
  type ScoredRow,
} from '../eval/scan-metrics.ts';
import { GROUNDING, costReport, defaultEstimates, estimateCost, tokenRate } from '../eval/scan-cost.ts';
import {
  RESULT_PREFIX,
  stratify,
  dryVariant,
  loadManifest,
  parseArgs,
  resultPath,
  runAll,
  syntheticAnswer,
  syntheticEnvelope,
} from '../eval/scan-run.ts';
import { interpretText, readAnswer, runGeminiScan, type GeminiRun } from '../src/providers/gemini-scan.ts';
import type { GroundedTransport } from '../src/providers/gemini-grounded.ts';

/* ------------------------------------------------------------- the matcher */

test('tokens fold accents, ampersands and plurals, and size/unit words are not substantive', () => {
  assert.deepEqual(tokens('Céréales & Son'), ['cereale', 'son']);
  assert.deepEqual(tokens('Macaroni and Cheese'), ['macaroni', 'cheese']);
  assert.deepEqual(substantiveTokens('12 x 355 mL Cola'), ['cola']);
  // Error mode 2: these manifest names carry one substantive token and no more.
  assert.equal(substantiveTokens('Almond').length, 1);
  assert.equal(substantiveTokens('Chips').length, 1);
});

test('a brand is agreed when either half of a multi-brand row matches, and absence is never a disagreement', () => {
  assert.equal(brandAgreement('Heinz', 'Heinz', 'Tomato Ketchup'), 'agree');
  assert.equal(brandAgreement('Compliments • Sobeys', 'Sobeys', 'Fettucine'), 'agree');
  assert.equal(brandAgreement('Heinz', 'Kraft', 'Macaroni'), 'disagree');
  // No brand field, but the name carries it: labelOf folds it in, so must the matcher.
  assert.equal(brandAgreement('Kraft', null, 'Kraft Dinner Original'), 'agree');
  assert.equal(brandAgreement('Kraft', null, 'Macaroni and Cheese'), 'unknown');
  assert.equal(brandAgreement(null, 'Kraft', 'anything'), 'unknown', 'a produce row names no brand and cannot disagree with one');
});

test('coverage is expected-token recall, so a longer and better Gemini name is not punished', () => {
  assert.equal(coverage('Macaroni and Cheese', 'Kraft Dinner Original Macaroni & Cheese'), 1);
  assert.equal(coverage('Tomato Ketchup', 'Mustard'), 0);
  assert.equal(coverage('Tomato Ketchup', 'Tomato Paste'), 0.5);
});

test('sizes convert across units and multiply packs; an unparseable or cross-dimension pair is unknown, never a disagreement', () => {
  assert.equal(parseSize('750 mL')?.total, 750);
  assert.equal(parseSize('1.5 kg')?.total, 1500);
  assert.equal(parseSize('12 x 355 mL')?.total, 4260);
  assert.equal(parseSize(null), null);
  assert.equal(sizeAgreement('750 mL', '0.75 L'), 'agree');
  assert.equal(sizeAgreement('750 mL', '1 L'), 'disagree');
  // Error mode 4, asserted so it cannot be forgotten: oz may be weight or volume.
  assert.equal(sizeAgreement('355 mL', '12 oz'), 'unknown');
  assert.equal(sizeAgreement('225 g', null), 'unknown');
});

test('the three buckets: a plain hit is right, a different brand is wrong, and a thin generic name is UNCERTAIN rather than guessed', () => {
  const right = matchName({ brand: 'Heinz', name: 'Tomato Ketchup', size: '750 mL' }, { brand: 'Heinz', name: 'Tomato Ketchup', size: '750 mL' });
  assert.equal(right.verdict, 'right');
  assert.equal(right.brand, 'agree');

  const wrongBrand = matchName({ brand: 'Heinz', name: 'Tomato Ketchup', size: '750 mL' }, { brand: "French's", name: 'Tomato Ketchup', size: '750 mL' });
  assert.equal(wrongBrand.verdict, 'wrong');
  assert.deepEqual(wrongBrand.reasons, ['brand_mismatch']);

  const wrongSize = matchName({ brand: 'Heinz', name: 'Tomato Ketchup', size: '750 mL' }, { brand: 'Heinz', name: 'Tomato Ketchup', size: '1.25 L' });
  assert.equal(wrongSize.verdict, 'wrong', 'the size-pair rows exist to catch exactly this');
  assert.deepEqual(wrongSize.reasons, ['size_mismatch']);

  // The UNCERTAIN case the harness must produce: a one-token generic name with no brand to lean on.
  const thin = matchName({ brand: 'Cape Cod', name: 'Chips', size: '142 g' }, { brand: null, name: 'Kettle Cooked Potato Chips', size: '142 g' });
  assert.equal(thin.verdict, 'uncertain');
  assert.equal(thin.thinExpectedName, true);
  assert.deepEqual(thin.reasons, ['thin_expected_name']);

  const nothing = matchName({ brand: 'Heinz', name: 'Tomato Ketchup', size: '750 mL' }, null);
  assert.equal(nothing.verdict, 'wrong');
  assert.deepEqual(nothing.reasons, ['no_label']);

  // Coverage in the band between the floor and the no-brand bar, with no brand to confirm it: abstain.
  const middling = matchName({ brand: 'Silk', name: 'Almond Beverage Unsweetened Original', size: '1.89 L' }, { brand: null, name: 'Almond Beverage Original', size: null });
  assert.equal(middling.verdict, 'uncertain', 'partial coverage with no brand to confirm it must abstain');
  assert.equal(middling.coverage, 0.75);
  assert.ok(middling.coverage > MATCH_THRESHOLDS.coverageFloor && middling.coverage < MATCH_THRESHOLDS.coverageWithoutBrand);
  assert.deepEqual(middling.reasons, ['below_threshold']);

  // Error mode 3 asserted, not hoped away: an answer in French reads as WRONG.
  const french = matchName({ brand: 'Heinz', name: 'Tomato Ketchup', size: '750 mL' }, { brand: 'Heinz', name: 'Ketchup aux tomates', size: '750 mL' });
  assert.equal(french.verdict, 'uncertain', 'even a near-cognate drops below the bar: "tomates" is not "tomato" to a stemmer');
  assert.equal(french.coverage, 0.5);
  const noCognate = matchName({ brand: null, name: 'Bran Cereal', size: '525 g' }, { brand: null, name: 'Cereales au son', size: '525 g' });
  assert.equal(noCognate.verdict, 'wrong', 'a translated name with no shared tokens is a false WRONG, and the matcher says so');
});

/* ------------------------------------------------- scoring recorded shapes */

const ROW: ManifestRow = { code: '0057000013165', file: 'photos/x.jpg', brand: 'Heinz', name: 'Tomato Ketchup', size: '750 mL', kind: 'size-pair', expect: 'identify', category: null };
const REFUSE_ROW: ManifestRow = { code: null, file: 'photos/produce-01.jpg', brand: null, name: 'Banana', size: null, kind: 'produce', expect: 'refuse', category: null };

const scan = { kind: 'photo' as const, image: { bytes: Buffer.from('89504e470d0a1a0a', 'hex'), mediaType: 'image/png' } };

/** Runs the REAL runGeminiScan against a recorded reply. No socket: the transport is the whole wire. */
async function recorded(text: string, family: '2.5' | '3.x' = '2.5', queries: string[] = ['q1', 'q2', 'q3', 'q4']): Promise<GeminiRun> {
  const transport: GroundedTransport = async () => ({ ok: true, status: 200, text: async () => syntheticEnvelope(text, queries) });
  return runGeminiScan(scan, {
    deviceId: 'fixture',
    env: { SHIN_GEMINI_MODEL: family === '2.5' ? 'gemini-2.5-flash' : 'gemini-3.8-flash' } as NodeJS.ProcessEnv,
    apiKey: 'fixture-no-network',
    transport,
  });
}

test('a clean answer scores right, parses clean, yields 2+ offers and passes the hidden math check', async () => {
  const run = await recorded(JSON.stringify(syntheticAnswer(ROW)));
  const scored = scoreRow(0, ROW, run);
  assert.equal(scored.parseStatus, 'clean');
  assert.equal(scored.match.verdict, 'right');
  assert.equal(scored.offerBucket, '2+');
  assert.equal(scored.verdictAvailable, true);
  assert.equal(scored.math.checked, true);
  assert.deepEqual(scored.math.fields, [], 'the fixture is self-consistent, so the re-check must find nothing');
  assert.equal(scored.searchQueries, 4);
  assert.equal(scored.inputTokens, 4500);
});

test('MALFORMED: prose with no JSON parses as failed, still returns a run, and scores wrong without throwing', async () => {
  const run = await recorded('I am sorry, I could not find that product. Here is some prose instead.');
  assert.equal(run.parseStatus, 'failed');
  assert.equal(run.failure, null, 'a malformed answer is a marked answer, never a thrown one (rule 6)');
  const scored = scoreRow(0, ROW, run);
  assert.equal(scored.match.verdict, 'wrong');
  assert.deepEqual(scored.match.reasons, ['no_label']);
  assert.equal(scored.lowConfidence, true);
  assert.ok(scored.confidenceReasons.includes('answer_unparsed'));
  // This is the counter that decides 2.5 against 3.x.
  assert.equal(parseCounts([scored]).unparsedShare, 1);
});

test('TRUNCATED: a reply cut off mid-answer is repaired, counted as repaired, and still scored', async () => {
  const whole = JSON.stringify(syntheticAnswer(ROW));
  const run = await recorded(whole.slice(0, whole.indexOf('"reviews"') + 14));
  assert.equal(run.parseStatus, 'repaired');
  const counts = parseCounts([scoreRow(0, ROW, run)]);
  assert.equal(counts.repaired, 1);
  assert.equal(counts.unparsedShare, 0, 'a repaired answer parsed; only failed and none did not');
  assert.equal(counts.notCleanShare, 1);
});

test('ZERO OFFERS: no price line can be drawn, and the offer-yield counter says so', async () => {
  const zero = scoreRow(0, ROW, await recorded(JSON.stringify(syntheticAnswer(ROW, { offers: 0 }))));
  const one = scoreRow(1, ROW, await recorded(JSON.stringify(syntheticAnswer(ROW, { offers: 1 }))));
  assert.equal(zero.offerBucket, '0');
  assert.equal(zero.verdictAvailable, false);
  assert.equal(zero.noVerdictReason, 'too_few_offers');
  assert.equal(one.offerBucket, '1');
  const y = offerYield([zero, one]);
  assert.equal(y.belowFloorShare, 1, 'two offers is the floor; one is still below it');
  assert.equal(y.verdictAvailable, 0);
});

test('BAD ARITHMETIC: a stated median that does not follow from the offers is caught by the hidden re-check', async () => {
  const bad = scoreRow(0, ROW, await recorded(JSON.stringify(syntheticAnswer(ROW, { breakMath: true }))));
  assert.ok(bad.math.mismatches > 0);
  assert.ok(bad.math.fields.includes('median_unit_price'));
  const good = scoreRow(1, ROW, await recorded(JSON.stringify(syntheticAnswer(ROW))));
  const m = mathCounts([bad, good]);
  assert.equal(m.checked, 2);
  assert.equal(m.disagreed, 1);
  assert.equal(m.disagreementRate, 0.5);
});

test('a refuse row that Gemini names anyway is flagged, and one it declines to name is not', async () => {
  const named = scoreRow(0, REFUSE_ROW, await recorded(JSON.stringify(syntheticAnswer(REFUSE_ROW, { name: 'Banana', brand: null }))));
  const silent = scoreRow(1, REFUSE_ROW, await recorded(JSON.stringify(syntheticAnswer(REFUSE_ROW, { name: null, brand: null }))));
  assert.equal(named.namedOnRefuseRow, true);
  assert.equal(silent.namedOnRefuseRow, false);
  const report = buildReport([named, silent], 'fixture');
  assert.equal(report.refusal.total, 2);
  assert.equal(report.refusal.named, 1);
  assert.equal(report.refusal.gaveNoName, 1);
  assert.equal(report.overallIdentification.total, 0, 'refuse rows are outside the identification denominator');
});

test('the aggregate keeps the families apart and never folds uncertain into right or wrong', () => {
  const base = (over: Partial<ScoredRow>): ScoredRow =>
    ({
      index: 0, code: null, file: 'f', kind: 'plain', expect: 'identify',
      expected: { brand: 'A', name: 'B', size: null },
      model: 'm', family: '2.5', parseStatus: 'clean', httpStatus: 200, failure: null,
      lowConfidence: false, confidenceReasons: [], ms: 1,
      got: { label: null, brand: null, name: null, size: null },
      match: { verdict: 'right', brand: 'agree', size: 'unknown', coverage: 1, jaccard: 1, thinExpectedName: false, reasons: [] },
      offersShown: 3, offersInMedian: 3, offerBucket: '2+', verdictAvailable: true, noVerdictReason: null,
      math: { checked: true, mismatches: 0, skipped: 0, fields: [] },
      searchQueries: 4, inputTokens: 100, outputTokens: 10, namedOnRefuseRow: false,
      ...over,
    }) as ScoredRow;

  const rows = [
    base({ family: '2.5', match: { verdict: 'right', brand: 'agree', size: 'agree', coverage: 1, jaccard: 1, thinExpectedName: false, reasons: [] } }),
    base({ family: '2.5', parseStatus: 'failed', match: { verdict: 'wrong', brand: 'unknown', size: 'unknown', coverage: 0, jaccard: 0, thinExpectedName: false, reasons: ['no_label'] } }),
    base({ family: '2.5', match: { verdict: 'uncertain', brand: 'unknown', size: 'unknown', coverage: 0.5, jaccard: 0.4, thinExpectedName: true, reasons: ['thin_expected_name'] } }),
    base({ family: '3.x', model: 'gemini-3.8-flash' }),
  ];

  const i = identCounts(rows.filter((r) => r.family === '2.5'));
  assert.deepEqual([i.right, i.wrong, i.uncertain], [1, 1, 1]);
  assert.equal(i.accuracyOfCalled, 0.5, 'the uncertain row is outside the denominator, not counted as a miss');
  assert.equal(i.uncertainShare, 1 / 3);

  const report = buildReport(rows, 'fixture');
  assert.deepEqual(report.byFamily.map((f) => f.family), ['2.5', '3.x']);
  assert.equal(report.byFamily[0].parse.unparsedShare, 1 / 3, 'the 2.5 parse failure must not be diluted by the 3.x rows');
  assert.equal(report.byFamily[1].parse.unparsedShare, 0);
  assert.equal(report.uncertainRows.length, 1, 'the hand-review list is a deliverable, not a rounding error');
  assert.ok(printableReport(report).includes('decides 2.5 against 3.x'));
});

/* ------------------------------------------------------------------- cost */

test('the two families are billed on DIFFERENT UNITS and the estimate must not conflate them', () => {
  assert.equal(GROUNDING['2.5'].unit, 'prompt');
  assert.equal(GROUNDING['3.x'].unit, 'query');
  const e25 = estimateCost({ family: '2.5', model: 'gemini-2.5-flash', rows: 200, freeRemaining: 0 });
  const e3 = estimateCost({ family: '3.x', model: 'gemini-3.8-flash', rows: 200, freeRemaining: 0 });
  assert.equal(e25.groundingUnits, 200, '2.5 bills one grounded prompt per scan whatever it searched');
  assert.equal(e3.groundingUnits, 800, '3.x bills per query, and one observed scan ran four');
  assert.equal(e25.groundingUsd, 7, '200 prompts at $35/1,000');
  assert.ok(Math.abs(e3.groundingUsd - 11.2) < 1e-9, '800 queries at $14/1,000');
  // Per scan: 3.5 cents on 2.5 against 5.6 cents on 3.x, exactly as the rules doc records.
  assert.ok(Math.abs(e25.groundingUsd / 200 - 0.035) < 1e-9);
  assert.ok(Math.abs(e3.groundingUsd / 200 - 0.056) < 1e-9);
});

test('the free allowances are applied, and a 200-row run fits inside both of them', () => {
  const e25 = estimateCost({ family: '2.5', model: 'gemini-2.5-flash', rows: 200 });
  const e3 = estimateCost({ family: '3.x', model: 'gemini-3.8-flash', rows: 200 });
  assert.equal(e25.groundingUsd, 0, '200 grounded prompts sit inside the 1,500-a-day free allowance');
  assert.equal(e3.groundingUsd, 0, '800 queries sit inside the 5,000-a-month free allowance');
  assert.equal(e25.groundingUsdAtListPrice, 7, 'the list-price column is always shown, allowance or not');
  assert.ok(Math.abs(e3.groundingUsdAtListPrice - 11.2) < 1e-9);
});

test('an unrecorded token rate is reported as UNKNOWN and never guessed into a total', () => {
  assert.equal(tokenRate('gemini-2.5-flash').inPerM, null);
  assert.match(tokenRate('gemini-2.5-flash').source, /NOT RECORDED/);
  const e25 = estimateCost({ family: '2.5', model: 'gemini-2.5-flash', rows: 200 });
  assert.equal(e25.tokensUsd, null);
  assert.equal(e25.totalUsd, null, 'a partial total must never be dressed up as a whole one');
  const e3 = estimateCost({ family: '3.x', model: 'gemini-3.8-flash', rows: 200 });
  assert.ok(e3.tokensUsd !== null && Math.abs(e3.tokensUsd - (200 * 4500 * 0.75) / 1e6 - (200 * 800 * 3.75) / 1e6) < 1e-9);
  const text = costReport(defaultEstimates(200));
  assert.match(text, /UNKNOWN/);
  assert.match(text, /A COMBINED TOTAL CANNOT BE GIVEN/);
});

/* --------------------------------------------------------- the dry harness */

test('a live run is refused without --yes-spend, and the dry run is the default', () => {
  assert.equal(parseArgs([]).live, false);
  assert.equal(parseArgs(['--live']).yesSpend, false, 'asking for a live run is not the same as accepting the bill');
  assert.equal(parseArgs(['--live', '--yes-spend']).yesSpend, true);
  assert.deepEqual(parseArgs(['--family', '3.x']).families, ['3.x']);
  assert.deepEqual(parseArgs([]).families, ['2.5', '3.x']);
  assert.throws(() => parseArgs(['--family', '4']), /--family/);
  assert.throws(() => parseArgs(['--nope']), /unknown flag/);
});

test('result files cannot be confused with the old harness', () => {
  const dry = resultPath(false, null);
  assert.ok(dry.includes(RESULT_PREFIX), dry);
  // '-dry-run.json', not '-dry.json': .gitignore already carries
  // `identify/eval/results/*dry-run.json`, and a dry result here is the same
  // half-megabyte of nothing-about-Gemini that rule exists for. Asserted so
  // renaming it back would have to be a decision, not a slip.
  assert.ok(dry.endsWith('-dry-run.json'), dry);
  assert.ok(resultPath(true, null).endsWith('-live.json'));
  // The old harness writes results/YYYY-MM-DD[-matrix][-dry-run].json and never this prefix.
  assert.ok(!/results[\\/]\d{4}-\d{2}-\d{2}/.test(dry));
});

test('the real manifest is read, and the rows a NAME eval cannot use are counted rather than hidden', () => {
  const m = loadManifest();
  assert.equal(m.rows.length, 220);
  assert.equal(m.runnable.length, 200);
  assert.equal(m.missingPhotos.length, 20);
  assert.ok(m.missingPhotos.every((r) => r.expect === 'refuse'), 'every photo missing on disk is a refuse row');
  assert.match(m.refusalNote, /UNUSABLE/, 'the negative set has no photos and the harness must say so, not skip it quietly');
  assert.equal(m.thinNames.length, 16, 'rows whose expected name is too thin for a name matcher');
});

test('the dry run makes NO network call and still produces every bucket the report can show', async () => {
  // A fixture manifest with its own photo, so nothing depends on the real photo set.
  const dir = mkdtempSync(join(tmpdir(), 'shin-scan-eval-'));
  mkdirSync(join(dir, 'photos'), { recursive: true });
  writeFileSync(join(dir, 'photos', 'p.jpg'), Buffer.from('ffd8ffe000104a464946', 'hex'));
  const rows: ManifestRow[] = Array.from({ length: 30 }, (_, i) => ({
    code: `c${i}`, file: 'photos/p.jpg', brand: 'Heinz', name: 'Tomato Ketchup', size: '750 mL',
    kind: i % 2 === 0 ? 'plain' : 'size-pair', expect: 'identify', category: null,
  }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(rows));

  const m = loadManifest(join(dir, 'manifest.json'), dir);
  assert.equal(m.runnable.length, 30);

  // Any real fetch would throw here: the key is a placeholder and the base URL is unreachable.
  // Nothing throws because `dryTransport` is the entire wire.
  const out = await runAll(parseArgs(['--family', 'both']), m, { live: false, photoDir: dir });
  assert.equal(out.scored.length, 60, '30 rows on each family, the same rows both times');

  const r = out.report;
  assert.deepEqual(r.byFamily.map((f) => f.family), ['2.5', '3.x']);
  for (const f of r.byFamily) {
    assert.equal(f.rows, 30);
    assert.ok(f.parse.failed > 0, 'the malformed variant must reach the parse counter');
    assert.ok(f.parse.repaired > 0, 'the truncated variant must reach it too');
    assert.ok(f.parse.clean > 0);
    assert.ok(f.offers.zero > 0 && f.offers.one > 0 && f.offers.twoPlus > 0, 'all three offer buckets');
    assert.ok(f.math.checked > 0);
    assert.equal(f.identification.right + f.identification.wrong + f.identification.uncertain, 30);
    assert.ok(f.identification.uncertain > 0, 'the abstain bucket must be reachable end to end, not only in a unit test');
    assert.deepEqual(f.failures, {}, 'a dry run must produce no transport failures');
  }
  assert.equal(r.byFamily[0].model, 'gemini-2.5-flash');
  assert.equal(r.byFamily[1].model, 'gemini-3.8-flash');
  assert.deepEqual(
    r.byFamily.map((f) => f.parse.unparsedShare),
    [r.byFamily[0].parse.unparsedShare, r.byFamily[0].parse.unparsedShare],
    'the same rows, so the two families must produce the same dry shares -- a difference would mean the harness, not the model, is asymmetric',
  );

  assert.ok(r.uncertainRows.length > 0, 'the hand-review list must come out of a real dry run');
  assert.ok(r.uncertainRows.every((u) => u.reasons.length > 0), 'every abstention must say why');

  const text = printableReport(r);
  assert.match(text, /PARSE STATUS BY FAMILY/);
  assert.match(text, /OFFER YIELD/);
});

test('the perturbation schedule is deterministic and produces an unparsable, a zero-offer and a wrong-brand row', () => {
  const kinds = new Set(Array.from({ length: 30 }, (_, i) => dryVariant(i, ROW).kind));
  for (const want of ['clean', 'unparsable', 'truncated', 'zero-offers', 'one-offer', 'bad-math', 'wrong-brand', 'partial-name']) {
    assert.ok(kinds.has(want), `the dry schedule never produced a ${want} row`);
  }
  assert.equal(dryVariant(3, ROW).kind, dryVariant(3, ROW).kind);
  assert.equal(dryVariant(0, REFUSE_ROW).kind, 'no-name');
  assert.equal(interpretText(dryVariant(3, ROW).text).status, 'failed');
  assert.equal(readAnswer(interpretText(dryVariant(0, ROW).text).value)?.product.name, 'Tomato Ketchup');
});

test('a limited pilot is spread across kinds, not the first N rows of one', () => {
  /*
   * `--limit` used to be `pool.slice(0, limit)`, and the manifest is grouped by
   * kind, so `--limit 40` returned 40 size-pair rows and printed a per-kind
   * table with one line in it. Found by RUNNING the harness and reading the
   * report; no unit test could have caught it, because they assert the scorer
   * and not the sample.
   *
   * It matters because of when a limit is used. Nobody limits a free dry run --
   * a limit is what the first KEYED pilot uses, to check the thing works before
   * spending the allowance on 200 rows. A pilot drawn from one kind reports that
   * kind's parse rate and accuracy as if they were the product's, and the
   * 2.5-versus-3.x decision is meant to rest on exactly those numbers.
   */
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => ({ kind: 'size-pair', id: `s${i}` })),
    ...Array.from({ length: 10 }, (_, i) => ({ kind: 'plain', id: `p${i}` })),
    ...Array.from({ length: 4 }, (_, i) => ({ kind: 'tech', id: `t${i}` })),
  ];

  const six = stratify(rows, 6);
  assert.equal(six.length, 6);
  assert.deepEqual(
    [...new Set(six.map((r) => r.kind))].sort(),
    ['plain', 'size-pair', 'tech'],
    'every kind present in the pool has to appear in the pilot',
  );

  // Deterministic: a rerun at the same limit picks the same rows, or two pilots
  // cannot be compared with each other.
  assert.deepEqual(stratify(rows, 6).map((r) => r.id), six.map((r) => r.id));

  // A limit at or past the pool is the whole pool, unreordered.
  assert.deepEqual(stratify(rows, 99).map((r) => r.id), rows.map((r) => r.id));

  // A kind smaller than its share does not stall the round robin or short the total.
  assert.equal(stratify(rows, 20).length, 20);
});
