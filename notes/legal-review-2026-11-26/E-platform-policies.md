# Legal review, area E: platform policies

Reviewed 2026-11-26 (system clock) against the live pages. This is a policy-fit review, not legal advice. Pexi facts come from `native/android/app/src/main/AndroidManifest.xml`, `native/ios/App/App/Info.plist`, `native/ios/App/App/PrivacyInfo.xcprivacy`, `native/package.json`, `native/capacitor.config.json`, `app/public/js/*`, `docs/store/*`.

## Sources and how far each was read

| Source | URL | Page date | Units swept |
|---|---|---|---|
| Apple App Review Guidelines | https://developer.apple.com/app-store/review/guidelines/ | "Last Updated: October 16, 2026" | all of 1-5 (30 top-level sections, 125 numbered clauses), read in full |
| Google Play Developer Program Policy Centre | https://support.google.com/googleplay/android-developer/topic/9858052 (index) | pages undated; 2027 changes in the Preview pages | 55 policy pages in the index; 34 fetched, 15 read closely (User Data, Permissions, Preview Permissions, Preview Subscriptions, UGC, AI-Generated, Target API, Payments, Subscriptions, Metadata, Content Ratings, Functionality, Misrepresentation, Families, Play Console Requirements); the rest classified from title and first lines |
| Anthropic Commercial Terms | https://www.anthropic.com/legal/commercial-terms | "Effective Jun 17, 2025" | 13 sections A-M, read B, C, D in full |
| Anthropic Usage Policy | https://www.anthropic.com/legal/aup | "Effective Nov 12, 2026" | Universal Usage Standards (all headings) and Additional Use Case Guidelines (headings, consumer chatbots, minors) |
| RevenueCat Terms of Use and DPA | https://www.revenuecat.com/terms/ , https://www.revenuecat.com/dpa/ | undated | 10 sections of the Terms (read 2.2, 3.2, 3.3, 4.3), DPA roles clause |

Not verified: Apple App Privacy details and App Store Connect questionnaire pages, the Apple privacy-manifest and export-compliance developer pages, the Play "Data safety" help article, Play's account-deletion help article, and Anthropic's "products serving minors" support article were not fetched. Rules below on those come from the guideline text that points to them, from the repo's own notes, or are marked UNVERIFIED. RevenueCat's "standard published policies" (Terms 3.3) were not located (the acceptable-use URL returned 404).

## Top gaps (ranked by named cost)

