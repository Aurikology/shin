# Post-launch readiness pass: shared brief for every worker (2026-11-18)

Jamin asked: *"are we ready for EVERYTHING"* once Pexi has users. This pass builds the finite list that
answers it. You are one of several workers. Read this whole file, then your own task in your prompt.

## What "everything" and "ready" mean here

**Everything** = every event after launch that, if nobody acts, costs money, users, trust, data, legal
standing or Jamin's time. Good events count too (a viral spike breaks things).

**Ready** for one event = all four:
1. we would find out it happened (an alarm, an email, a report), not from a 1-star review;
2. someone owns it (Jamin, Aurik, or an automatic job);
3. a written response exists (what to do, a few lines);
4. that response has been tried once.

Consciously accepting a risk, written down with its named cost, also counts as ready.

## Pexi in facts (check anything you rely on; label "checked" or "assumed")

- **The app:** a Canada-only, all-ages iOS app (Capacitor web app in a native shell, `native/`, `app/public/`).
  - Scan a grocery barcode or type a name, and it says whether the price is great, good, reasonable or bad.
  - Rated 4+, bilingual EN/FR.
  - Free: 10 barcode scans a week (rolling). Pexi Plus: 100 a week, CA$3.99/month or CA$29.99/year, through Apple
    in-app purchase with RevenueCat.
  - No accounts, names or emails. Phones are known by a random device id kept in the Keychain plus localStorage.
  - Not yet public: TestFlight build 9 (2026-11-17).
- **The server:**
  - `app/server.ts`, Node, SQLite databases.
  - Runs on Jamin's MacBook Air at home, as user "worker", under launchd jobs: server, Cloudflare tunnel, nightly
    backup (14 kept, same disk, unencrypted), deploy checker, weekly Project Hammer price refresh, others (see
    `mac/`).
  - The phone talks to `relay.anjiawenda.com` through a Cloudflare tunnel, free plan. Who owns that domain, and
    when it renews, is unknown.
  - FileVault and the firewall are off on the Mac (`docs/security-check-mac-2026-11-16.md`).
- **Deploys:** a push to `main` lets the Mac's checker run the tests, then deploy or refuse (live untouched).
  Proven working 2026-11-17.
- **Alarm:** `.github/workflows/server-alarm.yml`.
  - Probes the server every 30 minutes, and GitHub emails Jamin after two failures in a row.
  - Also checks the weekly price refresh is under 8 days old.
- **AI:** Anthropic Claude estimates a price when Pexi has none, only if the shopper agreed. It is sent product
  name, brand, size, category and country, never a device id. Cap of 1,000 calls a month, which alerts loudly.
- **Data sources:** Open Food Facts and the other Open Facts, Open Prices, OSM Overpass (called from the server),
  Icecat, USDA, BC Liquor Distribution Branch, and retailer prices from Project Hammer (weekly refresh).
- **People:**
  - Jamin: founder, university student, one person. Starts a 16-month full-time AMD internship on May 3, 2027.
  - Aurik: partner. French translation, testing, App Store paperwork.
  - Support email: usepexiapp@gmail.com since 2026-11-22 (the old-name useshinapp@gmail.com stays open for older builds and forwards here). Who reads it
    is unknown.
- **Read before you write** (they hold what is already known, so do not just restate them):
  - `docs/security-check/FINDINGS.md`
  - `docs/security-check/legal-review-2026-11-17.md`
  - `docs/privacy/data-requests.md`
  - `docs/privacy/breach-plan.md`
  - `docs/launch-gaps-2026-11-06.md`
  - `mac/README.md`
  - `RULINGS.md` (it wins over everything else)

## Rules for every worker

- **Read only.** Write only your own output files under `docs/readiness/raw/`. Do not edit any other file. Do not
  commit. Do not contact the Mac, any service, any person, or any account. Reading public web pages is fine.
- **Do not spawn sub-agents.** Your final report is under 150 words: counts by state, your 5 most costly gaps,
  anything you could not check.
- **Calibration first.**
  - "detect_status" and every claim about what exists is "checked" only if you saw it in the code, a doc, a
    command output or a source page.
  - Otherwise it is "assumed". A search that found nothing is "not found", not "does not exist".
- **Data sources and retailers:** operational responses only (what to do: switch off a source, reply, remove
  rows). No legal opinions on scraping or licences; Jamin has called that overstepping.
- **Customer-facing fixes:** never propose something that makes shoppers less likely to pay or stay, unless its
  cost (a fine, a ban, lost data) is named.
- **Plain words** in "event", "response" and "smallest_fix". No em dashes anywhere.
- **Be exhaustive within your angle.**
  - Go through every pairing your prompt lists (each actor with each action, each part with each failure mode).
  - A pairing that does not apply goes in your coverage file as one line, not as an item.
  - Merge near-duplicates.

## Output format

**File 1:** `docs/readiness/raw/<your-name>.jsonl`. One JSON object per line, one event per line, with exactly
these fields:

```
{"id":"<your-name>-01","lens":"<your-name>","event":"one plain sentence: what happens",
 "trigger":"what causes it","cost":"named cost if nobody acts, with a rough size",
 "likelihood":"high|medium|low (first year after launch)",
 "detect":"how we would find out today, or 'nobody would know'","detect_status":"checked|assumed",
 "owner":"Jamin|Aurik|automatic|nobody","response":"2 to 4 short steps",
 "response_exists":"yes: <where>|no","tried":"yes: <when, evidence>|no",
 "state":"ready|partial|gap|accepted","smallest_fix":"plain words","fix_cost":"minutes or hours, and any money",
 "sources":"file:line or URL for each checked claim"}
```

**File 2:** `docs/readiness/raw/<your-name>-coverage.md`. The grid of pairings you considered, one line each:
the pairing, then "item <id>" or "n/a: <reason>".
