import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DAY, HOUR, MIN, autoQueue, brokenKeyHunks, checkDue, diffLines, recordAccess, settleShownCheck, expire, failingTests, finishDeploy, freshState, healthGood, ingest,
  markdownEdits, notionTestEdits, parseMarkdownLines, parseRequest, readSection, renderSection, replaceHunks, statusLine,
  appLine, observeHealth, searchAnswered,
} from '../lib.mjs';

const T0 = Date.parse('2026-09-14T05:00:00Z');
const req = (s) => parseRequest(s);
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

test('parses each request kind and ignores other lines', () => {
  const d = req('deploy · from aurik · 2026-09-14 04:55 UTC · latest · new price screen');
  assert.equal(d.verb, 'deploy');
  assert.equal(d.who, 'aurik');
  assert.equal(d.commit, 'latest');
  assert.equal(d.what, 'new price screen');
  assert.equal(d.time, Date.parse('2026-09-14T04:55:00Z'));
  assert.equal(req('`hold · from jamin · 2026-09-14 04:56 UTC · fixing the tunnel`').reason, 'fixing the tunnel');
  assert.equal(req('release · from jamin · 2026-09-14 05:00 UTC').verb, 'release');
  assert.equal(req('start checking · from aurik · 2026-09-14 05:00 UTC').verb, 'start checking');
  assert.equal(req('Any session writes one line'), null);
  assert.equal(req('deploy aurik latest').bad, true);
  const annotated = req('deploy · from aurik · 2026-09-14 04:55 UTC · abc1234 · x → seen 04:56, queue position 1');
  assert.equal(annotated.commit, 'abc1234');
  assert.equal(annotated.annotated, true);
  assert.equal(annotated.key, req('deploy · from aurik · 2026-09-14 04:55 UTC · abc1234 · x').key);
});

test('a second request joins the queue behind the first and the log says so', () => {
  const s = freshState();
  ingest(s, [req('deploy · from jamin · 2026-09-14 04:50 UTC · latest · a')], T0);
  ingest(s, [req('deploy · from aurik · 2026-09-14 04:58 UTC · latest · b')], T0 + MIN);
  assert.deepEqual(s.queue.map((q) => q.who), ['jamin', 'aurik']);
  assert.equal(s.log[0].text, 'aurik joined the queue at position 2 behind jamin');
  assert.match(Object.values(s.requests)[1].note, /queue position 2$/);
  // Reading the same lines again changes nothing.
  ingest(s, [req('deploy · from aurik · 2026-09-14 04:58 UTC · latest · b → seen 05:01, queue position 2')], T0 + 2 * MIN);
  assert.equal(s.queue.length, 2);
});

test('an annotated line unknown to state never deploys twice', () => {
  const s = freshState();
  ingest(s, [req('deploy · from aurik · 2026-09-14 04:58 UTC · latest · b → seen 05:01, queue position 1 → done 05:09, live abc1234')], T0);
  assert.equal(s.queue.length, 0);
});

test('hold, refresh, release; an unrefreshed hold expires after an hour', () => {
  const s = freshState();
  ingest(s, [req('hold · from jamin · 2026-09-14 05:00 UTC · tunnel work')], T0);
  assert.equal(s.holds.length, 1);
  assert.match(statusLine(s), /hold: jamin, tunnel work, since 05:00/);
  ingest(s, [req('hold · from jamin · 2026-09-14 05:40 UTC · tunnel work')], T0 + 40 * MIN);
  expire(s, T0 + 90 * MIN);
  assert.equal(s.holds.length, 1, 'refreshed at 05:40, so still held at 06:30');
  expire(s, T0 + 101 * MIN);
  assert.equal(s.holds.length, 0);
  assert.equal(s.log[0].text, "jamin's hold expired: not refreshed for 1 hour");
  ingest(s, [req('hold · from aurik · 2026-09-14 07:00 UTC · db')], T0 + 2 * HOUR);
  ingest(s, [req('release · from aurik · 2026-09-14 07:05 UTC')], T0 + 2 * HOUR + 5 * MIN);
  assert.equal(s.holds.length, 0);
});

