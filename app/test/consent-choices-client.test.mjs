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

test('owner ruling 2026-11-26: accepting stores aiText yes and improve yes, each with a time; unticking stores improve no', async () => {
  const { agreementRecord, improveOn, aiTextAnswer, needsAgreement, AGREEMENT_VERSION } = await import('../public/js/screens/agree.js');
  assert.equal(AGREEMENT_VERSION, 5, 'the document changed enough to ask again');
  const now = new Date('2026-11-26T12:00:00Z');
  const r = agreementRecord(now);
  assert.equal(r.aiText, 'yes', 'Accept covers typed searches to Claude');
  assert.equal(r.aiTextAt, now.toISOString());
  assert.equal(r.improve, true, 'Help improve Pexi is pre-ticked');
  assert.equal(r.improveAt, now.toISOString());
  assert.equal(needsAgreement({ agreement: r }), false);
  assert.equal(improveOn({ agreement: r }), true);
  assert.equal(aiTextAnswer({ agreement: r }), 'yes');
  const unticked = agreementRecord(now, { improve: false });
  assert.equal(unticked.improve, false, 'unticking stores improve = no');
  assert.equal(unticked.usage, false);
  assert.equal(unticked.aiText, 'yes', 'unticking Help improve does not touch the Claude yes');
  assert.equal(needsAgreement({ agreement: unticked }), false, 'a no on Help improve is still an answer');
});

test('an older acceptance sees the first screen once more', async () => {
  const { needsAgreement, agreementRecord } = await import('../public/js/screens/agree.js');
  const cur = agreementRecord();
  assert.equal(needsAgreement({ agreement: { ...cur, version: 4 } }), true, 'version 4 (the screen with the notice) is asked again');
  const noAi = { ...cur }; delete noAi.aiText;
  assert.equal(needsAgreement({ agreement: noAi }), true, 'no aiText on file');
  const noImprove = { ...cur }; delete noImprove.improve;
  assert.equal(needsAgreement({ agreement: noImprove }), true, 'no improve on file');
  assert.equal(needsAgreement({ agreement: { ...cur, aiText: 'no' } }), false, 'a no switched in Settings is an answer, not a reason to ask again');
});

test('accepting on the screen posts both values; unticking posts improve false', async () => {
  const { accept } = await import('../public/js/screens/agree.js');
  const device = await import('../public/js/device.js');
  const bodies = [];
  const api = { postConsent: async (b) => { bodies.push(b); return { stored: true }; } };
  store.update({ agreement: null });
  accept(api, new Date(), {});
  assert.equal(store.get().agreement.aiText, 'yes');
  assert.equal(store.get().agreement.improve, true);
  store.update({ agreement: null });
  accept(api, new Date(), { improve: false });
  assert.equal(store.get().agreement.improve, false);
  await new Promise((r) => setTimeout(r, 0));
  if (device.getDeviceId()?.id) {
    assert.equal(bodies.at(-1).accepted, true);
    assert.equal(bodies.at(-1).aiText, true, 'the server is told typed searches may go to Claude');
    assert.equal(bodies.at(-1).improve, false, 'the server is told improve = no');
  }
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

test('the one-time typed-words notice is gone everywhere', async () => {
  const api = read('../public/js/api.js');
  assert.ok(!/setTextNotice|textNotice/.test(api), 'identify no longer waits on a notice');
  const choices = read('../public/js/choices.js');
  assert.ok(!/askAiText|data-ai=|ai-notice|pmodal/.test(choices));
  assert.ok(!/askAiText|ai_notice/.test(read('../public/js/screens/agree.js')));
  assert.ok(!/ai-notice/.test(read('../public/js/screen-tags.js')));
  const mod = await import('../public/js/screens/agree.js');
  assert.equal(mod.askAiText, undefined);
  const strings = read('../public/js/ui-strings.js');
  assert.ok(!/ai_notice_/.test(strings), 'no notice strings left, in either language');
});

test('the first screen: one plain line above Accept, and a pre-ticked Help improve Pexi switch', () => {
  const agree = read('../public/js/screens/agree.js');
  assert.match(agree, /data-act="improve" role="switch"\s+aria-checked="true"/);
  assert.ok(!/<input/.test(agree));
  assert.ok(agree.indexOf("t('agree_ai_line')") < agree.indexOf('data-act="agree-go"'), 'the line sits above the Accept button');
  const you = read('../public/js/screens/you.js');
  assert.match(you, /data-act="improve" role="switch"/);
  assert.match(you, /data-act="ai-text" role="switch"/);
});

test('every new string exists in English and in French', () => {
  const keys = ['agree_ai_line', 'improve_title', 'improve_body', 'improve_change', 'you_ai_text_title', 'you_ai_text_caption'];
  const src = read('../public/js/ui-strings.js');
  for (const k of keys) {
    const n = src.split(`  ${k}:`).length - 1;
    assert.equal(n, 2, `${k} must be in the English table and the French one, found ${n}`);
  }
});

test('the exact line above Accept, in English and French', async () => {
  const { TABLES } = await import('../public/js/ui-strings.js');
  assert.equal(TABLES.en.agree_ai_line, 'Typed searches are sent to Anthropic’s Claude to estimate prices.');
  assert.equal(TABLES.fr.agree_ai_line, 'Tes recherches écrites sont envoyées à Claude, d’Anthropic, pour estimer les prix.');
});
