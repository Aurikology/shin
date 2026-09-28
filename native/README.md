# Shin native wrapper

Capacitor project that wraps the existing web app (`app/public`) for iOS and Android.
Owned entirely by `native/`; nothing outside this directory is touched by anything below.

The app name and bundle id are already real on Android and in `capacitor.config.json`
(`Shin` / `com.useshinapp.shin`, checked 2026-09-28) but are STILL PLACEHOLDERS on iOS
(`Info.plist` and `project.pbxproj` still read `PriceCheck Placeholder` /
`com.placeholder.pricecheck`). See "The name is not cleared yet" below before touching anything
that shows a name to a person on iOS.

## Where things stand right now (checked, not assumed)

- **Android is the critical path.** It builds from this Windows laptop with no Apple anything.
  The plan's own fallback is a sideloaded Android build for Android testers while iPhone
  testers use the hosted web app in Safari until TestFlight exists.
- **iOS is blocked on things only the founder can do**, checked on the Mac itself:
  - Xcode is NOT installed there. Only the Command Line Tools are (`xcode-select -p` returns
    `/Library/Developer/CommandLineTools`; `xcodebuild -version` fails, asking for a full Xcode).
  - There are ZERO code signing identities on that Mac (`security find-identity -v -p codesigning`
    returns "0 valid identities found").
  - node v26.7.0, npm 11.19.0, 180 GiB free disk are confirmed fine.
- **Android also has an unmet prerequisite on THIS Windows laptop**, checked in this session:
  no `java` on PATH, no Android SDK found at the usual `%LOCALAPPDATA%\Android\Sdk`. Android
  Studio (which brings both) is not installed here either. Smaller and free to fix, no account
  needed, but not yet done.

Nothing below is a claim that a build has actually succeeded. Everything is either a command
run and its real output, or a command not yet run, labelled as such.

## The name is not cleared yet

A trademark search is running in another lane. iOS still uses a placeholder name and a
placeholder bundle id; Android and `capacitor.config.json` have already moved to the real ones
(checked 2026-09-28: `Shin` / `com.useshinapp.shin`), ahead of that clearing. Changing the iOS
ones later is ONE edit per file listed here, no hunting:

| What | File | Current value |
|---|---|---|
| App display name (source of truth) | `native/capacitor.config.json` | `appName: "Shin"` (cleared) |
| Bundle id (source of truth) | `native/capacitor.config.json` | `appId: "com.useshinapp.shin"` (cleared) |
| Android app label | `native/android/app/src/main/res/values/strings.xml` | `app_name`, `title_activity_main` = `Shin` (cleared) |
| Android package id | `native/android/app/src/main/res/values/strings.xml` | `package_name`, `custom_url_scheme` = `com.useshinapp.shin` (cleared) |
| Android application id | `native/android/app/build.gradle` | `namespace` and `applicationId` = `com.useshinapp.shin` (cleared) |
| Android Java package + folder | `native/android/app/src/main/java/com/useshinapp/shin/MainActivity.java` | package `com.useshinapp.shin` (cleared; the folder path has already moved) |
| iOS display name | `native/ios/App/App/Info.plist` | `CFBundleDisplayName` = `PriceCheck Placeholder` (still the placeholder) |
| iOS bundle id | `native/ios/App/App.xcodeproj/project.pbxproj` | `PRODUCT_BUNDLE_IDENTIFIER = com.placeholder.pricecheck;` (appears twice, Debug and Release configs; still the placeholder) |

Easiest path once the name clears: edit `capacitor.config.json` to the real values, then run
`npx cap sync` from `native/` -- Capacitor's own sync step rewrites every file above except the
Java package folder, which needs Android Studio's rename refactor (or `npx cap add android`
again into a clean checkout). This README's table is the map either way.

The iOS camera permission string (`NSCameraUsageDescription` in `Info.plist`) deliberately says
"This app", not the product name, so nothing named appears in a permission dialog before the
name clears.

## The hosted API address is not chosen yet

One file: `native/config/shin-api.config.json`.

