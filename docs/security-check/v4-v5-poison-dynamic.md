# V4 poisoned answers and V5 dynamic scan, 2026-11-16

Lane: sec-poison (worktree of origin/main). Two scripts were written and run for this:
`scripts/security/poison-sim.mjs` (V4, local server, temp databases) and
`scripts/security/local-hand-pass.mjs` (V5 hand pass, local server). Nothing was committed.
Labels: **checked** = run or read on 2026-11-16 and seen; **suspected** = read from code or inferred, not run.

## The number Jamin asked for

On a local copy, with every fake phone a fresh device key and every request from a fresh address:

| What the attacker wants | Product situation | Fake phones needed (N) | Addresses needed (M) |
|---|---|---|---|
| Move the shown price up 10%, 50% or 100% | no shop price on file | 1 if no honest shopper has typed a price. With k honest typers: k fake phones for +10% and +50%, k+1 for +100% (k=1: 1, 1, 2; k=3: 3, 3, 4; k=5: 5, 5, 6) | 1 |
| Move the shown price down 10% or 50% | one shop price on file (any age), or none | same as above: k=0 gives 1, k=1 gives 1 (10%) and 2 (50%), k=3 gives 3 and 4, k=5 gives 5 and 6 | 1 |
| Move the shown price up | one shop price on file, less than 90 days old | cannot be done at all (tested 0 to 5 phones, prices 1.1x to 2.9x) | not applicable |
| Move the shown price up | one shop price on file, older than 90 days (tested 120 days) | same as "no shop price": 1 if k=0, k for 10% and 50% | 1 |
| Move any price | two or more shop prices on file | cannot be done (tested up to 40 phones, up and down) | not applicable |
| Rename an unknown barcode | barcode not in the catalogue | 2 if nobody has picked for it (k=0 or k=1), otherwise k+1 (k=3 gives 4, k=5 gives 6) | 1 |

M is 1 in every case. The sim used a different address per fake phone (the best case for the defence) and
the price still moved; a separate run from one single address saved a price from 1,200 different fake
phones before the per-address door limit refused (section C below). So per-address limits are not what
stops this: the only things that stop it are the rules in the table.

Biggest swing seen: shown price 500 cents became 1,450 (+190%, the 2.9x step the typo guard allows) and
170 (-66%, the 0.34x step it allows). The answer stayed labelled low confidence in every case.

Fake phone cost: each costs two requests (scan, then type a price). A rename costs a scan plus a pick (POST).

## Where the code is (what the attacker is talking to)

- Typed price saved for the next shopper: `app/server.ts:1704` calls `shopperContribution`
  (`app/src/shopper-contribution.ts:50`), which calls `saveShopperPrice`
  (`price/src/shopper-prices.ts:86`). The estimate reads it back through `shopperVoiceFor`
  (`price/src/shopper-prices.ts:144`, wired at `app/server.ts:1513`) and adds it as one shop at
  `price/src/estimate.ts:1152-1155`, only while the product has fewer than 2 shop prices.
- Unknown barcode named from picks: pick written by `/api/scan-pick` (`app/server.ts:4087-4102`,
  `recordPick` `app/src/scans.ts:645-667`); read by `learnedPickFor` (`app/src/scans.ts:680-717`),
  used at `app/src/catalogue-first.ts:846` and `:899-910`.
- Device key: `app/src/device-key.ts` (a phone proves its own id; making a new id is free).

## Defences that exist, with file and line (all checked by running the sim against them)

