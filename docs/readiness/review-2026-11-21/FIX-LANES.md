# Fix lanes, 2026-11-21: the contract every lane follows

Jamin, 2026-11-21: "fix all things you can fix including findings now and the other things in the gaps list",
then "do all the recommended". You are one lane of eight. Your prompt names your lane folder and your items.

## Where things are
- Your copy of the repo: `C:\shin-lanes\fix-<lane>` (detached at origin/main, its own installs). Work ONLY there.
- The findings you fix: `C:\shin\docs\readiness\review-2026-11-21\*.jsonl` and `...\round2\*.jsonl` (one finding per
  line: evidence with file:line and a suggested fix), and `C:\shin\docs\launch-gaps-2026-11-06.md` items 36 to 92.
  Read only the lines your prompt names. Grep `RULINGS.md` (it outranks everything) for your topic before changing
  behaviour; if a fix would contradict a ruling, do not make it: report it.

## Contract (Pexi's own lane rules, CLAUDE.md "The boss and the lanes")
- Leave your changes UNCOMMITTED in your lane folder. No git add, commit, push, branch or stash. The boss reviews,
  commits and pushes (a push to main deploys production).
- Never edit status files: NOW.md, DEFECTS.md, docs/decisions.md, SCOREBOARD.md, QUEUE.md, CLAUDE.md, RULINGS.md,
  docs/launch-gaps-2026-11-06.md, comms/.
- Each fix: a test that fails first (run it, see it red), then the smallest fix, then green. Run your package's whole
  suite and typecheck at the end (`npm test` in the package; `npx tsc --noEmit` where a tsconfig exists). Report
  before and after counts. A missing install does not say so: `npm install` in the package before believing red.
- Temp folders only. Never link, move or delete a shared folder or node_modules. No real data: tests run on temp data.
- A server you start for a check is killed by PID before you finish. The live server is read-only for you, under 50
  requests, device ids `probe-fix-<lane>-*`, never the Claude consent header.
- Do not touch `app/public/js/screens/camera/` or `camera.js` unless your prompt allows it (Aurik is splitting it).
- Files outside your prompt's list: only when a fix truly needs them; name them in your report.
- No sub-agents. No messages to anyone. No em dashes in anything a shopper reads.

## Report (your final reply, under 200 words)
Items fixed (finding or gap number each), items not fixed and why, files changed, tests before/after and typecheck,
what you could not verify (for example anything that only runs on the Mac or an iPhone).
