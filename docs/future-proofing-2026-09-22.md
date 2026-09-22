# Future-proofing Shin, 2026-09-22

Jamin's ask: "make sure shin works for the future", covering the name, turning the MVP's switched-off
parts back on, and scaling. Sources: two read-only audits of this repo on 2026-09-22 and a web search
of fees and registries on the same day. Every number carries its source or says estimate.

## The name

| Step | Cost | Source |
| --- | --- | --- |
| File SHIN with CIPO, classes 9 and 42, self-filed (no agent needed) | CA$491.06 first class + CA$149.04 each added = CA$640.10 | ised-isde.canada.ca trademark fees page |
| Wait to first examination | about 8 months | smartbiggar.ca, CIPO examination notice |
| Canadian filing starts a 6-month Paris Convention priority window for the US | included | USPTO MPEP s.213 |
| Attorney clearance on the two live US class 42 marks (incl. Reg. 5082432) before any US filing | estimate US$300 to 1,000 | legalmoveslawfirm.com (estimate) |
| USPTO filing | US$350 per class | uspto.gov fee notice, effective 2025-01-18 |
| Madrid Protocol through CIPO for US/EU/UK later | 653 CHF base + about 100 CHF per country + each country's fee | ised-isde.canada.ca Madrid page |

Checked live 2026-09-22 with no account or form (registry lookups only):

| Name | Status |
| --- | --- |
| getshin.app, useshin.com, shinscan.com | available |
| shin.app, shinapp.com | taken |
| shin.ca | probably taken, confirm at whois.cira.ca |
| instagram.com/shinapp, x.com/shinapp | taken by unrelated accounts |
| tiktok.com/@shinapp | unknown, check by hand |
| App Store app named exactly "Shin" | none found by web search, not a guarantee |

The team already uses useshinapp@gmail.com, and useshin.com is free, so one name works across the
domain, the email and the handles (@useshin, to be checked on each platform).

## Turning the MVP's switched-off parts back on

Photo identification, languages, the welcome screen and the country picker each sit behind one flag
in `app/public/js/flags.js`, default off, code kept. The audit found each one still wired and
tested (photo: `POST /api/identify/photo`; languages: `lib/locale.js`; country: `catalogue/src/market.ts`,
already global). Other countries need price crawlers: `price/src/crawl.ts` fixes currency to CAD, and
`catalogue/src/alternatives.ts` maps only CA to a sold-in column (one entry per country by design).

## What breaks first as users grow

1. **Data loss, at any size.** No backup has ever run or been restored (`mac/07-backup.sh`,
   `07-restore.sh` both "Not run"), and the script skips `people.db` and `user-catalogue.db`.
   Sent to the Mac 2026-09-22: extend the script, run it, restore it into a scratch folder and compare
   row counts, schedule nightly, copy off the Mac's disk.
2. **Rate-limited scans just fail.** No retry loop on Gemini 429s was found in
   `identify/src/providers/gemini.ts` or `gemini-scan.ts` (grep, 2026-09-22). Already item 5 of the
   accuracy plan on the Notion page, Aurik's line.
3. **One Mac, one process.** Fine to about 1,000 users (estimate). SQLite takes one writer at a time.
4. **Two servers would break the limits.** The photo rate map (`app/server.ts` ~849), the answer cache
   (~1062) and the spend cap file (`identify/src/cap.ts` ~92) live in one process, so a second server
   gets its own CA$10 a day cap. They need a shared store before a second server is added.
5. **Cost.** Corrected 2026-09-22. The first version charged every scan a fresh search and assumed
   20 scans per user. It ignored the shared repeat-scan cache already in `app/src/repeat-cache.ts`
   (keyed by barcode, not device: any scan of a product checked in the last 6 hours costs nothing).
   Rates re-read from ai.google.dev/gemini-api/docs/pricing on 2026-09-22: Gemini 2.5 Flash search
   free for 1,500 prompts a day, then $35 per 1,000; tokens $0.30 in / $2.50 out per 1M, about
   $0.0034 a scan at 4,500 in / 800 out. Gemini 3.x search free for 5,000 queries a month, then $14
   per 1,000, about 4 queries a scan; 3.8 Flash tokens about $0.0064 a scan.

   Assumed (estimates, to be replaced by beta numbers): 8 scans per user a month, 60 percent of
   scans answered from the cache.

   Gemini 2.5 is not accessible on the beta server (Jamin, 2026-09-22), so only 3.x counts. Scans
   now go to 3.x by default; `SHIN_GEMINI_SPLIT=1` brings back the 2.5/3.x split.

| Users | Scans a month | Paid Gemini calls | Gemini 3.x (3.8 Flash) |
| --- | --- | --- | --- |
| 1,000 | 8,000 | 3,200 | about $130 |
| 10,000 | 80,000 | 32,000 | about $1,900 |
| 100,000 | 800,000 | 320,000 | about $19,900 |

   Search is most of it: about 4 queries a scan at $14 per 1,000 is $0.056, against $0.0064 of
   tokens. Fewer queries per scan is the biggest lever. The old no-cache, 20-scan figure is the
   ceiling: about $12,400 a month at 10,000 users. Two numbers the beta must record to replace the guesses: scans per active user a month,
   and the share of scans served from the cache. Thinking tokens bill as output and are not in the
   token figure.

## Order

Backup first (any size), then retries (burst traffic), then the trademark filing (its 6-month US
window starts on filing), then the shared store before a second server.
