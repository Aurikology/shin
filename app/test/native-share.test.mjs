/**
 * UX build 5, R-31: lib/native-share.js, the phone's share sheet with the card
 * image attached. The card screen as a shopper meets it is in
 * test/ux/ux-b5-share.test.mjs; this pins the two routes and the failures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canShareCard, shareCard, isDismissal } from '../public/js/lib/native-share.js';

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
const phone = (over = {}) => {
  const shared = [];
  const navigator = {
    share: async (d) => { shared.push(d); },
    canShare: (d) => !d?.files || d.files.length > 0,
    ...over,
  };
  return { win: { navigator }, shared };
};

test('web route: the PNG goes to navigator.share as one file, with no url (1 share, image/png)', async () => {
  const { win, shared } = phone();
  assert.equal(canShareCard(win), true);
  const how = await shareCard({ blob: png(), name: 'pexi-x.png', title: 'X', text: 'hello', win });
  assert.equal(how, 'web');
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files.length, 1);
  assert.equal(shared[0].files[0].type, 'image/png');
  assert.equal(shared[0].files[0].name, 'pexi-x.png');
  assert.equal(shared[0].url, undefined);
});

test('no share sheet that takes files: the Share control is not offered and sharing throws, never sends text alone (control: a phone that has one says yes)', async () => {
  for (const win of [{ navigator: {} }, { navigator: { share: async () => {} } }, { navigator: { share: async () => {}, canShare: () => false } }]) {
    assert.equal(canShareCard(win), false);
    await assert.rejects(shareCard({ blob: png(), name: 'a.png', win }), /no share sheet that takes an image/);
  }
  assert.equal(canShareCard(phone().win), true, 'control failed: a phone with a share sheet was refused');
});

test('an empty or missing image throws and reaches nothing', async () => {
  const { win, shared } = phone();
  await assert.rejects(shareCard({ blob: new Blob([]), name: 'a.png', win }), /image is empty/);
  await assert.rejects(shareCard({ blob: null, name: 'a.png', win }), /image is empty/);
  assert.equal(shared.length, 0);
});

test('dismissing the sheet is not an error, any other failure is', async () => {
  const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
  assert.equal(await shareCard({ blob: png(), name: 'a.png', win: phone({ share: async () => { throw abort; } }).win }), 'dismissed');
  assert.equal(isDismissal(new Error('User cancelled')), true);
  assert.equal(isDismissal(new Error('disk full')), false);
  await assert.rejects(shareCard({ blob: png(), name: 'a.png', win: phone({ share: async () => { throw new Error('disk full'); } }).win }), /disk full/);
});

test('native route: with the Share and Filesystem plugins the image is written to the cache and its URI is shared', async () => {
  const written = [];
  const shared = [];
  const plugins = {
    Filesystem: { writeFile: async (o) => { written.push(o); return { uri: 'file:///cache/a.png' }; } },
    Share: { share: async (o) => { shared.push(o); } },
  };
  const win = { Capacitor: { isPluginAvailable: (n) => n in plugins, Plugins: plugins }, navigator: {} };
  assert.equal(canShareCard(win), true);
  assert.equal(await shareCard({ blob: png(), name: 'a.png', title: 'T', text: 'x', win }), 'native');
  assert.equal(written[0].directory, 'CACHE');
  assert.equal(written[0].data, btoa(String.fromCharCode(137, 80, 78, 71)));
  assert.deepEqual(shared[0].files, ['file:///cache/a.png']);
  // Control: a wrapper built without the Share plugin does not take the native route.
  const bare = { Capacitor: { isPluginAvailable: (n) => n === 'Filesystem', Plugins: plugins }, navigator: {} };
  assert.equal(canShareCard(bare), false);
});
