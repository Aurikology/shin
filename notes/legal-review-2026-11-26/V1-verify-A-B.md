# V1: verification of legal review files A (privacy) and B (data sources)

Checked 2026-11-25/26 by opening each cited source. Not legal advice. Quotes are 25 words or fewer.
Tool notes: WebFetch worked for most pages. CanLII, SCC, Fasken, legisquebec (via fetch) and metro.ca (via fetch)
returned 403. legisquebec.gouv.qc.ca, developer.kroger.com and metro.ca opened in a Playwright tab (own tab,
closed). CanLII in Playwright also returned 403; not pursued past that (no CAPTCHA bypass).
Status: V = VERIFIED, W = WRONG, U = UNVERIFIABLE.

## Counts

| File | VERIFIED | WRONG | UNVERIFIABLE | Rows |
|---|---|---|---|---|
| A | 37 | 2 | 1 | 40 |
| B | 42 | 0 | 4 | 46 |
| Total | 79 | 2 | 5 | 86 |

WRONG rows: A R12 (wrong Bill 64 section for s. 3.1) and A R36 (Apple 5.1.4 / 1.3 limit overstated).
Rows with a "note" are verified on the operative text but carry a caveat; read the note.

## Answer: does Quebec's private-sector act (Law 25) apply to a business outside Quebec that collects personal information from Quebec residents through an app?

Short answer: the statute does not say, and no source I could read settles it. Treat as probably yes in practice
(the regulator asserts reach), but not as a statutory certainty. Lawyer question.

- The Act has no territorial clause. Current consolidation (legisquebec, "a jour au 15 octobre 2026"), s. 1:
  "particular rules with respect to personal information relating to other persons which a person collects, holds,
  uses or communicates to third persons in the course of carrying on an enterprise within the meaning of article 1525
  of the Civil Code." https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1 . Nothing in ss. 1 to 3.3, 8, 17 limits
  it by the enterprise's location. s. 17 and s. 8 speak only of communication "outside Quebec".
- The CAI pages on consent and on communication outside Quebec (R24 URLs) do not address whether out-of-province
  enterprises are bound ("The page does not say" on both; and the CAI sanctions page, R22, is silent too).
- Secondary only (law-firm commentary, not statute, not CAI): Benesch (https://www.beneschlaw.com/insight/quebec-adopts-new-law-to-modernize-personal-information-protection/):
  Bill 64 "does not specify the law's territorial scope"; "So long as an entity has a real and substantial connection
  to Quebec, they could be subject to the law"; the CAI "regularly exerts jurisdiction" over entities "completely
  outside of Quebec" and "pushes its jurisdiction to the maximum". A Fasken 2019 bulletin (seen only as a search
  snippet; page 403) says the territorial application was not yet delineated by courts. The connection test is
  borrowed from PIPEDA case law. Exposure factors named in those sources: targeting Quebec, actual Quebec customers.
- Practical consequence for Pexi: Pexi has Quebec users (French privacy and terms pages exist in docs/store), so
  on the commentary's test a real and substantial connection is plausible; the penalties in R22 are then live.
  A's R23 ("a legal question not answered by these sources") is correct.

## File A: table

