# Legal review F: IP, the name, security breaches, ownership (2026-11-26)

Research record, not legal advice; nobody here is a lawyer. Primary sources only, each with URL and
section. Anything not read from a primary source is marked ASSUMPTION. Nothing in this file touched
employment, offer or personal documents (section 4 has the owner question). Customer-facing
wording is not changed by this note.

## 1. The name PEXI

### 1a. What was searched (all re-run 2026-11-26, not copied from older notes)

| Source | Query | Result |
|---|---|---|
| CIPO Canadian Trademarks Database (snapshot "last updated 2026-11-25"), `https://ised-isde.canada.ca/cipo/trademark-search/srch` , field Trademark, all classes, all statuses | `pexi` | 0 results |
| same | `pexi*` | 13 rows, none is PEXI. Live: PEXINTIVE (5), PEXIOVEQ (5, 42), Pexion & Design (5), PEXION (5), PEXIDAN L/T ECLIPSE (1), PEXIDAN (1); **PEXIL, ADVERTISED, class 42, no. 2431643**; PEXIMLIO (5, advertised). Dead: three ABANDONED, PEXID EXPUNGED |
| same | `pexip*` | 0 results (Pexip AS has no Canadian mark in this database) |
| USPTO Trademark Search, the site's own backend `https://tmsearch.uspto.gov/prod-stage-v1-0-0/tmsearch`, query `wordmark:<x>` | `pexi` | 0 |
| same | `pexi*` | 51 rows, 30 live. Live in classes 9, 35 or 42: PEXIP, PEXIP ONE, PEXIVA, PEXIOVEQ (list below) |
| same | `pexip*`, `pexy*`, `pexie*`, `peksi*`, `pexee*` | 4 (3 live), 9 (5 live, all class 10/21/25/28), 1 (dead), 1 (dead), 0 |

Control: the same USPTO call returned 436 rows for `shin` and 51 for `pexi*`; the CIPO page returned
13 rows for `pexi*`. So both searches find marks, and the zero for the literal word is a real zero as of
those snapshots. Not searched: design marks with no wordmark, phonetic-only matches, state and common-law marks.

Live marks in classes 9, 35, 42 (USPTO, 2026-11-26):

| Mark | Reg / serial | Owner | Classes | Goods (from the record) |
|---|---|---|---|---|
| PEXIP | 4527556 (Section 71 accepted) | Pexip AS, Norway | 9, 38, 42 | video conferencing, software |
| PEXIP ONE | 7265206 (registered) | Pexip AS | 9, 35, 38, 42 | data processing; videoconferencing software design |
| PEXIP (stylised) | 7164344 (registered) | Pexip AS | 9, 35, 38, 41, 42 | conferencing, training, software |
| PEXIVA | 99873019 (new application) | Pexiva Technologies, LLC, Texas | 42 | IT consulting |
| PEXIOVEQ | 97695576 | SillaJen, Korea | 5, 42 | cancer drugs, medical information |
| PEXIL (Canada) | 2431643 (advertised) | not read | 42 | not read |

### 1b. App stores (2026-11-26)

- Apple App Store, iTunes Search API, CA and US storefronts, term `pexi`, software: **no app named Pexi**.
  Nearest: PexiGO (Business), Pexie Ledger (Pexie, Inc., Finance).
- Google Play web search `pexi` (CA): no app named Pexi. Nearest: Pexy (pictograms), Pexii (wallpapers),
  Pexip (Pexip AS, `com.pexip.connect`), Pexar, Pexiko.
- **A web-search snippet listed an App Store app called exactly "Pexi"** (id 6776124138, a picture-in-picture video tool,
  developer shown as KRISTA AIRILA, "(c) 2026 Pexi. Inc."). I could not open it: the page returns 404 in the th, ca, us and qa
  storefronts and the lookup API returns nothing. Status (live, pulled, other regions only) is UNKNOWN.

### 1c. Risk and recommendation (ASSUMPTIONS, judgement not sourced)

- No registered or pending identical mark in Canada or the US in any class, so no registry bar to use or filing today.
- Closest conflict is PEXIP (live, US, same classes 9 and 42, one letter longer, different product: video calls). A grocery price
  checker versus video conferencing makes confusion unlikely in my view, but same-class and near-identical sound is the pattern an
  examiner or a letter from a trademark owner cites. An attorney's read is the only thing that settles it.
