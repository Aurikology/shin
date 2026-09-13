# Item 39: Canadian law on scraping, price indexing and terms of use

**PROVENANCE, AND WHY IT IS AT THE TOP.** This document is the output of a **Gemini Deep Research**
run, executed 2026-09-13 in Aurik's browser (conversation `gemini.google.com/app/89c2904146b96356`,
report timestamped Sep 13 3:50 PM). The prompt is preserved in section A below. It was commissioned
to close the one gap `research/price-sources/37-google-lens-legal-position.md` named and could not
fill: **that lane ran no CanLII full-text search**, so its finding that s.342.1 has never been
applied to scraping was an absence of FOUND precedent rather than a searched absence.

**This is UNVERIFIED THIRD-PARTY MODEL OUTPUT. It is not legal advice and it is not yet evidence.**
The repo's standard is that a claim carries a source that somebody checked. Nobody has checked
these. A language model citing case law is exactly the shape of output that invents citations that
look correct, and the more specific the pin cite the more attention it deserves. Treat every
citation below as a LEAD, not a fact, until it is opened on CanLII.

**Spot-check list, in priority order, before any of this is relied on:**
1. `Trader Corporation v CarGurus Inc, 2017 ONSC 1841` at **paras 23-25 and 33** - the quoted
   passages and, above all, the claim that Trader made no copyright claim over the factual listing
   data. That single sentence is what decides Shin's design rule, so it gets checked first.
2. `Tele-Direct (Publications) Inc v American Business Information Inc, 1997 CanLII 6378 (FCA)`.
3. `R v Belmkaddem, 2026 ONCJ 242` - a 2026 citation is the most likely to be wrong.
4. `TREB v Mongohouse`, `Collett v Northland Art, 2018 FC 269`, `Rallysport Direct v 2424508
   Ontario, 2020 FC 794`.
5. The verbatim retailer clauses in section 11, each against its live URL. These are quotations of
   contracts; a paraphrase presented as a quotation would be worse than no quotation.

**What it does NOT change.** Nothing here touches the two findings in file 37 that rest on terms
this repo read directly: Grounding with Google Search forbids caching, analysing or learning from
Grounded Results, and the same clause appears on the Vertex side. Those stand on their own sources.

---

## What it actually answered, in four lines

- **The question Shin's design rule turned on is answered, and favourably.** Trader's infringement
  finding "applied exclusively to photographs"; the court "awarded no damages and made no finding of
  infringement regarding the automated collection, indexing, or display of vehicle pricing or
  technical specifications." So "take the string, never the image" is not merely cautious - it is
  the exact line the case draws.
- **Criminal exposure: none found, and now for a stated reason rather than an absent search.**
  s.342.1 requires acting "fraudulently and without colour of right"; an unauthenticated HTTP GET
  involves no deceit, and an open server broadcasts publicly. Reported use is credential bypass,
  rogue insiders, spyware and DDoS.
- **A price is a fact.** CCH killed sweat-of-the-brow; Tele-Direct held a mechanical listing
  compilation unprotected; extracting one price is not a substantial part.
- **The thing Shin must not do is already in its own defect log.** Circumventing bot detection or IP
  blocks is framed here as TPM circumvention under Copyright Act s.41.1 - see D-049, the PerimeterX
  lockout, where this repo had already decided never to rotate IPs or spoof headers. That decision
  was made on manners and is now also a liability position.

---

Canadian Legal and Regulatory Review: Web Scraping, Commercial Price Indexing, and Website Terms of Use Enforceability
Notice: This report provides legal and statutory analysis for strategic planning and educational purposes and does not constitute formal legal advice.

1. Canadian Jurisprudential Survey on Scraping and Automated Data Collection
A full-text survey of CanLII and Canadian reported jurisprudence confirms that the body of Canadian decisions directly adjudicating web scraping, automated crawling, or the breach of website terms of use for data harvesting is very small. Fewer than ten substantive reported decisions in Canadian legal history have addressed the merits of automated web extraction.   

The small number of reported decisions is a significant legal finding: commercial disputes over web crawling in Canada rarely proceed to trial. The overwhelming majority of these conflicts are resolved at the interlocutory stage—either through negotiated settlements, compliance with cease-and-desist demands, or consent injunctions.   

The following table synthesizes the primary Canadian judicial authorities and active proceedings addressing web scraping, automated extraction, and browse-wrap enforceability.

Neutral Citation / Court File	Year & Court	Scraped / Accessed Subject Matter	Cause(s) of Action Pleaded	Outcome	Remedy & Quantum
Century 21 Canada LP v. Rogers Communications Inc., 2011 BCSC 1196

[cite: 6, 7]

2011, B.C. Supreme Court	
Real estate property listings, photographs, and property descriptions indexed from Century21.ca by Zoocasa.

Breach of contract (browse-wrap terms); copyright infringement; trespass to chattels.

Plaintiff Won on breach of contract and copyright; defendant prevailed on trespass to chattels.

Permanent injunction against scraping/indexing; $1,000 nominal damages for contract breach; $32,000 statutory damages under the Copyright Act.

Trader Corporation v. CarGurus, Inc., 2017 ONSC 1841

[cite: 6, 8]

2017, Ontario Superior Court of Justice	
Dealership vehicle inventory listings and 152,532 dealer photographs.

Copyright infringement (reproduction and telecommunication via framing).

Plaintiff Won on copyright in photographs; fair dealing and search engine defences rejected.

Injunction denied; statutory damages awarded at $2.00 per photograph, totaling $305,064.

Toronto Real Estate Board v. Mongohouse.com, Court File No. T-1736-18 (see also 2018 FC 1108)

2019, Federal Court of Canada	
Real estate listings, sold prices, property descriptions, and database schema from MLS.

Copyright infringement (compilation); breach of terms of use; circumvention of technological protection measures (TPMs) under s. 41.1 of the Copyright Act.

Plaintiff Won via Consent Judgment upholding copyright and TPM protections against scrapers.

Permanent injunction issued April 15, 2019, restraining defendants from scraping or displaying data; financial terms confidential.

Tele-Direct (Publications) Inc. v. American Business Information, Inc., 1997 CanLII 6378 (FCA), [1998] 2 FC 22	1997, Federal Court of Appeal	Raw telephone directory listings (names, addresses, telephone numbers) copied into a commercial database.	Copyright infringement in compilation of factual directory listings.	Defendant Scraper Won. Court held factual listings lacked sufficient originality in selection and arrangement.	Action dismissed with costs; no remedies granted. Established that raw factual data lacks copyright protection in Canada.
Blacklock’s Reporter v. Canada (Attorney General), 2016 FC 1218 (upheld 2017 FCA 198)	2016 / 2017, Federal Court & Federal Court of Appeal	Digital paywalled journalistic articles accessed and distributed internally across government departments.	Copyright infringement; circumvention of TPMs (Copyright Act s. 41.1).	Defendant Won on fair dealing for research and regulatory analysis; TPM circumvention dismissed on facts.	Action dismissed; no damages or injunction awarded.
Canadian Legal Information Institute v. Caseway AI Legal Ltd., BCSC Court File VLC-S-S-248108

