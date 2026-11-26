# Where Pexi's server runs at public launch (research, 2026-11-26)

Question (Jamin): "did you consider everything, including things like, what happens if we exceed the limit, where our
main users will be, what are their legal terms and so much other considerations".

How this was done: every provider fact below was read on 2026-11-26 from the page or file named next to it (provider
pricing pages, their public pricing APIs, contract PDFs, the Bank of Canada rate). Our own numbers come from the repo and
from the Mac's reports in the PC-Mac mailbox, cited by file or by date. Anything not read from a source is marked
**ASSUMPTION**. Nothing was bought, signed up for or logged in to. Earlier pass on the same question:
`docs/launch-gaps-2026-11-06.md` item 93 (priced 2026-11-21, recommended OVH VPS-2); this file re-checks and extends it.

Money: USD to CAD at 1.4219 and EUR to CAD at 1.5591 (Bank of Canada, 2026-11-25,
https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD/json). "With tax" adds 13% Ontario HST as the
worst case (**ASSUMPTION** on the rate, not fetched today; whether a foreign provider charges it depends on its
registration under the simplified GST/HST regime for non-resident digital suppliers, in force since 2021-07-01,
https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/digital-economy.html).
Card foreign-exchange fees on USD and EUR bills are not included (**ASSUMPTION**: often around 2.5%, depends on his card).

---

## 1. Requirements, from our own measurements

