# Trademark search on "Shinn", Canadian and US registers plus app stores, 2026-10-01

Successor to `notes/trademark-search-2026-09-04.md` (Canada, "shin") and `notes/trademark-search-2026-09-11.md`
(US, "shin"). Same method, applied to the spelling "Shinn". This is a search record, not legal advice;
nobody here is a lawyer. The name is the founder's call. Anything not run is marked NOT RUN.

## Bottom line

- **Canada: no mark of any status has the text "SHINN".** Software-class (9/35/42) hits for the literal word: none.
  Two live class 9 marks that merely start with those letters are not the same word (SHINNOUS, SHINNYO), listed below.
- **US: one identical live wordmark exists, in food service, plus one live class 9 software-adjacent mark.**
  SHINN (serial 99285945, pending, class 43 restaurants) and SHINNTYPE (Reg., class 9, downloadable fonts and font software).
  No SHINN mark in class 35 or 42 is live. Nothing is held by Shinn Fu.
- **Shin's carried risks carry over to Shinn by sound** (Canada s.6(5)(e) text, US TMEP 1207.01(b)(iv)), and Shinn adds
  two risks Shin did not have (below).
- **App stores: no app named "Shinn" on the Apple App Store or Google Play** in the searches run.

## 1. CIPO (Canada), database dated 2026-09-30

Search URL pattern, same as 09-04 and 09-11 (payload JSON, URL-encoded, with `pageNum=0&pageLen=1000` appended so all rows load):
`https://ised-isde.canada.ca/cipo/trademark-search/srch?payload=%7B%22domIntlFilter%22%3A%221%22%2C%22searchfield1%22%3A%22tm%22%2C%22textfield1%22%3A%22shinn%22%2C%22display%22%3A%22list%22%2C%22maxReturn%22%3A%221000%22%2C%22nicetextfield1%22%3Anull%2C%22cipotextfield1%22%3Anull%7D`

| Query | Field | Result | Source |
|---|---|---|---|
| "shinn", all classes, all statuses, all dates 1865 to 2026-09-30 | Trademark | **Results found: 0** | URL above, page header read: "shinn in Trademark" |
| "shinn" | TM lookup (`tmlookup_ext`, which also does prefix and sound-alike matching per the 09-04 note) | **Results found: 0** | same URL with `searchfield1=tmlookup_ext` |
| "shinn*" (wildcard) | Trademark | **15 results**, none is the word SHINN (table below) | same URL with `textfield1=shinn*` |
| "shin", TM lookup | TM lookup | 150 results, all 150 rows read; the only row containing "shinn" is SHINNICKED (class 32) | same URL with `tmlookup_ext`, `textfield1=shin` |
| current owner "shinn" | field code guessed as `owner` | 0 rows, but the field code is unverified, so this is **not a valid zero** (see NOT RUN) | n/a |

### The 15 wildcard hits for "shinn*" (all read)

| Number | Mark | Status | Classes | Owner (where read) |
|---|---|---|---|---|
| 2252015 | Shinnous | REGISTERED (TMA1270188, 2024-11-15) | **9** | Yifeng Xu, Shanghai: electric adapter cables, sockets, relays, solar panels (detail page read) |
| 2211068 / IR 1684620 | Shinnyo (design) | REGISTERED (TMA1314119, 2025-05-16) | **6, 9**, 14, 16, 18 and more | Religious Corporation Shinnyo-en, Tokyo (detail page read) |
| 2082519 | SHINNY & CO. NOW IT'S REAL & Design | REGISTERED | **9**, 10, 18 | DB Shinny Inc., Moncton NB; Vienna codes show hockey equipment (detail page read) |
| 2082508 | SHINNY & CO. NOW IT'S REAL & Design | REGISTERED | 16, 25, **35** | same family, listing row only |
| 1960090 | SHINNY PANTS | REGISTERED | 16, 20, 21, 25, 32 | listing row only |
| 1879678 | SHINNICKED | REGISTERED | 32 | listing row only |
| 1740058 | Town of Shinny | REGISTERED | 2, 4, 5, 8, 9, ... | listing row only |
| 2471867 | shinnwa | FORMALIZED (pending) | 20 | listing row only |
| 2423934 / 1446627 | shinnoki | SEARCHED (pending) | 19, 20 | listing row only |
| 1828992, 1828974 | SHINNYO & DESIGN | ABANDONED | 36, 38 / 36, 41 | listing row only |
| 1506208 | Shinny Gear | ABANDONED | 25 | listing row only |
| 1178981 | SHINNY HOCKEY BOTTINES DESIGN | EXPUNGED | 28 | listing row only |
| 0857217 | MINI SHINNY | ABANDONED | 41 | listing row only |
| 0617941 | WORLD SHINNY CHAMPIONSHIP & DESIGN | EXPUNGED | 25, 41 | listing row only |

