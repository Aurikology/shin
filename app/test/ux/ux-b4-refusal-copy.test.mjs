/**
 * UX build 4: the old refusal wording out; copy that describes the number;
 * plain error and empty-state words. Blocks R-23, R-22, R-60 of
 * docs/design/ux-evidence-2026-10-09.md (section 13, build 4).
 *
 * R-23  the four retired refusal strings ("I do not know this one", "I am not
 *       sure which one this is", "Not enough to call it", "The reader is not
 *       answering") and "I still cannot call it" are gone from every shipped
 *       file under public/js, in every personality. "I am not sure which one
 *       this is" becomes a question ("Which one is it?"). A refusal reason the
 *       app has no wording for THROWS from refusalSheet instead of falling
 *       through to the generic "I do not know this one" (today's silent
 *       default). If refusalSheet(identity_unsure) is kept it must carry the
 *       question; if the case now routes to the chart, refusalSheet may throw
 *       for it.
 * R-22  price lines state how the asking price compares with Pexi's estimate
 *       and stop: no motive for the store, no promise of an alert or a
 *       re-check, no savings words, in all three personalities.
 * R-60  Saved empty: "Nothing saved yet. Scan something and tap Save it." with
 *       a button to the camera; Past scans empty: "Nothing scanned yet." with
 *       the same button; Removed empty: "Nothing removed." as one line, no
 *       header, no button; every "Try again" button is 48 px high; error text
 *       is plain, owned by Pexi, with no humour.
 *
 * These are copy rules, so most tests read the shipped files (comments
 * stripped) or render the real screens and sheet builders and read their text.
 *
 * EXPECTED RESULT BEFORE THE BUILD LANDS (checked with a run)
 *   GREEN (KEEP, 6): R-22 states the comparison, R-22 no promise, R-22 no
 *   savings word, R-22 estimate is called an estimate, R-60 Removed empty is
 *   one line, R-60 offline and server-fault text is plain and owned.
 *   RED (unbuilt, 8): the other eight. R-60 "every Try again is 48 px" is red
 *   for a real defect: the list screens' retry is .linky at 44 px.
 *   Run against a throwaway reference build (patched voice.js, camera.js,
 *   pastscans.js, shell.css in a scratch folder) all 14 passed.
 *
 * NOT AUTOMATABLE, so not tested: whether the replacement words "read as
 * plain" to a shopper. The tests pin the rules the spec states.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { makeDocument, makeStorage, installBrowser } from '../mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const text = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const store = await import('../../public/js/store.js');
const { say } = await import('../../public/js/voice.js');
const { t } = await import('../../public/js/ui-strings.js');
const camera = await import('../../public/js/screens/camera.js');

/** Every shipped hand-written script, comments removed. */
const SHIPPED = [];
{
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (!['vendor', 'chunks'].includes(name)) walk(p); continue; }
      if (name.endsWith('.js') && name !== 'eye.js') SHIPPED.push({ file: relative(here('..'), p), src: stripComments(readFileSync(p, 'utf8')) });
    }
  };
  walk(here('../../public/js'));
}
const PERSONALITIES = ['deadpan', 'warm', 'blunt'];

/* ------------------------------------------------------------------ R-23 */

test('R-23: the retired refusal strings are in no shipped file, in any personality', () => {
  const retired = [
    /I do not know this one/,
    /I am not sure which one this is/,
    /Not enough to call it/,
    /The reader is not answering/,
    /cannot call it/i,
  ];
  const hits = [];
  for (const { file, src } of SHIPPED) {
    for (const re of retired) if (re.test(src)) hits.push(`${file}: ${re}`);
  }
  assert.deepEqual(hits, [], `retired refusal wording still ships:\n  ${hits.join('\n  ')}`);
});

test('R-23: no refusal sheet renders any retired string, whatever the reason', () => {
  if (typeof camera.refusalSheet !== 'function') return; // no sheet, nothing to render
  const retired = /I do not know this one|I am not sure which one this is|Not enough to call it|The reader is not answering|cannot call it/i;
  const reasons = ['identity_unsure', 'no_identity', 'too_few_points', 'no_source_response', 'model_timeout', 'model_outage', 'spend_cap_reached'];
  for (const reason of reasons) {
    let html;
    try {
      html = camera.refusalSheet({ reason, detail: '', evidence: [] }, { text: 'item', category: 'grocery' });
    } catch {
      continue; // the case now routes elsewhere and the old sheet refuses to draw it: fine
    }
    assert.ok(!retired.test(text(html)), `${reason}: the sheet still says "${text(html).match(retired)?.[0]}"`);
  }
});

