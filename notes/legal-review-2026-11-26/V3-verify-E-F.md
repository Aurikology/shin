# V3: verification of E (platform policies) and F (IP, name, security, ownership)

Checked 2026-11-26 (system clock; session date 2026-11-25) by re-opening each source myself. No sub-agents. Not legal advice; nobody here is a lawyer.
Verdicts: VERIFIED (quote and exact section), WRONG (what it actually says), UNVERIFIABLE (what I tried). Quotes are 25 words or fewer.
Tools used: WebFetch for Apple's guideline text; direct HTTP fetches (own text extraction) for Google Play help pages, laws-lois.justice.gc.ca, legisquebec ShowDoc, ontario.ca; the Playwright browser in my own tab (closed afterwards) for Apple documentation pages and the CIPO database; USPTO's own search backend by direct POST; iTunes Search API. No CAPTCHA met, none bypassed.

## Part 1. File E rows

### Apple App Review Guidelines (page says "Last Updated: October 16, 2026")

| # | E cites | Verdict | Evidence |
|---|---|---|---|
| E1 | Guidelines page date 2026-10-16 | VERIFIED | "Last Updated: October 16, 2026" (found at the end of the page text) |
| E2 | 5.1.1(ii) withdraw consent | VERIFIED | "Apps must also provide the customer with an easily accessible and understandable way to withdraw consent." |
| E3 | 5.1.2(i) third-party AI, explicit permission | VERIFIED, with a scope note | "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." The rule is about "personal data" |
| E4 | 5.1.1(i) privacy policy link | VERIFIED | "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app" |
| E5 | 5.1.1(iii) minimisation | VERIFIED | "Apps should only request access to data relevant to the core functionality of the app" |
| E6 | 5.1.1(iv) respect settings | VERIFIED | "Apps must respect the user's permission settings and not attempt to manipulate, trick, or force people to consent" |
| E7 | 5.1.1(v) account sign-in and deletion | VERIFIED | "If your app supports account creation, you must also offer account deletion within the app." |
| E8 | 5.1.1(vi)-(x) list (password harvesting, SafariVC, scraping, regulated field, contact request) | VERIFIED | (vi) passwords, (vii) SafariViewController, (viii) personal info compiled from other sources, (ix) regulated fields, (x) optional contact info: all present |
| E9 | 5.1.2(ii)-(vii) | VERIFIED | (ii) "Data collected for one purpose may not be repurposed without further consent"; (iii) no surreptitious profile; (iv)-(vii) Contacts, Photos, Health, Apple Pay |
| E10 | 5.1.5 Location Services | VERIFIED | "Ensure that you notify and obtain consent before collecting, transmitting, or using location data." |
| E11 | 5.1.3 Health, 5.1.4 Kids | VERIFIED | Headings "5.1.3 Health and Health Research", "5.1.4 Kids" present |
| E12 | 1.2 User-Generated Content (filter, report, block, contact) | VERIFIED | Four requirements: filter, "A mechanism to report offensive content", block abusive users, "Published contact information" |
| E13 | 1.2 row reasoning "no block (no 1:1 content)" | WRONG | Apple's 1.2 has no 1:1 exemption: "such apps must include" all four, block included. Whether price entries count as UGC under 1.2 is a separate judgement call |
| E14 | 1.1, 1.2.1, 1.3, 1.4.1-1.4.5, 1.5, 1.6, 1.7 headings and 1.4.3 tobacco/alcohol | VERIFIED | 1.4.3 "Tobacco, drugs, and excessive alcohol"; 1.5 "People need to know how to reach you"; 1.6 "appropriate security measures" |
| E15 | 2.1(a)(b) completeness | VERIFIED | 2.1(b) "If you offer in-app purchases in your app, make sure they are complete, up-to-date, visible to the reviewer and functional." |
| E16 | 2.2 Beta testing | VERIFIED | "Demos, betas, and trial versions of your app don't belong on the App Store" |
| E17 | 2.3.1-2.3.14, 2.3.6 honest age rating | VERIFIED | 2.3.6 "Answer the age rating questions in App Store Connect honestly" |
| E18 | 2.4.1, 2.4.5 | VERIFIED | 2.4.1 "iPhone apps should run on iPad whenever possible"; 2.4.5 Mac App Store listed |
| E19 | 2.5.1 public APIs | VERIFIED | "Apps may only use public APIs and must run on the currently shipping OS." |
| E20 | 2.5.2 no downloaded code | VERIFIED | "may not download, install, or execute code which introduces or changes features or functionality" |
| E21 | 2.5.6 WebKit | VERIFIED | "Apps that browse the web must use the appropriate WebKit framework and WebKit JavaScript." |
| E22 | 2.5.14 consent when recording | VERIFIED | "Apps must request explicit user consent and provide a clear visual and/or audible indication when recording" |
| E23 | 2.5.19 hidden features | VERIFIED | "Don't include any hidden, dormant, or undocumented features in your app" |
| E24 | 2.5.3-2.5.5, 2.5.7-2.5.13, 2.5.15-2.5.18 N/A list | VERIFIED | Headings match: harmful code, background, home screen, switches, SiriKit, caller ID, Matter, ads, files, widgets (2.5.7, 2.5.10 omitted) |
| E25 | 3.1.1 IAP | VERIFIED | "If you want to unlock features or functionality within your app ... you must use in-app purchase." |
| E26 | 3.1.1(a) other purchase methods | UNVERIFIABLE | Not opened separately (outside the text I pulled); the row is N/A with no claim riding on it |
| E27 | 3.1.2(a) at least 7 days, all devices | VERIFIED | "the subscription period must last at least seven days and be available across all of the user's devices" |
| E28 | 3.1.2(b) upgrades/downgrades | VERIFIED | "should not be able to inadvertently subscribe to multiple variations of the same thing" |
| E29 | 3.1.2(c) subscription information (price, period, renewal, cancel steps, Restore, links) | UNVERIFIABLE | Guideline text only says "clearly describe what the user will get for the price" and points to Schedule 2 of the Developer Program Licence Agreement, which is behind Apple login. The item list in E comes from Schedule 2 or practice, not this page |
| E30 | 3.1.3(a)-(g), 3.1.4, 3.1.5 N/A | UNVERIFIABLE | Not opened; N/A rows with no claim |
| E31 | 3.2.1-3.2.2, (v) arbitrary location limit, (x) forced rating | VERIFIED | (v) "Arbitrarily restricting who may use the app, such as by location or carrier"; (x) "must not force users to rate the app" |
| E32 | 4.1 Copycats | VERIFIED | 4.1(a)-(c) present |
| E33 | 4.2 / 4.2.3(ii) no big first-launch download | VERIFIED | "If your app needs to download additional resources in order to function on initial launch, disclose the size of the download" |
| E34 | 4.3(b) | VERIFIED | "Don't submit apps that are indistinguishable from what's already widely available." |
| E35 | 4.4, 4.5.1-4.5.6, 4.6, 4.7, 4.8, 4.9, 4.10 | VERIFIED | 4.10 "You may not monetize built-in capabilities provided by the hardware or operating system, such as ... the camera"; 4.7 chatbots/plug-ins; 4.6 omitted |
| E36 | 5.2.1-5.2.5, 5.2.2 third-party services | VERIFIED | 5.2.2 "ensure that you are specifically permitted to do so under the service's terms of use" (5.2.1 to 5.2.5 headings only partly in the text I read) |
| E37 | 5.3, 5.4, 5.5, 5.6, 5.6.1-5.6.4 | VERIFIED | 5.6.1 "use the provided API for review prompts"; 5.6.2 identity "accurate, truthful, relevant, and up to date"; 5.6.3; 5.6.4 |
| E38 | Apple App Privacy details page (E marked UNVERIFIED) | VERIFIED now | "You need to identify all of the data you or your third-party partners collect, unless the data meets all of the criteria for optional disclosure." |
| E39 | Export compliance: ITSAppUsesNonExemptEncryption false, HTTPS and OS crypto only (E: UNVERIFIED) | VERIFIED now | "Set the value to NO if your app ... only uses forms of encryption that are exempt"; "encryption built into the operating system ... HTTPS ... is exempt". See note N1 |
| E40 | Privacy manifest, required-reason API, FileTimestamp C617.1 (E: UNVERIFIED) | VERIFIED now | C617.1: "access the timestamps, size, or other metadata of files inside the app container, app group container, or the app's CloudKit container." Enforcement "Starting May 1, 2024" |

