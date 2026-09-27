#!/usr/bin/env node
// Prints class -> count for every file `git ls-files` tracks, using
// scripts/doc-classes.mjs. `--list <class>` prints the files in that class
// instead of the table.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from './doc-classes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = execFileSync('git', ['-C', __dirname, 'rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

function listTrackedFiles() {
  const out = execFileSync('git', ['-C', repoRoot, 'ls-files'], { encoding: 'utf8' });
  return out.split('\n').filter((line) => line.length > 0);
}

function main() {
  const args = process.argv.slice(2);
  const listIndex = args.indexOf('--list');
  const listClass = listIndex !== -1 ? args[listIndex + 1] : null;

  const files = listTrackedFiles();
  const byClass = new Map();
  for (const file of files) {
    const cls = classify(file);
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls).push(file);
  }

  if (listClass) {
    const matches = byClass.get(listClass) ?? [];
    for (const file of matches) console.log(file);
    process.exit(0);
  }

  const classes = [...byClass.keys()].sort((a, b) => a.localeCompare(b));
  const widest = Math.max(...classes.map((c) => c.length), 'class'.length);
  console.log(`${'class'.padEnd(widest)}  count`);
  console.log(`${'-'.repeat(widest)}  -----`);
  let total = 0;
  for (const cls of classes) {
    const count = byClass.get(cls).length;
    total += count;
    console.log(`${cls.padEnd(widest)}  ${count}`);
  }
  console.log(`${'-'.repeat(widest)}  -----`);
  console.log(`${'total'.padEnd(widest)}  ${total}`);

  process.exit(0);
}

main();
