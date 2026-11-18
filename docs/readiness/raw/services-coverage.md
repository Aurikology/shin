# services coverage: every service crossed with every failure mode

Item numbers refer to services.jsonl (services-NN). "n/a" means the pairing does not apply, with the reason.

## Apple developer account and fee
- Apple developer account and fee x goes down: item services-03 and item services-04
- Apple developer account and fee x gets slow: n/a: no runtime call to the developer account from the server or the app
- Apple developer account and fee x returns wrong or changed data: n/a: not a data source
- Apple developer account and fee x changes its API: item services-05 (signing key) and item services-06 (SDK minimum)
- Apple developer account and fee x raises price or ends free tier: item services-03 (fee); Apple commission is a money question, not an operational event
- Apple developer account and fee x changes terms: item services-08 and item services-31
- Apple developer account and fee x suspends or bans our account: item services-04
- Apple developer account and fee x is breached: item services-30
- Apple developer account and fee x credential expires or leaks: item services-05 and item services-30
- Apple developer account and fee x renewal lapses: item services-03

## App Store Connect (agreements, tax, banking, payouts)
- App Store Connect (agreements, tax, banking, payouts) x goes down: item services-08 (an outage only delays store changes, no runtime effect)
- App Store Connect (agreements, tax, banking, payouts) x gets slow: n/a: no runtime dependence
- App Store Connect (agreements, tax, banking, payouts) x returns wrong or changed data: n/a: no data returned to the app
- App Store Connect (agreements, tax, banking, payouts) x changes its API: item services-05 (API key); no store API used at runtime
- App Store Connect (agreements, tax, banking, payouts) x raises price or ends free tier: item services-03
- App Store Connect (agreements, tax, banking, payouts) x changes terms: item services-08
- App Store Connect (agreements, tax, banking, payouts) x suspends or bans our account: item services-04 and item services-08
- App Store Connect (agreements, tax, banking, payouts) x is breached: item services-30
- App Store Connect (agreements, tax, banking, payouts) x credential expires or leaks: item services-05
- App Store Connect (agreements, tax, banking, payouts) x renewal lapses: item services-08

## TestFlight
- TestFlight x goes down: n/a: affects testers only, not shoppers
- TestFlight x gets slow: n/a: not a runtime dependency
- TestFlight x returns wrong or changed data: n/a: no data
- TestFlight x changes its API: n/a: no API used at runtime
- TestFlight x raises price or ends free tier: n/a: free with the account
- TestFlight x changes terms: item services-31
- TestFlight x suspends or bans our account: item services-04
- TestFlight x is breached: item services-30
- TestFlight x credential expires or leaks: item services-05
- TestFlight x renewal lapses: n/a: TestFlight builds expire after 90 days (assumed, general Apple practice) and matter only if launch slips; public users come from the App Store build

## Apple in-app purchase and StoreKit
- Apple in-app purchase and StoreKit x goes down: item services-09 (client side: the purchase screen shows Try again)
- Apple in-app purchase and StoreKit x gets slow: item services-09
- Apple in-app purchase and StoreKit x returns wrong or changed data: n/a: Apple price and tax are set in App Store Connect, not read at runtime
- Apple in-app purchase and StoreKit x changes its API: n/a: no server use of StoreKit; RevenueCat wraps it (item services-11)
- Apple in-app purchase and StoreKit x raises price or ends free tier: item services-08
- Apple in-app purchase and StoreKit x changes terms: item services-08 and item services-31
- Apple in-app purchase and StoreKit x suspends or bans our account: item services-04
- Apple in-app purchase and StoreKit x is breached: item services-30
- Apple in-app purchase and StoreKit x credential expires or leaks: n/a: no credential in Pexi code (public SDK keys only)
- Apple in-app purchase and StoreKit x renewal lapses: item services-03

