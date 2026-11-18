# Needs Jamin (readiness fixes)

## fix-money

### R21: Plus on a new phone (RevenueCat dashboard setting, then one two-phone test)

What the code does: Pexi tells RevenueCat the phone's own device id as the app user id (`purchases.js`), so a
subscription belongs to a device id, and Apple ties the receipt to the Apple ID. A new phone has a new device id.
**Restore Purchases** (You screen and paywall) asks Apple for the Apple ID's receipts; what happens next is decided
by one RevenueCat setting, not by code.

1. RevenueCat dashboard, the Pexi project, Project settings, General: find "Restoring purchases" /
   "Transfer behavior" (wording from memory; the three choices are "Transfer to new App User ID",
   "Keep with original App User ID", "Transfer if there are no active subscriptions").
2. Set it to **Transfer to new App User ID**. With "Keep with original" a new phone gets nothing from Restore, which is
   exactly the "I paid and it is gone" case. With "Transfer", Plus moves to the phone that tapped Restore and the old
   phone loses Plus at its next check (one subscription is one phone at a time, because Pexi has no account to share
   it across devices; say so in the canned reply).
3. Test once with a sandbox tester: buy Plus on phone A; install on phone B with the same sandbox Apple ID; tap
   Restore Purchases on B; scan on B (should be Plus). Open A and scan: expect the free limit. The server re-checks
   RevenueCat at once when B's phone says it is Plus (R19), so no ten-minute wait.
4. Canned reply for support (Apple order number lookup): "Open the Pexi Plus screen on the new phone and tap Restore
   Purchases, signed in to the same Apple ID that paid. Plus moves to that phone. If it does not, send the Apple order
   number from your receipt email and we will find it in RevenueCat (Customers, search by transaction id)."

### R84: a cancelled or refunded subscriber keeps Plus a few days

Either (5 minutes) RevenueCat dashboard, the iOS app, "Apple Server Notifications": copy the URL it shows, paste it in
App Store Connect, the app, App Information, "App Store Server Notifications" (production and sandbox). Or write one line
in RULINGS: "a cancelled or refunded Plus subscriber may keep Plus until the phone next syncs; accepted".

### R31: release checklist, three lines (docs are another lane's; paste where the checklist lives)

- Release manually after approval; wait up to 24 hours after release before announcing; use a phased release for updates.
- iOS release builds run `node native/scripts/sync-web.mjs --release` (or `SHIN_RELEASE=1`); it now refuses a missing or
  non-`appl_` iOS key. The Mac's build script must pass `--release` (fix-mac lane).

### R46 (paywall and Terms parts): done in code, nothing for you

Seller line is on the paywall (Aurik, 4c561dd). Terms sections 11, 12, 13 now carry the legal review's wording
(question 15). The French Terms are translated but need Aurik's review before they go live.

### R36 and R81: nothing for you

Per-phone limits are the working limits; the address numbers are high ceilings (door 6,000 per 10 minutes, 75,000 a day;
free scans 150 a day per address). The limiters remember 100,000 callers instead of 5,000, so R81 needs no ruling.

## fix-docs

Everything here is something only Jamin (or Jamin with Aurik) can do. The pack is in `docs/readiness/`. Nothing in it
was sent, signed or imported by the lane.

### Import the dates file (2 minutes)

Open `docs/readiness/pexi-dates.ics` in the Calendar app (File, Import), into a calendar both of you see. It holds each
deadline with a 30-day and a 7-day reminder, a weekly Friday check and a monthly first-of-month check. Two dates are
assumed, not read from an account: the Apple Developer renewal (about 2027-10-08; read the real one in the account and
move the reminders) and the TestFlight build 9 expiry (2027-02-15, calculated from the upload on 2026-11-17).

### Fill the blanks in `HANDOVER.md` (30 minutes, nobody else can)

"Jamin fills in" appears for: each account's recovery path, phone and email for Jamin and Aurik, the stand-in's name, the
accountant, the bills table, who owns the code and Aurik's stake (`TEMPLATES.md`, investor table), and where the App Store
Connect API key file lives. Printed recovery codes for every account go somewhere other than the phone.

### Decisions to write down (each one line in `RULINGS.md`, in your words)

