/**
 * The app is called Pexi, and the mascot is Pexi too (RULINGS.md "Name: Pexi, and the
 * store developer accounts are called Pexi", 2026-10-02; the walkthrough defect on the
 * name, 2026-10-06). "Shin" never passed a trademark search, so no word a person can see
 * may spell it: not a screen title, a toast, a voice line, a French line, the privacy and
 * terms pages, the manifest, an aria-label, a page title, a share card, or a sentence the
 * server sends back.
 *
 * What stays "shin" is internal and is not read by a person: file names (shin.js), CSS
 * classes (.shin-say, .cam-shin), localStorage keys and events (shin.theme, shin:locale),
 * request headers (x-shin-invite), environment names (SHIN_*), the package id, the cache
 * and database names, and the real mailbox useshinapp@gmail.com. Renaming a storage key
 * would wipe a person's data, so those are listed below by name and nothing else is.
 *
 * Two rules, both over every text file under public/ (comments stripped, so a developer
 * note does not count, but strings inside code do):
 *   A. the capitalised word "Shin" or "SHIN" appears nowhere. No allowlist.
 *   B. the bare lowercase word "shin" (the wordmark, a download name, a sentence) appears
 *      nowhere except the explicit ALLOWED list of internal identifiers.
 * A third pass walks the exported string tables and calls their line functions, because
 * the lines a person reads are built at run time, not only written in the source.
 *
 * The same rule covers the sentences the server and the spine send to the screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const APP = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(APP, 'public');
const REPO = join(APP, '..');

/** Text files only; the generated camera bundle and vendored code are not our words. */
const SKIP = [/[\\/]js[\\/]eye\.js(\.map)?$/, /[\\/]vendor[\\/]/];
const TEXT = /\.(js|css|html|svg|json|webmanifest|txt|xml)$/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (TEXT.test(name) && !SKIP.some((re) => re.test(p))) out.push(p);
  }
  return out;
}

