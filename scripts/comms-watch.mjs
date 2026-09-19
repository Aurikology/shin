#!/usr/bin/env node
/**
 * comms-watch: prints one line when the other person pushes to GitLab.
 *
 * WHY. Jamin, 2026-09-19, wanted to be told when Aurik pushes or leaves a message on
 * GitLab (the board itself stays on Notion, CLAUDE.md WHO IS WORKING ON WHAT). Nothing wakes a session when a push
 * lands, and polling with a model costs credits every time. This does the polling
 * with git alone, so it costs nothing, and prints only when there is something to
 * read, so a session that runs it in the background is woken only then.
 *
 * WHAT IT DOES. Every INTERVAL seconds: `git ls-remote` for the branch head (no
 * local writes, one round trip). When the head moved, fetches, then prints one line
 * per new commit whose author name or email matches WATCH_AUTHOR (default `aurik`),
 * with any comms/messages files that commit touched. Commits by anyone else are
 * silent: they are this side's own.
 *
 * ENV. WATCH_AUTHOR (regex, case-insensitive), INTERVAL (seconds, default 30),
 * REMOTE (origin), BRANCH (main), SINCE (start from this commit instead of the
 * current remote head; for testing), ONCE=1 (one pass, then exit; for testing).
 */
import { execFileSync } from "node:child_process";

const REMOTE = process.env.REMOTE || "origin";
const BRANCH = process.env.BRANCH || "main";
const INTERVAL = Math.max(5, Number(process.env.INTERVAL) || 30) * 1000;
const WHO = new RegExp(process.env.WATCH_AUTHOR || "aurik", "i");
const ONCE = process.env.ONCE === "1";
const MAX_LINES = 8;

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] }).trim();

const remoteHead = () => git("ls-remote", REMOTE, `refs/heads/${BRANCH}`).split(/\s+/)[0];

/** Pure: turn `git log` output into the lines to print. */
export function linesFor(logText, who = WHO) {
  const out = [];
  for (const rec of logText.split("\x1e").map((r) => r.trim()).filter(Boolean)) {
    const [sha, name, email, subject, ...files] = rec.split("\n");
    if (!who.test(`${name} ${email}`)) continue;
    const comms = files.filter((f) => f.startsWith("comms/messages/"));
    out.push(`AURIK ${sha.slice(0, 7)} ${subject}` + (comms.length ? `  [message: ${comms.join(", ")}]` : ""));
  }
  return out;
}

function newCommits(from, to) {
  const fmt = "%x1e%H%n%an%n%ae%n%s";
  try {
    return git("log", `--format=${fmt}`, "--name-only", `${from}..${to}`);
  } catch {
    // `from` is not an ancestor (history rewritten): look at the latest few instead.
    return git("log", `--format=${fmt}`, "--name-only", "-10", to);
  }
}

async function main() {
  let last = process.env.SINCE || remoteHead();
  let failures = 0;
  for (;;) {
    try {
      const head = remoteHead();
      failures = 0;
      if (head && head !== last) {
        git("fetch", "--quiet", REMOTE, BRANCH);
        const lines = linesFor(newCommits(last, head));
        for (const l of lines.slice(0, MAX_LINES)) console.log(l);
        if (lines.length > MAX_LINES) console.log(`AURIK ... and ${lines.length - MAX_LINES} more commits`);
        last = head;
      }
    } catch (e) {
      failures += 1;
      // One line per outage, not one per poll: a dead network must not wake anyone repeatedly.
      if (failures === 5) console.log(`WATCH ERROR could not reach ${REMOTE} five times running: ${String(e.message).split("\n")[0]}`);
    }
    if (ONCE) return;
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
