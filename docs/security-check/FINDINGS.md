# Pexi vulnerability and legal check: findings, ranked

Run 2026-11-16 on Jamin's word (*"run the plan"*), from `docs/security-legal-check-plan-2026-11-16.md`.
Six reports in this folder plus the Mac's (`docs/security-check-mac-2026-11-16.md`, 31bce1e).
Ranked by named cost. "Checked" = proved by a test, a command or the code; "suspected" = read only.

**How it was checked:** 69 attack tests against a local server (49 blocked, 20 holes; rerun by the
boss session from outside the worker's word, same 69/49/20), a poisoning simulation on the local
server, 60 read-only GET/OPTIONS requests to production, a full-history secret scan of all three
repos, a policy-versus-code table of 67 claims, primary-source legal research, and the Mac's own
check (nothing changed on it). Attack tests live in lane `C:\shin-lanes\sec-routes` (`app/test/security-*`)
until the fix loop lands them with their fixes.

**Clean:** no live secret in any history, the public pages repo or the phone bundle; no reachable
high or critical dependency advisory; no SQL injection or path traversal found on a route; the French
legal pages say the same as the English; the tunnel exposes only the app port; no identical PEXI
trademark in Canada.

## A. Server holes (fix loop, code only)

| # | Finding | Cost | Sev | Source |
|---|---|---|---|---|
| A1 | The server listens on every interface, and the per-address limits believe a `cf-connecting-ip` header any direct caller can forge. Anyone on the Mac's network or Tailscale skips every limit. Tunnel origin is `http://localhost:4173` (Mac report), so binding to loopback is safe | money, data | Med | v3 F1, v1 M3, v5 F5 |
| A2 | The shared Claude allowance and the 1,000-a-month cap can be used up by one caller in about an hour; honest shoppers then lose estimates, and the cap is silent. Worst case about $9 a month, so the cost is answers, not dollars | trust | Med | v3 F2 |
| A3 | Free weekly scans follow a device id anyone can mint; a new id is a new allowance | revenue | Med | v3 F3 |
| A4 | A device id no phone has bound yet is open to whoever names it; the demo route writes into any device's history; a missing scan and someone else's scan answer differently | shopper data | Med | v3 F4, F8, F9; v1 L9 |
| A5 | No guess limit on the admin token or the invite code beyond the door limit; the invite code ships inside the app | data | Med | v3 F5, v1 M1 |
| A6 | Strangers can read daily scan counts (`/api/latency`), a server file path (`/api/health`), and catalogue notes naming retailers that answered 403 to Pexi's fetches | trust | Low | v5 F6, F7; v3 F12; v1 L3 |
| A7 | Very long typed names go to Claude whole (a 7,389-character prompt from one name); made-up device ids each cost a RevenueCat lookup; Overpass lookups are free for any caller; standard security headers missing; methods unchecked on read routes | money, small | Low | v3 F6, F7, F10, F11; v5 F8, F11 |

## B. Fake answers (needs Jamin's thresholds)

| # | Finding | Cost | Sev | Source |
|---|---|---|---|---|
| B1 | One phone can set or sink the price on a product with no shop price or only one over 90 days old; one phone can push a fake low price where there is one shop price. Products with 2+ shop prices held against 40 fake phones | trust | Med | v5 F1, F2 |
| B2 | Two free phones from one address rename an unknown barcode | trust | Med | v5 F3 |
| B3 | The typed-name pool has no outlier rejection (suspected); there is no way to remove a poisoned price | trust | Med-Low | v5 F9, F10 |

## C. Live settings (Jamin)

| # | Finding | Cost | Sev | Source |
|---|---|---|---|---|
| C1 | Production has no invite gate and the weekly limits are off: unlimited free scans for anyone | revenue | Med now, High at paid launch | v5 F4, l3 finding 9 |

## D. The Mac (Jamin's yes; some need the Mac password)

| # | Finding | Cost | Sev | Source |
|---|---|---|---|---|
| D1 | FileVault off: a stolen laptop gives away every database, key and backup | data, fine | High | Mac report |
| D2 | Backups unencrypted on the same disk as the live data: one theft or disk failure loses both | data | High | Mac report |
| D3 | Firewall off; SSH and Screen Sharing listen on the home network and Tailscale (scoped to one account) | data | Med | Mac report |
| D4 | The server runs as an admin user | data | Med | Mac report |
| D5 | macOS 27.2.1 update pending | data | Low | Mac report |

## E. Privacy policy and store pages (before submitting)

| # | Finding | Cost | Sev | Source |
|---|---|---|---|---|
| E1 | The policy says RevenueCat is contacted only by the app and only for Plus, and that no outside service gets the device id. The app contacts RevenueCat at every launch (`main.js:142`) and the server sends it the device id (`scan-quota.ts:185`) | fine, App Store | High | l3 finding 1 |
| E2 | App Review notes describe a first screen that no longer exists | App Store | Med | l3 finding 13 |
| E3 | No working data access or deletion procedure; no breach plan; several tables and logs are never swept although the policy promises deletion on a schedule; backups keep deleted data | fine | Med | l3 findings 2, 3, 4, 8 |
| E4 | Google ML Kit may need a disclosure; the privacy manifest needs the Mac's pods and the real build to prove complete | App Store | Med, unproven | l3 finding 6, v1 M4 |

## F. Law (lawyer packet: `l2-l4-l5-legal-research.md`, 26 questions)

| # | Finding | Cost | Source |
|---|---|---|---|
| F1 | Quebec s.17: a privacy impact assessment and a written agreement for each recipient outside Quebec (Cloudflare, Anthropic, RevenueCat) before communicating personal information there. Not done | fine | L2(2) |
| F2 | All ages: the OPC published Canada's first Children's Privacy Code on 2026-10-20 (parental consent under 13, location off by default, a practical way to delete). Quebec s.4.1, consent for under 14. Whether Pexi's device id and IP log count is the lawyer's first question | fine | L2(2), L2(3); news release checked by the boss session |
| F3 | Quebec Consumer Protection Act: Terms s.12 ("keep using = accept") conflicts with s.11.2; Terms s.11 exposed under s.10; the paywall needs the s.54.4 pre-contract disclosures | fine, refunds | L4(2) |
| F4 | Apple's Canada terms make a GST/HST number a condition for a Canadian-resident developer; then Apple collects and remits under the s.177(1.1) election | account | L5(4) |
| F5 | Trading as "Pexi" needs an Ontario business name registration | fine | L5(3) |
| F6 | ODbL s.4.6 wants a machine-readable copy offered, which "on request" may not meet; Icecat data ("All rights reserved") is mixed into the ODbL catalogue | licence | L5(2) |
| F7 | Trademark: no identical PEXI. Nearest: SPEXI (9, 42), PEXIL (42, pending, opposition window open), PIXID, the PIXI family. Lawyer to judge confusion and whether to file PEXI now | name | L5(1) |

Unconfirmed by the research: Apple's line for "infrequent" alcohol references, Ask to Buy on
subscriptions, whether the 2026 Quebec subscription amendments reach Apple-billed subscriptions and
from when, the Ontario fee, and who is the "merchant" for an Apple in-app purchase.

## What happens next

- **A1, A2, A4 to A7, E1, E2: fixed 2026-11-16** (fix log in this folder; 71 of 71 attack tests, suite 2,288 pass 0 fail). A3 narrowed only (a phone can still mint a new id for a fresh free allowance, options in the fix log); A4 legacy window narrowed, not closed. Mac, on Jamin's word: point the tunnel origin at 127.0.0.1.
- **B1 to B3, C1, D1 to D5, F1 to F7:** Jamin's calls, listed in the chat reply of 2026-11-16.
