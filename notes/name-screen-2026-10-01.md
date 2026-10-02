# Name screen, 30 candidates, 2026-10-01 (run 2026-10-01 to 2026-10-02)

Search record for a grocery/product price-and-rating scanner app (mascot, Canada first, US later). Not legal advice; nobody here is a lawyer. The name is the founder's call. Anything not run is marked NOT RUN. "Close" means a mark whose word equals the name or one of its sound-alike spellings (c/k/ck, i/y/ie/ee, z/s, x/ks, o/oh/ow/oe, doubled consonant collapsed, plus a few loose swaps).

## Bottom line

- **Stage 1: 3 of 30 survived all four tests: Pexi, Yuzo, Dibbo.** 27 are OUT (table).
- **Stage 2 changed the order.** Yuzo dropped in stage 2: `yuzo.app` is a live AI meal-planning service (same grocery/food world) and the Canadian register holds live YUZU marks in classes 9, 35, 42 (one letter from Yuzo). Bonto was brought in as third (it failed stage 1 only on small games apps; zero live Bonto marks in Canada or US), with its own risks listed.
- **Best two: Pexi and Dibbo.** Neither has a live same-word mark anywhere in Canada or the US in any class. Pexi: `pexi.app` and `pexi.com` are registered, plus a close PEXIP (video software, class 9/35/42) one letter longer. Dibbo: `dibbo.com` is an operating holding company (Dibbo Limited, energy engineering and property), `dibbo.app` and both `get` domains are unregistered.
- Stage 1 was run on the registers and stores only. Meaning checks (1d) were run for the survivors and Bonto only; the other 26 were eliminated earlier and were not meaning-checked (NOT RUN).

## Methods and controls

| Engine | Method | Control (a known name returns a known hit) |
|---|---|---|
| CIPO | Same POST the CIPO search page makes (`https://ised-isde.canada.ca/cipo/trademark-search/srch`, JSON payload `searchfield1=tm`, `textfield1=<name>` and `<name>*`, `maxReturn=1000`), run from inside the loaded CIPO page. Page URL pattern: `https://ised-isde.canada.ca/cipo/trademark-search/srch?payload=%7B%22domIntlFilter%22%3A%221%22%2C%22searchfield1%22%3A%22tm%22%2C%22textfield1%22%3A%22<name>%22%2C%22display%22%3A%22list%22%2C%22maxReturn%22%3A%221000%22%2C%22nicetextfield1%22%3Anull%2C%22cipotextfield1%22%3Anull%7D&pageNum=0&pageLen=1000`. Database dated 2026-09-30 (page header). | "shin" returned 57 results, the same count as the shinn note (`C:\shin\notes\trademark-search-shinn-2026-10-01.md`), run twice on 2026-10-01/02. |
| USPTO | The site's own backend call (`https://tmsearch.uspto.gov/prod-stage-v1-0-0/tmsearch`, query `wordmark:<name>*`, 300 rows) from inside the loaded `https://tmsearch.uspto.gov/search/search-results` page, and its UI once (query "pexi" returned 1 row, PEXILUMILAR). Each variant spelling was queried separately. | "shinn" returned the live pending SHINN (class 043, Ume Hospitality) and NORI SHINN that the shinn note lists. The USPTO WAF returned HTTP 403 mid-run after about 400 requests and cleared later; the 403 itself is shown on `https://tmsearch.uspto.gov/errors`. Names run after the block are noted. |
| iTunes | `https://itunes.apple.com/search?term=<name>&entity=software&country=ca&limit=200` and `country=us`; any app whose title contains the name as a whole word was listed. | "shein" returned SHEIN-Shopping Online first in both storefronts (`https://itunes.apple.com/search?term=shein&entity=software&country=ca&limit=200`). |
| Google Play | `https://play.google.com/store/search?q=<name>&c=apps&hl=en&gl=CA`, page HTML parsed. Run for the stage 2 names only. | "shein" returned com.zzkko (SHEIN) first. |
| Domains | RDAP: `.com` at `https://rdap.verisign.com/com/v1/domain/<d>`, `.app` at `https://pubapi.registry.google/rdap/domain/<d>`. A 404 means unregistered. | google.com and google.app both returned 200. |

