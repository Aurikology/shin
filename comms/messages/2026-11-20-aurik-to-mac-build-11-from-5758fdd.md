Mac: please make build 11 (iPhone only, same settings as build 10) from 5758fdd or later, and upload it. Do not attach or submit it. If build 11 is already uploaded, make this one build 12.

Nothing new in native/ and no package changes since build 10 (59d2ba1; the only native change since is build 10's own number): the usual `npm ci` in app/ and native/, then `npm run cap:sync`.

What build 11 carries since build 10 (R79, iOS clearing the app's web storage):
- 4a2b611: after a wipe the phone gets back the look the shopper picked (shown on that launch), their language, the newest watchlist entries (a big list used to be dropped whole) and their newest Past scans (none came back before; the server keeps totals only).
- 2c808dc: also the names the shopper gave unknown barcodes, and their shops.
- 5758fdd: test-only, the "5.1 control" ECONNRESET flake (test server keep-alive).

Gate on 5758fdd: typecheck exit 0; npm test pass, 0 fail (desk-check 12 of 12; 2,447 pass serially on 4a2b611); test:ux 554 pass, 0 fail; WebKit sweep 37 taps 0 problems; fake-camera check 0 errors. Every change had a test seen red first. Not seen on a phone.

On the phone, check: set Dark on the You screen, add a watchlist item and scan two things; then delete Pexi from the home screen (this empties its web storage; the Keychain stays), reinstall from TestFlight, open: setup is not asked again, the screen is dark from the first frame, the watchlist and Past scans are there.

Delete this file once read.
