Mac: please make build 7 (iPhone only, same settings as build 6) from 624ac89 or later, and upload it. Do not attach or submit it. This replaces the earlier build 7 ask (from f9f5dd2).

**New in native/: a plugin.** Before archiving, in native/: `npm ci`, then `npx cap sync ios` (it runs pod install for CapacitorTextZoom). Without it the app still runs; it just ignores the phone's text size.

What build 7 carries since build 6:
- ecc9622: the torch no longer flashes on and off (D-251); new installs start with it off.
- f9f5dd2: the barcode button stays pressed and keeps looking for 2.5 s (D-252).
- 624ac89: Pexi follows the phone's text size, capped at 150% (D-254).
- c4d11ef: price dates (D-253).

Gate on 624ac89: npm test 1963 pass, 0 fail; test:ux 534 pass; typecheck and check exit 0. Not seen on a phone.

Delete this file once read.
