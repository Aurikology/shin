#!/usr/bin/env node
/**
 * ruling-judge -- the model half of ruling capture. Not a hook itself: ruling-capture.mjs
 * starts it detached on every prompt he types, and sessions call its conflicts mode.
 * Kept byte-identical in C:\agent and C:\shin.
 *
 * WHY. Measured 2026-09-27 (docs/decision-capture-2026-09-27.md in the agent repo): over his
 * 1,084 typed messages a clean labeller found 320 standing rulings and the word-pattern list
 * caught 32 (10%). Every project that catches decisions well has a model read each message,
 * told to lean toward catching (mem0: "When in doubt, extract. A slightly redundant memory is
 * far less costly than a missing one."), and states its reasoning before its verdict (Graphiti
 * issue #1666: a contradiction judge went 7/15 to 14/15 on that change alone).
 *
 *   node ruling-judge.mjs classify <job.json>
 *       job = {prompt, context, heardIn, ts, sessionId}. Runs one clean `claude -p` and, when
 *       the message sets a standing ruling, writes a pending item into
 *       <heardIn>/.claude/state/ruling-queue/, which ruling-capture delivers on the next prompt
 *       of any session in that repo. Every verdict is appended to log.jsonl there, so the
 *       weekly test can score the judge.
 *   node ruling-judge.mjs conflicts --register <RULINGS.md> --ruling "<text>"
 *       Lists the entries a new ruling contradicts, each with the sentence and the reasoning.
 *       Leans the other way from classify: overwriting a ruling that still holds is the failure
 *       Letta's own tests measured (30 of 60 wrong), so "unsure" is not a conflict.
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const MODEL = "sonnet";

export const CLASSIFY_INSTRUCTIONS = `You read one message a founder typed to his AI assistant. The assistant runs his job applications, school work and calendar from a repo called "agent", and his startup "Shin" (a price-scanning app, co-founded with Aurik) from a repo called "shin".

Decide "standing": true when the message sets, changes, reverses or corrects a LASTING rule, preference, policy or direction: how the assistant or its sessions should work from now on, how a product should work, or how his applications, school work or calendar are handled beyond the single task in front of it. A correction counts when it implies a lasting direction, even asked as a question ("why are you still doing X" means X is not the direction; "this plan doesn't consider all cases" means plans must). So does a complaint about how the assistant did its work: about the style or length of what it wrote, about it doing something he did not ask for or skipping something he expected, about it asking him what it could have decided, or about a mistake he has seen before; the lasting direction is the opposite of what he complained about. A short reply like "yes" counts when it approves a proposal, in the assistant's previous message, that itself sets a lasting direction. A one-off task, a question, a status check, or approval of one specific action is false. A pasted block is context, not his words.

When in doubt, mark it standing: a ruling recorded twice costs a minute, a ruling missed costs him a correction.

State the ruling at the FULL scope of his words. Never narrow it to the smallest change that would satisfy it; keep every specific noun, number and qualifier he used.

Return ONLY one JSON object, reasoning first:
{"reasoning": "<two sentences>", "standing": true|false, "repo": "agent"|"shin"|"other"|"general", "ruling": "<if standing, one or two lines; else empty>"}`;

export const CONFLICTS_INSTRUCTIONS = `Read the rulings register file named below in full. A new ruling has just been made. List every entry (a "### " heading) that the new ruling contradicts: an entry conflicts only when a sentence in it and the new ruling cannot both be followed. A different scope, a narrower special case, a different time period, or an entry the new ruling only adds to is NOT a conflict; when unsure, it is not a conflict. Exception: an entry that is the assistant's own call, marked "Claude's, unconfirmed" or similar, never outranks the founder's words; if it disagrees with the new ruling in any way, list it as a conflict. Also list, marked "narrower", an entry that states LESS than the new ruling on the same point, so that it would need rewriting to hold it. An entry that already holds the new ruling, or holds it with more detail, is neither: leave it out.

Return ONLY a JSON array, reasoning before verdict in each object, [] when there is none:
[{"heading": "<exact ### heading>", "sentence": "<the sentence, verbatim>", "reasoning": "<one sentence>", "verdict": "conflict"|"narrower"}]`;

function claude(prompt, cwd, allowedTools) {
  mkdirSync(cwd, { recursive: true });
  const args = ["-p", "--model", MODEL];
  if (allowedTools) args.push("--allowedTools", allowedTools);
  const r = spawnSync("claude", args, {
    cwd,
    input: prompt,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    timeout: 240_000,
    env: { ...process.env, RULING_JUDGE_CHILD: "1" },
  });
  return String(r.stdout ?? "") + String(r.stderr ?? "");
}

export function parseObject(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export function parseArray(text) {
  const m = String(text).match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export function queueDir(repoRoot) {
  return join(repoRoot, ".claude", "state", "ruling-queue");
}

export function buildClassifyPrompt(job) {
  const ctx = String(job.context ?? "").trim();
  return (
    CLASSIFY_INSTRUCTIONS +
    (ctx ? `\n\nTHE ASSISTANT'S PREVIOUS MESSAGE (context only, last part):\n${ctx.slice(-1500)}` : "") +
    `\n\nHIS MESSAGE:\n${String(job.prompt).slice(0, 6000)}`
  );
}

function classify(jobPath) {
  const job = JSON.parse(readFileSync(jobPath, "utf8"));
  const dir = queueDir(job.heardIn);
  mkdirSync(dir, { recursive: true });
  const out = process.env.RULING_JUDGE_FAKE ?? claude(buildClassifyPrompt(job), join(tmpdir(), "ruling-judge-clean"));
  const v = parseObject(out);
  const record = { ts: job.ts, sessionId: job.sessionId, prompt: String(job.prompt).slice(0, 2000), verdict: v, raw: v ? undefined : out.slice(0, 500) };
  appendFileSync(join(dir, "log.jsonl"), JSON.stringify(record) + "\n");
  if (v?.standing) {
    const name = `${String(job.ts).replace(/[:.]/g, "-")}.json`;
    writeFileSync(join(dir, name), JSON.stringify({ status: "pending", ts: job.ts, sessionId: job.sessionId ?? null, prompt: String(job.prompt).slice(0, 2000), ruling: v.ruling, repo: v.repo, reasoning: v.reasoning }, null, 1));
  }
  try { unlinkSync(jobPath); } catch {}
}

function conflicts(argv) {
  const reg = argv[argv.indexOf("--register") + 1];
  const ruling = argv[argv.indexOf("--ruling") + 1];
  if (!reg || !ruling || !existsSync(reg)) {
    console.error('usage: ruling-judge.mjs conflicts --register <RULINGS.md> --ruling "<text>"');
    process.exit(2);
  }
  const cwd = join(tmpdir(), "ruling-judge-conflicts");
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(cwd, "RULINGS.md"), readFileSync(reg, "utf8"));
  const out = claude(`${CONFLICTS_INSTRUCTIONS}\n\nREGISTER FILE: RULINGS.md (in the current folder)\n\nNEW RULING:\n${ruling}`, cwd, "Read,Grep");
  const arr = parseArray(out);
  if (!arr) {
    console.log("CONFLICT JUDGE GAVE NO ANSWER; check by hand:\n" + out.slice(0, 800));
    process.exit(1);
  }
  if (!arr.length) console.log("no entry contradicts or narrows this ruling");
  for (const c of arr) console.log(`${String(c.verdict).toUpperCase()}: ### ${String(c.heading).replace(/^#+\s*/, "")}\n  "${c.sentence}"\n  why: ${c.reasoning}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "classify") {
    // Detached, so nobody sees stderr: a failure is written down, never swallowed.
    try { classify(rest[0]); } catch (e) {
      try { appendFileSync(join(tmpdir(), "ruling-judge-errors.log"), `${new Date().toISOString()} ${rest[0]} ${e?.stack ?? e}\n`); } catch {}
    }
  }
  else if (mode === "conflicts") conflicts(rest);
  else { console.error("modes: classify <job.json> | conflicts --register <file> --ruling <text>"); process.exit(2); }
}
