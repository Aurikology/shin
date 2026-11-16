# Pexi legal research: L2 (children and privacy), L4 (consumer and advertising law), L5 (trademark, data licence, business registration, tax)

Date: 2026-11-16. Prepared by a research worker for the founder's lawyer.

**This is research for a lawyer, not legal advice.** Every fact below carries its source URL and a short verbatim quote. Anything I could not source is labelled "unconfirmed". Quotes are from the primary source (statute, regulator, Apple, Anthropic, CIPO, opendatacommons.org, CRA) unless a line says "secondary". Statutory text for Quebec and Canada was read from the consolidated PDFs "updated to October 15, 2026" and, for Law 25, the Gazette officielle text. Nothing here was sent to anyone, no form was submitted, and no repo file was committed.

## What Pexi is (the facts every answer assumes)

An iOS app: scan a grocery barcode, learn whether a price is fair. Canada only. Store rating 4+, not in the Kids Category. Pexi Plus is CA$3.99 a month or CA$29.99 a year through Apple in-app purchase, with RevenueCat for entitlements. It keeps a random device id, IP addresses in a server access log, scans and typed prices, and optional rough location (off by default). With consent, it sends a product's name, brand, size, category and country to Anthropic's Claude API for a price estimate. The server is a Mac in Ontario behind Cloudflare. Product data comes from Open Food Facts (ODbL), other Open Facts projects, Open Prices, OSM, Icecat, USDA, BC Liquor Distribution Branch and retailer prices. The app is published under an individual's name (not a company) and the Terms say Pexi is for all ages. The privacy page names the publisher as the person in charge of personal information. Source files read: `docs/store/terms.html`, `docs/store/privacy.html`, `docs/store/quebec-transfer-note.md`, `app/src/attribution.ts`, `docs/launch-gaps-2026-11-06.md`, and the L2, L4, L5 sections of `docs/security-legal-check-plan-2026-11-16.md`.

## Summary of status

| Question | Answered from primary sources | Unconfirmed parts |
|---|---|---|
| L2(1) Apple Kids Category, age rating, alcohol | Yes | what "infrequent" and "frequent" mean for alcohol references; whether the new "Shared Location" descriptor is a "No" for Pexi |
| L2(2) Quebec private-sector Act (Law 25) | Yes | whether it reaches an Ontario publisher; the CAI's reading of "clearly for the minor's benefit"; register retention period |
| L2(3) PIPEDA, OPC, breach reporting | Yes | legal force of the new Children's Privacy Code |
| L2(4) Anthropic minors | Yes | whether Pexi's use counts as minors "interacting directly" with the model |
| L2(5) Minors, Ask to Buy, Family Sharing | Partly | how Ask to Buy and Family Sharing treat subscriptions specifically |
| L4(1) Competition Act s.74.01 | Yes | how the Bureau or a court treats a price verdict backed by crowd and model estimates |
| L4(2) Quebec CPA | Yes | who is the "merchant" for an in-app purchase; in-force dates of the 2026 amendments from an official source |
| L4(3) Charter of the French language | Yes | whether the store listing has French metadata; whether Apple's terms count as a Pexi contract |
| L5(1) CIPO search | Yes (Canadian register, current to 2026-11-11) | common-law use, US/EU, App Store names, likelihood of confusion |
| L5(2) ODbL | Yes | whether the merged catalogue is a Derivative Database; whether a request-only offer satisfies s.4.6; whether images are shown |
| L5(3) Ontario business name | Yes | fee and renewal period |
| L5(4) GST/HST | Yes for Apple's contract terms | small-supplier rules applied to this developer; reporting duties after Apple remits |

---

# L2. Children, age rating and privacy

## L2(1) Apple: Kids Category, age rating questions, alcohol references

