# Pexi: Google Play listing, version 1.0 (Android)

Drafted 2026-11-21 in the android lane. Customer text is in the first section and is ready to paste into Play Console. Everything below the line "NOT FOR THE STORE" is for Jamin and Aurik only. Source of the wording: `docs/store/listing.md` (the App Store text, rewritten 2026-11-21), changed only where Apple wording does not apply on Google Play.

## Store text (paste into Play Console)

**App name** (27 of 30):

```
Pexi: Grocery Price Checker
```

**Short description** (73 of 80):

```
Scan a barcode, add the shelf price, know in seconds if it's a good deal.
```

**Full description** (under 4,000):

```
Is this a good price? Pexi tells you in seconds, right at the shelf.

Point your camera at a barcode, enter the price on the shelf tag, and Pexi gives you a verdict you can read at a glance: Great price, Good price, Reasonable price or Bad price.

WHAT YOU GET
- A verdict on the price in your hand, not a flyer to scroll through.
- The range of prices Pexi has seen for that product, and where those prices come from.
- Manual Search: no barcode? Type the product name instead.
- Your own lines: decide how much cheaper counts as a great price for you.
- Saved items for the products you buy often, and your past scans and ratings.
- English and French, and a light or dark theme.

HOW PEXI KNOWS
Pexi compares your price with the prices it holds for that product and for similar products, with new prices every week. Prices come from open data published by other organisations and from prices that shoppers using Pexi have entered. When Pexi has no shop price for a product, it shows an estimated range and labels it as an estimate. Tell Pexi when a verdict was wrong and correct the price; the next shopper gets the better answer. The Terms, Privacy and Data screen in the app credits each source, and a licences page lists the open-source parts. Pexi is not affiliated with any store or brand.

PRIVACY
No account and no sign-in. Pexi does not upload photos or camera images. If your phone allows location, only a rough area about one kilometre wide is sent, never your exact position. You review the Terms, Privacy and Data once when you open the app and can read it again any time in Settings. "Help improve Pexi" is your choice and starts off. Before words you typed are sent to Pexi's AI to estimate a price, Pexi asks you once. You can ask for your data to be deleted from Settings. The full details are in the privacy policy.

PEXI PLUS
Pexi is free to use, with 10 barcode scans a week. Pexi Plus gives you 100 barcode scans a week, enough to check your whole cart, for CA$3.99 a month or CA$29.99 a year. Manage or cancel any time in Google Play, under Payments and subscriptions.

GOOD TO KNOW
- Pexi needs an internet connection to answer.
- Prices and estimates are information only. Check the price at the till.

Terms of Use: https://xu826jamin.github.io/pexi/terms.html
Privacy Policy: https://xu826jamin.github.io/pexi/privacy.html
```

**Category:** Shopping. **Tags (pick in Console):** Shopping, Utilities, Lifestyle if offered.
**Contact email:** usepexiapp@gmail.com. **Privacy policy URL:** https://xu826jamin.github.io/pexi/privacy.html
**App icon:** the Pexi mascot on near-black; Play needs a 512 by 512 PNG, use `native/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024 square, scale down) or export it from the same file.
**Phone screenshots (4, 1080 by 2160, real captures from the Android build in `docs/store/play-screenshots/`):**

| File | Shows | Caption to use in the graphic, if you add one |
|---|---|---|
| `01-camera.png` | The camera screen with the scan frame and Pexi's hint | Scan it. Know if it's a good price. |
| `02-shelf-price.png` | The shelf price keypad for a product | Type the price on the tag. |
| `03-verdict.png` | A Reasonable price verdict with the price range chart | See where your price sits in the range. |
| `04-you.png` | The You screen with the three Pexi attitudes | Pick how blunt Pexi is. |

The camera view in `01-camera.png`, `02-shelf-price.png` and `03-verdict.png` is the emulator's virtual room, not a shop. Recapture on a real phone in a shop before the public listing if you want a shelf behind it.

---

## NOT FOR THE STORE (Jamin and Aurik)

### Data safety form

Replaced 2026-11-26. The 2026-11-21 table here was written for the old model (a usage switch, Anthropic "only if you said yes", a location switch) and no longer matches the app. The current answers, row by row, are in `notes/store-privacy-declarations-draft.md` (Google Play Data safety section, and Apple App Privacy for the iPhone). File the Play form from that file, not from memory of the old table.

### Content rating (IARC questionnaire) answers

Reuse the App Store answers in `docs/store/listing.md` (age rating table): no violence, no sexual content, no profanity, no gambling, no chat, minimal user-generated content (a typed price and store name), alcohol and tobacco only as product names in a price list, no unrestricted web access. Expected result: Everyone. If the questionnaire pushes alcohol or tobacco to a higher rating, accept it; the rule from the App Store listing is not to change the catalogue.

### Problems found while writing this (needs a decision before the public listing)

1. The privacy policy and Terms now cover both phones (Keychain on iPhone, encrypted storage on Android; Apple and Google billing), so the 2026-11-21 complaint that they were iPhone-only is closed. Re-read them once against the Data safety form before filing.
2. Pexi Plus cannot be bought on Android yet. The Android RevenueCat key is empty on purpose, and no Google Play subscription product exists until the Play Console app is created and the products `pexi_plus_monthly` and `pexi_plus_yearly` are added and linked in RevenueCat. If the listing goes live before that, delete the PEXI PLUS paragraph from the description.
3. On-device text reading ("Pexi's app reads text that is visible in the camera view") is described in the policy; the Android build ships with the native camera fallback off, so the sentence may describe the iPhone behaviour only. Check it matches before the form is filed.
4. The Data safety form is the account holder's declaration. It must match the app as released: one required acceptance, an optional default-off "Help improve Pexi" choice, a one-time allow before typed text goes to Anthropic, approximate location only (Android no longer declares fine location), no photos kept, RevenueCat purchase data.
5. Personal Play accounts need 12 testers for 14 days before production access (organisation accounts need a D-U-N-S number). Neither is started here.
6. Android: backups are off (`allowBackup` false) and fine location is removed, which on Android 7 to 11 means the web-view location read is refused (see the manifest comment); the shop picker then has no nearby shops on those phones.
