/**
 * The screen tags cannot drift out of step with the screens.
 *
 * js/screen-tags.js names every page, screen, sheet, modal and overlay (a1, a2,
 * ...), so the owner can say "on a12 the button is wrong". A tag list nobody
 * keeps current is worse than none, because a missing tag looks like a screen
 * that does not exist. So this file fails when:
 *
 *   - a screen module, a registered route, an onboarding step, a camera sheet,
 *     a camera state or a list-screen modal has no entry in the registry;
 *   - two tags collide (the same key written twice, which an object literal
 *     silently swallows, so the SOURCE is read, or the same id on two entries);
 *   - a tag is not of the form a<number>, or the numbers have a gap (an entry was
 *     deleted instead of retired, which is how a tag gets renumbered);
 *   - an entry's selector names a class or attribute its own file no longer
 *     contains (the tag would silently stop showing);
 *   - docs/screen-tags.md and the registry disagree.
 *
 * Read from source with regexes rather than by importing the screens, for the
 * reason title.test.mjs gives: every screen reaches `document` at import time and
 * standing up a DOM to read a string literal is the worse trade. The registry and
 * the badge's chooser are pure, so those ARE imported and run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SCREEN_TAGS, NOT_TAGGED } from '../public/js/screen-tags.js';
import { STEPS } from '../public/js/onboarding-flow.js';
import { pickTag, readTagsSwitch, mountTags, refreshTag, setTagsOn, tagsOn } from '../public/js/screen-tag-badge.js';
import { makeDocument, makeStorage, installBrowser, MiniElement } from './mini-dom.mjs';

const JS = new URL('../public/js/', import.meta.url);
const REPO = new URL('../../', import.meta.url);
const read = (url) => readFileSync(fileURLToPath(url), 'utf8').replace(/\r\n/g, '\n');
const readJs = (rel) => read(new URL(rel, JS));

const entries = Object.entries(SCREEN_TAGS);
const TAG_FORM = /^a[1-9]\d*$/;
/** The character this repo never writes; built from its code so this file does not contain one. */
const EM = String.fromCharCode(0x2014);
const KINDS = new Set(['screen', 'state', 'sheet', 'modal', 'overlay', 'static']);

/** Every `route` that some entry claims, so a screen can be checked against it. */
const routesTagged = new Set(entries.map(([, e]) => e.route).filter((r) => r && r !== '*'));

/* ------------------------------------------------------------ the tags themselves */

