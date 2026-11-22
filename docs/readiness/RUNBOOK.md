# Pexi runbook: what to do when something goes wrong (2026-11-18)

Written for 2am, for Jamin or a stand-in (see `HANDOVER.md`). One entry for every item of the readiness register
(`REGISTER.md`, `register.jsonl`), R01 to R93, grouped by tier. Each entry says how we find out, who acts, and the steps.

**How to read an entry.**
- **Find out** is how the problem reaches a person. "Nobody" means today nothing tells anyone; the entry then says what to check by hand.
- **After fix-watch / fix-mac / fix-app / fix-money / fix-docs** means another fix lane is adding that detection or fix
  (`FIX-BRIEF.md`). Until that lane is merged and live, do the by-hand version of the step. Check the lane's commit before
  trusting the new alarm.
- **Needs Jamin** means only Jamin can do it (his accounts, his money, a decision, his phone or the Mac). Where an entry says
  "Jamin" and he cannot be reached, a stand-in does only what `HANDOVER.md` lets a stand-in do.
- **ASSUMED** means not checked on the real account or Mac. Nothing here was run in this pass.
- Dates of every renewal and deadline: the table in section "Dates" at the end, and `pexi-dates.ics`.
- Drills that try these responses once: `DRILLS.md`. Reply templates: `TEMPLATES.md`.

## The 2am page: is it down, and what do I do first

On any phone or laptop:

```
curl -s -m 10 -o /dev/null -w "%{http_code}\n" https://relay.anjiawenda.com/api/health
```

| Answer | Meaning | Go to |
|---|---|---|
| `200` | The server answers. The trouble is smaller (wrong answers, one route, money). | the entry for what you saw |
| `530` (page says error 1033) | The tunnel is down: Cloudflare cannot reach the Mac. | R03 |
| `502` | The tunnel is up and the server is down. | R09 |
| nothing, or a DNS error | Domain, Cloudflare, or the home internet. | R01, R03, R04 |
| `403` with an HTML page | Cloudflare is challenging the app. | R17 |

On the Mac (user `worker`; repo `~/shin`, the live copy `~/shin-live`, data `~/shin-data`, settings `~/shin/mac/config.env`,
logs `~/shin/mac/logs`):

```
set -a; . ~/shin/mac/config.env; set +a        # load the settings the server runs with
curl -s localhost:${PORT:-4173}/api/health       # the server's own answer; read scanLog, catalogueUp, faults
launchctl list | grep com.shin                   # which jobs are loaded
launchctl kickstart -k gui/$(id -u)/com.shin.server    # restart the server (mac/DEPLOY.md:161)
sudo launchctl list | grep cloudflared           # the tunnel (mac/01-cloudflare-tunnel.md:89)
```

Stop everything that is flowing out: `launchctl bootout gui/$(id -u)/com.shin.server`. Start again:
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shin.server.plist`.

Change a setting: edit `~/shin/mac/config.env`, save, restart the server (command above), and read `/api/health` again.
Never paste a value from that file into chat, a commit or a document.

Mail to the Mac session (a deploy rollback, a request): `node ~/claude-mailbox/mail.mjs send --to mac --subject "deploy: pin <sha>" --body ""`
(`mac/DEPLOY.md:20-30`). Nothing counts as sent until `mail sent` shows a receipt.

**Who is who.** Jamin: founder, the Mac, the accounts. Aurik: partner, the phone app, App Store paperwork, French.
Stand-in: whoever Jamin names in `HANDOVER.md`. A Claude session on the PC can run checks and edit the repo; it never sends a
message to a person or signs in to an account on its own.

---

# Tier 1: Pexi is down or unusable for everyone

**R01 The domain lapses or changes hands.**
- Find out: nobody today. The calendar file (`pexi-dates.ics`) reminds at 2027-07-20 and 2027-08-12 for the 2027-08-19 renewal. An outage alarm would show the symptom, not the reason.
- Who: Jamin. The domain sits in his Cloudflare account (`C:\ACT\NOW.md:20-22`; the registrar is ASSUMED to be Cloudflare).
- Steps: 1. Cloudflare dashboard, the domain `anjiawenda.com`, registration: turn auto-renew ON, or pay several years now. 2. Check the card and the account email. 3. If it already lapsed: renew at once; the grace period is ASSUMED, check Cloudflare's rules. The tunnel and DNS return with the domain. 4. If it is lost: the address is built into the app, so a new build with a new address has to pass App Review (days). Put a notice on the support page. 5. Write who holds the login in `HANDOVER.md`.

**R02 The outside alarm is late or silent.**
- Find out: nobody for the alarm itself. After fix-watch and Jamin's account step (`needs-jamin.md`): an outside uptime monitor pushes to both founders' phones.
- Who: Jamin.
- Steps: 1. Each week, open the GitHub copy of the repo, Actions, `server-alarm`: if the newest run is older than 2 hours, the alarm is not running on time (it ran only every 8 to 9 hours on 2026-11-16 to 18). 2. Run the triage page's `curl` yourself. 3. Run the alarm by hand: Actions, `server-alarm`, Run workflow (this is also how to prove it can fail: origin `https://evil.example`). 4. When a push arrives from the second watcher, follow the 2am page.

**R03 Home internet, the tunnel program or Cloudflare stops carrying traffic (HTTP 530).**
- Find out: the Mac's deploy checker mails the PC mailbox (checked 2026-11-18); the GitHub alarm is unreliable (R02); after fix-watch the uptime monitor pushes.
- Who: Jamin, or the stand-in at the Mac.
- Steps: 1. `curl` as above: 530 or error 1033 means the tunnel is down; 502 means the server is down (R09). 2. Check Cloudflare's status page and that the Mac has internet (`curl -sI https://example.com`). 3. On the Mac: `sudo launchctl kickstart -k system/com.cloudflare.cloudflared` (label from `mac/01-cloudflare-tunnel.md:89`; ASSUMED still right). 4. Still down: `cloudflared tunnel info shin-beta`; the credential is `~/.cloudflared/<UUID>.json`; if it is gone, make a new tunnel with `mac/01-cloudflare-tunnel.md` and route `relay` to it. 5. Account suspended or flagged: appeal in the Cloudflare dashboard and see R40. 6. After fix-mac the same three lines sit at the top of `mac/README.md`.

