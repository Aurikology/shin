---
name: whats-next
description: Work out what needs doing on Pexi right now, for Aurik's side, from every place work is recorded (NOW.md, the launch gaps, DEFECTS.md, bug sweeps, comms, claims), rank it, tell Aurik the plan in plain words, then build it item by item through fix-loop and push each piece. Use when Aurik says "what needs to be done", "what's next", "keep going", "continue", "build", or starts a session with no named task.
---

# whats-next

Saved 2026-11-11 at Aurik's ask ("create a workflow that understands what needs to be done. Then
tell me what you will do. then continue to build. continuously push to jamin"). It is the front
half of a session; `fix-loop` is the back half. This skill decides WHAT; fix-loop decides HOW.

## 1. Gather (read, never edit)

`git pull --ff-only origin main` first; Jamin lands whole stacks mid-session. Then read, in order,
newest first where dated:

1. `NOW.md`: the active state. It lags the log; trust `git log --oneline -30` for the last days.
2. `docs/launch-gaps-*.md` (newest): every item carries **[Aurik]** or **[Jamin]**.
3. `DEFECTS.md` rows whose state column says Open, Half or Partly. **Read the whole state cell**:
   a cell can start "Open" and end "Closed" (the 2026-11-08 triage miscounted 18 rows that way).
4. `docs/bug-sweep-*.md` (newest): the family write-ups behind the family rows in DEFECTS.
5. `comms/messages/` addressed to aurik (filenames `*-to-aurik-*`) newer than the last
   `aurik-to-*` reply, and `comms/claims/*.md` (someone else's claim = not yours).
6. `RULINGS.md`: before an item goes on the list, search it. An item that undoes a ruling is a
   question for Aurik or Jamin, not work.

## 2. Keep only Aurik's work

RULINGS "Who owns what": Aurik = every screen, `app/public/`, `native/`, the paywall and purchase
flow, anything checked by eye on a phone. Jamin = `app/server.ts`, `app/src/`, `price/`,
`catalogue/`, data, the Mac, store listing, legal pages, builds and submission.

An item spanning both is split at the phone/server line. Build the phone half; write the server
half into one `comms/messages/<date>-aurik-to-jamin-<topic>.md` note per batch (what, where in
the code, the evidence, what the phone already does with it). Never edit Jamin's files to fix
Jamin's items, even when the fix is one line: his sessions own them.

Phone-only items (crashes, sandbox purchase, torch on a real phone, haptics) cannot be built from
the PC: list them under "needs you on a phone", do not loop on them.

## 3. Rank

No invented ranking beyond this order; inside a tier, cheapest first:

1. **Blocks Apple review or makes a screen say something false** (policy contradictions, a
   paywall that sells nothing, a control that silently does nothing).
2. **A shopper is told something wrong** (contradicting numbers on one screen, a verdict word
   stronger than what is drawn).
3. **A control works badly** (missing keys, lost state, no confirmation).
4. **Wording, jargon, cosmetics.**

Group siblings from one family into one commit only when they share the cause and the file.

## 4. Tell Aurik the plan, then do not wait

One short message, his vocabulary (no file paths, no D-numbers unless he used them, no skill
names): what is his to build in order, what goes to Jamin, what needs him on a phone. Then start
item 1 straight away. "Continue" / "keep going" means roll through the list, not check in.

Stop only for: a ruling to reverse, money, keys, a phone in hand, or a red you did not cause and
cannot fix in your lane.

## 5. Build: fix-loop per item

Each item runs `fix-loop` steps 2 to 7: cause to the line, red test first, smallest fix, the full
gate in `app/` (typecheck, test, test:ux, check, webkit-sweep, fake-camera-check), one commit
`[app] <what the shopper sees now>`, push `origin` and `github`, `git ls-remote` both.
Pull before every commit. A screen change is never "seen on a phone" until a build says so.

## 6. Close the batch

fix-loop step 8 once for the whole batch: DEFECTS state cells with the fixing sha, the Jamin note,
the Mac build ask from the new HEAD, claims cleared, NOW.md's "what is being worked on" brought to
the log. Push and `ls-remote` again. Then report: fixed and pushed (sha), handed to Jamin, needs a
phone, and one-line next.
