Jamin: the 10-a-week free limit is already on live (checked 2026-11-18 15:10Z: `/api/quota` for a fresh proven device answers `limit: 10`, so SHIN_FREE_SCANS_PER_WEEK is set on the Mac). The go-live plan (docs/paywall-go-live-2026-11-17.md) keeps it off until Aurik's sandbox purchase on build 10 works, because RULINGS "Pexi Plus pricing and free scans" switches it on only once a test purchase works. Right now a tester's 11th barcode scan opens a paywall that has never completed a purchase.

Your call: keep it on (say so, and it gets logged as a ruling), or unset it on the Mac until Stage 4 passes.

Also: the Claude range ask is live and checked from outside (DEFECTS D-274), and the x-shin-plus header no longer grants Plus (D-141 closed). Delete this file once read.
