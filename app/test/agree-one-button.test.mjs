/**
 * Jamin 2026-11-22: "have everything we need under one single: 'i agree to all terms and services' and the
 * only way someone can get into this app is by accepting that". One screen, one button: the Terms, the
 * Privacy Policy, usage recording and product names going to Claude are all covered by "Agree and continue"
 * (Apple 5.1.2 needs the permission before sharing with an outside AI; Quebec Law 25 wants each purpose
 * stated). The You screen's two switches still turn each off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installBrowser, makeDocument, makeStorage } from './mini-dom.mjs';

const storage = makeStorage();
const cell = storage.map;
installBrowser({ doc: makeDocument(), storage });

const agree = await import('../public/js/screens/agree.js');
const { TABLES, setLocale } = await import('../public/js/ui-strings.js');
const store = await import('../public/js/store.js');
const { usageSharingOn } = await import('../public/js/usage-setting.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** A root that keeps its listeners, and a click that finds the nearest [data-act]. */
function mount(page) {
  const listeners = [];
  const root = {
    innerHTML: '',
    querySelector: () => ({ disabled: false, textContent: '' }),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener() {},
  };
  const calls = [];
  page.render(root, { replace: (id) => calls.push(['replace', id]), go: (id) => calls.push(['go', id]), api: { postEvent: () => Promise.resolve() }, params: {} });
  const tap = (act) => {
    const target = { closest: (sel) => (sel === `[data-act="${act}"]` ? {} : null), matches: () => false };
    for (const l of listeners) if (l.type === 'click') l.fn({ target });
  };
  return { root, tap, calls };
}

test('the record is version 2, claude true, usage on, and needsAgreement passes it', () => {
  assert.equal(agree.AGREEMENT_VERSION, 2);
  const rec = agree.agreementRecord(new Date('2026-11-22T10:00:00Z'));
  assert.equal(rec.version, 2);
  assert.equal(rec.claude, true);
  assert.equal(rec.usage, true);
  assert.equal(rec.at, '2026-11-22T10:00:00.000Z');
  assert.equal(agree.needsAgreement({ agreement: rec }), false);
});

test('every install on the old version 1 record sees the screen once more', () => {
  assert.equal(agree.needsAgreement({ agreement: { at: 'x', version: 1, claude: true } }), true);
  assert.equal(agree.needsAgreement({ agreement: { at: 'x', version: 1, claude: false } }), true);
  assert.equal(agree.needsAgreement({}), true);
  assert.equal(agree.needsAgreement({ agreement: null }), true);
});

test('the screen is one button: no tick box, no Claude question, and the button starts enabled', () => {
  setLocale('en');
  const { root } = mount(agree.default);
  const html = root.innerHTML;
  assert.doesNotMatch(html, /type="checkbox"|type="radio"/);
  assert.doesNotMatch(html, /May Pexi send product names/);
  assert.match(html, /<button[^>]*data-act="agree-go"[^>]*>Agree and continue</);
  assert.doesNotMatch(html, /data-act="agree-go"[^>]*disabled/);
  assert.equal((html.match(/<button/g) ?? []).length, 1, 'one action');
  assert.match(html, /terms\.html/);
  assert.match(html, /privacy\.html/);
  assert.match(html, /Anthropic/);
  assert.match(html, /improve/i);
  assert.match(html, /in Settings/); // Amended 2026-11-22: the You tab is Settings
  assert.doesNotMatch(html, /—/, 'an em dash');
});

test('the French screen says the same, with the same single button', () => {
  setLocale('fr');
  try {
    const { root } = mount(agree.default);
    assert.match(root.innerHTML, /Accepter et continuer/);
    assert.match(root.innerHTML, /privacy-fr\.html/);
    assert.match(root.innerHTML, /Anthropic/);
    assert.doesNotMatch(root.innerHTML, /type="checkbox"|type="radio"/);
    assert.doesNotMatch(root.innerHTML, /—/);
  } finally { setLocale('en'); }
});