Limits: the USPTO "close" test is whole-word, so compounds (SHINNTYPE style) show only in the prefix lists; the iTunes API returns a relevance-ranked sample of up to 200 apps, so an app that never ranks is missed; CIPO and USPTO status text decides "live" (anything not abandoned, expunged, cancelled, refused, withdrawn, expired).

## Stage 1 table (all 30)

Source key. CIPO: the page URL pattern above with the name. iTunes: `https://itunes.apple.com/search?term=<name>&entity=software&country=ca&limit=200` (US: `country=us`). USPTO: backend call above; registration numbers link as `https://tsdr.uspto.gov/#caseNumber=<reg>&caseType=US_REGISTRATION_NO&searchType=statusSearch`.

| # | Name | Verdict | Reason (first hard hit; others noted) |
|---|---|---|---|
| 1 | Pocko | OUT | CIPO: POKO REGISTERED class 35 (2084976, 2055953) and POCO REGISTERED classes 7,9,11,35,42 (2173076). USPTO: POCO REGISTERED classes 009,038,035, Xiaomi Inc. (reg 6109791). iTunes: exact apps "Pocko" (Finance) and "POCKO channel". |
| 2 | Bimo | OUT (app only) | iTunes CA and US: exact app "Bimo" (Business, Bimo Tech Solutions Limited) and "Bimo - Family Screen Habits" (Lifestyle, Oluna LLC). Marks: no live 9/35/42 hit; CIPO BIMO OPPOSED class 30 (2054839); USPTO BIMO live class 011 (Bei Ke). |
| 3 | Zuno | OUT | iTunes: "Zuno: Food & Cosmetic Scanner" (CA and US), the same category as the product. USPTO: ZUNO REGISTERED class 042 (Cognida, reg 7969475) and ZUNO classes 035,041,009,042 (Elernity, suspension letter). |
| 4 | Kibi | OUT | USPTO: KIBI REGISTERED classes 042,009,035, Teseo S.R.L. (reg 6274661). CIPO: KIBI REGISTERED classes 29,30 (1505929). iTunes: "Kibi: Road Trip Planner" and others. |
| 5 | Pexi | **SURVIVED** | CIPO 0 literal; USPTO 0 live literal; iTunes CA/US no app named Pexi. Details in stage 2. |
| 6 | Nubo | OUT | USPTO: NUBO REGISTERED class 009 twice (Clicksie LLC reg 7451156; Sensirion AG reg 6617422). iTunes: exact apps "Nubo" and "Nubo: Voice Baby Tracker & Log". |
| 7 | Vappi | OUT | USPTO: VAPI REGISTERED class 042, Vapi Inc. (reg 7822872), a doubled-consonant sound-alike. iTunes none, CIPO none. |
| 8 | Ruko | OUT | CIPO: Ruko REGISTERED class 9 (2240613) and Ruko FORMALIZED class 9 (2468510). USPTO: RUKO classes 009 (three live, e.g. reg 3211120, 7625333). iTunes: many Ruko apps. |
| 9 | Dovi | OUT (app only) | iTunes: exact app "DOVI" (Business, Dialog One LLC) and "Dovi - Snap.Swap.Smile". Marks: CIPO none; USPTO DOVI live class 005 only. |
| 10 | Tikko | OUT | CIPO: TIKKO REGISTERED, classes 5,9,12,...,35 (1641634) and TIKKO TRAVELS (1644964). iTunes: "Tikko: Food & Allergen Scanner" (CA and US). USPTO: TIKO class 042 and 035. |
| 11 | Quibb | OUT | USPTO: QUIB REGISTERED classes 041,042,045 (reg 4425904). iTunes none; CIPO none. |
| 12 | Mivo | OUT | USPTO: MIVO REGISTERED class 009 (reg 6936394), MYVO class 009. iTunes: "Mivo Scrolling". CIPO none. |
| 13 | Zelo | OUT | CIPO: ZeLo REGISTERED classes 21,35 (2098886). USPTO: ZELO classes 009,042 (Zelo AS, reg 7518167), 021,035 (Nitto Denko, reg 7021584). iTunes: exact "Zelo". |
| 14 | Kaja | OUT | USPTO: KAJA AUDIO REGISTERED class 009 (reg 7368135); CAJA classes 007,009. iTunes: "Kaja POS" (Food & Drink). |
| 15 | Bonto | OUT (app only), promoted to stage 2 as replacement | iTunes: "Bonto - بونطو" (Games, 3 ratings CA / 10 US) and "Bonto Cat". Marks: zero live BONTO in CIPO or USPTO. Details in stage 2. |
| 16 | Fizzo | OUT | CIPO: FIZZO REGISTERED classes 9,16,35,38 (2137581). USPTO: FIZZO REGISTERED classes 009,042, Lemon Inc. (reg 7805934). |
| 17 | Pibbo | OUT | USPTO: PYBBO REGISTERED class 009 (reg 5672749). iTunes: "Puppy & Dog Training: Pibbo". CIPO: PIBO class 33. |
| 18 | Okko | OUT | CIPO: OKKO & Design REGISTERED classes 9,35,38 (1601713). USPTO: OKKO REGISTERED class 009 (Tzumi reg 7891918; Okko Pro reg 6498669). iTunes: many Okko apps. |
| 19 | Wenzo | OUT | iTunes CA and US: exact app "Wenzo" (Travel, Wenzo Technologies Corp.). CIPO: only VENZO class 12. USPTO NOT RUN (already OUT). |
| 20 | Sayo | OUT | iTunes: "Sayo - Speak and Learn English", "Sayo - Share Fun", "Sayo: Voice Tasks & Notes". CIPO: SAIO classes 9,42 (2158117, 2130672), ZAYO. USPTO NOT RUN. |
| 21 | Cheko | OUT | USPTO: CHEKOH REGISTERED class 009 (Tai Shanying). iTunes: "Cheko: ..." (Utilities). CIPO none. |
| 22 | Ziko | OUT | iTunes: "ZIKO: ..." (Shopping), "ZIKO.pl" (Shopping), "Ziko: TV Show Crosswords". CIPO: ZICO class 10 only. USPTO NOT RUN. |
| 23 | Yuzo | **SURVIVED stage 1**, dropped in stage 2 | See stage 2. |
| 24 | Dibbo | **SURVIVED** | Details in stage 2. |
| 25 | Vexo | OUT | CIPO: VEXO REGISTERED classes 1,6,7,9,... (2189148). iTunes: exact apps "Vexo" (two). USPTO NOT RUN. |
| 26 | Kovo | OUT | CIPO: KOVO REGISTERED classes 9,35 (2106305). iTunes US: "Kovo - Fast Credit Builder" (12,326 ratings). USPTO NOT RUN. |
| 27 | Rexo | OUT (app only) | iTunes CA and US: exact app "REXO" (Shopping, 53 ratings US). Marks: no live 9/35/42 hit in CIPO or USPTO (USPTO REXO live classes 021, 005). |
| 28 | Zev | OUT | iTunes: apps named "ZEV ..." (ZEV Driver App, ZEV Carshare by "Zero Emission Vehicle Cooperative"), so the letters already read as zero-emission vehicle. CIPO: ZEV class 5. USPTO NOT RUN. |
| 29 | Bix | OUT | CIPO: BIX REGISTERED class 9 (0435961). iTunes: exact app "Bix" (Games, 417 ratings US) and "Bix Produce Checkout". USPTO NOT RUN. |
| 30 | Pim | OUT | CIPO: PIM REGISTERED class 9 (1578198), PIM-GUARD class 9. iTunes: many PIM apps. USPTO NOT RUN. |

