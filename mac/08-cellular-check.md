# 1k. Check from a phone on cellular, off the home wifi

Not run. Cannot be run from this machine at all: it requires a phone,
physically off the home network, and the tunnel and server already up on
the Mac (items 1a through 1j done first).

## The command

On a phone, with wifi turned off (not just "not connected" -- actually
toggled off, or moved somewhere the home network does not reach, so there
is no chance of silently falling back to it), open a terminal app or run
this from a computer tethered to that phone's cellular connection:

    curl -sS -H "x-shin-invite: $SHIN_INVITE_CODE" \
      "https://relay.example.com/api/identify?gtin=KNOWN_BARCODE"

Replace `relay.example.com` with the real value of `SHIN_TUNNEL_HOSTNAME`
from `mac/config.env`, and `KNOWN_BARCODE` with a barcode already known to
resolve (any GTIN that the catalogue lane has confirmed returns a hit, or
one from a household item already scanned successfully earlier in testing).

Route, query parameter name and invite header confirmed by reading the
code directly, not guessed: `app/server.ts` line 1285 dispatches
`GET /api/identify` and reads the barcode from a `gtin` query parameter
(not `barcode`); `app/src/invite.ts` defines the header as `x-shin-invite`
and the env var as `SHIN_INVITE_CODE`, matching what `mac/config.env`
already uses.

VERIFIED WIRED: `app/server.ts` imports `INVITE_EXEMPT`, `INVITE_HEADER`,
`INVITE_REFUSAL` and `inviteAllows` and calls
`inviteAllows(req.headers[INVITE_HEADER])`, guarding every `/api/` path
except the exempt `/api/health`. The command above needs the invite
header to get a real answer once `SHIN_INVITE_CODE` is set on the Mac; a
request with no header will be refused, which is correct once the code is
configured, not a sign of a broken check.

## What a pass looks like

- An HTTP response, not a curl connection error, timeout, or TLS error.
  A connection error here (as opposed to a clean HTTP error like 401 or
  404) means the tunnel or DNS is not actually reachable from outside the
  home network, which is a different and worse failure than a wrong route
  or a missing invite code.
- A JSON body containing a real verdict (a price judgement, or the
  product's identity) for that barcode, not an HTML error page and not an
  empty body.
- Response time inside the seven-second budget item E2 sets for a real
  store scan. Time it directly:

      time curl -sS https://relay.example.com/api/identify?barcode=KNOWN_BARCODE

  Expected: the `real` time printed by `time` is under 7s.

## What a fail looks like, and what it means

- Connection refused / timeout: the tunnel is down, or DNS has not
  propagated yet (dig the hostname again, per mac/01-cloudflare-tunnel.md
  step 4).
- A response, but from the home wifi's router or ISP instead of Cloudflare
  (check the response headers for anything mentioning Cloudflare, e.g. a
  `cf-ray` header): the phone did not actually leave the home network; wifi
  was toggled off in the OS but a VPN or a fallback connection substituted
  for it. Confirm true cellular-only connectivity before trusting a pass.
- A 5xx from Cloudflare specifically: the tunnel is up but the local server
  on the Mac is not answering on the port the tunnel points at; check
  `mac/05-install-launchd.sh`'s own proof steps for the server first.
