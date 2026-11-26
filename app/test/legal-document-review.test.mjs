/**
 * Legal review 2026-11-26 (A G4, G6, G8; E gap 4 and 5; B; C): what the one Terms, Privacy and Data document
 * must say so that it matches what Pexi does. Each line below was missing or wrong before this change.
 * English and French both, because a gap in one language is a gap.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { legalBodyHtml, LEGAL_EFFECTIVE } from '../public/js/legal/document.js';
import { REQUEST_LOG_DAYS, USAGE_EVENT_MONTHS, DEVICE_ID_MONTHS, SAFETY_COPY_DAYS } from '../src/retention.ts';

const plain = (lang) => legalBodyHtml(lang).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const en = plain('en');
const fr = plain('fr');

test('the document is dated for this change', () => {
  assert.equal(LEGAL_EFFECTIVE, '2026-11-26');
});

test('A G4: it says data may leave Canada and may be reachable by foreign authorities, naming who', () => {
  assert.match(en, /outside Canada[^.]*United States/);
  assert.match(en, /Courts, law enforcement and government authorities/);
  assert.match(fr, /à l’extérieur du Canada[^.]*États-Unis/);
  assert.match(fr, /autorités gouvernementales/);
  for (const who of ['Anthropic', 'RevenueCat', 'Apple', 'Google']) {
    assert.ok(en.includes(who) && fr.includes(who), `${who} is not named`);
  }
});

test('A G4: each recipient is listed with what it gets', () => {
  assert.match(en, /Anthropic[^.]*receives a product's name, brand, size, category and country/);
  assert.match(en, /RevenueCat \(revenuecat\.com\) is different[^]*?receives your random device identifier as the app user identifier, together with the purchase information/);
  assert.match(en, /Apple[^.]*receives your purchase/);
  assert.match(en, /Google[^.]*receives your purchase/);
  assert.match(fr, /reçoit donc ton achat/);
});

test('A G1 to G3: both optional choices are described, off by default, changeable in Settings, stored by the server', () => {
  for (const [lang, t] of [['en', en], ['fr', fr]]) {
    assert.match(t, lang === 'en' ? /Help improve Pexi/ : /Aider à améliorer Pexi/, `${lang}: Help improve Pexi`);
    assert.match(t, lang === 'en' ? /Not now/ : /Pas maintenant/, `${lang}: the Not now answer`);
    assert.match(t, /Settings|Réglages/);
  }
  assert.match(en, /off until you turn it on/);
  assert.match(en, /Pexi's server keeps your answer with the time you gave it and follows it/);
  assert.match(en, /Not now is a full answer: Pexi still replies to your search from its own data/);
});

test('E gap 4: one age position, the same for every shopper, with the under-14 choices made by a parent', () => {
  assert.match(en, /all ages, and one rule applies to everyone/);
  assert.match(en, /If you are under 14, a parent or guardian makes the choices/);
  assert.match(fr, /tous âges, et une seule règle vaut pour tout le monde/);
  assert.match(fr, /Si tu as moins de 14 ans, un parent ou un tuteur fait/);
  assert.doesNotMatch(en, /18 or older|You must be 18/);
});

test('E gap 5: entries that are not allowed are defined and there is a way to report a bad one by email', () => {
  assert.match(en, /abusive, hateful, threatening, sexual/);
  assert.match(en, /Reporting a bad entry\. If you see a price, store or other entry from another shopper[^.]*email usepexiapp@gmail\.com/);
  assert.match(fr, /Signaler une mauvaise entrée\. Si tu vois un prix[^.]*écris à usepexiapp@gmail\.com/);
  assert.match(fr, /injurieux, de haineux, de menaçant/);
});

test('A G6: the periods in the document are the ones the sweep enforces', () => {
  assert.equal(REQUEST_LOG_DAYS, 90);
  assert.equal(USAGE_EVENT_MONTHS, 12);
  assert.equal(DEVICE_ID_MONTHS, 24);
  assert.equal(SAFETY_COPY_DAYS, 30);
  assert.match(en, new RegExp(`Server request logs: ${REQUEST_LOG_DAYS} days`));
  assert.match(en, new RegExp(`Usage events \\(only if you turned on Help improve Pexi\\): ${USAGE_EVENT_MONTHS} months`));
  assert.match(en, new RegExp(`after ${DEVICE_ID_MONTHS} months your device identifier is removed`));
  assert.match(en, new RegExp(`deleted once your phone has been unused for ${DEVICE_ID_MONTHS} months`), 'the consent, secret and subscription rows the sweep deletes');
  assert.match(en, new RegExp(`at most ${SAFETY_COPY_DAYS} days`));
  assert.match(fr, new RegExp(`${REQUEST_LOG_DAYS} jours`));
  assert.match(fr, new RegExp(`${USAGE_EVENT_MONTHS} mois`));
  assert.match(fr, new RegExp(`${DEVICE_ID_MONTHS} mois`));
  assert.match(fr, new RegExp(`${SAFETY_COPY_DAYS} jours au plus`));
});

test('B: the Statistics Canada attribution, the ODbL notice and where to get the database, and the software licences line', () => {
  assert.match(en, /Adapted from Statistics Canada, Table 18-10-0245-01 Monthly average retail prices for selected products, [^.]*\. This does not constitute an endorsement by Statistics Canada of this product\./);
  assert.match(fr, /Adapté de Statistique Canada, tableau 18-10-0245-01/);
  assert.match(fr, /ne constitue pas une approbation de ce produit par Statistique Canada/);
  for (const t of [en, fr]) {
    assert.match(t, /Open Database License \(ODbL\)/);
    assert.match(t, /world\.openfoodfacts\.org\/data/);
    assert.match(t, /licences\.html/);
  }
  assert.match(en, /Software licences\./);
  assert.match(fr, /Licences des logiciels\./);
  const page = readFileSync(new URL('../public/licences.html', import.meta.url), 'utf8');
  assert.ok(page.length > 500, 'the licences page the document points to exists');
});

test('no em dash and no vous in the new words', () => {
  assert.doesNotMatch(en + fr, /—/);
  assert.doesNotMatch(fr, /\bvous\b/i);
});
