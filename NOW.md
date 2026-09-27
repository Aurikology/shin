# NOW, the one thing being worked on

*One screen. If any other doc disagrees about the current state, this file wins. State, not
narrative. RULINGS.md outranks this file on any specific ruling; if the two disagree, fix here.
History moved out of NOW.md on 2026-09-27: `docs/archive/now-history-2026-09-27.md`.*

---

## Current state of the beta: the catalogue

The catalogue build plan has run (`docs/catalogue-build-plan-2026-09-26.md`). Every unit is built,
parked with a number, or killed with the number that killed it. Built and verified: 0, 2, 3, 5,
6a, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18. Parked: 1, 6b, 10, three of 12's four sources. Killed
by its own falsifier: 4 (Metro, 95.4% disagreement). **Waiting on one sentence from him: unit 16.**

The catalogue tonight: 4,289,929 products, 473,773 of them sold in Canada. The phone's Canadian
pack is 473,677 rows, 6.50 MB brotli, 0 duplicate and 0 out-of-order keys (the pack shipping before
this run had 198,095 barcodes, 32%, on an ambiguous key). Grocery pack 121,896 rows, 1.47 MB. App
suite 1,378 of 1,378 (becf7d8 removed one test of deleted code).

Full findings (the answer-change measurement, the two defects found by something going red, the
five corrected readings) are in the archive under "CATALOGUE WORK, 2026-09-26":
`docs/archive/now-history-2026-09-27.md`.

**Procedural notes for the next catalogue load, still true:**
- Run the canonical-spelling pass AFTER the load, not before. Last time the duplicate cleanup ran
  an hour ahead of the British Columbia load and the load recreated the class behind it.
- After any category fill, restart the search workers: `rebuildCategories` invalidates their
  memoised tag sizes.

## What is being worked on: the tester launch

What stands between the MVP and 10-20 testers is one list: `QUEUE.md` bands 7 (launch) and 7B (the
cheaper lookup, `docs/cheap-lookup-logistics-2026-09-23.md`). Settled in code: a typed name
answers only from Shin's own data (no Gemini call), and the barcode button sends no photo. Settled
in `docs/decisions.md`: CA$3.99 a month, CA$29.99 a year, 5 free barcode scans a week once
purchases work (this matches RULINGS.md, "Shin Plus pricing and free scans": 5 a week for the
beta, 3 a week at public launch). The invite code is set on the Mac (D-164).

**The catalogue-pick identify pipeline is retired.** `d3e4f0b` (Jamin, 2026-09-19) removed
`identify.ts`, most of `model.ts`, `gauge.ts`'s dead sandbox-verification pair, the
`/api/alternatives` route and the orphaned `identifyPhoto` in `server.ts`. Gemini identifies the
product now; Shin's own catalogue does not (it still holds category/size/variant discrimination
and alternatives). Detail and the ruling this executed: archive, "SETTLED IN CODE, 2026-09-21".

**Do not quote the old "32 of 52 failures is retrieval" figure as current.** It was measured while
the catalogue still picked the product, which is exactly the work the deletion above removed from
the critical path. Aurik's ruling, 2026-09-21: re-measure before building any retrieval work on it.
No one should quote 32/52 as current.

## Open blockers

**The paid Gemini key, re-checked 2026-09-27: still missing.** The Windows PC's `.env` has no
`GEMINI_API_KEY` line at all (only `ICECAT_*` and `EBAY_*`; the Mac server's own config is not
visible from here). The refusal path lives in `photoTierRefusal` (`app/server.ts:823`) and
`geminiKeyProblem` (`app/server.ts:4103`). The blocker is not "no key", it is "no PAID key", and
that ask to Jamin has stood since 2026-09-15. Anywhere else that says a measurement is "waiting on
the key", read it as the paid one.

## Waiting on Jamin or Aurik

- **Jamin:** the paid Gemini key (above, standing since 2026-09-15). Unit 16 of the catalogue
  plan, one sentence.
- **Aurik:** nothing new open here beyond his assigned `QUEUE.md` bands.
- **The Mac (asked by mail 2026-09-27, no receipt yet):** is SHIN_GEMINI_TIER paid (unset or free
  refuses every shopper photo), SHIN_REQUIRE_DB, SHIN_GEMINI_GROUNDED_MODEL, and SHIN_GEMINI_SPLIT;
  then pull main and restart the beta server (becf7d8 removed the 2.5 split).

## Next steps

1. Ship `QUEUE.md` bands 7 and 7B to get to 10-20 testers.
2. Once the paid key lands, re-measure retrieval before building against the old 32/52 number.
3. Get Jamin's sentence on catalogue unit 16 and close the catalogue plan out fully.
