# parts: coverage grid (part x failure mode)

Failure modes: down, slow, wrong answers, broken into, full, corrupted, expired, misconfigured, silently stopped.

## iPhone app
- iPhone app x down (crash on launch, bad build): item parts-17
- iPhone app x slow: item parts-29
- iPhone app x wrong answers (old version vs new server contract): item parts-18
- iPhone app x broken into (invite code and bundle contents): n/a: covered by security findings A5 and fixed 2026-11-16; not a parts issue
- iPhone app x full (device storage evicts the offline pack): item parts-19
- iPhone app x corrupted (local pack or IndexedDB): item parts-19
- iPhone app x expired (hardcoded domain, certificate, store membership): item parts-11
- iPhone app x misconfigured (flags compiled in wrong): item parts-17
- iPhone app x silently stopped (no kill switch, launch crash reports nothing): item parts-17
- Offline pack x all modes: items parts-19, parts-23

## Server process
- Server x down: items parts-07, parts-08, parts-09
- Server x slow: item parts-29
- Server x wrong answers: item parts-05
- Server x broken into: n/a: security lens (findings A1 to A7); Mac exposure in item parts-04
- Server x full: item parts-14
- Server x corrupted: item parts-15
- Server x expired (keys): items parts-12, parts-25
- Server x misconfigured: items parts-13, parts-26
- Server x silently stopped: items parts-05, parts-06

## Databases
- scans.db x down/corrupted/full: items parts-15, parts-14
- scans.db x wrong answers (quota fails open): item parts-26
- prices.db (including Hammer mark) x stale/wrong: items parts-21, parts-22
- catalogue x wrong or missing: item parts-23
- corrections.db x corrupted/lost: items parts-15, parts-02
- user catalogue db x corrupted/lost: items parts-15, parts-02
- people db x corrupted/lost: items parts-15, parts-02, parts-03
- quota (counted from scans.db) x all modes: item parts-26
- device keys x down/corrupted/broken into: item parts-27
- databases x slow: item parts-29
- databases x expired: n/a: no expiry on a database; retention sweeps are item parts-28
- databases x misconfigured (wrong path to empty data): item parts-13
- databases x silently stopped (no integrity check): item parts-15

## Logs and photos
- Access log and server logs x full/unrotated: items parts-14, parts-28
- Access log x corrupted: n/a: plain append files; delete tool rewrites in place (checked in code), no failure seen
- Logs x broken into/privacy (hold device ids): item parts-28
- Photos folder x full: item parts-16
- Photos folder x corrupted/missing: item parts-16
- Photos folder x broken into: item parts-04

## Backup and restore
- Backup x silently stopped/down: item parts-01
- Backup x full: items parts-01, parts-14
- Backup x same disk, theft: items parts-02, parts-04
- Backup x expired (14 by count, never by age): item parts-01
- Backup x misconfigured (SHIN_BACKUP_DIR, real script lives off-repo): item parts-01
- Restore x wrong/untried/resurrects deleted data: item parts-03
- Restore x broken into: n/a: restore refuses the live data dir and non-empty targets (checked in 07-restore.sh), so no extra path

## Tunnel, domain, network
- Cloudflare tunnel x down: item parts-10
- Tunnel x slow: item parts-29 (free plan limits not checked)
- Tunnel x broken into (credential): item parts-12
- Tunnel x expired (certificate/credential): item parts-12
- Tunnel x misconfigured (origin to 127.0.0.1): n/a: covered by finding A1, fixed code side 2026-11-16; Mac-side change was Jamin's yes, not confirmed
- Domain x expired: item parts-11
- Home internet outage: item parts-10

## Deploy, alarm, jobs
- Deploy checker x down/stalled: item parts-20
- Deploy x wrong build live: item parts-08
- Deploy checker x broken into: n/a: no inbound port; pulls from the remote only (checked, checker.mjs ls-remote)
- Alarm x silently stopped/breaks/email lost: item parts-06
- Alarm x blind spots (health body, slow answers): items parts-05, parts-29
- Hammer weekly refresh x all modes: items parts-21, parts-22
- Other launchd jobs (checker, backup, tunnel fallback) x silently stopped: items parts-01, parts-20
- Catalogue build pipeline x all modes: item parts-23
- Other data feeds (Open Food Facts, Open Prices, StatCan, BC Liquor, Overpass, Icecat, USDA) x stale or wrong: item parts-22 (no legal comment made)

## Settings and secrets
- config.env x misconfigured: item parts-13
- config.env/secrets x lost/expired/stolen: items parts-12, parts-04
- Network salt x missing: item parts-31

## The Mac itself
- Power/battery/sleep: item parts-09
- macOS update restart: item parts-07
- Disk failure: item parts-02
- Theft: items parts-02, parts-04
- Home internet outage: item parts-10
- Overheating/lid closed: item parts-09

## Plus, limits, price rules, deletion
- RevenueCat to server Plus check x down/expired/silent: item parts-25
- Quota x misconfigured (limits off): item parts-26
- Rate limits (in memory, lost on restart) x slow/spike: item parts-29 (app/src/rate-limit.ts not read, assumed)
- Claude cap x full: item parts-24
- Shopper-price agreement x wrong answers: item parts-30
- Shopper-price agreement x misconfigured (salt): item parts-31
- Delete-my-data script x broken/untried: item parts-32
- Delete-my-data x nobody reads the request: item parts-33

## Not read in this pass (assumed or not found)
- mac/01-cloudflare-tunnel.md, price/src/estimate.ts, identify/src/pack-read.ts, app/src/rate-limit.ts, scripts/security/remove-shopper-input.mjs, ~/bin/worker-heartbeat.sh, the real ~/bin/shin-backup.sh, docs/privacy/breach-plan.md beyond a preview. Nothing on the Mac was contacted.