test('R-23: "I am not sure which one this is" is now a question, "Which one is it?"', () => {
  if (typeof camera.refusalSheet !== 'function') return; // the sheet is gone, so the case routes elsewhere
  let html = null;
  try {
    html = camera.refusalSheet({ reason: 'identity_unsure', detail: '', evidence: [] }, { text: 'item', category: 'grocery' });
  } catch { /* routed to the chart instead: allowed */ }
  if (html === null) return;
  assert.match(text(html), /Which one is it\?/, 'the unsure case does not ask the question');
  assert.ok(!/I am not sure which one this is/.test(text(html)));
});

test('R-23 (fails loudly): a refusal reason the app has no wording for throws instead of falling through to the generic one', () => {
  if (typeof camera.refusalSheet !== 'function') return; // no sheet, nothing can fall through
  assert.throws(
    () => camera.refusalSheet({ reason: 'a_reason_nobody_wrote_wording_for', detail: '', evidence: [] }, { text: 'item', category: 'grocery' }),
    undefined,
    'an unlisted reason silently became the generic "I do not know this one"',
  );
});

/* ------------------------------------------------------------------ R-22 */

/*
 * The price lines, as the verdict prints them now. Until 2026-10-10 these were the
 * mascot's per-zone bubble lines (dist_*); RULINGS.md "V1 verdict screen mechanics"
 * then made the verdict face-only, so what states the price is the verdict word and
 * the line under it. The same four R-22 rules are held against that text, in every
 * personality, for every zone and confidence.
 */
const F = await import('../verdict-fixtures.mjs');
const ZONE_FIXTURES = { great: F.GREAT, good: F.GOOD, reasonable: F.REASONABLE, bad: F.BAD };
const unesc = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
function priceLines() {
  const out = [];
  for (const who of PERSONALITIES) {
    store.update({ personality: who });
    for (const [zone, raw] of Object.entries(ZONE_FIXTURES)) {
      for (const confidence of ['high', 'medium', 'low']) {
        const html = camera.distributionSheet({ ...raw, confidence }, { name: 'Item' });
        for (const marker of ['data-dist-headline', 'data-dist-line']) {
          const s = unesc(new RegExp(`${marker}>([^<]*)<`).exec(html)?.[1] ?? '');
          out.push({ k: `${zone}/${confidence}/${marker}`, who, zone, marker, s });
        }
      }
    }
  }
  store.update({ personality: null });
  return out;
}

test('R-22: no price line says why the store priced it that way, in any personality', () => {
  const motive = /priced this wrong|mistake|in your favou?r|is being fair|charging extra|giving it away|robbery|somebody in that store|the store (is|has|was)|they (are|were) (pushing|charging)/i;
  const all = priceLines();
  assert.ok(all.length >= 72, `only ${all.length} price lines found`);
  for (const { k, who, s } of all) {
    assert.ok(s.length > 0, `${k}/${who} has no line`);
    assert.ok(!motive.test(s), `${k}/${who} claims a motive: "${s}"`);
  }
});

test('R-22 (KEEP): the great, good, reasonable and bad answers state the comparison with the usual price', () => {
  const said = (zone) => priceLines().find((l) => l.zone === zone && l.marker === 'data-dist-line' && l.who === 'deadpan').s;
  assert.match(said('great'), /under the typical price/i);
  assert.match(said('good'), /under the typical price/i);
  assert.match(said('reasonable'), /typical price/i);
  assert.match(said('bad'), /over the typical price/i);
});

test('R-22 (KEEP): no price line, save line or acknowledgement promises an alert or a re-check', () => {
  const promise = /I will (say|tell|shout|let|notify|alert|check|look|message|ping|watch)|tell you if|let you know|keep an eye|check again|look again|re-?check|notify|alert you/i;
  for (const { k, who, s } of priceLines()) assert.ok(!promise.test(s), `${k}/${who} promises something the app cannot do: "${s}"`);
  const facts = { asking: '$4.99', seller: 'Store', day: 'today', usual: '$5.50', item: 'item', price: '$4.99' };
  for (const key of ['watching', 'peek_good', 'peek_fair', 'peek_walk_away', 'peek_watching', 'keep_it_ack']) {
    for (const who of PERSONALITIES) {
      const s = say(key, facts, who);
      assert.ok(!promise.test(s), `${key}/${who} promises something the app cannot do: "${s}"`);
    }
  }
});

test('R-22 (KEEP): no price line uses a savings word', () => {
  const savings = /\bsav(e|es|ed|ing|ings)\b|\bbargain\b|\bdeal\b|\bsteal\b/i;
  for (const { k, who, s } of priceLines()) assert.ok(!savings.test(s), `${k}/${who} makes a savings claim: "${s}"`);
  assert.ok(savings.test('a real bargain'), 'control: the savings matcher must see a savings word');
});

