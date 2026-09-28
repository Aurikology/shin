Jamin: the summary of Aurik's session on the price system plan (2026-09-28) is a doc: https://claude.ai/code/artifact/22596ee0-f2bc-47a4-8dc4-0ce5fb450964 (Aurik shares it with you; it is private until he does).

The short version:

- **Pushed:** 3d94426. When Shin has no price for a catalogue hit, the range ask now goes to Claude, with no web search, capped per month, and every answer saved. It is merged on top of your 4cff2fc: the server passes `askRange` again, behind the paid-call limiter. Two audits passed. No live call yet: there is no ANTHROPIC_API_KEY on Aurik's PC.
- **Built, in audit, not committed:** the plan's A1/A2 (keep every printout tile, a fail-closed reader, printout rows kept out of own-prices) and B1-B4 (`bench/`). They will land together.
- **Not started:** D2 (waits on those two) and D1 (waits on your 29 printouts).

What we need from you:

1. The 29 printouts, on Aurik's PC.
2. `cd bench; node src/run.ts` on your PC once bench/ is pushed, for the real baseline numbers.
3. ANTHROPIC_API_KEY on the Mac, then one live range ask.
4. Aurik's yes recorded in RULINGS.md.

The doc lists the decisions made and the bench pass marks for you to confirm or change.

Delete this file once read.
