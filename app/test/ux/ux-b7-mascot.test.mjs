/**
 * UX build 7, mascot and personality. Blocks R-58, R-59, R-61, R-71, R-72, R-73, R-74, R-75, R-76 of
 * docs/design/ux-evidence-2026-10-09.md (section 13, build 7), plus the keep blocks R-16, R-20, R-21, R-29,
 * R-32, R-34, R-57 (percent choices, the only add among them) and R-77.
 *
 * Test names start with the block number and quote the pass: "(build 7)" is behaviour the build must add and
 * is RED today; "(keep)" is behaviour that exists and is GREEN today; a "(keep)" test that is red is a defect.
 * "(fails loudly)" names the contract a silent failure must turn into. The loud tests import modules or
 * exports that do not exist yet (lib names are proposals, listed in the failure message); they are red until
 * the build adds them, and the build may rename them in the same commit as it edits this file.
 *
 * EXPECTED RED UNTIL BUILD 7 LANDS (build 7 tests):
 *   R-61  every voice's lines at most 12 words (x3 voices), at most 2 sentences (x3), the bubble at 14 px,
 *         assertMascotLine throws
 *   R-58  You shows a sample line under each voice; setPersonality throws on an unknown voice
 *   R-59  nothing on the share card under 32 px
 *   R-16  sale dots have a different shape from store dots
 *   R-71  (none red: every placement rule already holds; see the keep list)
 *   R-72  a low-confidence great or good price does not get a smiling face; distFace throws on an unknown confidence
 *   R-73  the correction line owns the report and promises nothing; the face is plain
 *   R-74  every timer that changes Pexi's line carries a budget classification; recordInterruption throws past the cap
 *   R-76  the paywall line names the day the scans return
 *   R-57  great's percent choices include 35, 40, 50; rangePatch throws on a value that is not offered
 *
 * EXPECTED GREEN TODAY (keep tests): R-16 word+face+position, R-20 retry keeps the price, R-21 no notification
 * code anywhere, R-29 one-tap Save and "Saved" in place, R-32 the read-only card closes by button, backdrop and
 * Escape, R-34 defaults and ordering, R-57 defaults unchanged, R-58 three voices and default, Setup sample line,
 * R-59 no link and one verdict, R-61 no dash and no number that is not a fact, R-71 placements and prohibitions,
 * R-72 intense faces gated on confidence, R-74 the budget and the 4000 ms escalation, R-75 not on first run and
 * two taps, R-76 never blames, R-77 welcome flow off.
 *
 * WHAT JSDOM CANNOT MEASURE. There is no jsdom (zero runtime dependencies); screens render into
 * test/mini-dom.mjs, which keeps innerHTML as text, and are read as markup. Not measured here: how many lines a
 * bubble wraps to at 14 px on a real phone (only the word and sentence count and the declared font size are),
 * whether the face looks plain or angry (only the face state name), the share card's pixels (the canvas is a
 * recording stub, so font sizes and texts drawn are exact but the picture is not), colour-blind simulation
 * (T-9), and the phone's own permission prompt (R-71 "never over it": the OS draws that, no test can see it).
 *
 * Run: node --test --test-global-setup=test/setup/global.mjs test/ux/ux-b7-mascot.test.mjs
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { makeDocument, makeStorage, installBrowser, MiniElement } from '../mini-dom.mjs';

const storage = makeStorage();
const doc = makeDocument();
installBrowser({ doc, storage });

const store = await import('../../public/js/store.js');
const voice = await import('../../public/js/voice.js');
const { say, personality, setPersonality, personalityCopy, PERSONALITIES, DEFAULT_PERSONALITY } = voice;
const F = await import('../verdict-fixtures.mjs');
const camera = await import('../../public/js/screens/camera.js');
const watchlist = await import('../../public/js/screens/watchlist.js');
const pastscans = await import('../../public/js/screens/pastscans.js');
const removedScreen = await import('../../public/js/screens/removed.js');
const paywallMod = await import('../../public/js/screens/paywall.js');
const youScreen = (await import('../../public/js/screens/you.js')).default;
const shareScreen = (await import('../../public/js/screens/share.js')).default;
const setupScreen = (await import('../../public/js/screens/setup.js')).default;
const shin = await import('../../public/js/shin.js');
const H = await import('../../public/js/lib/history-answer.js');
const ranges = await import('../../public/js/lib/ranges.js');
const rangePicker = await import('../../public/js/lib/range-picker.js');
const listscreen = await import('../../public/js/lib/listscreen.js');
const flow = await import('../../public/js/onboarding-flow.js');
const { FLAGS } = await import('../../public/js/flags.js');
const { bellSvg } = await import('../../public/js/lib/verdict-chart.js');

const ROOT_URL = new URL('../../public/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT_URL), 'utf8').replace(/\r\n/g, '\n');
const VOICE_SRC = read('js/voice.js');
const CAMERA_SRC = read('js/screens/camera.js');
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const IDS = PERSONALITIES.map((p) => p.id);

/** Every .js file under public/js except vendored and chunk output. */
function jsFiles(dir = new URL('js/', ROOT_URL)) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = new URL(name + (statSync(new URL(name, dir)).isDirectory() ? '/' : ''), dir);
    if (statSync(p).isDirectory()) { if (name !== 'vendor' && name !== 'chunks') out.push(...jsFiles(p)); } else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/* ================================================================ the line table */

/** Every key of the English LINES table, read off the source the way test/voice.test.mjs does. */
function lineKeys() {
  const start = VOICE_SRC.indexOf('const LINES_EN');
  assert.notEqual(start, -1, 'voice.js no longer declares LINES_EN; the line parser must be updated');
  const open = VOICE_SRC.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < VOICE_SRC.length; end += 1) {
    if (VOICE_SRC[end] === '{') depth += 1;
    else if (VOICE_SRC[end] === '}' && --depth === 0) break;
  }
  return [...VOICE_SRC.slice(open + 1, end).matchAll(/\n {2}([a-z][a-z0-9_]*):\s*\{/g)].map((m) => m[1]);
}
const KEYS = lineKeys();

/** Page prose and headings that are not spoken in the bubble; every other key is a mascot line (R-61). */
const NOT_A_BUBBLE_LINE = /^(you_|consent_|refusal_label_)/;
const BUBBLE_KEYS = KEYS.filter((k) => !NOT_A_BUBBLE_LINE.test(k));

