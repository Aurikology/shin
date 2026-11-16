# V7 Mac security check — 2026-11-16

Check-only, per the PC's mail request (job sec-mac). Nothing was changed, restarted or deleted.
Uncommitted: this file is not added to git, left here only as the findings record the mail asked for.

## 1. Cloudflare tunnel ingress

`~/.cloudflared/config.yml` (tunnel `shin-beta`, confirmed running as PID 931 / launchd
`com.shin.tunnel`):

```
ingress:
  - hostname: relay.anjiawenda.com
    service: http://localhost:4173
  - service: http_status:404
```

One hostname, one port (4173, the Pexi app server itself — `com.shin.server`, PID 46083).
Nothing else is forwarded; the catch-all is a 404. Nothing beyond the app server's port is
exposed through the tunnel.

## 2. Listening ports

`lsof -iTCP -sTCP:LISTEN -n -P` without sudo (sudo needs a password this session has no
terminal to supply — see note below):

```
Spotify     404  127.0.0.1:7768, *:57621      (his Spotify app, unrelated)
cloudflar   931  127.0.0.1:20241               (tunnel metrics, loopback only)
node       5652  *:65474                       (pelican/night-crawl.ts, unrelated side project)
2.1.325   44404  127.0.0.1:55524               (Chrome component, loopback only)
node      46083  *:4173                        (Pexi server, com.shin.server)
node      78683  *:8787                        (start.mjs — not identified; worth asking what this is)
```

Root-owned listening sockets (sshd, screen-sharing) don't show in lsof without sudo, so this was
tested directly instead:

- **Remote Login (SSH, port 22): ON**, and bound to all interfaces, not just loopback — it
  answered on `192.168.2.39` (LAN) and `100.112.113.11` (a Tailscale interface), not only
  `localhost`.
- **Screen Sharing (port 5900): ON**, same scope — LAN and Tailscale, not loopback-only.
- File Sharing (445/548) and Remote Management/ARD (3283): connection refused on all three —
  **OFF**.

Could not run `systemsetup -getremotelogin` (needs admin/sudo password, none available
non-interactively) to get the authoritative on/off line — the port tests above are the
substitute evidence.

One mitigating fact: `id worker` shows this account is in the macOS access-control groups
`com.apple.access_ssh` and `com.apple.access_screensharing` specifically, not just "any admin" —
so this looks like SSH/Screen Sharing scoped deliberately to the one account, not a wide-open
default.

**Not checked here, and not knowable from the Mac alone:** whether the home router port-forwards
22 or 5900 from the WAN to this machine. The Cloudflare tunnel only carries 4173; if 22/5900 are
also reachable from the open internet that would be a router-side setting, not a Mac one. Flag
as unknown, not cleared.

## 3. Firewall, FileVault, updates, version

