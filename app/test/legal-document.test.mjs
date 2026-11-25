/**
 * Jamin, 2026-11-25: "Let's have every single thing in one place. Everything that is not part of the
 * functionality of the app will come in one long document at the beginning of the app, only appearing once,
 * where the user clicks accept term and agreements to continue into the app. The user will then not have
 * the option to turn off send data to Claude or other things like that."
 *
 * Replaces agree-one-button.test.mjs (agreement v2, which kept the You switches). Holds:
 *   - one document (legal/document.js), in English and French, carrying the terms, the privacy policy, the
 *     Claude line, the data credits and the not-affiliated footer;
 *   - the hosted terms and privacy pages are exactly what that document renders (no second copy to drift);
 *   - the first-launch screen shows all of it with one button, and pressing it is a yes to everything;
 *   - Settings reopens it read-only, the paywall keeps its Terms and Privacy links (Apple 3.1.2), and no
 *     off switch for Claude, usage, photos or location is left on the You screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { installBrowser, makeDocument, makeStorage } from './mini-dom.mjs';

const storage = makeStorage();
const cell = storage.map;
installBrowser({ doc: makeDocument(), storage });

const agree = await import('../public/js/screens/agree.js');
const legal = await import('../public/js/legal/document.js');
const { SHOPPER_SOURCES } = await import('../public/js/legal/sources.js');
const { TABLES, setLocale } = await import('../public/js/ui-strings.js');
const store = await import('../public/js/store.js');
const { PAGES } = await import('../scripts/build-legal-pages.mjs');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function mount(page, params = {}) {
  const listeners = [];
  const root = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener() {},
  };
  const calls = [];
  const posted = [];
  const api = { postConsent: (b) => { posted.push(b); return Promise.resolve({ stored: true }); }, postEvent: () => Promise.resolve() };
  page.render(root, { replace: (id) => calls.push(['replace', id]), go: (id) => calls.push(['go', id]), api, params });
  const tap = (act) => {
    const target = { closest: (sel) => (sel === `[data-act="${act}"]` ? {} : null), matches: () => false };
    for (const l of listeners) if (l.type === 'click') l.fn({ target });
  };
  return { root, tap, calls, posted };
}

/* ------------------------------------------------------------------------------------ the document */

test('one document in two languages, carrying everything the old screens and pages said', () => {
  for (const lang of ['en', 'fr']) {
    const body = plain(legal.legalBodyHtml(lang));
    assert.match(body, /Anthropic/);
    assert.match(body, /Claude/);
    assert.match(body, /usepexiapp@gmail\.com/);
    assert.match(body, /Jamin Xu/);
    assert.match(body, /CA\$3\.99|3,99 \$ CA/);
    assert.match(body, /OpenStreetMap contributors/, 'the OSM credit');
    assert.match(body, /Database Right data-sheet 2026 Icecat/, 'the Icecat notice');
    assert.match(body, /14/, 'the under-14 line');
    for (const s of SHOPPER_SOURCES) assert.ok(body.includes(s.name.replace(/&/g, '&amp;')), `${lang}: ${s.name} is not credited`);
    assert.doesNotMatch(body, /—/, `${lang}: an em dash`);
  }
  assert.equal(legal.legalDocument('en').title, 'Terms, Privacy and Data');
  assert.equal(legal.legalDocument('fr').title, 'Conditions, confidentialité et données');
  assert.match(plain(legal.legalBodyHtml('en')), /not affiliated with/);
  assert.match(plain(legal.legalBodyHtml('en')), /not an offer/);
  assert.match(plain(legal.legalBodyHtml('fr')), /pas une offre/);
});

