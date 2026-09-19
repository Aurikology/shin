# TRANSITION.md — moving the app onto the retro shell

Written 2026-09-07, on his instruction: *"remember my instuctions and intentions with the shin
app when building. Although the current ui is bad, it contains the instructions I gave shin on
certain features. Although the new ui has good design, none of its features are what i
instructed. Although, the new ui might have certain features that the backend wants to adapt,
but thats up to your discretion. create a plan to perform this entire transition."*

Three settled calls of his, carried into every stage below: the shelf tag is entered on a pixel
keypad; the retro shell **replaces** the current app rather than sitting beside it; and the
near-empty-store problem is mine to decide on his stated instructions.

---

## 0. Read this before anything below: three branches, and an instruction to end them

Found 2026-09-07 while writing this, verified with `git`, not taken on report.

**No branches, from now on.** His words, typed in another session on 2026-09-07 and reaching
this one as text in `CLAUDE.md` lines 128-146: *"from now on, there will be no branches. For the
way me and my partner are working, there is no purpose with branches and it just makes things
more complex."* Unrestricted in scope, and "my partner" is Aurik, which is why it belongs in the
repo's rules rather than in one session's notes. Still uncommitted, deliberately: a session
working in a repo that is not its own leaves the commit to him.

Taken as given, the first move is not "merge a branch" but "empty every branch and delete
them". Counted today with `git rev-list` and the modern `merge-tree`:

| Branch | Unmerged commits | Merges into main? |
| --- | --- | --- |
| `feature/ui-excellence` | 27 | No. 5 conflicts. |
| `feature/spine-soldcomps` | 3, including an eBay.ca sold-listings source | No. 1 conflict, `spine/src/sources/registry.ts`. |
| `feature/avatar` | 1 | Clean, and **already contained**: its commit is an ancestor of `ui-excellence`, confirmed with `merge-base --is-ancestor`. Delete it, nothing is lost. |

**So the branch-free end state is 30 commits to land across two branches, six conflicted files.**
That is the real cost of the first move, and it comes before stage 0.

`origin/feature/ui-excellence` carries **27 commits** not on `main`, by Aurik, dated 2026-09-06
and 09-07: 123 files, 12,005 insertions, 1,082 deletions. `main` has 4 commits not on it.

**The merge is not free. Five files conflict**, from
`git merge-tree --write-tree --name-only main origin/feature/ui-excellence`, which exits 1:
`DEFECTS.md`, `app/public/js/api.js`, `app/public/js/screens/camera.js`,
`app/public/js/screens/you.js`, `app/server.ts`. Ten files are touched on both sides; five of
them merge cleanly (`NOW.md`, `camera.css`, `main.js`, `spine.ts`, `spine.test.ts`).

I first recorded this as conflict-free. That reading came from the **old** `git merge-tree`
form, whose output I grepped for conflict markers; it does not emit them that way, so the check
returned zero and could never have returned anything else. A check that cannot go red is not a
check. The modern form is the one to use.

Four of the five are code, and two of those four, `camera.js` and `you.js`, are files this
session and that branch have both been editing. That is where the resolution cost sits.

What is on it that this plan was about to specify as work:

- **39 avatar SVGs**, thirteen states across all three personalities, which is the artist
  deliverable the avatar contract asked for. Checked one file: the namespace attribute is
  present, which is the thing whose absence silently broke a share card export once.
- **The `asking` state**, which section 1b below calls out as existing on neither side. It
  exists there.
- **The tier palette measured rather than asserted**, which is the recorded top defect.
- **The camera's own standard applied outward across the nine other screens**: keyboard, focus,
  escaping, measured contrast. That is the recorded flaw list's whole P0 and P1.
- **One keypad**, which is stage 2's merge.
- **Keep it, on the screen five of seven scans end on**, which is stage 3's main action.
- Interruption-budget counting, and a refusal the server looked at recorded as a drop.

**So the sequence changes.** Merge and read that branch before building any stage below. Roughly
stages 2 and 3, and every recorded flaw fix, are wholly or partly done on it. Rebuilding them
from this document would be the expensive collision, and it would be invisible until the two
versions disagreed.

**Withdrawn: the promise-to-look-again defect.** I recorded `voice.js`'s *"Watching. I will say
something under ..."* as a live defect on both sides. It is not one. That string is the
`watching_feed` key, which is the deliberately dark form: the feed flag is `false`, nothing
outside `voice.js` references the key, its own comment reads "Never call this key directly", and
the shipping `watching` key says only checkable facts, the price, the seller and the day. The
avatar document lists this as unresolved; the code resolved it and the document did not catch
up. Nothing to fix in the move. The stale line is in the document, not the product.

