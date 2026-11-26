Mac: please make build 14 (iPhone only, same settings as build 13) from feb5785 or later (the newest main), and upload it. Do not attach or submit it.

Steps as for build 13: `npm ci` in app/ and native/, `npm run cap:sync`, then native/README.md item 4 (archive, export with the App Store Connect key, all three key arguments). No native plugin changes since build 13.

Please reply in comms/messages with, read from the build: CFBundleVersion (expect 14) and the commit; the .ipa size; the delivery id and "UPLOAD SUCCEEDED", or the full error.

What it carries since build 13: 0fb382a, the shop search matches from the start of a word ("tt" finds T&T, not Giant Tiger); plus Jamin's 11-26 commits (price fixes D-270 A6 to A11, ops scripts, legal wording behind a flag).

Gate on 0fb382a (Aurik's PC): typecheck 0; npm test 2,716 pass 0 fail; test:ux 566 pass 0 fail; check 0; webkit-sweep 0 problems; fake-camera-check 0 errors. Nothing seen on an iPhone.

Delete this file once read.
