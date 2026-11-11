Mac: please make build 7 (iPhone only, same settings as build 6) from 283044c or later, and upload it. Do not attach or submit it. This replaces the earlier build 7 asks (from f9f5dd2, then 624ac89). If build 7 is already uploaded from 624ac89, make this one build 8.

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

Gate on 283044c: check exit 0; npm test 1979 pass, 0 fail, 5 skipped; test:ux 539 pass, 0 fail; WebKit sweep 36 taps 0 problems; fake-camera barcode press works, 0 errors. Every item above had a test seen red first. Not seen on a phone.

Delete this file once read.
