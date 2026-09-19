# Brief: the usage process, the OLMA audit, and the avatar

Written 2026-09-03 from his prompt of the same night. This is the plan a session executes. It
is written so that a shallow execution fails its own checks. Read it whole before starting.

His prompt, verbatim, is at the bottom. Do not work from a summary of it.

---

## 0. What he is actually asking for

Six things, and he has named the failure mode he expects: *"claude always does things on a very
surface level."* Each item below carries the reason it exists so the session can tell the deep
version from the shallow one.

1. **The usage process is the deliverable, not the screens.** *"The current app is a frame that
   barely holds up. The actual usage process is something that needs to be refined."* The app
   opens on a camera and returns a verdict. What is missing is everything around that: what a
   first-time user does in their first ninety seconds, what happens after the verdict, what
   brings them back on day two and day seven, and what they do when the answer is a refusal,
   which is the most common outcome. The shallow version redraws screens. The deep version writes
   the loop and then derives the screens from it.

2. **OLMA is a feature audit, not a mood board.** *"Take inspiration from OLMA's app, but don't
   copy their UI or design. Every single button and feature on the screens should be looked at
   and determined if it would be useful."* The unit of work is a button. The shallow version
   watches the video and lists five features. The deep version extracts every frame, finds every
   distinct screen, lists every tappable element on each, and gives each one a verdict with a
   reason. The repo's own rule applies: *deliberate fast follower, copy what works, add one spin,
   do not invent features nobody does.*

3. **The Duolingo owl is a retention mechanism to be reverse engineered, not a reference image.**
   *"Duolingo increased their retention by many times through the use of the bird so analyse what
   the bird does through their UI in depth."* The shallow version says "the owl celebrates and
   nags." The deep version enumerates every surface the owl appears on, what triggers it there,
   what it says, what it wants the user to do, and how often it is allowed to interrupt. His
   "many times" is a claim to verify with a source, not a fact to repeat.

4. **The avatar gets a behaviour contract, per screen, that a separate artist can build
   against.** *"The avatar will be designed separately so have placeholders. Think about what it
   should be doing in every single screen, what it should be saying, where it should be popping
   up. Also consider what types of animations are needed."* The artwork is someone else's job.
   The session's job is the spec the artwork slots into: states, moods, triggers, positions,
   sizes, lines in all three personalities, animations with durations, and a cap on how often it
   may interrupt. The shallow version writes a paragraph of vibes. The deep version produces a
   table with one row per screen per trigger and a placeholder in the running app that already
   obeys the contract.

5. **Emotion is tied to the price.** *"Sometimes the avatar might be mad at bad prices, sometimes
   it'll be really happy with good prices."* The existing six expressions are verdict faces. He
   wants intensity: not just walk away, but angry at a rip-off; not just good, but delighted by a
   steal. The hard rule constrains this and must be designed into it: *the aggression points at
   the price, the store, or the brand. Never at the user.*

6. **Gamification is a real design question with real risks, not a feature list.** *"If users
   find good prices, can they gain more scans per month or join a leaderboard, or enter a draw
   etc. There are so many directions."* The shallow version lists ten mechanics. The deep version
   asks, for each one, what behaviour it pays for, the cheapest way to game it, and whether gaming
   it corrupts the price data. This product's only value is being trusted about a number. A
   reward for reporting prices is a reward for inventing them unless the design says otherwise.

What he is not asking for: a rebuild. This pass designs. The build is the next pass and it
starts from what this one writes.

---

## 1. Ground truth the session starts from

- **The running app**: `app/`, six screens, no framework. Camera default, one verdict sheet
  over a frozen frame with three detents, and four pages behind it: watching, teach Shin a price,
  post it, you. Start with `cd app && npm start`, open `http://localhost:4173`.
- **The spec that wins over any screen**: `docs/design/DESIGN.md`. Fifteen screens to draw,
  fifteen components, six face expressions, three personalities. Section 3 is the face. Section 6
  is motion. Everything this brief produces ends up as changes to that file or as a sibling of it.
- **The OLMA recording**: `notes/olma/olma-walkthrough-2026-09-03.mp4`, 230 MB, gitignored
  along with `notes/olma/frames/` because Aurik pulls this repo. 99 seconds, 1206 by 2622,
  60 fps, recorded by him tonight. A first coarse look at ten second intervals
  already shows: welcome, camera permission, identifying with "Finding retailer links",
  collection with a "Fair Price" badge and a search box, camera with a "3 Scans Remaining" meter
  and a "Center the price tag or product in the frame" hint, a bottom bar of Scan, Collection,
  Settings, and an "Add More Details" button. That is the coarse pass. It is not the audit.