test('a check every 30 s; network failures back off to at most 10 min; the key is broken after 3 refusals in a row', () => {
  const s = freshState();
  s.lastCheckAt = T0;
  assert.equal(checkDue(s, T0 + 20e3), false);
  assert.equal(checkDue(s, T0 + 30e3), true);
  recordAccess(s, 'transient', T0 + 30e3);
  recordAccess(s, 'transient', T0 + 60e3);
  assert.equal(checkDue(s, T0 + 60e3 + 90e3), false, 'two failures: wait 120 s');
  assert.equal(checkDue(s, T0 + 60e3 + 120e3), true);
  for (let i = 0; i < 10; i++) recordAccess(s, 'transient', T0);
  assert.equal(checkDue(s, T0 + 9 * MIN), false);
  assert.equal(checkDue(s, T0 + 10 * MIN), true, 'capped at 10 min, never stopped');
  assert.equal(recordAccess(s, 'refused', T0), false);
  assert.equal(recordAccess(s, 'refused', T0), false);
  assert.equal(recordAccess(s, 'ok', T0), false, 'a success resets the count');
  assert.equal(recordAccess(s, 'refused', T0), false);
  assert.equal(recordAccess(s, 'refused', T0), false);
  assert.equal(recordAccess(s, 'refused', T0), true);
});

test('the status line is rewritten only when it changes, or every 5 minutes for the time', () => {
  const s = freshState();
  s.lastCheckAt = T0;
  settleShownCheck(s, null);
  const onPage = statusLine(s);
  s.lastCheckAt = T0 + 3 * MIN;
  settleShownCheck(s, onPage);
  assert.equal(statusLine(s), onPage, 'nothing else changed at 05:03: text still says 05:00, no write');
  ingest(s, [req('hold · from jamin · 2026-09-14 05:00 UTC · x')], T0 + 3 * MIN);
  settleShownCheck(s, onPage);
  assert.match(statusLine(s), /last check 05:03 UTC .*hold: jamin/);
  const onPage2 = statusLine(s);
  s.lastCheckAt = T0 + 7 * MIN;
  settleShownCheck(s, onPage2);
  assert.equal(statusLine(s), onPage2);
  s.lastCheckAt = T0 + 8 * MIN;
  settleShownCheck(s, onPage2);
  assert.match(statusLine(s), /last check 05:08 UTC/, '5 minutes since the time shown');
});

test('broken key: one notice at the top of Needs attention and the status line set to STOPPED', () => {
  const content = ['## Needs attention', 'Questions from one session to another.', '- older line', '## Mac server', 'Status: checker on · every 30 s', '### Queue'].join('\n');
  const lines = parseMarkdownLines(content);
  const updates = markdownEdits(content, brokenKeyHunks(lines, T0, 'GET /blocks: unauthorized'));
  let c = content;
  for (const u of updates) c = c.replace(u.old_str, u.new_str);
  assert.equal(
    c,
    [
      '## Needs attention',
      'Questions from one session to another.',
      '- to jamin · from the Mac · 2026-09-14 05:00 UTC · Notion key is broken (GET /blocks: unauthorized); the Mac stopped checking this page. Deploy requests are not being read. Fix: make a new key, connect it to this page, replace NOTION_TOKEN on the Mac, then restart the checker.',
      '- older line',
      '## Mac server',
      'Status: checker STOPPED: Notion key broken since 2026-09-14 05:00 UTC',
      '### Queue',
    ].join('\n'),
  );
});

test('stop checking: only start checking is acted on', () => {
  const s = freshState();
  ingest(s, [req('stop checking · from jamin · 2026-09-14 05:00 UTC')], T0);
  assert.equal(s.mode, 'off');
  ingest(s, [req('deploy · from aurik · 2026-09-14 05:01 UTC · latest · x')], T0 + MIN);
  assert.equal(s.queue.length, 0);
  autoQueue(s, { head: A, author: 'Aurik', subject: 's' }, T0 + MIN);
  assert.equal(s.queue.length, 0);
  ingest(s, [req('deploy · from aurik · 2026-09-14 05:01 UTC · latest · x'), req('start checking · from aurik · 2026-09-14 05:02 UTC')], T0 + 2 * MIN);
  assert.equal(s.mode, 'on');
  assert.equal(s.queue.length, 1, 'the request written while off runs once checking is back on');
});