test('R-22 (KEEP): the typical price is called Pexi\'s estimate wherever it is printed', () => {
  assert.match(t('vd_typical', { centre: '$5.00' }), /Pexi's estimate/);
});

/* ------------------------------------------------------------------ R-60 */

function stubRoot() {
  return { innerHTML: '', dataset: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, setAttribute() {}, closest: () => null, contains: () => false };
}
async function emptyBlock(screen) {
  storage.clear();
  store.reset();
  const m = (await import(`../../public/js/screens/${screen}.js`)).default;
  const root = stubRoot();
  try {
    m.render(root, { api: { quota: () => new Promise(() => {}), scans: () => new Promise(() => {}) }, go() {}, replace() {}, params: {}, build: 't' });
  } catch { /* wiring after the paint needs a DOM this stub lacks */ }
  await new Promise((r) => setTimeout(r, 20));
  const a = root.innerHTML.indexOf('class="empty"');
  assert.notEqual(a, -1, `${screen}: no empty state rendered`);
  const open = root.innerHTML.lastIndexOf('<div', a);
  // the empty block holds no nested div, so its first closing tag ends it
  return root.innerHTML.slice(open, root.innerHTML.indexOf('</div>', a) + 6);
}

test('R-60: Saved empty says why and how to fill it, with a button to the camera', async () => {
  const block = await emptyBlock('watchlist');
  assert.equal(text(block.replace(/<button[\s\S]*?<\/button>/, '')), 'Nothing saved yet. Scan something and tap Save it.');
  assert.match(block, /<button[^>]*data-act="camera"/, 'no button to the camera');
});

test('R-60: Past scans empty says "Nothing scanned yet." with the same button to the camera', async () => {
  const block = await emptyBlock('pastscans');
  assert.equal(text(block.replace(/<button[\s\S]*?<\/button>/, '')), 'Nothing scanned yet.');
  assert.match(block, /<button[^>]*data-act="camera"/, 'no button to the camera');
});

test('R-60 (KEEP): Removed empty is "Nothing removed." as one line, with no header and no button', async () => {
  const block = await emptyBlock('removed');
  assert.equal(text(block), 'Nothing removed.');
  assert.ok(!/<button|<h[1-6]/.test(block), 'the Removed empty state grew a button or a header');
  assert.equal((block.match(/<p[ >]/g) ?? []).length, 1, 'more than one line');
});

test('R-60: every "Try again" button is at least 48 px high', () => {
  const rules = [];
  const css = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) css(p); else if (name.endsWith('.css')) {
        const body = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push({ sel: m[1].split(',').map((s) => s.trim()), decl: m[2] });
      }
    }
  };
  css(here('../../public/css'));
  const tokens = Object.fromEntries(rules.flatMap((r) => [...r.decl.matchAll(/(--[\w-]+)\s*:\s*([\d.]+px)/g)].map((m) => [m[1], Number(m[2].replace('px', ''))])));
  const heightOf = (cls) => {
    let best = 0;
    for (const r of rules.filter((x) => x.sel.includes(`.${cls}`))) {
      const m = /(?:min-)?height\s*:\s*(?:(\d+)px|var\((--[\w-]+)\))/.exec(r.decl);
      if (m) best = Math.max(best, m[1] ? Number(m[1]) : tokens[m[2]] ?? 0);
    }
    return best;
  };
  const found = [];
  for (const { file, src } of SHIPPED.filter((f) => f.file.includes('screens'))) {
    for (const m of src.matchAll(/<button[^>]*class="([^"]*)"[^>]*>\s*(?:\$\{[^}]*try_again|[^<$]*Try again)/g)) found.push({ file, cls: m[1] });
  }
  assert.ok(found.length >= 6, `expected to find the Try again buttons, found ${found.length}`);
  const short = found.map((f) => ({ ...f, px: Math.max(0, ...f.cls.split(/\s+/).map(heightOf)) })).filter((f) => f.px < 48);
  assert.deepEqual(short.map((f) => `${f.file} class="${f.cls}" ${f.px}px`), [], 'Try again buttons under 48 px');
});

test('R-60 (KEEP): the offline and server-fault sheets are plain, owned by Pexi, with no humour', () => {
  const offline = text(camera.needsConnectionSheet());
  const fault = text(camera.serverFaultSheet());
  // One line each since the 2026-10-10 audit of 90 screens (row 18, "errors one line", da10d57):
  // the second sentences this test once pinned were cut there on purpose.
  assert.match(offline, /I need a connection for this/);
  assert.match(fault, /Pexi hit a problem on its side/);
  for (const s of [offline, fault]) {
    assert.ok(!/!|oops|whoops|uh.?oh|yikes|sorry|my bad|lol/i.test(s), `humour or blame in: ${s}`);
    assert.match(s, /Try again/);
  }
});
