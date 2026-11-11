#!/usr/bin/env node
/**
 * THE SCORECARD: how many real Pexi bug shapes do the new checks catch that the old suites do not?
 *
 *   node scripts/scorecard/run.mjs [--only M01,M07] [--control-only] [--sequential] [--force] [--report <path>]
 *
 * For each mutation in scripts/scorecard/mutations/ (one JSON edit spec per bug, each naming its DEFECTS row):
 *   - a CODE bug is planted by editing the current code (exact find/replace, the fix hunk reverted), every
 *     catcher is run, and the files are put back with `git checkout`;
 *   - a DATA bug is planted as rows in a temp prices file (scripts/scorecard/data-child.mjs), never as a code
 *     change. Only the price data rules can read a prices file, so the other catchers are not run for it: they
 *     are recorded as "blind" and carry the control result.
 * Catchers (a bug is CAUGHT by a catcher when the catcher goes red where the control was green):
 *   answer key  app/test/answer-key.test.ts (synthetic mode)
 *   data rules  scripts/test/data-checks.test.mjs + the rules on a clean temp prices file (code bugs);
 *               the rules on the temp prices file with the planted rows (data bugs)
 *   crawler     scripts/crawler/crawl.mjs --runs 150 --steps 25 --seed 1; caught on exit 1 or on any
 *               non-expected failure the control run did not have
 *   old suites  `npm test` in app (minus the two new checks' own test files) + `npm run test:ux` in app +
 *               `npm test` in price
 * The control (no mutation) must be green on every catcher first, or the run stops.
 *
 * After every mutation, and at the end, `git status` must be clean apart from scripts/scorecard/; a leftover
 * is a loud failure (exit 1). Real data folders (app/data, price/data, catalogue/data, data/) are never touched:
 * mutation edits may not name a path under a `data` folder, and every temp file is under the system temp folder.
 * Writes scripts/scorecard/report.md (or --report).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SC_DIR = join(ROOT, 'scripts', 'scorecard');
const MUT_DIR = join(SC_DIR, 'mutations');
const NODE = process.execPath;
const CMD_TIMEOUT_MS = 10 * 60 * 1000;
const SETUP = '--test-global-setup=test/setup/global.mjs';
/** The new checks' own test files: not part of the old-suite catcher (they are the new catchers' tests). */
const NEW_CHECK_TESTS = new Set(['answer-key.test.ts', 'crawler.test.mjs']);

const { values: opts } = parseArgs({
  options: {
    only: { type: 'string' },
    'control-only': { type: 'boolean' },
    sequential: { type: 'boolean' },
    force: { type: 'boolean' },
    report: { type: 'string' },
  },
  strict: true,
});

/* ------------------------------------------------------------------ small helpers */

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s] ${m}`);
const secs = (ms) => `${(ms / 1000).toFixed(0)}s`;

function git(...args) {
  const r = spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.error}`);
  return r.stdout;
}

