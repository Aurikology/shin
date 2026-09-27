#!/usr/bin/env node
/**
 * ruling-capture -- UserPromptSubmit hook.
 *
 * WHY THIS EXISTS. docs/decisions.md, "Every push is checked by GitLab, and every
 * prompt that reads like a ruling gets recorded" (2026-09-27): Jamin gave the
 * switch to comms/ over Notion once already, on 2026-09-19, and it never reached
 * this repo -- the switch had to be given a second time on 2026-09-27 before
 * anything changed. A ruling spoken in chat and never written down is a ruling
 * that gets re-broken. This hook does not decide whether a message IS a ruling;
 * it only flags candidates so the session that received one writes it down in
 * the same turn instead of trusting itself to remember.
 *
 * NARROWED 2026-09-27 (Jamin, mid-build, on this exact file): "no solution may
 * add credit cost or per-task complexity." The first pass matched bare `always`,
 * `never`, `should`, `must`, `don't`, and `we will`, which fire on ordinary
 * prompts ("never show the price math" as a one-off ask, not a standing rule)
 * and would have injected extra context into nearly every turn. Matching is now
 * strong-phrase only: phrases that state a standing, forward-looking change
 * ("from now on", "switch to", "i've already told you") rather than an ordinary
 * imperative about one task.
 *
 * WHAT IT DOES NOT DO: it never decides a message IS a ruling (that judgment,
 * and the write to RULINGS.md / docs/decisions.md, is the session's, same
 * turn); it never writes anything itself; it never blocks. Bad or missing
 * stdin, or no `prompt` field: print nothing, exit 0.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Strong ruling phrases only, case-insensitive. Each is a phrase that states a
 * standing, forward-looking change to how Shin works, not an ordinary one-off
 * instruction about the task in front of the session. Kept deliberately short:
 * every prompt not matched here costs nothing extra, so the list stays narrow
 * rather than reaching for coverage.
 */
