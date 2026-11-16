# Pexi: vulnerability and legal check, the plan

Asked by Jamin 2026-11-16: *"create a detailed plan to perform a vunrability and legal check"*,
the same message as *"this app is for all ages"* (RULINGS, "Pexi is for all ages"). Written for
the sessions that run it and for Jamin. Nothing here has been run yet.

**Goal:** before 1.0 goes public, find every way Pexi can lose money, leak a shopper's data, get
pulled from the App Store, or break a law, and fix or knowingly accept each one. Every finding is
ranked by its named cost: money, shopper data, App Store rejection or removal, a fine.

**Labels used below:** *checked* = read from the code, the repo or a live call on 2026-11-16.
*To confirm* = a legal or platform fact written from memory; the step that needs it confirms it
from the primary source (statute, regulator page, Apple or Anthropic document) before anything
rests on it. Hard rule: no unsourced statement as fact.

---

## 0. What exists already (checked)

- **Six security fixes, live since 2026-11-07** (9083e33): Plus is not believed from the phone's
  header, shutter log off and capped, scan writes need the scan's own device, per-address limits,
  developer ids must prove themselves, CSP and no source maps. The PC probe gives 28 of 28 routes
  to the phone origin and 0 of 28 to a foreign site.
- **Gemini and photo scanning removed** (e217bf7), so no image leaves the phone.
- **Backups** of all 7 databases, restore proven (Mac, 2026-11-07).
- **Server alarm** on GitHub Actions (643803d).
- **Phone end-to-end check** against the live server (0c340fe).
- **Legal pages** published 2026-11-07 in English and French on the public `xu826Jamin/pexi` pages
  repo. The terms carry no 18+ line (grep, 2026-11-16).
- **Lawyer list** (launch gaps 24, 25): privacy, terms, French pages, Quebec transfer note, Quebec
  subscription rules, "Pexi" trademark, a wrong-price disclaimer, Anthropic commercial terms,
  business registration and tax. Nobody has reviewed any of it yet.
- **Never done:** a whole-surface security review. The six fixes came from a list, not from a
  route-by-route audit, a dependency scan, a secret scan of history, or a look at the Mac itself.

## 1. The attack surface (checked)

| Part | What it is | Why it matters |
|---|---|---|
| Server | `app/server.ts` on Jamin's Mac laptop, public through a Cloudflare tunnel (`mac/01-cloudflare-tunnel.md`); about 34 `/api/*` routes, including `/api/admin/*`, `/api/identify/pack` (Claude), `/api/shelf/frame` and `/api/shutter/frame` (uploads), `/api/scan-price` (shopper-typed prices), `/api/scan-rating/delete` | The only door to every shopper's data and to the Claude bill |
| Identity | A device key per phone (`src/device-key.ts`), no accounts; developer devices and an admin token | Whoever forges a device key is that shopper |
| Money | RevenueCat entitlement for Plus; weekly scan quota (`src/scan-quota.ts`); Claude calls cost money per request (`src/model-cost.ts`) | Free Plus, or a script that runs up the Anthropic bill |
| Data | SQLite files: people, scans, prices, user-catalogue (shopper prices, reviews), catalogue; access log (`src/access-log.ts`); retention job (`src/retention.ts`) | Location, device ids and IP addresses are personal information |
| Shared answers | A typed price is saved for the next shopper (11-14); an unknown barcode is named from 2+ devices' picks | A bot can poison what real shoppers are told |
| Phone app | Capacitor iOS build, bundled JS, camera, optional location, RevenueCat public key | Anything in the bundle is public |
| Repos | GitLab `origin` (shared with Aurik), GitHub `shin` (private, checked), GitHub `pexi` pages (PUBLIC, checked) | A secret in any history is leaked forever |
| Host | The Mac: macOS, launchd jobs, tunnel, Node, backups on the same disk | Whoever owns the Mac owns everything |

## 2. Vulnerability check, in order

