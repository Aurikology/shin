/**
 * A Grounded Result goes to one person and reaches nothing else in this repo.
 *
 * Google's terms (https://ai.google.dev/gemini-api/terms, effective
 * 2026-03-23) say a Grounded Result is never cached, never analysed, never
 * learned from, and shown only to the end user who submitted the prompt. The
 * one thing we may do is keep the text, for two years, in that person's own
 * history so they can read their own history back.
 *
 * Every one of those is a NEGATIVE about code that does not exist yet, which
 * is the hardest kind of rule to keep and the easiest kind to break by
 * accident six weeks from now with a helpful refactor. So this file is mostly
 * assertions about source read off disk, in the shape `refusal-swaps.test.mjs`
 * and `wire-seam.test.mjs` already use: a claim is computed from the code, not
 * restated as prose near it.
 *
 * WHAT WOULD BREAK IF THESE WERE ONLY PROSE. A grounded price in `offers` gets
 * averaged into a verdict, stored in the price spine, and shipped in the
 * offline pack to every device -- three breaches, none of them visible on any
 * screen, from one plausible line. The packages that would do it are the ones
 * asserted below to be unable even to name the type.
 *
 * COMMENTS ARE STRIPPED BEFORE THE CODE CHECKS. A file that explains in a
 * comment why it does not touch a column is the opposite of a leak, and a
 * check that cannot tell a mention from a use forces the explanations out of
 * the files that most need them. The stripper is deliberately crude; nothing
 * it runs over has a `//` inside a string literal, and if that ever changes
 * these tests get noisier rather than quieter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const APP_DIR = fileURLToPath(new URL('../', import.meta.url));

const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

/** Block comments first, then line comments, so a URL inside a block goes with it. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function filesUnder(rel) {
  return readdirSync(join(REPO, rel), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|mjs|js)$/.test(e.name))
    .map((e) => join(e.parentPath ?? e.path, e.name).slice(join(REPO, rel).length + 1))
    .map((name) => `${rel}/${name.split('\\').join('/')}`);
}

/* ------------------- the packages that may not name the type ------------- */

test('the catalogue and the price engine cannot even say the word', () => {
  // These two are where a grounded value would do real damage: the catalogue
  // is the shared answer store and the spine is what the verdict is computed
  // from. Neither may hold one, so neither may import the type that carries
  // one, so neither may contain the word at all.
  const offenders = [];
  for (const rel of [...filesUnder('catalogue/src'), ...filesUnder('price/src')]) {
    const source = read(rel);
    if (/grounded/i.test(source)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `a package that must never hold a Grounded Result names one: ${offenders.join(', ')}`);
});

test('nothing outside app/src imports the grounded module', () => {
  const offenders = [];
  for (const rel of [...filesUnder('catalogue/src'), ...filesUnder('price/src'), ...filesUnder('spine/src')]) {
    if (/grounded\.ts/.test(read(rel))) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

/* --------------------------- the column has one owner -------------------- */

test('grounded_json is written and read by exactly one file', () => {
  /*
   * Two files may name the column in code and the difference between them is
   * the whole point:
   *
   *   migrations.ts DECLARES it. A column has to be created somewhere, and
   *   that file is append-only and runs no queries.
   *
   *   grounded-record.ts USES it, and is the only file that may: it checks the
   *   scan row's own device_id before it writes, and it is where the two-year
   *   rule and the hour-old reaper live.
   *
   * Anything else naming the column in code is a second writer or a second
   * reader, and a second reader is how a Grounded Result reaches somebody who
   * did not ask for it.
   */
  const allowed = new Set(['app/src/migrations.ts', 'app/src/grounded-record.ts']);
  const offenders = [];
  for (const rel of [
    ...filesUnder('app/src'),
    'app/server.ts',
    ...filesUnder('catalogue/src'),
    ...filesUnder('price/src'),
    ...filesUnder('spine/src'),
  ]) {
    if (allowed.has(rel)) continue;
    if (/grounded_json/.test(code(read(rel)))) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `grounded_json is named in code outside its one owner: ${offenders.join(', ')}`);
});

test('the migration only declares the column, it never queries it', () => {
  // The allowance above is for a DDL file. If a SELECT or an UPDATE ever
  // appears there, that allowance is covering a second reader.
  for (const line of code(read('app/src/migrations.ts')).split('\n')) {
    if (!line.includes('grounded_json')) continue;
    assert.ok(!/\bSELECT\b|\bUPDATE\b/i.test(line), `migrations.ts queries grounded_json: ${line.trim()}`);
  }
});

/* ---------------------- no export syndicates it anywhere ----------------- */

test('no export, admin view, summary or offline pack carries a grounded result', () => {
  // Every one of these turns rows into something that leaves the machine or
  // reaches a person who is not the one who asked: a JSON-lines export, the
  // admin views, the scan summary, the share pack and the offline catalogue
  // pack. "Not cached, not analysed, shown only to the end user" rules out all
  // five, and the check is the word, not the column, because a summary that
  // counts grounded answers is still analysis.
  for (const rel of [
    'app/src/export-events.ts',
    'app/src/admin.ts',
    'app/src/scan-summary.ts',
    'app/src/pack-route.ts',
    'catalogue/src/export-pack.ts',
  ]) {
    assert.ok(!/grounded/i.test(read(rel)), `${rel} mentions a grounded result`);
  }
});

/* ------------------------- the photo path is ungrounded ------------------ */

test('the photo route serves no grounded block, because the photo path is the storable one', () => {
  /*
   * The photo route is the one that produces an answer this repo keeps: it
   * writes `model_json`, it feeds the catalogue, and its output is ordinary
   * model output that may be stored and learned from. A grounded call on that
   * route would make the one storable path the one path whose output may not
   * be stored, and the two would be indistinguishable in the row afterwards.
   */
  const src = read('app/server.ts');
  const start = src.indexOf("url.pathname === '/api/identify/photo'");
  const end = src.indexOf("url.pathname === '/api/price'");
  assert.ok(start > 0 && end > start, 'the photo and price handlers moved; re-read this file');
  const handler = code(src.slice(start, end));
  /*
   * CHANGED 2026-09-15. The route may now START the price search
   * (`prefetchPrice`), so the search runs while the shopper types the shelf
   * price (Jamin: keep the wait short). What still holds is the point of this
   * test: nothing grounded is served from here or written into `model_json`;
   * the answer arrives on `/api/price`.
   */
  assert.ok(!handler.includes('answerWithGrounded'), 'the photo route serves a grounded block');
  assert.ok(!/lookupPrice\s*\(|lookupBarcode\s*\(/.test(handler), 'the photo route waits on a grounded answer');
  const modelJson = handler.slice(handler.indexOf('const modelJson'), handler.indexOf('const reachedModel'));
  assert.ok(!/grounded/i.test(modelJson), 'model_json names a grounded result');
});

test('toWire has no caller in the server: the only door that opened a Grounded Result is gone', () => {
  // The one helper is where the cross-user check, the anonymous check, the
  // Search Suggestions check and the "shown" mark all happen. A second caller
  // is a second door with none of them on it.
  const callers = [];
  for (const rel of [...filesUnder('app/src'), 'app/server.ts']) {
    const body = code(read(rel));
    if (rel === 'app/src/grounded-record.ts') continue; // declares the type, calls nothing
    if (/\btoWire\s*\(/.test(body)) callers.push(rel);
  }
  assert.deepEqual(callers, []);
  const calls = code(read('app/server.ts')).match(/\btoWire\s*\(/g) ?? [];
  assert.equal(calls.length, 0, 'server.ts calls toWire');
});