One correction to that correction: I wrote that the branch's second string table carries no
promise at all. Its warm cell reads *"Watching. I will tell you if it drops."* That is a
promise. It is on the same dark key behind the same false flag, so the conclusion is unchanged
and the branch still adds no shipping instance, but the table is not clean.

### While confirming this: the remotes

`shin` has **two** remotes, not one. `origin` is `gitlab.com/shin3223636/shin`, which is where
`main` tracks and where those branches live; `github` is `github.com/xu826Jamin/shin`. `origin`
also carries a second push URL pointing at the GitHub one. I previously told him the remote was
`github`; that was narrower than the truth. Local `main` is 4 commits ahead of `origin/main`,
still unpushed, still his call.

---

## 0b. What is actually being moved

All figures below are **counted** with `wc -l` on 2026-09-07, excluding `js/vendor/` (26,510
lines of third party code), the built `eye.js` bundle (3,028, regenerated from source) and
`js/chunks/vision_bundle-SWDWE6A5.js` (4,662, a MediaPipe build artifact). None of those three
are ours and none of them move.

| Layer | Lines, counted | Moves? |
| --- | --- | --- |
| `app/src/eye/*.ts` (barcode, detection, capture) | 1,733 | No. Not UI. Reused as is. |
| `voice.js` 626, `store.js` 386, `api.js` 151, `pack.js` 288, `offline-aisle.js` 117, `corrections.js` 99, `router.js` 98, `main.js` 77, `device.js` 39, `flags.js` 20, `eye-attach.js` 317 | 2,218 | No. Not UI. Reused as is. |
| `shin.js` (avatar state machine plus drawing) | 600 | Partly. The states stay, the drawing is replaced by the retro sprites. |
| `screens/*.js` (ten screens) | 3,546 | **Yes.** |
| CSS | 2,939 | **Yes.** |
| `index.html` | 35 | Yes. |

Hand-written front end: **9,338 lines**. Retro prototype: **4,518 lines** (4,351 of JS and CSS
plus a 167 line index).

**The honest version of the ratio: 6,520 of those 9,338 lines are screen and style, so roughly
seventy percent of the visible layer is rewritten, not a third.** What survives is 2,818 lines of
engine-facing JavaScript plus the 1,733 line eye. That is still the thing that makes this
tractable, but it is a rebuild of the surface and should be planned as one.

`camera.js` alone is 1,887 lines, more than half of all screen code, and it holds six separate
sheets: candidates, price pad, working, text route, going rate, verdict and refusal. That single
file is why stage 0 exists.

**The retro shell is not foreign to the instructions.** Its motion durations are quoted from the
avatar contract, the same numbers the current camera screen cites by row in its comments: face
morph 220ms, verdict land 260ms, refusal land 340ms, pleased nod 260ms. It already implements
thirteen faces, three personalities, the palette, and the rule that a refusal is never red. Its
own sizing table even reserves a 220px face for a share screen it never built. It was written
against these documents and stopped at the happy path.

What it lacks is everything in the usage document past a single scan.

---

## 1. The reconciliation

Every instructed feature, against what the current app has, against what the retro shell has,
with the call. **Source** names where the instruction lives.

### Carry across, already built, needs re-dressing only

