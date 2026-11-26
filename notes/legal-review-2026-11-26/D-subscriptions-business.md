# Legal review D: subscriptions, app stores and the business (2026-11-26)

Not legal or tax advice. This is a fact-and-requirement table for a lawyer or accountant to check. Code read on 2026-11-25 in C:\shin. No code was changed.

## How to read the source labels

- FETCHED: the page was retrieved and read this session (a small model summarised the page; wording in quotes is what that summary returned, so check the quote against the page before relying on it).
- SEARCH: only a search snippet or a law-firm article was available. Not a primary source.
- BLOCKED: the primary site returned 403/404 to this tool (ontario.ca e-Laws, legisquebec.gouv.qc.ca, leginfo.legislature.ca.gov, canada.ca guide URL). The statute text for those rows is from the reviewer's memory plus search headings and is UNVERIFIED. The lawyer should read the section itself.

## Part 1. Facts from the code

Pexi Plus: CA$3.99 a month, CA$29.99 a year (docs/store/listing.md:49; app/public/js/legal/document.js:219; plus-config.js:70 `PLAN_CENTS`, a fallback only).

| Topic | What Pexi shows or says | Where |
|---|---|---|
| Price on the paywall | The store's own `priceString` from RevenueCat, never typed in the app; the plan row shows "{price} a month" or "{price} a year", yearly also a per-month equivalent | plus-config.js:8-12; paywall.js:138-145; ui-strings.js:107-108 |
| Period | Store's period, else month/year by plan id | paywall.js:142 |
| Auto-renewal | Fine print above the Subscribe button: "Payment is charged to your Apple ID at confirmation. The subscription renews automatically unless you cancel at least 24 hours before the end of the current period. Manage or cancel it in your Apple ID settings." Google variant says Google Play account and Google Play subscriptions. French twin exists | paywall.js:249; ui-strings.js:113-114 (EN), 954-955 (FR) |
| How to cancel | The same fine print; a "Cancel anytime" step ("In your {store}, at least 24 hours before it renews"); a You-screen row "Manage or cancel subscription" opening Apple or Google's subscription page. The row is drawn only on iOS and Android, not the web | ui-strings.js:137-138, 151; plus-config.js:92-95; you.js:65, 181, 372-373 |
| Free trial | None promised in code. A "N days free" tab and "No payment due now" line draw only if the store reports a trial for the account. Go-live plan says no trial (Quebec notice reason), but whether App Store Connect and Play have one is a store setting, not in code | paywall.js:132-147, 251; docs/paywall-go-live-2026-11-17.md Stage 3 item 1 |
| Restore purchases | A "Restore purchases" button in every plan state, with a "none found" and a "failed" message; also explained in Terms | paywall.js:205-210, 427-440; ui-strings.js:110, 128; document.js:224 |
| Terms and Privacy links | On the paywall, English or French by locale | paywall.js:302-303, 358-359; plus-config.js:48-58 |
| Free users | 10 barcode scans a week; typed searches free and uncounted. Plus 100 a week, "not unlimited". Server enforces; copy is test-checked | plus-config.js:25-32; ui-strings.js:134-136; document.js:216 |
| Seller line | "Sold by Jamin Xu (Pexi). Contact: usepexiapp@gmail.com. Refunds are handled by Apple." (Google: "by Google Play"; web: "by the store you bought from"). No postal address, no phone | ui-strings.js:115-118, 956-958; paywall.js:250 |
| Refund wording | Same: refunds handled by the store. Terms repeat it | document.js:223 |
| Terms: governing law | Ontario and applicable federal law, no conflict-of-laws rules, "does not take away the protection that the law of the place where you live gives you as a consumer" | document.js:259-264 |
| Terms: liability | "To the fullest extent the law where you live allows, Jamin Xu is not liable for any loss arising from your use of Pexi or your reliance on any price..." with a carve-out for what the law does not allow and a Quebec carve-out | document.js:244-249 |
| Terms: warranty | "As is" and "as available", "to the extent the law allows" | document.js:237-242 |
| Terms: disputes | No arbitration clause, no class-action waiver, no forum clause, no limitation period. Silence on disputes | document.js:199-270 (read through; none present) |
| Terms: changes to Plus | 30 days in-app notice before a price or feature change, cancel free; separate Quebec text (written notice, old and new clause shown, cancel up to 30 days after) | document.js:251-257 |
| Terms: minors | Under age of majority: use with a parent, who accepts the terms; purchase is via the device's Apple ID or Google account | document.js:75 |
| Publisher identity | "Pexi is published by Jamin Xu, an individual developer." Privacy officer is Jamin Xu | document.js:45-49 |
| Support contact | usepexiapp@gmail.com; a support page on GitHub Pages | document.js:26; listing.md:86, 181 |
| Seller name in the stores | Apple listing copyright "2026 Jamin Xu" (listing.md:84). The developer name the stores display comes from the developer account, which is outside the code and was not seen | outside code |
| Tax, business, registration | No GST/HST number, business name or registration anywhere in code or the store listing. Repo notes list them as open before real money: GST/HST and Form GST506 (launch-gaps-2026-11-06.md:367), Small Business Program unrecorded (:368), Ontario business name (:400); paywall-go-live-2026-11-17.md Stage 3 item 3 | docs |
| Terms redraft | Terms s.11/s.12 redraft in English and French "before real money" is still listed as open | paywall-go-live-2026-11-17.md Stage 3 item 3 |