### Google Play

| # | E cites | Verdict | Evidence |
|---|---|---|---|
| E41 | Policy Centre index, "55 policy pages" | VERIFIED (approx) | I count 56 pages under the policy headings of the index (answer ids listed); the fetch said the list may be truncated |
| E42 | Location permissions, "coarse instead of fine" | VERIFIED | Current policy: "request the minimum scope necessary (for example, coarse instead of fine, and foreground instead of background)" (Permissions page 16558241) |
| E43 | Preview Permissions: from 2027-01-27, API 37+ must use location button, fine needs a Console declaration | VERIFIED | "Effective January 27, 2027 ... Apps targeting Android 17 (API 37+) must use the Android location button ... To use ACCESS_FINE_LOCATION, you must submit a Play Console declaration" |
| E44 | Preview dates 2027-04-14, 2027-08-25 | VERIFIED | "Effective April 14, 2027" (AppFunctions); "Effective August 25, 2027" (Manage Contacts, Local Network) |
| E45 | Gap 2 scope of the declaration | VERIFIED, E is narrower than Google | The Minimum Scope article (answer 17033915) says "All apps requesting precise location (ACCESS_FINE_LOCATION) must complete a declaration" and "January 27, 2027: Policy compliance is mandatory for all apps". E ties it to API 37+ only |
| E46 | User Generated Content: terms accepted, objectionable content defined, in-app report | VERIFIED | "Requires users accept the app's terms of use ... before users can create or upload UGC"; "Defines objectionable content and behaviors" |
| E47 | Same policy, what E leaves out | note | For publicly accessible UGC Google also requires "in-app functionality to report users and content, and to block users". E gap 5 lists report only |
| E48 | AI-Generated Content: report/flag in app; applicability arguable | VERIFIED | "allow users to report or flag offensive content to developers without needing to exit the app"; defines AI content as "created by generative AI models based on user prompts" |
| E49 | User Data: privacy policy contents (developer info, retention, contact) | VERIFIED | "Developer information and a privacy point of contact"; "The developer's data retention and deletion policy." |
| E50 | Data safety: developer responsible for accuracy | VERIFIED | "The developer is responsible for the accuracy of the label and keeping this information up-to-date." |
| E51 | Gap 3: "Play can remove the app for a Data safety label that misstates collection" | UNVERIFIABLE | The User Data and Enforcement pages say removal is an enforcement action and that Data safety must be accurate, but neither ties removal to a Data safety misstatement in so many words |
| E52 | Account deletion N/A (no in-app accounts) | VERIFIED | "For apps that offer account creation, you are also required to provide users with a clear and accessible method to delete their account." |
| E53 | Permissions: other restricted ones (photo/video, all-files, package, accessibility, exact alarm, SMS, VPN) | VERIFIED | Sections exist: Photo and Video, All Files Access, Package Visibility, Accessibility API, Exact Alarm, SMS/Call Log, VPN |
| E54 | Target API Level; targetSdk 36 | VERIFIED | "New apps and app updates MUST target an Android API level within one year of the latest major Android version release." Code: variables.gradle line 4 `targetSdkVersion = 36` |
| E55 | Payments: subscription via Play Billing | VERIFIED | "Developers charging for app downloads from Google Play must use Google Play's billing system" and in-app purchases of digital features listed |
| E56 | Subscriptions and Preview Subscriptions (2027-01-27) | VERIFIED | "Subscriptions with ongoing eligibility-based discounts ... (effective January 27, 2027)". Listed violation: "Annual subscriptions that most prominently display their pricing in terms of monthly cost." Also "Dismiss button is missing or not clearly visible" |
| E57 | Subscriptions, what E leaves out | note | "you must ensure that your app(s) clearly disclose how a user can manage or cancel their subscription" and give a Subscription Center link or cancel path in account settings. E does not check this exists |
| E58 | Metadata: no emoji or price text in title | VERIFIED | "Don't use emojis, emoticons, or repeated special characters in these metadata elements."; "Images or text that indicate price and promotional information" |
| E59 | Content Ratings, IARC | VERIFIED | "All apps must have a content rating from the IARC to be on Google Play." |
| E60 | Families policy "applies if Target audience includes under-13" | UNVERIFIABLE (qualifier) | Core is right: "If one of the target audiences for your app is children, you must comply" and Play Console Requirements say the same. No "under 13" threshold appears; the page says "The word 'children' can mean different things" and tells you to ask counsel |
| E61 | Gap 4: Target Audience must be chosen | VERIFIED | "you must indicate the target audience for your app, prior to publishing, by selecting from the list of age groups" |
| E62 | Play Console Requirements 3.3 reviewer access, 3.4 package registration | VERIFIED | "3.3. Provide an active demo account, login information, and all other resources needed for Google Play to review your app"; "3.4. Register your app package names" |
| E63 | "personal accounts need 12 testers for 14 days (per repo, not on this page)" | VERIFIED | Confirmed not on the page (zero mentions of "tester") |
| E64 | Functionality: "server must be up for review" | UNVERIFIABLE | Page says "Apps must be stable, functional, and provide meaningful content"; server uptime is E's inference, supported only indirectly by Console 3.3 |
| E65 | Misrepresentation, developer identity | VERIFIED | "impersonate any person or organization, or that misrepresent or conceal their ownership or primary purpose" |
| E66 | SDK Requirements | VERIFIED | "you are responsible for ensuring that their third-party code and practices do not cause your app to violate Google Play Developer Program Policies" |
| E67 | Intellectual Property policy | VERIFIED | "We don't allow apps or developer accounts that infringe on the intellectual property rights of others (including trademark ...)" |
| E68 | Deceptive Behavior, Spam, Impersonation, Ads, Malware etc. N/A rows | UNVERIFIABLE | Not opened line by line; N/A rows with no claim |
| E69 | Enforcement: rejection and removal exist | VERIFIED | Enforcement Process lists "Rejection" and "Removal" as actions |

