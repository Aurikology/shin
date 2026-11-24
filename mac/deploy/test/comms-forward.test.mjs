import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forwardNew, sendArgs, toMacFiles } from '../comms-forward.mjs';

const harness = (state, added, mailCode = 0) => {
  const sent = [];
  let saved = state;
  return {
    sent,
    saved: () => saved,
    deps: {
      load: () => saved,
      save: (s) => { saved = s; },
      listAdded: async () => added,
      show: async (_c, p) => `content of ${p}`,
      runMail: async (args) => { sent.push(args); return { code: mailCode, out: mailCode ? 'push failed' : 'sent' }; },
    },
  };
};

test('only messages addressed to the Mac are picked', () => {
  assert.deepEqual(
    toMacFiles(['comms/messages/2026-11-23-aurik-to-mac-build-11-from-2ee048c.md', 'comms/messages/2026-11-23-aurik-to-jamin-x.md', 'app/to-mac-x.md', 'comms/messages/2026-11-08-mac-to-aurik-build-5.md']),
    ['comms/messages/2026-11-23-aurik-to-mac-build-11-from-2ee048c.md'],
  );
});

test('first run records the head and sends nothing old', async () => {
  const h = harness({}, ['comms/messages/a-aurik-to-mac-b.md']);
  assert.deepEqual(await forwardNew('abc1234', h.deps), []);
  assert.equal(h.sent.length, 0);
  assert.equal(h.saved().head, 'abc1234');
});

test('a new to-Mac file is mailed to the Mac with its text, and the head moves', async () => {
  const h = harness({ head: 'old0000' }, ['comms/messages/2026-11-24-aurik-to-mac-build-12.md', 'comms/messages/2026-11-24-aurik-to-jamin-hi.md']);
  const out = await forwardNew('new1111', h.deps);
  assert.deepEqual(out, ['comms/messages/2026-11-24-aurik-to-mac-build-12.md']);
  assert.equal(h.sent.length, 1);
  const a = h.sent[0];
  assert.deepEqual(a.slice(0, 5), ['send', '--to', 'mac', '--lane', 'opus']);
  assert.match(a[a.indexOf('--body') + 1], /content of comms\/messages\/2026-11-24-aurik-to-mac-build-12\.md/);
  assert.equal(h.saved().head, 'new1111');
});

test('a failed send keeps the old head, so the next check retries instead of losing the ask', async () => {
  const h = harness({ head: 'old0000' }, ['comms/messages/x-aurik-to-mac-y.md'], 1);
  assert.deepEqual(await forwardNew('new1111', h.deps), []);
  assert.equal(h.saved().head, 'old0000');
});

test('the subject names the file', () => {
  const a = sendArgs('comms/messages/2026-11-24-aurik-to-mac-build-12.md', 'abcdef123', 'x');
  assert.equal(a[a.indexOf('--subject') + 1], 'Aurik to Mac: 2026-11-24-aurik-to-mac-build-12.md');
});