test('the registry is not empty and the source is what was imported', () => {
  // Guard the guards: a parse that found nothing would pass everything below.
  assert.ok(entries.length >= 60, `expected the full list, found ${entries.length} entries`);
  const keys = [...readJs('screen-tags.js').matchAll(/^ {2}(\w+):\s*\{/gm)].map((m) => m[1]);
  assert.equal(keys.length, entries.length, 'the source has a different number of entries than the imported map');
});

test('every tag is of the form a<number>', () => {
  const keys = [...readJs('screen-tags.js').matchAll(/^ {2}(\w+):\s*\{/gm)].map((m) => m[1]);
  for (const k of keys) assert.match(k, TAG_FORM, `"${k}" is not of the form a<number> (a1, a2, ... with no leading zero)`);
});

test('no two tags collide: the same key is never written twice', () => {
  // `{ a5: {...}, a5: {...} }` is legal JavaScript and the second silently wins,
  // so the map cannot show it. The source can.
  const keys = [...readJs('screen-tags.js').matchAll(/^ {2}(\w+):\s*\{/gm)].map((m) => m[1]);
  const seen = new Set();
  for (const k of keys) {
    assert.ok(!seen.has(k), `tag ${k} is written twice in screen-tags.js`);
    seen.add(k);
  }
});

test('no two entries share an id, or the same route, selector and rank', () => {
  const ids = new Map();
  const shapes = new Map();
  for (const [tag, e] of entries) {
    assert.ok(!ids.has(e.id), `${tag} and ${ids.get(e.id)} both have id "${e.id}"`);
    ids.set(e.id, tag);
    if (e.route === null) continue; // static pages never compete: the badge does not draw on them
    const shape = `${e.route}|${e.sel ?? ''}|${e.rank ?? 0}`;
    assert.ok(!shapes.has(shape), `${tag} and ${shapes.get(shape)} would be chosen in exactly the same situation (${shape})`);
    shapes.set(shape, tag);
  }
});

test('tags run a1 to aN with no gaps, so nothing was deleted or renumbered', () => {
  const nums = entries.map(([tag]) => Number(tag.slice(1))).sort((a, b) => a - b);
  nums.forEach((n, i) => assert.equal(n, i + 1, `expected a${i + 1} next, found a${n}: a tag was skipped or removed (retire it with retired: true instead)`));
});

test('every entry is complete and points at a real file', () => {
  for (const [tag, e] of entries) {
    for (const f of ['id', 'title', 'kind', 'file', 'how']) {
      assert.equal(typeof e[f], 'string', `${tag}.${f} must be a string`);
      assert.ok(e[f].trim().length > 0, `${tag}.${f} is empty`);
    }
    assert.ok(KINDS.has(e.kind), `${tag} has unknown kind "${e.kind}"`);
    assert.ok(existsSync(fileURLToPath(new URL(e.file, REPO))), `${tag} points at ${e.file}, which does not exist`);
    if (e.route === null) assert.equal(e.kind, 'static', `${tag} has no route so it must be kind "static"`);
    assert.ok(!`${e.title}${e.how}`.includes(EM), `${tag} contains an em dash`);
  }
});

/* ------------------------------------------------- every screen is in the registry */

test('every screen module has an entry', () => {
  const dir = fileURLToPath(new URL('screens/', JS));
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 10, `expected the screen modules, found ${files.length}`);
  for (const f of files) {
    const src = readFileSync(`${dir}${f}`, 'utf8');
    const id = /^ {2}id:\s*'([\w-]+)'/m.exec(src)?.[1];
    assert.ok(id, `${f} has no top-level id: '...' (is it a screen module?)`);
    assert.ok(routesTagged.has(id), `screen module ${f} (id "${id}") has no entry in screen-tags.js`);
  }
});

test('every route main.js registers has an entry', () => {
  const main = readJs('main.js');
  const imports = new Map([...main.matchAll(/^import (\w+) from '\.\/screens\/([\w-]+)\.js';/gm)].map((m) => [m[1], m[2]]));
  const list = /for \(const s of \[([^\]]+)\]\)/.exec(main);
  assert.ok(list, 'could not find the router.register list in main.js');
  const names = list[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.ok(names.length >= 10, `expected the route list, found ${names.length}`);
  for (const name of names) {
    const file = imports.get(name);
    assert.ok(file, `main.js registers "${name}" which is not a ./screens import`);
    const id = /^ {2}id:\s*'([\w-]+)'/m.exec(readJs(`screens/${file}.js`))?.[1];
    assert.ok(routesTagged.has(id), `route "${id}" (main.js "${name}") has no entry in screen-tags.js`);
  }
});

test('every onboarding step has its own entry, and no entry names a step that is gone', () => {
  assert.ok(STEPS.length >= 29, `expected the whole flow, found ${STEPS.length} steps`);
  const bySel = new Map(entries.filter(([, e]) => e.route === 'onboarding').map(([tag, e]) => [e.sel, tag]));
  for (const s of STEPS) {
    assert.ok(bySel.has(`[data-step="${s.id}"]`), `onboarding step "${s.id}" (his line ${s.n}) has no entry`);
  }
  const ids = new Set(STEPS.map((s) => `[data-step="${s.id}"]`));
  for (const [sel, tag] of bySel) assert.ok(ids.has(sel), `${tag} names an onboarding step that is not in STEPS (${sel})`);
});

test('every sheet in camera.js has an entry', () => {
  const camera = readJs('screens/camera.js');
  const sheets = new Set([...camera.matchAll(/class="sheet (\w+)"/g)].map((m) => m[1]));
  assert.ok(sheets.size >= 8, `expected the camera sheets, found ${sheets.size}`);
  const cameraSels = entries.filter(([, e]) => e.route === 'camera').map(([, e]) => e.sel ?? '');
  for (const name of sheets) {
    assert.ok(cameraSels.some((s) => s.includes(`.sheet.${name}`)), `camera sheet ".sheet.${name}" has no entry in screen-tags.js`);
  }
  // The offline sheet is a refusal with its own markup, so it must be told apart.
  assert.ok(cameraSels.some((s) => s.includes('[data-needs-connection]')), 'the needs-a-connection sheet has no entry of its own');
});

test('every camera state is accounted for', () => {
  const camera = readJs('screens/camera.js');
  const states = new Set([...camera.matchAll(/setState\('(\w+)'\)/g)].map((m) => m[1]));
  assert.ok(states.size >= 5, `expected the camera states, found ${states.size}`);
  // A state either has a sheet over it (its tags are the sheets), or has its own entry.
  const COVERED = {
    idle: 'the camera entries',
    framing: 'camera.framing',
    reading: 'the working sheet',
    choosing: 'the candidate sheets',
    asking: 'the price pad and the shop picker',
    texting: 'the type-it sheet',
    result: 'the verdict, refusal, going-rate and price-written-down sheets',
  };
  for (const s of states) assert.ok(COVERED[s], `camera state "${s}" is new: give it a tag (or a sheet's tag) and list it here`);
  const sels = entries.filter(([, e]) => e.route === 'camera').map(([, e]) => e.sel ?? '');
  assert.ok(sels.some((s) => s.includes('[data-state="framing"]')), 'camera.framing has no entry');
});

test('every modal on a list screen has an entry', () => {
  for (const f of ['watchlist', 'pastscans']) {
    const src = readJs(`screens/${f}.js`);
    assert.match(src, /class="pmodal"/, `${f}.js no longer draws a modal; update this test`);
    const sels = entries.filter(([, e]) => e.route === f).map(([, e]) => e.sel ?? '');
    assert.ok(sels.some((s) => s.includes('.pmodal')), `${f} has a modal and no tag for it`);
  }
});

test('nothing else draws a full-page or modal surface without a tag', () => {
  // The three shapes a surface can take in this client. A new one anywhere in
  // js/ that is not in a file already covered above needs an entry.
  const covered = new Set(entries.map(([, e]) => e.file.split('/').pop()));
  const dir = fileURLToPath(JS);
  const hits = [];
  const walk = (d, rel = '') => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (ent.isDirectory()) { if (!['vendor', 'chunks'].includes(ent.name)) walk(`${d}${ent.name}/`, `${rel}${ent.name}/`); continue; }
      if (!ent.name.endsWith('.js')) continue;
      const src = readFileSync(`${d}${ent.name}`, 'utf8');
      if (/role="dialog"|aria-modal|<dialog|class="sheet |class="pmodal"|class="screen-error"/.test(src)) hits.push(ent.name);
    }
  };
  walk(dir);
  for (const f of hits) {
    // lib/listscreen.js gives the two list modals their dialog role after mount.
    if (f === 'listscreen.js') continue;
    assert.ok(covered.has(f), `${f} draws a sheet or dialog and no entry in screen-tags.js points at it`);
  }
});

/* ---------------------- every surface a template builds has exactly one tag of its own */

/*
 * The checks above find a sheet by the one word in `class="sheet name"`, so a sheet
 * with two class names (`sheet verdict gemini`) slipped past them and borrowed a
 * neighbour's tag, and a modal with a new variant did the same. This section reads
 * EVERY template that builds a sheet, a modal (.pmodal), a toast or the render
 * failure page, and for each height the surface can reach asks which registry
 * selectors would match the element it draws. Exactly one may. It fails when none
 * does (no tag), when two do (shared), and when two surfaces end up with one tag.
 */

/** A selector split at spaces and combinators that sit outside [] and (). */
function compounds(sel) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '[' || ch === '(') depth += 1;
    if (ch === ']' || ch === ')') depth -= 1;
    if (depth === 0 && /[\s>+~]/.test(ch)) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const NOT_GROUP = /:not\(((?:[^()]|\([^()]*\))*)\)/g;

