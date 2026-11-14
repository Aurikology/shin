# Jamin to Aurik: screen problems from using build 7 in a store

Jamin used build 7 on his phone on 2026-11-14, including in a store. His words: *"there's a lot of ui problems with scrolling on unessesary stuff, badly formatted text, a lot of features don't work like the text scanning feature and are still appearing etc."* He asked for these to go to you.

Four asks, most important first.

## 1. Hide every feature that is switched off

Jamin's example is the text scanning feature, which still appears and does nothing. Please go through every control the shopper can see and hide any whose feature is off or developer-only. Known ones: photo scanning (`FLAGS.photoId` is false), the pack read (server answers `pack_read_developer_only` to every shopper), "Find a better buy" (asked 2026-11-12, D-256). The rule: if pressing it cannot give the shopper a result, it is not on screen.

## 2. The answer sheet after a scan (screenshot beside this file)

`2026-11-14-nutella-answer-build-7.png`: Nutella Biscuits 276g, tag $9.00, three shops, typical $8.50.

- **The top is cut off.** The big $9.00 is half under the camera edge and the verdict word is not in view. The first thing the shopper sees should be the verdict and the price, whole.
- **The product name is at the bottom**, under the chart. The shopper reads the verdict before knowing what was scanned. Name near the top.
- **Chart labels crowd each other.** Shop names stack on two lines with "Sale Save-On-Foods 276g" pushed sideways; "276g" repeats under every shop although it is the same product; "Sale" sits alone at the left edge; $9.05 (the top of the range) sits directly under the $9.00 tag marker, two near-identical numbers stacked.
- **Wording reads like a report.** "Shaded: Pexi's estimate of 8 in 10 prices, $7.95 to $9.05" and "Typical price in Canada, Pexi's estimate: $8.50" could be one line, e.g. "Usually $7.95 to $9.05".
- **The pack photo** in the top right corner is clipped.

The long product name itself ("Nutella BISCUITS, Golden Cookies Filled with Rich Hazelnut Spread, Pack of 20 Cookies 276g") comes from the server as `name`; that part is Jamin's side, not yours.

## 3. Too much scrolling

Jamin finds he scrolls past things he does not need. For each sheet, the verdict, price, product name and the main button should be visible without scrolling on an iPhone 13; anything else goes lower or behind a tap.

## 4. "I need a connection" shows for things that are not the connection

`identify()` throws on any non-2xx, and `isServerFault` (camera.js) only counts 5xx as the server's fault, so a 400, 403 or 404 is shown to the shopper as "I need a connection for this". Please keep that sentence for a request that never got an answer (fetch threw), and give a server refusal its own line. This is what made today's real bug look like bad signal (below).

## Information: what was wrong today and is fixed

With "Send product names to Claude" on, every request from the phone failed its CORS preflight and the app said "I need a connection": the server never listed `x-shin-claude` in its allowed headers. That has been true since the first-run consent screen shipped (da89050, 2026-11-06), so any tester who said yes to Claude has had an app that reached nothing. It may explain some of the crash and failure reports on builds 4 to 7. Fixed on the server in ddd1ec3 (live 22:54 UTC); nothing to change in the app.

There is now `scripts/e2e-phone-live.mjs`: the app packaged like the phone build, served at https://localhost so the real CORS and CSP rules apply, a generated barcode fed to the camera, every Claude/location/language combination, every button that does not write data, against the live server. A run on 2026-11-14 passed 69 of 70 steps; it catches broken requests, not layout, so items 1 to 3 above still need your eyes.

Delete this file once read.