1. **No way to withdraw consent, one tap covers everything (Apple 5.1.1(ii), 5.1.2(i); Play User Data and Data safety).** Since 2026-11-25 (`app/public/js/screens/agree.js`, `track.js:68`) the usage switch and the Claude switch are gone; "Accept and continue" is the only control. Apple 5.1.1(ii) says apps must give "an easily accessible and understandable way to withdraw consent", and 5.1.2(i) wants third-party AI sharing disclosed and "explicit permission". Cost: App Review rejection (a resubmission, not a ban). Smallest fix: keep one "Usage data" switch in Settings that stops `track.js`, and put the Claude line on the agree screen as its own sentence above the button. Counter-view: what goes to Claude is a product name, brand, size, category and country, not personal data, so 5.1.2(i) is arguable. A typed name can contain anything, so do not rely on it.
2. **Android declares ACCESS_FINE_LOCATION (Play Location Permissions: minimum scope).** Manifest lines 46-47 declare fine and coarse; the app only uses a roughly 1 km cell (`geocell.js`). Play says request "coarse instead of fine". From 2027-01-27, apps targeting API 37+ must use the Android location button and justify fine location in a Console declaration (Preview Permissions page). Cost: Play review question or rejection now, a hard declaration at the next target bump. Smallest fix: drop the fine permission. UNVERIFIED whether the Capacitor web bridge then still shows the prompt; test on a device.
3. **Data safety answers drifted from the app.** `docs/store/play-listing.md` Data safety draft says usage collection is "optional" and Anthropic data is sent "only if the person said yes". Both stopped being true on 2026-11-25. Cost: Play can remove the app for a Data safety label that misstates collection. Smallest fix: re-file as "required", re-read every row once the consent change in gap 1 is settled.
4. **Age position is split three ways.** Terms say all ages with a parent's permission; Play Target audience must be chosen (Families policy applies if it includes under-13s, and then SDK and ads rules bite); Anthropic's Usage Policy points products serving minors to extra guidelines (article not read). Cost: Play Families review or Anthropic account action. Smallest fix: pick a 13+ (or 18+) Target audience in Play Console and re-read Anthropic's minors article before launch. A decision for Jamin.
5. **Terms do not define objectionable entries (Play UGC).** Pexi's UGC is a typed price and store name shown to other shoppers. Play wants terms accepted before UGC, objectionable content defined, and an in-app report. `terms.html` has no such sentence (grep found none). Thumbs-down on a verdict (`camera.js:806-810`) is the nearest report path. Cost: low, a review comment. Fix: one Terms sentence barring false or abusive entries, and a "report a problem" option in the thumbs-down reasons.
6. **Android Pexi Plus is not sellable yet.** `native/config/revenuecat.config.json` has an empty Android key and no Play products exist (per `play-listing.md`). Cost: Play functionality/misleading-metadata flag if the description mentions Plus. Fix: finish the Play products and RevenueCat link, or drop the Plus paragraph from the Play listing until then.
7. **Apple age-rating re-answer due 2027-01-12** (date from `listing.md`, not re-checked on Apple's page). Cost: lost ability to update the app. Owner already named in the repo.

## Apple App Review Guidelines (every section)

Verdict key: Applies (OK or GAP) or N/A with reason.

| Section | Verdict | Pexi evidence / reason |
|---|---|---|
| 1.1 Objectionable Content (1.1.1-1.1.7) | N/A | No such content; liquor and tobacco appear only as priced product names (see 1.4.3) |
| 1.2 User-Generated Content | Applies, OK-minor | Typed price and store name feed other shoppers (`server.ts` `/api/scan-price`). Needs filter, report, block, contact. Contact is published; thumbs-down exists; no block (no 1:1 content). See gap 5 |
| 1.2.1 Creator Content | N/A | No creators |
| 1.3 Kids Category | N/A | Not in Kids Category by decision (`listing.md`); no kids marketing |
| 1.4.1-1.4.2 Medical, dosage | N/A | No health content |
| 1.4.3 Tobacco, drugs, alcohol | Applies, OK | Price verdicts for cigarettes/liquor (`category-map.ts:85`) neither encourage use nor sell; ties to age rating answer |
| 1.4.4-1.4.5 DUI, risky activities | N/A | None |
| 1.5 Developer Information | Applies, OK | Support page, `usepexiapp@gmail.com` in app (`you.js:122`) |
| 1.6 Data Security | Applies, OK | HTTPS, Keychain for device secret (`capacitor-secure-storage-plugin`) |
| 1.7 Criminal activity reporting | N/A | None |
| 2.1(a)(b) App Completeness | Applies, OK | Review notes with demo path and barcode in `listing.md`; invite gate must be confirmed live (listing OPEN Q2); IAP visible on Plus screen |
| 2.2 Beta testing | N/A | Not a beta listing |
| 2.3.1-2.3.14 Metadata | Applies, OK | No unlimited-scan claim, name 27 of 30 chars, IAP shown in description; 2.3.6 age answers honest per `listing.md` |
| 2.4.1-2.4.5 Hardware | Applies, OK | iPhone app; 2.4.1 iPad optional; 2.4.5 Mac App Store N/A |
| 2.5.1 Public APIs | Applies, OK | Capacitor plugins only |
| 2.5.2 No downloaded code | Applies, OK | Local `www` bundle, no `server.url` (`capacitor.config.json`); `/api/pack` is data only |
| 2.5.3-2.5.5, 2.5.7-2.5.13, 2.5.15-2.5.18 | N/A | No malware, background services, home-screen, switches, Siri, CallKit, Matter, ads, file picker, widgets |
| 2.5.6 WebKit | Applies, OK | WKWebView via Capacitor |
| 2.5.14 Consent when recording | Applies, OK | Camera shown live, OS prompt, purpose string; no recording kept |
| 2.5.19 Hidden features | Applies, OK | Developer tools off in store builds (`dev-mode.js` `storeBuild`) |
| 3.1.1 In-app purchase | Applies, OK | Plus via StoreKit through RevenueCat; no outside purchase link |
| 3.1.1(a) Other purchase methods | N/A | No external link |
| 3.1.2(a) Permissible subscriptions | Applies, OK | 100 scans/week vs 10, 7+ day period, works on all devices |
| 3.1.2(b) Upgrades/downgrades | Applies, OK | One group, monthly and yearly |
| 3.1.2(c) Subscription information | Applies, OK | Price, period, renewal, cancel steps, Restore, Terms and Privacy links on the paywall (`paywall.js:167-303`); yearly price leads, monthly equivalent small (`:143-145`) |
| 3.1.3(a)-(g), 3.1.4, 3.1.5 | N/A | No reader/enterprise/P2P/physical goods/crypto |
| 3.2.1-3.2.2 Other business model | Applies, OK | 3.2.2(x) no forced rating: `review-prompt.js` uses Apple's prompter; (v) arbitrary location limit: app is Canada-focused, a market choice not a block (confirm) |
| 4.1 Copycats | Applies, OK | Name "Pexi" own mark; trademark work in `notes/` |
| 4.2 Minimum functionality (4.2.1-4.2.7) | Applies, OK | Native ML Kit barcode and text recognition, haptics, camera; not a website wrapper. 4.2.3(ii) no big first-launch download |
| 4.3 Spam | Applies, OK | One bundle ID. 4.3(b) grocery price apps exist; differentiation is the scan-to-verdict flow |
| 4.4 Extensions, 4.5.1-4.5.6 Apple sites/services | N/A | None used |
| 4.6 Intentionally omitted | N/A | |
| 4.7 Mini apps, chatbots, plug-ins | N/A (watch) | Claude output is a price range, not a chatbot or downloaded software; not offering code |
| 4.8 Login services | N/A | No sign-in |
| 4.9 Apple Pay | N/A | Not used |
| 4.10 Monetizing built-in capabilities | Applies, OK | Camera is not what is charged for; scan cap is on lookups |
| 5.1.1(i) Privacy policy | Applies, OK | Link in listing and in app (`you.js:429-434`, `agree.js`); states data, retention, deletion |
| 5.1.1(ii) Permission and withdrawal | **GAP** | Gap 1 |
| 5.1.1(iii) Data minimisation | Applies, OK-minor | Photo library strings in `Info.plist:31-34` exist for the camera plugin; reviewer may ask why |
| 5.1.1(iv) Respect settings | Applies, OK | App works with camera and location off |
| 5.1.1(v) Account sign-in and deletion | N/A | No account. Delete-my-data by email exists (`you.js:112-132`) |
| 5.1.1(vi)-(x) | N/A | No password harvesting, SafariVC, scraping personal data, regulated field, contact request |
| 5.1.2(i) Sharing with third parties incl. AI | **GAP (arguable)** | Gap 1; privacy policy names Anthropic, RevenueCat, Open Food Facts, Overpass |
| 5.1.2(ii)-(vii) | Applies, OK / N/A | (ii) no repurposing; (iii) device id keyed, not a profile; (iv)-(vii) Contacts, Health, Apple Pay not used |
| 5.1.3 Health, 5.1.4 Kids | N/A | No health data; not a kids app (see gap 4) |
| 5.1.5 Location Services | Applies, OK | Off until turned on, purpose string `Info.plist:29-30`, only coarse cell sent |
| 5.2.1-5.2.5 IP | Applies, OK | 5.2.2 third-party data: Open Food Facts (ODbL) and Overpass (OSM) terms belong to area F |
| 5.3 Gaming, 5.4 VPN, 5.5 MDM | N/A | None |
| 5.6 Code of Conduct, 5.6.1 reviews, 5.6.2 identity, 5.6.3 discovery fraud, 5.6.4 quality | Applies, OK | In-app review uses Apple's API; seller name Jamin Xu individual |
| App Privacy details | Applies, OK pending gap 1 | `listing.md` table matches `PrivacyInfo.xcprivacy` row for row; tested by `paywall-review.test.mjs`. UNVERIFIED against Apple's live questionnaire |
| Account/data deletion rule | N/A (no accounts) | Covered by 5.1.1(v) |
| Export compliance | Applies, OK | `ITSAppUsesNonExemptEncryption` false (`Info.plist:25-26`); HTTPS and OS crypto only. UNVERIFIED on Apple's page |
| Privacy manifest, required-reason APIs | Applies, OK, UNVERIFIED | App declares FileTimestamp C617.1 only (`PrivacyInfo.xcprivacy`); pods carry their own. Confirm with Xcode's privacy report on the archive (Mac) |

## Google Play (every policy-centre page)

| Page | Verdict | Pexi evidence / reason |
|---|---|---|
| Child Endangerment | N/A | None |
| Inappropriate Content | N/A | None |
| Financial Services | N/A | A price checker is not a financial product |
| Real-Money Gambling | N/A | Draws and bounties ruled out |
| Illegal Activities | N/A | |
| User Generated Content | Applies, GAP-minor | Gap 5; terms accepted before use (`agree.js`) |
| Health Content and Services | N/A | |
| Blockchain-based Content | N/A | |
| AI-Generated Content | Applies, OK-minor | Claude estimates are labelled "Estimated by AI" (`ui-strings.js:284-288,442`). Report/flag need: thumbs-down in app, no exit needed. Policy targets generative apps, so applicability is arguable |
| Age-Restricted Content and Functionality | N/A | |
| Intellectual Property | Applies, OK | Pexi owns name; data sources in area F |
| User Data (personal and sensitive, prominent disclosure, Data safety, Privacy Policy) | Applies, GAP | Gap 3; policy has app name, developer, retention, contact |
| User Data: Account Deletion | N/A | No in-app accounts. Deletion by email exists |
| Permissions and APIs: Location | Applies, GAP | Gap 2 |
| Permissions: other restricted (photo/video, SMS, all-files, package, accessibility, health, VPN, exact alarm, full-screen intent) | N/A | None in manifest; camera, vibrate, internet, location only |
| Device and Network Abuse | N/A | |
| Deceptive Behavior | Applies, OK | Behavior transparency: the descriptions match features |
| Misrepresentation | Applies, OK | Developer identity accurate |
| Target API Level | Applies, OK | `targetSdk` 36 (`variables.gradle:4`); confirm against Google's timeline at each release |
| Preview: Permissions (effective 2027-01-27, 2027-04-14, 2027-08-25) | Applies | Fine-location declaration, see gap 2; others N/A |
| SDK Requirements | Applies, OK | RevenueCat, ML Kit, Capacitor plugins; SDK data must be in the Data safety form |
| Malware; Mobile Unwanted Software, Hostile Downloaders, Ad Fraud, Unauthorized Use of System Functionality, Social Engineering | N/A | None |
| Impersonation | Applies, OK | Name distinct from other apps |
| Payments | Applies, OK | Digital subscription via Play Billing through RevenueCat; groceries are not sold in the app |
| Ads | N/A | No ads |
| Subscriptions and Preview (2027-01-27) | Applies, OK | Terms disclosed, yearly price leads, dismiss button present (`paywall.js:233,295`); no trial or eligibility discount. Android purchase not live (gap 6) |
| Families Self-Certified Ads SDK Program | N/A | No ads SDK |
| App Promotion, Metadata, User Ratings/Reviews/Installs, News and Magazines | Applies, OK / N/A | Title has no emoji or price text; no incentivised reviews; not a news app |
| Content Ratings | Applies, OK | IARC questionnaire answers prepared in `play-listing.md`; alcohol/tobacco "name only" answer may raise the rating |
| Spam | Applies, OK | One listing |
| Functionality, Content, and User Experience | Applies, OK | Not a limited-content app; server must be up for review |
| Android Auto, Emoji, Instant Apps, TV, XR, Wear OS | N/A | |
| Families Policies, Families Ads SDK | Applies if Target audience includes under-13 | Gap 4 |
| Enforcement: Policy Coverage, Process, Violations and Appeals | Applies (process) | Appeal route exists |
| Play Console Requirements | Applies | Package registration for developer verification (3.4) and reviewer access (3.3, invite gate); personal accounts need 12 testers for 14 days (per repo, not on this page); Pexi is an individual developer |
| Updates and Other Resources (Other Resources, Developer Support, Policy Archive, PolicyBytes, Developer Program Policy) | N/A | Reference pages |
| Data safety section | Applies, GAP | Gap 3 |

## Anthropic (Commercial Terms and Usage Policy)

Pexi calls the API with `ANTHROPIC_API_KEY` (`identify/src/range-ask.ts:31-32,399`), so the Commercial Terms apply, not the consumer terms.

| Section | Verdict | Pexi |
|---|---|---|
| A Services (A.1 may power own products; A.2 third-party; A.3 feedback) | Applies, OK | Consumer app powered by the API is expressly allowed |
| B Customer Content (inputs, outputs, no training) | Applies, OK | Pexi owns outputs; Anthropic may not train on API content |
| C Data Privacy (DPA) | Applies, OK | Sent: product name, brand, size, category, country. No device id, no image (`range-ask.ts:12,237-240`) |
| D.1 Compliance with data laws | Applies | Privacy policy names Anthropic |
| D.2 Usage Policy, Supported Regions, cooperation | Applies, OK | Canada; users' compliance is Pexi's duty; typed names are user input |
| D.3 Notify users outputs may be wrong | Applies, OK | Terms and policy say AI content "can be wrong"; "Estimated by AI" label |
| D.4 Use restrictions | N/A | Not competing or reselling |
| D.5 Account security | Applies | Key kept in server `.env` |
| E Confidentiality, F IP, G Publicity | N/A / OK | Anthropic may name Pexi as a customer unless opted out (opt-out form) |
| H Fees, I Termination and suspension | Applies | Suspension risk if the Usage Policy is breached; cost is Claude estimates stop |
| J-M Disputes, indemnification, warranties, misc. | N/A | Note K: Anthropic indemnity is limited; not Pexi-specific |
| Usage Policy: Universal Usage Standards (all headings, incl. children's safety, disinformation, privacy, high-risk use cases) | Applies, OK | Price estimates; low-risk. Typed text could try prompt injection; output is parsed to a price range |
| Usage Policy: consumer-facing chatbots must disclose AI | N/A | No chat; the AI label is shown anyway |
| Usage Policy: products serving minors | Applies, UNVERIFIED | Gap 4; the linked support article was not read |
| Usage Policy: agentic use, directory software | N/A | |

## RevenueCat (Terms and DPA)

| Section | Verdict | Pexi |
|---|---|---|
| 1 Definitions | N/A | |
| 2.1 Provision, 2.3 Connected Applications | Applies, OK | SDK `purchases-capacitor` 13.x; app user id is the device id (`purchases.js`) |
| 2.2 Disclosures and consents about RevenueCat and Stripe processing, in the privacy policy | Applies, OK | Privacy policy names RevenueCat; Stripe is not used (Play and Apple billing only), so no mention needed |
| 3.1 Restrictions, 3.4 Equipment | N/A / OK | |
| 3.2 Customer responsibilities, data accuracy, laws | Applies, OK | |
| 3.3 Comply with RevenueCat published policies | Applies, UNVERIFIED | Acceptable-use page not found (404) |
| 3.2 (second) Export controls | N/A | |
| 3.5 RevenueCat Billing | N/A | Not used |
| 4.1-4.2 Confidentiality, Customer Data ownership | Applies, OK | |
| 4.3 Aggregated, anonymised data | Applies, OK | RevenueCat may use aggregated data; disclose as a processor in the policy (present) |
| 4.4-4.6 Proprietary rights, publicity, removal of Customer Data | Applies | RevenueCat may remove distribution of data in breach |
| 5 Fees, 6 Term, 7 Warranty, 8 Indemnity, 9 Liability, 10 Misc. | Applies | RevenueCat may terminate (6.2); a Play key is also missing (gap 6) |
| DPA roles (Pexi controller, RevenueCat processor), sub-processors, transfers | Applies, OK | Needs mention in the privacy policy (present); transfer wording is area A |
