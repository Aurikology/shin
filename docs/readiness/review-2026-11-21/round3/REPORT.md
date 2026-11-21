# Pexi launch review, round 3 (2026-11-21 evening): report

Method: question the setup, not the code (BRIEF.md). Jobs: chain, host, outside, value, blind (PC, Sonnet), Mac
host security and answer data (mail 20261121225240-mac-ddbd62), plus an incident check (20261121230318-mac-5aa35e).
Findings: chain 16, host 8, outside 11, value 9, blind 36, Mac 4 plus answer numbers.

Newness: blind 3 of 36 new (8%; round 1 24%, round 2 18%). Most of what round 3 found adds evidence or numbers to
known items; whole new topics are listed under "New topics". Checked by me (PC) where marked [PC checked].

## Incident during the review (closed, no data loss)

The round 3 Mac job reported the live scans.db held only junk. Checked by the Mac (opus) with lsof on the live
server and timestamps: false alarm on the history, true on the pollution. 642 real scans (Sept 14 onward) intact.
Cause of round 1's junk (42,230 events, 1,749 device keys, 15:59 to 16:02 UTC): the session loaded mac/config.env,
which exports SHIN_SCANS as the live file; `load-test.mjs --spawn` overrides only SHIN_DATA_DIR, and the server
prefers SHIN_SCANS (app/server.ts:4712), so the "throwaway" server wrote to live. Copies kept in
~/shin-incident-20261121/. Deploy hold set and released. Targeted deletes proposed, his call.

## What to act on, ranked

1. **The laptop is open to anything running on it** (blocker, Mac checked). One macOS user runs the live server and
   five Claude sessions, two with every permission check off and Chrome control. That user can read config.env
   (Anthropic, RevenueCat, Gemini, Notion keys, admin token, backup password, App Store Connect key) and the data.
   Auto-login is ON and FileVault OFF: power on means full access, no password. Firewall off; SSH and Screen
   Sharing on. Fix: separate user for the server (or move host), FileVault on, auto-login off, firewall on,
   SSH and Screen Sharing off unless used.
2. **Anyone with Jamin's GitHub password can run code on the server** (serious, [PC checked]: `gh api user`
   two_factor_authentication false). A push to main deploys. Aurik pushes too (88 of 319 commits since 11-01).
   Chain reports GitLab 2FA also off and that the Mac checkout is cloned from GitLab (mac/config.env.example:60);
   a GitHub push deployed 26cfc00 within a minute, so which remote the checker follows is unresolved. Fix: 2FA on
   both, for both people.
3. **The outside alarm is no alarm** (serious, [PC checked]: 7 of 7 scheduled runs failed since 2026-11-20 01:45
   UTC; 28 of 28 routes work; it fails on "watch.ok is false and no problems are listed", since public health no
   longer lists them). GitHub also runs it every 6 to 9 hours, not every 30 minutes. A real outage looks the same.
   Fix: alarm only on the routes; send watch problems separately; a real uptime monitor.
4. **Nobody comes back** (money, Mac checked on the last clean backup, real phones, 30 days): 17 phones, 100 scans.
   0 of 17 used Pexi on a second day. Barcode rows: 61% shop price (41 scans). CORRECTED after the fix lane: the
   "typed 0% shop price" reading was a logging artifact, not a failure. A typed search that the shopper picks from
   is logged as a barcode scan (camera.js:6405 typed pick, then resolveBarcode); a text row is written only when
   nothing matched or the shopper chose "none of these" (camera.js:6440). So the 59 text rows are the misses (22 are
   the "zzqxwv" probe in scripts/e2e-phone-live.mjs:68), and typed success is hidden inside the barcode figure.
   Regression test app/test/typed-range-source.test.ts. A typed pick's feedback may attach to a stale scan id
   (camera.js:2876, not fixed, Aurik's file).
   Median answer 283 ms, p95 4.0 s. Top miss: barcode 0064100111998, 10 times. Value job: no answer-rate target
   exists anywhere; a free shopper gets about 2 to 3 priced verdicts in 10 free scans; Plus sells only a bigger
   count, which rests Apple 3.1.2 "ongoing value" on the answer rate; subtitle "Know if it's a deal" meets 2.3.7.
5. **No copy outside the house** (serious, Mac checked): off-site backup is built but its repository setting is
   empty. Nightly copy sits on the same laptop.
6. **Test tools can write to live** (serious, the incident above). Fix: --spawn overrides every SHIN_* path.
7. **Cloudflare and home internet terms** (serious, sourced): CDN terms say video and "other large files" need a
   paid product (6.8 MB pack per install); free plan worded for hobby use, ends at their discretion. Jamin's
   provider is not recorded; Rogers' terms forbid servers and commercial use. Both go away with a rented host and a
   separate file store for the pack.
8. **Never rehearsed** (serious): 0 of 12 drills run (restore, key rotation, reboot, bad deploy, alarm, breach).

## New topics (not on any list before)

- No plan for getting to 10,000 users (blind).
- No business insurance considered (outside, IBC source).
- Allergen lines shown from contributor data; terms disclaim prices only (outside).
- Every deploy hard-kills the server; in-flight scans fail (outside).
- No dependency-check routine; phone build tool 1 high, 6 moderate advisories (outside).
- Support address is a personal Gmail with the old name, built into the app and user agents (chain).
- One Cloudflare account is registrar, DNS, tunnel and email; auto-renew unread (chain).
- No bills list: seven vendors, no card, owner email or renewal recorded (chain).
- Apple pays 45 to 75 days after a sale to an unnamed bank account (chain).
- Moving host changes three privacy-policy sentences; off-site backup keeps 6 months against "about 15 days" (host).
- Gap 93's port list misses catalogue and pack copy, secrets, off-site backup, logs, alert path, cutover (host).
- Replacement hosts priced at CAD 6 to 34 a month for 4 GB; one in Quebec; none confirmed on an order page (host).
- macOS 4 updates pending, last install 2026-10-16 (Mac).

## Not checked

Apple account state, Aurik's 2FA, Anthropic and RevenueCat billing, domain auto-renew, the bank account, Telus
terms, Chrome profile sign-ins on the Mac (blocked by macOS privacy), Tailscale device list, live pack caching.
