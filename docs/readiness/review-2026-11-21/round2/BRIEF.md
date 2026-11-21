# Pexi launch review, round 2 (2026-11-21): shared brief

Round 1 answered: App Store submission, functions, scale. Jamin asked what else it missed, then for a second
round. This round covers what round 1 did not aim at. Several jobs run at once; your prompt names yours.

## Read first

- The rules section of `docs/readiness/review-2026-11-21/BRIEF.md` (round 1): they all apply here too
  (change nothing outside your output, no commits or pushes, live server read-only and under 150 requests,
  no messages or sign-ups, no sub-agents, tests by script, no data-source licensing comments, Shin hard rule 2).
- Already known, so report only what is NEW or CHANGED against these: `docs/launch-gaps-2026-11-06.md`
  (items 1 to 66; section E is round 1), `docs/readiness/REGISTER.md`, `docs/security-check/FINDINGS.md`,
  `docs/security-check/legal-review-2026-11-17.md`. Grep them for your topic; do not read them whole.
- Never open Jamin's personal employment documents (AMD offer or agreement) or his accounts files.

## Output

1. `docs/readiness/review-2026-11-21/round2/<job>.jsonl`, the round 1 format:
   `{"job":"<job>","sev":"blocker|money|serious|minor|ok","title":"...","evidence":"...","basis":"checked|sourced|assumed","fix":"...","fix_cost":"...","needs_jamin":true|false,"dup_of":"gap NN, R NN, or none"}`
   Set `dup_of` honestly: a finding already on a list counts only if you add something new (say what).
2. Final reply under 150 words: counts by severity, counts new versus duplicate, top three new, and what you
   could not check.
