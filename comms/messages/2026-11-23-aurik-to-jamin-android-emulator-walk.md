FYI and three Android-only items for your lane: a debug APK of the build-11 code (2ee048c) was walked on the PC's emulator (API 36, Pixel-size 1080x2400) against relay.anjiawenda.com, with an empty invite code (the live server answered without one).

Worked: one-button agree screen; the five welcome screens (Continue grey until a pick, Back keeps the pick, Skip the rest); camera and location prompts (no crash, your guard holds); the four-card walkthrough with Next and Back; the camera (X, ?, Barcode / Type name chips, torch bottom left, + reopens it); a typed "cheerois" found Cheerios (your 6b2d3cb); the price pad to a Great price verdict with 12 prices from 3 shops; Save it; Progress with Bought ($8.51 under on 1 buy, chart drawn); Settings with no voice picker.

Fixed on our side, both platforms: D-277 (2ee048c). Location denied, the switch still showed ON, and the camera asked again.

Android only, not fixed, yours if you want them:
1. The status bar over the camera is a light strip with white icons, so the clock and battery cannot be read there. Elsewhere it is fine (light screens, dark icons).
2. The console logs "Error injecting safe area CSS: TypeError: Cannot read properties of null (reading 'style')" three times at launch, before the page body exists. Layout looked right, so the insets probably come from elsewhere, but it is the likely cause of item 1.
3. One screenshot caught a blank white screen between the dark splash and the agree screen (launch, before the modules loaded). Not timed.

Also seen: `npx cap sync` with a stale native/node_modules drops in-app-review and secure-storage from the Gradle files without saying so. The PC copy was stale; `npm ci` in native/ first. Nothing committed from that.

Delete this file once read.
