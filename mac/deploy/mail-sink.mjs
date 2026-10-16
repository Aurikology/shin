// mac/deploy/mail-sink.mjs
//
// The default report sink (SHIN_DEPLOY_REPORT=mailbox): the same state logic as the Notion
// page sync, with the page replaced by two things.
//
//   1. A local file, ~/.shin-deploy/status.md: the section text renderSection() gives the
//      page, written on every sync. A local write never fails a check.
//   2. The PC-Mac mailbox, a private git repo (~/claude-mailbox, or SHIN_MAILBOX_DIR),
//      driven ONLY by spawning `node <dir>/mail.mjs ...`; this code never runs git there.
//        - `progress --job shin-deploy --to pc` with the Status line, only when that line
//          changed (its "last check" time alone is not a change) and as a heartbeat at most
//          every 45 minutes when nothing changed. Each call is a git commit and push.
//        - `send --to pc` once per distinct "needs attention" notice (a failed deploy, a
//          hold, the app down), remembered in state so it is not re-sent every check.
//        - Requests: unacked messages to `mac` whose subject starts with `deploy:` are
//          turned into the request lines the page used to accept, fed to ingest(), and
//          answered with `ack <id> --note <what the checker did>`. Mail whose subject does
//          not start with `deploy:` is never touched or acked.
//
// A mailbox that cannot be reached (spawn error, nonzero exit, 60 s timeout) is a transient
// failure: the checker backs off like for a network error. It is never a broken key and
// never writes the stopped file. Pure logic stays in lib.mjs; the mail runner and every path
// can be injected (deps) so tests touch no real mailbox.

import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  MIN, REQUEST_HELP, autoQueue, clean, expire, ingest, parseRequest, renderMd, renderSection, settleShownCheck, statusLine, stripLastCheck, ymdhm,
} from './lib.mjs';
import { PATHS, childEnv, loadState, readConfig, run, waitLock, withState } from './util.mjs';

export const JOB = 'shin-deploy';
export const HEARTBEAT = 45 * MIN;
const MAIL_TIMEOUT = 60e3;
const FAILED = / · failed: /;

export const MAILBOX_HELP =
  'Send a request from any session: node ~/claude-mailbox/mail.mjs send --to mac --subject "deploy: COMMAND" --body "" . ' +
  'COMMAND is one of: latest | pin COMMIT | hold REASON | release | start checking | stop checking. ' +
  'The checker answers each with a receipt (mail sent) saying what it did.';

export function mailboxDir() {
  return process.env.SHIN_MAILBOX_DIR || readConfig(['SHIN_MAILBOX_DIR']).SHIN_MAILBOX_DIR || join(homedir(), 'claude-mailbox');
}

/** Real runner: `node <dir>/mail.mjs ...args`, 60 s hard timeout. Never throws. */
export function defaultRunMail(dir) {
  return (args) => run(process.execPath, [join(dir, 'mail.mjs'), ...args], { cwd: dir, timeoutMs: MAIL_TIMEOUT, env: childEnv({ MAILBOX_MACHINE: 'mac' }) });
}

const okRun = (r) => !!r && r.code === 0 && !r.timedOut;
const tail = (r) => (r?.timedOut ? 'timed out' : String(r?.out ?? 'no output').trim().split('\n').pop());

async function mail(runMail, args) {
  try {
    return await runMail(args);
  } catch (e) {
    return { code: -1, out: String(e.message), timedOut: false };
  }
}

// ---------------------------------------------------------------- requests

/** Unacked `deploy:` messages to the Mac, oldest first. Reads the repo's files; never writes. */
export function pendingRequests(dir) {
  const root = join(dir, 'messages');
  const out = [];
  let days = [];
  try {
    days = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return out;
  }
  for (const day of days) {
    for (const f of readdirSync(join(root, day.name))) {
      if (!f.endsWith('.json')) continue;
      let m;
      try {
        m = JSON.parse(readFileSync(join(root, day.name, f), 'utf8'));
      } catch {
        continue;
      }
      if (m.to !== 'mac' || m.kind !== 'message' || typeof m.id !== 'string' || typeof m.subject !== 'string') continue;
      if (!/^\s*deploy:/i.test(m.subject)) continue;
      if (existsSync(join(dir, 'acks', `${m.id}.json`))) continue;
      out.push(m);
    }
  }
  return out.sort((a, b) => String(a.sent).localeCompare(String(b.sent)));
}

