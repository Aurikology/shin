/**
 * The privacy pages and the iOS project settings that App Review and Quebec read
 * (fix lane privacy-native, 2026-11-21):
 *   - Guideline 5.1.1(i): the policy must confirm that any third party that gets user data
 *     gives the same or equal protection as the policy states.
 *   - Quebec (P-39.1 s. 3.2): the privacy procedures are described on the website.
 *   - The privacy manifest declares the file-timestamp reason the Filesystem plugin needs.
 *   - The camera permission text says what the camera does now and names Pexi.
 *   - The iPhone app is locked to portrait (the web app has no landscape layout).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

const EN = text(read('../../docs/store/privacy.html'));
const FR = text(read('../../docs/store/privacy-fr.html'));
const PLIST = read('../../native/ios/App/App/Info.plist');
const MANIFEST = read('../../native/ios/App/App/PrivacyInfo.xcprivacy');

test('the English privacy policy says each outside service gives the same or equal protection (guideline 5.1.1)', () => {
  assert.match(EN, /same or equal protection of (your|user|that) data/i);
  assert.match(EN, /services named (here|in this policy)/i);
});

test('the French privacy policy says the same thing', () => {
  assert.match(FR, /protection (des données )?(identique|équivalente)|même protection ou une protection équivalente/i);
  assert.match(FR, /services nommés/i);
});

test('both policies describe requests, complaints, the time to answer and recorded incidents', () => {
  assert.match(EN, /30 days/);
  assert.match(EN, /complaint/i);
  assert.match(EN, /Commission d'accès à l'information/);
  assert.match(EN, /incident/i);
  assert.match(EN, /register|record of every/i);
  assert.match(FR, /30 jours/);
  assert.match(FR, /plainte/i);
  assert.match(FR, /Commission d['’]accès à l['’]information/);
  assert.match(FR, /incident/i);
  assert.match(FR, /registre/i);
});

/* 2026-11-25 (Jamin: one document, no off switches): this used to require the usage switch; the switch is gone,
   so the pages must not promise one. */
test('both pages say usage recording is part of Pexi and promise no switch for it', () => {
  assert.match(EN, /how you use the app/i);
  assert.doesNotMatch(EN, /switch (usage tracking|it) off|turn (this|it) off at any time/i);
  assert.match(FR, /façon dont tu utilises l’application/);
  assert.doesNotMatch(FR, /(désactiv|arrêt)[^.]*suivi/i);
});

test('no em dash in the policy pages', () => {
  for (const f of ['privacy.html', 'privacy-fr.html']) {
    assert.ok(!read(`../../docs/store/${f}`).includes('—'), `${f} has an em dash`);
  }
});

test('the privacy manifest declares the file-timestamp required reason C617.1', () => {
  const api = MANIFEST.split('<key>NSPrivacyAccessedAPITypes</key>')[1];
  assert.match(api, /NSPrivacyAccessedAPICategoryFileTimestamp/);
  assert.match(api, /<string>C617\.1<\/string>/);
});

test('the camera permission text names Pexi and says it reads barcodes, with no photographs', () => {
  const s = /<key>NSCameraUsageDescription<\/key>\s*<string>([^<]*)<\/string>/.exec(PLIST)?.[1] ?? '';
  assert.match(s, /^Pexi /);
  assert.match(s, /barcode/i);
  assert.doesNotMatch(s, /photograph|This app/i);
});

test('the iPhone app is locked to portrait', () => {
  const m = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(PLIST);
  assert.ok(m, 'no UISupportedInterfaceOrientations');
  assert.deepEqual([...m[1].matchAll(/<string>([^<]+)<\/string>/g)].map((x) => x[1]), ['UIInterfaceOrientationPortrait']);
});

test('the age-rating notes flag tobacco beside alcohol for the re-answer', () => {
  const listing = read('../../docs/store/listing.md');
  const section = listing.split('## Age rating')[1] ?? '';
  assert.match(section, /tobacco/i);
});
