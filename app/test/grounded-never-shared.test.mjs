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
import { test, before, after } from 'node:test';
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

test('the photo route never asks Google, because the photo path is the storable one', () => {
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
  const handler = src.slice(start, end);
  assert.ok(!handler.includes('groundedOnce'), 'the photo route reaches for a grounded provider');
  assert.ok(!handler.includes('answerWithGrounded'), 'the photo route serves a grounded block');
});

test('toWire is called in exactly one place in the repo', () => {
  // The one helper is where the cross-user check, the anonymous check, the
  // Search Suggestions check and the "shown" mark all happen. A second caller
  // is a second door with none of them on it.
  const callers = [];
  for (const rel of [...filesUnder('app/src'), 'app/server.ts']) {
    const body = code(read(rel));
    if (rel === 'app/src/grounded-record.ts') continue; // declares the type, calls nothing
    if (/\btoWire\s*\(/.test(body)) callers.push(rel);
  }
  assert.deepEqual(callers, ['app/server.ts']);
  const calls = code(read('app/server.ts')).match(/\btoWire\s*\(/g) ?? [];
  assert.equal(calls.length, 1, 'server.ts calls toWire more than once');
});

/* ------------------------------ over a real socket ----------------------- */

const MARKER = 'GROUNDED-MARKER-7f3a';

/** Lane L2's module, faked to its documented contract. */
const fakeModule = {
  toWire(box, requestedBy) {
    if (!requestedBy || requestedBy === 'anonymous') throw new Error('anonymous device');
    if (box.owner !== requestedBy) throw new Error('cross-user request');
    return {
      kind: 'grounded',
      forDevice: requestedBy,
      fetchedAt: '2026-09-14T00:00:00.000Z',
      block: { text: `${MARKER} the shop down the road wants 4.99` },
      suggestionsHtml: `<div class="container">${MARKER}</div>`,
    };
  },
  historyText(box, owner) {
    if (box.owner !== owner) throw new Error('cross-user request');
    return box.text;
  },
  discard() {},
};

const dir = mkdtempSync(join(tmpdir(), 'shin-grounded-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_GEMINI_TIER;

const { server, setGroundedForTests } = await import('../server.ts');
const { setGroundedModuleForTests } = await import('../src/grounded-record.ts');

let port = 0;

before(async () => {
  if (!server.listening) await new Promise((r) => server.once('listening', () => r()));
  port = server.address().port;
  setGroundedModuleForTests(fakeModule);
  setGroundedForTests({
    name: 'fake',
    async lookupBarcode(_gtin, forDevice) {
      return { owner: forDevice, text: `${MARKER} history` };
    },
    async lookupPrice(_query, forDevice) {
      return { owner: forDevice, text: `${MARKER} history` };
    },
  });
});

after(async () => {
  setGroundedForTests(null);
  setGroundedModuleForTests(null);
  await new Promise((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

test('a price answer carries the grounded block as a sibling, never inside the evidence', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/price`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gtin: '0068100084245', deviceId: 'device-A', askingCents: 499 }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.grounded?.kind, 'grounded', 'the grounded block is not at the top level of the answer');
  assert.equal(body.grounded.forDevice, 'device-A');
  // The terms require Google's rendered Search Suggestions to travel with the
  // result, verbatim. An empty one is a result that may not be displayed.
  assert.ok(body.grounded.suggestionsHtml.length > 0);

  // Our arithmetic and Google's answer are two sections, never one list.
  for (const key of ['evidence', 'offers', 'alternatives']) {
    const section = JSON.stringify(body[key] ?? null);
    assert.ok(!section.includes(MARKER), `a grounded value reached ${key}`);
    assert.ok(!section.includes('grounded'), `${key} names a grounded result`);
  }
});

test('the verdict itself is untouched by whether Google answered', async () => {
  const ask = (deviceId) =>
    fetch(`http://127.0.0.1:${port}/api/price`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gtin: '0068100084245', deviceId, askingCents: 499 }),
    }).then((r) => r.json());

  // An anonymous device gets no grounded lookup at all: there is no end user
  // to show it to. Everything else about the answer is identical.
  const withGoogle = await ask('device-A');
  const without = await ask('');
  assert.ok(!('grounded' in without), 'an anonymous device was served a grounded result');
  delete withGoogle.grounded;
  // Two calls milliseconds apart, so the one field that is a clock is dropped
  // from both rather than frozen: what is being asserted is that the verdict
  // is the same answer, not that time stood still.
  delete withGoogle.producedAt;
  delete without.producedAt;
  assert.deepEqual(withGoogle, without);
});

/* ------------------------- the free key never serves a user -------------- */

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: p } = probe.address();
      probe.close(() => resolve(p));
    });
  });
}

test('the server refuses to start on a free Gemini key', async () => {
  /*
   * Google's free tier trains on what is sent to it. The eval uses a free key
   * on public photographs; a shopper's own photograph must never reach it, and
   * the two differ by one environment variable in the same tree. A warning
   * would scroll away, so it is a refusal before the port is opened.
   */
  const p = await freePort();
  const sandbox = mkdtempSync(join(tmpdir(), 'shin-free-tier-'));
  const child = spawn(process.execPath, ['server.ts'], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORT: String(p),
      SHIN_GEMINI_TIER: 'free',
      SHIN_SCANS: join(sandbox, 'scans.db'),
      SHIN_CORRECTIONS: join(sandbox, 'corrections.db'),
      SHIN_CATALOGUE: join(sandbox, 'no-catalogue.db'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += String(d);
  });
  /*
   * KILLED WHETHER OR NOT IT BEHAVED. If the guard is ever removed, the child
   * comes up and stays up: the wait below gives up after twenty seconds, but a
   * live child with pipes attached keeps the whole test process alive, so a
   * failing assertion would become a hung suite that reports nothing. Measured
   * on this file while writing it. The finally is the fix.
   */
  let exit;
  try {
    exit = await new Promise((resolve, reject) => {
      const fail = setTimeout(() => reject(new Error('the server did not exit in 20 seconds')), 20_000);
      child.on('exit', (codeOut) => {
        clearTimeout(fail);
        resolve(codeOut);
      });
      child.on('error', reject);
    });
  } finally {
    child.kill();
  }
  assert.equal(exit, 1, 'a free key did not stop the start');
  assert.match(stderr, /SHIN_GEMINI_TIER/);
  // The sentence says WHY, because the person reading it is about to wonder
  // whether to just unset the guard.
  assert.match(stderr, /trains/);
  assert.match(stderr, /Nothing was changed on disk/);
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});