Reading: none of these is "Shinn" the word. "Shinny" is a hockey word and "Shinnyo" is a Buddhist term, "Shinnous" is an invented
cable brand. Sound differs (SHIN-ee, SHIN-yo, SHIN-us) but a trademark agent, not this search, decides whether SHINNOUS
(class 9) or SHINNY (class 9, 35) are close enough. Flagged for classes 9 and 35 as asked: SHINNOUS, SHINNYO, SHINNY & CO. (9);
SHINNY & CO. second filing (35). **No class 42 hit.**

**Canadian software-class hits for the literal word SHINN: none.**

Negative control (CIPO): the same engine and URL for "shin" returned **57 results**, identical to the 09-04 and 09-11 counts,
beginning with 2317291 "shin to shin" (class 25, REGISTERED). The wildcard "shinn*" also returns real "shinn" strings
(Shinnous, Shinnyo, shinnwa), so the engine does find words starting with "shinn"; a literal-zero for exactly "shinn" is a real zero
within what the Canadian register holds at 2026-09-30.

## 2. USPTO Trademark Search (tmsearch.uspto.gov), run 2026-10-01

Method: the site's own search box, Wordmark field, query typed and submitted, results page read in full (the page listed all rows).

**Query "shinn": 17 results. Query "shinn*": the same 17.** Every result, all classes, all statuses:

| Serial | Mark | Status | Class | Owner |
|---|---|---|---|---|
| **99285945** | **SHINN** | **LIVE, PENDING** | **043** (restaurant, bar, coffee shop services) | Ume Hospitality Management, LLC (New York) |
| 50085546 | NORI SHINN | LIVE, PENDING | 043 (restaurant and bar services) | Ume Hospitality Management, LLC |
| **76710205** | **SHINNTYPE** | **LIVE, REGISTERED** (registered 2013-01-08, renewed 2023-07-15) | **009** | SHINN TYPE FOUNDRY INC., Orangeville, Ontario, Canada |
| 90111231 | SHINN CONSULTING HOME BUILDER UNIVERSITY | LIVE, REGISTERED | 041 | Builder Partnerships LLC (Colorado) |
| 87547960 | SHINNDING | LIVE, REGISTERED | 041 | ShinnDing Productions, LLC (Minnesota) |
| 74697897 | SHINN'S PAINT STORE | DEAD, CANCELLED | 042 (retail paint store) | Shinn Investment Company |
| 78013816 | SHINN SYSTEMS THE INTELLIGENT APPLICATION OF POWER | DEAD, ABANDONED | 040, 042 | R. F. Shinn Contractor, Inc. |
| 76010659, 76010658 | SHINN SYSTEMS, SHINN CUTTER SYSTEMS | DEAD, ABANDONED | 007 | R. F. Shinn Contractor, Inc. |
| 85646515, 77441253 | TEAM SHINN | DEAD, ABANDONED | 041, 039 | Christopher Shinn (individual) |
| 78549539, 78549544 | HEATHER SHINN | DEAD, ABANDONED | 025 | Purvis, James Jr |
| 85708350 | GEORGE SHINN | DEAD, ABANDONED | 041 | George Shinn Companies, LLC |
| 77072322 | SJ SHINN JEE | DEAD, CANCELLED | 016 | SHINN JEE ENTERPRISE CO., LTD. (Taiwan) |
| 87114479 | SV SHINN ESTATE VINEYARDS | DEAD, CANCELLED | 033 | Shinn Winery, LLC |
| 78769992 | "THE WATER GUY" SHINN SPRING WATER CO. | DEAD, CANCELLED | 039, 040, 043 | DS Services of America |

SHINNTYPE detail read at `https://tsdr.uspto.gov/statusview/sn76710205`: goods "Downloadable typeface fonts and computer software
featuring typeface fonts", class 009, use-in-commerce basis, live and renewed. (Fetched through a summarising tool, not read raw.)

