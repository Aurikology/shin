# 1a. One subdomain, one named tunnel

Not fully run, but further along than earlier drafts of this file claimed.
Everything under "Already done" below is a fact from a session on the
Mac, not a plan; everything under "Remaining steps" has not been run.

Checked before writing this (web search, current as of 2026-09-11):
Cloudflare's own docs for creating a tunnel and routing DNS
(developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/
and .../do-more-with-tunnels/local-management/create-local-tunnel/) and for
running cloudflared as a macOS service
(developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/macos/).
A quick tunnel (`cloudflared tunnel --url ...`) is explicitly marked
testing-only by Cloudflare and its address dies with the process, which is
why this uses a named tunnel instead, whichever way it is created.

## Already done, on the Mac

- cloudflared 2026.9.1 installed via Homebrew, at
  `/opt/homebrew/bin/cloudflared`.
- `cloudflared tunnel login` already run. This is the one step in this
  whole item that is a person's own click, not a script: it opens a
  browser, the founder authorizes it against his own Cloudflare account,
  and Cloudflare hands the CLI a certificate. That already happened; the
  certificate is written at `~/.cloudflared/cert.pem`, mode 600.
- `cloudflared tunnel list` answers cleanly and reports zero tunnels,
  which is the correct empty state (not an auth failure -- an auth
  failure would refuse to answer at all, not answer with an empty list).
- The account carries exactly one zone: `anjiawenda.com`, Active, Free
  plan. That is `SHIN_DOMAIN_APEX` in `mac/config.env`, and it is the only
  zone the tunnel can possibly sit under, so there is no domain choice
  left to make.

Because the login already produced a certificate, the natural path from
here is the locally-managed one (CLI creates the tunnel, a config.yml
names the hostname), not a separate dashboard-token flow that would need
a different credential the Mac does not have a reason to hold. The
dashboard-token path (`cloudflared service install <token>`) is documented
as an alternative at the end of this file only in case the founder would
rather manage the tunnel from the Zero Trust dashboard than the CLI; it is
not needed given what already exists on the Mac.

## Remaining steps, all scripted, none needing a person at the keyboard

1. Create the named tunnel:

       cloudflared tunnel create shin-beta

   Expected output: a line with a tunnel UUID and confirmation that a
   credentials file was written to `~/.cloudflared/<UUID>.json`. That
   file is the tunnel's own credential from here on; it stays under
   `~/.cloudflared/` and never goes in this repo.

2. Route the DNS record. This is the one subdomain record item 1a asks
   for, and it is the only one: it never touches the apex, so the mail
   forwarding already running on `anjiawenda.com` is untouched.

       cloudflared tunnel route dns shin-beta relay.anjiawenda.com

   Expected output: a confirmation the DNS record was added. Verify
   directly:

       dig relay.anjiawenda.com CNAME +short

   Expected: one line ending in `.cfargotunnel.com.`. If that line is
   missing, step 2 did not actually create the record.

3. Write the ingress config. Fill in the real UUID from step 1's output
   and the Mac's own username into `mac/cloudflared/config.yml.example`
   (copy it to `~/.cloudflared/config.yml`, do not leave the template in
   place of the real file):

       tunnel: <the UUID from step 1>
       credentials-file: /Users/worker/.cloudflared/<the UUID>.json

       ingress:
         - hostname: relay.anjiawenda.com
           service: http://localhost:4173
         - service: http_status:404

4. Install it as a system service (LaunchDaemon, starts on boot, no login
   needed afterward):

       sudo cloudflared service install

   Expected output: confirmation it wrote and loaded a LaunchDaemon.
   Proof:

       sudo launchctl list | grep com.cloudflare.cloudflared

   Expected: one line, with a PID (not `-`) in the first column.

5. Proof the tunnel is actually up, before the app server is even running
   (a 502/503 from Cloudflare, not a DNS failure or a timeout, is the
   correct state here):

       curl -sSI https://relay.anjiawenda.com/

   Expected: a response that reached Cloudflare (a `cf-ray` header is the
   clearest sign) with a 502 or 503, since nothing is listening on
   localhost:4173 yet.

## Alternative, not needed given the above: the dashboard-token path

If a future session would rather manage the tunnel from the Zero Trust
dashboard instead of the CLI: Networks > Tunnels > Create a tunnel >
Cloudflared, copy the token from the install command it shows, add a
Public Hostname (subdomain `relay`, domain `anjiawenda.com`, service
`http://localhost:4173`), put the token in `CLOUDFLARE_TUNNEL_TOKEN` in
`mac/config.env`, and run `sudo cloudflared service install <token>`
instead of step 4 above. The two paths install to the same place and
should never be run together against the same tunnel name.

## What is still not verified

Steps 1 through 5 above have not been run; only the "already done" section
is a session's own measured fact. `mac/launchd/com.shin.tunnel.plist` and
`mac/05-install-launchd.sh`'s tunnel section stay documented as a further
fallback (a hand-rolled LaunchAgent instead of `cloudflared service
install`), needed only if `service install` itself cannot be used for some
reason not yet encountered.
