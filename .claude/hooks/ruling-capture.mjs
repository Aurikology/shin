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
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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
  'Otherwise ignore.';

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }

  const prompt = payload?.prompt;
  if (typeof prompt !== 'string' || !looksLikeRuling(prompt)) return 0;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: CONTEXT_TEXT,
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
