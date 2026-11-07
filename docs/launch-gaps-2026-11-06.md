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
   down for everyone.

### Server (Mac)
1. **[Jamin] Deployed 2026-11-07 03:59Z (d556366): the six security fixes are live.** Checked from
   the PC: the long security header is on live responses, and `x-shin-plus: 1` is not believed
   (`/api/quota` says `plus:false` with and without it). **Left: `REVENUECAT_SECRET_KEY`** is not
   set, so nobody can be Plus, payers included, until it is (needed before Aurik's 7).
   Why it took so long: the deploy gate refused five pushes in a row (3d83de2 through 9a1a9c1),
   live froze on 741c3c8 from Nov 6 02:40Z to Nov 7 03:58Z while the deploy page said "App: ready
   to test", and the reason it gave was "no test names found". Cause and fix in d556366 (the app
   suite's real-data guard was tripped by a sibling suite running at the same time).
1a. **[Jamin] Six of nine backup tests fail** (`mac/deploy/test/backup.test.mjs`), on d556366 and
   its parent alike. Reported by the Mac 11-07, not looked at. Read before item 3.
2. **[Jamin] Weekly limits not set** (`SHIN_FREE_SCANS_PER_WEEK=10`, `SHIN_PLUS_SCANS_PER_WEEK=100`).
   Reported. Set only after Aurik's sandbox purchase (7) works (RULINGS).
3. **[Jamin] Backups cover 4 of 8 databases.** Reported 11-07 (corrects the QUEUE 7.12 note that
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
10. **[Jamin] "Cheaper option" can offer a different kind of product (D-036, open, "gates showing
    this feature to anybody").** From notes. The server's pick is the fault. Unknown whether build
    4 shows the feature; if it does and the fix is not in, Aurik hides it.
11. **[Jamin] Known wrong cached answer for barcode 0068100084245 still in both caches** (QUEUE
    7.19). From notes.
12. **[Aurik] Screenshots: 0 uploaded on every size.** Checked. iPhone 6.9" and iPad 13" (iPad
    simulator renders the app, reported; iPhone simulator has no Pexi installed), plus one Plus
    screen shot for each subscription's review (21).

### Store pages and legal
13. **[Jamin] Hosted privacy and terms are old versions; French pages 404.** Checked. The app
    links to all four. Publish `docs/store/` to the pages repo.
14. **[Jamin] Three Quebec answers** (`docs/store/quebec-transfer-note.md`): where the Mac is,
    whether the Anthropic, Cloudflare and RevenueCat contracts suffice, how long Mac backups and
    logs keep data. Must go in before 13.
15. **[Jamin] Icecat vectors still on disk** in the real catalogue (search already ignores them).
    Run `node src/embed-all.ts` in `catalogue/` on the Mac, which holds the real catalogue
    (reported). Aurik's report.

### App Store Connect (checked 11-07, read only)
16. **[Jamin]** Description and review notes say **"unlimited scans"**; subscriptions say 100 a
    week. Fix both.
17. **[Jamin]** Availability is **148 countries**; ruling is Canada only.
18. **[Jamin]** Age rating **12+**; needs 18+.
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
26. **[Jamin]** **Photo scan drops flavour (D-099, open)**, never tested on a real photo. From notes.
27. **[Jamin]** **Outage plan:** the server is one Mac behind a tunnel. Nothing alerts anyone when
    it is down, and paying users get nothing while it is. The probe can run on a schedule as one
    alarm.
28. **[Jamin]** **Support and refunds:** no stated support contact process or refund handling found.

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
