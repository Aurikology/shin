# Item 37: can Shin use Google Lens, and what is the legal position in Canada

**I am not a lawyer and this is not legal advice.** This is a sourced summary of published
contract terms and reported case outcomes, read on 2026-09-13. A commercial product
decision — especially one that ships to Canadian consumers and touches price claims —
must be checked by a Canadian lawyer before it is built on.

Researched 2026-09-13. Answers one question, asked by Aurik in these words: *"research if
it is possible to use google lense to search for this item without getting into any legal
problems."*

**What this builds on and does not repeat.** `research/price-sources/36-visual-product-search.md`
already enumerates the six ROUTES and their PRICING; nothing is re-priced here. That file's
own method note is the gap this one fills: it recorded Google's terms as
*"not read end to end this session, so 'permitted' is stated as 'no prohibition found,'
not as 'cleared.'"* The terms have now been read on the clauses that matter and are quoted
below. Where item 36 already answers something, it is cited rather than restated.

**A standing rule for reading this file.** Every heading separates what a document **SAYS**
(quoted verbatim, with URL and date) from what **COMMENTATORS CLAIM** it means (labelled).
Where nothing was found, the file says **not found** and names the search. **Silence in a
terms-of-service document is not permission** — it is silence, and a court construing a
contract will reach for the general clauses, not for the absence of a specific one.

---

## 0. The short version

- **There is no licensed way to use Google Lens.** No Lens API, no Lens in the Gemini API,
  no Lens surface in Google Cloud, no partner programme. Section 1 shows what was checked.
- **Every Lens-shaped product on the market is a scraper**, sold by a reseller, and the
  reseller's own contract makes *you* warrant the legality and *you* indemnify *them*.
  Section 5 quotes it.
- **The licensed Google product that comes closest — Grounding with Google Search — has a
  use restriction that forbids exactly what Shin would do with it.** This is the single
  most important finding in the file and it is not in item 36. Section 6.2.
- **The Canadian exposure is real but is mostly contract, not crime**, and there are two
  directly-on-point Canadian cases, both of which the scraper lost. Section 3.

---

## 1. Is there any licensed way to use Google Lens itself?

**No. Not found, and the negative is well-evidenced rather than assumed.**

What was checked, and what came back:

| Checked | Result |
|---|---|
| A public Google Lens API | **Not found.** Search `"Google Lens API" official developer API availability 2026` returned, on the first page, zero google.com results and seven third-party resellers/wrappers (serphouse.com, apify.com, a PyPI package `google-lens-pro`, a Medium tutorial). Every one of them is a scraping proxy, not a Google product. That a keyword search for an official API returns only unofficial products **is itself the evidence**. |
| A Lens partner or enterprise programme | **Not found.** Search `Google Lens enterprise partner program API access developers` surfaced the **Google Photos** partner programme (https://developers.google.com/photos/partner-program/overview) — a different product — and nothing for Lens. |
| A "Lens SDK" on developers.google.com | **Not found.** `site:developers.google.com Lens SDK` returned ARCore, the Google VR SDK, ML Kit and a codelab. The one near-miss, https://codelabs.developers.google.com/product-search-odt-android, is **ML Kit object detection wired to Cloud Vision Product Search** — i.e. route 2 of item 36 under a friendlier name, not Lens. |
| Lens inside the Gemini API | **Not found.** The Gemini API's documented grounding tools are Google Search (https://ai.google.dev/gemini-api/docs/google-search) and Google Maps (https://ai.google.dev/gemini-api/docs/maps-grounding). There is no Lens tool. A third-party summary referred to "Grounding with Google Image Search" as a search type inside the Search tool; **this session could not verify that against Google's own documentation and it is recorded here as unconfirmed, not as a route.** |
| Lens in Google Cloud | **Not found.** No Lens SKU exists. Item 36's six routes are the complete Google Cloud surface. |

**Do not confuse Lens with Cloud Vision.** Several of the reseller blog posts above assert
that "Google Lens API is powered by the Cloud Vision API" and that developers should "just
use Cloud Vision." That is a **COMMENTATOR CLAIM** and it is misleading in the way that
matters: consumer Lens runs against Google's **Shopping Graph** (a company claim already
recorded in `research/competitors/retailer-apps-and-visual-search.md`, ~45B products),
whereas Cloud Vision Web Detection runs against Google's **web index** and Product Search
runs against **your own uploaded catalogue**. They are different corpora. Buying Cloud
Vision does not buy you Lens's index, and no amount of Cloud Vision spend reaches it.

**So the question "can we use Google Lens" has no licensed answer.** Everything below is
about the two things that are actually on the table: (a) reaching Lens anyway, through a
reseller or your own scraper, and (b) using a different, licensed Google product instead.

---

## 2. What Google's terms actually say about automated access

Four documents bear on this. Each is quoted; each carries its URL and its version date as
the page itself states them, all read 2026-09-13.

### 2.1 Google Terms of Service — https://policies.google.com/terms — **Effective July 30, 2026**

The operative sentence, under what you must not do:

> "using automated means to access content from any of our services in violation of the
> machine-readable instructions on our web pages (for example, robots.txt files that
> disallow crawling, training, or other activities)"

and, separately:

> "You must not abuse, harm, interfere with, or disrupt our services or systems — for
> example, by: introducing malware, spamming, hacking, or bypassing our systems or
> protective measures"

**What this SAYS, read carefully.** The automation prohibition is **keyed to robots.txt**,
not to automation as such. That is a narrower clause than most people assume. So what
robots.txt says is a contract term, not a courtesy.

**What robots.txt says** (fetched directly, 2026-09-13):

- `https://www.google.com/robots.txt` — `Disallow: /search`, `Disallow: /imgres`,
  `Disallow: /shopping/search`, `Disallow: /shopping/product/`, `Disallow: /products?`.
  **Search, image-result redirects and Shopping are all disallowed.** Automated access to
  any of those is therefore a breach of the sentence above, by that sentence's own terms.
- `https://lens.google.com/robots.txt` — **HTTP 404, no robots.txt served.** Under
  RFC 9309, a 404 means no crawl restriction is declared for that host.

**This is a fact, and it is not a green light.** Recording it because a future session
will otherwise rediscover it and misread it. Three reasons it is not permission:
(i) the second clause above — "bypassing our systems or protective measures" — is not
keyed to robots.txt at all, and Lens's real-world protections are rate limits, bot
detection and CAPTCHAs, which any production-scale scraper must evade; (ii) the Google
APIs ToS in 2.2 below imposes an independent restriction; (iii) **silence in robots.txt is
not a licence.** Do not build on this observation.

### 2.2 Google APIs Terms of Service — https://developers.google.com/terms — **Last modified November 9, 2021**

Two clauses, and these are the sharpest ones in the whole file:

> **§2(c):** "You will only access (or attempt to access) an API by the means described in
> the documentation of that API."

> **§5(e)** — on content accessed through an API, you will not: "Scrape, build databases,
> or otherwise create permanent copies of such content", or keep "cached copies longer
> than permitted by the cache header".

**What §2(c) SAYS.** Reaching a Google endpoint by an undocumented means is a breach on its
face. Lens's internal endpoints have no public documentation, so *any* programmatic call to
them fails this clause — including calls made on your behalf by a reseller.

**What §5(e) SAYS, and why it matters beyond scraping.** It forbids building a **permanent
database** out of API-returned content. Shin's whole architecture is a catalogue plus a
price history. Any route whose output is *stored* — rather than shown once and discarded —
has to be checked against this clause and against 6.2 below. This is a storage constraint,
not just an access constraint, and it is easy to miss.

### 2.3 Generative AI Prohibited Use Policy — https://policies.google.com/terms/generative-ai/use-policy — **Last modified December 17, 2024**

The nearest clauses are §2.2's "Abuse of, harm to, interference with, or disruption to
Google's or others' infrastructure or services" and "Circumvention of abuse protections or
safety filters."

**This document does not address automated access, scraping, or API misuse.** Stated
explicitly rather than inferred. It is a content policy — what you may generate — not an
access policy. **Its silence on scraping is not permission**; the access question is
governed by 2.1, 2.2 and 2.4, and by the Gemini/Vertex service terms in section 6.

### 2.4 Google Cloud Platform Terms of Service — https://cloud.google.com/terms/ — **Last modified September 2, 2026**