- **macOS Application Firewall: OFF** (`socketfilterfw --getglobalstate` → "Firewall is
  disabled. (State = 0)").
- **FileVault: OFF** (`fdesetup status` → "FileVault is Off.").
- **Automatic security updates: ON** (`softwareupdate --schedule` → "Automatic checking for
  updates is turned on"; `defaults read .../com.apple.SoftwareUpdate` shows
  `AutomaticDownload=1`, `AutomaticallyInstallMacOSUpdates=1`, `CriticalUpdateInstall=1`).
- **macOS version:** 27.0.1 (build 26A434).
- **Pending updates** (`softwareupdate -l`): macOS 27.2.1 (26B131, needs a restart) and Command
  Line Tools for Xcode 27.2, both "Recommended: YES" and not yet installed, despite automatic
  install being on — likely waiting on the restart the OS update needs.

## 4. Server user

Pexi's server (`node server.ts`, PID 46083, launchd `com.shin.server`) runs as `worker`.
`dseditgroup -o checkmember -m worker admin` → "yes worker is a member of admin". **The server
runs as an admin-level user**, not a restricted service account.

## 5. Permissions on database / .env files

Everything under `/Users/worker/shin-data/` (`scans.db`, `prices.db`, `catalogue.db`,
`corrections.db`, `gaps.db`, `people.db`, `access.log`, and their `-wal`/`-shm` files) is mode
**644 — world-readable**. The server's secrets file, `/Users/worker/shin/mac/config.env`, is mode
**600** — correctly locked to the owner only.

Two things narrow the real exposure of the 644 files, worth weighing rather than treating as a
clean pass:
- The home directory itself, `/Users/worker`, is `drwxr-x---+` — "other" has **no** access, so a
  second local account could not even traverse into it to reach the 644 files.
- `dscl . -list /Users` shows exactly one human account on this Mac (`worker`); everything else
  listed is a macOS system service account. There is no second local user today who could
  exploit the wide bits.
So the 644 permissions are broader than they need to be, but nothing on this machine can
currently use that opening.

## 6. Node version vs. current LTS

Installed: **v26.7.0**. A web search (sources below) was inconclusive from a primary source:
one page lists Node 26 as the current LTS line with 26.8.2 as its latest point release, which
would put this install a couple of patch releases behind; older-looking snapshots still show
Node 24 as LTS. I could not confirm this from nodejs.org itself in this pass — treat "roughly
current, maybe a few patches behind" as the honest answer, not a confirmed one.
Sources: https://nodejs.org/en/about/previous-releases , https://www.versio.io/de/product-release-end-of-life-eol-openjs-foundation-nodejs.html

## 7. Backups

`~/bin/shin-backup.sh` (launchd `com.shin.backup`) writes nightly to `/Users/worker/shin-backup`.
`df` confirms both `/Users/worker/shin-data` and `/Users/worker/shin-backup` are on the **same**
volume, `/dev/disk3s1` — **one theft loses both**, exactly the risk the plan named.
**Not encrypted independently**, and FileVault (whole-disk encryption) is off, so the backups
sit unencrypted on the same disk as the live data. Retention: 14 nights for the small databases,
3 nights for the 4+ GB catalogue subtree (by design, to fit disk space).

## 8. Logs

`access.log` writes one JSON line per request. Three lines, IPs masked to the first two octets:

```
{"at":"2026-11-16T22:36:15.854Z","ms":11,"method":"GET","url":"/api/health","status":200,"ip":"142.172.x.x","country":"CA","ua":"node","invite":false,"who":null,"shutter":null,"referer":null,"origin":null}
{"at":"2026-11-16T22:36:23.809Z","ms":14,"method":"GET","url":"/api/health","status":200,"ip":"142.172.x.x","country":"CA","ua":"lookout-server/1","invite":false,"who":null,"shutter":null,"referer":null,"origin":null}
{"at":"2026-11-16T22:36:48.328Z","ms":12,"method":"GET","url":"/api/health","status":200,"ip":"142.172.x.x","country":"CA","ua":"node","invite":false,"who":null,"shutter":null,"referer":null,"origin":null}
```

So it records: timestamp, response time, method, url, status, IP, country, user-agent, an
invite flag, `who`, `shutter`, referer and origin — no raw device id or scan content in the
line itself.

Rotation/retention: `src/retention.ts` deletes `access.log` lines older than **90 days**
automatically (matches the stated privacy policy, per that file's own header). That deletion
explicitly does **not** reach two other places that log keeps growing: the nightly backup
copies, and the server's own stdout/stderr (`~/shin/mac/logs/server.out.log` /
`server.err.log`, currently ~145–196 KB each) — those have **no rotation or size cap at all**
today. Not urgent at current size, but worth a note to Jamin rather than fixing here.

## What couldn't be checked without a password

`sudo` requires an interactive password this non-interactive session has no terminal to supply,
so `systemsetup -getremotelogin` and a couple of other named commands in the mail couldn't be
run verbatim. Where that mattered, a direct equivalent check (port probing, `fdesetup`,
`socketfilterfw`, which turned out not to need sudo here) stands in above, and is marked as
such rather than left silent.