| File | Row | Status | Evidence |
|---|---|---|---|
| A | R1 PIPEDA s. 6.1 | V | s. 6.1: "the consent of an individual is only valid if it is reasonable to expect" (laws-lois P-8.6 FullText) |
| A | R2 Sch. 1 cl. 4.3.3 | V | "An organization shall not, as a condition of the supply of a product or service, require an individual to consent" |
| A | R3 cl. 4.3.8 | V | "An individual may withdraw consent at any time, subject to legal or contractual restrictions and reasonable notice." ("informs of implications" sentence not displayed in my extract) |
| A | R4 OPC meaningful consent guidelines | V | Principle 3: "Individuals cannot be required to consent to the collection, use or disclosure"; Principle 1: "as specific as possible in enumerating these third parties"; express consent when sensitive or outside reasonable expectations; withdrawal section present |
| A | R5 OPC children | V | "the OPC takes the position that, in all but exceptional circumstances, this means anyone under the age of 13", section "Consent and Children" |
| A | R6 OPC cross-border | V | "Organizations need to make it plain to individuals that their information may be processed in a foreign country"; "accessible to law enforcement and national security authorities"; "additional consent for the transfer is not required". Note: "ideally at collection" not seen in my extract |
| A | R7 cl. 4.1.3 | V | "An organization is responsible for personal information in its possession or custody". Note: the contractual-means sentence was not displayed; OPC page also cites 4.1.3 |
| A | R8 cl. 4.5.2, 4.5.3 | V | 4.5.2: "should develop guidelines and implement procedures with respect to the retention"; 4.5.3: "no longer required ... should be destroyed". Note: "minimum and maximum" and "erased or made anonymous" wording not displayed |
| A | R9 cl. 4.9.1; s. 8(3) | V | s. 8(3): "respond to a request with due diligence and in any case not later than thirty days after receipt"; 4.9.1 access on request |
| A | R10 s. 10.1(1) | V | "shall report to the Commissioner any breach of security safeguards involving personal information under its control". Note: the "real risk of significant harm" qualifier was not displayed |
| A | R11 s. 28 amounts | V | s. 28(a) summary: fine "not exceeding $10,000"; (b) indictable "$100,000". Covers knowing contravention of "subsection 8(8), section 10.1 or subsection 10.3(1) or 27.1(1)" and knowingly obstructing the Commissioner. A's "which acts s. 28 covers was not read" is now answered |
| A | R11 "PIPEDA has no general administrative fine" | U | A statement of absence. Not provable from one fetch; I saw no such fine in the sections read, but did not read the whole Act |
| A | R12 P-39.1 s. 3.1 | W | Text is right ("title and contact information of the person in charge ... must be published on the enterprise's website"). But A says s. 3.1 was "enacted by S.Q. 2021 c. 25 (Bill 64) s. 107". It was enacted by s. 103 (consolidation footnote "2021, c. 25, s. 103"; PDF s. 103 inserts Division I.1). s. 107 replaces s. 8. Also A's caveat "current consolidation was not read; later amendments UNVERIFIED" is resolved: current consolidation (to 15 Oct 2026) read; ss. 3.1, 3.3, 9.1, 14, 17, 23, 32, 90.12, 91, 92.1 match the 2021 text |
| A | R13 s. 3.2 | V | "governance policies and practices ... provide a framework for the keeping and destruction of the information"; published "in simple and clear language on the enterprise's website" |
| A | R14 s. 3.3 | V | "must conduct a privacy impact assessment for any project to acquire, develop or overhaul an information system or electronic service delivery system" |
| A | R15 s. 8 | V | s. 8 items 1 to 4 (purposes, means, access/rectification, "right to withdraw consent"); "names of third persons or categories"; "possibility that the information could be communicated outside Quebec" |
| A | R16 s. 8.1 | V | "technology that includes functions allowing the person concerned to be identified, located or profiled must first inform"; of the use and "the means available to activate" the functions |
| A | R17 s. 8.2 | V | "must publish on the enterprise's website, if applicable, a confidentiality policy drafted in clear and simple language" |
| A | R18 s. 9.1 | V | "settings provide the highest level of confidentiality by default, without any intervention by the person concerned" (browser cookies excluded) |
| A | R19 ss. 12, 14 | V | s. 14: "clear, free and informed ... for specific purposes ... requested for each such purpose"; written request "presented separately"; under 14 by parent; "Consent not given in accordance with this Act is without effect." Note: s. 12's list of consent-free uses has a fifth item (study/research, de-identified) that A's "only" list omits; s. 12 also requires express consent for sensitive information |
| A | R20 s. 17 (Bill 64 s. 111) | V | "must conduct a privacy impact assessment ... (3) the protection measures, including those that are contractual ... (4) the legal framework"; "written agreement"; same for entrusting an outside person. Consolidation attributes to c. 25 s. 111 section replacement |
| A | R21 s. 23 | V | "must destroy the information, or anonymize it to use it for serious and legitimate purposes" |
| A | R22 ss. 90.12, 91, 92.1 | V | 90.12: "$50,000 in the case of a natural person and, in all other cases, $10,000,000 or, if greater, ... 2% of worldwide turnover"; 91: "$5,000 to $100,000" natural person, "$15,000 to $25,000,000, or, if greater, ... 4%"; 92.1 doubled on repeat. Note: the CAI summary page words the AMP as "2 % ... ou 10 millions" without "if greater"; the statute governs. s. 91(1) covers communicating "in contravention of the law" |
| A | R23 P-39.1 reach over Ontario developer | V | Correctly flagged as unanswered by statute; see Law 25 answer above |
| A | R24 CAI consent and outside-Quebec pages | V | Eight characteristics listed (manifest, free, informed, specific, temporary, granular, understandable, distinct); outside Quebec page: inform and obtain consent, EFVP, "entente ecrite" |
| A | R25 COPPA 16 CFR 312.2; FTC FAQ | V | "Child means an individual under the age of 13"; Personal information (7) persistent identifier, (9) "Geolocation information sufficient to identify street name and name of a city or town"; FAQ A.2 general audience with "actual knowledge"; C.5 identifier "solely ... support for the internal operations"; B.2 "up to $53,088 per violation". Note: FAQ says the Rule was amended 22 Apr 2025 and to verify the figure against the current Rule; geolocation is in FAQ G.4, not C.5; text from Cornell mirror of eCFR |
| A | R26 CCPA thresholds | V | oag.ca.gov/privacy/ccpa FAQ A.5: "gross annual revenue of over $25 million"; "100,000 or more California residents or households"; "50% or more of their annual revenue from selling". Page gives no CPI-adjusted figure; page says "buy, sell, or share" for 100,000. Statute not read, as A says |
| A | R27 Google Play User Data policy | V | "a privacy policy link or text within the app itself"; consent "must be granted by the user before your app can begin to collect"; "responsible for the accuracy of the label"; "also apply to third-party AI integrations"; persistent device identifiers exceptions: "Telephony linked to a SIM identity" and "Enterprise device management apps using device owner mode" (A said exception wording not read) |
| A | R28 Google Data safety | V | "Collect" = "transmitting data from your app off a user's device"; sharing excludes transfer to a "service provider"; enforcement "blocked updates or removal from Google Play"; "should not describe collection as optional if it is required for any of your app's users"; deletion mechanism must be indicated |
| A | R29 Google account deletion | V | "Users must have a readily discoverable option to initiate app account deletion from within your app" for apps that allow account creation |
| A | R30 Apple 5.1.1(i) | V | "Identify what data ... how it collects that data, and all uses"; third parties "same or equal protection"; "Explain its data retention/deletion policies and describe how a user can revoke consent and/or request deletion" |
| A | R31 Apple 5.1.1(ii) | V | "must secure user consent for the collection, even if such data is considered to be anonymous"; "Paid functionality must not be dependent on or require a user to grant access to this data"; "easily accessible and understandable way to withdraw consent" |
| A | R32 Apple 5.1.1(iii), (iv) | V | (iii) "only collect and use data that is required to accomplish the relevant task"; (iv) "not attempt to manipulate, trick, or force people to consent to unnecessary data access" |
| A | R33 Apple 5.1.2(i) | V | "clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission"; "may not require users to enable system functionalities (such as ... location services"; "may be removed from sale" |
| A | R34 Apple 5.1.1(v) | V | "If your app supports account creation, you must also offer account deletion within the app." |
| A | R35 Apple App Privacy details | V | "Collect" = transmitting off device so it can be accessed "longer than what is necessary to service the transmitted request in real time"; linked to identity "via their account, device, or other details" unless de-identified; Device ID under Identifiers |
| A | R36 Apple 5.1.4 and 1.3 | W | A says third-party analytics and ads are "barred only in the Kids Category". 5.1.4(a) says: "Apps intended primarily for kids should not include third-party analytics or third-party advertising" (not limited to Kids Category apps). 1.3 (Kids Category) adds: "may not send personally identifiable information or device information to third parties". The 5.1.4(b) part is right: apps that collect or transmit a minor's personal information "must include a privacy policy and must comply with all applicable children's privacy statutes". Fix: say 5.1.4(a) applies to apps intended primarily for kids, and 1.3 is stricter for the Kids Category |
| A | OPC Children's Privacy Code status | V | priv.gc.ca kids page lists "Children's Privacy Code" resources dated October 20, 2026 and November 20, 2026 and states no status, as A says |
| A | G1 named cost (s. 14 "without effect", AMP, penal fine) | V | Same text as R19 and R22 |
| A | G7 "Quebec s. 32: silence after 30 days counts as refusal" | V | s. 32: "not later than 30 days after the date the request is received. Failure to respond within 30 days ... is deemed to be a refusal" |