/** A `deploy:` message as the one request line the page used to take, for parseRequest. */
export function requestLine(m) {
  const rest = m.subject.replace(/^\s*deploy:\s*/i, '').replace(/→/g, '-').replace(/\s+/g, ' ').trim();
  if (rest.includes('·')) return rest; // already in the page's own format
  const who = clean(m.from || 'unknown', 40).replace(/·/g, ' ');
  const sent = Date.parse(m.sent);
  const at = `${Number.isFinite(sent) ? ymdhm(sent) : '?'} UTC`;
  const body = clean(m.body, 80).replace(/·/g, ' ');
  const [word = '', ...args] = rest.split(' ');
  const low = rest.toLowerCase();
  if (['start checking', 'stop checking', 'release'].includes(low)) return `${low} · from ${who} · ${at}`;
  if (word.toLowerCase() === 'hold') return `hold · from ${who} · ${at} · ${args.join(' ') || body || 'no reason given'}`;
  const w = word.toLowerCase();
  const isCommit = (s) => /^(latest|[0-9a-f]{7,40})$/i.test(s ?? '');
  if ((w === 'pin' || w === 'deploy') && args.length) return `deploy · from ${who} · ${at} · ${args[0]} · ${args.slice(1).join(' ') || body || 'mailbox request'}`;
  if (isCommit(word)) return `deploy · from ${who} · ${at} · ${word} · ${args.join(' ') || body || 'mailbox request'}`;
  return rest; // parseRequest will say it is not a request
}

// ---------------------------------------------------------------- notices and status file

/** What the Notion path would put under "Needs attention", from state. Same logic, one place. */
export function noticesFor(state, since = 0) {
  const out = [];
  for (const e of state.log) {
    if (e.at >= since && FAILED.test(e.text)) out.push({ key: `failed|${e.at}|${e.text}`, text: e.text });
  }
  for (const h of state.holds) out.push({ key: `hold|${h.who}|${h.since}`, text: `${h.who} put a hold: ${h.reason}. Deploys wait` });
  if (state.app?.kind === 'down') out.push({ key: `down|${state.app.since}`, text: `App NOT working since ${ymdhm(state.app.since)} UTC (${clean(state.app.reason, 100)})` });
  return out;
}

export function renderStatusFile(state, now) {
  const body = renderSection(state, null).map((l) => (l.kind === 'p' && l.text === REQUEST_HELP ? { kind: 'p', text: MAILBOX_HELP } : l));
  const notices = noticesFor(state, 0);
  const lines = [`# Shin Mac deploy status`, '', `Written ${ymdhm(now)} UTC by the checker.`, ''];
  let n = 0;
  for (const l of body) {
    if (l.kind === 'h2' || l.kind === 'h3') lines.push('');
    n = l.kind === 'number' ? n + 1 : 0;
    lines.push(renderMd(l, n || 1));
  }
  lines.push('', '### Needs attention', ...(notices.length ? notices.map((x) => `- ${x.text}`) : ['(nothing)']), '');
  return lines.join('\n');
}

/** Atomic, and silent on failure: a local write never fails a check. */
function writeStatusFile(file, text, log) {
  try {
    try {
      if (readFileSync(file, 'utf8') === text) return;
    } catch {}
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
  } catch (e) {
    log(`could not write ${file}: ${e.message}`);
  }
}

// ---------------------------------------------------------------- the sync

/**
 * One mailbox sync, the counterpart of the Notion page sync.
 * @returns {{ outcome: 'ok'|'transient'|'skipped', error?: string }}
 */
