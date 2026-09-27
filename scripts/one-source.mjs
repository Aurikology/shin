// One ruling, one place, checked. RULINGS.md lists, for every live ruling, the
// wording it retired. A retired phrase that still sits in a file a session reads
// as current (the rules, a status board, a live doc, code) is drift: the next
// session follows the stale line. This finds every such line.
//
// History is allowed to keep old wording: the log (docs/decisions.md), dated
// snapshots, tests and the register itself are never searched.
//
// The repo check (scripts/test/one-source.test.mjs) compares the hits against
// scripts/one-source-baseline.json, a ratchet: a NEW hit fails the build, and a
// baseline entry that no longer hits also fails, so the list can only shrink.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { classify } from './doc-classes.mjs';

export const SEARCHED_CLASSES = new Set(['constitution', 'status', 'live-doc', 'code']);

/**
 * A retired phrase must be specific enough that finding it means the stale
 * rule, not ordinary prose ("reasonable", "leaderboard" hit dozens of innocent
 * lines). Two words (a quoted job title or product name), a digit (model ids,
 * prices, dates), or an identifier or path character (_ / . \ :) is enough. A
 * word too common to search goes on a "Retired wording (why not searched): ..."
 * line, which this parser skips.
 */
export function isVague(phrase) {
  return phrase.trim().split(/\s+/).length < 2 && !/[\d_/.\\:]/.test(phrase);
}

/** Every backticked phrase on a "Retired wording:" line of the register. */
export function parseRetired(registerText) {
  const phrases = new Set();
  for (const line of registerText.split(/\r?\n/)) {
    const m = line.match(/^Retired wording:\s*(.*)$/i);
    if (!m) continue;
    for (const [, phrase] of m[1].matchAll(/`([^`]+)`/g)) {
      const p = phrase.trim();
      if (p) phrases.add(p);
    }
  }
  return [...phrases];
}

/**
 * Lowercase, drop comment and quote markers that start a wrapped line
 * (// * # >), and collapse every run of whitespace, so a phrase split across
 * lines, or across a wrapped code comment, still matches.
 */
export function flatten(text, invisible = '') {
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, invisible) // an invisible character splits a phrase unseen
    .replace(/\n[ \t]*(\/\/+|\*+|#+|>+)/g, '\n')
    .replace(/\s+/g, ' ');
}

/**
 * files: [{ path, text }]. Returns sorted "path :: phrase" strings, one per
 * (file, phrase) pair that matches, case-insensitive. Files outside the
 * searched classes are skipped.
 */
export function findHits(files, phrases) {
  const hits = new Set();
  const lowered = phrases.map((p) => [p, flatten(p)]);
  for (const { path, text } of files) {
    if (!SEARCHED_CLASSES.has(classify(path))) continue;
    // An invisible character may stand in for a space or sit inside a word: try both readings.
    const bodies = [flatten(text, ''), flatten(text, ' ')];
    for (const [phrase, low] of lowered) {
      if (bodies.some((b) => b.includes(low))) hits.add(`${path} :: ${phrase}`);
    }
  }
  return [...hits].sort();
}

/** Tracked files when git is present; a plain walk in CI images without git. */
export function repoFiles(root) {
  let paths;
  try {
    paths = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    paths = [];
    const walk = (dir, rel) => {
      for (const name of readdirSync(dir)) {
        if (name === '.git' || name === 'node_modules') continue;
        const abs = join(dir, name);
        const r = rel ? `${rel}/${name}` : name;
        if (statSync(abs).isDirectory()) walk(abs, r);
        else paths.push(r);
      }
    };
    walk(root, '');
  }
  const files = [];
  for (const path of paths) {
    if (!SEARCHED_CLASSES.has(classify(path))) continue;
    try {
      files.push({ path, text: readFileSync(join(root, path), 'utf8') });
    } catch {
      // deleted in the working tree but still tracked: nothing to read
    }
  }
  return files;
}
