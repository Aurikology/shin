/**
 * The 2026-11-21 readiness review, the shopper's screens (docs/readiness/review-2026-11-21, lane app-small;
 * Jamin 2026-11-21: "do all the recommended"). One test per finding, each seen red before its fix:
 *
 *   1. business ranks 4 and 5, gap 45: the Plus screen sells the result, not a count, and no longer tells a
 *      shopper how to avoid paying. The seller line and the renewal terms stay word for word.
 *   2. business rank 3, gap 46: no no-choice "Your data" screen between the permission ask and the camera.
 *      One line on the agree screen says what scans are used for (Quebec s.8 notice at collection).
 *   3. blind 9: the camera banner keeps its point (everyday groceries, new prices weekly, more coming) without
 *      the words "early access" (Apple 2.2), and the badge is gone.
 *   5. business rank 10: answers lead with what Pexi knows, not with what it lacks.
 *   6. ops 7, gap 85: a Contact row; legal 7, apple-rules 8, gap 82: a usage-data switch; blind 14, ops 18:
 *      French shoppers get the French Terms and Privacy pages.
 *   7. apple-rules 9: the developer tools (camera frame to Claude) never exist in a store build.
 *   8. ops 14 to 17, gap 91: French is tutoiement throughout, one word for scan, French punctuation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cell = new Map();
globalThis.localStorage = { getItem: (k) => cell.get(k) ?? null, setItem: (k, v) => cell.set(k, String(v)), removeItem: (k) => cell.delete(k) };
globalThis.document = {
  documentElement: { dataset: {}, style: { setProperty() {} } },
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {} }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {},
  body: { appendChild() {}, removeChild() {} },
};
globalThis.window = globalThis;
globalThis.screen = { width: 390, height: 844 };
globalThis.addEventListener ??= () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const { TABLES } = await import('../public/js/ui-strings.js');
const LANGS = ['en', 'fr'];

function inLocale(id, fn) {
  const before = cell.get('shin.locale');
  cell.set('shin.locale', id);
  try { return fn(); } finally { if (before === undefined) cell.delete('shin.locale'); else cell.set('shin.locale', before); }
}
function stubRoot() {
  const dummy = () => ({ innerHTML: '', textContent: '', hidden: false, style: {}, dataset: {}, setAttribute() {}, querySelector: () => null, classList: { toggle() {} } });
  return { innerHTML: '', dataset: {}, querySelector: dummy, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null, closest: () => null };
}

/* ------------------------------------------------------------------ 1. the Plus screen */

test('1. the Plus screen no longer says typing a name is free, in either language', () => {
  assert.doesNotMatch(TABLES.en.paywall_step_free_d, /typ|always free/i);
  assert.doesNotMatch(TABLES.fr.paywall_step_free_d, /taper|toujours gratuit/i);
  assert.match(TABLES.en.paywall_step_free_d, /10 barcode scans/);
});

test('1. the Plus heading sells the result, not a count', () => {
  for (const lang of LANGS) assert.doesNotMatch(TABLES[lang].paywall_heading, /\d/, `${lang}: ${TABLES[lang].paywall_heading}`);
  assert.match(TABLES.en.paywall_heading, /price/i);
  // The count is still said, underneath, as the Plus step.
  assert.match(TABLES.en.paywall_step_plus_d, /100 barcode scans/);
});

test('1. the seller line and the renewal terms Apple and the legal review need are unchanged', () => {
  assert.equal(TABLES.en.paywall_seller, 'Sold by Jamin Xu (Pexi). Contact: usepexiapp@gmail.com. Refunds are handled by Apple.');
  assert.match(TABLES.en.paywall_renews, /renews automatically unless you cancel at least 24 hours before the end of the current period/);
  assert.equal(TABLES.en.you_manage_sub, 'Manage or cancel subscription');
});

/* ------------------------------------------------------------------ 2. no "Your data" screen */

test('2. with photo identification off, the permission ask goes straight to the camera', async () => {
  const { firstScreen } = await import('../public/js/onboarding-flow.js');
  assert.equal(firstScreen({ permissionsSeen: true, onboarding: { doneAt: 'x' } }), 'camera'); // Amended 2026-11-22: Aurik switched the welcome flow back on as five screens (onboarding-flow.js FLOW)
  assert.equal(firstScreen({ permissionsSeen: true }, { onboarding: false, photoId: false }), 'camera');
  // A photo switch is a real choice, so with photo identification on the screen still asks.
  assert.equal(firstScreen({ permissionsSeen: true }, { onboarding: false, photoId: true }), 'consent');
  assert.equal(firstScreen({}, { onboarding: false, photoId: false }), 'permissions', 'the permission ask stays first with the welcome off');
  assert.equal(firstScreen({}), 'onboarding', 'with the welcome on (2026-11-22) the flow is first and asks for permissions as its last step');
});