**Filtered to 009 / 042 / 035:** I did not run the class-filter UI separately; because the unfiltered list is only 17 rows and was read
in full, the filtered result is a subset I derived by reading class codes. Result:
- **Class 009, live: SHINNTYPE (76710205).**
- **Class 042: none live.** Two dead (SHINN'S PAINT STORE, SHINN SYSTEMS).
- **Class 035: none**, live or dead.

**Shinn Fu (jacks):** no result in the "shinn" wordmark search is Shinn Fu's. Web check: their registered marks are BANTAM, AJAX,
AMERICAN, WINNER, BANNER, GUARDIAN (automotive jacks), not a SHINN mark
(`https://trademark.justia.com/owners/shinn-fu-company-of-america-inc-25006`). They are a corporate name in a different field, not a
register obstacle in 9/35/42.

Negative control (USPTO): query "shin" returned **594 results** (09-11 run: 592, consistent), with real marks on the first page
(TSUMO-SHIN, U-SHIN, SHIN SHIN, 360 SHIN). So the engine returns known hits. Limitation seen: "shinn*" returned the same 17 as "shinn",
so this search tool does not prefix-expand wildcards the way CIPO's does; compounds like SHINNYO or SHINNY would not show up here.

## 3. Do Shin's carried risks apply to Shinn? Yes, by sound

**Canada.** Trademarks Act s.6(5): in deciding confusion the court or Registrar considers all surrounding circumstances including
"(e) the degree of resemblance between the trademarks or trade names, including in appearance or sound or in the ideas suggested
by them." Text read at `https://laws-lois.justice.gc.ca/eng/acts/t-13/section-6.html`. "Shin" and "Shinn" differ by one letter in
appearance and are pronounced the same, so (e) is met strongly on sound. (Smart & Biggar's note, and the Wikipedia summary, agree resemblance is
usually where confusion analysis starts; secondary sources, not the statute.)

**US.** TMEP 1207.01(b)(iv), "Similarity in Sound - Phonetic Equivalents": sound is a factor in confusing similarity, and there is no
"correct" pronunciation of a mark because the public's pronunciation cannot be predicted
(`https://www.bitlaw.com/source/tmep/1207_01_b_iv.html`, read through a summarising tool). The section's cited cases include In re Viterra
(XCEED v. X-SEED), Centraz v. Spartan Chemical (ISHINE v. ICE SHINE), and Kabushiki Kaisha Hattori Tokeiten v. Scuotto (SEYCOS v. SEIKO).
Sound alone can support a refusal per cases quoted in TMEP (RE/MAX v. Realty Mart; In re Cresco), per a USPTO office action search result,
not read at the primary source. A counterpoint in the same line of cases (Kabushiki Kaisha Hattori Seiko v. Satellite International):
similarity in one element does not by itself decide the matter. I could not open TMEP text raw from tmep.uspto.gov (the page loaded
only its foreword in the fetch tool), so quote nothing from it as exact wording.

**Application to each carried risk (reasoning, not a legal conclusion):**
1. **Nongshim SHIN food marks (Canada class 30, s.22 goodwill depreciation; 09-04 file):** identical sound, so the same exposure carries. The extra "n"
   changes appearance only. Not reduced.
2. **Two live US class 42 design marks transliterating to "Shin" (Bazooka Inc. Reg. 6140486 quiz app; Colgan Reg. 5082432, which covers
   software for rating and reviewing products, 09-11 file):** the transliteration is the English word "Shin", pronounced like "Shinn", so any
   argument that applied to "Shin" applies to "Shinn" on sound. Whether an examiner treats a design mark as citable against the wordmark is
   still an attorney call. Not reduced.
3. **New with the spelling Shinn, US:** a live pending identical wordmark SHINN in class 43 (restaurants and bars, grocery-adjacent
   food world) and a live registered SHINNTYPE in class 9 (software featuring fonts). The first is a pending application that
   would rank ahead of any later filing of ours by filing date; the second is in class 9 but for fonts, whose relatedness to a price scanner
   is a judgment call. Shin had no identical wordmark in 9 or 42; Shinn has one in class 9 (SHINNTYPE, with an extra word) and one
   pending identical in 43.
4. **New with the spelling Shinn, surname registrability (reasoning, not searched):** Canada s.12(1)(a) bars "a word that is primarily
   merely the name or the surname of an individual who is living or has died within the preceding thirty years"
   (`https://laws-lois.justice.gc.ca/eng/acts/t-13/section-12.html`); US 15 U.S.C. 1052(e)(4) bars a mark that "is primarily merely a surname"
   (`https://www.law.cornell.edu/uscode/text/15/1052`). The US register above is full of people named Shinn (HEATHER SHINN, GEORGE SHINN,
   TEAM SHINN), and the word has no dictionary meaning, unlike "shin" (a bone). Both statutes allow acquired distinctiveness later. Whether
   an examiner treats SHINN as primarily merely a surname is not something this search can show. Plausibly a higher refusal risk than for "Shin"; unverified.

## 4. App Store and Google Play

- **Apple App Store, Canada storefront, iTunes Search API (`https://itunes.apple.com/search?term=shinn&entity=software&country=ca&limit=200`):**
  7 results, none named "Shinn": Florence Scovel Shinn (book app), Penny Linn, A.M.I, bebetick, SmartSeniors for Caregiver, Shwe Nyar Myay
  and Dahlia Marketplace (both by developer "Shinn Thant Minn", shopping apps). Read through a summarising fetch tool.
- **Apple, US storefront, same API:** 9 results, none named "Shinn": the above plus Skate Spots & Videos-Shinner and SHINNEN (Takayuki Yagi, Lifestyle).
- **Google Play, `https://play.google.com/store/search?q=shinn&c=apps&hl=en&gl=CA`, page text read:** no app named "Shinn". Fuzzy matches
  only: SHEIN, Temu, SINE Immersive Soundscapes, Shin Than (developer name shown next to an app), ShinePhone, SHiNE Fitness, SinnSyn, and others.
- Name-uniqueness on the App Store is therefore not blocked by an exact "Shinn" title in these searches. A developer called "Shinn Thant Minn"
  already publishes two shopping-category apps; that is a developer name, not an app name, but it is a shopping-category neighbour.
- Control: iTunes API for "shein" returned SHEIN-Shopping Online first (count 5), so the API finds a known name. Google Play's fuzzy return of
  SHEIN for "shinn" shows its search engine is live.
- Not covered: a store does not publish unreleased reserved names; an app name can still be rejected at submission.

## 5. Quick web check, companies and products named Shinn

One general web search ("Shinn" software, startup, grocery, food brand) returned nothing named Shinn (hits were Shini Markets, a Palestinian
supermarket and its eShini app; not the same word). One search on Shinn Fu returned jacks and patent-dispute material only, as above. Within the
registers: Ume Hospitality Management (SHINN, NORI SHINN) is a restaurant group; Shinn Type Foundry (Orangeville, Ontario) is a font maker with a
US class 9 registration; Shinn Consulting Home Builder University is an education business. This was a short search, not an enumeration; **a
zero here is not evidence of absence** (see NOT RUN).

## What this does and does not clear

- Clears: no Canadian filing (any status) is the literal text SHINN; no live US SHINN mark in classes 35 or 42; no exact "Shinn" app title on
  Apple (CA, US) or Google Play search.
- Does not clear: the Nongshim and two US class 42 design-mark risks carried for Shin (they apply by sound); the live pending US SHINN in
  class 43 (Ume Hospitality); SHINNTYPE in class 9; possible surname refusal; Canada class 9 neighbours SHINNOUS and SHINNY & CO.
- Does not decide the name. That is the founder's call.

## NOT RUN

- USPTO class-filter UI (009/042/035) as a separate query: derived instead from the full 17-row list.
- USPTO phonetic and spelling variants (SHYNN, SHINNE, SHIN N, SHINN with design only, pending marks with no wordmark text); the USPTO tool did not expand wildcards, so
  such compounds are not covered.
- CIPO owner-name search for "shinn" (field code unverified; the 0 is not trusted), and CIPO goods or services search.
- TSDR or CIPO detail pages for every row (only SHINNOUS, SHINNYO, SHINNY & CO. 2082519, SHINNTYPE were opened).
- Raw TMEP text from tmep.uspto.gov (loaded only its foreword); the TMEP wording above comes from bitlaw through a summarising fetch tool.
- Common-law (unregistered) use; Canadian business-name registers; domain or social-handle checks; Apple's private name reservation.
- Whether SHINN is a surname with Canada or US examination practice (no examiner data consulted).

## Reverses if

A trademark agent reads the sound rule or the surname rule differently, or a filing under SHINN in class 9, 35 or 42 appears after this
snapshot (CIPO database dated 2026-09-30; USPTO run live 2026-10-01).
