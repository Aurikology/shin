# Cutover: Pexi's live server from the home Mac to the VPS

Target since 2026-11-27: Oracle Cloud Always Free ARM (VM.Standard.A1.Flex, Ubuntu 24.04 aarch64, us-chicago-1), claimed
by linux/oracle-claim.py; fallback after 2026-12-10 is a paid x86 VPS (Vultr Toronto). OVH notes below are history.
Oracle specifics: the default user is `ubuntu`; the image's own iptables rules are the firewall (provision.sh keeps them
and skips ufw); inbound is also limited by the VCN security list (pexi-vcn), which only needs SSH because traffic arrives
through the Cloudflare tunnel; the boot volume is 100 GB. An arm64 container rehearsal on 2026-11-27 passed npm ci and
loaded onnxruntime-node, sqlite-vec and sharp (emulated, provisional); GNU tar failed under emulation only.

Written before the server exists. Nothing here has been run on a real Ubuntu 24.04 box: every command is unverified until
step 1 to 8 are done once on the new machine. Steps 1 to 9 change nothing the app's users can see. Only step 10 moves
traffic, and step 12 is the way back.

Names used below: `VPS` is the new box (`ssh ubuntu@<VPS-IP>`, the image's default user),
`MAC` is the home Mac (`ssh worker@<MAC>`), data folder on the Mac `/Users/worker/shin-data`, on the VPS `/var/lib/pexi`.
Expected total: about 2 hours of work, of which the user-visible write freeze is about 10 minutes.

## Gates (Jamin, before step 10)

1. **Privacy text.** The privacy page must name the new host before traffic moves: on Oracle the data sits in
   Chicago, USA (outside Quebec and outside Canada). The HOSTING flag in app/public/js/legal/document.js needs a US
   variant; his call and his wording; the cutover does not edit it.
2. **Off-site backup target** chosen (`SHIN_RESTIC_REPOSITORY`), same one the Mac uses, so the VPS jobs keep writing to it.
3. **A Healthchecks.io project ping key** (`SHIN_HC_PING_KEY`) and the dead-man ping URL (`SHIN_DEADMAN_URL`).
4. A **read-only deploy key** on the GitHub repo (step 3).

## 1. Order the box and provision it (VPS, as the default user)

```sh
ssh ubuntu@<VPS-IP>
sudo apt-get update && sudo apt-get install -y git
git clone <repo-url> /tmp/pexi-bootstrap && cd /tmp/pexi-bootstrap     # any read access works for this one clone
sudo bash linux/provision.sh --dry-run          # read what it will do
sudo bash linux/provision.sh                    # idempotent: safe to run twice
```

Put your SSH public key in `/home/pexi/.ssh/authorized_keys` BEFORE the hardening runs, or `provision.sh` skips the SSH
lockdown on purpose and says so (it will not lock you out). After adding the key, run `sudo bash linux/provision.sh` again.
Check from a second terminal before closing the first: `ssh pexi@<VPS-IP> true`, then `sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin'` (both off).
Check: `node -v` prints v24.14.0; `swapon --show` lists 4G; `ufw status` allows only SSH; `timedatectl` says America/Toronto.

## 2. Keys and the two clones

```sh
sudo -u pexi ssh-keygen -t ed25519 -f /home/pexi/.ssh/deploy -N '' -C pexi-vps-deploy
sudo cat /home/pexi/.ssh/deploy.pub      # add as a READ-ONLY deploy key: GitHub repo > Settings > Deploy keys
sudo -u pexi sh -c 'printf "Host github.com\n  IdentityFile ~/.ssh/deploy\n  IdentitiesOnly yes\n" >> ~/.ssh/config'
sudo -u pexi ssh -o StrictHostKeyChecking=accept-new -T git@github.com    # expect "successfully authenticated"
sudo -u pexi git clone git@github.com:<owner>/<repo>.git /opt/pexi/live
sudo -u pexi git clone git@github.com:<owner>/<repo>.git /opt/pexi/stage
```

Live and stage are two separate clones on purpose: tests run in stage, and a bad commit never touches live.

## 3. Install dependencies (VPS, as pexi)

```sh
for d in app spine price catalogue identify; do (cd /opt/pexi/live/$d && npm ci) || echo "FAILED $d"; done
for d in app spine price catalogue identify; do (cd /opt/pexi/stage/$d && npm ci) || echo "FAILED $d"; done
```

Any `FAILED` line stops the cutover. (Which folders have a lockfile: `ls /opt/pexi/live/*/package-lock.json`.)

## 4. Environment file

```sh
sudo install -m 0600 -o pexi -g pexi /opt/pexi/live/linux/pexi.env.example /etc/pexi/pexi.env
sudo -u pexi nano /etc/pexi/pexi.env
```

Fill every blank secret from the Mac's `config.env` (each blank has a comment saying where it comes from). Rules:
`SHIN_NETWORK_SALT` is COPIED, never regenerated. Make `SHIN_IMPORT_TOKEN` with `openssl rand -hex 32`. Set
`SHIN_DEPLOY_REMOTE` to the repo URL. Leave `SHIN_DEPLOY_CHECK_PUBLIC=0` for now (step 11 sets it to 1).
Check there is nothing left blank that matters: `grep -E '^[A-Z_]+=$' /etc/pexi/pexi.env` should list only the ones you meant to leave empty.

## 5. Copy the data from the Mac (the long step: run it early, then repeat as a delta at step 9)

Catalogue first. It is large and nearly static, so do it days or hours ahead and only verify here.

```sh
# on the PC, only if the catalogue was just rebuilt there (nothing may be writing to it):
node mac/checkpoint-wal.mjs C:\shin\catalogue\data\catalogue.db     # expect "checkpoint done, wal file size after: 0"
# on the MAC, hash what is there, then copy it (resumable):
shasum -a 256 /Users/worker/shin-data/catalogue.db > /tmp/catalogue.sha256
rsync -a --partial --inplace --info=progress2 /Users/worker/shin-data/catalogue.db pexi@<VPS-IP>:/var/lib/pexi/
# on the VPS, compare:
sha256sum /var/lib/pexi/catalogue.db     # the hash must equal the one from the Mac (first column)
```

The catalogue's pack files (`catalogue/data/*.pack`, listed in `mac/04-catalogue-acquire.md`) live in the repo checkout,
not in the data folder: copy them the same way into `/opt/pexi/live/catalogue/data/`. If the SHA does not match, the copy
is not used: copy again.

Small databases and everything else (consistent snapshots, not a raw copy of a live WAL file): on the Mac run
`mac/07-backup.sh` (it uses `VACUUM INTO`), then rsync that snapshot folder:

```sh
# MAC
sh /Users/worker/shin/mac/07-backup.sh
LAST=$(ls -1d "$SHIN_BACKUP_DIR"/2* | tail -1)      # the folder it just made (SHIN_BACKUP_DIR from mac config.env)
rsync -a "$LAST"/ pexi@<VPS-IP>:/tmp/pexi-seed/
# VPS: put the seed in place (the restore script verifies row counts against the snapshot's own manifest)
sudo -u pexi sh /opt/pexi/live/mac/07-restore.sh /tmp/pexi-seed /tmp/pexi-restored
sudo -u pexi cp -a /tmp/pexi-restored/. /var/lib/pexi/
```

(`07-restore.sh` refuses a non-empty target and the live data folder, so it restores into a throwaway folder; the `cp` then
moves it in. If its config handling needs the Mac paths, run it with a config.env whose `SHIN_BACKUP_DIR` is `/tmp`.)
Also copy the privacy deletion log: `rsync -a MAC:~/shin-privacy/request-log.csv pexi@<VPS-IP>:/var/lib/pexi/privacy/`.

Verify the row counts match, table by table (server stopped on the VPS, still running on the Mac, so expect only the
scans, events and prices that arrived since the snapshot to differ now; step 9 repeats this with the Mac frozen and they must be equal then):

```sh
# MAC                                                        # VPS
node linux/count-rows.mjs /Users/worker/shin-data > /tmp/rows-mac.tsv    node /opt/pexi/live/linux/count-rows.mjs /var/lib/pexi > /tmp/rows-vps.tsv
diff /tmp/rows-mac.tsv /tmp/rows-vps.tsv && echo SAME
```

## 6. Install the units, prove the alert, probe the network

```sh
sudo bash /opt/pexi/live/linux/install-units.sh                  # enables timers; the server only if secrets are filled in
sudo -u pexi node /opt/pexi/live/linux/alert.mjs test            # sends one fail and one ok; confirm the email arrives
bash /opt/pexi/live/linux/probe-collectors.sh                    # must end with no "server needs is unreachable" line
systemctl list-timers 'pexi-*' --no-pager
```

If `alert.mjs test` prints "NO ALERT ROUTE" or no email arrives, stop: alerts that do not leave the box are the one thing
this move must not lose. (Whether Healthchecks gives a `?create=1` check the project's email integration is unverified: this is where it gets verified.)

## 7. Start the server on a private port and look at it

The tunnel is not up yet, so nobody reaches this copy. Start it and ask it directly:

```sh
sudo systemctl start pexi-server.service
curl -s http://127.0.0.1:4173/api/health | head -c 600
curl -s 'http://127.0.0.1:4173/api/search?q=milk' | head -c 400      # a typed-name search answers from the copied catalogue
journalctl -u pexi-server -n 30 --no-pager
```

Expect `"ok":true` and a catalogue count equal to the Mac's. A zero count or an error means the copy is wrong: fix it before going on.

## 8. Load test and memory numbers (box is idle to the public, so this is safe)

```sh
sudo systemctl stop pexi-server.service       # frees its memory so the test measures a clean box
sudo -u pexi bash /opt/pexi/live/linux/load-test.sh 1,4,16,64,128,256,512
```

It spawns a throwaway server on port 4199 over a temp data folder (no live data is written), records `free -m` before and
after, the lowest available memory and swap used during the run, and the table of requests per second with where it
breaks, into `/var/lib/pexi/health/loadtest-<time>.txt`. Compare with the Mac's recorded break at 16 non-stop users; do not
cut over if this box breaks earlier than the Mac did. Record the cold first answer in the report (the first search right after start, in that file). Then
`sudo systemctl start pexi-server.service` again.

## 9. The write freeze and the final delta (the only step with a visible effect, about 10 minutes)

Writes that happen on the Mac after step 5's copy are scans, prices, consent, events and corrections. Freeze them, copy,
and compare, then switch.

```sh
# MAC: stop the server and tunnel. From here the app shows its offline state; the apps retry.
launchctl bootout system/com.shin.server  || sudo launchctl bootout system/com.shin.server
launchctl bootout system/com.shin.tunnel  || sudo launchctl bootout system/com.shin.tunnel
sh /Users/worker/shin/mac/07-backup.sh                           # final consistent snapshot
# repeat the step 5 snapshot copy + restore into /var/lib/pexi (server stopped on the VPS), then:
node linux/count-rows.mjs /Users/worker/shin-data > /tmp/rows-mac.tsv     # MAC
node /opt/pexi/live/linux/count-rows.mjs /var/lib/pexi > /tmp/rows-vps.tsv    # VPS
diff /tmp/rows-mac.tsv /tmp/rows-vps.tsv && echo SAME            # must print SAME; otherwise do NOT go on: step 12 puts the Mac back
```

(Exact job names: `ls /Library/LaunchDaemons/com.shin.*` on the Mac; the names above are the ones the table in README.md lists.)

## 10. Move the tunnel (a named tunnel can run on several connectors at once, so the Mac MUST be stopped first, as in step 9)

```sh
# MAC: copy the tunnel's credentials file (its UUID is in ~/.cloudflared/*.json and in mac/01-cloudflare-tunnel.md)
scp ~/.cloudflared/<TUNNEL-UUID>.json pexi@<VPS-IP>:/tmp/
# VPS:
sudo mkdir -p /etc/cloudflared && sudo install -m 0600 -o pexi -g pexi /tmp/<TUNNEL-UUID>.json /etc/cloudflared/<TUNNEL-UUID>.json
sudo sed -e 's/__TUNNEL_UUID__/<TUNNEL-UUID>/g' /opt/pexi/live/linux/cloudflared/config.yml.example | sudo tee /etc/cloudflared/config.yml >/dev/null
sudo systemctl start pexi-server.service
sudo systemctl enable --now pexi-tunnel.service
curl -s https://relay.anjiawenda.com/api/health | head -c 300     # answers from the VPS now
```

Check that the answer really comes from the VPS: the Mac's server and tunnel are stopped (step 9), so any answer is the VPS; also run `journalctl -u pexi-server -n 5 --no-pager` there and see that request in it (whether the health route names its host is UNVERIFIED).
Then open the app on a phone and do one scan and one search. Delete `/tmp/<TUNNEL-UUID>.json`.

## 11. Turn on the checks that need the public address

```sh
sudo sed -i 's/^SHIN_DEPLOY_CHECK_PUBLIC=.*/SHIN_DEPLOY_CHECK_PUBLIC=1/' /etc/pexi/pexi.env
sudo systemctl restart pexi-server.service
sudo systemctl enable --now pexi-deploy.timer pexi-deadman.timer
```

Prove the outside check can fail (once): GitHub > Actions > `uptime-5min` > Run workflow with url
`https://relay.anjiawenda.com/api/does-not-exist`; the run goes red and the email arrives. Confirm the first scheduled green run within 10 minutes.
Prove a unit failure alerts: `sudo systemctl start pexi-alert@pexi-test.service` (a fail ping for job `test`), then it recovers with `alert.mjs ok test`.
Optional second clock: add `https://relay.anjiawenda.com/api/health` to a free UptimeRobot monitor.

## 12. Rollback (any time up to day 7)

```sh
# VPS: stop answering
sudo systemctl disable --now pexi-tunnel.service pexi-server.service
# MAC: start the old connector and server again
sudo launchctl bootstrap system /Library/LaunchDaemons/com.shin.tunnel.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.shin.server.plist
curl -s https://relay.anjiawenda.com/api/health | head -c 300
```

Writes made on the VPS since step 10 are not on the Mac: copy them back first when the stop was planned (`sh 07-backup.sh` on the VPS,
rsync to the Mac, restore as in step 5, mirrored). **Keep the Mac's server, data folder and plists untouched for 7 days after the move**
(do not run its jobs while the VPS runs them: stop the Mac's backup/offsite/integrity jobs after the cutover so two machines do not write the same off-site repo; leave
only the server and tunnel plists in place, stopped, ready to start).

## What stays on the Mac

- **The expiry job** (`com.shin.expiry`, monthly): the Apple signing certificate, provisioning profiles, App Store Connect key and Tailscale key live in the Mac's keychain.
- **Collectors that need a residential address or a browser**: Metro sitemaps, BC liquor, Kroger bulk, anything run from a Chrome. Which ones the box can reach is
  measured, not assumed: `probe-collectors.sh` (step 6). Hammer, Kroger (official API) and Open Prices (official API) run on the VPS when it says they are reachable
  (`install-units.sh --with-collectors`).
- iOS builds and the Shin beta server, as before (`has-a-mac`).

### How Mac-collected prices reach the server (SPEC ONLY, NOT BUILT)

Today a Mac collector writes into the live prices database on the same machine. After the move the server's database is on the VPS, so:

1. The Mac collector writes observation rows to a local scratch prices database, then exports the new rows as `delta-<time>.jsonl.gz` plus a `.sha256`.
2. It copies both files with rsync over SSH to `/var/lib/pexi/inbox/` (a dedicated key that can write only there).
3. A VPS job (not yet written, `pexi-ingest.timer`) checks the hash, validates every row against the same rules the collectors use, and ingests through the
   server's own `recordObservation`, authenticated with `SHIN_IMPORT_TOKEN`; a rejected file moves to `inbox/rejected/` and raises an alert.

Until that job exists, Mac-only collectors cannot feed the live prices, so either leave them off for the first week or rsync their scratch database into the
inbox by hand. This is a gap in the plan, stated here so it is not discovered later.

## Done means

the VPS journal shows a public request arriving; one real scan works on a phone; `uptime-5min` has a green scheduled run; `alert.mjs test` email
arrived; the first nightly backup and off-site job ran on the VPS (`systemctl list-timers`, `ls /var/lib/pexi/health/`); the Mac has been left running its
stopped server for 7 days; then and only then the Mac's server plists are removed.
