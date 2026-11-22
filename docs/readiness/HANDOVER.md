# Pexi handover: running it for a month without Jamin (2026-11-18)

Register items R05, R06, R42. For a stand-in (a person Jamin names) and for Aurik. **Names of accounts only, never a
password, key or recovery code in this file.** Lines marked "Jamin fills in" are facts nobody wrote down; the file does not
guess them. Everything else comes from the repo, and anything not checked on the live account says ASSUMED.

What the stand-in is for: keep Pexi up, answer the support inbox, keep an eye on the weekly numbers, and stop things getting
worse. Not to change the product. `RUNBOOK.md` has the steps for each thing that can go wrong; start at its "2am page".

## 1. Accounts (names only)

| Account | What it holds | Owner | Stand-in access | Recovery path |
|---|---|---|---|---|
| Apple Developer and App Store Connect | The app, builds, TestFlight, reviews, payouts, tax forms | Jamin (account holder); Aurik is ASSUMED a user, check | Read-only role if Jamin grants one | Jamin fills in |
| RevenueCat | Subscriptions, who is Plus | Jamin | Read-only if granted | Jamin fills in |
| Cloudflare | The domain `anjiawenda.com`, the tunnel, security rules | Jamin | None by default | Jamin fills in |
| Anthropic console | The Claude key, balance and limits | Jamin | None | Jamin fills in |
| GitHub | The repo's alarm workflow, the legal pages host (`xu826jamin.github.io/pexi`, ASSUMED, check `docs/store/listing.md`) | Jamin | None | Jamin fills in |
| GitLab | The deploy source for the Mac, comms with Aurik | Jamin | Jamin fills in | Jamin fills in |
| Gmail: `usepexiapp@gmail.com` | Support inbox, vendor notices | Jamin | Reader, if forwarded (`needs-jamin.md`) | Jamin fills in |
| Tailscale | Remote access to the Mac | Jamin | Jamin fills in | Jamin fills in |
| The Mac (user `worker`) | The server, the databases, the backups, `config.env` | Jamin | Login only if Jamin chooses (see "what a stand-in may do") | Jamin fills in |
| Google Cloud (the old Gemini project) | Nothing live; to be closed (R90) | Jamin | None | Jamin fills in |
| Mailbox repo (`~/claude-mailbox`, private git) | Messages to the Mac session, `deploy:` messages | Jamin | Jamin fills in | n/a |
| Uptime monitor (after fix-watch and Jamin's step) | Pushes to both founders | Jamin | Add the stand-in's phone | Jamin fills in |

Keys that live only in `~/shin/mac/config.env` (names, never values): Anthropic key, RevenueCat secret, RevenueCat public iOS
key (`appl_...`, also in the app build), the admin token, the invite code, the network salt (`SHIN_NETWORK_SALT`), the
tunnel credential file under `~/.cloudflared/`. The App Store Connect API key file: location Jamin fills in. Printed
recovery codes for each account above: kept somewhere other than the phone (needs Jamin, `needs-jamin.md`).

Bills table (R32). Jamin fills in: vendor, plan, account email, card, monthly cost, renewal date, for Apple Developer,
domain, Cloudflare, Anthropic, RevenueCat, Tailscale, GitHub, Gmail, the uptime monitor.

Vendor pages last read (R50): Apple, Anthropic, RevenueCat, Cloudflare, Google, Open Food Facts, OpenStreetMap: never.
Fill in the date each time.

## 2. Where things live

| Thing | Where |
|---|---|
| Source code | The `shin` repo (GitLab, mirrored to a private GitHub copy); on the Mac `~/shin`; the running copy is `~/shin-live` |
| Data (scans, prices, corrections, catalogue) | `~/shin-data` on the Mac |
| Settings and keys | `~/shin/mac/config.env` (never in git, never in chat) |
| Logs | `~/shin/mac/logs` and the access log named by `SHIN_ACCESS_LOG` |
| Backups | `SHIN_BACKUP_DIR` on the Mac, nightly at 04:00, the last 14 folders. An off-Mac copy exists only after fix-mac |
| Weekly price refresh | Sunday 05:30, `mac/hammer-refresh.sh` |
| Server health | `https://relay.anjiawenda.com/api/health`; on the Mac `localhost:${PORT:-4173}/api/health` |
| Alarm | GitHub Actions, `server-alarm` (every 30 minutes on paper, much later in practice) |
| Deploys | A `deploy:` message in the mailbox; the Mac's checker deploys main after the tests pass (`mac/DEPLOY.md`) |
| App code and build | `app/`, `native/`; builds are made on the Mac in Xcode (Aurik or Jamin) |
| Legal, privacy and store text | `docs/store/`, `docs/privacy/` |
| This pack | `docs/readiness/`: `RUNBOOK.md`, `HANDOVER.md`, `TEMPLATES.md`, `DRILLS.md`, `needs-jamin.md`, `pexi-dates.ics` |

## 3. The weekly checklist (every Friday, 20 minutes)

1. **Is it up?** The `curl` on the runbook's first page returns 200. Open Actions, `server-alarm`: is the newest run under
   2 hours old? (R02)
2. **Health fields.** On the Mac: `curl -s localhost:${PORT:-4173}/api/health`. Look for `scanLog` true, `catalogueUp` true,
   `claudeMonthlyCap.reached` false, no faults. (R11, R33)
3. **Disk.** `df -h /` shows more than 10 GB free. (R10)
4. **Backup.** `ls -lt "$SHIN_BACKUP_DIR" | head -3`: the newest is from last night. (R52)
5. **Prices fresh.** The newest price date in health is within 14 days; the Sunday refresh log shows it ran. (R71)
6. **Inbox.** Read `usepexiapp@gmail.com`. Reply with `TEMPLATES.md`. Anything legal, regulator or press goes to Jamin the same day. (R18)
7. **Reviews, refunds, rating.** App Store Connect: Ratings and Reviews, Sales and Trends. Reply to every review of 3 stars or less. (R20)
8. **Numbers.** Write one line in the log below: scans this week, share of scans that showed a shop price, new Plus,
   refunds, rating. (R24)
9. **Dates.** Look at the table at the end of `RUNBOOK.md`: anything due in the next 30 days?
10. **Anything odd** goes in one message to Jamin and one to Aurik, by phone and by the comms board.

Weekly log (add a line each week): `date | up | disk | backup | prices | inbox cleared | reviews | numbers | notes`.

After a launch, also: day 1, day 7 and day 30 (first renewals fall about 30 days after launch): the same numbers plus
"did anyone pay and stay?".

## 4. Who to call

| Who | For | How |
|---|---|---|
| Jamin Xu | Everything: accounts, the Mac, money, legal, press | Phone and email: Jamin fills in. Mailbox and comms board |
| Aurik | The phone app, App Store paperwork, French | Phone and email: Jamin fills in. GitLab comms |
| Stand-in (named here): Jamin fills in | The weekly check, the inbox, first response to the 2am page | |
| Apple Developer Support | Account, rejection, agreements | developer.apple.com, Contact Us (phone and form) |
| RevenueCat support | Subscription and entitlement problems | In the dashboard |
| Cloudflare support | Tunnel or domain locked | In the dashboard (ticket) |
| An accountant | GST/HST and tax | Jamin fills in |

Rule for the 2am page: wait 30 minutes for Jamin, then act. Order of calls: Jamin, Aurik, the stand-in.

## 5. What a stand-in may and may not do

**May (no permission needed):**
- Run the checks and the runbook's first steps: health, `launchctl list`, read logs.
- Restart the server or the tunnel (`launchctl kickstart`).
- Lower a limit in `config.env` (the three in R12) and restart, and put it back afterwards. Keep a dated copy of the file first.
- Roll back a deploy: mail `deploy: pin <last good sha>`, or `deploy: hold <reason>`.
- Free disk space as described in R10 (old backup folders beyond the newest 5, empty an old log).
- Read the inbox and answer from `TEMPLATES.md`, including "how to cancel", "refund via Apple", "restore", "delete my data" (the deletion itself waits for Jamin or the person he names).
- Tell shoppers about an outage in one plain sentence.

**May not (Jamin only):**
- Rotate or paste a key; open or change `config.env` values other than the three limits; move or delete a database or backup.
- Run a deletion, an export, or a restore over live data.
- Change an account (Apple, RevenueCat, Cloudflare, Anthropic, GitHub, Gmail), a price, a plan or a bill.
- Submit or remove a build, reply to Apple, a regulator, a lawyer, a retailer, press, an investor or a partner.
- Switch on a feature, add a vendor, or ship a change that uses data differently (`before-changing-data-use.md`).
- Say anything about accuracy, savings or income.

## 6. What Jamin can do alone in Aurik's areas (R42)

If Aurik cannot be reached for weeks or the two of them disagree:
- **The phone app and builds:** Jamin can build and upload from the Mac himself (Xcode and App Store Connect are in his account). Slower, not blocked. ASSUMED: Jamin's account holds the signing certificate; check.
- **App Store paperwork:** Jamin is the account holder and can answer Apple. The age-rating answers are prepared in `docs/store/listing.md`.
- **French:** nothing French ships without Aurik's review. The French privacy page already exists; the rest waits.
- **Repo access:** Jamin owns it. Aurik's access is a role, not ownership (ASSUMED, check).

Topics for Jamin and Aurik to settle in writing on one call (nothing is on file): who owns the code and the Pexi name; each
person's share of money; who decides a price, a feature, a rejection reply; what happens if one of them stops; what each is
allowed to do alone for a month. Write the answers into `needs-jamin.md`'s sign-off list or a new dated file.

## 7. May 2027: the plan options (Jamin chooses before 2027-04-01)

Facts: AMD's internship starts 2027-05-03 and runs 16 months, full time. The agreement's outside-work and IP terms have not
been read (R54). The Mac needs a person, the inbox needs a reader, and an emergency build needs Aurik or Jamin.

| Option | What it means | Cost | Risk |
|---|---|---|---|
| A. Keep it running, light | The stand-in does the weekly checklist; Aurik takes builds and App Store; Jamin does only the 2am page and legal. No new features. | A few hours a week for the stand-in | Slow fixes; one more person with access |
| B. Freeze it | No new builds. Server stays up, inbox answered with templates. Free tier stays as is. | Near zero | Apple's yearly SDK and policy changes (R65) eventually force a build; Plus support still needed |
| C. Move off the Mac | Put the server on a small hosted machine with off-site backups, so nobody has to sit near it | Monthly hosting fee (not priced here) and a move weekend | A real project; do it before 2027-04 or not at all |
| D. Hand it to Aurik | Aurik becomes the owner of day-to-day, Jamin a backer | Needs the agreement from section 6 first | Depends entirely on that agreement and AMD's terms |
| E. Wind down | Remove from sale, give notice, delete data on a date | A written plan and a deletion drill | Ends the business |

Whichever is chosen: read the AMD agreement first (R54); move Apple, RevenueCat and the repo access to a shared recovery
path; run drill 9 with the real stand-in in April; and put the choice in `RULINGS.md` in his words.
