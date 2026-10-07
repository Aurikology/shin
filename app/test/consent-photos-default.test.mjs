/**
 * Beta gap item 13, the consent half: photos are saved by default, with one
 * plain switch to opt out, and the server, the client and the wording agree.
 *
 * His words, 2026-09-17: "Pexi should try to save as much data as possible:
 * The users' picture or barcode...", and he delegated the consent wording
 * ("you decide"). Location is NOT part of this change and stays off until
 * turned on; a test below holds it there so the two are never moved together
 * by accident.
 *
 * Each test fails if the behaviour it names is removed: flip DEFAULT_CONSENT
 * back and the first two go red, flip the client mirror back and the third
 * does, restore the old "off unless you turn them on" copy and the wording
 * tests do, and take `confirmConsent` out of the screen's Continue path and
 * the last one does.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { openScanStore } from '../src/scans.ts';
import { readConsent, writeConsent, keepPhoto, keepLocation, DEFAULT_CONSENT } from '../src/consent.ts';
import { say } from '../public/js/voice.js';
import { LINES_FR } from '../public/js/voice-fr.js';
import * as store from '../public/js/store.js';
import { confirmConsent, toggleConsent } from '../public/js/consent-actions.js';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'shin-consent-')), 'scans.db');
const TONES = ['deadpan', 'warm', 'blunt'];

/** A localStorage that lives in a Map, for the duration of `fn`. */
function withStorage(seed, fn) {
  const had = 'localStorage' in globalThis;
  const before = had ? globalThis.localStorage : undefined;
  const cell = new Map(Object.entries(seed));
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
  try {
    return fn();
  } finally {
    if (had) globalThis.localStorage = before;
    else delete globalThis.localStorage;
  }
}

/**
 * A fresh copy of store.js that loads `seed` from localStorage at import time.
 * The storage is held until the import has RESOLVED: restoring it as soon as
 * `import()` returns its promise would let the module evaluate against no
 * storage at all, and a state that "was not seen" would look like the default.
 */
async function freshStore(seed, tag) {
  const had = 'localStorage' in globalThis;
  const before = had ? globalThis.localStorage : undefined;
  const cell = new Map(Object.entries(seed));
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
  try {
    return await import(`../public/js/store.js?${tag}`);
  } finally {
    if (had) globalThis.localStorage = before;
    else delete globalThis.localStorage;
  }
}

beforeEach(() => {
  withStorage({}, () => store.reset());
});

/* ----------------------------------------------------------------- server -- */

test('a device that was never asked keeps neither photos nor location (D-148)', () => {
  // The standing ruling "Location and photo consent default off until
  // answered". The photo default was on from 2026-09-19 until D-148.
  openScanStore(fresh());
  assert.deepEqual(readConsent('never-asked'), { photos: false, location: false, updatedAt: null });
  assert.equal(keepPhoto('never-asked'), false, 'a photo is kept for a device that was never asked');
  assert.equal(keepLocation('never-asked'), false, 'location moved with the photo default');
  assert.deepEqual(DEFAULT_CONSENT, { photos: false, location: false, updatedAt: null });
});

test('a written no is never overridden by the default', () => {
  openScanStore(fresh());
  assert.equal(writeConsent('opted-out', false, false), true);
  const seen = readConsent('opted-out');
  assert.equal(seen.photos, false, 'an explicit opt-out was read back as a yes');
  assert.ok(seen.updatedAt, 'the opt-out carries no time');
  assert.equal(keepPhoto('opted-out'), false);
  // And turning it back on is a real answer too.
  writeConsent('opted-out', true, false);
  assert.equal(keepPhoto('opted-out'), true);
});

test('no device id, or a store that cannot be read, keeps nothing', () => {
  const s = openScanStore(fresh());
  assert.equal(keepPhoto(''), false, 'a photo would be kept for nobody');
  assert.equal(keepPhoto('   '), false);
  // A read that fails could be hiding a written no, so it fails toward keeping
  // less, never toward the default.
  s.db.close();
  assert.equal(readConsent('any-device').photos, false, 'an unreadable row was read as the default yes');
});

/* ------------------------------------------------------------------ client -- */

test('the phone starts from the same default the server does', () => {
  assert.equal(store.consent().photos, DEFAULT_CONSENT.photos);
  assert.equal(store.consent().location, DEFAULT_CONSENT.location);
  assert.equal(store.consent().updatedAt, null);
});

test('an old saved state that never recorded a choice reads as the new default', async () => {
  // D-148, 2026-09-28: the default this reads as reversed back to off, so a
  // state saved during the 2026-09-19-to-2026-09-28 window (photos true, no
  // updatedAt) is the one that now has to be re-read as the CURRENT default
  // rather than credited with a yes nobody actually gave.
  const state = { consent: { photos: true, location: false, updatedAt: null }, consentSeen: true };
  const fresher = await freshStore({ 'shin.v1': JSON.stringify(state) }, 'legacy-unrecorded');
  assert.equal(fresher.loadFault(), null, 'the seeded state was not read at all');
  assert.equal(fresher.consentSeen(), true, 'the seeded state was not the one loaded');
  assert.equal(fresher.consent().photos, false, 'the old on-by-default state was read as a recorded yes');
  assert.equal(fresher.consent().location, false);
});

