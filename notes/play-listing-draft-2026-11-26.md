DRAFT for the owner's review. Not published. Google Play, Android, package com.getpexi.app.
Customer text is the first three sections. The last section is for the owner only.

## App name (27 of 30)

```
Pexi: Grocery Price Checker
```

## Short description (77 of 80)

```
Scan a barcode, add the shelf price, and know in seconds if it's a good deal.
```

## Full description (2340 of 4000)

```
Is this a good price? Pexi tells you in seconds, right at the shelf.

Point your camera at a barcode, enter the price on the shelf tag, and get a verdict you can read at a glance: Great price, Good price, Reasonable price or Bad price, with the going rate beside it.

WHAT YOU GET
- A clear verdict on the price in your hand, not a flyer to scroll through.
- The usual price range for that product, and where the numbers come from.
- No barcode? Type the product name and get the same answer.
- Your own lines: decide how much cheaper counts as a great price for you.
- Saved items, so you can keep the products you buy often and see how their prices compare.
- Progress: see how your buys compare with what the typical shopper pays.
- Nearby shops to pick from, so the price goes against the right store.
- Prices judged in your own market, with English and French throughout.
- Light, dark or system theme.

HOW PEXI KNOWS
Pexi compares your price with the prices it holds for that product and for similar products, with new prices every week. Prices come from open data published by other organisations and from prices shoppers using Pexi have entered. Pexi knows everyday groceries best, and more products arrive every week. When Pexi has no shop price for a product, it shows an estimated range and labels it as an estimate. If a verdict looks wrong, tell Pexi and fix the price: the next shopper gets the better answer.

NO ACCOUNT, NO SIGN-IN
Open the app and start scanning. The camera reads barcodes on your phone, and Pexi does not upload your photos. You review the Terms, Privacy and Data once when you first open the app, and you can read it again any time in Settings. You can ask for your data to be deleted from Settings.

PEXI PLUS
Pexi is free, with 10 barcode scans a week and free typed searches. Pexi Plus gives you 100 barcode scans a week, enough to check your whole cart, for CA$3.99 a month or CA$29.99 a year. Cancel any time in Google Play, under Payments and subscriptions.

GOOD TO KNOW
- Pexi needs an internet connection to answer.
- Prices and estimates are for information. Check the price at the till.
- Pexi is not affiliated with any store or brand.

Questions? usepexiapp@gmail.com
Terms of Use: https://xu826jamin.github.io/pexi/terms.html
Privacy Policy: https://xu826jamin.github.io/pexi/privacy.html
```

## Changed from the old listing

Old listing: `docs/store/play-listing.md` (drafted 2026-11-21). Older Shin-name text in `notes/listing-draft.md` is superseded.

| Old claim | Now | Source |
|---|---|---|
| "You can turn usage data off ... on the You screen" (usage switch) | Removed. No off switches exist; Settings has one "Terms, Privacy and Data" row that reopens the document accepted once on first launch. | `app/public/js/screens/you.js` (comment 2026-11-25), `app/public/js/screens/agree.js` |
| "Location is off until you turn it on" (location switch) | Removed. No in-app location switch. Location works only as far as the phone's own permission allows, and only a rough area about 1 km wide leaves the phone. The listing now says nothing about a switch; the full detail stays in the policy and Data safety form. | `agree.js`, `app/public/js/legal/document.js` (lines 61, 105) |
| "The data and licences screen in the app credits each source" | That screen was folded into "Terms, Privacy and Data" (section "Data sources and licences"). The sentence is dropped; the document is mentioned instead. | `agree.js` header, `legal/document.js` line 188, `ui-strings.js` (`legal_title`) |
| "a choice of how blunt Pexi's attitude is" | Removed. The Deadpan/Warm/Blunt picker is gone. | `screens/you.js` (comment, 2026-11-22) |
| "Pexi records what you scan and type and how you use the app" | Dropped from the store text (recording is now covered by the document accepted at first launch; Data safety form still needs it declared). | `agree.js` |
| "A watch list ... your past scans and ratings" | Reworded to "Saved items"; the tab is now Saved. Progress tab added (compares your buys with the typical shopper, never worded as "saved" money). | `ui-strings.js` (`nav_saved`, `nav_progress`, `prog_*`) |
| Not in old listing | Added: nearby shop picker, market choice, English and French, "Pexi knows everyday groceries best". | `ui-strings.js` (`cam_shop*`, `market_*`, `cat`/`ea_body`) |
| Pexi Plus price CA$3.99 / CA$29.99, 10 and 100 scans | Unchanged and still matches the app (10 free, 100 Plus, typed searches free). The app holds no price; it reads the store's. Confirm both prices in Play Console before pasting. | `app/public/js/plus-config.js`, `docs/store/listing.md` |
| "Pexi does not upload photos" | Kept (still true in the current policy). | `legal/document.js` line 106 |

Open items for the owner: confirm prices in Play Console; screenshots in `docs/store/play-screenshots/` pre-date the Progress tab and the new first-launch document screen and may need refreshing; the Play Data safety form must match the "no switches, one acceptance" model (see `notes/store-privacy-declarations-draft.md`).
