# NOW — the one thing being worked on

*One screen. If any other doc disagrees about the current state, this file wins. State, not
narrative.*

---

## Where this stands

**The price spine and the camera-first app are built and running.** `spine/` is the engine that
answers or refuses, at 44 passing tests and a clean typecheck. `app/` is a camera app: six
screens, no framework, no dependencies, no build step. Start it with `cd app && npm start` and
open `http://localhost:4173`. It opens on a live viewfinder with the shutter under the thumb.

**What that does not mean.** The engine answers **2 of the 7** hand-priced items and refuses the
other five, which is the pilot's own headline rather than a regression, and the app now says so on
its face instead of implying coverage it does not have. Nothing is deployed, nobody outside this
machine has opened it, and the three things below still gate everything that matters.

**The app has been rebuilt to the new design and the spec and the running app now agree.** What
shipped before was thirteen stages as thirteen pages with no camera anywhere, and a home screen
that described a camera in prose instead of showing one. What runs now opens on the viewfinder;
scan, identify, verdict and the follow-on actions are one sheet over the frozen frame; a refusal
is a designed grey state with its own face and its own repair, never an error and never red; and
the same tier colour is solid when Shin is certain and hollow when the evidence is thin, so
calibration is visible in the shape rather than claimed in a footnote. Behind the camera there
are four pages: watching, teach Shin a price, post it, and you. Eleven walkthrough screens were
deleted. The spec is `docs/design/DESIGN.md` and it still wins over any screen; the drawn
mockups are `docs/design/mockups.html`.

**Not built, and known.** There is no vision model, so identification is a list of the items the
corpus actually holds and the user picks one; any asking price that was a stated stand-in rather
than an observed tag is labelled as one on the screen where it is read. The share card is a still
image, not a clip.

The research and the plan that produced it were made 2026-09-03 in one session, now in this repo
so they stop living in a temp folder.

The master plan is `pages/shin-terminating-loop.html`. It supersedes the two other plans and
contains the queue, the weekly pass, and the three ways this project ends.

## The next three things, in order

1. **CIPO trademark search** on "Shin" in the software classes. Until this clears, no public
   name, no handle, no listing. It also gates the video test, because a video needs a name.
2. **The two-caption video test**, on borrowed audiences. Three to five micro creators, or
   Reddit. Not a new account: a cold handle can return near zero views and give a false
   negative that reads like a real one.
3. **Thirty items priced by hand.** Seven are done and written up in
   `notes/session-2026-09-03.md`, along with a same-day correction that reversed two of the
   three category failures.

Nothing in this list needs code, and the first two are cheap. **The code existing does not move
any of them**, which is the point: the app was built to be walked through and argued with, not to
substitute for the trademark search or the video test.

## What the pilot actually showed

Direct retailer fetches: zero of four returned a price. Search for a live price: one usable
multi-retailer range out of seven items. **That is a finding about the method, not the market.**
New tech turned out to be the best-served category of the five once a price tracker was opened
instead of a search engine. Produce is the only genuinely hard one and is out of v1.

## Open, and mine to decide

- The name, pending the search above.
- ~~Shin's attitude.~~ Decided 2026-09-03: the user picks it, from three. It still triples every
  string, and now that cost buys the choice being his rather than ours. See `docs/decisions.md`.
- Whether Aurik is building this or reading it. He has Maintainer access on the repo either
  way; the answer changes how the plan is written from here.
