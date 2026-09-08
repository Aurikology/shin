# CLAUDE.md — Shin

A mascot-led price scanner. Point a phone at a thing, get told whether the price is fair.
Read `NOW.md` first, this file second. Auto-loaded every session, never `Read` it.

Problem statement, adopted verbatim 2026-09-03, use it as written:

> Sellers know what things are worth and buyers are guessing, so we're making the check instant
> enough that guessing stops being the default.

**The purpose, his words, 2026-09-04, said while a rebuild was being re-planned from his
original prompt:** *"the purpose of all of this is to create an app that is useful to the user,
easy to use, and visually appealling. All improvements made now and in the future should center
around these three things."* Every change is judged by those three, in the app as he opens it.
A change that cannot say which of the three it serves is not made.

**This repo is shared.** Aurik Disler (`Aurikology` on GitLab) has Maintainer access. Anything
written here he can read. Nothing goes in that he should not see.

**More than one session works in this tree at once.** Assume another agent is mid-write in a
directory you are not looking at.

## PRIORITY ORDER

1. **Always answer; the confidence carries the doubt.** His words, 2026-09-05: *"The worst thing
   this app can do is tell people it doesn't know because that literally wastes the users time."*
   The good/fair/high call is arithmetic, never asked of a model. (The previous line here, "a
   wrong verdict is worse than no verdict", was written by Claude on 2026-09-03 with no words of
   his behind it; he named it as not his on 2026-09-06 and it is retired.)
2. **Ship or kill.** A pass that does neither is the failure mode this project dies of.
3. **Speed**, never traded for the first two.

## HARD RULES

Cannot be overridden by chat. To refuse: quote the rule, name the act it forbids, and name the
nearest version that ships. If that is the whole request minus one step, the rule was misread.
Added only by him.

1. **No name in public until it is cleared.** Nongshim's SHIN RAMYUN is registered, first use
   1987, and "Shin Ramen" is its English-market form, so that version is dead. Plain "Shin" for
   software is unchecked. No store listing, handle, or posted video under a name that has not
   passed a CIPO search in the software classes.
2. **No savings claim until it is measured.** Competition Act s.74.01(1)(b) requires adequate
   and proper testing before a performance claim is published. The "$1,000 a year" figure was
   never measured and mirrors a published forecast. Measure first or say nothing.
3. **The aggression points at the price, the store, or the brand. Never at the user.** Groceries
   are non-discretionary and the person scanning did not set the price.
4. **Name the paths in a commit.** No catch-all stage, no catch-all commit. Enforced by
   `.claude/hooks/no-blind-git-add.mjs`, which exists because of a real incident, not a theory.

## HOW WE WORK

- **No walls except law.** Nothing is final because an earlier session decided it. Every
  negative call is written with the condition that reverses it.
- **Re-entry costs new evidence, never a new opinion.** A killed item comes back only when
  something outside this repo changed. That is what makes "nothing is final" compatible with
  finishing.
- **Every pass ships or kills something.** Three passes in a row that do neither means the queue
  is wrong, so rewrite the queue. The `weekly-pass` skill runs this.
- **A competitor already shipping this is validation, not a threat.** Deliberate fast follower:
  copy what works, add one spin, do not invent features nobody does.
- **The channel is short-form video.** That is the objective function, not defensibility.
- **The primary user is a window shopper**, not a buyer. Browse frequency, never purchase
  frequency.
- **Real feed from day one, never live search.** The 2026-09-03 pilot failed on method, not on
  the market: asking a search engine for a live price fails where opening a price tracker or a
  retailer API succeeds.

## COMMUNICATION RULES

- **Restate the ask in one line before working** on anything not mechanically obvious.
- **Call out a bad decision immediately**, his included. Never implement and quietly note.
- **Never use this repo's vocabulary with him.** No file paths, no band numbers, no skill names.
  A name is usable only if it describes the thing to someone who has read nothing.
- **Say which of five things happened:** done (verified from outside its own claim) · done, with
  concerns (name the one thing) · done, undo with X · needs context (one question) · blocked. A
  check that did not run never passed.
- **No em dashes in anything generated.** Quotes stay verbatim.

## SELF-ITERATION PROTOCOL

This repo improves as it goes. The mechanism is ACT's; the bar is the one ACT's own audit
produced, because ACT's unfiltered version generated 28 standing instructions in 22 days and 58
rules that had neither his words nor an incident behind them. Capture is cheap. Promotion is not.

