#!/usr/bin/env node
/**
 * notion-heartbeat -- PostToolUse reminder to keep the shared Notion page current.
 *
 * WHY. Jamin, 2026-09-14: *"it should be updateing every 20 minutes"*, about the
 * page `Shin: who is working on what` (CLAUDE.md, WHO IS WORKING ON WHAT). A line
 * that is not refreshed looks abandoned to the other person's sessions, and a rule
 * that gates a habit does not hold as prose (SELF-ITERATION PROTOCOL rule 3).
 *
 * WHAT IT DOES. Remembers, per session, when the session last wrote to Notion. When
 * the session does work (an edit, a commit, a push) it adds a reminder to the
 * session's context if:
 *   - it has never written to Notion this session (claim before editing), or
 *   - the last Notion write is 20 minutes old or more, or
 *   - the command is a `git push` and Notion was not written in the last 2 minutes.
 * Reminders are at most one every 5 minutes, except the push reminder. It never
 * blocks anything. A session that only reads is never reminded.
 *
 * WHAT IT CANNOT DO. It runs only when the session uses a tool, so a session sitting
 * idle, or waiting on a long background job, is not reminded. That is why a line is
 * treated as stale only after an hour, not after 20 minutes.
 *
 * Any internal error exits 0 silently: a reminder must never wedge a session.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const REFRESH_MS = 20 * 60 * 1000;
export const NAG_GAP_MS = 5 * 60 * 1000;
export const PUSH_GRACE_MS = 2 * 60 * 1000;

const WORK_TOOLS = /^(Edit|Write|NotebookEdit|MultiEdit)$/;
const SHELL_TOOLS = /^(Bash|PowerShell)$/;
const GIT_COMMIT = /\bgit\b[^\n;|&]*\bcommit\b/;
const GIT_PUSH = /\bgit\b[^\n;|&]*\bpush\b/;

/** True for a tool call that writes to Notion (any Notion connector's naming). */
export function isNotionWrite(tool) {
  return /notion/i.test(tool) && /(update|create|move|duplicate)/i.test(tool);
}

/**
 * Pure decision. `state` is { lastNotion, lastNag } in ms or null.
 * Returns { state, message } where message is null when nothing is said.
 */
export function decide(tool, command, state, now) {
  const s = { lastNotion: state?.lastNotion ?? null, lastNag: state?.lastNag ?? null };
  if (isNotionWrite(tool)) return { state: { ...s, lastNotion: now }, message: null };

  const cmd = typeof command === "string" ? command : "";
  const shell = SHELL_TOOLS.test(tool);
  const push = shell && GIT_PUSH.test(cmd);
  const work = WORK_TOOLS.test(tool) || push || (shell && GIT_COMMIT.test(cmd));
  if (!work) return { state: s, message: null };

  const page = "the Notion page `Shin: who is working on what`";
  if (push && (s.lastNotion === null || now - s.lastNotion > PUSH_GRACE_MS)) {
    return {
      state: { ...s, lastNag: now },
      message: `You just pushed. Update your line on ${page} now: refresh its updated time, or move it to Finished if the task is done (CLAUDE.md, WHO IS WORKING ON WHAT).`,
    };
  }
  if (s.lastNag !== null && now - s.lastNag < NAG_GAP_MS) return { state: s, message: null };
  if (s.lastNotion === null) {
    return {
      state: { ...s, lastNag: now },
      message: `This session is changing files and has not written to ${page}. Read it, then add or refresh your line before going further. No Notion access: tell your human once.`,
    };
  }
  if (now - s.lastNotion >= REFRESH_MS) {
    const mins = Math.floor((now - s.lastNotion) / 60000);
    return {
      state: { ...s, lastNag: now },
      message: `Your line on ${page} was last updated ${mins} minutes ago. Refresh its updated time now (every 20 minutes while working), and check Needs attention while you are there.`,
    };
  }
  return { state: s, message: null };
}

function main() {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const tool = String(input.tool_name ?? "");
    const session = String(input.session_id ?? "unknown").replace(/[^\w-]/g, "_");
    const dir = join(tmpdir(), "shin-notion-heartbeat");
    const file = join(dir, `${session}.json`);
    let state = null;
    try { state = JSON.parse(readFileSync(file, "utf8")); } catch { state = null; }
    const { state: next, message } = decide(tool, input.tool_input?.command, state, Date.now());
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(next));
    if (message) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message },
      }));
    }
  } catch {
    // Silent: a reminder must never wedge a session.
  }
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