2024, B.C. Supreme Court	
Bulk judicial decisions, metadata, and case summaries systematically scraped from CanLII.

Breach of contract (Terms of Use); copyright infringement; conversion; unjust enrichment.

Settled Out of Court (Action discontinued post-settlement late 2024/early 2025; no reported trial decision).

Notice of Claim sought interlocutory and permanent injunctions, statutory damages, and punitive damages.

Toronto Star Newspapers Ltd. v. OpenAI, Inc., ONSC Commercial List File CV-24-00732231-00CL

2024 (Active), Ontario Superior Court of Justice	
News publications and journalistic archives crawled for generative AI training.

Copyright infringement; circumvention of TPMs (s. 41.1); breach of online terms; unjust enrichment.

Pending Adjudication.

Plaintiffs claim an accounting of profits, statutory damages of $20,000 per work, and punitive damages.

Air Canada v. Localhost Technologies Inc., (Settled / Dismissed by Consent)

2019, Federal Court / Superior Court of Quebec	
Flight availability, commercial fare tables, and dynamic route pricing harvested by travel scrapers.

Breach of contract; computer trespass; intentional interference with economic relations.	
Settled Out of Court following injunctive filings; defendant ceased screen scraping.

Defendant agreed to transition to approved commercial Global Distribution System (GDS) API feeds.
  
2. Criminal Exposure Under Criminal Code Section 342.1
Section 342.1(1) of the Criminal Code of Canada, R.S.C. 1985, c. C-46, defines the unauthorized use of a computer system:

342.1 (1) Everyone is guilty of an indictable offence and liable to imprisonment for a term of not more than 10 years,...source) or (c).   

Section 342.1(2) defines "computer service" to include "data processing and the storage or retrieval of computer data".   

No reported Canadian judicial decision, criminal charge, indictment, or public Crown policy has ever applied Criminal Code s. 342.1 to the automated scraping or crawling of publicly accessible web servers, nor to the mere access of an open website in breach of its terms of use.   

The mental and legal thresholds under s. 342.1 require the Crown to prove beyond a reasonable doubt that an accused acted "fraudulently and without colour of right". Following the Supreme Court of Canada’s governing decisions in R. v. Olan, [1978] 2 S.C.R. 1175, and R. v. Riesberry, [2015] 3 S.C.R. 721, acting "fraudulently" requires proof of deceit, falsehood, or other fraudulent means that causes actual economic deprivation or creates a real risk of economic prejudice. Sending automated HTTP GET requests to an unauthenticated web server involves no deceit or misrepresentation of identity; the server is architected to respond automatically to HTTP queries without requiring identity verification or authentication tokens. Furthermore, "colour of right" refers to an honest belief in an entitlement or state of facts which, if true, would provide a legal justification. Because open web servers broadcast data publicly across the internet, the complete absence of a colour of right cannot be established by the prosecution.   

The Canadian judicial record shows that s. 342.1 is applied exclusively to classic cybercrime activities:

Accessing password-protected, encrypted, or firewalled networks by stealing, cracking, or purchasing authentication credentials on darknet markets (e.g., R. v. Belmkaddem, 2026 ONCJ 242);   

Rogue insiders, such as bank employees or police officers, abusing privileged access credentials to retrieve confidential records from internal databases like CPIC without authorization;   

The deployment of spyware, keyloggers, or trojans designed to intercept data streams surreptitiously; and   

Distributed denial-of-service (DDoS) attacks or operational sabotage prosecuted in tandem with Criminal Code s. 430(1.1) (mischief in relation to computer data).   

The Public Prosecution Service of Canada (PPSC) Deskbook directs that charges are approved only where there is a reasonable prospect of conviction and prosecution is in the public interest. The PPSC maintains no guidance contemplating the criminalization of commercial market-data indexers or scrapers querying open internet assets. Where scraping does not bypass login mechanisms, paywalls, or encryption barriers, s. 342.1 does not present any realistic criminal exposure.   

3. Copyright Protection in Prices, Compilations, and Algorithmic Processes
Under Canadian intellectual property law, an individual retail price is a purely objective fact that exists entirely outside copyright protection. Copyright protects original expressions of ideas, not facts, ideas, or raw data.   

In CCH Canadian Ltd. v. Law Society of Upper Canada, 2004 SCC 13, the Supreme Court of Canada established the standard for originality under the Copyright Act, R.S.C. 1985, c. C-42. Chief Justice McLachlin ruled that for a work to be original, it must originate from an author through an exercise of skill and judgment:

"[A]n 'original' work must be as a result of an author’s exercise of skill and judgment. By skill, I mean the use of one's knowledge, developed aptitude or practised ability in producing the work. By judgment, I mean the use of one's capacity for discernment or ability to form an opinion or evaluation by comparing different possible options in producing the work. The exercise of skill and judgment required to produce the work must not be so trivial that it could be characterized as a purely mechanical exercise."

CCH Canadian eliminated the Anglo-Canadian "sweat of the brow" doctrine, confirming that mere labour, industrial investment, or capital expenditure does not confer copyright protection. A commercial retail price (e.g., "$4.99") requires neither literary skill nor expressive judgment; it is an unprotectable operational datum.

Section 2 of the Copyright Act defines a compilation as a work resulting from the selection or arrangement of data. Section 2.1(1) clarifies that copyright in a compilation protects only the original selection or arrangement itself, and does not confer any proprietary right over the underlying data.

This principle was applied to directories by the Federal Court of Appeal in Tele-Direct (Publications) Inc. v. American Business Information, Inc., 1997 CanLII 6378 (FCA), [1998] 2 FC 22. In Tele-Direct, the court held that a yellow-pages compilation of business listings was not protected by copyright because the compiler exercised no genuine skill and judgment in selecting or arranging the entries; it simply compiled all available listings within conventional trade headings.

Similarly, an e-commerce database listing a retailer's complete inventory categorized by standard SKU hierarchies is a mechanical compilation. Even if a digital storefront could demonstrate minimal originality in its specific user-interface taxonomy, extracting an isolated product price from an individual listing does not reproduce a "substantial part" of the compilation under s. 3 of the Copyright Act (Cinar Corporation v. Robinson, 2013 SCC 73).

Canada has enacted no sui generis database rights comparable to those established under the European Union's Directive 96/9/EC. The EU Directive grants a standalone, 15-year property right protecting substantial financial or technical investments made in obtaining, verifying, or presenting database content, irrespective of creative originality. Under Canadian law, if an enterprise expends millions of dollars compiling unoriginal retail prices, Canadian copyright law provides zero statutory property protection over that collected data.

Fair dealing for research under s. 29 of the Copyright Act provides that fair dealing for research, private study, education, parody, or satire does not infringe copyright. Although CCH Canadian confirmed that "research" must be given a broad interpretation not strictly limited to non-commercial contexts, fair dealing cannot reliably protect a commercial startup that harvests expressive content.

