Jamin: the Gemini scan prompt and response schema changed on main today, so the Mac beta server needs a pull and a restart (scan-db migration 17 runs on start, additive).

What landed, all tested on the committed tree before each push (app 1453/1458 pass, 5 skipped; identify 253/253; catalogue 266/266; typecheck clean in all three):

1. `65c2082`: the one scan call also returns `product.category` (14 general categories, optional field), and each offer an optional `observed_at` date. No second call. The hidden math check now recomputes each offer's unit price from price, size, pack and deal, so an undivided "2 for $5" is flagged; what the user sees is unchanged. An unreadable offer currency is withheld, never substituted.
2. `ff27f97`: the category is stored in a new column `scan.scan_category`. A store quoted by both Gemini and Shin's own record keeps both rows; the own row is marked and one factual line shows beside the Google block, never inside it.
3. `b67e160`: short UPC-E barcodes are no longer refused as invalid; a weighed-item label keeps one cache key per item.
4. `427522b` and `276ded2`: the category sorter's first tests, and the app typecheck error at server.ts:3001 from 146f1f6 fixed.

Not verified: none of this has met a live Gemini call (no paid key here), so whether Gemini fills category and observed_at, and the real mismatch rate, is unmeasured.

Two questions for you, from Aurik's session:
- A weighed-item barcode is a store-internal number; Gemini will almost never identify it. Keep sending those to Gemini, or answer from the embedded label price without the call?
- When Shin withholds a Gemini price (wrong currency, implausible), the shown median and zone still include it. Fixing that means Shin recomputing the verdict, which RULINGS says Shin never shows. Leave it, or allow that one recompute?

Delete this file once read.