Every test that writes runs against a **local copy** of the server with copied databases, never
production (`docs/decisions.md`, "Builders and tests cannot damage real data"). Against production
only read-only probes: headers, TLS, CORS, rate-limit responses. Every finding becomes a DEFECTS
row and goes through the fix loop: red test first, smallest fix, gate, push, next build asked.

### V1. Secrets (PC, about 30 minutes)
1. Run gitleaks over the full history of all three repos (GitLab, GitHub shin, GitHub pexi).
2. Unpack the shipped build (the `.ipa` from build 8, or `native/ios/App/App/public`) and grep it
   for keys, tokens, internal hostnames, developer device ids and admin token names.
3. List every secret the server reads (`process.env.*`) and where each lives (Mac `.env`, Vercel,
   GitHub Actions). Each one: who can read it, and how to rotate it.
4. **Done means:** zero live secrets in any history or bundle, or each one found is rotated the
   same day (Jamin rotates, since the accounts are his).

### V2. Dependencies and static scan (PC, about 30 minutes)
1. `npm audit` in `app/`, `spine/`, `catalogue/`, and the native project's pods and npm packages.
2. Semgrep (Node and TypeScript rules) over `app/server.ts` and `app/src/`, then a read by hand of
   the classic faults: SQL built from strings, file paths built from request input (`/api/pack`,
   the frame uploads), request bodies with no size cap, JSON parsed without a try, error messages
   that echo internals.
3. **Done means:** no high or critical advisory reachable from a route; every hand-read fault
   either fixed or written down as not reachable, with the line that shows why.

### V3. Route-by-route access table (PC, about 2 hours; the core of the check)
One row per route: who may call it, what proves it, what it reads, what it writes, its rate limit,
whether it costs money. Then one attack test per row against the local copy:
1. **Another shopper's data:** with device A's key, read or delete device B's scans, ratings,
   typed prices (`/api/scans`, `/api/scan-rating/delete`, `/api/correction`).
2. **Free Plus:** reach 11+ scans a week, or Plus answers, without a RevenueCat purchase (headers,
   a replayed request, a made-up device, the quota route).
3. **Admin and developer routes:** every `/api/admin/*` route and the developer-only pack read with
   no token, a wrong token, an empty token, a token in the wrong header.
4. **Claude bill:** the most Claude calls one address, one device and many devices can force per
   hour, and what that costs in dollars from `src/model-cost.ts`. Is there a monthly cap that
   stops calls, and does it fail loudly?
5. **Consent:** can any route send a product name to Claude when the shopper's consent is off?
6. **Rate limits behind Cloudflare:** is the client address read from Cloudflare's header and
   only when the request really came through the tunnel, or can a caller send a fake
   `X-Forwarded-For` and get a fresh limit each time?
7. **Invite code:** can it be guessed by trying many?
8. **Uploads:** the frame routes with a huge body, a non-image, a path in the file name.
9. **Done means:** the table exists, every row has a passing attack test in the suite, so a later
   change that reopens a hole goes red.

### V4. Poisoned answers (PC, about 1 hour)
1. How many devices does it take to make every shopper see a fake price for one barcode, and to
   rename an unknown barcode? Device keys are free to make, so "2+ devices" may mean "one script".
2. What stops it today (per-address limits, outlier rejection, trust flags), measured on the local
   copy with a scripted attack.
3. **Done means:** a number ("N fake devices from M addresses move the price by X%"), and Jamin's
   call on whether that is acceptable for 1.0. This is a trust risk, not a data leak: one viral
   screenshot of a wrong price costs more than the fix.

### V5. Dynamic scan (PC, about 1 hour)
1. OWASP ZAP baseline against the local copy, with the phone's origin (`capacitor://localhost`).
2. Read-only probe of production: TLS grade, security headers, CORS from a foreign origin
   (the existing `scripts/phone-contract-probe.mjs`), what `/api/health` reveals to a stranger.
3. **Done means:** no high finding open; `/api/health` tells a stranger nothing internal.

