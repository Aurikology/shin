#!/usr/bin/env node
/**
 * no-blind-git-add -- PreToolUse guard on Bash / PowerShell.
 *
 * Blocks the catch-all stage: `git add -A`, `git add .`, `git add -u`, and
 * `git commit -a`. Explicit paths are always allowed, and so is `git add -p`.
 *
 * WHY THIS EXISTS, and it is one incident rather than a theory. 2026-09-03, this
 * repo, roughly forty minutes after it was created: one session was writing the
 * operating docs while a second session was building `spine/` in the same working
 * tree. The first session ran `git add -A` to commit four documents. It swept in
 * thirteen of the other session's TypeScript files mid-write, pushed them to the
 * shared remote under a commit message that said "operating docs", and left two
 * more files plus a test folder uncommitted because they landed seconds later.
 * Nothing was destroyed. What was lost was the truth of the history, and it could
 * not be repaired without a force push onto a remote a second person can pull.
 *
 * The general form: a catch-all stage is a claim that you know everything in the
 * tree, and in a repo where more than one session works at once that claim is
 * false by default. Naming the paths is not overhead here, it is the only way the
 * commit can mean what its message says.
 *
 * No bypass flag, on purpose. `git status --short` shows you what is there and
 * `git add <path> <path>` is never more than a few words longer.
 *
 * Blocking protocol: exit 2 with the reason on stderr, which is the version-stable
 * PreToolUse contract. Any internal error exits 0: a guard must never wedge a
 * session.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/*
 * Each pattern stops at a command separator (`;` `|` `&` newline) so that a later,
 * unrelated command on the same line cannot be glued onto an earlier `git add`.
 */

/** `git add -A`, `--all`, `-u`, `--update`, and combined short flags containing them. */
const ADD_ALL_FLAG =
  /\bgit\b[^\n;|&]*\badd\b[^\n;|&]*(?:--all\b|--update\b|(?<![\w-])-[a-zA-Z]*[Au][a-zA-Z]*\b)/;

/** `git add .` and `git add :/` and `git add *` -- the pathspec forms of the same thing. */
const ADD_ALL_PATHSPEC = /\bgit\b[^\n;|&]*\badd\b\s+(?:--\s+)?(?:\.|:\/|\*)(?=\s|$|;|\||&)/;

/**
 * `git commit -a` / `-am`. Matches a combined short flag containing `a`, so `-am` is
 * caught and `-m` is not. `--amend` is excluded by the lookbehind: its second hyphen is
 * preceded by a hyphen, and `--all` is listed separately.
 */
const COMMIT_ALL =
  /\bgit\b[^\n;|&]*\bcommit\b[^\n;|&]*(?:--all\b|(?<![\w-])-[a-zA-Z]*a[a-zA-Z]*\b)/;

/**
 * The classifier as one pure function, so it can be replayed over transcripts later
 * rather than reimplemented and left to drift.
 *
 *   na         not a shell tool, or no catch-all stage in the command
 *   violation  `add` (a catch-all stage) or `commit` (a catch-all commit)
 */
export function classify(tool, cmd) {
  if (tool !== "Bash" && tool !== "PowerShell") return { verdict: "na", klass: null };
  cmd = String(cmd ?? "");
  if (!cmd) return { verdict: "na", klass: null };
  if (ADD_ALL_FLAG.test(cmd) || ADD_ALL_PATHSPEC.test(cmd))
    return { verdict: "violation", klass: "add" };
  if (COMMIT_ALL.test(cmd)) return { verdict: "violation", klass: "commit" };
  return { verdict: "na", klass: null };
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }

  const cmd = String(payload.tool_input?.command ?? "");
  const { verdict, klass } = classify(payload.tool_name ?? "", cmd);
  if (verdict !== "violation") return 0;

  const which =
    klass === "add"
      ? "This stages every changed file in the tree."
      : "This commits every changed tracked file in the tree.";

  process.stderr.write(
    `[no-blind-git-add] BLOCKED. ${which}\n\n` +
      `More than one session works in this repo at once. On 2026-09-03 a catch-all\n` +
      `stage swept thirteen files of another session's half-written code into a commit\n` +
      `that said it was documentation, and pushed it to the shared remote.\n\n` +
      `Do this instead:\n` +
      `  git status --short           # see what is actually there\n` +
      `  git add <path> <path> ...    # name the files this commit is about\n\n` +
      `\`git add -p\` is fine. There is no bypass flag.\n`,
  );
  return 2;
}

/* Run only when invoked as the hook. Imported by the selftest, it stays inert. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let code = 0;
  try {
    code = main();
  } catch {
    code = 0; // a guard must never wedge a session
  }
  process.exit(code);
}
