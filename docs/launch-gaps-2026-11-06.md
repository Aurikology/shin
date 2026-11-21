# Pexi 1.0: everything left before launch (2026-11-06, updated 2026-11-07)

Audit run 2026-11-06/07 by a PC Claude session for Jamin. Each item says how it is known:
**checked** (seen directly), **reported** (the Mac's or Aurik's own report), or **from notes**
(DEFECTS, QUEUE or the 11-05 notes, not re-checked). Each item has one owner, per RULINGS "Who
owns what": **[Aurik]** the app the shopper sees (paywall, screens, frontend, native app, anything
checked by eye on a phone); **[Jamin]** the backend (server, data, the Mac, accounts and the
store listing, legal pages, building and uploading, submitting). Jamin's items are worked by his
Claude sessions. Aurik: claim an item in `comms/claims/` before starting it.

What was NOT covered is listed at the end. This list is not complete until those passes run.

## By owner, in the order they unblock each other

**Jamin:** 1 deploy (key, pull, restart, probe) → 0a power → 5 build 4 and upload → 14 Quebec
answers → 13 publish pages → 16 to 20, 23 App Store Connect → 3 backups → 11, 10, 15 data fixes →
2 limits (after Aurik's 7) → submit.
**Aurik:** after Jamin's 5: 6 blank-app check → 8 today's 13 fixes on a phone → 7 sandbox purchase
and restore → 4 crash reports → 12 screenshots (21 included) → 9 torch.

---

## A. Blocks submitting to Apple

0. **[Jamin] DONE AND LIVE 2026-11-07 03:59Z: the packaged phone app had never completed one
   server call.** Checked from the PC against live d556366: the probe gives 28 of 28 as
   `capacitor://localhost`, 0 of 28 as a foreign site. Still to see: a real scan on build 4.
   History: Confirmed 11-07 from the server's request log (Mac) and from the PC with the phone's
   own preflight: since the wrapper first appeared on 2026-10-28 it made 78,169 requests, 78,168
   of them preflights and 1 GET, zero POSTs. Three refusals, each enough on its own: no preflight
   was answered, the scan routes' origin rule refused `capacitor://localhost`, and no response
   carried Access-Control-Allow-Origin. Every test passed because tests run same-origin.
   **Fixed in 9a1a9c1** (the Mac's session, 2026-11-06 22:50 EST). **Checked on the PC 11-07** on a
   local server from that commit: `scripts/phone-contract-probe.mjs` gives 28 of 28 routes as
   `capacitor://localhost` and as `https://localhost` (the next native build's origin), 0 of 28 as
   a foreign site (`https://evil.example`), and the full app suite passes (2,064 pass, 0 fail, 5
   skipped for a pack file not built on the PC). Live server before the fix: 0 of 28 as the phone,
   28 of 28 as the browser. **Done means:** the probe shows 28 of 28 against the live server, then
   a real scan on build 4 (Aurik's 8).
0a. **[Jamin] The production server is a laptop on battery with its screen locked.** The Mac's
   heartbeat 11-07 03:30Z: unplugged, battery 75%, screen locked. When the battery dies the app is
   down for everyone. **DONE 2026-11-07: plugged in.** Mac 18:37Z: "Now drawing from AC Power",
   battery 96% charging (reported by the Mac).

### Server (Mac)
1. **[Jamin] Deployed 2026-11-07 03:59Z (d556366): the six security fixes are live.** Checked from
   the PC: the long security header is on live responses, and `x-shin-plus: 1` is not believed
   (`/api/quota` says `plus:false` with and without it). **`REVENUECAT_SECRET_KEY` set by Jamin
   2026-11-07, server restarted 04:20Z:** the missing-key warning is gone from the new startup log
   and a call to RevenueCat with the key returned 201 (authenticated; it created one empty
   subscriber record for a tester device id). Reported by the Mac; PC check after the restart:
   probe 28 of 28, a made-up device answers `plus:false`. Aurik's 7 can run.
1b. **SETTLED 2026-11-07: photo scanning does not ship and Pexi uses Gemini for nothing** (Jamin,
   RULINGS). The app already has the photo button off (`FLAGS.photoId` false, checked), and the
   privacy policy and listing already say no image is uploaded, so nothing for Aurik to hide.
   QUEUE 7.7 (the paid Gemini key) is dead. Left, **[Jamin]**: (a) check whether any live data came
   from Gemini (the 2026-10-02 offline ranges for empty categories, cached Gemini answers, Gemini
   reviews) and decide whether it goes; (b) remove the Gemini code, so no setting can turn it back
   on; (c) say what reviews show now that Gemini reviews are gone. **(c) ruled 2026-11-07: 1.0
   launches without reviews; (a) the stored Gemini offers and reviews are backed up then deleted**
   (RULINGS; Mac job pexi-gemini-cleanup, mail 20261107173216-pc-2bf867). **(a) DONE:** backed up,
   then 0 rows left (Mac 20:43Z). **(b) DONE, live 23:29Z (e217bf7):** Gemini providers, server
   call paths and settings removed; app/public untouched. PC after deploy: probe 28/28, barcode
   and search answer from the catalogue.
   For (a), from the code (not the data): `user_offer` (1,967 rows) and `user_review` (653) default
   to `source='gemini_scan'`, `trusted=0`, and the only writer found is the Gemini scan path
   (`app/server.ts` about line 1348), which says they are never read to answer a scan. So item 3's
   "1,967 shopper prices" is wrong: they are most likely prices Gemini found, not prices shoppers
   typed. A count by `source` on the Mac would settle it. **Settled 18:39Z (Mac, live DB):**
   user_offer 1,967 and user_review 653, every row `gemini_scan`, `trusted=0`; no other source.
   Why it took so long: the deploy gate refused five pushes in a row (3d83de2 through 9a1a9c1),
   live froze on 741c3c8 from Nov 6 02:40Z to Nov 7 03:58Z while the deploy page said "App: ready
   to test", and the reason it gave was "no test names found". Cause and fix in d556366 (the app
   suite's real-data guard was tripped by a sibling suite running at the same time).
1a. **[Jamin] Six of nine backup tests fail** (`mac/deploy/test/backup.test.mjs`), on d556366 and
   its parent alike. Reported by the Mac 11-07, not looked at. Read before item 3.
2. **[Jamin] Weekly limits not set** (`SHIN_FREE_SCANS_PER_WEEK=10`, `SHIN_PLUS_SCANS_PER_WEEK=100`).
   Reported. Set only after Aurik's sandbox purchase (7) works (RULINGS).
3. **[Jamin] DONE 2026-11-07 04:44Z, reported by the Mac (job pexi-backups): all 7 real databases
   are in the nightly backup and a restore is proven.** people, user-catalogue and catalogue were
   added (sqlite3 .backup, so the WAL is included); the small ones keep 14 nights, the 4 GB catalogue
   keeps 3, with a free-space check and a skip when unchanged (it had not changed since Oct 9). Run
   by hand and through launchd, exit 0. Restore: every copy quick_check ok, foreign keys 0, row
   counts equal live (product 5,182,591, user_offer 1,967, user_review 653, device_person 53). Disk
   38 GiB free, worst case about 29 GiB at 3 catalogue copies. Committed in the Mac's ~/bin
   (2101487), not in this repo. Not checked from the PC (no access to the Mac).
   Reclaimable on his word only: a stale 4.14 GB `catalogue.db.before-category-canon` from Oct 9.
3c. **[Jamin] `mac/07-backup.sh` in this repo cannot run on the Mac** (the 6 failing tests of
   1a): macOS `/bin/sh` is bash 3.2, which cannot parse its heredoc inside `$( )` at line 126.
   Nothing scheduled uses it (the nightly job is `~/bin/shin-backup.sh`), so fix it or delete it as
   a dead duplicate. Not a launch blocker. **Fixed 2026-11-07 (6372edb):** the embedded script is
   read with a while loop instead. PC suite 9/9 before and after (bash 5 never failed), so the
   proof is the Mac's run, asked in job pexi-backend-small.
   Old text of item 3: **Backups cover 4 of 8 databases.** Reported 11-07 (corrects the QUEUE 7.12 note that
   nothing was backed up): 14 nightly copies, latest Nov 6, of scans, prices, corrections and gaps
   only. The catalogue (4.1 GB), people, and user-catalogue (1,967 shopper prices, 653 reviews,
   behind an unmerged 1 MB WAL) are in no backup. No restore has ever been tested. The Mac session
   will do it (about 20 minutes) on Jamin's own go in that session, not a peer's.
3b. **[Jamin] All 8 databases pass quick_check and foreign_key_check; no database errors in 7 days
   of logs.** Reported 11-07. One configured database (repeat cache) was never created.

### App and build
4. **[Aurik] TestFlight crashes (D-250). CLOSED 2026-11-17, Aurik: "the app does not crash".** From notes (NOW.md): never
   reproduced, and Apple holds no crash log (TestFlight crash feedback is empty), so the answer is
   on Aurik's phone. He reported on build 2; build 3 (18cb7b1) carries the D-249 fix and has not
   been reported on. May be item 0. Check on build 4.
5. **[Jamin] Build 4 does not exist.** Checked (App Store Connect has builds 2 and 3) and reported
   (no archive on the Mac). Archive and upload from d556366 or later. **Needs Jamin in person:**
   the upload signs in with his Apple ID, which no Claude session enters (the Mac's rule).
   **Jamin 2026-11-07 ~17:25Z: signed in ("done").** The Mac is asked to build and upload build 4
   from main, check no secret key is in the bundle, and not attach or submit it (mail
   20261107172607-pc-e62f4d, job pexi-build4).
6. **[Aurik] First install must be checked for a blank app** (the new in-app security policy tag,
   only run in desktop browsers). Aurik's report.
7. **[Aurik] Paywall never run against real RevenueCat.** Code built, tests pass (checked). One
   sandbox purchase and one restore on build 4.
8. **[Aurik] Today's 13 fixes never seen on a phone. 2026-11-17, Aurik: "the phone screen looks good" (screens seen; paywall purchase, item 7, still not run):** the first screen (18+ and Claude consent),
   "Pexi's estimate", the You screen switch, and a real scan, search and paywall. Also the three
   vibrations (lib/haptics.js: barcode captured, a confident verdict, saved), never felt on a
   phone; the verdict one cannot have fired, since no verdict ever reached a phone (item 0).
9. **[Aurik] Torch may never light on phones (D-237, major, open).** From notes. Needs a native
   camera path. **2026-11-10, build 6: it lights** (reported by Aurik); it flashed on and off in
   auto mode (D-251), fixed in ecc9622 (auto never puts out its own torch; default off). Left: on
   build 7, the button turns it on and off.
9b. **[Aurik] Barcode button looked dead on build 6 (D-252).** Fixed in f9f5dd2 (a press keeps
   looking for 2.5 s with a turning ring); seen working in Chromium with a fake camera. Check on
   build 7. Build 7 asked of the Mac from f9f5dd2 or later (comms 2026-11-11).
9c. **ANSWERED 2026-11-16: no 18+ checkbox.** Jamin: *"this app is for all ages"* (RULINGS, "Pexi
   is for all ages"). Was: Aurik asks for the 18+ checkbox back (2026-11-10), asked in comms
   2026-11-11-aurik-to-jamin-bring-back-18-plus. The checks that all ages calls for are in
   `docs/security-legal-check-plan-2026-11-16.md`, section L2.
10. **CLOSED, stale entry (checked 2026-11-07):** DEFECTS shows D-036 "Closed 2026-09-13, with the
    founder's rule" (leaf category first, parent only if the leaf is empty, never the grandparent);
    the "open, gates showing" words below are its original state, quoted. Left from it: D-097
    (English line under a French badge). Old text:
    **[Jamin] "Cheaper option" can offer a different kind of product (D-036, open, "gates showing
    this feature to anybody").** From notes. The server's pick is the fault. Unknown whether build
    4 shows the feature; if it does and the fix is not in, Aurik hides it.
11. **CLOSED (checked 2026-11-07):** live `/api/identify?gtin=0068100084245&preview=1` answers
    Kraft Smooth Peanut Butter 1kg from the catalogue; the PC's "Kraft Dinner" row was a leaked test
    fixture deleted in October (now-history 2026-10-13), and the Mac's repeat cache was never
    created (item 3b). Old text:
    **[Jamin] Known wrong cached answer for barcode 0068100084245 still in both caches** (QUEUE
    7.19). From notes.
12. **[Aurik] Screenshots: 0 uploaded on every size.** Checked. iPhone 6.9" and iPad 13" (iPad
    simulator renders the app, reported; iPhone simulator has no Pexi installed), plus one Plus
    screen shot for each subscription's review (21).
    **iPhone DONE 2026-11-09 (Jamin's PC, taken over on his "do this"):** 5 shots captured from
    the live app (scan screen, Cheerios answer, butter answer with its shop list, search, You) by
    `scripts/appstore-screenshots.cjs`, files in `docs/store/screenshots/` (62f786a). Uploaded by a
    browser worker to the required iPhone 6.1"/6.3" slot (1206x2622, 5 of 10) and the optional
    6.9" slot (1260x2736, 5 of 10); both still there after a reload, no error text (reported by the
    worker). The 01 tile showed a cloud placeholder, not a thumbnail: look once it has processed.
    Answers were taken with Skip, never a typed price, so no made-up price entered the live data;
    the scans themselves (about 10, no price) are on devices named `probe-appstore-shots-*`.
    **iPad 13" HELD, Jamin's call:** the app draws a 420x880 framed phone on black on any screen
    520 or more wide (app/public/css/shell.css, the `min-width: 520px` block), so every iPad sees
    that on build 5, and the screenshots show it (`docs/store/screenshots/ipad-13-held/`). Apple
    asks for iPad screenshots while the build supports iPad (`TARGETED_DEVICE_FAMILY = "1,2"`).
    Options: an iPhone-only build 6 (family 1; iPads then run the iPhone app and no iPad shots are
    asked), or Aurik lays the app out for iPad. **Ruled 2026-11-09: iPhone only** (RULINGS). Build
    6 set in 1842c55 (family 1, build number 6, checks seen red first); the Mac is asked to build
    and upload it, not attach or submit (mail 20261110040526-pc-a20c36, job pexi-build6). Attach
    build 6, not 5, to 1.0 (item 20).

### Store pages and legal
13. **[Jamin] Hosted privacy and terms are old versions; French pages 404.** Checked. The app
    links to all four. Publish `docs/store/` to the pages repo. **Published 2026-11-07 on Jamin's
    yes** (xu826Jamin/pexi 40ffd78: index, privacy, terms, privacy-fr, terms-fr from docs/store).
    The lawyer's read (24) still comes before public release. Open: terms say 18+ while the store
    rating is now all ages (item 18); Jamin to say whether the terms' 18+ stays.
14. **[Jamin] Three Quebec answers** (`docs/store/quebec-transfer-note.md`): where the Mac is,
    whether the Anthropic, Cloudflare and RevenueCat contracts suffice, how long Mac backups and
    logs keep data. Must go in before 13. **First answered 2026-11-07:** the Mac is in Ontario
    (Vaughan or Hamilton), so "outside Quebec" is true and the data stays in Canada. Third partly
    answered from the backup job (14 nights, catalogue 3). Left: the contracts (a lawyer's
    question, item 24) and how long the server's log keeps data.
15. **Asked of the Mac 2026-11-07 (job pexi-backend-small), after build 4:** read embed-all.ts
    first and run it only if it deletes Icecat vectors and embeds nothing.
    **[Jamin] Icecat vectors still on disk** in the real catalogue (search already ignores them).
    Run `node src/embed-all.ts` in `catalogue/` on the Mac, which holds the real catalogue
    (reported). Aurik's report.

### App Store Connect (checked 11-07, read only)
16. **[Jamin]** Description and review notes say **"unlimited scans"**; subscriptions say 100 a
    week. Fix both.
17. **[Jamin]** Availability is **148 countries**; ruling is Canada only.
18. **[Jamin]** Age rating **12+**. **Ruled 2026-11-07: all ages** ("don't say 18+, it should be
    good for all ages", RULINGS). Items 16-19 and 23 handed to a browser worker the same day;
    result to be recorded here.
19. **[Jamin]** **Content Rights** not answered.
20. **[Jamin]** **No build attached** to 1.0.
21. **[Aurik] screenshot, [Jamin] attach.** Both subscriptions have **no review screenshot**;
    attachment to 1.0 not seen.
    **DONE 2026-11-09:** `docs/store/screenshots/iphone-6.3/06-paywall.png` uploaded as the review
    screenshot of both subscriptions, present after a reload (reported by the browser worker). It is
    the app's own paywall code fed the plans exactly as App Store Connect lists them (Pexi Plus
    Yearly CA$29.99, Pexi Plus Monthly CA$3.99), since a browser has no store; a real build 5 paywall
    is still Aurik's item 7. Adding the subscriptions to the 1.0 version happens at submission.
22. **[Jamin]** **"Part XX Canada compliance: Missing Info"** on the business page. Whether it
    blocks anything is unknown; likely Apple's seller details under Canada's platform reporting
    rules. Paid Apps agreement, both tax forms and the bank are Active (checked).
23. **[Jamin]** **Reviewer access:** no barcodes or test steps given to Apple for a scanner app,
    and the reviewer is likely outside Canada with non-Canadian products. Notes text not checked
    in full.

---

## B. Blocks public release (after Apple approves, release is manual)

24. **[Jamin]** Lawyer reads the privacy policy, terms, French pages and Quebec note (French is
    Aurik's translation).
25. **[Jamin]** Lawyer list, not yet reviewed by anyone: Quebec consumer rules for online
    subscriptions, "Pexi" trademark clearance (only domains were checked 10-01), a wrong-price
    disclaimer, Anthropic commercial terms, Jamin's business registration and tax.
26. **DROPPED 2026-11-07:** photo scanning does not ship (RULINGS), so D-099 cannot reach a
    shopper. Old text: **[Jamin]** **Photo scan drops flavour (D-099, open)**, never tested on a
    real photo. From notes.
27. **BUILT 2026-11-07 (643803d):** `.github/workflows/server-alarm.yml` on the GitHub copy runs the
    phone probe against the live server at :07 and :37 every hour, retries once after 90 s, and a
    failed run emails Jamin (GitHub's failed-run email). Off the Mac on purpose. Seen to pass as
    the app and to fail as a refused origin (runs 42423608828, 42423616441). Old text:
    **[Jamin]** **Outage plan:** the server is one Mac behind a tunnel. Nothing alerts anyone when
    it is down, and paying users get nothing while it is. The probe can run on a schedule as one
    alarm.
28. **BUILT 2026-11-07 (e28a947, pages e33102d):** the support page now says how to cancel and
    restore Pexi Plus and that refunds go through Apple (reportaproblem.apple.com), plus the
    existing contact email. Old text: **[Jamin]** **Support and refunds:** no stated support
    contact process or refund handling found.

---

## C. Jamin's calls

29. **Does "public launch only on the cheaper lookup" (QUEUE 7.21) still stand?** The 11-05
    ruling replaced its scan counts (3 free) but says nothing about the lookup itself.
30. **DECIDED 2026-11-14: skipped; submit on build 7's phone check and the accuracy gate** (docs/decisions.md, "Four launch calls"). Old text: **Skip the two-week tester beta?** QUEUE 7.17 and 7.18 planned 10 to 20 testers for two
    weeks, measured on four numbers, before launch. Never run, and could not have run: the phone
    app never reached the server (item 0). The MVP "done means" check on a phone over cellular
    (7.16) also never ran.
31. **French first screen for Quebec?** The app is pinned to English. If yes, the build is Aurik's.
32. **Old abandoned text already stored:** delete now or let it age out at 12 months.
33. **DECIDED 2026-11-14: iPhone and Canada only; Google Play starts the week Apple approves 1.0** (same entry). Old text: **iPhone only at launch?** Google Play account, subscriptions and build are all unstarted
    (QUEUE 7.3, 7.5).

---

## D. DEFECTS triage, 2026-11-08 (state column read; backend rows re-checked once after Hammer)

DEFECTS.md has 250 rows; 32 have a state column starting Open, Half or Partly. Owners by the
"Who owns what" line. Not re-tested one by one: Hammer (item 34) changes most price answers, so the
backend verdict rows are tested once after it is live, not twice.

- **[Jamin] Backend, the one pass after Hammer went live (2026-11-08):**
  - D-241 (a typed name dead-ends): holds on the live server. "kraft dinner original 225g" answers
    the broad guess $2.78 to $36.02 with the catalogue reported up (checked 19:58Z). Not tried on a
    phone.
  - D-176 closed 2026-10-10, D-177 fixed 2026-10-07 as decided, D-081 fixed 2026-09-10 with a second
    field: the rows say so; nothing to re-test on the server.
  - D-121 (alternatives never return a row): the alternatives route is no longer on the server
    (parked by product decision), so there is nothing live to test. Hammer prices now carry
    barcodes, so a revived route would have rows to read; unmeasured.
  - D-022 and D-059 (one typed price moves a verdict): the outlier hold is fixed; the open half is
    binding a witness to an identity the phone does not choose (a server-issued token or similar).
    That is an architecture call for Jamin, not a test. Testing it live would mean writing fake
    typed prices into the live data, so it was not done.
  - **Share still reaching Claude (Mac replay 2026-11-08 19:58Z, price/src/claude-share.ts, real
    devices only):** 41 distinct barcodes, 113 scans. 7 barcodes (17.1%), 19 scans (16.8%) would ask
    Claude, the same with and without the Statistics Canada rung: none of the 41 is a staple it
    covers. Bases: own prices 23, no verdict 15 (14 not in the catalogue), department prior 2,
    category prior 1. The live share is at most this, since the ask also needs the shopper's yes.
- **[Jamin] Closable now, with evidence:** D-141 (Plus from the browser console): the server no
  longer believes the phone's Plus header, live `/api/quota` answers `plus:false` with it set
  (checked 2026-11-07). D-222 (test rows in the PC's user catalogue): PC only, and the live
  user_offer/user_review rows were deleted 2026-11-07. D-099: photo scanning does not ship.
- **[Jamin] Process and documents, not launch blockers:** D-001, D-030, D-054, D-085, D-089, D-098,
  D-106, D-111, D-031 (old privacy wording on the profile screen; check against the published policy
  during Aurik's pass).
- **[Aurik] Screens, on build 4:** D-011, D-013, D-015, D-016, D-024, D-050, D-092, D-116, D-133,
  D-151, D-154, D-172, D-206, D-207, D-217, D-218, D-219, D-225, D-226, D-227, D-237 (torch, item 9),
  D-250 (crashes, item 4).
  **Re-read 2026-11-11:** all but D-151, D-237 and D-250 already say Closed or fixed in their state
  column (the triage matched on the first word, "Open", of a column that ends in "Closed"). Open for
  Aurik: D-151 (medium confidence), D-237 (item 9), D-250 (item 4). D-254 (text size) fixed
  624ac89 2026-11-11, in builds since 7; only the phone pass at the largest sizes is left.

34. **[Jamin] Project Hammer prices and names (2026-11-07/08):** importer built (f400ac3, 2ad8994),
    weekly refresh script (89e018d), credits entry live. PC trial: 98,918 prices on 47,404 barcodes;
    48,185 catalogue rows. Live load is Mac job pexi-hammer-prices.
    **LIVE (checked 2026-11-08 19:25Z from the PC):** the Mac started the load at 18:21Z on 02aed27
    (cents fix in; the live database had 0 Hammer rows before) and never marked the job done, but
    live answers now carry Hammer store prices seen 2026-11-07 (tuna 0062639298517 at Save-On-Foods,
    butter 0055742357615 at Sobeys, a Galleria noodle bowl).
    **Confirmed by the Mac 2026-11-08 19:58Z (read-only, job pexi-claude-share):** 98,948 Hammer
    prices on 47,404 barcodes in the live prices database; names loaded (e.g. 0628451714552 "GoodLeaf
    Hero Greens Magic Micro Broccoli 50 g", $3.99). **Open: the weekly refresh is NOT scheduled.**
    mac/hammer-refresh.sh exists, but no launchd entry or crontab runs it (installed: backup,
    checker, server, tunnel only). Without it the Hammer prices age from 2026-11-07.
    **Bug found and fixed 2026-11-08:** from July 2026 about 4 in 10 Walmart prices in Project Hammer
    are written in cents with no decimal point ("2196" for $21.96); the importer read them as dollars,
    100 times too high. Now read as cents (price/src/hammer.ts `hammerCents`, test seen to fail
    without it). The live load must run on this commit or later.
35. **[Jamin] Statistics Canada average prices: WIRED IN 2026-11-08** ("wire in statistics canada").
    A rung after Pexi's own data and before the Claude ask: the province's average for the staple,
    times a shelf factor, scaled to the item's size. Measured on Project Hammer's regular Toronto
    prices: shelf prices sit 1.49 times the average overall (StatCan averages what people paid, sales
    included); 1.45 without the two Asian grocers, 1.20 at No Frills and Walmart, 1.56 at the
    full-price chains; spread 0.37 (76% of real prices inside the drawn range). 100 of 110 products
    were seen in Hammer; the other 10 use the overall factor. Fresh food matches only when named
    plainly; packaged food must agree with its category. Committed table price/statcan-averages.json;
    monthly refresh `node price/src/statcan.ts build <csv>` keeps the factors.
    **Off for every build until Aurik's build sends `knows=national_average`** (build 3 refuses a
    basis it cannot word). Aurik asked via comms/messages 2026-11-08.
    **Live check 2026-11-08 18:30Z (with knows):** 18 staples scanned, 3 answered from StatCan, 0
    Claude calls; but 18 large eggs centred at $10.66 against about $7 on the shelf (premium eggs in
    the pool), and 15 had no size so never reached the rung. Jamin: "both" to the two fixes:
    - **Standard and premium factors apart** (organic, free-run, omega, nest-laid, albacore and the
      like): eggs standard 1.02 (a dozen centres at $5.10, 18 at about $7.65), premium 1.54. Pull
      toward the overall factor picked on held-out data: 2 (median error 0.236; 0.245 at the old 20,
      0.280 with one factor for all). Spread 0.33. Flavoured and Korean ready-to-eat tuna excluded.
    - **No size: the product's size is assumed**, only for a plainly named fresh item or a packaged
      item whose category agrees, and only when one product matches (no guess between milk sizes);
      spread 0.42, measured over every pack size of the same product. Marked "size assumed".

---

## E. Launch review, 2026-11-21 (Jamin's PC)

**Fix pass status, 2026-11-21 evening** (Jamin: "fix all things you can fix", "do all the recommended"):
- **Fixed and pushed:** 36, 37 (pages published to GitHub Pages 03a665b, 9746071; Terms dated 2026-11-21), 38, 45, 46,
  48, 49, 50 (scripts/funnel-report.mjs), 53 (scripts; Mac re-run pending), 55 (Cloudflare HIT seen), 56, 57, 58
  (dead-man job installed in code; needs SHIN_DEADMAN_URL from Jamin's sign-up), 65, 66, 68, 69 (Haiku 5.5, cap
  10,000; live call pending on the Mac), 71, 73, 74, 84, 85, 86, 87, 90, 91; the Coca-Cola six-pack case (47).
  Commits a031ae6, 8c5ad14, f252d8e, fae83f9, eb29318, c12ddf8, a156678, f1a3fd0, 856789e.
- **Partly:** 43 and 44 (listing text and captions written in docs/store/listing.md; paste into App Store Connect and
  recapture screenshots), 54 and 67 (worker threads measured on the Mac 2026-11-21: no gain, more memory, a V8 crash under Node 26.7;
  removed 51fc57b. The Mac had about 105 MB free with other jobs running and broke at 16 continuous users: the fix is
  a server of its own, or no other heavy jobs on that Mac), 61 (French
  links fixed; French listing not in App Store Connect), 72 (one confidence step outside Ontario; no provincial
  scaling), 80 (listing fixed; App Store Connect text unseen), 81 (procedures described; app French still off),
  82 (switch built, ON by default: Law 25 default question put to Jamin), 83 (state read in health; decision Jamin's),
  89 (report fixed da7d2e8 and checked on live data: 19 phones = 19; target to set after launch. The round 1 Mac load
  test wrote 42,230 'load_test' events from 1,268 random ids into the live scans.db, 2026-11-21 15:59 to 16:01 UTC;
  the report leaves them out; deleting them is Jamin's call), 92 (manifest fixed; accessibility answers in App Store Connect).
- **Jamin only:** 39, 41, 42, 51, 52, 59, 60, 62, 63, 64, 76, 77, 78, 79, 88; App Store Connect for 16 to 23.
- **Phone or Aurik:** 40 (phone checklist). **Not started:** 75 (price-match cashier line, a feature).

Evidence per item: `docs/readiness/review-2026-11-21/` (REPORT.md, and the job's .jsonl named in brackets).
Items 16, 17, 19 to 23 above are still unconfirmed: App Store Connect was not visible (Chrome not signed in).

**Blocks submission or the first sale**
36. **[Jamin]** Privacy policy lacks the 5.1.1 sentence that named outside services protect data equally (apple-rules).
37. **[Jamin]** Public Privacy Policy and Terms are the 11-06 versions; the 11-18 Terms s.11 to 13 (Quebec) and the
    device id and reinstall fixes are in the repo only. Live policy contradicts the code. Publishing is Jamin's call (apple-rules).
38. **[Aurik]** "Pexi is in early access" banner: guideline 2.2 puts betas on TestFlight (blind).
39. **[Jamin]** Apple server notifications never reached RevenueCat (R84); RevenueCat has no App Store Connect API key,
    so it cannot confirm the two products exist (money).
40. **[Aurik]** No purchase has completed end to end while the free limit is on: `phone-checklist.md` steps 6 to 9 (blind).
41. **[Jamin]** Paid Apps agreement, banking, tax, GST/HST number and Form GST506 to Apple (legal review q24): unseen.
42. **[Jamin]** Small Business Program enrolment unrecorded (15% versus 30%) (blind, money).

**Loses money**
43. **[Aurik]** Store screenshots: empty camera first, no captions, no verdict shown; taken 11-09, 34 screen changes since (business, apple-rules).
44. **[Jamin]** App Store name is "Pexi" alone; add search words, e.g. "Pexi: Grocery Price Checker" (business).
45. **[Aurik]** Paywall sells a count and says "Typing a name is always free" (typed searches free is a ruling,
    RULINGS.md:472; saying it on the paywall is not); limit invisible until it refuses a scan (business).
46. **[Aurik]** No-choice "Your data" screen between install and camera; no ruling requires it (business).
47. **[Jamin]** Coverage: 98 of 191 popular Canadian barcodes priced (51%, optimistic); real tester scans 14 days:
    17.4% shop price and verdict (functions, Mac). Coca-Cola 710 ml shows a 6-pack price.
48. **[Jamin]** Free-limit bypass: new device id = new week, about 150 a day per IPv4 address, unlimited over IPv6 (abuse).
49. **[Jamin]** About 130 requests a minute of made-up phones stops new Plus buyers being recognised (abuse).
50. **[Jamin]** Funnel (install, first answer, paywall, purchase, day 7) computable from existing data, nothing computes it (business, R24).
51. **[Jamin] CONFLICT to decide:** the business job suggests a free trial; legal review q14 says do not switch one on
    (Quebec 2026 free-period notice rules).

**Scale and reliability**
52. **[Jamin]** Mac was on battery (80%) during the review; it ran flat 11-18.
53. **[Jamin]** Nightly backup fails on the retired repeat cache; `07-restore.sh` does not parse under macOS sh;
    no off-site copy (SHIN_RESTIC_REPOSITORY blank) (Mac).
54. **[Jamin]** Load: breaks at 512 continuous users, typed search is synchronous SQLite on one thread (under 2 of 8
    cores). Barcode route missing from the load-test mix (Mac).
55. **[Jamin]** Product pack 44 MB uncompressed, Cloudflare does not cache it, no route limit (blind).
56. **[Jamin]** Claude cap 1,000 a month drainable by one person over IPv6; events route can fill the disk in about two hours (abuse).
57. **[Jamin]** Shoppers on one store Wi-Fi share one address limit (assumed, blind).
58. **[Jamin]** Dead-man ping has no Mac job running it (R02, R03); RELEASE-CHECKLIST.md is cited but missing (R29, R37) (register).

**Legal (from the 11-17 legal review's ranked actions, re-checked 11-21)**
59. **[Jamin]** Transfer assessments for outside services (q3): no document found.
60. **[Jamin]** Verdict-method note with its measured hit rate (q10): none found.
61. **[Jamin]** French store listing (q16): none recorded. English Terms show on the French subscribe screen (blind).
62. **[Jamin]** Support email still carries the Shin name, now also on the Plus screen (apple-rules, q10 of the actions list).
63. **[Jamin]** Ontario business name registration (q19) and the PEXI trademark filing (q18): not recorded.
64. **[Jamin]** Re-answer Apple's age rating descriptors before 2027-01-12 (q9); tobacco products also get verdicts (apple-rules).

**Smaller**
65. **[Aurik]** Landscape allowed but not laid out; dormant developer section ships (2.5.19); camera permission
    text mentions photographs; usage tracking has no off switch (apple-rules).
66. **[Jamin]** Privacy manifest misses the file-timestamp reason (apple-rules).

## F. Launch review round 2, 2026-11-21 (Jamin's PC)

Evidence: `docs/readiness/review-2026-11-21/round2/` (job named in brackets). Only items new to A to E and the
register, or adding something to them. The blind pre-mortem's 33 findings: 6 new to every list (18%; round 1's
blind reviewer: about 5 of 21, 24%), none a blocker.

**Scale and cost**
67. **[Jamin]** With barcode lookups in the mix the server breaks at 256 continuous users (round 1: 512, search
    only); same cause, synchronous SQLite on one thread (Mac).
68. **[Jamin]** Open Food Facts called up to about 100 a minute; its published limit is 15 a minute per address,
    with an address ban. Overpass "regular use" passed near 1,300 users; its user-agent still says "shin-beta (six testers)" (cost, ops).
69. **[Jamin]** Claude cap runs out at about 200 to 1,000 weekly users; Haiku 5.5 is a tenth of the hard-coded
    Haiku 4.5 price; the real ask and consent rates were never measured (cost).
70. **[Jamin]** RevenueCat is free under US$2.5K a month tracked revenue, then 1% of all of it, card on file (cost).
71. **[Jamin]** One pack rebuild pushes about 340 GB through the home upload at 50,000 users; a Cloudflare cache rule fixes it (cost).

**Answers**
72. **[Jamin]** Store prices are one Toronto neighbourhood (Project Hammer); the listing says "typical prices in
    Canada" (premortem). Ages: Hammer 1 to 4 weeks; BC liquor about 2 months; Open Prices a one-time August import
    with no job; shopper-entered prices: 0 rows (Mac).
73. **[Jamin]** Verdicts on guessed or sizeless items can overclaim: D-270 A6 to A11 never fixed (old-lists).
74. **[Jamin]** Typed search ranking: a bare word tops a flavoured snack, sizes in the query ignored (old-lists, premortem).
75. **[Jamin]** MVP "done means" price-match cashier line never built; `priceMatchAdvice` has no caller (old-lists).

**Legal, tax, people**
76. **[Jamin]** If the app stays in 148 countries, Apple's EU trader rule shows his address or P.O. box, phone and email on EU pages (legal).
77. **[Jamin]** App income is self-employment income: income tax plus both halves of CPP on a T2125; keep six years
    of records; Apple pays within 45 days of each fiscal month to one bank account (legal).
78. **[Jamin]** No written agreement with Aurik on code ownership, the name or money (legal, premortem).
79. **[Jamin]** His own employment papers (AMD, and any earlier contract in force while Pexi was built): check the
    outside-activity and invention clauses. Not opened by any session (legal, premortem).
80. **[Jamin]** "Unlimited scans" in App Store Connect now carries a named cost (restitution orders, private
    applications); the headline verdict claim has no written test; "typical"/"usual" wording spread to the promo
    text and the verdict line (legal; adds to 16, 60).
81. **[Jamin]** Quebec: the privacy procedures must be described on the website (legal). With French off, a
    Quebec shopper sees Pexi entirely in English, Terms included (legal; adds to 31, 61).
82. **[Aurik]** Every tap is recorded with no opt-out (legal; apple-rules round 1 same).

**Running it**
83. **[Jamin]** Home Mac encryption trade-off: on, an unplanned restart waits for a password typed at home; off, a
    stolen Mac exposes shopper records. Current state unchecked (`fdesetup status`). Before May 2027: a cloud
    machine (about CA$10 to 30 a month) or a mains-powered Mac with remote unlock (premortem).
84. **[Jamin]** Crash reports are only a log line: no alert, a 30-a-minute cap hides a wave; 0 stored since today's restart (ops, Mac).
85. **[Aurik]** No Contact or Help row in the app; no reply time stated; every procedure is Jamin plus the Mac (ops).
86. **[Aurik]** No deadline on calls to Pexi's own server: a slow Mac means a spinner (ops).
87. **[Jamin]** Update gate needs a manual APP_VERSION bump and a restart; phased release is only in notes (ops).
88. **[Jamin]** Apple requires the iOS 27 SDK from April 2027; upgrading Xcode on the server Mac means a planned restart (premortem).
89. **[Jamin]** No proof anyone pays: set a two-week paywall-to-subscribe number and a continue or stop call (premortem).
90. **[Jamin]** Deploy gate skips the price tests; four test folders run in no gate (old-lists).

**French and Apple paperwork**
91. **[Aurik]** French strings: tu and vous mixed, three words for "scan", machine-like phrasing, punctuation, legal
    links open English pages (ops; adds to R43).
92. **[Aurik]** Accessibility support not declared for submission; privacy manifest declares fewer data types than
    the store label (premortem).

**Missed by both rounds, found 2026-11-21 evening**
93. **[Jamin]** The host itself. Both rounds took the 8 GB home Mac as given and reviewed around it. Round 1's
    "breaks at 512 users" was one run on a day the Mac had room; nobody recorded free memory. With 5 Claude
    sessions and Spotify open (about 1.9 GB) and Apple's own 2.5 GB, the same Mac broke at 16 users (thread
    measurement, 105 MB free). The cost table listed "Mac power and home internet: not measured, excluded".
    Server code is portable (plain Node, settings for every path, Mac-only checks skip off macOS); everything
    around it is not: every background job is a Mac launchd job, the deploy checker restarts with launchctl,
    install, harden and boot scripts are macOS only, no Linux or container setup, and the two pack files must sit
    inside the code folder. A rented server needs about 4 GB memory and 20 GB disk (catalogue over 4 GB, server
    peaked near 2 GB). Keeping the same web address means no app update. Next: his pick of host, then port the
    jobs and rerun the load test there, recording free memory.

## G. Launch review round 3, 2026-11-21 evening (question the setup)

Detail and evidence: `docs/readiness/review-2026-11-21/round3/REPORT.md` and `round3/*.jsonl`.

94. **[Jamin]** Laptop open to what runs on it: server and five Claude sessions (two with checks off) share one
    user that reads every key in config.env; auto-login on, FileVault off, firewall off, SSH and Screen Sharing on.
95. **[Jamin]** GitHub 2FA off (checked) and GitLab reported off; a push deploys; Aurik pushes too. Which remote the
    Mac checker follows is unresolved (Mac clone from GitLab, a GitHub push deployed 26cfc00).
96. **[Jamin]** Outside alarm red on 7 of 7 runs since 2026-11-20 on watch.ok with no problems listed; runs every
    6 to 9 hours, not 30 minutes. A real outage looks the same.
97. **[Jamin]** 0 of 17 real phones came back on a second day (30 days); typed search 0% shop price; no answer-rate
    target; Plus sells only a count (3.1.2); subtitle against 2.3.7.
98. **[Jamin]** Off-site backup built, repository setting empty: no copy outside the house.
99. **[Jamin]** `load-test.mjs --spawn` overrides only SHIN_DATA_DIR; with config.env loaded it wrote 42,230 events
    and 1,749 device keys into live (incident closed, no loss; targeted deletes await his go).
100. **[Jamin]** Cloudflare CDN large-file clause and hobby wording; home internet provider unrecorded (Rogers
    forbids servers). Both resolved by gap 93's move plus a file store for the pack.
101. **[Jamin]** 0 of 12 drills ever run.
102. **[Jamin]** New topics: no growth plan to 10,000; no insurance; allergen disclaimer; deploy hard-kills the
    server; no dependency routine; personal Gmail support address built into the app; one Cloudflare account for
    everything; no bills list; payout bank account unnamed; privacy sentences that change on a host move; gap 93
    port list incomplete; macOS updates pending.

## Not covered yet (this list grows when these run)

- **Still open after round 2:** the phone checklist, App Store Connect itself, his employment papers, the Mac's
  encryption state.
- **Run 2026-11-21:** Apple's guidelines against the real app (item E), abuse, load, coverage, live end to end.
  Still open: a phone run of `docs/readiness/review-2026-11-21/phone-checklist.md`, and App Store Connect itself.

- **[Jamin and Aurik]** Apple's review guidelines, section by section, against the real app: the
  server and listing halves are Jamin's, the screens and purchase flow halves Aurik's.
- **[Jamin]** The MVP plan's "done means" list, `docs/beta-readiness-audit.md`,
  `docs/beta-gaps-2026-09-19.md` and the rest of RULINGS, read for unbuilt launch items.
- **[Jamin]** The rest of DEFECTS read item by item (only open rows were scanned; D-115 status
  unclear), each assigned to its owner.
- **[Jamin]** Per-scan cost at launch volume and the worst case for one heavy user.
- **[Aurik]** Accessibility (large text, VoiceOver, contrast). **Partly run 2026-11-11** (Chromium,
  iPhone 13 size): every visible control on agree, camera, You and Saved has a name a screen reader
  reads, no image lacks alt, nothing scrolls sideways. Large text: the app ignores the phone's
  setting (D-254, Aurik's call, not a review blocker). VoiceOver itself needs a phone.
- QUEUE is stale in both directions (7.1 and 7.4 show queued, both done), so every QUEUE item
  above needs a check before work starts.
