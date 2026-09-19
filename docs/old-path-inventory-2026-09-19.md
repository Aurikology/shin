# What the Gemini cutover left behind, and what to do with each piece

Written 2026-09-19, after `gemini-scan.ts` became the only scan provider
(fdf9300). `app/server.ts:1033` states the cutover plainly: *"WHAT THIS
REPLACED: `IdentifyStage` and the Claude identifier on the photo."*

**This decides nothing.** It establishes what is still reachable by a person
and what is not, with the check for each, so that deleting or keeping is a
choice somebody makes rather than a thing that drifts. Every reachability claim
below was traced from a served route or a screen, not inferred from a diff.

---

## 1. Unreachable: nothing a person can do gets here

| Piece | Lines | The check |
| --- | --- | --- |
| `identifyPhoto` (`app/server.ts:1810`) | ~90 | **Zero callers.** Defined and never invoked, anywhere in the repo. |
| `IdentifyStage` (`identify/src/identify.ts`) | 805 | Constructed only inside `identifyPhoto`. Jamin's audit reaches the same conclusion from the other direction: *"`modelOnce` is called only from `identifyPhoto`, which nothing calls."* |
| The pick pass (`identify/src/model.ts`, `PICK_SYSTEM`) | part of 1,162 | Reached only through `IdentifyStage`. |
| `computeGauge` (`identify/src/gauge.ts`) | 1,103 | Appears in `app/server.ts` **once, inside a comment**. No call site. The verdict now comes back in Gemini's own answer. |

Roughly **2,000 lines** that no request can reach.

Worth saying out loud: four defects were fixed in this region in the last two
days — D-122, D-123, D-125, D-126 — and the fixes are correct. They improve a
component that no longer answers anyone. That is an argument for deciding this
now rather than later, not an argument for deleting in a hurry.

## 2. Reachable, and answering nothing

**`/api/alternatives` → `alternativesFor` → `lookupPrices`.**

This is the one that matters, because it is live and a shopper hits it.

- `camera.js` calls `fillCheaper` at three sites — `3749`, `3777`, `4419`.
- `fillCheaper` calls `ctxApi.alternatives({ code, askingCents })` (`camera.js:603`).
- That reaches `/api/alternatives` → `alternativesFor` → `lookupPrices`, which
  joins on the barcode against `price/data/prices.db`.
- Counted today: **10 observations, 0 with a barcode.** Every lookup for every
  product returns the empty list.

So a shopper on those paths always reads the quiet "nothing cheaper" line, and
the screen's own comment explains why that is the wrong outcome:

> An empty result still says something, in one quiet line, because "there is
> nothing cheaper we can price" and "we did not look" are different facts and
> silence would read as the second.

The screen is telling the shopper the first sentence while the second is true.
That is D-121 seen from the front end, and it now has a second reason to move:
**Jamin's 55e24b7 says alternatives ride the one Gemini call.** Two alternatives
paths exist, and the screen is wired to the one that cannot answer.

**This is the only item here with a user-visible consequence today.**

## 3. Reachable and working: leave alone

- **`/api/search`** — `camera.js:3330` calls it for the typed-name path. Real
  feature, real users.
- **`catalogue/src/search.ts`** (1,601 lines) — serves that route, and the
  catalogue is now fed *by* scans (`scheduleCatalogueFeed`, `server.ts:1428`),
  so the store itself is load-bearing even though it no longer answers a scan.
- **`catalogue/src/market.ts`, `product-kind.ts`** — read by `gemini-scan.ts`
  to build the prompt. The catalogue did not become useless; it changed job.

## 4. Superseded but not yet proven dead

`identify/src/providers/gemini-grounded.ts` (1,297 lines). `groundedOnce` has
**zero hits in `app/server.ts`**, but this file is not in group 1 because the
grounded path has other entry points and the check has not been done properly.
Someone should finish it before it is touched.

---

## The decision, for Aurik and Jamin

Three options, and the cost of each is the reason to choose rather than drift.

1. **Delete group 1.** ~2,000 lines gone, the repo stops describing a product
   it no longer is, and nobody wastes another day improving a dead cascade.
   Cost: it is unrecoverable except from history, and the 200-photo eval still
   runs against `IdentifyStage`, so that harness dies with it. The new
   `scan-run.ts` measures the live path but has never produced a real number.
   **Deleting the old eval before the new one has run once removes the only
   accuracy figure anyone has.**

2. **Keep it dark, marked.** Leave the code, add a header to each entry point
   saying it is off the scan path and dated. Cost: it keeps reading as live to
   anyone who opens it, and two of this week's defects were found *in* it,
   which is effort that will happen again.

3. **Split it.** Delete nothing until `scan-run.ts` has produced one real
   keyed run, then delete group 1 and the old eval together, on the same day,
   with the new number in hand. Cost: the dead code stays another week.

**Item 2 above is not part of that decision and should not wait for it.** The
alternatives route is live, reachable, and answering nothing to real shoppers.
It needs either rewiring to the Gemini answer or a screen that stops promising
a search it cannot run — and that is Jamin's call, since he designed the
one-call shape.