## RevenueCat (client SDK and server v1 call)
- RevenueCat (client SDK and server v1 call) x goes down: item services-09
- RevenueCat (client SDK and server v1 call) x gets slow: item services-09
- RevenueCat (client SDK and server v1 call) x returns wrong or changed data: n/a: the answer is yes or no; a wrong answer from a bad key is item services-10
- RevenueCat (client SDK and server v1 call) x changes its API: item services-11
- RevenueCat (client SDK and server v1 call) x raises price or ends free tier: item services-11 (1% past US$2,500 a month, in the cost list)
- RevenueCat (client SDK and server v1 call) x changes terms: item services-31
- RevenueCat (client SDK and server v1 call) x suspends or bans our account: item services-09 and item services-10 (a suspended account would read every user as not Plus)
- RevenueCat (client SDK and server v1 call) x is breached: item services-30
- RevenueCat (client SDK and server v1 call) x credential expires or leaks: item services-10
- RevenueCat (client SDK and server v1 call) x renewal lapses: n/a: free account, no renewal date found

## Anthropic API
- Anthropic API x goes down: item services-12
- Anthropic API x gets slow: item services-12 (30s timeout, 6s shopper wait)
- Anthropic API x returns wrong or changed data: n/a: the estimate is labelled as an estimate; a poor range is a quality issue, not a service event
- Anthropic API x changes its API: item services-13
- Anthropic API x raises price or ends free tier: item services-12 (credits), item services-14 (monthly cap reached through growth) and item services-32
- Anthropic API x changes terms: item services-31
- Anthropic API x suspends or bans our account: item services-12 (key revoked or account closed)
- Anthropic API x is breached: item services-30
- Anthropic API x credential expires or leaks: item services-12 and item services-30
- Anthropic API x renewal lapses: item services-12 (billing lapse)

## Cloudflare tunnel, DNS and TLS
- Cloudflare tunnel, DNS and TLS x goes down: item services-02
- Cloudflare tunnel, DNS and TLS x gets slow: item services-02
- Cloudflare tunnel, DNS and TLS x returns wrong or changed data: n/a: not a data source
- Cloudflare tunnel, DNS and TLS x changes its API: n/a: no API called from Pexi code
- Cloudflare tunnel, DNS and TLS x raises price or ends free tier: item services-32 and item services-02
- Cloudflare tunnel, DNS and TLS x changes terms: item services-02 and item services-31
- Cloudflare tunnel, DNS and TLS x suspends or bans our account: item services-02
- Cloudflare tunnel, DNS and TLS x is breached: item services-30
- Cloudflare tunnel, DNS and TLS x credential expires or leaks: item services-02 and item services-30 (tunnel credential)
- Cloudflare tunnel, DNS and TLS x renewal lapses: item services-01 and item services-02

## anjiawenda.com domain and registrar
- anjiawenda.com domain and registrar x goes down: item services-01 and item services-02
- anjiawenda.com domain and registrar x gets slow: n/a: DNS latency is not a risk found
- anjiawenda.com domain and registrar x returns wrong or changed data: n/a: nothing is returned
- anjiawenda.com domain and registrar x changes its API: n/a: no API
- anjiawenda.com domain and registrar x raises price or ends free tier: item services-32 (about US$10 a year)
- anjiawenda.com domain and registrar x changes terms: item services-01
- anjiawenda.com domain and registrar x suspends or bans our account: item services-01 and item services-02
- anjiawenda.com domain and registrar x is breached: item services-30
- anjiawenda.com domain and registrar x credential expires or leaks: item services-01 (registrar login)
- anjiawenda.com domain and registrar x renewal lapses: item services-01

## Open Food Facts live lookup
- Open Food Facts live lookup x goes down: item services-15
- Open Food Facts live lookup x gets slow: item services-15 (4s timeout, falls back to the pack reading)
- Open Food Facts live lookup x returns wrong or changed data: item services-20
- Open Food Facts live lookup x changes its API: item services-15 (v2 endpoint)
- Open Food Facts live lookup x raises price or ends free tier: n/a: free
- Open Food Facts live lookup x changes terms: n/a: licence is a legal question, out of scope
- Open Food Facts live lookup x suspends or bans our account: item services-15 (address ban)
- Open Food Facts live lookup x is breached: n/a: public data, no account
- Open Food Facts live lookup x credential expires or leaks: n/a: no credential
- Open Food Facts live lookup x renewal lapses: n/a: no renewal

