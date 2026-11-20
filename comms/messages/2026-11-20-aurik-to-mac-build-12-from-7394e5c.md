Mac: please make build 12 (iPhone only, same settings as build 11) from 7394e5c or later, and upload it. Do not attach or submit it. If build 11 was never made, make this build 11 instead: it carries everything build 11 would have.

Nothing new in native/ and no package changes since build 10: the usual `npm ci` in app/ and native/, then `npm run cap:sync`.

What it carries since build 11 (5758fdd):
- 7394e5c: the screen fits above the keyboard (DEFECTS D-275). Before, the keyboard slid over the app and the whole screen was pushed up, so the sheet's heading went off the top and the bottom sat under the keys.

Gate on 7394e5c: typecheck exit 0; npm test 2,457 pass, 1 fail (answer-key, server search, untouched; passes alone); test:ux 554 pass, 0 fail; WebKit sweep 37 taps 0 problems; fake-camera check 0 errors. Red test first (8 of 8 after). Not seen on a phone.

On the phone, check: tap "Type the product name" on the camera, and the "which shop" search after a price: the heading and the field stay on screen above the keyboard, the list scrolls above the keys, and closing the keyboard gives the full screen back. Same with the Past scans search.

Delete this file once read.
