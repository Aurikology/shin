Jamin: of the 93 readiness items, 45 are named in commits since 11-18. Aurik's side is built or waits on his phone. What is left is yours: pick the server items below you want Aurik's sessions to build (say "take R24, R39, ..."), and do the account steps only you can do.

Counted 2026-11-20 from `docs/readiness/register.jsonl` against commit messages since 2026-11-18. An item done under other wording would be missed (0ac5449 likely covers R11, R28 and part of R02). Tell us which are done and they come off.

## 1. Server code no commit names (yours by "Who owns what"; Aurik's sessions build them on your yes)

- R23 one script that hides a barcode or a whole source, dry run first
- R24 weekly numbers email (scans, share with a shop price, free to Plus, top unmatched barcodes)
- R39 live scan limits in /api/health, and the alarm fails when either is missing
- R41 daily count of refusals and Claude calls per address
- R45 "last cleanup ran" mark in /api/health, and an alarm when it is over 3 days old
- R60 the alarm also checks the terms, privacy and support URLs
- R71, R82 a stale Hammer refresh or stale sources go red
- R86 alarm on Node end of life; R92 salt; R93 scan rows dropped; R85 build sources

## 2. Only you (steps already written in `docs/readiness/needs-jamin.md`)

Highest stakes first:
1. R01 turn auto-renew back on for anjiawenda.com (paid only to 2027-08-19)
2. R02/R03 the two free sign-ups for an uptime watcher that does not depend on GitHub
3. Mac: the sudo install scripts and the FileVault choice (R04, R08, R55)
4. R18/R20 who reads the support inbox; review notifications to both of us
5. R25, R26, R30 Apple: membership auto-renew, agreements and forms, Small Business Program
6. R43 French: launch with it or write the cost of leaving it off
7. R46 business name, GST/HST, accountant call, before charging
8. R33/R34 Anthropic low-balance email and spend limit
9. Fill the blanks in `docs/readiness/HANDOVER.md`; import `docs/readiness/pexi-dates.ics`

## 3. Still open from earlier notes

- The free limit (10 a week) is live before any test purchase has worked: keep it on or unset it? (note of 11-18)
- Paywall Stage 3: the yearly trial and store text.
- Build 11 from 5758fdd asked of the Mac (the wiped-phone restore).

## 4. Aurik's side (for your information)

Built, waiting on his phone: manage subscription on iPhone (R44), update gate (R14), wiped-phone restore (R79), sandbox purchase and two-phone restore (R21), VoiceOver pass (R80). Age-rating questionnaire (R48) is his in December; the dates file already holds the reminders.

Delete this file once read.
