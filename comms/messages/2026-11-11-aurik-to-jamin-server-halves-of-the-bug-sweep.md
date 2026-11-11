Jamin: Aurik's PC session took the screen half of the 2026-11-11 bug sweep (docs/bug-sweep-2026-11-11.md). These are the halves that are yours by "Who owns what" (server, price engine, catalogue, data). Nothing below was edited from the PC. Ordered by what the sweep itself called worst for launch; each line names where the cause is.

**Launch blockers**
1. **The free limit is off.** Live `/api/quota` returns `limit: null`, so the paywall has nothing to sell (D-268 A2). RULINGS waits on Aurik's sandbox purchase (item 7) before `SHIN_FREE_SCANS_PER_WEEK=10` / `SHIN_PLUS_SCANS_PER_WEEK=100` are set; no phone half to build until then. The You page's "No scan limit." line is true while the server says null, and changes with it.
2. **Typed names judged as a guessed product at "Certain"** (D-270 A1). "milk" became Coconut Milk 400 ml, "Kraft dinner" became the 12 pack and a $9 box got "Great price". `app/server.ts` ~1217-1249: with an ambiguous name `resolution.row` is null, but `lookupOwnPrices(text)` still supplies a code and it gets priced. Sibling: `matchTextVerdict` (~1685-1721) judges the top text match with no score or size check.
3. **Name-matched prices count like barcode matches** (D-267). `price/src/lookup.ts` drops only `join_method = 'none'`; estimate and range never read it (38,611 rows). 61 of 90 barcodes with a 3x spread include one.

**A shopper is told something wrong**
4. **Zone word ignores the spread** (D-270 A2/B3): `zoneOf` in `price/src/estimate.ts` (~863) uses flat percentages only, so a price inside the shaded 8-in-10 band can read "Bad price". Confidence ignores sigma too (A3, estimate.ts 1434-1440). If the server sends a softer zone or a lower confidence, the phone already shows it. Aurik has not changed how the phone draws "bad".
5. **Duplicate rows**: Hammer writes a second regular row for every sale and one row per shop per day (D-260's data half; `hammer.ts`). The phone now prints a repeated label once (D-260 fixed on the screen side), but the rows still count towards `n` and confidence (sweep family 3 item 13: 6 of the 7 prices behind one "Certain" were duplicates).
6. **Every Hammer price says Toronto** (D-257, `hammer.ts` `storeCity: 'Toronto'`).
7. **"Fairly sure" with "Few prices"** (D-258): own_prices is never below medium.
8. **Range card and bell disagree** (D-270 B1/B2): `range.ts` (3 shops, 90 days) and `estimate.ts` (1 shop, 730 days, blended) are two ladders.

**Search (D-269)**
9. Typed barcode never reaches the catalogue's barcode branch (D-255: `/api/search` never passes `gtin`). `vectorsOn: false` live, so typos miss (D-263). "pc" times out at 5 s.

**Silent losses**
10. `/api/scan-rating`, `/api/event`, `/api/events/batch` return intermittent 502s from Cloudflare (retry-after 60) while the phone shows success (D-268 A3). The tunnel or the server under load? A server-side read of the request log would say which.

**Half-wired (D-266), the server end**
11. `/api/price` answers from own data only when there is no gtin, so a "Not this" pick followed by a typed price ends on a failure sheet (C1, server.ts ~3317-3334).
12. `/api/correction` with no product code drops the typed name (C4, server.ts 3430-3443).
13. "Find a better buy" has no route (D-256).

**Screen text that comes from the server**
15. "Where this comes from" (D-268 H36) is fetched from `/api/attribution` (`app/src/attribution.ts`), so its words are yours: raw ISO dates ("counted 2026-10-06", "between 2020-02-01 and 2026-08-26"), "T and T" where the app says "T&T", and internal legal notes shown to shoppers (ANBL and Walmart: "Verdict: automated reading and reuse are both unlicensed; written permission ... needed"). If you want the dates formatted on the phone instead, send them as ISO in their own field and Aurik's side formats them.
16. "Delete my data" on You is a mailto to useshinapp@gmail.com, the old Shin address. Which address should it be?

**A flaky server test**
14. `app/test/scan-record-complete.test.ts`, "5.1 control: the shopper's own call is kept as first given", failed in 2 of 5 full `npm test` runs on the PC (passes 9 of 9 alone). It is server code (`/api/scan-call`); the PC session touched no server file. Probably a timing or shared-state race inside the parallel suite; not looked into.

Screen fixes from this session, pushed to main: the camera's privacy line, the Fix Results pad, the count line, the chart labels, the scan button in the bar, the % off / N-for limits, the theme row, the "Answered" headline, the Continue hint, the estimate label, You's text, number separators and "aisle", shouted names in title case (the screen half of D-261; the data is still yours), page titles, and the torch slider. DEFECTS says which commit fixed which.

Delete this file once read.