test('an unrequested push is queued once; a failed commit is not queued again', () => {
  const s = freshState();
  s.live = { commit: A, subject: 'old' };
  autoQueue(s, { head: B, author: 'Aurik Q', subject: 'new' }, T0);
  autoQueue(s, { head: B, author: 'Aurik Q', subject: 'new' }, T0 + 5 * MIN);
  assert.equal(s.queue.length, 1);
  assert.equal(s.queue[0].who, 'unrequested push by Aurik Q');
  finishDeploy(s, { ok: false, sha: B, reason: 'tests red' }, T0 + 10 * MIN);
  autoQueue(s, { head: B, author: 'Aurik Q', subject: 'new' }, T0 + 15 * MIN);
  assert.equal(s.queue.length, 0);
});

test('an older commit deployed on request is pinned until a newer push or a latest request', () => {
  const s = freshState();
  s.live = { commit: C, subject: 'head' };
  ingest(s, [req(`deploy · from jamin · 2026-09-14 05:00 UTC · ${A.slice(0, 7)} · roll back`)], T0);
  autoQueue(s, { head: C, author: 'x', subject: 'head' }, T0);
  finishDeploy(s, { ok: true, sha: A, subject: 'old', head: C }, T0 + 5 * MIN);
  assert.deepEqual(s.pin, { who: 'jamin', commit: A, originHead: C });
  assert.match(statusLine(s), /live aaaaaaa "old" \(pinned by jamin\)/);
  autoQueue(s, { head: C, author: 'x', subject: 'head' }, T0 + 10 * MIN);
  assert.equal(s.queue.length, 0, 'pin holds against the same head');
  autoQueue(s, { head: B, author: 'aurik', subject: 'newer' }, T0 + 15 * MIN);
  assert.equal(s.pin, null);
  assert.equal(s.queue.length, 1, 'a newer push ends the pin and is queued');

  const t = freshState();
  t.pin = { who: 'jamin', commit: A, originHead: C };
  ingest(t, [req('deploy · from aurik · 2026-09-14 05:00 UTC · latest · go')], T0);
  assert.equal(t.pin, null);
});

test('a pinned deploy drops unrequested items queued behind it', () => {
  const s = freshState();
  s.live = { commit: C, subject: 'x' };
  ingest(s, [req(`deploy · from jamin · 2026-09-14 05:00 UTC · ${A.slice(0, 7)} · roll back`)], T0);
  s.live = { commit: 'd'.repeat(40) };
  autoQueue(s, { head: C, author: 'x', subject: 'head' }, T0);
  assert.equal(s.queue.length, 2);
  finishDeploy(s, { ok: true, sha: A, subject: 'old', head: C }, T0 + MIN);
  assert.equal(s.queue.length, 0);
});

test('finished request lines are removed after a day', () => {
  const s = freshState();
  const line = req('release · from jamin · 2026-09-14 05:00 UTC');
  ingest(s, [line], T0);
  expire(s, T0 + DAY + MIN);
  const section = { requests: [{ kind: 'bullet', text: 'release · from jamin · 2026-09-14 05:00 UTC → seen 05:00, nothing was held' }] };
  const out = renderSection(s, section);
  assert.equal(out.some((l) => l.text.startsWith('release')), false);
});

// A Notion page as markdown, edited with the exact old/new strings the Mac would send.
function applyUpdates(content, updates) {
  let c = content;
  for (const u of updates) {
    const at = c.indexOf(u.old_str);
    assert.ok(at >= 0, `old_str not found: ${u.old_str}`);
    assert.equal(c.indexOf(u.old_str, at + 1), -1, `old_str not unique: ${u.old_str}`);
    c = c.slice(0, at) + u.new_str + c.slice(at + u.old_str.length);
  }
  return c;
}

const PAGE = [
  'Every Claude session working on Shin uses this page.',
  '## Needs attention',
  '- to jamin · from aurik · 2026-09-14 05:02 UTC · Notion test: can you see this?',
  '## Working on now',
  '- Claude (Jamin) · worker Mac · fixing [catch-up.md](http://catch-up.md)',
  '## Finished',
  '- 2026-09-14 · done',
].join('\n');

