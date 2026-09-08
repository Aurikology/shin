# The pass

One week long, fixed. The length is fixed because an open-ended pass is how a stall hides. The
six steps below are the same every time and they run in order. `QUEUE.md` is what the pass
consumes; `SCOREBOARD.md` and `DEFECTS.md` are what it reads and writes.

This is the loop from `pages/shin-terminating-loop.html`, written as something a person
actually runs. If the two disagree, the plan wins and this file gets fixed.

---

## Gate: what must be true before the pass starts

If any of these four is false, **the pass does not start and fixing it is the pass.** Check them
in order and write the answers down somewhere the next pass can see.

| # | Invariant | How to check it here |
| --- | --- | --- |
| i | **The queue is written down and finite.** Nothing is built that is not in it, and nothing enters it without something else leaving. | Open `QUEUE.md`. Every row has a state. If work happened last week that has no row, invariant (i) is already false. |
| ii | **Every item has an acceptance test and a falsifier, both written before work starts.** If the falsifier cannot be written, the item is not understood well enough to build, and understanding it is the item. | For the row you are about to take, both columns are filled and neither says "to be written". Several band 3, 4 and 5 rows in `QUEUE.md` say exactly that today, on purpose, and writing them is step 2. |
| iii | **The scoreboard has a number for last week,** produced whether or not anyone looked at it. | `SCOREBOARD.md` has a row dated inside the last seven days. If it does not, produce one before anything else: `cd spine && npm run corpus -- --write`. |
| iv | **Nothing that exited is back without new evidence.** Any decision can reopen, but it reopens on a new observation and never on a fresh opinion. | Read the closed register in `QUEUE.md`. If something killed or parked is being worked on, name the observation that reopened it. If you cannot name one, put it back. |

Nothing is permanent except the law. Invariant (iv) is not a wall, it is a receipt.

---

## Step 1. Read the evidence before touching the queue

**What to do.** Read the scoreboard's number first, then the defect log, in that order. They are
allowed to reorder the queue, and this step happens before anyone looks at what they wanted to
build. Doing this second is the classic inversion: it produces a plan that survives contact with
nothing.

**Who.** The conductor, top tier. This step reads only and writes nothing.

**In this repo.** Read `SCOREBOARD.md`, then `DEFECTS.md`. Read the raw run
behind the top scoreboard row if the number moved: `scoreboard/*-corpus.json`.

Two things to look at in the defect log and nowhere else: whether the last column is filling up
with humans rather than tests, and whether any defect now appears twice. A defect logged twice
becomes a build standard. Once is a bug fix.

> Note, flagged rather than fixed: the plan's step 1 says the scoreboard comes first and the
> defect log second, while its step 6 says the defect log "is the only thing the next pass reads
> first". This file follows step 1's ordering. It is a one-line inconsistency in the plan and
> worth settling there.

## Step 2. Take the top item and write how it could be wrong

**What to do.** Take the top item in `QUEUE.md` as step 1 left it. Write its acceptance test and
its falsifier into the row before any code exists. The falsifier is the load-bearing half. The
walkthrough labelled its own central claim untested three times in three sections and shipped the
label instead of the test; running the test took seven searches and reversed two of the
document's decisions.

**Who.** The conductor writes the brief. **A worker never writes its own falsifier.**

**In this repo.** Edit the row in `QUEUE.md`. Rows whose falsifier column reads "to be
written in step 2" are the ones this step exists for. Where the master plan already wrote an
"exits when" sentence, that sentence is the falsifier and it is carried across unchanged rather
than reworded.

If the falsifier cannot be written, stop. The item is not understood well enough to build and
understanding it is now the item.

## Step 3. Build it

**What to do.** Build the one item. Separate lanes only where the work does not read and write
the same things; one worker otherwise. A lane costs its own review and merge, so parallelism
that is not real is a pure loss.

**Who.** Workers, middle tier, one role each, scoped so they cannot touch a sibling's files.

**In this repo.**

```
cd spine
npm test          # 32 tests as of 2026-09-03
npm run typecheck
```

Band 3's five-lane split rests on the contract in `spine/src/contract.ts` holding. Adding fields
is fine. Repurposing one, or widening a union without asking what the consumer does with the new
member, is a contract change and reopens every lane that reads it.

## Step 4. Verify with something that did not build it

