# Coverage grid for worker "time" (2026-11-18)

One line per pairing considered. "item" means it has a row in time.jsonl.

## Half 1: resources that run out

- Money, Apple Developer fee and card: item time-01
- Money, domain registrar and card: item time-02
- Money, Anthropic credit and card: item time-20
- Money, old Google Gemini billing: item time-21
- Money, who pays each bill and which card (the whole list): item time-14
- Money, cash gap before the first Apple payout: item time-13
- Money, Cloudflare bill: n/a: free plan, no card; limits are in time-04 and the tunnel in time-03
- Money, GitHub bill: item time-26 (free minutes, no card)
- Money, RevenueCat fee above US$2,500 a month: item time-22
- Money, Google Play fee: n/a: Android is not launching and the Play fee is a one-time US$25 (store accounts packet)
- Money, Mac power and home internet: item time-28
- Mac disk, backups and catalogue copies: item time-15
- Mac disk, unrotated server logs: item time-17
- Mac disk, photos growth: n/a: photos are not stored by default (the picture is never read into memory when the setting is off, app/server.ts around line 2794); the growth of other data is in time-15
- Mac disk, databases growing past the backup window: item time-16
- Memory and CPU under load: item time-27
- Mac power, sleep and reboot: item time-28
- Claude monthly cap hit: item time-19
- Claude model retirement and credit: item time-20
- RevenueCat free-plan revenue limit: item time-22
- RevenueCat lookup limit and cache after a restart: item time-23
- Cloudflare free-plan limits: item time-04
- Cloudflare tunnel software support window: item time-03
- Overpass rate limits: item time-25
- Open Food Facts rate limits and User-Agent: item time-24
- Other data sources (Open Prices, Icecat, USDA, BC Liquor): n/a: no rate limit or expiry found in code for these within my angle (not checked on their sites); the weekly price refresh is time-32
- GitHub Actions minutes: item time-26
- Gmail storage: item time-29 (not measured; folded into the support inbox row)
- Jamin's attention: items time-30, time-36, time-37
- Aurik's attention: items time-30, time-37
- Support load per 1,000 users: item time-30

## Half 2: the calendar

- Launch day: item time-31 (with the launch-spike limits in time-04, time-24, time-25, time-27)
- Launch week: item time-31
- Month 1, first monthly renewals: item time-31
- Month 1, first refund wave: item time-31
- First yearly renewals (a year after launch): n/a: falls after the first year window of this pass; the renewal path is the same as time-31
- Apple Developer Program yearly fee: item time-01
- Domain renewal: item time-02
- Certificate or provisioning profile expiry: item time-05
- App Store Connect API key: item time-05
- TestFlight 90-day build expiry: item time-06
- Apple Paid Applications Agreement and forms: item time-35
- Trademark and Ontario business name: item time-09
- GST/HST registration and the form to Apple: item time-10
- GST/HST returns and payments: item time-11
- Income tax on Pexi income: item time-12
- Apple payout timing: item time-13
- Apple age rating deadline 2027-01-12: item time-07
- OPC Children's Privacy Code comments close 2027-01-20: item time-08
- Quebec 2026 subscription amendments: n/a: the dates (2026-06-12 and 2026-09-12) are already past and the topic is the legal worker's lane; only secondary sources were read
- 90-day log, 12-month event and 24-month device-id sweeps: item time-18
- Server logs outside the sweep: item time-17
- 14-night backup rotation: item time-16
- Weekly Hammer refresh and its 8-day check: item time-32
- Yearly iOS and Xcode releases and Apple's minimum SDK rule: item time-34
- Capacitor major versions: item time-34
- Node major versions: item time-33
- Claude model lifecycle: item time-20
- McMaster Fall and Winter terms and exams: item time-36
- May 3, 2027, the 16-month full-time job: item time-37
- Apple renewal and tax dates falling inside the job window: item time-37 (with time-01, time-11, time-12)
- PIPEDA 30-day access and delete clock: item time-29
- Breach record retention (24 months federal, 5 years Quebec) versus the sweeps: n/a: the sweeps do not touch the incident register; covered by the privacy worker's lane and by time-18 for the other tables

## What tracks each date today

- Every renewal and tax date above: nothing found in the repo, in docs or in the Mac's alarm. Jamin's calendar and email were not read (accounts are off limits).
- Hammer refresh age and server up/down: the GitHub alarm (.github/workflows/server-alarm.yml).
- Claude cap: a log line and a field on the health page only.
- Retention sweeps: an error log line on failure only.
