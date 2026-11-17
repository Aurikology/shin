# Pexi legal review: the 26 lawyer questions, answered as a lawyer would

2026-11-17, on Jamin's word: *"review these as if you were a lawyer, its impossible for us to get a lawyer"*.
Questions from `l2-l4-l5-legal-research.md` (same folder), whose quotes and source links this review relies on.

**What this is.** A reasoned answer to each question in the way a Canadian privacy, consumer and IP lawyer would
approach it: the rule, how it applies to Pexi, a recommendation, and what it costs to comply. It is not legal advice
from a licensed lawyer and carries no privilege. Each answer is marked:

- **Solid**: the statute or a court decision answers it directly.
- **Likely**: the best reading, which practitioners broadly share, but nothing binding settles it for Pexi's facts.
- **Unsettled**: no authority found. The recommendation is a risk call.

Sources added in this review (beyond the research file): R v Bykovets, 2024 SCC 6 (Supreme Court case summary,
https://scc-csc.ca/judgments-jugements/cb/2024/40269/); Bill 10 in-force dates from Fasken
(https://www.fasken.com/en/knowledge/2026/07/bill-10-what-you-need-to-know-about-the-new-rules), Stikeman Elliott and
Lavery summaries (secondary, three firms agree); Law 25 reach outside Quebec from BCLP and others (secondary). Points
that come from my own knowledge of case law and are not re-checked today are labelled "(from knowledge, not re-checked)".

**Free legal help, if any becomes possible.** Student business law clinics give free advice to startups:
- Western Business Law Clinic (London), which needs a business plan and an intake meeting;
- Queen's Business Law Clinic (southeastern Ontario);
- uOttawa Startup Law Clinic, and the bilingual Norton Rose Fulbright clinic, which suits the Quebec questions;
- Toronto Metropolitan University's clinic, for its own students and DMZ members only.

Intake status was not checked. For questions 24 and 25, CRA's business enquiries line is free.

---

## Children and privacy

### 1. Does Quebec's private-sector Act reach an Ontario individual, and who is the "enterprise"? (Likely)

**Answer: assume yes.** Pexi offers a French app to people in Quebec and collects their personal information.
Practitioners widely read the Act as reaching such a business, whatever its province (BCLP; other commentary; the
CAI's own text was not found). The "enterprise" is Jamin as a sole proprietor. A for-profit app is an organized
economic activity, so he is "carrying on an enterprise". He is also the default person in charge of privacy under
s.3.1, because he holds the highest authority.

**Recommendation.** Comply rather than argue the point. Everything the Act asks of Pexi is paperwork:
- a published person in charge (done);
- a governance summary;
- transfer assessments;
- an incident register.

Arguing that the Act doesn't apply would cost more than complying.

### 2. Is a device id plus an IP address in a log "personal information" about a minor under 14, and does "clearly for the minor's benefit" cover Pexi? (Likely / Unsettled)

**Part one, personal information: likely yes.** Treat both as personal information.
- In Bykovets (2024 SCC 6), the Supreme Court held 5 to 4 that an IP address carries a reasonable expectation of
  privacy, because it is "a key" to a person's online activity and identity. That case was about police searches
  under the Charter, not about private-sector law. Even so, regulators read "identifiable individual" at least as
  widely.
- A persistent device id that ties together one phone's scan history is the kind of identifier Apple's guideline
  5.1.4 lists.

**Part two, the minor's-benefit exception: unsettled.** The data Pexi needs to answer a scan arguably benefits the
minor who asked: the scan itself, the device id that runs the quota, and the access log kept for security. The
argument is weaker for data that serves other shoppers (typed prices) and for anything optional. The CAI has not
published a reading that fits Pexi.

**What narrows the problem.**
- The Claude estimate sends only a product name, brand, size, category and country, never the device id. That isn't
  personal information, so the Claude opt-in is not a privacy consent at all.
- Location is off by default.

The data actually at stake is the scan history, the typed prices and the logs.

**Recommendation.**
- Rely on the benefit exception for what is needed to answer the shopper, and write that decision down. Question 4
  needs the same written decision.
- Keep log and scan retention short.
- The cheap protective step: where the location permission is explained, add one line asking under-14s to ask a
  parent first. Whether to add that line to the customer screen is your call.

### 3. What does a s.17 transfer assessment look like for a one-person publisher, and are standard vendor terms a "written agreement"? (Likely)

**Answer.** The assessment is proportionate to how sensitive the data is. For Pexi it is about one page per
recipient, covering:
- what goes out (Cloudflare: IP address and requests; RevenueCat: device id and purchase state; Anthropic: product
  names only, no personal information);
- why it goes;
- the protections: encryption in transit, the vendor's data processing terms, no model training on Anthropic API
  data under its commercial terms;
- the destination's legal framework (US law, including government access);
- the conclusion.

On the agreements: the Act asks for a "written agreement", not a signed paper one. A data processing addendum that
Pexi accepted online is a written agreement in the ordinary sense. Practitioners treat the major vendors' standard
addendums as enough when the data is not sensitive.

Open Food Facts and the OSM map servers receive nothing personal, because Pexi's server makes those calls. They need
a line in the assessment saying so, not an agreement.

**Recommendation.**
- Download and keep dated copies of the Cloudflare, Anthropic and RevenueCat data processing terms.
- Write the three one-page assessments. I can draft them: about 30 minutes, no cost.

### 4. Is Pexi "likely to be accessed by children" under the OPC Children's Privacy Code, and does the Code bind now? (Likely)

**Yes, likely accessed.** Pexi's own Terms invite all ages and it is rated 4+. A regulator would find "a reasonable
probability of child access" almost automatically, and the Code applies "regardless of whether children are the
intended or primary audience".

**Does it bind? Not as law.** The Code is the OPC's statement of how it reads PIPEDA. Only PIPEDA binds, and the
Federal Court decides in the end. In practice, though, the OPC will measure Pexi against the Code in any complaint
investigation, so treat it as the standard. Comments close January 20, 2027.

**Recommendation.** Write the "likely accessed: yes, here is what we do about it" record now. The Code asks for that
decision in writing, and it costs one page.

### 5. Is Terms s.2 plus the privacy page's "Children" section enough, or must there be an in-app parental step for under-13s? (Unsettled)

**Answer.** A clause in the Terms isn't a parent's consent. The Code expects consent from a parent "in all but
exceptional circumstances" for collection that needs consent from a child under 13.

The question is which collection needs consent. Under PIPEDA, what is necessary to provide the service can rest on
implied consent when the data is not sensitive, and Pexi asks no name, email or birth date. The parts that clearly
need a choice are optional:
- location, which the Code treats as sensitive for children and wants off by default (it already is);
- typed prices shared with others.

**Honest risk read.** A strict reading of the Code points to an age question at the start with a parent step for
under-13s. You ruled no 18+ checkbox and "all ages"; an age screen is a different thing, but it still costs some
onboarding conversion. Enforcement is complaint-driven, and Pexi holds no name, contact or account. The likely cost of
not having a gate is an OPC complaint that ends in recommendations, not a fine. PIPEDA's fines attach to breach
reporting and obstruction, not to consent.

**Recommendation for 1.0.** No age gate. Do three things instead:
- write the record from question 4;
- keep location off by default with the "under 14, ask a parent" line;
- revisit if a complaint arrives or the Code's final version adds a deadline.

### 6. Do Anthropic's minors guidelines apply, is a price estimate a "high-risk" use, and is there a minors clause in the commercial terms? (Likely)

**Answer.**
- **Minors guidelines: probably not.** They apply where minors "interact directly" with the model. In Pexi the server
  sends a product name and gets back a number range; nobody talks to Claude. Pexi already meets the guidelines' main
  "must" anyway, because estimates are labelled as AI-made.
- **"High-risk" use: no.** The Usage Policy's list concerns decisions that affect a person's finances, such as
  credit, housing or employment. A grocery price range is not that kind of decision.
- **Commercial terms:** the copy read (June 2025) has no age clause. Check the version in force when the API account
  was opened.

**Recommendation.** One paragraph in the "likely accessed" record explaining why the guidelines don't apply.

### 7. Is a subscription bought by a minor without Ask to Buy enforceable, and what refund practice? (Solid on the rule, likely on the outcome)

**Answer.**
- **Ontario:** at common law, a contract with a minor is voidable at the minor's option except for necessaries. A
  price app is not a necessary, so a minor can undo it. (From knowledge, not re-checked.)
- **Quebec:** the Civil Code lets a minor contract for "usual and ordinary needs" and lets the minor annul for
  lesion (arts. 157 and 163, from knowledge, not re-checked). A $3.99 subscription may count as ordinary for a teen.

**In practice this doesn't matter much.** Pexi can't refund an App Store purchase itself; only Apple can.

**Recommendation.** When a parent writes in, reply the same day with Apple's refund link (reportaproblem.apple.com)
and a line saying Pexi supports the refund. Never contest a parent's refund. Put this line in the support replies.

### 8. Does an IP address in a server log trigger the PIPEDA breach record and the Quebec incident register? (Likely)

**Answer: yes for the records, rarely for notification.**
- **PIPEDA s.10.3** requires a record of every breach involving personal information. Under question 2, an IP log
  counts. Keep the records two years.
- **Quebec s.3.8** requires every confidentiality incident to go in the register.
- **Notification** to the OPC, the CAI and the people affected is only required when there is a real risk of
  significant harm (Quebec: "serious injury"). Leaked IP logs and random device ids alone almost never reach that
  bar.

**Recommendation.** The breach plan now being drafted covers the register.

## Apple rating

### 9. Is "None" defensible for alcohol references, with liquor products and prices in the catalogue? (Likely)

**Answer: yes, defensible.** Apple's descriptor covers "references to or depictions of the consumption of
alcohol". A shelf price for a bottle is a reference to a product, not to drinking it, and Pexi doesn't encourage
consumption (guideline 1.4.3).

The worst outcome is an App Review rejection that asks for 13+. That costs a resubmission, not a fine.

**Recommendation.** Keep 4+ with "None". If Apple objects, the fallback is ready: answer "Infrequent" (13+). A 13+
rating doesn't conflict with the all-ages Terms; Apple only forces an override when the Terms' minimum age is higher
than the rating. Re-answer the new descriptors before January 12, 2027.

## Advertising and consumer law

### 10. What counts as an "adequate and proper test" for a crowd-sourced and model-estimated verdict? (Likely)

**Answer.** The courts have said the test depends on the claim:
- it must be done before the claim is made;
- it must reflect real use;
- it needs to be reasonable, not scientifically certain.

(Commissioner of Competition v Chatr Wireless, 2013 ONSC 5315, from knowledge, not re-checked.)

For Pexi, "the test" is the method plus measured accuracy: how often the shown range contains the real shelf price
on held-out store prices. Store-listing claims such as "know if a price is fair" are where this bites, more than any
single verdict.

**Recommendation.**
- Keep a dated one-page note of how each verdict kind is computed, with a measured hit rate from the answer-key runs.
- Avoid "best price", "lowest price" and any savings figure in marketing unless measured.

Cost: the note is an hour, mostly existing numbers.

### 11. Does a disclaimer on the verdict screen reduce exposure under the "general impression" rule? (Solid)

**Answer.** Only if it is part of the impression. Fine print doesn't cure a misleading headline, under s.74.01(4) and,
for Quebec consumers, Richard v Time Inc., 2012 SCC 8 (credulous and inexperienced consumer, general impression;
from knowledge, not re-checked).

Pexi already does the right thing: the confidence label ("Not fully confident", "Pexi's estimate") sits next to the
verdict, not in the Terms.

**Recommendation.** Keep the label beside every low-confidence verdict, and never shrink it in a redesign.

### 12. How do the "ordinary price" volume and time tests apply if the app shows "usual", "was" or "typical" prices? (Unsettled, low risk)

**Answer.** s.74.01(2) and (3) cover any representation about the price at which like products are "ordinarily
supplied" in the market. "Typical price" and the screen line "X% under the typical price" come close to that. The
tests ask for substantial sales or a substantial time at that price, which a price-observation app can't show.

The provisions aim at sellers inflating "regular" prices to fake discounts, and Pexi sells no groceries. Exposure is
low, but nonzero, because Pexi promotes a paid tier.

**Recommendation.** The cheapest cover is wording: "price range seen" and "% under prices seen" instead of "typical
price". That is customer copy, so it's your call.

### 13. For an Apple in-app purchase, is Pexi or Apple the "merchant" under the Quebec CPA, and what must Pexi add? (Likely)

**Answer: Pexi is the merchant.** Apple's Canada agreement makes Apple Canada Pexi's "agent" for sales to Canadian
users, so the seller in law is the developer. Apple's purchase sheet already gives the express accept step and the
price, and the Pexi paywall shows the period, auto-renewal, how to cancel, and the Terms and privacy links.

**What s.54.4 still wants:**
- the merchant's name, address, telephone and email;
- the refund conditions.

**What happens if they're missing:** under s.54.8 a consumer can cancel within days and be refunded, which for a
$3.99 plan costs almost nothing.

**Recommendation.**
- Add one fine-print line under the paywall: "Sold by Jamin Xu (Pexi). Contact: [support email]. Refunds are handled
  by Apple."
- Skip the street address and phone unless you get a business address. Publishing a home address has a real cost,
  and leaving it out has a tiny one.

### 14. Do the 2026 amendments (cancellation button, free-period notice) apply to an Apple-billed subscription, and from when? (Likely)

**In force:** three law firms say the cancellation button and the notice before a free period ends took effect
September 12, 2026, with other parts in force June 12, 2026 (secondary sources, three firms agree).

**The button applies** because Pexi is the merchant (question 13). Pexi's "Manage subscription" row on the You screen
opens Apple's subscriptions page, where one tap cancels. That likely meets "a button accessible online and readily
identifiable" if it is easy to find.

**Recommendation.**
- Label it "Manage or cancel subscription" and show it to every Plus subscriber.
- **Free trial: do not offer one at launch.** The paywall supports a trial, but if one is switched on in App Store
  Connect, Quebec needs a written notice before it converts. Pexi has no email address to send that notice to. Apple
  does send its own renewal emails, but whether they meet the notice rule is unsettled. Your call if you want a trial
  anyway: the cost is refunds to Quebec subscribers who complain.

### 15. Redraft Terms s.12 and s.11 to meet CPA s.11.2 and s.10. (Solid that the current text conflicts)

**Proposed s.12, Changes:**
> Pexi may change, suspend or stop at any time. We may update these terms. If a change affects your Pexi Plus
> subscription, such as its price or what it includes, we will tell you in the app at least 30 days before it takes
> effect, and you can cancel before then at no cost. If you live in Quebec, a change applies to you only if it
> concerns your subscription's price, its allowance of scans or its features. You will get written notice at least
> 30 days before the change, showing the new clause and the old one, and you may cancel without cost or penalty up to
> 30 days after it takes effect. You can stop using Pexi at any time by deleting the app.

**Proposed s.11, last sentence replaced by:**
> Nothing in these terms limits a liability that the law where you live does not allow to be limited. If you are a
> consumer in Quebec, this section does not apply to the extent it would free Pexi from the consequences of its own
> act or that of its representatives.

**Proposed addition to s.13, Governing law:**
> This choice of law does not take away the protection that the law of the place where you live gives you as a
> consumer.

Quebec's CPA also requires a clause that doesn't apply in Quebec to be followed immediately by a statement saying so
(s.19.1, from knowledge, not re-checked). The s.11 wording above meets that.

The French text must say the same, so Aurik should translate it.

**One open point:** s.11.2's written notice has to reach the consumer, and Pexi holds no email address. An in-app
notice shown before the change is the best available. For price rises, Apple asks subscribers to agree anyway.

### 16. Does the Charter of the French language reach an Ontario publisher, are Apple's terms a Pexi contract, and is a French store listing required? (Likely)

**Answer.**
- **Reach:** the Charter gives Quebec consumers the right to be served in French. The OQLF reads its rules as covering
  apps offered to Quebec consumers.
- **Apple's terms:** those are Apple's contract and Apple's obligation. Pexi's own Terms and privacy page must exist in
  French and be offered before the English is accepted (s.55). They exist.
- **Store listing:** it is commercial advertising (s.52 and s.58), so a French listing is expected.

**Recommendation.**
- Add a French (Canada) localization to the App Store listing: name, subtitle, description and screenshots text, with
  Aurik translating.
- Make sure a French-language phone sees the French Terms at the "Before you start" tick.

## Trademark and business

### 17. Likelihood of confusion between PEXI and SPEXI, PEXIL, PIXID and the PIXI family. (Likely)

**The test.** Confusion is judged on everything around the marks: how distinctive each is, how long it's been used,
the goods, the trade channels and, most of all, how much the marks look and sound alike (Trademarks Act s.6(5);
Masterpiece v Alavida, 2011 SCC 27, from knowledge, not re-checked).

**Each mark:**

| Mark | Business | Overlap with Pexi | Confusion |
|---|---|---|---|
| SPEXI | drone survey software sold to businesses | different goods and buyers | unlikely |
| PEXIL | chemical toxicity screening | nothing shared | unlikely |
| PIXID | recruitment software | sounds different | unlikely |
| PIXI family | phones, photo booths, projectors | close in sound, but these are devices, not a price app | unlikely |

**Limit:** this covers the Canadian register only. Unregistered use and US marks weren't searched, which matters
less because Pexi is Canada-only.

**Recommendation.** The name is reasonably safe in Canada.

### 18. Oppose or watch PEXIL? File PEXI now on a proposed-use basis, and in which classes? (Solid on the procedure)

**PEXIL:** don't oppose. There are no grounds and nothing to gain. Watch it if you like.

**Filing:** Canada no longer has use or proposed-use filing bases; they were removed in June 2019 (from knowledge,
not re-checked). You just file, and you can do it yourself online at CIPO.

**Classes:**
- 9: downloadable software;
- 35: providing consumer price comparison information;
- 42: software as a service.

The government fee is a few hundred dollars for the first class plus less for each extra class; check the current
fee on CIPO's page before paying. Examination takes more than a year.

**Recommendation.** File when there is a first paying subscriber, or sooner if someone else starts using a similar
name. Filing early fixes the date of the claim.

### 19. Is the app name alone enough to need Ontario business name registration, and sole proprietorship or incorporation? (Likely)

**Registration: likely yes.** The support page, the privacy page and the store all present "Pexi" to the public as the
business, while the seller is Jamin Xu. That is identifying the business "to the public under a name other than his
own name" (s.2(2)). The cost of skipping it is small: a fine of up to $2,000 and no right to sue in Ontario without
leave. Registering online costs a small fee, which wasn't checked.

**Recommendation.**
- Register "Pexi" as a sole proprietorship name before charging.
- Don't incorporate yet. It adds:
  - a corporate tax return and annual filings;
  - converting the Apple account to an organization account, which needs a D-U-N-S number;
  - its own GST number.
- It also protects personal assets, which matters little at Pexi's current risk.
- Revisit when revenue is real, or if the AMD agreement asks how outside work is structured.

## Data licence

### 20. Is the merged catalogue a Derivative Database or a Collective Database under the ODbL? (Likely)

**Answer: Derivative.** A Collective Database must hold the ODbL data "in unmodified form". Pexi normalizes, merges
and enriches Open Food Facts rows, which is a "modification" and an "arrangement".

### 21. Does "on request" satisfy s.4.6's duty to "offer recipients a machine-readable copy"? (Likely)

**Answer: very likely yes**, if the offer is visible where users meet the data. The ODbL says "offer", like the GPL's
written offer, and an offer to supply on request is an offer.

There is a second route under s.4.6: offer a file describing "the method of making the alterations" instead of the
whole database. Publishing the import method may be the cheaper way to comply.

**Recommendation.**
- State the offer on the in-app data and licences screen, with the contact address.
- Answer any request within a reasonable time with an export of the ODbL-derived rows.

### 22. Can Icecat's "All rights reserved" data be merged with ODbL data in one distributed database? (Likely)

**Answer: not safely.** If Icecat fields sit inside the rows that are derived from the ODbL data, s.4.4 requires
those rows to be offered under the ODbL, and Icecat's terms don't allow that.

The clean structure:
- keep Icecat data in its own tables, joined only when an answer is shown;
- leave Icecat out of any ODbL copy Pexi hands over.

A combined answer on screen is a Produced Work, which the share-alike rule doesn't reach (s.4.3 and s.4.5).

**Recommendation.** Check the catalogue build keeps Icecat separable. That is a code check I can run.

### 23. Is the answer API response a Produced Work, and are Open Food Facts images shown? (Likely)

**Answer: yes, a Produced Work.** It needs only the s.4.3 notice: wording "reasonably calculated" to tell people the
content came from the database and is available under the ODbL. The in-app data and licences screen likely meets
that. A short "Data: Open Food Facts (ODbL)" line on answers drawn from it would make it certain.

**Images:** the only image found on the answer screen is a small scan thumbnail, probably the shopper's own photo.
That wasn't confirmed. If Open Food Facts product photos are ever shown, they are CC BY-SA and need their own credit.

## Tax

### 24. Must Pexi register for GST/HST below the $30,000 small-supplier line, and what does registering voluntarily mean? (Solid on the contract, likely on the rest)

**Answer.** Tax law lets a small supplier stay unregistered, but Apple's contract makes registration a condition of
selling paid apps as a Canadian resident (Exhibit C and s.3.2(b)). So, in practice, register.

**What registering voluntarily means:**
- you file GST/HST returns, usually yearly at this size;
- you can claim back the GST/HST you pay on business costs as input tax credits: Apple's commission tax, and any
  Canadian tax on hosting or other services.

That usually puts a small developer slightly ahead.

**Recommendation.** Register online with CRA (a business number plus a GST/HST account, no fee), send Form GST506 to
Apple, and enter the number in App Store Connect.

### 25. After Apple collects and remits under the s.177(1.1) election, what goes on the return, and is the commission tax a credit? (Likely)

**Answer.**
- Under the election, Apple as the agent accounts for the tax on Pexi's sales, so Pexi doesn't report that tax again.
- Pexi claims, as input tax credits, the GST/HST on Apple's commission shown on the monthly tax-on-commission
  invoices, plus any other business tax paid. Many returns will be a small refund.

The exact lines to fill in are a question for CRA's free business enquiries line.

**Recommendation.** Keep the monthly invoices from App Store Connect.

### 26. Does incorporating change the Apple account, the tax position or the Quebec exposure? (Likely)

**Answer: yes to all three, and none of it is needed now.**
- **Apple:** an organization account needs a D-U-N-S number, and Apple supports migrating an individual account to an
  organization account.
- **Tax:** the corporation files its own return and has its own GST number.
- **Quebec:** the corporation becomes the "enterprise". The maximum penalties are higher for a company, but personal
  assets are shielded.

**Recommendation.** Same as question 19: not before revenue justifies the yearly costs.

---

## What a lawyer would also have flagged, beyond the 26

- **Governing-law clause:** Terms s.13 needs the consumer-protection carve-out in question 15. Quebec's Civil Code keeps
  a consumer's home-province protection whatever the contract says (art. 3117, from knowledge, not re-checked).
- **Support address:** the public support address still carries the old Shin name. That is a trademark exposure next to
  Nongshim's Shin Ramyun, and Pexi's own rules ban the name from public view. Move it to a Pexi address.
- **The written privacy procedures** (data requests and breach plan): PIPEDA's accountability principle and Quebec s.3.2
  both expect them in writing. They are being drafted now.

## Ranked actions (cost you can name, cheapest first within each band)

**Before charging money:**
1. Register for GST/HST and send Form GST506 to Apple (question 24). Apple's paid-apps agreement makes it a condition of selling.
2. Make the Terms changes in question 15, in English and French. Costs a fine plus refunds in Quebec if skipped.
3. Add the paywall seller line (question 13), and label "Manage or cancel subscription" (question 14).
4. Don't switch on a free trial (question 14).
5. Register the Pexi business name in Ontario (question 19).

**Before or right after launch:**
6. Write the "likely accessed by children" record, including the minor's-benefit reasoning and the Anthropic paragraph
   (questions 2, 4, 5, 6).
7. Write the three transfer assessments, and keep copies of the vendors' data processing terms (question 3).
8. Add the French store listing (question 16).
9. Write the verdict-method note with its measured hit rate (question 10).
10. Move the support email to a Pexi address.

**When convenient:**
11. File the PEXI trademark (question 18).
12. Check that Icecat data is kept separable (question 22).
13. Decide on "price range seen" wording instead of "typical price" (question 12).
14. Decide on the under-14 line on the location screen (question 2).
15. Re-answer Apple's age rating descriptors before 2027-01-12 (question 9).
