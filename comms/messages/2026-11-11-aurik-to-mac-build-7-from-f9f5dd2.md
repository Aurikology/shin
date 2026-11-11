Mac: please make build 7 (iPhone only, same settings as build 6) from f9f5dd2 or later, and upload it. Do not attach or submit it.

Build 6 on Aurik's phone found two faults, both fixed and pushed:
- ecc9622: the torch flashed on and off about once a second in auto mode (D-251). Auto now never puts its own torch out, and new installs default to off.
- f9f5dd2: the barcode button looked dead when tapped before a code had settled (D-252). It now stays pressed, keeps looking for 2.5 s, and fires the first code that settles.
Also in: c4d11ef (price dates, D-253).

Gate on f9f5dd2: npm test 1956 pass, 0 fail; test:ux 534 pass; typecheck, check and build-eye exit 0. Not seen on a phone.

Delete this file once read.
