# blind coverage: ways I searched

Read for this pass: the shared brief; RULINGS.md (headings plus Catalogue first, scan never ends with no result, Plus pricing and free scans, Model spend cap, Name, App id, server-side limits, App Store Connect key); docs/security-check/FINDINGS.md and the Mac check; legal-review-2026-11-17; privacy data-requests and breach-plan; launch-gaps; decisions.md (launch calls, economics, review prompt, roles); mac/ (README, DEPLOY, launchd plists, run-server, hammer-refresh, config example); server-alarm workflow, the probe and the freshness script; app/server.ts routes, health, limiters, retention timer; scan-quota, rate-limit, errlog, disk-guard, startup, open-food-facts, stores; range-ask; purchases.js, device.js, flags; native config and README; store listing and pages; price/src/hammer.ts. Not read in full: store privacy and terms pages, retention.ts, you.js and paywall.js, the 11-16 fix log, QUEUE.md. Every claim about those stays assumed.

Kinds of failure I deliberately looked for, each with the item it produced:

- Reboot, power, internet, tunnel down: item blind-01, blind-02
- One machine dies or is lost, backups on the same disk: item blind-03
- Backup or disk fails silently: item blind-04
- Domain expiry or ownership: item blind-05
- Vendor account trouble (Cloudflare, locked logins): item blind-06, blind-34
- Alarm itself failing or going unread, quota: item blind-07
- Alarm green while answers are wrong: item blind-08
- Claude cap, credit, key, model retirement: item blind-09, blind-10
- RevenueCat outage, key, lookup limit: item blind-11
- Paying user shows free, restore: item blind-12
- Reviews, refunds, ratings unmonitored: item blind-13
- Support inbox unread, French mail: item blind-14, blind-45
- Privacy requests, 30-day clocks: item blind-15, blind-46
- Retention promises, logs, backups: item blind-16
- Breach, leaked keys, stolen Mac: item blind-17
- Security fix that clashes with another fix (FileVault vs auto-login): item blind-18
- Bots and scripted abuse: item blind-19
- Shared addresses and per-address limits: item blind-20
- Viral spike (good event): item blind-21
- Free data services throttling, cached misses: item blind-22
- Weekly price refresh failing or wrong: item blind-23, blind-24
- Provider, retailer or brand notice, takedown, expired data key: item blind-25
- Shopper-typed junk, photos, abuse: item blind-26
- Apple rejection, renewal, agreements, tax and banking, small business rate, age-rating deadline, certificates: item blind-27, blind-28, blind-29, blind-30, blind-32, blind-33
- Business paperwork at first income: item blind-31
- Bad deploy, stalled deploy pipeline: item blind-35, blind-36
- No kill switch or minimum version in bundled app: item blind-37
- New iOS release, SDK deadlines: item blind-38
- Privacy policy and label drifting from the code: item blind-39
- Store pages hosted under a personal name: item blind-40
- Nobody reading numbers (hit rate, installs, churn): item blind-41
- Jamin's internship from May 3, 2027: item blind-42
- Partner or ownership strain: item blind-43
- Name dispute: item blind-44
- Outreach and spam-law risk from the crawl job: item blind-47
- TestFlight expiry: item blind-48

Pairings I considered and set aside:

- Android users asking for the app, Google Play personal account: n/a: not launched, no response needed beyond a support reply (blind-14)
- Hammer product lookups for barcodes with leading zeros: n/a: data correctness detail, belongs to a data-quality angle
- Time zone, daylight saving and the rolling-week quota window: n/a: not read in code, left unexamined, unknown not safe
- Apple Family Sharing and Ask to Buy on subscriptions: n/a: no entitlement code for it was read
- Currency or price-tier changes by Apple in Canada: n/a: Apple adjusts tiers itself; no repo action found
- GitHub scheduled workflows auto-disabled after 60 quiet days: n/a: Apple's and GitHub's rule applies to public repos; repo visibility not checked (see blind-07)
- A real shop price shown on an expired promotion: n/a: product accuracy, not an event needing a response
- Server load from the catalogue file attach after restart: item blind-08 (health field catalogueUp)
- A user posts the app's wrong verdict publicly (social media): item blind-13 (reviews and mentions share the owner gap)
- The Mac user password and remote login: n/a: covered in the Mac security check, not repeated

Could not check: the Mac itself, the live data, Apple, RevenueCat, Cloudflare, Anthropic and GitHub dashboards, the domain registrar, the Mac's ~/bin scripts, the home router.