## File A: "what Pexi does" file:line spot-check (about 1 in 3; 26 checked of about 70)

All matched in substance. Path notes only: `agree.js` is `app/public/js/screens/agree.js`; `range-ask.ts` is
`identify/src/range-ask.ts`.

Matched: document.js:49 (person in charge named), 75-76 (all ages; under 14 asks parent, at line 76), 99 (camera text
lines), 134 (Cloudflare), 142 (outside Canada, US and EU), 172 (answer in writing within 30 days), 174 (incidents),
191, 192; retention.ts:32-34 (90 days, 12 months, 24 months), 46-55 (exactly 8 tables, including gemini_call), 124
(sweepRequestLog); device.js:12,31 (key and randomUUID); flags.js:82 (photoId false); range-ask.ts:222 (model
claude-haiku-5-5), 234-262 (prompt body exactly Product, Brand, Size, Category, Country, Currency); server.ts:1720
(160 chars), 999-1002 (x-shin-claude header gate); you.js:380-392 (only a row reopening the document); you.js:112-141
(email deletion path); geocell.js:68 (0.01 degree); network-hash.ts:3-9 (/24 and /48, salt file); scans.ts:74 (scan
table with query_text); consent.ts:119 (writeConsent); purchases.js:82 (device id as RevenueCat user id);
scan-quota.ts:387 (RevenueCat subscribers call); crash-report.js:4-5 (no device id); mac/16-rotate-logs.sh:9 (14 days);
mac/14-offsite-backup.sh:21 (15 days); migrations.ts:195 (event table), 497 (gemini_call); agree.js:39-60 (accept
record sets usage, photos, location true).
Mismatches: none found.

