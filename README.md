# Shin

A mascot-led price scanner. Point the phone at a thing, get told whether the price is fair.

Problem statement, adopted verbatim 2026-09-03:

> Sellers know what things are worth and buyers are guessing, so we're making the check instant
> enough that guessing stops being the default.

There is code now, in `spine/`. The rest of this folder holds the thinking, so it stops living in
a temp directory that Windows can empty without warning.

## What is in here

`NOW.md` is where things actually stand, and it wins over every other file if they disagree.
`docs/decisions.md` is every call made so far, each one with the condition that would reverse it.

`pages/` are the four documents, as web pages you can open in a browser by double clicking.

- `shin-terminating-loop.html` is the master plan and supersedes the other two plans. It has the
  three ways the project ends, the three states any single item can be in, the weekly pass, and
  the queue in five bands. Two rules inside it matter most: every pass ships or kills something,
  and coming back to a killed idea costs new evidence, never a new opinion.
- `shin-walkthrough.html` is the product itself, thirteen stages from the first video someone
  sees to the habit in week two.
- `shin-hard-dozen.html` is every piece of work counted, 68 builds, twelve of them genuinely
  hard, each with a cheap version and a way to prove it wrong.
- `shin-build-plan.html` is the build order, now folded into the master plan.

`notes/session-2026-09-03.md` is the working record from the day these were made: the decisions
and why, the pricing test on seven real items and the same day correction to it, the names and
approaches ruled out with the condition that reverses each one, and the researched numbers so
none of them get looked up twice.

## The code, and the running record

- `spine/` is the price engine and band 1 of the plan: give it a product identity and it returns a
  verdict or refuses. It has its own README. Node runs it directly, no build step.
- `SCOREBOARD.md` is one row per corpus run, a number produced whether or not anyone looks at it.
  It is coverage, meaning how often the spine answers at all, which is not correctness.
- `QUEUE.md` is what is next, in band order.
- `PASS.md` is the record of each pass, which must ship or kill something.
- `DEFECTS.md` is where known defects and unresolved contradictions are logged instead of quietly
  fixed.

Band 1 is not finished. Its exit needs one hundred items through the spine and twenty of those
verdicts checked against live sources; the corpus holds seven and nothing has been checked against
a live source yet.

## The live versions

The same four documents are published and shareable:

- Master plan: https://claude.ai/code/artifact/25065389-42f1-4606-93f7-587c03999acd
- Walkthrough: https://claude.ai/code/artifact/a313dd9a-67ed-4762-9b62-25f73f0d389b
- Everything counted: https://claude.ai/code/artifact/5cdaea69-2566-427e-ae37-148250913a9e
- Build order: https://claude.ai/code/artifact/1ac26bc3-f67d-493f-9a17-9e4183441bac

Editing a file in `pages/` does not change the live page. Republishing is a separate step.

## Open, before any code

- The name. Nongshim's SHIN RAMYUN is registered and "Shin Ramen" is its English market form, so
  that version is out. Plain "Shin" for software is unchecked. A CIPO search settles it.
- The two person video test, on borrowed audiences rather than a new account.
- Thirty items priced by hand. Seven were done and one of the failures turned out to be method,
  not the market. The notes say which.
