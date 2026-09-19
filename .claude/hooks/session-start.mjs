#!/usr/bin/env node
/**
 * session-start -- does rule 1 automatically, instead of hoping a session remembers.
 *
 * WHY. CLAUDE.md's WHO IS WORKING ON WHAT rule 1: *"Start. `git pull`, then read
 * `comms/`: messages to you (`comms/messages/*-to-<you>-*` and `*-to-all-*`),
 * then claims (`comms/claims/`). A message to you comes first."* Nothing
 * enforced it. The repo has had a hook for rule 3 since 2026-09-14 and none for
 * rule 1 -- and rule 1 is the one that decides whether a session ever learns
 * what happened while it was away.
 *
 * Measured cost of that gap: six items Jamin wrote on 2026-09-14 went unread
 * for five days, and two of them were fixed within the hour once somebody
 * finally read them.
 *
 * WHAT IT READS. `comms/`, the channel Jamin made the default on 2026-09-19 in
 * place of the Notion page. Messages addressed to this machine's git user or to
 * `all`, then the claims, then any catch-up.md entry still missing a Read by
 * line -- that file is the older channel and is still where the long handovers
 * live, so it is reported last rather than dropped.
 *
 * WHAT IT DOES NOT DO, deliberately:
 *   - No network. No `git fetch`. A session must not wait on the network to
 *     start, and `scripts/comms-watch.mjs` already covers being told about a
 *     push. The behind-count is labelled "as of the last fetch" because that is
 *     what it is; a stale number presented as current is worse than no number.
 *   - No writing. It never deletes a message or marks anything read. Under the
 *     rules the reader deletes a message once it is settled, and a hook cannot
 *     know whether the human was actually told.
 *   - It never blocks. Any internal error exits 0 silently, the same rule
 *     notion-heartbeat.mjs follows: a reminder that wedges a session is worse
 *     than no reminder.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Catch-up days to look back through. Older than this is history, not a handover. */
const RECENT_DAYS = 6;

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function quiet(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Which side of the conversation this machine is, as `comms/` spells it.
 *
 * The filename convention is `jamin` | `aurik` | `all`, so the git user's first
 * name is matched against those rather than used raw. Unknown means every
 * message is shown: over-reporting is the safe direction here.
 */
function whoAmI() {
  const name = quiet(
    () => execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim(),
    '',
  );
  const first = (name.split(/\s+/)[0] || '').toLowerCase();
  return { name: name || null, tag: first === 'jamin' || first === 'aurik' ? first : null };
}

/** Commits behind the LAST-FETCHED origin/main. Never fetches. */
function behindCount() {
  const out = quiet(
    () => execFileSync('git', ['rev-list', '--count', 'HEAD..origin/main'], { cwd: root, encoding: 'utf8' }),
    null,
  );
  const n = out === null ? NaN : Number(out.trim());
  return Number.isFinite(n) ? n : null;
}

function listDir(rel) {
  return quiet(() => readdirSync(join(root, rel)), []);
}

function firstLine(rel, file) {
  const text = quiet(() => readFileSync(join(root, rel, file), 'utf8'), '');
  for (const line of text.split(/\r?\n/)) {
    const t = line.replace(/^#+\s*/, '').trim();
    if (t) return t;
  }
  return '(empty)';
}

/** catch-up.md entries, newest first, that carry no Read by line for this user. */
function unreadCatchUp(firstName) {
  const text = quiet(() => readFileSync(join(root, 'notes', 'catch-up.md'), 'utf8'), null);
  if (text === null) return [];
  const lines = text.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    const head = /^##\s+(\d{4}-\d{2}-\d{2})(.*)$/.exec(line);
    if (head) {
      if (cur) out.push(cur);
      cur = { title: `${head[1]}${head[2]}`, body: [] };
      continue;
    }
    if (cur) cur.body.push(line);
  }
  if (cur) out.push(cur);

  return out.slice(0, RECENT_DAYS).filter((e) => {
    if (!firstName) return true;
    let inRead = false;
    const read = [];
    for (const l of e.body) {
      if (/^###\s+/.test(l)) {
        inRead = /^###\s+Read by\s*$/i.test(l);
        continue;
      }
      if (inRead) read.push(l);
    }
    return !read.join(' ').toLowerCase().includes(firstName.toLowerCase());
  });
}

function main() {
  const { name, tag } = whoAmI();
  const firstName = name ? name.split(/\s+/)[0] : null;
  const parts = [];

  parts.push('SESSION START (.claude/hooks/session-start.mjs). CLAUDE.md rule 1 says to pull and read');
  parts.push('comms/ before doing anything; comms/ has been read for you. Nothing here was marked read.');
  parts.push('');

  const behind = behindCount();
  if (behind === null) {
    parts.push('- Behind origin/main: unknown (no origin/main ref). PULL BEFORE YOU START.');
  } else if (behind > 0) {
    parts.push(`- **${behind} commit(s) behind origin/main as of the LAST FETCH.** No fetch ran here`);
    parts.push('  (this hook does no network). Pull before you start; the other side pushes often.');
  } else {
    parts.push('- Level with origin/main as of the last fetch. No fetch ran this session.');
  }

  // 1. Messages first, as the rule says.
  const msgs = listDir('comms/messages').filter((f) => f.endsWith('.md'));
  const mine = msgs.filter((f) => !tag || f.includes(`-to-${tag}-`) || f.includes('-to-all-'));
  parts.push('');
  if (mine.length === 0) {
    parts.push(`- No messages in comms/messages for ${tag ?? 'you'} or all.`);
  } else {
    parts.push(`- **${mine.length} message(s) for ${tag ?? 'you'}/all** (a message to you comes first):`);
    for (const f of mine.sort()) parts.push(`  - ${f} — ${firstLine('comms/messages', f)}`);
    parts.push('  The reader deletes a message once it is settled, so leave it until it is.');
  }

  // 2. Then claims, so this session does not take a part someone else holds.
  const claims = listDir('comms/claims').filter((f) => f.endsWith('.md'));
  parts.push('');
  if (claims.length === 0) {
    parts.push('- No open claims in comms/claims.');
  } else {
    parts.push(`- **${claims.length} open claim(s)** — check none covers the part you are about to touch:`);
    for (const f of claims.sort()) parts.push(`  - ${f} — ${firstLine('comms/claims', f)}`);
  }

  parts.push('');
  parts.push('- **Rule 2: write comms/claims/<name>.md and PUSH it before your first edit.** If an');
  parts.push('  earlier claim covers the same part, yours gives way. Two sessions edited the same path');
  parts.push('  on 2026-09-17/18 because this step did not exist yet.');

  // 3. catch-up.md last: the older channel, still where long handovers live.
  const unread = unreadCatchUp(firstName);
  if (unread.length > 0) {
    parts.push('');
    parts.push(`- Also ${unread.length} notes/catch-up.md entr(y/ies) with no Read by line for`);
    parts.push(`  ${firstName ?? 'this machine'} (the older channel; comms/ is the default now):`);
    for (const e of unread) parts.push(`  - ${e.title.trim()}`);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n') },
    }),
  );
}

try {
  main();
} catch {
  // Never wedge a session over a reminder.
}
process.exit(0);