## Open Beauty, Pet and Products Facts and Open Prices (dumps)
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x goes down: n/a: loaded from local dumps, no runtime call
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x gets slow: n/a: no runtime call
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x returns wrong or changed data: item services-19 and item services-20
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x changes its API: n/a: dump format; a break fails at import, see item services-19
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x raises price or ends free tier: n/a: free
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x changes terms: n/a: licence is a legal question, out of scope
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x suspends or bans our account: n/a: no account
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x is breached: n/a: public data
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x credential expires or leaks: n/a: no credential
- Open Beauty, Pet and Products Facts and Open Prices (dumps) x renewal lapses: n/a: no renewal

## OSM Overpass
- OSM Overpass x goes down: item services-16
- OSM Overpass x gets slow: item services-16
- OSM Overpass x returns wrong or changed data: item services-16 (an empty list is the failure mode)
- OSM Overpass x changes its API: n/a: query syntax stable; a break would act as item services-16
- OSM Overpass x raises price or ends free tier: item services-16 (commercial use asks for self-hosting)
- OSM Overpass x changes terms: item services-16
- OSM Overpass x suspends or bans our account: item services-16 (address block)
- OSM Overpass x is breached: n/a: no account
- OSM Overpass x credential expires or leaks: n/a: no credential
- OSM Overpass x renewal lapses: n/a: no renewal

## Icecat and USDA (local dumps)
- Icecat and USDA (local dumps) x goes down: n/a: loaded from local dumps, no runtime call
- Icecat and USDA (local dumps) x gets slow: n/a: no runtime call
- Icecat and USDA (local dumps) x returns wrong or changed data: item services-19 and item services-20
- Icecat and USDA (local dumps) x changes its API: n/a: dump format; a break fails at import, see item services-19
- Icecat and USDA (local dumps) x raises price or ends free tier: n/a: free
- Icecat and USDA (local dumps) x changes terms: n/a: licence is a legal question, out of scope
- Icecat and USDA (local dumps) x suspends or bans our account: n/a: no account
- Icecat and USDA (local dumps) x is breached: n/a: public data
- Icecat and USDA (local dumps) x credential expires or leaks: n/a: no credential
- Icecat and USDA (local dumps) x renewal lapses: n/a: no renewal

## BC Liquor Distribution Branch and StatCan (local files)
- BC Liquor Distribution Branch and StatCan (local files) x goes down: n/a: no runtime call
- BC Liquor Distribution Branch and StatCan (local files) x gets slow: n/a: no runtime call
- BC Liquor Distribution Branch and StatCan (local files) x returns wrong or changed data: item services-19 and item services-20
- BC Liquor Distribution Branch and StatCan (local files) x changes its API: n/a: files; a break fails at import, see item services-19
- BC Liquor Distribution Branch and StatCan (local files) x raises price or ends free tier: n/a: free
- BC Liquor Distribution Branch and StatCan (local files) x changes terms: n/a: licence is a legal question, out of scope
- BC Liquor Distribution Branch and StatCan (local files) x suspends or bans our account: n/a: no account
- BC Liquor Distribution Branch and StatCan (local files) x is breached: n/a: public data
- BC Liquor Distribution Branch and StatCan (local files) x credential expires or leaks: n/a: no credential
- BC Liquor Distribution Branch and StatCan (local files) x renewal lapses: n/a: no renewal

## Project Hammer (weekly download)
- Project Hammer (weekly download) x goes down: item services-17
- Project Hammer (weekly download) x gets slow: n/a: a 0.5GB weekly job; slowness only delays it, see item services-17
- Project Hammer (weekly download) x returns wrong or changed data: item services-18
- Project Hammer (weekly download) x changes its API: item services-17 (file renamed or moved)
- Project Hammer (weekly download) x raises price or ends free tier: n/a: free
- Project Hammer (weekly download) x changes terms: n/a: use and licence are legal questions, out of scope
- Project Hammer (weekly download) x suspends or bans our account: item services-17 (author blocks us) and item services-20 (author asks us to stop)
- Project Hammer (weekly download) x is breached: n/a: no account
- Project Hammer (weekly download) x credential expires or leaks: n/a: no credential
- Project Hammer (weekly download) x renewal lapses: item services-17 (site disappears)

## Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction)
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x goes down: n/a: not called at runtime; crawls were one-off and withheld sources are hidden
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x gets slow: n/a: not called at runtime
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x returns wrong or changed data: item services-20 (rows can be removed or the source withheld)
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x changes its API: n/a: no API used
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x raises price or ends free tier: n/a: no account
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x changes terms: n/a: legal question, out of scope
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x suspends or bans our account: item services-20 (a retailer blocks or asks us to stop)
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x is breached: n/a: no account
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x credential expires or leaks: n/a: no credential
- Retailer sources (walmart.ca, Canadian Tire, Save-On-Foods, Metro, ANBL, Return-It, ConsignAction) x renewal lapses: n/a: no renewal

## GitHub (Actions alarm, Pages legal pages, mirror)
- GitHub (Actions alarm, Pages legal pages, mirror) x goes down: item services-21 (Pages) and item services-22 (alarm)
- GitHub (Actions alarm, Pages legal pages, mirror) x gets slow: item services-22 (scheduled runs can be delayed)
- GitHub (Actions alarm, Pages legal pages, mirror) x returns wrong or changed data: n/a: no data used
- GitHub (Actions alarm, Pages legal pages, mirror) x changes its API: n/a: workflow syntax stable; a break would act as item services-22
- GitHub (Actions alarm, Pages legal pages, mirror) x raises price or ends free tier: item services-22 (US$12 a month included usage)
- GitHub (Actions alarm, Pages legal pages, mirror) x changes terms: item services-31
- GitHub (Actions alarm, Pages legal pages, mirror) x suspends or bans our account: item services-21 and item services-22
- GitHub (Actions alarm, Pages legal pages, mirror) x is breached: item services-30
- GitHub (Actions alarm, Pages legal pages, mirror) x credential expires or leaks: item services-30
- GitHub (Actions alarm, Pages legal pages, mirror) x renewal lapses: n/a: free account

## GitLab (origin and deploy source)
- GitLab (origin and deploy source) x goes down: item services-23
- GitLab (origin and deploy source) x gets slow: n/a: slow fetch only delays a deploy
- GitLab (origin and deploy source) x returns wrong or changed data: n/a: code only
- GitLab (origin and deploy source) x changes its API: n/a: git protocol stable
- GitLab (origin and deploy source) x raises price or ends free tier: n/a: free plan, no deploy cost seen
- GitLab (origin and deploy source) x changes terms: item services-31
- GitLab (origin and deploy source) x suspends or bans our account: item services-23
- GitLab (origin and deploy source) x is breached: item services-30
- GitLab (origin and deploy source) x credential expires or leaks: item services-23 and item services-30 (SSH key as @jaminke)
- GitLab (origin and deploy source) x renewal lapses: n/a: no renewal

## Gmail support inbox and alarm emails
- Gmail support inbox and alarm emails x goes down: item services-24
- Gmail support inbox and alarm emails x gets slow: n/a: not time-critical
- Gmail support inbox and alarm emails x returns wrong or changed data: n/a: no data
- Gmail support inbox and alarm emails x changes its API: n/a: no API used
- Gmail support inbox and alarm emails x raises price or ends free tier: n/a: free
- Gmail support inbox and alarm emails x changes terms: item services-31
- Gmail support inbox and alarm emails x suspends or bans our account: item services-24
- Gmail support inbox and alarm emails x is breached: item services-30
- Gmail support inbox and alarm emails x credential expires or leaks: item services-24
- Gmail support inbox and alarm emails x renewal lapses: item services-24 (inactive account closure, assumed)

