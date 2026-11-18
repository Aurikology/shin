## fix-app

(The lead merges this section into `docs/readiness/needs-jamin.md`. It is a separate file here because the lane branch
was cut before that file existed, and two new files of one name would collide.)

### Every app change below needs a new TestFlight build

Anything under `app/public` reaches phones only in a new build. Before building: bump `APP_VERSION` in
`app/public/js/version.js` (now `2026-11-18.1`), then on the Mac run the usual sync with `--release` and upload.
The server side (the new routes, the Open Food Facts manners, the worker thread) goes live with the next server deploy
and needs no build.

### R13 and R14: the update gate and the switch-off list (settings, no code)

The app asks the server at every launch (`/api/app-status`). Two server settings drive it; both are optional and an
empty value does nothing:

- `SHIN_APP_MIN_VERSION=2026-11-18.1` : any build older than this shows "Please update Pexi". Use the build date
  string of the oldest build you still accept. Set it only after the newer build is live in the App Store, or
  every shopper sees the update screen with nothing to update to.
- `SHIN_APP_FEATURES_OFF=watchlist,share` : a comma list of features to hide in every installed app at once (the
  names the app knows: watchlist, share, pastscans, removed, correct, savings, pack, centsfirstpad). Use it to switch off a broken feature without a build.

A failed or slow check never blocks the app; the gate only fires on a clear answer.

### R17: Cloudflare must not answer the app with a web page (dashboard, about 5 minutes)

The app now shows "Pexi is busy, try again" (and retries once) when a Cloudflare challenge page comes back where an
answer should be. That is a safety net, not a cure: a shopper who is challenged still cannot scan. Cure it at the edge.
Wording from memory, the menu names may differ slightly:

1. Cloudflare dashboard, the getpexi zone, Security, Settings (or Bots).
2. Turn **Bot Fight Mode** off. On the free plan it cannot be skipped by a rule, only switched off.
3. If a paid plan is ever used: leave Super Bot Fight Mode on, and add a Security, WAF, Custom rule: When URI Path
   starts with `/api/` then **Skip** (bot fight, managed challenge). Put it first in the list.
4. Check from a phone on mobile data: open the app, scan a barcode. Then in the dashboard, Security, Events, look for
   "challenge" entries against `/api/` paths; there should be none.

### R09: crash reports, one sentence for the privacy policy (fix-docs lane or you)

The app now sends a short report to Pexi's own server when it hits a script error: the error text, which screen, and the
build number. No device id, no account, no shopping data, and nothing goes to a third party. Suggested sentence:

> If the app hits an error, it sends a short report (the error message, the screen it happened on and the app version,
> with no device identifier) to Pexi's own server so we can fix it.

Where to read them: reports are lines in the server's error log with `"where":"client.js_error"`; search that log by the
build number. A flood of them from one phone is collapsed into one `client.js_error_flood` line.

### R35: Open Food Facts and the other Open Facts calls (optional)

Requests now identify themselves as Pexi and slow down when asked to. Open Food Facts prefers a contact address in the
User-Agent so they can reach us rather than block us. If you want one, give me an address you are happy to publish and it
goes in `OFF_USER_AGENT` (`app/src/open-food-facts.ts`) and `price/src/openprices.ts`. Not invented here.

### R67: offline, a conflict for you to rule on

The register asks for the offline pack to still answer what it can. RULINGS.md (2026-09-17, "not usable offline for now")
and the test that enforces it say the opposite, and RULINGS.md wins. What changed: a typed name that cannot reach the
server now says it needs a connection and offers Try again (before it could read as "nothing matches"). The pack stays
switched off. If you want the pack back for barcodes, that is a ruling change first. Also the register's other half
(record the offline limit in RULINGS as an accepted launch limit) is yours to write in one line.

### R70: CocoaPods read-only on 2026-12-02, what it means here (research, nothing migrated)

Checked: the Podfile and Podfile.lock in `native/ios/App`, each plugin's folder for a `Package.swift`, the official
CocoaPods post (blog.cocoapods.org/CocoaPods-Specs-Repo) and Google's own notice.

- What happens: on that date trunk stops accepting new pods and new versions. Existing versions keep resolving and
  downloading; the CocoaPods post says it "will not break builds". So the app builds exactly as today.
- What is exposed: the eleven Capacitor and plugin pods are local paths and unaffected. The pods that come from trunk are the Google ML Kit
  family (barcode and text scanning, plus GoogleUtilities, GoogleDataTransport, nanopb and friends), RevenueCat and
  PurchasesHybridCommon, IONCameraLib and IONFilesystemLib. They stay pinned in Podfile.lock. The risk is only a FUTURE
  fix or version: after the date a new ML Kit or RevenueCat release may exist only as Swift Package Manager, and Pexi
  could not take it while on CocoaPods. Google says this for its Mobile Ads SDK; I found nothing official either way
  for ML Kit (its install page still shows only CocoaPods), so treat ML Kit as unknown.
- Why not migrate now: checked locally, `@capacitor-mlkit/barcode-scanning` 8.2.1 and `@capacitor-mlkit/text-recognition`
  8.2.1 have no `Package.swift`. Those two ARE the barcode scanner, so a pure Swift Package Manager build has no scanner.
  (That is why the project moved to CocoaPods on 2026-10-17.) The other plugins (camera, filesystem, haptics, text-zoom,
  in-app-review, RevenueCat 13.6.0, secure-storage) already have one.
- Smallest path when it is needed: wait for the two ML Kit plugins to ship `Package.swift` (recheck in January), then
  `npx cap add ios --packagemanager SPM` on the Mac and re-run the TestFlight build. An unofficial wrapper exists
  (d-date/google-mlkit-swiftpm, "experimental"); not checked or recommended.
- Do now (the register's own advice), on the Mac, 10 minutes:
  1. In `native/ios/App`, run `pod install` once so `Pods/` is complete.
  2. Copy `Pods/` and `Podfile.lock` to a second disk or the off-machine backup, labelled with today's date.
  3. Put a calendar reminder for the first week of January 2027: "check ML Kit and RevenueCat for Swift Package Manager".