| Feature | Source | Current app | Retro shell | Call |
| --- | --- | --- | --- | --- |
| Live viewfinder, real barcode read, hold-to-confirm | decisions 2,3,4,15 | Built, working | Fake `identify()` on an 8-entry script | Delete the fake. Mount the real eye behind the retro frame marks. |
| Permission primer 1.2s before the system sheet, shutter relabelled | drop-off 1 | Built | Built, and better | **Adopt the retro primer.** |
| Denied-camera fallback: drawn shelf, screenshot promoted to the shutter, one line, never a wall | drop-off 1 | Built | Has a drawn demo shelf, no fallback logic | Retro art, current logic. |
| Frozen frame with identity chip | script A | Built | Built | Re-dress. |
| Three-detent sheet (peek 46%, half 72%, full) | usage 7, design 4 | Sheet exists, detents partial | One fixed sheet, drag dismisses | **Rebuild.** The detents are where four of the five post-verdict actions live. |
| Spread rail, confidence dots, confidence sentence, provenance in mono | usage 7 | Built | Has the typographic block (GOING / LOW / HIGH / N SELLERS) | Retro typography, real numbers. The block maps 1:1 onto the spread and the distinct-seller count. |
| Watch it / Save it, label keyed by **tier** not personality | usage 7 item 1 | Built | `WATCH` button, in-memory, resets on reload | Retro button, current persistence, plus the nine tier-by-personality strings. |
| Correct it, on every outcome, never leaving the frozen frame | usage 7 item 2, refusal change 3 | A separate route that repaints the screen. **This is a known defect and the instruction says fix it.** | A repair input that fires a toast and does nothing | **Rebuild as a detent.** Neither side has it right. |
| Share card, no download link | usage 7 item 3 | Built, 347 lines | Absent | Port, re-dress at the reserved 220px face. |
| Thumbs on a verdict, rewarded with nothing | gamification, in v1 | Built | Absent | Port. |
| Refusal: one action per reason, fixed sentence, no red, no shake, no buzz | usage 4 | Built | **Absent entirely.** No refusal exists in the prototype. | **Build.** See section 3. |
| What I can price, measured by asking the engine | refusal actions | Built | Absent | Port. |
| Past scans, watchlist with badge, weekly line, "Shin was right" record-only | gamification, in v1 | Built | Absent | Port. |
| Personality choice and setup | avatar contract | Built | Three personalities in the mascot lines, no chooser | Port the chooser. |
| Removed, licences | compliance | Built | Absent | Port unchanged. |
| Offline aisle, service worker, scan log, correction flush | committed 2026-09-07 | Built | Absent | No UI change except the offline sentence. |
| Scan meter switch, built and defaulted off | usage 6 | Flag exists | Absent | Carry the flag. No visible surface. |

### Build new, neither side has it

| Feature | Source | Why it does not exist yet |
| --- | --- | --- |
| **The next-hint-chosen-to-succeed rule** after any refusal | refusal change 6 | Specified, never built. The pieces exist: the record screen already fetches measured coverage from the catalogue endpoint, so the hint has a real source to read. |
| **The refusal sheet** at 12% grey, 2px dashed, dashed-circle face 96px, one slow blink | refusal script | The retro shell has no refusal state at all. The current app has the behaviour and the wrong skin. |

### Corrected after counting: the keypad already exists and works

The pixel keypad is a **re-dress, not a fresh build.** `camera.js` already carries a full price
pad: digits 0-9, decimal, backspace, Clear, Skip, a confirm key that stays disabled until a
price is entered, and **both** sale modifiers, a `% off` toggle and an `N for $` toggle that
computes the effective price. The multi-buy divider I listed as unbuilt is built. `correct.js`
carries a second, plainer keypad with an `On sale` chip.

Two rules are already enforced in that pad and must survive the re-dress: nothing submits until
the confirm key is pressed, with no debounce on a typing pause, and the verdict is computed
against the number displayed. The retro side contributes the pixel look and nothing else.

The remaining question for stage 2 is whether the two keypads stay two. They should not. The
standalone correction screen exists because correcting a price today leaves the frozen frame,
which the instructions say to fix. Fix that and one pad serves both.

### Adopt from the retro into the backend, my discretion

| Retro feature | Why it earns its place |
| --- | --- |
| **The store picker at the start of a trip** | The refusal's keep-it action has to record a price "at Metro, today". Today the app has no honest way to name the store. Asking once, at the start of a trip, on a screen the person is already passing through, is a real answer to a real gap. **Constraint: the picked store is provenance for a price the user typed and is never a source of a price.** |
| **The boot screen** | It is the only place the app has to say what it is before it asks for the camera, and the permission primer works better after it. |
| **The typographic verdict block** | Better than the current sheet at the same job, and it maps onto fields that already exist. |
| **The drawn shelf** | Better art for the denied-camera fallback that is already required. |
| **`scanfx` and the frame marks** | The current viewfinder already draws an in-progress barcode mark; the retro draws it better. |

### Delete on arrival, do not port

| Retro feature | Why |
| --- | --- |
| The 24-product fake catalogue and its `verdict()` | Fabricated price data. Hard rule 3. |
| The 8 fake store names | Same. |
| The scripted 8-entry `identify()` | Same. |
| **The 8 icon categories** | There are five real categories and produce throws. Eight buttons, three of which cannot answer, is a promise the engine cannot keep. |

### Do not carry, from the current app