- **ffmpeg** is installed at
  `C:\Users\xujam\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-N-124716-g054dffd133-win64-gpl\bin\`.
- **Decisions already made**, in `docs/decisions.md`, that this pass does not reopen without new
  evidence: the verdict is a face; the button after the verdict is save, not buy; the attitude is
  the user's choice from three; produce is out of v1; the hard rules in `CLAUDE.md`.
- **The prior research** on competitors is in `pages/shin-walkthrough.html` and
  `pages/shin-hard-dozen.html`. Yuka is analysed there. OLMA is not, anywhere in the repo.

---

## 2. The work, in six phases

Each phase names its deliverable file and the check that proves it was done at depth. A phase
whose check fails is not done. Phases 1, 2 and 3 are independent and can run as three parallel
sessions if he asks for lanes; 4, 5 and 6 depend on them.

### Phase 1. The OLMA audit, one row per button

**Method, not optional.**

1. Extract every second: `ffmpeg -i <video> -vf fps=1 notes/olma/frames/s_%03d.jpg`. About 99
   frames. Then a scene-change pass to catch taps that a one second sample misses:
   `ffmpeg -i <video> -vf "select='gt(scene,0.25)',showinfo" -vsync vfr notes/olma/frames/c_%03d.jpg`.
   Read every frame. Build contact sheets of six to read them faster; do not skip frames because
   the sheet looks repetitive. A frame that looks like the previous one still gets checked for a
   changed button state, a toast, or a meter that ticked down.
2. **Screen inventory.** One entry per distinct screen or state with the timestamp it first
   appears. Include modals, toasts, permission prompts, loading states, and empty states. A
   screen with a badge that changed is a new state.
3. **Element inventory.** For each screen, every tappable, every label that carries product
   logic (a meter, a badge, a hint), and every thing that moved. Columns: screen · element · what
   it does · what user need it serves · verdict · reason · Shin's version if adapted.
4. **Verdicts are one of four**: take (copy the mechanism) · adapt (copy the need, change the
   mechanism, say what the spin is) · reject (say why, with the condition that reverses it) ·
   already have (name the Shin component). A reject with no reason is a row not done.
5. **Then the flow.** From the timestamps, write OLMA's usage process as a numbered sequence:
   what the user did, what they saw, how long it took, and where value was delivered. Note where
   OLMA made the user wait and what it showed while waiting. Note the scan meter: when it
   appeared, when it ticked, what happened at zero if the video reaches it.

**Deliverable**: `notes/olma/audit.md` with the two inventories, the flow, and a totals line.

**Check**: the totals line reads "N screens found, M elements inventoried, T take, A adapt, R
reject, H already have, T+A+R+H = M". If M is under twenty for a ninety nine second recording of
a five tab app, the audit sampled instead of enumerating. Go back to the frames.

### Phase 2. The Duolingo owl, reverse engineered

**Method.**

1. Enumerate the surfaces the owl appears on. Known candidates to confirm or strike, each needs a
   source (a Duolingo blog post, an engineering or design post, a documented screenshot, an app
   store listing, a press piece with a quoted employee): app icon variants · home screen greeting
   · lesson start · mid-lesson reactions to right and wrong answers · lesson complete · streak
   screen and streak freeze · push notification copy and its escalation · the home screen widget
   whose expression changes with time of day and streak state · empty states · the paywall ·
   friend and leaderboard screens · the "Duo is sad" and "Duo is angry" memes and what in the
   product produced them.
2. For each surface: trigger · what the owl does · what it says · what it wants the user to do
   next · how often it fires · whether it can be dismissed or turned off. The interruption budget
   is the point. Duolingo's owl is famous for nagging and still retains, so what stops it from
   being uninstalled is worth a paragraph with sources.
3. The retention claim. Find what Duolingo has actually published about the owl, the streak,
   the widget, and notifications, with numbers where they exist. Label each as: company stated ·
   independently reported · not found. His "many times" is one of those three. Do not write a
   figure that does not have a source.
4. Then the mapping. For each Duolingo surface, the Shin equivalent or an explicit "no
   equivalent, because". Duolingo's core act is a lesson the user chooses to do daily. Shin's
   core act is a scan that happens when the user is standing in a store. The owl reminds you to
   practise; Shin's avatar cannot remind you to go shopping. Say what that difference does to
   every mapped mechanic. This paragraph is where the analysis either happens or does not.

**Deliverable**: `notes/duolingo-owl.md` with the surface table, the sources, the retention
claims labelled, and the mapping.

**Check**: every row has a source or is marked "not confirmed". The mapping has at least one
"no equivalent" with a reason, because a mapping with none was not thought about.

### Phase 3. The usage process, written before any screen is touched

This is the deliverable he named first. Write it as scripts, one line per moment, with what the
user sees, what they do, and how long it takes.

1. **First session.** From tapping the icon to the first verdict, and then to whatever happens
   after the verdict. Time it. Name the moment of value. Name every place the user can drop off
   and what the app does about it. Write two versions: the user is standing in a store, and the
   user is on the couch trying the app out with a thing on the desk. OLMA's recording is the
   second case. Both must work.
2. **The refusal path.** Five of seven items end in a refusal. Write the first session again
   where the first scan is refused. What does the user do, what does the avatar say, and what is
   the one action handed back. If this script ends with the user closing the app, the design has
   failed at its most common outcome.
3. **Day two and day seven.** What brings the user back. Be honest about the options: a watched
   price dropped · a scan meter refilled · the avatar has something to say · a friend shared a
   card · nothing, and they come back when they are next in a store. Rank them by how much each
   depends on data Shin does not yet have.
4. **The scan meter.** OLMA meters scans. Shin has a paywall screen. Decide whether Shin meters
   scans, how many, what refills them, and what the zero state looks like. This joins Phase 5.
5. **After the verdict.** Save is decided. What else: correct it · watch it · share it · find a
   cheaper one nearby · a dupe. Which of these are in v1 and in what order on the sheet.

**Deliverable**: `docs/design/USAGE.md`, the scripts and the decisions. It becomes a sibling of
`DESIGN.md` and wins over it on any question of sequence.

**Check**: each script has timings, a named moment of value, and at least three named drop-off
points with the app's response. The refusal script exists and does not end in a close.

### Phase 4. The avatar behaviour contract

Depends on 2 and 3. The artist gets this file and builds to it.

1. **The final screen list.** Merge `DESIGN.md` section 7 with whatever Phase 3 added and
   Phase 1 adapted. Number them. This is the list every later table is checked against.
2. **States.** Start from the six in `DESIGN.md` section 3 and add what the usage process needs.
   Candidates, to keep or strike with a reason: greeting · idle on the viewfinder · thinking ·
   good · delighted (a steal, the intense form of good) · fair · walk · angry (a rip-off, the
   intense form of walk, aimed at the price or the store, never the user) · unknown · pleased (a
   save landed, a price dropped) · nudging (a watched item, a refilled meter) · asleep (empty
   states, nothing to say) · proud (a contributed price was confirmed by someone else). Define
   what earns the intense forms in numbers: what percentage over the going rate makes Shin angry
   rather than merely negative. Tie it to the confidence treatment: an angry face on thin evidence
   is a wrong verdict delivered loudly, so intense forms require the certain or fairly sure
   treatment.
3. **The per-screen table.** One row per screen per trigger: screen · trigger · state · where on
   the screen · size · what it says in Deadpan, Warm and Blunt · animation · can the user dismiss
   it · how many times per session and per day it may fire. Idle and empty rows count. A screen
   with no avatar is a row that says "none, because".
4. **The interruption budget.** A number per session and per day, with the Duolingo evidence
   from Phase 2 as the reference and a reason if Shin's is lower. Shin fires while the user is
   holding a phone up in a store aisle. That is not a couch.
5. **Animations.** A list the artist can build: name · what it conveys · duration · what
   triggers it · loops or plays once · the reduced motion fallback. Keep `DESIGN.md` section 6
   rules: the face morphs eyes first, nothing counts up, refusal never shakes.
6. **The placeholder.** Specify what the running app shows until the artwork lands: the existing
   SVG circle, the state name printed under it in mono, every size and position from the table
   honoured. The placeholder is the contract made visible. It is not a grey box.
7. **Hard rule 4 applied.** For every line in the Blunt column, name who it is aimed at. A line
   aimed at the user is deleted, not softened.

**Deliverable**: `docs/design/AVATAR.md`. Update `DESIGN.md` section 3 to point to it and to
carry the new states.

**Check**: the table has a row for every screen on the final list. Every row has all ten
columns. Every Blunt line names its target. The states list gives a numeric threshold for each
intense form.

### Phase 5. Gamification, decided rather than listed

Depends on 1, 2 and 3.

1. **Enumerate mechanics** from OLMA, Duolingo, Yuka, and the general pool: earned scans for
   contributed prices · streaks · leaderboards · draws · badges · a saved-money tally · referral
   scans · confirmed-price reputation · store-level "who found the best price this week".
2. **For each mechanic, five lines**: the behaviour it pays for · the cheapest way to game it ·
   whether gaming it corrupts the price data or the verdict · what data Shin needs that it does
   not have · the cost to build. A mechanic that pays for reported prices without a confirmation
   step pays for fiction, and hard rule 3 forbids the fiction from becoming a price.
3. **The saved-money tally** is the one most likely to be asked for and hard rule 2 forbids
   publishing a savings claim that was never measured. Design what a tally can honestly show:
   the difference between an asking price and the lowest comparable found, labelled as what it
   is, or nothing.
4. **Decide.** Which mechanics go in v1, which wait for the trusted reported-price layer, which
   are killed with the condition that reverses it. Write each decision into `docs/decisions.md`
   in its format: title, date, status, why, reverses if.
5. **The scan meter** from Phase 3 lands here as the first and simplest mechanic. If scans are
   metered, what earns one back must be something Shin can verify, not something a user asserts.

**Deliverable**: `docs/design/GAMIFICATION.md` and the decisions entries.

**Check**: every mechanic has all five lines. At least one mechanic is killed with a reversal
condition. Nothing in v1 rewards an unverified price report.

### Phase 6. Fold it into the spec and hand off to the build

1. `DESIGN.md` section 4 (architecture) and section 7 (screens) updated to the final list from
   Phase 4, with every added screen traced to a Phase 1 row or a Phase 3 script.
2. `docs/design/mockups.html` gets the new screens listed as to-draw, not drawn. Drawing is the
   build pass.
3. `NOW.md` gets one paragraph: what this pass decided, what the build pass starts with.
4. A closing note in chat, in his terms, no file paths: what was taken from OLMA and what was
   not, what the avatar does and how often, what gamification is in and out, and the one thing
   still undecided that is his to call.

**Check**: `DESIGN.md` and `USAGE.md` do not disagree on any sequence. A search for "TODO" or
"TBD" in the four design files returns nothing.

---

## 3. Rules for the session that runs this

- Restate the ask in one line before starting, from his verbatim prompt below, not from
  section 0.
- **Inspiration, never copying.** His words on approving this brief: *"we are not trying to copy
  duolingo or any other app, we are taking inspiration that applies to us."* A mechanic from OLMA
  or Duolingo is taken only with the reason it applies to Shin's user, a window shopper holding a
  phone up in a store aisle, standing in front of one price. "Duolingo does it" is not a reason.
  A take row without that reason is a reject row.
- Read every frame. Sampling is the surface-level fault he named. If the frame count in the
  audit is lower than the frame count on disk, say so and say why.
- Every claim about Duolingo or OLMA carries a source or a "not confirmed" label. His words are
  a source for what he wants, not for what Duolingo measured.
- No em dashes in anything written.
- Nothing in this pass writes application code beyond the placeholder contract in Phase 4, and
  even that is a spec until the build pass. This is a design pass. If a phase seems to need code
  to be answered, write the question down and move on.
- The hard rules in `CLAUDE.md` are read at the level of the act they name. Rule 4 governs
  every avatar line. Rule 3 governs every gamification mechanic. Rule 2 governs every tally.
- End by saying which of the five things happened, per phase.

---

## 4. His prompt, verbatim

> consider the shin repo: what we need to do now is keep designing the app. The current app is
> a frame that barely holds up. The actrual usage process is something that needs to be refined.
> I want you to take inspiration from olma's app, but don't copy their ui or design. Some of
> their features are very good so go through the entire video and carefully analyse each screen
> of their app. Every single button and feature on the screens should be looked at and determined
> if it would be useful for our app. The avatar for this app will be designed separtely so have
> placeholders for it for now. We plan on having this avatar function similar to the duolingo
> bird that pops up constantly throughout the ui. Duolingo increased their retention by many
> times through the use of the bird so analyse what the bird does through their ui in depth.
> Then, consider how we should implement our avatar. Think about what it should be doing in every
> single screen thorughout the app, what it should be saying, where it should be popping up. Also
> consider what types of animations are needed for the avatar. Sometimes the avatar might be mad
> at bad prices, sometimes itll be really happy with good prices. Also, think beyond the box,
> would it be advisable to gamify this app? If users find good prices, can the gain more scans
> per month or join a leaderboard, or enter a draw etc. There are so many directions this app can
> be taken in so i want you to deeply consider everything. A fault I find whenever i create this
> prompt is that claude always does things on a very surface level. So i want you to first think
> about my intentions with this prompt and then rewrite it as a plan so that claude will execute
> what i expect it to.