test('2. the agree screen carries one line saying what scans are used for, both languages', () => {
  for (const lang of LANGS) assert.match(TABLES[lang].agree_data_line, lang === 'en' ? /scans/ : /scans/, lang);
  assert.match(read('../public/js/screens/agree.js'), /t\('agree_data_line'\)/);
});

/* ------------------------------------------------------------------ 3. the camera banner */

test('3. the banner keeps its point and never says early access', () => {
  for (const lang of LANGS) {
    for (const key of ['ea_title', 'ea_body']) {
      assert.doesNotMatch(TABLES[lang][key], /early access|accès anticipé|beta|bêta|preview/i, `${lang}.${key}`);
    }
    assert.equal(TABLES[lang].ea_badge, undefined, `${lang}.ea_badge is still in the table`);
  }
  assert.match(TABLES.en.ea_body, /everyday groceries/i);
  assert.match(TABLES.en.ea_body, /every week/i);
  assert.match(TABLES.en.ea_body, /more products/i);
});

test('3. the camera top band has no Early access badge', () => {
  const cam = read('../public/js/screens/camera.js');
  const top = cam.slice(cam.indexOf('<div class="cam-top">'), cam.indexOf('<div class="reticle"'));
  assert.doesNotMatch(top, /ea-badge|ea_badge/);
});

/* ------------------------------------------------------------------ 5. answers lead with what Pexi knows */

test('5. no answer basis opens by saying what Pexi lacks', () => {
  for (const key of ['cat_basis_broad', 'vd_prov_claude_typical', 'vd_why_claude_typical']) {
    assert.doesNotMatch(TABLES.en[key], /\bno (shop )?prices?\b|has no|not found/i, `en.${key}: ${TABLES.en[key]}`);
    assert.doesNotMatch(TABLES.fr[key], /aucun prix|n’a pas encore|pas de prix/i, `fr.${key}: ${TABLES.fr[key]}`);
  }
  // The honest label stays: an estimate is still called one.
  assert.match(TABLES.en.vd_prov_claude_typical, /AI estimate|estimated by AI/i);
  assert.match(TABLES.en.cat_basis_broad, /broad guess/i);
});

/* ------------------------------------------------------------------ 6. the You screen */

let you;
const renderYou = (lang) => inLocale(lang, () => {
  const root = stubRoot();
  try { you.render(root, { api: { quota: () => new Promise(() => {}) }, go() {}, replace() {}, params: {} }); } catch { /* wiring */ }
  return root.innerHTML;
});
you = (await import('../public/js/screens/you.js')).default;

test('6. the You screen has a Contact row that writes to the support address', () => {
  const html = renderYou('en');
  assert.match(html, /href="mailto:usepexiapp@gmail\.com\?subject=[^"]+" data-contact/);
  assert.match(html, />Help and contact</);
});

test('6. the You screen has a usage-data switch', () => {
  const html = renderYou('en');
  assert.match(html, /data-act="usage-sharing"[^>]*role="switch"/);
  assert.equal(typeof TABLES.fr.you_usage, 'string');
  assert.equal(typeof TABLES.fr.you_usage_desc, 'string');
});

test('6. French shoppers get the French Terms and Privacy pages on You and on Plus', async () => {
  const fr = renderYou('fr');
  assert.match(fr, /privacy-fr\.html/);
  assert.match(fr, /terms-fr\.html/);
  const en = renderYou('en');
  assert.doesNotMatch(en, /-fr\.html/);

  const pw = await import('../public/js/screens/paywall.js');
  assert.match(inLocale('fr', () => pw.plusSpentPage({})), /terms-fr\.html[\s\S]*privacy-fr\.html/);
  const page = inLocale('fr', () => {
    const root = stubRoot();
    try { pw.default.render(root, { params: {}, win: {} }); } catch { /* wiring */ }
    return root.innerHTML;
  });
  assert.match(page, /terms-fr\.html/);
  assert.match(page, /privacy-fr\.html/);
});

