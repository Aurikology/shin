/**
 * Legal review 2026-11-26, C (Competition Act s.74.01: a claim "false or misleading in a material respect",
 * and a performance claim with no adequate test behind it). The words the shopper reads must not promise more
 * than Pexi can do: not "any product", not "instantly know", not an absolute word on a statistical estimate,
 * and no line that says nobody else sells at a price while naming a seller.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installBrowser, makeDocument, makeStorage } from './mini-dom.mjs';
installBrowser({ doc: makeDocument(), storage: makeStorage() });

const { TABLES, setLocale } = await import('../public/js/ui-strings.js');
const { ONB_EN, ONB_FR } = await import('../public/js/onboarding-strings.js');
const voice = await import('../public/js/voice.js');

const onboarding = (lang) => (lang === 'fr' ? ONB_FR : ONB_EN).onb_promise;

test('the onboarding promise says what Pexi does, not that it knows any product instantly', () => {
  for (const lang of ['en', 'fr']) {
    const line = onboarding(lang);
    assert.ok(line, `${lang}: onb_promise is missing`);
    assert.doesNotMatch(line, /any product|instantly|n’importe quel|tout de suite/i, `${lang}: ${line}`);
  }
  assert.match(onboarding('en'), /^Scan a product and see if the price is a good one$/);
});

test('the top confidence word is not "Certain", in either language, on the sheet, the badge or the share card', () => {
  for (const lang of ['en', 'fr']) {
    const t = TABLES[lang];
    for (const key of ['vd_conf_high', 'share_conf_high']) assert.doesNotMatch(t[key], /^Certain$/i, `${lang}.${key}`);
    assert.doesNotMatch(t.conf_certain({ sellers: '3 sellers' }), /^Certain\b/i, `${lang}.conf_certain`);
  }
  assert.equal(TABLES.en.vd_conf_high, 'Very sure');
  assert.equal(TABLES.fr.share_conf_high, TABLES.fr.vd_conf_high, 'the share card and the sheet agree in French');
});

test('the intense verdict lines never say nobody else sells at a price, in any voice or language', () => {
  const facts = { asking: '$9.99', usual: '$4.99' };
  const bad = /nobody|no one|anyone else|what others charge|personne d.autre|les autres charg/i;
  const seen = [];
  for (const lang of ['en', 'fr']) {
    setLocale(lang);
    try {
      for (const key of ['verdict_steal', 'verdict_ripoff']) {
        for (const who of ['deadpan', 'warm', 'blunt']) {
          const line = voice.say(key, facts, who);
          seen.push(line);
          assert.doesNotMatch(line, bad, `${lang} ${key}/${who}: ${line}`);
          assert.match(line, /usual|habituel/i, `${lang} ${key}/${who} should compare with the usual price: ${line}`);
        }
      }
    } finally { setLocale('en'); }
  }
  assert.equal(seen.length, 12);
});
