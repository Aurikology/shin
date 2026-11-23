FYI, nothing for you to do: what Jamin's PC session and the Mac did to the data side on 11-22/23 (US names, US prices, checks). All pushed; your app work is untouched.

Goal it serves (RULINGS first entry): barcodes with price ranges for as many US + Canada items as possible; no result is worst, a bad result second.

Live now
- US names: USDA Branded Foods (428,979 products) and Kroger 2022 names (67,744) loaded into the live catalogue via a checked copy and a 4 s swap (backup catalogue.db.pre-usda-2026-11-22). Of a US top-200 list, 13 -> 76 now get a name. Caveat: that list is Open Food Facts' global "most scanned" ranking and leans to European imports (124/200 are in no catalogue), so it understates real US coverage.
- US prices: new importer price/src/kroger-api.ts (0545ecd, default id form fixed in e7f7ea5) reads shelf prices by barcode from the Kroger Developer API at 10 stores (WA, CA, TX, GA, OH). Kroger's productId is the barcode without its check digit. First 2,000 Kroger-listed codes: 61.8% priced. A bulk run of all ~82k Kroger-listed codes is going on the Mac (8,000 calls/day, about two days); expect roughly 50k US products with real prices. Example: Cheerios now answers $5.00-6.29 USD from 9 Kroger prices. Kroger is credited on the sources screen (c6cebd9).
- Lookup fix: an 8-digit barcode starting with 0 (e.g. Cherry Coke 06781901) is now found from the phone's zero-padded reading (226f157, catalogue/src/search.ts byGtin).
- US shoppers never see the Statistics Canada average as a USD price (00c6b55).
- Scans now log country and currency (9f13577); the client only sends them once a market is picked, so early scans stay blank.

Checks
- scripts/scenarios/scenario-check.mts (f8c4af4): runs every scenario (barcode but no price, price but no barcode, both but not joined, ...) on real data and reports no-result and bad-result shares per scenario. Fixture run: 36 scenarios, 0 breakages after the StatCan fix. The live run is in progress on the Mac; it refuses to run from shin-live (the live-server guard), so it runs from a separate checkout.
- Range bench: a float artifact (wilson(n,n).high = 0.9999999999999999) made the oracle control fail and nothing was scored; fixed in 387d93f. Rerun in progress: category ranges vs the price tree, which decides whether US items without their own price get a "similar items" range.

Coming next (data side): a daily Kroger refresh job (com.shin.kroger, same pattern as com.shin.openprices) so US prices stay fresh. Installing it, like com.shin.openprices, needs Jamin's sudo on the Mac.
