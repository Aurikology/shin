# Session record: MVP, name, and scan cost, 2026-09-21 to 2026-09-22

A record of one chat between Jamin and a Claude session on the PC. His words are quoted verbatim;
everything else says what was done and where it landed.

## What he asked, in order

1. *"we are running into a lot of issues trying to make a one size fits all products with shin. Lots
   of people give advice that apps should be launched fast and not too focused on refining before
   getting user data. What do you think of this. Also, what is a mvp that we can boil this product
   down into and ship"*
2. *"since things like the mascot and other things that are already built should be kept. Things
   like the welcome screen, the photo id, the languages etc. should be kept off for now. Plan out in
   detail what the mvp should include. Also, we still need the subscription screen etc."*
3. *"build everything to prepare for the mvp launch"*
4. *"open up the page in chrome for me to register shin"*
5. *"we wwant to create the store listing under shin"*
6. *"make sure shin works for the future"*, then all three options offered plus *"consider
   everything for scaling in the future"*, then *"also verify shin's name works for the future"*
7. *"these numbers are completely unreasonbale"* (the first cost table)
8. *"you should knwo based on the mac that gemini 2.5 is not accessible"*
9. *"this pricing model is a huge red flag for us. With this model we will be in the negatives every
   month. I want you to research all possible avenues these are some but not limited to these
   examples: how do we fine tune grounding with google search to only search once per query, how
   can we reduce costs in other ways by first searching a free database, how much can we charge,
   how many scans should we provide, is claude also an option etc"*
10. *"refine this method. Dig deep into it. Research all posibilities, edge cases, do a manual
    walkthorugh. Look for open source tools avaliable and more"*
11. *"this is still not refined. You also didn't look at what open source tools exist or research
    how other companies online do it"*
12. *"push changes and a record of this chat"*

## What was done

| Ask | Result | Commit |
| --- | --- | --- |
| 1, 2 | MVP plan: ship the barcode scan, keep the mascot, switch off welcome flow, photo ID, languages and country picker behind flags, add a subscription screen and a weekly free-scan limit | 76d24f6 (`docs/mvp-plan.md`) |
| 3 | MVP built and live: feature flags, free-scan quota on the server (off until a number is set), paywall screen wired to RevenueCat (keys still needed), price-match line on the answer, tests | 7e784d7 |
| 4, 5 | Registration pages opened in Chrome for him; store listing name recorded as "Shin" | e3801f4 (`docs/decisions.md`) |
| 6 | Name protection costs (CIPO filing CA$640.10 for two classes, US route), domains checked (useshin.com, getshin.app, shinscan.com free), what breaks first as users grow (no backup ever run, no retry on rate limits, one Mac, per-process limits) | be9bc5a, `docs/future-proofing-2026-09-22.md`; backup job sent to the Mac by mailbox |
| 7 | Cost table corrected to count the shared repeat-scan cache and 8 scans a user a month | be9bc5a |
| 8 | Every scan now goes to Gemini 3.x; the 2.5/3.x split only returns with `SHIN_GEMINI_SPLIT=1` | 8a17a3c |
| 9 | Unit economics: today about $0.062 a scan (derived from one measured scan of about 4 searches); a free-identity plus one-search pipeline about $0.002; no Gemini 3.x setting caps searches; pricing and conversion benchmarks; the 10,000-user month | abee784 (`docs/unit-economics-2026-09-22.md`) |
| 10 | 19-barcode identity walkthrough, Google Shopping Canada searched by hand, provider and legal table, edge-case guards, cost = $0.0025 + f x $0.062 where f is the fallback share | 26ed23c (`docs/cheap-scan-pipeline-2026-09-22.md`) |
| 11 | Pipeline rebuilt from open-source tools and company methods: ShopSavvy's tiered sourcing, affiliate feeds with barcodes (Impact, AWIN, Rakuten), retailer page markup where allowed, crowd prices, one search last; barcode-exact matching first; Canadian scraping case law; Vynn found as a direct competitor (its public lookup refused every call on 2026-09-22) | 5e6a0e2 (`docs/scan-pipeline-v2-2026-09-22.md`) |

## Open, his calls

1. Apply to Impact, AWIN and Rakuten as a publisher (needs a public website).
2. Let Shin's own catalogue identify products on the scan path.
3. Allow one paid search per scan (DataForSEO preferred; Serper's terms say B2B only).
4. Ask the shopper to type a name when no source knows the barcode.
5. Show shopper-typed prices once moderated, labelled as from shoppers.
6. RevenueCat and store setup, and a Terms page, before the paywall can take money.

## Open, not his calls

- The 50-barcode paired test (new pipeline against today's call, pass marks set first).
- The Mac has not sent a receipt for the backup job.
- This PC's repeat cache holds 0068100084245 as "Kraft Dinner"; every source says Kraft peanut
  butter 1 kg. Looks like test data in the real data folder; check the Mac's cache too.
- Install Vynn when it ships and run the 19 walkthrough barcodes through it.
