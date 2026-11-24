// mac/deploy/comms-forward.mjs
//
// WHY (Jamin, 2026-11-24, "y"): Aurik asks the Mac for work (iPhone builds) by pushing a message file to
// comms/messages/ in this repo. No Mac session reads that folder: Mac sessions take work from the PC-Mac
// mailbox. So Aurik's build 11, 12 and 13 asks (11-20 to 11-23) sat unread until a PC session relayed one.
// The checker already sees every push, so it forwards each NEW "...-to-mac-..." file into the mailbox, where
// the Mac's terminals pick it up like any other job. Never throws: a forwarding fault must not stop a check.
//
// State: ~/.shin-deploy/comms-forward.json { head } = the last origin/main commit already scanned. The first
// run only records the head (nothing old is re-sent). A failed send leaves the head unmoved, so it retries.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, git } from './util.mjs';
import { defaultRunMail, mailboxDir } from './mail-sink.mjs';

const STATE = () => join(PATHS.home, 'comms-forward.json');

/** The paths in a name list that are messages addressed to the Mac. */
export function toMacFiles(names) {
  return names.filter((n) => /^comms\/messages\/[^/]+-to-mac-[^/]*\.md$/i.test(n.trim())).map((n) => n.trim());
}

/** The mailbox send arguments for one forwarded file. Opus lane: the file is free text and may need judgement. */
export function sendArgs(path, commit, content) {
  const name = path.split('/').pop();
  const body =
    `Forwarded automatically by the deploy checker from the shin repo, ${path} (pushed in ${commit.slice(0, 7)}). ` +
    `Aurik wrote it for the Mac. Do what it asks, answer where it asks (usually a comms/messages file for Aurik), ` +
    `and ack this mail with what you did.\n\n---\n\n${content}`;
  return ['send', '--to', 'mac', '--lane', 'opus', '--session', 'aurik-comms', '--subject', `Aurik to Mac: ${name}`, '--body', body];
}

/**
 * Forwards to-Mac files added between the recorded head and `head`. Deps are injectable for tests:
 * listAdded(from, to) -> names, show(commit, path) -> text, runMail(args) -> { code }, load() / save(state).
 * Returns the paths forwarded.
 */
export async function forwardNew(head, deps) {
  const st = deps.load();
  if (!head) return [];
  if (!st.head) {
    deps.save({ head });
    return [];
  }
  if (st.head === head) return [];
  let files;
  try {
    files = toMacFiles(await deps.listAdded(st.head, head));
  } catch (e) {
    // The recorded head is gone (history rewritten) or unreadable: start again from here, loudly, rather than stick.
    deps.log?.(`comms-forward: cannot diff from ${String(st.head).slice(0, 7)} (${e.message}); restarting from ${head.slice(0, 7)}, check comms/messages by hand once`);
    deps.save({ head });
    return [];
  }
  const sent = [];
  for (const f of files) {
    const content = await deps.show(head, f);
    const r = await deps.runMail(sendArgs(f, head, content));
    if (!r || r.code !== 0) {
      deps.log?.(`comms-forward: sending ${f} failed (${String(r?.out ?? '').trim().split('\n').pop()}); will retry next check`);
      return sent; // head stays put, so the next check retries (a resend of an earlier file is possible, never a loss)
    }
    sent.push(f);
    deps.log?.(`comms-forward: forwarded ${f} to the Mac mailbox`);
  }
  deps.save({ head });
  return sent;
}

/** The checker's call: real git, real mailbox. Never throws. */
export async function forwardComms(gitInfo, log) {
  try {
    const dir = mailboxDir();
    await forwardNew(gitInfo?.head, {
      load: () => {
        try {
          return existsSync(STATE()) ? JSON.parse(readFileSync(STATE(), 'utf8')) : {};
        } catch {
          return {};
        }
      },
      save: (s) => writeFileSync(STATE(), JSON.stringify(s) + '\n'),
      listAdded: async (from, to) => (await git(PATHS.stage, ['diff', '--name-only', '--diff-filter=A', `${from}..${to}`, '--', 'comms/messages'])).split('\n').filter(Boolean),
      show: (commit, path) => git(PATHS.stage, ['show', `${commit}:${path}`]),
      runMail: defaultRunMail(dir),
      log,
    });
  } catch (e) {
    log?.(`comms-forward: skipped this check: ${e.message}`);
  }
}