## File B: table

| File | Row | Status | Evidence |
|---|---|---|---|
| B | Copyright Act s. 2 "compilation" (b) | V | "a work resulting from the selection or arrangement of data" (laws-lois c-42 page-1) |
| B | s. 2 "literary work" | V | "literary work includes tables, computer programs, and compilations of literary works" |
| B | s. 2.1(1) | V | "A compilation containing two or more of the categories of literary, dramatic, musical or artistic works shall be deemed to be a compilation of the category making up the most substantial part" |
| B | s. 5(1) (B said not fetched) | V | "copyright shall subsist in Canada ... in every original literary, dramatic, musical and artistic work" if a listed condition is met |
| B | CCH v Law Society, 2004 SCC 13, paras 16 and 25 | U | SCC page text did not load in a browser (empty body), CanLII 403 by fetch and by browser, lexum 403. A search snippet quotes "must not be so trivial that it could be characterized as a purely mechanical exercise" from the SCC document, but I could not see paragraph numbers. Wording plausible; paragraph numbers unconfirmed |
| B | Tele-Direct v American Business Information, [1998] 2 FC 22 | U | CanLII 403. Not retrieved. B itself marks it unretrieved |
| B | s. 41.1(1)(a) anti-circumvention | V | "No person shall ... circumvent a technological protection measure within the meaning of paragraph (a) of the definition ... in section 41". The s. 41 definition was still not read |
| B | "Canada has no separate database right" | U | B states it from general knowledge with no source; I did not find a primary source in this pass. Lawyer to confirm, as B says |
| B | Feist, 499 US 340 quotes and Kroger Ohio law | V | All three phrases present in the majority opinion: "In no event may copyright extend to the facts themselves"; "the copyright in a factual compilation is thin"; "rewards originality, not effort" (Cornell) |
| B | ODbL 4.1 | V | "expressly made subject to Your complying with the following conditions of use" |
| B | ODbL 4.2 | V | "Keep intact any copyright or Database Right notices and notices that refer to this License"; copy of licence or URI when publicly conveying |
| B | ODbL 4.3 | V | notice "reasonably calculated to make any Person that uses, views, accesses, interacts with" |
| B | ODbL 4.4 | V | "Any Derivative Database that You Publicly Use must be only under the terms of" |
| B | ODbL 4.5 | V | Heading "Limits of Share Alike"; "The requirements of Section 4.4 do not apply in the following"; internal use listed. Note: the Produced Work and Collective Database items B summarises were not displayed in my extract |
| B | ODbL 4.6 | V | "You must also offer to recipients of the Derivative Database or Produced Work a copy in a machine readable form of" |
| B | ODbL 4.7 | V | "This License does not allow You to impose" additional terms or technological measures |
| B | ODbL definitions "Publicly", "Convey" | V | "Publicly" means "to Persons other than You or under Your control"; "Conveying does not include interaction with a user through a computer network". The "Derivative Database" definition not displayed |
| B | OFF terms of use | V | Database under ODbL; contents under Database Contents License; images under "Creative Commons Attribution ShareAlike"; "attribute the authorship to Open Food Facts"; "Derivative works must be shared under the same conditions" |
| B | OFF /legal photos | V | photos "may contain elements that are subject to copyright, trademark rights or other rights" |
| B | OFF API limits | V | "15 req/min/IP address for all read product queries"; "the rate limits apply per user" for apps; "AppName/Version (ContactEmail)"; "more than a few hundred products ... download"; 503. Note: the ban sentence B says it could not find is on the page: "we reserve the right to deny you access to the website and the API through IP address ban" |
| B | Open Prices API guide | V | "Make sure you comply with the OdBL licence, mentioning the source of your data" and "ensuring to avoid combining non free data you can't release legally as open data" |
| B | OSM copyright | V | "Provide credit to OpenStreetMap by displaying our attribution notice."; "If you alter or build upon our data, you may distribute the result only under the same license." |
| B | OSMF Collective Database guideline | V | "either all OSM or all non-OSM within the same regional cut"; "can trigger share-alike with respect to the non-OSM data if the Derivative Database is Publicly Used"; join "by a key" treated as a reference |
| B | Overpass commons | V | "maximum of about 10000 requests per day"; "below about 1 GB per day"; problematic example 4 "Setting up an app for more than just OSM mappers and relying on the public instances as backend" |
| B | Icecat OIC v1.4 cl. 1, 2(a), 2(b), 4, 5, 10 | V | v1.4, 11 Feb 2026. "Database Right data-sheet [Year] Icecat. All rights reserved."; "You may not charge a fee for the OIC itself."; "prominent notices stating that you changed it"; "licensed as a whole at no charge"; "most recent (versions of) OIC"; "AS IS"; cl. 10 "NOT being utilized for machine learning training" and generative AI "immediately voids this License". Clause numbers as B gives them were not independently confirmed beyond the order of text |
| B | Icecat Fair Use Policy | V | "fully compliant to the Open Content License Agreement"; explicit "AS IS" disclaimer; "1 million data-sheet downloads per month" (page states an excess-use fee of 0.30 euro per 1,000, not "excessive"); ML training "strictly prohibited" without commercial licence; robots.txt disregard is "unauthorized access" |
| B | USDA FDC | V | "in the public domain and they are not copyrighted"; "we request that users list FoodData Central as the source"; Branded Foods source "Commercial food brands" |
| B | Statistics Canada Open Licence | V | "worldwide, royalty-free, non-exclusive", "sell the Information"; "Source: Statistics Canada, name of product, reference date."; "Adapted from Statistics Canada, name of product, reference date." plus "This does not constitute an endorsement"; "shall terminate automatically if you breach any of the terms" (B said termination clause not fetched) |
| B | StatCan table 18-10-0245-01 page | V | Names no licence; links to general terms; "How to cite: Statistics Canada. Table 18-10-0245-01 Monthly average retail prices for selected products"; DOI 10.25318/1810024501-eng |
| B | BC Open Government Licence | V | "worldwide, royalty-free, perpetual, non-exclusive"; "Contains information licensed under the Open Government Licence - British Columbia"; link "where possible"; rights end automatically on breach; applies only to catalogue records that specify it |
| B | Project Hammer page | V | No licence, terms or copyright notice; "Make the database available in a format that is suitable for academic analysis and for legal action."; "Get Full Data in 2 CSV Files"; "All Data in a SQLite file" |
| B | atehe/stores_scrapers | V | No LICENSE file or licence listed; README "Kroger store blocks scraper after sometime" |
| B | ankane/plu | V | MIT; LICENSE.txt "Copyright (c) 2013-2026 Andrew Kane" and "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software"; "Data cleaned up from the International Federation of Produce Standards" |
| B | Kroger ToS 5(e) | V | Section 5(e) "Prohibitions on Content": "Unless expressly permitted by the content owner or by applicable law, you will not ... Scrape, build databases, or otherwise create permanent copies of such content, or keep cached copies longer than permitted by the cache header" (also copy/derivative/display/misrepresent source) |
| B | Kroger ToS 4(a) | V | Section 4(a) API Prohibitions: "Sublicense an API for use by a third party"; "Use the APIs to perform competitive, comparative or any other type of analysis to develop marketing or business strategies directly or indirectly targeting Kroger customers" |
| B | Kroger ToS 2(d) | V | "Kroger sets and enforces limits on your use of the APIs ... in our sole discretion"; beyond limits "you must obtain Kroger's express consent" |
| B | Kroger ToS 3(a) | V | "Kroger may suspend access to the APIs by you or your API Client without notice if we reasonably believe that you are in violation of the Terms." |
| B | Kroger ToS 6(b), 6(c) | V | 6(b) "display any attribution(s) required by Kroger as described in the documentation for the API"; 6(c) Publicity: no statement "which suggests partnership with, sponsorship by, or endorsement by Kroger" without written approval |
| B | Kroger ToS 8(b) | V | "delete any cached or stored content that was permitted by the cache header under Section 5" |
| B | Kroger ToS 9(c), 10(a), 10(c), 1 | V | 9(c) indemnification "if you are a business"; 10(a) changes effective "no sooner than 30 days" except new functions or legal reasons; 10: "laws of the State of Ohio" and "exclusive venue of, the courts in HAM..." (text cut off at "HAM"; Hamilton County inferred); 1: "additional terms will control for that conflict". Note: B's 9(c) summary "your violation of the Terms" is cut off in my extract. Last modified "April 9th, 2019" confirmed |
| B | Metro Website Terms of Use | V | "Use of our Site is limited to personal, non-commercial use."; "Any unauthorized use of the content of this Site, including ... downloading is prohibited without the prior written authorization of Metro." No scraping/robot/automated wording on the page |
| B | Metro robots.txt | V | Disallow list has no rule for /en/online-grocery/ or sitemap files; "Sitemap: https://www.metro.ca/sitemap.xml" |
| B | Metro terms-and-conditions "404 today" | V | https://www.metro.ca/en/terms-and-conditions returns HTTP 404 "Page Not Found" |
| B | Metro online-grocery-policy has no scraping clause | U | Not opened in this pass (only the terms-of-use page and robots.txt) |
| B | ANBL terms | V | "Material from this Site may not be copied, reproduced, republished, uploaded, posted, transmitted or distributed in any way"; "solely for your own personal use"; no automated-tool clause |
| B | Consignaction terms s. 3 | V | "a des fins autres qu'une utilisation personnelle est absolument defendue sans la permission ecrite prealable de CONSIGNACTION" (section 3, Propriete intellectuelle) |