/** Whether one compound selector (classes, attributes, :not) matches an element's facts. */
function compoundMatches(part, el) {
  for (const m of part.matchAll(NOT_GROUP)) if (compoundMatches(m[1], el)) return false;
  let rest = part.replace(NOT_GROUP, '');
  for (const m of rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    if (!el.attrs.has(m[1])) return false;
    const v = el.attrs.get(m[1]);
    // null is a value filled in at run time: it can be anything, so it cannot rule the selector out.
    if (m[2] !== undefined && v !== null && v !== m[2]) return false;
  }
  rest = rest.replace(/\[[^\]]*\]/g, '');
  for (const m of rest.matchAll(/\.([\w-]+)/g)) if (!el.classes.has(m[1])) return false;
  return true;
}

/** Whether every class and attribute a descendant compound names is somewhere in the template's text. */
function namesInText(part, text) {
  const bare = part.replace(NOT_GROUP, '');
  const words = [...bare.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  for (const m of bare.matchAll(/\[([\w-]+)/g)) words.push(m[1]);
  return words.every((w) => new RegExp(`(^|[^\\w-])${w}(?![\\w-])`).test(text));
}

/** The opening tag that a `class="..."` at `at` belongs to, skipping over ${...} so an arrow's > never ends it. */
function openingTag(src, at) {
  const start = src.lastIndexOf('<', at);
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (c === '$' && src[i + 1] === '{') { depth += 1; i += 1; continue; }
    if (depth > 0) { if (c === '{') depth += 1; else if (c === '}') depth -= 1; continue; }
    if (c === '>') return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** The classes and attributes a template gives its element. A ${...} value is null: known only at run time. */
function elementOf(tag) {
  const flat = tag.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '\u0001');
  const cls = /\bclass="([^"]*)"/.exec(flat)?.[1] ?? '';
  const attrs = new Map();
  for (const m of flat.replace(/^<\w+/, '').matchAll(/([A-Za-z][\w:-]*)(?:="([^"]*)")?/g)) {
    if (m[1] === 'class') continue;
    attrs.set(m[1], m[2] === undefined ? '' : m[2].includes('\u0001') ? null : m[2]);
  }
  return { classes: new Set(cls.split(/\s+/).filter(Boolean)), attrs, literal: !cls.includes('\u0001') };
}