1. **R08**: FileVault on with a named person who can type the disk password after a restart, or off with the theft risk accepted.
2. **R43**: is Quebec in the launch (French on) or not.
3. **R48**: if Apple objects to "None" for alcohol, accept 13+ (prepared default) or hide liquor products. Answers: `docs/store/listing.md`.
4. **R67**: offline limit accepted as a launch limit.
5. **R75**: competitor risk accepted. **R81**: limiter forgetting at more than 5,000 phones accepted. **R89**: RevenueCat's 1 percent fee accepted.
6. **R59**: what the crawl contact list is for, or that nothing is sent from it.
7. **R84**: press RevenueCat's Apple notification button (fix-money's section has the steps) or accept the lag.
8. **R38**: the single Apple account is a named cost; accept it in writing or decide on a second route.

### Children and privacy paperwork (R53, R91, R63)

- Read and sign `docs/privacy/children-record.md` (the "likely accessed by children" decision, one page).
- Decide on `docs/privacy/opc-comment-draft.md`: send by 2027-01-13 (comments close 2027-01-20, from the legal review; confirm on the OPC's page), edit, or write "no comment" here. Anything sent is sent by you.
- Decide whether the location screen gets the "under 14, ask a parent" line (the privacy page has it; the screen does not). It is an app change.
- Write the three transfer assessments from the legal review's list (question 3); `docs/store/quebec-transfer-note.md` is the draft.
- Keep the support inbox reply for a regulator or lawyer with you only.

### Apple (R25, R26, R30, R48)

- Aurik owns the age-rating questionnaire (due 2027-01-12, confirm in App Store Connect); use the table in `docs/store/listing.md`.
- App Store Connect, Business: all agreements, tax and banking show Active. Check the Small Business Program status.
- Turn on both founders' App Store Connect notifications (reviews, rejections, build status).
- Developer account: turn auto-renew on and note the renewal date.

### Accounts and alerts (R01, R02, R18, R20, R32, R40, R69, R90)

- Cloudflare: turn auto-renew on for `anjiawenda.com` (renews 2027-08-19) or pay several years.
- Gmail `useshinapp@gmail.com`: forward to both founders with a phone notification, and set an auto-reply giving the response time.
- Anthropic console: a low-balance email and a monthly spend limit.
- Tailscale: disable key expiry on the Mac, and log in once from a phone on cellular.
- Google Cloud: delete the old Gemini key and close the billing project before 2027-01-01.
- Google alert for "Pexi app" (R61); re-run the name search the week before launch; decide on the PEXI trademark filing.
- Forward vendor "terms changed" emails to a shared label (R50).

### Before May 2027 (R06, R54, R42)

- Read the AMD agreement's outside-work and IP sections before 2027-05-03 and get written approval for Pexi.
- Choose an option in `HANDOVER.md` section 7 before 2027-04-01 and name the stand-in.
- One call with Aurik on the founders' agreement topics (`HANDOVER.md` section 6); write the answers down.

### Drills that need you (`docs/readiness/DRILLS.md`)

Drills 1 to 10 and 12 need you at a keyboard (drill 11 can be done by a Mac session). Start with drill 1; do the rest before
launch or in the quietest hour after. None has been run.

## fix-watch

What changed in the code: `/api/health` still says `ok: true` while a shopper can be served, and now also carries
`watch: { ok, problems }`, the strict reading. It lists a named problem for: catalogue not loaded (after 10 minutes up),
scan log not open or failing to save, a prices file that cannot answer, the Claude monthly cap reached or at 80 percent,
the last 20 Claude calls all failing, RevenueCat checks failing (reads the money lane's getter once it exists), the
network salt missing, a retention cleanup that failed or has not completed in 3 days, the newest backup older than 36
hours (or no backup folder told to the server), free disk under 10 GB, the weekly Project Hammer refresh never done,
older than 8 days or refused by the new sanity checks, Open Prices not loaded for 60 days, and the deploy checker silent
for 15 minutes. The GitHub alarm, the uptime monitor and the Mac's dead-man ping all read `watch`.

Expect the alarm to be RED right after the first deploy of this change until the Mac side is done (steps 3 and 4 below),
and the email text lists exactly what is missing. That is the alarm working.

### R02 and R03: the outside check that does not depend on GitHub (two free sign-ups, about 20 minutes)

1. Uptime monitor on the public health address, checked every 5 minutes, emailing you and Aurik.
   - Sign up at uptimerobot.com (free). Add Aurik's email under Alert Contacts.
   - Add New Monitor, type **Keyword**. URL `https://relay.anjiawenda.com/api/health`. Keyword `"watch":{"ok":true`
     (with the quotes and braces, exactly). Alert when: **keyword does not exist**. Interval 5 minutes. Tick both contacts.
   - This one monitor catches a tunnel blip (HTTP 530), a dead server and every problem in `watch`.
   - Check the plan page when you sign up: I have not verified whether the free plan allows a commercial product. If it
     does not, use Better Stack (betterstack.com, free uptime tier, 3-minute checks) with the same URL and keyword, "should
     contain" the keyword. The setup is the same.
   - Test it once: temporarily change the keyword to `"watch":{"ok":false` and confirm the email arrives within 10 minutes,
     then change it back.
2. Dead-man switch for a dead Mac (power cut, home internet down, server hung):
   - Sign up at healthchecks.io (free). Create a check named `pexi-mac`, Period 2 minutes, Grace 5 minutes. Add your
     email and Aurik's as integrations.
   - Copy its ping address (looks like `https://hc-ping.com/<long-id>`). Send it to the Mac as one line in
     `mac/config.env`: `SHIN_DEADMAN_URL=https://hc-ping.com/<long-id>` (never into the repo).
3. Mac, once (fix-mac lane runs it, steps are in my report): a job that runs `node scripts/deadman-probe.mjs` every 60
   seconds. It pings the check when the server is healthy and pings its `/fail` address (an email with the problem
   text) when `watch` lists a problem or the server does not answer.
4. Mac: the deploy checker must write the current time (ISO text) to `$SHIN_DATA_DIR/checker-seen` on every run. Until it
   does, the alarm lists `deploy_checker_silent`.

The GitHub alarm stays as the second layer (Node 26 now, R86). It retries `/api/health` three times 20 seconds apart
before saying "unreachable", so one blip does not email.

### R33, R34: two things only you can do

- Anthropic console: set a monthly spend limit and a low-balance email on the account that holds the Pexi key, and make
  sure the card on file is current. The alarm emails at 80 percent of the 1,000-call cap and when the cap is reached;
  raising it is one line, `SHIN_RANGE_ASK_MONTHLY_CAP=3000` in `mac/config.env`, then restart the server.
- Quarterly: look at the Anthropic model deprecations page for `claude-haiku-4-5-20251001`. The alarm says
  `claude_account_failing` once 20 calls in a row fail, which is what a retired model name looks like too.

### R82: Open Prices freshness

The alarm goes red when Open Prices has not been loaded for 60 days (read from the prices file's own load log). If you
never load it any more, set `SHIN_WATCH_OPENPRICES_DAYS=0` in `mac/config.env` to turn that one check off; any other
number of days sets the limit.

### R52: the backup check needs `SHIN_BACKUP_DIR` in the server's environment

`mac/config.env` already has it (the backup script requires it), and the server reads the same file. The alarm reads the
newest dated folder in it. If it lists `backup_not_checked`, the server was started without that line.

### R10: disk

`watch` goes red under 10 GB free on the data disk (`SHIN_WATCH_MIN_FREE_GB` changes the number). Log rotation is the
Mac lane's.

### R28: Project Hammer import checks

The weekly import now refuses itself (keeps last week's prices, exits non-zero, shows `hammer_import_refused` in
`watch`) when price rows fall over 30 percent against the last accepted run, a retailer's products fall by half, the
newest price day is over 14 days old, over 2 percent of prices move more than ten times, the median price moves more
than 25 percent, or over 1 percent of prices are under 5 cents or over 3,000 dollars. The first run after this deploys
has no earlier baseline, so only the absolute checks apply. If a real change (a publisher unit change you have looked at)
trips it, clear the stored baseline with `sqlite3 "$SHIN_PRICES" "DELETE FROM store_meta WHERE key='hammer_last_import'"`
and run the refresh again.

## fix-mac

Everything the Mac scripts cannot do alone: passwords, sign-ups, dashboards, decisions. The scripts and the ordered procedure
are in `mac/README.md` ("Surviving a restart, encrypted, backed up, hardened"). Rough order is the order below.

### 1. Run the install scripts that need `sudo` (R04, R08, D5, R55)

A Claude session on the Mac cannot type your password. At the Mac, in Terminal as `worker`, from `~/shin`:
`sh mac/10-boot-survival.sh --dry-run`, then `sudo sh mac/10-boot-survival.sh`, then `sudo sh mac/10-boot-survival.sh --verify`.
Later `sudo sh mac/11-planned-restart.sh` (macOS 27.2.1) and `sudo sh mac/12-harden.sh`. Each has a `--dry-run` and an undo.

### 2. Turn FileVault on and keep the recovery key (R08, D1)

System Settings > Privacy and Security > FileVault > Turn On. Pick "create a recovery key" (not iCloud), write it on paper or
in your password manager, NOT on this Mac. Your password is needed. Decision attached: with FileVault on, a power cut stops the
Mac at the unlock screen until someone unlocks it (crashes and planned restarts come back by themselves). If nobody can ever
unlock it and uptime matters more than the encrypted disk, leave FileVault off and say so; the plain statement is in
`mac/README.md` ("What still needs a person").

### 3. Leave Remote Login (SSH) on

It is the only way to unlock the Mac from another room after a power cut (reported for macOS 26 and later, home network only,
UNVERIFIED on this Mac). Do not switch it off. `--ssh-keys-only` is optional and not default.

### 4. Choose where the encrypted off-site backup goes (R07, R52)

Pick one: an external disk kept in another place (`/Volumes/NAME/shin-restic`), a cloud bucket (for example Backblaze B2, `b2:bucket:shin`;
price not checked here, the nightly copy is small), or a second computer over SSH
(`sftp:user@host:/path`). Then: `brew install restic`; create the password file `/Users/worker/.shin-restic-password` (mode 600,
one long random line); keep a SECOND copy of that password in your password manager (without it the backup is unreadable by
design); put the destination and password path in `mac/config.env`; run `sh mac/14-offsite-backup.sh --init` once. For a bucket
you create the account and the key.

### 5. Screen Sharing: decide (D3)

It is on and reachable from the home network and Tailscale. Keep it if you use it to look at the Mac; otherwise
`sudo sh mac/12-harden.sh --screen-sharing-off`. Nothing turns it off by default.

### 6. Create the standard account `shinsvc` (D4), when you have an hour

System Settings > Users and Groups > Add Account, type Standard, name `shinsvc`. The move plan is in `mac/README.md` ("Moving
the server off the admin account"). It needs a read-only deploy key added to GitLab by you. Until then the server stays on
`worker` (an admin) and D4 stays open.

### 7. Check the unknown program on port 8787 (D3)

Run `sh mac/12-harden.sh --audit` and read the UNKNOWN line (command and folder). If you do not know what it is, tell the Mac
session; the script never stops anything by itself.

### 8. Check that the health mail reads the new failure flags (R72)

`~/bin/worker-heartbeat.sh` is not in the repo, so nobody here has seen it. The new jobs leave
`~/.worker-state/shin-<job>-failed` (jobs: backup, offsite, restore-test, integrity, disk, certs, checker, logrotate), the same
pattern as the existing `shin-checker-stopped`. Open the script and confirm it mails when any `shin-*-failed` file exists. If it
does not, say so and a Mac session adds the line.

### 9. App Store Connect key id and issuer (R66, R69)

For the monthly expiry check: App Store Connect > Users and Access > Integrations > App Store Connect API. Copy the Key ID and the
Issuer ID into `mac/config.env` as `SHIN_ASC_KEY_ID` and `SHIN_ASC_ISSUER_ID`; put the downloaded `AuthKey_<id>.p8` in
`~/.appstoreconnect/private_keys/` (or set `SHIN_ASC_KEY_FILE`). Apple shows no expiry date for this key, so the check asks Apple
whether it still works. Do not paste the key itself into chat.

### 10. Tailscale: turn key expiry off for the Mac (R69)

Tailscale admin console > Machines > this Mac > the three dots > Disable key expiry. Otherwise the Mac silently drops off the
tailnet at the key's expiry date (the monthly check prints the days left either way).

### 11. The router: is port 22 or 5900 forwarded to the Mac? (D3)

Not knowable from the Mac. Open the router's port forwarding page and check; if either is forwarded to the Mac, delete it.

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