- The exact-name "Pexi" video app is the sharper practical risk: if live in CA or US, it holds common-law use of the same word on
  an app store, and each store expects an app name to be unique (ASSUMPTION; not fetched). The owner should look at it in
  App Store Connect's name check before launch.
- Domains `pexi.app` and `pexi.com` belong to other parties (RDAP, from `notes/name-screen-2026-10-01.md`; not re-run today).
- **Filing in Canada: worth it, in my judgement.** CIPO fee page (`https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/fees-trademarks`,
  modified 2026-07-31): first class filed online $491.06 in 2026 ($499.41 from 2027-01-01), each extra class $149.04 ($151.57).
  Classes 9 and 42 online now: $640.10. Add class 35 for $789.14. Against a rebrand after paid ads and store pages exist, this is
  small. It also puts a filing date ahead of a later PEXI filer (priority rule, not fetched: Trademarks Act s. 16). US filing fee not fetched.

| Requirement | Pexi now | Gap / OK | Named cost | Smallest fix |
|---|---|---|---|---|
| Name free to use in Canada and US | No identical live mark in CIPO or USPTO | OK (snapshot 2026-11-25/26) | none today | re-run both searches the day before launch |
| Exact-name app collision | one unopenable "Pexi" listing in search results | GAP, unknown | store rejection or forced rename; letter from owner | open the listing in a browser from the owner's Apple account; reserve the name in App Store Connect and Play Console |
| Same-class near-mark PEXIP | not assessed by a lawyer | GAP, low in my view | demand letter, forced rename | one-hour attorney read, or accept |
| Own the name | no application filed (none found) | GAP | a later PEXI filer in Canada gets priority | CIPO online application, classes 9 and 42, $640.10 |
| Domains | `pexi.app`, `pexi.com` held by others | GAP | no brand-matching domain | current domain plan stays; do not claim pexi.com |

## 2. Open-source licences in what ships

Method: declared `license` field of every package installed under `app`, `native`, `catalogue`, `identify`, `spine` node_modules
(`price`, `settings`, `bench` declare no dependencies), the vendored files in `app/public`, and the Podfile and Gradle lists.
Not done: native pods and Gradle artefacts that Capacitor plugins pull at build time (not installed on this PC); licence field
accuracy was not checked.

**Copyleft found in anything shipped to phones: none.** The only copyleft is in the server-side tooling:

- `@img/sharp-win32-x64` (and its sibling libvips builds for the Mac): "Apache-2.0 AND LGPL-3.0-or-later" (catalogue, image
  processing). Not in the phone app. The LGPL's relink and source duties attach when you distribute the library; running it on
  your own server does not distribute it (ASSUMPTION: LGPL-3.0 text not re-read).
- No GPL, AGPL, MPL, CC-BY-SA in node_modules. Fonts are OFL (not copyleft in the GPL sense, but a notice condition).
- Data, not code: Open Food Facts, Open Beauty Facts, OSM are ODbL (share-alike on a derived database). The "Data and licences"
  screen (`app/public/js/legal/sources.js`) names each source and licence, so attribution is OK. Whether Pexi's own catalogue is
  an ODbL "derivative database" is a separate open item in `docs/catalogues.md` line 139 (area B, not repeated here).

| Component (where) | Licence | Obligation | Notice shown to users? | Gap / OK |
|---|---|---|---|---|
| Inter variable (app, phones, web) | SIL OFL 1.1 | copyright notice + licence text with each copy (clause 2 of the shipped text) | `Inter-OFL.txt` ships in `www/fonts` and the Android assets | OK as a file; not linked from the app screen |
| IBM Plex Mono x6 woff2 (app, phones, web) | SIL OFL 1.1, "Copyright 2017 IBM Corp." (`https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt`) | same | **no licence file found beside the fonts** | GAP |
| MediaPipe tasks-vision 1.0.1 + 3 wasm builds (`public/js/chunks`, `vendor/mediapipe-wasm`) | Apache-2.0 | give recipients a copy of the licence, keep notices (Apache 2.0 s. 4; text not re-fetched) | none; the bundle has no licence header | GAP |
| zxing-wasm 3.1.3 + `zxing_reader.wasm` | MIT (wrapper); wasm built from ZXing-C++, Apache-2.0 (ASSUMPTION) | MIT: keep copyright and permission notice in copies | none | GAP |
| Capacitor 8, RevenueCat, in-app-review, secure-storage, camera, etc. | MIT / Apache-2.0 | notice | none | GAP (same fix) |
| ML Kit barcode and text plugins (iOS pods, Android) | wrapper MIT; Google ML Kit is under Google's own terms (not fetched) | follow Google's ML Kit terms | none | ASSUMPTION: read the terms once |
| Server: anthropic SDK, onnxruntime, sqlite-vec, transformers.js | MIT / Apache-2.0 | none unless the code is distributed | n/a | OK |
| Face art SVGs (`public/faces`), `icon.svg` | no source or licence recorded | owner must hold the rights | n/a | QUESTION: who drew them; was any AI or stock tool used |

