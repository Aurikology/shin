---
name: weekly-pass
description: Run one pass over the Shin queue. Every pass ships or kills something. Use whenever he asks what to work on next, at the start of a working session on Shin, or when the plan feels stuck. This is the loop the master plan terminates through.
---

# weekly-pass

The master plan is `pages/shin-terminating-loop.html`. This skill is the six steps in it, in a
form you can run. **The point of the loop is that it ends**, so a pass that neither ships nor
kills anything is a failure of the pass, not a slow week.

## The invariants, checked every pass

1. **This pass ships something or kills something.** Both is better. Neither means stop and go to
   the stall rule below.
2. **Every item is in exactly one of three states: built, killed, or parked.** There is no fourth
   state, and "in progress" is not one of them. A parked item carries the condition that
   promotes it, written down, or it is killed instead.
3. **Re-entry costs new evidence, never a new opinion.** A killed item comes back only when
   something outside this repo changed. Wanting it again is not evidence.
4. **A negative call is written with what reverses it.** Every kill goes to `docs/decisions.md`
   in that form. A kill with no reversing condition is a wall, and this project has none except
   legal ones.

## The pass

1. **Read `NOW.md`.** If it disagrees with any other document about the current state, it wins.
   If it is stale, that is the first thing this pass fixes.
2. **Take the top band that is not finished.** The bands are in the master plan and they are
   gated: nothing from a later band starts while an earlier one is open. The order is the price
   spine alone, then the cheap versions of the hard items, then the shippable floor, then the
   easy and middle items, then the hard items in full.
3. **For each item in that band, ask the one question that can kill it.** For most items that
   question is "can this be priced at all", and it is answered by the `price-by-hand` skill, not
   by reasoning. Answer it before building anything.
4. **Ship the smallest thing that survives the question**, or kill the item and write the
   reversing condition.
5. **Record it.** Shipped or killed goes to `docs/decisions.md`. Parked goes there too, with its
   promoting condition. Then update `NOW.md` so it describes the state after this pass.
6. **Check the invariants above.** Then say, in one line, what shipped and what died.

## The stall rule

Three passes in a row that ship nothing and kill nothing means **the queue is wrong, not the
week**. Do not run a fourth. Rewrite the queue: the items are too big, or they are all blocked on
the same missing thing, and in either case the fix is upstream of the pass.

There is also a cap on the floor. Eight passes over the shippable floor without it shipping means
the floor was mis-specified, and that is a judgment call to bring to him rather than a rule to
follow silently.

## What a pass is not

- Not a status update. If nothing changed state, there is nothing to report and no pass happened.
- Not a replan. Capturing something new does not re-fit the work; that happens only when he asks
  or when `NOW.md` changes.
- Not a place to add features. An item not already in the queue enters through a decision record,
  with the evidence that put it there.

## Learnings log

- 2026-09-03 — Created with the repo, from the master plan's six-step pass, three item states,
  four invariants, stall rule and eight-pass cap.