```json
{
  "apiBase": "https://REPLACE-WITH-REAL-HOSTNAME.example.invalid",
  "inviteCode": "REPLACE-WITH-REAL-INVITE-CODE"
}
```

`npm run sync` (or `npm run cap:sync`) reads this file and injects
`window.SHIN_API_BASE` / `window.SHIN_INVITE_CODE` into the copy of the app it builds, before
`/js/main.js` loads. Point the wrapper at the real server by editing this one file and
re-running the sync. Nothing else in `native/` names the hostname.

`app/public/index.html` itself is never edited -- see "How the wrapper serves the web app" below.

## How the wrapper serves the web app

`native/scripts/sync-web.mjs` copies `app/public` into `native/www` (gitignored, regenerated every
time) and inserts one inline `<script>` into that COPY, right before the existing
`<script type="module" src="/js/main.js">` tag, setting `window.SHIN_API_BASE` and
`window.SHIN_INVITE_CODE`. `app/public/index.html` is never touched. `npx cap sync` then copies
`native/www` into both platform projects (`android/app/src/main/assets/public`,
`ios/App/App/public`).

Run it with `npm run sync` alone, or `npm run cap:sync` which also runs `npx cap sync` after.

## Camera/barcode native fallback (plan item 3b)

Installed: `@capacitor/camera` (photo capture) and `@capacitor-mlkit/barcode-scanning`
(hardware barcode scan + torch, Google ML Kit on Android, AVFoundation-backed on iOS).

`native/native-bridge/camera-bridge.js` (removed 2026-09-27, becf7d8) wraps both behind three functions --
`scanBarcodeNative()`, `capturePhotoNative()`, `setTorchNative(on)` -- gated by
`window.SHIN_NATIVE_CAMERA_FALLBACK` (a flag, added to `shin-api.config.json` alongside
`apiBase`; default `false`). Flipping that one flag is the whole switch; nothing here is a
rewrite of the camera code.

**This is prepared, not wired in, and I want that said plainly rather than implied working.**
The web app calls its camera through three points in code I do not own and did not edit:

1. `startCamera(video)` in `app/public/js/screens/camera.js` (~line 71) -- calls
   `getUserMedia` directly; on failure it falls to a drawn/simulated shelf.
2. `eye.setTorch(on)` in `app/public/js/eye.js` (~line 2692), called from `camera.js` (~line 1790).
3. `eye.capture()` in `app/public/js/eye.js`, called from `camera.js` (~line 2076).

Wiring the native fallback in means adding, at each of those three points, a check like
`if (!stream && nativeFallbackAvailable()) return scanBarcodeNative()` -- a few lines in `app/`,
not in `native/`. That edit is outside my file ownership for this task, so it is reported here
rather than made. Until it lands, `camera-bridge.js` is a tested-in-isolation module sitting
next to the app, not yet in its call path.

## iOS: prerequisites, in order, none of them done yet

Checked on the Mac itself this session -- state it plainly rather than skip to `xcodebuild`:

1. **Install Xcode from the Mac App Store.** Needs an Apple ID signed into the Mac. It is a
   multi-gigabyte download (recent Xcode releases run 10-16 GB); start it well before it is
   needed, on real wifi, not a hotspot.
2. **Accept the licence and switch the active developer directory**, after Xcode is installed:
   ```
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```
3. **Get a signing identity.** Right now there are zero (`security find-identity -v -p
   codesigning` returns nothing). A free Apple ID gets a personal-team development certificate
   good for on-device testing for 7 days at a time, no payment. TestFlight (item 4a/4b below)
   needs the paid Apple Developer Program ($99 USD/year) regardless, so enroll in that before
   the six-person beta needs it, not right before.
4. **Only after 1-3**, from `native/`:
   ```
   npm run sync
   npx cap sync ios
   npx cap open ios
   ```
   This opens Xcode. Pick a signing team under Signing & Capabilities, pick a connected iPhone
   or a simulator as the run target, then Run. Building the `.ipa` for TestFlight is Xcode's
   Product > Archive, then Distribute App > TestFlight & App Store Connect, from inside the
   organizer.

None of step 4 has been run: it cannot be, from this Windows session, and step 1-3 are not done
on the Mac yet either.

