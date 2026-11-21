# Pexi launch review, 2026-11-21: result

Asked by Jamin: ready for App Store submission, every function working, thousands to tens of thousands of users?
Answer: **not ready to submit today.** The app works; the gaps are Apple paperwork, the money path, getting
found and paid, and one home laptop carrying everything. Detail per job: the `.jsonl` files in this folder.

## Blocks submission or the first sale
1. Privacy policy lacks the 5.1.1 sentence that named outside services protect data equally (apple-rules 2).
2. Public Privacy Policy and Terms are the 2026-11-06 versions; later fixes were never published, and the live
   policy now contradicts the code on the device id and reinstall (apple-rules 1). Publishing is Jamin's call.
3. App Store Connect not seen since 2026-11-07, when it said "unlimited scans" and 148 countries (apple-rules 3,
   blind 4). Paid Apps agreement, banking, tax, subscription status, Small Business Program: unseen (money 1).
4. "Pexi is in early access" banner: Apple 2.2 says betas belong on TestFlight (blind 9).
5. No purchase has ever completed end to end (blind 2); Apple server notifications never reached RevenueCat, so
   cancels and refunds are not seen (money 3, R84).

## Loses money
- Store page sells nothing: first screenshot an empty camera, no captions, name "Pexi" alone (business 1, 2).
- Answers: 98 of 191 popular Canadian barcodes got a price (51%, optimistic: same source as the catalogue).
  Real tester scans, 14 days, 19 phones: 44% any answer, 17.4% a shop price and verdict (Mac). Spot check:
  14 of 15 priced answers within real shelf prices.
- Paywall sells a count and says typing is free; limit invisible until it refuses; no-choice data screen before
  the camera (business 3 to 7). Typed searches being free is a ruling (RULINGS.md:472); saying so on the paywall is not.
- Free limit bypass by new device id, unlimited over IPv6; a cheap flood stops new Plus buyers being recognised
  (abuse 1 to 3). Small Business Program enrolment unrecorded (blind 12).

## Scale and reliability
- Load test (Mac, M1, second server copy): peak 514 requests/s at 16 users; breaks at 512 continuous users
  (46% reset, p95 2.1 to 2.8 s). Bottleneck: typed search runs synchronous SQLite on one thread (169% CPU of 8
  cores). Barcode route not in the test mix. Estimate, assumptions labelled in the chat reply: raw throughput
  carries tens of thousands of daily users; reliability and abuse do not.
- Upload 234 Mbps. Product pack 44 MB uncompressed, Cloudflare does not cache it (blind 8).
- Mac on battery (80%) during the review; it ran flat 2026-11-18. Backup failed today (retired repeat cache);
  restore script does not parse under macOS sh (ran under dash, data restored); no off-site copy.
- Claude cap 1,000 a month, drainable by one person in minutes over IPv6 (abuse 5); events route can fill the
  disk in about two hours (abuse 4).
- Known risks re-checked: 7 of 93 ready; all 17 tier 1 open; 0 of 12 drills ever run (register.jsonl).

## Functions
npm test 2,439 of 2,444 pass, 0 fail; test:ux 554 of 557, 0 fail; live end-to-end 27 of 28 steps (one
Cloudflare 502). Not covered without a phone: camera, purchase, restore, reinstall, VoiceOver, older iOS:
`phone-checklist.md`.

## How complete this is
The blind reviewer's 21 findings: about 5 were on no other list (early access banner, store Wi-Fi sharing one
address limit, uncached pack, English Terms on the French subscribe screen, no French listing). One in four new
means another pass would still find things, mostly smaller. The functions job made about 450 live read-only
requests against a 300 budget.
