# Paywall go-live: the 11th barcode scan in a week opens Pexi Plus

2026-11-17, Aurik: *"generate our workflow to implement our paywall once the user has completed their
10 free scans"*, then *"10 a week, continue"* (keeps RULINGS "Pexi Plus pricing and free scans":
10 barcode scans a rolling week free, 100 with Plus, typed searches free and uncounted).

## What is already built (checked in code 2026-11-17)

| Piece | Where | State |
|---|---|---|
| Counting: answered barcode scans per device, rolling 7 days; failures, misses, corrections and demo rows never count | `app/src/scan-quota.ts` | built, tested, **off** (limit unset on the Mac) |
| The wall: `/api/identify` answers 402 `scan_limit` past the limit | `app/server.ts`, `scanLimitRefusal` | built, off |
| Phone: 402 opens the paywall; a Plus user at 100 sees "used this week", never Subscribe | `app/public/js/screens/camera.js` `openPaywall`, `api.js` | built |
| Paywall: store prices from RevenueCat, Subscribe, Restore, Terms, Privacy, renewal text | `app/public/js/screens/paywall.js`, `purchases.js` | built, never run against a real store |
| Plus check on the server: RevenueCat secret key asks about proven device ids, 10-minute cache | `scan-quota.ts` `isPlus` | key set on the Mac 2026-11-07 |
| Scans left this week on the You screen | `app/public/js/screens/you.js` | built |

So the work is not building a paywall. It is proving the purchase on a phone, closing the legal
gaps, and switching the limit on, in that order, because RULINGS says the limit switches on only
once a test purchase works end to end.

## The workflow (stage by stage; owner in brackets, RULINGS "Who owns what")

### Stage 1, app changes before anyone can pay [Aurik's session, PC]
Each one is a fix-loop item: test red first, gate, push both remotes.
1. **Seller line on the paywall** (legal review question 13): "Sold by Jamin Xu (Pexi). Contact:
   useshinapp@gmail.com. Refunds are handled by Apple.", English and French.
2. **"Manage or cancel subscription"** as the You screen row's label (question 14), English and French.
   Found while building it: on the iPhone the row, and the whole Pexi Plus block with "N of 10 free
   scans left this week", was never drawn (D29, 2026-10-06, "the iOS build does not ship yet"). The
   iPhone app now gets the row, opening Apple's subscriptions page. Opening it from the app is
   unverified until Stage 4.
3. Nothing else: the trial tab only draws if the store reports a trial, so "no trial" is a store
   setting (Stage 3), not code.

### Stage 2, a build carrying Stage 1 [Mac, asked by Aurik's session]
Build 10 from the commit after Stage 1, uploaded to TestFlight. Mail per `comms/messages/*-aurik-to-mac-build-*`.

### Stage 3, store and business setup [Jamin, human-only]
1. **No free trial** on either subscription in App Store Connect (question 14). This reverses the
   yearly 3-day trial queued for Jamin on 2026-11-12; Jamin's word decides it.
2. Description and review notes stop saying "unlimited scans" (launch gaps 16).
3. **Before real money** (not before the sandbox test): GST/HST registration and Form GST506 to
   Apple (question 24), Ontario business name (question 19), Terms s.11/s.12 redraft in English and
   French (question 15).

### Stage 4, the sandbox purchase [Aurik, on his phone, human-only]
On build 10, signed in with an App Store **Sandbox** account (Settings, App Store, Sandbox Account):
1. You screen shows "N of 10 free scans left this week" (with the limit still off it shows none: fine).
2. Open the paywall from You. Both plans show CA$ prices from the store, the seller line shows.
3. Buy Monthly with the sandbox account. Expect "Pexi Plus is on".
4. Delete and reinstall the app, then Restore purchases. Expect Plus back.
5. Report: worked or not, and a screenshot of anything wrong. Launch gaps 7 closes on this.

### Stage 5, switch the limit on [Jamin's Mac, only after Stage 4 passes]
`SHIN_FREE_SCANS_PER_WEEK=10`, `SHIN_PLUS_SCANS_PER_WEEK=100`, restart (launch gaps server 2).
PC check from outside: `/api/quota` for a test device answers `limit: 10`.

### Stage 6, the consumer check [Aurik's phone]
1. On a device that is not Plus: 10 barcode scans answer; the 11th opens the paywall with
   "The 10 free scans for this week are used" and the day they come back.
2. A typed search still answers after the wall.
3. Subscribe (sandbox): the 12th scan answers.
Only then is the paywall "live". Producer evidence (tests, a 402 from curl) does not count.

## Stop conditions
- Stage 4 fails: the limit stays off; the failure becomes a DEFECTS row and goes through the fix loop.
- Any free-user scan count ever makes the model caps (1,000 range asks, 300 pack reads a month)
  run out before month end: re-read the break-even note (`docs/decisions.md`, "Free 10 scans a
  week, Plus 100") with the measured share before changing the allowance.
