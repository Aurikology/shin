// Report sink tests: the mailbox sink (default) and that the Notion sink is still the old path.
// Nothing here touches a real mailbox, Notion or the network: the mail runner is a fake that
// records its argument lists, and every path (state, status file, stopped flag) lives in a temp dir.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

const TMP = mkdtempSync(join(tmpdir(), 'shin-report-'));
process.env.SHIN_DEPLOY_HOME = join(TMP, 'home');
process.env.SHIN_CONFIG_ENV = join(TMP, 'no-such-config.env');
delete process.env.SHIN_DEPLOY_REPORT;
delete process.env.SHIN_MAILBOX_DIR;

const sync = await import('../sync.mjs');
const { PATHS, loadState, withState } = await import('../util.mjs');
const { addLog, checkDue } = await import('../lib.mjs');

const T0 = Date.parse('2026-10-15T12:00:00Z');
const MIN = 60e3;
const SHA = 'a'.repeat(40);
const logs = [];
const log = (m) => logs.push(m);

let dir; // the fake mailbox repo
let mail; // the fake mail runner

/** Fake `node mail.mjs`: records args, writes the ack file on `ack`, can be made to fail. */
function fakeMail(mailDir) {
  const m = {
    calls: [],
    fail: null, // null | 'code' | 'throw' | 'timeout'
    failCmd: null, // limit the failure to one command (e.g. 'send'); null = every command
    run: async (args) => {
      m.calls.push(args);
      const failing = m.fail && (!m.failCmd || m.failCmd === args[0]);
      if (failing && m.fail === 'throw') throw new Error('spawn node ENOENT');
      if (failing && m.fail === 'code') return { code: 1, out: 'fatal: could not read from remote repository', timedOut: false };
      if (failing && m.fail === 'timeout') return { code: -1, out: '', timedOut: true };
      if (args[0] === 'ack') {
        mkdirSync(join(mailDir, 'acks'), { recursive: true });
        writeFileSync(join(mailDir, 'acks', `${args[1]}.json`), JSON.stringify({ id: args[1], by: 'mac', note: args[args.indexOf('--note') + 1] }));
      }
      return { code: 0, out: 'ok', timedOut: false };
    },
    of: (cmd) => m.calls.filter((c) => c[0] === cmd),
  };
  return m;
}

/** A message file as mail.mjs writes it. */
function put(id, fields) {
  const msg = { id, from: 'pc', to: 'mac', kind: 'message', sent: new Date(T0 - 60e3).toISOString(), session: null, job: null, subject: '', body: '', ...fields };
  const day = join(dir, 'messages', msg.sent.slice(0, 10));
  mkdirSync(day, { recursive: true });
  writeFileSync(join(day, `${id}.json`), JSON.stringify(msg));
  return msg;
}

const check = (now, extra = {}) =>
  sync.syncPage({ ingest: true, git: null, owner: 'checker', log, deps: { dir, runMail: mail.run, now: () => now }, ...extra });

beforeEach(() => {
  rmSync(PATHS.state, { force: true });
  rmSync(PATHS.status, { force: true });
  rmSync(sync.STOPPED_FLAG, { force: true });
  dir = mkdtempSync(join(TMP, 'mailbox-'));
  mail = fakeMail(dir);
  logs.length = 0;
  delete process.env.SHIN_DEPLOY_REPORT;
});

test('the default sink is the mailbox; only the word notion selects Notion', () => {
  assert.equal(sync.reportSink(), 'mailbox');
  process.env.SHIN_DEPLOY_REPORT = 'notion';
  assert.equal(sync.reportSink(), 'notion');
  process.env.SHIN_DEPLOY_REPORT = 'carrier-pigeon';
  assert.equal(sync.reportSink(), 'mailbox');
});

