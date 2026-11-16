# V3: route-by-route access table and attack tests

Lane V3 of the 2026-11-16 vulnerability check. Worker output, written in the `sec-routes` worktree. Nothing was fixed, committed or pushed. Every attack ran against a local server started inside the test process on a port the OS chose, over temp databases and a fake Claude, fake RevenueCat and fake Overpass. No request went to the production server and no real data was touched (the global test setup also snapshots the real data folders and refuses to run next to the live server).

Source read: `app/server.ts` at origin/main (the lane worktree), `app/src/admin.ts`, `device-key.ts`, `invite.ts`, `rate-limit.ts`, `scan-quota.ts`, `shelf.ts`, `shutter-frame.ts`, `shutter-log.ts`, `identify/src/range-ask.ts`, `pack-read.ts`, `mac/01-cloudflare-tunnel.md`.

## Result in one paragraph

31 API routes plus 6 admin sub-routes (37 endpoints), plus static files. 69 attack tests written in 5 files; 49 pass (attack blocked), 20 fail (hole or gap, listed in Findings). The 2026-11-06 fixes hold: cross-device reads and writes on bound devices, the admin token, the developer-only pack read, the consent header, upload path handling and body caps all passed every attack thrown at them. The holes are about what a stranger can do with no key at all: reach the port directly and forge the address the limiters count on, burn the whole monthly Claude allowance in under an hour, mint unlimited free-scan allowances, and guess the invite code or admin token with no lock-out.

## How to run

From `C:\shin-lanes\sec-routes\app`:

```
node --test --test-global-setup=test/setup/global.mjs test/security-routes.test.mjs test/security-quota.test.mjs test/security-cost.test.mjs test/security-address.test.mjs test/security-invite.test.mjs
```

`test/security-harness.mjs` is the shared set-up (not a test file; the `*.test.{ts,mjs}` glob does not pick it up). Run each file on its own: the server reads some settings once at import, so each file boots its own.

| File | Tests | Pass | Fail | Covers |
|---|---|---|---|---|
| security-routes.test.mjs | 38 | 33 | 5 | (a) device A vs B, (c) admin and pack, (e) consent, (h) uploads, (i) oversize |
| security-quota.test.mjs | 10 | 5 | 5 | (b) free Plus, weekly quota, RevenueCat |
| security-cost.test.mjs | 8 | 4 | 4 | (d) Claude cost, shared bucket, monthly cap, Overpass |
| security-address.test.mjs | 6 | 3 | 3 | (f) address spoofing, port exposure |
| security-invite.test.mjs | 7 | 4 | 3 | (g) invite gate |
| Total | 69 | 49 | 20 | |

## Access table

Shared by every row unless stated.

- Door limit: every `/api/*` request except `/api/health` is counted per address, 1200 per 10 minutes and 15000 per day (`server.ts:950`, `rate-limit.ts:102`). The address is the `cf-connecting-ip` header if present, else the socket address (`rate-limit.ts:136`). A loopback request with no `cf-connecting-ip` is "local" and exempt from every per-address limit (`rate-limit.ts:122`). `X-Forwarded-For`, `X-Real-IP` and the rest are ignored.
- Invite gate: when `SHIN_INVITE_CODE` or `SHIN_INVITES` is set, every `/api/*` route except `/api/health` needs header `x-shin-invite` (`invite.ts`, applied in `server.ts` before routing; tested by g3). With it off, nobody is asked.
- Device identity: the device id is only a name. The secret is header `x-shin-device-key`, bound by hash on the first request that carries both (`device-key.ts`, `bindDevice`). `owns(id)` is true for the bound key, and ALSO true for any id with no bound secret (compatibility window). "Device-owned" below means `owns` is checked.
- Origin check: `SCAN_ROUTES` refuse a present but mismatched `Origin`; a missing Origin is allowed (`server.ts` near 2640).
- JSON body cap 8 KiB on every JSON route unless stated (`server.ts` `MAX_JSON_BODY_BYTES`, checked on content-length and on bytes read).

