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
 * per new commit by SOMEONE OTHER THAN this machine's git user (see `watcherFor`),
 * with any comms/messages files that commit touched. Your own commits are silent:
 * you already know about those.
 *
 * ENV. WATCH_AUTHOR (regex, case-insensitive; overrides the derived default with
 * a positive match), INTERVAL (seconds, default 30),
 * REMOTE (origin), BRANCH (main), SINCE (start from this commit instead of the
 * current remote head; for testing), ONCE=1 (one pass, then exit; for testing).
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REMOTE = process.env.REMOTE || "origin";
const BRANCH = process.env.BRANCH || "main";
const INTERVAL = Math.max(5, Number(process.env.INTERVAL) || 30) * 1000;
/**
 * Whose commits are worth announcing.
 *
 * WHO "THE OTHER PERSON" IS, IS DERIVED RATHER THAN HARDCODED. This defaulted to
 * the literal `aurik`, which is right on Jamin's machine and backwards on
 * Aurik's: run there it watched for Aurik's own pushes and stayed silent on
 * Jamin's — the exact opposite of the job. The default is now everyone except
 * this machine's `git config user.name`, so one script is correct on both sides
 * with no configuration, and WATCH_AUTHOR still overrides with a positive match.
 *
 * A plain lowercase substring, not a regex built from a person's name: a name is
 * data, and turning data into a pattern means escaping it correctly forever.
 * "Does the author line contain my first name" is the whole question.
 *
 * With no user.name configured it announces EVERYTHING rather than nothing. A
 * watcher that says too much gets noticed and fixed; one that says nothing looks
 * exactly like a quiet day — which is how the Windows entry-point bug below
 * survived.
 */
export function watcherFor(watchAuthor, me) {
  if (watchAuthor) {
    const re = new RegExp(watchAuthor, "i");
    return (nameEmail) => re.test(nameEmail);
  }
  const first = (me || "").trim().split(/\s+/)[0].toLowerCase();
  if (!first) return () => true;
  return (nameEmail) => !nameEmail.toLowerCase().includes(first);
}

function meName() {
  try {
    return execFileSync("git", ["config", "user.name"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const WHO = watcherFor(process.env.WATCH_AUTHOR, meName());
const ONCE = process.env.ONCE === "1";
const MAX_LINES = 8;

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] }).trim();

const remoteHead = () => git("ls-remote", REMOTE, `refs/heads/${BRANCH}`).split(/\s+/)[0];

/** Pure: turn `git log` output into the lines to print. */
export function linesFor(logText, who = WHO) {
  const match = typeof who === "function" ? who : (t) => who.test(t);
  const out = [];
  for (const rec of logText.split("\x1e").map((r) => r.trim()).filter(Boolean)) {
    const [sha, name, email, subject, ...files] = rec.split("\n");
    if (!match(`${name} ${email}`)) continue;
    const comms = files.filter((f) => f.startsWith("comms/messages/"));
    // The AUTHOR's own name, never a hardcoded one. This said "AURIK" on every
    // line, so run from Aurik's machine it announced Jamin's pushes as Aurik's.
    const label = ((name || "?").trim().split(/\s+/)[0] || "?").toUpperCase();
    out.push(`${label} ${sha.slice(0, 7)} ${subject}` + (comms.length ? `  [message: ${comms.join(", ")}]` : ""));
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
        if (lines.length > MAX_LINES) console.log(`... and ${lines.length - MAX_LINES} more commits`);
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

/*
 * `pathToFileURL`, not a hand-built `file://` string.
 *
 * THIS GUARD COULD NEVER FIRE ON WINDOWS, so the watcher did nothing at all on
 * Aurik's machine: it started, matched nothing, and exited 0. Silent success and
 * a dead script are the same thing from the outside, which is why it went
 * unnoticed.
 *
 * `process.argv[1]` there is `C:\dev\shin-main\scripts\comms-watch.mjs`, so the
 * concatenation gives `file://C:\dev\...` while `import.meta.url` is
 * `file:///C:/dev/...` — a different number of slashes, a drive letter the URL
 * form escapes, and backslashes it turns into forward ones. Three reasons it can
 * never be equal, none of which show up on a Mac, where the two forms happen to
 * coincide.
 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
