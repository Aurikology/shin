Mac: please make build 7 (iPhone only, same settings as build 6) from 6e1987c or later, and upload it. Do not attach or submit it. This replaces the earlier build 7 asks (from f9f5dd2, 624ac89, then 575848a). If build 7 is already uploaded, make this one build 8.

**Build from 6e1987c or later (Jamin, D-271):** `npm ci` in app/ as well as native/; `npm run cap:sync` now builds the barcode reader and stops if it is missing.

**New in native/: a plugin.** Before archiving, in native/: `npm ci`, then `npx cap sync ios` (it runs pod install for CapacitorTextZoom). Without it the app still runs; it just ignores the phone's text size.

What build 7 carries since build 6:
- ecc9622: the torch no longer flashes on and off (D-251); new installs start with it off.
- f9f5dd2: the barcode button stays pressed and keeps looking for 2.5 s (D-252).
- 624ac89: Pexi follows the phone's text size, capped at 150% (D-254).
- c4d11ef: price dates (D-253).
- ef44c26: the camera's first line no longer says every scan sends a picture (D-265).
- 09d851b: Fix Results has a real keypad, a styled On sale pill, and says "Send it".
- e53e8fa: the "N prices from N shops" line matches the list under it (D-259).
- 3c10eef: a shop's label goes on the bell once, clear of the $ labels (D-260).
- 06e4453: the scan button in the bottom bar shows the barcode glyph.
- de42cbd: an out-of-range "% off" or "N for $" prices nothing and says what to type.
- eb6b656: choosing a theme no longer clears the other choices on You.
- c5a7654: an answer with no shelf price is headlined "Typical price", not "Answered".
- 7057718: the first screen says why Continue is still off.
- 579eb4d: "Pexi's estimate" sits above the verdict word.
- 283044c: You's ratings row and footer in plain words.
- 57064e6: thousands separators, "aisle", the search box asks for a product name.
- 74c49fe: names shouted in capitals by a shop feed read in title case.
- a2fafbe: pages titled what the row that opens them says.
- 532ed3a: Torch Off hides the brightness slider.
- 858f6f1: Dollar mode says the dollars in the verdict line.
- d6b3367: the shop list promises to remember only with location on.
- 1f1f59c: Recently removed names each row's list, no "--".
- 21fe098: "Your report" in plain words.
- abe6fea: Saved says the same usual as the sheet, and "usually $5.00".
- 8a81e26: removing a past scan offers Undo for four seconds.
- 18a859b: the bell's "Shaded" caption sits above the chart.

Gate on 283044c: check exit 0; npm test 1979 pass, 0 fail, 5 skipped; test:ux 539 pass, 0 fail; WebKit sweep 36 taps 0 problems; fake-camera barcode press works, 0 errors. Every item above had a test seen red first. Not seen on a phone.

- 0d84e65: the new paywall (steps column, two plan cards, one button; a free trial shows only if App Store Connect has one).
- 575848a: the app's font is Apple's SF Pro (Inter off Apple), the wordmark too. Check the first screen in the build shows SF Pro, not Times or Helvetica.

Delete this file once read.
