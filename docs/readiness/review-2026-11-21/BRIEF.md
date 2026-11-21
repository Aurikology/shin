# Pexi launch review, 2026-11-21: shared brief for every job

Jamin asked: is Pexi ready for App Store submission, does every function work, and can it take
thousands to tens of thousands of users. Several jobs run at once; each owns one area (your prompt
names yours). Read this file, then only what your job needs.

## Context to read (do not restate it, build on it)

- `docs/readiness/BRIEF.md`, section "Pexi in facts" (what the app and server are). Check anything you rely on.
- `docs/readiness/REGISTER.md` (93 known risks from 2026-11-18) and `docs/security-check/FINDINGS.md`.
  A finding already listed there counts only if you add something new (it is fixed, it is worse, it was wrong).
- `RULINGS.md` is 95 KB and outranks every other file: grep it for your topic, do not read it whole.
- `git log --since=2026-11-18 --oneline` for what has been fixed since the register.

## Rules

- **Change nothing outside `docs/readiness/review-2026-11-21/`.** No commits, no pushes (a push to main deploys
  production), no edits to code, settings, App Store Connect, RevenueCat or the Mac. Other sessions and
  Aurik work in this repo at the same time.
- **Live server:** read-only requests only, as a probe device id (`probe-review-<job>`), never with the Claude
  consent header, never a purchase, price entry, correction or rating. Stay under 300 requests total. Anything
  heavier runs against a local throwaway server (`node scripts/load/load-test.mjs --spawn` shows how one starts).
- **No messages to anyone** (email, chat, GitLab, mailbox) and no sign-ups.
- **No sub-agents.** Do the work yourself.
- **Tests by script:** run suites and scripts unattended and read only their summary lines and failures,
  never the full output into your context.
- Do not comment on data-source licensing or scraping legality (Jamin ruled it out of scope).
- Shin hard rule 2 stands: no savings claim until measured (Competition Act s.74.01(1)(b)).

## What counts as a finding

Something that blocks submission, loses money or users, breaks a function, caps growth, or risks the Apple
account, law or data. Each needs **evidence**: a command and its output, a file and line, a screenshot path,
or a URL with the quoted line. "Works" is a finding too, but only when something outside the code's own
claim confirmed it (a run, a live response, a page). No evidence means label it `assumed`, never `checked`.

## Output (both required)

1. **`docs/readiness/review-2026-11-21/<job>.jsonl`**, one finding per line:
   `{"job":"<job>","sev":"blocker|money|serious|minor|ok","title":"<one line, plain words>","evidence":"<command+output, file:line, URL+quote>","basis":"checked|sourced|assumed","fix":"<smallest fix>","fix_cost":"<time and $>","needs_jamin":true|false,"register":"R<nn> or new"}`
   `blocker` = Apple would reject, or a core function fails for everyone. `money` = loses sales or paying users.
   `serious` = breaks a function for some users, caps growth, or risks account, law or data. `minor` = the rest.
   `ok` = an area checked and found working (one line per area, so silence is not mistaken for a pass).
2. **Your final reply: under 150 words.** Counts by severity, the top three findings in one line each, and
   anything you could not check and why. The JSONL holds the detail.
