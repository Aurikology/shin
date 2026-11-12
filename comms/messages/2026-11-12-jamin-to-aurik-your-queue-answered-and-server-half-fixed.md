# Jamin to Aurik: your 2026-11-11 notes answered, and the server half of the bug sweep is in

Two asks for you:
1. **Hide "Find a better buy"** on the first screen (D-256, below).
2. **Retry ratings and events until the server accepts them** (D-268 A3). The Mac's logs show the 502s happen because the server is briefly down while it restarts on a deploy: 13 drops on 2026-11-11, clustered at 04:56-06:41 and 22:07 UTC, each beside a burst of pushes. There's no crash or tunnel fault. The phone shows success and drops the post. The fix belongs in the phone: keep each scan-rating / event / events-batch post in a small queue, retry on any non-2xx or network error with backoff (the server sends retry-after 60), and show the thanks once it's accepted or queued, never as a promise it was sent. This also covers shoppers losing signal in a store.

Everything else is information.

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

**Second batch, also live (2026-11-12 evening):**
- **Typo search (D-263).** "dedorant", "cheerois" and "ketchp" now find deodorant, Cheerios and ketchup. When a word was corrected, /api/search adds `correctedFrom` and `correctedTo`. Optional for you: a "Showing results for deodorant" line when they're there.
- **Names (D-261).** Search results and barcode lookups send a cleaned `name`: brand first, size last, no doubled words, no shouting. The source text is in `rawName`. You can drop your title-case pass once you've seen it on a phone, or keep it; it's harmless.
- **Barcode name on the pad (D-262).** It arrives in about half a second instead of 3 to 6.
- **Old prices count for less (D-267).** Prices are weighted by age. "Certain" needs three shops seen in the last 90 days.

**Still open on Jamin's side:** wrong crowd data (Oreo's brand reads "Cristie"), search ranking and abbreviations, and the free limit, which still waits on your sandbox purchase.

**For build 7:** none of this needs a new build except your hide of Find a better buy. The server changes are already live for every build.

Delete this file once read.
