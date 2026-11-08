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
4. **[Aurik] TestFlight crashes, cause unknown (D-250, major, open).** From notes (NOW.md): never
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
8. **[Aurik] Today's 13 fixes never seen on a phone:** the first screen (18+ and Claude consent),
   "Pexi's estimate", the You screen switch, and a real scan, search and paywall. Also the three
   vibrations (lib/haptics.js: barcode captured, a confident verdict, saved), never felt on a
   phone; the verdict one cannot have fired, since no verdict ever reached a phone (item 0).
9. **[Aurik] Torch may never light on phones (D-237, major, open).** From notes. Needs a native
   camera path.
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
30. **Skip the two-week tester beta?** QUEUE 7.17 and 7.18 planned 10 to 20 testers for two
    weeks, measured on four numbers, before launch. Never run, and could not have run: the phone
    app never reached the server (item 0). The MVP "done means" check on a phone over cellular
    (7.16) also never ran.
31. **French first screen for Quebec?** The app is pinned to English. If yes, the build is Aurik's.
32. **Old abandoned text already stored:** delete now or let it age out at 12 months.
33. **iPhone only at launch?** Google Play account, subscriptions and build are all unstarted
    (QUEUE 7.3, 7.5).

---

## D. DEFECTS triage, 2026-11-08 (state column read, not re-tested)

DEFECTS.md has 250 rows; 32 have a state column starting Open, Half or Partly. Owners by the
"Who owns what" line. Not re-tested one by one: Hammer (item 34) changes most price answers, so the
backend verdict rows are tested once after it is live, not twice.

- **[Jamin] Backend, test after Hammer is live (one pass, live server):** D-022 and D-059 (one typed
  price moves a verdict, no outlier hold), D-176 (word and picture disagree on own prices), D-177
  ("Great price" on a category prior about 15 times wide), D-241 (a typed name matching no single
  product dead-ends), D-121 (alternatives can never return a row), D-081 (seller named from
  store_name, not store_osm).
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

34. **[Jamin] Project Hammer prices and names (2026-11-07/08):** importer built (f400ac3, 2ad8994),
    weekly refresh script (89e018d), credits entry live. PC trial: 98,918 prices on 47,404 barcodes;
    48,185 catalogue rows. Live load is Mac job pexi-hammer-prices.
    **LIVE (checked 2026-11-08 19:25Z from the PC):** the Mac started the load at 18:21Z on 02aed27
    (cents fix in; the live database had 0 Hammer rows before) and never marked the job done, but
    live answers now carry Hammer store prices seen 2026-11-07 (tuna 0062639298517 at Save-On-Foods,
    butter 0055742357615 at Sobeys, a Galleria noodle bowl). Not yet confirmed: the row count, the
    catalogue names load, and the weekly refresh under the supervisor.
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

## Not covered yet (this list grows when these run)

- **[Jamin and Aurik]** Apple's review guidelines, section by section, against the real app: the
  server and listing halves are Jamin's, the screens and purchase flow halves Aurik's.
- **[Jamin]** The MVP plan's "done means" list, `docs/beta-readiness-audit.md`,
  `docs/beta-gaps-2026-09-19.md` and the rest of RULINGS, read for unbuilt launch items.
- **[Jamin]** The rest of DEFECTS read item by item (only open rows were scanned; D-115 status
  unclear), each assigned to its owner.
- **[Jamin]** Per-scan cost at launch volume and the worst case for one heavy user.
- **[Aurik]** Accessibility (large text, VoiceOver, contrast).
- QUEUE is stale in both directions (7.1 and 7.4 show queued, both done), so every QUEUE item
  above needs a check before work starts.