test('section created, requests read, edits are exact and converge; other sections untouched', () => {
  const s = freshState();
  s.live = { commit: A, subject: '[hooks] notes/catch-up.md' };
  s.lastCheckAt = T0;
  // 1. no section: render and append.
  let content = PAGE;
  assert.equal(readSection(parseMarkdownLines(content)), null);
  const first = renderSection(s, null);
  content = `${content}\n${first.map((l) => (l.kind === 'h2' ? '## ' : l.kind === 'h3' ? '### ' : l.kind === 'bullet' ? '- ' : '') + l.text).join('\n')}`;
  // 2. a human adds a request line.
  content = content.replace('### Queue', '- deploy · from jamin-mac-test · 2026-09-14 05:03 UTC · latest · pipeline test\n### Queue');
  const lines = parseMarkdownLines(content);
  const section = readSection(lines);
  assert.equal(section.requests.length, 1);
  ingest(s, section.requests.map((l) => parseRequest(l.text)).filter(Boolean), T0 + MIN);
  const extra = notionTestEdits(lines, s, T0 + MIN);
  assert.equal(extra.length, 1);
  const hunks = [...replaceHunks(lines, extra), ...diffLines(section.lines, renderSection(s, section))];
  const updates = markdownEdits(content, hunks);
  const after = applyUpdates(content, updates);
  // Everything above the Mac section except the test line is byte-identical.
  assert.equal(after.split('## Mac server')[0], PAGE.replace('can you see this?', 'can you see this? → seen 05:01 UTC by the Mac') + '\n');
  const again = parseMarkdownLines(after);
  const sec2 = readSection(again);
  assert.equal(diffLines(sec2.lines, renderSection(s, sec2)).length, 0, 'second pass needs no edits');
  assert.match(after, /pipeline test → seen 05:01, queue position 1/);
  assert.match(after, /1\. jamin-mac-test · deploy latest · requested 05:01 · now: starting/);
  assert.equal(notionTestEdits(again, s, T0 + 2 * MIN).length, 0, 'marked lines are not marked twice');
});

