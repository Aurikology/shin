/**
 * Self-hosts the three type families, so that `index.html` never asks
 * fonts.googleapis.com for anything.
 *
 * Why this script exists rather than a `<link>`: the old head opened with two
 * preconnects and a render-blocking stylesheet on a third-party origin. On the
 * network this product is actually used on -- a store's guest wifi, phone in
 * hand, camera about to open -- that is two extra DNS+TLS handshakes and a
 * round trip standing between the user and first paint, on the critical path,
 * before a single byte of Shin's own CSS is requested. It also hands every
 * user's IP and User-Agent to Google on every cold start of a price app, which
 * is not a trade anybody agreed to.
 *
 * Self-hosted, the fonts are same-origin, cacheable by us, and the first paint
 * blocks on nothing but `/css/*.css`.
 *
 *   node scripts/fonts.mjs           download and write public/fonts/ + fonts.css
 *   node scripts/fonts.mjs --check   fail if anything on disk is missing or stale
 *
 * The families and weights below are EXACTLY the ones the deleted link asked
 * for -- three families, weights 600/700/800, 400/500/600, 400/500/600 -- so
 * nothing on screen changes. Bricolage's `opsz,wght@12..96,<w>` collapses to a
 * fixed-weight face per weight on Google's side; that is what the old link was
 * already serving and it is reproduced here unaltered.
 *
 * Subsets: latin and latin-ext only. The upstream stylesheet also carries
 * cyrillic, cyrillic-ext and vietnamese, which is 12 more files and about 40%
 * more bytes on disk for coverage the copy does not use -- the interface is
 * English and the data is prices. Every face keeps its real `unicode-range`, so
 * adding a subset back is one entry in SUBSETS and a re-run, and a character
 * outside the ranges falls back rather than rendering as tofu from a face that
 * claims it.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const FONT_DIR = fileURLToPath(new URL('../public/fonts/', import.meta.url));
const CSS_FILE = fileURLToPath(new URL('../public/css/fonts.css', import.meta.url));

/** The exact query the removed <link rel="stylesheet"> in index.html carried. */
export const CSS2_URL =
  'https://fonts.googleapis.com/css2' +
  '?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800' +
  '&family=Instrument+Sans:wght@400;500;600' +
  '&family=IBM+Plex+Mono:wght@400;500;600' +
  '&display=swap';

/** Which of the upstream subsets we keep. See the header comment. */
const SUBSETS = ['latin', 'latin-ext'];

/*
 * Google serves woff2 only to a User-Agent it recognises as modern; with node's
 * own UA it answers with truetype, which is roughly three times the bytes. This
 * is a format negotiation, not a disguise -- we want the format every browser
 * that can run this app supports.
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Splits the upstream stylesheet into one record per @font-face, carrying the
 * subset name from the `/* latin *\/` comment that precedes each block.
 * Exported so the test can parse a fixture without hitting the network.
 */