| Route | Who may call | What proves identity | Reads | Writes | Rate limit beyond the door | Costs money | file:line |
|---|---|---|---|---|---|---|---|
| GET /api/health | anyone, exempt from invite and door | nothing | uptime, scan-log and catalogue status, fault counters, prices-db state, file paths in some fault messages | nothing | none (exempt from the door) | no | server.ts:4119 |
| GET /api/catalogue | anyone (invite if on) | nothing | catalogue summary | nothing | door | no | server.ts:2703 |
| GET /api/categories | anyone | nothing | category list | nothing | door | no | server.ts:2704 |
| GET /api/scenarios | anyone | nothing | scenario list | nothing | door | no | server.ts:2705 |
| GET /api/search?q= | anyone | nothing | catalogue search | nothing | door | no | server.ts:3120 |
| POST /api/match-text | device-owned | device key | catalogue | scan-less (no scan row) | own code and address buckets, 200 and 90 per 10 min (`matchTextRefusal`, server.ts:925) | no (tested: asked Claude 0 times) | server.ts:3049 |
| GET,POST /api/identify | device-owned | device key; `x-shin-claude: 1` is the client's consent word | catalogue, prices db, Open Food Facts, RevenueCat (when limits on) | scan row, gap rows, event rows, repeat cache | door; free scans per address 30/day (barcode only, non-Plus, `freeScanAddressRefusal` server.ts:961); weekly quota per device id 402 (`scan-quota.ts`); Claude asks via `paidCallRefusal` (server.ts:968) 90 per 10 min per address, 200 per 10 min per invite code or the shared `open` bucket, 600 and 1500 per day | YES with `x-shin-claude: 1` and no catalogue price: one Claude range ask (haiku-4-5, no tools, max 1024 output tokens); capped 1000 per month | server.ts:2811 |
| POST /api/identify/pack | developer only | admin token header, or a device in `SHIN_DEVELOPER_DEVICES` that proves its bound key (`packReadRefusal`, server.ts:1583) | catalogue, frame | scan row | door; pack cap 300 per month | YES (Claude reads the image) but only reachable by a developer | server.ts:3275 (3 MiB body cap) |
| POST /api/identify/photo | device-owned (never reads the body) | nothing needed | nothing | nothing | door | no (fixed `no_model_call` answer) | server.ts:3383 |
| GET,POST /api/identify/demo | anyone, no `owns` check | nothing | nothing | a demo scan row and a `demo_scan_shown` event in ANY named device (finding F8) | door only | no | server.ts:2726 |
| POST /api/price | device-owned | device key | catalogue, own prices, shopper's own scan (ignored if another device's) | scan row | door; Claude asks as for identify | YES for typed text with `x-shin-claude: 1` | server.ts:3413 |
| GET /api/quota | device-owned | device key | scans used this week, RevenueCat plus status | nothing | door; no limit on RevenueCat lookups per fresh id (F9) | RevenueCat call, no Claude | server.ts:2782 |
| POST /api/scan/:id/outcome | device-owned and the scan's own device | device key | scan row | outcome on the scan | door | no | server.ts:2790 |
| POST /api/correction | device-owned; the scan, if named, must be the device's | device key | scan row | correction, typed price, shopper price report | door | no | server.ts:3514 |
| GET /api/scans?deviceId= | device-owned; no deviceId needs the admin token | device key, or admin header for the global summary | that device's counts, ratings | nothing | door | no | server.ts:3725 |
| POST /api/scan-rating | device-owned and the scan's device | device key | scan row | thumbs rating, event | door | no | server.ts:3761 |
| POST /api/scan-rating/delete | device-owned and the rating's device | device key | rating | deletes the rating | door | no | server.ts:3805 |
| GET,POST /api/consent | device-owned | device key | consent row | photo and location consent | door | no | server.ts:3843 |
| POST /api/event | device-owned | device key | nothing | one event row | door | no | server.ts:3897 |
| POST /api/events/batch | each event device-owned (others dropped) | device key | nothing | up to 200 event rows; 1 MiB body cap | door | no | server.ts:3941 |
| GET /api/stores?cell= | anyone | nothing | Overpass (outbound, cached up to 500 cells) | nothing | door only (F10) | no (outbound lookups to a free public service) | server.ts:3991 |
| GET /api/store-chains | anyone (ignores the method) | nothing | prices db chain list | nothing | door | no | server.ts:4008 |
| POST /api/scan-price | device-owned and the scan's device | device key | scan row | typed price on the scan, shopper price report | door | no | server.ts:4029 |
| POST /api/scan-call | device-owned and the scan's device | device key | scan row | shopper call | door | no | server.ts:4064 |
| POST /api/scan-pick | device-owned and the scan's device | device key | scan row | pick row | door | no | server.ts:4087 |
| GET /api/latency | anyone | nothing | daily latency aggregates | nothing | door | no | server.ts:4146 |
| GET /api/attribution | anyone | nothing | shopper source counts | nothing | door | no | server.ts:4156 |
| GET /api/pack-version | anyone | nothing | pack version | nothing | door | no | server.ts:4161 |
| GET /api/pack | anyone | nothing | the offline price pack | nothing | door | no | server.ts:4171 |
| POST /api/shutter/frame | device header owned; 404 unless `SHIN_SHUTTER_LOG=on` | device key (if a device header is sent) | nothing | one folder per valid uuid id with frame.png/jpg and frame.json | 300 per device and 3000 total per day; 16 MiB body cap | no | server.ts:2648 |
| POST /api/shelf/frame | device-owned; 403 unless photo identification and photo consent are on | device key | consent | image plus json under `photos/shelf/<day>/<device>/` | 400 per device and 4000 total per day; body cap 4.2 MB | no | server.ts:2685 |
| GET /api/admin/tables | admin | header `x-shin-admin` equal to `SHIN_ADMIN_TOKEN` (404 when no token is set, else 401) | every table's columns | nothing | door only (no failed-guess limiter, F6) | no | server.ts:2613, src/admin.ts:126 |
| POST /api/admin/sql | admin | same | any SELECT on the read-only scans db, 5000 rows, 64 KB | nothing | door | no | src/admin.ts:144 |
| GET /api/admin/people | admin | same | device to person map | nothing | door | no | src/admin.ts:163 |
| GET /api/admin/access | admin | same | the access log (addresses, user agents) | nothing | door | no | src/admin.ts:169 |
| GET /api/admin/shutter | admin | same | shutter folder listing | nothing | door | no | src/admin.ts:178 |
| GET /api/admin/file?path= | admin | same | any file inside the data folder | nothing | door | no | src/admin.ts:189 |
| any other /api/* | nobody | n/a | nothing | nothing | door | no | server.ts:4177 (404) |
| static files (`/`, `/js/...`) | anyone, even with the invite on | nothing | `app/public` only; `.map` files refused | nothing | none | no | server.ts:4180 |

`model-cost.ts` is Gemini-era and no route calls Gemini any more (no Gemini client in `server.ts`); the real Claude spend is capped only by the monthly counters below.

## Blocked attacks (passed, nothing to fix)

- A reading, rating, un-rating, re-pricing, re-pointing, picking or calling on B's scans with A's valid key, with no key, with B's name and A's key, and on every device route (a1 to a9). B's data was unchanged after every attempt.
- A switching on B's photo and location consent (a8); A forging events in B's name through the batch door (a9).
- The all-devices scan summary with a named device or a wrong admin header (a2).
- A made-up or header-supplied Plus (`x-shin-plus`, `x-shin-entitlement`, `x-revenuecat-plus`, `?plus=1`) when RevenueCat is the judge (b1).
- A bound Plus device named with no key, the wrong key, or only the device header (b4); the Plus cap enforced with the `plus: true` refusal (b6); the free allowance enforced with 402 (b2).
- Every admin route and every admin SQL write, attach or extension attempt with no token, wrong token, empty token, prefix, suffix, wrong case, `null`, `undefined`, the token in `Authorization`, other headers, a cookie, or the URL (c1 to c4); with no token set at all (b10). The admin file route refused every path escape tried (c5). SQL over 64 KB refused (i4).
- The pack read with no token, wrong token, empty token, misplaced token, a developer id with the wrong key, a developer id claimed in the body (c8, c9, d7): no frame reached Claude. Controls c7 confirm the admin token and a proven developer do work.
- Consent: with no `x-shin-claude: 1`, no route (identify text and barcode, price, match-text, search, photo, correction) sent a product name to Claude (e1). Other header values, URL fields and body fields were not accepted as the yes (e2, e3).
- Uploads: shutter and shelf frames refused non-images and every path-character id (h2, h3, h7, h8), refused oversize (h1, h6), accepted a valid frame only into the shutter folder (h4), refused a device name without its key (h5).
- Oversize bodies: every JSON POST route refused a 9 KB body (i1); the events batch refused 1 MiB and kept at most 200 events (i2); the pack door refused 3 MiB (i3).
- Address headers: `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `True-Client-IP` and `X-Client-IP` did not change the address a limit counted (f4); claiming `127.0.0.1` in `cf-connecting-ip` did not make a direct caller exempt (f5).
- Invite: the code is accepted only in `x-shin-invite`; near-misses and every other place refused (g0 to g2). With the gate on, no route answered without it except `/api/health` (g3).
- One address was held to 90 Claude calls per 10 minutes, fresh device ids included (d1, d3); the shared bucket held to 200 (d4); the monthly cap stopped calls (the first half of d6: 0 calls sent with the cap at 1; its second half, saying so, failed, see F2); a flood of 40 pack frames from fresh devices sent no frame (d7).

## Findings

Severity is about the named cost. "checked" means a test proved it and the test name is given; "suspected" means read from code only. Worst-case dollars are in their own section after the list.

### F1. The server port is open to the whole local network, and the address limits believe a forged header (checked, Med)

- Named cost: money (every per-address limit, the paid-call limit, the invite and admin guess limits all key on `cf-connecting-ip`), shopper data (admin guessing, see F6), trust.
- Evidence: `server.listen(PORT, ...)` passes no host (`server.ts:4298`), so it binds every interface; `clientAddress` trusts `cf-connecting-ip` from any socket (`rate-limit.ts:136`, its own comment says it is only safe if the port is unreachable except through the tunnel, `mac/01-cloudflare-tunnel.md` has the tunnel going to `http://localhost:4173`). Tests: `f1` failed, "port 54283 accepted a connection on 169.254.83.107: the server listens on every interface"; `f3` failed, "a direct caller sent 40 requests as 40 different addresses and none was refused" (door limit 20). The control `f2` passed, so the limiter itself works when the header is absent. This was tested on the Windows machine; on the Mac the macOS firewall may block it, which was not checked.
- Smallest fix: `server.listen(PORT, '127.0.0.1')` (the tunnel connects over localhost), and only believe `cf-connecting-ip` when the socket is loopback.

### F2. Anyone can use up the month's Claude allowance in under an hour, and nothing says so (checked, Med)

- Named cost: money (small, see worst case), trust (shoppers lose the Claude estimate for the rest of the month).
- Evidence: with no invite required every caller shares one code bucket, "open", 200 per 10 minutes (`server.ts:968`, `rate-limit.ts:82`). Measured: `d4` 400 fresh devices over 400 claimed addresses made 200 Claude calls in one burst; one address makes 90 per 10 minutes (`d1`); the monthly cap is 1000 (`catalogue-first.ts:150`), so 1000 calls takes about 50 minutes. `d5` failed: after the burst, an honest shopper from a new address was refused a Claude estimate ("580 !== 581"), because the shared bucket was empty. `d6` failed: with the cap reached (set to 1, 6 attempts, 0 calls sent, which is correct) nothing in stderr and nothing on `/api/health` said the cap was hit. Grep finds `monthly_cap_reached` only as a returned reason, never logged.
- Smallest fix: a separate paid-call bucket per device key (not the shared `open`), and a `logError` plus a counter on `/api/health` when the cap or the 429 limiter refuses a Claude call.

### F3. Weekly free scans are per device id, and device ids are free to mint (checked, Med)

- Named cost: money (Plus revenue not earned).
- Evidence: `b3` failed: a phone at its limit (402) got "5 more free scans by naming fresh ids in the URL" (same key, same `x-shin-device` header, only `?deviceId=` changed); `owns` is true for any unbound id. The only cap across ids is 30 free barcode scans per address per day (`server.ts:961`), which F1 lets a direct caller forge. `b9` failed: typed text is uncounted and still asks Claude, so one free device made 12 Claude calls where its weekly allowance is 3 (bounded only by the per-address limits).
- Smallest fix: take the device for quota and consent from the bound `x-shin-device` header only, never from the URL or body; count the Claude-calling typed asks against the same weekly allowance, or give them their own per-device cap.

### F4. A device id that no phone has bound yet is open to whoever names it (checked, Med, shrinks as phones update)

- Named cost: shopper data (scans, ratings, consent), Plus (a Plus subscriber's id with no bound key reads as Plus to anyone naming it), trust.
- Evidence: `a12` failed: a stranger read an unbound device's scan summary with a 200; `b5` failed: a Plus-entitled unbound id read as 200 on `/api/quota`. By design `ownsDevice` returns true for unbound ids (`device-key.ts`), and whoever binds first owns the id. Exploiting it needs the victim's id, which is a random id I found no endpoint listing; nothing found outside admin. The bound path is solid (a1 to a9, b4 passed).
- Smallest fix: set a date after which an id with no bound key is refused, and bind on first sight; log how many unbound ids are still in use so the date can be chosen.

### F5. The admin token and the invite code have no guess limit beyond the door, and the invite code ships inside the app (Med)

- Named cost: shopper data (admin reads every scan, event, person and the access log), money (invite gate guards the Claude spend), trust.
- Evidence (checked): `c6` failed, "60 wrong admin tokens from one address were all answered"; `g4` failed, 1200 wrong invite guesses were answered before the first 429 from one address; `g5` failed, 400 wrong guesses over 400 claimed addresses were all answered as 401. `adminAllows` accepts any non-empty token with no minimum length (`admin.ts:57`), so a weak token would fall quickly. The real token's length was not read (it lives in the Mac's env, out of scope).
- Evidence (suspected, from code): `native/scripts/sync-web.mjs:125` writes `window.SHIN_INVITE_CODE = <the code>` into `js/native-config.js` of the shipped app, so the code can be read from any installed build. If so the gate stops casual callers but not anyone who unpacks the app. V1 overlaps.
- Smallest fix: a failed-token counter per address (and a global one) that answers 429 after about 10 misses on `/api/admin/*` and on a wrong invite; require an admin token of at least 24 characters at startup; treat the invite code as public and keep real limits on the device key.

### F6. Overpass lookups are free for any caller (checked, Low)

- Named cost: third-party ban risk (Overpass is a free public service, its operators can block the server's address, which would break the store list for all shoppers).
- Evidence: `d8` failed: 100 unique map cells from one address caused 100 outbound lookups (cache is by cell, ceiling 500 entries). Bounded only by the door (1200 per 10 minutes).
- Smallest fix: a per-address cap on distinct cells per hour, or only accept cells near a cell the device has already used.

### F7. RevenueCat is asked once for every made-up device id, and a dot-only id changes the URL (checked, Low)

- Named cost: trust (if RevenueCat rate-limits the server, a failed lookup caches as "not Plus" for a minute, so a paying subscriber may be shown the paywall), and subscriber records are created for ids that are not customers.
- Evidence: `b8` failed: 30 made-up ids cost 30 RevenueCat lookups; `b7` failed: device id `..` made the server ask `https://api.revenuecat.com/v1/subscribers/..` (a path that normalises away from the subscribers route, with the secret key in the header; the key only ever goes to RevenueCat).
- Smallest fix: only ask RevenueCat for a device that has a bound key and at least one scan, and reject ids that are not `[A-Za-z0-9_-]{8,64}` at the door.

### F8. The demo route writes into any device's history with no key (checked, Low)

- Named cost: shopper data integrity (rows appear in a shopper's own history), disk growth.
- Evidence: `a11` failed: a request with no key wrote 1 scan row into bound device B. Demo rows are flagged and excluded from the quota, so the weekly allowance is not changed. Limited only by the door.
- Smallest fix: apply `owns(deviceId)` as the other routes do.

### F9. A missing scan and someone else's scan answer differently (checked, Low)

- Named cost: trust (a stranger can learn which scan ids exist; ids are sequential integers).
- Evidence: `a10` failed: `POST /api/scan/:id/outcome` answered 404 for a missing scan and 403 for B's scan.
- Smallest fix: answer 403 for both.

### F10. Very long typed names go to Claude whole (checked, Low)

- Named cost: money (about $0.004 more input per ask, see worst case).
- Evidence: `i5` failed: "a 7389 character prompt went to Claude from one typed name". The only bound is Node's 16 KB header limit on GET, or the 8 KB JSON body on POST.
- Smallest fix: cut the typed name to 200 characters in `buildRangePrompt` (`identify/src/range-ask.ts`) and at the route.

### F11. The address limiter slows every request when many addresses are invented (checked, Low)

- Named cost: availability.
- Evidence: `f6` failed: after 20000 invented addresses one more `check` takes about 0.5 ms (the limit tested is 0.1 ms) because `KeyedLimiter` sweeps every remembered key on every call once it holds more than 5000 (`rate-limit.ts:42`), and a fresh address is never "quiet for a day". It grows linearly, so 200,000 invented addresses make each request cost about 5 ms.
- Smallest fix: sweep on a timer, not per call, and cap the map size (drop the oldest).

### F12. The health page shows a server file path when a data file is missing (checked, Low, V5 overlap)

- Named cost: trust (a free peek at the server's folder layout).
- Evidence: `g6` failed: `/api/health` (open even with the invite on) returned `categoryCheckWhy: "taxonomy file is missing: C:\\shin-lanes\\..."`. It only shows when the taxonomy file is missing, so it may not appear in production today.
- Smallest fix: return a short code on the open health route and keep the path in the log.

### Suspected only (read from code, no test)

- Shutter log disk use: the 300 per device per day cap is keyed on the device header, which is free to mint, so the 3000 per day total (16 MiB each at most) is the real ceiling, about 48 GB per day if the log is on. It is off by default; `h1`, `h2`, `h3` showed a frame is otherwise safe. A disk-space check (`diskHasRoom`) exists. (suspected)
- `/api/correction` with a code and no scan files a shared typed price under any code for a device that owns itself; poisoning of the price data belongs to lane V4. (suspected)
- `/api/admin/file` confines the path with `resolve` and a prefix check, which refused every traversal tried (c5) but does not resolve symlinks. (suspected)
- Whether production has `ANTHROPIC_API_KEY` set. `settings/src/index.ts:81` still says "the server makes no range ask since 2026-09-28" next to a default cap of 1000, which reads as stale. If the key is not set on the Mac, F2 costs nothing today. Not checked, production is out of scope.

## Worst-case Claude dollars per hour

Source: `identify/src/provider.ts:365-367` (claude-haiku-4-5, $1 per million input tokens, $5 per million output), `range-ask.ts` (no tools, thinking off, `MAX_OUTPUT_TOKENS` 1024, fixed system prompt of about 110 tokens plus about 90 tokens of fixed lines), `catalogue-first.ts:150` (monthly cap 1000). The fake provider counted the calls; the dollar figures are arithmetic from those counts and the rates, not a bill.

- A typical ask (a 40 character name, about 80 output tokens): about $0.0006.
- The worst ask a caller can force: a 15 KB name sent as a GET query (about 4000 input tokens, $0.004) plus the 1024 output token ceiling ($0.005): about $0.009. A POST body is capped at 8 KB so it is about half that.
- One address: 90 per 10 minutes, so 540 per hour: $0.32 typical, $5.0 worst. Many fresh devices from one address make no difference (d3).
- Many addresses, forged or real: the shared `open` bucket allows 200 per 10 minutes (1200 per hour, 1500 per day). So the hourly ceiling before the monthly cap is 1200 calls: $0.72 typical, $10.8 worst.
- The monthly cap (default 1000 calls, `catalogue-first.ts:150`) stops the whole thing: **worst case about $9 in one hour, once a month** (1000 calls at the worst ask), or about $0.60 with ordinary names. After that the cap sends nothing, the estimate falls back to the broad guess for every shopper, and nothing alerts (F2).
- Pack reads: 300 per month, developer only; no test could reach one without the admin token or a proven developer device.
- The invite code, if one is set, becomes the bucket key (200 per 10 minutes per code), which does not lower the total.
- No spend cap fails loudly: the cap works (it sent 0 after being reached) but is silent.
