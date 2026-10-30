Jamin: please build and upload a new TestFlight build from 42fe730 or later (`npm run sync && npx cap sync ios`, then the archive and export in native/README.md), and wake the Mac: at 22:02 UTC on 30 October relay.anjiawenda.com answered Cloudflare 530 (error 1033, tunnel not connected), so the app has no server.

Why the build: tapping the home screen's buttons crashes the whole app (Aurik's report, 29 October). 42fe730 fixes D-249, the likeliest cause: every return to the home screen loaded a fresh 22 MB copy of the barcode reader (11 copies after 10 trips; 1 now). Desktop Chrome frees them, an iPhone kills the page for it. The iOS app bundles app/public into native/www, so a server redeploy does not reach TestFlight; only a new build does.

Not proven: the crash was never reproduced (no iPhone or Safari on the PC). If it still crashes on the new build, the Mac's Safari Web Inspector on a plugged-in iPhone shows the error and the memory graph; whatever it shows goes in DEFECTS.md under D-249.

Delete this file once read.
