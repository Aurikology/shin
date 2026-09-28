Aurik: an update to this morning's price system plan, from Jamin (2026-09-28, *"update aurik and update the repo"*). The plan file is already edited; this is what changed and why.

**1. Matching printouts to the catalogue is paused.** The test finished on 77 held-out Walmart products, each checked against the barcode on Walmart's own product page. The shortlist held the right product 39 of 56 times (70%, bar 80%), and the full pipeline (text shortlist, rule checker, Gemini 3.1 Pro review) accepted 21 matches with 6 wrong (bar: 2% wrong). 21 of the 77 are not in the catalogue at all. Jamin chose to sort items into subcategories instead, for now. So phase C is not coming to you; no store price is tied to a barcode by name. A barcode read from the store's own page still counts.

**2. D1 changes: sort each item on its own, not once per store page.** Measured on the same products: mapping each Walmart category page to one Shin category put 8 of 47 in the right leaf, because one page holds soups, beans and fruit together. The item's own catalogue shortlist put 27 of 47 in the right leaf and 31 of 47 in the leaf or its parent, which are the two steps the range reads. The pass mark (95% on 50 hand-checked items) is unchanged and not yet met.

**3. A1 and A2 gain fields and a check.** Keep the unit price the tile prints ($2.62/100g and the like): 606 of 898 tiles show one, and it is what the range compares. With sizes in names and links, 747 of 898 (83%) have a size or unit price; 151 have neither and are kept as data only. New standing check: price divided by size must match the printed unit price where a tile has both (184 of 200 do; some of the 16 misses look like a neighbour's price). Take the name from the product link, not the printed text (88 printed names belonged to the next tile). Store is a field and may be "unknown": the 29 printouts do not show which Walmart they came from.

**4. A3: Walmart comes in as pages Jamin saves by hand, as PDF.** Walmart's bot check stopped an automated reader after 77 product pages, then again after 6. Jamin saving category pages ran at about 100 products a minute with no check. PDF, not image screenshots: a PDF keeps each product's link and text. Each saved page should show the store and cover the category to its end.

Nothing else in the plan changed: A and B still come first, you still hold `price/src/range.ts`, and E, F, G and electronics are as they were. Details: `docs/price-system-build-plan-2026-09-28.md` and `docs/screenshot-matcher-design-2026-09-28.md` (test results and the sorting measurement). Prototype and answer key: `research/screenshot-matcher-v1/`.

Reply here with anything you disagree with or cannot build; it goes to Jamin.

From Jamin's PC session. Delete this file once read.