Named cost for the GAP rows: licence breach claims by the font and library authors, and a store review question about third-party
code. Small in probability, but the fix is one file. **Smallest fix:** a `licenses` text file generated from the lock files (for example
a license-checker run) shipped in the web root and linked from the existing "Data and licences" screen, plus IBM's `LICENSE.txt`
beside the Plex fonts.

## 3. Security and breach

Law, read from the sources:

- PIPEDA s. 10.1(1): report to the Commissioner a breach of security safeguards that creates a "real risk of significant harm";
  s. 10.1(2): "as soon as feasible after the organization determines that the breach has occurred"; s. 10.1(3) and (6): notify the
  affected individual on the same test and timing; s. 10.2(1): tell other organisations that can reduce the harm; s. 10.3(1) and (2):
  keep a record of every breach and give the Commissioner access on request. `https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html`
- Breach of Security Safeguards Regulations SOR/2018-64: s. 2 report is in writing and describes the circumstances and cause;
  s. 3 notice content including contact information (s. 3(f)); s. 4 notice by email, mail, phone or other appropriate means;
  **s. 6(1) keep the record of every breach for 24 months** after determining the breach occurred.
  `https://laws-lois.justice.gc.ca/eng/regulations/SOR-2018-64/FullText.html`
- PIPEDA s. 28: knowingly failing to report or keep records is an offence, fine up to $10,000 (summary) or $100,000 (indictable).
- Quebec Law 25, Act respecting the protection of personal information in the private sector, CQLR c. P-39.1
  (`https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1`): s. 3.5 take reasonable measures and promptly notify the CAI and the person
  if there is a risk of serious injury; s. 3.6 definition of incident; s. 3.7 assess with the person in charge; **s. 3.8 keep a register,
  a copy goes to the Commission on request**; s. 90.12 administrative penalty up to $50,000 (natural person) or $10,000,000 / 2% of
  worldwide turnover; s. 91 fine $5,000 to $100,000 (natural person), $15,000 to $25,000,000 / 4% of turnover, for failing to report
  an incident or to take the security measures of s. 10; s. 92.1 doubled on repeat. The register content is set by regulation
  A-2.1 r. 3.1 (not re-read here; `docs/privacy/breach-plan.md` cites 5 years from the date of awareness, ASSUMPTION carried from there).

What Pexi has (read from the repo):