export function parseFontFaces(css) {
  const faces = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const subset = m[1];
    const body = m[2];
    const pick = (k) => (body.match(new RegExp(`${k}:\\s*([^;]+);`)) || [, ''])[1].trim();
    const url = (body.match(/url\(([^)]+)\)/) || [, ''])[1].replace(/['"]/g, '');
    faces.push({
      subset,
      family: pick('font-family').replace(/['"]/g, ''),
      style: pick('font-style'),
      weight: pick('font-weight'),
      stretch: pick('font-stretch'),
      range: pick('unicode-range'),
      url,
    });
  }
  return faces;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * A stable, human-readable filename. `bricolage-grotesque-700-latin-ext.woff2`
 * beats Google's opaque hash: a file in the repo should say what it is, and a
 * re-run of this script must overwrite rather than accumulate.
 */
export function fileNameFor(face) {
  return `${slug(face.family)}-${face.weight}-${face.subset}.woff2`;
}

/**
 * Sets `face.file` on every face, collapsing byte-identical downloads onto one
 * filename.
 *
 * This is not a micro-optimisation. Bricolage Grotesque is a variable font, and
 * Google answers the three weights the app asks for with the SAME woff2 three
 * times under three opaque URLs -- 77 kB of latin, byte for byte identical,
 * served once per weight. Left alone that is 231 kB on disk and, worse, three
 * separate downloads in the browser for one file, because three different URLs
 * are three different cache entries. Pointing all three @font-face rules at one
 * URL makes it one request. Measured on this run: 520 kB of downloads collapse
 * to 314 kB, and the display family goes from three fetches to one.
 *
 * A family whose weights really are different files keeps the per-weight name;
 * only a group that is identical across every weight is renamed to `-var-`,
 * which is what it is.
 *
 * @param faces  records from parseFontFaces, each with a `bytes` Buffer
 */
export function assignFiles(faces) {
  const byGroup = new Map();
  for (const f of faces) {
    const key = `${f.family}|${f.subset}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(f);
  }
  for (const [, group] of byGroup) {
    const hashes = group.map((f) => createHash('sha256').update(f.bytes).digest('hex'));
    const identical = group.length > 1 && hashes.every((h) => h === hashes[0]);
    for (const f of group) {
      f.file = identical ? `${slug(f.family)}-var-${f.subset}.woff2` : fileNameFor(f);
      f.shared = identical;
    }
  }
  return faces;
}

/** The emitted stylesheet. `font-display: swap` on every face, deliberately. */
export function buildCss(faces) {
  const head = `/*
 * GENERATED by scripts/fonts.mjs -- do not edit. Re-run \`npm run fonts\`.
 *
 * The self-hosted replacement for the fonts.googleapis.com stylesheet that used
 * to sit in index.html above Shin's own CSS. Same three families, same weights.
 *
 * \`font-display: swap\` on every face: the fallback stack in tokens.css
 * (--f-display / --f-ui / --f-mono, each ending in a real system face) paints
 * immediately and is replaced when the woff2 lands. On a camera-first app the
 * one thing first paint must never be is a blank frame, and \`swap\` is the only
 * value that guarantees text is on screen in the first frame.
 */

`;
  const blocks = faces.map((f) => `/* ${f.subset}${f.shared ? ', one variable file shared by every weight of this family' : ''} */
@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};${f.stretch ? `\n  font-stretch: ${f.stretch};` : ''}
  font-display: swap;
  src: url('/fonts/${f.file}') format('woff2');
  unicode-range: ${f.range};
}`);
  return head + blocks.join('\n\n') + '\n';
}

async function main() {
  const check = process.argv.includes('--check');

  if (check && !existsSync(CSS_FILE)) {
    console.error('public/css/fonts.css is missing. Run: npm run fonts');
    process.exit(1);
  }

  let upstream;
  try {
    const res = await fetch(CSS2_URL, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    upstream = await res.text();
  } catch (err) {
    // Offline is a normal state for this machine and not a reason to leave a
    // half-written font directory behind. Say so and change nothing.
    console.error(`could not reach fonts.googleapis.com: ${err.message}`);
    console.error('nothing written. The files already in public/fonts/ are untouched.');
    process.exit(1);
  }

  const all = parseFontFaces(upstream);
  const faces = all.filter((f) => SUBSETS.includes(f.subset));
  if (!faces.length) {
    console.error(`parsed ${all.length} faces upstream and none matched ${SUBSETS.join(', ')}`);
    process.exit(1);
  }

  // Pass one: fetch every face's bytes. Nothing is written until all of them
  // have arrived and been checked, so an error page or a dropped connection
  // halfway through cannot leave a directory that is half old and half new.
  let downloaded = 0;
  for (const face of faces) {
    const res = await fetch(face.url, { headers: { 'user-agent': UA } });
    if (!res.ok) {
      console.error(`could not download ${face.family} ${face.weight} ${face.subset}: HTTP ${res.status}`);
      process.exit(1);
    }
    face.bytes = Buffer.from(await res.arrayBuffer());
    // A woff2 begins with the four bytes "wOF2". A 200 that is not a font is
    // an error page, and writing it would poison the directory silently.
    const magic = face.bytes.subarray(0, 4).toString('latin1');
    if (magic !== 'wOF2') {
      console.error(`${face.family} ${face.weight} ${face.subset} is not a woff2 (${face.bytes.length} bytes starting "${magic}")`);
      process.exit(1);
    }
    downloaded += face.bytes.length;
  }

  // Pass two: name the files, collapsing the duplicates, then write.
  assignFiles(faces);
  const write = new Map();
  for (const f of faces) write.set(f.file, f.bytes);
  const css = buildCss(faces);

  if (check) {
    let stale = 0;
    for (const [name, bytes] of write) {
      const dest = join(FONT_DIR, name);
      if (!existsSync(dest)) { console.error(`missing: public/fonts/${name}`); stale++; continue; }
      if (!readFileSync(dest).equals(bytes)) { console.error(`stale: public/fonts/${name}`); stale++; }
    }
    // Line endings, not content: a Windows checkout returns CRLF and this
    // script always writes LF. Same reasoning as build-faces.mjs --check.
    const onDisk = readFileSync(CSS_FILE, 'utf8').replace(/\r\n/g, '\n');
    if (onDisk !== css) { console.error('stale: public/css/fonts.css'); stale++; }
    const orphans = readdirSync(FONT_DIR).filter((f) => f.endsWith('.woff2') && !write.has(f));
    for (const o of orphans) console.error(`orphan (no @font-face points at it): public/fonts/${o}`);
    if (stale || orphans.length) process.exit(1);
    console.log(`fonts on disk match the upstream stylesheet (${write.size} files)`);
    return;
  }

  mkdirSync(FONT_DIR, { recursive: true });
  let bytes = 0;
  for (const [name, buf] of write) { writeFileSync(join(FONT_DIR, name), buf); bytes += buf.length; }
  writeFileSync(CSS_FILE, css);

  // A dedupe rename leaves the old per-weight names behind. Say so rather than
  // deleting: nothing here should remove a file the author did not ask about.
  const orphans = readdirSync(FONT_DIR).filter((f) => f.endsWith('.woff2') && !write.has(f));
  console.log(`${faces.length} faces -> ${write.size} files in public/fonts/ (${(bytes / 1024).toFixed(0)} kB on disk, ${(downloaded / 1024).toFixed(0)} kB downloaded)`);
  console.log('public/css/fonts.css written');
  if (orphans.length) console.log(`no @font-face points at these any more, safe to delete: ${orphans.join(', ')}`);
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) await main();
