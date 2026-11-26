/**
 * The hosting flag in legal/document.js: HOSTING = 'mac' is what is live, 'ovh' is the wording for the move
 * to OVHcloud (Beauharnois, Quebec). Both settings must render; flipping the constant is the whole cutover.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HOSTING, legalBodyHtml, legalPageHtml } from '../public/js/legal/document.js';

const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ');

test('live default is the current hosting wording', () => {
  assert.equal(HOSTING, 'mac');
  for (const lang of ['en', 'fr']) {
    const live = plain(legalBodyHtml(lang));
    assert.ok(!/OVH/.test(live), `${lang}: no OVHcloud while hosting is mac`);
    assert.equal(legalBodyHtml(lang), legalBodyHtml(lang, { hosting: 'mac' }));
  }
});

test('ovh names OVHcloud and no longer says the server is outside Quebec', () => {
  const en = plain(legalBodyHtml('en', { hosting: 'ovh' }));
  const fr = plain(legalBodyHtml('fr', { hosting: 'ovh' }));
  assert.match(en, /OVHcloud \(OVH Hosting Inc\., a Canadian company\) hosts Pexi's server and its databases/);
  assert.match(en, /Beauharnois, Quebec/);
  assert.match(en, /kept in Quebec, Canada/);
  assert.doesNotMatch(en, /outside Quebec/);
  assert.doesNotMatch(en, /Outside your province/);
  assert.match(en, /store or process data outside Canada, including in the United States/);
  assert.match(fr, /OVHcloud \(OVH Hosting Inc\., une société canadienne\) héberge le serveur de Pexi/);
  assert.match(fr, /Beauharnois, au Québec/);
  assert.match(fr, /gardées au Québec, au Canada/);
  assert.doesNotMatch(fr, /extérieur du Québec/);
  assert.match(fr, /aux États-Unis/);
});

test('ovh keeps the backup and retention wording and the hosted page picks it up', () => {
  for (const lang of ['en', 'fr']) {
    const mac = plain(legalBodyHtml(lang));
    const ovh = plain(legalBodyHtml(lang, { hosting: 'ovh' }));
    const backup = lang === 'en' ? /Cloudflare also stores an encrypted backup copy of the server/ : /Cloudflare conserve aussi une copie de sauvegarde chiffrée du serveur/;
    assert.match(ovh, backup);
    const retention = lang === 'en' ? /Backups of the server can hold a copy for longer/ : /Les sauvegardes du serveur peuvent garder une copie plus longtemps/;
    assert.match(ovh, retention);
    assert.notEqual(mac, ovh);
    const page = legalPageHtml(lang, undefined, 'ovh');
    assert.ok(page.includes(legalBodyHtml(lang, { hosting: 'ovh' })));
    assert.ok(!page.includes(legalBodyHtml(lang)));
  }
});