| Requirement | Pexi now | Gap / OK | Named cost | Smallest fix |
|---|---|---|---|---|
| Written breach procedure | `docs/privacy/breach-plan.md`: first 15 minutes, containment list of every secret, assessment, notification, register fields | OK | n/a | none |
| Record of every breach, 24 months federal / Quebec register | plan puts it at `~/shin-privacy/incident-register.csv` on the Mac, keep 5 years, second copy off the Mac | UNVERIFIED: whether the file exists or has been tested from this PC | fine up to $100,000 (PIPEDA s. 28); Quebec s. 91 | owner confirms the file exists on the Mac and one dry-run entry was written |
| Privacy policy promises incidents are registered and the CAI and OPC told | `legal/document.js` "Incidents." paragraph | OK, and it depends on the row above being real | misleading statement if no register | same fix |
| No contact list to notify users | policy says notice is posted in the app and at the top of the policy | OK, matches the plan | n/a | none |
| Secrets handling | secrets in `mac/config.env` (gitignored `.env*`); network salt file mode 600; admin and device-key comparisons use `timingSafeEqual`; access log stores phone id and a hashed network, never the invite code or address | OK in code | n/a | none |
| Machine hosting the server | `docs/launch-gaps-2026-11-06.md` items 94 and 95: one laptop runs the server and Claude sessions under one user that reads every key; FileVault off, firewall off, SSH and Screen Sharing on; **GitHub 2FA off and a push deploys; the collaborator pushes too**. A later ruling (2026-11-21, `docs/readiness/needs-jamin.md`) moves launch hosting off the Mac. Not re-checked today | GAP as of 11-06, current state UNKNOWN | one stolen password or token on GitHub = deploy of attacker code to the server holding device ids and photos; a stolen laptop = every key | turn on GitHub 2FA on both accounts (minutes); rotate keys after the host move |
| Hardening script | `mac/12-harden.sh` exists (firewall, SSH, file modes, listeners audit); whether it was applied is not recorded in what I read | UNVERIFIED | as above | run `sh mac/12-harden.sh --audit` and record the output |
| Backups | nightly backups of all 7 databases, restore proven 2026-11-07; offsite encrypted via restic (`mac/14-offsite-backup.sh`), 15-day retention matches the policy; backup job reported failing on a retired cache at one point (launch-gaps 53) and an alert email failed to send (recent commits) | OK with open items | lost data; a stale backup | confirm last 3 nightly runs and one offsite run are green |
| Logs and retention | request logs 90 days, events 12 months, scans/ratings 24 months then phone id removed (`app/src/retention.ts`), tested | OK; backups and stdout log fall outside the sweep (stated in the file) | policy says about 15 days for backups | none |
| Customer-data faults | `customer-data-faults.ts` exists | not read in detail | n/a | n/a |
| Whether an IP address in a log counts as personal information for the breach duty | prior review `docs/security-check/legal-review-2026-11-17.md` s. 8 says likely | OK, the plan already treats logs as in scope | n/a | none |

## 4. Ownership of the code and data

Law, read from the Copyright Act, R.S.C. 1985, c. C-42 (`https://laws-lois.justice.gc.ca/eng/acts/C-42/FullText.html`):

- s. 2: "work of joint authorship" means "a work produced by the collaboration of two or more authors".
- s. 13(1): the author is the first owner. s. 13(3): in the course of employment the employer owns, absent contrary agreement.
  Whether the collaborator is an employee, a contractor or neither matters; nothing in the repo says.
- **s. 13(4): "no assignment or grant is valid unless it is in writing signed by the owner of the right."** So with no signed paper,
  neither person has transferred anything to the other or to a company.
- s. 13(7): an exclusive licence is a grant of an interest, so it also needs writing under s. 13(4).
- s. 9: for a work of joint authorship the term runs for the life of the last survivor plus 70 years.
- s. 14.1(1) and (2): moral rights cannot be assigned but may be waived; s. 14.2(1): they last as long as the copyright.
- Consequence (ASSUMPTION, case law not fetched; I recall Neudorf v Nettwerk, BCSC 1999, on co-authorship needing a contribution of
  copyrightable expression and an intention to co-author): code that two people wrote together is likely co-owned; each co-owner
  holds an undivided interest, and a co-owner generally cannot grant an exclusive licence or sell the whole without the other. Code
  one person wrote alone is owned by that person. The git history shows both write code: 710 and 4 commits under the owner's
  addresses, 470 under the collaborator, 79 from the Mac worker, 15 from Claude. `docs/decisions.md` records a split: the collaborator
  builds the shopper-facing app and paywall, the owner the backend. That split means each likely owns what they wrote.
- Nothing found in the repo: no LICENSE, NOTICE, contributor agreement, assignment or equity note.
- Business angle (Partnerships Act, R.S.O. 1990, c. P.5, not fetched, ASSUMPTION): two people carrying on a business together
  to make a profit can be a general partnership without any paper, with joint liability for each other's debts.
- Code written by an AI tool: whether it is protected by copyright at all is unsettled in Canada (ASSUMPTION, nothing sourced). Ask counsel.

What a short contributor or co-founder agreement must cover: parties and role of each; assignment of all past and future code,
designs, data and the name to the owner or a company (in writing, signed, s. 13(4)); waiver of moral rights (s. 14.1(2));
the collaborator's pay or equity and when it vests; who may decide on selling, licensing, open-sourcing; what happens if one
leaves; confidentiality of keys, data and customer information; each person's access to accounts and repos and handing them back;
no use of the other's pre-existing code beyond a licence; governing law (Ontario); how to settle a dispute; the Pexi name and the
store accounts (who is the legal seller).