In Trader Corporation v. CarGurus, Inc. (2017 ONSC 1841), the Ontario Superior Court applied the six CCH fair dealing factors to a commercial automotive aggregator. Justice Conway held that while consumer end-users use the platform to research vehicle purchases, the aggregator's primary purpose was commercial exploitation in direct competition with the rights holder. Because commercial alternatives existed and the platforms competed for advertising revenue and web traffic, the fair dealing defence failed. Thus, fair dealing will not protect a commercial startup from copyright infringement if it scrapes expressive assets like marketing copy or photographs. However, if the startup extracts only unprotectable numerical prices, the fair dealing analysis is never engaged because no protected work has been copied.   

Section 30.71 of the Copyright Act establishes an exception for temporary reproductions made for technological processes:

30.71 It is not an infringement of copyright to make a reproduction of a work or other subject-matter if

(a) the reproduction refers to the use of a technological process;

(b) the reproduction is made solely for the purpose of facilitating a use that is not an infringement of copyright; and

(c) the reproduction has no independent economic significance.

Section 30.71 provides a safe harbor for the transient caching or volatile RAM buffering of web pages that occurs during automated network routing and HTML parsing. When a scraper issues an HTTP request, pulls an HTML document into temporary memory solely to extract an uncopyrightable price string, and immediately flushes the document from memory, s. 30.71 confirms that the temporary reproduction of any underlying copyrighted web design or layout is non-infringing. However, s. 30.71 offers no protection if copyrighted elements (such as product photographs) are copied to persistent disk storage or publicly displayed within the app.

4. In-Depth Analysis of Trader Corporation v. CarGurus, Inc. (2017 ONSC 1841)
In Trader Corporation v. CarGurus, Inc., 2017 ONSC 1841, the Ontario Superior Court of Justice adjudicated a high-stakes dispute between two competing digital automotive marketplaces. Trader operated autoTRADER.ca, while CarGurus entered the Canadian market by deploying web scrapers to crawl car dealership websites to populate its own platform with inventory listings.   

The procedural history shows that the decision was not appealed to the Court of Appeal for Ontario and represents binding superior court authority in Ontario as well as persuasive authority across common law Canada.   

Subsequent Canadian jurisprudence has cited Trader Corp. favorably on two points:

The assessment of statutory damages under s. 38.1 of the Copyright Act, specifically regarding the reduction of damages where the statutory minimum would produce a grossly disproportionate result (e.g., Collett v. Northland Art Company Canada Inc., 2018 FC 269; Rallysport Direct LLC v. 2424508 Ontario Ltd., 2020 FC 794); and

The scope of internet "framing" as an infringement of the exclusive right to communicate a work to the public by telecommunication under s. 2.4(1.1) of the Copyright Act.   

The court's finding of copyright infringement applied exclusively to photographs. Trader proved that its trained photographers took staging photos of dealer vehicles under a specialized capture service. Justice Conway addressed originality under CCH Canadian:   

"[Trader's] photographers are trained to photograph the vehicles in a specific manner... They use their skill and judgment to stage the vehicle, choose the appropriate angles, and compose the shot... The fact that the photographers followed standardized procedures did not eliminate the use of their skill and judgment... The photos are original artistic works" (paras 23–25).   

Trader made no copyright claim over the underlying factual listing data—such as vehicle make, model, year, trim, mileage, or retail price. The court awarded no damages and made no finding of infringement regarding the automated collection, indexing, or display of vehicle pricing or technical specifications. The finding of liability turned entirely on the artistic work embodied in the photographs.   

CarGurus argued that it did not reproduce the photographs on its own servers, but instead used internet "framing" to display photos directly hosted on third-party dealer servers. The court rejected this defence, concluding that framing constituted making the works available to the public by telecommunication pursuant to section 2.4(1.1) of the Copyright Act:   

"By displaying the photos on its website, CarGurus was making them available to the public by telecommunication in a way that allowed a member of the public to have access to them from a place and at a time individually chosen by that member" (para 33).   

Trader elected statutory damages under s. 38.1(1)(a) of the Copyright Act, which provides a baseline range of $500 to $20,000 per infringed work for commercial infringements. Applied to 152,532 individual photographs, the statutory minimum produced a claimed award exceeding $76 million.   

Justice Conway invoked the statutory relief valve in section 38.1(3)(b) of the Copyright Act, which grants courts discretion to award less than the $500 minimum if the total award would otherwise be grossly disproportionate to the infringement. Finding that CarGurus acted in the good-faith belief that dealers owned the photos, that Trader suffered no actual monetary loss, that CarGurus made no profit in Canada, and that an award of $76 million would be grossly disproportionate, Justice Conway reduced the statutory damages to $2.00 per photograph, yielding a total award of $305,064.   

This per-image statutory damages reduction approach remains good law. It confirms that courts will exercise equitable discretion to compress per-work statutory damages to nominal sums when mass-scraping litigations involve thousands of digital files, avoiding unconscionable statutory windfalls while maintaining an effective deterrent penalty.   

5. In-Depth Analysis of Century 21 Canada LP v. Rogers Communications Inc. (2011 BCSC 1196)
In Century 21 Canada LP v. Rogers Communications Inc., 2011 BCSC 1196, the Supreme Court of British Columbia delivered Canada's foundational decision on the enforceability of online terms of use against automated scrapers. Rogers owned Zoocasa, a search aggregator that scraped real estate listings, descriptions, and photographs from Century21.ca to direct consumer traffic to real estate agents.   

Century 21 maintained a browse-wrap agreement on its site, accessible via a hyperlink at the bottom of web pages. The terms expressly prohibited any automated querying, robots, crawling, scraping, or commercial use of the site's content.   

Justice Punnett outlined the governing standards for digital contract formation under Canadian common law:

Click-wrap agreements—which require users to click "I Agree" or check a mandatory dialogue box—are presumptive, fully enforceable contracts because the overt physical act demonstrates unambiguous mutual assent.

Browse-wrap agreements—which purport to bind users through mere use or browsing—are legally enforceable in Canada only if the website operator provides reasonable notice of the terms prior to or at the time of access, such that the user's continued conduct signifies objective assent.   

Justice Punnett held:

"The issue is whether the user had reasonable notice of the terms... It is open to the court to infer assent from the conduct of the party... If the user knows of the conditions and proceeds to use the site, the user will be bound" (paras 108–117).

Addressing whether an automated bot can "agree" to terms it never viewed, the court concluded that an entity cannot avoid contractual obligations by deploying automated software. Under Canadian law, including provincial statutes such as Ontario’s Electronic Commerce Act, 2000, S.O. 2000, c. 17, s. 19, an automated computer program operates as the legal agent of the party deploying it:   

"The defendant cannot avoid the consequences of the contract by utilizing automated software to bypass the visual notice given to human users. The software operates as the agent of the person who commands it" (paras 129–135).

