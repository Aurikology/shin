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
import { classify as classifyDestructive } from "./destructive-guard.mjs";

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

// The model judge's queue: every prompt queues a judge job (dry run, scratch queue, so no real
// claude -p starts and no real pending ruling is consumed); a pending ruling is delivered once.
{
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, readdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const hook = join(dirname(fileURLToPath(import.meta.url)), "ruling-capture.mjs");
  const q = mkdtempSync(join(tmpdir(), "ruling-queue-selftest-"));
  const env = { ...process.env, RULING_JUDGE_DRYRUN: "1", RULING_QUEUE_DIR: q };
  const run = (prompt, session_id) =>
    spawnSync(process.execPath, [hook], { input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt, session_id }), encoding: "utf8", env }).stdout || "";
  const jobs = () => readdirSync(q).filter((n) => n.endsWith(".job")).length;
  const cases = [];
  run("this plan is so flawed, it doesn't consider all cases", "t");
  cases.push(["a plain-worded correction queues a judge job", jobs() === 1]);
  run("<task-notification>worker: from now on X</task-notification>", "t");
  cases.push(["a harness turn queues nothing", jobs() === 1]);
  writeFileSync(join(q, "2026-01-01T00-00-00Z.json"), JSON.stringify({ status: "pending", ts: "2026-01-01T00:00:00Z", prompt: "why are you still doing X", ruling: "X is not the direction", repo: "shin" }));
  cases.push(["a pending ruling is delivered on the next prompt", run("ok", "a").includes("X is not the direction")]);
  cases.push(["and only once", !run("ok", "b").includes("X is not the direction")]);
  writeFileSync(join(q, "fresh.json"), JSON.stringify({ status: "pending", ts: new Date().toISOString(), sessionId: "heard", prompt: "stop doing Y", ruling: "Y is out", repo: "shin" }));
  cases.push(["a fresh ruling is not handed to a session that did not hear it", !run("ok", "someone-else").includes("Y is out")]);
  cases.push(["the session that heard it gets it", run("ok", "heard").includes("Y is out")]);
  for (const [name, ok] of cases) {
    if (ok) rulingPass += 1;
    else rulingFailures.push(`  judge queue: ${name}`);
  }
  console.log(`ruling-judge queue: ${cases.filter((c) => c[1]).length}/${cases.length}`);
}

/*
 * destructive-guard cases. Rule (d) needs a real directory on disk to lstat -- built here
 * in the OS temp dir, never in this repo, and never deleted by anything but the selftest's
 * own cleanup. classify() only ever reads (lstatSync/readdirSync); it does not delete.
 */