Not counted (B itself says "repo readings only", no external citation): Walmart Canada, Return-It, Canadian Tire,
Save-On-Foods terms; Best Buy; Anthropic/Voyage/Gemini terms. The robots.txt quote at attribution.ts:157 was not
re-read.

## File B: "what Pexi does" file:line spot-check (about 1 in 3; 30 checked of about 80)

All matched. Matched: source-rights.ts:19 (UNLICENSED returnit, consignaction), :26 (NEVER_SENT icecat);
kroger-api.ts:52-54 (terms "NOT been read", basis unknown), :79 (isHoldout), :449, :495 (holdout side file);
hammer.ts:289 (basis 'unknown'), :20-26 (about 112,000 matched by twin); fetch_metro.py:36-44 (UA curl/8.16.0 after
403); open-food-facts.ts:62 (UA with usepexiapp@gmail.com), :162; openprices.ts:77-78 (100 per page), :158 (UA with no
contact); export-pack.ts:94 (licensedOnlySql excludes unlicensed); stores.ts:302,310,325 (Overpass URL and UA with
contact); fetch_returnit.py:136, fetch_consignaction.py:99 (curl/8.9.1); plu.ts:1-12 (ankane/plu, MIT);
attribution.ts counts 121,949 / 88,182 and 1,700 / 874 / 3,596,403 and 296,300 / 429,593 and 22 / 7,556 / 98,918 /
8,940 / 44,862 and WITHHELD list; sources.js:19-24, :47-52, :75-80 (credit text and licence strings);
embed-all.ts:42-50 (purge of non-model-allowed vectors); fetch_canada.py:27-29, fetch_open_facts.py:32-34,
statcan.ts:44, bcldb.ts:5, saveonfoods.ts:62-65 (UA ShinPriceCheck/0.1), fetch_icecat.py:48; document.js:191-192.
Mismatches: none found. Minor: exact line numbers drift by a line or two in places.

## Other findings

- A R12 fix: change "Bill 64 s. 107" to "Bill 64 s. 103" for s. 3.1; drop the "current consolidation not read" caveat
  (read and unchanged).
- A R36 fix: see the row.
- A R11: the "which acts s. 28 covers" doubt is closed (listed in the row).
- B: the OFF "ban" sentence B could not find is on the API page (row above); B's note can be dropped.
- B not independently confirmed: CCH paragraph numbers, Tele-Direct, Canadian "no database right", Metro
  online-grocery-policy.
