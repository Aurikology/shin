# Pexi drills: the 12 rehearsals, as checklists (2026-11-18)

Source: the rehearsal plan in `REGISTER.md`. Each drill tries one response from `RUNBOOK.md` once, so the first real use is
not the first use. **None of these has been run.** The commands come from `mac/README.md`, `mac/DEPLOY.md` and
`docs/privacy/data-requests.md` and are not re-verified here.

Rules for every drill:
- Jamin approves any drill that touches the live server, his accounts or his phone. Do it before launch, or in the quietest hour after.
- Tell Aurik before a drill that can take the server down.
- Never paste a key, a password or the contents of `config.env` into the results log.
- A step that fails is a result, not a mistake: write it down, fix the cause, run the step again.
- Fill the results log under each drill the same day. Pass means every "proves it worked" line is true.
- Order: drill 1 first. Every other drill relies on being told when something goes wrong.

---

## 1. Alarm drill (first)

Covers R02, R03, R05, R17. Present: Jamin at the Mac (or over Tailscale), Aurik with phone on. 20 minutes hands-on; up to 9 hours if you also wait for the GitHub schedule to fire (it ran every 8 to 9 hours on 2026-11-16 to 18).

- [ ] The second watcher (outside uptime monitor) is set up and both founders' phones are on it (`needs-jamin.md`).
- [ ] Note the clock time. On the Mac stop the server job: `launchctl bootout gui/$(id -u)/com.shin.server` (booting it out stops launchd restarting it).
- [ ] Record when each signal arrives: the PC's Lookout or ntfy alert, the deploy checker's mail, the second watcher's push on BOTH phones, the GitHub alarm email.
- [ ] Start the server: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shin.server.plist`. Public health returns 200.
- [ ] Repeat with only the tunnel stopped (`sudo launchctl bootout system/com.cloudflare.cloudflared`, ASSUMED label): public health returns 530.
- [ ] Run the GitHub alarm by hand (Actions, `server-alarm`, Run workflow) against a deliberately wrong address (`https://evil.example`) and keep the email.
- [ ] From a phone on cellular, run `mac/08-cellular-check.md` and look for a Cloudflare challenge page (R17).

Pass: a phone push to both founders within 5 minutes of the stop, for the server stop and the tunnel stop; the server is back and public health returns 200; the wrong-address test produced an email.

| Date | Who | Server stop: first signal (min) | Tunnel stop: first signal (min) | GitHub wrong-address email (y/n) | Cloudflare challenge seen (y/n) | Pass | Fixes needed |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## 2. Mac reboot and recovery

Covers R04, R08, R55. Present: Jamin at the Mac (needs the disk password if FileVault is on). 30 to 45 minutes, up to 2 hours if the first try fails.

- [ ] Quiet hour, no App Review pending. Tell Aurik.
- [ ] Restart the Mac and do not log in.
- [ ] Time until `https://relay.anjiawenda.com/api/health` answers 200 from a phone on cellular.
- [ ] If it never returns: log in; note which jobs were missing (`launchctl list | grep com.shin`: server, checker, backup, hammer; and the tunnel). Apply auto-login or move the jobs to LaunchDaemons (`fix-mac`), then repeat.
- [ ] Repeat once after the FileVault decision (R08) is applied.
- [ ] Write the minutes-to-recover into `mac/README.md`.

Pass: public health returns 200 with nobody logged in; all jobs listed; minutes written; the alarm from drill 1 fired.

| Date | FileVault on/off | Minutes to 200 with nobody logged in | Jobs missing | Pass | Fixes needed |
|---|---|---|---|---|---|
| | | | | | |

## 3. Backup restore onto another machine

Covers R07, R52, R58, R85, R16. Present: Jamin (secrets and the backup). 2 to 3 hours the first time.

- [ ] Take the newest backup from the OFF-Mac copy. If none exists yet, that is the first failure: record it and fix it.
- [ ] On the second machine (the PC or another Mac): `sh mac/07-restore.sh <backup> <clean-folder>`.
- [ ] `sqlite3 <db> "PRAGMA integrity_check"` on every database: all say `ok`.
- [ ] Compare row counts with the backup's own record.
- [ ] Start the server with a copy of `config.env`; scan one known barcode and read the price.
- [ ] Write what was missing (tunnel credential, 3.5 GB catalogue, embedding model, offline pack, network salt).
- [ ] Re-apply the deletion requests already honoured in the last 45 days (R58).

