# CLAUDE.md — Shin

A mascot-led price scanner. Point a phone at a thing, get told whether the price is fair.
Read `NOW.md` first, this file second. Auto-loaded every session, never `Read` it.

Problem statement, adopted verbatim 2026-09-03, use it as written:

> Sellers know what things are worth and buyers are guessing, so we're making the check instant
> enough that guessing stops being the default.

**This repo is shared.** Aurik Disler (`Aurikology` on GitLab) has Maintainer access. Anything
written here he can read. Nothing goes in that he should not see.

## HARD RULES

1. **No name in public until it is cleared.** Nongshim's SHIN RAMYUN is registered, first use
   1987, and "Shin Ramen" is its English-market form, so that version is dead. Plain "Shin" for
   software is unchecked. No store listing, handle, or posted video under a name that has not
   passed a CIPO search in the software classes.
2. **No savings claim until it is measured.** Competition Act s.74.01(1)(b) requires adequate
   and proper testing before a performance claim is published. The "$1,000 a year" figure was
   never measured and also mirrors a published forecast. Measure first or say nothing.
3. **No fabricated price data.** A price the app cannot source is absent, not estimated. A
   verdict with no comparable set says so. This is the whole product: a confidently wrong
   verdict a user acts on is the worst outcome available to us.
4. **The aggression points at the price, the store, or the brand. Never at the user.** Groceries
   are non-discretionary and the person scanning did not set the price.

## HOW WE WORK

- **No walls except law.** Nothing is final because an earlier session decided it. Every
  negative call is written with the condition that reverses it.
- **Re-entry costs new evidence, never a new opinion.** A killed item comes back only when
  something outside this repo changed. That is what makes "nothing is final" compatible with
  finishing.
- **Every pass ships or kills something.** Three passes in a row that do neither means the
  queue is wrong, so rewrite the queue.
- **A competitor already shipping this is validation, not a threat.** Deliberate fast follower:
  copy what works, add one spin, do not invent features nobody does.
- **The channel is short-form video.** That is the objective function, not defensibility.
- **The primary user is a window shopper**, not a buyer. Browse frequency, never purchase
  frequency.
- **Real feed from day one, never live search.** The 2026-09-03 pilot failed on method, not on
  the market: asking a search engine for a live price fails where opening a price tracker or a
  retailer API succeeds.

## REPO MAP

`NOW.md` state, wins over every other doc · `docs/decisions.md` (title, date, status, why,
reverses-if) · `pages/` the four planning documents, openable in a browser · `notes/` the
working record, including the pricing pilot and the numbers already researched.

`pages/` files are the sources for the four published web pages. Editing one does not change
the published page; republishing is a separate step.

## GIT

One remote, `origin`, `gitlab.com/jaminke/shin`, private. Commits `[scope] description`.
Never `--force`. Multi-line messages through a file, never a shell heredoc.