## Tailscale
- Tailscale x goes down: item services-25
- Tailscale x gets slow: n/a: remote admin only
- Tailscale x returns wrong or changed data: n/a: no data
- Tailscale x changes its API: n/a: no API used
- Tailscale x raises price or ends free tier: item services-32
- Tailscale x changes terms: item services-31
- Tailscale x suspends or bans our account: item services-25
- Tailscale x is breached: item services-30
- Tailscale x credential expires or leaks: item services-25 (key expiry)
- Tailscale x renewal lapses: item services-25

## ntfy.sh and Healthchecks (Lookout alert path)
- ntfy.sh and Healthchecks (Lookout alert path) x goes down: item services-26
- ntfy.sh and Healthchecks (Lookout alert path) x gets slow: item services-26
- ntfy.sh and Healthchecks (Lookout alert path) x returns wrong or changed data: n/a: alerts are generated by us
- ntfy.sh and Healthchecks (Lookout alert path) x changes its API: n/a: no API risk beyond item services-26
- ntfy.sh and Healthchecks (Lookout alert path) x raises price or ends free tier: item services-32
- ntfy.sh and Healthchecks (Lookout alert path) x changes terms: item services-31
- ntfy.sh and Healthchecks (Lookout alert path) x suspends or bans our account: item services-26
- ntfy.sh and Healthchecks (Lookout alert path) x is breached: item services-30
- ntfy.sh and Healthchecks (Lookout alert path) x credential expires or leaks: item services-26 (the topic name is the only secret, assumed)
- ntfy.sh and Healthchecks (Lookout alert path) x renewal lapses: n/a: free plans

## Dropbox
- Dropbox x goes down: n/a: not used for backups; the real backups are on the Mac disk (Mac report), so no Dropbox dependency found
- Dropbox x gets slow: n/a: not used
- Dropbox x returns wrong or changed data: n/a: not used
- Dropbox x changes its API: n/a: not used
- Dropbox x raises price or ends free tier: n/a: not used
- Dropbox x changes terms: n/a: not used
- Dropbox x suspends or bans our account: n/a: not used
- Dropbox x is breached: item services-30 (the breach plan lists it as a rotation row)
- Dropbox x credential expires or leaks: n/a: not used
- Dropbox x renewal lapses: n/a: not used

## Google ML Kit (barcode and text pods)
- Google ML Kit (barcode and text pods) x goes down: n/a: runs on the phone, no server
- Google ML Kit (barcode and text pods) x gets slow: n/a: on device
- Google ML Kit (barcode and text pods) x returns wrong or changed data: n/a: a wrong decode is a scan quality issue, not a service event
- Google ML Kit (barcode and text pods) x changes its API: item services-27 and item services-28
- Google ML Kit (barcode and text pods) x raises price or ends free tier: n/a: free
- Google ML Kit (barcode and text pods) x changes terms: item services-28
- Google ML Kit (barcode and text pods) x suspends or bans our account: n/a: no account
- Google ML Kit (barcode and text pods) x is breached: item services-28
- Google ML Kit (barcode and text pods) x credential expires or leaks: n/a: no credential
- Google ML Kit (barcode and text pods) x renewal lapses: n/a: no renewal

## npm registry and Capacitor plugins
- npm registry and Capacitor plugins x goes down: item services-29
- npm registry and Capacitor plugins x gets slow: n/a: a deploy only waits
- npm registry and Capacitor plugins x returns wrong or changed data: n/a: pinned by lockfile; a bad version arrives only on a deliberate update
- npm registry and Capacitor plugins x changes its API: item services-29 (breaking change on upgrade only)
- npm registry and Capacitor plugins x raises price or ends free tier: n/a: free
- npm registry and Capacitor plugins x changes terms: n/a: package licences, out of scope
- npm registry and Capacitor plugins x suspends or bans our account: item services-29 (a package yanked or an account removed)
- npm registry and Capacitor plugins x is breached: item services-29
- npm registry and Capacitor plugins x credential expires or leaks: n/a: no credential
- npm registry and Capacitor plugins x renewal lapses: n/a: no renewal