export async function syncMailbox({ ingest: doIngest = false, git = null, owner, log, deps = {} }) {
  const dir = deps.dir ?? mailboxDir();
  const runMail = deps.runMail ?? defaultRunMail(dir);
  const nowFn = deps.now ?? Date.now;
  const statusFile = deps.statusFile ?? PATHS.status;
  const lock = await waitLock('mailbox', owner, doIngest ? 60e3 : 240e3);
  if (!lock) {
    writeStatusFile(statusFile, renderStatusFile(loadState(), nowFn()), log);
    return { outcome: 'skipped', error: 'another mailbox sync held the lock' };
  }
  try {
    let err = null;
    let msgs = [];
    if (doIngest) {
      const inbox = await mail(runMail, ['inbox']); // pulls the mailbox repo
      if (okRun(inbox)) msgs = pendingRequests(dir);
      else err = `mailbox inbox failed: ${tail(inbox)}`;
    }
    const now = nowFn();
    const parsed = msgs.map((m) => ({ m, req: parseRequest(requestLine(m)) }));
    const acks = [];
    const state = await withState(owner, (st) => {
      st.report ??= { since: now, lastStatus: null, lastSentAt: 0, shownStatus: null, notices: {} };
      if (doIngest) {
        ingest(st, parsed.map((p) => p.req).filter(Boolean), now);
        expire(st, now);
        autoQueue(st, git, now);
        st.lastCheckAt = now;
        for (const { m, req } of parsed) {
          if (!req) {
            acks.push({ id: m.id, note: `not understood: ${clean(m.subject, 60)}. Use deploy: latest | pin COMMIT | hold REASON | release | start checking | stop checking` });
            continue;
          }
          const rec = st.requests[req.key];
          // No record means ingest deliberately skipped it (checking is paused): leave it unacked.
          if (rec) acks.push({ id: m.id, note: clean(String(rec.note ?? '').replace(/^\s*→\s*/, ''), 140) || 'already handled' });
        }
      }
      settleShownCheck(st, st.report.shownStatus);
      st.report.shownStatus = statusLine(st);
      return st;
    });
    writeStatusFile(statusFile, renderStatusFile(state, now), log);
    if (err) {
      log(err);
      return { outcome: 'transient', error: err };
    }

    for (const a of acks) {
      const r = await mail(runMail, ['ack', a.id, '--note', a.note]);
      if (!okRun(r)) return fail(log, `mailbox ack failed: ${tail(r)}`);
      log(`acked ${a.id}: ${a.note}`);
    }

    const cur = loadState();
    const rep = cur.report;
    const statusText = statusLine(cur);
    const changed = rep.lastStatus === null || stripLastCheck(statusText) !== stripLastCheck(rep.lastStatus);
    if (changed || now - rep.lastSentAt >= HEARTBEAT) {
      const r = await mail(runMail, ['progress', '--job', JOB, '--note', statusText, '--to', 'pc']);
      if (!okRun(r)) return fail(log, `mailbox progress failed: ${tail(r)}`);
      await withState(owner, (st) => {
        st.report.lastStatus = statusText;
        st.report.lastSentAt = now;
      });
    }

    for (const n of noticesFor(cur, rep.since)) {
      if (rep.notices[n.key]) continue;
      const r = await mail(runMail, ['send', '--to', 'pc', '--subject', `${JOB}: ${clean(n.text, 150)}`, '--body', `${n.text}\n\n${statusText}`]);
      if (!okRun(r)) return fail(log, `mailbox send failed: ${tail(r)}`);
      await withState(owner, (st) => {
        st.report.notices[n.key] = now;
        const keep = Object.entries(st.report.notices).sort((a, b) => b[1] - a[1]).slice(0, 200);
        st.report.notices = Object.fromEntries(keep);
      });
    }
    return { outcome: 'ok' };
  } finally {
    lock.release();
  }
}

function fail(log, error) {
  log(error);
  return { outcome: 'transient', error };
}
