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

/* -------------------------------------------- selectors still match their own file */

test('every selector names only classes and attributes its file still contains', () => {
  for (const [tag, e] of entries) {
    if (!e.sel) continue;
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
    if (e.route === null) continue;
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

test('a route with no entry gets no tag, which the badge draws as a?', () => {
  assert.equal(pickTag('no-such-screen', () => false), null);
});

test('a sheet over the camera wins, and a modal over a list wins', () => {
  const on = (...sels) => (s) => sels.includes(s);
  const id = (route, m) => SCREEN_TAGS[pickTag(route, m)].id;
  assert.equal(id('camera', on('.sheet.verdict[data-detent="half"]', '.cam[data-state="idle"][data-mode="photo"]')), 'camera.verdict.half');
  assert.equal(id('camera', on('.sheet.refusal[data-detent="peek"]', '.sheet.refusal[data-needs-connection]')), 'camera.needsconnection');
  assert.equal(id('watchlist', on('.pmodal', '.pmodal .pmodal-conf', '.empty')), 'watchlist.detail.scan');
  assert.equal(id('pastscans', on('.pmodal', '.list-state [data-act="retry"]')), 'pastscans.detail.refusal');
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