### Anthropic (Commercial Terms, effective Jun 17, 2025; Usage Policy, effective Nov 12, 2026)

| # | E cites | Verdict | Evidence |
|---|---|---|---|
| E70 | Commercial Terms effective Jun 17, 2025; sections A-M | VERIFIED | Page header "Effective Jun 17, 2025"; A Services, B Customer Content, C Data Privacy, D Trust and Safety; Restrictions, E to M as E lists them |
| E71 | A.1 may power own products | VERIFIED | "to power products and services Customer makes available to its own customers and end users." Preamble: "not for consumer use" refers to Anthropic's own consumer terms |
| E72 | A.2 third party, A.3 feedback | VERIFIED | A.2 "Anthropic is not responsible for them"; A.3 feedback "without obligation to Customer" |
| E73 | B Customer Content, no training | VERIFIED | "retains all rights to its Inputs, and (b) owns its Outputs"; "Anthropic may not train models on Customer Content from Services." |
| E74 | C Data Privacy (DPA) | VERIFIED | DPA "is incorporated into these Terms by reference" |
| E75 | D.1 data laws | VERIFIED | Each party complies with law "including any applicable data privacy laws" |
| E76 | D.2 Usage Policy, regions, cooperation | VERIFIED | "Customer must cooperate with reasonable requests for information from Anthropic."; Customer and Users comply with the Terms |
| E77 | D.3 notify users outputs may be wrong | VERIFIED | Customer must notify Users that "factual assertions in Outputs should not be relied upon without independently checking their accuracy" |
| E78 | D.4 use restrictions | VERIFIED | Customer may not use the Services to build a competing product or reverse engineer |
| E79 | D.5 account security | VERIFIED | "Customer is responsible for all activity under its account." |
| E80 | G Publicity, opt-out | VERIFIED | Anthropic may use name and logo as a reference; "Customer may opt-out via" a linked form |
| E81 | H Fees, I.3 suspension | VERIFIED | I.3.a suspension for violations of D.1, D.2 or D.4; I.3.b no liability including "loss of data or profits" |
| E82 | K indemnity "limited" | VERIFIED | K.1 Anthropic covers IP claims on paid use; K.3 excludes modifications, combinations and Inputs |
| E83 | Usage Policy sections: Universal Usage Standards, Additional Use Case Guidelines | VERIFIED | Both headings present |
| E84 | Usage Policy chatbots must disclose AI (E: N/A, no chat) | VERIFIED | "All consumer-facing chatbots or AI agents that communicate directly with external users" must disclose AI |
| E85 | Usage Policy: products serving minors (E: link not read) | VERIFIED now | "Products serving minors ... must comply with the additional guidelines"; "any individual under the age of 18 years old, regardless of jurisdiction". Support article now read, see Part 3 |
| E86 | Gap 4 smallest fix: "pick a 13+ (or 18+) Target audience" | WRONG | A 13+ audience is still minors: Anthropic defines a minor as under 18. Only an 18+ product avoids the "serving minors" guidance. The support article is read as "probably" covering any app minors can use directly |

