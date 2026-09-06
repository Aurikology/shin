/**
 * Writes the standalone face files from `public/js/face-art.js`:
 * one SVG per state per personality under `public/faces/<who>/<state>.svg`.
 *
 * These files are the deliverable form the contract names (docs/design/
 * AVATAR.md section 6): same 88 by 88 viewBox, `xmlns` on every file, the
 * outline colour left to `currentColor` with a navy default on the root.
 * The app itself never fetches them; it renders the same markup inline from
 * the module, so a state change is a morph and never a network round trip.
 *
 *   node scripts/build-faces.mjs          write the files
 *   node scripts/build-faces.mjs --check  fail if a file on disk differs
 *
 * Each file is checked against the contract before it is written, and a file
 * that breaks it is not written.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { FACE_SETS, FACE_STATES, standaloneSvg } from '../public/js/face-art.js';

const OUT = fileURLToPath(new URL('../public/faces/', import.meta.url));
const check = process.argv.includes('--check');

const CONTRACT_STATES = [
  'idle', 'thinking', 'asking', 'good', 'delighted', 'fair', 'walk', 'angry',
  'unknown', 'pleased', 'nudging', 'asleep', 'proud',
];

/** Everything the contract forbids or requires, as one function so the test can reuse it. */
export function contractProblems(svg) {
  const problems = [];
  if (!/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) problems.push('missing xmlns on the root');
  if (!/viewBox="0 0 88 88"/.test(svg)) problems.push('viewBox is not 0 0 88 88');
  for (const tag of ['linearGradient', 'radialGradient', 'filter', 'clipPath', 'mask', 'image', 'text', 'foreignObject', 'style']) {
    if (new RegExp(`<${tag}[\\s>]`).test(svg)) problems.push(`uses <${tag}>`);
  }
  if (!/stroke="currentColor"/.test(svg)) problems.push('outline is not currentColor');
  if (/#12233A/i.test(svg.replace(/color="#12233A"/i, '').replace(/fill="#12233A"/gi, ''))) {
    problems.push('navy is hard-coded as a stroke; every stroke must be currentColor');
  }
  return problems;
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main();

function main() {
let failed = 0;
let differs = 0;

for (const who of Object.keys(FACE_SETS)) {
  const missing = CONTRACT_STATES.filter((s) => !FACE_STATES.includes(s));
  const extra = FACE_STATES.filter((s) => !CONTRACT_STATES.includes(s));
  if (missing.length || extra.length) {
    console.error(`${who}: state list differs from the contract. missing=${missing} extra=${extra}`);
    failed++;
    continue;
  }
  const dir = join(OUT, who);
  if (!check) mkdirSync(dir, { recursive: true });
  for (const state of CONTRACT_STATES) {
    const svg = standaloneSvg(who, state);
    const problems = contractProblems(svg);
    const file = join(dir, `${state}.svg`);
    if (problems.length) {
      console.error(`${who}/${state}.svg breaks the contract: ${problems.join('; ')}`);
      failed++;
      continue;
    }
    if (check) {
      // Compare content, not line endings: a Windows checkout returns CRLF
      // while this script always writes LF, and that is not a stale face.
      const onDisk = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
      if (onDisk !== svg) { console.error(`${who}/${state}.svg is stale or missing`); differs++; }
    } else {
      writeFileSync(file, svg);
    }
  }
  if (!check && !failed) console.log(`${who}: ${CONTRACT_STATES.length} files written to ${dir}`);
}

if (failed || differs) process.exit(1);
if (check) console.log('faces on disk match face-art.js');
}
