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
import { decide } from "./notion-heartbeat.mjs";

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
// notion-heartbeat: [tool, command, state, minutes since start, reminds?, note]
const M = 60_000;
const T0 = 1_000_000_000;
const HB = [
  ["Edit", "", null, 0, true, "first edit with no Notion write: claim first"],
  ["Read", "", null, 0, false, "reading never reminds"],
  ["Bash", "git status --short", null, 0, false, "read-only shell never reminds"],
  ["Edit", "", { lastNotion: T0, lastNag: null }, 19, false, "19 minutes: still fresh"],
  ["Edit", "", { lastNotion: T0, lastNag: null }, 20, true, "20 minutes: refresh"],
  ["Bash", "git commit -F m.txt -- a.ts", { lastNotion: T0, lastNag: null }, 45, true, "a commit counts as work"],
  ["Edit", "", { lastNotion: T0, lastNag: T0 + 21 * M }, 24, false, "reminded 3 minutes ago: quiet"],
  ["Bash", "git pull && git push origin main", { lastNotion: T0, lastNag: T0 + 9 * M }, 10, true, "push always reminds, even inside the nag gap"],
  ["Bash", "git push origin main", { lastNotion: T0 + 9 * M, lastNag: null }, 10, false, "Notion written a minute before the push"],
  ["mcp__claude_ai_Notion__notion-update-page", "", null, 0, false, "a Notion write is recorded, not reminded"],
  ["mcp__notion__notion-fetch", "", null, 0, false, "a Notion read is not a write and not work"],
];
let hbPass = 0;
for (const [tool, cmd, state, mins, reminds, note] of HB) {
  const got = decide(tool, cmd, state, T0 + mins * M).message !== null;
  if (got === reminds) hbPass += 1;
  else failures.push(`  notion-heartbeat ${tool} ${cmd} at ${mins} min: expected ${reminds}, got ${got}  (${note})`);
}
const afterWrite = decide("mcp__claude_ai_Notion__notion-update-page", "", null, T0).state;
if (afterWrite.lastNotion === T0) hbPass += 1;
else failures.push("  notion-heartbeat: a Notion write did not record its time");
console.log(`notion-heartbeat: ${hbPass}/${HB.length + 1}`);
if (failures.length) {
  console.log("FAILURES:");
  console.log(failures.join("\n"));
  process.exit(1);
}

console.log("all green. Now fire it live, both ways, before believing it.");