**R04 The Mac restarts or sleeps and the server does not come back.**
- Find out: the alarm after about an hour; the checker's mail. The cause is not obvious from either.
- Who: Jamin, or the stand-in at the Mac or over Tailscale (R69).
- Steps: 1. Get to the Mac and log in as `worker` (until fix-mac and R08 are settled nothing starts without a login). 2. `launchctl list | grep com.shin`: server, checker, backup and hammer should be listed; start a missing one with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shin.<name>.plist`. 3. Check the tunnel (R03) and public health. 4. Sleep: `sh ~/shin/mac/06-verify-no-sleep.sh`. 5. After fix-mac: auto-login or LaunchDaemons, and the "after a reboot" checklist in `mac/README.md`. Tried once in drill 2.

**R05 Jamin is unreachable when something breaks.**
- Find out: GitHub emails Jamin only (checked). After fix-watch: both founders get the push.
- Who: Aurik or the stand-in, after 30 minutes without Jamin.
- Steps: 1. Follow the 2am page. 2. Do only what `HANDOVER.md` allows: restart the server, restart the tunnel, lower a limit, pin the previous deploy. 3. Do not rotate keys, delete data or change accounts. 4. Tell Jamin by every route (phone, mailbox, comms board). Tried once in drill 9.

**R06 On 2027-05-03 Jamin starts a 16-month full-time internship and nobody runs the Mac, the inbox, the renewals or an emergency build.**
- Find out: the calendar file reminds at 2027-04-03 and 2027-04-26. Nothing else flags it.
- Who: Jamin decides; Aurik and the stand-in carry it out.
- Steps: 1. Choose one of the options in `HANDOVER.md` ("May 2027 plan") before 2027-04-01. 2. Check Aurik has an App Store Connect role that can upload a build. 3. Read the AMD agreement's outside-work terms first (R54). 4. Run drill 9 with the real stand-in in April.

**R07 The Mac dies or is lost, and the live data and every backup go with it.**
- Find out: the alarm within about an hour; nothing says the backups are gone too.
- Who: Jamin.
- Steps: 1. Confirm it is dead (Tailscale, then in person). 2. Get the newest off-machine backup (after fix-mac; before that, backups sit on the same disk and may be lost, and RevenueCat and the databases are the only copies of paying users and scan history). 3. On another Mac or PC follow `mac/README.md` steps 1 to 10; restore with `sh mac/07-restore.sh <backup> <clean-folder>`; the 3.5 GB catalogue is re-fetched with `mac/04-catalogue-acquire.md`; the tunnel credential and `config.env` come from the secrets list (R40, R56). 4. Re-run deletions less than 45 days old (R58). 5. Tell Aurik; expect a day or more. Tried once in drill 3.

**R08 FileVault (stolen-Mac fix) clashes with auto-login (reboot fix).**
- Find out: only after the change: the next reboot leaves the server down.
- Who: Jamin decides.
- Steps: 1. Choose and write one line in `RULINGS.md`: (a) FileVault on and a named person who can type the disk password after a restart, or (b) FileVault off, the theft risk stated and accepted with its cost (every database, key and backup readable by whoever holds the disk). 2. Until it is written, assume a reboot means the server stays down until someone is at the Mac. 3. Repeat drill 2 after the choice.

**R09 The server crashes, restart-loops, or a deploy that passes tests does harm.**
- Find out: launchd restarts a crash; the alarm sees gaps; the checker's status says `App: NOT working`; a harmful but healthy deploy is seen only through a shopper message. After fix-watch the health fields show wrong answers (R11).
- Who: Jamin or the stand-in.
- Steps: 1. Read why: `tail -50 ~/shin/mac/logs/server.err.log`. 2. Roll back: mail the Mac `deploy: pin <last good sha>` (`~/.shin-deploy/state.json` field `live` holds the current one; `git log` in `~/shin-live` the earlier ones). 3. Stop new deploys while you fix: `deploy: hold <reason>`, then `deploy: release`. 4. Restart: `launchctl kickstart -k gui/$(id -u)/com.shin.server`. 5. Write down how many minutes it took. Tried once in drill 6 (pin, revert, `kill -9`).

**R10 The Mac disk fills.**
- Find out: nobody today. After fix-watch: free disk and photo folder size in `/api/health`, alarm red under 10 GB. After fix-mac: server logs rotated.
- Who: Jamin or the stand-in.
- Steps: 1. `df -h /` then `du -sh ~/shin-data/* ~/shin/mac/logs/* "$SHIN_BACKUP_DIR"/* | sort -h | tail`. 2. Free space safely: old backup folders beyond the newest 5, and empty a big log with `: > ~/shin/mac/logs/<file>.log`. 3. Never delete `scans.db`, `prices.db`, `corrections.db`, `catalogue.db`. 4. The weekly price refresh needs 6 GB free (`mac/hammer-refresh.sh`). 5. Restart the server if writes failed, and read `/api/health` (`scanLog` must be true).

**R11 The server is up but gives wrong or empty answers.**
- Find out: nobody today (the health route shows `scanLog`, `catalogueUp`, faults; the alarm ignores them). After fix-watch the probe fails on those fields and on one known-barcode scan.
- Who: Jamin.
- Steps: 1. Read `curl -s localhost:${PORT:-4173}/api/health`. 2. `scanLog` false: scans database unwritable or disk full (R10). `catalogueUp` false: check `SHIN_CATALOGUE` in `config.env` and that the file is there, then restart. Faults above 0: `grep -i fault ~/shin/mac/logs/server.err.log | tail`. Claude cap hit: R33. 3. A new catalogue goes into a new folder; switch only if row counts match, otherwise point `SHIN_CATALOGUE` back at the old file. 4. Scan a known barcode from a phone and read the price.

**R12 A viral spike overloads one Mac.**
- Find out: only the probe, 30 to 60 minutes late, and slowness is invisible. After fix-watch the probe fails on any route over about 3 seconds.
- Who: Jamin or the stand-in.
- Steps: 1. Confirm: `top -l 1 | head -12` and health response time. 2. Lower in `config.env`: `SHIN_RANGE_ASK_MONTHLY_CAP` (stops Claude calls), `SHIN_RATE_DOOR_IP_PER_10MIN` (default 1,200), `SHIN_RATE_IP_PER_10MIN` (default 90); restart. 3. Add a Cloudflare cache rule for read routes (the spike page from drill 10 will name them). 4. When it passes, put the values back and restart. The failing number comes from drill 10; until then it is unknown.

**R13 A server change breaks older installed app builds.**
- Find out: nobody today. After fix-app: weekly report of app versions, and a minimum-version field on the health route.
- Who: Jamin (server), Aurik (app).
- Steps: 1. If shoppers report breakage right after a deploy: pin the previous commit (R09). 2. Keep an old route alive for one build back; never change a route and the app in the same release. 3. The scheduled probe sends origin `https://localhost` as well (after fix-watch). 4. After fix-app: raise the minimum version to show the "update needed" screen.

**R14 A bad iPhone build reaches shoppers and cannot be switched off.**
- Find out: TestFlight and Xcode Organizer crash reports, if someone looks weekly in the first month; the app posts JavaScript errors to the server (checked). After fix-app: a remote status file read at launch.
- Who: Aurik (app), Jamin (account).
- Steps: 1. App Store Connect: pause or remove the bad build (TestFlight: expire the build; App Store: remove from sale, pause a phased release). 2. Build the fix; ask Apple for an expedited review on the submission (the form is ASSUMED to be in App Store Connect help). 3. After fix-app: flip the remote status file to show a notice or block the known-bad build. 4. Add the cause to the rejection and bad-build list (R73). Tried once in drill 7.

**R15 A typed-name search freezes the server for everyone.**
- Find out: nobody; the probe does not time searches. After fix-watch the probe times one typed search.
- Who: Jamin.
- Steps: 1. Restart the server (R09). 2. Find the slow request in `$SHIN_ACCESS_LOG` (the path and time). 3. After fix-app: search runs in the worker or on a name index. 4. Drill 10 times a search at 1 and 5 million price rows.

**R16 A database is corrupted, locked or rolled back, or device keys fail closed.**
- Find out: partly (stderr lines, the customer-data fault counter). After fix-mac: the nightly backup runs `PRAGMA integrity_check` and fails loud. After fix-watch: device-key refusals counted in health.
- Who: Jamin.
- Steps: 1. Stop the server (`launchctl bootout ...`). 2. Copy the bad file and its `-wal` and `-shm` aside, do not delete them. 3. `sqlite3 <file> "PRAGMA integrity_check"`. 4. Restore the newest good backup into a clean folder with `mac/07-restore.sh`, move that one database into place, start the server. 5. Every shopper refused: it is the `device_key` table in `scans.db` (`app/src/device-key.ts`); restart first, restore second. 6. Re-run deletions less than 45 days old.

**R17 Cloudflare's bot protection starts challenging the app.**
- Find out: nobody; the alarm looks different to Cloudflare than the phone does. Check monthly with `mac/08-cellular-check.md` from a phone off Wi-Fi.
- Who: Jamin.
- Steps: 1. Cloudflare dashboard, the zone, Security: record that Bot Fight Mode and challenge rules are off for the relay host (menu names ASSUMED). 2. Look at Security events for challenged requests. 3. Turn the setting off or add a skip rule for the relay host. 4. Test from a phone on cellular. Part of drill 1.

---

# Tier 2: money or paying users

**R18 Support mail (`usepexiapp@gmail.com`) sits unread.**
- Find out: nobody today. After Jamin's step (`needs-jamin.md`): the inbox forwards to both founders with a phone notification, and an auto-reply gives the response time.
- Who: Jamin and Aurik; one named reader per week (`HANDOVER.md`).
- Steps: 1. Read newest first; sort in this order: Apple notices, legal or regulator letters, data requests (start the 30-day clock, `docs/privacy/data-requests.md`), "I paid" and refunds, press and partners, the rest. 2. Answer with `TEMPLATES.md`. 3. A person sends every reply; the system never does. 4. Friday: the weekly check in `HANDOVER.md`. Tried once in drill 12.

**R19 A shopper buys Plus and still sees the paywall.**
- Find out: nobody until a review or an email. After fix-money the server re-checks RevenueCat at once when the phone says it is Plus.
- Who: Aurik for the reply, Jamin for the server.
- Steps: 1. Reply with the "I paid and it is still limited" template (ask for the Apple order number from the receipt email). 2. RevenueCat dashboard, Customers: search the device id from the email or the order, check entitlement `plus` is active. 3. Active: the server's "not Plus" answer is remembered for up to 10 minutes (`app/src/scan-quota.ts:49`); ask them to wait and scan again, then tap Restore Purchases on the Pexi Plus screen. 4. Not in RevenueCat: the purchase did not reach it; Restore Purchases; still nothing: they ask Apple for a refund at reportaproblem.apple.com. Tried once in drill 8.

**R20 Bad reviews, a falling rating, refunds and chargebacks go unseen.**
- Find out: after Jamin's step: App Store Connect review notifications to both founders. Weekly 5-minute check.
- Who: Aurik (replies), Jamin (refunds and money).
- Steps: 1. Weekly: App Store Connect, Ratings and Reviews, then Sales and Trends for refunds. 2. Reply to every review of 3 stars or less within 3 days, in plain words, with the support address. 3. The same complaint twice means an entry in this runbook is wrong or missing: find it and fix the cause. 4. Do not ask friends for five-star reviews (R37).

**R21 A paying shopper changes phone, reinstalls or switches Apple ID and Plus does not follow.**
- Find out: only the support inbox or a review. Pexi has no account, name or email, so support cannot look up a person.
- Who: Aurik.
- Steps: 1. Tell them: You screen, Pexi Plus, Restore Purchases, signed in to the same Apple ID as the purchase. 2. Still nothing: ask for the Apple order number; RevenueCat dashboard, find the subscription by that order and see which customer id holds it. 3. What happens to the old phone when the new phone restores depends on RevenueCat's restore-behaviour setting (read it; drill 8 records the result). 4. A different Apple ID cannot be moved: use the template.

**R22 Refund questions and complaints arrive faster than two people can answer.**
- Find out: nobody until mail piles up. Count the mail each Friday.
- Who: Jamin (data, legal, press), Aurik (refunds, restore, French). Goal: first reply within 2 business days (our choice, not law).
- Steps: 1. Use the five canned replies in `TEMPLATES.md` (cancel, refund, delete my data, wrong price, restore). Save the refund one as a text snippet on the phone. 2. A refund is Apple's to give: send the shopper to reportaproblem.apple.com; Pexi cannot refund it. 3. Aurik adds the French versions (needs Aurik). 4. A complaint from a parent: R53.

**R23 Wrong prices or names, junk typed prices, rude names or private photos reach shoppers.**
- Find out: a shopper correction or a support mail. After fix-app: a weekly top-10 of most-edited barcodes.
- Who: Jamin.
- Steps: 1. Typed prices and picks for one barcode: `node scripts/security/remove-shopper-input.mjs --code <barcode>` (dry run: counts only), then add `--yes`. 2. Typed prices off for everyone: `SHIN_SHOPPER_VOICE=off` in `config.env` and restart. 3. Wrong rows from one seller: R57. 4. A private photo or something tied to one phone: `docs/privacy/data-requests.md`. 5. After fix-app: the one-command hide-a-barcode tool. Tried once in drill 12.

**R24 Nobody reads the weekly numbers (hit rate, conversion, churn, refunds).**
- Find out: nobody today. After fix-watch or fix-app: a weekly email from the server.
- Who: Jamin.
- Steps: 1. Every week (the weekly check in `HANDOVER.md`): scans, share of scans with a shop price, free-to-Plus conversions, refunds, rating. 2. From launch, run the day-1, day-7 and day-30 checklist in `HANDOVER.md` (first renewals fall about 30 days after launch). 3. A hit rate that shows no shop price on 3 of 4 scans is known and not an alarm; a drop from last week is.

**R25 The Apple Developer Program membership is not renewed.**
- Find out: Apple emails the account holder (ASSUMED); calendar reminders at 2027-09-08 and 2027-10-01 (enrolment complete 2026-10-08, order 2026-10-03, `RULINGS.md:567`; the renewal is ASSUMED to fall near 2027-10-08, so read the exact date from the account and move the reminders).
- Who: Jamin.
- Steps: 1. developer.apple.com, Account, Membership: read the renewal date, confirm auto-renew and the card. 2. Lapsed: renew at once; the app is removed from sale until you do (ASSUMED how fast it returns). 3. Tell Aurik. 4. Replace the calendar date with the real one.

**R26 Apple's agreements, tax or banking forms are missing or out of date.**
- Find out: an Apple email and a banner in App Store Connect; nobody checks.
- Who: Jamin.
- Steps: 1. App Store Connect, Business (Agreements, Tax, and Banking): clear every open item; the Paid Apps agreement, the tax forms and the bank account must each show Active. 2. Enter the Canada GST/HST status when it exists (R46). 3. Look again on the first of every month.

**R27 The RevenueCat check fails and paying shoppers are treated as free.**
- Find out: nobody today (errors are swallowed, `app/src/scan-quota.ts:215-218`). After fix-money: 3-second timeout, a device that was Plus in the last 24 hours stays Plus on error. After fix-watch: failures counted in health, alarm on a streak.
- Who: Jamin.
- Steps: 1. RevenueCat status page. 2. Test the key without printing it: on the Mac, with config loaded, `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $REVENUECAT_SECRET_KEY" https://api.revenuecat.com/v1/subscribers/test-check` (200 means the key works, 401 means it is wrong). 3. 401: replace `REVENUECAT_SECRET_KEY` in `config.env` (R56) and restart. 4. RevenueCat down: nothing to do but wait; answer "Plus is not unlocking" mail with the template. Tried in drills 5 and 8.

**R28 The weekly Project Hammer refresh loads wrong data.**
- Find out: nobody today. After fix-watch: the refresh refuses a bad file (rows down over 30 percent, newest day over 14 days old, median price moved over 20 to 25 percent), keeps last week's data, and the alarm shows it; the weekly mail lists rows per vendor.
- Who: Jamin or a Mac session.
- Steps: 1. Stop the weekly job: `launchctl bootout gui/$(id -u)/com.shin.hammer`. 2. Wrong data already loaded: restore `prices.db` from the last backup before Sunday 05:30 into a clean folder (`mac/07-restore.sh`), move only that file into place, restart. 3. Fix or wait for the source, then run `sh ~/shin/mac/hammer-refresh.sh` by hand and read the log. 4. Start the job again with `launchctl bootstrap ...com.shin.hammer.plist`. Tried once in drill 11.

**R29 App Review happens while the Mac is down or restarting.**
- Find out: the alarm if the server is down at that moment; otherwise the rejection email.
- Who: Jamin.
- Steps: 1. Before submitting: run the phone probe (`node scripts/phone-contract-probe.mjs --origin capacitor://localhost` from the PC) and read the result. 2. While a review is pending: no deploys; mail the Mac `deploy: hold App Review pending`, then `deploy: release` after. 3. Keep the Mac on and awake. 4. Rejected for "could not connect": fix, reply in Resolution Center and resubmit. These lines are in `RELEASE-CHECKLIST.md`.

**R30 The Apple Small Business Program enrolment is missed.**
- Find out: only by reading the payout statement.
- Who: Jamin.
- Steps: 1. App Store Connect: look for the Small Business Program status (the commission should be 15 percent, not 30; menu name ASSUMED). 2. Not enrolled: apply on Apple's Small Business Program page. 3. Check again each January (reminder in the dates list).

**R31 Launch day goes wrong: purchases do not work yet, or a bad update reaches 100 percent.**
- Find out: Aurik or Jamin trying a purchase after release.
- Who: Jamin and Aurik.
- Steps: 1. Use the launch lines in `RELEASE-CHECKLIST.md`: manual release; buy Plus once yourself before announcing; wait up to 24 hours; phased release for updates. 2. After fix-app: the key sync refuses an iOS release build unless the RevenueCat key starts with `appl_` and is not empty. 3. A bad update already out: R14.

**R32 A bill goes unpaid or a free tier ends.**
- Find out: each vendor emails whichever address it has.
- Who: Jamin.
- Steps: 1. Fill the bills table in `HANDOVER.md` (vendor, plan, account email, card, monthly cost, renewal date). 2. Once a month open each vendor's billing page. 3. A vendor email about a price change goes in the table the same day.

**R33 The 1,000-a-month Claude cap is reached early.**
- Find out: a log line at most hourly and a health field (`claudeMonthlyCap.reached`); the alarm does not read it. After fix-watch: email at 80 percent and at the cap.
- Who: Jamin or the stand-in.
- Steps: 1. `curl -s localhost:${PORT:-4173}/api/health` and read `claudeMonthlyCap`. 2. Check for one heavy caller: `grep -o '"ip":"[^"]*"' "$SHIN_ACCESS_LOG" | sort | uniq -c | sort -rn | head`; block it (R41). 3. Raise `SHIN_RANGE_ASK_MONTHLY_CAP` in `config.env` (raising it costs cents; decide the ceiling in advance and write it in `HANDOVER.md`), restart. 4. Shoppers whose product has no shop price see "No price here yet" until then.

**R34 The Claude estimate fails for account reasons (balance, card, key, retired model).**
- Find out: nobody today (errors go to the log). After fix-watch: recent estimate failures counted in health.
- Who: Jamin.
- Steps: 1. Anthropic console: balance, card, whether the key is active; set a low-balance email and a monthly spend limit. 2. Retired model: the id `claude-haiku-4-5-20251001` is written in the code today; change it, test, deploy (making it a server setting is not assigned to a fix lane: flagged in the fix-docs report). 3. New key: R56 steps. 4. Every quarter look at Anthropic's deprecations page (dates list).

**R35 Open Food Facts throttles or bans the Mac's address.**
- Find out: nobody today: `grep -c "SCAN ENDED WITH NO NAME" ~/shin/mac/logs/*.log`. After fix-app and fix-watch: source failures counted in health.
- Who: Jamin.
- Steps: 1. Do not retry in a loop. 2. After fix-app: a Pexi User-Agent with a contact email (the address is Jamin's choice), live lookups capped near 12 a minute, errors not remembered as misses. 3. Banned: write to Open Food Facts using the contact on their site (ASSUMED route) and say what changed. Operational only.

**R36 A campus or store Wi-Fi counts as one person and hits the limits.**
- Find out: nobody today (429s are not counted). After fix-watch: a daily 429 count in health.
- Who: Jamin.
- Steps: 1. Reports of "a lot of requests" from one place: raise `SHIN_RATE_DOOR_IP_PER_10MIN` (default 1,200) and `SHIN_FREE_SCANS_PER_IP_DAY` (default 30) in `config.env`, restart. 2. After fix-money: counting by device id as well, and the paywall text instead of the flood text.

**R37 A launch push breaks Apple's review rules.**
- Find out: Apple email, long after.
- Who: Jamin tells every helper.
- Steps: 1. The sentence in `RELEASE-CHECKLIST.md`: ask real users only, no rewards, no friends posting five-star reviews, use Apple's own review prompt. 2. If Apple writes: reply truthfully, stop the practice, ask Aurik to check the account for other flags.

**R38 Apple suspends the account, rejects an update or pulls Pexi.**
- Find out: Apple email to the account holder and an App Store Connect banner. After Jamin's step: Aurik is a user and notices reach both founders.
- Who: Jamin (account holder), Aurik.
- Steps: 1. Read the exact guideline Apple names. 2. Reply in Resolution Center within a day; fix and resubmit. 3. Appeal through the App Review Board link in the rejection; keep a copy. 4. Account closed: Apple Developer Support, by phone and form; the server stays up because installed apps keep working. 5. The single-account risk is a named cost: Apple can end all sales on one decision; the only cover is a second account, which does not exist (accept in writing, `needs-jamin.md`). 6. Record the cause in the past-rejections list (R73).

**R39 A `config.env` edit or a failing quota store changes behaviour with no error.**
- Find out: nobody today. After fix-watch: the live limits in `/api/health`, the alarm fails when one is missing, and every unset expected setting is printed at start.
- Who: Jamin.
- Steps: 1. After every edit: restart, then read `/api/health` and `curl localhost:${PORT:-4173}/api/quota` (limit must read 10 for free). 2. Compare with the keys in `mac/config.env.example`. 3. Keep a dated copy before each edit: `cp ~/shin/mac/config.env ~/shin/mac/config.env.$(date +%F)` (it holds secrets: keep it out of git and out of Dropbox).

**R40 Jamin or Aurik is locked out of a vendor account.**
- Find out: at the moment it is needed.
- Who: Jamin; Aurik for what he can reach.
- Steps: 1. Use the recovery path in the accounts table (`HANDOVER.md`). 2. Printed recovery codes: kept somewhere other than the phone (needs Jamin). 3. Apple ID recovery can take days; Cloudflare needs a support ticket; GitHub and GitLab use recovery codes or a second key. 4. Meanwhile the server keeps running; do not rotate keys during a lockout.

**R41 Scripts or an abuser scrape routes, mint device ids, burn Claude calls or fill the disk.**
- Find out: only the door limiter's 429s and the access log. After fix-watch: daily counts of 429s and Claude calls per address.
- Who: Jamin or the stand-in.
- Steps: 1. Top addresses: `grep -o '"ip":"[^"]*"' "$SHIN_ACCESS_LOG" | sort | uniq -c | sort -rn | head`. 2. Block one address: Cloudflare dashboard, Security, WAF, custom rule, block that IP (menu ASSUMED). 3. Add a Cloudflare rate rule on the scan routes. 4. After fix-app: the F7 fix in `app/server.ts`. 5. Lower `SHIN_RANGE_ASK_MONTHLY_CAP` if Claude calls are the target.

**R42 Aurik is unreachable for weeks, leaves, or the two disagree.**
- Find out: silence on the comms board or a conversation.
- Who: Jamin.
- Steps: 1. `HANDOVER.md`, "What Jamin can do alone in Aurik's areas", lists each area and the move. 2. Put the founders' agreement topics (same file) on a call with Aurik and write the answers down (needs both). 3. Account ownership: Apple, RevenueCat and the repo stay in Jamin's name; Aurik's roles are users on them (ASSUMED today; check).

---

# Tier 3: legal, privacy and reputation

For anything here that involves a regulator, a lawyer or a letter: nobody replies from this runbook alone. Jamin decides and
signs. The prepared texts are in `TEMPLATES.md`, `children-record.md`, `before-changing-data-use.md` and
`docs/store/listing.md` (age-rating section).

**R43 A French-speaking or Quebec shopper gets English only and complains.**
- Find out: a review, a French email or a complaint. No alarm. French is off by Jamin's ruling of 2026-09-21 (`RULINGS.md`, near line 832).
- Who: Jamin decides; Aurik writes French.
- Steps: 1. Decide in writing whether Quebec is in the launch (`needs-jamin.md`). 2. If yes: Aurik reviews the French text, the flag is switched on, and the French store listing and the French privacy page (`docs/store/privacy-fr.html`, already in the repo) go live together. 3. If no: the English complaint reply in `TEMPLATES.md` says Pexi is English only for now and that French is planned (a plan only if Jamin says so). 4. A formal complaint under Quebec's French-language law: Jamin answers in French with Aurik's help and keeps the letter.

**R44 An iPhone subscriber cannot find where to cancel Plus.**
- Find out: a review or Apple's reviewer. No alarm. After fix-app: the iPhone You screen shows the manage-subscription link.
- Who: Aurik for the reply, Jamin for the code.
- Steps: 1. Tell the shopper: iPhone Settings, tap your name, Subscriptions, Pexi, Cancel Subscription (Apple's own path; ASSUMED unchanged in the current iOS). 2. Cancelling in Apple's page also stops renewal; the paid time stays until the end of the period. 3. The refund reply is in `TEMPLATES.md`. 4. Until fix-app is merged, treat any "how do I cancel" mail as proof the link is still missing and say so in the weekly check.

**R45 The log, event and device-id cleanup does not run, so data stays past what the privacy page promises.**
- Find out: a stderr line nobody reads. After fix-watch: a "last sweep ok" time in `/api/health` and an alarm over 3 days; after fix-mac: weekly rotation of the server output logs (30 days).
- Who: Jamin.
- Steps: 1. Today, by hand: `grep -i "retention\|sweep" ~/shin/mac/logs/server.err.log | tail` and look for a recent run. 2. The sweep is `app/src/retention.ts`, called from the daily timer in `app/server.ts`. Restart the server to make it run again, then read the log. 3. `mac/logs/server.out.log` and `server.err.log` carry device ids and are not rotated yet (`docs/privacy/data-requests.md`, section "What the privacy page promises"): trim them monthly until fix-mac lands. 4. Tables with no period at all (`consent`, `device_key`, `device_preference`, `device_user`, `device_person`) stay until a deletion request. Do not tell shoppers otherwise.

**R46 Charging starts before the business paperwork is done.**
- Find out: nothing; the first sale or a CRA letter. Calendar reminders are in `pexi-dates.ics` (GST/HST filing after registration; tax dates 2027-04-30 and 2027-06-15).
- Who: Jamin.
- Steps: 1. Before the first paid sale, tick the pre-launch list in `HANDOVER.md` section "Business steps": Ontario business name, GST/HST registration decision (the CA$30,000 small-supplier limit is the number to confirm with an accountant; ASSUMED, not checked), a business bank account, the terms. 2. One accountant call. 3. Put the first return date in the calendar the day you register. 4. Apple pays out only with the tax forms done (R26).

**R47 One of our own changes uses data differently and the policy, label and notices are not updated.**
- Find out: nobody until Apple or a user raises it.
- Who: whoever makes the change; Jamin signs off.
- Steps: 1. Before shipping, run `docs/readiness/before-changing-data-use.md` (one page). 2. Anything it flags: update the privacy page in both languages, the App Store privacy label, the privacy manifest in the app, and the Quebec transfer note, then ship. 3. The page is linked from `RELEASE-CHECKLIST.md` (after fix-app).

**R48 The Apple age-rating questionnaire (due 2027-01-12) is missed, or Apple questions the 4+ rating because the catalogue names liquor.**
- Find out: Apple's email to the account holder. Calendar reminders 2026-12-13 and 2027-01-05.
- Who: Aurik owns it with Jamin's yes; the account holder is Jamin.
- Steps: 1. In December, open App Store Connect, App Information, Age Rating, and answer from the prepared table in `docs/store/listing.md` ("Age-rating answers for the 2027 questionnaire"). 2. Confirm the 2027-01-12 date in the account and fix the calendar if it differs. 3. If Apple raises the rating because of alcohol names: the choice written there (accept the higher rating, or hide alcohol products) is Jamin's, written in `needs-jamin.md`. 4. Do it in December, not on the deadline.

**R49 Our internal privacy answers say a reinstall gives a new id.**
- Fixed by fix-docs: `docs/privacy/data-requests.md` section 4 and `docs/privacy/breach-plan.md` section 3c now say the id survives in the Keychain, and the public pages (`docs/store/privacy.html`, `privacy-fr.html`) say the same. A reset-id button is not built; the only reset is Delete my data.

**R50 A vendor changes its terms or privacy position and the privacy policy no longer matches.**
- Find out: vendor emails to the account owners; nobody reviews them.
- Who: Jamin, quarterly.
- Steps: 1. Quarterly (dates list): re-read the privacy and terms pages of Apple, Anthropic, RevenueCat, Cloudflare and Google (Gmail for support mail); write the date read and any change in the vendor table in `HANDOVER.md`. 2. A change to what a vendor does with data: run `before-changing-data-use.md`. 3. Forward vendor "we changed our terms" emails to a shared label so they are not lost (needs Jamin).

**R51 A shopper asks to see or delete everything Pexi holds.**
- Find out: the email arrives in the support inbox, so only R18 catches it.
- Who: Jamin (the tools run on the Mac).
- Steps: 1. Start the 30-day clock the day it arrives (a Quebec or federal request; the exact legal period is for the lawyer, not for this file). 2. Follow `docs/privacy/data-requests.md`: get the device id from the Delete my data email, then `node scripts/privacy/device-data.mjs delete "$ID"` (dry run), then `export` and `delete ... --yes`. 3. A request with no device id cannot be matched: ask them to use the Delete my data button; do not guess from a name. 4. Remove them from RevenueCat as well (the dashboard's customer delete; steps in the same file). 5. Reply with the count of what was removed, never the data itself. Tried once in drill 4.

**R52 The nightly backup stops and nobody hears.**
- Find out: nobody. After fix-mac and fix-watch: the backup writes a "last good backup" mark and the alarm goes red over 36 hours.
- Who: Jamin or the stand-in.
- Steps: 1. Weekly: `ls -lt "$SHIN_BACKUP_DIR" | head -5`: the newest folder must be from last night. 2. Missing: `tail -30 ~/shin/mac/logs/backup.err.log` (the log name is ASSUMED; look in `~/shin/mac/logs`), check disk space (R10), run the job by hand with `sh ~/shin/mac/07-backup.sh`. 3. Restore a copy once (drill 3) so you know the backup is good, not only present.

**R53 A parent complains, or a privacy body asks how children's data is handled.**
- Find out: a parent's email or a letter. No alarm.
- Who: Jamin.
- Steps: 1. Reply with "Refund or purchase by a child" or the privacy-by-a-parent template in `TEMPLATES.md`. 2. Deletion for a child: `docs/privacy/data-requests.md` section 1b. 3. The written record the OPC Code asks for is `docs/privacy/children-record.md`. 4. A regulator letter: give them `children-record.md` and the privacy page, and answer with Jamin's name; nobody else replies. 5. The under-14 line is already on the privacy page (both languages).

**R54 The AMD internship agreement conflicts with Pexi (outside work or IP terms).**
- Find out: nobody; no review of the agreement is on file.
- Who: Jamin.
- Steps: 1. Before 2027-05-03 read the agreement's outside-activities and IP sections. 2. Ask AMD for written approval for Pexi, in his words (`needs-jamin.md`). 3. Until approved, nothing about Pexi is worked on with AMD equipment or time. 4. Settle who covers support (R06, `HANDOVER.md`).

**R55 The Mac is stolen or entered, and every database, key and backup is read.**
- Find out: theft shows as the alarm going red; quiet entry shows as nothing.
- Who: Jamin.
- Steps: 1. Theft: Find My Mac (lock and erase) first, then rotate every key (R56), then treat it as a breach (`docs/privacy/breach-plan.md`: who to tell and when). 2. Today the server runs as user `worker`, which may be an admin (ASSUMED); after fix-mac: firewall on, non-admin user, Remote Login and Screen Sharing off unless used. 3. FileVault is the open choice (R08). 4. Weekly: `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate`.

**R56 A service key leaks, or a rotation silently breaks Plus or Claude estimates.**
- Find out: a vendor email, a surprise bill, or an alarm; a failed RevenueCat rotation shows as free users (R27).
- Who: Jamin.
- Steps: 1. The keys: Anthropic, RevenueCat (secret and public), App Store Connect, the tunnel credential, the admin token and invite code, and the GitHub deploy key (the full list with where each lives is in `HANDOVER.md`, names only). 2. Rotate in the vendor's dashboard, write the new value into `~/shin/mac/config.env` only, restart, then run the check in R27 (RevenueCat) or one Claude-needing scan (Anthropic). 3. Never paste a key into chat, a commit, mail or a document. 4. If a key was ever in the git history, rotate it and tell Jamin; do not rewrite history without his word. 5. Drill: rotate Anthropic first; log it in `DRILLS.md`.

**R57 A retailer, brand or data provider writes in about a shown price, a stop request, a terms notice or an expired source key.**
- Find out: the support inbox or the source's account email.
- Who: Jamin.
- Steps: 1. Reply from `TEMPLATES.md` ("Retailer asks about or objects to a shown price"; operational only). 2. If asked to stop: `node scripts/security/remove-shopper-input.mjs` handles typed prices; for a seller's price rows from a data source, copy the prices file first, then delete that seller's rows and switch the source off in `config.env` (a one-command tool for this is not built; fix-docs has not assigned it to another lane, flagged in the report). 3. Restart and scan a product from that seller to confirm it is gone. 4. Write the date and what was removed in the vendor table.

**R58 A restore brings back data that shoppers had deleted.**
- Find out: nobody would know.
- Who: Jamin.
- Steps: 1. After any restore, list the deletion requests answered in the last 45 days (the data-requests log in `docs/privacy/data-requests.md`; keep it current) and re-run `device-data.mjs delete "$ID" --yes` for each. 2. Also re-run retention by restarting the server (R45). 3. Tell the shopper only if they ask. 4. Timed once in drill 3.

**R59 Outreach to store contacts from the crawl job creates spam complaints.**
- Find out: a complaint or a blocked account.
- Who: Jamin.
- Steps: 1. Nothing is sent from the crawl list until Jamin decides what it is for (`needs-jamin.md`). 2. If he decides yes: a named person reads the replies, every message has an unsubscribe line, and a person sends each one (the system never sends). 3. A complaint arrives: stop, remove the contact, reply once with an apology and the removal.

**R60 The Terms, Privacy and Support pages at `xu826jamin.github.io/pexi` go down.**
- Find out: nobody; the alarm probes the server only. After fix-watch: the three URLs are in the alarm and a 404 emails.
- Who: Jamin.
- Steps: 1. `for p in index.html terms.html privacy.html; do curl -s -o /dev/null -w "$p %{http_code}\n" https://xu826jamin.github.io/pexi/$p; done` (the host is ASSUMED to be right; check it against `docs/store/listing.md`). 2. GitHub account suspended: GitHub support. Meanwhile put copies in `docs/store/` behind the server (after fix-watch the server serves them). 3. The store listing and the app link to these pages, so a dead page can fail App Review; fix before submitting.

**R61 A copycat uses the Pexi name, another business objects, or someone files the trademark.**
- Find out: a letter, an App Store dispute email, or chance. After Jamin's step: a Google alert for "Pexi app".
- Who: Jamin.
- Steps: 1. Copycat app or site: screenshot, and report it to Apple (App Store Connect, report a problem) or the host. 2. Another business objects: do not argue; keep the letter; the response is for a lawyer. 3. Re-run the name search the week before launch (`needs-jamin.md`) and decide on the trademark filing (the draft exists; cost is in `RULINGS.md`).

**R62 The Competition Bureau or a rival challenges a price claim or the "great deal" wording.**
- Find out: a letter.
- Who: Jamin.
- Steps: 1. Give them `TEMPLATES.md` section "How each verdict is computed" (the fact sheet) and nothing else, and have Jamin send it. 2. Before posting any ad or store text: check it against `RULINGS.md:462` (no savings promises). 3. The price-range hit rate is not measured; do not state one.

**R63 A privacy regulator (federal or Quebec) asks questions or opens a file.**
- Find out: a letter to the support or registered address.
- Who: Jamin.
- Steps: 1. Jamin answers, with the named privacy officer line (already on the privacy page). 2. Hand over: `docs/privacy/data-requests.md`, `docs/privacy/breach-plan.md`, `docs/privacy/children-record.md`, `docs/store/quebec-transfer-note.md`, and the legal review's transfer assessments (three still to be written: `needs-jamin.md`). 3. Keep a log of incidents even when nobody was affected (the breach plan has the register).

**R64 A brand or retailer offers money to be shown first, or asks to partner, advertise or license the data.**
- Find out: the support inbox or a message to a founder.
- Who: Jamin.
- Steps: 1. Reply from `TEMPLATES.md` ("Partnership or advertising enquiry"): not now, we kept your note, and three questions back. 2. Anything that changes ranking or shows paid placement conflicts with the public policy ("no ads"): Jamin decides, in writing, before any reply that says yes. 3. A licence of the price data is a separate decision (sources' terms apply; ASSUMED not reviewed).

---

# Tier 4: slower or smaller risks

**R65 A yearly iOS or Xcode release, Apple's minimum-SDK rule, a Capacitor major or an ML Kit floor makes the app unbuildable or unsubmittable.**
- Find out: Apple's requirements page and developer emails; nobody reads them on a schedule.
- Who: Aurik (builds), Jamin (account).
- Steps: 1. Reminders in the dates list: January, April, July and September (the September iOS release is the yearly one; an April 2027 SDK floor is an inference, not announced). 2. At each one, read Apple's "upcoming requirements" page and note the date in `HANDOVER.md`. 3. Keep one test phone on each iOS beta. 4. Do not take a Capacitor major release in the first three months after launch.

**R66 The signing certificate, provisioning profile or App Store Connect API key expires or is revoked.**
- Find out: only when someone tries to build.
- Who: Aurik, with Jamin's account.
- Steps: 1. Write each certificate and key expiry date and where the API key file lives in the accounts table (`HANDOVER.md`, names and dates only). 2. A reminder 30 days before each. 3. Expired: developer.apple.com, Certificates, create a new one, update the profile, make one test build to prove it uploads. 4. Run one dry build every quarter.

**R67 A shopper with no signal gets only "needs a connection", or the offline pack is missing or stale.**
- Find out: a review. No offline metric.
- Who: Jamin decides the limit.
- Steps: 1. Today an offline scan shows the needs-a-connection message; Jamin records it as a launch limit in `RULINGS.md` (`needs-jamin.md`). 2. Check that the pack route returns a plausible file: after fix-watch the probe does. 3. A review about it: reply with the "it needs a signal" line in `TEMPLATES.md`.

**R68 McMaster exam windows or drop dates collide with launch or an emergency.**
- Find out: dates in Jamin's notes only.
- Who: Jamin.
- Steps: 1. Put the exam windows and the 2027-01-12 free-drop and 2027-03-14 refund dates on the same calendar as this file's dates (the dates are from his notes; confirm them in his course pages). 2. Launch at least a week before or after an exam block. 3. During an exam block, the stand-in carries the weekly check (`HANDOVER.md`).

**R69 Tailscale access to the Mac expires, so Jamin cannot fix the server from away.**
- Find out: nobody until he tries.
- Who: Jamin.
- Steps: 1. Admin console, Machines, the Mac, "Disable key expiry". 2. Log in once from a phone on cellular to prove it. 3. Free-plan terms change: check the account email each quarter. 4. Fallback: someone physically at the Mac (R04 steps).

**R70 CocoaPods goes read-only on 2026-12-02.**
- Find out: calendar reminders 2026-11-02 (past) and 2026-11-25, and the 2026-12-02 date itself.
- Who: Aurik.
- Steps: 1. Before 2026-12-02 copy the whole `Pods` folder and the lock file to a second disk (after fix-app, a script does it). 2. Existing builds keep working: the package list going read-only stops new publishes, not downloads (ASSUMED from Apple and CocoaPods' notices; recheck the notice). 3. For new plugin versions, check that the plugin supports Swift Package Manager.

**R71 The weekly Project Hammer refresh fails, hangs or never runs, so prices age.**
- Find out: the alarm's freshness check fires when the newest price day is too old (`scripts/data-freshness.mjs`); after fix-watch also when a refresh is refused.
- Who: Jamin.
- Steps: 1. Sunday check: `tail -40 ~/shin/mac/logs/hammer.log` (name ASSUMED) and the newest price date in `/api/health`. 2. Stuck run: `launchctl bootout gui/$(id -u)/com.shin.hammer`, then run `sh ~/shin/mac/hammer-refresh.sh` once by hand. 3. The source moved or stopped: leave last week's data in place; shoppers see older prices, which is better than none. Tried in drill 11.

**R72 The deploy path stalls (GitLab outage, deploy key revoked, mailbox broken, checker stopped).**
- Find out: nobody; after fix-watch the alarm fails when the checker's last-seen time is over 15 minutes old.
- Who: Jamin or a Mac session.
- Steps: 1. `launchctl list | grep com.shin.checker`, then `tail -30 ~/shin/mac/logs/checker.log` (name ASSUMED). 2. A fix is urgent and deploy is stuck: on the Mac, `cd ~/shin && git pull` and run the server from that tree by hand only with Jamin's word, then fix the checker. 3. A revoked deploy key: add a new one in GitLab (needs Jamin). 4. After the fix, send one `deploy:` message and watch it land.

**R73 Apple rejects the first public build or an update.**
- Find out: Apple's email and a Resolution Center message.
- Who: Aurik replies, Jamin approves any change.
- Steps: 1. Read the guideline named. 2. Fix only what is named; reply in Resolution Center the same day. 3. Add the reason to a "past rejections" list at the end of `RELEASE-CHECKLIST.md` so it is not repeated. 4. Before the first submission, check the listing against `docs/store/listing.md` and the iOS manage-subscription row (R44).

**R74 People outside Canada install Pexi and get no prices.**
- Find out: a review or the weekly country count (access log field `country`).
- Who: Jamin.
- Steps: 1. App Store Connect, Pricing and Availability: confirm Canada only. 2. Count: `grep -o '"country":"[A-Z][A-Z]"' "$SHIN_ACCESS_LOG" | sort | uniq -c | sort -rn | head`. 3. Reply to a foreign review from `TEMPLATES.md` ("Pexi is for Canada").

**R75 A competitor copies the idea or undercuts the price.**
- Find out: nobody; chance or a review.
- Who: Jamin.
- Steps: 1. Nothing to run. A one-line acceptance in `RULINGS.md` (`needs-jamin.md`) makes it a named, accepted risk. 2. If a free rival appears, the answer is the product itself; do not change prices in a week.

**R76 Apple or Google raise a privacy question about ML Kit.**
- Find out: Apple email or a build warning.
- Who: Aurik.
- Steps: 1. Before the first public submission, run Xcode's Privacy Report on the real archive (on the Mac) and fix what it lists. 2. A question from Apple: answer from the privacy page (text recognition runs on the phone; only the recognised lines of text go to the server, never the image). 3. Keep the privacy manifest in step with the plugin version (see `before-changing-data-use.md`).

**R77 OpenStreetMap's Overpass service blocks or slows Pexi.**
- Find out: nobody; the nearby-shops list is empty. After fix-app: User-Agent with the Pexi name and a contact, one shared in-flight request.
- Who: Jamin.
- Steps: 1. Test: `curl -s -m 15 -A "Pexi" "https://overpass-api.de/api/status"`. 2. Turn location off for the moment if it is failing (shoppers pick a store by hand). 3. Write to the Overpass maintainers using the contact on their site (ASSUMED route); operational only.

**R78 A journalist or creator asks for a comment, or a wrong verdict screenshot spreads.**
- Find out: the support inbox, or a founder's messages.
- Who: Jamin speaks for Pexi; Aurik backs him up.
- Steps: 1. Use "Press enquiry" in `TEMPLATES.md`. 2. A spreading screenshot: find the barcode in it, check the verdict (the fact sheet explains how it was reached), fix the data if it is wrong (R23), and reply to the post once, plainly. 3. Never argue. Never delete a thread.

**R79 iOS clears the app's web storage and it forgets settings, consent or the Plus flag.**
- Find out: a shopper email ("I lost my settings").
- Who: Aurik.
- Steps: 1. Tell them: reopen the app, accept the first-run screens again, then You, Pexi Plus, Restore Purchases. 2. Their scan count is safe: the id and secret are in the Keychain (build 9). 3. After fix-app: values that cannot be recomputed move to the Keychain.

**R80 A shopper with a vision or motor need cannot use the app.**
- Find out: a review or an email.
- Who: Aurik.
- Steps: 1. Reply kindly and ask which screen. 2. Test with VoiceOver on a real phone: scan, result, paywall. 3. Fix the named screen in the next build.

**R81 More than 5,000 different phones or addresses in one day make the limiters forget the oldest.**
- Find out: nobody; the Claude cap would show the cost.
- Who: Jamin.
- Steps: 1. Watch the Claude cap (R33). 2. A written line in `RULINGS.md` accepting it, or raise the ceiling (needs `needs-jamin.md`). 3. Lower `SHIN_RANGE_ASK_MONTHLY_CAP` if abuse shows.

**R82 The other data sources (Open Facts, Open Prices, Icecat, USDA, BC liquor) age quietly.**
- Find out: nobody. After fix-watch: each source's last-loaded date in health, and an alarm on the two price sources.
- Who: Jamin.
- Steps: 1. Monthly: read `/api/health` for each source date. 2. A source over 60 days old: re-run its loader from `mac/04-catalogue-acquire.md` (new folder, row-count check, then switch). 3. An expired key or changed terms: R57.

**R83 TestFlight builds expire 90 days after upload (build 9, uploaded 2026-11-17, expires about 2027-02-15).**
- Find out: calendar reminders 2027-01-16, 2027-02-05 and 2027-02-08; Apple emails testers.
- Who: Aurik.
- Steps: 1. Upload a fresh build before the date and send it to testers. 2. Launch slips: do not let the last build expire during review. 3. Update the date in `pexi-dates.ics` when each new build ships (80 days after upload).

**R84 A subscriber cancels or is refunded and keeps Plus a few days longer.**
- Find out: nobody.
- Who: Jamin.
- Steps: 1. In RevenueCat, press the button for Apple's server notification URL (about 5 minutes; needs Jamin). 2. Or write the lag down as accepted in `RULINGS.md`. 3. A shopper asks: it ends at the end of the paid period; nothing to do.

**R85 A build-time download source (npm, GitHub packages, CocoaPods CDN, the embedding model file) is unreachable or changed.**
- Find out: a failed deploy or rebuild.
- Who: Jamin or a Mac session.
- Steps: 1. Read the error in the checker log. 2. Retry after the vendor's status page clears. 3. Keep one copy of the embedding model and overlay folder on a second disk (after fix-mac says where in `mac/DEPLOY.md`). 4. A package gone: use the lock file's copy in `node_modules` on the Mac, do not update on the fly.

**R86 Node 22 reaches end of life on 2027-04-30 while the Mac runs Node 26 and the alarm's tests pin Node 22.**
- Find out: calendar reminders 2027-03-31 and 2027-04-23.
- Who: a Mac session or the PC.
- Steps: 1. After fix-watch the workflow runs on the same Node as the Mac. 2. Otherwise: change `node-version` in `.github/workflows/server-alarm.yml` to the Mac's version (`node -v` on the Mac), run the workflow once by hand, and read it.

**R87 An investor, accelerator or buyer writes and the basics are not in one place.**
- Find out: the support inbox or a founder's messages.
- Who: Jamin.
- Steps: 1. Use "Investor basics" in `TEMPLATES.md` (who owns what, the domain, legal form, data terms, open items). 2. Read the AMD agreement first (R54): it can decide what Jamin is allowed to say. 3. Never send accounts, keys or the database; a person sends every reply.

**R88 Good reviews lead Apple to consider a feature and Pexi is not ready.**
- Find out: an Apple contact email.
- Who: Jamin and Aurik.
- Steps: 1. Reply within a day. 2. Ready first: load test (drill 10), French listing if Quebec is in (R43), answers to open reviews. 3. Then submit the nomination with an in-app event.

**R89 Monthly tracked revenue passes US$2,500 and RevenueCat starts taking about 1 percent.**
- Find out: RevenueCat's billing email.
- Who: Jamin.
- Steps: 1. Write one line in `RULINGS.md` that the fee is accepted (`needs-jamin.md`). 2. Put the fee in the bills table (R32).

**R90 An old Google Gemini key or billing project keeps billing or doubles its rate on 2027-01-01.**
- Find out: a Google billing email, if read.
- Who: Jamin.
- Steps: 1. Google Cloud console: delete the old key, close or unlink the billing project. 2. Check the billing page shows nothing active. 3. Calendar reminders 2026-12-02 and 2026-12-25 for the 2027-01-01 date.

**R91 The OPC Children's Privacy Code comment period closes 2027-01-20 with Pexi silent.**
- Find out: calendar reminders 2026-12-21 and 2027-01-13.
- Who: Jamin decides; the draft is `docs/privacy/opc-comment-draft.md`.
- Steps: 1. Read the draft; send it, edit it, or write "no comment" in `needs-jamin.md`. 2. If sent: a person sends it, from the support address, and a copy goes in `docs/privacy/`. 3. Do it before 2027-01-13; the date is from the legal review, ASSUMED unchanged (check the OPC page).

**R92 The network-hash salt is missing or unwritable, so typed prices stop counting or one network splits in two.**
- Find out: nobody. After fix-watch: health shows the salt state.
- Who: Jamin.
- Steps: 1. After every `config.env` edit: confirm `SHIN_NETWORK_SALT` is set (`grep -c SHIN_NETWORK_SALT ~/shin/mac/config.env` must print 1; never print the value). 2. Include it in the secrets list (`HANDOVER.md`, name only). 3. A lost salt: set a new one; older typed prices keep working, shoppers on the same network are counted separately until old ones age out.

**R93 Under heavy use, database writes run one at a time and scan rows are dropped.**
- Find out: nobody. After fix-app and fix-watch: batches written in one transaction and a dropped-scan count in health.
- Who: Jamin.
- Steps: 1. Drill 10 (load) shows the failing number. 2. Free-scan counts may read low during a spike; do not tell a shopper they are wrong, give them the week's allowance. 3. After the fix, read the dropped count in `/api/health` after each spike.

---

# Dates: every renewal and deadline

Each row has a 30-day and a 7-day reminder in `pexi-dates.ics`. Jamin imports the file himself (Calendar app: File, Import).
When a date is read from an account and differs from the one here, move the reminders. "Confirm" means the date was not
read from the account.

| Date | What | Item | 30-day reminder | 7-day reminder | Source or status |
|---|---|---|---|---|---|
| 2026-12-02 | CocoaPods package list goes read-only | R70 | 2026-11-02 (already past) | 2026-11-25 | register |
| 2027-01-01 | Gemini rates double | R90 | 2026-12-02 | 2026-12-25 | register |
| 2027-01-12 | Apple age-rating questionnaire due | R48 | 2026-12-13 | 2027-01-05 | register; confirm in App Store Connect |
| 2027-01-20 | OPC Children's Privacy Code comments close | R91 | 2026-12-21 | 2027-01-13 | legal review; confirm on the OPC page |
| about 2027-02-15 | TestFlight build 9 expires (uploaded 2026-11-17, 90 days) | R83 | 2027-01-16 | 2027-02-08 | calculated; also 2027-02-05 (80 days) |
| 2027-04-30 | Node 22 end of life | R86 | 2027-03-31 | 2027-04-23 | register |
| 2027-04-30 | Personal income tax filing (self-employed June 15) | R46 | 2027-03-31 | 2027-04-23 | CRA general dates; confirm with an accountant |
| 2027-05-03 | AMD internship starts (16 months) | R06, R54 | 2027-04-03 | 2027-04-26 | his notes |
| 2027-06-15 | Self-employed income tax filing | R46 | 2027-05-16 | 2027-06-08 | CRA general dates; confirm |
| 2027-08-19 | anjiawenda.com renewal | R01 | 2027-07-20 | 2027-08-12 | `C:\ACT\NOW.md` |
| about 2027-10-08 | Apple Developer Program renewal | R25 | 2027-09-08 | 2027-10-01 | enrolment 2026-10-08; confirm in the account |
| September every year | New iOS and Xcode release: check the app builds and submits | R65 | 2027-08-16 | 2027-09-08 | yearly (15 September is a planning date) |
| After GST/HST registration | First GST/HST return and each one after | R46 | set when registered | set when registered | CRA gives the period on registration |

Repeating reminders in the file: every Friday (the weekly check, `HANDOVER.md`), the first of every month (Apple agreements and
vendor bills, R26 and R32), and the first week of January, April, July and October (read Apple's upcoming requirements,
the five vendors' pages and Anthropic's deprecations page: R50, R65, R34).

Not in the file because the date is not known yet: the launch day and the day-1, day-7 and day-30 checks after it (R24), the
renewal of each signing certificate (R66, fill in from the account), and a new TestFlight build's 90th day.

