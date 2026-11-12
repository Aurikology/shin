# Pexi scorecard: how many real bug shapes the new checks catch

Run on commit 16e5383, 2026-11-12. Total run time 20.4 min (1227s).

## Control (no mutation)

All five catchers green.

| Catcher | Control | Detail | Time |
| --- | --- | --- | --- |
| answer key | green | exit 0 {"tests":9,"pass":9,"fail":0} | 21s |
| seam test | green | exit 0 {"tests":2,"pass":2,"fail":0} | 6s |
| data rules | green | rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0} | 2s |
| crawler | green | exit 0; Crawl: 150 runs, 3750 steps, 0 distinct failures (0 high, 0 low; 102 expected signals not counted), coverage 74.7% of lines and 34.3% of functions.; crawler.test.mjs exit 0 {"tests":15,"pass":15,"fail":0} | 127s |
| old suites | green | app: exit 0 {"tests":2018,"pass":2013,"fail":0}; ux: exit 0 {"tests":544,"pass":541,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0} | 101s |

The crawler's control run reports 0 non-expected failure(s), none high: none. A mutation counts as caught by the crawler on exit 1 or on a non-expected failure above low severity that is not in that list. Low-severity tap-does-nothing findings change between two identical control runs (this run and an earlier one listed different ones), so they are noted and never counted.

## Matrix: bug by catcher

