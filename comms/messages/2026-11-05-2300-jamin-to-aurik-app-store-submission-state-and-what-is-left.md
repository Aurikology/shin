Aurik: Pexi 1.0 is not submitted to the App Store yet. Below is where it stands and the changes still needed before it goes to Apple, so read this before you touch the server, the first-run screens or the store pages, and tell me which of the open items you want to take.

## What I decided tonight (2026-11-05)

- Submit 1.0 for App Review with release set to manual, so Apple approving it does not make it public. We release it ourselves after the legal review.
- Pexi Plus: CA$3.99 a month, CA$29.99 a year. Free users get 10 barcode scans a week, Plus users get 100. Typed searches stay free and uncounted. The limits switch on only after a test purchase works on build 4.
- Available in Canada only for now. Pexi only knows Canadian prices, and selling elsewhere pulls in foreign privacy law for nothing.
- Return-It and Consignaction data is out of every answer, because neither gives us the right to reuse it. The rows are still in the database.

## Already done and pushed to main

- Build 4 code (64e653c): the Plus screen shows each plan's price and period, the auto-renew text, Restore Purchases, and links to the hosted Terms and Privacy Policy. The old in-app legal pages are gone. Build number is 4.
- Weekly limits in code (443c40a): `SHIN_PLUS_SCANS_PER_WEEK` added beside the free one. Neither is set on the server yet.
- Data rights (3d83de2): Return-It and Consignaction rows are filtered out of every read path (`catalogue/src/source-rights.ts`). Products known only from Open Icecat never go to Claude; they get the broad-guess range. Icecat's required notice is on the licences screen.
- Store pages are live at https://xu826jamin.github.io/pexi/ (source in `docs/store/`). The terms in `docs/store/terms.html` gained a licence for shopper-entered prices, the open data licence offer and Icecat's notice, but that version is not published yet.
- App Store Connect: listing text, age rating, privacy answers, review contact and both subscriptions are filled in. RevenueCat has the app, the `plus` entitlement and the `default` offering.

## Changes still needed, before Apple sees it

**Security (from an audit of the live server tonight; the invite gate is off, so anyone can reach every route):**
1. `x-shin-plus: 1` is believed while `REVENUECAT_SECRET_KEY` is unset on the Mac, so anyone can claim Plus. Fix: set the key on the Mac.
2. The `x-shin-shutter` header on any /api route buffers and writes the whole body to disk with no size or count cap (`server.ts` ~3114, `app/src/shutter-log.ts`). Anyone can fill the Mac's memory and disk. Fix: off unless an env flag is set, and capped.
3. `/api/correction` (`server.ts` ~4508) and `/api/scan/:id/outcome` (~3450) have no owner check, so anyone can overwrite any scan's price or outcome. Fix: require the scan's device to be the proven device.
4. No per-IP rate limit, and scan counts are keyed on a device id the phone invents, so a new id resets the free limit. Fix: a per-IP limiter at the door, plus a per-IP daily cap on free barcode scans.
5. Developer-only routes trust a bare device id, and `/api/identify` has no owner check.
6. Smaller: source maps are served, there is no Content-Security-Policy, and `camera.js` ~1162 puts server text into the page unescaped.

**Legal (from a compliance review tonight; not legal advice):**
7. Typed text the user deletes or never sends is logged as a usage event. Apple 5.1.1 and Canada's privacy law both need consent for that. Fix: stop capturing it in `track.js` and drop the field at the server.
8. Nothing is ever deleted. Apple and Canada's privacy law both want a stated retention period. Plan: request logs 90 days, usage events 12 months, device id removed from scans, ratings and prices after 24 months, with the policy saying so.
9. A first-run screen: an "I am 18 or older and agree to the Terms and Privacy Policy" checkbox (the 18+ ruling from 2026-09-14 was never built), plus an explicit, not pre-ticked choice to let product names go to Anthropic's Claude for price estimates (Apple 5.1.2 requires permission before sharing with an outside AI). Saying no still works, with broad-guess ranges. The App Store age rating then goes to 18+.
10. A small "Pexi's estimate" label next to every price verdict, because a "great price" verdict is a claim under the Competition Act.
11. Quebec's privacy law: the privacy policy names me as the person in charge of personal information, and a short note assesses data sent outside Quebec (Anthropic, Cloudflare).
12. French versions of the Terms and Privacy Policy, since Quebec requires consumer contracts in French.
13. The search index embedded Open Icecat names with a model, and Icecat's licence bars machine-learning use. Fix: leave Icecat rows out of vector search and out of the next index rebuild.

**Then, in order:** rewrite the privacy policy to match the code and publish the pages; build 4 from the final commit and upload it; take screenshots (iPhone 6.9 inch and iPad 13 inch, plus one of the Plus screen for Apple's subscription review); a sandbox purchase; set the limits on the server; in App Store Connect, set Canada only, 18+, the content rights answer, attach the build, the screenshots and both subscriptions; then submit.

Items 1 to 13 were being worked on tonight and were stopped before any of them was committed, so none of them is done. If you take any, put a claim line in `comms/claims/` first so we don't both write the same code.

Delete this file once read.