One fact the lawyer needs: repo notes speak of "both founders" (Jamin and Aurik; listing.md:130 says Aurik owns the age-rating answers with Jamin as account holder). The brief says one individual and no company. If two people share profit from Pexi, that is a different legal shape (see Part 2.G).

Stale item: comms/messages/2026-11-17-aurik-to-jamin-paywall-go-live.md and docs/paywall-go-live-2026-11-17.md quote the support address as useshinapp@gmail.com; the shipped strings say usepexiapp@gmail.com (the app's own address, correct).

## Part 2. Requirements from sources

### A. Google Play

- Payments policy, https://support.google.com/googleplay/android-developer/answer/9858738 (FETCHED). Section 2: apps that accept payment for in-app features must use Play Billing (subscriptions named). Section 6: developers must "clearly and accurately inform users about the terms and pricing" of in-app features or subscriptions; in-app pricing must match the Play billing interface.
- Subscriptions policy, https://support.google.com/googleplay/android-developer/answer/9900533 (FETCHED): be transparent about the offer; disclose "the frequency of your billing cycle, the automatic renewal terms"; for trials "let your users know how and when a free trial will convert to a paid subscription"; include in the app "an easy-to-use, online method to cancel the subscription"; a missing or hidden dismiss button is a listed violation example.

### B. Apple

- App Store Review Guidelines, https://developer.apple.com/app-store/review/guidelines/ (FETCHED, quotes as returned). 3.1.1: use in-app purchase to unlock features; "make sure you have a restore mechanism for any restorable in-app purchases". 3.1.2(a): subscriptions need ongoing value, at least seven days, work on all the user's devices; no scam or bait-and-switch. 3.1.2(c): "clearly describe what the user will get for the price" and "clearly communicate the requirements described in Schedule 2 of the Apple Developer Program License Agreement".
- Apple Developer Program License Agreement, Schedule 2, https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ (FETCHED, offset 480000, section numbers from the summary): 3.8(b) "clearly and conspicuously disclose" title, length and price of the subscription (and price per unit if appropriate), with "Links to Your Privacy Policy and Terms of Use ... accessible within Your Licensed Application"; 3.9 price increases need acceptance in regions that require consent or auto-renewal is disabled; 3.10 promotion must follow all legal and regulatory requirements; 6.3 Apple may refund and the developer reimburses; 3.2 tax collection responsibility set by Exhibit B (not read); 3.3 tax documents under Exhibit C or Apple may hold amounts in trust; 3.2 "You are solely responsible for ... tax categorization" and indemnifies Apple against tax-authority claims. The summary found no cancellation-disclosure wording in 3.8, though the Terms and paywall carry it anyway.

### C. Ontario Consumer Protection Act, 2002 (CPA 2002)

BLOCKED: https://www.ontario.ca/laws/statute/02c30 returned 403 and its text was not read. Search confirmed headings only: Part IV "Internet Agreements": s.37 Application, s.38 Disclosure of information, s.39 Copy of internet agreement, s.40 Cancellation of internet agreement; s.7 "No waiver of substantive and procedural rights". From memory, UNVERIFIED:
- s.38: before the consumer enters an internet agreement the supplier must disclose prescribed information (supplier name and trading name, address, contact, description, itemised price, total, currency, payment terms, cancellation and refund policy) in a way the consumer can access and keep, and give an express opportunity to accept or decline and to correct errors. O. Reg. 17/05 sets the detail and a dollar threshold. Pexi's seller line has no postal address.
- s.39 and s.40: a copy of the agreement within 7 days; if the disclosure or copy is missing the consumer may cancel within a stated window (reviewer recalls 7 days after receiving the copy, up to one year if none) and get a refund.
- s.7: waiver of CPA rights, and (as recalled) any term sending disputes to arbitration or barring class proceedings, is invalid. Pexi has no such term.
- Consumer Protection Act, 2023 (S.O. 2023 c.23 Sch.1, Bill 142, Royal Assent 6 Dec 2023), https://www.ontario.ca/laws/statute/23c23 (SEARCH, page not read): in force "on a day to be named by proclamation". Search found no proclamation as of the newest sources (a July 2026 vendor blog and a 2025 Fasken note), so the 2002 Act governs today. The government said the 2023 Act will make subscription cancellation easier and limit one-sided amendments and renewals without express consent, with detail left to regulations. The lawyer should confirm the proclamation status on e-Laws on the day of review.
- Whether Apple or Google, rather than Pexi, counts as the "supplier" for the disclosure in a store checkout is a question for the lawyer. Pexi's seller line calls Pexi the seller.

### D. Quebec

BLOCKED: https://www.legisquebec.gouv.qc.ca/en/document/cs/P-40.1 returned 403. SEARCH (OPC pages, https://www.opc.gouv.qc.ca/en/consumer/good-service/telephone-television-internet/internet-access/amending-renewing and the legisquebec search snippet):
- s.11.2: a clause must name which elements may be amended; written notice at least 30 days before the change, showing the new and old clause; the consumer may refuse and cancel without charge within 30 days after it takes effect. Pexi's Terms s.12 text follows this (document.js:251-257).
- s.214.3 and 214.4 (per search snippet, applicability to a consumer app not established): a stipulation renewing a contract of more than 60 days for another fixed term is prohibited unless the renewal is for an indeterminate term; the merchant must send a written reminder between the 90th and 60th day before expiry. The yearly Pexi Plus plan is a 12-month term that auto-renews for another 12 months. Whether this section reaches the yearly plan, and whether Apple and Google's own notices satisfy it, is the single most important Quebec question for the lawyer. Pexi has no email address for a customer, so it cannot send its own reminder.
- Consumer contracts in French: Charter of the French Language (reviewer's memory, UNVERIFIED). The code links French Terms and Privacy (plus-config.js:54-58) and a French paywall exists.

### E. United States (only if Plus is sold in US storefronts; territory setting is outside code)

- FTC Negative Option Rule ("click-to-cancel"): vacated by the Eighth Circuit on 8 July 2025 on procedural grounds; the FTC issued an ANPRM on 11 March 2026 to restart; no proposed rule found. ROSCA (15 U.S.C. 8401 et seq.) is operative and the FTC enforces it. SEARCH only: https://gibsondunn.com/ftc-restarts-negative-option-rulemaking-after-eighth-circuit-vacatur-enforcement-under-rosca-continues/ , https://www.jonesday.com/en/insights/2026/05/ftc-revives-clicktocancel-rule-new-risks-for-subscription-businesses . Primary (ftc.gov, Federal Register) not fetched.
- California Automatic Renewal Law, Bus. & Prof. Code 17600 et seq., https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17602 (BLOCKED, 403). From memory, UNVERIFIED: clear and conspicuous terms near the consent request, affirmative consent, an acknowledgment with cancellation information the consumer can keep, online cancellation, and, from the 2025 amendments (AB 2863, reviewer recalls 1 July 2025), changes on consent records, reminders and price-change notices. The lawyer should confirm what applies to a store-processed subscription from a Canadian publisher.

### F. Sales tax

- Apple, Canada, https://developer.apple.com/help/app-store-connect/provide-tax-information/provide-canada-tax-information (FETCHED): developers based in Canada "are required to submit your Canadian ... GST/HST number (and QST number if based in Quebec)"; remittances are reduced by GST/HST and QST/PST on Apple's commission ("a tax paid by you", credit "may be available"); Apple issues a monthly tax-on-commission invoice; the page populates "part D of GST/HST Form 506". The page does NOT say who collects GST/HST on the customer's price. A developer forum post (SEARCH, not Apple's text) quotes the Developer Agreement as letting a GST/HST-registered developer elect (Form GST506, Excise Tax Act s.177(1.1)) to have Apple Canada collect, account for and remit on sales to Canadian end users. The lawyer or accountant must read Schedule 2 Exhibit B and the Canada exhibit.
- Google, https://support.google.com/googleplay/android-developer/answer/138000 (SEARCH snippet): for a developer in Canada without a GST/HST ID, or outside Canada, Google determines, charges and remits GST/HST; where a Canadian developer supplies a GST/HST ID the developer takes on that responsibility; Google handles BC PST, Manitoba RST and Saskatchewan PST; QST follows the same ID split. Google also charges GST/HST on its service fee to Canadian developers not registered under the standard regime.
- US state sales tax: Google says that where it is seller of record sales tax may apply by state (https://support.google.com/googleplay/answer/2850368). The words "marketplace facilitator" did not appear in anything fetched, and nothing fetched states that Apple remits US state tax on the developer's behalf. UNVERIFIED for both stores.
- Small-supplier rule (SEARCH of CRA pages, RC4022 https://www.canada.ca/content/dam/cra-arc/formspubs/pub/rc4022/rc4022-24e.pdf , not opened): a sole proprietor is a small supplier while worldwide taxable revenue is $30,000 or less in a single quarter and over the last four consecutive quarters; past that, register within 29 days of the supply that crosses the line, and GST/HST applies to the crossing sale. Whether Apple's "required to submit a GST/HST number" means a small supplier must register voluntarily is not answered by anything fetched. Also note revenue in this test is the developer's receipts before Apple's cut or after, a point for the accountant.
- Price display: whether the store `priceString` shown on the paywall includes or excludes tax in Canada was not established.

### G. Income tax, business name, liability (general knowledge, NOT fetched; the Ontario Business Names Act page returned 403)

- Income: self-employment income is reported on the sole proprietor's T1 with Form T2125. Balance due 30 April; filing deadline 15 June for the self-employed (the repo's own dates file, docs/readiness/pexi-dates.ics, uses 2027-04-30 and 2027-06-15). CPP is owed on self-employment income, and instalments can be required. Accountant to confirm.
- Business Names Act (Ontario): reviewer recalls that an individual who carries on business under a name other than his own legal name must register it, term five years, with a fine for not doing so and a bar on suing on contracts until registered; fee recalled as about $60. A registration does not give trademark rights. Trading name "Pexi" differs from "Jamin Xu", and the seller line, the Terms and the listing all use "Jamin Xu (Pexi)". The PEXI trademark filing is a separate open item (launch-gaps:400).
- Sole proprietor versus corporation: a sole proprietor and the business are one legal person, so all business debts, refunds owed to Apple, consumer claims and tax liabilities reach personal assets. A corporation is a separate person and shareholders are generally not liable beyond what they invested, but directors can still be personally liable for unremitted GST/HST and payroll deductions and for their own wrongdoing, and the developer accounts and any trademark filing would need to be moved to the company. Cost and timing of incorporating is for a lawyer and accountant.
- Two founders: if Jamin and Aurik carry on Pexi together with a view to profit, Ontario partnership law (Partnerships Act) can treat it as a general partnership whether or not anyone wrote an agreement, with each partner liable for the other's business acts. Not verified; flagged because the repo contradicts "one individual".

## Part 3. Gap table

| # | Requirement (source) | What Pexi does | Gap or OK | Named cost if wrong | Smallest fix |
|---|---|---|---|---|---|
| 1 | Play: disclose price, billing frequency, auto-renewal (Subscriptions policy) | Store price and period in plan rows; renewal text above Subscribe (paywall.js:143, 249) | OK | Play policy strike, app removal | None |
| 2 | Play: easy in-app way to cancel | "Manage or cancel subscription" row and fine print (you.js:372-373; ui-strings.js:114) | OK on Android. Row hidden on web (you.js comment D29) | Same | None; web has no purchase flow |
| 3 | Apple 3.1.2(c) and Schedule 2 3.8(b): title, length, price; Terms and Privacy links in app | Plan title, price, period; both links on the paywall (paywall.js:302-303, 358-359) | OK. Real iPhone paywall not seen by this review | Apple rejection, removal | None |
| 4 | Apple 3.1.1: restore mechanism | Restore button in all plan states (paywall.js:210) | OK | Rejection | None |
| 5 | Apple/Google: trial terms disclosed if a trial exists | Trial copy draws only if the store reports one; go-live plan says no trial (paywall.js:147, 251) | Outside code: whether a trial exists in either store was not seen | Quebec notice duty, ROSCA/ARL claims, rejection | Confirm both store consoles show no trial |
| 6 | CPA 2002 s.38 (BLOCKED, memory): supplier identity incl. address and contact before an internet agreement | Name, trading name and email only (ui-strings.js:115) | Likely GAP: no postal address, no phone. Lawyer to confirm what s.38 and O. Reg. 17/05 require and whether Apple or Google is the supplier | Consumer cancel and refund right, regulatory fine | Lawyer decides; likely add an address or a stated mail drop to the seller line and Terms |
| 7 | CPA 2002 s.7: no arbitration or class waiver (memory) | No such clause (document.js) | OK | A void term is unenforceable | None. Do not add one |
| 8 | Consumer cannot be stripped of statutory warranties (CPA s.7, Quebec) | "As is" and liability clauses with "to the extent the law allows" and a Quebec carve-out (document.js:237-249) | OK as drafted; lawyer to confirm wording | Clause held void | None |
| 9 | CPA 2023: in force by proclamation, adds subscription cancel and renewal limits | Not in force per search; nothing built for it | Unknown; check proclamation on review day | Fines once in force | Lawyer confirms status; the cancel path already exists |
| 10 | Quebec CPA s.214.3/214.4 (SEARCH): fixed-term renewals over 60 days | Yearly plan renews yearly; no Pexi-sent reminder (paywall.js:249) | Possible GAP, applicability unverified | Quebec penalties and consumer refund or voiding of the renewal clause (named costs per the Quebec Act, amounts not checked) | Lawyer rules; fallback is to withhold the yearly plan from Quebec storefronts or rely on store notices |
| 11 | Quebec CPA s.11.2: amendment clause and 30-day written notice | Terms s.12 matches in text (document.js:251-257) | OK in text; Pexi has no channel for a written notice beyond in-app | Amendment unenforceable against the consumer | Confirm in-app notice counts as written notice |
| 12 | Quebec: contract in French | French Terms, Privacy and paywall exist (plus-config.js:54-58; ui-strings.js:954-958). Terms s.11/s.12 redraft still open | Partial GAP: redraft pending | Consumer can seek nullity or reduction; OPC action | Finish the redraft in EN and FR |
| 13 | Apple Schedule 2 3.9: price rises need consent | Terms promise 30 days in-app notice (document.js:251) | OK in text; process not built | Auto-renew switched off by Apple, lost subscribers | Raise price only through App Store Connect's flow |
| 14 | FTC ROSCA; California ARL (memory) if sold in the US | Disclosure near the Subscribe button is in place; no Pexi-held email for acknowledgments; US territory setting unseen | Outside code and unverified | FTC or state AG penalties (California per-violation civil penalty recalled, not checked) | Confirm which storefronts sell Plus; lawyer confirms store receipts and in-app text meet the acknowledgment duty |
| 15 | Refund wording | "Refunds are handled by Apple/Google" (ui-strings.js:115-118; document.js:223) | OK as a plain limit. A lawyer should confirm it does not read as a waiver of statutory refund rights | Void term, misleading-practice claim | Add "your statutory rights are not affected" if the lawyer wants |
| 16 | GST/HST: register once over $30,000 and account (CRA RC4022, SEARCH); Apple asks Canadian developers for a GST/HST number and Form GST506 (Apple help, FETCHED) | Nothing in code; repo lists it as unseen (launch-gaps:367) | GAP, decision open: who collects on Canadian sales (Apple, Google or Pexi) depends on registration status and the GST506 election | Tax owed from own pocket plus penalties and interest; Apple may hold payouts until tax documents are in (Schedule 2 3.3) | Accountant decides registration and the election before the first real payout |
| 17 | Apple tax on commission invoice and ITC claims | Not set up | GAP for the accountant | Lost input tax credit; tax paid twice | Accountant sets up the monthly invoice workflow |
| 18 | US state sales tax: who remits | Not stated in anything fetched | Unverified | State tax and penalties if Pexi is the seller of record in any state | Accountant confirms Apple and Google are seller of record for US IAP |
| 19 | Apple Small Business Program (15% instead of 30%) | Enrolment unrecorded (launch-gaps:368; needs-jamin.md:88) | Money gap, not a law gap | 15 points of revenue on every sale | Enrol before first sale |
| 20 | Ontario Business Names Act: register a trading name that is not the owner's own name (memory, BLOCKED) | Seller line and listing say "Jamin Xu (Pexi)"; no registration recorded (launch-gaps:400) | GAP, likely required | Fine; unable to enforce contracts in court until registered | File the registration for Pexi; five-year term |
| 21 | Income tax: T1 and T2125, 30 April and 15 June (memory) | Dates in docs/readiness/pexi-dates.ics | Outside code; accountant to confirm | Penalties and interest | Accountant; separate business bank account |
| 22 | Unlimited personal liability of a sole proprietor; two founders | Terms name "Jamin Xu, an individual developer" (document.js:45). Repo mentions two founders | GAP to decide: liability exposure and possible partnership | Personal assets exposed to refund reimbursement (Schedule 2 6.3), consumer claims, privacy claims | Lawyer: incorporate now or before launch growth; write down the founder arrangement |
| 23 | Terms dispute terms | None; Ontario law and consumer carve-out only (document.js:259-264) | OK for consumer protection; no forum or limitation clause | A foreign court's jurisdiction if a US consumer sues | Lawyer decides whether to add a forum clause that does not touch consumers |
| 24 | Store seller name consistent | Listing copyright "Jamin Xu"; stores' displayed developer name not seen | Outside code | Mismatch with seller line, confusion in disputes | Screenshot the live Apple and Play developer names and compare |
| 25 | Payments, Apple/Google accounts hold the money | Paid Apps agreement shown Active (needs-jamin.md:88) | OK per repo note, not seen | Payout holds | None |

## Top five by named cost

1. GST/HST and Apple's tax paperwork (rows 16 to 18).
2. Quebec yearly auto-renewal and French contract (rows 10 to 12).
3. Business name and who the business actually is (rows 20, 22).
4. Ontario internet-agreement disclosure of seller address and contact (row 6), plus the Terms redraft (row 12).
5. US auto-renewal law exposure if Plus is sold in US storefronts (row 14), and the 15 percent Apple fee if Small Business enrolment is missed (row 19).

## What the lawyer or accountant should open first

Ontario CPA 2002 Part IV and O. Reg. 17/05; Quebec CPA ss.11.2, 214.3, 214.4 and the Charter of the French Language; Apple Schedule 2 Exhibits B and C and the Canada exhibit; Google answer 138000; CRA RC4022; Ontario Business Names Act; California B&P 17600-17606.