function walkTs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkTs(p));
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** The text a person could read: the file with developer comments taken out. */
export function visibleText(file, src) {
  try {
    if (file.endsWith('.js')) return transformSync(src, { loader: 'js', legalComments: 'none' }).code;
    if (file.endsWith('.css')) return transformSync(src, { loader: 'css', legalComments: 'none' }).code;
  } catch {
    /* fall through to the raw text: an unparseable file is scanned whole, never skipped */
  }
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const RULE_A = /\b(?:Shin|SHIN)\b/;
/** A lowercase "shin" that stands alone, not inside shin.js, shin-say, shin:locale, x-shin-..., SHIN_... */
const RULE_B = /(?<![\w:@/.-])shin(?![\w:@/]|-\w|\.\w)/i;

/**
 * Internal identifiers that are the bare word "shin" and must keep it. Each entry is a file
 * (path under app/public, forward slashes) and a regex the offending line must match.
 */
export const ALLOWED = [
  // The module is imported under its own name and handed to screens as ctx.shin.
  { file: 'js/main.js', line: /import \* as shin from|\{ store, api, shin, build/ },
];

export function findings(file, text, allowed = ALLOWED) {
  const rel = relative(PUBLIC, file).split(sep).join('/');
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (!RULE_A.test(line) && !RULE_B.test(line)) return;
    if (!RULE_A.test(line) && allowed.some((a) => a.file === rel && a.line.test(line))) return;
    hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
  return hits;
}

test('no file under public/ spells the old name anywhere a person can read it', () => {
  const files = walk(PUBLIC);
  assert.ok(files.length > 100, `scanned ${files.length} files, expected the whole public folder`);
  const hits = files.flatMap((f) => findings(f, visibleText(f, readFileSync(f, 'utf8'))));
  assert.deepEqual(hits, [], `the old name is still visible:\n${hits.join('\n')}`);
});

test('the scan is real: it flags each way the old name can appear, and passes the internal ones', () => {
  const bad = [
    ['<title>Shin</title>', 'x.html'],
    ['<h1>SHIN evaluates your item</h1>', 'x.html'],
    ['const a = "Shin’s own sentence";', 'x.js'],
    ["`<span class=\"wordmark\">shin<i>.</i></span>`", 'x.js'],
    ["g.fillText('shin', pad, 10);", 'x.js'],
    ['{"short_name": "Shin"}', 'x.webmanifest'],
  ];
  for (const [src, name] of bad) {
    const hits = findings(join(PUBLIC, name), visibleText(name, src));
    assert.equal(hits.length, 1, `must flag: ${src}`);
  }
  const good = [
    ["import { faceSvg } from '../shin.js';", 'x.js'],
    ["localStorage.getItem('shin.theme'); // Shin's note", 'x.js'],
    ['.shin-say { color: red; } /* the Shin face */', 'x.css'],
    ["headers['x-shin-invite'] = code; window.SHIN_API_BASE;", 'x.js'],
    ['<a href="mailto:useshinapp@gmail.com">useshinapp@gmail.com</a>', 'x.html'],
    ['the verdict shines', 'x.html'],
  ];
  for (const [src, name] of good) {
    assert.deepEqual(findings(join(PUBLIC, name), visibleText(name, src)), [], `must pass: ${src}`);
  }
});

/** Every string in a table or tree, and the output of every line function in it. */
function allStrings(value, seen = new Set(), path = '') {
  const out = [];
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'function') {
    const facts = new Proxy({}, { get: () => 'x' });
    for (const args of [[facts], [facts, 'deadpan'], []]) {
      try {
        const r = value(...args);
        if (typeof r === 'string') out.push([`${path}()`, r]);
        else if (r && typeof r === 'object') out.push(...allStrings(r, seen, `${path}()`));
        break;
      } catch {
        /* a line that needs real facts is covered by the source scan above */
      }
    }
    return out;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  for (const [k, v] of Object.entries(value)) out.push(...allStrings(v, seen, `${path}.${k}`));
  return out;
}

test('no exported string table or line function produces the old name', async () => {
  const mods = {
    voiceFr: await import('../public/js/voice-fr.js'),
    voice: await import('../public/js/voice.js'),
    ui: await import('../public/js/ui-strings.js'),
    onboarding: await import('../public/js/onboarding-strings.js'),
    price: await import('../public/js/price-strings.js'),
  };
  let checked = 0;
  const hits = [];
  for (const [name, mod] of Object.entries(mods)) {
    for (const [exportName, v] of Object.entries(mod)) {
      for (const [path, s] of allStrings(v)) {
        checked++;
        if (RULE_A.test(s) || /(?<![\w])shin(?![\w])/i.test(s)) hits.push(`${name}.${exportName}${path}: ${s.slice(0, 120)}`);
      }
    }
  }
  assert.ok(checked > 1500, `walked ${checked} strings, expected the whole voice and UI tables`);
  assert.deepEqual(hits, [], `the old name is still in a string table:\n${hits.join('\n')}`);
});

/**
 * The one server-side line that keeps the old name on purpose: the instruction text sent
 * to the model describes the image as "Shin's selected cropped scan image". The model reads
 * it; no person does, and the answer never quotes it. Everything else is a sentence a
 * shopper or the person running the server reads.
 */
const SERVER_ALLOWED = [
  { file: 'identify/src/providers/gemini-scan.ts', line: /The supplied image is Shin's selected cropped scan image/ },
];

test('the sentences the server, the spine and the photo step send to the screen do not spell the old name', () => {
  const files = [
    join(REPO, 'app', 'server.ts'),
    ...walkTs(join(REPO, 'app', 'src')),
    ...walkTs(join(REPO, 'spine', 'src')),
    ...walkTs(join(REPO, 'identify', 'src')),
  ];
  assert.ok(files.length > 40, `scanned ${files.length} server files`);
  const sentences = [];
  for (const file of files) {
    const f = relative(REPO, file).split(sep).join('/');
    const src = readFileSync(file, 'utf8');
    const code = transformSync(src, { loader: 'ts', legalComments: 'none' }).code;
    code.split('\n').forEach((line, i) => {
      if (!RULE_A.test(line)) return;
      if (SERVER_ALLOWED.some((a) => a.file === f && a.line.test(line))) return;
      sentences.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  assert.deepEqual(sentences, [], `a shopper-facing sentence still says the old name:\n${sentences.join('\n')}`);
});
