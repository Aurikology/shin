---
name: screen-walk
description: Walk the running screens at phone size in both themes, read the rendered DOM rather than the stylesheet, and write down what was walked. Use at the end of every pass and before reporting anything user-facing as done.
---

# screen-walk

Build standard 3 requires this and gives no steps: *"the screens are walked, in both themes, and
what was walked is written down. This is a habit and gets no hook."* A habit with no written steps,
in a repo whose own protocol says prose does not hold reflexes, is why 43 of 47 defects were found
by a person and 1 by a test.

**A green suite is not evidence about a screen.** Five rows record a green test as the reason a
defect survived.

## Before you start

`npm install` in `app` and in `spine` — `app`'s typecheck shells out to `spine/node_modules`. See
`fresh-tree` if anything is red before you have touched it.

## The walk

1. **Start the real server.** `node app/server.ts`, confirm it answers. If the port is busy,
   `netstat -ano | findstr :4173` then `taskkill /PID <pid> /F` — `pkill` does not free a port on
   Windows, and a stale server serving a rebuilt tree makes everything look broken.

2. **Drive it with Playwright at 390 x 844.** Chrome devtools cannot emulate that viewport here.
   D-045 and D-046 were both only visible on the Playwright pass. A fresh browser profile lands on
   the setup screen, not the camera; click through it first.

3. **Walk the route, in both themes.** Camera, typed scan, item picker, "not this?", price pad,
   verdict at each tier, refusal, save, watchlist, past scans, profile, share export. The screen
   list is the array in `app/public/js/main.js`, not a number in a document.

4. **Read the rendered DOM, never the stylesheet.** A rule that plainly declares a focus ring can
   compute to contrast 1.00 (D-041), and a token suite can be green while seven rules fade text
   below the floor (D-040). On every screen:
   - computed contrast on every text node, against the ground actually painted behind it;
   - `getBoundingClientRect()` on every interactive element, against a 44px floor;
   - `getAnimations({ subtree: true })` for animations running behind something hidden (D-017);
   - `document.documentElement.scrollWidth` against 390.

   **Normalise colours through a canvas before computing contrast.** Backgrounds come back as
   wide-gamut `color(srgb 0.88 0.88 0.87)`, and reading those three numbers as 0-255 produces a
   page of contrast failures that are not real. That false positive is recorded in D-045. Composite
   the element's opacity over the ground before comparing.

5. **Read every sentence as a shopper would**, against the numbers behind it. Look for a fact
   rendering as `undefined`, `null` or `NaN`; an internal code, category slug or raw error string on
   a screen belonging to somebody who cannot act on it (D-011); a hedge about a mechanism that has
   since been built; and any number the app asserts about itself.

6. **Read the console for the whole walk**, and explain every line in it. D-037 and D-046 were both
   console lines nobody had explained. A 404 you decide is harmless still needs the sentence saying
   why.

7. **Open anything rasterised.** The share card and the icon. Nothing errors when an SVG fails to
   decode — D-044 shipped an icon that drew nothing, anywhere, while a test asserted it was linked.

8. **Write down what was walked, in which themes, and what appeared.** In `NOW.md`, the commit, or
   the defect row. Then say plainly what you did *not* walk.

## Learnings log

- 2026-09-08 — Written from build standard 3, which had stated the requirement since it was earned
  and never the steps. Step 4's canvas normalisation is in here because the first run of this walk
  produced four contrast failures that were the measuring script's bug, not the app's; step 6 is
  here because the same run found D-046 by chasing a 404 nobody had explained.