## Android: prerequisites, checked on THIS Windows laptop this session

Not done yet, but no account and no payment needed for any of it:

1. **Install a JDK 17 or newer.** `java -version` in this session returned "command not found".
2. **Install Android Studio** (brings the Android SDK, platform tools and an emulator manager;
   this is the path of least friction over hand-installing `sdkmanager`). No SDK was found at
   the usual `%LOCALAPPDATA%\Android\Sdk`.
3. After install, Android Studio's SDK Manager needs the Android 14/15 (API 34-36) platform and
   build-tools; `native/android/variables.gradle` targets `compileSdk 36` already.

## Android: build commands, once the SDK above exists

From `native/`, PowerShell or Git Bash:

```
npm run sync
npx cap sync android
cd android
./gradlew.bat assembleDebug
```

Output: `native/android/app/build/outputs/apk/debug/app-debug.apk` -- unsigned, installable by
sideloading (below), the fastest path to a phone in someone's hand.

For the Play Console internal track (item 4c) instead of sideloading:

```
cd android
./gradlew.bat bundleRelease
```

Output: `native/android/app/build/outputs/bundle/release/app-release.aab`. A release build
needs a signing key first -- Android Studio's Build > Generate Signed Bundle/APK walks that
the first time and remembers it after; do this in Android Studio rather than by hand, it is a
one-time wizard, not a recurring command.

Neither command has been run in this session: the JDK and SDK it depends on are not installed
here yet. Once they are, `assembleDebug` is the one to try first -- it needs no signing key.

## Sideloading the Android build (this is what the beta actually starts on)

No Play Console, no account, works today once `app-debug.apk` exists:

1. Get the file onto the tester's phone: email it to an address they check on the phone, or a
   shared Drive/Dropbox link, or a cable + `adb install app-debug.apk` if the phone is in hand
   and USB debugging is on.
2. Opening the file (from Files, Downloads, or the email attachment) prompts Android to install
   it. On a phone that has never sideloaded anything, Android blocks it once and shows
   **"For your security, your phone is not allowed to install unknown apps from this source"**
   with a **Settings** button on that same prompt -- tapping it goes straight to
   **Install unknown apps** for that one source (the browser, Files, or Gmail, whichever opened
   it) with a toggle, **Allow from this source**. Turn it on, back out, tap the file again, and
   the normal install screen appears (permissions listed, an **Install** button).
3. That "allow this source" toggle is per source-app and stays on across restarts, so it is a
   one-time thing per tester per app they use to open the file, not per install.
4. First launch will ask for the camera permission this project declares (see below); that
   prompt persisting across restarts is item (3a)'s fourth test-matrix row.

## iPhone fallback until TestFlight exists

Because iOS needs the enrollment above, the six testers with iPhones are not blocked on it:

1. Open the hosted `https://` address (once item 1 of the beta plan gives it a hostname) in
   **Safari** specifically -- not Chrome-on-iOS, which cannot add a home-screen icon with a
   standalone window the same way.
2. Share button > **Add to Home Screen**. This uses the existing `manifest.webmanifest` and the
   meta tags already in `app/public/index.html` (`apple-mobile-web-app-capable`, the icons) --
   nothing in `native/` is involved for this path at all.
3. Honestly, what is the same and what is not, compared to the native wrapper:
   - **Same:** the whole app, offline pack, theming, everything `app/public` already does.
   - **Same:** the camera, for a Safari-based home-screen app -- Safari's WebKit is the same
     engine the web camera path already targets, so `getUserMedia` behaves like it does in
     Safari proper. This is NOT the wrapper's WebView, so the "web camera fails inside the
     wrapper" problem item 3b exists for does not apply here; there is no native fallback
     available in this mode either, because there is no native shell to fall back into.
   - **Different:** no App Store icon polish beyond the PWA icon already in `app/public`, no
     TestFlight update mechanism (Safari re-fetches on load, same as any web page), and no
     access to the two native plugins in this project (`@capacitor/camera`,
     `@capacitor-mlkit/barcode-scanning`) -- moot until camera-bridge.js is wired in per the
     section above, since the web camera path is what runs either way.
   - **Different:** push notifications are not available to a home-screen web app on iOS the
     way they are to a native app (out of scope for this beta either way).