/** Realistic facts, and a fallback of one short word for any name a line asks for that is not listed. */
const REAL = {
  price: '$4.99', cents: '$4.99', amount: '$4.99', asking: '$4.99', usual: '$3.49', centre: '$3.49', low: '$0.55', high: '$1.47',
  item: 'Kraft Dinner', label: 'Kraft Dinner 225g', seller: 'Metro', day: 'today', category: 'grocery', what: 'the list', word: 'Walk away',
  count: '3', n: '2', scanned: '4', callable: '2', query: 'peanut butter', when: 'Monday', verdict: 'walk away',
};
const factsWith = (bag, fallback) => new Proxy(bag, { get: (t, k) => (typeof k !== 'string' ? undefined : k in t ? t[k] : fallback) });
const REAL_FACTS = factsWith(REAL, 'Metro');
const BARE_FACTS = factsWith({}, 'XX');

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const sentences = (s) => String(s).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean).length;

function quiet(fn) {
  const spy = mock.method(console, 'error', () => {});
  try { return fn(); } finally { spy.mock.restore(); }
}

const LIMIT_WORDS = 12;
const LIMIT_SENTENCES = 2;

test('R-61 (control): the line table is parsed and the counters count (negative control)', () => {
  assert.ok(KEYS.length > 100, `parsed only ${KEYS.length} keys from voice.js; the parser has stopped matching`);
  for (const k of ['good', 'walk_away', 'price_pad_prompt', 'paywall_say', 'correct_thanks', 'hint_escalated']) {
    assert.ok(KEYS.includes(k), `key ${k} not found: the parser is blind`);
  }
  assert.ok(BUBBLE_KEYS.length > 80 && BUBBLE_KEYS.length < KEYS.length, 'the not-a-bubble filter removed nothing or everything');
  assert.equal(words('one two three'), 3);
  assert.equal(words('  '), 0);
  assert.equal(sentences('One. Two. Three.'), 3);
  assert.equal(sentences('Only one sentence here'), 1);
  assert.equal(sentences('$1.47 is the price. Fine.'), 2, 'a price with a point in it must not split a sentence');
});

for (const id of IDS) {
  test(`R-61 (build 7): in the ${id} voice no mascot line is longer than ${LIMIT_WORDS} words`, () => {
    const over = [];
    quiet(() => {
      for (const key of BUBBLE_KEYS) {
        const line = say(key, REAL_FACTS, id);
        if (words(line) > LIMIT_WORDS) over.push(`${key} (${words(line)}): ${line}`);
      }
    });
    assert.equal(over.length, 0, `${over.length} of ${BUBBLE_KEYS.length} ${id} lines are over ${LIMIT_WORDS} words. First ones:\n${over.slice(0, 12).join('\n')}`);
  });

  test(`R-61 (build 7): in the ${id} voice no mascot line is longer than ${LIMIT_SENTENCES} sentences`, () => {
    const over = [];
    quiet(() => {
      for (const key of BUBBLE_KEYS) {
        const line = say(key, REAL_FACTS, id);
        if (sentences(line) > LIMIT_SENTENCES) over.push(`${key} (${sentences(line)}): ${line}`);
      }
    });
    assert.equal(over.length, 0, `${over.length} ${id} lines have more than ${LIMIT_SENTENCES} sentences. First ones:\n${over.slice(0, 12).join('\n')}`);
  });
}

test('R-61 (keep): no mascot line in any voice contains an em dash or an en dash', () => {
  const bad = [];
  quiet(() => {
    for (const key of KEYS) for (const id of IDS) if (/[–—]/.test(say(key, REAL_FACTS, id))) bad.push(`${key}/${id}`);
  });
  assert.deepEqual(bad, []);
  assert.ok(/[–—]/.test('a — b'), 'control: the dash matcher must see a dash');
});

/** Keys that may print a digit with no fact behind it, each with the reason. A stale entry fails the test. */
const DIGIT_ALLOWED = {
  attitude_sample: 'a sample line in the picker, not a verdict: it shows a price to show the tone',
  removed_retention: 'a retention policy constant stated as the screen heading line, not a price',
};

test('R-61 (keep): no line contains a number that did not arrive as a fact (the digits come only from facts)', () => {
  const hardcoded = [];
  const used = new Set();
  quiet(() => {
    for (const key of KEYS) {
      for (const id of IDS) {
        if (/\d/.test(say(key, BARE_FACTS, id))) {
          if (key in DIGIT_ALLOWED) used.add(key); else hardcoded.push(`${key}/${id}: ${say(key, BARE_FACTS, id)}`);
        }
      }
    }
  });
  assert.deepEqual(hardcoded, [], `lines with a hard-coded number:\n${hardcoded.join('\n')}`);
  for (const k of Object.keys(DIGIT_ALLOWED)) assert.ok(used.has(k), `DIGIT_ALLOWED lists ${k} but it prints no digit any more; remove the entry`);
  assert.ok(/\d/.test('30 days'), 'control: the digit matcher must see a digit');
});

