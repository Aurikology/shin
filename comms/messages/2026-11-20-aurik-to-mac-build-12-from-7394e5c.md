Mac: please make build 12 (iPhone only, same settings as build 11) from 13f498a or later, and upload it. Do not attach or submit it. If build 11 was never made, make this build 11 instead: it carries everything build 11 would have.

One script change in native/ (scripts/sync-web.mjs, 13f498a) and no package changes since build 10: the usual `npm ci` in app/ and native/, then `npm run cap:sync`.

What it carries since build 11 (5758fdd):
- 7394e5c: the screen fits above the keyboard (DEFECTS D-275). Before, the keyboard slid over the app and the whole screen was pushed up, so the sheet's heading went off the top and the bottom sat under the keys.
- 13f498a: the phone build leaves out the 34 MB photo engine (MediaPipe WASM) it never runs while photo ID is off (DEFECTS D-276). `npm run cap:sync` should print "left out js/vendor/mediapipe-wasm". Please note the .ipa / App Store size against build 11's in your reply: on the PC the web files went 38 MB -> 4 MB, but the real sync needs your config, so nobody has seen the build size yet.

Gate on 7394e5c: typecheck exit 0; npm test 2,457 pass, 1 fail (answer-key, server search, untouched; passes alone); test:ux 554 pass, 0 fail; WebKit sweep 37 taps 0 problems; fake-camera check 0 errors. Red test first (8 of 8 after). Gate on 13f498a: 3 new sync tests red first, 6 of 6 after; typecheck 0; test:ux 554/0; WebKit sweep 0 problems; fake-camera 0 errors. Neither change seen on a phone.

On the phone, check: tap "Type the product name" on the camera, and the "which shop" search after a price: the heading and the field stay on screen above the keyboard, the list scrolls above the keys, and closing the keyboard gives the full screen back. Same with the Past scans search. And scan one barcode, to confirm the camera still reads with the photo engine gone (it should: the barcode reader is a separate file).

Delete this file once read.
