---
name: fix-loop
description: Pexi's debug-and-fix workflow, from a fault report (a phone check, a tester, a red suite) to a fix pushed to both remotes and a build asked of the Mac. Use whenever Aurik or Jamin reports something broken ("the flash keeps flashing", "the button does nothing", "this test is red"), and whenever "fix these", "debug this" or "keep fixing" comes up. Runs the whole loop in one session without checking in between steps.
---

# fix-loop

One report in, one pushed and recorded fix out. Saved 2026-11-10 at Aurik's ask ("make a workflow
that debugs and fixes things, save this so we can continuously work on issues like these"), from
the session that fixed D-251 (torch flashing), D-252 (dead barcode button) and D-253 (date label).

Run every step for every item. Several reports in one message: triage all of them first (step 1),
then loop steps 2 to 8 once per item, one commit each.

## 0. Orient (once per session)

- `git pull --ff-only origin main`; `git config user.email` must be aurikdisler@gmail.com on Aurik's PC.
- Read `NOW.md`, then `docs/launch-gaps-2026-11-06.md` (the live to-do), then `comms/messages/`
  addressed to you. Jamin pushes whole stacks to main mid-session: pull again before each commit.

## 1. Triage: is it a fix, a ruling, or someone else's?

For each report, before touching code:

- **Search `RULINGS.md` and `docs/decisions.md`** for the behaviour. If the report asks to undo a
  ruling, it is not a fix: push back once, plainly, quoting the ruling and who made it, and build it
  only once Aurik decides with that in view (if the ruling is Jamin's, say Jamin must agree, and
  offer a `comms/messages/` note). Example: 2026-11-10, "the app does not show the 18 or older
  choice": RULINGS "Pexi is for all ages" (Jamin, 2026-11-07/08) removed it on purpose, and the
  App Store rating (4+), the terms and the store listing all say so.
- **Search `DEFECTS.md`** for an existing row; cite its id instead of opening a new one.
- **Owner** (RULINGS "Who owns what"): screens, frontend, native app = Aurik; server, data, the
  Mac, store listing = Jamin. Jamin's items go to him as a `comms/messages/` note, not a code change.
- Claim Aurik's items in `comms/claims/aurik.md` (one line: what, files, started date).

## 2. Find the cause, down to the line

- Grep for the visible thing (class, string key, `data-act`, event name), then read the handler
  and every rule it calls. Do not stop at the first plausible spot.
- **Phone behaviour you cannot see from the PC: simulate it.** The torch loop was found by walking
  `decideTorch` through frames: dark, lit, bright, repeat. If the camera can't tell its own torch
  from a bright aisle, any rule based on brightness will loop.
- **A test that is red, then green with no change: suspect the clock.** D-253 failed only between
  23:30Z and midnight UTC. Find the window; do not call it a stale fixture.
- **"Nothing happens" on a tap:** check the no-result branch, not only the success path, and that
  iOS shows the pressed state (`:active` barely shows there; use a class).
- Stored settings merge over defaults (`store.js` `load`: `{...EMPTY, ...stored}`), so changing a
  default never reaches a phone that already saved the old value. Fix the rule as well.
- Hunting across many files, or with no lead after a real look: hand the hunt to the `debugger`
  agent (`.claude/agents/debugger.md`); it reports, you fix.

## 3. Red test first

- Write the test that reproduces the fault and **watch it fail on the old code** (`negative-test`
  skill; for a one-file fix, `git stash push <file>`, run, `git stash pop`). Put the failing
  number in the commit (for example "24 switches in ten seconds").
- Match the file's convention: behaviour tests for pure code (`src/eye/*.ts`, `lib/*.js`); the
  dispatch harness in `test/camera-icons.test.mjs` for click handlers; source assertions through
  `between()` where the code lives inside a render closure.
- Fixed clocks: pass `now` in; never depend on the hour the suite runs.

## 4. The smallest fix

- Change the cause, not the symptom. Comment the why with the reporter's own words and the date.
- Tests that pinned the old behaviour get amended, not deleted: `// Amended <date>: <why>`.
- A new `let` that a reset or teardown touches goes up with the other scan state, never below
  where a reset can run (temporal dead zone).
- Every timer you add is stopped in the teardown and in every `reset()` path.
- If you add any new on-screen text, it goes in `ui-strings.js` in both English and French.

## 5. Gate, in `app/`

All of these, and record the counts:

```
npm run typecheck     # exit 0
npm test              # N pass, 0 fail
npm run test:ux       # N pass, 0 fail
npm run check         # exit 0
npm run build-eye     # only if src/eye/ changed; exit 0
```

A red you did not cause: confirm it is red on clean `main` too, say so in the commit, and carry it
as its own item. Never commit over a red you caused.

**Then check it in a real browser engine (the tests passing only proves the code does what you
wrote):** any change to a screen gets these, with `PLAYWRIGHT_DIR` pointing at a folder holding
`node_modules/playwright` (one exists under an older session's scratchpad `pw\`; else `npm i
playwright` in your scratchpad and `npx playwright install webkit chromium`):

```
node scripts/webkit-sweep.mjs 2        # Safari's engine, every button, 0 problems expected; no camera
node scripts/fake-camera-check.mjs     # Chromium with a fake camera: the camera screen and the barcode press
```

Neither one is a phone. Write down what they saw, and still say "not seen on a phone".

## 6. Commit, one per fix

- Stage named paths only (a hook refuses a blanket `git add`). Pull right before.
- Subject `[app] <what the shopper sees now>`; the body says the report (quoted), the cause, the
  fix, the red-first number, the gate counts, and **"Not seen on a phone."**
- Write the message to a file and `git commit -F` (multi-line `-m` mis-parses on this machine).
- End with the Co-Authored-By line.

## 7. Push and prove it

Pexi pushes every piece that passes the gate, without asking (Aurik's standing rule):

```
git push origin main; git push github main
git ls-remote origin refs/heads/main; git ls-remote github refs/heads/main   # both = HEAD
```

## 8. Record and hand off (last, once per batch)

- `DEFECTS.md`: one row per fault (next free D-number after a fresh pull; check for numbers Jamin
  took in the same window): what, who reported it (quoted), the state with the fixing commit, and
  "Not yet seen on a phone".
- `comms/messages/<date>-aurik-to-mac-build-N-from-<sha>.md`: ask for the next TestFlight build
  from the new HEAD, list what it carries, "not attach or submit".
- `comms/messages/<date>-aurik-to-jamin-...md` for anything of Jamin's, or a ruling that needs his word.
- Clear `comms/claims/aurik.md`.
- Commit these as `[comms]` / `[defects]`, push, `ls-remote` again.

## 9. Report to Aurik

Answer first: what's fixed and pushed (sha), what was pushed back and why, what's still unverified
(anything on a phone always is until the next build). Then the phone re-test for each fix, as
numbered steps with what passing looks like. End with a one-line "next".