Caveat on the "app only" rows (Bimo, Dovi, Bonto, Rexo, and in part Cheko): the rule was to eliminate on an exact-name app. Each of those apps is small (0 to 53 ratings) and mostly in another category, so the founder may weigh them lighter than a register hit. Rexo's is a Shopping app, the closest category.

## Stage 2

### Pexi

- **CIPO** (variants run: pexi, pexy, peksi, pexee, pexie, each exact and with `*`): literal PEXI 0 results. Close: SAF-T-PEXY REGISTERED class 10 (1364825, Kimberly-Clark, surgical). All 13 "pexi*" prefix rows read: PEXINTIVE (class 5), PEXIOVEQ (5,42), Pexion & Design (5), PEXION (5), PEXIDAN (1), PEXIDAN L/T ECLIPSE (1), **PEXIL ADVERTISED class 42 (2431643)**, PEXIMLIO (5), three abandoned, PEXID expunged. PEXIL is the nearest live software-class mark in Canada (one letter longer, pronounced differently); an agent's call.
- **USPTO** (58 rows read): literal PEXI 0. Close dead: PEXIE CANCELLED class 009 (reg 5408873). Live prefix marks, all 27 read: PEXISONG 7, PEXIBROY 25, PEXIUT 20, PEXIDAN 1, PEXINTIVE 5, PEXICOR 21, PEXIHOAP 3, PEXIO 8, PEXIY 11, PEXILOR 18, PEXISAOH 25, PEXIC WINDOWS 37, PEXILUMILAR 11, PEXINHC 21, PEXIZUAN 21, PEXIMLIO 5, PEXITE 17, PEXIOAN 25, PEXIN GSHEI 18, PEXIN 24, PEXINA 5, PEXIOVEQ 5,42, PEXIVA 42, **PEXIP (Pexip AS) classes 038,009,042 and PEXIP ONE classes 038,009,035,042**. PEXIP's owner Pexip AS also publishes an app "Pexip" on Google Play (package com.pexip.connect, from the Play search page above; I did not verify its business beyond that); the marks sit in the software classes and differs from PEXI by one letter and its final sound. Highest-priority item for an attorney.
- **App Store (CA, US):** no app named Pexi. **Google Play:** no app named Pexi; fuzzy: "AI Photo Generator - PEXI Art" (Rvira Apps), "Pexii - Wallpapers & Ringtones" (Okapps), "Pexy: pictograms" (SLcode), "Pexip" (Pexip AS) at `https://play.google.com/store/search?q=pexi&c=apps&hl=en&gl=CA`.
- **Domains (RDAP):** `pexi.app` registered 2025-09-04 (`https://pubapi.registry.google/rdap/domain/pexi.app`) and does not resolve (WebFetch ENOTFOUND); `pexi.com` registered 1997-02-06 (`https://rdap.verisign.com/com/v1/domain/pexi.com`), looks parked (page holds only tracking code); `getpexi.com` registered 2026-04-01 and does not resolve; `getpexi.app` unregistered (404).
- **Web check:** a search for companies called Pexi returned only similar names (Pex/Pexeso, Pexia, Pixi), none Pexi, via WebSearch, which is a weak engine; a zero is not evidence of absence. Meaning in Spanish, French, Korean, Japanese, slang: searched in English only, found nothing for "Pexi". The Portuguese "peixe" (fish) is a near-homophone risk I did not verify (NOT RUN, native-speaker check).
- **Remaining risks:** PEXIP (class 9/35/42, US), PEXIL (class 42 pending, CA); founder would not own pexi.app or pexi.com.