/** Every template in the screens and the router that builds a sheet, modal, toast or error page. */
function surfaceTemplates() {
  const dir = fileURLToPath(new URL('screens/', JS));
  const files = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => ({ name: `screens/${f}`, src: readFileSync(`${dir}${f}`, 'utf8').replace(/\r\n/g, '\n') }));
  files.push({ name: 'router.js', src: readJs('router.js') });
  const found = [];
  for (const { name, src } of files) {
    const route = /^ {2}id:\s*'([\w-]+)'/m.exec(src)?.[1] ?? null;
    for (const m of src.matchAll(/class="(?:sheet|pmodal|toast|screen-error)(?:\s[^"]*)?"/g)) {
      const el = elementOf(openingTag(src, m.index));
      const root = [...el.classes][0] ?? '';
      const text = root === 'sheet' ? src.slice(m.index, src.indexOf('</section>', m.index) + 10) : src.slice(m.index, m.index + 2000);
      found.push({ name, route, el, root, text, label: `${name} <${[...el.classes].join(' ')}>` });
    }
  }
  return found;
}

/** The registry entries that name this element at this height: whole-selector matches, else descendant matches. */
function tagsNaming(t, height, tags = entries) {
  const own = tags.filter(([, e]) => e.sel && (e.route === t.route || e.route === '*'));
  const el = height ? { ...t.el, attrs: new Map([...t.el.attrs, ['data-detent', height]]) } : t.el;
  const names = ([, e]) => { const cs = compounds(e.sel); return cs[0].includes(`.${t.root}`) && compoundMatches(cs[0], el) ? cs : null; };
  const direct = own.filter((row) => names(row)?.length === 1);
  if (direct.length) return direct;
  return own.filter((row) => { const cs = names(row); return cs && cs.length > 1 && cs.slice(1).every((c) => namesInText(c, t.text)); });
}

/** Height each sheet can reach: its own sections say so, the way camera.js maxDetent does. */
function heightsOf(t) {
  if (t.root !== 'sheet') return [null];
  return ['peek', ...(t.text.includes('class="sheet-half"') ? ['half'] : []), ...(t.text.includes('class="sheet-full"') ? ['full'] : [])];
}