### RevenueCat

| # | E cites | Verdict | Evidence |
|---|---|---|---|
| E87 | Terms of Use, "undated" | WRONG | Page says "Last Modified: March 20th, 2024" |
| E88 | Terms sections 1-10 | VERIFIED | 1 Certain Definitions through 10 Miscellaneous |
| E89 | 2.1, 2.3 Connected Applications | VERIFIED | 2.3 "RevenueCat does not warrant or support Connected Applications." |
| E90 | 2.2 disclosures about RevenueCat and Stripe processing | VERIFIED | 2.2 "Necessary Disclosures and Consents": "RevenueCat's and Stripe's processing of personally identifiable information" |
| E91 | 3.2, second 3.2 export controls, 3.4, 3.5 | VERIFIED | Page prints two "3.2"s (Customer Responsibilities; Export Controls); 3.5 "register for its own Stripe account" |
| E92 | 3.3 published policies (E: acceptable-use URL 404) | VERIFIED (clause), policies still UNVERIFIABLE | "use the Services only in compliance with RevenueCat's standard published policies then in effect". I did not find the policies either |
| E93 | 4.1-4.3 | VERIFIED | 4.2 "Customer shall own all rights, title, and interest in and to the Customer Data."; 4.3 aggregated and anonymised data |
| E94 | 4.4-4.6, 6.2 | VERIFIED | 4.5 Publicity "will not use any name or logo of Customer without prior permission"; 4.6 right to "terminate or suspend Customer's access"; 6.2 RevenueCat may terminate on written notice |
| E95 | DPA roles | VERIFIED | "Customer is the Data Controller and that RevenueCat is its Data Processor"; DPA "Effective: August 2026" |