test('the old two-question strings are gone', () => {
  for (const lang of ['en', 'fr']) {
    for (const k of ['agree_hint_both', 'agree_hint_terms', 'agree_hint_claude', 'agree_claude_q', 'agree_claude_yes', 'agree_claude_no']) {
      assert.equal(TABLES[lang][k], undefined, `${lang}.${k} is unused now`);
    }
  }
  assert.equal(typeof TABLES.en.agree_button, 'string');
  assert.equal(typeof TABLES.fr.agree_button, 'string');
});

test('pressing the button stores a version-2 record with Claude on and usage on, then leaves the screen', () => {
  cell.clear();
  store.update({ agreement: null });
  const { tap, calls } = mount(agree.default);
  tap('agree-go');
  const rec = store.get().agreement;
  assert.equal(rec.version, 2);
  assert.equal(rec.claude, true);
  assert.equal(rec.usage, true);
  assert.equal(agree.needsAgreement(store.get()), false);
  assert.equal(calls.filter(([k]) => k === 'replace').length, 1);
  assert.equal(usageSharingOn(), true);
});

test('nothing opens until the button is pressed: the guard stays, and no other tap stores a record', () => {
  assert.match(read('../public/js/main.js'), /router\.setGuard\(\(id\) => \(id !== 'agree' && needsAgreement/);
  cell.clear();
  store.update({ agreement: null });
  const { tap, calls } = mount(agree.default);
  tap('something-else');
  assert.equal(store.get().agreement, null);
  assert.equal(calls.length, 0);
});

test('the You screen off-switch for Claude still removes the x-shin-claude header, and on puts it back', async () => {
  const api = await import('../public/js/api.js');
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { sent.push(init?.headers ?? {}); return { ok: true, status: 200, json: async () => ({}) }; };
  try {
    store.update({ agreement: agree.agreementRecord() });
    await api.quota();
    assert.equal(sent.at(-1)['x-shin-claude'], '1', 'agreed: header sent');
    // The You screen's handler (screens/you.js claude-consent) flips claude and keeps the rest of the record.
    assert.match(read('../public/js/screens/you.js'), /const now = store\.get\(\)\.agreement\?\.claude !== true;\s*store\.update\(\{ agreement: \{ \.\.\.store\.get\(\)\.agreement, claude: now \} \}\);/);
    store.update({ agreement: { ...store.get().agreement, claude: false } });
    await api.quota();
    assert.equal(sent.at(-1)['x-shin-claude'], undefined, 'switched off: no header');
    assert.equal(store.get().agreement.version, 2, 'the record is kept, only Claude is off');
    assert.equal(agree.needsAgreement(store.get()), false, 'switching Claude off does not bring the agree screen back');
    store.update({ agreement: { ...store.get().agreement, claude: true } });
    await api.quota();
    assert.equal(sent.at(-1)['x-shin-claude'], '1');
  } finally { globalThis.fetch = realFetch; }
});

test('the You screen usage switch still turns usage off after agreeing', async () => {
  const { setUsageSharing } = await import('../public/js/usage-setting.js');
  setUsageSharing(true);
  assert.equal(usageSharingOn(), true);
  assert.equal(setUsageSharing(false), false);
  assert.equal(usageSharingOn(), false);
  setUsageSharing(true);
});

test('the privacy pages no longer call Claude or usage an opt-in at first open', () => {
  for (const f of ['privacy.html', 'privacy-fr.html']) {
    const page = read(`../../docs/store/${f}`);
    assert.doesNotMatch(page, /only if you said yes|If you said no|Your first-run answers|seulement si vous avez répondu oui|si vous avez répondu non|Vos réponses à la première ouverture|que si vous avez répondu oui/i, f);
    assert.doesNotMatch(page, /—/, f);
  }
  const en = read('../../docs/store/privacy.html');
  assert.match(en, /agreed on the first screen/i);
  assert.match(en, /broad-guess range/);
  const fr = read('../../docs/store/privacy-fr.html');
  assert.match(fr, /accepté[^<]{0,80}premier écran|premier écran[^<]{0,120}accept/i);
  assert.match(fr, /estimation large/);
});