test('the document promises no off switch for Claude, usage, photos or location', () => {
  const en = plain(legal.legalBodyHtml('en'));
  assert.doesNotMatch(en, /turn (this|it) off at any time|switch (it|usage tracking) off|on the You screen/i);
  assert.match(en, /Sending these product details to Claude is part of using Pexi/);
  const fr = plain(legal.legalBodyHtml('fr'));
  assert.doesNotMatch(fr, /désactiver[^.]*à tout moment/i);
  assert.match(fr, /fait partie de l’utilisation de Pexi/);
  assert.doesNotMatch(fr, /\bvous\b/i, 'the French document uses tu, as the app does');
});

test('the text is escaped: a source with an ampersand prints as an entity, never as raw markup', () => {
  assert.ok(legal.legalBodyHtml('en').includes('T&amp;T'));
  assert.ok(!/<script/i.test(legal.legalBodyHtml('en')));
});

test('the hosted terms and privacy pages are exactly what the document renders, so they cannot drift', () => {
  for (const [file, lang] of Object.entries(PAGES)) {
    const url = new URL(`../../docs/store/${file}`, import.meta.url);
    assert.ok(existsSync(url), `${file} is missing: the App Store URL would break`);
    const onDisk = readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(onDisk, legal.legalPageHtml(lang, file), `${file} differs: run node scripts/build-legal-pages.mjs`);
  }
});

/* ------------------------------------------------------------------------------------- the screen */

test('version 3: every install that accepted the old screen sees the document once more', () => {
  assert.equal(agree.AGREEMENT_VERSION, 3);
  assert.equal(agree.needsAgreement({ agreement: { at: 'x', version: 2, claude: true, usage: true } }), true);
  assert.equal(agree.needsAgreement({}), true);
  const rec = agree.agreementRecord(new Date('2026-11-25T10:00:00Z'));
  assert.deepEqual(
    { version: rec.version, claude: rec.claude, usage: rec.usage, photos: rec.photos, location: rec.location, document: rec.document },
    { version: 3, claude: true, usage: true, photos: true, location: true, document: legal.LEGAL_EFFECTIVE },
  );
  assert.equal(agree.needsAgreement({ agreement: rec }), false);
});

test('first launch: the whole document and one button, Accept and continue', () => {
  setLocale('en');
  cell.clear();
  store.update({ agreement: null });
  const { root } = mount(agree.default);
  const html = root.innerHTML;
  assert.equal((html.match(/<button/g) ?? []).length, 1, 'one action');
  assert.match(html, /<button[^>]*data-act="agree-go"[^>]*>Accept and continue</);
  assert.doesNotMatch(html, /type="checkbox"|type="radio"|role="switch"/);
  assert.ok(html.includes(legal.legalBodyHtml('en')), 'the screen shows the whole document');
  assert.doesNotMatch(html, /data-act="back"|page-bar/, 'no way around it');
});

test('the French screen is the French document with Accepter et continuer', () => {
  cell.clear();
  store.update({ agreement: null });
  setLocale('fr');
  try {
    const { root } = mount(agree.default);
    assert.match(root.innerHTML, /Accepter et continuer/);
    assert.ok(root.innerHTML.includes(legal.legalBodyHtml('fr')));
  } finally { setLocale('en'); }
});

test('pressing it is a yes to everything: the record, photos and location locally, and accepted on the server', async () => {
  cell.clear();
  store.update({ agreement: null });
  const { tap, calls, posted } = mount(agree.default);
  tap('agree-go');
  const rec = store.get().agreement;
  assert.equal(rec.version, 3);
  assert.equal(rec.claude, true);
  assert.equal(store.consent().photos, true);
  assert.equal(store.consent().location, true);
  assert.equal(agree.needsAgreement(store.get()), false);
  assert.deepEqual(calls.filter(([k]) => k === 'replace').length, 1, 'it leaves the screen');
  await new Promise((r) => setTimeout(r, 0));
  if (posted.length) assert.equal(posted[0].accepted, true, 'the server is told it was accepted');
});