/** Lines of `git status` that are not scorecard files. Empty means clean. */
function leftovers() {
  return git('status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .filter((l) => !l.slice(3).replace(/\\/g, '/').startsWith('scripts/scorecard/'));
}

function assertClean(where) {
  const left = leftovers();
  if (left.length > 0) {
    console.error(`SCORECARD FAILED: git status is not clean ${where}:\n${left.join('\n')}`);
    process.exit(1);
  }
}

/** Run a command, capture its output, never throw. */
function runCmd(args, { cwd = ROOT, env = {} } = {}) {
  return new Promise((done) => {
    const started = Date.now();
    const child = spawn(NODE, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const keep = (b) => { out += b.toString('utf8'); if (out.length > 4_000_000) out = out.slice(-2_000_000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, CMD_TIMEOUT_MS);
    child.on('error', (e) => { clearTimeout(timer); done({ code: -1, out: `${out}\nspawn error: ${e.message}`, ms: Date.now() - started, timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); done({ code: timedOut ? -2 : code, out, ms: Date.now() - started, timedOut }); });
  });
}

/** Repo-relative test files named in a node:test run's output (the "test at file:///..." location lines). */
function failedFiles(out) {
  const found = new Set();
  for (const m of out.matchAll(/file:\/\/\/[^\s'")]+?\.test\.(?:ts|mjs)/g)) {
    try {
      found.add(relative(ROOT, fileURLToPath(m[0])).split(sep).join('/'));
    } catch { /* not a file url */ }
  }
  return [...found].sort();
}

const testSummary = (out) => {
  const g = (k) => Number((out.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) ?? [])[1] ?? NaN);
  return { tests: g('tests'), pass: g('pass'), fail: g('fail') };
};

/* ------------------------------------------------------------------ mutations */

function loadMutations() {
  const all = readdirSync(MUT_DIR).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: join(MUT_DIR, f), ...JSON.parse(readFileSync(join(MUT_DIR, f), 'utf8')) }));
  const only = opts.only ? new Set(opts.only.split(',')) : null;
  return only ? all.filter((m) => only.has(m.id)) : all;
}

/** Plant a code mutation: exact find/replace, each find must occur exactly `count` times. Returns the files touched. */
function plant(m) {
  const touched = new Set();
  try {
    for (const e of m.edits) {
      const rel = e.file.replace(/\\/g, '/');
      if (rel.split('/').includes('data')) throw new Error(`${m.id}: refusing to edit a path under a data folder: ${rel}`);
      const tracked = git('ls-files', '--', rel).trim();
      if (tracked !== rel) throw new Error(`${m.id}: ${rel} is not a tracked file`);
      const abs = join(ROOT, rel);
      const text = readFileSync(abs, 'utf8');
      const crlf = text.includes('\r\n');
      const find = crlf ? e.find.replace(/\r?\n/g, '\r\n') : e.find;
      const replace = crlf ? e.replace.replace(/\r?\n/g, '\r\n') : e.replace;
      const n = text.split(find).length - 1;
      if (n !== (e.count ?? 1)) throw new Error(`${m.id}: expected ${e.count ?? 1} match(es) of the find text in ${rel}, found ${n}`);
      writeFileSync(abs, text.split(find).join(replace), 'utf8');
      touched.add(rel);
    }
  } catch (err) {
    revert([...touched]);
    throw err;
  }
  return [...touched];
}

function revert(files) {
  if (files.length > 0) git('checkout', '--', ...files);
}

let plantedNow = [];
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try { revert(plantedNow); } catch { /* best effort */ }
    process.exit(130);
  });
}

/* ------------------------------------------------------------------ catchers */

const appTestFiles = () => readdirSync(join(ROOT, 'app', 'test')).filter((f) => /\.test\.(ts|mjs)$/.test(f) && !NEW_CHECK_TESTS.has(f)).sort();

async function catchOldSuites() {
  const [app, ux, price] = await Promise.all([
    runCmd(['--test', SETUP, ...appTestFiles().map((f) => `test/${f}`)], { cwd: join(ROOT, 'app') }),
    runCmd(['--test', SETUP, 'test/ux/*.test.mjs'], { cwd: join(ROOT, 'app') }),
    runCmd(['--test', 'test/*.test.ts'], { cwd: join(ROOT, 'price') }),
  ]);
  const parts = { app, ux, price };
  const red = Object.entries(parts).filter(([, r]) => r.code !== 0);
  const files = [...new Set(red.flatMap(([, r]) => failedFiles(r.out)))].sort();
  return {
    caught: red.length > 0,
    files,
    detail: Object.entries(parts).map(([k, r]) => `${k}: exit ${r.code}${r.timedOut ? ' TIMEOUT' : ''} ${JSON.stringify(testSummary(r.out))}`).join('; '),
    ms: Math.max(app.ms, ux.ms, price.ms),
    tail: red.map(([k, r]) => `--- ${k}\n${r.out.slice(-1500)}`).join('\n'),
  };
}