test('every sheet, modal and toast a screen builds has exactly one tag of its own, at every height', () => {
  const templates = surfaceTemplates();
  assert.ok(templates.length >= 20, `expected the whole set of surfaces (13 camera sheets, a toast, 5 modals, the error page), found ${templates.length} templates`);
  const owner = new Map();
  for (const t of templates) {
    assert.ok(t.el.literal, `${t.label}: the class list is built at run time, so no selector can be checked against it`);
    for (const h of heightsOf(t)) {
      const who = `${t.label} at ${h ?? 'its one height'}`;
      const named = tagsNaming(t, h);
      assert.ok(named.length >= 1, `${who} has no tag of its own: no selector in screen-tags.js names it. Add one (and its row in docs/screen-tags.md), and narrow any older tag that would also match.`);
      assert.equal(named.length, 1, `${who} is named by ${named.map(([tag]) => tag).join(' and ')}: two tags for one surface. Narrow the older one with :not(...).`);
      const tag = named[0][0];
      assert.ok(!owner.has(tag), `${tag} is the tag of both ${owner.get(tag)} and ${who}`);
      owner.set(tag, who);
    }
  }
});

test('the guard sees the answer sheet, the failure sheet and every modal variant', () => {
  // Guard the guard: it must find these, and map each to the tag the owner was told about.
  const byLabel = new Map(surfaceTemplates().map((t) => [t.label, t]));
  const tagOf = (label, h) => tagsNaming(byLabel.get(label), h).map(([tag]) => tag);
  assert.deepEqual(['peek', 'half', 'full'].map((h) => tagOf('screens/camera.js <sheet verdict gemini>', h)[0]), ['a87', 'a88', 'a89']);
  assert.deepEqual(tagOf('screens/camera.js <sheet refusal gemini-failed>', 'peek'), ['a90']);
  assert.deepEqual(['peek', 'half', 'full'].map((h) => tagOf('screens/camera.js <sheet verdict>', h)[0]), ['a38', 'a39', 'a40']);
  const modals = surfaceTemplates().filter((t) => t.root === 'pmodal');
  assert.equal(modals.length, 5, 'expected three past-scan modals and two saved-item modals');
  assert.deepEqual(modals.map((t) => tagsNaming(t, null).map(([tag]) => tag)), [['a61'], ['a91'], ['a62'], ['a56'], ['a57']]);
});

test('a sheet class the registry cannot name is caught, and so is a tag two surfaces share', () => {
  // A stand-in for a new sheet that nobody tagged: it must resolve to nothing.
  const ghost = { name: 'screens/camera.js', route: 'camera', root: 'sheet', text: '<section class="sheet ghost"></section>', el: elementOf('<section class="sheet ghost" data-tier="unknown">') };
  assert.equal(tagsNaming(ghost, 'peek').length, 0);
  // The answer sheet against the registry as it was before the :not() narrowing: two tags name it.
  const gemini = surfaceTemplates().find((t) => t.label === 'screens/camera.js <sheet verdict gemini>');
  const loosened = entries.map(([tag, e]) => [tag, { ...e, sel: e.sel?.replace(':not(.gemini)', '') }]);
  assert.ok(tagsNaming(gemini, 'peek', loosened).length >= 2, 'the loosened registry should name the answer sheet twice');
});

test('no template draws an overlay-shaped class the guard does not know', () => {
  const PARTS = new Set(['sheet', 'sheet-peek', 'sheet-half', 'sheet-full', 'sheet-head', 'sheet-close', 'sheet-slot', 'toast', 'toast-slot', 'toast-undo', 'pmodal', 'pmodal-card', 'pmodal-meta', 'pmodal-conf', 'pmodal-doubt', 'pmodal-note']);
  const SHAPE = /(^|-)(sheet|modal|pmodal|dialog|overlay|banner|popover|toast|scrim|drawer|snackbar|lightbox|backdrop|tooltip|coachmark)(-|$)/;
  const dir = fileURLToPath(JS);
  const hits = [];
  const walk = (d, rel = '') => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (ent.isDirectory()) { if (!['vendor', 'chunks'].includes(ent.name)) walk(`${d}${ent.name}/`, `${rel}${ent.name}/`); continue; }
      if (!ent.name.endsWith('.js')) continue;
      const src = readFileSync(`${d}${ent.name}`, 'utf8');
      const lists = [...src.matchAll(/class="([^"]*)"|setAttribute\('class', '([^']*)'\)|className = '([^']*)'|classList\.add\('([^']*)'/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
      for (const list of lists) {
        for (const token of list.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean)) {
          if (SHAPE.test(token) && !PARTS.has(token)) hits.push(`${rel}${ent.name}: "${token}"`);
        }
      }
    }
  };
  walk(dir);
  assert.deepEqual(hits, [], `a class that looks like a sheet, modal, banner, dialog or overlay is drawn and the guard has no rule for it. Tag it (and read the rules at the top of docs/screen-tags.md), then add its parts to PARTS here: ${hits.join('; ')}`);
});

