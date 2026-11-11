/**
 * V8 coverage over app/public/js, folded per source file.
 *
 * The fake browser loads every app module afresh for each launch, under a URL ending `?inst=N`, so
 * one file is many scripts to V8. Each run's coverage is read (and V8's counters reset) as soon as
 * the run ends, then folded onto the file by character: a character counts as covered if it ran in
 * ANY launch. A function counts as covered if it was entered in any launch.
 *
 * LINES. A line is executable when it holds at least one real token (not a comment, not blank), found
 * with TypeScript's parser, so a file's long header comments do not pad the percentage.
 */
import inspector from 'node:inspector';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const JS_ROOT = fileURLToPath(new URL('../../../app/public/js/', import.meta.url));
const JS_ROOT_URL = pathToFileURL(JS_ROOT).href;

const require = createRequire(import.meta.url);
let ts = null;
function typescript() {
  if (ts) return ts;
  ts = require(fileURLToPath(new URL('../../../spine/node_modules/typescript/lib/typescript.js', import.meta.url)));
  return ts;
}

/** Every .js file under public/js, as repo-relative-to-JS_ROOT paths with forward slashes. */
export function appFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) out.push(relative(JS_ROOT, p).replace(/\\/g, '/'));
    }
  };
  walk(JS_ROOT);
  return out.sort();
}

let session = null;

/** Start precise coverage in this thread. Call before the first app module is imported. */
export function startCoverage() {
  if (session) return;
  session = new inspector.Session();
  session.connect();
  session.post('Profiler.enable');
  session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
}

function postAsync(method, params) {
  return new Promise((resolve, reject) => session.post(method, params, (err, res) => (err ? reject(err) : resolve(res))));
}

/** An empty accumulator: file -> { covered: Uint8Array over characters, fns: Map "start:end:name" -> 0|1 }. */
export function newAccumulator() {
  return new Map();
}

/** Read the counters since the last read, fold them into `acc`, and let V8 reset them. */
export async function foldCoverage(acc) {
  if (!session) return;
  const { result } = await postAsync('Profiler.takePreciseCoverage');
  for (const script of result) {
    if (!script.url.startsWith(JS_ROOT_URL)) continue;
    const file = script.url.slice(JS_ROOT_URL.length).replace(/\?.*$/, '');
    let entry = acc.get(file);
    if (!entry) {
      const text = readFileSync(join(JS_ROOT, file), 'utf8');
      entry = { covered: new Uint8Array(text.length + 1), fns: new Map() };
      acc.set(file, entry);
    }
    const ranges = [];
    for (const fn of script.functions) {
      const first = fn.ranges[0];
      const fkey = `${first.startOffset}:${first.endOffset}:${fn.functionName}`;
      // The module's own top level is the one function that starts at offset 0 with no name; it is not a function of the app.
      if (!(fn.functionName === '' && first.startOffset === 0)) {
        const old = entry.fns.get(fkey) ?? 0;
        entry.fns.set(fkey, old || (first.count > 0 ? 1 : 0));
      }
      for (const r of fn.ranges) ranges.push(r);
    }
    // Outer ranges first, inner ranges override: sort by start, then longer first.
    ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    const counts = new Uint8Array(entry.covered.length);
    for (const r of ranges) counts.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(r.endOffset, counts.length));
    for (let i = 0; i < counts.length; i += 1) if (counts[i]) entry.covered[i] = 1;
  }
}

/** A plain, transferable form of an accumulator (for a child process to send to its parent). */
export function packAccumulator(acc) {
  const out = {};
  for (const [file, e] of acc) {
    const spans = [];
    let start = -1;
    for (let i = 0; i <= e.covered.length; i += 1) {
      const on = i < e.covered.length && e.covered[i] === 1;
      if (on && start < 0) start = i;
      if (!on && start >= 0) { spans.push([start, i]); start = -1; }
    }
    out[file] = { len: e.covered.length, spans, fns: [...e.fns] };
  }
  return out;
}

/** Merge a packed accumulator into `acc`. */
export function mergePacked(acc, packed) {
  for (const [file, p] of Object.entries(packed)) {
    let entry = acc.get(file);
    if (!entry) { entry = { covered: new Uint8Array(p.len), fns: new Map() }; acc.set(file, entry); }
    for (const [a, b] of p.spans) entry.covered.fill(1, a, b);
    for (const [k, v] of p.fns) entry.fns.set(k, (entry.fns.get(k) ?? 0) || v);
  }
}

/** Lines that hold code, and the function count, for one file (from the parser, so it works for files never loaded). */
function describeSource(file) {
  const text = readFileSync(join(JS_ROOT, file), 'utf8');
  const T = typescript();
  const sf = T.createSourceFile(file, text, T.ScriptTarget.ES2022, true, T.ScriptKind.JS);
  const lineStarts = sf.getLineStarts();
  const codeLines = new Set();
  let fnCount = 0;
  const markRange = (a, b) => {
    const l1 = sf.getLineAndCharacterOfPosition(a).line;
    const l2 = sf.getLineAndCharacterOfPosition(Math.max(a, b - 1)).line;
    for (let l = l1; l <= l2; l += 1) codeLines.add(l);
  };
  const visit = (node) => {
    if (node.getChildCount(sf) === 0 && node.kind !== T.SyntaxKind.EndOfFileToken) markRange(node.getStart(sf), node.getEnd());
    else if (T.isTemplateLiteral?.(node) || node.kind === T.SyntaxKind.NoSubstitutionTemplateLiteral) markRange(node.getStart(sf), node.getEnd());
    if (T.isFunctionLike(node) && node.body) fnCount += 1;
    for (const c of node.getChildren(sf)) visit(c);
  };
  visit(sf);
  return { text, lineStarts, codeLines, fnCount };
}

/** Per-file and total line/function coverage from an accumulator. Files never loaded count as 0%. */
export function summarise(acc) {
  const files = [];
  let linesTotal = 0;
  let linesHit = 0;
  let fnsTotal = 0;
  let fnsHit = 0;
  const uncovered = [];
  for (const file of appFiles()) {
    const d = describeSource(file);
    const entry = acc.get(file);
    let lt = 0;
    let lh = 0;
    for (const line of d.codeLines) {
      lt += 1;
      if (!entry) continue;
      const a = d.lineStarts[line];
      const b = d.lineStarts[line + 1] ?? d.text.length;
      for (let i = a; i < b; i += 1) {
        if (entry.covered[i] && !/\s/.test(d.text[i])) { lh += 1; break; }
      }
    }
    const ft = entry ? entry.fns.size : d.fnCount;
    let fh = 0;
    if (entry) for (const v of entry.fns.values()) fh += v;
    files.push({ file, loaded: Boolean(entry), lines: [lh, lt], fns: [fh, ft] });
    if (entry) {
      for (const [k, v] of entry.fns) {
        if (v) continue;
        const [a, b, ...nm] = k.split(":");
        const l1 = Number(a), l2 = Number(b);
        const lineOf = (pos) => { let lo = 0, hi = d.lineStarts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (d.lineStarts[m] <= pos) lo = m; else hi = m - 1; } return lo + 1; };
        uncovered.push({ file, name: nm.join(":") || "(anonymous)", line: lineOf(l1), lines: lineOf(l2) - lineOf(l1) + 1 });
      }
    }
    linesTotal += lt; linesHit += lh; fnsTotal += ft; fnsHit += fh;
  }
  uncovered.sort((a, b) => b.lines - a.lines);
  return { files, lines: [linesHit, linesTotal], fns: [fnsHit, fnsTotal], uncovered: uncovered.slice(0, 40) };
}
