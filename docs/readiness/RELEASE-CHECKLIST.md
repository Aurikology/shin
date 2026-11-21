# Pexi release checklist (written 2026-11-21)

The steps to ship an app build and a server change without hurting shoppers. `RUNBOOK.md` cites this file at R29, R31,
R37, R47 and R73. Short and in order; tick each line, skip none for a first release. Menu names in App Store
Connect and RevenueCat are from memory (ASSUMED): read the screen if a name differs.

## A. A server change (no new build)

1. Never change a route and the app in the same release. Keep an old route alive for one build back (R13).
2. Push to `main`. The Mac's deploy gate runs every test folder (the app, spine, identify, catalogue, price, bench, and the
   mac and scripts tests) plus the app typecheck; red leaves the live server untouched and says which test.
3. If App Review is pending, do not deploy: mail the Mac `deploy: hold App Review pending`, and `deploy: release` after (R29).
4. After the deploy: `curl -s https://relay.anjiawenda.com/api/health` answers 200 with `scanLog` true, `catalogueUp` true
   and no faults; then scan one known barcode from a phone and read the price.

## B. An app build (TestFlight, then the App Store)

1. Check that the change does not need a newer server than the live one, and that the server it needs is already deployed (A).
2. Bump the build number in Xcode (target App, General, Build) to a number above the last upload. There is no
   `APP_VERSION` to type: `native/scripts/sync-web.mjs` stamps the phone copy as `<date>.<build number>`, so the number the
   update gate judges rises with every upload. Do this BEFORE the sync (or pass `SHIN_BUILD_NUMBER=<n>`); the sync stops
   if the number is unreadable.
3. Release keys: on the Mac run `cd native && node scripts/sync-web.mjs --release` (or `SHIN_RELEASE=1`), then `npx cap sync`.
   It refuses a secret `sk_` key, a key of the wrong platform, and a missing iOS key (`native/scripts/rc-keys.mjs`):
   `native/config/revenuecat.config.json` must hold an `appl_` public key. Read the printed line
   `RevenueCat keys: ios set` and `APP_VERSION=...` before archiving.
4. Before submitting: run the phone probe from the PC, `node scripts/phone-contract-probe.mjs --origin capacitor://localhost`,
   and read the result (R29). Probe just before you press submit, not the day before.
5. Check the listing against `docs/store/listing.md` and its "App Review notes" (no account, the demo scan, the barcode
   image, Plus can be bought with a sandbox Apple ID). Anything that changes how data is used: run
   `docs/readiness/before-changing-data-use.md` first (R47).
6. Set the release to **manual**, not automatic (App Store Connect, the version, Version Release). After approval, release
   by hand when the Mac is up and awake.
7. Updates (not 1.0): turn on **phased release** (release over 7 days). Version 1.0 cannot be phased, so for the first
   public build the update gate and the switch-off list are the only brake: know their settings (section D) before you release.
8. While the build is in review: no deploys, Mac on and awake, tunnel up (R29). Rejected for "could not connect": fix, reply
   in Resolution Center the same day and resubmit.

## C. Test purchase, before you tell anyone

1. After the release is live, buy Plus once yourself (a sandbox Apple ID on TestFlight; on the live app,
   your own Apple ID). Check the You screen shows Plus, a scan past the free limit works, and the purchase shows in RevenueCat.
2. Restore Purchases on a second phone with the same Apple ID (`needs-jamin.md`, the restore entry).
3. Wait up to 24 hours after release before announcing it (R31). Then, and only then, tell people.
4. Ask real users only. No rewards or discounts for a review, no friends or family posting five-star reviews, and use
   Apple's own review prompt (R37). A launch push that manipulates reviews breaks Apple's rules and puts the account at risk
   (R38). If Apple writes: reply truthfully and stop the practice.

## D. A bad build is out (R13, R14)

1. App Store Connect: pause the phased release, or remove the build from sale; TestFlight: expire the build.
2. Switch a broken feature off with no build: on the Mac edit `~/shin/mac/config.env`, set
   `SHIN_APP_FEATURES_OFF=<names>` (watchlist, share, pastscans, removed, correct, savings, pack, centsfirstpad), restart the server
   (`launchctl kickstart -k gui/$(id -u)/com.shin.server`), and check `curl -s https://relay.anjiawenda.com/api/app-status`.
3. Block the bad build: set `SHIN_APP_MIN_VERSION=<YYYY-MM-DD.N>` to the fixed build's version (the line the sync printed,
   which ends in its build number), restart, check `/api/app-status`. Only after the fixed build is live in the App Store,
   or every shopper sees "Please update Pexi" with nothing to update to. Because the version ends in the build number, the
   fix is always above the bad build and the setting can tell them apart.

## E. Two weeks after launch: does anyone pay?

On launch day write the date down; on day 14 run, with `SHIN_ADMIN_TOKEN` in your shell:

```
node scripts/funnel-report.mjs --live --from <launch day> --to <day 14>
```

(or `--db` on a copy of `scans.db`). Read three lines:

- **Falsifier:** "hit limit, tapped". `docs/decisions.md` names it: under 1 in 10 testers who reach the limit tap Subscribe
  means the price or the offer is wrong, not the number. Under 10 percent: change the price or the offer before spending on
  more installs. Continue or stop is Jamin's call; this line is the number he decides on.
- **Paywall views to purchases:** "paywall views" against "purchases". Zero purchases after real paywall views is the first
  thing to fix, before anything else on this list.
- **Claude ask rate and consent rate:** replace the assumed rates in the cost table with these two (cost finding 12).

The report counts new phones, first answer, paywall views, purchases and day-7 return, and leaves out `probe-*` devices.
Day-7 return only counts phones old enough, so it fills in a week after the others.

## Past rejections (add the reason when Apple rejects; R73)

None yet.