test('log grows newest first by small edits, capped at 30', () => {
  const s = freshState();
  for (let i = 0; i < 30; i++) s.log.unshift({ at: T0 + i * MIN, text: `entry ${i}` });
  const md = (ls) => ls.map((l) => (l.kind === 'h2' ? '## ' : l.kind === 'h3' ? '### ' : l.kind === 'bullet' ? '- ' : l.kind === 'number' ? '1. ' : '') + l.text).join('\n');
  const content = `## Other\n${md(renderSection(s, readSection([])))}`;
  s.log.unshift({ at: T0 + 31 * MIN, text: 'entry 31' });
  s.log = s.log.slice(0, 30);
  const lines = parseMarkdownLines(content);
  const sec = readSection(lines);
  const hunks = diffLines(sec.lines, renderSection(s, sec));
  assert.equal(hunks.length, 2, 'one insert at the top, one delete at the bottom');
  const after = applyUpdates(content, markdownEdits(content, hunks));
  assert.match(after, /### Mac log\n- 05:31 UTC · entry 31\n- 05:29 UTC · entry 29/);
  assert.doesNotMatch(after, /entry 0$/m);
});

test('failing test names from spec, TAP and tsc output', () => {
  const out = [
    '✔ fine (1ms)',
    '✖ price answer keeps the barcode match (2.1ms)',
    'not ok 7 - camera screen has a way back',
    'src/a.ts(3,5): error TS2322: Type x',
    '✖ failing tests:',
    '✖ price answer keeps the barcode match (2.1ms)',
  ].join('\n');
  assert.deepEqual(failingTests(out), ['price answer keeps the barcode match', 'camera screen has a way back', 'src/a.ts(3,5) TS2322']);
});

test('health must come from a process started after the restart', () => {
  const restartAt = Date.parse('2026-09-14T05:00:00Z');
  assert.equal(healthGood({ ok: true, startedAt: '2026-09-14T05:00:03Z', catalogueUp: true, scanLog: true }, restartAt, { catalogueUp: true }), true);
  assert.equal(healthGood({ ok: true, startedAt: '2026-09-14T04:00:00Z' }, restartAt, null), false);
  assert.equal(healthGood({ ok: true, startedAt: '2026-09-14T05:00:03Z', catalogueUp: false }, restartAt, { catalogueUp: true }), false);
});

test('ready needs a real catalogue search that answered inside 5 s', () => {
  assert.equal(searchAnswered({ catalogueUp: true, candidates: [{}], ms: 222 }), true);
  assert.equal(searchAnswered({ catalogueUp: true, candidates: [], ms: 12, error: 'the catalogue could not answer that one' }), false);
  assert.equal(searchAnswered({ catalogueUp: true, candidates: [], ms: 5001 }), false);
  assert.equal(searchAnswered({ catalogueUp: false, candidates: [], ms: 1 }), false);
  assert.equal(searchAnswered(null), false);
});

test('App line: ready, updating, restarting, and it sits directly under the status line', () => {
  const s = freshState();
  s.live = { commit: A, at: T0 };
  assert.equal(appLine(s), 'App: ready to test (live aaaaaaa, since 05:00 UTC)');
  s.app = { kind: 'updating', label: 'bbbbbbb', since: T0 };
  assert.equal(appLine(s), 'App: updating to bbbbbbb, will restart in a few minutes; the current version works until then');
  s.app = { kind: 'restarting', since: T0 };
  assert.equal(appLine(s), 'App: restarting now, back within a minute');
  const out = renderSection(s, null);
  assert.match(out[1].text, /^Status: /);
  assert.equal(out[2].text, 'App: restarting now, back within a minute');
});

test('App line goes NOT working only on the 2nd failed public health in a row, and back on recovery', () => {
  const s = freshState();
  s.live = { commit: A, at: T0 };
  observeHealth(s, { ok: true, startedAt: '2026-09-14T04:00:00.000Z' }, T0, false);
  observeHealth(s, { ok: false, reason: 'public /api/health answered HTTP 502' }, T0 + 30e3, false);
  assert.match(appLine(s), /^App: ready to test/);
  observeHealth(s, { ok: true, startedAt: '2026-09-14T04:00:00.000Z' }, T0 + 60e3, false);
  observeHealth(s, { ok: false, reason: 'public /api/health answered HTTP 502' }, T0 + 90e3, false);
  assert.match(appLine(s), /^App: ready to test/, 'a failure, a success, a failure is not two in a row');
  observeHealth(s, { ok: false, reason: 'public /api/health answered HTTP 502' }, T0 + 120e3, false);
  assert.equal(appLine(s), 'App: NOT working since 05:02 UTC (public /api/health answered HTTP 502)');
  observeHealth(s, { ok: true, startedAt: '2026-09-14T04:00:00.000Z' }, T0 + 150e3, false);
  assert.equal(appLine(s), 'App: ready to test (live aaaaaaa, since 05:02 UTC)');
  assert.ok(s.log.some((l) => l.text === 'app working again'));
});

test('a new server process outside a deploy is logged; one inside the restart window is not, nor counted as down', () => {
  const s = freshState();
  s.live = { commit: A, at: T0 };
  observeHealth(s, { ok: true, startedAt: '2026-09-14T04:00:00.000Z' }, T0, false);
  observeHealth(s, { ok: true, startedAt: '2026-09-14T05:17:27.000Z' }, T0 + 30e3, false);
  assert.ok(s.log.some((l) => l.text === 'server restarted outside a deploy at 05:17'));
  const n = s.log.length;
  s.restartWindowUntil = T0 + 10 * MIN;
  observeHealth(s, { ok: false, reason: 'public /api/health answered HTTP 502' }, T0 + 60e3, true);
  observeHealth(s, { ok: false, reason: 'public /api/health answered HTTP 502' }, T0 + 90e3, true);
  observeHealth(s, { ok: true, startedAt: '2026-09-14T05:30:00.000Z' }, T0 + 120e3, true);
  assert.equal(s.log.length, n);
  assert.notEqual(s.app?.kind, 'down');
});