test('R-61 (build 7): the bubble text is 14 px or smaller, so two lines hold twelve words', () => {
  const css = read('css/face.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /\.shin-say \.bubble-text\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, '.shin-say .bubble-text rule not found in face.css');
  const size = /font-size:\s*([\d.]+)px/.exec(rule[1]);
  assert.ok(size, '.shin-say .bubble-text declares no px font-size');
  assert.ok(Number(size[1]) <= 14, `bubble text is ${size[1]} px; R-61 sizes the two-line limit at 14 px`);
});

test('R-61 (fails loudly, build 7): voice.js exports assertMascotLine, which throws on a line over the limit and names the key', () => {
  assert.equal(typeof voice.assertMascotLine, 'function', 'build 7 must export assertMascotLine(line, key) from public/js/voice.js');
  const thirteen = 'one two three four five six seven eight nine ten eleven twelve thirteen';
  const twelve = 'one two three four five six seven eight nine ten eleven twelve';
  assert.equal(voice.assertMascotLine(twelve, 'k_ok'), twelve, 'a 12 word line must pass and be returned unchanged (control)');
  assert.throws(() => voice.assertMascotLine(thirteen, 'k_long'), /k_long/, 'a 13 word line must throw and name its key');
  assert.throws(() => voice.assertMascotLine('One. Two. Three.', 'k_three'), /k_three/, 'three sentences must throw');
  assert.throws(() => voice.assertMascotLine('Too steep — walk away', 'k_dash'), /k_dash/, 'an em dash must throw');
  assert.throws(() => voice.assertMascotLine('', 'k_empty'), /k_empty/, 'an empty line must throw, never print a blank bubble');
});

/* ===================================================================== R-58 */

test('R-58 (keep): three voices, Deadpan the default and stored as nothing', () => {
  assert.deepEqual(IDS, ['deadpan', 'warm', 'blunt']);
  assert.equal(DEFAULT_PERSONALITY, 'deadpan');
  storage.clear();
  store.reset();
  assert.equal(personality(), 'deadpan', 'a fresh install speaks Deadpan');
  assert.ok(store.get().personality == null, 'Deadpan is the default and is stored as nothing');
});

test('R-58 (keep): the voice changes the words, never the verdict word or the numbers', () => {
  for (const id of IDS) {
    const line = say('good', { asking: '$3.49', usual: '$4.29' }, id);
    assert.ok(line.length > 0, `${id} said nothing for good`);
  }
  const deadpan = say('walk_away', { asking: '$7.49', usual: '$5.99' }, 'deadpan');
  assert.match(deadpan, /\$7\.49/);
  assert.match(deadpan, /\$5\.99/);
  for (const id of IDS) assert.equal(typeof say('word_good', {}, id), 'string');
});

test('R-58 (keep): the Setup picker already shows a sample line, in the voice, under each choice', () => {
  const root = { innerHTML: '', dataset: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, setAttribute() {}, closest: () => null, contains: () => false };
  storage.clear();
  store.reset();
  // The wiring after the paint needs a real DOM; the markup is assigned first and is what is read.
  try { setupScreen.render(root, { go() {}, replace() {}, params: {}, store, api: {}, build: 't' }); } catch { /* wiring only */ }
  const html = root.innerHTML;
  assert.notEqual(html, '', 'Setup rendered nothing');
  for (const id of IDS) {
    assert.ok(html.includes(`data-who="${id}"`), `no choice for ${id}`);
    const sample = say('attitude_sample', {}, id);
    assert.ok(sample.length > 0, `${id} has no attitude_sample line`);
    assert.ok(stripTags(html).includes(stripTags(sample)), `Setup does not show the ${id} sample line "${sample}"`);
  }
  assert.equal(new Set(IDS.map((id) => say('attitude_sample', {}, id))).size, 3, 'the three samples are not three different lines');
});

/** A You root that survives the paint, copied from the pattern test/ux/ux-b2-paywall.test.mjs uses. */
function youRoot() {
  const noop = () => {};
  const el = () => new Proxy({}, {
    get: (t, p) => {
      if (p in t) return t[p];
      if (p === 'dataset' || p === 'style') return {};
      if (p === 'classList') return { toggle: noop, add: noop, remove: noop };
      if (p === 'querySelectorAll') return () => [];
      if (p === 'querySelector' || p === 'closest') return () => el();
      return noop;
    },
    set: (t, p, v) => { t[p] = v; return true; },
  });
  const root = el();
  root.addEventListener = noop;
  root.contains = () => false;
  return root;
}
function renderYou() {
  storage.clear();
  store.reset();
  const root = youRoot();
  try {
    youScreen.render(root, { api: { quota: () => new Promise(() => {}), scans: () => new Promise(() => {}), postConsent() {}, postEvent() {} }, go() {}, replace() {}, params: {}, build: 't' });
  } catch (err) {
    assert.fail(`You failed to render: ${err.message}`);
  }
  return root.innerHTML;
}

test('R-58 (build 7): the You picker shows one sample line under each voice', () => {
  const html = renderYou();
  const text = stripTags(html);
  const missing = IDS.filter((id) => !text.includes(stripTags(personalityCopy(id).sample)));
  assert.deepEqual(missing, [], `You shows no sample line for: ${missing.join(', ')}. It shows the blurb ("${personalityCopy('deadpan').blurb}") instead.`);
});

test('R-58 (keep): the sample lines already obey the line limit', () => {
  for (const id of IDS) {
    const sample = personalityCopy(id).sample.replace(/[“”]/g, '');
    assert.ok(words(sample) <= LIMIT_WORDS && sentences(sample) <= LIMIT_SENTENCES, `${id} sample is over the limit: ${sample}`);
  }
});

/* ===================================================================== R-75 */

test('R-75 (keep): the picker is in You, three choices in one radio group, none behind a disclosure', () => {
  const html = renderYou();
  for (const id of IDS) assert.ok(html.includes(`data-who="${id}"`), `You has no ${id} choice`);
  const group = html.slice(html.indexOf('atts atts-row'), html.indexOf('data-who="blunt"') + 400);
  assert.match(group, /role="radiogroup"/);
  assert.ok(!/<details|\shidden(?=[\s>=])|aria-expanded="false"/.test(group), 'the picker is behind a disclosure: more than 2 taps');
  assert.ok(/<details|\shidden(?=[\s>=])/.test('<details><summary>x</summary>') && /\shidden(?=[\s>=])/.test('<div hidden>'), 'control: the disclosure matcher must see a disclosure');
});

test('R-75 (keep): the picker is not on the first run, and the default voice applies from the first scan', () => {
  assert.equal(FLAGS.onboarding, false, 'the welcome flow must stay off, and Setup is part of it');
  for (const s of [{}, { permissionsSeen: true }, { permissionsSeen: true, consentSeen: true }]) {
    assert.notEqual(flow.firstScreen(s), 'setup', `first launch with ${JSON.stringify(s)} lands on the personality picker`);
  }
  assert.equal(flow.firstScreen({}, { ...FLAGS, onboarding: true }), 'onboarding', 'control: with the flag on a fresh install does see the flow');
  assert.equal(flow.firstScreen({ onboarding: { doneAt: 'x' } }, { ...FLAGS, onboarding: true }), 'setup', 'control: the matcher can see Setup when the flow is on');
  storage.clear();
  store.reset();
  assert.equal(personality(), 'deadpan');
});

test('R-75 (keep): choosing a voice is one tap away once on You and sticks', () => {
  storage.clear();
  store.reset();
  setPersonality('warm');
  assert.equal(personality(), 'warm');
  assert.notEqual(say('walk_away', { asking: '$7.49', usual: '$5.99' }), say('walk_away', { asking: '$7.49', usual: '$5.99' }, 'deadpan'));
  setPersonality('deadpan');
  store.reset();
});

test('R-75 (fails loudly, build 7): setPersonality throws on a voice that does not exist, instead of ignoring the tap', () => {
  storage.clear();
  store.reset();
  assert.throws(() => setPersonality('sassy'), /sassy|personality|voice/i, 'setPersonality("sassy") returned silently: a mistyped picker would be a dead tap');
  assert.throws(() => setPersonality(undefined), /personality|voice/i);
  assert.equal(personality(), 'deadpan', 'a rejected choice must leave the voice unchanged');
  setPersonality('blunt');
  assert.equal(personality(), 'blunt', 'control: a real voice still works');
  store.reset();
});

/* ===================================================================== R-59 */

/** Render the share screen with a recording canvas; returns every fillText with the font it was drawn in. */
async function drawShareCard() {
  storage.clear();
  store.reset();
  const snap = H.answerSnapshot(F.GOOD, { key: '0055773000795', name: 'Kraft Peanut Butter 500 g' });
  store.recordVerdict(snap, { text: snap.label, askingCents: 469, answered: true });
  const draws = [];
  let font = '';
  const g = new Proxy({}, {
    has: () => false,
    get(t, p) {
      if (p === 'measureText') return (s) => ({ width: String(s).length * 10 });
      if (p === 'fillText') return (text, x, y) => draws.push({ text: String(text), font, x, y });
      if (p === 'font') return font;
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { if (p === 'font') font = v; t[p] = v; return true; },
  });
  const canvas = { hidden: false, textContent: '', getContext: () => g };
  const other = { hidden: false, textContent: '' };
  const root = {
    innerHTML: '', dataset: {}, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, setAttribute() {}, closest: () => null, contains: () => false,
    querySelector: (sel) => (/shr-canvas/.test(sel) ? canvas : /shr-/.test(sel) ? other : null),
  };
  const saved = { cs: globalThis.getComputedStyle, Image: globalThis.Image };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.Image = class { set src(_v) { setTimeout(() => this.onerror?.(), 0); } };
  const spy = mock.method(console, 'error', () => {});
  try {
    shareScreen.render(root, { go() {}, replace() {}, params: { id: '0055773000795' }, store, api: {}, build: 't' });
    await new Promise((r) => setTimeout(r, 60));
  } finally {
    spy.mock.restore();
    globalThis.getComputedStyle = saved.cs;
    globalThis.Image = saved.Image;
  }
  const px = (d) => Number(/(\d+(?:\.\d+)?)px/.exec(d.font)?.[1]);
  return { draws: draws.map((d) => ({ ...d, px: px(d) })), html: root.innerHTML };
}

test('R-59 (control): the card recorder sees the card (negative control: the word is drawn at 108 px)', async () => {
  const { draws } = await drawShareCard();
  assert.ok(draws.length >= 8, `only ${draws.length} texts were drawn; the recorder or the screen is broken`);
  assert.equal(Math.max(...draws.map((d) => d.px)), 108, 'the verdict word is not the 108 px text: the recorder reads sizes wrongly');
  assert.ok(draws.every((d) => Number.isFinite(d.px)), 'a drawn text has no readable size');
});

test('R-59 (build 7): every text on the 1080 px card is at least 32 px', async () => {
  const { draws } = await drawShareCard();
  const small = draws.filter((d) => d.px < 32).map((d) => `${d.px} px "${d.text}"`);
  assert.deepEqual(small, [], `${small.length} texts are under 32 px at 1080 wide:\n${small.join('\n')}`);
});

test('R-59 (keep): the card carries no link, no host name and no store address', async () => {
  const { draws, html } = await drawShareCard();
  const all = draws.map((d) => d.text).join(' | ');
  assert.ok(!/https?:|www\.|\.com\b|\.ca\b|\.app\b|\/\/|app store|play store/i.test(all), `a link is drawn on the card: ${all}`);
  assert.ok(!/https?:\/\/|download|app store|play store/i.test(html), 'the share screen carries a link');
  assert.ok(/https?:\/\/x\.com/i.test('see https://x.com'), 'control: the link matcher must see a link');
});

test('R-59 (keep): one verdict word on the card, and the card never says saved', async () => {
  const { draws } = await drawShareCard();
  const word = H.answerWord(H.answerOf({ answer: H.answerSnapshot(F.GOOD, { key: 'k', name: 'x' }) }) ?? H.answerSnapshot(F.GOOD, { key: 'k', name: 'x' }));
  assert.equal(draws.filter((d) => d.text === word).length, 1, `the verdict word "${word}" is not drawn exactly once`);
  assert.ok(!draws.some((d) => /\bsaved\b|\bsavings?\b/i.test(d.text)), 'the card claims a saving');
});

/* ===================================================================== R-16 */

const SHEET = (raw, name = 'Kraft Peanut Butter 500 g') => camera.distributionSheet(raw, { name });
const faceStateOf = (html) => /<div class="shin-say" data-state="(\w+)"/.exec(html)?.[1];

test('R-16 (keep): each of the four verdicts is named by a word, a face and a position, not by colour', () => {
  const cases = { great: F.GREAT, good: F.GOOD, reasonable: F.REASONABLE, bad: F.BAD };
  const words4 = new Set();
  const faces4 = new Set();
  for (const [zone, raw] of Object.entries(cases)) {
    const html = SHEET(raw);
    const headline = /data-dist-headline>([^<]+)</.exec(html)?.[1];
    assert.ok(headline && headline.trim().length > 0, `${zone}: no verdict word`);
    words4.add(headline);
    const face = faceStateOf(html);
    assert.ok(face, `${zone}: no face`);
    faces4.add(face);
    assert.match(html, /data-vb-you="\d+"/, `${zone}: the shopper's own price has no position on the bell`);
    assert.match(html, /aria-label="[^"]+"/, `${zone}: the face has no text label`);
  }
  assert.equal(words4.size, 4, `the four verdict words are not four different words: ${[...words4]}`);
  assert.equal(faces4.size, 4, `the four verdicts do not wear four different faces: ${[...faces4]}`);
});

test('R-16 (build 7): sale dots are drawn in a different shape from store dots, not only a different colour', () => {
  const html = SHEET(F.MEDIUM_SALE_BULK);
  const shapes = [...html.matchAll(/<(\w+) class="vb-dot vb-dot-(regular|sale)\b/g)].map((m) => ({ tag: m[1], kind: m[2] }));
  const regular = shapes.find((s) => s.kind === 'regular');
  const sale = shapes.find((s) => s.kind === 'sale');
  assert.ok(regular && sale, `the fixture must draw a store dot and a sale dot (found ${JSON.stringify(shapes)})`);
  assert.notEqual(sale.tag, regular.tag, `a sale dot is a <${sale.tag}> like the store dot: a hollow dashed circle differs by fill only`);
  assert.ok(typeof bellSvg === 'function');
});

/* ===================================================================== R-20 */

test('R-20 (keep): Try again on the offline and fault sheets sends the same barcode and the same typed price', () => {
  const handler = /if \(act === 'lookup-retry' && lastLookup\) \{([\s\S]*?)\n {6}\}/.exec(CAMERA_SRC);
  assert.ok(handler, 'the lookup-retry handler is gone');
  assert.match(handler[1], /resolveBarcode\(again\.code, again\.cents\)/, 'retry no longer resends the code and the price');
  const sets = [...CAMERA_SRC.matchAll(/lastLookup = \{ code, cents \};/g)].length;
  assert.ok(sets >= 2, `lastLookup is remembered in ${sets} place(s); both the offline and the fault branch must remember the price`);
  assert.ok(!/lastLookup = null/.test(CAMERA_SRC.slice(CAMERA_SRC.indexOf("act === 'lookup-retry'"), CAMERA_SRC.indexOf("act === 'lookup-retry'") + 400)), 'retry clears the price before using it');
});

/* ===================================================================== R-21 */

const NOTIFICATION_CODE = /Notification\.requestPermission|new Notification\(|showNotification|PushManager|pushManager|push-notifications|local-notifications|POST_NOTIFICATIONS|UNUserNotificationCenter|aps-environment|remote-notification|registerForRemoteNotifications/;

test('R-21 (keep): the matcher sees notification code (negative control)', () => {
  for (const sample of ['Notification.requestPermission()', 'reg.showNotification("x")', '"@capacitor/push-notifications": "^6"', '<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>']) {
    assert.ok(NOTIFICATION_CODE.test(sample), `the matcher misses: ${sample}`);
  }
});

test('R-21 (keep): no notification code in the web app, the service worker, or the native shell', () => {
  const hits = [];
  for (const p of jsFiles()) if (NOTIFICATION_CODE.test(readFileSync(p, 'utf8'))) hits.push(p.pathname);
  if (NOTIFICATION_CODE.test(read('sw.js'))) hits.push('sw.js');
  const native = new URL('../../../native/', import.meta.url);
  const scan = (dir, depth = 0) => {
    if (depth > 6) return;
    for (const name of readdirSync(dir)) {
      if (['node_modules', 'Pods', 'build', '.gradle', 'www', '.git'].includes(name)) continue;
      const p = new URL(name + (statSync(new URL(name, dir)).isDirectory() ? '/' : ''), dir);
      if (statSync(p).isDirectory()) scan(p, depth + 1);
      else if (/(package\.json|capacitor\.config\.json|AndroidManifest\.xml|Info\.plist|\.entitlements)$/.test(name) && NOTIFICATION_CODE.test(readFileSync(p, 'utf8'))) hits.push(p.pathname);
    }
  };
  scan(native);
  assert.deepEqual(hits, [], `notification code exists but R-21 says none ships in version 1:\n${hits.join('\n')}`);
});

test('R-21 (keep): the price feed that would send alerts is switched off', () => {
  assert.equal(FLAGS.feed, false);
});

/* ===================================================================== R-29, R-32, R-34, R-57 */

test('R-29 (keep): Verdict to Saved is one tap on the primary button, and it reads "Saved" in place', () => {
  const unsaved = SHEET(F.GOOD);
  assert.equal([...unsaved.matchAll(/data-act="dist-save"/g)].length, 1, 'the sheet needs exactly one save button');
  const prim = /<div class="actions actions-primary">\s*<button[^>]*data-act="dist-save"[^>]*>([^<]*)</.exec(unsaved);
  assert.ok(prim, 'the save button is not the primary action of the first sheet position');
  const saved = camera.distributionSheet(F.GOOD, { name: 'x', saved: true });
  assert.match(saved, /data-act="dist-save"[^>]*>Saved</, 'after saving the same button reads "Saved"');
  for (const id of IDS) assert.ok(!/alert|notify|tell you|watch|drops?\b/i.test(say('peek_watching', {}, id)), `${id} Saved confirmation promises an alert`);
});

test('R-32 (keep): the Saved card is read-only and closes by its Close button, a tap outside, or Escape', () => {
  const html = watchlist.detailModal({ id: 'w1', label: 'Kraft Peanut Butter 500 g', askingSeller: 'Metro', lastCents: 349, usualCents: 429, savedAt: new Date().toISOString() }, null);
  assert.match(html, /data-act="close-detail"/, 'no Close button');
  assert.match(html, /data-act="modal"/, 'no backdrop target');
  assert.ok(!/<input|<textarea|data-act="remove"/.test(html), 'the card is meant to be read-only');
  let closed = 0;
  const card = { focus() {}, querySelectorAll: () => [], contains: () => false };
  const rootStub = { querySelector: (s) => (s === '.pmodal-card' ? card : null) };
  const onKey = listscreen.modalKeys(rootStub, () => true, () => { closed += 1; });
  onKey({ key: 'Escape', preventDefault() {} });
  assert.equal(closed, 1, 'Escape did not close the card');
  onKey({ key: 'a', preventDefault() {} });
  assert.equal(closed, 1, 'control: another key must not close it');
  const shut = listscreen.modalKeys(rootStub, () => false, () => { closed += 1; });
  shut({ key: 'Escape', preventDefault() {} });
  assert.equal(closed, 1, 'control: with no card open Escape must do nothing');
});

test('R-34 (keep): the three thresholds keep their defaults and great is never below good', () => {
  assert.deepEqual({ ...ranges.DEFAULT_PERCENTS }, { great: 30, good: 20, bad: 20 });
  assert.deepEqual({ ...ranges.DEFAULT_AMOUNTS }, { great: 2, good: 1, bad: 1 });
  const lowerGreat = ranges.rangePatch({}, 'great', 10);
  assert.ok(lowerGreat.lineUnderPct <= lowerGreat.lineGreatPct, 'lowering great left good above it');
  const raiseGood = ranges.rangePatch({}, 'good', 30);
  assert.ok(raiseGood.lineGreatPct >= raiseGood.lineUnderPct, 'raising good left great below it');
  const html = rangePicker.rangePickerHtml({}, 'you');
  for (const kind of ['great', 'good', 'bad']) assert.ok(html.includes(`data-range-row="${kind}"`), `no ${kind} row`);
});

test('R-57 (keep): the defaults are the founder numbers and each default is one of the offered choices', () => {
  for (const kind of ['great', 'good', 'bad']) {
    assert.ok(ranges.PERCENT_CHOICES.includes(ranges.DEFAULT_PERCENTS[kind]), `${kind} default ${ranges.DEFAULT_PERCENTS[kind]} is not offered`);
    assert.ok(ranges.AMOUNT_CHOICES.includes(ranges.DEFAULT_AMOUNTS[kind]), `${kind} amount default is not offered`);
  }
});

test('R-57 (build 7): great can be made stricter than the default: the percent choices include 35, 40 and 50', () => {
  const missing = [35, 40, 50].filter((n) => !ranges.PERCENT_CHOICES.includes(n));
  assert.deepEqual(missing, [], `percent choices today: ${ranges.PERCENT_CHOICES.join(', ')}; missing ${missing.join(', ')}`);
  const html = rangePicker.rangePickerHtml({}, 'you');
  const great = html.slice(html.indexOf('data-range-row="great"'), html.indexOf('data-range-row="good"'));
  for (const n of [35, 40, 50]) assert.ok(new RegExp(`>\\s*${n}\\s*%?\\s*<`).test(great), `the great row does not offer ${n}`);
  assert.equal(ranges.DEFAULT_PERCENTS.great, 30, 'the default must not move');
});

test('R-57 (fails loudly, build 7): rangePatch throws on a kind or a value the picker does not offer, instead of returning an empty patch', () => {
  assert.throws(() => ranges.rangePatch({}, 'greatest', 30), /greatest|kind|range/i, 'an unknown kind returned silently');
  assert.throws(() => ranges.rangePatch({}, 'great', 33), /33|offered|choice/i, '33 percent is not offered and was accepted');
  assert.throws(() => ranges.rangePatch({}, 'great', NaN), /NaN|value|offered|choice/i, 'NaN returned silently');
  assert.ok(ranges.rangePatch({}, 'great', 30).lineGreatPct === 30, 'control: an offered choice still works');
});

/* ===================================================================== R-71 */

const SMILING_OR_INTENSE = new Set(['good', 'delighted', 'pleased', 'proud', 'angry']);

test('R-71 (keep): the face is never drawn under 28 px, and the share face is the largest token', () => {
  assert.equal(shin.SIZE_TOKENS['face-row'], 28);
  assert.equal(shin.SIZE_TOKENS['face-share'], 220);
  assert.ok(Math.max(...Object.values(shin.SIZE_TOKENS)) === 220);
  const tiny = shin.faceSvg('fair', { size: 10 });
  assert.match(tiny, /width="28"/, 'a 10 px request was drawn smaller than the 28 px floor');
});

function sampleRows() {
  const answer = { kind: 'distribution', id: 'w1', label: 'Kraft Peanut Butter 500 g', zone: 'good', confidence: 'high', centreCents: 429, p10Cents: 350, p90Cents: 520, currency: 'CAD', askingCents: 349, offByPct: -19, basis: 'own_prices' };
  const w = { id: 'w1', label: 'Kraft Peanut Butter 500 g', askingSeller: 'Metro', lastCents: 349, usualCents: 429, savedAt: new Date().toISOString(), answer };
  const h = { id: 'h1', at: new Date().toISOString(), answer, query: { text: 'Kraft Peanut Butter', askingCents: 349 } };
  return [['Saved', watchlist.row(w, [])], ['Past scans', pastscans.row(h)]];
}

test('R-71 (keep): the mascot is not animated in list rows (28 px, static, data-anim none)', () => {
  const rows = sampleRows();
  for (const [name, markup] of rows) {
    const face = /<svg[^>]*class="face [^"]*"[^>]*>/.exec(markup);
    assert.ok(face, `${name} row shows no face (control: the row must draw one)`);
    assert.match(face[0], /width="28"/, `${name} row face is not 28 px`);
    assert.match(face[0], /data-anim="none"/, `${name} row face is animated`);
    assert.match(face[0], /face-static/, `${name} row face is not marked static`);
  }
});

test('R-71 (keep): the mascot does not appear inside or on the chart', () => {
  const html = SHEET(F.GOOD);
  const start = html.indexOf('data-dist-chart>');
  assert.notEqual(start, -1, 'the chart region was not found');
  const chart = html.slice(start, html.indexOf('</svg>', start) + 6);
  assert.ok(chart.includes('vb-'), 'the extracted chart is not the bell (control)');
  assert.ok(!/class="face|shin-say|face-block/.test(chart), 'a face is drawn inside the chart');
  assert.ok(!/class="face|shin-say/.test(bellSvg(F.GOOD, {})), 'bellSvg itself draws a face');
});

test('R-71 (keep): the mascot is not beside the market line (the line sits in its own block, away from the face)', () => {
  const priceLines = [...CAMERA_SRC.matchAll(/<div class="priceline">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  assert.ok(priceLines.length >= 1, 'no price line block found: the matcher is blind (control)');
  for (const block of priceLines) assert.ok(!/shinSay\(|faceSvg\(|faceBlock\(|class="face/.test(block), 'a face sits inside the price and market line block');
  const withMarket = priceLines.filter((b) => /cam_in_market/.test(b));
  assert.ok(withMarket.length >= 1, 'the market line was not found (control)');
});

test('R-71 (keep): the mascot is shown on aim hint, working step, verdict, save line, paywall, empty states, picker', async () => {
  for (const key of ['cam_aim_hint', 'cam_aim_barcode']) assert.ok(CAMERA_SRC.includes(`'${key}'`), `the aim hint ${key} is gone`);
  assert.match(CAMERA_SRC, /dockSay\('thinking'/, 'the working step has no mascot');
  assert.match(SHEET(F.GOOD), /class="shin-say"/, 'the verdict has no mascot');
  assert.match(CAMERA_SRC, /shinSay\('pleased', 'price_only_recorded'|shinSay\('pleased', 'feedback_ack'/, 'the save line has no mascot');
  assert.match(read('js/screens/paywall.js'), /shinSay\('idle'/, 'the paywall has no mascot');
  for (const [name, src] of [['Saved', 'js/screens/watchlist.js'], ['Past scans', 'js/screens/pastscans.js'], ['Removed', 'js/screens/removed.js']]) {
    assert.match(read(src), /faceBlock\('asleep'|shinSay\(/, `${name} empty state has no mascot`);
  }
  assert.match(renderYou(), /data-who="deadpan"[\s\S]*?class="face/, 'the picker shows no faces');
  assert.equal(typeof removedScreen.default.render, 'function');
});

/** The state literal and the key literal of every shinSay / dockSay / updateShinSay call that names both. */
function literalCalls(src) {
  return [...src.matchAll(/(?:shinSay|dockSay|updateShinSay)\((?:[a-zA-Z.]+,\s*)?'(\w+)',\s*'(\w+)'/g)].map((m) => ({ state: m[1], key: m[2] }));
}
const ERROR_KEY = /(^cam_needs_connection$|^cam_server_fault|_failed$|^gem_failed$|^cam_photo_(offline|unreadable|model_|spend_cap|tier_unsafe|too_large)|^cam_offline|^cam_camera_denied$|^cam_reader_model_down$|^cam_text_no_match$|^cam_sources_failed$)/;

test('R-71 (keep): no error or refusal line is spoken by a smiling, approving or intense face', () => {
  const calls = literalCalls(CAMERA_SRC);
  assert.ok(calls.length >= 12, `only ${calls.length} literal mascot calls found in camera.js: the matcher is blind`);
  const errors = calls.filter((c) => ERROR_KEY.test(c.key));
  assert.ok(errors.length >= 3, `only ${errors.length} error calls matched: the error matcher is blind`);
  const bad = errors.filter((c) => SMILING_OR_INTENSE.has(c.state)).map((c) => `${c.state} / ${c.key}`);
  assert.deepEqual(bad, [], `error lines spoken by a smiling face: ${bad.join(', ')}`);
  assert.ok(literalCalls("shinSay('delighted', 'cam_server_fault', {}, {})").some((c) => SMILING_OR_INTENSE.has(c.state) && ERROR_KEY.test(c.key)), 'control: the checker must flag a smiling error');
});

/* ===================================================================== R-72 */

test('R-72 (keep): the intense forms are gated on confidence in the verdict screen', () => {
  const gate = /function intenseFaceFor\([\s\S]*?\n\}/.exec(CAMERA_SRC);
  assert.ok(gate, 'intenseFaceFor is gone');
  assert.match(gate[0], /conf\.level !== 'certain' && conf\.level !== 'sure'\) return plainFace/, 'the confidence gate on delighted and angry is gone');
});

for (const [zone, raw] of [['great', F.GREAT], ['good', F.GOOD], ['reasonable', F.REASONABLE], ['bad', F.BAD]]) {
  const smilesAtLow = zone === 'great' || zone === 'good';
  test(`R-72 (${smilesAtLow ? 'build 7' : 'keep'}): a low-confidence ${zone} price is not spoken by a smiling, approving or intense face`, () => {
    const face = faceStateOf(SHEET({ ...raw, confidence: 'low' }));
    assert.ok(face, 'no face on the sheet');
    assert.ok(!SMILING_OR_INTENSE.has(face), `low confidence ${zone} wears "${face}"; at low confidence the face must be plain and the words carry the doubt`);
  });
}

test('R-72 (keep): at high confidence a great price still earns the delighted face (control: the gate can open)', () => {
  assert.equal(faceStateOf(SHEET({ ...F.GREAT, confidence: 'high' })), 'delighted');
});

test('R-72 (keep): no voice aims an angry or negative verdict line at the shopper', () => {
  const BLAME = /\byou('re| are) (stupid|dumb|foolish|careless)|your fault|you should have|\bidiot|\bfool\b|\bstupid\b|\bdumb\b/i;
  const keys = ['verdict_ripoff', 'verdict_steal', 'walk_away', 'dist_bad', 'dist_bad_unsure', 'dist_great_unsure', 'dist_good_unsure'];
  for (const key of keys) for (const id of IDS) assert.ok(!BLAME.test(say(key, REAL_FACTS, id)), `${key}/${id} blames the shopper: ${say(key, REAL_FACTS, id)}`);
  assert.ok(BLAME.test('that is your fault'), 'control: the blame matcher must see blame');
});

test('R-72 (fails loudly, build 7): distFace throws on a confidence it does not know instead of falling through to the delighted face', () => {
  for (const bad of [undefined, null, 'LOW', 'unsure', '']) {
    assert.throws(() => H.distFace('great', bad), /confidence/i, `distFace("great", ${JSON.stringify(bad)}) returned "${(() => { try { return H.distFace('great', bad); } catch { return '?'; } })()}": an unknown confidence must never earn the intense face`);
  }
  assert.equal(H.distFace('great', 'high'), 'delighted', 'control: a known confidence still works');
});

/* ===================================================================== R-73 */

test('R-73 (build 7): the correction line owns the report and promises nothing about the answer', () => {
  const bad = [];
  for (const id of IDS) {
    const line = say('correct_thanks', {}, id);
    if (!/report/i.test(line)) bad.push(`${id} does not say the price is written down as a report: ${line}`);
    if (/counts? (from|now)|next scan|firm|will change|updated|moves?/i.test(line)) bad.push(`${id} claims the answer will change: ${line}`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('R-73 (build 7): the thank-you screen shows a plain face, not a celebrating one', () => {
  const m = /faceBlock\('(\w+)', \{ size: 64 \}\)\}\s*<p>\$\{say\('correct_thanks'\)\}/.exec(read('js/screens/correct.js'));
  assert.ok(m, 'the thank-you block was not found in correct.js');
  assert.ok(!SMILING_OR_INTENSE.has(m[1]), `the thank-you face is "${m[1]}"; R-73 wants a plain face`);
});

/* ===================================================================== R-74 */

test('R-74 (keep): the budget is 2 unprompted per session and 4 per day', () => {
  storage.clear();
  store.reset();
  assert.deepEqual(store.interruptionBudget(), { session: 2, day: 4 });
  store.recordInterruption();
  store.recordInterruption();
  assert.equal(store.canInterrupt(), false, 'the third unprompted line in a session was allowed');
  store.reset();
});

test('R-74 (keep): the aim-hint escalation waits 4000 ms, asks the budget first and records after it speaks', () => {
  const fn = /function armHintEscalation\(\) \{([\s\S]*?)\n {4}\}/.exec(CAMERA_SRC);
  assert.ok(fn, 'armHintEscalation is gone');
  const body = fn[1];
  assert.match(body, /\}, 4000\)/, 'the escalation is no longer 4000 ms');
  assert.ok(body.indexOf('canInterrupt()') !== -1 && body.indexOf('canInterrupt()') < body.indexOf('showAimHint'), 'the budget is not asked before the line is shown');
  assert.ok(body.indexOf('recordInterruption()') > body.indexOf('showAimHint'), 'the budget is spent before the line is shown');
});

test('R-74 (keep): the second-visit line also asks the budget before it speaks', () => {
  const at = CAMERA_SRC.indexOf("dockSay('idle', 'cam_second_visit'");
  assert.notEqual(at, -1);
  const before = CAMERA_SRC.slice(at - 400, at);
  assert.match(before, /canInterrupt\(\)/, 'the second-visit line does not ask the budget');
  assert.match(CAMERA_SRC.slice(at, at + 200), /recordInterruption\(\)/, 'the second-visit line does not spend the budget');
});

/** Every setTimeout( ... , ms) call in a source file: the position, the delay and the callback body (balanced parentheses). */
function timersIn(src) {
  const out = [];
  for (const m of src.matchAll(/(?:window\.)?setTimeout\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    let quote = null;
    for (; i < src.length && depth > 0; i += 1) {
      const c = src[i];
      if (quote) { if (c === '\\') i += 1; else if (c === quote) quote = null; } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
    }
    const call = src.slice(m.index, i);
    const ms = /,\s*(\d+)\s*\)$/.exec(call)?.[1] ?? null;
    out.push({ at: m.index, ms: ms === null ? null : Number(ms), body: call, before: src.slice(Math.max(0, m.index - 500), m.index) });
  }
  return out;
}
const CHANGES_LINE = /showAimHint\(|dockSay\(|updateShinSay\(|shinSay\(/;

test('R-74 (control): the timer scanner finds the camera timers (negative control)', () => {
  const timers = timersIn(CAMERA_SRC);
  assert.ok(timers.length >= 8, `only ${timers.length} timers found in camera.js; the scanner is blind`);
  const esc = timers.find((t) => t.ms === 4000 && /hintEscalated = true/.test(t.body));
  assert.ok(esc, 'the 4000 ms aim-hint escalation timer was not found');
  assert.ok(timersIn("a(); setTimeout(() => { dockSay('x'); }, 3500);").some((t) => t.ms === 3500 && CHANGES_LINE.test(t.body)), 'the scanner misses a synthetic timer');
});

test('R-74 (build 7): every timer that changes what Pexi says carries a budget class: counted, reactive or resting', () => {
  const speaking = timersIn(CAMERA_SRC).filter((t) => CHANGES_LINE.test(t.body));
  assert.ok(speaking.length >= 3, `only ${speaking.length} speaking timers found: the filter is blind`);
  const unclassified = speaking.filter((t) => !/@budget\s+(counted|reactive|resting)\b/.test(t.before + t.body));
  const line = (t) => `${CAMERA_SRC.slice(0, t.at).split('\n').length}: ${t.ms} ms`;
  assert.deepEqual(unclassified.map(line), [], `${unclassified.length} of ${speaking.length} timers change Pexi's line with no "// @budget counted|reactive|resting" comment. R-74: classify them, and any line that appears without a tap must count against the budget.`);
});

test('R-74 (fails loudly, build 7): recordInterruption throws when the budget is already spent, instead of counting past the cap', () => {
  storage.clear();
  store.reset();
  store.recordInterruption();
  store.recordInterruption();
  assert.throws(() => store.recordInterruption(), /budget|interrupt|unprompted/i, 'a third unprompted line was recorded silently');
  assert.equal(store.interruptionBudget().session, 0, 'the budget must not go negative');
  store.reset();
});

/* ===================================================================== R-76 */

function paywallBubble(params) {
  const body = { innerHTML: '' };
  const root = {
    innerHTML: '', querySelector: (sel) => (sel === '[data-pw-body]' ? body : null), addEventListener() {}, removeEventListener() {},
  };
  const stop = paywallMod.default.render(root, { params, go() {}, win: {} });
  const bubble = /<p class="bubble-text">([\s\S]*?)<\/p>/.exec(root.innerHTML)?.[1];
  if (typeof stop === 'function') stop();
  return bubble === undefined ? null : stripTags(bubble);
}
const SPENT = { limit: '3', used: '3', resetsAt: '2026-10-12T12:00:00.000Z' };

test('R-76 (keep): the paywall line never blames or shames the shopper, in any voice', () => {
  const SHAME = /\byou (should|have to|need to|ran out|used (it )?all|wasted|burned|forgot)\b|your fault|too many|not subscrib|miss out|\bdon't be\b|\bcheap\b/i;
  for (const key of ['paywall_say', 'paywall_say_open']) for (const id of IDS) assert.ok(!SHAME.test(say(key, {}, id)), `${key}/${id} blames: ${say(key, {}, id)}`);
  assert.ok(SHAME.test('you ran out'), 'control: the shame matcher must see shame');
});

test('R-76 (keep): opened with nothing used, the paywall line does not say the scans are gone', () => {
  const GONE = /free scans for this week|all (of )?the free|used|gone|done for the week/i;
  for (const id of IDS) assert.ok(!GONE.test(say('paywall_say_open', {}, id)), `${id}: ${say('paywall_say_open', {}, id)}`);
});

test('R-76 (build 7): when the scans are spent, the mascot line owns the limit and names the day it ends', () => {
  const bubble = paywallBubble(SPENT);
  assert.ok(bubble, 'the paywall rendered no mascot bubble');
  const day = paywallMod.resetDay(SPENT.resetsAt);
  assert.ok(day, 'control: the reset day must be readable');
  assert.ok(bubble.includes(day), `the mascot says "${bubble}" and never says when the scans return ("${day}")`);
});

test('R-76 (build 7): the spent line obeys the line limit in every voice', () => {
  const bad = IDS.filter((id) => {
    const line = say('paywall_say', { when: 'Monday, October 12', day: 'Monday, October 12' }, id);
    return words(line) > LIMIT_WORDS || sentences(line) > LIMIT_SENTENCES;
  });
  assert.deepEqual(bad, [], `paywall_say is over the limit in: ${bad.join(', ')}`);
});

/* ===================================================================== R-77 */

test('R-77 (keep): the welcome flow stays off, and first launch is permissions, consent, camera', () => {
  assert.equal(FLAGS.onboarding, false);
  assert.equal(flow.firstScreen({}), 'permissions');
  assert.equal(flow.firstScreen({ permissionsSeen: true }), 'consent');
  assert.equal(flow.firstScreen({ permissionsSeen: true, consentSeen: true }), 'camera');
});

/** A flow that is on must be at most five steps, or the build refuses it. Pure so it can be shown to fail. */
function welcomeViolation(flagOn, stepCount) {
  if (!flagOn) return null;
  return stepCount > 5 ? `the welcome flow is on with ${stepCount} visible steps; R-77 allows 5 or fewer` : null;
}

test('R-77 (keep): if the welcome flow is ever switched on it must be five steps or fewer (the guard has gone red)', () => {
  assert.match(welcomeViolation(true, flow.visibleSteps().length) ?? '', /allows 5/, 'control: the guard must flag today\'s step count if the flag were on');
  assert.equal(welcomeViolation(true, 5), null, 'control: five steps is allowed');
  assert.equal(welcomeViolation(FLAGS.onboarding, flow.visibleSteps().length), null, 'FLAGS.onboarding was switched on with more than 5 steps');
});