test('nothing draws on document.body, so the badge watching #screen sees every visible surface', () => {
  const dir = fileURLToPath(JS);
  const ALLOWED = new Set(['screen-tag-badge.js', 'share.js']); // the badge itself, and share.js's download anchor that is removed at once
  const hits = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (ent.isDirectory()) { if (!['vendor', 'chunks'].includes(ent.name)) walk(`${d}${ent.name}/`); continue; }
      if (!ent.name.endsWith('.js') || ALLOWED.has(ent.name)) continue;
      const src = readFileSync(`${d}${ent.name}`, 'utf8');
      if (/document\.body\.(appendChild|append|prepend|insertBefore|insertAdjacent\w+|innerHTML)/.test(src)) hits.push(ent.name);
    }
  };
  walk(dir);
  assert.deepEqual(hits, [], `${hits.join(', ')} adds to document.body, which the tag badge does not watch: a surface there would show a wrong tag. Mount it inside #screen, or widen the observer in screen-tag-badge.js.`);
  // And the page itself holds one container, the no-script notice and a hidden live region, nothing else.
  const page = read(new URL('../public/index.html', import.meta.url)).replace(/<!--[\s\S]*?-->/g, '');
  const body = page.slice(page.indexOf('<body>'));
  const boxes = [...body.replace(/<noscript>[\s\S]*?<\/noscript>/, '').matchAll(/<(div|main|section|aside|dialog|nav|header|footer)\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(boxes, ['<div class="device">', '<main id="screen" role="main">', '<div id="route-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true">'], 'index.html now holds a visible element outside #screen, which the tag badge does not watch');
});

/* -------------------------------------------- selectors still match their own file */

test('every selector names only classes and attributes its file still contains', () => {
  for (const [tag, e] of entries) {
    if (!e.sel || e.retired) continue;
    const src = read(new URL(e.file, REPO));
    const classes = [...e.sel.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]);
    for (const c of classes) {
      assert.match(src, new RegExp(`(^|[^\\w-])${c}(?![\\w-])`), `${tag}: selector ${e.sel} needs class "${c}" and ${e.file} does not contain it`);
    }
    // onboarding's data-step lives on the page markup in onboarding.js, its values in the flow.
    const attrs = [...e.sel.matchAll(/\[([A-Za-z][\w-]*)/g)].map((m) => m[1]);
    for (const a of attrs) {
      // A data attribute is set either as the literal or as `el.dataset.camelName = ...`.
      const camel = a.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const found = src.includes(a) || (a.startsWith('data-') && src.includes(`dataset.${camel}`));
      assert.ok(found, `${tag}: selector ${e.sel} needs attribute "${a}" and ${e.file} does not contain it`);
    }
  }
});

/* ----------------------------------------------------------- the badge's chooser */

test('with only its own selector present, every entry is the one chosen', () => {
  for (const [tag, e] of entries) {
    if (e.route === null || e.retired) continue;
    const route = e.route === '*' ? 'camera' : e.route;
    const got = pickTag(route, (sel) => sel === e.sel);
    assert.equal(got, tag, `${tag} (${e.id}) was not chosen when its own selector matched; got ${got}`);
  }
});

test('with nothing matching, a route falls back to its own first entry, never another route\'s', () => {
  for (const route of routesTagged) {
    const got = pickTag(route, () => false);
    assert.equal(SCREEN_TAGS[got].route, route, `${route} fell back to ${got}, which belongs to another route`);
    // The route's always-matching base entry if it has one, else its first entry.
    const base = entries.find(([, e]) => e.route === route && !e.sel);
    const first = entries.find(([, e]) => e.route === route);
    assert.equal(got, (base ?? first)[0], `${route} fell back to ${got}`);
  }
});

test('a render failure page outranks whatever the screen underneath was', () => {
  assert.equal(SCREEN_TAGS[pickTag('camera', () => true)].id, 'screen-error');
  assert.equal(SCREEN_TAGS[pickTag('you', (s) => s === '.screen-error')].id, 'screen-error');
});

