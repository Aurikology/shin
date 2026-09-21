/**
 * Builds docs/design/saved-variants.html from its template by inlining Shin's
 * real face art.
 *
 * The faces are needed inline rather than as <img src>, because the art draws
 * its outline, brows and mouth in `currentColor` so the embedding layer can set
 * the ink. An <img> cannot inherit that, and on a near-black ground the default
 * navy ink disappears. Inlining keeps the prototype using the same faces the
 * app ships instead of a stand-in drawn for the occasion.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const TEMPLATE = join(root, 'docs/design/saved-variants.template.html');
const OUT = join(root, 'docs/design/saved-variants.html');
const FACE_DIR = join(root, 'app/public/faces/deadpan');

/** One face, stripped of the attributes that would fight the page's own CSS. */
function face(state) {
  const svg = readFileSync(join(FACE_DIR, `${state}.svg`), 'utf8');
  return svg
    .replace(/\swidth="\d+"/, '')
    .replace(/\sheight="\d+"/, '')
    .replace(/\scolor="[^"]*"/, '')
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

const out = readFileSync(TEMPLATE, 'utf8')
  .replace(/\{\{FACE:([a-z]+)\}\}/g, (_, state) => face(state));

const missed = out.match(/\{\{FACE:[a-z]+\}\}/);
if (missed) throw new Error(`unreplaced marker: ${missed[0]}`);

writeFileSync(OUT, out, 'utf8');
console.log(`wrote ${OUT} (${out.length} bytes)`);
