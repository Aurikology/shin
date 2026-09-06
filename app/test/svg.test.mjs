/**
 * Every SVG this app ships has to actually parse.
 *
 * This exists because one did not. `public/icon.svg` shipped with three double
 * hyphens inside its explanatory comment -- two CSS token names and one dash,
 * written in the same house style used in every other file in the repo -- and
 * an SVG is XML, where `--` is illegal inside a comment. Chrome refused the
 * whole document: "Double hyphen within comment". The favicon drew nothing, the
 * manifest icon drew nothing, and a canvas asked to rasterise it fired `onerror`
 * with no message worth reading.
 *
 * Nothing caught it. `head.test.mjs` asserted the icon was *linked*, which it
 * was. The file was well-formed by every eye that read it, because the thing
 * that made it invalid is legal in HTML, CSS, JavaScript and Markdown, and this
 * is the only file type in the repo where it is not.
 *
 * A parser would be the honest tool, and Node ships no XML parser. So this
 * checks the specific ways an SVG here can be malformed, which is narrower than
 * well-formedness and is aimed at what actually happened.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

function svgFiles(dir = PUBLIC, found = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) svgFiles(full, found);
    else if (name.endsWith('.svg')) found.push(full);
  }
  return found;
}

const FILES = svgFiles().map((f) => [relative(PUBLIC, f).replace(/\\/g, '/'), readFileSync(f, 'utf8')]);

test('there are SVGs to check', () => {
  assert.ok(FILES.length >= 13, `found only ${FILES.length} svg files; the walk is probably wrong`);
});

/**
 * The bug. XML forbids `--` anywhere inside a comment, not just at its edges,
 * and gives no partial credit: the document does not render at all.
 */
test('no comment contains a double hyphen', () => {
  const bad = [];
  for (const [name, text] of FILES) {
    for (const m of text.matchAll(/<!--([\s\S]*?)-->/g)) {
      if (m[1].includes('--')) {
        const line = text.slice(0, m.index).split('\n').length;
        bad.push(`${name}:${line}`);
      }
    }
  }
  assert.deepEqual(bad, [], `double hyphen inside an XML comment (the document will not parse):\n${bad.join('\n')}`);
});

test('every comment is closed', () => {
  for (const [name, text] of FILES) {
    const opens = (text.match(/<!--/g) || []).length;
    const closes = (text.match(/-->/g) || []).length;
    assert.equal(opens, closes, `${name} has ${opens} comment openers and ${closes} closers`);
  }
});

/**
 * `&` starts an entity reference in XML. A bare one -- in a seller's name, say,
 * or a "Tom & Jerry" written into a label -- is a parse error, and it is the
 * same class of mistake as the double hyphen: legal everywhere else.
 */
test('every ampersand is an entity', () => {
  const bad = [];
  for (const [name, text] of FILES) {
    for (const m of text.matchAll(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);)/g)) {
      bad.push(`${name}:${text.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(bad, [], `bare ampersand, which XML reads as a broken entity:\n${bad.join('\n')}`);
});

test('every file declares the SVG namespace', () => {
  // Without xmlns an SVG works inline and fails the moment it is a src, which
  // is the contract docs/design/AVATAR.md section 6 already states for faces.
  for (const [name, text] of FILES) {
    assert.match(text, /<svg[^>]*\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${name} has no xmlns`);
  }
});

test('tags are balanced', () => {
  for (const [name, text] of FILES) {
    const body = text.replace(/<!--[\s\S]*?-->/g, '');
    const opened = [];
    for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
      const [, closing, tag, attrs, selfClose] = m;
      if (closing) {
        const last = opened.pop();
        assert.equal(last, tag, `${name}: </${tag}> closes <${last}>`);
      } else if (!selfClose && !attrs.trimEnd().endsWith('/')) {
        opened.push(tag);
      }
    }
    assert.deepEqual(opened, [], `${name} leaves ${opened.join(', ')} unclosed`);
  }
});

/**
 * The raster the home screen actually uses, checked against the same rules the
 * build script applies, so a stale or clipped PNG fails here rather than on
 * somebody's phone.
 */
test('the apple-touch icon is a real 180x180 raster', async () => {
  const { pngProblems, SIZE } = await import('../scripts/build-icon.mjs');
  const bytes = readFileSync(join(PUBLIC, 'icon-180.png'));
  assert.equal(pngProblems(bytes), null, `icon-180.png is not usable at ${SIZE}px`);
});