test('a retired tag keeps its number and is never chosen', () => {
  const tags = { a1: { route: 'r' }, a2: { route: 'r', sel: '.x', rank: 9, retired: true } };
  assert.equal(pickTag('r', () => true, tags), 'a1', 'a retired tag was chosen');
  assert.equal(SCREEN_TAGS.a81.retired, true, 'the Manual Search mode tag is no longer marked retired');
  assert.equal(pickTag('camera', (sel) => sel === SCREEN_TAGS.a81.sel), 'a32', 'a camera that shows no mode still lands on a retired tag');
});

test('a route with no entry gets no tag, which the badge draws as a?', () => {
  assert.equal(pickTag('no-such-screen', () => false), null);
});

test('a sheet over the camera wins, and a modal over a list wins', () => {
  const on = (...sels) => (s) => sels.includes(s);
  const id = (route, m) => SCREEN_TAGS[pickTag(route, m)].id;
  assert.equal(id('camera', on('.sheet.verdict:not(.gemini):not(.dist)[data-detent="half"]', '.cam[data-state="idle"][data-mode="photo"]')), 'camera.verdict.half');
  assert.equal(id('camera', on('.sheet.refusal.gemini-failed', '.cam[data-state="idle"][data-mode="photo"]')), 'camera.gemini.failed');
  assert.equal(id('camera', on('.sheet.verdict.gemini[data-detent="full"]', '.toast[data-toast]')), 'camera.verdict.toast');
  assert.equal(id('camera', on('.sheet.verdict.gemini[data-detent="half"]', '.sheet.gemini[data-detent="half"] [data-gem-history]')), 'camera.gemini.history');
  assert.equal(id('camera', on('.sheet.refusal[data-needs-connection]', '.cam[data-state="idle"][data-mode="photo"]')), 'camera.needsconnection');
  assert.equal(id('watchlist', on('.pmodal[data-pmodal="scan"]', '.empty')), 'watchlist.detail.scan');
  assert.equal(id('pastscans', on('.pmodal[data-pmodal="refusal"]', '.list-state [data-act="retry"]')), 'pastscans.detail.refusal');
  assert.equal(id('pastscans', on('.pmodal[data-pmodal="answer"]', '.empty')), 'pastscans.detail.answer');
});

/* ------------------------------------------------------------- the switch and badge */

test('?tags=1 and ?tags=0 win over storage, and no flag falls back to storage', () => {
  assert.deepEqual(readTagsSwitch('?tags=1', false), { on: true, persist: true });
  assert.deepEqual(readTagsSwitch('?s=you&tags=0', true), { on: false, persist: true });
  assert.deepEqual(readTagsSwitch('', true), { on: true, persist: false });
  assert.deepEqual(readTagsSwitch('?s=you', false), { on: false, persist: false });
});

/** The badge in a tiny DOM: absent by default, present and right when switched on. */
function withBrowser(fn) {
  const doc = makeDocument();
  const storage = makeStorage();
  const restore = installBrowser({ doc, storage });
  // The mini DOM has no remove(); the badge uses the real one.
  const had = MiniElement.prototype.remove;
  MiniElement.prototype.remove = function remove() {
    if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
    this.parentNode = null;
  };
  try {
    return fn({ doc, storage });
  } finally {
    setTagsOn(false);
    MiniElement.prototype.remove = had;
    restore();
  }
}

const badgeIn = (doc) => doc.body.querySelector('.screen-tag');

test('the badge is hidden by default: no element exists until tags are switched on', () => {
  withBrowser(({ doc }) => {
    const root = doc.createElement('main');
    root.dataset.screen = 'you';
    mountTags(root, '');
    assert.equal(tagsOn(), false);
    assert.equal(badgeIn(doc), null);
  });
});

test('?tags=1 draws the badge with the right tag, remembers it, and ?tags=0 removes it', () => {
  withBrowser(({ doc, storage }) => {
    const root = doc.createElement('main');
    root.dataset.screen = 'you';
    mountTags(root, '?tags=1');
    assert.equal(tagsOn(), true);
    assert.equal(badgeIn(doc)?.textContent, 'a66');
    assert.equal(storage.getItem('shin.tags'), '1');

    // A later launch with no flag reads it back from storage.
    mountTags(root, '');
    assert.equal(badgeIn(doc)?.textContent, 'a66');

    mountTags(root, '?tags=0');
    assert.equal(tagsOn(), false);
    assert.equal(badgeIn(doc), null);
    assert.equal(storage.getItem('shin.tags'), null);
  });
});