### V6. Phone app (Aurik for the device half, PC for the rest, about 1 hour)
1. Capacitor config: allowed navigation, no cleartext traffic, no debug webview in release.
2. Where the device key is stored and whether a backup or another app can read it.
3. Apple's privacy manifest (`PrivacyInfo.xcprivacy`) lists every required-reason API the app and
   its pods use; App Store Connect's privacy label matches what the app really sends.
4. **Done means:** a release build with debug off, and the label matching the access table from V3.

### V7. The Mac (Mac session, Jamin's yes for any change, about 1 hour)
1. The tunnel exposes the app's port only; no SSH, file sharing or screen sharing open to the
   internet; the macOS firewall on.
2. FileVault on, automatic security updates on, Node current, the server not running as an admin
   user, database files readable only by the server's user.
3. Backups: on the same disk (one theft loses both) or off the machine; encrypted or not.
4. Logs: what the access log keeps (IP, device, location?) and for how long, against what the
   privacy policy says.
5. **Done means:** each item checked and reported by the Mac; any change made only on Jamin's word.

## 3. Legal check, in order

Pexi is Canada only (RULINGS), and for all ages. The lawyer is needed for opinions; everything a
session can check against the code and the store pages is done first, so the lawyer's hours go to
questions only a lawyer can answer.

### L1. What the store pages say against what is true (PC plus Jamin's clicks, about 1 hour)
Already open on the launch gaps list, each one a rejection or misleading-claim risk:
1. **"Unlimited scans"** in the description and review notes while Plus gives 100 a week (gap 16).
2. **Availability: 148 countries** while the ruling is Canada only (gap 17). Fixing this matters
   for the legal check: sold in the US or EU, Pexi would also face COPPA, US state privacy laws and
   GDPR, which this plan does not cover.
3. **Content Rights** unanswered (gap 19); **"Part XX Canada compliance: Missing Info"** (gap 22);
   reviewer access and test barcodes (gap 23).
4. **Done means:** every store page line matches the app and the rulings, checked in App Store
   Connect after a reload.

### L2. All ages: what changes (PC research, then the lawyer)
1. **Apple:** a 4+ rating outside the Kids category is ordinary; the Kids category rules (no
   third-party analytics, parental gates) apply only if Pexi is listed in Kids. Confirm the primary
   category is not Kids. *To confirm* against Apple's App Review Guidelines 1.3 and the current
   age rating questions, which Apple reworked in 2025.
2. **Alcohol in answers:** the catalogue holds 7,555 BC liquor products (checked,
   `docs/store/listing.md`), and the rating says "None" for alcohol references (Jamin's ruling).
   An App Review risk, not a legal one: a reviewer who scans a wine bottle may see a priced liquor
   answer under a 4+ rating. Options for Jamin: keep as is, or keep liquor out of answers.
3. **Children's personal information:** Pexi asks for no name, email or birth date, but it keeps a
   device id, optional location, IP addresses, scans and typed prices. *To confirm:* Quebec's
   privacy law (as amended by Law 25) requires a parent's consent to collect a minor's personal
   information under 14, and the federal Privacy Commissioner expects parental consent for children
   under 13. The lawyer question: does Pexi's data count, and is "a minor uses Pexi with a parent's
   permission" (Terms section 2) enough, or must location stay off for everyone by default (it
   already is) and something more be added?
4. **Claude:** *to confirm* in Anthropic's current Usage Policy and commercial terms what is
   required of a product whose users may be minors. Pexi sends only product names, with consent,
   so the likely answer is light, but it must be read, not assumed.
5. **Paid subscriptions and minors:** Apple takes the payment (and Ask to Buy covers family
   accounts). Low risk; lawyer confirms in one line.

### L3. Privacy policy against the code (PC, about 2 hours; the most useful legal step)
Every sentence in the privacy policy that says what Pexi collects, sends, keeps or deletes is
checked against the code and the live server, the same way V3 checks routes:
1. A table: claim, the code that makes it true or false, the result.
2. Known claims to test (checked present in `docs/store/privacy.html`): location off by default
   and rough; Claude does not receive images, the device id or location; the same information is
   collected from every user whatever their age.