| Need | Number | Source |
|---|---|---|
| Runtime | Node, packages declare >=22.18; built-in `node:sqlite`, no native add-ons, so x86 or ARM Linux works; fallback pin Node 24.14.0 | `mac/README.md` step 2; `docs/launch-gaps-2026-11-06.md` item 93 |
| Server memory | peak RSS 1,696 MB (probe A rerun), 1,955 MB and 1,962 MB in the load-test runs; rest 245 to 492 MB | mailbox 2026-11-25 (cache-verify and load-test reports) |
| Whole machine | 8 GB Mac: swap 2.4 GB in use; earlier 3.0 of 4.0 GB swap, 18.86M swap-ins; free memory as low as 39 to 105 MB during load | mailbox 2026-11-26 launch sweep; 2026-11-25 health-timeout report |
| Answer time | warm median 196 ms in-process, 399 to 456 ms through the public URL; first answers after a restart 11.1 s and 15.6 s (per-currency pool fill); p90 2.5 to 5.3 s while the Mac was swapping | mailbox 2026-11-25 "Item 2 on live ffde03a" |
| Load | broke at 16 non-stop users on the busy Mac (p95 4.4 to 6.8 s); 512 users on an earlier day with free memory, never re-run with memory recorded; typed search is synchronous SQLite on one thread | mailbox 2026-11-25 load runs; `docs/readiness/review-2026-11-21/REPORT.md` line 28; launch-gaps item 54 |
| Catalogue | `catalogue.db` 4.48 GB, 5.7M products (11-26); the placement work copy 5.5 to 5.6 GB (11-23, 11-24), so the next catalogue is about 5.6 GB | mailbox 2026-11-26 Kroger backup; 2026-11-24/25 placement reports |
| All live data | `~/shin-data` 20 GB (includes catalogue and work copies); nightly backup snapshots 500 to 860 MB each, 14 kept locally; catalogue not in the nightly backup | mailbox 2026-11-24 disk report; `mac/README.md` "The old backup script" |
| Jobs needing room | Hammer refresh needs about 5 GB free; a catalogue change takes a 4.5 GB backup first | `mac/hammer-refresh.sh` header; mailbox 2026-11-26 |
| Mac disk now | 13 GiB free (94%), `disk_low` raised 321 times on 11-24 | mailbox 2026-11-26 launch sweep |
| Outside calls | Anthropic, RevenueCat, Open Food Facts, OpenStreetMap Overpass; Cloudflare carries all traffic | `app/public/js/legal/document.js` lines 128-142 |
| Collectors | Kroger official API (daily, 6,000 calls), Open Prices, Project Hammer CSV (weekly), Metro sitemaps (403 to Python's default user agent, so it sends `curl/8.16.0`), BC liquor | `mac/kroger-refresh.sh`, `mac/hammer-refresh.sh`, `mac/launchd-daemons/`, `notes/legal-review-2026-11-26/B-data-sources.md` line 44 |
| Web address | phones call `relay.anjiawenda.com` through a Cloudflare named tunnel, so moving the tunnel moves the server with no app update | `mac/01-cloudflare-tunnel.md`; launch-gaps item 93 |
| Bandwidth | offline pack 6.50 MB brotli (44 MB uncompressed), not cached by Cloudflare; answers are small | `NOW.md` line 19; launch-gaps item 55 |

Sizing that follows (ASSUMPTIONS, worked from the rows above):

- **Memory: 8 GB.** Server peak about 2 GB, plus room for the operating system to keep the hot part of a 4.5 to 5.6 GB
  catalogue in its file cache, plus a collector or import running beside it. The Mac's stalls were the server being
  paged out to swap (RSS swung from 1,159 MB to 38 MB in 9 minutes, mailbox 2026-11-25), which a dedicated 8 GB box
  without five Claude sessions and Chrome on it should not see. 4 GB is too tight for the catalogue cache.
- **Disk: 75 GB is enough at launch, tight at 12 months.** Today: catalogue 5.6 + one work copy 5.6 + a pre-change
  backup 4.5 + Hammer temp 5 + 14 nightly snapshots at about 1 GB + system and code 5 = about 40 GB. If the catalogue
  doubles to 10 GB and nightlies reach 2 GB (growth guess), about 68 GB. Fixes: keep 7 local nights (off-site keeps 15
  days), or add disk.
- **CPU: 2 to 4 cores.** Search uses under 2 of 8 Mac cores (launch-gaps item 54). Rented cores are likely slower than
  the M1 per core, so the load test must be re-run on the new box before the switch.
- **Disk speed:** every finalist sells NVMe or SSD; none of the pages read publishes an IOPS figure. SQLite in WAL mode
  with a read-mostly catalogue is not expected to be disk-bound once the cache is warm.
- **Users:** "Canada first (Ontario and Quebec heavy), then the US" is the brief's statement; no count of where
  testers are was taken for this file (the scans database is on the Mac). Unverified.

---

## 2. Where users are, and what distance costs

Median round trips between cities over the last two weeks of hourly pings (WonderNetwork, e.g.
https://wondernetwork.com/pings/Montreal/Toronto, read 2026-11-26, 336 samples per pair):

| From \ to | Toronto | Montreal (Beauharnois is about 40 km away) |
|---|---|---|
| Toronto | 0 | 7.9 ms |
| Halifax | 27.9 ms | not taken |
| Calgary | 69.0 ms | 61.9 ms |
| Vancouver | 59.6 ms | 63.1 ms |
| New York | 14.4 ms | 10.0 ms |
| Washington (near Ashburn) | 16.2 ms | 14.2 ms |
| Chicago | 14.3 ms | 21.4 ms |
| Dallas | 32.4 ms | 39.0 ms |
| Miami | 46.6 ms | 41.5 ms |
| Los Angeles | 50.9 ms | 62.8 ms |
| Seattle | 53.0 ms | 64.6 ms |

Reading: any Toronto or Montreal server is within about 70 ms of every Canadian and US city above. A warm answer takes
400 ms and a cold one 11 to 16 s, so location is decided by law, price and reliability, not latency. A US-west server
(Hetzner Hillsboro, Portland row: Toronto to Portland 56.1 ms) would add about 50 ms for Ontario and Quebec users.

---

## 3. Options against every consideration

Prices are the plan closest to the requirement (8 GB memory), read 2026-11-26, monthly, no commitment unless stated.

| Option | Plan and price | CAD/month with HST | Canada site | Past the bandwidth limit | Terms that matter | Company and law | Resize and exit | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Keep the Mac** | Owned, 8 GB, 13 GiB free disk | 0 plus power (not measured) | Ontario home | Home upload speed unknown | Rogers residential terms forbid it: "you may not use ... our Services to: ... operate a server in connection with the Services, including, without limitation, mail, news, file, ... Web ..." and Rogers "may restrict, suspend, block, disconnect or cancel any or all of your Services ... without notice" on breach (Rogers Terms of Service PDF, https://assets.ctfassets.net/8utyj17y1gom/3f94cg1SUOoZNof6HbT49z/6752aaaa023c723d7da34097f9bed439/Rogers_Terms_of_Service_and_Other_Important_Information.pdf). That Rogers is his provider is from launch-gaps item 100, not checked | His own | Cannot grow; disk 94% | **Out for launch.** Broke at 16 users, ran flat on battery 11-18, disk full alarms, ISP terms. He ruled launch hosting is a paid server (2026-11-21, commit 0476263). Keep as collector box. |
| **OVHcloud VPS-2, Beauharnois QC** | 4 vCores, 8 GB, 75 GB NVMe, 1 Gbps, "Unlimited traffic". CAD 13.70 monthly; 13.01 on 6 months upfront; 11.64 on 12 months upfront; no setup fee. Snapshot CAD 0.90, premium backup CAD 3.00, extra disk 50 GB CAD 3.50 (OVH public catalogue API, https://ca.api.ovh.com/v1/order/catalog/public/vps?ovhSubsidiary=CA, currency CAD) | 15.48 (13.15 on 12-month prepay) | Yes. The only Canadian VPS site in the catalogue is BHS (Beauharnois); no Toronto VPS (OVH's Toronto site sells dedicated servers and private cloud, https://www.ovhcloud.com/en-ca/lp/new-toronto-datacenter/) | Not billed. "OVHcloud reserves the right to restrict the VPS Service bandwidth to 1 Mbps ... until the end of the current billing period in cases of excessive use" (VPS Specific Conditions CA 4.1) | May suspend "immediately and without notice" on a third-party notice of illicit activity, an authority's request, or a risk to its systems (General Terms CA v10.0, s. 3.6); no refund for non-use (s. 11); prohibited list names crypto mining, DoS, bots for games, traffic exchanges, not crawling (General Terms, the paragraph before s. 3.6); must not harm "the reputation of the Host Server's IP address" (VPS conditions) | Hébergement OVH Inc., contract under Quebec and Canadian law (s. 14.1), prices in CAD (s. 11.1). Its Personal Information Protection Agreement names the Quebec Privacy Act and says OVH "shall object" to a foreign authority's request for data hosted in Canada unless made under a treaty (PIPA 2023-09-06, s. 4.3); non-US OVH affiliates may do maintenance remotely (s. 6.2) | Upgrade only, from the panel, "within a few hours", "cannot guarantee the feasibility"; location "final" (VPS conditions). Downgrade means a new server. Exit: plain Linux, copy the files out | **Finalist 1.** Cheapest by 4x, CAD billing, Canadian law, Quebec-aware data agreement. |
| **Vultr, Toronto** | Regular `vc2-4c-8gb`: 4 vCPU, 8 GB, 160 GB SSD, 4 TB, USD 40. High Performance AMD 4 vCPU, 8 GB, 180 GB NVMe, 6 TB, USD 48 (Vultr public API, https://api.vultr.com/v2/plans, region `yto` Toronto) | 64.27 (77.12 for High Performance) | Yes, Toronto | Billed: USD 0.01 per GB over the plan's allowance; 2 TB free per account each month (https://docs.vultr.com/support/platform/billing/what-is-the-bandwidth-overage-rate) | AUP (last modified 2026-03-11): crawling banned only when it "impairs or disrupts the System being monitored or crawled"; may "terminate or suspend your Account ... at any time, with or without notice", including for "reputational harm". ToS: "Vultr does not guarantee refunds"; "No refunds" (https://www.vultr.com/legal/use_policy/, https://www.vultr.com/legal/tos/) | US company (**ASSUMPTION**: The Constant Company, Florida; not read today). US CLOUD Act applies to data "regardless of whether ... located within or outside of the United States" (18 U.S.C. 2713, https://www.law.cornell.edu/uscode/text/18/2713). DPA not read | Resize and backup terms not read today (backup price **ASSUMPTION** 20%). Exit: plain Linux | **Finalist 2.** Toronto site keeps the privacy line "outside Quebec" true; metered and US-law. |
| DigitalOcean, Toronto TOR1 | Basic 4 vCPU, 8 GB, 160 GB, 5,000 GiB, USD 48; 4 GB USD 24. Backups 20% weekly or 30% daily; snapshots USD 0.06/GB (https://www.digitalocean.com/pricing/droplets) | 77.12 (92.55 with weekly backup) | Yes, TOR1 (https://docs.digitalocean.com/platform/regional-availability/) | Billed: USD 0.01 per GiB over a team-pooled allowance (https://docs.digitalocean.com/platform/billing/bandwidth/) | AUP (2026-03-20) bans crawling "that impairs or disrupts the System"; may suspend "even if a violation is committed unintentionally". ToS (2026-08-22): fees "non-refundable"; terminate "with or without notice" | DigitalOcean, LLC, Delaware law and courts; discloses to "governmental request" (ToS s. 5.5). CLOUD Act as above | Best-documented resize: CPU and RAM only is reversible, disk growth is not; about one minute of downtime per GB used (https://docs.digitalocean.com/products/droplets/how-to/resize/) | Good fallback; costs USD 8 more than Vultr for the same size. |
| Akamai (Linode), Toronto | `g6-standard-4`: 4 vCPU, 8 GB, 160 GB, 5 TB, USD 48; backups USD 10 (Linode public API, https://api.linode.com/v4/linode/types, region `ca-central` Toronto) | 77.12 (93.19 with backups) | Yes | Overage billed by region; rate not on the page read (https://techdocs.akamai.com/cloud-computing/docs/network-transfer-usage-and-costs). Unverified | AUP not read | US company (Akamai), CLOUD Act | Not read | Same price as DigitalOcean, fewer facts in hand. Not a finalist. |
| Hetzner, US only | CPX31 4 vCPU, 8 GB, 160 GB, 3 TB, EUR 62.99 in Ashburn/Hillsboro (EU same plan EUR 30.49); overage EUR 1 per TB; US create buttons read "Currently unavailable" (https://www.hetzner.com/cloud/regular-performance/) | 110.98 | **No Canadian site** (https://www.hetzner.com/cloud/) | Billed, cheap | Not read | German company; server in the US makes the privacy text's "Pexi's server ... outside Quebec" incomplete: it would be outside Canada | Not read | **Out:** dearest 8 GB VPS, no Canada, currently unavailable. |
| AWS Lightsail, Canada (Central) | 2 vCPU, 8 GB, 160 GB, 5 TB, USD 44; overage USD 0.09/GB; snapshots USD 0.05/GB (https://aws.amazon.com/lightsail/pricing/) | 70.70 | Yes (Canada Central; Montreal per our 11-21 notes, not re-read) | Billed at 9x the others | **CPU baseline 30%** for the 8 GB plan; above it the box spends burst credit (https://docs.aws.amazon.com/lightsail/latest/userguide/baseline-cpu-performance.html). Imports and collectors would drain credit | US company, CLOUD Act | Resize only by snapshot to a new instance (same doc) | **Out:** throttled CPU, priciest bandwidth. |
| Fly.io, Toronto | No 8 GB price on the page: performance-2x 4 GB USD 66, extra memory USD 6/GB, volumes USD 0.15/GB, egress USD 0.02/GB (https://docs.fly.io/about/pricing). 8 GB with 30 GB volume about USD 94.50 (derived) | about 151.84 | Toronto region (**ASSUMPTION**, not re-read today) | Billed | Not read | US company | Needs a container build and volume work; more lock-in | **Out:** about 10x OVH and the most rework. |
| Railway / Render | Regions: Railway California, Virginia, Amsterdam, Singapore (https://docs.railway.com/reference/deployment-regions); Render Oregon, Ohio, Virginia, Frankfurt, Singapore (https://render.com/docs/regions) | not priced | **No Canadian region** | Billed | Not read | US | Platform lock-in | **Out:** no Canada. |
| Oracle Always Free | 2 OCPUs and 12 GB Ampere, 200 GB block, 10 TB egress, home region only (https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) | 0 | Toronto and Montreal regions exist (**ASSUMPTION**, not re-read) | Free to 10 TB | Reclaims an instance idle for 7 days when 95th-percentile CPU, network and memory are all under 20% (same page). Pexi at launch traffic would likely qualify; "out of host capacity" errors are documented | US company, CLOUD Act | ARM; reclaim means rebuild | **Out:** a launch server that can be taken back when traffic is quiet. |
| **Hybrid** (rented server + Mac) | Server price above; Mac keeps the collectors that need a home IP or a browser | same as the server | as the server | as the server | Keeps crawling off the rented IP, which is what OVH s. 3.6 and the Vultr AUP can suspend over | as the server | as the server | **Recommended shape** with either finalist. |

---

## 4. What happens past every limit (finalists and the status quo)

### OVHcloud VPS-2, Beauharnois

| Limit | What happens | How it shows | Source or basis |
|---|---|---|---|
| Bandwidth | Never billed. "Excessive use" (undefined) lets OVH cut the VPS to 1 Mbps until the end of the billing period | Slow, not cut off: a 6.5 MB pack would take about 52 s | VPS conditions CA 4.1. Mitigation: serve the pack from Cloudflare R2 (launch-gaps item 93) so the server sends only small answers |
| Memory (8 GB) | Linux kills the largest process (the server) when memory runs out | Down for seconds, then the first answers take 11 to 16 s while caches refill | **ASSUMPTION** (standard Linux behaviour; OVH images are not checked for a swap file). Mitigation: 2 to 4 GB swap file, cap collector memory, systemd restart |
| CPU | Shared host: "a portion of these Resources is virtually allocated"; OVH watches usage with an agent on the hypervisor | Slow, never billed | VPS conditions CA 4.1 |
| Disk (75 GB) | SQLite writes fail when the disk fills; scans, prices and events are lost while answers from the read-only catalogue keep working (**ASSUMPTION** on the exact split). The event route can fill a disk in about two hours under abuse | Partly broken | launch-gaps item 56. Mitigation: the existing nightly disk check, event caps, extra disk CAD 3.50 per 50 GB |
| Requests and DDoS | Origin has no open web port (the tunnel dials out); Cloudflare sits in front; OVH adds anti-DDoS "deployed by default" | Abuse costs Anthropic calls more than server time (1,000 a month cap drainable over IPv6, item 56) | https://www.ovhcloud.com/en-ca/vps/vps-canada/ |
| Uptime | SLA: under 99.9% monthly gives 10% credit, under 99.5% gives 50%; the clock starts only when we open a ticket | We must detect and file | VPS conditions CA 4.1 s. 6 |
| Account | Suspension without notice on a third-party notice of illicit activity, an authority's request, or risk to OVH systems; unpatched OVH-maintained apps can get the VPS cut from the internet | Fully down | General Terms CA v10.0 s. 3.6; VPS conditions s. 5 |
| Billing | Card charged automatically at each renewal; no metered items unless options are added; no refund for unused prepaid months | Predictable | VPS conditions s. 8; General Terms s. 11 |
| Growth | Upgrade in place only upward, only in the same datacentre, not guaranteed; the en-ca VPS page also carries a contradictory FAQ that non-US VPS "cannot be modified or upgraded after delivery" (https://www.ovhcloud.com/en-ca/vps/) | Worst case: new server and a copy (hours) | Order month-to-month first so a wrong size costs one month |

### Vultr, Toronto

| Limit | What happens | How it shows | Source or basis |
|---|---|---|---|
| Bandwidth (4 TB plus 2 TB account pool) | USD 0.01 per GB over; 1 TB over is USD 10 | Billed, never slowed | Vultr billing doc above |
| Memory, CPU, disk | Same Linux behaviour as OVH; 160 GB disk gives twice the room | as OVH | **ASSUMPTION** |
| Account | "terminate or suspend ... at any time, with or without notice", including for "reputational harm"; crawling banned only where it disrupts the site crawled | Fully down | Vultr AUP 2026-03-11 |
| Billing | "No refunds"; prices may change at renewal | Predictable, USD | Vultr ToS |
| SLA, backups | Not read today | unknown | unverified |

### The Mac (status quo, for comparison)

| Limit | What happened |
|---|---|
| Memory | Swap 2.4 to 3.0 GB; server paged out, health timeouts, 16 server timeouts 11-23 to 11-25 (mailbox 2026-11-25/26) |
| Disk | 94% full, `disk_low` 321 times in one day (mailbox 2026-11-26) |
| Power | On battery during review; ran flat 11-18 (launch-gaps item 52). FileVault on means a power cut waits at the unlock screen (`mac/README.md`) |
| ISP | Breach of the Rogers server clause; Rogers may cut the home connection without notice (Rogers ToS PDF above) |
| Load | Broke at 16 users |

---

## 5. Legal fit

What our privacy text says today (`app/public/js/legal/document.js` line 144, French at 394): *"Pexi's server and
most of these services are outside Quebec, and some, including Anthropic, RevenueCat, Cloudflare, Apple and Google, may
store or process data outside Canada, including in the United States and the European Union ... Courts, law
enforcement and government authorities in those places may be able to get access to data held there under their own
laws."* Line 141: *"Pexi shares user data only with the services named here."* The host is not named today (the Mac
is his own machine).

Rules (already verified in the legal review): PIPEDA does not forbid processing abroad but requires plain notice that
data "may be processed in a foreign country" and may be reachable by its courts and authorities, and a contract giving
"a comparable level of protection" (OPC guideline, modified 2009-01-27,
https://www.priv.gc.ca/en/privacy-topics/airports-and-borders/gl_dab_090127/). Quebec P-39.1 s. 17: before
communicating personal information outside Quebec, a privacy impact assessment and a written agreement, also when an
outside person is entrusted to keep it (`notes/legal-review-2026-11-26/A-privacy.md` R20, verified in V1; statute at
https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1). Whether the Act binds an Ontario sole proprietor is open
and listed as a lawyer question (V1).

**Any rented host (both finalists):** the hosting company stores every scan, so it must be added to the named list
in both languages before the switch, or line 141 becomes untrue. This is the one hard legal step, and it is a text
change, not a blocker.

**OVH Beauharnois:**
- The line "Pexi's server ... outside Quebec" becomes false and must change (to "in Quebec" or a neutral "in Canada").
- For Quebec users, data stays in Quebec, so s. 17's outside-Quebec assessment arguably does not apply to the host
  (**ASSUMPTION**, a reading, not advice). For Ontario and other users the host is in Canada, so no foreign-access notice
  is needed for it.
- OVH's data agreement is written for Canadian and Quebec law and is the kind of "written agreement" s. 17 and PIPEDA
  ask for; it commits OVH to object to foreign authority requests (s. 4.3). Remote maintenance by non-US OVH
  affiliates (s. 6.2, e.g. France) is a foreign access point our assessment should name.
- Side effect to weigh with a lawyer: a server in Quebec is one more connection to Quebec (**ASSUMPTION**; the review
  already treats the Act as probably applying in practice).

**Vultr Toronto:**
- "Outside Quebec" stays true. Data sits in Ontario, but Vultr is a US company, so US authorities can compel it
  regardless of where the data sits (18 U.S.C. 2713). Our text's foreign-access sentence covers named services, so
  adding Vultr to the list keeps it true.
- s. 17 assessment and written agreement needed for Quebec users' data going to Ontario under US-company control. The
  Vultr data agreement was not read today.

**Rogers (status quo):** a terms breach that lets the ISP cut the connection; not legal exposure to users, but a
named cost (home internet loss) for the whole household.

---

## 6. Recommendation

**OVHcloud VPS-2 in Beauharnois, ordered month to month (CAD 15.48 with HST), with the price collectors that need a
home address or a browser left on the Mac.** After the load test passes on it, switch the renewal to the 12-month
prepay (CAD 13.15 a month, CAD 157.84 paid once).

Deciding reasons:
1. Cost: 4 to 5 times cheaper than every Toronto 8 GB plan (Vultr CAD 64.27, DigitalOcean and Akamai CAD 77.12),
   which matters while pre-revenue.
2. No surprise bills: traffic is unmetered; the worst case past the limit is slowing to 1 Mbps, not a charge.
3. Billed in CAD under Quebec and Canadian law, with a data agreement written for PIPEDA and Quebec's Act, and a
   commitment to resist foreign authority requests; no US parent in the contract.
4. 8 GB and 75 GB meet the measured need with room; the same core count as the Toronto plans (per-core speed not compared).

**Runner-up: Vultr Toronto `vc2-4c-8gb`, USD 40 (CAD 64.27 with HST).** Choose it if he wants the server in Ontario,
wants a 160 GB disk, or wants hourly billing and instant resize from a larger vendor.

Triggers that would change the pick:
- The load test on VPS-2 fails his launch target: go to VPS-3 (6 cores, 12 GB, 100 GB, CAD 19.80, CAD 22.37 with
  HST) before changing vendor.
- OVH throttles or suspends us, or a month shows more than about 7 hours down (under 99%): move to Vultr Toronto.
- A lawyer says a Quebec server is worse for us than an Ontario one: Vultr Toronto.
- Steady load over one box, or paying users who need two servers: a second server and a load balancer; out of scope
  today.

Cost as users grow (**ASSUMPTION** on which size each step needs; only the prices are sourced):

| Users | OVH (CAD, with HST) | Vultr Toronto (CAD, with HST) |
|---|---|---|
| 100 | VPS-2 15.48 | 8 GB 64.27 |
| 1,000 | VPS-2 15.48, or VPS-3 22.37 if the load test says so | 8 GB 64.27 |
| 10,000 | VPS-4 (8 cores, 24 GB, 200 GB) 42.83 | 16 GB `vc2-6c-16gb` USD 80 = 128.54 |

Bandwidth stays small at every step if the pack moves to R2 (10,000 users downloading a 6.5 MB pack weekly is about
280 GB a month, **ASSUMPTION** on the download rate), inside every allowance above.

### Blockers found

- **None that stops OVH**, but two must-dos before the switch: (1) name the host in the privacy text and fix the
  "outside Quebec" line, EN and FR, then bump the effective date; (2) the load test re-run on the new box with free
  memory recorded.
- **Technical, the hybrid's cost:** collectors write straight into the live SQLite files today. Leaving some on the Mac
  means they must send their results to the server instead (a file copied over and imported there). Not built.
- **Unknown, needs checking with a cheap probe:** whether the Kroger API, Open Prices, Hammer download and Metro
  sitemaps answer from an OVH address. Datacentre addresses being blocked by retailers is an ASSUMPTION; Metro already
  refuses Python's default user agent.
- **OVH contradiction:** the en-ca VPS page carries both "upgrade in one click" and "VPS ordered ... outside the United
  States cannot be modified or upgraded after delivery". Ordering month to month caps the damage at one month.
- **Unread terms:** Vultr's DPA, SLA and backup pricing; Akamai's AUP and overage rate; Oracle's and Fly's Canadian
  regions. None changes the pick unless Vultr becomes the choice.

---

## 7. Migration checklist (Mac launchd to Linux systemd, OVH assumed)

Needs Jamin: create the OVH account and pay (card on file, auto-renew), add our SSH key, approve the privacy text
change. Everything else is ours.

1. Order VPS-2, Beauharnois, Debian or Ubuntu LTS, month to month. Add the CAD 0.90 snapshot option.
2. Harden: SSH keys only, password login off; firewall denies all inbound except SSH (or SSH only over Tailscale,
   already in use); automatic security updates; a non-admin service user (closes Mac finding D4 by design).
3. Swap file of 2 to 4 GB; systemd `MemoryMax` on collectors so the server is not the one killed.
4. Install Node 24.14.0 (same pin as `mac/02-install-node.sh` step 3), clone the repo with a read-only deploy key,
   `npm install` in app, spine, price, catalogue, identify. Run the full test suite on the box.
5. Copy data: checkpoint then copy the catalogue (`mac/checkpoint-wal.mjs`, `mac/04-catalogue-acquire.md`), verify
   the checksum (`mac/04-verify-catalogue-checksum.sh`); copy the live databases with the same checks; config file
   mode 600.
6. Port each launchd daemon in `mac/launchd-daemons/` to a systemd service or timer: server (restart always),
   checker (deploy: replace `launchctl` restarts with `systemctl`), deadman, integrity and disk, backup, offsite
   (restic), logrotate, restoretest, openprices, kroger, hammer. `expiry` checks Apple certificates and stays on the
   Mac. Every timer writes the same health markers (`<job>.json`, `<job>.FAILED`).
7. Decide per collector where it runs (probe first): API and download collectors on the server if they answer from
   OVH; anything that needs a home address or a browser stays on the Mac and ships results to the server.
8. Move the offline pack to Cloudflare R2 (launch-gaps item 93).
9. Tunnel: install cloudflared on the server, run it for the same hostname alongside the Mac, or route
   `relay.anjiawenda.com` to a new tunnel at switch time. No app build needed either way.
10. Load test on the new box (`scripts/load/load-test.mjs`, steps 1 to 512, barcode in the mix), recording free memory
    and the cold first answer. Pass before switching.
11. Privacy text: add the host to the named list, fix "outside Quebec", EN and FR, new effective date; write the s. 17
    assessment line for the host into `docs/store/quebec-transfer-note.md`.
12. Switch on his go; keep the Mac server warm as fallback for 7 days; then point backups and checks at the server
    only, prove one restore from the off-site copy, and switch the renewal to 12 months.
13. Run the readiness drills that touch hosting (restart, restore, disk full) on the new box.

Exit from OVH later: everything is plain files on plain Linux; the same steps 4 to 12 move it to Vultr or anywhere
else in a day, and the tunnel means phones never notice.
