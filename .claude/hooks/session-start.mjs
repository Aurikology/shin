#!/usr/bin/env node
/**
 * session-start -- does rule 1 automatically, instead of hoping a session remembers.
 *
 * WHY. CLAUDE.md opens with two instructions that every session is supposed to
 * follow before doing anything: *"At session start, read `notes/catch-up.md`"*,
 * and the WHO IS WORKING ON WHAT rule 1, *"pull the code, read this page. Needs
 * attention first, then Working on now."*
 *
 * Neither was enforced. Measured on 2026-09-19: six items Jamin wrote on 09-14
 * sat unread for five days, and two of them were fixed within the hour once
 * somebody finally read them. A rule that gates a habit does not hold as prose
 * -- the same finding that produced the notion-heartbeat hook beside this one,
 * which covers rule 3 (stay alive) but not rule 1 (start).
 *
 * WHAT IT DOES. On SessionStart it reads `notes/catch-up.md` and puts into the
 * session's context, before the human has typed anything:
 *   - every **To do** bullet from a day whose **Read by** does not name this
 *     machine's git user, newest first;
 *   - how far behind `origin/main` this checkout was at its last fetch;
 *   - a reminder to claim the work on the shared page (rule 2).
 *
 * WHAT IT DOES NOT DO, deliberately:
 *   - No network. No `git fetch`, no Notion call. A session must not wait on
 *     the network to start, and the Mac's 30-second poll already covers the
 *     freshness case. "Behind at last fetch" is stated as exactly that.
 *   - No writing. It never marks anything read; only a session that has
 *     actually told its human may add a Read by line, and this hook cannot
 *     know whether that happened.
 *   - It never blocks. Any internal error exits 0 silently, like the heartbeat
 *     beside it: a reminder that wedges a session is worse than no reminder.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Days to look back through. Older than this is history, not a handover. */
const RECENT_DAYS = 6;

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function quiet(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** The name this machine commits under, which is what a Read by line carries. */
function me() {
  const name = quiet(
    () => execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim(),
    '',
  );
  return name || null;
}

/**
 * How far behind the last-fetched origin/main this checkout is.
 *
 * `rev-list` against the stored remote ref, never a fetch: this is the number
 * as of whenever someone last talked to GitLab, and the caller says so rather
 * than presenting a stale count as current.
 */
function behindCount() {
  const out = quiet(
    () => execFileSync('git', ['rev-list', '--count', 'HEAD..origin/main'], { cwd: root, encoding: 'utf8' }),
    null,
  );
  if (out === null) return null;
  const n = Number(out.trim());
  return Number.isFinite(n) ? n : null;
}

/** Splits catch-up.md into its dated entries, newest first (the file's own order). */
function entries(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let current = null;
  for (const line of lines) {
    const head = /^##\s+(\d{4}-\d{2}-\d{2})(.*)$/.exec(line);
    if (head) {
      if (current) out.push(current);
      current = { date: head[1], title: `${head[1]}${head[2]}`, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) out.push(current);
  return out;
}

/** The bullets under a named `###` section of one entry. */
function section(entry, name) {
  const out = [];
  let inside = false;
  for (const line of entry.lines) {
    if (/^###\s+/.test(line)) {
      inside = new RegExp(`^###\\s+${name}\\s*$`, 'i').test(line);
      continue;
    }
    if (inside) out.push(line);
  }
  return out;
}

function main() {
  let text;
  try {
    text = readFileSync(join(root, 'notes', 'catch-up.md'), 'utf8');
  } catch {
    return; // Not this repo, or the file moved. Say nothing.
  }

  const who = me();
  const recent = entries(text).slice(0, RECENT_DAYS);
  const unread = recent.filter((e) => {
    if (!who) return true;
    const read = section(e, 'Read by').join(' ');
    return !read.toLowerCase().includes(who.toLowerCase().split(' ')[0]);
  });

  const parts = [];
  parts.push('SESSION START, from .claude/hooks/session-start.mjs. CLAUDE.md rule 1 says to read');
  parts.push('notes/catch-up.md before doing anything, so it has been read for you.');
  parts.push('');

  const behind = behindCount();
  if (behind === null) {
    parts.push('- Behind origin/main: unknown (no origin/main ref here). Pull before you start.');
  } else if (behind > 0) {
    parts.push(`- **${behind} commit(s) behind origin/main as of the LAST FETCH** (no fetch was run`);
    parts.push('  here -- this hook does no network). Pull before you start; the cofounder pushes often.');
  } else {
    parts.push('- Level with origin/main as of the last fetch. A fetch still has not been run this session.');
  }
  parts.push('');

  if (unread.length === 0) {
    parts.push(`- No catch-up entry in the last ${RECENT_DAYS} is missing a Read by line for ${who ?? 'you'}.`);
  } else {
    parts.push(`- **${unread.length} catch-up entr(y/ies) not yet marked read by ${who ?? 'this machine'}:**`);
    for (const e of unread) {
      parts.push(`  - ${e.title.trim()}`);
      const todo = section(e, 'To do').filter((l) => /^\s*[-*]\s+\S/.test(l));
      for (const t of todo.slice(0, 6)) parts.push(`    ${t.trim()}`);
      if (todo.length > 6) parts.push(`    ...and ${todo.length - 6} more To do bullet(s) in that entry.`);
    }
    parts.push('');
    parts.push('  Tell your human every To do under their name in plain words, then add them to that');
    parts.push('  entry\'s Read by. Only add it once you have actually told them.');
  }

  parts.push('');
  parts.push('- **Rule 2, claim before you edit.** Add a line under Working on now on the shared page');
  parts.push('  (Shin: who is working on what) naming the parts of the app you are about to touch, then');
  parts.push('  read it again: if another line covers the same part and started earlier, yours gives way.');
  parts.push('  Two sessions edited the same path on 2026-09-17/18 because this step was skipped.');

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: parts.join('\n'),
      },
    }),
  );
}

try {
  main();
} catch {
  // Never wedge a session over a reminder.
}
process.exit(0);