Counted in `store.js` on 2026-09-07: five saved fields are written or declared and read by no
screen at all. `city` (never read or written), `drops` (declared for a demo mechanic nothing
touches), `scanCount` and `shareCount` (both incremented on every verdict and every share,
displayed nowhere), and `proUntil` with its `isPro()` (a paywall scaffold with no paywall screen
registered). The move is the moment to drop them.

Two voice lines, `watching_feed` and `dropped`, plus the watchlist drop-card markup, are gated
behind a feed flag that is off because the pilot's retailer fetches all failed. Those stay: the
flag is a real switch waiting on a real feed, not dead code.

### Legally required, port unchanged

The market and licences screens are not optional furniture. Attribution is **fetched, never
hardcoded**, and an empty response is treated as a failure rather than as "no sources", because
rendering "no sources" would state the opposite of the truth. Both move across with their
behaviour intact before the old app is deleted.

---

## 1b. The rules that are not features

A large share of the instructions are not screens. They bind the retro shell exactly as hard,
and three of them collide with it.

### The retro palette is measurably better, and that is the strongest single argument for the move

Contrast computed on 2026-09-07 with the standard relative-luminance formula, on the retro
tokens as declared in `Test/src/styles/tokens.css`:

| Pair | Ratio | 4.5 required |
| --- | --- | --- |
| good on good-ink | 7.21 | pass |
| good-bright | 10.99 | pass |
| fair | 8.37 | pass |
| fair-bright | 11.55 | pass |
| walk | 4.88 | pass |
| walk-bright | 6.53 | pass |
| unknown | 4.82 | pass |
| unknown-bright | 6.89 | pass |

**All eight pass.** The recorded flaw list found two of four failing in the current build, down
to 2.51, on the one screen the product exists to deliver, and all four failing again in light
theme because light theme was never re-coloured. The retro shell fixes the product's worst
recorded defect as a side effect of being adopted.

Two near misses to fix on the way in, not after: `--ink-faint` on ground is **4.31** and
`--brand` on ground is **4.29**. Faint ink is where provenance text will land, and provenance is
the honesty layer, so it has to clear 4.5. Brand is never a verdict colour by rule, but it still
has to be readable where it is used.

### Conflict 1: the type system. His call, not mine.

The design system names three typefaces with strict roles: a display face for the price numeral
and the verdict word only, a UI face for everything else, and a monospace reserved for
provenance, because **mono is the signal that a line is a recorded measurement** rather than the
app talking. It also requires tabular figures on every currency figure, so a price does not
change width as it changes.

The retro shell declares two fonts and both are pixel: `Press Start 2P` for display and `VT323`
for body. Everything is monospace-flavoured, so the mono signal stops meaning anything, and
neither face has a tabular-figures guarantee.

Three ways out, and this one is his:

1. Pixel display face for the verdict word and price hero, keep the UI face and the provenance
   mono underneath. The retro look survives where it matters and provenance keeps its signal.
2. Pixel everywhere and invent a different provenance signal, most plausibly a rule and a colour
   rather than a typeface.
3. Drop the typographic rule.

My recommendation is 1, and it costs the least of the retro look.

### Conflict 2: there is no light theme in the retro shell

The retro tokens declare one ground, `#0B0C0E`. The current app has a theme switcher with
system, light and dark. Either the switcher goes and the app is dark-only, which is defensible
for a thing used in a shop and under a phone torch, or a light palette gets drawn and contrast
computed on it before it ships. Shipping the switcher with nothing behind it is the worst of the
three. **My call, unless he says otherwise: dark only in the first release, switcher removed,
and the reason recorded.** Half of the recorded contrast defects are light-theme defects that
exist only because a switcher was shipped ahead of a palette.

### Conflict 3: a shipped line already breaks a hard instruction

`voice.js` ships *"Watching. I will say something under $1.47."* The instructions say flatly that
the app must never promise to look again, because there is no source that can be re-queried, and
that a promise it cannot honour sits in the same family as a fabricated price. The avatar
document flags this as unresolved and the fix was never made. **It gets fixed during the move,
not after**, because carrying it across would be knowingly shipping it twice.

### Carried unchanged, and each one binds the retro shell

- The going rate is the **median** of the comparable set, lower middle value on a tie. Never an
  average. The spread rail never shows an average, because an average of prices nobody paid is a
  fabricated number.