async function catchAnswerKey() {
  const r = await runCmd(['--test', SETUP, 'test/answer-key.test.ts'], { cwd: join(ROOT, 'app') });
  return { caught: r.code !== 0, files: r.code !== 0 ? failedFiles(r.out) : [], detail: `exit ${r.code} ${JSON.stringify(testSummary(r.out))}`, ms: r.ms, tail: r.code !== 0 ? r.out.slice(-1500) : '' };
}

function parseChild(out) {
  const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  if (!line) return { error: out.slice(-800) };
  return JSON.parse(line);
}

/** `spec` is a data mutation file, or null for the clean baseline plus the data rules' own test file. */
async function catchDataRules(spec) {
  const dir = mkdtempSync(join(tmpdir(), 'scorecard-data-'));
  try {
    const child = await runCmd(['--no-warnings', 'scripts/scorecard/data-child.mjs', '--dir', dir, ...(spec ? ['--spec', spec] : [])]);
    const res = parseChild(child.out);
    const counts = res.counts ?? {};
    const fired = Object.entries(counts).filter(([, n]) => n > 0).map(([id, n]) => `${id}=${n}`);
    let testRed = false;
    let testNote = '';
    if (!spec) {
      const t = await runCmd(['--test', 'scripts/test/data-checks.test.mjs']);
      testRed = t.code !== 0;
      testNote = `; rules' own test exit ${t.code} ${JSON.stringify(testSummary(t.out))}`;
    }
    const broken = res.error !== undefined || child.code !== 0 || (res.errors ?? []).length > 0;
    const caught = broken || fired.length > 0 || res.exit === 1 || testRed;
    return {
      caught,
      files: [],
      fired,
      detail: res.error ? `child failed: ${res.error}` : `rules fired: ${fired.join(', ') || 'none'}; exit ${res.exit}${testNote}`,
      ms: child.ms,
      tail: res.error ?? '',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function catchCrawler(controlSigs) {
  const dir = mkdtempSync(join(tmpdir(), 'scorecard-crawl-'));
  try {
    const r = await runCmd(['scripts/crawler/crawl.mjs', '--runs', '150', '--steps', '25', '--seed', '1', '--out', dir]);
    const jl = join(dir, 'failures.jsonl');
    const lines = existsSync(jl) ? readFileSync(jl, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const real = lines.filter((l) => l.severity !== 'expected');
    const sigs = real.map((l) => ({ sig: l.signature, severity: l.severity }));
    const fresh = controlSigs ? sigs.filter((s) => !controlSigs.some((c) => c.sig === s.sig)) : [];
    // Low-severity tap-does-nothing findings differ between two identical control runs (they depend on timing under load), so they are reported but never make a catch.
    const freshHigh = fresh.filter((f) => f.severity !== 'low');
    const noReport = !existsSync(join(dir, 'report.md'));
    const caught = noReport || r.code !== 0 || freshHigh.length > 0;
    const first = existsSync(join(dir, 'report.md')) ? readFileSync(join(dir, 'report.md'), 'utf8').split('\n')[0] : 'no report written';
    return {
      caught,
      files: [],
      sigs,
      fresh,
      detail: `exit ${r.code}; ${first}${fresh.length ? `; NEW (${freshHigh.length} above low): ${fresh.map((f) => `${f.severity}: ${f.sig}`).join(' | ').slice(0, 400)}` : ''}`,
      ms: r.ms,
      tail: r.code !== 0 && lines.length === 0 ? r.out.slice(-1500) : '',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runProofs(m) {
  const out = [];
  for (const p of m.proofCommands ?? []) {
    const r = await runCmd(p.args, { cwd: join(ROOT, p.cwd) });
    out.push({ label: p.label, red: r.code !== 0, summary: testSummary(r.out) });
  }
  return out;
}

/** Run every catcher on the tree as it is now. */
async function runCatchers(controlSigs, { dataSpec = null, skipBlind = false, sequential = false } = {}) {
  const jobs = {
    old: skipBlind ? null : () => catchOldSuites(),
    key: skipBlind ? null : () => catchAnswerKey(),
    crawler: skipBlind ? null : () => catchCrawler(controlSigs),
    data: () => catchDataRules(dataSpec),
  };
  const names = Object.keys(jobs).filter((k) => jobs[k]);
  const res = {};
  if (sequential) {
    for (const k of names) res[k] = await jobs[k]();
  } else {
    const done = await Promise.all(names.map((k) => jobs[k]()));
    names.forEach((k, i) => { res[k] = done[i]; });
  }
  return res;
}

/* ------------------------------------------------------------------ main */

async function main() {
  assertClean('before the run (the scorecard will not run over uncommitted work)');
  const head = git('rev-parse', '--short', 'HEAD').trim();
  const mutations = loadMutations();
  log(`scorecard on ${head}: ${mutations.length} mutation(s), control first`);

  /* ---- control */
  const control = await runCatchers(null, { sequential: opts.sequential });
  const controlSigs = control.crawler.sigs;
  // The crawler's "caught" on the control means exit != 0 or a failed report, nothing to subtract yet.
  const ctlGreen = {
    'old suites': !control.old.caught,
    'answer key': !control.key.caught,
    'data rules': !control.data.caught,
    crawler: !control.crawler.caught,
  };
  const controlHigh = controlSigs.filter((s) => s.severity === 'high');
  const controlOk = Object.values(ctlGreen).every(Boolean) && controlHigh.length === 0;
  log(`control: ${Object.entries(ctlGreen).map(([k, v]) => `${k} ${v ? 'green' : 'RED'}`).join(', ')}; crawler baseline ${controlSigs.length} non-expected failure(s), ${controlHigh.length} high`);
  assertClean('after the control run');
  if (!controlOk && !opts.force) {
    const lines = Object.entries(control).filter(([, r]) => r.caught).map(([k, r]) => `${k}: ${r.detail}\n${r.tail}`);
    writeReport({ head, control, ctlGreen, controlSigs, results: [], controlOk, totalMs: Date.now() - t0 });
    console.error(`SCORECARD STOPPED: the control run is not green, so the scorecard would mean nothing.\n${lines.join('\n')}`);
    process.exit(1);
  }
  if (opts['control-only']) {
    writeReport({ head, control, ctlGreen, controlSigs, results: [], controlOk, totalMs: Date.now() - t0 });
    return;
  }

  /* ---- mutations */
  const results = [];
  for (const m of mutations) {
    const started = Date.now();
    let touched = [];
    let res;
    let proofs = [];
    try {
      if (m.kind === 'code') {
        touched = plant(m);
        plantedNow = touched;
        log(`${m.id} ${m.defects}: planted in ${touched.join(', ')}`);
        res = await runCatchers(controlSigs, { sequential: opts.sequential });
        proofs = await runProofs(m);
      } else {
        log(`${m.id} ${m.defects}: planting rows in a temp prices file`);
        res = await runCatchers(controlSigs, { dataSpec: m.file, skipBlind: true });
        for (const k of ['old', 'key', 'crawler']) res[k] = { caught: false, blind: true, files: [], detail: 'blind: cannot read a prices file, not run', ms: 0 };
      }
    } finally {
      try { revert(touched); } catch (e) { console.error(`REVERT FAILED for ${m.id}: ${e.message}`); process.exit(1); }
      plantedNow = [];
    }
    assertClean(`after ${m.id}`);
    const own = (m.regressionTests ?? []);
    const redFiles = res.old.files ?? [];
    const proofRed = own.length > 0 && (own.some((f) => redFiles.includes(f)) || proofs.some((p) => p.red));
    const oldOtherThanOwn = res.old.caught && (redFiles.length === 0 || redFiles.some((f) => !own.includes(f)));
    results.push({ m, res, proofs, proofRed, oldOtherThanOwn, ms: Date.now() - started });
    log(`${m.id} done in ${secs(Date.now() - started)}: key ${res.key.caught ? 'CAUGHT' : 'missed'}, data ${res.data.caught ? 'CAUGHT' : 'missed'}, crawler ${res.crawler.caught ? 'CAUGHT' : 'missed'}, old ${res.old.caught ? 'CAUGHT' : 'missed'}`);
  }

  assertClean('at the end of the run');
  writeReport({ head, control, ctlGreen, controlSigs, results, controlOk, totalMs: Date.now() - t0 });
  log('done');
}

/* ------------------------------------------------------------------ report */

function writeReport({ head, control, ctlGreen, controlSigs, results, controlOk, totalMs }) {
  const path = resolve(opts.report ?? join(SC_DIR, 'report.md'));
  const L = [];
  const mark = (r) => (r.blind ? 'missed (blind)' : r.caught ? 'CAUGHT' : 'missed');
  L.push('# Pexi scorecard: how many real bug shapes the new checks catch');
  L.push('');
  L.push(`Run on commit ${head}, ${new Date().toISOString().slice(0, 10)}. Total run time ${(totalMs / 60000).toFixed(1)} min (${secs(totalMs)}).`);
  L.push('');
  L.push('## Control (no mutation)');
  L.push('');
  L.push(`${controlOk ? 'All four catchers green.' : '**NOT GREEN: the scorecard below means nothing.**'}`);
  L.push('');
  L.push('| Catcher | Control | Detail | Time |');
  L.push('| --- | --- | --- | --- |');
  const names = [['answer key', 'key'], ['data rules', 'data'], ['crawler', 'crawler'], ['old suites', 'old']];
  for (const [label, k] of names) L.push(`| ${label} | ${ctlGreen[label] ? 'green' : 'RED'} | ${control[k].detail.replace(/\|/g, '/')} | ${secs(control[k].ms)} |`);
  L.push('');
  L.push(`The crawler's control run reports ${controlSigs.length} non-expected failure(s), none high: ${controlSigs.map((s) => `${s.severity}: ${s.sig}`).join(' | ') || 'none'}. A mutation counts as caught by the crawler on exit 1 or on a non-expected failure above low severity that is not in that list. Low-severity tap-does-nothing findings change between two identical control runs (this run and an earlier one listed different ones), so they are noted and never counted.`);
  L.push('');
  if (results.length === 0) {
    writeFileSync(path, `${L.join('\n')}\n`, 'utf8');
    return;
  }

  L.push('## Matrix: bug by catcher');
  L.push('');
  L.push('| Id | Family | DEFECTS | Bug | Answer key | Data rules | Crawler | Old suites | New | Old |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const rowsOut = results.map(({ m, res }) => {
    const newC = res.key.caught || res.data.caught || res.crawler.caught;
    const oldC = res.old.caught;
    return { m, res, newC, oldC };
  });
  for (const { m, res, newC, oldC } of rowsOut) {
    const short = m.title.length > 90 ? `${m.title.slice(0, 87)}...` : m.title;
    L.push(`| ${m.id} | ${m.family} | ${m.defects} | ${short.replace(/\|/g, '/')} | ${mark(res.key)} | ${mark(res.data)} | ${mark(res.crawler)} | ${mark(res.old)} | ${newC ? 'yes' : 'no'} | ${oldC ? 'yes' : 'no'} |`);
  }
  L.push('');
  L.push('"missed (blind)": a data bug is planted as rows in a temp prices file; only the data rules can read one, so the other three were not run for it.');
  L.push('');

  const n = rowsOut.length;
  const count = (f) => rowsOut.filter(f).length;
  const newOnly = count((r) => r.newC && !r.oldC);
  const oldOnly = count((r) => !r.newC && r.oldC);
  const both = count((r) => r.newC && r.oldC);
  const neither = count((r) => !r.newC && !r.oldC);
  const pct = (x, d = n) => (d === 0 ? 'n/a' : `${Math.round((100 * x) / d)}%`);
  L.push('## Shares');
  L.push('');
  L.push('| | Bugs | Share |');
  L.push('| --- | --- | --- |');
  L.push(`| Caught by the new checks only | ${newOnly} of ${n} | ${pct(newOnly)} |`);
  L.push(`| Caught by the old suites only | ${oldOnly} of ${n} | ${pct(oldOnly)} |`);
  L.push(`| Caught by both | ${both} of ${n} | ${pct(both)} |`);
  L.push(`| Caught by neither | ${neither} of ${n} | ${pct(neither)} |`);
  L.push(`| Caught by any new check | ${newOnly + both} of ${n} | ${pct(newOnly + both)} |`);
  L.push(`| Caught by the old suites | ${oldOnly + both} of ${n} | ${pct(oldOnly + both)} |`);
  L.push('');
  const per = (label, k) => `${label} ${count((r) => r.res[k].caught)}`;
  L.push(`Per catcher, of ${n}: ${per('answer key', 'key')}, ${per('data rules', 'data')}, ${per('crawler', 'crawler')}, ${per('old suites', 'old')}.`);
  L.push('');

  const code = rowsOut.filter((r) => r.m.kind === 'code');
  const cNew = code.filter((r) => r.newC).length;
  const cOld = code.filter((r) => r.oldC).length;
  const cNewOnly = code.filter((r) => r.newC && !r.oldC).length;
  const cOldOnly = code.filter((r) => !r.newC && r.oldC).length;
  const cNeither = code.filter((r) => !r.newC && !r.oldC).length;
  L.push(`Code bugs only (${code.length}; the ${n - code.length} data bugs are visible to the data rules alone): new checks ${cNew}, old suites ${cOld}, new only ${cNewOnly}, old only ${cOldOnly}, neither ${cNeither}.`);
  L.push('');

  L.push('## How much of the old suites\' score is the fix\'s own test');
  L.push('');
  L.push('Each fixed bug came with a regression test in the same commit, so the old suites catch a re-planted fix by construction. This table says whether anything ELSE in the old suites went red, and whether the plant is faithful (the fix\'s own test red).');
  L.push('');
  L.push('| Id | Old suites red files | Old red outside the fix\'s own test | Fix\'s own test red (plant is faithful) |');
  L.push('| --- | --- | --- | --- |');
  for (const { m, res, proofs, proofRed, oldOtherThanOwn } of results.filter((r) => r.m.kind === 'code')) {
    const files = res.old.files.length ? res.old.files.join(', ') : res.old.caught ? '(red, files not parsed)' : 'none';
    const own = (m.regressionTests ?? []).length === 0 ? 'no regression test exists' : proofRed ? 'yes' : 'NO';
    const extra = proofs.length ? ` (${proofs.map((p) => `${p.label}: ${p.red ? 'red' : 'green'}`).join('; ')})` : '';
    L.push(`| ${m.id} | ${files} | ${res.old.caught ? (oldOtherThanOwn ? 'yes' : 'no') : 'n/a'} | ${own}${extra} |`);
  }
  const outside = results.filter((r) => r.m.kind === 'code' && r.oldOtherThanOwn).length;
  L.push('');
  L.push(`Old suites red on a code bug through something other than the fix's own test: ${outside} of ${code.length}.`);
  L.push('');

  L.push('## Bugs caught by neither');
  L.push('');
  const neitherRows = rowsOut.filter((r) => !r.newC && !r.oldC);
  if (neitherRows.length === 0) L.push('None.');
  for (const { m } of neitherRows) L.push(`- ${m.id} ${m.defects} (${m.family}): ${m.ifMissed}`);
  L.push('');

  L.push('## What each catcher saw');
  L.push('');
  for (const { m, res, ms } of results) {
    L.push(`### ${m.id} ${m.defects}: ${m.title}`);
    L.push('');
    L.push(`${m.comment}`);
    L.push('');
    L.push(`Fix commit: ${m.fixCommit}. Run time ${secs(ms)}.`);
    L.push('');
    for (const [label, k] of names) L.push(`- ${label}: ${mark(res[k])}. ${res[k].detail}`.replace(/\n/g, ' '));
    L.push('');
  }
  writeFileSync(path, `${L.join('\n')}\n`, 'utf8');
}

main().catch((e) => {
  console.error(`SCORECARD CRASHED: ${e.stack ?? e}`);
  try { revert(plantedNow); } catch { /* best effort */ }
  process.exit(1);
});
