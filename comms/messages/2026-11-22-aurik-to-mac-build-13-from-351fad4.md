Mac: please make build 13 (iPhone only, same settings as build 12) from the newest main (at least the commit that brought this line; was 351fad4: Settings, Progress and the Cal AI camera landed since), and upload it. Do not attach or submit it. If build 12 was never made, make this build 12 instead: it carries everything build 12 would have.

No native or package changes since build 12: the usual `npm ci` in app/ and native/, then `npm run cap:sync`. The press haptics use the Haptics plugin presets the wrapper already has (iOS light impact, Android TICK), so no plugin change.

What it carries since build 12 (13f498a), besides Jamin's own commits (one-button agree screen 5ecc9ec, and the rest):
- c668d1e/73d20c1: every press gives a light haptic tap (Aurik's ask). The barcode button and Save keep their own single haptic. You, Scanning, Haptics turns all of it off.
- The same commit: a four-card "How Pexi works" walkthrough after the permission screen and before the first camera, once. Skip on every card. Replay from You, Help.
- 0b395ff: the welcome is back as a five-screen Cal AI-style onboarding (welcome, gender, how often, where you shop, camera and location), then the walkthrough. Gate 2,613/0, test:ux 562/0, WebKit 36 buttons 0 problems.
- d43f8dd: Settings is only settings (no voice picker), and a new Progress tab: scans, the total under the typical price on scans marked Bought, a chart, the + to scan.
- Then: the camera is Cal AI's: an X top left (to Progress), a ? (How Pexi works), Barcode / Type name chips, the torch at the bottom left.
- The same commit as the walkthrough: the You screen is grouped into eight sections (Your Pexi, Prices, Scanning, Look, Pexi Plus, Your activity, data, Help).

Gate on 73d20c1 rebased onto 714b719..ae87b03: typecheck exit 0; npm test 2,589 pass 0 fail; test:ux 562 pass 0 fail; check exit 0; WebKit sweep 35 buttons 0 problems; fake-camera check 0 errors. Merged with 00c6b55 (server.ts only) without a re-run. Nothing seen on a phone.

On the phone (Aurik): delete and reinstall, then check: the one-button agree screen (Jamin asked for a look); the five welcome screens (Continue stays grey until you pick, Skip works on each); the walkthrough's four cards, Next, Back, Skip; then tap around and feel a light tap on every press, a single tap on a barcode capture (not on the button press), the success buzz on a confident verdict; turn You, Haptics off and feel nothing. Note any press that feels too strong or doubled. Then: the X goes to Progress; mark two scans Bought and watch the total and the chart; the + reopens the camera; Settings has no voice picker; the torch works from the bottom.

Delete this file once read.