Pass: the second machine answers a known-barcode scan with a price; integrity_check says ok everywhere; the "missing from the backup" list is empty or each line has a fix.

| Date | Backup used (folder name) | Minutes to a working server | integrity_check all ok (y/n) | Missing from the backup | Deletions re-applied | Pass |
|---|---|---|---|---|---|---|
| | | | | | | |

## 4. Test delete-my-data request

Covers R51, R49, R18, R58. Present: Jamin (inbox, RevenueCat, Mac shell). 60 to 90 minutes.

- [ ] On a TestFlight phone: You screen, Delete my data, so the real email path runs. Time until a founder sees it.
- [ ] Follow `docs/privacy/data-requests.md`: dry run `node scripts/privacy/device-data.mjs delete "$ID"`, export, delete with `--yes`.
- [ ] Delete the RevenueCat customer; write the click path into the doc.
- [ ] Reply from Jamin's own account (the system never sends on its own).
- [ ] Re-run the dry run: every count is 0.
- [ ] Reopen the app. Note what the id does after the delete and after a reinstall (the id survives in the Keychain; the free allowance restarts).

Pass: the re-run shows 0 in every table; the export file is empty; the RevenueCat customer is gone; email to reply under 24 hours (own target: 7 days at most); the steps and the RevenueCat click path are written into the doc.

| Date | Minutes email to a founder | Hours request to reply | Re-run counts all 0 (y/n) | RevenueCat customer gone (y/n) | Id after reinstall | Pass |
|---|---|---|---|---|---|---|
| | | | | | | |

## 5. Rotate one key

Covers R56, R27, R34. Present: Jamin (vendor consoles); the Mac or Tailscale. 45 minutes.

- [ ] Prove the failure is loud first: in a quiet hour mistype the Anthropic key in `config.env`, restart, and confirm health and the alarm go red (needs the health fields from fix-watch).
- [ ] Rotate for real: new Anthropic key in the console, edit `config.env`, restart (`launchctl kickstart -k gui/$(id -u)/com.shin.server`), make one estimate call, revoke the old key.
- [ ] Repeat for the RevenueCat secret: confirm a sandbox Plus phone is still Plus (R27 curl returns 200).

Pass: estimate works after rotation; the old key is refused; the sandbox Plus phone is still unlocked; the mistyped-key run turned health or the alarm red within the alarm time; steps written down with times.

| Date | Key | Minutes to red when mistyped | Estimate works after (y/n) | Old key refused (y/n) | Plus still on (y/n) | Pass |
|---|---|---|---|---|---|---|
| | Anthropic | | | | n/a | |
| | RevenueCat | | n/a | | | |

## 6. Bad server deploy rolled back

Covers R09, R72, R11. Present: Jamin (push to main and the mailbox). 45 minutes.

- [ ] Push a commit that fails the tests; confirm live is untouched.
- [ ] Push a commit that passes the tests but breaks one route (for example health returns 500); see whether anything stops it.
- [ ] Roll back: mail the Mac `deploy: pin <last good sha>` (`mac/DEPLOY.md`) and time it.
- [ ] Run the `kill -9` test once: find the server's process id, `kill -9 <pid>`, confirm launchd brings it back.

Pass: the live commit on the health route returns to the good one; minutes of bad service written down; the alarm email arrived for step 2 (or the gap is recorded and fixed).

| Date | Failing-tests commit blocked (y/n) | Breaking commit caught (y/n) | Minutes of bad service | Minutes to roll back | kill -9 recovery seconds | Alarm email for step 2 (y/n) | Pass |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## 7. TestFlight build installed and pulled

Covers R83, R14, R73, R66, R31. Present: Jamin at the Mac (Xcode, App Store Connect); Aurik with a phone. 1 to 2 hours plus Apple processing.

- [ ] Archive and upload the next build (with the iPhone manage row and the paywall fix); install from TestFlight on both phones; confirm the build number in the app.
- [ ] Expire or remove build 9 in App Store Connect; confirm testers can no longer install it.
- [ ] The signing dates list and the 80-day reminder exist (`pexi-dates.ics`, `HANDOVER.md`).
- [ ] If the remote kill switch is built (fix-app): flip it on the test build.

Pass: the new build is running on both phones; the old build expired; the pull took under a day; certificate and key expiry dates written down.

| Date | New build number | Hours to install | Hours to pull the old build | Expiry dates written (y/n) | Kill switch tried (y/n/not built) | Pass |
|---|---|---|---|---|---|---|
| | | | | | | |