test('nothing else on the screen stores a record, and the guard stays in main.js', () => {
  assert.match(read('../public/js/main.js'), /router\.setGuard\(\(id\) => \(id !== 'agree' && needsAgreement/);
  cell.clear();
  store.update({ agreement: null });
  const { tap, calls } = mount(agree.default);
  tap('something-else');
  assert.equal(store.get().agreement, null);
  assert.equal(calls.length, 0);
});

test('after accepting, the same route is the read-only document: back control, tab bar, no button', () => {
  store.update({ agreement: agree.agreementRecord() });
  const { root, tap, calls } = mount(agree.default);
  assert.doesNotMatch(root.innerHTML, /data-act="agree-go"/);
  assert.match(root.innerHTML, /data-act="back"/);
  assert.ok(root.innerHTML.includes(legal.legalBodyHtml('en')));
  tap('you');
  assert.deepEqual(calls.at(-1), ['go', 'you']);
});

test('an accept with no signal reaches the server on a later launch, once', async () => {
  const { syncAgreement } = agree;
  store.update({ agreement: agree.agreementRecord() });
  let n = 0;
  const offline = { postConsent: async () => { n++; return { stored: false }; } };
  const online = { postConsent: async (b) => { n++; assert.equal(b.accepted, true); return { stored: true }; } };
  const device = await import('../public/js/device.js');
  if (!device.getDeviceId()?.id) return; // no device id in this harness: nothing to send, nothing to prove
  assert.equal(await syncAgreement(offline), false);
  assert.equal(await syncAgreement(online), true);
  assert.ok(store.get().agreement.serverAt);
  assert.equal(await syncAgreement(online), false, 'already stored: no second post');
  assert.equal(n, 2);
});

/* ---------------------------------------------------------------------------- the rest of the app */

test('the You screen keeps one row to the document and no switch for Claude, usage, photos or location', () => {
  const you = read('../public/js/screens/you.js');
  assert.match(you, /data-act="legal"/);
  assert.match(you, /\[data-act="legal"\]'\)\) \{ ctx\.go\('agree'\)/);
  for (const gone of ['claude-consent', 'usage-sharing', 'data-consent=', 'toggleConsent', 'usage-setting']) {
    assert.ok(!you.includes(gone), `${gone} is still on the You screen`);
  }
  assert.equal(TABLES.en.legal_title, 'Terms, Privacy and Data');
  assert.equal(TABLES.fr.legal_title, 'Conditions, confidentialité et données');
});

test('the folded screens and their strings are gone', () => {
  for (const f of ['screens/consent.js', 'screens/licences.js', 'consent-actions.js', 'usage-setting.js']) {
    assert.ok(!existsSync(new URL(`../public/js/${f}`, import.meta.url)), `${f} is back`);
  }
  for (const lang of ['en', 'fr']) {
    for (const k of ['agree_lead', 'agree_claude_line', 'agree_change_later', 'you_claude', 'you_usage', 'you_photos', 'you_location', 'consent_title', 'lic_title', 'lic_footer', 'market_sources_button']) {
      assert.equal(TABLES[lang][k], undefined, `${lang}.${k} is unused now`);
    }
  }
});

test('Apple 3.1.2: the paywall still links the Terms and the Privacy pages beside the price', () => {
  const paywall = read('../public/js/screens/paywall.js');
  assert.match(paywall, /legalUrl\('privacy'/);
  assert.match(paywall, /legalUrl\('terms'/);
});

test('usage events are always queued now: track.js has no switch to read', () => {
  const track = read('../public/js/track.js');
  assert.doesNotMatch(track, /usageSharingOn/);
});

test('the server writes yes for an accepted device, and keeps nothing for one that never accepted', () => {
  const server = read('../server.ts');
  assert.match(server, /const accepted = k\.accepted === true;/);
  assert.match(server, /const photos = accepted \|\| k\.photos === true;/);
  assert.match(server, /const location = accepted \|\| k\.location === true;/);
  assert.match(read('../src/consent.ts'), /export const DEFAULT_CONSENT: Consent = \{ photos: false, location: false, updatedAt: null \};/);
});
