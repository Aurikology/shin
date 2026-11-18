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