### Dibbo

- **CIPO** (variants: dibbo, dibo, dybbo, dibboh, dibbow, dibboe, dibbu, divvo, tibbo, dippo, each exact and `*`): literal DIBBO 0; DIBBO* 0; the whole "dibo*" list (12 rows) read: close ones are DIBO, both ABANDONED (2104466 class 31; 1329622 many classes incl. 9). Nothing live.
- **USPTO** (74 rows): literal DIBBO 0 (only DIBBOS, ABANDONED, classes 021,025, and DYBBON ABANDONED class 026). Loose sound-alikes live: TIBBO class 009 (Tibbo Technology, reg 2934406) and TIBBO class 020 (pending), DIPPO class 025. TIBBO is a stretch (T for D) and is listed only because the variant set was loose.
- **App Store (CA, US):** no app named Dibbo. **Google Play** (`https://play.google.com/store/search?q=dibbo&c=apps&hl=en&gl=CA`): no app named Dibbo; fuzzy only: "Dibba & Dabba", "Dibsido", "MyDobbo" (Dobbo Africa), "Duboo", "dubbii".
- **Domains:** `dibbo.app` unregistered (404 at `https://pubapi.registry.google/rdap/domain/dibbo.app`); `getdibbo.app` and `getdibbo.com` unregistered (404); **`dibbo.com` registered 2002-05-29**, and the site is "Dibbo Limited", a holding and private-equity firm (real-estate finance, property development, heavy engineering in energy) per WebFetch of `https://dibbo.com`.
- **Web and meaning:** only company found named Dibbo is Dibbo Limited above (different industry). Searches for a meaning in English slang returned nothing for "dibbo"; near words are "dibs" and Hindi/Urdu "dibbi" (small box) at `https://rekhtadictionary.com/meaning-of-dibbii`. I could not confirm "Dibbo" as a Bengali given name (a search returned only related Bengali names), so that is unverified. Spanish, French, Korean, Japanese: NOT RUN beyond that.
- **Remaining risks:** an existing business named Dibbo (Dibbo Limited) holds `dibbo.com`; unverified slang; TIBBO class 9 only if an examiner treats D/T as close.

