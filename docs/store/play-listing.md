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
- A watch list for the products you buy often, and your past scans and ratings.
- A light or dark theme, and a choice of how blunt Pexi's attitude is.

HOW PEXI KNOWS
Pexi compares your price with the prices it holds for that product and for similar products, with new prices every week. Prices come from open data published by other organisations and from prices that shoppers using Pexi have entered. When Pexi has no shop price for a product, it shows an estimated range and labels it as an estimate. Tell Pexi when a verdict was wrong and correct the price; the next shopper gets the better answer. The data and licences screen in the app credits each source. Pexi is not affiliated with any store or brand.

PRIVACY
No account and no sign-in. Pexi does not upload photos or camera images. Location is off until you turn it on, and then only a rough area about one kilometre wide is sent. Pexi records what you scan and type and how you use the app. You can turn usage data off, and ask for your data to be deleted, on the You screen. The full details are in the privacy policy.

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

### Data safety form: draft

Source for every answer: `docs/store/privacy.html` only (effective 2026-11-21). The policy says it covers the iPhone app; see "Problems found" below. "Shared" here means the policy says the data goes to a named outside service; Google does not count a service processing data on your behalf as sharing, so some Shared answers can be changed to No once you decide which services you treat as processors (judgment calls marked JUDGMENT).

| Play question | Answer | Policy sentence it comes from |
|---|---|---|
| Does the app collect or share user data? | Yes | "Pexi records what you scan or type, what it answered, and how you use the app." |
| Is all data encrypted in transit? | Yes | "The app talks to Pexi's server over an encrypted HTTPS connection." |
| Can users request deletion? | Yes | "You can ask to see, or delete, the records tied to your device. Open the You screen and tap Delete my data, which prepares an email to usepexiapp@gmail.com that includes your device identifier." Deletion URL for the form: the privacy policy page, or the email address. |
| Sold to anyone? Used for ads? | No / No | "Pexi does not sell your data and does not share it with advertisers or data brokers." and "Pexi does not show ads, does not use advertising or analytics companies". |
| Personal info (name, email, address, phone, user IDs, other) | Not collected | "Pexi has no account, no sign-in, and does not ask for your name, email address, phone number or payment details." |
| Location: approximate | Collected, optional, shared (JUDGMENT: Overpass). Purpose: App functionality. | "Rough location, only if you turn it on... rounds it on the phone to a grid square about one kilometre wide. Only the grid square is sent." Sharing: "OpenStreetMap's Overpass service receives the centre point of your rough grid square, only when location is on." |
| Location: precise | Not collected | "What Pexi does not collect in this version... Your exact location." |
| Financial info: purchase history | Collected (only if the person subscribes), shared with RevenueCat. Purpose: App functionality. | "Purchase history, only if you subscribe... RevenueCat records which plan you bought, when it renews and whether it is active, under your random device identifier". Payment card details: "Pexi never sees your card or Apple ID details." (Not collected.) |
| App activity: app interactions | Collected, optional (the person can switch it off). Purposes: Analytics, App functionality. | "How you use the app. Pexi records when the app is opened, which screens you visit, buttons you tap..." and "You can switch usage tracking off on the You screen." |
| App activity: in-app search history | Collected, shared (Open Food Facts gets barcodes; Anthropic gets product names only if the person said yes). Purpose: App functionality. | "What you scan or type. When you scan a barcode, Pexi sends the barcode digits. When you type a product name, Pexi sends the text you typed." Sharing: "Open Food Facts... receives a barcode number" and "Anthropic... only if you said yes, receives a product's name, brand, size, category and country". |
| App activity: other user-generated content | Collected. Purposes: App functionality, Fraud prevention. | "Prices, stores and ratings you enter... Pexi also stores a scrambled one-way code of your network (never your IP address) to keep fake prices out". "Prices you enter can be used in answers shown to other shoppers." |
| App info and performance: crash logs / diagnostics | Collected. Purposes: Analytics, App functionality. | "errors the app hits" and "The app version, the platform, how long an answer took, and your language and market setting." |
| Device or other IDs | Collected, shared with RevenueCat; Cloudflare carries it in transit (JUDGMENT: processor). Purposes: App functionality, Analytics. | "A random device identifier. Your phone generates it..." and "Cloudflare, which carries your requests, and RevenueCat, described below, do [receive the device identifier]." The server's request log also keeps the IP address: "your IP address, the country the request came from, and your phone's user agent text" (Play has no separate IP type; declare under Device or other IDs). |
| Photos and videos, audio, files, contacts, calendar, messages, health and fitness, web browsing | Not collected | "This version of Pexi does not upload photos or camera images." and "Your name, email address, phone number, contacts, or payment information." Nothing in the policy says Pexi collects the others. |
| Data deleted on a schedule | Yes, state it in the form's help text | "Server request logs: 90 days... Usage events: 12 months..." |

### Content rating (IARC questionnaire) answers

Reuse the App Store answers in `docs/store/listing.md` (age rating table): no violence, no sexual content, no profanity, no gambling, no chat, minimal user-generated content (a typed price and store name), alcohol and tobacco only as product names in a price list, no unrestricted web access. Expected result: Everyone. If the questionnaire pushes alcohol or tobacco to a higher rating, accept it; the rule from the App Store listing is not to change the catalogue.

### Problems found while writing this (needs a decision before the public listing)

1. The privacy policy and Terms are written for the iPhone app. `privacy.html` says "This policy covers version 1.0 of the Pexi iPhone app", names Apple as the payment processor three times, and says the identifier lives "in the phone's secure Keychain". Play reviewers read the policy against the Data safety form. It needs an Android edition (or neutral wording) before the Android build is public. The policy is Jamin's text and is public on GitHub Pages, so this was not edited.
2. Pexi Plus cannot be bought on Android yet. The Android RevenueCat key is empty on purpose, and no Google Play subscription product exists until the Play Console app is created and the products `pexi_plus_monthly` and `pexi_plus_yearly` are added and linked in RevenueCat. If the listing goes live before that, delete the PEXI PLUS paragraph from the description.
3. On-device text reading ("Pexi's app reads text that is visible in the camera view") is described in the policy; the Android build ships with the native camera fallback off, so the sentence describes the iPhone behaviour. Check it matches before the form is filed.
4. The Data safety form is the account holder's declaration. This draft is derived from the policy only, so any collection the policy does not mention is not in it.
5. Personal Play accounts need 12 testers for 14 days before production access (organisation accounts need a D-U-N-S number). Neither is started here.