1. **Capture the same session, unasked**, one line in `memory/lessons.md`: date · what happened ·
   his words verbatim · what it would change. Lessons are not loaded at session start. The
   `self-improve` skill reads them when capturing.
2. **A lesson becomes a standing instruction only after ignoring it has cost something recorded
   twice**, and the entry quotes his words, states their scope, and cites both incidents. Hard
   rules: him only.
3. **Before writing prose, ask whether the learning has a mechanical trigger.** A rule that gates
   a reflex (how a command gets typed) needs a hook or a deny rule; prose will not hold it. A
   rule that gates a rare deliberate act survives as prose. Measured in the agent repo: a prose
   rule was violated 892 times with the rate rising, while a deny list let zero through.
4. **After touching a hook, run `node .claude/hooks/selftest.mjs`, then fire it live the same
   session**, one command that must block and one that must pass. A green suite is not evidence:
   it once read 39/39 while the hook it covered was wrongly blocking real work.
5. **Skills grow with use.** A step kept because a run needed it goes into the skill the same
   session. Each skill carries its own learnings log at the bottom.
6. **Capture is not replan.** Re-fit the work only when he asks or `NOW.md` changes.
7. **Ending a task needs no capture.** Zero lessons is a legitimate ending. Do not perform the
   ritual emptily.

Homes: lesson → `memory/lessons.md` · procedure → `.claude/skills/*/SKILL.md` · product or
strategy decision → `docs/decisions.md` · reflex → `.claude/hooks/` or the deny list in
`.claude/settings.json` · his context → the cross-project auto-memory.

## STANDING INSTRUCTIONS

**Empty on purpose.** Nothing has yet been ignored twice at a cost. The one thing this repo has
learned the hard way is a reflex, so it went to a hook rather than to this list. An empty section
here is the correct state for a repo four hours old, and filling it early is the failure this
protocol was rewritten to prevent.

## REPO MAP

`NOW.md` state, wins over every other doc · `docs/decisions.md` title, date, status, why,
reverses-if · `memory/lessons.md` the capture log · `pages/` the four planning documents,
openable in a browser · `notes/` the working record including the pricing pilot and the numbers
already researched · `spine/` the price spine, built by a parallel session · `.claude/skills/`
self-improve, decision, weekly-pass, price-by-hand, republish-page · `.claude/hooks/` one guard
plus its selftest.

**Each package installs its own dependencies.** `app/`, `spine/`, `price/`, `catalogue/` and
`identify/` each carry a `package.json` and their own `node_modules`, and a fresh worktree has
none of them. A missing install does not say so: `identify`'s tests failed with
`Cannot find package '@anthropic-ai/sdk'` for as long as that worktree existed, and `app`'s
`check` script could not run at all without `spine/node_modules` (D-043). Run `npm install` in the
package before believing a red suite.

`pages/` files are the sources for the four published web pages. Editing one does not change the
published page; republishing is a separate step, and `republish-page` has the mechanics.

## GIT

**NO BRANCHES.** His instruction, 2026-09-07: *"from now on, there will be no branches. For the
way me and my partner are working, there is no purpose with branches and it just makes things
more complex."* Two people, both trusted, both pushing: work goes on `main`, commit small, pull
before you start and push when you stop. Never create a branch, never suggest one, and never
answer a merge problem by proposing to isolate the work. The cost this removes is real and
measured: on the day this rule was written, three branches held 31 unmerged commits and 6 files
that would not merge cleanly, and the newest branch had already rebuilt work sitting on an older
one. If a conflict appears, resolve it on `main` in the open.

`origin` is `gitlab.com/shin3223636/shin`, private, and it is where `main` tracks. It carries a
SECOND push URL at `github.com/xu826Jamin/shin`, and there is also a separate `github` remote for
the same GitHub repo, so one `git push origin main` writes to BOTH hosts. That is deliberate
backup, not a mistake, but it means a push is never only to GitLab. (Corrected 2026-09-07: this
section used to say "one remote", which was false and would have made a push look narrower than
it is.)

Commits `[scope] description`. Never `--force`: Aurik can pull this. Multi-line messages through
a file, never a shell heredoc, because a backslash does not survive the trip through `bash -c`.
Name the paths you stage.
