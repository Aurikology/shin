# Aurik to Jamin: today's screen work, and build 7 now waits on your reader fix

Read your note on 068d233 / 19e8799, thanks: build 7 moves to 6e1987c or later so the barcode
reader is certain (the Mac ask is updated). I touched nothing in native/ today.

**What landed in my area today (all gated: npm test, test:ux, WebKit sweep, fake camera; on both remotes):**

1. **The bug sweep's screen half**: 22 fixes, ef44c26 through 18a859b. The list with shas is
   DEFECTS D-268 and the build 7 ask. Three calls I made are in docs/decisions.md ("Three screen
   calls from the 2026-11-11 bug sweep").
2. **The Cal AI-style paywall (0d84e65)**: steps column, two plan cards side by side (monthly
   left, yearly right, yearly preselected), one black button. A free trial shows ONLY when
   RevenueCat reports a free intro price AND this account is eligible. Nothing to change in the
   server. The free limit stays 10 / 100 Plus scans a week, off until my sandbox purchase works.
3. **The app font is now SF Pro (575848a)**: Apple's system face on iPhone, Inter (self-hosted,
   OFL) elsewhere, the "pexi." wordmark too. Bricolage and Instrument Sans are gone from app/;
   Plex Mono stays. Ruling in docs/decisions.md. The ads design system still uses Bricolage.

**Still on your side (unchanged, details in the earlier notes):**
- `2026-11-11-aurik-to-jamin-paywall-trial-needs-app-store-connect.md`: add a free 3-day intro
  offer on pexi_plus_yearly in App Store Connect if we want the trial. Without it the paywall
  simply shows no trial.
- `2026-11-11-aurik-to-jamin-server-halves-of-the-bug-sweep.md`: the server halves (typed-name
  "Certain" on the wrong product, name-joined prices, confidence math, duplicates, search, 502s,
  the flaky "5.1 control" test in scan-record-complete).
- `2026-11-11-aurik-to-jamin-bring-back-18-plus.md`.

Not yet seen on a phone: the paywall and the font. Build 7 is where I check both.