let destructivePass = 0;
const destructiveFailures = [];
{
  const { mkdtempSync, mkdirSync, symlinkSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const scratch = mkdtempSync(join(tmpdir(), "destructive-guard-selftest-"));
  // A stand-in for the incident: a "temp copy" directory whose 2nd level holds a junction
  // pointing at some other real directory -- exactly the shape that destroyed node_modules.
  const linkedCopy = join(scratch, "linked-copy");
  const realTarget = join(scratch, "real-target");
  mkdirSync(join(linkedCopy, "sub"), { recursive: true });
  mkdirSync(realTarget, { recursive: true });
  symlinkSync(realTarget, join(linkedCopy, "sub", "app"), "junction");
  // A clean temp copy with no links anywhere -- must be allowed to delete.
  const cleanCopy = join(scratch, "clean-copy");
  mkdirSync(join(cleanCopy, "sub"), { recursive: true });

  const DESTRUCTIVE_CASES = [
    // [tool, command, expected verdict, expected rule, note, opts]
    ["Bash", "rm -rf node_modules", "violation", "a", "the exact shape of the incident, bash"],
    ["Bash", "rm -rf ./frontend/node_modules", "violation", "a", "node_modules nested in a path"],
    ["PowerShell", "Remove-Item -Recurse -Force node_modules", "violation", "a", "PowerShell spelling"],
    ["PowerShell", "Remove-Item -Recurse .\\app\\node_modules", "violation", "a", "PowerShell, nested"],
    ["Bash", "rimraf node_modules", "violation", "a", "rimraf is always recursive"],
    ["Bash", "rmdir /s /q node_modules", "violation", "a", "cmd.exe rmdir /s, run from Bash"],
    ["PowerShell", "rd /s /q app\\node_modules", "violation", "a", "cmd.exe rd /s, run from PowerShell"],
    ["Bash", "node -e \"require('fs').rmSync('node_modules', {recursive: true})\"", "violation", "a", "fs.rmSync inside node -e"],
    ["Bash", "mklink /J node_modules ..\\real\\node_modules", "violation", "b", "junction named node_modules"],
    ["Bash", "ln -s /real/node_modules ./node_modules", "violation", "b", "symlink pointing at node_modules"],
    ["PowerShell", "New-Item -ItemType Junction -Path node_modules -Target ..\\real\\node_modules", "violation", "b", "New-Item junction"],
    ["Bash", "rm -rf app/data", "violation", "c", "recursive delete of a Shin data folder"],
    ["PowerShell", "Remove-Item -Recurse app\\data\\photos", "violation", "c", "PowerShell, photos under data"],
    ["Bash", "mv app/data /tmp/backup", "violation", "c", "move, not delete, is still rule c"],
    ["Bash", "rm -rf /Users/shin/shin/app/data", "violation", "c", "an absolute Mac path is a target, not a Windows /x flag"],
    ["Bash", "rmdir /s /q C:\\shin\\app\\data", "violation", "c", "real Windows /s /q flags are still skipped, the path is not"],
    ["Bash", "git clean -xdf", "violation", "e", "git clean -x deletes ignored files"],
    ["PowerShell", "git clean -fX", "violation", "e", "capital -X, combined with -f"],
    [
      "Bash",
      `rm -rf "${linkedCopy}"`,
      "violation",
      "d",
      "the incident itself: recursive delete of a dir with a junction 2 levels down",
    ],
    [
      "Bash",
      "rm -rf shin-store-photos",
      "violation",
      "c",
      "SHIN_DATA_DIR set, target is under it though not named data/photos",
      { repoRoot: scratch, dataDirEnv: join(scratch, "shin-store-photos").slice(0, -"-photos".length) },
    ],

    ["Bash", "npm ci", "na", null, "the documented safe alternative"],
    ["Bash", "git worktree remove ./worktrees/lane-y", "na", null, "worktree remove is allowed"],
    ["Bash", `rm -rf "${cleanCopy}"`, "na", null, "a temp copy with no links anywhere is allowed", { repoRoot: scratch }],
    ["Bash", "rm file.txt", "na", null, "single file, no recursive flag"],
    ["Bash", "git clean -n", "na", null, "dry run, no -x"],
    ["Bash", "git status", "na", null, "read only"],
    ["Bash", "mv build/output dist/output", "na", null, "move with no data folder involved"],
    ["Bash", "ln -s /some/file ./shortcut", "na", null, "symlink unrelated to node_modules"],
  ];

  for (const [tool, cmd, expected, expectedRule, note, opts] of DESTRUCTIVE_CASES) {
    const got = classifyDestructive(tool, cmd, opts || {});
    const ok = got.verdict === expected && (expected === "na" || got.rule === expectedRule);
    if (ok) destructivePass += 1;
    else
      destructiveFailures.push(
        `  ${tool}: ${cmd}\n    expected ${expected}${expectedRule ? "/" + expectedRule : ""}, got ${got.verdict}${got.rule ? "/" + got.rule : ""}  (${note})`,
      );
  }

  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {}
}

console.log(`destructive-guard: ${destructivePass}/${destructivePass + destructiveFailures.length}`);
if (destructiveFailures.length) {
  console.log("FAILURES:");
  console.log(destructiveFailures.join("\n"));
}

if (failures.length || rulingFailures.length || destructiveFailures.length) {
  process.exit(1);
}

console.log("all green. Now fire it live, both ways, before believing it.");
