# Pexi launch review, round 3 (2026-11-21 evening): shared brief

Rounds 1 and 2 checked the repo against our own lists and missed what everyone took for granted: legal (found by
round 2) and the home laptop as the host (found after, gap 93). This round looks for the rest of what is taken for
granted. Several jobs run at once; your prompt names yours.

## Read first

- `SETUP.md` in this folder: how Pexi runs today. Every job reads it.
- The rules section of `docs/readiness/review-2026-11-21/BRIEF.md` (round 1) applies, with one change: the live
  server stays under 100 read-only requests for this whole round, and nothing heavy runs against it. The other
  rules still hold: change nothing outside this folder, no commits or pushes (a push deploys production), no
  messages or sign-ups, no sub-agents, tests by script, no data-source licensing comments, Shin hard rule 2.
- Never open Jamin's personal employment documents (AMD offer or agreement) or his accounts files.
- Already known, so report only what is NEW or CHANGED: `docs/launch-gaps-2026-11-06.md` (items 1 to 93),
  `docs/readiness/REGISTER.md`, `docs/security-check/FINDINGS.md`, `docs/security-check/legal-review-2026-11-17.md`.
  Grep them for your topic; do not read them whole.

## Starting points (suspected, not yet proven; prove or disprove the ones in your job)

1. Claude sessions with permission checks off share the live server's user account, so a bad web page they read
   could reach the live database and the payment and Claude keys. (This morning a load test wrote 42,230 junk
   events into the live database by mistake.)
2. Home internet plans in Canada often forbid running a server; an outage or address change takes Pexi down.
3. Cloudflare's free plan says it is "for personal or hobby projects that aren't business-critical", and free
   plans limit serving large files; the product pack (about 44 MB, 6.8 MB compressed) goes through it.
4. Nobody has planned who runs Pexi once Jamin works full time from May 2027.
5. Whether a 44% answer rate is enough for a shopper to keep the app, let alone pay, was never judged.
6. The laptop is one point of failure: stolen means unencrypted data, dead means days down, no copy outside.

## How to work (this is what changed from rounds 1 and 2)

- **Question the setup, not just the code.** For anything you look at, ask: who controls it, what limits it
  (terms, capacity, cost), what happens when it fails and how long until it is back, and would we choose it
  again starting today for 10,000 users. A "no" to the last is a finding even if nothing is broken today.
- **Every number states its conditions** (what else was running, when, how many times measured). A number
  measured once says so.
- **Quote outside terms word for word with the URL**; a summary of terms is `assumed`.

## Output

1. `docs/readiness/review-2026-11-21/round3/<job>.jsonl`, one finding per line:
   `{"job":"<job>","sev":"blocker|money|serious|minor|ok","title":"...","evidence":"...","basis":"checked|sourced|assumed","fix":"...","fix_cost":"...","needs_jamin":true|false,"dup_of":"gap NN, R NN, or none"}`
   Severity as round 1. A finding already on a list counts only if you add something new (say what in `dup_of`).
2. Final reply under 150 words: counts by severity, new versus duplicate, top three new, what you could not check.