§3.3 lists the customer restrictions. In summary (the page's own enumeration): no copying
or creating derivative works of the Services; no reverse engineering; no reselling or
sublicensing the Services; and no use for High Risk Activities, for violations of the
Acceptable Use Policy, for avoiding fees or circumventing usage limits, for crypto mining
without approval, for ITAR material, in breach of export control law, or for HIPAA data
without a BAA.

**Nothing in §3.3 prohibits using Google Cloud to fetch third-party websites.** Said
plainly because the absence is load-bearing in the wrong direction if misread.

The Cloud Acceptable Use Policy (https://cloud.google.com/terms/aup) is likewise inward-
facing. Its access clause reads:

> "to gain unauthorized access to, disrupt, or impair the use of the Services, or the
> equipment used to provide the Services, by customers, authorized resellers, or other
> authorized users"

— *the Services* meaning Google Cloud's own. But the AUP also contains two outward-facing
clauses that do reach what you do with the compute:

> "to violate, or encourage the violation of, the legal rights of others"

> "for any unlawful, invasive, infringing, defamatory, or fraudulent purpose including
> Non-consensual Explicit Imagery (NCEI), violating intellectual property rights of
> others, phishing, or creating a pyramid scheme"

**What this SAYS.** Google Cloud does not police your scraping directly, but if scraping
someone's site infringes their copyright (see 3.3 — in Canada it well might), that is
"violating intellectual property rights of others," and it is an AUP breach, and AUP breach
is a §3.3 breach of the GCP ToS. The path is indirect but it closes.

### 2.5 A Google Search-specific terms document

**Not found.** Searched for standalone terms governing consumer Google Search; Google
publishes Search *Essentials* (guidance for site owners being crawled, not for people
querying Search) and nothing that is a separate contract for querying Search. Consumer
Search is governed by 2.1. The *programmatic* equivalents are governed by 2.2 and by the
grounding terms at 6.2.

---

## 3. Actual legal exposure in Canada, for a Canadian company

Most writing on scraping is American and is about the CFAA, a statute Canada does not have.
It is not imported here. Canadian sources only in this section.

### 3.1 Breach of contract — the primary and most likely theory, and Canada has case law

This is the realistic exposure. It is **civil, contractual, and pled by the site owner**,
and in Canada the threshold question — *is a posted terms-of-use page even a contract?* —
has been answered yes.

**Century 21 Canada Limited Partnership v. Rogers Communications Inc., 2011 BCSC 1196**
(B.C. Supreme Court, Punnett J.; https://www.canlii.org/en/bc/bcsc/doc/2011/2011bcsc1196/2011bcsc1196.html).
Zoocasa, a Rogers subsidiary, ran a crawler over Century 21's real-estate listings and
republished descriptions and photographs. Held:

- **Browse-wrap terms of use are enforceable in Canada.** The court upheld the contract
  without any click-to-accept step. (Commentary: Stikeman Elliott, Bereskin & Parr,
  https://www.slaw.ca/2011/10/21/browsewrap-contract-upheld-in-canada/ — the *Slaw* note
  records that the court "thoroughly reviewed US and Canadian law on the topic" before
  doing so. **That is the commentators' characterisation**; the holding itself is that
  the browse-wrap bound Zoocasa.)
- **Breach of contract made out**, plus **copyright infringement**, with fair dealing
  rejected.
- **Trespass to chattels failed.** Per the *Slaw* note the court "was not prepared to
  import that notion into BC law, at least not on the facts in the case." Useful: one
  American theory has already been tried in Canada and did not land.
- **Damages were small.** $1,000 nominal for breach of contract; $32,000 statutory
  copyright damages at $250 per infringed work.
- **The injunction was the real remedy** — Zoocasa was restrained from accessing the
  Century 21 site in any manner contrary to its terms of use.

**Read that damages line twice.** The money was trivial; the injunction was not. For Shin
the meaningful downside of a contract theory is **being ordered to stop**, mid-product,
with the feature ripped out — not a cheque.

**Trader v. CarGurus, 2017 ONSC 1841** is set out in 3.3, but note here that it is a
second Canadian scraping case that the scraper lost.

### 3.2 Criminal Code s. 342.1 — unauthorized use of a computer

The text (https://laws-lois.justice.gc.ca/eng/acts/C-46/section-342.1.html) makes it an
offence where a person, **"fraudulently and without colour of right"**, obtains any
computer service, intercepts a function of a computer system, or uses a computer system
with intent to commit those offences or an offence under s. 430 (mischief in relation to
computer data). Indictable, up to ten years.

**Has it ever been applied to ToS-violating scraping? Not found — and that absence is the
finding.** Searched `Canada Criminal Code 342.1 unauthorized use of computer web scraping
terms of service violation case law`; the results returned the statute itself, Justice
Canada and UNODC texts, and general cybercrime guides, with the on-point scraping
discussion all being **American CFAA material**. **No Canadian prosecution of a scraper
under s. 342.1 for breaching a website's terms of service was located.** That is not proof
none exists — a CanLII full-text search, which this session did not run, is the next step —
but a keyword search that surfaces the statute and no application of it to this fact
pattern is evidence of a thin-to-empty field.

**Why the statute probably does not reach ordinary scraping, as written.** The two
qualifiers do the work. **"Fraudulently"** imports dishonesty. **"Without colour of right"**
means without an honest belief in a legal entitlement — and a company openly querying a
public endpoint, paying a vendor's invoice for the privilege, with a good-faith belief it
is permitted, has a colour-of-right argument that does not require it to be correct, only
honest. **This is analysis, not authority, and the absence of precedent cuts both ways: an
untested statute is unpredictable, not safe.** It is also the one place in this file where
the downside is criminal rather than commercial, which is why it is worth an hour of a
lawyer's time (section 7).

**What would change the analysis:** evading a protective measure. Solving CAPTCHAs,
rotating residential proxies to defeat blocks, or using credentials that are not yours
moves the conduct much closer to "fraudulently and without colour of right." Note that this
is precisely the machinery a commercial scraping reseller runs on your behalf.

### 3.3 Canadian copyright, and the database question

**There is no sui generis database right in Canada.** Canada did not follow EU Directive
96/9/EC, which protects a database regardless of originality wherever there has been
"substantial investment in obtaining, verifying or presenting the contents"
(https://www.wipo.int/wipolex/en/text/126788). In Canada the only route is copyright in a
**compilation**, and *CCH Canadian Ltd. v. Law Society of Upper Canada*, 2004 SCC 13,
requires the selection or arrangement to show **skill and judgment** rather than mere
labour — the "sweat of the brow" standard was rejected. *Tele-Direct (Publications) Inc. v.
American Business Information Inc.* (F.C.A., 1997) is the earlier authority on directory
compilations.

**Consequence for Shin, stated plainly: raw prices and raw product facts are not owned by
anybody in Canada.** A price is a fact. A GTIN is a fact. Collecting facts is not
infringement, and Canada gives a database compiler materially less protection than the EU
would.

**The exposure is not the data. It is the images.** *Trader v. CarGurus*, 2017 ONSC 1841
(https://www.canlii.org/en/on/onsc/doc/2017/2017onsc1841/2017onsc1841.html): CarGurus
scraped **152,532 vehicle photographs** from dealer websites and republished them on its
site and app. The court rejected the argument that standardised shooting procedures
deprived the photos of originality — **the photographers exercised skill and judgment** —
rejected the information-location-tool defence, rejected fair dealing, and awarded
**statutory damages of $2 per photo, $305,064 in total** (against the ~$98M sought).
(Commentary: McCarthy Tétrault, https://www.mccarthy.ca/en/insights/blogs/techlex/information-location-tool-and-fair-dealing-copyright-defenses-rejected-trader-v-cargurus;
Norton Rose Fulbright, https://www.nortonrosefulbright.com/en/knowledge/publications/ed6d21da/ip-monitor---car-websites-scraped-but-only-slightly-dented.)

**This is the Canadian case closest to Shin's actual shape**, and it is worth naming why:
Lens-style results are **thumbnails and product photographs**. A visual-search feature that
stores or redisplays retailer product imagery is doing, at small scale, the thing CarGurus
did at large scale. **Statutory damages scale per work.** The design rule that follows is
cheap to adopt now and expensive to retrofit: **take the identifying string, never the
image.** That is already, for unrelated reasons, exactly what item 36's recommendation does
— Web Detection's `bestGuessLabels` re-entering `this.#lookup` as a query string. It now
has a second, independent reason to be the design.

### 3.4 PIPEDA, if a product photo catches a person or a store interior

Shin photographs shelves. Shelves have shoppers in front of them and staff behind them.

**PIPEDA applies to a commercial organization's collection of personal information**, and
an image of an identifiable individual is personal information. The operative Canadian
precedent is **PIPEDA Findings #2021-001**, the joint OPC / CAI Québec / OIPC BC / OIPC AB
investigation of Clearview AI
(https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2021/pipeda-2021-001/,
February 2021; follow-up order December 2021,
https://www.priv.gc.ca/en/opc-news/news-and-announcements/2021/an_211214/).

The holding that matters: **"publicly available" is not a defence.** The Commissioners
found that images posted publicly online do **not** fall within the publicly-available
exception in the *Regulations Specifying Publicly Available Information*, that exceptions
to consent under PIPEDA must be **narrowly construed**, and they rejected the argument that
people who put images online have no reasonable expectation of privacy in them.

**What this means for Shin, concretely.** It is not that the app is unlawful. It is that
"the photo was taken in a public store" is **not** the answer, and neither is "the shopper
is blurry." Three things are cheap now: (i) crop to the product before anything leaves the
device — item 36 notes the repo already crops to 1568 px, so the mechanism exists; (ii) do
not retain the uncropped frame; (iii) say so in the privacy policy. **Sending an uncropped
shelf photo to any third-party vendor — Google, a reseller, anyone — is the version of this
that creates real exposure**, because it is a disclosure to a third party of personal
information collected without consent. This is the one item in the file that is **not**
about Lens at all and applies no matter which route is chosen.

**Note the moving target:** PIPEDA's replacement has been through repeated federal bills.
This file cites PIPEDA as the law in force and does not attempt to predict its successor.

### 3.5 The Competition Act, and why it is in this file

`QUEUE.md` row 2.9 already encodes the rule, and the statute confirms it. Competition Act
s. 74.01(1) (https://laws-lois.justice.gc.ca/eng/acts/C-34/section-74.01.html, page
current to 2026-09-11) — reviewable conduct where a person:

> **(a)** "makes a representation to the public that is false or misleading in a material
> respect"

> **(b)** "makes a representation to the public in the form of a statement, warranty or
> guarantee of the performance, efficacy or length of life of a product that is not based
> on an adequate and proper test thereof, **the proof of which lies on the person making
> the representation**"

**The emphasised clause is the whole point and it is why this belongs in a Lens file.**
Under (b) the **burden is reversed**: Shin must hold the test *before* publishing the
claim. And here is the connection to everything above — **a verdict derived from a source
you are not licensed to use is a claim you cannot prove in public.** You cannot produce
your methodology in a s. 74.01 proceeding if producing it means admitting a ToS breach.
Licensing is not only a contract question; it is what makes the verdict defensible.

Paragraph (a) reaches the verdict itself. A "ripoff" verdict computed from a stale or
partial price set is a representation about a product, made to the public, and it is
material. That is the repo's existing hard rule 2 restated in the statute's own words.

---

## 4. The US landscape — context only, and the popular summaries overstate it

Included only because a US reseller sits in the data path and US users may arrive. **None
of this is Canadian law.**

**hiQ Labs v. LinkedIn.** Widely cited as "scraping public data is legal." **That is wrong
about how it ended.** The Ninth Circuit's 2022 decision
(https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf) concerned only a
preliminary injunction and the CFAA, holding that scraping *publicly available* data
probably does not "access without authorization" under the CFAA. **The district court then
ruled in November 2022 that hiQ had breached LinkedIn's user agreement** — the anti-
scraping and fake-profile terms were enforceable in contract. On **7 December 2022 the
parties stipulated to a $500,000 judgment against hiQ**, covering breach of contract, a
CFAA violation (for accessing password-protected pages via fake accounts), California's
unauthorized-access statute, trespass to chattels, misappropriation, and spoliation
sanctions; plus a **permanent injunction requiring hiQ to cease all scraping of LinkedIn
and destroy the source code, data and algorithms derived from the scraped profile data.**
(https://www.privacyworld.blog/2022/12/linkedins-data-scraping-battle-with-hiq-labs-ends-with-proposed-judgment/;
https://www.zwillgen.com/alternative-data/hiq-v-linkedin-wrapped-up-web-scraping-lessons-learned/.)
**hiQ won the CFAA point and then lost the case and the company.** The lesson is the one
this whole file keeps arriving at: **the contract theory is the one that bites.**

**Van Buren v. United States**, 593 U.S. ___ (2021)
(https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf). 6-3, Barrett J. "Exceeds
authorized access" under the CFAA covers obtaining information from areas of a computer
that are **off-limits** to the person — not accessing information they may access, for a
forbidden *purpose*. **It narrows the CFAA and it does not legalise scraping.** The Court
expressly did **not** adopt a purely code-based test, leaving open whether cease-and-desist
letters or terms-of-service restrictions can close a CFAA gate. Van Buren is a statute-
interpretation case and says nothing at all about breach of contract.

**Meta Platforms v. Bright Data** (N.D. Cal., Chen J., 23 January 2024). Summary judgment
for Bright Data. Bright Data had held Facebook and Instagram accounts and so had accepted
terms restricting scraping, but the court found **no evidence of logged-in scraping**, and
held Bright Data did not breach those terms by **logged-out** scraping of public pages or
by reselling the data, either while an account holder or after termination.
(https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/;
Quinn Emanuel client alert, https://www.quinnemanuel.com/the-firm/news-events/client-alert-what-does-the-meta-v-bright-data-summary-judgment-ruling-mean-for-web-scraping/.)

**Why Bright Data does not rescue Shin.** Three reasons, each decisive on its own.
(i) It is **US contract law in one district court**, and Canada's leading decision —
Century 21 — went the other way on browse-wrap. (ii) It turned on the scraper **not being
logged in**; Lens's useful surfaces increasingly involve session state. (iii) It construed
**Meta's** terms, and Google's Terms of Service and Google APIs ToS are differently worded
— in particular the Google APIs §2(c) "only ... by the means described in the
documentation" clause has no Meta analogue and does not depend on account status.

---

## 5. The reseller question: does buying from SerpApi transfer the risk?

**No. It insures a slice of it, for US law, above a price floor, subject to a condition
that swallows the cover. And it moves the contractual risk *toward* you, not away.**

Item 36 already records the Legal Shield as $2M available at the $150/mo Production tier
and above. Here is what SerpApi's own contract says the customer warrants
(https://serpapi.com/legal, **Last updated August 27, 2026**, read 2026-09-13):

> **§1:** "You may not use our products for any illegal or unauthorized purpose nor may
> you, in the use of the Service, violate any laws in your jurisdiction."

> **§12:** the service may not be used "for any unlawful purpose" or to "violate any
> international, federal, provincial or state regulations, rules, laws, or local
> ordinances."

> **§14 (indemnity — note which direction it runs):** "You agree to indemnify, defend
> and hold harmless SerpApi.com and our parent, subsidiaries, affiliates, partners,
> officers, directors, agents, contractors, licensors, service providers, subcontractors,
> suppliers, interns and employees, harmless from any claim or demand ... made by any
> third-party due to or arising out of your breach of these Terms."

> **§13 (limitation):** "In no case shall SerpApi, LLC ... be liable for any injury, loss,
> claim, or any direct, indirect, incidental, punitive, special, or consequential damages
> of any kind ... arising from your use of any of the service or any products procured."

> **§13 (the Shield):** "For all recurring plans except the Free, Starter, and Developer
> plans, SerpApi will assume the liabilities of scraping and parsing search engine results
> ... with up to $2 million in coverage ('U.S. Legal Shield'), **provided your use of the
> data or service is not illegal**." *(emphasis added)*

**Answering the question directly, in four parts.**

1. **Transfer? No.** §14 runs the other way. **The customer indemnifies SerpApi.** If
   Google pursues SerpApi over your queries, SerpApi has a contractual claim against *you*.
   That is the opposite of risk transfer.
2. **Share? Partly, and only within the Shield's boundaries.** It is styled "U.S. Legal
   Shield." No Canadian equivalent is offered. A Canadian plaintiff, or the OPC, or the
   Competition Bureau, is outside its frame on its face.
3. **Insure? Yes, conditionally — and the condition is circular.** The cover applies
   "provided your use of the data or service is not illegal." **The Shield therefore
   covers you in exactly the cases where you did not need covering, and lapses at the
   moment the question becomes live.** The vendor's own §1 and §12 already required your
   use to be lawful, so the carve-out is not narrowing an edge case; it is the whole set.
4. **Tier.** The exclusion list is verbatim — "except the Free, Starter, and Developer
   plans" — confirming item 36: the $25 Starter tier a beta would buy has **no Shield at
   all**. To get cover you must be paying $150/mo, which item 36 prices at $10 per 1,000
   lookups against Web Detection's $3.50.

**The independent point that no contract can fix.** SerpApi's terms bind you and SerpApi.
They bind Google to nothing. **Google is not a party**, has granted no licence, and its
own §2(c) ("only ... by the means described in the documentation") is breached by the
underlying access whoever performs it. Buying a reseller adds a counterparty; it does not
add a licence. **A vendor offering to insure you against a legal question is evidence that
the question is live** — item 36 said that, and reading the clause confirms it.

**Register ruling.** Consistent with item 36: SerpApi's Lens endpoint returns *identity*,
so it does not literally fall under `QUEUE.md`'s "asking a search engine for a live price"
kill. But its **`products` search type returns price and seller**, and reaching for that is
the killed method under a new name, and the register applies. Unchanged. Note additionally
that `google.com/shopping/search` and `/shopping/product/` are **robots.txt-disallowed**
(2.1), so that particular use is a ToS breach as well as a register breach.

---

## 6. What IS cleanly licensed for this exact job

One sentence per product, each actionable.

### 6.1 Google Cloud Vision — Web Detection and Product Search

**Permitted, commercially, for this purpose, with one boundary.** Governed by the GCP ToS
(2.4, last modified 2026-09-02) and the Service Specific Terms
(https://cloud.google.com/terms/service-terms, **last modified July 29, 2026**); **no
clause prohibiting product identification was found**, and §3.3's restriction list does not
reach it.

**The boundary is the one item 36 already drew, and it survives the legal read intact.**
Web Detection returns retailer URLs. **The API returning a URL does not licence you to
fetch it** — that is direct retailer page scraping, `QUEUE.md`-killed, and in Canada it is
the fact pattern of both Century 21 and Trader v. CarGurus. Take `bestGuessLabels` or a
`webEntities` description as a **string**; never follow the link; never store the returned
thumbnails (3.3).

*Honest limit on this clearance:* the GCP ToS and the ~500KB Service Specific Terms were
searched on the clauses that bear on this question, not read end to end. This is a better
basis than item 36 had, and it is still **"no prohibition found on the operative clauses,"
not "cleared by counsel."**

### 6.2 Vertex AI / Gemini vision — and the restriction that changes the answer

**Two different things, and conflating them is the trap.**

**(a) A plain multimodal call — send the crop, get JSON back. Permitted.** Gemini API
Additional Terms (https://ai.google.dev/gemini-api/terms, **Effective March 23, 2026**,
last updated 2026-04-28):

> "Google won't claim ownership over that content. You acknowledge that Google may generate
> the same or similar content for others and that we reserve all rights to do so."

> "Use of Google AI Studio and Gemini API is for developers building with Google AI models
> for professional or business purposes, not for consumer use."

*(That second sentence describes who the API is sold to — developers building products —
not a bar on your product having consumers. Read with the rest of the terms, which
contemplate "your end users" throughout. **That reading is mine, not the document's**, and
it is the sort of thing section 7's lawyer hour should confirm.)* The use restrictions are
about competing models and reverse engineering: "You may not use the Services to develop
models that compete with the Services" and "You also may not attempt to reverse engineer,
extract or replicate any component of the Services, including the underlying data or
models." **Nothing there touches product identification.** This is item 36's route 4, and
it is clean.

**(b) Grounding with Google Search — the licensed thing that looks like the answer and is
not. Quoted in full, because a paraphrase of this clause would be worthless:**

> "You will only use Grounding with Google Search in an application that is owned and
> operated by you and will only display the Grounded Results with the associated Search
> Suggestion(s) to the end user who submitted the prompt. You will not, and will not allow
> your end user or any third party to, **cache, frame, syndicate, resell, analyze, train
> on, or otherwise learn from** Grounded Results or Search Suggestions. For clarity,
> Grounded Results, Search Suggestions, and Links are intended to be used in combination to
> respond to a given end user prompt and it is a violation of these terms to use Grounding
> with Google Search to extract or collect one or more of these components for another
> purpose (for example, using programmatic or automated means to collect Links, using Links
> to build an index, or using Links to identify destination pages for crawling or
> scraping)."

and the narrow storage carve-out that follows it:

> "You may copy and store, for up to two (2) years, the text of the Grounded Result(s):
> (1) that were displayed by you only to evaluate and optimize the display of the Grounded
> Results in your application; (2) in chat history of an end user of your application only
> for the purpose of allowing that end user..."

Source: https://ai.google.dev/gemini-api/terms (Effective 2026-03-23). **The same
restriction appears verbatim on the Google Cloud side** in the Service Specific Terms,
§(k) "Grounding with Google Search" (https://cloud.google.com/terms/service-terms, last
modified 2026-07-29) — clause (2) there is word-for-word identical. **So there is no
Vertex-side escape from it**, which was worth checking rather than assuming.

**Why this is the most important paragraph in the file.** Shin's design is: get a price,
**store it**, **compare it** against other prices, and **render a verdict**. Against the
quoted clause that is *cache*, *analyze*, and "otherwise learn from" — three of the six
banned verbs — and the two-year carve-out does not reach it, because the carve-out is
limited to optimising display and to end-user chat history. **The one licensed Google route
that could have answered "what does this cost" forbids the storage and the comparison that
make Shin Shin.** And the closing example — "using Links to identify destination pages for
crawling or scraping" — forecloses the obvious workaround by name.

**This is an independent confirmation of `QUEUE.md`'s existing kill.** "Asking a search
engine for a live price" was killed on a **measurement** (the 2026-09-03 pilot). It now
also fails on a **contract**, found by a different method on a different day. A falsifier
that fires twice from two directions is not a coincidence; **the kill should be treated as
harder than it was**, and any future proposal to reopen it must clear the terms as well as
the measurement.

### 6.3 Google's generative-AI indemnity — a real benefit, if the tier is right

Google indemnifies customers against third-party IP claims arising from unmodified
Generated Output of a **Generative AI Indemnified Service**
(https://cloud.google.com/terms/generative-ai-indemnified-services). A service qualifies
only "where the use of such Service or feature is **paid for by Customer and not subject to
credits or free tier usage**." Covered services include the Gemini Enterprise Agent
Platform API (formerly Vertex AI API) used with generally available foundation models, and
Grounding with Google Search. Carve-outs: output the customer knew or should have known was
likely infringing; circumventing source citations or filters; continuing after notice of a
claim; and trademark claims arising from the customer's own use in trade or commerce.

**Founder-actionable:** the indemnity is **not** on the free tier. If Shin ever leans on
model output commercially, the paid tier buys an IP indemnity the free tier does not — a
reason to be on paid beyond rate limits. **Contrast with SerpApi's Shield (section 5), and
notice the direction: Google indemnifies you; SerpApi has you indemnify SerpApi.** That
contrast is the cleanest available one-line summary of licensed versus unlicensed.

### 6.4 A Google product-data programme

**Not found for Shin's use case.** The Merchant API and the (deprecated) Content API for
Shopping exist (https://developers.google.com/merchant/api/overview), but they are for a
merchant to manage **its own** Merchant Center account — service accounts reach only your
own account, and third-party access requires each merchant to authorise you by OAuth
(https://developers.google.com/shopping-content/guides/how-tos/service-accounts). **There
is no Google programme that sells you other retailers' catalogue or price data.** If Shin
wanted licensed Canadian retailer prices from Google, the answer is that Google does not
sell them; prices come from the sources already wired in `price/src/sources.ts`.

---

## 7. Bottom line for a founder

### Ranked

**Clearly fine — build on these without hesitation:**
1. **Google Cloud Vision Web Detection**, used to recover a **string** that re-enters
   `this.#lookup`, never to follow the URLs it returns. Licensed, paid, in scope. Already
   item 36's recommendation; the legal read does not disturb it and adds a second,
   independent reason for the no-follow rule (3.3).
2. **Gemini / Vertex plain multimodal calls** on the cropped image. Licensed; you own the
   output; the paid tier carries an IP indemnity (6.3).
3. **Cloud Vision Product Search** on a catalogue **you have the right to upload** — which
   is the open question item 36 flagged for the Open Food Facts images, and which is a
   licensing question rather than a liability one.

**Contract risk only — survivable, but real, and with Canadian precedent against it:**
4. **Buying Lens results from SerpApi or an equivalent.** No criminal exposure on any
   authority found. What you are exposed to is (a) Google enforcing its ToS — realistically
   by cutting the reseller off, which kills your feature overnight, the Bing-retirement
   failure mode item 36 already names; and (b) the §14 indemnity running the wrong way.
   The Shield does not cover Canada and lapses precisely when it would be needed.

**Real risk — do not do these:**
5. **Following the retailer URLs** a visual search returns and reading prices off them.
   `QUEUE.md`-killed already, and it is the exact fact pattern of Century 21 (injunction)
   and Trader v. CarGurus ($305,064 for the photos).
6. **Storing or redisplaying retailer product imagery.** Copyright in photographs is where
   the Canadian money actually is, statutory damages scale per work, and CarGurus lost the
   originality argument. **Take the string, never the image.**
7. **Sending uncropped shelf photos to any third party.** Clearview (3.4) removes the
   "it was public" defence. Crop on-device; do not retain the frame.

**Out:**
8. **Writing your own Lens scraper.** Breaches Google APIs ToS §2(c) on its face, requires
   evading protective measures (the one move that pushes s. 342.1 from improbable toward
   arguable), and buys nothing a reseller does not already sell for less than your time.
9. **Grounding with Google Search as a price source.** Licensed and still unusable: the
   terms forbid caching, analysing and learning from the results (6.2). Already killed on
   measurement; now also dead on contract.

### The one question worth an hour of a Canadian lawyer's time

Send as written:

> *We are a pre-incorporation Canadian startup building a consumer mobile app that
> photographs a retail product and returns a verdict on whether its price is fair. Product
> identity comes from Google Cloud Vision (licensed, paid); prices come from licensed
> retailer APIs and public feeds, never from scraping retailer pages. Three questions.
> (1) In Canada, if we were instead to buy Google Lens results from a US reseller that
> scrapes Google — so that we breach no contract with Google directly, but the reseller
> does — what is our realistic exposure: is it confined to breach of contract and an
> injunction on the Century 21 v. Rogers model, or is there any Canadian authority
> applying Criminal Code s. 342.1 to terms-of-service-violating automated access? We could
> find none. (2) Our app captures in-store photographs that may incidentally include
> shoppers or staff; we crop to the product on-device before transmission. Given PIPEDA
> Findings #2021-001 (Clearview AI), is on-device cropping plus non-retention of the
> original frame sufficient, and what should the privacy policy say? (3) Our output is a
> price verdict. Under Competition Act s. 74.01(1)(b), where the burden of proving an
> adequate and proper test lies on us, what documentation should we be keeping from day
> one so that a verdict is defensible?*

---

## What this file could not verify

Stated so nobody mistakes it for settled.

- **No CanLII full-text search was run.** The s. 342.1 finding (3.2) rests on web search,
  which returned the statute and no application of it to scraping. **Absence of found
  precedent, not proven absence of precedent.** A CanLII search is the cheap next step.
- **No document here was read end to end.** The GCP ToS, the ~500KB Service Specific Terms
  and the Google APIs ToS were searched on the operative clauses. Better than item 36's
  position; still not a clearance.
- **"Grounding with Google Image Search"** appeared in one third-party summary and could
  not be confirmed in Google's own documentation. Not treated as a route.
- **The Google APIs ToS is dated November 9, 2021** — old enough that a newer instrument
  may govern some surfaces. Not chased.
- **Whether SerpApi offers any Canadian legal cover** beyond the "U.S. Legal Shield" was
  not put to SerpApi. The absence is from their published terms only.
- **Century 21's holdings** are taken from the *Slaw*, Stikeman and Bereskin & Parr
  summaries plus search extraction; the CanLII judgment itself was not read line by line.
  The damages figures ($1,000 / $32,000 at $250 per work) are second-hand in that sense.
- **Open Food Facts image licensing** — item 36's open question — is still open. Untouched
  here; it is a licence question, not a liability question.
- **PIPEDA's federal successor legislation** is not tracked. PIPEDA is cited as in force.
- **Nothing here has been checked by a lawyer**, which is the point of section 7.

---

Sources not otherwise inlined, all read 2026-09-13:
https://policies.google.com/terms (eff. 2026-07-30);
https://www.google.com/robots.txt and https://lens.google.com/robots.txt (fetched directly);
https://developers.google.com/terms (mod. 2021-11-09);
https://policies.google.com/terms/generative-ai/use-policy (mod. 2024-12-17);
https://cloud.google.com/terms/ (mod. 2026-09-02);
https://cloud.google.com/terms/aup;
https://cloud.google.com/terms/service-terms (mod. 2026-07-29);
https://cloud.google.com/terms/generative-ai-indemnified-services;
https://ai.google.dev/gemini-api/terms (eff. 2026-03-23);
https://ai.google.dev/gemini-api/docs/google-search;
https://serpapi.com/legal (upd. 2026-08-27);
https://laws-lois.justice.gc.ca/eng/acts/C-46/section-342.1.html;
https://laws-lois.justice.gc.ca/eng/acts/C-34/section-74.01.html (current to 2026-09-11);
https://www.canlii.org/en/bc/bcsc/doc/2011/2011bcsc1196/2011bcsc1196.html;
https://www.canlii.org/en/on/onsc/doc/2017/2017onsc1841/2017onsc1841.html;
https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2021/pipeda-2021-001/;
https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf;
https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf;
https://www.privacyworld.blog/2022/12/linkedins-data-scraping-battle-with-hiq-labs-ends-with-proposed-judgment/;
https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/;
https://www.wipo.int/wipolex/en/text/126788 (EU Directive 96/9/EC);
plus repo files cited inline (`research/price-sources/36-visual-product-search.md`,
`QUEUE.md`, `price/src/sources.ts`, `identify/src/identify.ts`,
`research/competitors/retailer-apps-and-visual-search.md`).
