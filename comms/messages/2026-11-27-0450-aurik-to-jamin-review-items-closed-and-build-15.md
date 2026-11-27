Jamin: four class (a) items from your 11-27 launch review are closed on main (pull to the commit after 5aa2858). Three asks at the bottom.

**What landed (Aurik's PC, 2026-11-27):**

- LEG-8 (d6a7d1a): the licences page credits ankane/plu (MIT, "Copyright (c) 2013-2026 Andrew Kane") for the produce sticker names, in the table and in the MIT section.
- G5 (9f4c4ee): BC liquor gets a weekly job. `mac/bcldb-refresh.sh` asks BC's open-data catalogue for the newest CSV, downloads it under its own name, loads it, and marks it so the same month is never loaded twice. Sundays 08:00, as `com.shin.bcldb` on the Mac and `pexi-bcldb.timer` on Linux (a collector, so `install-units.sh --with-collectors` and `probe-collectors.sh` include it). Run for real on the PC into a scratch database: newest file is August 2026, 7,813 rows, same as the Mac's hand run; a second load leaves 7,813 (no duplicates).
- AND-6 and AND-9 (5aa2858): the Play listing draft now says what version 5 does (Help improve Pexi starts ticked; Accept covers typed searches to Claude, switchable off in Settings). Checked the Android text reading question: neither phone reads camera text for shoppers (camera.js mounts the text reader only with the Developer switch on, since 11-14). Nothing pasted into Play Console.
- NOW.md: build 14 is uploaded (from your review, C4).

**Checked on newest main (31b6264 plus these):** typecheck 0, app 2745 pass / 0 fail, ux 566 / 0, check green, Safari-engine sweep 45 buttons 0 problems, fake camera 0 errors, accessibility sweep 14 states 0 problems. Live server: health 200 in 0.4 s; the App Review barcode 055773000795 is named (McCain Tasti Tater's 800 g) with a known price, 0.26 s, preview only. Never seen on a phone.

**Ask 1: build 15 from newest main.** Build 14 is from 8167364, which is before the depth pass (34c0148), the camera glass (677ca6a) and D-286 to D-291. If 1.0 should ship with those, build 15 is the one to attach, not 14.

**Ask 2: on the Mac, install the BC job.** `sudo sh mac/10-boot-survival.sh` (it now knows `bcldb`), or skip it if the move to the new server comes first; the Linux timer is ready.

**Ask 3 (your legal text): the privacy document over-states camera text reading.** It says "While the camera is open, Pexi's app reads text that is visible in the camera view ... and sends the recognised lines" (app/public/js/legal/document.js:101). For shoppers that is off on both phones. Saying more than the app does is harmless, so this can wait for the next version of the document; when the text reader is switched on for shoppers, the sentence becomes true again.

**Later the same night (autopilot pass on Aurik's PC):**

- Android is now locked to portrait like the iPhone (4ae27c5, gap 65). a031ae6 locked only the iPhone. Checked with gradle on the PC (merged manifest carries it); needs the next Android build.
- Checked and clean, no change needed: French strings (every key present, no "vous", placeholders match); licences page versions match what ships; every screen escapes product names; every server call has a deadline (the pack download is switched off); the developer section is off in every phone build; the iPhone privacy manifest matches the App Store label (gap 92 closed); a layout walk in Safari's engine, 15 screens x 4 setups (EN/FR, light/dark, 375 and 320 wide, larger text), 0 problems, with a planted control caught every time.
- Live typed search (read-only `/api/search`): misspelt "mccain tasti tator" finds it, "ketchup" no longer opens on Doritos, nonsense is a clean miss, all under 0.7 s. One for your search (D-269): "milk 2%" ranks "milk 2L" first and a 1% chocolate milk second, so the "%" looks ignored.
- Phone checklist for Aurik rewritten for builds 13 to 15 (40 checks): https://claude.ai/artifact/Jmc6eH66fxp7Zt7anywPTy (private to Aurik until he shares it). docs/readiness/review-2026-11-21/phone-checklist.md points to it.

Delete this file once read.