3. Retention: what `src/retention.ts` and the Mac's log rotation really delete, against the policy.
4. Shopper rights: how a shopper asks for their data or its deletion, and whether a session can do
   it with a script today. PIPEDA and Quebec both give these rights.
5. A named privacy officer, published (Quebec requires one; *to confirm* wording).
6. Breach plan: who notices, who decides, who reports (PIPEDA requires reporting a breach with a
   real risk of significant harm; *to confirm*), written as one page.
7. Data leaving Quebec and Canada: Anthropic, Cloudflare and RevenueCat (all outside Canada)
   against `docs/store/quebec-transfer-note.md`.
8. **Done means:** every claim true, or the code or the policy changed so it is; the French
   pages carry the same change.

### L4. Consumer and advertising law (PC drafts, lawyer confirms)
1. **Competition Act:** Pexi's own hard rule 2 (no savings claim until measured) checked across
   the store listing, screenshots, paywall and marketing video.
2. **Wrong-price disclaimer:** Pexi tells people a price is good or bad; the terms need a plain
   line that answers are estimates (lawyer list item). Draft it, lawyer approves.
3. **Quebec subscription rules** for online contracts, renewal notice and cancelling (lawyer list
   item); the support page already says how to cancel (gap 28).
4. **French:** Quebec's Charter of the French language and its 2022 changes; *to confirm* what it
   asks of an app sold in Quebec beyond translated legal pages.

### L5. Names, data licences, business (Jamin and the lawyer)
1. **Trademark:** "Pexi" in the CIPO database (only domains were checked, 2026-10-01). A session
   can run the search and list near matches in grocery or software classes; the lawyer judges.
   (The project's hard rule 1 already blocks the old Shin name for a trademark reason.)
2. **Data licences:** Open Food Facts data is under the ODbL, which asks for attribution and has a
   share-alike clause for databases built from it (*to confirm* how it applies to Pexi's merged
   catalogue). `src/attribution.ts` already attributes sources; check it covers every source
   in the answers. Where retailer prices come from is left out of this plan, on Jamin's 2026-11-07
   call; it goes in only if he says so.
3. **Business:** registration of the name Pexi trades under, and GST/HST. *To confirm:* whether
   Apple collects and remits GST/HST on Canadian App Store sales, which would mostly settle the
   sales tax question.

## 4. Order, owners, cost

| Step | Who | Rough time | Return |
|---|---|---|---|
| V1 secrets | PC session; Jamin rotates any found | 30 min | A leaked key is the cheapest way to lose everything |
| V3 access table | PC session | 2 h | Shopper data, free Plus, the Claude bill |
| L1 store pages | PC session drafts, Jamin clicks | 1 h | Store rejection and misleading claims |
| L3 policy against code | PC session | 2 h | The privacy law risk most likely to be real |
| V2, V5 scans | PC session | 1 h | Known holes in libraries and headers |
| V4 poisoned answers | PC session | 1 h | Trust; one number and Jamin's call |
| V7 the Mac | Mac session, Jamin's yes | 1 h | Theft or takeover of the one server |
| V6 phone | Aurik plus PC | 1 h | App Review and privacy label |
| L2, L4, L5 | PC session prepares one packet | 2 h | Turns the lawyer list into exact questions |
| Lawyer | Jamin books | Lawyer's hours | The opinions only a lawyer can give |

About a day of session work in all, run as lanes in parallel where files do not overlap (V1, V2,
V5 and L1 share nothing). Ends with one findings list, ranked by named cost, and one lawyer packet:
the policy, terms, French pages, Quebec note, the access table from V3, the policy check from L3,
and the questions from L2, L4 and L5.

## 5. Calls for Jamin

1. Run it all before submitting 1.0, or only V1, V3, L1 and L3 (about 5.5 hours) now and the rest
   before public release?
2. Liquor products in answers under a 4+ rating: keep, or keep them out (L2.2)?
3. Who is the named privacy officer (L3.5): you, or Aurik?
4. Which lawyer, and when.
