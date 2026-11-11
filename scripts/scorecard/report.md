# Pexi scorecard: how many real bug shapes the new checks catch

Run on commit 5dfa861, 2026-11-11. Total run time 15.4 min (925s).

## Control (no mutation)

All four catchers green.

| Catcher | Control | Detail | Time |
| --- | --- | --- | --- |
| answer key | green | exit 0 {"tests":4,"pass":4,"fail":0} | 18s |
| data rules | green | rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0} | 2s |
| crawler | green | exit 0; Crawl: 150 runs, 3750 steps, 2 distinct failures (0 high, 2 low; 100 expected signals not counted), coverage 77.1% of lines and 36.8% of functions. | 101s |
| old suites | green | app: exit 0 {"tests":2011,"pass":2006,"fail":0}; ux: exit 0 {"tests":542,"pass":539,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0} | 102s |

The crawler's control run reports 2 non-expected failure(s), none high: low: tap-does-nothing @ watchlist :: tapping [button watchlist button Saved Saved] twice changed nothing | low: tap-does-nothing @ camera/idle :: tapping [button torch button Lampe] twice changed nothing. A mutation counts as caught by the crawler on exit 1 or on a non-expected failure above low severity that is not in that list. Low-severity tap-does-nothing findings change between two identical control runs (this run and an earlier one listed different ones), so they are noted and never counted.

## Matrix: bug by catcher

