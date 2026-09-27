#!/usr/bin/env node
/**
 * selftest -- runs every hook classifier in this repo against its cases.
 *
 * A green selftest is NOT proof a hook works. Measured in the agent repo 2026-08-26:
 * a selftest reported 39/39 green while the hook it covered was wrongly blocking a
 * legitimate command, because that case was not in the suite. So after touching a
 * hook, run this AND fire the hook for real in the same session: one command that
 * must be blocked, one that must pass. Then add the live case here, so the suite
 * grows from what actually happened rather than from imagination.
 *
 *   node .claude/hooks/selftest.mjs
 */
import { classify } from "./no-blind-git-add.mjs";
import { looksLikeRuling } from "./ruling-capture.mjs";

const CASES = [
  // [tool, command, expected verdict, note]
  ["Bash", "git add -A", "violation", "the exact command that caused the incident"],
  ["Bash", "git add --all", "violation", "long form"],
  ["Bash", "git add .", "violation", "pathspec form"],
  ["Bash", "git add -u", "violation", "sweeps every tracked change"],
  ["Bash", "git add -A && git commit -m x", "violation", "buried in a chain"],
  ["Bash", "cd /c/shin && git add -A", "violation", "after a cd"],
  ["Bash", "git -C /c/shin add -A", "violation", "with -C"],
  ["Bash", "git commit -am 'x'", "violation", "combined short flag containing a"],
  ["Bash", "git commit -a", "violation", "bare -a"],
  ["PowerShell", "git add .", "violation", "same rule on the other shell"],

  ["Bash", "git add CLAUDE.md NOW.md", "na", "explicit paths, the clean route"],
  ["Bash", "git add docs/decisions.md", "na", "one path"],
  ["Bash", "git add -p", "na", "interactive staging is deliberate, not blind"],
  ["Bash", "git commit -m 'x'", "na", "-m has no a"],
  ["Bash", "git commit --amend --no-edit", "na", "amend is not --all"],
  ["Bash", "git status --short", "na", "read only"],
  ["Bash", "git diff --stat", "na", "read only"],
  ["Bash", "git log --oneline | head -5", "na", "read only"],
  ["Bash", "npm add -A", "na", "not git"],
  ["Read", "git add -A", "na", "not a shell tool"],
  ["Bash", "git status --short; git add CLAUDE.md", "na", "separator is respected"],
];

let pass = 0;
const failures = [];
for (const [tool, cmd, expected, note] of CASES) {
  const got = classify(tool, cmd).verdict;
  if (got === expected) pass += 1;
  else failures.push(`  ${tool}: ${cmd}\n    expected ${expected}, got ${got}  (${note})`);
}

console.log(`no-blind-git-add: ${pass}/${CASES.length}`);
if (failures.length) {
  console.log("FAILURES:");
  console.log(failures.join("\n"));
}

/*
 * ruling-capture cases. Matching is strong-phrase only (narrowed 2026-09-27,
 * Jamin: "no solution may add credit cost or per-task complexity") -- bare
 * always/never/should/must/don't/we-will were dropped because they fire on
 * ordinary one-off prompts, not standing rulings, and would inject extra
 * context into nearly every turn.
 */
const RULING_CASES = [
  // [prompt, expected boolean, note]
  ["from now on typed search should only use our catalogue", true, "from now on"],
  [
    "i've already told you before to switch to gitlab for communication, not notion",
    true,
    "i've already told you, and switch to",
  ],
  ["from now on never show the price math", true, "from now on, even with never elsewhere in the sentence"],
  ["there seems to be a communication problem, why are you still thinking about gemini", true, "his 09-26 correction, silent before 2026-09-27"],
  ["why do you still think we use gemini, even after all the work done yesturday", true, "his 09-27 correction, silent before 2026-09-27"],
  ["why is the scan slow", false, "a why-question with no still"],

  ["what does the barcode route return?", false, "an ordinary question"],
  ["run the tests", false, "an ordinary task"],
  ["how many free scans are there", false, "an ordinary question"],
  ["never show the price math", false, "bare never, one-off ask about this task, not a standing rule"],
  ["we will launch under Shin", false, "bare we-will, dropped: fires on ordinary prompts"],
  [
    "<task-notification>worker report: from now on we cache every lookup</task-notification>",
    false,
    "harness wrapper quotes a worker's report, not Jamin",
  ],
  [
    '<cross-session-message from="mac">switch to the new deploy script</cross-session-message>',
    false,
    "harness wrapper quotes a cross-session relay, not Jamin",
  ],
];

let rulingPass = 0;
const rulingFailures = [];
for (const [prompt, expected, note] of RULING_CASES) {
  const got = looksLikeRuling(prompt);
  if (got === expected) rulingPass += 1;
  else rulingFailures.push(`  "${prompt}"\n    expected ${expected}, got ${got}  (${note})`);
}

console.log(`ruling-capture: ${rulingPass}/${RULING_CASES.length}`);
if (rulingFailures.length) {
  console.log("FAILURES:");
  console.log(rulingFailures.join("\n"));
}

if (failures.length || rulingFailures.length) {
  process.exit(1);
}

console.log("all green. Now fire it live, both ways, before believing it.");