- Tabular figures on every currency figure.
- Brand pink is never a verdict colour.
- A hollow verdict and a solid verdict must never be confusable at arm's length.
- Nothing ever counts up.
- The face never re-morphs while the user is reading, row-size faces never animate, and a
  refusal gets one slow blink and nothing else.
- Under reduced motion every listed movement becomes an opacity fade of the same duration.
- Unprompted avatar appearances: at most two a session, four a day, zero push.
- The intense faces are gated. Very pleased needs at least 25% under the going rate **and** at or
  below the lowest comparable **and** high confidence. Angry needs at least 40% over **and**
  above the highest comparable **and** the asking price and seller both visible on the same
  screen, and never on the going-rate card.
- Every avatar file carries its namespace attribute. Its absence already silently broke a share
  card export once, dropping the eyebrows with no error thrown.
- No savings arithmetic, in the app or in any export, and never the words saved or savings.

### One state that does not exist on either side

The going-rate case needs its own avatar state, working name `asking`, for "I know the range and
I want the price". Until the art exists the instruction is to use the thinking face at 76px. The
retro shell has thirteen states and this is not one of them.

---

## 2. The order, and why

Sequenced by what cannot be taken back, and by which screen a person actually meets most.

**Stage 0. Cut the seam, with no retro work at all.**
Move the decision logic out of the camera screen into plain modules: the catalogue lookup with
its offline fallback, the refusal-reason to single-action mapping, the next-hint chooser, the
tier-to-label mapping. The check is that the **current** app behaves identically afterwards.
Nothing about the retro shell is touched. If the transition stalls here, the app is better
anyway and nothing is lost. This is the only stage with no visible change and it is the one that
decides whether the rest costs one week or three.

**Stage 1. The shell, with the real eye behind it.**
Retro tokens, sheet, mascot sprites and frame marks into the app. Real router, real camera, real
barcode. Boot, store picker, primer, viewfinder. The fake catalogue, fake stores and scripted
identify are deleted in the same commit that mounts the real ones, so there is never a build in
which a fabricated price can render. Check: scan a real barcode, get a real name on screen.

**Stage 2. The tag.** Re-dress the existing pad in pixels and merge the two pads into one, which
is possible only because stage 4's correction detent removes the reason the second one exists.
Check: on a multi-buy tag, the number the verdict is computed against is the number on screen,
and nothing submits before the confirm key.

**Stage 3. The refusal, before the verdict.**
This inverts the obvious order and it is the most important call in this document. Five of seven
scans refuse. Only three products in the whole corpus currently return a verdict with a named
store. **The refusal is the app's main screen and the prototype never drew one.** Building the
verdict sheet first would produce a beautiful screen almost nobody reaches, on top of a hole
almost everybody falls into. One action per reason; keep-it recording a dated price at the store
the picker named; the sentence that must never change; no red, no shake, no promise to look
again; the session ending on a live viewfinder.

**Stage 4. The verdict sheet, three detents.**
Peek: face, verdict word, price hero, asking seller, confidence, the stand-in note when the
asking price is one. Half: spread rail, confidence sentence, provenance, correct, share. Full:
what was used, dates, promo limits. Watch or Save keyed by tier.

**Stage 5. The record.** Past scans, watchlist with badge, weekly line, what-I-can-price,
removed, licences, personality chooser, share card.

**Stage 6. The swap.** The retro app is served at the root, the old screens and CSS are deleted
in one commit, and the check is walking all three scripts end to end on a phone-sized viewport
with the acceptance line of every feature above read out loud and run.

Stages 0 through 2 are one thread. Stages 3, 4 and 5 are independent of each other and are where
delegation pays.

---

## 3. The near-empty store, decided

His instruction was to do what is best on the instructions already given. Those instructions
decide it, and my first answer got it backwards.

**Correction.** I had this section reading "design the refusal well." His stated priority one is
the opposite, in his own words on 2026-09-05: *"The worst thing this app can do is tell people
it doesn't know because that literally wastes the users time."* The repo's priority one is
**always answer; the confidence carries the doubt.** Separately, the line "a wrong verdict is
worse than no verdict", which older design documents lean on hard, was written by Claude and
**he disavowed it on 2026-09-06**: *"this is not created by me its assumed by claude."* Anything
in this plan built on that sentence is built on nothing.

So the goal is not a better refusal. It is **fewer refusals**, without inventing a number.

The prototype's answer is invention: 24 products, 8 shop names, a scripted scanner that always
finds something. That is forbidden and it goes.