| Requirement | Pexi now | Gap / OK | Named cost | Smallest fix |
|---|---|---|---|---|
| Written assignment of the collaborator's code (s. 13(4)) | none found in the repo | GAP | co-ownership: he can block a sale, a licence or an investor's diligence; lost money if the product sells | signed one-page IP assignment and moral-rights waiver |
| Who owns the name, the store accounts, the domain | owner's accounts (inferred from the repo); no record of agreement | GAP | dispute over the revenue stream | one paragraph in the same agreement |
| Licence for the repo | none | GAP | none yet; it matters when the repo is shared | add a proprietary "all rights reserved" notice, or choose a licence deliberately |
| Ownership of the data (user records, corrections) | owner-controlled server; policy says Pexi collects it | OK on paper | n/a | none |
| Collaborator's status (employee, contractor, partner) | unknown | GAP | employer owns if employee (s. 13(3)); tax and liability | state it in the agreement |

**Question for the owner only (not looked up):** Has the owner signed any employment, internship or co-op agreement, with any employer or
school, that contains an invention-assignment, intellectual-property or outside-work clause that could reach Pexi? If yes, a
lawyer should read that clause before Pexi takes investment, is sold, or the collaborator's assignment is signed.
Also: did any school or program supply resources used to build Pexi?

## 5. Insurance and liability

- A sole proprietor and the business are one legal person: the owner is personally liable for Pexi's debts, claims and
  judgments, including a privacy fine under the sections in part 3 (Quebec s. 90.12 and s. 91 list natural persons) and an
  infringement claim. ASSUMPTION from general law, not sourced to a statute here.
- Fees, from the official pages:
  - Ontario business corporation (Business Corporations Act): **$300** online or by mail
    (`https://www.ontario.ca/page/cost-time-required-to-register-change-search-for-business-name-corporation-not-for-profit`, read 2026-11-26).
  - Federal (CBCA): **$200** online, 1-day processing; annual return $12 online
    (`https://ised-isde.canada.ca/site/corporations-canada/en/services-fees-and-processing-times`, modified 2025-05-06).
  - Ontario business-name registration (sole proprietor or partnership trade name): **$60**, valid 5 years (same Ontario page).
    Not needed if the owner trades under his own full legal name (Canada.ca guidance, from a search result, not opened).
  - Not priced here: federal name search report, Ontario extra-provincial registration if a federal company operates in Ontario, accountant, annual filings.
- ASSUMPTION: a corporation limits liability for business debts and contract claims but not for the owner's own wrongdoing,
  personal guarantees or a director's statutory duties; insurance is the cover for both cases.
- Insurance: not priced (no primary source). The relevant kinds are commercial general liability, errors-and-omissions or
  technology E&O, and cyber liability. Ask a broker for quotes; check whether the Apple, Google and RevenueCat accounts require it (not).
- The collaborator agreement and the incorporation go together: sign the assignment to the company, not only to the owner.

| Requirement | Pexi now | Gap / OK | Named cost | Smallest fix |
|---|---|---|---|---|
| Separate legal person for the product | sole proprietor (inferred, no company found in repo) | GAP | owner's personal assets answer a claim, fine or judgment; paid subscribers raise the exposure | Ontario BCA incorporation $300 or federal $200 before launch |
| Insurance | none found | GAP | uninsured defence costs, data-breach response | quote cyber + tech E&O; decide after incorporating |
| Business name registration | trading as Pexi (not his own name) | GAP if sole proprietor | fine and unenforceable contracts under the Business Names Act (ASSUMPTION, not read) | $60 Ontario registration, or incorporate and use the corporate name |
| Move IP into the company | n/a | open | n/a | assignment from owner and collaborator to the company (s. 13(4)) |

## Top gaps by named cost

1. No signed assignment from the collaborator (s. 13(4)): co-ownership blocks a sale, licence or investment.
2. Breach register unverified; Quebec fine up to $25,000,000 / 4% of turnover for failing to report (s. 91), federal $100,000 (s. 28).
3. GitHub 2FA off with push-to-deploy (as of 2026-11-06): attacker code on the server holding device ids.
4. Name: exact-name "Pexi" app listing (status unknown) and PEXIP in the same classes; no Canadian filing ($640.10 for classes 9 and 42).
5. Sole proprietor: personal liability; incorporate for $200 to $300.
6. Missing licence notices for Plex Mono, MediaPipe, zxing, Capacitor.
