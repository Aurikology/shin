# 1a. One subdomain, one named tunnel

Not run. Cannot be run from this machine: it needs the founder's Cloudflare
login and a Mac with cloudflared installed. Every command below is exact so
the Mac session spends minutes, not an hour, working out the syntax.

Checked before writing this (web search, current as of 2026-09-11):
Cloudflare's own docs for creating a tunnel and routing DNS
(developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/
and .../do-more-with-tunnels/local-management/create-local-tunnel/) and for
running cloudflared as a macOS service
(developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/macos/).
A quick tunnel (`cloudflared tunnel --url ...`) is explicitly marked
testing-only by Cloudflare and its address dies with the process, which is
why this uses the dashboard-managed named tunnel with a connector token
instead.

## Why this path, not the CLI credentials-file path

cloudflared supports two ways to run a named tunnel: a locally-managed
tunnel (CLI creates a UUID and a credentials JSON file under
~/.cloudflared/, you write a config.yml by hand) or a remotely-managed
tunnel (the Zero Trust dashboard creates the tunnel and hands you a single
connector token). The founder's own plan (item I3) says he will "paste a
tunnel token into the environment file", which only makes sense for the
token path, so that is the one written here. It also means the tunnel's
credentials really do live only in the environment file (mac/config.env),
never as a JSON file inside this repo.

## Steps

1. Fill in `SHIN_DOMAIN_APEX` in `mac/config.env` (copied from
   `mac/config.env.example`) with the domain already delegated to Cloudflare
   DNS for the paused ACT venture, and pick a neutral `SHIN_TUNNEL_SUBDOMAIN`
   that names nothing (not "shin", not "beta", not the mascot's name -- the
   hostname shows up in network requests, never to a shopper, but treat it
   as public anyway). `SHIN_TUNNEL_HOSTNAME` is those two joined with a dot.

2. In the Cloudflare dashboard (dash.cloudflare.com), open Zero Trust >
   Networks > Tunnels > Create a tunnel. Choose "Cloudflared" as the
   connector. Name it whatever `CLOUDFLARE_TUNNEL_NAME` is set to
   (`shin-beta` by default).

3. The dashboard shows an install command containing a long token after
   `--token`. Copy only the token (the part after `--token`, not the whole
   command) into `CLOUDFLARE_TUNNEL_TOKEN` in `mac/config.env`.

4. Still in the dashboard, on the same tunnel, add a Public Hostname:
   - Subdomain: the value of `SHIN_TUNNEL_SUBDOMAIN`
   - Domain: the value of `SHIN_DOMAIN_APEX`
   - Service: HTTP, `localhost:4173` (or whatever `PORT` is set to in
     `mac/config.env`)
   This is the one DNS record this item adds. It is a CNAME the dashboard
   creates for you, on the subdomain only; it never touches the apex, so
   mail forwarding on the apex is untouched. Confirm this afterward with:

       dig ${SHIN_TUNNEL_SUBDOMAIN}.${SHIN_DOMAIN_APEX} CNAME +short

   Expected output: one line ending in `.cfargotunnel.com.`. If that line
   is missing, the hostname was not created and step 4 needs redoing.

5. Install cloudflared on the Mac. UPDATED after the Mac inventory: a
   session on the Mac ran `which cloudflared` and found nothing, so this is
   a real step, not a check that will already pass. The inventory did not
   check for Homebrew itself, so test that first:

       which brew

   If that prints a path, use Homebrew:

       brew install cloudflared

   If it prints nothing, do not install Homebrew just for this one binary;
   Cloudflare ships a signed installer directly:

       curl -L --output cloudflared.pkg https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.pkg
       sudo installer -pkg cloudflared.pkg -target /

   (Apple Silicon Macs also work with the amd64 .pkg since it is
   installed through Rosetta by that installer; if `uname -m` on the Mac
   prints `arm64` and this .pkg fails, use
   `cloudflared-darwin-arm64.pkg` from the same releases page instead --
   check the actual architecture on the Mac before choosing, do not
   assume.)

   Proof it worked: `cloudflared --version` prints a version string.

6. Install the tunnel as a system service using the token from step 3:

       sudo cloudflared service install ${CLOUDFLARE_TUNNEL_TOKEN}

   This writes and loads cloudflared's own launchd daemon
   (com.cloudflare.cloudflared, installed system-wide because of `sudo`,
   which is what makes it restart on boot without anyone logged in -- the
   Mac is meant to run headless most of the time). This is why mac/ does not
   also hand-write a competing tunnel plist for the token path: the command
   above generates the real one. `mac/launchd/com.shin.tunnel.plist` in this
   directory is kept only as a fallback for the locally-managed path, if the
   dashboard token approach turns out to be unavailable (e.g. no Zero Trust
   seat) and the CLI path has to be used instead; see the comment at the top
   of that file for the three extra commands it needs first.

7. Proof the tunnel is actually up: on the Mac,

       sudo launchctl list | grep com.cloudflare.cloudflared

   Expected output: one line, with a PID (not `-`) in the first column. Then
   from any device on any network (this is the point of item 1k, not this
   item, but a first check is free here):

       curl -sSI https://${SHIN_TUNNEL_HOSTNAME}/

   Expected output while the app server is not running yet: a connection
   that reaches Cloudflare and gets a 502 or 503 from cloudflared (proves
   DNS and the tunnel are live) rather than a DNS failure or a timeout
   (which would mean the record or the tunnel is not actually up).

## What was not run, and could not be

Every command above needs the founder's Cloudflare login, a Mac with
network access, and cloudflared installed on it. None of that exists on
this Windows laptop. Nothing here is claimed as done; it is the exact
command list so it costs the Mac session minutes.