test('6. "No scan limit" is not drawn while the server sets a limit', () => {
  const html = renderYou('en');
  assert.match(html, /data-no-meter hidden/, 'the line is drawn hidden and shown only when /api/quota says there is no limit');
});

/* ------------------------------------------------------------------ 7. no developer tools in a store build */

test('7. on an iPhone or Android build the developer tools never switch on', async () => {
  const dev = await import('../public/js/dev-mode.js');
  const before = globalThis.window;
  try {
    cell.set('shin.dev', '1');
    cell.set('shin.dev.packRead', '1');
    globalThis.window = { Capacitor: { getPlatform: () => 'ios' } };
    assert.equal(dev.devOn({ tagsOn: true, search: '?dev=1' }), false);
    assert.equal(dev.packReadOn(), false);
    globalThis.window = { Capacitor: { getPlatform: () => 'android' } };
    assert.equal(dev.devOn({ tagsOn: true, search: '?dev=1' }), false);
    assert.equal(dev.packReadOn(), false);
    // Control: a browser tab (the owner's tool) still has them.
    globalThis.window = {};
    assert.equal(dev.devOn({ search: '?dev=1' }), true);
    assert.equal(dev.packReadOn(), true);
  } finally {
    globalThis.window = before;
    cell.delete('shin.dev');
    cell.delete('shin.dev.packRead');
  }
});

/* ------------------------------------------------------------------ 8. French */

const FACTS = new Proxy({}, { get: (_t, k) => (k === Symbol.toPrimitive ? undefined : '2') });
function frenchValues() {
  const out = [];
  const add = (key, v) => {
    let s;
    try { s = typeof v === 'function' ? v(FACTS) : v; } catch { return; }
    if (typeof s === 'string') out.push([key, s]);
  };
  for (const [k, v] of Object.entries(TABLES.fr)) add(`ui.${k}`, v);
  return out;
}
const voiceFr = await import('../public/js/voice-fr.js');
function voiceValues() {
  const out = [];
  for (const [table, rows] of Object.entries(voiceFr)) {
    if (!rows || typeof rows !== 'object') continue;
    for (const [k, v] of Object.entries(rows)) {
      if (!v || typeof v !== 'object') continue;
      for (const [who, fn] of Object.entries(v)) {
        let s;
        try { s = typeof fn === 'function' ? fn(FACTS) : fn; } catch { continue; }
        if (typeof s === 'string') out.push([`${table}.${k}.${who}`, s]);
      }
    }
  }
  return out;
}

test('8. the French interface says tu, never vous', () => {
  const bad = frenchValues().filter(([, s]) => /\b(vous|votre|vos)\b/i.test(s));
  assert.deepEqual(bad, []);
  assert.match(TABLES.fr.agree_change_later, /Toi/);
});

test('8. one French word for scan: no numérisation, no balayage', () => {
  const bad = [...frenchValues(), ...voiceValues()].filter(([, s]) => /numéris|balay/i.test(s));
  assert.deepEqual(bad, []);
});

test('8. French puts a space before ? and :', () => {
  const bad = [...frenchValues(), ...voiceValues()].filter(([, s]) => /[^\s  ]\?|[^\s  \d/]:\s/.test(s));
  assert.deepEqual(bad, []);
});

test('8. the machine-like French strings the ops review listed are rewritten', () => {
  const fr = TABLES.fr;
  assert.doesNotMatch(fr.you_corrections_row, /par cent nommés/);
  assert.doesNotMatch(fr.conf_thin(FACTS), /Mince/);
  assert.doesNotMatch(fr.cam_gem_median(FACTS), /du milieu/);
  assert.equal(fr.you_kind_typed, 'Saisi');
  assert.doesNotMatch(fr.you_thumbs_up, /en haut/);
  assert.doesNotMatch(fr.lic_fallback_credit, /est ce qui/);
  assert.doesNotMatch(fr.screen_error_body, /dessus a cassé/);
  assert.doesNotMatch(fr.note_strongest, /le plus fort/);
  assert.doesNotMatch(fr.savings_unreadable, /^Je /);
  assert.equal(fr.share_conf_high, fr.vd_conf_high);
  assert.doesNotMatch(fr.you_week_two_none, /n’a deux semaines/);
  assert.equal(fr.vd_report_word, 'Ton signalement');
  assert.doesNotMatch(fr.cam_gem_shelf(FACTS), /rayon/, 'a shelf is a tablette; rayon is the aisle');
  assert.match(fr.vd_based_on_sellers({ n: 2 }), /marchands/, 'one word for seller');
});