**What to do.** A fresh process, no project instructions loaded, handed the acceptance test and
the change and nothing else. Then an adversary that writes nothing and only tries to produce a
wrong verdict. This is not a formality: on a spec in another project this exact pattern caught
five blockers, two of which the spec itself had introduced.

**Who.** A fresh verifier per lane, plus one adversary.

**In this repo.** The verifier gets the acceptance test text and the diff, and nothing else. The
adversary's job on anything touching price is to find an input that makes the spine answer
confidently and wrongly. The commands it has:

```
cd spine
node src/cli.ts price "<what it is>" --asking <dollars> --seller <name> --category <id>
node src/cli.ts explain <category>     # the thresholds and the reasoning behind them
node src/cli.ts sources                # which sources are available, and which are UNVERIFIED
```

The two adversary targets that are already known and already defended, so start past them: a
verdict that includes the seller being judged in its own comparison set reads "fair" every time
(defect D-003, excluded by `askingSeller` and locked by a test), and an identity that is
confidently the wrong product carries prices that are all accurate and all about something else
(the Canon EOS R6 case from the pilot).

## Step 5. Check it where its consumer meets it

**What to do.** Nothing is done on its own artifact's word. A passing test is not a verdict a
shopper accepted. For anything touching price, the consumer-side check is a person holding a
phone in a store, and twenty of those fit in one shopping trip.

**Who.** The founder, for anything user-facing. No exceptions and no substitutes.

**In this repo.** Each band 3 lane in `QUEUE.md` carries its own consumer-side check as its
acceptance test, and those are the sentences to run. For band 1 the consumer-side check is item
1.3: a fresh agent takes twenty verdicts and checks them against live sources. That is a
different check from the shopping trip and neither replaces the other.

## Step 6. Log the outcome, and let a repeat earn a rule

**What to do.** Every item leaves the pass as `built`, `killed`, or `parked` with its promoting
condition. There is no fourth state and no "in progress": work that is unfinished at the end of
the pass goes back to `queued` with what was learned attached, which either moves it up or moves
it out.

**Who.** The conductor. The log is the first thing the next pass reads.

**In this repo, in this order.**

1. Append any defect to `DEFECTS.md`, filling in its only interesting column: whether a
   test caught it or a human did.
2. If that defect is now in the log **twice**, promote it to a build standard in the same file.
   Once is a bug fix and earns no rule. The alternative was measured: twenty-eight standing
   instructions in twenty-two days in another repo, most of them backed by nothing.
3. Set the row's state in `QUEUE.md`. A killed row takes its band 5 version with it.
4. Produce the week's number whether or not anyone will look at it:
   `cd spine && npm run corpus -- --write`. It writes
   `scoreboard\<date>-corpus.json` and appends a row to `SCOREBOARD.md`.
5. Update the stall counter below.

---

## The stall counter

**Every pass must ship something or kill something.** A pass that does neither is a stall.

- One stall is a bad week.
- Two in a row is a warning.
- **Three in a row means the queue is wrong, not the work.** The next pass is spent rewriting
  `QUEUE.md` rather than working it.

Parking an item is not shipping and it is not killing. A pass that only parks things is a stall.

| Pass | Dates | Shipped | Killed | Stall? | Running stall count |
| --- | --- | --- | --- | --- | --- |
| (no pass has been run under this file yet) | | | | | 0 |

---

## The cap on the floor

**If band 3 has not shipped in eight passes, the floor was too big and gets cut rather than
extended.**

That number is a judgment, not a benchmark, and the reasoning is written down rather than
assumed: unshipped time is the most expensive thing in this plan. 68.07% of apps never reach a
thousand downloads, 0.57% of non-gaming apps ever earn a hundred thousand dollars, and none of
that improves while you build.

Count band 3 passes from the first pass that takes a band 3 lane, not from the first pass overall.

---

## What would prove this whole loop is decoration

Three passes in, if `SCOREBOARD.md` has no series and the last column of `DEFECTS.md` is all
humans, every mechanism here failed at once. That is a two-column check and it takes a minute.
Run it at the start of pass four.

The honest confidence split, carried from the plan: pass zero and band 1 rest on a measurement
taken by hand and reported in full, failures included. Band 3's lane split rests on band 1's
contract holding, which is an assumption until it does. Bands 2 through 5 rest on gates that
have never been run. And the loop itself rests on four mechanisms being executed in weeks when
nobody is watching, which no process document written in this repo has ever managed. That is why
a defect must appear twice before it earns a rule: the loop is designed to stay small, and if it
grows it has already failed.