const RULING_PATTERNS = [
  /from now on/i,
  /going forward/i,
  /switch to/i,
  /no longer/i,
  /instead of/i,
  /stop (using|doing|sending|showing)/i,
  /i've already told you/i,
  /i (decided|changed my mind)/i,
  /my (call|decision)/i,
  // WIDENED 2026-09-27: his corrections arrive as questions, and both of his "why are you
  // still thinking about gemini" turns (09-26, 09-27) passed this list silently, so the
  // ruling behind them was recorded as the smallest change. Backtest over his 1,081 distinct
  // typed prompts: these add 5 fires, all 5 corrections of a standing direction.
  /\bwhy (are|do|did|is|does) (you|we|it|shin)\b[^.?!\n]{0,60}\bstill\b/i,
  /\b(you|we) (are |were )?still (think|thinking|using|use|calling|building|planning)\b/i,
  /\bi (already |have already |'ve )?told you\b/i,
  /\bcommunication problem\b/i,
];

/**
 * Harness wrappers -- task notifications, cross-session relays, system
 * reminders -- quote a WORKER's report or a system message, not Jamin or
 * Aurik. The agent-repo copy of this hook fired on a worker's report because
 * the report's own quoted text happened to contain a ruling-shaped phrase.
 * A prompt wrapped in one of these markers is never a ruling, no matter what
 * it quotes inside.
 */
const HARNESS_WRAPPER = /<task-notification>|<cross-session-message|\[SYSTEM NOTIFICATION|^\s*<system-reminder>/i;

/** Pure classifier, exported so the selftest can replay cases without a subprocess. */
export function looksLikeRuling(prompt) {
  const text = String(prompt ?? '');
  if (!text) return false;
  if (HARNESS_WRAPPER.test(text)) return false;
  return RULING_PATTERNS.some((re) => re.test(text));
}

const CONTEXT_TEXT =
  "[ruling-capture] If this message sets a ruling, record it this turn in RULINGS.md " +
  '(until it exists, docs/decisions.md) with his words and date, and say where. ' +
  'A correction ("why are you still X") rules that X is not the design. Record it at ' +
  'the level of his direction, never as the smallest change that satisfies it, and in ' +
  'the same turn rewrite every active entry it contradicts. Otherwise ignore.';

/* ------------------------------------------------- the model judge (2026-09-27) */

/*
 * The pattern list above caught 32 of the 320 rulings a clean labeller found in Jamin's 1,084
 * typed messages (agent repo, docs/decision-capture-2026-09-27.md). So every prompt is also
 * handed to ruling-judge.mjs, started detached so nobody waits on it (about 8 seconds, a
 * claude -p). What it finds is delivered on the NEXT prompt of any session in this repo on
 * this machine; the pattern list stays as the instant path. Same logic as the agent repo's copy.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Overridable only so the selftest can use a scratch queue and never consume real rulings.
const QUEUE = process.env.RULING_QUEUE_DIR || join(REPO_ROOT, '.claude', 'state', 'ruling-queue');

/** The last text the assistant showed, so a bare "yes" can be read against its proposal. */
export function lastAssistantText(transcriptPath) {
  try {
    const size = statSync(transcriptPath).size;
    const fd = openSync(transcriptPath, 'r');
    const len = Math.min(size, 400_000);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    closeSync(fd);
    for (const line of buf.toString('utf8').split('\n').reverse()) {
      if (!line.includes('"type":"assistant"')) continue;
      try {
        const c = JSON.parse(line).message?.content;
        const text = Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
        if (text.trim()) return text;
      } catch {}
    }
  } catch {}
  return '';
}

/** Pending rulings the judge found in earlier messages; each is handed to one session, once. */
export function takePending(queueDir, sessionId) {
  const items = [];
  let names = [];
  try { names = readdirSync(queueDir).filter((n) => n.endsWith('.json')).sort(); } catch { return items; }
  for (const n of names) {
    const p = join(queueDir, n);
    try {
      const item = JSON.parse(readFileSync(p, 'utf8'));
      if (item.status !== 'pending') continue;
      items.push(item);
      writeFileSync(p, JSON.stringify({ ...item, status: 'delivered', deliveredTo: sessionId ?? null, deliveredAt: new Date().toISOString() }, null, 1));
    } catch {}
  }
  return items;
}

export function pendingContext(items) {
  if (!items.length) return '';
  const list = items
    .map((it, i) => `${i + 1}) ${String(it.ts).slice(0, 16)} his words: "${String(it.prompt).slice(0, 400)}" -> ruling: ${it.ruling} (governs: ${it.repo})`)
    .join('\n');
  return (
    '[ruling-capture] The background judge found standing rulings in earlier messages, not yet recorded:\n' +
    list +
    '\nFor each, before other work: if RULINGS.md does not already hold it at this FULL scope, write it there with the words ' +
    'and date (a ruling that governs the agent repo goes to C:\\agent\\RULINGS.md instead). Then run ' +
    '`node .claude/hooks/ruling-judge.mjs conflicts --register RULINGS.md --ruling "<the ruling>"` and rewrite every entry ' +
    'it lists (old text to docs/decisions.md), then node scripts/checks.mjs. Say in plain words what you recorded. ' +
    'If one is not really a ruling, say so in one line and skip it.'
  );
}

function spawnJudge(payload) {
  if (process.env.RULING_JUDGE_CHILD) return; // the judge's own claude -p never judges itself
  mkdirSync(QUEUE, { recursive: true });
  const ts = new Date().toISOString();
  const job = join(QUEUE, `job-${ts.replace(/[:.]/g, '-')}-${process.pid}.job`);
  writeFileSync(job, JSON.stringify({
    prompt: payload.prompt,
    context: payload.transcript_path ? lastAssistantText(payload.transcript_path).slice(-1500) : '',
    heardIn: REPO_ROOT,
    ts,
    sessionId: payload.session_id ?? null,
  }));
  if (process.env.RULING_JUDGE_DRYRUN) return;
  const child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'ruling-judge.mjs'), 'classify', job], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }

  const prompt = payload?.prompt;
  if (typeof prompt !== 'string' || !prompt.trim() || HARNESS_WRAPPER.test(prompt)) return 0;
  const parts = [];
  try { parts.push(pendingContext(takePending(QUEUE, payload.session_id))); } catch {}
  if (looksLikeRuling(prompt)) parts.push(CONTEXT_TEXT);
  try { spawnJudge(payload); } catch {}
  const text = parts.filter(Boolean).join('\n\n');
  if (!text) return 0;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: text,
      },
    }),
  );
  return 0;
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