## CocoaPods trunk and Capacitor iOS pods
- CocoaPods trunk and Capacitor iOS pods x goes down: item services-27 (read-only from 2026-12-02)
- CocoaPods trunk and Capacitor iOS pods x gets slow: n/a: CDN slowness only affects builds
- CocoaPods trunk and Capacitor iOS pods x returns wrong or changed data: n/a: pinned by Podfile.lock
- CocoaPods trunk and Capacitor iOS pods x changes its API: item services-27
- CocoaPods trunk and Capacitor iOS pods x raises price or ends free tier: n/a: free
- CocoaPods trunk and Capacitor iOS pods x changes terms: item services-27
- CocoaPods trunk and Capacitor iOS pods x suspends or bans our account: n/a: no account
- CocoaPods trunk and Capacitor iOS pods x is breached: n/a: no account
- CocoaPods trunk and Capacitor iOS pods x credential expires or leaks: n/a: no credential
- CocoaPods trunk and Capacitor iOS pods x renewal lapses: n/a: no renewal

## macOS update channel and Xcode download
- macOS update channel and Xcode download x goes down: n/a: an Apple outage only delays an update
- macOS update channel and Xcode download x gets slow: n/a: not a runtime path
- macOS update channel and Xcode download x returns wrong or changed data: n/a: no data
- macOS update channel and Xcode download x changes its API: item services-06
- macOS update channel and Xcode download x raises price or ends free tier: n/a: free
- macOS update channel and Xcode download x changes terms: item services-06
- macOS update channel and Xcode download x suspends or bans our account: n/a: no account link
- macOS update channel and Xcode download x is breached: item services-07 (a forced update restarts the Mac)
- macOS update channel and Xcode download x credential expires or leaks: n/a: no credential
- macOS update channel and Xcode download x renewal lapses: n/a: no renewal

## Mailbox repo host (deploy notices)
- Mailbox repo host (deploy notices) x goes down: n/a: developer channel only; a failure loses notices, not service; a message arrived on 2026-11-18, so it works
- Mailbox repo host (deploy notices) x gets slow: n/a: not time-critical
- Mailbox repo host (deploy notices) x returns wrong or changed data: n/a: no data
- Mailbox repo host (deploy notices) x changes its API: n/a: git protocol
- Mailbox repo host (deploy notices) x raises price or ends free tier: n/a: private repo, free
- Mailbox repo host (deploy notices) x changes terms: item services-31
- Mailbox repo host (deploy notices) x suspends or bans our account: n/a: account not in a runtime path
- Mailbox repo host (deploy notices) x is breached: item services-30
- Mailbox repo host (deploy notices) x credential expires or leaks: item services-30
- Mailbox repo host (deploy notices) x renewal lapses: n/a: no renewal

## Embedding model host (origin of the model file)
- Embedding model host (origin of the model file) x goes down: item services-29 (the model sits in the deploy overlay; the only copy is on the same disk)
- Embedding model host (origin of the model file) x gets slow: n/a: used only at rebuild
- Embedding model host (origin of the model file) x returns wrong or changed data: n/a: not read at runtime
- Embedding model host (origin of the model file) x changes its API: item services-29
- Embedding model host (origin of the model file) x raises price or ends free tier: n/a: free
- Embedding model host (origin of the model file) x changes terms: n/a: no account
- Embedding model host (origin of the model file) x suspends or bans our account: n/a: no account
- Embedding model host (origin of the model file) x is breached: n/a: no account
- Embedding model host (origin of the model file) x credential expires or leaks: n/a: no credential
- Embedding model host (origin of the model file) x renewal lapses: n/a: no renewal

## Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys)
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x goes down: n/a: retired or not called for shoppers (Gemini retired 2026-11-07; Notion an old sink; source keys optional; Voyage use not fully confirmed)
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x gets slow: n/a: not called
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x returns wrong or changed data: n/a: not used
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x changes its API: n/a: not used
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x raises price or ends free tier: n/a: not used
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x changes terms: n/a: not used
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x suspends or bans our account: n/a: not used
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x is breached: item services-30 (keys still listed in settings; revoke any unused)
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x credential expires or leaks: item services-30
- Gemini, Notion, Best Buy, eBay, Soldcomps, Voyage (old or optional keys) x renewal lapses: n/a: not used

