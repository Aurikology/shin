# Re-check after the fixes, 2026-10-06 and 2026-10-07

A second end-to-end walk of the Pexi app (formerly Shin) after a day of fixes, to say which of the
44 defects are really gone. Evidence is the running app only: the screen, the network replies and
the databases. A commit message or a passing test counted for nothing. The first walk is
`docs/walkthrough-e2e-2026-10-06.md` (D01 to D43); D44 is the rename, the name must be Pexi and
never Shin anywhere a person can see it, mascot included.

Judged against `RULINGS.md`, `docs/verdict-distribution-design-2026-09-30.md`,
`docs/design/DESIGN.md` and `docs/screen-tags.md`. D06 was ruled not a defect (a lone shopper price
only counts once a second source agrees), so its test is that the shopper sees their own pending
report.

## Run header

| Item | Value |
| --- | --- |
| Server | `npm start` in `C:\shin\app`, port 4173, the real data folder (no scratch copy), catalogue first on (the shipped default). Stopped at the end, port closed. |
| Browser | Playwright 1.60, installed Chrome, 390x844, touch, mobile emulation, `?tags=1`, console and network watched. Dark for every screen, light for camera, pad, verdict, Saved, Past scans, Removed, You, consent and legal. French locale swept. |
| Camera | Chrome fake camera fed a printed UPC-A of 055773000795 (McCain Tasti Tater's 800g, $5.49 at Save-On-Foods). Other frames: an unknown valid-checksum barcode, 9310088013191, a J.P. Wiser's Deluxe 375 ml frame, a corn frame. |
| Baseline | Table counts of all seven databases recorded before the first scan (scan 206, event 670, consent 3, device_key 36, gap 15, user_product 7, observation 10, branch 7, correction 2). |
| Rows created | Scans above id 206 with their ratings and rating history, events after row 670, consents above 3, device keys above 36, four corrections (ids 3 to 6), one user product (id 8) with its two observations and its branch, one gap (id 16). Each was deleted by id after being recorded. |
| After cleanup | Every table of all seven databases is back to its baseline count and maximum rowid (checked table by table, zero differences). The last checks (sizes, console errors, an invented-device GET on `/api/scans`) ran with `/api/**` aborted in the browser or as a read, and added no rows. |
| Not reachable | The flagged-off screens a8, a17, a19, a21, a22, a67, a92, a93, a96 (off by design); the legacy a42, a43, a51; a74 and a75 could not be triggered; the offline-queue flush was not exercised. None of these is a verdict on a defect unless a row below says so. |

Screenshots are in
`C:\Users\xujam\AppData\Local\Temp\claude\C--agent\760cad12-7851-4ef9-9cc2-99fe0fa9459f\scratchpad\shin-recheck\shots\`
(not in the repo; names below are the file names without `.png`).

## Result

**44 defects: 36 FIXED, 7 PARTLY, 1 NOT FIXED, 0 CANNOT CHECK. 14 new defects: 0 blocker, 3 major, 11 minor.**

## The 44 defects

| ID | Verdict | What the running app showed | Screenshot |
| --- | --- | --- | --- |
| D01 | FIXED | The Fix form now carries the scanned product. After sending, `corrections.db` held code 0055773000795, seller Save-On-Foods, 549 cents, a client id of its own. A forced `stored:false` reply is reported as a failure on the form ("That did not go through"), not as recorded. | 016-fix-results, 018-fix-typed, 019-fix-saved, 200-stored-false |
| D02 | FIXED | The price-only card stores the price with its shop (`scan-price:207`, capture typed, Save-On-Foods, 549) and the scan row carries typed_price_cents 549. No "No shop" choice is offered; a price without a shop cannot be sent. | 009-pad-typed-549, 012-priceit-0.8s, 070-noshop-pad, 074-noshop-priced |
| D03 | FIXED | The shop list opened in 298 ms with 20+ shops, Save-On-Foods among them. Search ("save") narrows it, and "Not on the list: use this name" accepts a typed shop. | 010-shop-picker, 071-noshop-picker-fresh, 072-picker-search, 073-picker-typed |
| D04 | FIXED | A typed name now goes through the same search as the barcode path and shows a top-three pick list with "None of these" (a107). Picking a product gave the barcode path's answer ("Reasonable price" for the McCain, with the shopper's own report on the chart). | 033-manual-open, 036-manual-picked-answer, 040-unk-named |
| D05 | FIXED | "Place it" persists: scan 207 has typed_price_cents 549 and store Save-On-Foods, and a correction row exists. The consent text says the price is written down and it is. | 012-priceit-0.8s, 060-consent-dark |
| D06 | FIXED (not a defect, shopper's own report now shown) | On a rescan the sheet says "Your report: $5.49 at Save-On-Foods, counts once a second source agrees" and a diamond marks it on the bell. The verdict itself rightly does not move on one report. | 021-rescan-pad, 023-answer-full-rescan |
| D07 | FIXED | Past scans lists every answered scan (18 after the run's scans) and Saved opens the saved verdict with "This is what I said at the time". | 028-saved-list, 029-saved-detail, 030-past-scans, 031-past-detail |
| D08 | PARTLY | A Share control exists and opens the post card (a73, card draws). But RULINGS.md "V1 verdict screen mechanics" puts Correct and Share at the half detent: they sit at the very bottom of the full sheet, below ten price rows and the estimate line, with the half sheet showing neither. | 027-share, 174-L-verdict-bottom |
| D09 | FIXED | Thumbs down on a catalogue answer opens reason chips; scan 209 has a scan_rating row (down, wrong_price) and three history rows. | 024-thumbs-down, 025a-reason-chips, 141-thumb-chips |
| D10 | FIXED | You shows the defaults 30 / 20 / 20. The words follow: $5.49 against $5.54 reads Reasonable, $2.99 against $4.49 (33% under) Great, $16.99 against $13.92 (22% over) Bad. | 051-you-scroll-1-dark, 092-jpw-full, 121-corn-full |
| D11 | FIXED | An unknown barcode with a typed price stores the price (correction `scan-price:211`, code 0042198736514, 399 cents), asks "What is the product called?", and then ends in an answer chart ($25.47 estimate from every price held). | 039-unk-after-price, 040-unk-named, 212-none-of-these |
| D12 | PARTLY | The word is now explained ("22% over the typical price, Pexi's estimate $13.92") and agrees with the marker. Still: the bell centre ($13.92) sits below both of the item's own prices ($14.69 and $16.99) and the range runs $3.23 to $59.99 on two prices. | 091-jpw-1699, 092-jpw-full |
| D13 | NOT FIXED | The Kleenex category-prior answer still headlines "Great price" at $3.99 against a range of $3.34 to $50.38 (about 15 times wide). It is now drawn hollow and carries "not fully confident: a rough estimate for its category", which the design asks for, but the word is unchanged, and that word is the complaint. | 041-unk-chart |
| D14 | PARTLY | The You screen is per device and no longer contradicts itself ("18 scanned this week" next to "18 scans, 0 named"). But "0 named" and "0 I could call" are still an internal instrument shown to a shopper, and `/api/scans` still answers an invented device id with fleet figures (203 scans, 12 devices, named rate, corrections). D-157 stays open. | 130-you-after-scans, 050-you-top-dark |
| D15 | FIXED | The stale "no privacy page" text is gone. Delete my data and the privacy page name the same address (useshinapp@gmail.com), which still reads "shin" (see D44). | 051-you-scroll-3-dark, 061-legal-privacy-html-dark |
| D16 | FIXED | Licences loads, lists the sources with their licences and counts, shows a loading state (a69) and, when the list cannot be fetched, says so with a retry (a70). | 060-licences-dark, 162-licences-loading, 163-licences-fail |
| D17 | FIXED | A server 500 shows a108: "Pexi hit a problem on its side. Your connection is fine." with Try again. | 100-server-500, 101-after-retry-500 |
| D18 | FIXED | Camera reads "Point at a barcode." | 005-camera-rest |
| D19 | FIXED | A fresh camera load for 5 s: zero responses of 400 or more and zero console errors. | (none, check run) |
| D20 | PARTLY | Faces now follow the zone (a green face on the Great row, a plain face on the Reasonable McCain row). Long names still truncate on the list ("McCain Tasti Tat...", "WF • ᴄᴀSave...") and the Reasonable row reads "no usual price" with a dash. | 122-saved-two, 028-saved-list |
| D21 | FIXED | The empty Saved state has "Scan something". | 060-watchlist-dark |
| D22 | FIXED | The demo scan card shows "Kraft Dinner Original, 225 g", "in the middle", both marked DEMO. | 112-demo-scan |
| D23 | FIXED | Tapping the "Camera access" label turns its switch on. | 002-perm-label-tap, 003-perm-both |
| D24 | FIXED | The consent text no longer promises a location switch that is missing or mentions photos. | 060-consent-dark |
| D25 | FIXED | Every control on the pad measured at least 44 px in a fresh pass (the close button included; its drawn ring is about 30 px inside a 44 px target). | 171-L-pad |
| D26 | FIXED | The pad asks "What's the shelf price?" | 009-pad-typed-549, 171-L-pad |
| D27 | FIXED | The Buzz caption sits directly under the Buzz row. | 051-you-scroll-1-dark |
| D28 | FIXED | The Developer row is hidden unless tags are on (checked without `?tags=1`). The build line reads "Build 2026-10-06 23:28 (when this server last started)". | 051-you-scroll-3-dark, 111-you-no-tags |
| D29 | FIXED | No Manage subscription link. The paywall says to subscribe in the app, with Terms and Privacy. | 060-paywall-dark |
| D30 | PARTLY | The line under the headline was fixed, but the mascot bubble still says "That is the free scans for this week. Plus takes the limit off." with none used (and the French copy says the same). | 060-paywall-dark |
| D31 | FIXED | The four legal pages carry a103 to a106, render at 390 px with no horizontal scroll, and a fresh load of each shows no 404. | 061-legal-privacy-html-dark, 061-legal-terms-html-light |
| D32 | FIXED | The plans step shows CA$29.99 a year and CA$3.99 a month, "NOT LIVE", no "SHIN Pro", no trial. | obb03-a25 |
| D33 | FIXED | The a29 tip lists barcode, typed price and product search; no photos. | obc04-a29 |
| D34 | FIXED | a15 compares "Guessing shelf prices" with "Instant barcode scan and a verdict on the price"; no price history claim. | ob14-a15 |
| D35 | FIXED | a84 read 67% at one moment and 100% by 6 s: it follows the clock. | 052-a84-late, obc05-a84 |
| D36 | FIXED | `?s=market` now lands on the permissions screen (a97); there is no Market page to change. a67 itself is flagged off and not reachable. | 060-market-dark |
| D37 | FIXED | The offline sheet has Retry, and Retry re-asks. | 102-offline, 103-after-retry-offline |
| D38 | FIXED | The basis line names the item's own prices or an English category ("facial tissues"); no French category appeared on any English answer. | 092-jpw-full, 190-fr |
| D39 | FIXED | Chart labels stack under the centre without overlap (two seller labels on the J.P. Wiser's chart, three on the corn chart). | 092-jpw-full, 121-corn-full |
| D40 | FIXED | Startup log has no Protobuf or onnx error across three starts. | (server.log, server3.log) |
| D41 | FIXED | With storage blocked or the stored list corrupt, Saved, Past scans and Removed say "I could not read ..." with Try again and show "?" for the counts. (You and Savings still say nothing was scanned, see N06.) | 105-fault-watchlist, 230-corrupt-watchlist, 230-corrupt-pastscans, 230-corrupt-removed |
| D42 | FIXED | The name field is enabled and focused with a live arrow; the pick list follows. | 033-manual-open, 040-unk-named |
| D43 | PARTLY | A phone viewport was added, but `shin-build-plan.html` still lays out 577 px wide on a 390 px phone, and the tables on the other three run 557 to 592 px wide. The app does not serve these pages. | 150-a77-dark, 150-a78-dark, 150-a79-dark, 150-a80-dark |
| D44 | PARTLY | Pexi on every app screen, title, mascot line, French line, share card, consent and legal page I opened (zero "Shin" in the screen text of the routes swept, English and French). Still visible: the contact address useshinapp@gmail.com in the Delete my data link and in the privacy and terms text; "Shin" 63 times on the four plan pages (`shin-*.html`); the mascot's bubble on the answer sheet is one generic line, "Here is what I found." | 060-you-dark, 061-legal-privacy-html-dark, 150-a78-dark |

## New defects

| ID | Tag | Severity | What happened | What the documents say | Screenshot |
| --- | --- | --- | --- | --- | --- |
| N01 | a34 | major | After a scan that was answered and then corrected, the camera's idle line reads "Last time: McCain Tasti Tater's 800g, $5.49. Refused." The scan was answered "Reasonable price". | RULINGS.md "Always answer, never refuse for wasting time" and "V1 verdict screen mechanics": there is no refusal screen. A line that says Refused is a false record of what happened. | 020-after-fix-done |
| N02 | a102, a56 | major | The live sheet for the corn answer says "We are not fully confident in this answer." The Saved copy of the same answer says "FAIRLY CONFIDENT" under "This is what I said at the time." | Priority 1, calibration; DESIGN.md "Confidence, expressed in fill and in the width of the bell". The saved sentence is false, and it overstates. | 121-corn-full, 154-saved-detail-facts-only |
| N03 | a71 | major | The Fix form shows "Recorded against McCain Tasti Tater's 800g, at Save-On-Foods. It counts from now, firmer when a second tag agrees." before any price is typed or sent. From You, with no product, it shows "Recorded against this, at Zz Recheck Mart. It counts from now" directly above "That did not go through". | RULINGS.md "Scan-time asks and feedback": the shopper is told what happened. A promise of recording sits beside a failure. | 018-fix-typed, 232-you-report-saved |
| N04 | a41 | minor | The thumbs toast breaks: "Noted." draws one letter per line, Undo overlaps it, and the reason chips sit beside the mascot. | docs/screen-tags.md (a41 thanks toast with Undo); RULINGS.md "Front-end craft: measured contrast, shared components, no build step". | 141-thumb-chips |
| N05 | a66, a71 | minor | You, Report a wrong price opens the Fix form with no product. Any send comes back "that price has no product attached to it" (200, `stored:false`); nothing in that path can attach one. The failure is honest but the route cannot succeed. | RULINGS.md "Attribution, provenance and correction data": a correction is recorded with its barcode. | 231-you-report-filled, 232-you-report-saved |
| N06 | a66, a86 | minor | With the stored data unreadable, You says "Nothing scanned this week" and Savings says "Nothing scanned yet", while the three lists correctly say they could not read it. A fault stated as a fact about the world, the D41 shape. | The D41 finding itself (DEFECTS.md D-204): a fault reported as a fact about the world. | 230-corrupt-you, 230-corrupt-savings |
| N07 | a71 | minor | The Fix form's shop is free text with no list, so a misspelt shop becomes a seller no other shopper matches. The camera pad has the picker (a50). | RULINGS.md "Scan-time asks and feedback" (shop picked, remembered). | 231-you-report-filled |
| N08 | a52 | minor | After naming and pricing an unknown barcode, scanning the same barcode asks for the name again. The correction row keeps no label. | RULINGS.md "Priced store items that match no barcode still train prices". | 210-unk-again |
| N09 | a53, a56, a100 | minor | Catalogue name clutter: "WF • ᴄᴀSave-On-Foods Peaches & Cream Corn 750 g" on the sheet, list and bubble; "Kleenex Soft & Thick 3 Ply Facial Tissues 95 pack 95 pack". The Saved bubble reads "McCain Tasti Tater's 800g. --, saved 0 min ago." | RULINGS.md "Product identity and catalogue matching". | 122-saved-two, 041-unk-chart |
| N10 | a102 | minor | "From this item's own prices (2 prices)" sits under a table of ten price rows. | The documents I read set no rule for this; it is a contradiction on the screen itself. | 174-L-verdict-bottom |
| N11 | a100 to a102 | minor | The confidence statement, the line that carries calibration, is a 10 px mono caps line at 0.88 opacity in the zone colour, footnote-sized under a 40 px headline. I found no size rule in the documents, so this one is a judgement. | Priority 1, calibration; DESIGN.md Law 2 and "Confidence, expressed in fill and in the width of the bell". | 092-jpw-full, 041-unk-chart |
| N12 | a100, a101 | minor | On answers built from a category prior or an estimate (McCain Reasonable, Kleenex Great, the unknown gadget) the bubble is the generic "Here is what I found."; on an answer from the item's own prices it speaks the numbers ("$16.99. It is $13.92."). The mascot reacts to no Great or Reasonable price in words. | RULINGS.md "Avatar / mascot": screen-by-screen dialogue, happy at a good price, mad at a bad one. | 023-answer-full-rescan, 041-unk-chart |
| N13 | a26 to a29 | minor | Onboarding keeps tag wording in a barcode-only app: "Ensure barcode or price tag is visible", "Barcode/Tag identified", "Or type the price you see on the tag". D18 and D26 were fixed on the camera and the pad only. | The D18 and D26 findings. | obc01-a26, obc02-a27, obc03-a28 |
| N14 | a66 | minor | The Buzz caption still says "a verdict or a refusal lands", though refusal is no longer a state the app can show. | Avatar contract (commit e787e67); RULINGS.md "V1 verdict screen mechanics". | 051-you-scroll-1-dark |

## Notes on method

- D06, D13, D20 and the confidence-size note in N11 are judgements against the design text, not
  measurements; the others are things the screen or a table showed.
- D12 and D13 were run on one product each. A second product of each shape was not tried.
- D14's endpoint check was a single GET with an invented device id against the local server; the
  fleet figures it returned are real counts from the real data folder.
- The first attempt to corrupt the stored list (an injected override) never reached the store key
  and showed "Nothing here yet"; that run is discarded. The kept run writes the store key directly.
- My own test removed all 19 past scans one at a time, which explains a "Past scans 0, Recently
  removed 20" screen in that run. It is not a defect.
