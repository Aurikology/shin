Mac: please make build 10 (iPhone only, same settings as build 9) from 440e22a or later, and upload it. Do not attach or submit it. If build 10 is already uploaded, make this one build 11.

Nothing new in native/ since build 9 (8280a6e): the usual `npm ci` in app/ and native/, then `npm run cap:sync`.

What build 10 carries since build 9:
- 4c561dd: the paywall has a seller line, "Sold by Jamin Xu (Pexi). Contact: useshinapp@gmail.com. Refunds are handled by Apple." (legal review question 13).
- 4c561dd: the You screen draws the Pexi Plus block on the iPhone for the first time: "N of 10 free scans left this week" (once the limit is on) and a "Manage or cancel subscription" row that opens Apple's subscriptions page (legal review question 14).

Gate on 4c561dd: typecheck exit 0; npm test 2322 pass, 0 fail; test:ux 554 pass, 0 fail. The new tests were seen red first. Not seen on a phone.

This build is the one Aurik's sandbox purchase runs on (docs/paywall-go-live-2026-11-17.md, Stage 4). Do not set SHIN_FREE_SCANS_PER_WEEK or SHIN_PLUS_SCANS_PER_WEEK yet: that is Stage 5, after the purchase works.

Delete this file once read.