Once Rogers and Zoocasa received actual notice of the browse-wrap terms (via direct communications and cease-and-desist correspondence from Century 21), continuing to deploy automated crawlers constituted willful acceptance of the contractual restrictions by conduct.

Regarding remedies, Century 21 established that Zoocasa breached the browse-wrap terms. However, Century 21 failed to prove any actual financial injury, lost commissions, or server damage resulting from the breach. The court therefore awarded nominal damages of only $1,000 for breach of contract.   

For copyright infringement, Century 21 was awarded $32,000 in statutory damages under s. 38.1 of the Copyright Act because Zoocasa reproduced proprietary listing descriptions and photographs for which Century 21 held valid copyright assignments.   

The primary and operative remedy was a permanent injunction restraining Rogers and Zoocasa from directly or indirectly accessing, crawling, indexing, or reproducing content from Century 21's websites. Century 21 establishes that while breach of browse-wrap terms rarely results in substantial contract damages absent proof of tangible business harm, it provides website operators with an effective basis for securing a permanent operational shutdown via injunction.   

6. Analysis of Other Potential Common Law and Statutory Causes of Action
When an automated scraper extracts public web data contrary to express website terms, plaintiffs frequently plead an array of common law torts and statutory claims alongside breach of contract.   

┌─────────────────────────────────────────────────────────────────────────┐
│                    SCRAPING CAUSES OF ACTION ANALYSIS                   │
├───────────────────────┬──────────────────────┬──────────────────────────┤
│ CAUSE OF ACTION       │ LEGAL RISK LEVEL     │ PRACTICAL IMPACT         │
├───────────────────────┼──────────────────────┼──────────────────────────┤
│ Breach of Contract    │ HIGH (Post-Notice)   │ Injunction + Nominal $   │
│ Copyright Infringement│ HIGH (Images/Text)   │ Substantial Statutory $  │
│ Trespass to Chattels  │ NEGLIGIBLE           │ Fails Without Disruption │
│ Unjust Enrichment     │ MINIMAL              │ Public Prices Defeat It  │
│ Tort of Conversion    │ ZERO (Not Actionable)│ Data Is Not Property     │
│ Passing Off (Logos)   │ MODERATE             │ Use Plain-Text Only      │
└───────────────────────┴──────────────────────┴──────────────────────────┘
Breach of Contract
Breach of contract represents a viable legal action once actual notice of the browse-wrap terms is established. Deploying automated tools after receiving a formal cease-and-desist letter or circumventing technical access barriers establishes contractual assent by conduct under Century 21. However, compensable damages are generally restricted to nominal amounts unless the retailer can prove actual lost sales or operational damage. The primary risk remains an interlocutory or permanent injunction that shuts down data ingestion.   

Trespass to Chattels (Server Trespass)
Trespass to chattels requires intentional interference with personal property without lawful justification. While early US decisions recognized server trespass based on nominal server usage (eBay, Inc. v. Bidder’s Edge, Inc., 100 F. Supp. 2d 1058 (N.D. Cal. 2000) [persuasive-only context]), Canadian common law rejects this approach.   

In Century 21, Justice Punnett analyzed Intel Corp. v. Hamidi, 30 Cal. 4th 1342 (2003) [persuasive-only context] and dismissed Century 21's server trespass claim:   

"There was no evidence that Zoocasa’s search bots caused any damage to the plaintiff's computer systems, nor did they slow down the system or interfere with its operation... The claim for trespass to chattels must be dismissed" (paras 404–405).   

In Canada, automated scraping does not constitute trespass to chattels unless the scraping activity demonstrably degrades system performance, crashes a server, or causes physical damage to technical infrastructure.   

Unjust Enrichment
Under Garland v. Consumers' Gas Co., 2004 SCC 25, unjust enrichment requires:

An enrichment of the defendant;

A corresponding deprivation suffered by the plaintiff; and

The absence of a juristic reason for the enrichment.

Retailers often plead that scrapers enrich themselves by exploiting server infrastructure that the retailer funded. However, extracting publicly broadcast prices causes no compensable economic deprivation to the retailer, as prices are published to attract purchases. Furthermore, the public availability of factual data and Canadian statutory policies favoring market transparency and consumer competition provide a recognized juristic reason. Unjust enrichment claims directed at pure factual price indexing rarely succeed.   

Tort of Conversion
The Supreme Court of Canada established in R. v. Stewart, [1988] 1 S.C.R. 963, that intangible, purely digital information does not constitute personal property capable of being converted or stolen at common law. Because web scraping copies intangible digital text without depriving the website host of physical possession of its servers or electronic files, conversion cannot be sustained against web scraping under Canadian law.   

Passing Off and Trademark Infringement
Under s. 7(b) of the Trademarks Act, R.S.C. 1985, c. T-13, and the common law tort of passing off, a plaintiff must prove:

Established goodwill or commercial reputation;

Deceptive misrepresentation leading consumers to believe the goods or services are affiliated with, sponsored by, or originating from the plaintiff; and

Actual or potential business harm.

Nominative, factual price reporting (e.g., stating in plain text: "Walmart Price: $4.99 | Loblaws Price: $5.29") does not constitute passing off (Clairol International Corp. v. Thomas Supply & Equipment Co., [1968] 2 Ex. C.R. 26). Under Canadian law, referencing a trade name to report factual market data is permitted, provided there is no misrepresentation of affiliation or endorsement. However, reproducing retailer logos, trademarked badges, or proprietary trade dress creates actionable trademark infringement and passing-off exposure.   

Competition Act Considerations
Retailers possess no private cause of action under the Competition Act, R.S.C. 1985, c. C-34, to sue third parties for indexing pricing information. In contrast, concerted efforts by dominant retail chains to block price indexing or penalize comparison platforms could attract regulatory scrutiny under the abuse of dominance provisions in s. 79 of the Act, especially if major retailers collectively act to suppress price transparency in the Canadian market.

7. Privacy Exposure Under PIPEDA and Quebec Law 25
When shoppers take photographs inside retail store aisles to match products, those images can capture incidental bystanders, retail staff, customers, children, or proprietary store interiors.

Under s. 2(1) of the federal Personal Information Protection and Electronic Documents Act (PIPEDA), S.C. 2000, c. 5:

"personal information" means information about an identifiable individual.   

An unblurred human face captured in a mobile photograph constitutes personal information under PIPEDA. Principle 4.3 of Schedule 1 to PIPEDA mandates that the knowledge and consent of the individual are required for the collection, use, or disclosure of personal information, subject to narrow statutory exceptions. A commercial mobile app that ingests, processes, and stores images of identifiable staff or shoppers without their knowledge and consent violates Principle 4.3.   

The Office of the Privacy Commissioner of Canada (OPC) has addressed image collection and web scraping:

In the joint investigation into Clearview AI (PIPEDA Report of Findings #2021-001), the OPC and provincial privacy commissioners held that mass-scraping publicly available images to compile a commercial database violated Canadian privacy laws. The OPC clarified that information published on the open internet is not exempt from privacy rules: the statutory exemption for "publicly available information" under PIPEDA Regulations (SOR/2001-7) applies strictly to published directories, registries, or professional listings—not to photos of individuals captured in public spaces or on social platforms.   

In October 2024, the OPC and its international partners issued a Joint Statement on Data Scraping, affirming that platform operators and data harvesters have legal obligations to protect personal information against unauthorized automated harvesting.   

In Quebec, privacy protections are reinforced by the Civil Code of Québec (arts. 3, 35, 36 CCQ) and Law 25 (Act respecting the protection of personal information in the private sector):

Under Quebec civil law, an individual has an absolute right to their image as an element of human dignity and privacy (Aubry v. Éditions Vice-Versa inc., [1998] 1 S.C.R. 591). Capturing, transmitting, or using an identifiable photograph of an individual without consent constitutes an actionable civil fault under art. 1457 CCQ.

Law 25 empowers the Commission d'accès à l'information (CAI) to impose administrative monetary penalties (AMPs) of up to $10,000,000 or 2% of worldwide turnover, and penal fines enforced before the Court of Quebec of up to $25,000,000 or 4% of worldwide turnover.

To mitigate privacy risks, the application must process images locally on the user's device. The client-side software should isolate the barcode or product packaging bounding box and apply automated blurring to faces, staff, and ambient backgrounds before any data is transmitted to cloud vision APIs. Furthermore, the startup must use vision APIs that process requests ephemerally and contractually disclaim the retention or training use of uploaded images.

8. Advertising Law and Competition Act Compliance
The app’s core functionality involves calculating price differentials and advising consumers whether an in-store price is "fair" or "cheaper elsewhere." These comparative claims are subject to the deceptive marketing provisions of the federal Competition Act, R.S.C. 1985, c. C-34.

Section 74.01(1)(b) of the Competition Act prohibits any public representation:

in the form of a statement, warranty or guarantee of the performance, efficacy or length of life of a product that is not based on an adequate and proper test thereof, the proof of which lies on the person making the representation.

Under the prior substantiation doctrine established in Canada (Commissioner of Competition) v. Imperial Brush Co., 2008 Comp. Trib. 2, any comparative performance representation—such as asserting that the app "identifies the lowest price," "saves consumers an average of 20%," or "guarantees fair market value"—must be supported by adequate and proper testing conducted prior to making the claim. Testing conducted after the claim is challenged is inadmissible to establish compliance.

Section 74.01(1)(a) prohibits representations that are false or misleading in a material respect. Section 74.05 governs comparative pricing and Ordinary Selling Price (OSP) claims. Under s. 74.05, comparative savings claims (e.g., "Regular Price $10.00 / Target Retailer Price $7.00 / You Save $3.00") are deemed misleading unless the reference price satisfies either the "volume test" (a substantial volume of goods were sold at that price in the market within a reasonable period) or the "time test" (the product was offered at that price in good faith for a substantial period).

Displaying an outdated scraped price as an active market benchmark to substantiate a savings claim violates s. 74.01(1)(a). The startup must maintain automated, timestamped audit logs documenting the exact date, time, and retail store location from which comparative prices were verified.

Administrative monetary penalties for civil deceptive marketing under s. 74.1 were significantly increased following amendments under Bill C-56 (2023) and Bill C-59 (June 2024):

For Corporations: Penalties may reach the greater of $10,000,000 for an initial order (and up to $15,000,000 for subsequent orders), three times the value of the benefit derived, or 3% of gross global revenue.

For Individuals: Penalties can reach $750,000 for an initial order and up to $1,000,000 for subsequent orders.

The Competition Bureau actively prosecutes comparative pricing claims. In 2017, Amazon paid a $1.1 million penalty alongside $100,000 in costs after the Bureau determined that its displayed "List Prices" misled consumers regarding available savings compared to prevailing market prices. Displaying comparison data without dynamic verification exposes the business to regulatory scrutiny.

9. Material Civil Law Distinctions Under the Civil Code of Québec
Operating an automated data-indexing or mobile price-comparison platform in Quebec introduces civil law requirements governed by the Civil Code of Québec (CCQ).

Under art. 1379 CCQ, online website terms of use constitute contracts of adhesion, defined as contracts where essential stipulations are drawn up by one party and are not subject to negotiation.

Browse-wrap terms face specific enforceability hurdles under Quebec law:

Article 1435 CCQ: An external clause referenced in a contract is null if it was not known to the adhering party at the time of contracting, unless the other party proves the adhering party had actual knowledge of it. A hyperlinked browse-wrap term buried in a footer is an external clause that does not bind a user who simply browses a site without knowledge of the clause.

Article 1436 CCQ: Clauses that are illegible or incomprehensible to a reasonable person are null.

Article 1437 CCQ: Abusive clauses in contracts of adhesion are null or subject to judicial reduction. An abusive clause is one that is excessively disadvantageous to the adhering party or contrary to the requirements of good faith.

While a retailer must prove actual knowledge of external browse-wrap clauses under art. 1435 CCQ, delivering a formal cease-and-desist letter establishes that knowledge.

Quebec does not recognize common law torts such as trespass to chattels or conversion. Civil liability is governed by art. 1457 CCQ:

Every person has a duty to abide by the rules of conduct which lie upon him... and not to cause injury to another. Where he is endowed with reason and fails in this duty, he is liable for any injury he causes to another by such fault...

To establish extra-contractual liability against a scraper under art. 1457 CCQ, a retailer must prove:

A civil fault (such as bad faith, circumvention of system safeguards, or violating statutory terms);

Direct and demonstrable patrimonial injury (actual financial loss); and

A direct causal connection between the fault and the injury.

Because prices are publicly broadcast facts, proving compensable financial injury remains a substantial hurdle for retailers under art. 1457 CCQ.

Finally, under arts. 3, 35, and 36 CCQ, the commercial capture of an individual's likeness without express consent constitutes an actionable invasion of privacy and a direct civil fault (Aubry v. Éditions Vice-Versa inc.).

10. Operational Models and Legal Strategies of Competitor Platforms
Major Canadian digital flyer, deal, and price-comparison aggregators—including Flipp, Reebee, RedFlagDeals, and browser extensions—do not rely on unconsented server-side web scraping to obtain their core retail pricing data.

Competitor Platform	Core Data Sources & Ingestion Methods	Canadian Litigation / Public Dispute History
Flipp (acquired Reebee in 2022)	Direct Commercial Publisher Agreements. Flipp operates as an authorized digital distribution network for retailers (including Loblaws, Walmart, Metro, and Canadian Tire). Retailers provide structured promotional feeds (PDFs, XML/JSON inventory manifests) directly to Flipp.	No reported Canadian litigation or cease-and-desist disputes. Flipp operates as an authorized marketing vendor for major retail chains.
Reebee	Direct Retailer Feeds & Commercial Distribution. Operated under an authorized publisher distribution model identical to Flipp prior to and following its acquisition by Flipp Corp in 2022.	No reported litigation in Canada.
RedFlagDeals (RFD) (VerticalScope)	Community Crowd-Sourcing & Affiliate Networks. Deals are submitted by user community members. Retail links utilize commercial affiliate marketing networks (e.g., Impact, CJ Affiliate, Rakuten Advertising, Amazon Associates), where price feeds and deep-linking APIs are contractually licensed.	No reported litigation concerning web scraping. RFD operates as an affiliate publisher under standard intermediary notice-and-takedown safe harbors.
Karma (formerly Shoptagr)	Client-Side DOM Parsing & Affiliate APIs. Uses a client-side browser extension where the user's own browser session extracts price points directly from the DOM, combined with affiliate network API integrations (e.g., Skimlinks, Sovrn).	Avoids centralized server-side scraping liability by executing the extraction client-side on the consumer's local machine.
Honey (PayPal)	Client-Side Extension Parsing & Merchant Networks. Extracts coupon codes and prices via consumer browser sessions and merchant affiliate arrangements.	Subject to occasional merchant affiliate disputes and term renegotiations internationally, but no reported public trial judgments in Canada regarding retail price scraping.
Commercial platforms operating at scale avoid centralized, unconsented server-side web scraping of retailer websites. They transition to formal digital distribution partnerships, commercial flyer agreements, or licensed affiliate API programs. Parties that relied on unconsented scraping of commercial platforms (Zoocasa in Century 21, CarGurus in Trader v. CarGurus, MongoHouse in TREB v. Mongohouse) faced prompt litigation, statutory damages, and permanent injunctions.   

11. Verbatim Anti-Automated Access Clauses in Retailer Website Terms of Use
Below are the verbatim clauses governing automated access, crawling, scraping, or data extraction for major Canadian retailers, accompanied by their URLs and effective dates.

Loblaws (Loblaw Companies Limited)
URL: https://www.loblaws.ca/terms-of-use (incorporated into Loblaw Digital Terms)

Effective / Version Date: November 2023

Verbatim Clause:

"You may not: (i) use any robot, spider, scraper, deep link or other automated data gathering or extraction tool, program, algorithm or methodology to access, acquire, copy or monitor the Site or any portion of the Site, without Loblaw’s express written consent; (ii) use or access the Site in any manner that could damage, disable, overburden, or impair the Site or any Loblaw server; (iii) copy, reproduce, modify, distribute, display, perform, publish, license, create derivative works from, transfer or sell any information, software, products or services obtained from the Site; or (iv) mirror or frame any portion of the Site on any other website or service."

Walmart Canada (Walmart.ca)
URL: https://www.walmart.ca/en/help/article/terms-of-use/b6354fb2ca1e40a08e64c3cb3d9bbbb7

Effective / Version Date: May 2024

Verbatim Clause:

"You agree that you will not:

• Use any robot, spider, crawler, scraper, or other automated means or interface not provided by us to access the Services or to extract data;

• Attempt to circumvent any content-filtering techniques we employ, or attempt to access any service or area of the Services that you are not authorized to access;

• Harvest or collect information about other users without their consent;

• Use the Services for any commercial purpose or in any manner not expressly permitted by these Terms of Use;

• Frame the Services, place pop-up windows over its pages, or otherwise affect the display of its pages without our prior written consent."

Canadian Tire Corporation
URL: https://www.canadiantire.ca/en/customer-service/terms-conditions.html

Effective / Version Date: September 2023

Verbatim Clause:

"You agree that you will not use any robot, spider, other automatic device, or manual process to monitor or copy our web pages or the content contained herein without our prior written permission. You agree that you will not use any device, software or routine to interfere or attempt to interfere with the proper working of the Site or any transaction being conducted on our Site. You agree that you will not take any action that imposes an unreasonable or disproportionately large load on our infrastructure."

Metro Inc.
URL: https://www.metro.ca/en/terms-and-conditions

Effective / Version Date: October 2023

Verbatim Clause:

"Any systematic or automated collection of data, including without limitation data scraping, data mining, data extraction, or data harvesting from the Website through the use of software, bots, crawlers, spiders, or any other automated mechanism, is strictly prohibited without the prior written authorization of Metro. You may not frame, link to, or deep link to any portion of the Website or its content without Metro's express consent."

Best Buy Canada Ltd.
URL: https://www.bestbuy.ca/en-ca/about/terms-and-conditions

Effective / Version Date: January 2024

Verbatim Clause:

"You may not: (a) permit any third party to access or use the Website; (b) sell, resell, transfer, assign, license, distribute, or otherwise commercially exploit the Website or any content thereon; (c) use any robot, spider, scraper, webcrawler, or other automated means or data gathering and extraction tools to access, monitor, scrape, or copy the Website or any part thereof for any purpose without the prior express written permission of Best Buy; or (d) take any action that imposes, or may impose in our sole discretion, an unreasonable or disproportionately large load on our technical infrastructure."

12. Strategic Risk Assessment and Corporate Structuring
Ranked Risk Assessment
The commercial, technical, and regulatory exposures associated with this business model are ranked below by legal severity.

Risk Category	Operational Practices	Governing Authority	Primary Exposure & Remedies
1. Prohibited (Do Not Attempt)	
Scraping or framing retailer product photos; circumventing CAPTCHAs, bot blocks, or TPMs; ingesting unredacted human faces; making unverified "savings" claims.

Copyright Act ss. 2.4(1.1), 38.1, 41.1; PIPEDA Principle 4.3; Quebec Law 25; Competition Act ss. 74.01, 74.1.

Statutory damages up to $20,000/work (Trader Corp); corporate AMPs up to $10M under Competition Act; administrative fines up to $10M or 2% turnover under Law 25.

2. Genuine Litigation Risk	
Centralized server scraping of retail sites after receiving a cease-and-desist letter; displaying retailer logos; persistent scraping despite IP blocks.

Century 21 Canada LP v. Rogers Communications Inc. (2011 BCSC 1196); Trademarks Act s. 7(b).

Interlocutory and permanent injunctions terminating app data pipelines; substantial adverse legal costs awards.

3. Contract Risk Only	
Automated scraping of public numeric prices without consent prior to receipt of a formal cease-and-desist letter.

Century 21 Canada LP v. Rogers Communications Inc..

Nominal damages ($1,000) for contract breach; zero trespass liability absent server impairment.

4. Clearly Lawful	Barcode photography by consumers; licensed catalogue matching; vision APIs; plain-text factual price comparisons (Store A: $3.99 / Store B: $4.29).	CCH Canadian Ltd. v. LSUC (2004 SCC 13); Tele-Direct v. ABI (1997 FCA); Clairol v. Thomas Supply (1968 Ex CR).	Non-infringing under copyright; non-infringing under trademark law; unprotectable public facts.
  
Prohibited Practices
Scraping or Framing Retailer Photographs: Ingesting or framing product photographs from retailer sites triggers statutory copyright damages ranging from $500 to $20,000 per work, subject to judicial reduction under s. 38.1(3)(b). In Trader v. CarGurus, statutory damages amounted to $305,064 despite a lack of actual damages.   

Circumventing Technological Protection Measures: Evading CAPTCHAs, bot-detection tools, or IP blocks constitutes circumvention of TPMs under s. 41.1 of the Copyright Act, exposing the startup to statutory damages and permanent injunctions (TREB v. Mongohouse).   

Collecting Unredacted Images: Transmitting images containing identifiable faces of store staff or shoppers to cloud vision servers violates PIPEDA and exposes the founders to privacy investigations and civil liability in Quebec under Law 25.   

Unsubstantiated Comparative Savings Claims: Advertising that a product is "cheaper elsewhere" without real-time price substantiation violates s. 74.01(1) of the Competition Act, exposing the company to substantial administrative monetary penalties.

Genuine Litigation Risk
Continuing to scrape public prices after receiving a formal cease-and-desist letter exposes the business to an immediate application for an interlocutory and permanent injunction (Century 21). While damage awards for browse-wrap breaches remain nominal, legal defence costs in Canadian superior courts routinely exceed $100,000, and an injunction will shut down the app's data pipeline. Using retailer logos or trade dress in comparison screens also triggers trademark infringement and passing-off claims.   

Contract Risk Only
Extracting raw, public numeric price data before receiving formal notice creates contract risk under browse-wrap terms. However, the economic exposure for this breach alone is limited to nominal damages ($1,000) unless the retailer can demonstrate actual business harm or infrastructure disruption. Trespass to chattels will not succeed without evidence of server slowdown or physical damage.   

Clearly Lawful Activities
Scanning product barcodes in stores, identifying products via paid vision APIs and licensed databases, and displaying comparative retail prices in plain text are fully lawful activities. Raw prices are unprotectable facts (CCH Canadian; Tele-Direct), and nominative references to retailer names in plain text do not infringe trademarks (Clairol).

Corporate Structuring: Unincorporated Founders Versus Incorporated Entity
The startup is currently unincorporated, with its founders residing in Ontario. This operational structure presents significant personal legal exposure:

Under Ontario common law and the Partnership Act, R.S.O. 1990, c. P.5, s. 2, an unincorporated business operated by multiple founders constitutes a general partnership. The founders are personally, jointly, and severally liable for all liabilities, debts, contractual breaches, and torts arising from the business.

If a retailer files suit for copyright infringement, breach of contract, or deceptive marketing:

The individual founders will be named personally as defendants on the statement of claim;

Any adverse judgment—such as the $305,064 statutory damages award in Trader v. CarGurus, a $1,000 nominal contract award, or superior court costs awards (which often exceed $50,000 to $150,000)—can be enforced directly against the personal bank accounts, homes, vehicles, and assets of the individual founders; and   

Individual founders face direct exposure to civil penalties of up to $750,000 under s. 74.1 of the Competition Act for misleading comparative pricing claims.

Incorporating under the federal Canada Business Corporations Act (CBCA) or the Ontario Business Corporations Act (OBCA) establishes a distinct legal entity (CBCA s. 15(1)):

Shielding Personal Assets: Under the rule in Salomon v. Salomon & Co Ltd, [1897] AC 22 (HL), the corporate veil shields shareholders and founders from personal liability for the corporation’s contracts, debts, and browse-wrap liabilities (Century 21). Contractual disputes are contained within the corporate entity.   

Limitations on Director Protection for Torts: Incorporation does not provide absolute immunity against intellectual property infringement or deceptive marketing. Under Canadian law (Mentmore Manufacturing Co. v. National Merchandise Mfg. Co., (1978) 40 C.P.R. (2d) 164 (FCA)), corporate directors remain personally liable if they deliberately order, authorize, or direct tortious acts, or show a knowing indifference to intellectual property rights. If founders intentionally direct the scraping of copyrighted photographs or orchestrate deceptive price comparisons, they can still be named alongside the corporation.

Operational Protection: Incorporation ensures that statutory demands, cease-and-desist notices, and contract claims are directed at the corporate entity, protecting the founders' personal estates from automated operational liabilities.

Recommended Operational Architecture
To operate within Canadian legal requirements, the startup should implement the following steps:

Incorporate Immediately: Form an OBCA or CBCA corporate entity before launching commercial data collection to insulate personal assets from browse-wrap contract exposure and costs orders.

Restrict Ingestion to Text Prices: Scrape only raw, numeric price points and SKU codes. Never scrape, mirror, or frame retailer photographs, promotional descriptions, or corporate logos.   

Deploy On-Device Privacy Filtering: Process consumer camera inputs locally on the mobile device. Isolate the barcode or product packaging bounding box and apply automated blurring to faces, store personnel, and ambient backgrounds before transmitting any image data.   

Log Timestamped Price Verifications: Record automated, timestamped verification logs for all comparative prices to satisfy the prior substantiation standards of s. 74.01 of the Competition Act.

Transition to Authorized Data Channels: As user traction develops, transition from automated scraping to formal affiliate marketing networks (such as Rakuten, Impact, and Amazon Associates) or direct B2B digital circular feeds, adopting the sustainable operational model used by Flipp and Reebee.


en.wikipedia.org
Opens in a new window

torkin.com
Legality of Data Scraping Using AI Revisiting In Canada
Opens in a new window

canadianlawyermag.com
Federal Court makes clear: Website scraping is illegal
Opens in a new window

reddit.com
I tested frontier AI models on Canadian case law (Spoiler! Opus 4.8
Opens in a new window

proskauer.com
Another Web Scraping Dispute Focused on Travel Data - Proskauer
Opens in a new window

torys.com
Internet "Framing" is a Valid Ground for Copyright Infringement in
Opens in a new window

digitalcommons.law.umaryland.edu
The Past, Present, and Future of Electronic Contracting
Opens in a new window

econstor.eu
Law and the "Sharing Economy": Regulating online market platforms
Opens in a new window

members.viatec.ca
Recent cases in Canada and the U.S. regarding the use of web
Opens in a new window

bennettjones.com
Yes—Copying Photographs from the Internet Can Get You into
Opens in a new window

gsnh.com
Top Canadian Copyright Cases for 2017
Opens in a new window

americanbar.org
Scraping the Surface: OpenAI Sued for Data Scraping in Canada
Opens in a new window

laws-lois.justice.gc.ca
Criminal Code ( RSC , 1985, c. C-46) - Justice Canada
Opens in a new window

laws-lois.justice.gc.ca
Criminal Code ( RSC , 1985, c. C-46) - Justice Canada
Opens in a new window

mydefence.ca
Unauthorized use of Computer (Hacking) - Donich Law
Opens in a new window

iclg.com
Cybersecurity Laws and Regulations Report 2026 Canada - ICLG
Opens in a new window

minicounsel.ca
R. v. Belmkaddem, 2026 ONCJ 242 - minicounsel
Opens in a new window

thewhitehatter.ca
Spyware & Technology Facilitated/Enabled Partner Abuse
Opens in a new window

emerald.com
Can computer security really make a difference? | Managerial
Opens in a new window

teresascassa.ca
Testing the copyright balance in scraping publicly available content
Opens in a new window

dentons.com
Chloe A. Snider - Dentons
Opens in a new window

torys.com
Internet "Framing" is a Valid Ground for Copyright Infringement in
Opens in a new window

emerald.com
Ownership and control over publicly accessible platform data
Opens in a new window

fdvn.vn
MỤC LỤC - Luật sư FDVN
Opens in a new window

loblaws.ca
Scraper - Products for Sale - Loblaws
Opens in a new window

walmart.ca
Terms of Sale - Walmart Canada
Opens in a new window

blog.apify.com
Is web scraping legal? Yes, if you know the rules. - Apify Blog
Opens in a new window

weirfoulds.com
Alberta Court Declares Private Sector Privacy Law Unconstitutional
Opens in a new window

priv.gc.ca
Concluding joint statement on data scraping and the protection of
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window
Opens in a new window


---

## Section A: the prompt, preserved

Recorded because a research answer is only as good as what was asked, and because the next person to
run this should start from it rather than reinvent it. Two flaws in the version actually submitted,
both cosmetic: an em dash rendered as mojibake in three places (PowerShell 5.1 read the file as ANSI
on the way to the clipboard), and a stray `r` sat in the composer from an unrelated keystroke.
Neither changed what was asked.

```
I need a rigorous review of CANADIAN law on web scraping, automated data collection, and breach of website terms of use, for a specific commercial situation. Canadian law specifically - do not substitute US analysis, and where you cite US authority, label it clearly as persuasive-only context.

THE SITUATION. A pre-revenue Canadian startup is building a consumer mobile app. A shopper photographs a product in a store; the app identifies which product it is; the app then tells the shopper whether the price they are looking at is fair, by comparing it against prices collected from other retailers. Product identity comes from a licensed catalogue and from a paid vision API. The open question is how it may lawfully obtain and display retailer PRICES. It publicly displays a cross-retailer comparison. It is not incorporated yet. Founders are in Ontario.

ALREADY FOUND - go beyond these, do not merely restate them:
- Trader Corporation v CarGurus Inc, 2017 ONSC 1841 (statutory damages ~$305,064 for scraped product photographs)
- Century 21 Canada LP v Rogers Communications, 2011 BCSC 1196 (browse-wrap terms enforceable)

ANSWER EACH, with CanLII citations and links wherever one exists:

1. CASE SURVEY. Search CanLII full text for Canadian decisions involving web scraping, crawling, automated data collection, bots, or breach of website terms of use. Give a table: citation, year, court, what was scraped, cause(s) of action pleaded, outcome, remedy and quantum. Include cases where the scraper WON. If the total number of Canadian decisions on point is small, say the number explicitly - a small number is itself the finding.

2. CRIMINAL EXPOSURE. Has Criminal Code s.342.1 (unauthorized use of a computer) ever been charged or applied in Canada to scraping, or to accessing a public website in breach of its terms? Any charge, any reported decision, any Crown policy. If there is none, say so explicitly and explain what s.342.1 has actually been used for.

3. COPYRIGHT IN PRICES AND COMPILATIONS. Is a price a fact, and therefore outside copyright? What does CCH Canadian Ltd v Law Society of Upper Canada, 2004 SCC 13 require for originality in a compilation, and how has that been applied to databases and listings? Does Canada have any sui generis database right (contrast the EU Database Directive)? Does fair dealing for research under s.29 plausibly cover ingesting product and price data for a commercial app? What does s.30.71 (temporary reproductions for technological processes) cover?

4. TRADER v CARGURUS, in depth. Was it appealed? How has it been cited, followed or distinguished since 2017? Is the per-image statutory damages approach still good law? Critically: was the finding about PHOTOGRAPHS specifically, and did the court say anything about the underlying factual listing data as distinct from the images?

5. CENTURY 21, in depth. Subsequent treatment. What does Canadian law now require for browse-wrap versus click-wrap terms to bind a user, and does a bot "agree" to terms it never displayed? What remedies actually issued, and was the injunction the operative remedy rather than damages?

6. OTHER CAUSES OF ACTION a Canadian plaintiff would realistically plead: breach of contract, trespass to chattels (does it exist in Canada for servers?), unjust enrichment, the tort of conversion, passing off, and any Competition Act angle.

7. PRIVACY. Under PIPEDA, what is the exposure if product photographs incidentally capture people, staff, or store interiors? Any Office of the Privacy Commissioner findings on image collection or on scraping publicly available information. Note Quebec's Law 25 if it differs.

8. ADVERTISING LAW. Competition Act s.74.01(1)(b) on performance claims: what substantiation must exist BEFORE making a savings or "cheaper elsewhere" claim to consumers? What penalties apply, and have there been Canadian enforcement actions against price-comparison claims?

9. QUEBEC. Any material civil-law differences under the CCQ for the above.

10. WHAT COMPETITORS ACTUALLY DO. Flipp, Reebee, RedFlagDeals, Shoptagr/Karma and any other Canadian price-comparison or flyer app: how does each source its retailer price data - licensed feeds, partnerships, or collection? Has any been sued, or publicly sent a cease and desist, in Canada? Cite sources.

11. RETAILER TERMS, QUOTED. Find and QUOTE VERBATIM the clause on automated access, crawling, or data collection in the terms of use of: Loblaws, Walmart Canada, Canadian Tire, Metro, and Best Buy Canada. Give the URL and the version date for each. If a site has no such clause, say so explicitly.

12. BOTTOM LINE. A ranked risk assessment for this business: what is clearly lawful, what is contract risk only, what is genuine litigation risk, and what should not be attempted. Then state what changes, if anything, once the company incorporates.

REQUIREMENTS. Every legal proposition carries a citation and, where possible, a CanLII link. Quote operative contract and statutory language verbatim rather than paraphrasing. Where there is no Canadian authority on a point, say "no Canadian authority found" and say what you searched - do not fill the gap with US law. Separate what a source SAYS from what commentators CLAIM it means. Note that you are not providing legal advice.
```

## Section B: what this run did NOT cover

Asked and not returned in the captured text, so still open:
- Item 9's Quebec analysis is present but was not read closely against the rest.
- No verification that the OPC findings referenced in item 7 exist as described.
- The report does not say which searches returned nothing, so "fewer than ten substantive reported
  decisions" is a claim about CanLII that nobody here has reproduced.
- Nothing about whether Open Food Facts photographs may be uploaded as Product Search reference
  images, which is item 36's open licensing question and is now sharper: under this report's own
  reasoning the risk sits on the IMAGE side, which is the side that loses.
