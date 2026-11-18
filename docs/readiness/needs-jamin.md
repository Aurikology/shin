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