**Answer.** Pexi is not in the Kids Category and does not need to be: that category is opt-in ("Made for Kids") and carries strict limits on third parties. Pexi must answer the age rating questionnaire honestly, must not use child-directed words in its listing, and must declare the new rating descriptors by January 12, 2027. A liquor price listing is a reference to alcohol, not a depiction of consumption, so the likely answer on the questionnaire is "None" (Pexi's current setting), but Apple does not define "infrequent" or "frequent", so that is a judgement, not a confirmed answer.

**Sources and quotes.**
- Guidelines, https://developer.apple.com/app-store/review/guidelines/
  - 1.3: "The Kids Category is a great way for people to easily find apps that are designed for children." Kids Category apps "may not send personally identifiable information or device information to third parties" and "should not include third-party analytics or third-party advertising".
  - 2.3.6: "Answer the age rating questions in App Store Connect honestly so that your app aligns properly with parental controls. If your app is mis-rated, customers might be surprised by what they get, or it could trigger an inquiry from government regulators."
  - 2.3.8: "Use of terms like 'For Kids' and 'For Children' in app metadata is reserved in the App Store for the Kids Category."
  - 5.1.4: "Apps not in the Kids Category cannot include any terms in app name, subtitle, icon, screenshots or description that imply the main audience for the app is children." Also: "apps in the Kids Category or those that collect, transmit, or have the capability to share personal information (such as name, address, email, location, photos, videos, drawings, the ability to chat, other personal data, or persistent identifiers used in combination with any of the above) from a minor must include a privacy policy and must comply with all applicable children's privacy statutes." And: "the parental gate requirement for the Kid's Category is generally not the same as securing parental consent to collect personal data under these privacy statutes."
  - 1.4.3: "Apps that encourage consumption of tobacco and vape products, illegal drugs, or excessive amounts of alcohol are not permitted. Apps that encourage minors to consume any of these substances will be rejected."
- Set an app age rating, https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
  - "If your calculated rating is 4+ or 9+ and you want your app to also display in the Kids category... choose Made for Kids", otherwise "choose Not Applicable".
  - "If your app has a EULA with minimum age requirements that exceed the rating that Apple calculated, you must override to a rating that adheres to the requirements."
- Age rating values, https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
  - "Alcohol, Tobacco, or Drug Use or References: References to or depictions of the consumption of alcohol, tobacco products, or other licit or illicit substances. May include: drunken behavior, cigarette smoking, or the taking of illegal drugs." The 13+ tier reads "Infrequent alcohol, tobacco, or drug use or references" and the 18+ tier "Frequent...". The page does not define "infrequent" or "frequent". Unconfirmed for a catalogue of 7,555 BC liquor products.
- Apple news, July 24, 2025, https://developer.apple.com/news/?id=ks775ehf: ratings 13+, 16+ and 18+ were added to 4+ and 9+; the answer deadline was January 31, 2026.
- Apple news, November 2, 2026, https://developer.apple.com/news/?id=yxkh08us: new descriptors take effect November 16, 2026 and apps must declare them by January 12, 2027. "Shared Location: Sharing of real-world location with another person or group." Pexi's optional rough location is not shared with another person, so "No" is likely, but that is unconfirmed until checked in App Store Connect.
- Age assurance, https://developer.apple.com/support/age-assurance/: "In certain regions, where legally required..." and "For questions about your compliance obligations, consult your legal counsel." Apple names no Canadian requirement in the text read.

**What Pexi must do.**
- Keep the app out of the Kids Category; choose "Not Applicable" for Made for Kids.
- Keep child-directed wording out of the name, subtitle, icon, screenshots and description.
- Re-answer the rating questionnaire (including the new descriptors) in App Store Connect before January 12, 2027, and check what rating Apple calculates with alcohol set to "None".
- Make sure the Terms' minimum age does not exceed the calculated rating (Apple will force an override if it does). Current Terms say all ages, which fits 4+.

**Question for the lawyer.** Is "None" a defensible answer for alcohol references when the catalogue lists liquor products and prices, given Apple does not define "infrequent"? (This is an App Review risk more than a legal one.)

## L2(2) Quebec private-sector privacy Act (Law 25): minors under 14, privacy officer, PIA before transfer outside Quebec, incident reporting

**Answer.** Law 25 amended the Act respecting the protection of personal information in the private sector (CQLR c. P-39.1). It requires a parent's consent to collect a minor under 14's information unless it is clearly for the minor's benefit, a published privacy officer, published governance practices, a written privacy impact assessment before sending personal information outside Quebec (plus a written agreement), and a register and notices for confidentiality incidents. Pexi's privacy page already names a person in charge; the transfer assessment and the minor-consent approach are the open items. Whether the Act reaches an Ontario publisher who serves Quebec users is a lawyer question.

**Sources and quotes.**
- Consolidated Act (updated to October 15, 2026), https://www.legisquebec.gouv.qc.ca/en/pdf/cs/P-39.1%20.pdf; Law 25 text, https://www.publicationsduquebec.gouv.qc.ca/fileadmin/gazette/pdf_encrypte/gaz_entiere/2202-A.pdf (the HTML pages on legisquebec returned 403 to automated fetch; the PDF worked).
- s.4.1: "The personal information concerning a minor under 14 years of age may not be collected from him without the consent of the person having parental authority or of the tutor, unless collecting the information is clearly for the minor's benefit."
- s.14: "The consent of a minor under 14 years of age is given by the person having parental authority or by the tutor. The consent of a minor 14 years of age or over is given by the minor, by the person having parental authority or by the tutor." Consent must be "clear, free and informed and be given for specific purposes" and asked for separately from other information if in writing.
- s.3.1: "Any person carrying on an enterprise is responsible for protecting the personal information held by the person." The person with the highest authority is the person in charge, and "The title and contact information of the person in charge of the protection of personal information must be published on the enterprise's website".
- s.3.2: governance policies and practices are required, and detailed information about them "must be published in simple and clear language on the enterprise's website".
- s.3.3: a privacy impact assessment is required "for any project to acquire, develop or overhaul an information system or electronic service delivery system involving the collection, use, communication, keeping or destruction of personal information", proportionate to the sensitivity.
- s.17: "Before communicating personal information outside Québec, a person carrying on an enterprise must conduct a privacy impact assessment." It must weigh sensitivity, purposes, protection measures including contractual ones, and the legal framework of the destination. The communication "must be the subject of a written agreement". The same applies when the enterprise "entrusts a person or body outside Québec" with collecting, using or keeping the information.
- s.3.5: reasonable measures are required after a confidentiality incident; if it "presents a risk of serious injury" the enterprise must "promptly notify the Commission d'accès à l'information" and any person whose information is concerned. s.3.6 defines "confidentiality incident"; s.3.8 requires a register, and a copy goes to the Commission on request.
- s.8.1: technology that can identify, locate or profile a person requires prior information and "the means available to activate" those functions. s.9.1: a technological product or service offered to the public must have privacy settings at the "highest level of confidentiality by default".
- Penalties: administrative penalty (s.90.12) up to $50,000 for a natural person and $10,000,000 or 2% of worldwide turnover otherwise; penal fines (s.91) $5,000 to $100,000 for a natural person and $15,000 to $25,000,000 or 4% otherwise.
- In force: September 22, 2022 for s.3.1 and ss.3.5 to 3.8; September 22, 2023 for the rest (Law 25, s.175).
- Commission d'accès à l'information incident page, https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/incidents-confidentialite-mesures-securite-entreprises. A five-year register retention period appeared in a search summary only; unconfirmed.
- Pexi's own position (`docs/store/quebec-transfer-note.md`): recipients are its own Ontario server, Cloudflare, Anthropic (US, product name only, opt-in), RevenueCat (US), Apple, Open Food Facts (EU) and OSM Overpass (EU). The note lists as still open whether the Anthropic, Cloudflare and RevenueCat contracts give the protection the law expects, and the log retention period for stdout logs.
- Privacy page "Children" section: "Pexi is for all ages... It asks no one for a name, email address, birth date or account, and it collects the same information described above from every user, whatever their age."

**What Pexi must do.**
- Confirm the privacy page publishes the officer's title and contact (it does) and add the governance practices summary (s.3.2).
- Write the s.17 assessment for each recipient outside Quebec (Cloudflare, Anthropic, RevenueCat, Open Food Facts, OSM) and have a written agreement on file for each that receives personal information. Open Food Facts and OSM receive product lookups or map queries, so check whether they receive any personal information at all.
- Keep an incident register and a short procedure for the Commission notice and user notice.
- Decide how the under-14 rule is met: either rely on the "clearly for the minor's benefit" exception, collect a parent's consent, or reduce collection so the question is smaller.
- Check that location and any profiling are off by default and described before activation (ss.8.1, 9.1). The privacy page says location is off by default.

**Questions for the lawyer.** (a) Does the Act apply to an Ontario individual publishing an app to Quebec users, and which enterprise is "carrying on an enterprise"? (b) Does a random device id plus IP address count as personal information about a minor under 14 whose consent is needed under s.4.1, and does "clearly for the minor's benefit" cover a price-check app? (c) What does the Commission expect a s.17 assessment to look like for a one-person publisher, and are standard processor terms from Cloudflare, Anthropic and RevenueCat enough for the "written agreement"?

## L2(3) PIPEDA and the OPC: meaningful consent, children (under 13), breach reporting

**Answer.** The OPC's position is that consent for children under 13 must come from a parent or guardian "in all but exceptional circumstances", and that consent from older minors counts only if their maturity was taken into account. On October 20, 2026 the OPC published Canada's first Children's Privacy Code, which applies to services "likely to be accessed by children", not only to child-directed ones, so a 4+ all-ages app is probably inside its reach. The Code is OPC guidance on PIPEDA, with comments open until January 20, 2027. Breaches that create a real risk of significant harm must be reported to the OPC and to the individuals "as soon as feasible", and every breach must be recorded for two years.

**Sources and quotes.**
- OPC meaningful consent guidelines, https://www.priv.gc.ca/en/privacy-topics/collecting-personal-information/consent/gl_omc_201805/: "(the OPC takes the position that, in all but exceptional circumstances, this means anyone under the age of 13)"; "consent must instead be obtained from their parents or guardians"; for older minors "consent can only be considered meaningful if organizations have reasonably taken into account their level of maturity"; "consent is not a free pass for organizations".
- PIPEDA s.6.1, https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html: "the consent of an individual is only valid if it is reasonable to expect that an individual to whom the organization's activities are directed would understand the nature, purpose and consequences of the collection, use or disclosure of the personal information to which they are consenting."
- PIPEDA s.5(3): "An organization may collect, use or disclose personal information only for purposes that a reasonable person would consider are appropriate in the circumstances."
- Children's Privacy Code, news release https://www.priv.gc.ca/en/opc-news/news-and-announcements/2026/nr-c_261020/ and text https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/protection-of-children-for-businesses/childrens-privacy-code/children-code-final-report-2026/:
  - Scope: "A service is likely to be accessed by children where relevant factors indicate a reasonable probability of child access." It applies "regardless of whether children are the intended or primary audience". An organization that decides a service is not likely to be accessed "should document the decision and the reasons for it".
  - Age bands: 0 to 5 parental consent; 6 to 9 parental consent plus a simple notice for the child; 10 to 12 parental consent plus a written notice for the child; 13 to 15 and 16 to 17 the child's consent. "In all but exceptional circumstances, organizations must obtain consent from a parent or guardian" for under 13.
  - Defaults: "configured to the highest available privacy setting by default"; profiling and sharing with third parties off by default. "Location data collection should be off by default."; it may be on only where "directly necessary for the delivery of the core product or service".
  - Status: it "reflects the OPC's views on organizations' obligations under PIPEDA"; comments are accepted until January 20, 2027 and the Code "may be updated". No transition period is stated in the text read.
- Breach reporting, PIPEDA s.10.1: "An organization shall report to the Commissioner any breach of security safeguards involving personal information under its control if it is reasonable in the circumstances to believe that the breach creates a real risk of significant harm to an individual." The report is made "as soon as feasible after the organization determines that the breach has occurred". The organization must also notify the individual. Significant harm "includes bodily harm, humiliation, damage to reputation or relationships, loss of employment, business or professional opportunities, financial loss, identity theft, negative effects on the credit record and damage to or loss of property."
- OPC breach guidance, https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/privacy-breaches-at-your-business/gd_pb_201810/: records of every breach are kept for "two years". Relevant factors are the sensitivity of the information and the probability of misuse.
- PIPEDA s.28: knowingly contravening s.10.1 is an offence "liable to a fine not exceeding $10,000" on summary conviction or "$100,000" on indictment.

**What Pexi must do.**
- Decide and document whether Pexi is "likely to be accessed by children" (the Code asks for the decision and reasons in writing).
- If yes, decide how parental consent for under-13s is met for the one data flow that needs consent (the Anthropic opt-in), or limit that flow so no child's data goes to it without a parent's say.
- Keep location, profiling and third-party sharing off by default (already true per the privacy page).
- Write a one-page breach procedure and a record template (two-year retention).

**Questions for the lawyer.** (a) Is Terms s.2 ("all ages with parent permission") plus the privacy page's "Children" section enough under the Code, or does it expect an in-app parental step for under-13s? (b) Does the Code bind today or only signal how the OPC will read PIPEDA? (c) Is an IP address in an access log "personal information" for a breach-record purpose?

## L2(4) Anthropic: products whose users may include minors

**Answer.** Anthropic's Usage Policy defines a minor as anyone under 18 "regardless of jurisdiction", leaves age limits to its Terms, and says products serving minors "must comply with the additional guidelines outlined in our Support article and all applicable laws". The support articles apply when a product "allows minors to interact directly with our models". Pexi sends a product name for a price estimate, not user chat, so it is arguably outside that trigger; the safe reading is to follow the guidelines' disclosure and law-compliance points anyway. The commercial terms read have no clause on minors.

**Sources and quotes.**
- Usage Policy, https://www.anthropic.com/legal/aup (effective "Nov 12, 2026"): "We define a minor or child to be any individual under the age of 18 years old, regardless of jurisdiction." "Any specific age eligibility requirements for use of our products will be set out in our Terms of Service." Consumer-facing chatbots "must disclose to users that they are interacting with AI rather than a human." High-risk uses covering "health, legal rights, finances, livelihoods, or access to housing, education, or essential services" need the impacted individual told AI was used. A grocery price range is probably not in that list; unconfirmed.
- Guidelines for organizations serving minors, https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors (March 16, 2026): it targets "organizations providing minors with the ability to directly interact with products that incorporate our API(s)". Technical measures (age verification, content moderation, monitoring, educational resources) are "should" items. "Organizations must disclose to their users that they are interacting with an AI system rather than a human." "It is the responsibility of organizations to comply with all applicable child safety and data privacy regulations." Compliance "should be clearly stated on the organization's website". Anthropic "will periodically audit"; failure can lead to "suspension or termination".
- Child safety guidance for developers, https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers (June 26, 2026): applies "if your product allows minors to interact directly with our models" and "regardless of your platform's size or use case". It does not separate minor-targeted from general-audience products.
- Commercial terms, https://www.anthropic.com/legal/commercial-terms (the page showed "Jun 17, 2025"; possibly an older cached version): no clause on minors or age. "Services under these Terms are not for consumer use." Customer "must notify its Users, that factual assertions in Outputs should not be relied upon". "Anthropic may not train models on Customer Content from Services." Data is handled under Anthropic's Data Processing Addendum. Customer must comply with the Usage Policy. No data-location clause was found.

**What Pexi must do.**
- Keep the AI-generated nature of estimates visible next to each estimate (Terms s.4 already covers it in the Terms; confirm it is in the app screen too).
- State the "estimates are not facts" point to users (commercial terms D.3).
- Keep user-identifying data out of the call to Anthropic (the privacy page says device id, images and location are not sent).
- Record the decision that Pexi is not a product where minors "interact directly" with the model, and why.
- Note: the commercial terms say services "are not for consumer use"; Pexi is the commercial customer and its users are not Anthropic's consumers, but confirm that reading.

**Questions for the lawyer.** (a) Do the minors guidelines apply to Pexi, given the model sees only a product name chosen or typed by a user? (b) Does a price estimate shown to a shopper count as a "high-risk" finance use needing extra disclosure? (c) Do Anthropic's current commercial terms (the copy read is dated June 2025) have a minors or age clause I could not see?

## L2(5) Minors and paid Apple subscriptions (Ask to Buy, Family Sharing)

**Answer.** Apple's Ask to Buy is on by default and cannot be turned off for a child under 18 (region varies), a child must ask whatever the app's rating, and in-app purchases are covered. So a child in a Family Sharing group needs an adult's approval to buy Pexi Plus, which limits the minor-contract risk, while a teenager outside Family Sharing can buy directly. The Apple page does not mention subscriptions or the sharing of a subscription across a family; that is unconfirmed.

**Sources and quotes.**
- Ask to Buy, https://support.apple.com/en-us/105055: "Ask to Buy is turned on by default and can't be turned off if the child is under 18" (varies by region). The page says the child must ask regardless of the app's age rating and covers in-app purchases. Where legally required, a child account must be in a Family Sharing group. The 24-hour approval timeout came from a search summary only; unconfirmed.

**What Pexi must do.**
- Nothing technical; keep the subscription through Apple's in-app purchase, which keeps this protection.
- In the Terms, keep the line that a parent or guardian must agree for a minor.

**Question for the lawyer.** Whether a minor's subscription bought without Ask to Buy (older teen, own Apple Account) is enforceable against the minor under Ontario and Quebec law, and what Pexi's refund practice should be. Unconfirmed in sources read.

---

# L4. Advertising and consumer law

## L4(1) Competition Act s.74.01 and performance claims, applied to price verdicts

**Answer.** The Act bars a representation to the public that is false or misleading in a material respect, and bars a performance or efficacy claim "not based on an adequate and proper test", with the burden of proof on the person making the claim. The test looks at the general impression as well as the literal words, and no one needs to have been misled. A verdict such as "fair price" or "good deal" is a performance claim about the app and a price representation to shoppers, so Pexi needs a documented basis for its accuracy, and a small disclaimer will not cure a headline claim. Penalties are large for an individual and for a corporation.

**Sources and quotes.** Competition Act, https://laws-lois.justice.gc.ca/eng/acts/C-34/page-11.html and https://laws-lois.justice.gc.ca/eng/acts/C-34/page-12.html.
- s.74.01(1)(a): a person engages in reviewable conduct who, to promote a product or business interest, "makes a representation to the public that is false or misleading in a material respect".
- s.74.01(1)(b): a representation "in the form of a statement, warranty or guarantee of the performance, efficacy or length of life of a product that is not based on an adequate and proper test thereof, the proof of which lies on the person making the representation".
- s.74.01(3.2): "it is not necessary to establish that any person was deceived or misled."
- s.74.01(4): "the general impression conveyed by a representation as well as its literal meaning shall be taken into account".
- s.74.01(1.1) addresses drip pricing; s.74.01(2) and (3) address "ordinary price" claims (volume and time tests). Relevant if Pexi shows "usual price" or "typical price" comparisons for a store's own price.
- s.74.1(1)(c): administrative monetary penalty maximums are, for an individual, the greater of $750,000 (first order) or $1,000,000 (subsequent) and three times the benefit; for a corporation, the greater of $10,000,000 or $15,000,000 and three times the benefit, or 3% of worldwide gross revenues.
- Competition Bureau, https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/misleading-representations-and-deceptive-marketing-practices: a business making a performance claim must "be able to prove the claim is based on an adequate and proper test". A representation covers "any marketing material, including online and in-store advertisements... social media messages". The page does not mention apps, or a disclaimer curing a headline claim; unconfirmed.

**What Pexi must do.**
- Keep a written basis for each kind of verdict: where the comparison prices come from, how many observations, how old, and how the range is computed.
- Where the verdict rests on a model estimate or few observations, say so on the verdict screen in plain words next to the verdict (Terms s.3 and s.4 say estimates are information only; the Act looks at the general impression, so the screen matters more than the Terms).
- Avoid "lowest price" or "best price" claims unless tested.
- If the app shows "usual", "was" or "typical" prices, check them against the volume and time tests in s.74.01(2) and (3).

**Questions for the lawyer.** (a) What level of testing counts as "adequate and proper" for a crowd-sourced and model-estimated price verdict? (b) Does a wrong-price disclaimer on the verdict screen reduce exposure given the "general impression" rule? (c) Does the Act apply to a free-tier price verdict as a representation "to promote a business interest"?

## L4(2) Quebec Consumer Protection Act: distance contracts and recurring online subscriptions

**Answer.** An in-app subscription sold to a Quebec consumer is probably a distance contract, which carries mandatory pre-contract disclosures, an express accept/decline step, a copy to the consumer, and cancellation rights if disclosures are missing. Two 2026 amendments (Bill 10, S.Q. 2026, c. 16) add an online cancellation button and a written notice before a free or discounted period ends; their in-force date is reported as September 12, 2026 by law-firm commentary, not by an official source I could read. Two Terms clauses clash with the Act: s.12 (changes by continued use) against s.11.2, and the liability limit in s.11 against s.10. Who counts as "merchant" for an Apple in-app purchase is not answered by the Act.

**Sources and quotes.** Consolidated Act (updated to October 15, 2026), https://www.legisquebec.gouv.qc.ca/en/pdf/cs/P-40.1%20.pdf.
- s.54.1: a distance contract is one "entered into without the merchant and the consumer being in one another's presence and preceded by an offer by the merchant".
- s.54.3: no payment may be collected before performance "unless the consumer may request a chargeback". Whether Apple's billing satisfies this is unconfirmed.
- s.54.4: before the contract the merchant must disclose its name, address and telephone number "and, if available... technological address"; a description of the services; an itemized price list; the "total amount to be paid"; payment terms; currency; when the obligation is performed; "(k) the applicable cancellation, rescission, return, exchange and refund conditions"; and restrictions. It must be presented "prominently and in a comprehensible manner and bring it expressly to the consumer's attention".
- s.54.5: an "express opportunity to accept or decline the proposal and to correct any errors".
- s.54.7: a copy of the contract within 15 days, easy to keep and print. s.54.8: the consumer may cancel within 7 days after receiving the copy if disclosures were missing (the 30-day extension I saw only in a search summary; unconfirmed). s.54.13: refund within 15 days.
- s.87.28 (added by S.Q. 2026, c. 16, s.4): "A merchant who enters into an online contract involving sequential performance that the consumer may resiliate without cause must allow the consumer to easily exercise that right of resiliation by means of a button accessible online and readily identifiable."
- s.87.29 (same amendment): where a contract provides goods or services free or at a reduced price for a determinate period and then at a higher price, "the merchant must send to the consumer, within the time prescribed by regulation, a written notice drawn up clearly and legibly indicating the date of the end of that period and the price that will be applicable from that date." Pexi has no stated free trial in the Terms read; check whether the App Store listing offers one.
- In-force date of the 2026 amendments: "September 12, 2026" is from secondary commentary (law-firm summaries returned in a web search); Osler's page, https://www.osler.com/en/insights/updates/quebec-bill-10-new-rules-subscriptions-ticket-resale-practices/, described the bill before passage and stated no date. The Bill was assented to June 12, 2026 per the National Assembly news listing. Unconfirmed from an official source.
- s.11.2: "Any stipulation under which a merchant may amend a contract unilaterally is prohibited unless the stipulation also" specifies the elements that may be amended, gives 30 days' written notice, and lets the consumer cancel free of cost. This conflicts with Terms s.12 as drafted ("keep using = accept").
- s.10: "Any stipulation whereby a merchant is liberated from the consequences of his own act or the act of his representative is prohibited." This is relevant to Terms s.11 (limitation of liability).
- s.26: the contract and related documents must be drawn up in French, with exceptions.
- s.219: "No merchant, manufacturer or advertiser may, by any means whatever, make false or misleading representations to a consumer."
- s.214.3 (automatic renewal) sits in the telecom and long-term contract part and does not clearly apply. No other general renewal-notice section was found; unconfirmed.
- Bill 72 (S.Q. 2023, c. 21) amended s.54.4; announcement at https://www.opc.gouv.qc.ca/en/actualite/office/article/adoption-du-projet-de-loi-72.

**What Pexi must do.**
- Rewrite Terms s.12 so a change that affects a Quebec consumer follows s.11.2 (what may change, 30 days' written notice, free cancellation), or exclude Quebec consumers from the "keep using = accept" mechanism.
- Soften Terms s.11 so it does not exclude liability for Pexi's own acts toward consumers (s.10 and the Civil Code).
- Show the s.54.4 information before purchase on the paywall or a linked page: seller identity and contact, price and billing period, what is included, renewal and cancellation terms, refund conditions. Provide an express confirm step (Apple's purchase sheet may supply part of it; the paywall supplies the rest).
- Check whether the app offers an in-app way to cancel. Apple's own subscription settings may or may not satisfy s.87.28; check, and if unsure, add a visible "Manage or cancel subscription" link that opens Apple's page.
- Add a trial or promo price notice only if one is offered.

**Questions for the lawyer.** (a) For an in-app purchase through Apple, is Pexi or Apple the "merchant" for ss.54.4 to 54.8 and s.87.28? (b) Does Apple's purchase sheet satisfy the disclosure and express-acceptance steps, and what must Pexi add? (c) Does s.87.28's button requirement apply to an Apple-billed subscription? (d) Redraft Terms ss.11 and 12. (e) Confirm the in-force dates of the 2026 amendments from the official source.

## L4(3) Charter of the French language (Bill 96): the app, its store page and its terms

**Answer.** The Charter gives consumers "a right to be informed and served in French" and requires public commercial documents, pre-determined contracts and software to be available in French. For an app sold to Quebec users, that points to a French app, French store listing and French Terms and privacy page, with the French version available before the consumer is asked to accept a contract in English. Pexi's own records say the app is bilingual and French Terms and privacy pages exist (translation by a third party); I could not confirm French metadata on the App Store listing.

**Sources and quotes.** Charter of the French language, CQLR c. C-11 (updated to October 15, 2026), https://www.legisquebec.gouv.qc.ca/en/pdf/cs/C-11%20.pdf.
- s.5: "Consumers of goods and services have a right to be informed and served in French."
- s.52: "catalogues, brochures, folders, commercial directories, order forms and any other documents of the same nature that are available to the public must be drawn up in French".
- s.52.1: "All computer software, including game software and operating systems... must be available in French unless no French version exists." The French version must be available on terms no less favourable.
- s.55: "Contracts pre-determined by one party and the related documents, must be drawn up in French." A party may adhere to a version in another language only after the French version has been given and the adhering party expressly wishes it.
- s.58: "Public signs and posters and commercial advertising must be in French" (or French "markedly predominant").
- s.51 covers inscriptions on products and documents supplied with them; it may not apply to software.
- OQLF commentary (secondary, from a search summary of https://www.oqlf.gouv.qc.ca/): s.52 applies to "documentation publicitaire offerte au public" of any enterprise with a Quebec address, and the OQLF considers its rules to cover websites and mobile applications of Quebec-based enterprises. The 2025 OQLF note on trade names covers premises signage, not apps. Unconfirmed whether the OQLF treats an Ontario publisher selling in Quebec the same way.
- Pexi status: per `docs/store/terms.html` and `docs/store/privacy.html` the English pages exist; per project notes French Terms and privacy pages exist, translated by a third party. A search of `docs/store/listing.md` found no French listing text; unconfirmed.

**What Pexi must do.**
- Offer the full app, the paywall, the Terms and the privacy page in French (app already bilingual per project rulings; confirm every screen, including the paywall and error text).
- Provide a French App Store listing (name, subtitle, description, screenshots) for the Canada storefront.
- Show the French Terms and privacy before asking a Quebec user to accept.
- Have the French translations reviewed by someone qualified, as the lawyer's list already contemplates.

**Questions for the lawyer.** (a) Does the Charter reach an Ontario publisher selling an app to Quebec users, and how does the OQLF treat that in practice? (b) Are Apple's standard terms, which govern the sale, a "pre-determined contract" Pexi must supply in French, or only Pexi's own Terms? (c) Is a French listing mandatory, or is a French app plus French Terms enough?

---

# L5. Trademark, data licence, business name, tax

## L5(1) CIPO trademark search: PEXI and variants in classes 9, 35, 42

**Result in one line.** There is no identical PEXI mark in any class (including pending applications); the nearest live marks in classes 9, 35 and 42 are SPEXI (9, 42), PEXIL (42, pending), PIXID (9, 35, 42) and the PIXI family in class 9, and none is a grocery or price app. The lawyer judges confusion.

**Method.** The Canadian Trademarks Database, https://ised-isde.canada.ca/cipo/trademark-search (field "Trademark"), driven through a browser because URL parameters were not accepted. Database last updated 2026-11-11 (shown on the page). A control search for PELOTON returned 25 hits, showing the search works. Detail pages: `https://ised-isde.canada.ca/cipo/trademark-search/{application number}?lang=eng`.

**Counts.** PEXI: 0. PEXIE: 0. PEXEE: 0. PEXIE*: 0. PEXEE*: 0. PEXY: 1. PEXY*: 1. PEXI*: 13. *PEXI: 2. PIXI: 15. PIXI*: 129.

**Hits in classes 9, 35 or 42 that matter (owner, goods, status).**
- SPEXI, no. 1869940 (TMA1086266), registered, classes 9 and 42, Spexi Geospatial Inc. (Delta, BC). Geospatial application software and software as a service for aerial survey data. Expires 2030-10-27.
- PEXIL, no. 2431643, advertised (opposition period), class 42, an individual applicant in Toronto. Toxicity screening of chemical compounds. Filed 2025-10-17, advertised 2026-09-09.
- PEXIOVEQ, no. 1972184 (TMA1222707), registered, classes 5 and 42. Oncolytic virus pharmaceuticals and cancer research information.
- PIXID, no. 2089023 (TMA1280449), registered, classes 9, 35 and 42, PIXID (France). Recruitment and temporary-staffing software and services.
- PIXIFLEX, no. 2451559, searched (pending), classes 7 and 42. Industrial molds for vehicle-light parts.
- PIXI BOOTH, no. 1563977 (TMA864818), registered, classes 9, 16, 25, 41. Photo booths.
- ONETOUCH PIXI, no. 1747561 (TMA953997), registered, class 9, TCT Mobile Europe SAS. Phones and tablets.
- PIXIE, no. 2229605 (TMA1381947), registered, classes 9, 28, 41, 44, Active Cues B.V. Projectors and health game software.
- Pixio, nos. 2189312 (TMA1290316) and 2007657 (TMA1119115), registered, class 9, Pixio USA Inc. Webcams, headsets, cases and monitors.
- PIXIO, no. 2164223 (TMA1239608), registered, classes 9 and 28. Magnets, including mobile apps for toy construction kits.
- PIXIUM, no. 1215369 (TMA680584), registered, class 9. Radiology detectors.
- Pixiecube, no. 2307030 (TMA1340519), registered, class 9. Device wraps and cases.
- PIXIE MOOD, no. 1994184 (TMA1129677), registered, classes 18, 25, 35. PIXIGLOW, no. 1554906 (TMA850391), registered, classes 3 and 35. PIXIES OF THE FOREST (classes 9, 41), PIXIELICIOUS (9, 28, 41) and PIXIE HOOPS (9, 16, 25, 28, 41), registered.
- Dead or abandoned in the requested classes: PIXI no. 1467885 (abandoned, Palm), PIXI no. 840006 (cancelled), PIXI no. 1240301 (expunged), PIXIMASH, PIXIDA, PIXIERAY, Pixieland, Pixicle (abandoned).
- Outside the requested classes: SAF-T-PEXY, no. 1364825 (TMA806904), registered, class 10 only (needles, syringes, sutures), Kimberly-Clark. This is the only PEXY hit. The other PEXI* hits (PEXINTIVE, PEXION, PEXIDAN and similar) sit in classes 1, 5 and 6.

**Limits.** Canadian register only; common-law (unregistered) use, US and EU registers, App Store and domain names, and phonetic or design variants beyond the terms searched were not covered. A search by sound ("PEKSEE", "PEXEY") and by goods description (price comparison, grocery) was not done.

**What Pexi must do.** File a Canadian application for PEXI (or the final stylised mark) in classes 9, 35 and 42 only after the lawyer clears the nearest marks; run a full clearance search before relying on the name.

**Questions for the lawyer.** (a) Likelihood of confusion between PEXI and SPEXI (9, 42), PEXIL (42, pending, opposition window), PIXID (9, 35, 42) and the PIXI family for a consumer price app. (b) Whether to oppose or watch PEXIL. (c) Whether to file now on a proposed-use basis, and in which classes.

## L5(2) ODbL v1.0: attribution and share-alike for a derived database and for "produced works" shown in an app

**Answer.** The ODbL has three separate duties. Anyone who publicly uses a Derivative Database must offer it under the ODbL and offer recipients a machine-readable copy. Anyone who publicly uses a Produced Work made from the database (for example a price answer in an app) must show a notice that the contents came from the database and are available under the ODbL, but need not offer the Produced Work itself under the ODbL. A collective database that contains the ODbL data unmodified is not caught by share-alike. Pexi's merged catalogue is likely a Derivative Database as to the ODbL-sourced rows; the open points are how to offer it and what to do with non-ODbL sources merged in.

**Sources and quotes.** ODbL 1.0, https://opendatacommons.org/licenses/odbl/1-0/.
- "Derivative Database": "Means a database based upon the Database, and includes any translation, adaptation, arrangement, modification". Extracting or reusing a substantial part of the Contents in a new database counts.
- "Produced Work": "a work (such as an image, audiovisual material, text, or sounds) resulting from using" the Database.
- "Collective Database": "Means this Database in unmodified form as part of a collection of independent databases".
- s.4.1: the rights are "expressly made subject to Your complying with the following conditions of use".
- s.4.2: when You publicly convey the Database, a Derivative Database, or the Database in a Collective Database, include a copy of the licence (or its URI) and keep notices intact.
- s.4.3: "Creating and Using a Produced Work does not require the notice in Section 4.2". If You publicly use a Produced Work, include a notice reasonably informing people the Contents came from the Database and are available under the ODbL, hyperlinking the database name and licence where possible.
- s.4.4: "Any Derivative Database that You Publicly Use must be only under the terms of" the ODbL, a later version, or a compatible licence. A Produced Work from a publicly used Derivative Database is subject to the same attribution.
- s.4.5: share-alike does not require licensing a Collective Database, treating a Produced Work as a Derivative Database, or licensing internal use.
- s.4.6: if You publicly use a Derivative Database or a Produced Work from one, "You must offer recipients a machine-readable copy" of the whole Derivative Database or a file of alterations, free if distributed over the internet.
- s.4.7: no technological measures that restrict the licence.
- Open Food Facts terms, https://world.openfoodfacts.org/terms-of-use: the database is under the ODbL, individual contents under the Database Contents Licence, and images under CC BY-SA ("Products images are available under the Creative Commons Attribution ShareAlike licence"). Re-users must "mention the licence and to attribute the authorship to Open Food Facts with a link to https://openfoodfacts.org". "Derivative works must be shared under the same conditions."
- Pexi's current practice: `app/src/attribution.ts` lists the sources and licences on an in-app data and licences screen (Open Food Facts, Open Beauty/Pet/Products Facts and Open Prices credited as ODbL; OSM; Icecat; USDA; BC LDB and others). Terms s.6 offers the Derivative Database, or a file of changes, "on request". Whether images are shown anywhere is unconfirmed.

**What Pexi must do.**
- Keep the attribution screen and also show a short source notice, with links, next to any answer drawn from an ODbL source (s.4.3).
- Decide whether the merged catalogue is a Derivative Database; if so, publish a periodic machine-readable dump or a standing download link rather than "on request", with the licence text (s.4.2 and 4.6).
- Keep ODbL-sourced rows separable from rows under other licences so the share-alike scope is clear.
- Check what licence applies to images from Open Food Facts (CC BY-SA) before showing any.

**Questions for the lawyer.** (a) Is Pexi's merged product catalogue a Derivative Database or a Collective Database under the ODbL definitions? (b) Does "on request" satisfy "You must offer recipients a machine-readable copy"? (c) Icecat data is described as "All rights reserved": can it be merged with ODbL data in one distributed database without breaching s.4.4 and s.4.7? (d) Is the answer API response a Produced Work, so only the s.4.3 notice applies?

## L5(3) Ontario business name registration

**Answer.** Under the Ontario Business Names Act an individual may not carry on business or identify the business to the public under a name other than his or her own unless the name is registered. Pexi is published by an individual under the name "Pexi", so registration is probably required. The penalty for not registering is limited (a fine, and no right to sue in Ontario courts without leave), contracts stay valid, and registration gives no trademark rights (unconfirmed).

**Sources and quotes.** Business Names Act, R.S.O. 1990, c. B.17, https://www.ontario.ca/laws/statute/90b17 (currency date November 11, 2026).
- s.2(2): "No individual shall carry on business or identify his or her business to the public under a name other than his or her own name unless the name is registered by that individual."
- s.1(1): "business" includes "every trade, occupation, profession, service or venture carried on with a view to profit".
- s.7(1): a person carrying on business in contravention of s.2 "is not capable of maintaining a proceeding in a court in Ontario in connection with that business except with leave of the court". s.7(2): the court shall grant leave if the failure was inadvertent, there is no evidence the public was deceived or misled, and the person is not in contravention when applying. s.7(3): "No contract is void or voidable by reason only that it was entered into by a person who was in contravention of this Act".
- s.10(1): a fine of not more than $2,000 for an individual and $25,000 for a corporation.
- s.2(6): corporations must show both the registered name and their own name in contracts and invoices.
- s.5: renewal before expiry; the renewal period is in the regulations, unconfirmed. The registration fee is unconfirmed (https://www.ontario.ca/page/register-business-name returned a 404 to my fetch).

**What Pexi must do.**
- Register "Pexi" (sole proprietorship) before charging for Plus, or incorporate and operate through the company.
- Make the Terms, privacy page and store page name the legal operator and registered name consistently.

**Questions for the lawyer.** (a) Is an app name alone "carrying on business under a name other than his own"? (b) Sole proprietorship against incorporating now, considering personal liability, the Quebec duties above, and the Apple developer account type.

## L5(4) Apple and GST/HST on App Store sales in Canada

**Answer.** Yes: Apple Canada acts as the developer's agent for sales to Canadian end users and, for registered developers, collects, accounts for and remits GST/HST under an election made with Form GST506. Apple's agreement says a Canadian-resident developer must be registered for GST/HST (or have applied) as a condition of the paid-apps schedules, and must put the GST/HST number in the account. Apple deducts GST/HST and QST on its commission from the developer's remittance. What this leaves for a small Ontario developer is registering, filing returns, and handling the commission tax; the exact reporting after Apple remits is unconfirmed.

**Sources and quotes.**
- Apple Exhibits to Schedule 2 and Schedule 3 (dated "27 August 2026"), https://developer.apple.com/support/downloads/terms/exhibits/Exhibits-to-Schedule-2-and-3-English.pdf.
  - Exhibit A: "You appoint Apple Canada, Inc. ('Apple Canada') as Your agent for the marketing and End-User download of the Licensed and Custom Applications by End-Users located in the following region: Canada".
  - Exhibit C, Canada: "If You are a resident of Canada, You must add to or update Your account with Your Canadian GST/HST number."
  - s.3.2(a): "Apple Canada is registered for GST/HST purposes, with GST/HST Registration No. R100236199."
  - s.3.2(b): "If You are a resident of Canada or are a non-resident of Canada that is required to register for GST/HST purposes pursuant to the ETA, it is a condition of Schedule 2 and Schedule 3, that You are registered for GST/HST or have submitted an application to register for GST/HST to the CRA".
  - s.3.2(c): a registered developer agrees "to enter into the election pursuant to subsection 177(1.1) of the ETA to have Apple Canada collect, account for and remit GST/HST on sales of Licensed Applications and Custom Applications made to End-Users in Canada on Your behalf" and returns Form GST506; and acknowledges "Apple will deduct from your remittance the applicable Canadian GST/HST and QST, based on Your address in Canada, on the commission payable by You to Apple."
  - s.3.2(d): an unregistered developer certifies it is "not resident in Canada and do[es] not carry on business in Canada", so that path is for non-residents.
  - s.3.3 (Quebec): a Quebec resident developer must be registered for QST; a non-Quebec developer certifies it is not resident in Quebec and "Apple will charge, collect and remit QST on sales... to End-Users in Quebec made on Your behalf".
  - s.3.1: the developer indemnifies Apple for any failure to pay, collect or remit GST/HST, QST or PST on supplies made on the developer's behalf.
- Apple tax information, https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information/: "If you're based in Canada, you're required to submit your Canadian Goods and Services tax (GST)/Harmonized Sales Tax (HST) number (and Québec Sales Tax (QST) number if based in Quebec)." "your remittances for sales on the App Store in Canada will be reduced by the applicable Canadian GST/HST and QST/PST on Apple's commission." "Apple will issue you a tax on commission invoice on a monthly basis, available in App Store Connect." The page does not say who collects tax from the customer in the Canada section.
- CRA, general guide RC4022, https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html: a "small supplier" is a person whose revenue "from worldwide taxable supplies was equal to or less than $30,000" "in a single calendar quarter and over the last four consecutive calendar quarters." "If you are a small supplier and you are engaged in a commercial activity in Canada, you can choose to register voluntarily."
- CRA digital economy page, https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/digital-economy.html: the Excise Tax Act was "amended, effective July 1, 2021, to include GST/HST provisions that generally apply to non-resident suppliers, distribution platform operators and accommodation platform operators". It does not say how a resident vendor selling through a platform is treated; unconfirmed.

**What Pexi must do.**
- Register for a GST/HST number before submitting the paid-apps agreement, since Apple's terms require it of a Canadian resident, whatever the small-supplier exemption would allow; submit Form GST506 and enter the number in App Store Connect.
- Do not add tax to the CA$3.99 and CA$29.99 prices on its own; Apple collects at the storefront (confirm in App Store Connect's price tier display).
- Keep the monthly tax-on-commission invoices and file GST/HST returns on the schedule CRA assigns.
- If the developer lives in Ontario, no QST registration is needed; Apple charges QST on Quebec sales under s.3.3(c).

**Questions for the lawyer or accountant.** (a) Does a Canadian resident developer who is below $30,000 have to register because Apple's agreement says so, and what are the consequences of registering voluntarily (returns, input tax credits)? (b) After Apple collects and remits under the s.177(1.1) election, what does the developer report on the GST/HST return, and are the commission taxes claimable as input tax credits? (c) Is the developer's income sole-proprietor income, and does incorporation change the Apple account setup?

---

# Lawyer packet: questions

Context to send with these: Pexi is a Canada-only iOS grocery price-check app, rated 4+ and not in the Kids Category, with CA$3.99 a month or CA$29.99 a year in-app subscription through Apple, run by one individual in Ontario with a server in Ontario. It stores a random device id, IP addresses in logs, scans and typed prices, and optional rough location (off by default). With consent it sends product names (not user text beyond a typed product name, no device id, no location) to Anthropic's Claude API. Recipients outside Quebec include Cloudflare, Anthropic and RevenueCat (US), and Open Food Facts and OSM (EU). The app is bilingual with French Terms and privacy translations by a third party.

Children and privacy
1. Does Quebec's private-sector Act apply to an Ontario individual publishing an app to Quebec users, and who is the "enterprise" for ss.3.1, 3.2, 3.3 and 17?
2. Is a random device id plus IP in a log personal information about a minor under 14 under s.4.1, and does the "clearly for the minor's benefit" exception cover a price-check app, or must we collect parental consent?
3. What should a s.17 privacy impact assessment contain for a one-person publisher sending data to Cloudflare, Anthropic and RevenueCat, and are those vendors' standard data processing terms a sufficient "written agreement"?
4. Is a 4+, all-ages grocery price app "likely to be accessed by children" under the OPC Children's Privacy Code of October 20, 2026, and does the Code bind now or only signal the OPC's reading of PIPEDA?
5. If the Code applies, is Terms s.2 ("all ages with parent permission") plus the privacy page's "Children" section enough, or does it require an in-app parental step for under-13s?
6. Is the "estimate this price" flow to Anthropic one that minors "interact directly" with, so Anthropic's minors guidelines apply, and does a price estimate count as a "high-risk" finance use under Anthropic's Usage Policy? Does the current commercial terms contain any minors or age clause beyond the June 2025 copy I saw?
7. Is a subscription bought by a minor without Ask to Buy enforceable, and what refund practice do you recommend?
8. Does an IP address in a server log trigger the PIPEDA breach-record duty and the Quebec incident register?

Apple rating
9. Is "None" a defensible answer for alcohol references on the Apple age rating questionnaire when the catalogue lists BC liquor products and prices?

Advertising and consumer law
10. What counts as an "adequate and proper test" for a crowd-sourced and model-estimated price verdict under s.74.01(1)(b)?
11. Does a disclaimer on the verdict screen reduce exposure given the "general impression" rule in s.74.01(4)?
12. If the app shows "usual", "was" or "typical" prices, how do the volume and time tests in s.74.01(2) and (3) apply?
13. For an Apple in-app purchase, is Pexi or Apple the "merchant" for Quebec CPA ss.54.4 to 54.8 and s.87.28, and what must Pexi add to Apple's purchase sheet?
14. Do the 2026 CPA amendments on the online cancellation button and the free-period notice (S.Q. 2026, c. 16) apply to an Apple-billed subscription, and from what date? (I could confirm the text but not the in-force date from an official source.)
15. Please redraft Terms s.12 (changes by continued use) to meet CPA s.11.2, and Terms s.11 (limitation of liability) to meet CPA s.10, for consumers.
16. Does the Charter of the French language reach an Ontario publisher selling to Quebec consumers? Are Apple's standard terms or only Pexi's Terms a "pre-determined contract" requiring French under s.55? Is a French App Store listing mandatory?

Trademark and business
17. Please judge likelihood of confusion between PEXI and SPEXI (classes 9, 42), PEXIL (class 42, pending, opposition window), PIXID (9, 35, 42) and the PIXI family in class 9. The CIPO search found no identical PEXI mark (database current to 2026-11-11).
18. Should we oppose or watch PEXIL, and should we file PEXI now on a proposed-use basis, and in which classes?
19. Is the app name alone enough to trigger registration under Ontario's Business Names Act s.2(2), and should we use a sole proprietorship registration or incorporate before launch?

Data licence
20. Is the merged product catalogue (Open Food Facts and related Open Facts data, Open Prices, OSM, Icecat, USDA, BC LDB) a Derivative Database or a Collective Database under the ODbL?
21. Does Terms s.6's "on request" offer satisfy ODbL s.4.6 ("You must offer recipients a machine-readable copy"), or must we publish a standing download?
22. Icecat data is described as "All rights reserved": can it be merged with ODbL data in one distributed database without breaching ss.4.4 and 4.7?
23. Is the answer API response a Produced Work (so only the s.4.3 notice applies), and are Open Food Facts images (CC BY-SA) shown anywhere?

Tax
24. Apple's Canada terms (dated 27 August 2026) make GST/HST registration a condition for a Canadian-resident developer; must we register even if under the $30,000 small-supplier limit, and what are the consequences of registering voluntarily?
25. After Apple collects and remits GST/HST under the s.177(1.1) election, what does the developer report on a GST/HST return, and is the GST/HST on Apple's commission an input tax credit?
26. Does incorporating change the Apple developer account setup, the tax position or the Quebec exposure?
