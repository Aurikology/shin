/**
 * The eval runner is guarded, because for a while nothing guarded it.
 *
 * D-090: `identify/tsconfig.json` included only `src/**` and `test/**`, and
 * `eval/run.ts` invoked `run()` at module load so nothing could import it. A
 * broken string literal in that file produced a clean `tsc --noEmit` AND a
 * clean 96-test run, and surfaced only when somebody executed the script by
 * hand. That file computes cost per correct identification, which `QUEUE.md`
 * P2 names as the number that chooses the model tiers.
 *
 * The single most valuable line in this file is the import at the top. Every
 * assertion below could be deleted and a parse error in the runner would still
 * fail here, which is the thing that was missing. The rest guards the argument
 * surface, because a flag that silently parses to the wrong value spends real
 * money on the wrong model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../eval/run.ts';

test('the runner can be imported at all, which is the whole point of this file', () => {
  assert.equal(typeof parseArgs, 'function');
});

test('defaults: pro tier, whole manifest, no dry run, no matrix, real catalogue', () => {
  const a = parseArgs([]);
  assert.equal(a.tier, 'pro');
  assert.equal(a.limit, null);
  assert.equal(a.only, null);
  assert.equal(a.dryRun, false);
  assert.equal(a.matrix, false);
  assert.equal(a.fakeCatalogue, false);
});

test('--tier basic is honoured, because the tier decides which model is billed', () => {
  assert.equal(parseArgs(['--tier', 'basic']).tier, 'basic');
  assert.equal(parseArgs(['--tier', 'pro']).tier, 'pro');
});

test('--limit parses as a number and not as a string, so N rows means N rows', () => {
  const a = parseArgs(['--limit', '7']);
  assert.equal(a.limit, 7);
  assert.equal(typeof a.limit, 'number');
});

test('--only carries a single code through untouched', () => {
  assert.equal(parseArgs(['--only', '0057000013165']).only, '0057000013165');
});

test('--dry-run and --matrix are independent flags', () => {
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--dry-run']).matrix, false);
  assert.equal(parseArgs(['--matrix']).matrix, true);
  assert.equal(parseArgs(['--matrix']).dryRun, false);
  const both = parseArgs(['--matrix', '--dry-run']);
  assert.equal(both.matrix, true);
  assert.equal(both.dryRun, true);
});

test('--fake-catalogue is OFF unless asked for, and a number out of it is not a result', () => {
  // Guarded explicitly because this flag grades the manifest against itself.
  // The default must never drift to true: a silent fake-catalogue run would
  // print a perfect top-1 that means nothing, which is exactly the misreading
  // the repo has already had once with a dry run's 40 of 40.
  assert.equal(parseArgs([]).fakeCatalogue, false);
  assert.equal(parseArgs(['--dry-run']).fakeCatalogue, false);
  assert.equal(parseArgs(['--matrix']).fakeCatalogue, false);
  assert.equal(parseArgs(['--fake-catalogue']).fakeCatalogue, true);
});

test('flag order does not change the parse', () => {
  const a = parseArgs(['--dry-run', '--tier', 'basic', '--limit', '3']);
  const b = parseArgs(['--limit', '3', '--tier', 'basic', '--dry-run']);
  assert.deepEqual(a, b);
});

/* ==========================================================================
 * THE MANIFEST'S NEGATIVE-SET CONTRACT, and the dry run's honesty about it.
 *
 * Added 2026-09-14 with `expect`. These assertions are about data rather than
 * code, which is unusual and deliberate: `manifest.json` is the answer key, an
 * answer key is exactly the file that gets edited quietly, and a wrong `expect`
 * has no symptom at all -- a produce row flipped to 'identify' does not crash,
 * it just removes the false-positive rate from the report and nobody notices.
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FakeIdentifier, type ManifestRow } from '../eval/run.ts';
import type { PickCandidateRow } from '../src/model.ts';

const MANIFEST = JSON.parse(
  readFileSync(fileURLToPath(new URL('../eval/manifest.json', import.meta.url)), 'utf8'),
) as ManifestRow[];

test("every manifest row declares what a correct answer looks like", () => {
  for (const r of MANIFEST) {
    assert.ok(
      r.expect === 'identify' || r.expect === 'refuse',
      `${r.file} carries expect=${String(r.expect)}`,
    );
  }
});

test('the twenty loose-produce rows ARE the negative set, and nothing else is', () => {
  // D-096: produce has no barcode, so it has no catalogue row, so the only
  // correct answer is a refusal. Photographing these as a retrieval test asks a
  // question with no right answer.
  const refuse = MANIFEST.filter((r) => r.expect === 'refuse');
  assert.equal(refuse.length, 20);
  for (const r of refuse) {
    assert.equal(r.kind, 'produce', `${r.file} is a refuse row but not produce`);
    assert.equal(r.code, null, `${r.file} is a refuse row carrying a code`);
  }
  assert.equal(MANIFEST.filter((r) => r.kind === 'produce').length, 20);
});

test("every expect:'identify' row carries a code to be identified as", () => {
  // Without a code there is nothing to be right about, and `attribute()` would
  // be comparing null to null.
  for (const r of MANIFEST.filter((r) => r.expect === 'identify')) {
    assert.ok(r.code, `${r.file} expects an identification but has no code`);
  }
});

test('the tech rows stay expect:\'identify\', because re-pointing them is an answer-key change', () => {
  // D-096 records that all twenty tech codes are absent from the catalogue and
  // from both Open Facts APIs. That makes the answer key broken, not the
  // expectation wrong: they are real products the catalogue SHOULD hold. The
  // runner says so in its own output rather than the manifest being quietly
  // re-scoped to make the report look clean.
  const tech = MANIFEST.filter((r) => r.kind === 'tech');
  assert.equal(tech.length, 20);
  for (const r of tech) assert.equal(r.expect, 'identify');
});

/* ------------------------------------------------ the dry run cannot fake a pass */

