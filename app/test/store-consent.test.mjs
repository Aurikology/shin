/**
 * Jamin's App Store list, items 9 to 13: the first-run choice holds at the server, the verdict label
 * is everywhere a verdict is, and the French pages exist and link back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('item 9: a fresh install must answer, and only a current, whole answer counts', async () => {
  const { needsAgreement, agreementRecord, AGREEMENT_VERSION } = await import('../public/js/screens/agree.js');
  assert.equal(needsAgreement({}), true);
  assert.equal(needsAgreement({ agreement: null }), true);
  assert.equal(needsAgreement({ agreement: { at: 'x', version: AGREEMENT_VERSION } }), true, 'no Claude answer passed');
  assert.equal(needsAgreement({ agreement: { at: 'x', version: 0, claude: false } }), true, 'an old version passed');
  assert.equal(needsAgreement({ agreement: agreementRecord(false) }), false, 'a no is a whole answer');
  assert.equal(needsAgreement({ agreement: agreementRecord(true) }), false);
  assert.equal(agreementRecord(undefined).claude, false, 'anything but a yes reads as no');
});

test('item 9: nothing on the screen is chosen for the person, and the button starts off', () => {
  const screen = read('../public/js/screens/agree.js');
  assert.ok(!/<input[^>]*\schecked/.test(screen), 'a box is pre-ticked');
  assert.match(screen, /data-act="agree-go" disabled/);
  assert.ok(!screen.includes('onb_skip_all'), 'the screen can be skipped');
});

test('item 9: every route goes through the guard', () => {
  assert.match(read('../public/js/main.js'), /router\.setGuard\(\(id\) => \(id !== 'agree' && needsAgreement/);
  assert.match(read('../public/js/router.js'), /const id = guard\?\.\(requestedId\) \?\? requestedId;/);
});

test('item 9: the phone says yes only with a yes on file', () => {
  assert.match(read('../public/js/api.js'), /agreement\?\.claude === true\) h\['x-shin-claude'\] = '1'/);
});

test('item 10: every verdict word on a screen has the label beside it', () => {
  const camera = read('../public/js/screens/camera.js');
  assert.equal((camera.match(/data-vd-estimate/g) ?? []).length, 3, 'a verdict sheet lost its label');
  for (const f of ['pastscans', 'watchlist']) assert.match(read(`../public/js/screens/${f}.js`), /data-vd-estimate/);
  assert.match(read('../public/js/screens/share.js'), /card\.estimate/);
});

test('item 12: the French pages exist, say French, and link to each other and back', () => {
  for (const [fr, en] of [['privacy-fr.html', 'privacy.html'], ['terms-fr.html', 'terms.html']]) {
    const url = new URL(`../../docs/store/${fr}`, import.meta.url);
    assert.ok(existsSync(url), `${fr} is missing`);
    const page = readFileSync(url, 'utf8');
    assert.match(page, /<html lang="fr-CA">/);
    assert.ok(page.includes(`href="${en}"`), `${fr} does not link to ${en}`);
    assert.ok(read(`../../docs/store/${en}`).includes(`href="${fr}"`), `${en} does not link to ${fr}`);
    assert.doesNotMatch(page, /—/, 'an em dash');
  }
});

test('item 12: the phone opens the French page in French', async () => {
  const { legalUrl } = await import('../public/js/plus-config.js');
  assert.match(legalUrl('terms', 'fr'), /terms-fr\.html$/);
  assert.match(legalUrl('privacy', 'fr'), /privacy-fr\.html$/);
  assert.match(legalUrl('privacy', 'en'), /privacy\.html$/);
});

test('item 11: the policy names the person in charge, in both languages', () => {
  assert.match(read('../../docs/store/privacy.html'), /Jamin Xu is the person in charge of the protection of personal information/);
  assert.match(read('../../docs/store/privacy-fr.html'), /Jamin Xu est la personne responsable de la protection des renseignements personnels/);
});

test('item 13: Open Icecat names are not embedded and not searched by vector', () => {
  const embed = read('../../catalogue/src/embed-all.ts');
  assert.equal((embed.match(/modelAllowedSql\('p\.'\)/g) ?? []).length, 2, 'the count and the page must both leave Icecat out');
  assert.match(embed, /DELETE FROM product_vec WHERE rowid IN/);
  assert.match(read('../../catalogue/src/search.ts'), /!isNeverSentToAModel\(row\.source\)\) out\.push/);
});
