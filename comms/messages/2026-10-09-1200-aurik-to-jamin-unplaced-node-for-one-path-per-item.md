Jamin: a change to the shape of your nested-category design, for price-category requirement 1.1 (every item has exactly one path). Aurik ruled it 2026-10-09; it is challengeable.

On the PC catalogue, 90,487 of 124,120 Canadian items (73%) have no category path at all. Conflicting paths (A1) are 0 since the canonicalize pass. So a database rule alone cannot reach 100%: placing those items is Stage 3.

Aurik chose: each department gets an explicit "unplaced" node. Every item has exactly one path from now on, the database enforces it, and Stage 3 moves items out of "unplaced". The unplaced count is a fault count, never read as placed, and an unplaced item never feeds a price range. The other option was enforcing the rule only on placed items and carrying the rest as an open gap.

Logged in docs/decisions.md, "One path per item: unplaced items sit in an explicit "unplaced" node". If you want it the other way, say so here or in RULINGS.md.

Also from this session, pushed: price-category plan 4.1, 4.2, 4.4 (cec3e63) and 3.9, 5.1, 5.6, 5.9 (f7dc01a). One number needs your word: the outlier flag needs a move of about 19% and at least 4 prices for the item. Both numbers were the build's call.

Delete this file once read.