function row(over: Partial<ManifestRow> = {}): ManifestRow {
  return {
    code: null,
    file: 'photos/produce-01.jpg',
    brand: null,
    name: null,
    size: null,
    kind: 'produce',
    expect: 'refuse',
    category: null,
    ...over,
  };
}

const CANDIDATES: readonly PickCandidateRow[] = [
  { index: 0, code: 'X', brand: 'Heinz', name: 'Tomato Ketchup', size: '750 mL', category: null },
  { index: 1, code: 'Y', brand: 'Heinz', name: 'Tomato Ketchup', size: '1.5 L', category: null },
];

test('the dry-run fake invents no product for a row with no brand, name or code', async () => {
  // The fake echoes the manifest's answer back. A refuse row that HAS no answer
  // must therefore echo nothing -- not a plausible brand, which is precisely the
  // behaviour the negative set exists to catch in a real model.
  const reading = await new FakeIdentifier(row()).read();
  assert.deepEqual(reading.product.front_text, []);
  assert.equal(reading.product.brand, null);
  assert.equal(reading.product.name, null);
  assert.equal(reading.product.barcode_digits, null);
  assert.equal(reading.product.self_confidence, 'low');
  // fromCrop builds `readAs` from brand+name+variant; empty means 'unreadable',
  // which is a refusal, which is the honest outcome for an unlabelled thing.
  assert.equal([reading.product.brand, reading.product.name].filter(Boolean).join(' '), '');
});

test('a produce row with a name still echoes the name, because that is what a camera would see', async () => {
  // Not everything on the negative set is unreadable. A banana IS legible; what
  // makes it a refuse row is that no catalogue row exists for it. Blanking the
  // name here would test the wrong thing -- an unreadable photo instead of a
  // readable product that is absent from the catalogue.
  const reading = await new FakeIdentifier(row({ name: 'Banana' })).read();
  assert.equal(reading.product.name, 'Banana');
  assert.deepEqual(reading.product.front_text, ['Banana']);
});

test('the dry-run pick CANNOT manufacture a refusal on a refuse row', async () => {
  /*
   * THE TRAP THIS CLOSES. The oracle works by finding `row.code` among the
   * candidates. On a refuse row that code is null, nothing matches, and the
   * oracle would abstain -- which scores as a correct refusal. Every produce row
   * would refuse, the false-positive rate would print 0%, and the number would be
   * a property of this class rather than of the product.
   *
   * So it takes the cascade top instead: pessimistic, still not a measurement,
   * but incapable of flattering.
   */
  const reading = await new FakeIdentifier(row({ name: 'Banana' })).pick(
    new Uint8Array(),
    CANDIDATES,
  );
  assert.equal(reading.pick.chosen_index, 0);
  assert.notEqual(reading.pick.chosen_index, null);
  assert.match(reading.pick.why, /no oracle/);
});

test('the oracle still works for an identify row, so the ceiling number is unchanged', async () => {
  const reading = await new FakeIdentifier(
    row({ code: 'Y', expect: 'identify', name: 'Tomato Ketchup', brand: 'Heinz' }),
  ).pick(new Uint8Array(), CANDIDATES);
  assert.equal(reading.pick.chosen_index, 1);
});