test('mailbox sink writes the status file with the same section text the page would get', async () => {
  const r = await check(T0);
  assert.equal(r.outcome, 'ok');
  const text = readFileSync(PATHS.status, 'utf8');
  assert.match(text, /Status: checker on · every 30 s · last check 12:00 UTC/);
  assert.match(text, /App: ready to test/);
  assert.match(text, /### Queue/);
  assert.match(text, /### Mac log/);
});

test('progress goes out on the first report and on a change, never on a mere last-check tick', async () => {
  await check(T0);
  assert.equal(mail.of('progress').length, 1);
  const p = mail.of('progress')[0];
  assert.deepEqual(p.slice(0, 3), ['progress', '--job', 'shin-deploy']);
  assert.equal(p[p.indexOf('--to') + 1], 'pc');
  assert.match(p[p.indexOf('--note') + 1], /^Status: checker on/);
  assert.ok(!p.includes('--done'));

  await check(T0 + 30e3);
  await check(T0 + 6 * MIN); // the shown "last check" time refreshes after 5 min: not a change
  assert.equal(mail.of('progress').length, 1, 'no new progress while only the clock moved');

  await withState('test', (st) => {
    st.live = { commit: SHA, subject: 'new price screen', at: T0 + 7 * MIN };
  });
  await check(T0 + 7 * MIN);
  assert.equal(mail.of('progress').length, 2);
  assert.match(mail.of('progress')[1][mail.of('progress')[1].indexOf('--note') + 1], /live aaaaaaa "new price screen"/);
});

test('a heartbeat goes out after 45 minutes of silence and not before', async () => {
  await check(T0);
  await check(T0 + 44 * MIN);
  assert.equal(mail.of('progress').length, 1, 'no heartbeat at 44 minutes');
  await check(T0 + 46 * MIN);
  assert.equal(mail.of('progress').length, 2, 'heartbeat at 46 minutes');
  await check(T0 + 47 * MIN);
  await check(T0 + 80 * MIN);
  assert.equal(mail.of('progress').length, 2, 'the next one waits another 45 minutes from the heartbeat');
  await check(T0 + 92 * MIN);
  assert.equal(mail.of('progress').length, 3);
});

test('a needs-attention notice (failed deploy, hold) is sent once per distinct notice', async () => {
  await check(T0);
  await withState('test', (st) => {
    addLog(st, T0 + 1000, `aurik's deploy ${SHA.slice(0, 7)} · failed: 2 tests red`);
    st.holds.push({ who: 'jamin', reason: 'fixing the tunnel', since: T0 + 2000, refreshedAt: T0 + 2000 });
  });
  await check(T0 + 60e3);
  await check(T0 + 90e3);
  await check(T0 + 120e3);
  const sends = mail.of('send');
  assert.equal(sends.length, 2, 'one failed-deploy notice and one hold notice, each once');
  for (const s of sends) assert.equal(s[s.indexOf('--to') + 1], 'pc');
  const subjects = sends.map((s) => s[s.indexOf('--subject') + 1]).join('\n');
  assert.match(subjects, /failed: 2 tests red/);
  assert.match(subjects, /jamin put a hold/);

  await withState('test', (st) => {
    addLog(st, T0 + 3 * MIN, `aurik's deploy bbbbbbb · failed: typecheck`);
  });
  await check(T0 + 4 * MIN);
  assert.equal(mail.of('send').length, 3, 'a different failure is a different notice');
});

test('a notice that failed to send is retried next check, not lost', async () => {
  await check(T0);
  await withState('test', (st) => addLog(st, T0 + 1000, `aurik's deploy ${SHA.slice(0, 7)} · failed: red`));
  mail.fail = 'code';
  mail.failCmd = 'send';
  const bad = await check(T0 + 60e3);
  assert.equal(bad.outcome, 'transient');
  assert.equal(mail.of('send').length, 1, 'one attempt that failed');
  mail.fail = null;
  await check(T0 + 120e3);
  assert.equal(mail.of('send').length, 2, 'retried once the mailbox is back');
  await check(T0 + 150e3);
  assert.equal(mail.of('send').length, 2, 'and then no more');
});

test('a deploy: message is ingested and acked with what the checker did; other mail is left alone', async () => {
  const stop = put('20261015115900-pc-aaaaaa', { subject: 'deploy: stop checking' });
  const chat = put('20261015115901-pc-bbbbbb', { subject: 'can you look at the beta server?', body: 'deploy: please' });
  put('20261015115902-pc-cccccc', { kind: 'progress', job: 'x', subject: 'deploy: not mail' });
  put('20261015115903-pc-dddddd', { to: 'pc', subject: 'deploy: start checking' });

  await check(T0);

  assert.equal(mail.calls[0][0], 'inbox', 'the mailbox is refreshed before it is read');
  assert.equal(loadState().mode, 'off');
  const acks = mail.of('ack');
  assert.equal(acks.length, 1, 'only the deploy: message is acked');
  assert.equal(acks[0][1], stop.id);
  assert.match(acks[0][acks[0].indexOf('--note') + 1], /checking paused/);
  assert.ok(!existsSync(join(dir, 'acks', `${chat.id}.json`)), 'the chat message stays unacked');
  assert.ok(!mail.calls.some((c) => c.includes(chat.id)), 'and is never touched');

  await check(T0 + 30e3);
  assert.equal(mail.of('ack').length, 1, 'an acked message is not handled twice');
});

test('deploy: pin <sha>, latest, hold and release become the same requests the page accepted', async () => {
  put('20261015115900-pc-aaaaa1', { subject: `deploy: pin ${'b'.repeat(40)}`, body: 'back to the good one' });
  put('20261015115901-pc-aaaaa2', { subject: 'deploy: hold fixing the tunnel', sent: new Date(T0 - 50e3).toISOString() });
  put('20261015115902-pc-aaaaa3', { subject: 'deploy: gibberish words', sent: new Date(T0 - 40e3).toISOString() });
  await check(T0);
  const st = loadState();
  assert.equal(st.queue.length, 1);
  assert.equal(st.queue[0].commit, 'b'.repeat(40));
  assert.equal(st.queue[0].who, 'pc');
  assert.equal(st.queue[0].what, 'back to the good one');
  assert.equal(st.holds[0].reason, 'fixing the tunnel');
  const notes = mail.of('ack').map((a) => a[a.indexOf('--note') + 1]);
  assert.equal(notes.length, 3, 'all three deploy: messages are answered');
  assert.ok(notes.some((n) => /queue position 1/.test(n)));
  assert.ok(notes.some((n) => /hold on/.test(n)));
  assert.ok(notes.some((n) => /not understood/i.test(n)));
});

test('a mailbox failure backs off like a network error and never stops the checker', async () => {
  for (const mode of ['code', 'throw', 'timeout']) {
    mail.fail = mode;
    for (let i = 0; i < 5; i++) {
      const r = await check(T0 + i * 30e3);
      assert.equal(r.outcome, 'transient', `${mode}: a mailbox failure is transient`);
      const broken = await sync.handleOutcome({ r, sink: 'mailbox', log });
      assert.equal(broken, false);
    }
  }
  assert.ok(!existsSync(sync.STOPPED_FLAG), 'the stopped file is never written');
  assert.equal(sync.stoppedReason(), null);
  assert.equal(loadState().keyFailures, 0, 'never counted against the key');
  assert.equal(loadState().transientFailures, 15, 'counted as backoff');
  assert.equal(checkDue(loadState(), loadState().lastAttemptAt + 30e3), false, 'the next check waits longer');
  assert.ok(existsSync(PATHS.status), 'the local status file is written even with the mailbox down');
  assert.equal(mail.of('progress').length, 0);
});

test('mailbox failure does not eat requests: they are read once the mailbox is back', async () => {
  const stop = put('20261015115900-pc-aaaaa4', { subject: 'deploy: stop checking' });
  mail.fail = 'code';
  await check(T0);
  assert.equal(loadState().mode, 'on');
  mail.fail = null;
  await check(T0 + 5 * MIN);
  assert.equal(loadState().mode, 'off');
  assert.equal(mail.of('ack')[0][1], stop.id);
});

test('a stale stopped file from the Notion era does not stop the mailbox sink', async () => {
  writeFileSync(sync.STOPPED_FLAG, 'Notion key broken since long ago\n');
  const r = await check(T0);
  assert.equal(r.outcome, 'ok');
  assert.equal(mail.of('progress').length, 1);
});

test('the 3-strike stop belongs to the notion sink only', async () => {
  const seen = [];
  const strike = async (sink) => sync.handleOutcome({ r: { outcome: 'refused', error: 'unauthorized' }, sink, log: (m) => seen.push(m), report: async () => seen.push('REPORTED') });
  // mailbox: a refusal (cannot happen, but) is only a transient failure
  for (let i = 0; i < 4; i++) assert.equal(await strike('mailbox'), false);
  assert.equal(loadState().keyFailures, 0);
  // notion: counted, and broken on the third
  assert.equal(await strike('notion'), false);
  assert.equal(await strike('notion'), false);
  assert.equal(loadState().keyFailures, 2);
  assert.equal(await strike('notion'), true);
  assert.ok(seen.includes('REPORTED'), 'the broken-key report runs on the third strike');
});

test('SHIN_DEPLOY_REPORT=notion still goes down the old Notion path', async () => {
  process.env.SHIN_DEPLOY_REPORT = 'notion';
  process.env.SHIN_NOTION_TOKEN_OVERRIDE = 'secret-test-token';
  const realFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return { status: 401, ok: false, json: async () => ({ code: 'unauthorized', message: 'API token is invalid.' }), headers: { get: () => null } };
  };
  try {
    const r = await check(T0);
    assert.equal(r.outcome, 'refused');
    assert.ok(urls.length > 0 && urls.every((u) => u.startsWith('https://api.notion.com/v1/')), 'it called the Notion API');
    assert.equal(mail.calls.length, 0, 'and never the mailbox');
    assert.ok(!existsSync(PATHS.status), 'and wrote no status file');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SHIN_NOTION_TOKEN_OVERRIDE;
  }
});