### E code facts spot-checked in C:\shin (about one in three)

| # | E states | Verdict | Evidence |
|---|---|---|---|
| E96 | Manifest "lines 46-47 declare fine and coarse" | WRONG (line numbers only) | Both are declared, but at lines 54-55 of `native/android/app/src/main/AndroidManifest.xml` (file last changed 2026-11-21). Merged release manifest also has both |
| E97 | allowBackup (asked by the brief, E silent) | note | `android:allowBackup="true"` at line 5; no dataExtractionRules or fullBackupContent attribute. App data can be copied to Google backup |
| E98 | Amazon billing receiver (brief, E silent) | note | Present only in the merged release manifest, pulled in by the RevenueCat SDK: `com.amazon.device.iap.ResponseReceiver`, exported true, guarded by `com.amazon.inapp.purchasing.Permission.NOTIFY`. Not in the source manifest |
| E99 | Gap 6: Android RevenueCat key empty | VERIFIED for the repo, but gap is partly stale | `native/config/revenuecat.config.json` has `"android": ""` and is gitignored. The key is injected at build time: `sync-web.mjs` line 170 writes `window.SHIN_RC_KEYS` into `www/js/native-config.js` from that file. The only local AAB (2026-11-21 22:01) has android "", so I cannot confirm build 2 myself. On your word that build 2 carries the key, the key half of gap 6 is closed; the Play subscription products half (per `play-listing.md` line 98) I could not check |
| E100 | targetSdk 36 | VERIFIED | `variables.gradle` line 4 |
| E101 | Info.plist `ITSAppUsesNonExemptEncryption` false (25-26), location string (29-30), photo strings (31-34) | VERIFIED | Lines match exactly |
| E102 | `PrivacyInfo.xcprivacy`: FileTimestamp C617.1 only | VERIFIED | Lines 136-144 |
| E103 | `capacitor.config.json` no `server.url` | VERIFIED | `server` has only hostname, androidScheme, iosScheme |
| E104 | Gap 1: switches gone, one "Accept and continue" (`agree.js`, `track.js:68`) | VERIFIED | `agree.js`: "one button, Accept and continue"; `track.js` lines 66-69 comment says the usage switch is gone |
| E105 | Gap 5: `terms.html` has no sentence barring false entries | WRONG | Terms (`app/public/js/legal/document.js` lines 183 and 204-207, same text in `docs/store/terms.html`) say "you confirm that what you provide is true" and "Do not submit false prices on purpose." Still no definition of objectionable or abusive content and no report option |
| E106 | Gap 3: `play-listing.md` Data safety says usage "optional", Anthropic only "if the person said yes" | VERIFIED | Lines 83 and 84 say exactly that; `agree.js` and `track.js` show it is no longer true |
| E107 | `geocell.js` roughly 1 km cell | VERIFIED | "a neighbourhood-level cell, about one kilometre" |
| E108 | `paywall.js` yearly price leads, dismiss at 233 and 295, 143-145 | VERIFIED | Lines present as cited |
| E109 | `you.js:429-434` privacy link in app | WRONG (line numbers only) | Lines 429-434 are the guide row; the Terms/Privacy row is at `you.js:387`, opens the agree screen at 637. Delete-data email at line 122 is right |
| E110 | Anthropic call sends name, brand, size, category, country, no image (`range-ask.ts`) | VERIFIED | `identify/src/range-ask.ts` header: "product identity ... (name, brand, size, category, market). Never an image." (E's `identify/` path is right) |
| E111 | `ui-strings.js` "Estimated by AI" | VERIFIED | Lines 284, 288, 428, 442 |

## Part 2. File F rows

| # | F cites | Verdict | Evidence |
|---|---|---|---|
| F1 | CIPO database snapshot "last updated 2026-11-25" | VERIFIED | Page: "The database was last updated on: 2026-11-25" |
| F2 | CIPO `pexi` in Trademark field: 0 | VERIFIED | "Results found: 0" |
| F3 | CIPO `pexi*`: 13 rows, none PEXI, incl. PEXIL class 42 no. 2431643 ADVERTISED | VERIFIED | "Results found: 13"; "2431643 PEXIL Standard Characters ADVERTISED 42"; the other rows as F lists them |
| F4 | CIPO `pexip*`: 0 | VERIFIED (by subset) | Not run separately, but `pexip*` is a subset of `pexi*` and none of the 13 is PEXIP |
| F5 | USPTO `pexi`: 0; `pexi*`: 51 rows, 30 live | VERIFIED | My own POST to the backend: 0 and 51; 30 with alive true |
| F6 | USPTO control `shin`: 436 | VERIFIED | 436 |
| F7 | USPTO `pexip*` 4 (3 live), `pexy*` 9 (5 live, classes 10/21/25/28), `pexie*` 1, `peksi*` 1, `pexee*` 0 | VERIFIED | 4 (3 live); 9 (5 live: 10, 10, 21, 28, 10/25); 1; 1; 0. I did not look at whether the `pexie*` and `peksi*` hits are dead |
| F8 | PEXIP 4527556 (Section 71 accepted), classes 9, 38, 42, Pexip AS | VERIFIED | Status "SECTION 71 ACCEPTED", live, Pexip AS, Norway |
| F9 | PEXIP ONE 7265206 and stylised PEXIP 7164344 classes | VERIFIED | 7265206 classes 35, 42, 38, 9; 7164344 classes 41, 38, 35, 42, 9 |
| F10 | PEXIVA 99873019 Texas, class 42, new application | VERIFIED | Applicant Pexiva Technologies, LLC, Texas; status "NON-FINAL ACTION - MAILED" (so past the new-application stage, still pending) |
| F11 | PEXIOVEQ 97695576 SillaJen, classes 5, 42 | VERIFIED | Live, "FIFTH EXTENSION - GRANTED" (an intent-to-use application) |
| F12 | iTunes API CA and US: no app named Pexi; PexiGO, Pexie Ledger (Pexie, Inc.) | VERIFIED | CA and US results include PexiGO and "Pexie Ledger [Pexie, Inc.]", no Pexi. Categories (Business, Finance) not checked |
| F13 | App id 6776124138: lookup returns nothing | VERIFIED | `resultCount: 0` in ca and us |
| F14 | Google Play web search for `pexi` | UNVERIFIABLE | Not re-run (Play search is a JavaScript page and I judged it a low-value fetch) |
| F15 | CIPO fee page modified 2026-07-31; first class online $491.06 (2026), $499.41 (2027); extra class $149.04, $151.57 | VERIFIED | Page "last modified on 2026-07-31"; table matches. $491.06 + $149.04 = $640.10; plus class 35 = $789.14, arithmetic right. Note $640.10 is also the 2026 paper first-class fee, a coincidence |
| F16 | Trademarks Act s. 16 priority by filing date | VERIFIED (F had marked "not fetched") | s. 16(1): entitled "unless at the filing date ... it was confusing with ... (b) a trademark in respect of which an application for registration had been previously filed in Canada by any other person" |
| F17 | Copyright Act s. 2 "work of joint authorship" | VERIFIED, truncated | Full text: "a work produced by the collaboration of two or more authors in which the contribution of one author is not distinct from the contribution of the other author or authors". F's quote drops the second half, which matters: distinct contributions are not a joint work, which supports F's own "each owns what they wrote" |
| F18 | s. 13(1) author is first owner | VERIFIED | "the author of a work shall be the first owner of the copyright therein." |
| F19 | s. 13(3) employer owns | VERIFIED | "in the absence of any agreement to the contrary, be the first owner of the copyright" (contract of service or apprenticeship) |
| F20 | s. 13(4) writing signed by the owner | VERIFIED | "no assignment or grant is valid unless it is in writing signed by the owner of the right" (F's quote omits "or by the owner's duly authorized agent") |
| F21 | s. 13(7) exclusive licence is an interest | VERIFIED | "a grant of an exclusive licence in a copyright constitutes the grant of an interest in the copyright by licence" |
| F22 | s. 9 joint authorship term, life of last survivor plus 70 years | VERIFIED | "copyright subsists during the life of the author who dies last ... and for a period of 70 years" (subject to s. 6.2 and 7) |
| F23 | s. 14.1(1), (2) moral rights; s. 14.2(1) term | VERIFIED | 14.1(2) "Moral rights may not be assigned but may be waived in whole or in part."; 14.2(1) "subsist for the same term as the copyright" |
| F24 | PIPEDA s. 10.1(1) report on real risk of significant harm | VERIFIED | "if it is reasonable in the circumstances to believe that the breach creates a real risk of significant harm to an individual." |
| F25 | s. 10.1(2) timing; 10.1(3) and (6) notify individual | VERIFIED | (2) "as soon as feasible after the organization determines that the breach has occurred"; (6) same words for notification |
| F26 | s. 10.2(1) tell other organisations | VERIFIED | Notify another organisation if it "believes that the other organization ... may be able to reduce the risk of harm" (text as printed) |
| F27 | s. 10.3(1), (2) record and access | VERIFIED | (1) "keep and maintain a record of every breach"; (2) "on request, provide the Commissioner with access to, or a copy of, a record." |
| F28 | PIPEDA s. 28 offence, $10,000 / $100,000 | VERIFIED | "(a) ... fine not exceeding $10,000; or (b) ... fine not exceeding $100,000" for knowingly contravening s. 10.1 or 10.3(1) |
| F29 | SOR/2018-64 s. 2 report in writing; s. 3 and 3(f); s. 4 | VERIFIED | s. 2(1) "must be in writing"; s. 3(f) "contact information that the affected individual can use"; s. 4 direct notification by "person, by telephone, mail, email or any other form" |
| F30 | SOR/2018-64 s. 6(1) 24 months | VERIFIED | "an organization must maintain a record of every breach of security safeguards for 24 months after the day on which the organization determines" |
| F31 | Quebec s. 3.5 notify "risk of serious injury" | VERIFIED | "If the incident presents a risk of serious injury, the person ... must promptly notify the Commission d'accès à l'information" |
| F32 | s. 3.6, 3.7 | VERIFIED | 3.6 defines "confidentiality incident"; 3.7 risk assessment, consult the person in charge |
| F33 | s. 3.8 register, copy to Commission | VERIFIED | "must keep a register of confidentiality incidents"; "A copy of the register must be sent to the Commission at its request." |
| F34 | s. 90.12 penalty $50,000 / $10,000,000 or 2% | VERIFIED | "$50,000 in the case of a natural person and, in all other cases, $10,000,000 or, if greater, ... 2% of worldwide turnover" |
| F35 | s. 91 fine, failure to report or to take s. 10 measures | VERIFIED | "$5,000 to $100,000 in the case of a natural person ... $15,000 to $25,000,000, or, if greater, ... 4% of worldwide turnover"; items (2) and (4) |
| F36 | s. 92.1 doubled on repeat | VERIFIED | "In the case of a subsequent offence, the fines under this division are doubled." |
| F37 | Register retention 5 years (F: ASSUMPTION, regulation A-2.1 r. 3.1 not re-read) | VERIFIED now | Regulation respecting confidentiality incidents s. 8: "kept for at least 5 years after the date or time period when the body became aware of the incident" |
| F38 | Ontario corporation $300 | VERIFIED | "Incorporation Immediate - $300 15 business days - $300" |
| F39 | Ontario business name $60 | VERIFIED | "New Registration Immediate - $60" |
| F40 | Ontario business name "valid 5 years" | UNVERIFIABLE | Not on the cited ontario.ca page; I only found secondary sites (law firm and filing-service pages) saying five years under Business Names Act s. 4. Not a primary source |
| F41 | CBCA $200 online, 1 day; annual return $12; modified 2025-05-06 | VERIFIED | "It will cost $200 and will take 1 day."; annual return "$12"; "Date modified: 2025-05-06" |
| F42 | IBM Plex Mono: OFL 1.1, "Copyright 2017 IBM Corp." at the cited URL | VERIFIED | "Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"" ... "SIL Open Font License, Version 1.1" |
| F43 | OFL clause 2: copyright notice and licence with each copy | VERIFIED | "each copy contains the above copyright notice and this license" |
| F44 | Apache 2.0 s. 4 (MediaPipe) | VERIFIED | 4(a) "You must give any other recipients of the Work or Derivative Works a copy of this License" |
| F45 | MediaPipe tasks-vision 1.0.1 Apache-2.0; zxing-wasm 3.1.3 MIT | VERIFIED | `package.json` fields: 1.0.1 "Apache-2.0"; 3.1.3 "MIT" |
| F46 | sharp-win32-x64 "Apache-2.0 AND LGPL-3.0-or-later" | VERIFIED | `catalogue/node_modules/@img/sharp-win32-x64` license field |
| F47 | No licence file beside Plex fonts; Inter-OFL.txt ships | VERIFIED | `app/public/fonts` and the Android assets copy hold only `Inter-OFL.txt` plus woff2 files |
| F48 | zxing_reader.wasm is Apache-2.0 (F: ASSUMPTION) | UNVERIFIABLE | Not checked; still an assumption |
| F49 | Commit counts "710 and 4 owner, 470 collaborator, 79 Mac worker, 15 Claude" | VERIFIED (moved) | `git shortlog` now: 721 and 4 (plus 1 "Jamin Xu"), 470, 79, 15. The owner count grew by the review's own commits |
| F50 | `docs/launch-gaps-2026-11-06.md` items 94 and 95 (GitHub 2FA off, push deploys, collaborator pushes) | VERIFIED | Item 95: "GitHub 2FA off (checked) and GitLab reported off; a push deploys; Aurik pushes too." Present state unknown, as F says |
| F51 | `mac/12-harden.sh`, `mac/14-offsite-backup.sh`, `docs/privacy/breach-plan.md`, `app/src/retention.ts` exist; `timingSafeEqual` used | VERIFIED | Files present; `timingSafeEqual` in `admin.ts`, `device-key.ts`, `invite.ts` |
| F52 | No LICENSE, NOTICE or contributor agreement in the repo | VERIFIED | No such file at the repo root |

## Part 3. Answers from the sources

**Q1. Does Apple 5.1.2(i) require explicit permission before sending user-typed text to a third-party AI service?**
Yes, if what is sent is personal data. Apple's wording, from the page dated October 16, 2026: "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." The rule is scoped to "personal data". Apple's text does not define the form of permission, and does not forbid one combined consent screen, but it does say "explicit", and 5.1.1(ii) separately requires "an easily accessible and understandable way to withdraw consent." Whether a typed product name is personal data is the open point. Pexi sends only name, brand, size, category and country (`range-ask.ts`), which makes the "not personal data" reading arguable but not settled by Apple.

**Q2. Does Google Play require approximate-only location for an app that wants the nearest stores?**
Not as a flat rule, but it comes close. The policy says "request the minimum scope necessary (for example, coarse instead of fine ...)" and the Minimum Scope article uses this exact case as an example of coarse being enough: "Store Locators: ... a coarse location is sufficient to show the three closest stores in a 10-mile radius." Fine location is allowed only with a Play Console declaration "justify why the location button or coarse location is insufficient". The article gives "January 27, 2027: Policy compliance is mandatory for all apps", and the Preview page adds that apps targeting API 37+ must use the location button for one-time requests. So E's gap 2 stands, and is slightly wider than E says (declaration for all apps, not only API 37+).

## Part 4. Other findings worth acting on

- N1. Apple's export page says an app using only exempt encryption "might alternatively be required to submit a year-end self-classification report to the U.S. government." E does not mention it. Not looked into further.
- N2. Dropping `ACCESS_FINE_LOCATION` (E's gap 2 fix): E says it is unverified whether the prompt still appears. Capacitor's `BridgeWebChromeClient.onGeolocationPermissionsShowPrompt` requests both permissions; if the grant is refused it still says yes when coarse is held and the device runs Android 12 or later (API 31). `minSdkVersion` is 24, so on Android 7 to 11 the prompt would deny. This is a reading of the library code, not a device test.
- N3. Gap 6 is stale on the key (see E99). E should be re-issued once build 2's config is confirmed.
- N4. E13, E86 and E105 are the three rows that change a recommendation; the others are line numbers or wording.

## Part 5. Counts

Rows: E1-E111 plus F1-F52 = 163 rows (E47 and E57 are notes on omissions; E97, E98 are notes with no claim in E; E97, E98, E47, E57 are not counted as verdict rows).
Verdict tally is in the final report message; recount command: `grep -c "| VERIFIED" ` and so on over this file.
