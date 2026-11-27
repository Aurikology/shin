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

## Full description (2166 of 4000)

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
Pexi compares your price with the prices it holds for that product and for similar products. Prices come from open data published by other organisations and from prices shoppers using Pexi have entered. When Pexi has no shop price for a product, it shows an estimated range and labels it as an estimate. If a verdict looks wrong, tell Pexi and fix the price: the next shopper gets the better answer.

NO ACCOUNT, NO SIGN-IN
Open the app and start scanning. The camera reads barcodes on your phone, and Pexi does not upload your photos. You accept the Terms, Privacy and Data once when you first open the app, and you can read it again any time in Settings. Accepting covers typed searches: words you type are sent to Anthropic's Claude to estimate a price, and you can switch that off in Settings. "Help improve Pexi" starts ticked; untick it on the first screen or turn it off later in Settings, and Pexi works the same either way. If your phone allows location, only a rough area about one kilometre wide is sent, never your exact position. You can ask for your data to be deleted from Settings.

PEXI PLUS
Pexi is free, with 10 barcode scans a week and free typed searches. Pexi Plus gives you 100 barcode scans a week, enough to check your whole cart, for CA$3.99 a month or CA$29.99 a year. Cancel any time in Google Play, under Payments and subscriptions.

GOOD TO KNOW
- Pexi needs an internet connection to answer.
- Pexi is not affiliated with any store or brand.

Questions? usepexiapp@gmail.com
Terms of Use: https://xu826jamin.github.io/pexi/terms.html
Privacy Policy: https://xu826jamin.github.io/pexi/privacy.html
```

## Changed from the old listing

Old listing: `docs/store/play-listing.md` (drafted 2026-11-21). Older Shin-name text in `notes/listing-draft.md` is superseded.

| Old claim | Now | Source |
|---|---|---|
| "You can turn usage data off ... on the You screen" (usage switch) | Removed (the 2026-11-21 switch is gone). Replaced by the version 5 model (7f6f255, 2026-11-25): one required acceptance of the "Terms, Privacy and Data" document that also covers typed searches going to Claude, plus an optional "Help improve Pexi" choice that starts ticked; both can be switched off later in Settings. Builds 13 and 14 both post-date 7f6f255. | `app/public/js/screens/you.js` (comment 2026-11-25), `app/public/js/screens/agree.js` |
| "Location is off until you turn it on" (location switch) | Removed. No in-app location switch. Location works only as far as the phone's own permission allows (Android declares approximate location only), and only a rough area about 1 km wide leaves the phone. | `agree.js`, `app/public/js/legal/document.js` (lines 61, 105), `AndroidManifest.xml` |
| Not in old listing | Added: accepting covers typed searches going to Claude, switchable off in Settings (version 5 removed the separate one-time ask, 7f6f255; corrected 2026-11-27). | `screens/agree.js` (`agree_ai_line`), consent model 2026-11-26, `notes/store-privacy-declarations-draft.md` |
| "The data and licences screen in the app credits each source" | That screen was folded into "Terms, Privacy and Data" (section "Data sources and licences"). The sentence is dropped; the document is mentioned instead. | `agree.js` header, `legal/document.js` line 188, `ui-strings.js` (`legal_title`) |
| "a choice of how blunt Pexi's attitude is" | Removed. The Deadpan/Warm/Blunt picker is gone. | `screens/you.js` (comment, 2026-11-22) |
| "Pexi records what you scan and type and how you use the app" | Dropped from the store text (recording is covered by the document accepted at first launch; the Data safety form declares it, see `notes/store-privacy-declarations-draft.md`). | `agree.js` |
| "A watch list ... your past scans and ratings" | Reworded to "Saved items"; the tab is now Saved. Progress tab added (compares your buys with the typical shopper, never worded as "saved" money). | `ui-strings.js` (`nav_saved`, `nav_progress`, `prog_*`) |
| Not in old listing | Added: nearby shop picker, market choice, English and French, "Pexi knows everyday groceries best". | `ui-strings.js` (`cam_shop*`, `market_*`, `cat`/`ea_body`) |
| Pexi Plus price CA$3.99 / CA$29.99, 10 and 100 scans | Unchanged and still matches the app (10 free, 100 Plus, typed searches free). The app holds no price; it reads the store's. Confirm both prices in Play Console before pasting. | `app/public/js/plus-config.js`, `docs/store/listing.md` |
| "Pexi does not upload photos" | Kept (still true in the current policy). | `legal/document.js` line 106 |

Open items for the owner: confirm prices in Play Console; screenshots in `docs/store/play-screenshots/` pre-date the Progress tab and the new first-launch document screen and may need refreshing; the Play Data safety form must match the version 5 model (one acceptance that covers typed searches to Claude, switchable off in Settings; "Help improve Pexi" starts ticked) (answers in `notes/store-privacy-declarations-draft.md`); "English and French throughout" stays because French is being switched on in the same release (confirm it is on in the build before pasting).
