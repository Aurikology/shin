/**
 * The document head of public/index.html.
 *
 * The head was bare until 2026-09-06 -- no <noscript>, no favicon, no manifest,
 * no apple-mobile-web-app-* -- on an app whose entire premise is that you pull
 * it out of your pocket in an aisle, which is to say an app people are meant to
 * add to a home screen.
 *
 * The last test here is the one with teeth. `index.html` used to load a
 * stylesheet from fonts.googleapis.com, with preconnects to two Google origins
 * above it: a blocking third-party round trip in front of first paint on a
 * store's guest wifi, and every user's IP handed to Google on every cold start.
 * The fonts are self-hosted now (scripts/fonts.mjs). A third-party stylesheet
 * link is easy to paste back in and impossible to notice in review, so it is
 * asserted against by origin rather than by hostname.
 *
 * Parsed with regexes and not a DOM, on purpose: this file has no HTML parser
 * dependency and adding one to assert five tags would be a worse trade than the
 * regexes are.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../public/', import.meta.url);
const raw = readFileSync(fileURLToPath(new URL('index.html', ROOT)), 'utf8');

/*
 * Comments out, first. index.html is heavily commented by house style and one of
 * those comments contains an example <link> -- the apple-touch-icon TODO. A
 * regex over the raw file reads it as real markup, which is how the "asset is on
 * disk" test below first failed on a file nobody intended to ship. It is also
 * the correct reading of the file in general: a commented-out third-party
 * stylesheet is not loading anything and must not fail the origin test.
 */
const html = raw.replace(/<!--[\s\S]*?-->/g, '');

/** Every <link> in the file, as a list of tag strings. */
const links = html.match(/<link\b[^>]*>/gi) ?? [];
const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [, null])[1];
const linksWithRel = (rel) => links.filter((l) => (attr(l, 'rel') || '').toLowerCase().split(/\s+/).includes(rel));
const metaNamed = (name) => metas.filter((m) => (attr(m, 'name') || '').toLowerCase() === name.toLowerCase());

test('there is a <noscript> and it says something', () => {
  const m = html.match(/<noscript>([\s\S]*?)<\/noscript>/i);
  assert.ok(m, 'no <noscript> in index.html');
  // Not an empty shell: every screen is drawn by the router, so with scripting
  // off the frame is black and the only content on the page is this block.
  const words = m[1].replace(/<[^>]*>/g, ' ').trim();
  assert.ok(words.length > 40, `<noscript> is present but nearly empty: ${JSON.stringify(words)}`);
});

test('a favicon is linked and the file it points at exists', () => {
  const icons = linksWithRel('icon');
  assert.equal(icons.length > 0, true, 'no <link rel="icon">');
  for (const icon of icons) {
    const href = attr(icon, 'href');
    assert.ok(href, 'rel="icon" with no href');
    assert.ok(href.startsWith('/'), `favicon href is not same-origin: ${href}`);
    assert.ok(existsSync(fileURLToPath(new URL(`.${href}`, ROOT))), `favicon does not exist on disk: ${href}`);
  }
});

test('the manifest is linked, exists, and is valid JSON with an icon that exists', () => {
  const [manifest] = linksWithRel('manifest');
  assert.ok(manifest, 'no <link rel="manifest">');
  const href = attr(manifest, 'href');
  const file = fileURLToPath(new URL(`.${href}`, ROOT));
  assert.ok(existsSync(file), `manifest does not exist on disk: ${href}`);

  const json = JSON.parse(readFileSync(file, 'utf8'));
  for (const key of ['name', 'start_url', 'display', 'background_color', 'theme_color', 'icons']) {
    assert.ok(json[key] !== undefined, `manifest is missing "${key}"`);
  }
  assert.ok(json.icons.length > 0, 'manifest declares no icons');
  for (const icon of json.icons) {
    assert.ok(existsSync(fileURLToPath(new URL(`.${icon.src}`, ROOT))), `manifest icon does not exist: ${icon.src}`);
  }
});

test('theme-color is declared for both schemes', () => {
  const themes = metaNamed('theme-color');
  assert.equal(themes.length, 2, `expected a theme-color per scheme, found ${themes.length}`);
  const media = themes.map((t) => (attr(t, 'media') || '').replace(/\s+/g, ''));
  assert.ok(media.includes('(prefers-color-scheme:dark)'), 'no dark theme-color');
  assert.ok(media.includes('(prefers-color-scheme:light)'), 'no light theme-color');
  for (const t of themes) assert.match(attr(t, 'content'), /^#[0-9A-Fa-f]{6}$/, `theme-color is not a hex: ${t}`);
});

test('the home-screen meta is present, because that is how this app is meant to be opened', () => {
  assert.equal(metaNamed('apple-mobile-web-app-capable').length, 1);
  assert.equal(metaNamed('apple-mobile-web-app-status-bar-style').length, 1);
  assert.equal(metaNamed('apple-mobile-web-app-title').length, 1);
  assert.equal(metaNamed('mobile-web-app-capable').length, 1);
});

test('no stylesheet is loaded from a third-party origin', () => {
  for (const link of linksWithRel('stylesheet')) {
    const href = attr(link, 'href') || '';
    assert.ok(
      !/^(https?:)?\/\//i.test(href),
      `index.html loads a stylesheet from another origin: ${href}\n` +
      'Fonts are self-hosted (npm run fonts). See the head comment in index.html.',
    );
  }
});

test('nothing in the head preconnects or prefetches a third-party origin either', () => {
  // The Google Fonts link came with two preconnects. Removing the stylesheet and
  // leaving those behind would still leak the request and still cost the
  // handshakes, so they are asserted against by the same rule.
  for (const rel of ['preconnect', 'dns-prefetch', 'preload', 'modulepreload', 'prefetch']) {
    for (const link of linksWithRel(rel)) {
      const href = attr(link, 'href') || '';
      assert.ok(!/^(https?:)?\/\//i.test(href), `rel="${rel}" points off-origin: ${href}`);
    }
  }
});

test('every same-origin asset the head references is actually on disk', () => {
  // A self-hosted font that 404s is worse than the CDN it replaced: the fallback
  // stack paints and nobody notices the real face never arrived.
  for (const link of links) {
    const href = attr(link, 'href');
    if (!href || !href.startsWith('/')) continue;
    assert.ok(existsSync(fileURLToPath(new URL(`.${href}`, ROOT))), `head references a missing file: ${href}`);
  }
});

test('the live region the router announces through exists outside #screen', () => {
  // The router empties #screen on every navigation. A live region inside it is
  // removed and re-inserted in the same tick and announces nothing, so this is a
  // correctness assertion and not a tidiness one.
  const region = html.match(/<div\b[^>]*id\s*=\s*["']route-status["'][^>]*>/i);
  assert.ok(region, 'no #route-status live region in index.html');
  assert.match(region[0], /aria-live\s*=\s*["']polite["']/i);
  const beforeRegion = html.slice(0, html.indexOf(region[0]));
  const screenClose = beforeRegion.lastIndexOf('</main>');
  assert.ok(screenClose !== -1, '#route-status is inside <main id="screen">, where it cannot announce');
});
