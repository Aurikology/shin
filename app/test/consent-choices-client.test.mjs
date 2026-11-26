/**
 * Legal review 2026-11-26, A G1 to G3: the phone's half of the two optional choices. The server enforces them
 * (test/consent-choices.test.ts); this holds that the phone starts both off, asks the right question in the
 * right place, sends the answer with the request, and keeps Settings in step.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as store from '../public/js/store.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the choices start off: accepting the terms turns neither on', async () => {
  const { agreementRecord, improveOn, aiTextAnswer, needsAgreement, AGREEMENT_VERSION } = await import('../public/js/screens/agree.js');
  assert.equal(AGREEMENT_VERSION, 4, 'the document changed enough to ask again');
  const r = agreementRecord();
  assert.equal(r.improve, false);
  assert.equal(r.usage, false, 'usage recording is no longer a yes by accepting');
  assert.equal(needsAgreement({ agreement: r }), false);
  assert.equal(improveOn({ agreement: r }), false);
  assert.equal(aiTextAnswer({ agreement: r }), null, 'accepting the terms answered the typed-words notice');
  assert.equal(agreementRecord(new Date(), { improve: true }).improve, true, 'the switch on the first screen is what turns it on');
});

test('setChoice stores the answer here and posts it with its own fields only', async () => {
  const { setChoice, improveOn, aiTextAnswer, agreementRecord } = await import('../public/js/screens/agree.js');
  store.update({ agreement: agreementRecord() });
  const bodies = [];
  const api = { postConsent: async (b) => { bodies.push(b); return { stored: true }; } };
  assert.equal(await setChoice(api, { aiText: true }), true);
  assert.equal(aiTextAnswer(), 'yes');
  assert.equal(bodies.at(-1).aiText, true);
  assert.ok(!('photos' in bodies.at(-1)) && !('accepted' in bodies.at(-1)), 'a choice rewrote the acceptance');
  assert.equal(await setChoice(api, { aiText: false }), true);
  assert.equal(aiTextAnswer(), 'no', 'Not now is an answer, so the notice is not shown again');
  assert.equal(await setChoice(api, { improve: true }), true);
  assert.equal(improveOn(), true);
  assert.equal(await setChoice(api, { improve: false }), true);
  assert.equal(improveOn(), false, 'a withdrawal is kept on the phone');
  assert.equal(bodies.at(-1).improve, false, 'a withdrawal reached the server');
});

test('a choice the server did not store is retried on the next launch', async () => {
  const { setChoice, syncChoices, agreementRecord } = await import('../public/js/screens/agree.js');
  store.update({ agreement: agreementRecord() });
  assert.equal(await setChoice({ postConsent: async () => ({ stored: false }) }, { improve: true }), false);
  const bodies = [];
  assert.equal(await syncChoices({ postConsent: async (b) => { bodies.push(b); return { stored: true }; } }), true);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].improve, true);
  assert.equal(await syncChoices({ postConsent: async () => { throw new Error('should not be called again'); } }), true);
});

test('the typed-words notice: identify waits for it before any typed word leaves', () => {
  const api = read('../public/js/api.js');
  assert.match(api, /export function setTextNotice/);
  assert.match(api, /if \(text && textNotice\) \{\s*try \{ await textNotice\(\)/);
  assert.match(read('../public/js/choices.js'), /setTextNotice\(\(\) => askAiText\(\)\)/);
});

test('the first screen carries one optional, off switch; the notice has Allow and Not now', () => {
  const agree = read('../public/js/screens/agree.js');
  assert.match(agree, /data-act="improve" role="switch"\s+aria-checked="false"/);
  assert.ok(!/<input/.test(agree));
  const choices = read('../public/js/choices.js');
  assert.match(choices, /data-ai="yes"/);
  assert.ok(!/document.body./.test(choices), 'the notice must mount inside #screen');
  assert.match(choices, /data-ai="no"/);
  const you = read('../public/js/screens/you.js');
  assert.match(you, /data-act="improve" role="switch"/);
  assert.match(you, /data-act="ai-text" role="switch"/);
});

test('every new string exists in English and in French', () => {
  const keys = ['improve_title', 'improve_body', 'improve_change', 'ai_notice_title', 'ai_notice_body',
    'ai_notice_allow', 'ai_notice_not_now', 'ai_notice_foot', 'you_ai_text_title', 'you_ai_text_caption'];
  const src = read('../public/js/ui-strings.js');
  for (const k of keys) {
    const n = src.split(`  ${k}:`).length - 1;
    assert.equal(n, 2, `${k} must be in the English table and the French one, found ${n}`);
  }
});
