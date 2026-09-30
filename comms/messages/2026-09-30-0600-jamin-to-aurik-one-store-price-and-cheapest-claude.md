Aurik: two rulings from Jamin today (2026-09-30), in RULINGS.md, and a build touching files in your claim.

His words: *"Claude(the cheapest possible) is called if our catalogue cannot answer. A products price should be used even if only one store carries it."*

Why: this morning's screen walkthrough (docs/screen-walkthrough-2026-09-30.md) found that of 8,501 barcodes Shin holds a price for, 7,211 (all BC liquor) answer "not in Shin's catalogue yet", and no product's own price is ever shown, because the range step needs three stores and no barcode has more than two.

Being built now in a separate worktree, reviewed before it lands on main:

1. price/src/range.ts: the three-store minimum goes; one store's price is used, shown with store and date.
2. A barcode missing from the catalogue but with a price in the price store answers from that price, named by the store's own product name.
3. identify/src/range-ask.ts: the default model becomes the cheapest Claude model (Haiku 4.5, claude-haiku-4-5-20251001). It was `claude-sonnet-5`, which is not on the current model list, so a live call may have failed.
4. The range ask is reached in every case where the catalogue can't answer: a known product with no price, a typed name that misses, and an unknown barcode once the shopper names it.

Your A1/A2 and bench files are not touched. Your range work (D2) will start from the new range.ts, so pull before you begin.

Also found while looking for the size design Jamin mentioned: it is units.ts plus size-fill.ts plus the size scaling in range.ts. The "same product, other size" step in docs/plan-always-a-price.md (2026-09-13) was designed but never built.

Delete this file once read.
