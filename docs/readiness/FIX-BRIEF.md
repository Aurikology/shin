# Readiness fixes: shared brief for every fix worker (2026-11-18)

Jamin's word: *"fix everything"*, about the 93 items in `docs/readiness/REGISTER.md` (data in `register.jsonl`,
raw evidence in `raw/`). Read REGISTER.md's rows for your items and their sources before you change anything.
`RULINGS.md` wins over this brief.

## Rules

- **Work in a lane:** `node scripts/lane-worktree.mjs create <your-lane>` from C:\shin, then work in the worktree it
  prints.
- **Commits:**
  - commit everything in the lane (removing a lane force-deletes untracked files);
  - messages `[scope] ...` naming the paths, with NO Co-Authored-By or Claude lines;
  - do not push or merge; the lead reviews and merges.
- **No sub-agents.** Your final report is under 200 words, covering:
  - each item id with fixed, prepared-for-Jamin, or not done and why;
  - the tests, red then green;
  - the suite totals;
  - anything Jamin or the Mac must do, as exact steps.
- **Do not contact the Mac, any service, any account or any person.**
  - Where a fix needs an account sign-up, a password, a dashboard click, or a run on the Mac, write the exact steps
    into `docs/readiness/needs-jamin.md` (create it if missing, append your own section headed with your lane
    name).
  - Anything the Mac can run unattended goes in your report as numbered steps.
- **Stay inside your files** (table below). If a fix needs a change in another lane's file, do not make it. Name it
  in your report.
- **Checks proportional to risk:**
  - money, sign-in, sending and data changes get a test written first and seen failing;
  - UI and copy get typecheck plus one look at the rendered strings;
  - shell scripts for the Mac get `bash -n` and, where possible, a dry-run mode tested here.
- **Test runs:** run the app suite and any package suite you touched by script, and read only the summary lines.
  The deploy check on the Mac runs the app, spine, identify and catalogue suites plus the app typecheck. A
  catalogue test once broke on a schema change nobody ran, so run catalogue too if you touch the app's database
  shapes.
- **Unattended jobs fail loudly:** every job or check you add must report its failure somewhere a person sees (the
  health body that the alarm reads, or an email via the existing alarm path), never only a log line.
- **Customer-facing words:** plain, confident, short. A required legal line is fine. Nothing that makes shoppers
  less likely to pay or stay, unless its cost is named. No em dashes anywhere.
- **Data sources and retailers:** operational changes only. No legal commentary.

## Who owns which files (do not edit another lane's files)

| Lane | Owns |
|---|---|
| fix-money | `app/src/scan-quota.ts`, `app/src/rate-limit.ts`, `app/public/js/screens/you.js`, `app/public/js/screens/paywall.js`, `app/public/js/plus-config.js`, `app/public/js/purchases.js`, `app/public/js/paywall-strings.js`, the Plus, paywall and You strings in `app/public/js/ui-strings.js`, `docs/store/terms*.html` |
| fix-watch | `.github/workflows/`, `scripts/*probe*`, `scripts/data-freshness.mjs`, the `/api/health` handler in `app/server.ts` (and new modules it imports), `app/src/retention.ts`, the Project Hammer import code |
| fix-mac | everything under `mac/` (scripts, launchd plists, deploy checker, README) |
| fix-app | other `app/public/js/` files, `app/src/own-prices.ts` and search code, catalogue fetch code, `native/` (not the Podfile lock), new route modules (hook into `app/server.ts` with at most a few lines, away from the health handler) |
| fix-docs | new files under `docs/` (runbook, handover, calendar file, templates), `docs/privacy/*`, `docs/store/privacy*.html`, `docs/store/listing.md` |
