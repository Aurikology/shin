# external lens: coverage (2026-11-18)

Each line is one outside lesson I considered, then the item that covers it or why it does not apply to Pexi.
"Checked in repo" means I read the code or doc; "assumed" means I could not see it from here.
Web pages marked "snippet" were seen only as search-result summaries, not read in full.

## Apple: review rules, rejections, termination

- Apple 2.1 App Completeness (crashes, backend not live during review): item external-03
- Apple 2.1(b) in-app purchases complete and functional for the reviewer: items external-21, external-22
- Apple 3.1.1 restore mechanism required: n/a: Restore Purchases button exists (app/public/js/screens/paywall.js:210,426); only its support use is an item (external-06)
- Apple 3.1.2 subscription disclosures, price prominence, terms and privacy links on paywall: n/a: paywall shows price, terms, privacy and restore (paywall.js:129-131,301-302,357-358); Quebec consumer-law angle is already finding F3
- Apple 3.1.2(a) subscription available on all the user's devices: item external-07
- Apple 3.1.2(a) cannot force reviews or ratings: item external-18 (the app uses Apple's own prompt)
- Apple 3.1.3 / external purchase links: n/a: Pexi sells only through Apple in-app purchase (docs/store/listing.md:124)
- Apple 4.2 minimum functionality, web wrapper rejection: n/a: camera barcode scanning, native shell and offline pack go beyond a repackaged website; it is a launch-approval risk, not a post-launch event
- Apple 4.3 spam / similar-to-terminated-account flags: item external-02
- Apple 5.1.1 / 5.1.2 privacy policy and label mismatch, third-party data sharing: n/a: already findings E1 to E4 (docs/security-check/FINDINGS.md:59-62); privacy manifest ITMS-91053 and 91061 upload errors fall under E4
- Apple 5.1.1(v) in-app account deletion: n/a: Pexi has no accounts
- Apple 1.2 user-generated content moderation: n/a: shoppers submit prices only through typed price reports; no chat, posts or profiles (assumed; not re-audited here)
- Apple 1.4.3 / alcohol and age rating answers (2.3.6): item external-17
- Apple 1.5 developer contact info reachable: folded into external-06 (support inbox owner unknown); banned old-name concern is another worker's lens
- Apple membership expiry and renewal glitches: item external-01
- Apple account termination and removal after approval: item external-02
- Apple "apps that stop working may be removed": items external-03, external-08
- Apple annual SDK deadline, iOS release breakage: item external-19
- Apple review-manipulation expulsion: item external-18
- Apple TestFlight 90-day build expiry: n/a: pre-launch only; after release shoppers use the App Store build
- Apple Small Business Program, tax, banking agreements lapsing: n/a: Paid Apps Agreement, tax forms and bank are Active (docs/launch-gaps-2026-11-06.md:198-202, checked 2026-11-07); GST/HST condition is finding F4

## RevenueCat

- Test Store or wrong SDK key in release build: item external-21
- Entitlement not attached to product / purchase not reaching RevenueCat / paid but locked: item external-06
- Customer-info cache and offline behaviour (SDK side): n/a: the phone only shows Plus from the cache for display; the server decides the limit, so the server-side lookup is the real exposure (external-05, external-26)
- Restore behaviour and custom app user id transfers: item external-07
- Server notifications and refund lag: item external-20
- Silent failure of the server's own RevenueCat lookup: item external-05
- Rate limits and lookup ceiling: item external-26 (RevenueCat's own published limit not read; page fetch failed)
- Webhook errors per RevenueCat checklist: n/a: Pexi configures no webhook (grep of app, mac, docs, scripts found none)
- Aliases and anonymous ids: n/a: Pexi uses its own custom id, not RevenueCat's anonymous ids (covered by external-07)
- Phased release and 24-hour wait after first release: item external-22
- Plan limits ($2,500 monthly tracked revenue threshold): n/a: a fee line, not an outage; revisit if revenue approaches it
- Sandbox vs production receipt confusion: n/a: handled in Aurik's sandbox purchase item (docs/launch-gaps-2026-11-06.md, item 7), a pre-launch test

## Capacitor and the phone app

- WKWebView localStorage eviction: item external-16
- Origin/scheme change breaking old builds: item external-15
- Old build never updating, no forced update: item external-15
- Xcode 26 / new iOS SDK deadlines: item external-19
- Privacy manifest for Capacitor and plugins: n/a: covered by E4 in FINDINGS (needs the real build to prove)
- Plugin or native SDK going unmaintained (Google ML Kit, RevenueCat plugin): n/a: no source found that applies yet; revisit at the first iOS major release (folded into the September check in external-19)

## Cloudflare Tunnel

- Tunnel down (1033) vs origin down (502) triage, Cloudflare incidents, no SLA, free-plan termination: item external-08
- Single cloudflared instance on one host: item external-08
- Bot Fight Mode challenging mobile API traffic: item external-09
- cloudflared version support (one year), manual updates: item external-10
- Domain expiry: item external-14
- TLS certificate renewal: n/a: Cloudflare issues and renews the edge certificate itself (Google Trust Services certificate valid 2026-10-18 to 2027-01-16, docs/security-check/v4-v5-poison-dynamic.md:157); no certificate sits on the Mac
- Streaming buffering, websockets, ICMP and WARP range issues: n/a: Pexi sends plain request and response JSON, no streams or websockets
- Too many open files, UDP buffer messages: n/a: harmless or load-level only for one small server

## Small web service operations checklists

- Uptime monitoring that does not depend on the monitored machine: item external-11 (alarm exists; second channel missing)
- Alerting reaches a person who is awake and a second person: item external-11
- Backups: off-site copy, tested restore, restore doc usable by a second person: items external-13 (what is not backed up) and known findings D1 and D2
- Disk and log growth: item external-12
- Reboot and power loss recovery: item external-04
- Secrets rotation and the record of it: item external-23
- Status page for customers: n/a: shoppers have no account or email to notify, and a public status page adds nothing to paying or staying; the app's own offline message is covered in external-08
- On-call rota: n/a: one-person service; ownership and a second contact are in external-11
- Incident log / post-mortem habit: n/a: a habit, not a launch event; the breach plan already has a log step (docs/privacy/breach-plan.md)
- Dependency vulnerability updates: n/a: security check found no reachable high or critical advisory (docs/security-check/FINDINGS.md:14-17); periodic upgrades are item external-10
- Capacity and load testing: n/a: another worker's lens; only the RevenueCat ceiling was in my scope (external-26)

## Indie launch retrospectives

- Slow downloads, weak conversion, paywall copy: n/a: a marketing outcome, not an operational event
- "My app was down and nobody told me": item external-11 (alarm exists)
- Home-server power cut or hardware loss: items external-04, external-13 (snippet-level evidence only; no detailed post-mortem of a home-hosted iOS backend was found)
- A single platform account holding the whole business: item external-02
- Launch-day IAP not yet working: item external-22

## Third-party services Pexi calls

- Anthropic model retirement and API changes: item external-24
- Anthropic key leaked or credit exhausted: n/a: the 1,000-call monthly cap and its loud alert already exist (docs/readiness/BRIEF.md); rotation covered by external-23
- Open Food Facts and Overpass limits, User-Agent: item external-25
- Icecat, USDA, BC LDB, Project Hammer, Open Prices outages or format changes: n/a: another worker's data-source lens; no outside lesson specific to these was read here