### Yuzo (dropped in stage 2)

- **Why dropped:** `https://yuzo.app` is an active "smart meal planning" service (waitlist, 21-day free trial; WebFetch result), the same food/grocery world; `yuzo.app` registered 2026-06-08, `yuzo.com` registered 2000-02-15 (RDAP). CIPO holds live **YUZU REGISTERED classes 9,36,42 (2189660)** and YUZU SUSHI marks in classes 9,35,42,43; USPTO holds live YUZU class 035 (Energy Invest LLC, reg 4613274) and BAR YUZO (class 043, published for opposition). YUZU is one vowel from YUZO. Google Play fuzzy results include "Yuka - Food & Cosmetic Scanner" (Yuka App), a direct competitor with a similar sound shape.
- Literal YUZO: CIPO 0, USPTO 0 live in 9/35/42. Meaning: Yuzo is a masculine Japanese given name (`https://en.wikipedia.org/wiki/Y%C5%ABz%C5%8D`).

### Bonto (replacement third; stage 2 partly run)

- **CIPO:** literal BONTO 0, BONTO* 5 rows, all read: BONTON REGISTERED classes 3,9,16,20,24,25,28,35 (the department-store word, pronounced bon-TON), BonTom abandoned, BONTOY (DESIGN) abandoned, BONTON & DESIGN expunged, BONTONE expunged; BONTU* 2 (BONTU Design, WITHDRAWN, classes 9,36,42). **USPTO:** no live BONTO; dead BONTO (class 003, class 024, both cancelled); live BONTON (classes 033,041; 028), BONTOY class 009 (live), BONTOK class 013, BONTOUJOUR class 009.
- **App Store:** "Bonto - بونطو" (Games, Mahmoud ElRayes) and "Bonto Cat" (Games). **Google Play** (`https://play.google.com/store/search?q=bonto&c=apps&hl=en&gl=CA`): **"Bonto - Blockchain & Ecommerce" (Adele Jobs)** and "Bonto - بونطو"; also "Bonton Holidays: B2B Travel App", "Bon Appetit: AI Food Scanner".
- **Domains:** `bonto.app` registered 2025-09-11 and shows a "Launching Soon" email-signup page (WebFetch of `https://bonto.app`), so an unknown product is pre-launch; `bonto.com` registered 2005-01-15, WebFetch returned empty content; `getbonto.com` and `getbonto.app` unregistered (404).
- **Meaning:** early-20th-century Australian slang "bontosher/bontodger" means excellent (Green's Dictionary of Slang, `https://greensdictofslang.com/entry/s75wxcy`); no negative meaning found; other languages NOT RUN.
- **Remaining risks:** exact-name apps on both stores (Games, plus an ecommerce-category app on Play), a pre-launch bonto.app, BONTON in classes 9 and 35 in Canada (different stress).

### Not chosen, fallbacks if all of the above fail

Dovi, Bimo, Rexo and Cheko failed only on small apps (Cheko also on CHEKOH class 9); their register results are listed in the table.

## NOT RUN

- Meaning/slang checks (1d) for the 26 names eliminated before stage 2; for survivors only an English-language web search, not Spanish, French, Korean or Japanese sources, except Yuzo (Japanese name, Wikipedia).
- Google Play for the 26 non-stage-2 names; USPTO for Wenzo, Sayo, Ziko, Vexo, Kovo, Zev, Bix, Pim (already OUT on other hits when the WAF blocked); CIPO and USPTO goods-and-services (not just name) searches; owner-name searches; CIPO/TSDR detail pages for most rows (statuses read from the search lists only, not the detail pages); design-only marks with no text; common-law use; Canadian business-name and provincial registers; social handles; Apple's private name reservation.
- Web company check was one WebSearch each (weak engine) plus WebFetch of the obvious domains, not an enumeration.
- Native-speaker check of Portuguese (Pexi, "peixe") and Bengali (Dibbo).

## Reverses if

An attorney reads sound-alike (PEXIP, PEXIL, YUZU) or app-store same-name rules differently, or a filing in classes 9, 35 or 42 appears after these snapshots (CIPO dated 2026-09-30; USPTO and stores read 2026-10-01 to 2026-10-02).
