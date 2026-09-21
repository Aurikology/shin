# Shin MVP plan

Written 2026-09-21 from Jamin's call the same day: keep what is built, keep the mascot, switch off
the welcome screen, photo identification and languages for now, and ship a subscription screen.
Every "exists" below was checked in the code on 2026-09-21; file references are for whoever builds it.

## The product in one line

Scan a barcode in a store, type the shelf price, and Shin (the mascot) tells you where the same
item is cheaper, with links, and whether the store will price match.

## What ships ON

| Part | State today | Work for the MVP |
| --- | --- | --- |
| Camera with barcode scanning | Built (`screens/camera.js`) | Hide the photo path (below). Nothing else. |
| Shelf-price pad before the lookup | Built (`askPriceFirst`, `submitScanPrice`) | None |
| Barcode lookup | Built. Barcode goes straight to Gemini with search (`/api/identify?gtin=` -> `gemini-scan.ts`). It does NOT use photo identification or the big catalogue, so switching those off breaks nothing. | None |
| Answer sheet: other prices with links, "cheaper at X by $Y" | Built | Check that every price shown carries its store and link; no bare "fair price" verdict without the prices behind it. |
| Price-match line ("show this to the cashier") | Written (`app/src/price-match.ts`) but nothing calls it | Wire it into the answer sheet when a cheaper price is at a store whose policy the module covers. Small. |
| Mascot | Built (`face-art.js`, `shin.js`) | Keep as is. |
| Consent (camera, location) | Built, its own screen | Becomes the first screen after install, since the welcome screen is off. |
| Saved items | Built | Keep. Price-drop alerts stay off (already off). |
| Past scans, Recently removed | Built | Keep. |
| "Tell Shin the price" correction | Built | Keep. It is how wrong answers get reported during the beta. |
| Share card | Built | Keep. |
| You (settings) | Built | Hide the language option. Add "Manage subscription". |
| Licences (data sources) | Built | Keep, it is a legal page. |
| Invite code | Built, server side | Turn ON for the beta (set the invite code on the Mac server). |
| Subscription screen | Does not exist. Only two onboarding questions that record an answer, and they disappear with the welcome screen. | Build. Section below. |
| Thumbs up / down on each answer | Does not exist | Build. One tap, stored with the scan. This is how accuracy is measured. |

## What ships OFF (kept in the code, switched off by a flag)

None of these have an off switch today, so each needs one flag in `app/public/js/flags.js`.

| Part | Flag to add | What the flag does |
| --- | --- | --- |
| Welcome / onboarding (30+ steps) | `FLAGS.onboarding = false` | `firstScreen()` in `onboarding-flow.js` goes to Consent, then Camera. |
| Setup (attitude and price lines) | covered by `FLAGS.onboarding` | Skipped with the welcome screen; Shin uses its default voice. |
| Photo identification | `FLAGS.photoId = false` | Camera shows no photo button and never sends a photo. If a scan has no barcode, the mascot says "Point me at the barcode". |
| Languages | `FLAGS.languages = false` | Locale pinned to English in `lib/locale.js`; language row hidden in You. |
| Market picker | `FLAGS.market = false` | Pinned to Canada, where the testers are. Barcode lookup is global already, so this is one line to reverse. |
| Savings overview | already `FLAGS.feed = false` | No change. |

Rule for every flag: off means hidden and not called, never deleted.

## Subscription

Nothing exists yet: no store products, no purchase code, no entitlement check, no scan limit.

**How it works for the user**

1. Free: a set number of scans a week. Suggested 10 a week (my guess, not tested).
2. The scan after the limit opens the subscription screen, with the mascot on it.
3. Screen: what Shin Plus gives (unlimited scans), two plans (monthly, yearly), a Subscribe button,
   Restore purchases, links to Terms and Privacy, and a close button. Apple rejects a
   subscription screen without restore and those links.
4. Subscribed: no limit. "Manage subscription" in You opens the store's own page.

**Price.** His call. My suggestion, not checked against competitors: CA$3.99 a month or CA$29.99
a year. Check what two or three comparable scanner apps charge before setting it.

**Build**

- RevenueCat with its Capacitor plugin (`@revenuecat/purchases-capacitor`): one code path for Apple
  and Google, and it holds the entitlement so the server does not have to.
- One entitlement, `plus`; two products per store (monthly, yearly).
- The scan limit is counted on the server per device (in `scans.db`) and checked on
  `/api/identify`, so reinstalling does not reset it. Subscribed devices skip the check.
- Cost check: the code estimates about US$0.0068 a call and caps spend at CA$10; the notes record
  one grounded search at about 5.6 cents past about 1,250 scans a month. Ten free scans a week
  per user keeps even the high figure small at beta size.

**Store side, needed before a purchase can be tested**

- Apple: Paid Applications Agreement, banking and tax signed in App Store Connect; subscription
  group and the two products created. Without the agreement the products do not load, even in
  testing. (Worth confirming on the account; this is from Apple's usual setup, not checked here.)
- Google: merchant account on Play Console, the two subscriptions created, the app on internal
  testing.
- During TestFlight and Play internal testing, purchases are test purchases and nobody is charged.
  So the beta measures whether people tap Subscribe, not whether they pay. Say that when reading
  the results.

## Build order

1. Add the four flags and switch them off. Check on a phone: fresh install goes Consent -> Camera,
   no photo button, English only.
2. Thumbs up / down on answers, stored with the scan.
3. Wire the price-match line into the answer sheet.
4. Server scan counter and limit.
5. RevenueCat, store products, subscription screen, restore, Manage subscription.
6. Invite code on; Mac server and tunnel up; TestFlight and Play internal builds to 10 to 20 people.

Steps 1 to 3 need nothing from the stores and can start now. Step 5 waits on the store paperwork,
so start that paperwork today.

## Done means (checked on a phone, over cellular, not asserted)

- Fresh install opens on Consent, then Camera. No welcome screen.
- A real product's barcode in a real store returns other prices with links.
- Where a cheaper store has a price-match policy, the cashier line shows.
- The 11th scan in a week opens the subscription screen; a test purchase unlocks scanning;
  Restore works after reinstalling.
- Thumbs up / down is stored with the scan.
- A tester without the invite code is refused.

## How the beta is judged (set before it starts)

After two weeks:

- **Keeps using it:** how many testers still scan in week two.
- **Acts on it:** how many scans led to buying elsewhere or a price match (ask with one tap after
  a "cheaper at" answer).
- **Accurate:** share of thumbs up.
- **Would pay:** how many tapped Subscribe after hitting the limit.

If almost nobody scans in week two, the answer is to change the question Shin answers, not to
polish it or switch the other parts back on.