| Id | Family | DEFECTS | Bug | Answer key | Data rules | Crawler | Old suites | New | Old |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | 1 half-wired | D-034 | The pad prices a catalogue-resolved product by its words: proceed() sends only scannedG... | missed | missed | missed | missed | no | no |
| M02 | 1 half-wired | D-094 | The phone writes a location cell the server cannot parse (colon, 4 decimals), so every ... | missed | missed | missed | CAUGHT | no | yes |
| M03 | 2 data at import | D-267 | Prices joined to a barcode by shop-product NAME sit beside the barcode-joined ones as e... | missed (blind) | CAUGHT | missed (blind) | missed (blind) | yes | no |
| M04 | 2 data at import | D-267 | An out-of-stock row keeps its price and is read as a shop price the shop does not curre... | missed (blind) | CAUGHT | missed (blind) | missed (blind) | yes | no |
| M05 | 2 data at import | D-267 | Absurd prices attached to a consumer barcode: a $4,898.99 pallet row on a carton, and a... | missed (blind) | CAUGHT | missed (blind) | missed (blind) | yes | no |
| M06 | 2 data at import | D-257 | Every imported price is labelled Toronto: hammer.ts sets storeCity 'Toronto' for every ... | missed (blind) | missed | missed (blind) | missed (blind) | no | no |
| M07 | 3 screen walk | D-259 | The count line disagrees with the list under it ("7 prices from 7 shops" above 12 rows) | missed | missed | missed | CAUGHT | no | yes |
| M08 | 3 screen walk | D-265 | The first camera screen says every scan sends a picture while photo scanning is off and... | missed | missed | missed | CAUGHT | no | yes |
| M09 | 4 search | D-074 | Search bands `confident` on a row that matched only one word of the query (225 g Kraft ... | missed | missed | missed | missed | no | no |
| M10 | 4 search | D-245 | Typed search lists rows nobody can tell apart ("Oreo / OREO" and "Oreo", two barcodes, ... | missed | missed | missed | missed | no | no |
| M11 | 5 verdict vs evidence | D-270 | A guessed product is priced as that product and answers with its own confidence ("milk"... | missed | missed | missed | CAUGHT | no | yes |
| M12 | 5 verdict vs evidence | D-270 | A guessed product takes the barcode route, so the range card on screen is the guessed p... | CAUGHT | missed | missed | CAUGHT | yes | yes |

"missed (blind)": a data bug is planted as rows in a temp prices file; only the data rules can read one, so the other three were not run for it.

## Shares

| | Bugs | Share |
| --- | --- | --- |
| Caught by the new checks only | 3 of 12 | 25% |
| Caught by the old suites only | 4 of 12 | 33% |
| Caught by both | 1 of 12 | 8% |
| Caught by neither | 4 of 12 | 33% |
| Caught by any new check | 4 of 12 | 33% |
| Caught by the old suites | 5 of 12 | 42% |

Per catcher, of 12: answer key 1, data rules 3, crawler 0, old suites 5.

Code bugs only (8; the 4 data bugs are visible to the data rules alone): new checks 1, old suites 5, new only 0, old only 4, neither 3.

## How much of the old suites' score is the fix's own test

Each fixed bug came with a regression test in the same commit, so the old suites catch a re-planted fix by construction. This table says whether anything ELSE in the old suites went red, and whether the plant is faithful (the fix's own test red).

| Id | Old suites red files | Old red outside the fix's own test | Fix's own test red (plant is faithful) |
| --- | --- | --- | --- |
| M01 | none | n/a | no regression test exists |
| M02 | app/test/grounded-cost.test.ts, app/test/history-and-sharing.test.mjs, app/test/no-shin-in-visible-text.test.mjs, app/test/paywall-review.test.mjs, app/test/refusal-voice.test.mjs, app/test/screen-trim.test.mjs, app/test/screens-voice.test.mjs, app/test/shops.test.mjs, app/test/text-size.test.mjs, app/test/voice.test.mjs | yes | yes |
| M07 | app/test/ux/ux-provenance-count.test.mjs | no | yes |
| M08 | app/test/camera-privacy-line.test.mjs, app/test/grounded-cost.test.ts, app/test/history-and-sharing.test.mjs, app/test/no-shin-in-visible-text.test.mjs, app/test/paywall-review.test.mjs, app/test/refusal-voice.test.mjs, app/test/screen-trim.test.mjs, app/test/screens-voice.test.mjs, app/test/text-size.test.mjs, app/test/voice.test.mjs | yes | yes |
| M09 | none | n/a | yes (catalogue search test: red) |
| M10 | none | n/a | yes (catalogue search test: red) |
| M11 | app/test/grounded-cost.test.ts, app/test/history-and-sharing.test.mjs, app/test/no-shin-in-visible-text.test.mjs, app/test/paywall-review.test.mjs, app/test/refusal-voice.test.mjs, app/test/screen-trim.test.mjs, app/test/screens-voice.test.mjs, app/test/text-size.test.mjs, app/test/voice.test.mjs, app/test/wrong-product-answers.test.ts | yes | yes |
| M12 | app/test/grounded-cost.test.ts, app/test/history-and-sharing.test.mjs, app/test/no-shin-in-visible-text.test.mjs, app/test/paywall-review.test.mjs, app/test/refusal-voice.test.mjs, app/test/screen-trim.test.mjs, app/test/screens-voice.test.mjs, app/test/text-size.test.mjs, app/test/voice.test.mjs, app/test/wrong-product-answers.test.ts | yes | yes |

Old suites red on a code bug through something other than the fix's own test: 4 of 8.

## Bugs caught by neither

- M01 D-034 (1 half-wired): A seam test that drives a typed pick through the real client into the real /api/price and asserts the request body carries the picked product's barcode (the crawler's bad-route rule sees only a missing route, not a missing field).
- M06 D-257 (2 data at import): A place-label rule: no chain may carry one single city on every one of its rows when the chain trades in several provinces (count distinct city per seller).
- M09 D-074 (4 search): A typed-name probe set that pins a brand and size and adds one wrong word, then asserts the band is not confident (the answer key types full, short, no size, typo and lowercase forms, not wrong-word forms).
- M10 D-245 (4 search): A list-quality rule on typed search results: no two rows in one result list may read the same to a shopper (same words and size), run over the answer key's typed forms.

## What each catcher saw

### M01 D-034: The pad prices a catalogue-resolved product by its words: proceed() sends only scannedGtin, so the code a typed search or a barcode lookup wrote to gtin is dropped

DEFECTS row D-034 (2026-09-07), same shape as D-266 C1 (a gtin that is set on one side and not read on the other). Re-breaks the line the fix changed: `item.scannedGtin ?? item.gtin` goes back to `item.scannedGtin`.

Fix commit: 4f7b76c. Run time 102s.

- answer key: missed. exit 0 {"tests":4,"pass":4,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 1 distinct failures (0 high, 1 low; 115 expected signals not counted), coverage 76.5% of lines and 37.0% of functions.; NEW (0 above low): low: tap-does-nothing @ camera/texting :: tapping [button torch button Lampe] twice changed nothing
- old suites: missed. app: exit 0 {"tests":2011,"pass":2006,"fail":0}; ux: exit 0 {"tests":542,"pass":539,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M02 D-094: The phone writes a location cell the server cannot parse (colon, 4 decimals), so every cell is silently discarded

DEFECTS row D-094. Re-breaks cellFor() in app/public/js/geocell.js back to the pre-fix format "43.2537:-79.9208" that app/src/stores.ts parseCell reads as null.

Fix commit: see D-094 (2026-09-13). Run time 102s.

- answer key: missed. exit 0 {"tests":4,"pass":4,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 0 distinct failures (0 high, 0 low; 108 expected signals not counted), coverage 75.5% of lines and 35.5% of functions.
- old suites: CAUGHT. app: exit 1 {"tests":2011,"pass":2005,"fail":1}; ux: exit 0 {"tests":542,"pass":539,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M03 D-267: Prices joined to a barcode by shop-product NAME sit beside the barcode-joined ones as equal evidence, and one is 3x the rest (another product with a similar name)

DEFECTS row D-267, sweep Family 2 A1: 38,611 of 83,491 latest Hammer rows are name-joined, 61 of the 90 barcodes with a 3x spread include one. Planted as rows in a temp prices file, no code change: product 0000000000017 keeps its three barcode-joined rows (about $4) and gains a Walmart row joined by name at $12.00.

Fix commit: df38ae3 + 675b917 (verdict side); the rows themselves stay in the data. Run time 1s.

- answer key: missed (blind). blind: cannot read a prices file, not run
- data rules: CAUGHT. rules fired: D3=1; exit 0
- crawler: missed (blind). blind: cannot read a prices file, not run
- old suites: missed (blind). blind: cannot read a prices file, not run

### M04 D-267: An out-of-stock row keeps its price and is read as a shop price the shop does not currently sell

DEFECTS row D-267, sweep Family 2 A4: hammer.ts writes in_stock = 0 but still writes the price, and no reader looks at in_stock (6,976 priced rows). Planted as rows: a gtin-joined row for product 0000000000024 with in_stock = 0 and a price.

Fix commit: open. Run time 1s.

- answer key: missed (blind). blind: cannot read a prices file, not run
- data rules: CAUGHT. rules fired: D2=1; exit 0
- crawler: missed (blind). blind: cannot read a prices file, not run
- old suites: missed (blind). blind: cannot read a prices file, not run

### M05 D-267: Absurd prices attached to a consumer barcode: a $4,898.99 pallet row on a carton, and a 19 cent row

DEFECTS row D-267, sweep Family 2 A6: Walmart '946ml | 12/case | pallet of 60 cases' at $4,898.99 (6 rows over $200, 12 under 30 cents). Planted as rows: one over $2,000 and one at 19 cents, both on baseline products.

Fix commit: open. Run time 1s.

- answer key: missed (blind). blind: cannot read a prices file, not run
- data rules: CAUGHT. rules fired: D4=2; exit 0
- crawler: missed (blind). blind: cannot read a prices file, not run
- old suites: missed (blind). blind: cannot read a prices file, not run

### M06 D-257: Every imported price is labelled Toronto: hammer.ts sets storeCity 'Toronto' for every vendor, so a Vancouver-area chain reads "Save-On-Foods, Toronto"

DEFECTS row D-257 (also sweep Family 2 A8). Planted as rows, no code change: four vendors that do not all trade in Toronto, every row stamped store_city 'Toronto'. Their rows join the baseline, which carries a varied city per shop.

Fix commit: open. Run time 1s.

- answer key: missed (blind). blind: cannot read a prices file, not run
- data rules: missed. rules fired: none; exit 0
- crawler: missed (blind). blind: cannot read a prices file, not run
- old suites: missed (blind). blind: cannot read a prices file, not run

### M07 D-259: The count line disagrees with the list under it ("7 prices from 7 shops" above 12 rows)

DEFECTS row D-259. Reverts the e53e8fa hunk in provenanceLine(): regular dots only, shop count taken from the server's n.

Fix commit: e53e8fa. Run time 103s.

- answer key: missed. exit 0 {"tests":4,"pass":4,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 0 distinct failures (0 high, 0 low; 100 expected signals not counted), coverage 76.5% of lines and 36.5% of functions.
- old suites: CAUGHT. app: exit 0 {"tests":2011,"pass":2006,"fail":0}; ux: exit 1 {"tests":542,"pass":538,"fail":1}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M08 D-265: The first camera screen says every scan sends a picture while photo scanning is off and the policy says no image is uploaded

DEFECTS row D-265. Reverts the ef44c26 hunk: the camera shows cam_privacy_line whatever FLAGS.photoId says.

Fix commit: ef44c26. Run time 102s.

- answer key: missed. exit 0 {"tests":4,"pass":4,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 3 distinct failures (0 high, 3 low; 97 expected signals not counted), coverage 75.4% of lines and 35.6% of functions.; NEW (0 above low): low: tap-does-nothing @ agree :: tapping [input radio agree-claude] twice changed nothing | low: tap-does-nothing @ camera/texting :: tapping [button submit Chercher] twice changed nothing | low: tap-does-nothing @ you :: tapping [button you button You You] twice changed nothing
- old suites: CAUGHT. app: exit 1 {"tests":2011,"pass":2005,"fail":1}; ux: exit 0 {"tests":542,"pass":539,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M09 D-074: Search bands `confident` on a row that matched only one word of the query (225 g Kraft ANYTHING for "kraft dinner original macaroni")

DEFECTS row D-074. Removes the one line the fix added to #band in catalogue/src/search.ts: wordsMatched === 'some' no longer demotes to ambiguous.

Fix commit: D-074 (2026-09-09). Run time 104s.

- answer key: missed. exit 0 {"tests":4,"pass":4,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 2 distinct failures (0 high, 2 low; 101 expected signals not counted), coverage 76.0% of lines and 36.0% of functions.; NEW (0 above low): low: tap-does-nothing @ you :: tapping [div 5% 10% 15% 20% 25% 30%] twice changed nothing | low: tap-does-nothing @ you :: tapping [div System Light Dark] twice changed nothing
- old suites: missed. app: exit 0 {"tests":2011,"pass":2006,"fail":0}; ux: exit 0 {"tests":542,"pass":539,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M10 D-245: Typed search lists rows nobody can tell apart ("Oreo / OREO" and "Oreo", two barcodes, no size)

DEFECTS row D-245. Reverts the cc06209 hunk in dedupeListings(): the `shown` key (words a shopper reads) no longer merges rows.

Fix commit: cc06209. Run time 103s.

- answer key: missed. exit 0 {"tests":4,"pass":4,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 3 distinct failures (0 high, 3 low; 88 expected signals not counted), coverage 74.9% of lines and 35.0% of functions.; NEW (0 above low): low: tap-does-nothing @ camera/texting :: tapping [button submit Chercher] twice changed nothing | low: tap-does-nothing @ agree :: tapping [input radio agree-claude] twice changed nothing | low: tap-does-nothing @ camera/texting :: tapping [button manual-search button Recherche manuelle] twice changed nothing
- old suites: missed. app: exit 0 {"tests":2011,"pass":2006,"fail":0}; ux: exit 0 {"tests":542,"pass":539,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M11 D-270: A guessed product is priced as that product and answers with its own confidence ("milk" becomes Coconut Milk, Certain)

DEFECTS row D-270 (and D-267). Reverts the identity gate df38ae3 added in app/src/catalogue-first.ts: itemFor() keeps the guessed product's barcode, brand and size, and safeEstimate() no longer clamps a guess to low confidence.

Fix commit: df38ae3. Run time 102s.

- answer key: missed. exit 0 {"tests":4,"pass":4,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 3 distinct failures (0 high, 3 low; 83 expected signals not counted), coverage 75.5% of lines and 36.1% of functions.; NEW (0 above low): low: tap-does-nothing @ camera/texting :: tapping [button manual-search button Recherche manuelle] twice changed nothing | low: tap-does-nothing @ you :: tapping [button you button You You] twice changed nothing
- old suites: CAUGHT. app: exit 1 {"tests":2011,"pass":2004,"fail":2}; ux: exit 0 {"tests":542,"pass":539,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M12 D-270: A guessed product takes the barcode route, so the range card on screen is the guessed product's (typed "milk" showed a coconut milk's $2.29 to $3.49)

DEFECTS row D-270 (675b917 follow-up). Reverts the one condition in typedFromOwnData() in app/server.ts: `canonical && typedId.grade === 'sure'` back to `canonical`.

Fix commit: 675b917. Run time 102s.

- answer key: CAUGHT. exit 1 {"tests":4,"pass":3,"fail":1}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 0 distinct failures (0 high, 0 low; 106 expected signals not counted), coverage 76.1% of lines and 36.4% of functions.
- old suites: CAUGHT. app: exit 1 {"tests":2011,"pass":2004,"fail":2}; ux: exit 0 {"tests":542,"pass":539,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

