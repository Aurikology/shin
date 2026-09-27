Jamin: the phone's on-device text reader is on main, and iOS needs one Mac-side change before it (or the ML Kit barcode plugin) can be in an iOS build.

The native iOS project uses Swift Package Manager, and both @capacitor-mlkit plugins (barcode-scanning, already a dependency, and text-recognition, added today) support CocoaPods only, so `npx cap sync` leaves both out of iOS. Aurik's session did not touch native/ios. What the Mac needs, per the plugin docs:

1. Move native/ios aside, then `npx cap add ios --packagemanager CocoaPods`, and re-apply the hand edits kept in ios/ (camera usage string, bundle id).
2. In ios/App/Podfile: `platform :ios, '15.5'`.
3. `npm run cap:sync`, then `cd ios/App` and `pod install`, then build in Xcode.

Also new in native/package.json: @capacitor/filesystem 8.1.3 (the text plugin reads a file path, not base64). A plain `npx cap sync ios` on the SPM project also adds CapacitorCamera and RevenueCat to Package.swift, which had never been synced there; worth a look before the RevenueCat build.

Android: synced here, but this PC cannot build it (Capacitor 8 modules need JDK 21; it has 17).

For testers nothing changes while SHIN_CATALOGUE_FIRST is off: in the phone app the reader reads at most one frame, the server answers 404, and the reader switches itself off for the session. No image leaves the phone either way.

Delete this file once read.