## Store setup, ordered, for once the accounts clear (items 4a/4c)

Nothing below can run without the accounts, which do not exist yet. Order matters; each step
names what it needs from the one before it.

**Apple / TestFlight:**
1. Enroll in the Apple Developer Program ($99 USD/year, an Apple ID, and a government ID for
   identity verification). **Apple publishes no processing time.** The only number on its site
   is "if you haven't received a membership confirmation within 24 hours of your purchase,
   contact us", which is about the confirmation email and not about approval; Apple's own 2026
   forum threads carry individual enrolments stuck three weeks and longer on identity checks.
   The "up to 48 hours" this step used to state was unsourced and is corrected here (D-088's
   sibling; `docs/decisions.md` of 2026-09-11 already said it right: "neither vendor states a
   processing time"). Plan accordingly: this is the long pole and nobody here controls it.
   Full packet, with sources: `docs/the-store-accounts-packet.md`.
2. In App Store Connect, create a new app record: platform iOS, name, primary language,
   bundle id (must match `PRODUCT_BUNDLE_IDENTIFIER` in
   `ios/App/App.xcodeproj/project.pbxproj` above), SKU (any unique string, e.g. the bundle id
   again).

   > **STOP. Do not run this step with the placeholder.** Today that file reads
   > `com.placeholder.pricecheck`, and so do `capacitor.config.json`, `build.gradle` and
   > `strings.xml`. **A bundle id used once in App Store Connect cannot be reused on another
   > account, and a TestFlight-only build is enough to burn it** — it does not need to reach the
   > store. So the placeholder must never touch either console, not even as a test, or the real
   > id is gone before the name is even chosen.
   >
   > Two other things set here are permanent and are set for the first time by this step. The
   > **Developer Name** (the seller name shown to every customer) is fixed at the first app
   > record and cannot be edited afterwards; on the individual enrolment path that is your
   > personal legal name, publicly, forever. And the app **name** is gated on the CIPO trademark
   > search (beta-plan item 5) plus `CLAUDE.md` hard rule 1, "no name in public until it is
   > cleared" — and `docs/decisions.md` already records that "Shin Ramen" is dead as a name.
   >
   > Order that avoids the dead end: clear the name, set the real bundle id in all four files,
   > THEN create the record.
3. In Xcode (see the iOS build section above), Product > Archive, then Distribute App >
   App Store Connect > Upload. This needs the signing identity from the iOS prerequisites.
4. Back in App Store Connect, under TestFlight, add the six testers as **Internal Testers**
   (no App Review needed for internal testing) once the build finishes processing.
   **An internal tester is not just an email address.** Apple requires internal testers to be
   users on your App Store Connect team holding Account Holder, Admin, App Manager, Developer
   or Marketing. Six family testers on the internal track means six people added as users on
   the developer account. The alternative is external testing, which takes plain emails but
   adds Beta App Review. This step used to read "add the six testers by email", which hid the
   whole decision.
5. Each tester gets an email invite; they install the **TestFlight** app first, then accept.

**Google / Play internal track:**
1. Enroll in the Play Console (one-time $25 USD, a Google account). **Personal accounts now
   require a government-ID review and device verification through the Play Console mobile app;
   the "near-instant" this step used to state describes the signup as it was before November
   2023 and is corrected here.** No processing time is published. The $25 is not refunded if
   verification fails, so make the name on your ID, the name on the card and the name in the
   form match before paying. Note also that the 12-testers-for-14-continuous-days requirement
   gates PRODUCTION access for personal accounts created after 2023-11-13; it does not gate the
   internal track, which is what the six-person beta uses.
2. Create a new app in Play Console: name (`Shin`, already the real name on the Android side),
   default language,
   app or game, free or paid (free), fill the required declarations (content rating
   questionnaire, data safety form, target audience -- these ask real questions about what the
   app does and collects; answer them from what the app actually does, do not template them).
3. Under Testing > Internal testing, create a release, upload `app-release.aab` (built above,
   needs the signing key from Android Studio's wizard).
4. Add the six testers by email to the internal testing list; Play Console gives an opt-in URL
   once the release is live -- share that link with the testers, they open it on the test
   device and tap **Become a tester**, then install from the Play Store link it shows.

## Shin Plus: RevenueCat (2026-09-21)

`@revenuecat/purchases-capacitor` 13.6.0 is installed here. The web app reaches it through
`window.Capacitor.registerPlugin('Purchases')`: `native/scripts/sync-web.mjs` copies Capacitor's browser
build to `www/js/capacitor.js` and loads it before `main.js`, because `app/public` has no bundler.
Code: `app/public/js/purchases.js`; names and URLs: `app/public/js/plus-config.js`.

- Keys: copy `config/revenuecat.config.example.json` to `config/revenuecat.config.json`
  (gitignored) and put the PUBLIC SDK keys in it (`appl_...`, `goog_...`). The sync refuses an
  `sk_` secret key. With no key a platform shows no plans.
- RevenueCat dashboard: entitlement `plus`; offering `default` with a monthly and an annual
  package; products `shin_plus_monthly` and `shin_plus_yearly` in both stores. The app user id is
  the device id every API call already sends, so the server can check a device's subscription.
- Android: `npx cap sync android` was run on the Windows laptop 2026-09-21 and found the plugin.
  Still to do: a Play build with Billing, the two subscriptions in Play Console.
- iOS, on the Mac only: `cd native && npm install && npm run cap:sync` (runs `npx cap sync`, which
  adds the plugin to the iOS project), then in Xcode add the In-App Purchase capability to the App
  target, and create the two products in App Store Connect (Paid Applications Agreement first).
- Terms and Privacy URLs on the subscription screen are placeholders in `plus-config.js` until
  both are hosted.

## Test matrix (plan items 3a/2g), blank until run on a real phone

Cannot be filled in from this session: no phone, no store account, no signed build exists yet.
Run this once a debug APK (or a signed TestFlight/internal-track build) is on a real device.

| Check | Device | Result | Notes |
|---|---|---|---|
| Barcode scan reads a real product barcode | iPhone (model: ____) | | |
| Barcode scan reads a real product barcode | Android (model: ____) | | |
| Photo capture path produces a usable photo | iPhone | | |
| Photo capture path produces a usable photo | Android | | |
| Torch toggles the real flashlight | iPhone | | |
| Torch toggles the real flashlight | Android | | |
| Camera permission prompt appears once, correct wording | iPhone | | |
| Camera permission prompt appears once, correct wording | Android | | |
| Camera permission choice persists after a full app/phone restart | iPhone | | |
| Camera permission choice persists after a full app/phone restart | Android | | |
| Scan-to-verdict works over cellular data, wifi off | iPhone | | |
| Scan-to-verdict works over cellular data, wifi off | Android | | |
| One clean install from TestFlight / the sideloaded APK on a phone that is not the founder's | iPhone | | |
| One clean install from TestFlight / the sideloaded APK on a phone that is not the founder's | Android | | |

## Build/verify commands actually run in this session, and their real result

```
cd native && npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios \
  @capacitor/camera @capacitor-mlkit/barcode-scanning
# -> added 101 packages, succeeded

npx cap add android   # -> "android platform added!", succeeded
npx cap add ios       # -> "ios platform added!", succeeded (scaffolds files; does not build)
node scripts/sync-web.mjs   # -> copied app/public -> native/www, injected SHIN_API_BASE, succeeded
git check-ignore -v native/node_modules/... native/www/... native/android/app/build/...
  native/ios/App/Pods/...   # -> all confirmed ignored
git check-ignore -v native/android/app/src/main/AndroidManifest.xml
  native/ios/App/App/Info.plist   # -> confirmed NOT ignored (hand-edited files stay tracked)
```

Not run, and why: `gradlew.bat assembleDebug` (no JDK/Android SDK on this laptop yet),
anything under Xcode (`xcodebuild`, `cap open ios`) (no Xcode on the Mac yet, and this session
is on Windows regardless), any store console step (no accounts), the test matrix above
(no phone in this session).