| Defence | Where | Does it stop poisoning |
|---|---|---|
| One typed price per device per product per day | `price/src/shopper-prices.ts:45` (unique index), `:100` | No. A new device key is a new voter. |
| Typo guard: below 0.33x or above 3x of the product's current centre is not saved | `price/src/shopper-prices.ts:26-27, 90-95` | Only when the product has a centre. With no prices at all there is no centre, so the first typed price is unchecked (saved a 9,000,000 cent price; it was not shown only because of the category cut below). The centre is the answer the attacker was shown, so it follows the poisoned value. |
| Probe devices (id starts "probe") never recorded | `price/src/shopper-prices.ts:66, 87` | No. An attacker just does not name the device "probe". |
| All shoppers are ONE voice (median of each device's newest price), one shop's weight, only while fewer than 2 shop prices | `price/src/shopper-prices.ts:144-168`, `price/src/estimate.ts:1152-1155` | Partly. Two or more shop prices make a product immune (checked). It is also why low confidence stays. |
| With two equal points the weighted median returns the LOWER one | `price/src/estimate.ts:754-763` | This blocks a fake HIGH price on a product with one fresh shop price (checked), but it is the reason a fake LOW price wins at N=1 there. |
| A shop price older than 90 days weighs less than 1; a typed price today weighs 1 | `price/src/estimate.ts:123-125` | Works against us: any one shop price older than 90 days loses to a higher fake price (checked at 120 days). |
| Category cut: a row more than 5x from its category median is left out | `price/src/estimate.ts:1281`, `:127` | Partly. Fake prices up to about 3x passed. Only works when a category pool exists. |
| Unknown-barcode link needs 2+ different devices and a strict lead over any other product | `app/src/scans.ts:711-713` | No. 2 free phones is the whole cost. |
| A pick must be on a scan owned by the same device | `app/src/scans.ts:659` | No. Each fake phone makes its own scan. |
| A barcode the catalogue knows is never renamed | `app/src/catalogue-first.ts:846` | Yes for known barcodes. |
| The renamed answer is labelled a guess, low confidence | `app/src/catalogue-first.ts:998` | Softens it; the shopper still sees the wrong product name. |
| Per-address door limit 1,200 per 10 minutes, 15,000 per day | `app/src/rate-limit.ts:102-107`, `app/server.ts:950-955` | Slows, does not stop (1,200 fake phones from one address in one run). |
| Free-scan limit per address 30 per day (only while `SHIN_FREE_SCANS_PER_WEEK` is set) | `app/src/rate-limit.ts:113-115`, `app/server.ts:961-966` | Checked: with it on, one address saved 30 prices then got 429. With it off (the launch default per `docs/launch-gaps-2026-11-06.md` item 2, "weekly limits not set") the door limit is the only cap. |
| Retention strips device ids after a while | `price/src/shopper-prices.ts:216` | Not a defence; the price stays. |
| Admin or script to remove a poisoned row | none found | grep of `app/src/admin.ts`, `app/server.ts`, `scripts/`: nothing touches `shopper_price` or `scan_pick`. Admin SQL is read-only. Cleanup needs a SQL session on the Mac. |

## Findings

### F1. One phone can set or sink the price on a product with no shop price, or only an old one (Med) - checked
Cost: trust. One screenshot of "Pexi says peanut butter is $14.50" costs more than the fix.
Evidence: `scripts/security/poison-sim.mjs`, rows "no_shop_price" and "one_shop_price_120d_old": N=1, shown
500 became 1,450 (+190%), confidence "low". "no_shop_price" with one honest typer (k=1): the first fake phone
moves 500 to 975 (+95%), the second to 1,450. Not measured: how many live products have fewer than 2 fresh shop prices (that share
decides how often a shopper can hit this; it needs the live prices file, which this lane did not touch).
Smallest fix: only let the typed-price voice into the verdict when at least 3 different devices (and 2
different addresses) agree within 1.5x of each other, otherwise show it as "a shopper reported" and do not
move the centre. Or change nothing now and accept it for 1.0 (Jamin's call; the answer says "Not fully confident").

### F2. One phone can push a fake LOW price on a product with one shop price (Med) - checked
Cost: trust, and shoppers told a fair shelf price is high (they skip a good buy) or a bad one is fine.
Evidence: sim "one_shop_price", direction down: N=1 gives shown 500 become 170 (-66%); factor sweep: typed 0.4x, 0.7x,
0.9x all shown at N=1 (200, 350, 450); typed 1.1x to 2.9x never shown (always 500). Cause: lower-of-two weighted
median, `price/src/estimate.ts:754-763`. With k honest typers an attacker needs k+1 to hold the median.
Smallest fix: when a shop price is under 90 days old, never let the typed voice go below 0.8x of it
(one clamp at `price/src/estimate.ts:1155`).

### F3. Two free phones can rename an unknown barcode (Med) - checked
Cost: trust (the shopper scans an item and is told it is another product, with that product's kind of price).
Evidence: sim section B: k=0 or 1 honest picks, attacker N=2 gives name "Navel Orange Juice 1 L", `identitySource` "shopper_picks",
confidence low. k=3 needs 4 attackers, k=5 needs 6. The picked code is not checked against what the scan offered,
`app/src/scans.ts:645-667` and `app/server.ts:4087-4102`: any product code in the catalogue is accepted.
Price shown on the renamed product was empty in the fixture (category pool too wide); with a live category pool it
would show that category's price (suspected, not run).
Smallest fix: require the picked code to be one of the matches the scan offered (store the offered list on the scan row),
and raise the bar from 2 devices to 3 devices from 2 different addresses.

### F4. Production has no invite code, so anyone can attack without any secret (Med) - checked (behaviour), intent unknown
Cost: money and trust: every defence above sits behind no gate; the free weekly limit is also not set (launch gap 2).
Evidence, production, no headers: GET /api/catalogue, /api/categories, /api/scenarios, /api/attribution, /api/latency,
/api/pack-version all 200; GET /api/stores answered 400 "cell is required" and /api/quota 400 "deviceId is required",
meaning the handler ran past the gate instead of 401. `app/src/invite.ts:127`, `app/server.ts:2615`: unset code
means no gate. If this is on purpose for the public launch, accept it, but then the per-address limits and the free limit are the
only controls.
Smallest fix: set `SHIN_FREE_SCANS_PER_WEEK=10` and `SHIN_PLUS_SCANS_PER_WEEK=100` on the Mac (already ruled in `RULINGS.md:471`).

### F5. The server listens on every network interface, and the address limits trust a header anyone on that network can forge (Med) - suspected
Cost: trust and money (limits bypass). `app/server.ts:4298` is `server.listen(PORT, ...)` with no host.
`app/src/rate-limit.ts:127-141` says the port "must not be reachable except through the tunnel". Anyone on the same
wifi as the Mac who reaches the port can send their own `cf-connecting-ip` for every request, so each request looks
like a new address (door limit, free-scan address limit and per-address paid limit all reset). Not run: the Mac's
firewall and network were not looked at in this lane (V7 covers the Mac).
Smallest fix: `server.listen(PORT, '127.0.0.1', ...)`. The tunnel connects from the same machine, so nothing else changes.

### F6. `/api/health` tells a stranger internal state (Low) - checked
Cost: trust (small). Production answer to a stranger (header-free GET): uptime and exact start time (so when the Mac last
restarted or deployed), `taxonomy: "changed since baseline"`, fault counters by kind, `pricesDb: "ok"`, `hammerRefreshedAt`
(when the price crawl last ran). `app/server.ts:4119-4134`. When the taxonomy file fails, `categoryCheckWhy` carries
the error text, which includes a file path (`app/src/category-guard.ts:152, 179`,
`catalogue/src/category-taxonomy.ts:270`; seen locally, not in production because it is healthy there).
The plan's done-test was "tells a stranger nothing internal": this does not meet it.
Smallest fix: the public route answers `{"ok":true}`; the detail moves behind the admin token (the uptime
alarm needs only the status code).

### F7. Internal notes and usage numbers are public (Low) - checked
Cost: trust. With no invite, GET /api/latency returns per-day scan counts and p95 times (62 scans on 2026-11-15, 80 on
11-14, a competitor can read the traction) although its code comment says "Behind the invite code" (`app/server.ts:4132-4144`).
GET /api/catalogue returns a pilot note naming retailers that "answered 403" to Pexi's direct fetches, and
GET /api/categories and /api/scenarios return working notes and test stand-ins. Not secrets, but not for strangers.
Smallest fix: put /api/latency behind the admin token; trim /api/catalogue's `provenance` and drop /api/scenarios
from the public build if the app does not call them.

### F8. Standard security headers missing (Low) - checked
Cost: App Store review is unlikely to care; a browser tab of the site is the only target. Production and local both
send CSP and X-Frame-Options DENY and nothing else: no `Strict-Transport-Security`, `X-Content-Type-Options`,
`Referrer-Policy` or `Permissions-Policy` (production headers on /, /api/health, every route probed). HSTS may be a
Cloudflare setting not yet turned on (suspected).
Smallest fix: add `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` in the one place the CSP is set
(`app/server.ts` near `CONTENT_SECURITY_POLICY`, line 2302); turn on HSTS in Cloudflare.

### F9. No way to take a poisoned price or pick out, or to switch the shopper voice off (Low) - checked (absence)
Cost: trust (a bad price stays up to 180 days, `SHOPPER_VOICE_DAYS`, `price/src/shopper-prices.ts:29`).
Nothing in the repo deletes a `shopper_price` or `scan_pick` row, and there is no setting that turns the voice off
(`app/server.ts:1513` always wires it).
Smallest fix: one setting (`SHIN_SHOPPER_VOICE=off`) read at `app/server.ts:1513`, and a script that deletes a code's rows.

### F10. A third shared-answer path, the typed-name pool, is not guarded by outlier rejection (Med-Low) - suspected
Cost: trust. `app/src/own-prices.ts:117-150`: typed names are answered from a median over 5 or more devices
(`MIN_POOLED_SHOPPERS`, line 107) with no centre guard and no cut visible in that function. Cost to attack: 5 fake
phones, then 5 more than the honest count. Not simulated.
Smallest fix: apply the same 0.33x to 3x guard against the shop price there, or require shop corroboration.

### F11. Methods are not checked on the static handler and on read routes (Low) - checked
Cost: none today. Locally POST, PUT, DELETE, PATCH and TRACE on `/` return the page (200); DELETE /api/scans and
POST /api/health answer as GET. No state change hangs on those. TRACE did not echo anything. `//x` is read as a host,
so `//server.ts` serves the home page. Not a leak.
Smallest fix: refuse anything but GET and HEAD at the static handler (`app/server.ts:4180`).

## Checked and found clean

- TLS (production): TLS 1.2 (ECDHE-ECDSA-AES128-GCM-SHA256) and 1.3 (AES-256-GCM) accepted; certificate valid, issued by
  Google Trust Services (WE1) to `anjiawenda.com` with SAN `*.anjiawenda.com`, P-256, valid 2026-10-18 to 2027-01-16.
  TLS 1.0 and 1.1: could not be tested from this machine (my own client refuses to speak them), so unknown (suspected Low).
- CORS from `https://evil.example` (production): preflight to /api/health, /api/identify, /api/scan-price and
  /api/admin/status all 403 with no Allow-Origin; GET with that origin answers 200 with no Allow-Origin, so a page there cannot read it.
  Preflight from `capacitor://localhost` 204 with only that origin allowed (the phone still works). Same on local.
- `/api/admin/*` (production): 5 GETs (`/api/admin/`, `status`, `scans`, `health`, `files`) all 401 with no token, so the admin
  routes exist and fail closed. Local: wrong token 401, empty token 401, `file?path=../../server.ts` and an absolute path both
  refused 400, SQL write refused (read-only database), ATTACH refused. (`app/src/admin.ts:125-126, 190-192`.)
- Static files (local): 18 traversal variants (`/../`, `%2e%2e`, `%2f`, `%5c`, double-encoded, null byte, overlong UTF-8,
  `/....//`) all 404, none served a file outside `app/public`. Source maps refused (`app/server.ts:4190`). Production: `/.env`,
  `/server.ts`, `/package.json`, `/.git/config`, `/js/api.js.map` all 404.
- Stack traces and paths (local): unknown routes, bad JSON, 5 MB and nested-bracket bodies (413 at 8,192 bytes), a bad `%`
  sequence, null bytes, array and repeated query parameters, a `__proto__` body: all returned short JSON errors, no stack
  frame, no file path. Production unknown route: `{"error":"no such endpoint"}`. A 20 KB URL gets 431, a 200 KB URL a reset;
  the server was alive after the whole run. Request smuggling (Content-Length plus Transfer-Encoding) got 400.
- No `X-Powered-By`, no cookies set, no `Server` detail beyond `cloudflare`.
- Probe devices never write shopper prices (and this cannot be used to read them). Two or more shop prices: the typed voice is ignored (checked up to 40 fake phones).

## V5 not done or changed

- OWASP ZAP baseline: **not run**. `docker info` says the Docker engine is not running (the pipe to Docker Desktop is missing).
  The hand pass above (`scripts/security/local-hand-pass.mjs`) was done instead: path traversal, method confusion, long URLs,
  unknown routes, bad bodies, CORS and headers. It is narrower than ZAP (no spider, no active rules). Start Docker Desktop and run
  `docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:<port>` if Jamin wants the full pass.
- `scripts/phone-contract-probe.mjs` against production: **skipped**. Its header says it sends POSTs with an unparseable body
  and binds a probe device key; this check allowed GET and OPTIONS only. (Production requests used: 60 of 60, all GET or OPTIONS, no bodies;
  the script was accidentally run twice, so every request was sent twice. No other request was sent.)
- Production was not attacked. All poisoning ran on a local copy with temp databases (every path setting pointed into a temp folder,
  the same guard the test suite uses; nothing under the real data folders was opened).
- Production hostname: `relay.anjiawenda.com` (`mac/01-cloudflare-tunnel.md:77`, `mac/config.env.example:38`, `scripts/phone-contract-probe.mjs:39,50`).

## How to rerun

`node scripts/security/poison-sim.mjs` (about 70 seconds, prints JSON) and `node scripts/security/local-hand-pass.mjs`
(about 10 seconds). Both start the server inside the script on a random port against temp data.
