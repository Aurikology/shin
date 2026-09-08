---
name: negative-test
description: Break the thing a check covers on purpose and watch the check go red, before citing that check as evidence. Use whenever a test, hook, or typecheck is about to be called proof, and whenever a new test is written.
---

# negative-test

A check that has never failed is a claim, not evidence. Five defects in this repo survived because
the test written to catch them was green:

- D-021 — the test rendered every copy key with `{}` and asserted the result was non-empty, which
  `"Saved at undefined, undefined."` satisfies.
- D-033 — the token test modelled one opacity; the stylesheet used five.
- D-040 — same shape, third instance.
- D-044 — `head.test.mjs` asserted the icon was *linked*. Nothing asserted it could be *decoded*,
  and it drew nothing, anywhere.
- 2026-09-05 — a file reported as typechecking that had never been compiled, because it was not in
  the tsconfig `include`.

`memory/lessons.md` already carries the fix in one line. It lives somewhere nothing loads.

## The check

1. **Name the property**, in one sentence, and name the model the check uses to assert it: which
   opacity, which selector set, which file glob, which threshold.

2. **Confirm the check reaches the file at all.** For `typecheck`, that the file is inside the
   tsconfig `include` — being reachable from an entry point is not the same thing. For `npm test`,
   that the glob matches the extension you used (`test/*.test.{ts,mjs}`).

3. **Introduce the exact defect the check exists to prevent**, in the real file, not a copy. Run the
   check.

4. **It must go red, and the message must name the thing.** A red run with an unreadable message is
   half a check: the next person will not know what broke.

5. **Revert. Re-run. Confirm green.**

6. **If it stayed green in step 3**, the check models something the code does not do. Widen it, and
   prefer deriving the threshold from the source of truth over naming a constant — `tokens.test.mjs`
   derives the contrast floor from the palette, so a tier change moves the floor with it.

7. **Only then write "negative-tested"** in the commit or the defect row, and say which direction
   was tested. Where a check can fail in two directions, test both: at `Infinity` three tests went
   red and at 1 KB the other two did, which is what proved the body cap was in the right place
   rather than merely rejecting everything.

## Learnings log

- 2026-09-08 — Written after the fifth instance. The phrase "negative-tested" already recurs in
  D-040, D-043, D-044 and D-047 as an ad-hoc convention with no definition; this is the definition.
  Step 2 is separate from step 3 because the 2026-09-05 tsconfig case never ran the check at all,
  and a check that does not run cannot be made to fail.
