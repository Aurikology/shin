# success: coverage grid (angle: good things that break things or need a response)

Estimates are labelled assumed in the items. Nothing was measured on the Mac; no load test was run (read only).

## Traffic spike: where it breaks, one line per part

- Node main thread and sync SQLite (CPU): item success-01
- SQLite write locks, event batches, backup and refresh overlap: item success-02
- Per-address door and paid limits treating a campus, store or carrier as one attacker: item success-03
- Free scans per address cap (30 a day) once limits go on: item success-04
- RevenueCat lookup valve (120 a minute) misreading subscribers as free: item success-05
- Claude monthly cap (1,000) and its per-device and per-network limits: item success-07
- Limiters forgetting past 5,000 keys: item success-08
- Overpass (public server, 500-square cache, no shared in-flight lookups): item success-09
- Cloudflare free tunnel, home uplink, fanless Air heat: item success-20
- What shoppers see when it breaks (spinner, 'I need a connection', 'lots of lookups' 429, paywall, empty store list, 'No price here yet'): inside items 01, 03, 04, 05, 07, 09
- Detection of a spike (30 minute probe only): inside item success-01
- Nobody available during a spike: item success-21
- Pack download bandwidth (6.5 MB brotli per install): n/a, the phone no longer fetches the pack (app/public/js/offline-aisle.js:59, primeOfflineAisle does nothing)
- Static files and the web build behind the tunnel: n/a, the iOS app is bundled; only API calls go through the tunnel (assumed from native/README.md)
- Anthropic account rate limits or credit running out: inside item success-07 (credits named in the response); account tier not checked
- Cloudflare or tunnel plan limits: inside item success-20, assumed

## Purchases and users

- Many Plus purchases at once, server side (RevenueCat lookup valve): item success-05
- A new buyer's first scan after paying (stale 'not Plus' for ten minutes): item success-06
- Many Plus purchases, money side (payouts, tax threshold, renewals, refunds): item success-10
- Many new users in Quebec: item success-11
- Users outside Canada installing: item success-12
- Revenue dashboards and alerts for sales: inside item success-10

## People and inquiries

- Support volume beyond two people (includes data requests on a 30 day clock): item success-13
- Press or a creator asking for comment or a demo: item success-14
- Retailer or brand asking to partner, advertise or license data (operational reply only, no legal view): item success-15
- Investor, accelerator or acquirer: item success-16
- Strong reviews and Apple featuring, and review replies: item success-17

## Data growth

- Typed-name search over a growing price table: item success-18
- Disk fill from the request log, tables and same-disk backups: item success-19
- Scan lookups for the weekly free limit as the scan table grows: n/a, indexed by device and time (app/src/scans.ts:91, scan_device_week), no item
- Barcode catalogue lookup as the catalogue grows: n/a, a keyed read measured at 0.2 ms over 5.18 million rows (app/server.ts:122-125)
- Catalogue text and vector search time as the index grows: n/a to this angle (runs in a worker, search is another lens); a note only: 735 ms was measured at 6 percent of the vector index (app/server.ts:636)
- Retention sweeps on large tables (synchronous deletes at 12 and 24 months): n/a in year one, nothing is old enough; the request log sweep is inside item success-19
- Typed prices (corrections) volume and poisoning: n/a to this angle, it is a bad-event lens (security FINDINGS B1 to B3)

## Pairings that do not apply

- Press asking about the data sources or scraping: n/a here (operational only, another lens)
- A retailer demanding removal of its prices: n/a here, that is a bad event, not a good one
- Google Play or Android users: n/a, ruled iPhone only (docs/decisions.md:3088)
- iPad users after a feature: n/a, ruled iPhone only 2026-11-09 (docs/launch-gaps-2026-11-06.md:156-163)