test('the badge follows the screen: a new route, an onboarding step, and a screen with no entry', () => {
  withBrowser(({ doc }) => {
    const root = doc.createElement('main');
    doc.body.appendChild(root);
    mountTags(root, '?tags=1');

    root.dataset.screen = 'market';
    refreshTag();
    assert.equal(badgeIn(doc).textContent, 'a67');

    root.dataset.screen = 'onboarding';
    const step = doc.createElement('div');
    step.setAttribute('data-step', 'shops');
    root.appendChild(step);
    refreshTag();
    assert.equal(badgeIn(doc).textContent, 'a3');

    root.dataset.screen = 'not-registered';
    refreshTag();
    assert.equal(badgeIn(doc).textContent, 'a?');
  });
});

test('the badge is one element, however often it is refreshed', () => {
  withBrowser(({ doc }) => {
    const root = doc.createElement('main');
    root.dataset.screen = 'camera';
    mountTags(root, '?tags=1');
    for (let i = 0; i < 5; i += 1) refreshTag();
    assert.equal(doc.body.querySelectorAll('.screen-tag').length, 1);
  });
});

test('the badge draws over everything, takes no taps, and never animates', () => {
  const css = read(new URL('css/shell.css', new URL('../public/', import.meta.url)));
  const rule = /\.screen-tag\s*\{([^}]*)\}/.exec(css)?.[1];
  assert.ok(rule, 'shell.css has no .screen-tag rule');
  assert.match(rule, /position:\s*fixed/);
  assert.match(rule, /pointer-events:\s*none/);
  assert.match(rule, /z-index:\s*2147483647/);
  assert.match(rule, /env\(safe-area-inset-top/);
  assert.match(rule, /env\(safe-area-inset-right/);
  assert.doesNotMatch(css.slice(css.indexOf('.screen-tag')), /(transition|animation)\s*:/, 'the badge must not animate');
});

test('the You screen has the Show screen tags switch, and the router sets the badge', () => {
  const you = readJs('screens/you.js');
  assert.match(you, /t\('dev_tags'\)/);
  assert.match(readJs('ui-strings.js'), /dev_tags: 'Show screen tags'/);
  assert.match(you, /data-tags-switch/);
  assert.match(you, /setTagsOn\(/);
  const router = readJs('router.js');
  assert.match(router, /mountTags\(/);
  assert.match(router, /refreshTag\(\)/);
});

/* -------------------------------------------------------- the readable copy agrees */

test('docs/screen-tags.md has exactly the registry\'s rows', () => {
  const md = read(new URL('docs/screen-tags.md', REPO));
  const rows = new Map();
  for (const m of md.matchAll(/^\| (a\d+) \| (.+?) \| (.+?) \| `([^`]+)` \|$/gm)) rows.set(m[1], { title: m[2], how: m[3], file: m[4] });
  assert.equal(rows.size, entries.length, `the doc has ${rows.size} rows and the registry has ${entries.length} entries`);
  for (const [tag, e] of entries) {
    const r = rows.get(tag);
    assert.ok(r, `docs/screen-tags.md has no row for ${tag}`);
    assert.equal(r.title, e.title, `${tag} name differs between the doc and the registry`);
    assert.equal(r.how, e.how, `${tag} how-to-reach differs between the doc and the registry`);
    assert.equal(r.file, e.file, `${tag} file differs between the doc and the registry`);
  }
  assert.ok(!md.includes(EM), 'the doc contains an em dash');
});

test('the not-tagged list is kept, with a reason on every line', () => {
  assert.ok(NOT_TAGGED.length >= 10);
  for (const n of NOT_TAGGED) {
    assert.ok(n.what.trim() && n.why.trim().length > 15, `not-tagged entry "${n.what}" needs a real reason`);
    assert.ok(!`${n.what}${n.why}`.includes(EM));
  }
  const md = read(new URL('docs/screen-tags.md', REPO));
  for (const n of NOT_TAGGED) assert.ok(md.includes(n.what), `the doc is missing the not-tagged line "${n.what}"`);
});
