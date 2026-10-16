// mac/deploy/sync.mjs
//
// Where the Mac reports and where it reads requests, chosen by SHIN_DEPLOY_REPORT in
// mac/config.env:
//
//   mailbox (the default)  mail-sink.mjs: a local ~/.shin-deploy/status.md plus the PC-Mac
//                          mailbox (progress, notices, "deploy:" requests). No Notion.
//   notion                 the optional sink below: one page sync over the Notion API.
//
// syncPage() is the one entry point the checker and deployer call; it dispatches.
//
// NOTION SINK. Fetch the page, (checker only) read requests into state, render what the
// Mac server section should say, and apply the difference as exact-text block edits.
// Idempotent: an edit that fails is re-derived next time. A check with nothing new writes
// nothing. If the key is refused on BROKEN_AFTER checks in a row, reportBrokenKey() makes
// the one claude -p call this pipeline ever makes (a notice on the page), writes the
// stopped flags, and the checker makes no more calls. That stop belongs to this sink only:
// a mailbox that cannot be reached backs off and never stops the checker.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  BROKEN_AFTER, autoQueue, brokenKeyHunks, diffLines, expire, ingest, notionTestEdits, parseRequest, readSection, recordAccess, renderSection, replaceHunks, settleShownCheck, addLog,
} from './lib.mjs';
import { syncMailbox } from './mail-sink.mjs';
import { ClaudeSession, NotionAccessError, RestSession, costLogPath } from './notion.mjs';
import { PAGE_ID, PATHS, childEnv, loadState, readConfig, waitLock, withState } from './util.mjs';

export const STOPPED_FLAG = join(PATHS.home, 'stopped');
export const WORKER_FLAG = join(process.env.WORKER_STATEDIR || join(homedir(), '.worker-state'), 'shin-checker-stopped');

export const stoppedReason = () => (existsSync(STOPPED_FLAG) ? readFileSync(STOPPED_FLAG, 'utf8').trim() : null);

function token() {
  return process.env.SHIN_NOTION_TOKEN_OVERRIDE || readConfig(['NOTION_TOKEN']).NOTION_TOKEN || null;
}

/** 'notion' only when asked for by name; anything else, or nothing, is the mailbox. */
export function reportSink() {
  const v = (process.env.SHIN_DEPLOY_REPORT || readConfig(['SHIN_DEPLOY_REPORT']).SHIN_DEPLOY_REPORT || '').trim().toLowerCase();
  return v === 'notion' ? 'notion' : 'mailbox';
}

/**
 * One report sync through the configured sink. `deps` (mailbox sink only) injects the mail
 * runner, mailbox dir, status file path and clock for tests.
 * @returns {Promise<{ outcome: 'ok'|'refused'|'transient'|'skipped', error?: string }>}
 */
export function syncPage(opts) {
  return reportSink() === 'notion' ? syncNotion(opts) : syncMailbox(opts);
}

/**
 * What the checker does with a sync's outcome: back-off and key-failure counting, and the
 * one-time broken-key report. Only the notion sink can refuse a key or be stopped by it; for
 * the mailbox every failure is transient (backoff), never a strike.
 * @returns {Promise<boolean>} true when the checker has just been stopped
 */
export async function handleOutcome({ r, sink = reportSink(), log, report = reportBrokenKey }) {
  if (r.outcome === 'skipped') return false;
  const outcome = sink === 'notion' ? r.outcome : r.outcome === 'ok' ? 'ok' : 'transient';
  const broken = await withState('checker', (st) => recordAccess(st, outcome, Date.now()));
  if (sink !== 'notion') {
    if (r.outcome !== 'ok') log(`mailbox not reachable (${r.error}); backing off`);
    return false;
  }
  if (r.outcome === 'refused') log(`Notion refused the key (${r.error}); ${broken ? 'broken' : `strike ${loadState().keyFailures} of ${BROKEN_AFTER}`}`);
  if (broken) {
    await report({ error: r.error, log });
    return true;
  }
  return false;
}

/**
 * The Notion sink, unchanged.
 * @returns {Promise<{ outcome: 'ok'|'refused'|'transient'|'skipped', error?: string }>}
 */
async function syncNotion({ ingest: doIngest = false, git = null, owner, log }) {
  if (stoppedReason()) return { outcome: 'skipped', error: 'checker stopped' };
  const tok = token();
  if (!tok) {
    log('no NOTION_TOKEN in mac/config.env; not checking');
    return { outcome: 'transient', error: 'no token' };
  }
  const lock = await waitLock('notion', owner, doIngest ? 60e3 : 240e3);
  if (!lock) return { outcome: 'skipped', error: 'another page sync held the lock' };
  const session = new RestSession({ token: tok, pageId: PAGE_ID, log });
  try {
    const page = await session.fetch();
    if (!page.lines.some((l) => l.kind === 'h2')) throw new Error('page fetch looks empty; not touching it');
    const now = Date.now();
    const section = readSection(page.lines);
    const statusText = section?.lines.find((l) => l.kind === 'p' && l.text.startsWith('Status:'))?.text ?? null;
    let extra = [];
    const state = await withState(owner, (st) => {
      if (doIngest) {
        const reqs = section ? section.requests.map((l) => parseRequest(l.text)).filter(Boolean) : [];
        ingest(st, reqs, now);
        expire(st, now);
        autoQueue(st, git, now);
        st.lastCheckAt = now;
        extra = notionTestEdits(page.lines, st, now);
      }
      settleShownCheck(st, statusText);
      return st;
    });
    const desired = renderSection(state, section);
    let edits = 0;
    if (!section) {
      await session.appendSection(page, desired);
      log('created the Mac server section');
    } else {
      const hunks = [...replaceHunks(page.lines, extra), ...diffLines(section.lines, desired)];
      edits = hunks.length;
      if (hunks.length) await session.applyHunks(page, hunks);
    }
    if (edits || !doIngest) log(`synced: ${edits} edit(s), ${session.calls} API call(s)`);
    return { outcome: 'ok', calls: session.calls };
  } catch (e) {
    if (e instanceof NotionAccessError) return { outcome: 'refused', error: e.message };
    log(`sync failed (will retry): ${e.message}`);
    return { outcome: 'transient', error: e.message };
  } finally {
    lock.release();
  }
}

/** The key is broken: one claude -p post, then stop for good until a human restarts. */
export async function reportBrokenKey({ error, log, owner = 'checker' }) {
  const now = Date.now();
  const reason = `Notion key broken since ${new Date(now).toISOString()}: ${error}`;
  let posted = false;
  const s = new ClaudeSession({ pageId: PAGE_ID, cwd: PATHS.neutral, env: childEnv(), log, costLog: costLogPath(PATHS.home) });
  try {
    const page = await s.fetch();
    await s.applyHunks(page, brokenKeyHunks(page.lines, now, error));
    posted = true;
  } catch (e) {
    log(`could not post the broken-key notice: ${e.message}`);
  } finally {
    await s.close();
  }
  writeFileSync(STOPPED_FLAG, `${reason}\n`);
  try {
    mkdirSync(join(WORKER_FLAG, '..'), { recursive: true });
    writeFileSync(WORKER_FLAG, `${reason}\nrestart: see ~/shin/mac/DEPLOY.md\n`);
  } catch {}
  await withState(owner, (st) => addLog(st, now, `checker STOPPED: ${reason}`));
  log(`checker STOPPED (${posted ? 'notice posted on the page, ' : 'NOTICE NOT POSTED, '}cost ${s.cost.toFixed(4)} USD): ${reason}`);
  return { posted, cost: s.cost };
}
