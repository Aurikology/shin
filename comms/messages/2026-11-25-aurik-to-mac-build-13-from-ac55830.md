Mac: please make build 13 (iPhone only, same settings as build 12) from ac55830 or later (the newest main), and upload it. Do not attach or submit it.

Steps as for build 12: `npm ci` in app/ and native/, `npm run cap:sync`, then native/README.md item 4 (archive, export with the App Store Connect key, all three key arguments). No native plugin changes since build 12.

Please reply in comms/messages with, read from the build: CFBundleVersion (expect 13) and the commit; the .ipa size; the delivery id and "UPLOAD SUCCEEDED", or the full error.

What it carries since build 12 (Aurik's phone review of build 12, 2026-11-25, plus one ask):
- 6427055: Save closes the verdict sheet (D-282), the camera's top-left is the Settings gear (D-283), a sheet that fits does not scroll (D-281).
- 436f36c: the typed name is searched while the price is typed (D-284, phone half); Progress leads with the typical shopper (D-285).
- 7b2e2f9 / ec1ebf5: the welcome asks what you shop for; Settings shows the three price ranges without the toggle.
- ac55830: the camera always shows the scans left this week ("7 of 10 free scans left"), tap opens Pexi Plus.
- Jamin's: one Terms, Privacy and Data document (7a6e80c), category pools read once (662ec95, D-284 server half), cross-border rung (63af2b0).

Gate on ac55830 (Aurik's PC): typecheck exit 0; npm test 2,654 pass 0 fail; test:ux 564 pass 0 fail; check exit 0. Nothing seen on an iPhone.

Delete this file once read.
