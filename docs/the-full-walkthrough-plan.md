# The full walkthrough: execution plan

Written 2026-09-15, against `docs/the-full-walkthrough-spec.md`. This plan is executed
automatically the same session it is written, unattended: he said he will not be available to
answer questions while it runs, so nothing below waits on him. Every open decision point the
work turns up is written into the output documents themselves, never asked as a question.

## Section list

Built from an actual directory survey of every package (`app`, `identify`, `price`, `catalogue`,
`spine`, `native`, `mac`), not guessed. Section 1 is already written
(`docs/walkthrough/barcode-to-verdict.md`) and is the calibration reference every other section
is checked against for grain and rigor.

1. Capture, identification and the barcode-to-verdict pipeline. **Done already**, reused as the
   reference example, not re-run.
2. Photo-based identification: the separate route a photo scan takes, which model providers it
   actually calls today, the request and response shape for each, and how confidence and
   tech-variant handling feed into it.
3. The grounded-result legal wrapper itself, in full: the box that cannot be stringified or
   saved, its sanctioned exits, and the retention reaper, as the one canonical explanation the
   other sections lean on.
4. Shin's own price engine and where its price data actually comes from (its own crawlers and
   sources), independent of anything Gemini does.
5. The gauge and verdict math in full, including the handling for products with different
   technical specs (the tech-variant question he asked and never got answered on paper).
6. The recording and retention layer, checked directly against the "record everything" rule:
   what is actually logged, what is only logged in summary, and what is not logged at all.
7. Catalogue data acquisition: how the multi-million-row reference table is actually built from
   outside sources.
8. Catalogue serving: how a live query is actually turned into a match, including near-misses
   and alternatives.
9. The price history spine: the harness that measures how well the pricing pipeline is doing,
   independent of any single scan.
10. Frontend shell and navigation: what decides which screen is on screen at any moment.
11. Frontend, the camera and scanning screen: every visible state during capture.
12. Frontend, confirming the item: "not this," typed search, and the price pad.
13. Frontend, the verdict screen: the client-side half of the price line, checked against what
    section 5's math actually returns.
14. Frontend, setup, consent and the legal/market screens.
15. Frontend, watchlist, past scans, ratings and corrections.
16. Frontend, profile and sharing.
17. The mascot voice and copy system: how Shin's personality actually gets onto a screen, since
    the product is mascot-led by its own one-line description.
18. The offline and installed-app layer: what happens with no connection, and what installing
    the app actually changes.
19. The native phone wrapper: how the same web code becomes an iOS and Android app, and what the
    native layer adds that the browser could not do alone.
20. The mac-hosted beta server, its tunnel, and the admin routes that let a session read what
    real testers actually did.

Twenty sections total, one already done. This count came from what the repo actually contains,
not a target picked in advance; a section was split out on its own only where it is a distinct
mechanism a reader would separately care about, and merged where two files tell one story (Shin's
own crawlers sit inside section 4 rather than standing alone, for instance).

## How each section is produced

Every section runs the same three-role loop, independently of every other section, so no
section waits on another to finish:

1. **Draft.** An agent reads the spec and the calibration reference, is given the real file list
   for its section (plus instructions to look further if the files reveal more than expected),
   and writes the section to its own file, opening every source it cites rather than
   summarizing from a plan document alone.
2. **Verify.** A second, independent agent reads the spec, opens the written section, then picks
   several specific factual claims in it and re-opens the underlying files itself to confirm each
   one word for word, specifically including any quoted request text or algorithm. It fails the
   section on: any code identifier or file path in the reader-facing text, any claim it could not
   independently confirm, any step involving a model call that is not fully broken down (what is
   sent, how, what comes back, how it is read), any decision stated without a sourced reason, any
   rule-versus-code disagreement resolved silently instead of flagged, any em dash, or missing
   frontend coverage where the section's scope includes a screen.
3. **Fix.** If verification fails, a third agent is given the specific list of failures and the
   file, and corrects it by reopening the real sources, not by rephrasing. This repeats up to two
   times per section. A section still failing after that is written into the assembly step
   honestly, as needing more depth, with the exact remaining gaps named, never quietly accepted.

## Assembly

Once every section has gone through its loop, one last step:

- Writes `docs/the-full-walkthrough.md`, a plain index of every section, what it covers, and its
  state (finished, or finished with named gaps).
- Writes `docs/the-full-walkthrough-decisions.md`, collecting every open decision point and every
  rule-versus-code contradiction found anywhere across all twenty sections into one place, named
  individually, so he never has to hunt through twenty documents to find them.
- Adds a dated line to `notes/catch-up.md` noting the walkthrough was produced, so any other
  session working in this tree, and he himself, sees it was done and where.

## What this plan does not do

It does not change any code. Every section is a description of what exists and what is planned;
nothing here builds the barcode button, the single combined Gemini call, or anything else a
section finds missing. Those stay open items in the decisions document for him to act on.