## 8. Sandbox purchase, restore and manage

Covers R19, R21, R44, R27. Present: Jamin and Aurik (two phones). 1 hour.

- [ ] Sandbox Apple account on phone A at the free limit: buy Plus; scan again at once (must not show the paywall).
- [ ] Open Manage subscription on the iPhone (must exist).
- [ ] On phone B: Restore Purchases. Note what happens on A.
- [ ] Write the result into the support page and into R21's steps.

Pass: the first scan after purchase succeeds; the manage row opens Apple's subscription page; Restore on B unlocks Plus; result written.

| Date | First scan after purchase ok (y/n) | Manage row opens (y/n) | Restore on B unlocks (y/n) | What happened on A | Pass |
|---|---|---|---|---|---|
| | | | | | |

## 9. Aurik stand-in drill

Covers R05, R06, R04. Present: Jamin only to watch and to grant access. 45 minutes.

- [ ] Aurik, alone with `HANDOVER.md` and `RUNBOOK.md`, restarts the server and lowers one limit while Jamin watches without helping.
- [ ] Write down every question Aurik had to ask and every step that was unclear.

Pass: Aurik finishes with no questions and health returns 200.

| Date | Who | Questions asked | Minutes | Unclear steps (fixed in the doc, y/n) | Pass |
|---|---|---|---|---|---|
| | | | | | |

## 10. Load test at 500 then 2,000 phones

Covers R12, R15, R10, R36, R93. Present: Jamin (go-ahead for production). 2 hours.

- [ ] From the PC at a quiet hour, script scan, price and usage calls at 500 then 2,000 simulated phones against the real server.
- [ ] Watch CPU, memory and p95 time; stop at the first errors.
- [ ] Time one typed search at 1 and 5 million price rows (R15).
- [ ] Write the failing number and the first three dials to turn (the limits named in R12). Put them in `RUNBOOK.md` R12.

Pass: a written number where answers pass 3 seconds; the spike page names the first three limits to lower; the probe goes red on a slow route (after fix-watch).

| Date | Phones | p95 seconds | First errors at | Failing number | First three dials | Dropped scans (R93) | Pass |
|---|---|---|---|---|---|---|---|
| | 500 | | | | | | |
| | 2,000 | | | | | | |

## 11. Hammer refresh by hand and bad-file refusal

Covers R71, R28, R82. Present: a Mac session can do it; Jamin not needed. 45 minutes.

- [ ] Run `sh ~/shin/mac/hammer-refresh.sh` off schedule and time it; the freshness mark moves.
- [ ] After the guard exists (fix-watch): feed a truncated file and confirm it refuses loudly and keeps last week's data.
- [ ] Check each other data source's last-loaded date (R82).

Pass: the mark moves on the good file; the bad file is refused with a loud message and the alarm shows it.

| Date | Minutes for a full refresh | Mark moved (y/n) | Bad file refused (y/n/guard not built) | Alarm showed it (y/n) | Pass |
|---|---|---|---|---|---|
| | | | | | |

## 12. Support inbox and removal-tool test

Covers R18, R22, R23, R57. Present: Jamin (inbox). 30 minutes.

- [ ] From an outside account send the support address a mail containing "delete my data" and "refund"; time until both founders' phones buzz.
- [ ] Send the canned reply from `TEMPLATES.md`.
- [ ] On a copy of the data, hide one test barcode (`remove-shopper-input.mjs`) and one test source; confirm the verdict changes.

Pass: both phones notified within 5 minutes; canned reply sent in under 10 minutes; the removed row no longer appears in a scan.

| Date | Minutes to phone buzz (founder 1) | (founder 2) | Minutes to canned reply | Removed row gone from a scan (y/n) | Pass |
|---|---|---|---|---|---|
| | | | | | |

---

## Summary log (one line per drill, kept current)

| Drill | Last run | Result | Open fix |
|---|---|---|---|
| 1 Alarm | never | | |
| 2 Reboot | never | | |
| 3 Restore | never | | |
| 4 Delete request | never | | |
| 5 Rotate a key | never | | |
| 6 Bad deploy | never | | |
| 7 TestFlight | never | | |
| 8 Sandbox purchase | never | | |
| 9 Stand-in | never | | |
| 10 Load test | never | | |
| 11 Hammer | never | | |
| 12 Support inbox | never | | |
