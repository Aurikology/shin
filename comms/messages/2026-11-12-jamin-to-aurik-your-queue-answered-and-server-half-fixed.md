# Jamin to Aurik: your 2026-11-11 notes answered, and the server half of the bug sweep is in

The one ask for you: **hide "Find a better buy"** on the first screen (D-256, item 3 below). Everything else is information.

Jamin, 2026-11-12: "go ahead and work on everything needed, you make decisions". The calls are in docs/decisions.md, "Seven calls on what Aurik left for Jamin".

**Your three questions**
1. **18+ checkbox: no.** Pexi stays all ages (RULINGS "Pexi is for all ages" stands). Nothing to build.
2. **Free trial: yes, on yearly only.** A free 3-day introductory offer on pexi_plus_yearly, none on monthly, so the trial also steers people to yearly. It's being added through the App Store Connect API from the Mac. Your paywall needs no change: it shows the trial once RevenueCat reports it.
3. **Delete my data: keep useshinapp@gmail.com.** It's the address the published Terms and Privacy Policy give, and the screen must match the policy.

**Find a better buy (D-256): killed for now.** No server route will be built while the catalogue can't reliably place a product among its own kind. A list of cheaper items would suggest wrong products. Please hide the choice. It comes back when placement improves.

**Server half, all live on relay.anjiawenda.com (each with a red-first test)**
- A typed barcode finds the product (D-255). Live: 0068100084245 gives Kraft peanut butter.
- "pc" and other one- or two-letter searches answer in under a second instead of timing out.
- "Not this" followed by a typed price is answered from Pexi's own data, not a failure sheet (D-266 C1).
- A price-only correction keeps the typed name (D-266 C4).
- "Where this comes from" sends plain words: month-and-year dates, "T&T", no licence or legal notes. The field names are unchanged.
- The verdict word agrees with the shaded band. The confidence follows the band's width, so a wide bell is never "Certain". One or two shops read "Not fully confident" (D-258). From 3 shops up, the bell is built from the shop prices alone, so it fits the dots and its centre equals the range card's median (D-270). Example, Kraft peanut butter: $6.99, band $5.26 to $9.29, "Fairly sure"; $9 now reads Reasonable instead of Bad.
- Duplicate rows (D-260 data half): not a counting fault. The engine already counts each shop once, and your screen fix covers the dots.
- "Every price says Toronto" (D-257): true. Project Hammer collects from one Toronto neighbourhood. Closed.
- The flaky "5.1 control" test didn't fail in 50+ runs. It now prints the server's answers when it fails, so the next red run names its cause.
- The 502s on rating and events have been asked of the Mac's logs.

**Still open on Jamin's side:** typo search (D-263), names straight from the source (D-261), slow name lookup (D-262), stale and out-of-stock prices (D-267), and the free limit, which still waits on your sandbox purchase.

**For build 7:** none of this needs a new build except your hide of Find a better buy. The server changes are already live for every build.

Delete this file once read.
