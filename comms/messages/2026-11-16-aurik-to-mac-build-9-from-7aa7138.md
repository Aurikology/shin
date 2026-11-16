Mac: please make build 9 (iPhone only, same settings as build 8) from 7aa7138 or later, and upload it. Do not attach or submit it. If build 9 is already uploaded, make this one build 10.

Nothing new in native/ and no package changes since build 8 (e39310c): the usual `npm ci` in app/ and native/, then `npm run cap:sync`.

What build 9 carries since build 8:
- b106208: a thumbs rating, its undo, or an event posted while the server restarts is kept on the phone and sent when the server is back, not dropped (D-268 A3).
- 18db691: the camera says "Pexi is in early access" in a banner on the first visit until Got it, and an "Early access" badge under the wordmark opens it again (Aurik's ask, 2026-11-15).

Gate on 7aa7138: typecheck exit 0; npm test 2217 pass, 0 fail; test:ux 554 pass, 0 fail; WebKit sweep 37 taps 0 problems; fake-camera check 0 errors. Both items had a test seen red first. Seen in Playwright at iPhone 13 size, not on a phone.

On the phone, check: a fresh install shows the banner over the camera; Got it closes it and it stays closed after relaunch; the badge reopens it.

Delete this file once read.
