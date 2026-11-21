# Pexi as it runs today (2026-11-21 evening)

Facts gathered from the repo, the live server and a read-only process list taken on the server Mac at 22:36 UTC.
Anything you rely on, check where you can.

## The goal

Jamin wants Pexi on the App Store, every function working, and able to carry thousands to tens of thousands of users.

## The product

- Pexi is an iPhone app (a web app inside a native wrapper). Point the camera at a grocery product or type a name, and it
  says whether the price is good, using prices it knows from shops in Canada.
- Pexi Plus is a paid subscription bought through Apple, managed by RevenueCat. The free scan limit is off until
  a test purchase works. 0 purchases so far.
- Real use in the last 14 days: 19 phones, about 103 scans. 44% of scans get any answer; about a quarter get a
  shop price.
- When Pexi's own data has no price, it can ask Claude (Haiku 5.5) for a typical range, if the shopper agreed;
  capped at 10,000 asks a month.

## How a scan travels

1. The phone (app installed from the App Store) calls one web address, relay.anjiawenda.com. The app is built so
   it can talk to no other address.
2. Cloudflare (free plan) receives it and passes it through a tunnel to a laptop at Jamin's home.
3. The laptop runs one Node server process with SQLite files: a product catalogue over 4 GB (read only), a
   shopper data file (scans, devices, usage events), price data.
4. The server may call outside services: Open Food Facts (product names, 12 a minute), OpenStreetMap Overpass
   (nearby shops), Anthropic Claude, RevenueCat (who has Plus). A weekly job downloads a public price file
   (Project Hammer).
5. Privacy policy and terms are static pages on GitHub Pages.

## The server laptop

- MacBook Air M1, 8 GB memory, at Jamin's home on home internet (upload about 234 Mbps). It ran flat on battery on
  2026-11-18 (about 2 hours down). Disk encryption (FileVault) is off. Tailscale is installed.
- Free memory at the check: about 85 MB; swap 264 MB used. Apple's own processes about 2.5 GB.
- One macOS user account runs everything: the live server (about 270 MB, peaked near 2 GB under load), the
  Cloudflare tunnel, scheduled jobs (backup, price refresh, deploy checker, health report, a dead-man alert),
  five Claude Code sessions (about 1.3 GB; two run with every permission check off and can drive Chrome, one is
  controlled from Jamin's phone, one receives work from Jamin's PC), and Spotify (used as a wake alarm).
- Under today's memory pressure the server's load test broke at 16 users sending non-stop; on an earlier day with
  room to spare a second copy broke at 512.
- Deploys: a push to the main branch on GitHub is picked up by a checker on the laptop every 30 seconds; it runs
  the tests and deploys only if they pass.
- Alerts: a GitHub Actions job probes the server every 30 minutes and emails Jamin when it fails.
- Backups: a nightly copy on the same laptop; no copy outside the house yet.

## People

- Jamin: university student, the only engineer and operator, the only one who commits code. Starts a full-time
  internship in May 2027.
- Aurik: partner on screens, French text and phone testing. Their agreement is not yet in place.
- Support: one email address on the support page.

## Money

- Apple takes its cut and pays out; RevenueCat sits between. Domain paid to 2027-08-19. Cloudflare free. No other
  paid hosting.