| Id | Family | DEFECTS | Bug | Answer key | Seam test | Data rules | Crawler | Old suites | New | Old |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | 1 half-wired | D-034 | The pad prices a catalogue-resolved product by its words: proceed() sends only scannedG... | missed | CAUGHT | missed | missed | missed | yes | no |
| M02 | 1 half-wired | D-094 | The phone writes a location cell the server cannot parse (colon, 4 decimals), so every ... | missed | missed | missed | missed | CAUGHT | no | yes |
| M03 | 2 data at import | D-267 | Prices joined to a barcode by shop-product NAME sit beside the barcode-joined ones as e... | missed (blind) | missed (blind) | CAUGHT | missed (blind) | missed (blind) | yes | no |
| M04 | 2 data at import | D-267 | An out-of-stock row keeps its price and is read as a shop price the shop does not curre... | missed (blind) | missed (blind) | CAUGHT | missed (blind) | missed (blind) | yes | no |
| M05 | 2 data at import | D-267 | Absurd prices attached to a consumer barcode: a $4,898.99 pallet row on a carton, and a... | missed (blind) | missed (blind) | CAUGHT | missed (blind) | missed (blind) | yes | no |
| M06 | 2 data at import | D-257 | Every imported price is labelled Toronto: hammer.ts sets storeCity 'Toronto' for every ... | missed (blind) | missed (blind) | CAUGHT | missed (blind) | missed (blind) | yes | no |
| M07 | 3 screen walk | D-259 | The count line disagrees with the list under it ("7 prices from 7 shops" above 12 rows) | missed | missed | missed | CAUGHT | CAUGHT | yes | yes |
| M08 | 3 screen walk | D-265 | The first camera screen says every scan sends a picture while photo scanning is off and... | missed | missed | missed | CAUGHT | CAUGHT | yes | yes |
| M09 | 4 search | D-074 | Search bands `confident` on a row that matched only one word of the query (225 g Kraft ... | CAUGHT | missed | missed | missed | missed | yes | no |
| M10 | 4 search | D-245 | Typed search lists rows nobody can tell apart ("Oreo / OREO" and "Oreo", two barcodes, ... | CAUGHT | missed | missed | missed | missed | yes | no |
| M11 | 5 verdict vs evidence | D-270 | A guessed product is priced as that product and answers with its own confidence ("milk"... | missed | missed | missed | missed | CAUGHT | no | yes |
| M12 | 5 verdict vs evidence | D-270 | A guessed product takes the barcode route, so the range card on screen is the guessed p... | CAUGHT | missed | missed | missed | CAUGHT | yes | yes |

"missed (blind)": a data bug is planted as rows in a temp prices file; only the data rules can read one, so the other four were not run for it.

## Shares

| | Bugs | Share |
| --- | --- | --- |
| Caught by the new checks only | 7 of 12 | 58% |
| Caught by the old suites only | 2 of 12 | 17% |
| Caught by both | 3 of 12 | 25% |
| Caught by neither | 0 of 12 | 0% |
| Caught by any new check | 10 of 12 | 83% |
| Caught by the old suites | 5 of 12 | 42% |

Per catcher, of 12: answer key 3, seam test 1, data rules 4, crawler 2, old suites 5.

Code bugs only (8; the 4 data bugs are visible to the data rules alone): new checks 6, old suites 5, new only 3, old only 2, neither 0.

## How much of the old suites' score is the fix's own test

Each fixed bug came with a regression test in the same commit, so the old suites catch a re-planted fix by construction. This table says whether anything ELSE in the old suites went red, and whether the plant is faithful (the fix's own test red).

| Id | Old suites red files | Old red outside the fix's own test | Fix's own test red (plant is faithful) |
| --- | --- | --- | --- |
| M01 | none | n/a | no regression test exists |
| M02 | app/test/grounded-cost.test.ts, app/test/history-and-sharing.test.mjs, app/test/no-shin-in-visible-text.test.mjs, app/test/paywall-review.test.mjs, app/test/refusal-voice.test.mjs, app/test/screen-trim.test.mjs, app/test/screens-voice.test.mjs, app/test/shops.test.mjs, app/test/text-size.test.mjs, app/test/voice.test.mjs | yes | yes |
| M07 | app/test/ux/ux-provenance-count.test.mjs | no | yes |
| M08 | app/test/camera-privacy-line.test.mjs, app/test/grounded-cost.test.ts, app/test/history-and-sharing.test.mjs, app/test/no-shin-in-visible-text.test.mjs, app/test/paywall-review.test.mjs, app/test/refusal-voice.test.mjs, app/test/screen-trim.test.mjs, app/test/screens-voice.test.mjs, app/test/text-size.test.mjs, app/test/ux/ux-b5-journeys.test.mjs, app/test/voice.test.mjs | yes | yes |
| M09 | none | n/a | yes (catalogue search test: red) |
| M10 | none | n/a | yes (catalogue search test: red) |
| M11 | app/test/grounded-cost.test.ts, app/test/history-and-sharing.test.mjs, app/test/no-shin-in-visible-text.test.mjs, app/test/paywall-review.test.mjs, app/test/refusal-voice.test.mjs, app/test/screen-trim.test.mjs, app/test/screens-voice.test.mjs, app/test/text-size.test.mjs, app/test/voice.test.mjs, app/test/wrong-product-answers.test.ts | yes | yes |
| M12 | app/test/grounded-cost.test.ts, app/test/history-and-sharing.test.mjs, app/test/no-shin-in-visible-text.test.mjs, app/test/paywall-review.test.mjs, app/test/refusal-voice.test.mjs, app/test/screen-trim.test.mjs, app/test/screens-voice.test.mjs, app/test/text-size.test.mjs, app/test/voice.test.mjs, app/test/wrong-product-answers.test.ts | yes | yes |

Old suites red on a code bug through something other than the fix's own test: 4 of 8.

## Bugs caught by neither

None.

## What each catcher saw

### M01 D-034: The pad prices a catalogue-resolved product by its words: proceed() sends only scannedGtin, so the code a typed search or a barcode lookup wrote to gtin is dropped

DEFECTS row D-034 (2026-09-07), same shape as D-266 C1 (a gtin that is set on one side and not read on the other). Re-breaks the line the fix changed: `item.scannedGtin ?? item.gtin` goes back to `item.scannedGtin`.

Fix commit: 4f7b76c. Run time 133s.

- answer key: missed. exit 0 {"tests":9,"pass":9,"fail":0}
- seam test: CAUGHT. exit 1 {"tests":2,"pass":1,"fail":1}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 1 distinct failures (0 high, 1 low; 100 expected signals not counted), coverage 74.3% of lines and 34.1% of functions.; NEW (0 above low): low: tap-does-nothing @ camera/result :: tapping [button detent-step button Back to the summary] twice changed nothing; crawler.test.mjs exit 0 {"tests":15,"pass":15,"fail":0}
- old suites: missed. app: exit 0 {"tests":2018,"pass":2013,"fail":0}; ux: exit 0 {"tests":544,"pass":541,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M02 D-094: The phone writes a location cell the server cannot parse (colon, 4 decimals), so every cell is silently discarded

DEFECTS row D-094. Re-breaks cellFor() in app/public/js/geocell.js back to the pre-fix format "43.2537:-79.9208" that app/src/stores.ts parseCell reads as null.

Fix commit: see D-094 (2026-09-13). Run time 137s.

- answer key: missed. exit 0 {"tests":9,"pass":9,"fail":0}
- seam test: missed. exit 0 {"tests":2,"pass":2,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 0 distinct failures (0 high, 0 low; 120 expected signals not counted), coverage 74.9% of lines and 34.8% of functions.; crawler.test.mjs exit 0 {"tests":15,"pass":15,"fail":0}
- old suites: CAUGHT. app: exit 1 {"tests":2018,"pass":2012,"fail":1}; ux: exit 0 {"tests":544,"pass":541,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M03 D-267: Prices joined to a barcode by shop-product NAME sit beside the barcode-joined ones as equal evidence, and one is 3x the rest (another product with a similar name)

DEFECTS row D-267, sweep Family 2 A1: 38,611 of 83,491 latest Hammer rows are name-joined, 61 of the 90 barcodes with a 3x spread include one. Planted as rows in a temp prices file, no code change: product 0000000000017 keeps its three barcode-joined rows (about $4) and gains a Walmart row joined by name at $12.00.

Fix commit: df38ae3 + 675b917 (verdict side); the rows themselves stay in the data. Run time 1s.

- answer key: missed (blind). blind: cannot read a prices file, not run
- seam test: missed (blind). blind: cannot read a prices file, not run
- data rules: CAUGHT. rules fired: D3=1; exit 0
- crawler: missed (blind). blind: cannot read a prices file, not run
- old suites: missed (blind). blind: cannot read a prices file, not run

### M04 D-267: An out-of-stock row keeps its price and is read as a shop price the shop does not currently sell

DEFECTS row D-267, sweep Family 2 A4: hammer.ts writes in_stock = 0 but still writes the price, and no reader looks at in_stock (6,976 priced rows). Planted as rows: a gtin-joined row for product 0000000000024 with in_stock = 0 and a price.

Fix commit: open. Run time 1s.

- answer key: missed (blind). blind: cannot read a prices file, not run
- seam test: missed (blind). blind: cannot read a prices file, not run
- data rules: CAUGHT. rules fired: D2=1; exit 0
- crawler: missed (blind). blind: cannot read a prices file, not run
- old suites: missed (blind). blind: cannot read a prices file, not run

### M05 D-267: Absurd prices attached to a consumer barcode: a $4,898.99 pallet row on a carton, and a 19 cent row

DEFECTS row D-267, sweep Family 2 A6: Walmart '946ml | 12/case | pallet of 60 cases' at $4,898.99 (6 rows over $200, 12 under 30 cents). Planted as rows: one over $2,000 and one at 19 cents, both on baseline products.

Fix commit: open. Run time 1s.

- answer key: missed (blind). blind: cannot read a prices file, not run
- seam test: missed (blind). blind: cannot read a prices file, not run
- data rules: CAUGHT. rules fired: D4=2; exit 0
- crawler: missed (blind). blind: cannot read a prices file, not run
- old suites: missed (blind). blind: cannot read a prices file, not run

### M06 D-257: Every imported price is labelled Toronto: hammer.ts sets storeCity 'Toronto' for every vendor, so a Vancouver-area chain reads "Save-On-Foods, Toronto"

DEFECTS row D-257 (also sweep Family 2 A8). Planted as rows, no code change: four vendors that do not all trade in Toronto, every row stamped store_city 'Toronto'. Their rows join the baseline, which carries a varied city per shop. Each vendor has 12 rows (copies), because a stamp on every row of a chain only shows across many rows: one row of one shop cannot be told from a shop that has one city.

Fix commit: open. Run time 1s.

- answer key: missed (blind). blind: cannot read a prices file, not run
- seam test: missed (blind). blind: cannot read a prices file, not run
- data rules: CAUGHT. rules fired: D9=36; exit 0
- crawler: missed (blind). blind: cannot read a prices file, not run
- old suites: missed (blind). blind: cannot read a prices file, not run

### M07 D-259: The count line disagrees with the list under it ("7 prices from 7 shops" above 12 rows)

DEFECTS row D-259. Reverts the e53e8fa hunk in provenanceLine(): regular dots only, shop count taken from the server's n.

Fix commit: e53e8fa. Run time 139s.

- answer key: missed. exit 0 {"tests":9,"pass":9,"fail":0}
- seam test: missed. exit 0 {"tests":2,"pass":2,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: CAUGHT. exit 1; Crawl: 150 runs, 3750 steps, 3 distinct failures (1 high, 2 low; 112 expected signals not counted), coverage 76.9% of lines and 37.1% of functions.; NEW (1 above low): high: count-line @ camera/result :: the line says 9 prices, the list under it has 12 rows | low: tap-does-nothing @ camera/texting :: tapping [button manual-search button Recherche manuelle] twice changed nothing | low: tap-does-nothing @ camera/texting :: tapping [button submit Chercher] twice changed nothing; crawler.test.mjs exit 1 {"tests":15,"pass":14,"fail":1}
- old suites: CAUGHT. app: exit 0 {"tests":2018,"pass":2013,"fail":0}; ux: exit 1 {"tests":544,"pass":540,"fail":1}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M08 D-265: The first camera screen says every scan sends a picture while photo scanning is off and the policy says no image is uploaded

DEFECTS row D-265. Reverts the ef44c26 hunk: the camera shows cam_privacy_line whatever FLAGS.photoId says.

Fix commit: ef44c26. Run time 143s.

- answer key: missed. exit 0 {"tests":9,"pass":9,"fail":0}
- seam test: missed. exit 0 {"tests":2,"pass":2,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: CAUGHT. exit 1; Crawl: 150 runs, 3750 steps, 5 distinct failures (1 high, 4 low; 99 expected signals not counted), coverage 74.6% of lines and 34.2% of functions.; NEW (1 above low): high: flag-copy @ camera/permission :: "scan sends a picture" on screen with photoId off: photo scanning is off, so no picture is sent, but the screen says a scan sends one (D-265) | low: tap-does-nothing @ camera/idle :: tapping [button scan-barcode button Scan the barcode] twice changed nothing | low: tap-does-nothing @ agree :: tapping [input radio agree-claude] twice changed nothing | low: tap; crawler.test.mjs exit 1 {"tests":15,"pass":13,"fail":2}
- old suites: CAUGHT. app: exit 1 {"tests":2018,"pass":2012,"fail":1}; ux: exit 1 {"tests":544,"pass":540,"fail":1}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M09 D-074: Search bands `confident` on a row that matched only one word of the query (225 g Kraft ANYTHING for "kraft dinner original macaroni")

DEFECTS row D-074. Removes the one line the fix added to #band in catalogue/src/search.ts: wordsMatched === 'some' no longer demotes to ambiguous.

Fix commit: D-074 (2026-09-09). Run time 143s.

- answer key: CAUGHT. exit 1 {"tests":9,"pass":8,"fail":1}
- seam test: missed. exit 0 {"tests":2,"pass":2,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 2 distinct failures (0 high, 2 low; 109 expected signals not counted), coverage 75.9% of lines and 36.3% of functions.; NEW (0 above low): low: tap-does-nothing @ you :: tapping [div 5 % 10 % 15 % 20 % 25 % 30 %] twice changed nothing | low: tap-does-nothing @ watchlist :: tapping [button watchlist button Saved Saved] twice changed nothing; crawler.test.mjs exit 0 {"tests":15,"pass":15,"fail":0}
- old suites: missed. app: exit 0 {"tests":2018,"pass":2013,"fail":0}; ux: exit 0 {"tests":544,"pass":541,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M10 D-245: Typed search lists rows nobody can tell apart ("Oreo / OREO" and "Oreo", two barcodes, no size)

DEFECTS row D-245. Reverts the cc06209 hunk in dedupeListings(): the `shown` key (words a shopper reads) no longer merges rows.

Fix commit: cc06209. Run time 139s.

- answer key: CAUGHT. exit 1 {"tests":9,"pass":8,"fail":1}
- seam test: missed. exit 0 {"tests":2,"pass":2,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 2 distinct failures (0 high, 2 low; 99 expected signals not counted), coverage 75.4% of lines and 35.1% of functions.; NEW (0 above low): low: tap-does-nothing @ you :: tapping [button you button You You] twice changed nothing | low: tap-does-nothing @ watchlist :: tapping [button watchlist button Saved Saved] twice changed nothing; crawler.test.mjs exit 0 {"tests":15,"pass":15,"fail":0}
- old suites: missed. app: exit 0 {"tests":2018,"pass":2013,"fail":0}; ux: exit 0 {"tests":544,"pass":541,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M11 D-270: A guessed product is priced as that product and answers with its own confidence ("milk" becomes Coconut Milk, Certain)

DEFECTS row D-270 (and D-267). Reverts the identity gate df38ae3 added in app/src/catalogue-first.ts: itemFor() keeps the guessed product's barcode, brand and size, and safeEstimate() no longer clamps a guess to low confidence.

Fix commit: df38ae3. Run time 130s.

- answer key: missed. exit 0 {"tests":9,"pass":9,"fail":0}
- seam test: missed. exit 0 {"tests":2,"pass":2,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 0 distinct failures (0 high, 0 low; 86 expected signals not counted), coverage 75.0% of lines and 35.3% of functions.; crawler.test.mjs exit 0 {"tests":15,"pass":15,"fail":0}
- old suites: CAUGHT. app: exit 1 {"tests":2018,"pass":2011,"fail":2}; ux: exit 0 {"tests":544,"pass":541,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

### M12 D-270: A guessed product takes the barcode route, so the range card on screen is the guessed product's (typed "milk" showed a coconut milk's $2.29 to $3.49)

DEFECTS row D-270 (675b917 follow-up). Reverts the one condition in typedFromOwnData() in app/server.ts: `canonical && typedId.grade === 'sure'` back to `canonical`.

Fix commit: 675b917. Run time 133s.

- answer key: CAUGHT. exit 1 {"tests":9,"pass":8,"fail":1}
- seam test: missed. exit 0 {"tests":2,"pass":2,"fail":0}
- data rules: missed. rules fired: none; exit 0; rules' own test exit 0 {"tests":10,"pass":10,"fail":0}
- crawler: missed. exit 0; Crawl: 150 runs, 3750 steps, 0 distinct failures (0 high, 0 low; 106 expected signals not counted), coverage 76.4% of lines and 36.7% of functions.; crawler.test.mjs exit 0 {"tests":15,"pass":15,"fail":0}
- old suites: CAUGHT. app: exit 1 {"tests":2018,"pass":2011,"fail":2}; ux: exit 0 {"tests":544,"pass":541,"fail":0}; price: exit 0 {"tests":459,"pass":456,"fail":0}

