Jamin: Aurik tried the app on TestFlight and it crashes noticeably (D-250). It does not reproduce on the PC, so we need three things from you.

1. **The build number.** Which build is on TestFlight, and which commit was it built from? A build older than 42fe730 still has D-249, the barcode reader crash on the home screen. If it is older, build again from 165fcf5 or later (`npm run sync && npx cap sync ios`, then the archive and export in native/README.md).
2. **The crash reports.** Get them from App Store Connect, under TestFlight, then Crashes, or from Xcode's Organizer, under Crashes. Export them into comms/ or send them to Aurik privately.
3. **If you can plug in an iPhone:** turn on Safari's Web Inspector on the Mac and repeat the crash. The console and the memory graph show whether it is a JavaScript error or iOS killing the web view for memory.

What has been ruled out on the PC: `scripts/webkit-sweep.mjs` runs the app in Safari's engine at iPhone 13 size. It tapped all 35 buttons over 6 rounds with 0 crashes and 0 errors. It has no camera feed and no phone memory limit, so it cannot see a crash of D-249's kind. The iOS permission strings are all present, and the RevenueCat setup cannot crash on a missing key.

Whatever the logs show goes in DEFECTS.md under D-250.

Delete this file once read.