test('a choice the person did record is kept exactly, whatever the default is', async () => {
  const state = {
    consent: { photos: false, location: true, updatedAt: '2026-09-15T10:00:00.000Z' },
    consentSeen: true,
  };
  const fresher = await freshStore({ 'shin.v1': JSON.stringify(state) }, 'legacy-recorded');
  assert.equal(fresher.consentSeen(), true, 'the seeded state was not the one loaded');
  assert.equal(fresher.consent().photos, false, 'a recorded opt-out was overridden by the new default');
  assert.equal(fresher.consent().location, true);
});

test('Continue records the default as an answer, with a time, and posts it', () => {
  withStorage({}, () => {
    const posted = [];
    const events = [];
    const api = {
      postConsent: (body) => posted.push(body),
      postEvent: (body) => events.push(body),
    };
    const next = confirmConsent(api);
    assert.equal(next.photos, false);
    assert.equal(next.location, false);
    assert.ok(next.updatedAt, 'the confirmed answer carries no time');
    assert.equal(posted.length, 1, 'Continue did not post the consent to the server');
    assert.equal(posted[0].photos, false);
    assert.equal(posted[0].location, false);
    assert.equal(events[0].payload.via, 'continue');
  });
});

test('the one switch is the whole opt-out, and it posts what it says', () => {
  withStorage({}, () => {
    const posted = [];
    const api = { postConsent: (b) => posted.push(b), postEvent: () => {} };
    const next = toggleConsent(api, 'photos');
    assert.equal(next.photos, true);
    assert.equal(posted[0].photos, true, 'the switch and the server disagree');
    assert.equal(toggleConsent(api, 'photos').photos, false);
  });
});

/* ----------------------------------------------------------------- wording -- */

const KEYS = ['consent_intro', 'consent_photos_desc', 'consent_footer'];

test('the English copy says photos are off by default and how to turn that on', () => {
  for (const tone of TONES) {
    const intro = say('consent_intro', {}, tone);
    const photos = say('consent_photos_desc', {}, tone);
    assert.match(intro, /photos/i, `${tone} intro does not mention photos`);
    assert.match(intro, /only if you switch (that|them) on/i, `${tone} intro does not say photos are off by default`);
    assert.match(photos, /off until you switch it on/i, `${tone} photo line does not say it is off`);
    assert.match(photos, /not kept|is gone/i, `${tone} photo line does not say what off does`);
    assert.doesNotMatch(intro, /two more things/i, `${tone} intro regressed to an even older wording`);
  }
});

test('the French copy says the same, in all three tones', () => {
  for (const tone of TONES) {
    const intro = LINES_FR.consent_intro[tone]();
    const photos = LINES_FR.consent_photos_desc[tone]();
    assert.match(intro, /photos/i, `${tone} intro does not mention photos`);
    assert.match(intro, /seulement si tu ouvres/i, `${tone} intro does not say photos are off by default`);
    assert.match(photos, /Fermé jusqu'à ce que tu l'ouvres/, `${tone} photo line does not say it is off`);
    assert.match(photos, /pas gardée|est partie/i, `${tone} photo line does not say what off does`);
    assert.doesNotMatch(intro, /Deux autres choses/i, `${tone} intro regressed to an even older wording`);
  }
});

test('the consent copy has no em dash and no guilt line, in either language', () => {
  const all = [];
  for (const key of KEYS) {
    for (const tone of TONES) {
      all.push([`en ${key} ${tone}`, say(key, {}, tone)]);
      all.push([`fr ${key} ${tone}`, LINES_FR[key][tone]()]);
    }
  }
  for (const [where, text] of all) {
    assert.ok(text.length > 0, `${where} is empty`);
    assert.ok(!text.includes('—'), `${where} has an em dash`);
    assert.doesNotMatch(text, /are you sure|please keep|help us|sad|désolé/i, `${where} pressures the choice`);
  }
});

test('the source of the screen and the actions still agree on the opt-out', () => {
  const screen = readFileSync(
    fileURLToPath(new URL('../public/js/screens/consent.js', import.meta.url)),
    'utf8',
  );
  // The switch is painted from the store, so it shows the default the server
  // uses; Continue goes through confirmConsent so the answer is recorded.
  assert.match(screen, /aria-checked="\$\{store\.consent\(\)\.photos\}"/);
  assert.match(screen, /confirmConsent\(ctx\.api\)/);
});

test('with the welcome flow off, location is asked once: the consent screen gates its row (D-139)', () => {
  const screen = readFileSync(
    fileURLToPath(new URL('../public/js/screens/consent.js', import.meta.url)),
    'utf8',
  );
  // The location switch is emitted only inside the FLAGS.onboarding branch;
  // with the flow off the permission screen right before has already asked.
  const at = screen.indexOf('data-consent="location"');
  assert.ok(at > 0, 'the location switch still exists for the welcome flow');
  const gate = screen.lastIndexOf('FLAGS.onboarding ?', at);
  assert.ok(gate > 0 && at - gate < 800, 'the location row sits inside a FLAGS.onboarding branch');
});
