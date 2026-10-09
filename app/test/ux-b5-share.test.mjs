/**
 * UX build 5, sharing the card: R-31 (the phone's share sheet opens with the card
 * image attached; Save image and Copy text stay; the card carries no link).
 * docs/design/ux-evidence-2026-10-09.md, block R-31, section 13 build 5,
 * journey J7 (3 taps, the third opens the phone's share sheet).
 *
 * BLOCKS COVERED: R-31.
 *
 * TESTS EXPECTED RED UNTIL BUILT: every test that opens the phone share sheet,
 * because today nothing calls navigator.share; the share card only saves an
 * image to downloads or copies text. GREEN today and kept green on purpose: Save
 * image still downloads a PNG, Copy text still copies text, and neither carries a
 * link. Those are the two controls the spec says stay.
 *
 * SEAM ASSUMPTION, stated so a future reader fixes it in one place. The control
 * that opens the phone's share sheet is named by `SHARE_SHEET` below; if the
 * build calls it something else, change that one list, not the tests. When no
 * control matches, every test that needs it fails with the buttons that ARE on
 * screen listed, so a rename shows up as a clear message, not as a mystery.
 *
 * WHAT IS REAL AND WHAT IS STUBBED. The real camera, verdict and share screens
 * and every module under public/js run (see ux-b5-harness.test.mjs). Stubbed, and
 * only these: the camera reader, the server, and the phone: navigator.share,
 * navigator.clipboard, the canvas bitmap and the browser download. The stubbed
 * phone writes down every call it receives, so "what was shared" is read from
 * what reached the phone, never from the screen's own word.
 *
 * FAILS LOUDLY (the founder: "all code should contain things that ensure things
 * fail loudly"). If the card image failed to render, sharing must throw. Today's
 * code answers a failed render by quietly showing the text version, and a
 * text-only share to a group chat is a different thing from the card the shopper
 * saw. The test makes the render fail, taps the share control, and requires a
 * thrown error that names the image AND that nothing at all reached the share
 * sheet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchReturning, reachVerdict } from './ux-b5-harness.test.mjs';

const SHARE_SHEET = '[data-act="share-sheet"], [data-act="send"], [data-act="share-image"]';
const LINK = /https?:\/\/|www\.|\.com\b|\.app\b/i;

/** From the verdict: the grabber and Share, two counted taps. The share card is up and drawn. */
async function openShare(app) {
  await reachVerdict(app);
  await app.tap('[data-act="detent-step"]', 'grabber');
  await app.tap('[data-act="share"]', 'Share');
  await app.wait(60);
}

function shareSheetControl(app) {
  let el = app.root.querySelector(SHARE_SHEET);
  if (!el && app.screen === 'share') el = app.root.querySelector('[data-act="share"]');
  assert.ok(el, `nothing on the share card opens the phone's share sheet. Controls on screen: ${app.all('button').map((b) => `${b.dataset.act ?? '?'}:"${b.textContent.trim().slice(0, 24)}"`).join(', ')}`);
  return el;
}

/* ------------------------------------------------- the phone share sheet */

test('R-31: the share control opens the phone share sheet with the card image attached as a PNG (pass: 1 share, 1 file, image/png, not empty)', async () => {
  const app = await launchReturning();
  await openShare(app);
  await app.tap(shareSheetControl(app), 'open the share sheet');
  await app.wait(40);
  assert.equal(app.phone.shares.length, 1, `the phone's share sheet was opened ${app.phone.shares.length} times`);
  const sent = app.phone.shares[0];
  assert.equal(sent.files?.length, 1, 'the share sheet was opened without the card image attached');
  assert.equal(sent.files[0].type, 'image/png', `the attached file is ${sent.files[0].type}`);
  assert.ok(sent.files[0].size > 0, 'the attached image is empty');
  assert.match(sent.files[0].name, /\.png$/, `the attached file is called "${sent.files[0].name}"`);
  assert.deepEqual(app.takeErrors(), []);
  app.stop();
});