The real answer is the going-rate card and the hollow treatment, both already specified and
both already half built. Between "here is a verdict" and "I cannot help you" there is a third
thing the design system already has language for: **the range I do have, drawn hollow, with the
seller count in mono saying exactly how thin it is.** A wide honest range is an answer. A grey
panel is not.

Concretely:

1. Refuse only where refusing is the truth: no identity at all, or a category the engine does
   not cover. Those two are honest gaps.
2. Everywhere else, answer with what exists and let the fill carry the doubt. One seller and a
   stale point is a hollow field with two dots of four and the words "Thin, 1 seller", not a
   refusal. This is the single change that moves the five-in-seven refusal rate most, and it
   needs no new data.
3. Five categories, not eight, and produce is not offered.
4. After any refusal that does happen, the viewfinder hint names the category the engine answers
   best, read from the measured coverage the record screen already fetches.
5. Keep-it is a thing the app verifiably did: it wrote down a price, dated, at a store the
   person named.
6. No promise to look again, ever, until a source can actually be re-queried on a schedule.
7. A refusal never spends anything.

**Counted, not guessed.** Refusal reasons in `scoreboard/2026-09-03-corpus.json`, the seven
hand-priced items, read on 2026-09-07:

| Reason | Count | Honest gap, or should have been an answer? |
| --- | --- | --- |
| `too_few_points` | 2 | **Should have been a thin answer.** Points exist, just few. |
| `no_source_response` | 1 | Honest gap. Nothing was found. |
| `category_unsupported` | 1 | Honest gap. |
| `identity_unsure` | 1 | Honest gap, and the one that most often becomes a verdict once the person picks. |

**Withdrawn, 2026-09-07, on inspecting the two rows.** I wrote that these two are refusals only
because a threshold says so and become hollow answers for free, taking the answer rate from two
in seven to four in seven. That is wrong, and it was the headline of this section.

Both rows carry `pointCount: 1`. Grocery's rule needs 2 points from 2 distinct sellers; the
category rules are in `spine/src/categories.ts`. One point is not a thin range, it is a single
number, and its median is itself. Worse, the second row is the Sony WH-1000XM5 and the corpus
records what that single point is: *"observed: the list price, which is the only number the
pilot found"*, with the line *"Only list price found, which is not a comparison."* Rendering
that as a going rate would tell a person that the manufacturer's asking price is the market.
That is the confidently-wrong answer this whole product is built against, and it would have
been produced by a change I recommended in order to answer more often.

The correction does not restore the refusal. His priority one still stands: the worst thing the
app can do is say it does not know. But the answer for these two is **a different sentence, not
a looser threshold**. For the headphones the honest answer is that the only number found is the
list price, which is what the seller wants, not what people pay. That is an answer, it is
useful, and it is true. It is not a going rate.

**So the real gap is a fourth outcome**, alongside a verdict, a going rate and a refusal: one
observation, named for what it is. How many of the seven that covers is two. How many of the
world it covers is unknown and needs a wider corpus.

**This is a seven-item sample and it is the entire measured corpus.** It is the number the repo
has, not a number about the world. It is enough to order the work and not enough to quote as a
rate. Widening it is a separate job.

**Reverses if** a re-queryable feed ships for the lead category, at which point the price-drop
return trigger is the first thing built and the notification permission is asked immediately
after the first save.

---

## 4. Three questions the rebuild cannot answer for itself

Each one changes what gets built, and none can be settled from the repo because the repo
contradicts itself.

**1. Does the user pick the attitude, or does one voice ship?** The current status file says he
decided on 2026-09-03 that the user picks from three. The queue file says one voice ships and
the picker is deferred, reopened only by reviews asking for a gentler Shin. Nothing resolves
them. The picker is a screen, three sample lines and a stored preference, so this decides real
work either way.

**2. What does the app tell people about their data?** The app currently says on screen
*"Everything stays on this device. Nothing is sent anywhere but the local server that answers a
scan."* His stated intent is the opposite: *"we will collect all of a users' scanned data, and
all of it will be used to both train our models and also to answer other people."* And
server-side storage of corrections, keyed to the per-device id, is already built and recorded as
built. Three sources, three different stories, and one of them is a promise printed in the
product. This is the one item on the list that is not a design question.

**3. Push the four commits, and to which remote?** Unanswered since the first time I asked.

## 5. What this plan does not decide
- The photo identification path, which needs a model key this machine does not have.
- The shared category tag defect that gates showing cheaper options in the sheet. It has to be
  fixed before stage 4 draws that row.