test('R-31: the card carries no link: the share has no url and its text has no web address (pass: 0 links)', async () => {
  const app = await launchReturning();
  await openShare(app);
  await app.tap(shareSheetControl(app), 'open the share sheet');
  await app.wait(40);
  assert.equal(app.phone.shares.length, 1, 'setup: the share sheet never opened, so there is nothing to check for links');
  const sent = app.phone.shares[0];
  assert.equal(sent.url, undefined, `a link was attached to the share: ${sent.url}`);
  assert.doesNotMatch(`${sent.title ?? ''} ${sent.text ?? ''}`, LINK, 'the shared text carries a web address');
  app.stop();
});

test('R-31: dismissing the phone share sheet is not an error: the card stays and nothing is thrown (pass: 0 errors, card still up)', async () => {
  const app = await launchReturning();
  await openShare(app);
  const abort = new Error('Share canceled');
  abort.name = 'AbortError';
  app.phone.shareRejects = abort;
  await app.tap(shareSheetControl(app), 'open the share sheet');
  await app.wait(60);
  assert.equal(app.screen, 'share', 'dismissing the sheet left the share card');
  assert.deepEqual(app.takeErrors().map(String), [], 'dismissing the share sheet raised an error; it is the shopper changing their mind');
  assert.equal(app.phone.shares.length, 0);
  app.stop();
});

/* -------------------------------------------------- what stays as it was */

test('R-31 keeps: Save image downloads the card as a PNG (pass: 1 download, .png)', async () => {
  const app = await launchReturning();
  await openShare(app);
  assert.equal(app.screen, 'share', `setup: the share card is not up (screen=${app.screen})`);
  await app.tap('[data-act="save"]', 'Save image');
  await app.wait(60);
  assert.equal(app.phone.downloads.length, 1, `Save image made ${app.phone.downloads.length} downloads`);
  assert.match(app.phone.downloads[0].name, /\.png$/, `the download is called "${app.phone.downloads[0].name}"`);
  assert.deepEqual(app.takeErrors(), []);
  app.stop();
});

test('R-31 keeps: Copy text puts the card text on the clipboard and it has no link (pass: 1 copy, 0 links)', async () => {
  const app = await launchReturning();
  await openShare(app);
  assert.equal(app.screen, 'share', `setup: the share card is not up (screen=${app.screen})`);
  await app.tap('[data-act="copy"]', 'Copy text');
  await app.wait(60);
  assert.equal(app.phone.copied.length, 1, `Copy text copied ${app.phone.copied.length} times`);
  assert.match(app.phone.copied[0], /Kraft Dinner Original/, 'the copied text does not name the item');
  assert.doesNotMatch(app.phone.copied[0], LINK, 'the copied text carries a web address');
  app.stop();
});

/* ---------------------------------------------------------- fails loudly */

test('R-31 fails loudly: if the card image failed to render, sharing throws and nothing, not even text, reaches the share sheet (pass: 1 error naming the image, 0 shares)', async () => {
  const app = await launchReturning();
  await openShare(app);
  app.phone.failRender = true;
  const control = shareSheetControl(app);
  let sync = null;
  try { await app.tap(control, 'open the share sheet with the card broken'); } catch (e) { sync = e; }
  await app.wait(60);
  const thrown = sync ?? app.takeErrors()[0];
  assert.equal(app.phone.shares.length, 0, `the phone's share sheet was opened with ${JSON.stringify(Object.keys(app.phone.shares[0] ?? {}))} although the card image never rendered; a text-only share is not the card the shopper saw`);
  assert.ok(thrown, 'the card image failed to render and nothing threw: the share went on, or died quietly');
  assert.match(String(thrown.message ?? thrown), /image|render|card|blob/i, 'the error does not say the image failed');
  app.takeErrors();
  app.stop();
});
