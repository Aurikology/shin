# The store accounts packet

Written 2026-09-13 for beta-plan item 44 ("accounts"), which had a title and no content. This is
the sit-down-once document: everything needed to open the Apple Developer Program account and the
Google Play Console account in a single pass, without leaving the chair to look something up.

**Nothing in here was done for you.** No account was created, no form submitted, no sign-in
attempted. Enrolment needs a legal name, a government ID and a payment card, so the act is yours.
`memory/lessons.md`, 2026-09-12: *"the system does everything up to the spent-once act, and the
act stays his."* This is the up-to.

**Sourcing rule for this file.** Every cost, timeline and requirement carries a URL and the date it
was checked. Where a number contradicts what this repo already records, both are shown and the one
to trust is named. Anything that could not be sourced says "unknown" or "guess" in place.
All checks below were done 2026-09-13.

---

## 0. The two-minute version

| | Apple Developer Program | Google Play Console |
|---|---|---|
| Cost | 99 USD per membership year, recurring | 25 USD one time, no renewal |
| Path to take | **Individual** | **Personal** |
| D-U-N-S needed | No, on the individual path | No, on the personal path |
| Gates | TestFlight, plan item 4a/4b, exit line E1 iOS | Play internal track, item 4a/4c, E1 Android |
| Published processing time | None published by Apple | None published by Google |
| The thing that will surprise you | TestFlight internal testers must be users on your App Store Connect team, not just an email | The 12-tester/14-day rule is real but does **not** touch the six-person beta |
| The one-way door | The bundle id, and the seller name | The application id |

The single most expensive mistake available here is uploading a build under
`com.placeholder.pricecheck`. See section 3.

---

## 1. The two accounts

### 1a. Apple Developer Program

**Cost.** 99 USD per membership year. Apple's enrolment page: *"The Apple Developer Program is 99
USD per membership year"*, and *"Prices may vary by region and are listed in local currency during
the enrollment process"*
([developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/), checked
2026-09-13). The same 99 USD applies to both the individual and the organization path; the price is
not the difference between them.

The exact Canadian-dollar figure Apple will show you is **unknown**. Apple states only that local
currency is used, and the figure sits behind the signed-in enrolment flow, which was not entered.
Do not plan around a converted number; read what the checkout page says.

**Individual versus organization.**

| | Individual / sole proprietor | Organization |
|---|---|---|
| Fee | 99 USD/yr | 99 USD/yr |
| D-U-N-S number | Not required | **Required.** *"Your organization (excluding government entities) must have a D-U-N-S Number"* |
| Seller name on the store | Your personal legal name: *"your personal legal name will be listed as the seller on the App Store"* | The legal entity name |
| Who may enrol | You | Someone with *"the legal authority to bind your organization to legal agreements"* |
| Extra requirements | None beyond identity | A work email on the organization's own domain, and *"a publicly available, functional website"* on that domain |
| Payment timing | *"Individuals and sole proprietors/single-person businesses can review the license agreement and purchase a membership at the time of enrollment"* | *"Organizations can review the license agreement and purchase a membership once Apple Developer Support verifies the enrollment information and sends an email with next steps"* |

Sources: [enrol page](https://developer.apple.com/programs/enroll/) and
[Apple's enrollment help](https://developer.apple.com/help/account/membership/program-enrollment/),
both checked 2026-09-13.

**Take the individual path.** Reasons, in order of weight:

1. There is no incorporated entity behind Shin today. The organization path asks Apple to verify a
   legal entity that does not exist, so it is not a slower version of the same thing, it is a
   different thing that cannot be completed.
2. It skips the D-U-N-S number entirely, which is the only step in this whole packet with a
   documented multi-week floor.
3. The organization path also demands a live public website on a domain whose email you control.
   Hard rule 1 in `CLAUDE.md` forbids a public product name until CIPO clears it, and item 1a of
   the beta plan deliberately puts the beta on a **neutral subdomain that names nothing**. A public
   branded website is precisely the artefact that rule blocks. The organization path therefore
   collides with a hard rule; the individual path does not.
4. The organization path pays for itself only when the seller name must not be a person's name, or
   when more than one person needs separate App Store Connect logins. Neither is true for a
   six-person family beta.

Cost of choosing individual now: the App Store will show your personal legal name as the seller,
and moving to an organization later means a new enrolment and an app transfer, not a setting
change. That is a real cost and it is accepted knowingly. Flag it to yourself before you click.

**Identity documents.** Apple requires the legal name, phone number and an address (*"P.O. boxes
are not accepted"*), plus an Apple Account with two-factor authentication on. Beyond that:
*"In some cases, you may be asked for your government identification number or an image of your
photo ID. Additional or alternative documentation may be required."*
([identity verification help](https://developer.apple.com/help/account/membership/identity-verification/),
checked 2026-09-13). Verification is done through the Apple Developer app on an iPhone or iPad for
developers worldwide.

So: **have a government photo ID within reach before you start.** It may not be asked for. Assume
it will be.

The one warning Apple repeats on three separate pages: *"Do not enter an alias, nickname, or
company name as your first or last name, as entering your legal name incorrectly will cause a delay
in the enrollment process."* Legal name, spelled as on the ID, matching the card.

**Processing time. This is where the repo is wrong.**

`native/README.md` currently says enrolment *"takes up to 48 hours for individual enrollment to
clear"*. **That figure has no source and it is not Apple's.** Nothing on Apple's enrolment page,
enrollment help page or identity-verification help page states any processing time. The only number
Apple publishes is a complaint threshold: *"If you haven't received a membership confirmation within
24 hours of your purchase, contact us"*
([enrollment help](https://developer.apple.com/help/account/membership/program-enrollment/),
checked 2026-09-13), which is about the confirmation email, not about approval.

Against that, Apple's own developer forums carry 2026 threads titled "Apple Developer Program
Enrollment Pending for Over 3 Weeks (Identity Verification)"
([forum thread 817247](https://developer.apple.com/forums/thread/817247)) and "Enrollment Stuck 45+
Days: Identity Verification Link Error"
([forum thread 816626](https://developer.apple.com/forums/thread/816626)), both found 2026-09-13.
Those are self-selected complaints and are not a median, but they establish that the tail is weeks,
not hours.

**Trust:** Apple publishes no processing time. Treat the 48 hours in `native/README.md` as a guess
that got written down as a fact. The honest planning statement is the one already in
`docs/decisions.md` (2026-09-11): *"neither vendor states a processing time"*. That entry is right
and the README is wrong; the README is not edited here because this lane owns one file, so this
paragraph is the correction of record until the boss folds it in.

Practical consequence for the plan: the beta-plan schedule line *"the beta starts the day both
store accounts clear, which no one here controls"* is correct as written, and input I1's assumption
that Apple's approval *"sits between Sunday night and the first iPhone install"* is optimistic with
nothing behind it. The plan already carries the right hedge, in the 2026-09-11 decision's
reverses-if and in the Monday line: the six testers sideload on Android and use Safari on iPhone
while the accounts clear, so the wait costs no testing days.

### 1b. Google Play Console

**Cost.** *"There is a US$25 one-time registration fee that you can pay with the following credit or
debit cards"*
([Play Console: get started](https://support.google.com/googleplay/android-developer/answer/6112435),
checked 2026-09-13). One time, not annual. The repo's 25 USD once is **correct**.

The same page carries a warning worth reading twice: a valid government ID and a credit card in your
legal name may be requested during registration, and **the registration fee is not refunded if the
submission is invalid.** Get the name, the ID and the card agreeing with each other before paying.

**Personal versus organization.**

| | Personal | Organization |
|---|---|---|
| Fee | 25 USD once | 25 USD once |
| Who it is for | *"personal use, such as students, hobbyists, or amateur developers"* | *"organizations or businesses engaged in commercial, industrial, professional, or governmental activities"* |
| D-U-N-S number | Not required | **Required.** *"You will not be able to create a developer account for an organization without one."* |
| Also required | Developer name, legal name, legal address, contact email, contact phone, developer email, a linked Google Payments profile, government photo ID | All of the above plus the organization name, address, phone, **website**, and a contact name |
| Verification | One-time password on every email and phone given, plus identity verification at signup, plus device verification through the Play Console mobile app for new personal accounts | Same, plus the D-U-N-S check |
| 12-tester rule applies | **Yes**, for accounts created after 2023-11-13 | **No** |

Sources:
[required information](https://support.google.com/googleplay/android-developer/answer/13628312),
[get started / fee](https://support.google.com/googleplay/android-developer/answer/6112435),
[testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465),
all checked 2026-09-13.

**Take the personal path.** Same reasoning as Apple, plus one more: the organization path needs a
D-U-N-S number, and Google's own page says acquiring one can take *"up to 30 days"*
([required information](https://support.google.com/googleplay/android-developer/answer/13628312),
checked 2026-09-13). A thirty-day wait to open a 25 USD account for a six-person family beta is not
a trade, it is a stall.

**The one thing the personal path costs you, and it is not free:** the 12-tester/14-day closed-test
requirement applies to personal accounts and does not apply to organization accounts. That
requirement gates the **public launch**, not this beta. See section 2 in full before you decide,
because this is the one decision in this packet that reaches past the beta. The recommendation
stands anyway: the beta is now, incorporation is not, and an organization account can be opened
later as a separate account if the public launch justifies it.

**Identity documents.** A government photo ID, and a credit or debit card in the same legal name.
Google's personal-account guidance is that *"For personal accounts, you will be required to provide
an official government identity document"*. Every email address and phone number given is verified
by one-time password and *"must ... remain operational for the duration of your developer account"*,
so do not use an address you will abandon.

**Device verification.** New personal accounts must verify a device through the Play Console mobile
app before apps can be made available. Have the phone you will use in your hand during signup, not
in another room.

**Processing time.** Google publishes none. The repo's *"near-instant for personal accounts"* in
`native/README.md` is **stale and misleading**: it describes the pre-2023 signup. Since the
identity-verification policy landed
([Android Developers Blog, 2023-07](https://android-developers.googleblog.com/2023/07/boosting-trust-and-transparency-in-google-play.html),
checked 2026-09-13) a personal account involves a government ID review and a device verification
step, neither of which is instant and neither of which Google puts a clock on. **Trust:** no
published time. Plan as unknown; the fee clears instantly, the account does not.

### 1c. D-U-N-S, said precisely

- A D-U-N-S number is a nine-digit business identifier issued by Dun and Bradstreet.
- **It is required only on the organization path, on both stores.** Apple:
  *"Your organization (excluding government entities) must have a D-U-N-S Number"*. Google:
  *"You will not be able to create a developer account for an organization without one."*
- **On the individual (Apple) and personal (Google) paths recommended above, it is not required at
  all.** You will not be asked for one.
- **This repo mentions D-U-N-S nowhere.** Checked 2026-09-13 across `docs/`, `native/`, `NOW.md`
  and `CLAUDE.md`: zero occurrences. That is not an oversight to fix, it is a consequence of the
  individual/personal path being the right one. It is recorded here so that the first time the
  word appears in a store form, it is already understood.
- **If it ever is needed:** Google states the process can take *"up to 30 days"*. Apple's own
  D-U-N-S lookup tool sits behind a sign-in and could not be read in this pass, so **Apple's stated
  turnaround is unknown**. Dun and Bradstreet's own free standard turnaround is commonly reported
  as up to thirty business days with a paid expedited option; that is **reported, not sourced from
  D&B in this pass, treat it as a guess.** The number to plan with is Google's documented
  "up to 30 days", because it is the only one with a citation.

---

## 2. Google's 12 testers for 14 days, and why it does not touch this beta

**It still applies in 2026.** Google's page is live and unchanged as of 2026-09-13:
[App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465).

**Who it applies to.** *"personal Google Play Console accounts created after November 13, 2023."*
Organization accounts are exempt. Personal accounts created before that date are exempt. A personal
account opened this week is squarely inside it.

**What it demands.** *"run a closed test for their app with a minimum of 12 testers who have been
opted in continuously for at least 14 days."* The original policy was 20 testers; Google cut it to
12 in December 2024. Continuity is the trap: a tester who opts in, tests, and opts out before day
fourteen does not count, and opting back in restarts their clock. Twelve people must be
simultaneously opted in for fourteen unbroken days.

**What it gates, and this is the whole answer.** *"Certain features in Play Console, such as
Production and Pre-registration, remain disabled until developers meet these testing requirements."*
**Production access only.** Internal testing and closed testing tracks themselves are not blocked.

So, against the plan:

- **Item 4 (six-person beta, Play internal track): not affected.** The internal track takes up to
  100 testers, added by email address, with builds *"available to testers within seconds"* and
  *"Internal tests might not be subject to standard Play policy or security reviews"*
  ([set up a test](https://support.google.com/googleplay/android-developer/answer/9845334),
  checked 2026-09-13). Six family members on the internal track is exactly what the track is for.
  No twelve, no fourteen days, no review queue.
- **Item 43 (Google closed test, twelve testers, fourteen continuous days): this is that rule.**
  The plan's own line, *"Twelve testers opted in for fourteen continuous days; six more people than
  the beta"*, is correct and correctly filed under Public launch. `docs/decisions.md` 2026-09-11
  also states it correctly: *"Google's 12 testers for 14 days rule applies to production access, not
  to internal testing, so it gates the public launch and needs six more people than this beta has."*
  **Both repo statements check out.** Nothing to correct.
- **The consequence nobody has priced:** item 43 is not a fourteen-day wait you start at launch. It
  is a fourteen-day wait you start **after** you have found six more people and got all twelve
  opted in on the same day. The clock does not begin until the twelfth person opts in. If the public
  launch matters on a date, the twelve names are the long-lead item, not the build.
- **The escape hatch, named honestly:** an organization Play account is exempt from the rule
  entirely. That is the only way around it, it costs a D-U-N-S number and a legal entity, and it is
  a launch-time decision, not a beta-time one. Do not let it change what you open this week.

Two further internal-track facts that make the beta easier than the README implies:

- **Data safety is not required for the internal track.** *"Apps that are active on internal testing
  tracks are exempt from inclusion in Google Play's Data safety section."* Same source.
- **App setup does not have to be finished.** Builds can be distributed to internal testers before
  completing app setup. So the privacy-policy URL (gated on plan item 6 and item 40) and the content
  rating questionnaire do **not** block the six-person Android beta. They block closed testing, open
  testing and production. `native/README.md` step 2 of the Google section lists the content rating
  and data safety forms as prerequisites to creating the app; for the internal track they are not.
  Fill them anyway when the answers exist, because item 41 needs them and because answering them
  early is free. Just do not let them hold up item 4c.

---

## 3. The fields Shin specifically needs

Fill these in on paper before either console is open. The values marked GATED must not be entered
as a placeholder into a field that cannot be changed later.

### 3a. The identifier, which is a one-way door

**Current real values in the repo, quoted, checked 2026-09-13:**

| File | Key | Value as it stands today |
|---|---|---|
| `native/capacitor.config.json` | `appId` | `com.placeholder.pricecheck` |
| `native/capacitor.config.json` | `appName` | `PriceCheck Placeholder` |
| `native/android/app/build.gradle` line 4 | `namespace` | `com.placeholder.pricecheck` |
| `native/android/app/build.gradle` line 7 | `applicationId` | `com.placeholder.pricecheck` |
| `native/ios/App/App.xcodeproj/project.pbxproj` lines 312 and 333 | `PRODUCT_BUNDLE_IDENTIFIER` | `com.placeholder.pricecheck` (Debug and Release) |
| `native/android/app/src/main/res/values/strings.xml` | `app_name`, `title_activity_main` | `PriceCheck Placeholder` |
| `native/android/app/src/main/res/values/strings.xml` | `package_name`, `custom_url_scheme` | `com.placeholder.pricecheck` |

**Every one of those is a placeholder.** `native/README.md` says so at the top of the file:
*"The app name and bundle id are PLACEHOLDERS."* Nothing here was invented for this document; these
are the strings in the tree at commit `bfd79be`.

**Why this is the most dangerous field in the packet.** The identifier cannot be changed after it is
used:

- Android: change the application id after publishing and Play treats the upload as a completely
  different app. A new version must use the same application id and signing certificate as the
  original
  ([Android: configure the app module](https://developer.android.com/build/configure-app-module),
  checked 2026-09-13).
- iOS: the bundle id is registered as an App ID, baked into provisioning profiles and every build,
  and cannot be changed after the first build is uploaded; changing it means creating a new app in
  App Store Connect. Worse, Apple's own forums carry a 2026 thread titled "Unable to reuse Bundle ID
  across accounts after TestFlight-only usage"
  ([forum thread 821955](https://developer.apple.com/forums/thread/821955), found 2026-09-13), which
  says a bundle id can be burned by a TestFlight build alone, with no App Store release at all.

**Therefore: `com.placeholder.pricecheck` must never reach either console.** Not as a test, not
"just for TestFlight", not to see whether the upload works. Registering it burns the string forever
and it is one letter away from a real reverse-domain name you might want.

**What to do instead.** The identifier does **not** have to contain the product name. It has to be
a reverse-DNS string you control and will not regret. A domain you already hold is the safe base,
which is the ACT Cloudflare domain named in beta-plan item 1a. Decide the string before you open
either console, write it in the blank below, and use the identical string on both stores.

```
Bundle id / application id to use:  _______________________________________
(reverse DNS on a domain you hold. NOT com.placeholder.pricecheck. Same string on both stores.)
```

Once decided, `native/README.md`'s table is the map: edit `capacitor.config.json`, run
`npx cap sync` from `native/`, and hand-move the Java package folder
(`native/android/app/src/main/java/com/placeholder/pricecheck/MainActivity.java`), which sync does
not move.

### 3b. The app name, and the ordering problem

**The name is GATED on beta-plan item 5, the CIPO trademark search, and on `CLAUDE.md` hard rule 1:**
*"No store listing, handle, or posted video under a name that has not passed a CIPO search in the
software classes."* `docs/decisions.md` already records that *"Shin Ramen" is dead as a name*
(2026-09-03: Nongshim's SHIN RAMYUN is registered, first use 1987). Plain "Shin" for software is
unchecked. Exit line E11 of the beta plan is explicit: *"The name is cleared or replaced before the
App Store Connect record is created."*

**The ordering problem, stated plainly, because it is not the same on both stores:**

- **The display name is recoverable on both stores.** On App Store Connect the app name can be
  edited freely until the app is submitted to App Review, and after release it changes with a new
  version. On Play Console the internal name and the public store listing name are both editable
  later. So a placeholder display name on a not-yet-submitted record is a mistake you can undo.
- **The identifier is not recoverable on either store** (section 3a).
- **And one more that is not recoverable on Apple: the Developer Name**, the seller name shown on
  the listing. It is set when you add your first app to the account and **cannot be edited
  afterwards**. On the individual path that value is your personal legal name, which is a fact about
  you and not about the product, so the trademark search does not gate it. Know that it is
  permanent before you create the first app record.

**So the ordering rule is not "wait for the name". It is:**

> Open both accounts now. They contain no product name.
> Do not create an app record on either store until the identifier is decided (3a) and the trademark
> search (item 5) has returned.
> The app record is the first irreversible product-shaped act. Everything before it is safe.

Blanks:

```
App name, public (after item 5 clears):  _______________________________________
App name, Play Console internal name:    _______________________________________  (editable anytime)
Subtitle / short description:            _______________________________________
```

### 3c. URLs

```
Privacy policy URL:  ____________________________________  GATED on plan items 6 and 40
Support URL:         ____________________________________  GATED on the name, see below
Marketing URL:       ____________________________________  optional, leave blank for the beta
```

- **Privacy policy URL.** Required for Play's "App content" section before the target-audience
  section can be filled, and required for an App Store submission. **Not required for the Play
  internal track** (section 2) and not required to distribute a TestFlight build to internal
  testers. Plan item 40 makes this a hosted document that matches the consent screen word for word;
  item 6a writes the consent text. Until both exist there is no honest URL to type. Do not point it
  at a page that says the data stays on the device: item 6e exists specifically to delete that false
  sentence wherever it still appears.
- **Support URL.** Apple requires one at submission. The beta hostname from item 1a is deliberately
  a neutral subdomain that names nothing, so a support page under it is possible without touching
  the name question; a support page under a Shin-branded domain waits on item 5. **Guess, marked as
  such:** a one-page static file on the tunnel hostname with a contact email is the cheapest thing
  that satisfies the field. Not verified against Apple's current review behaviour in this pass.

### 3d. Category and rating

```
Apple primary category:    Shopping
Apple secondary category:  Utilities          (optional, judgement, not a requirement)
Google category:           Shopping
Google target audience:    18 and over        (see the warning below)
Expected content rating:   Everyone / 4+      (expected, not yet answered in a questionnaire)
```

**Target audience is a trap.** Google requires a target age group declaration on every new app, and
anything that includes children in the target audience must comply with the Families policy, which
brings its own review, its own ads rules and its own data restrictions. Shin photographs shelves and
stores scans. Declare **18 and over** unless there is a product reason not to, and there is not one.

**The content rating questionnaire will ask one question that is not obviously about Shin, and the
answer is yes:** does the app let users interact, share content or share their location with other
users? Beta exit line E7 is *"A price typed on phone A shows on phone B as 'one shopper saw'"*. That
is user-generated content from one person reaching another person. It is not chat and it is not
location sharing (item 11b stores an OpenStreetMap shop id and name, not the person's position, and
what other users see is the store name, which `docs/decisions.md` already frames as provenance). But
answer the interaction question truthfully rather than reflexively "no", because the app does
propagate one user's typed input to another user's screen.

### 3e. Data safety (Google) and privacy nutrition labels (Apple)

These are drafted from what the code actually does, read at commit `bfd79be`, not from a template.
The ground truth, with files:

- **Every scan is stored, unconditionally.** `app/src/scans.ts` defines the `scan` table:
  `device_id`, `kind` (barcode / text / photo), `query_text`, `resolved_code`, `resolved_label`,
  `confidence`, `source`, `outcome`, `failure_class`, `corrected_code`, `scanned_at`, `category`.
  Migration 2 in `app/src/migrations.ts` adds `photo_path`, `model_json`, `typed_price_cents`,
  `verdict_tier`, `verdict_confidence`, `verdict_sellers`, `app_version`, `platform`, `latency_ms`,
  `model_cost_cents`.
- **The photo is kept only with express consent.** Migration 2's own comment on `photo_path`:
  *"Null when there was no photo or when the device had not consented."* `app/src/photos.ts` stores
  bytes in a photos folder keyed by scan id; the consent check lives in `app/src/consent.ts`.
- **Location is coarse and consented.** Migration 6 and `app/src/stores.ts`: the cell is *"the
  coarse square the phone was in, never coordinates"*, snapped to a 0.01 degree grid before it
  reaches the column, *"so a client that sent six decimal places does not get six decimal places
  stored"*.
- **Consent is stored per device.** Migration 5's `consent` table: `device_id`, `photos`,
  `location`, `updated_at`. Two independent flags, off by default per plan item 6b.
- **There are no accounts.** Migration 12 adds a nullable `user_id` and an empty `device_user` link
  table, *"empty until accounts exist"*. No name, no email address, no postal address, no phone
  number is collected anywhere in the app.
- **An event log exists.** Migration 4's `event` table: `device_id`, `type`, `payload`, `created_at`.
  `app/src/events.ts` states it holds *"no coordinates (the coarse cell only, and only with consent),
  no photo bytes"*.
- **Ratings.** Migration 3's `scan_rating`: `scan_id`, `device_id`, rating and reason.

**Google Play Data safety, section by section.** (Not required for the internal track. Required for
closed testing, open testing and production, and it is plan item 41.)

| Data type | Collected | Shared with third parties | Required or optional | Purpose | Notes to type into the form |
|---|---|---|---|---|---|
| Photos and videos > Photos | Yes | No | **Optional** | App functionality, Analytics | Only when the device's photo consent flag is on. `photo_path` is null otherwise. |
| Location > Approximate location | Yes | No | **Optional** | App functionality, Analytics | A roughly one-kilometre cell computed on the phone. Precise location is never collected. |
| App activity > Other user-generated content | Yes | No | Required | App functionality, Analytics | Typed prices, corrections, rating reason chips. |
| App activity > Other actions | Yes | No | Required | Analytics | The event log: app opened, scan started, answer shown, thumbs, correction, share, consent change. |
| App info and performance > Diagnostics | Yes | No | Required | Analytics, App functionality | `app_version`, `platform`, `latency_ms`, `failure_class`, `model_cost_cents`. |
| Device or other IDs > Device or other IDs | Yes | No | Required | App functionality, Analytics | An app-generated device id. Not an advertising id. |
| Personal info (name, email, address, phone) | **No** | No | | | The app has no accounts and asks for none. |
| Financial info | **No** | No | | | A typed shelf price is a fact about a store, not about the user's finances. |
| Messages, contacts, calendar, health, files | **No** | No | | | |

Also answer on that form:

- **Is data encrypted in transit?** Yes. The beta is served over HTTPS through the Cloudflare tunnel
  (plan item 1). Say yes only once item 1k has actually been checked from a phone on cellular.
- **Can users request data deletion?** Yes, by the route plan item 6d defines (an email address for
  the beta). **Today this is a promise item 6d has to keep; if 6d has not shipped when you fill the
  form, the truthful answer is no.** Do not answer yes for a mechanism that does not exist.
- **Does the app follow the Families policy?** Not applicable at 18 and over.
- **Retention.** Plan item 39d is *"Photo retention of 90 days, then deletion."* **Unverified as
  built.** Do not claim a retention period the code does not enforce.

**Apple privacy nutrition labels.** Filled at App Store submission (plan item 46), not required to
put a build in front of internal TestFlight testers. Draft:

- **Data Used to Track You:** **None.** There is no advertising id, no third-party SDK, no data
  broker.
- **Data Linked to You:** **None.** There is no account and no identity to link to. Migration 12's
  `device_user` table is empty until accounts exist; the day it stops being empty this answer
  changes and must be revisited.
- **Data Not Linked to You:** User Content (Photos, optional and consented) · Location (Coarse
  Location, optional and consented) · Identifiers (Device ID) · Usage Data (Product Interaction,
  Other Usage Data) · Diagnostics (Performance Data, Other Diagnostic Data) · User Content (Other
  User Content: typed prices, corrections, ratings).
- **The one thing that can quietly break this:** if a delete-my-data email from a tester is answered
  by writing down "this email address goes with this device id" anywhere, that mapping links the
  device id to a person, and the Apple answers above become "Data Linked to You". Keep the mapping
  out of the app and out of the databases; handle a deletion by acting on it and not by recording
  the pairing.
- Plan item 41 already names the Apple side as *"user content (photos), location, identifiers"*.
  That matches, and this draft adds usage data and diagnostics, which item 41 omits and migration 2
  demonstrably collects.

---

## 4. What each account unblocks, and what stays blocked

**The Apple Developer Program account unblocks:**

- Plan item 4a, the App Store Connect app record, for iOS.
- Plan item 4b, uploading the build from Xcode and adding the six people as testers.
- Exit line **E1, iOS half**: *"The iOS build is installed through TestFlight on a parent's phone"*.
- Code signing beyond the seven-day personal-team certificate that `native/README.md` describes in
  iOS prerequisite 3. Without the paid account, an iOS build dies on a tester's phone after a week.
- Input I1 in the schedule is this account.

**The Google Play Console account unblocks:**

- Plan item 4a, the Play Console app, for Android.
- Plan item 4c, the internal-track release and the opt-in link.
- Exit line **E1, Android half**.
- Later, item 43's closed test and item 46's submission, which run on the same account.
- Input I2 in the schedule is this account.

**Neither account unblocks, and neither is blocked by:**

- Items 1 through 3 and 5 through 39 of the plan. The server, the wrapper build, the camera work,
  the consent screen, the scan record, the ratings and the eval all run with no store account at
  all. The plan's Monday line is the relevant one: until the accounts clear, the six testers
  sideload the Android build and use the hosted web app in Safari on iPhone, *"so the store approval
  wait costs no testing days"*.

**What stays blocked until the name clears (item 5), even with both accounts open and paid:**

- **Creating the app record on either store.** Exit line E11 says the name is cleared or replaced
  before the App Store Connect record exists, and hard rule 1 forbids a store listing under an
  uncleared name.
- **Everything downstream of the record:** the build upload, the tester invites, the opt-in link,
  and therefore item 4 entirely and exit line E1.
- **Note what is NOT blocked by the name:** opening both accounts, paying both fees, passing both
  identity verifications, and deciding the bundle id (3a), because a reverse-DNS string on a domain
  you already hold contains no product name. That is the whole point of doing enrolment first: it
  takes the unpredictable multi-week step and runs it in parallel with the trademark search instead
  of after it.

**The failure mode this ordering avoids.** Enrol, wait for approval, then discover the name is
taken, then rename, then find the bundle id you already registered is burned and cannot be reused
even though nothing shipped. Section 3a's forum citation is that exact story.

---

## 5. Input I6: the six testers

Schedule input I6 is *"The six testers' Apple IDs and Gmail addresses, the day the accounts clear.
Gates item 4."* Fill this in before the day it is needed; chasing six people for an email address is
a weekday, not an hour.

```
                    Apple Account email                Google account email              Phone
 1. ______________  ________________________________   ______________________________    iPhone / Android
 2. ______________  ________________________________   ______________________________    iPhone / Android
 3. ______________  ________________________________   ______________________________    iPhone / Android
 4. ______________  ________________________________   ______________________________    iPhone / Android
 5. ______________  ________________________________   ______________________________    iPhone / Android
 6. ______________  ________________________________   ______________________________    iPhone / Android
```

**Why the two columns are different addresses, and why it matters.**

- **Apple needs the email address that is the person's Apple Account** (what used to be called the
  Apple ID). It does not have to be an @icloud.com address; many people's Apple Account is a Gmail
  address. What matters is that it is the account signed in to the App Store on the iPhone they will
  test on. An invite sent to an address that is not their Apple Account will not attach to their
  device.
- **Google needs the Google account the Play Store on that phone is signed in with.** The internal
  track opt-in is matched against the Play Store account on the device. If a tester gives you one
  Gmail and their phone's Play Store uses another, the opt-in link will tell them the app is not
  available and there is no error message that explains why. **Ask them to check the Play Store
  account on the phone itself**, not to tell you their email from memory.
- Only a tester on an iPhone needs the Apple column filled; only a tester on an Android phone needs
  the Google column. A tester with both phones needs both.

**The Apple surprise, and it is the biggest one in this packet.** TestFlight **internal** testers are
not just an email address on a list. Apple: internal testers *"must be members of your development
team holding one of these roles: Account Holder, Admin, App Manager, Developer, or Marketing"*, up
to 100 of them ([TestFlight](https://developer.apple.com/testflight/), checked 2026-09-13). So
putting six parents on TestFlight internal testing means **adding six people as users on your App
Store Connect account**, each with a role. The lowest-privilege role that still receives internal
builds is the one to pick; **which role that is was not verified in this pass**, so read the role
descriptions in App Store Connect rather than assuming, and do not hand anyone Admin.

`native/README.md` step 4 of its Apple section says *"add the six testers by email as Internal
Testers (no App Review needed)"*. The "no App Review" half is right. The "by email" half hides the
team-membership step. `docs/decisions.md` 2026-09-11 says it more accurately: *"up to 100 App Store
Connect users"*, which is literally what they become.

**The alternative, if giving family members App Store Connect roles is unwelcome:** external testing
takes up to 10,000 people by plain email invitation or a public link, with no team membership. The
price is Beta App Review on the first build of each version: *"Your builds are automatically sent for
review once they're added to a group"*. That is a review queue in the path, which internal testing
does not have. **Recommendation: internal, because six people and no queue beats no queue and a
review.** But know the option exists before you start clicking, because the choice is made at the
moment you create the tester group.

Google has no equivalent complication. Internal-track testers are email addresses on a list, up to
100, and *"builds [are] normally available to testers within seconds of being added in Play Console"*.

---

## 6. The ordered checklist

### Before you start: have these on the desk

- [ ] Government photo ID (both stores may ask; Google's page says a personal account will be asked)
- [ ] A credit or debit card **in your own legal name**, matching the ID
- [ ] Your legal name spelled exactly as on the ID, and a street address (**not** a P.O. box, Apple
      rejects those)
- [ ] The Apple Account you will use, with two-factor authentication already switched on
- [ ] The Google account you will use, with 2-step verification already switched on
- [ ] An iPhone or iPad with the **Apple Developer** app installed (Apple's identity verification
      runs through it)
- [ ] An Android phone with the **Play Console** app installed (Google's device verification runs
      through it)
- [ ] A contact phone number and a contact email address you will keep for years, because Google
      requires both to *"remain operational for the duration of your developer account"*
- [ ] The decided bundle id string from section 3a, written down
- [ ] One uninterrupted hour, and the expectation that both accounts end the hour "pending"

### The order, with the dead ends it avoids

1. **Decide the bundle id (section 3a). On paper, before anything is open.** It is the only
   irreversible value in the packet and it does not depend on the trademark search. Skipping this
   step is how `com.placeholder.pricecheck` ends up registered forever.
2. **Enrol in the Apple Developer Program, individual path.** Apple Developer app on the iPhone, or
   the web. Legal name exactly as on the ID. Pay the 99 USD. Expect to be asked for the photo ID.
   Then stop and wait; Apple publishes no clock and the tail is weeks.
3. **Register the Google Play Console account, personal path, same sitting.** 25 USD one time,
   identity verification with the government ID, then device verification through the Play Console
   app on the Android phone. Check the name on the ID, the name on the card and the name in the form
   all match before paying: **the fee is not refunded if the submission is rejected.**
4. **While both are pending, do everything that needs no account.** This is most of the plan: items
   1, 2, 3, 6 through 20, the eval, the consent screen. The Monday line of the schedule already
   assumes this and it is right.
5. **Wait for the trademark search, item 5, to return.** Record every hit with number, class and
   status per item 5b. Then decide keep or rename per item 5c. Exit line E11 is the gate.
6. **Only now: create the app record on each store.** This is the first irreversible product-shaped
   act.
   - Apple: register the App ID with the decided bundle id, then create the app record with the
     cleared name. **Remember the Developer Name (seller name) is set here and never again.**
   - Google: create the app with the cleared name; the Play Console internal name stays editable
     but the application id does not.
7. **Google only: fill the App content declarations as far as the answers exist** (target audience
   18+, ads declaration, content rating questionnaire, data safety from section 3e). **Do not let
   this block step 8**, because the internal track does not require them, and the privacy policy URL is
   gated on item 6 anyway.
8. **Ship to the two test tracks.**
   - Android: `./gradlew.bat bundleRelease` from `native/android` (a signing key is generated once
     through Android Studio's Generate Signed Bundle wizard), upload the `.aab` to Testing >
     Internal testing, add the six Google addresses, share the opt-in link.
   - iOS: Xcode Product > Archive, Distribute App > App Store Connect > Upload. Then add the six
     people as App Store Connect users with a tester-capable role (section 5), then add them to the
     internal TestFlight group.
9. **Check at the consumer, not at the console.** Exit line E1: *"a screenshot from the tester's
   phone"*. A green upload and a sent invite are producer evidence. The beta has started when a
   parent's phone shows the app.

### The three dead ends this order exists to avoid

- **Registering the placeholder bundle id.** Burned forever, including by a TestFlight-only build.
  Step 1 prevents it.
- **Creating an app record under an uncleared name.** Breaks hard rule 1, and on Apple it also sets
  the permanent seller name. Step 5 before step 6 prevents it.
- **Waiting on the trademark search before enrolling.** The enrolment wait is the one with no
  published ceiling, and it is the only step in this packet that no decision here can shorten. Steps
  2 and 3 run in parallel with step 5 precisely so that the uncontrollable wait and the controllable
  one overlap instead of queueing.

---

## 7. What this document could not establish

Recorded rather than smoothed over.

- **The Canadian-dollar price of the Apple Developer Program.** Apple says local currency and shows
  the figure only inside the signed-in enrolment flow. Not entered. **Unknown.**
- **Any published processing time, from either vendor, for either account.** Neither publishes one.
  Apple's only stated number is a 24-hour confirmation-email threshold. The 48 hours in
  `native/README.md` has no source and should not be planned against.
- **Apple's own stated turnaround for a D-U-N-S number.** Its lookup tool sits behind a sign-in.
  Moot on the individual path.
- **Dun and Bradstreet's own current free-tier turnaround.** Only Google's *"up to 30 days"* was
  sourced. The thirty-business-days figure repeated elsewhere is a **guess** here.
- **Which App Store Connect role is the minimum that still receives internal TestFlight builds.**
  Apple lists five roles that qualify; which is least privileged in practice was not tested. Read
  the role descriptions in the console.
- **Whether Apple requires the privacy nutrition labels before an internal TestFlight build can be
  distributed.** Reported to be required only at App Review submission. **Not verified** against an
  Apple page in this pass.
- **Whether the TestFlight 90-day build expiry still stands in 2026.** Widely repeated, not found on
  Apple's own TestFlight page in this pass. **Treat as reported, not confirmed.**
- **Everything in section 3e that depends on unbuilt code.** The deletion route (item 6d) and the
  90-day photo retention (item 39d) are plan items, not shipped behaviour. The data-safety form asks
  what the app does, not what it will do.

---

## Sources

- [Apple Developer Program: become a member](https://developer.apple.com/programs/enroll/) · checked 2026-09-13
- [Apple: enrollment help](https://developer.apple.com/help/account/membership/program-enrollment/) · checked 2026-09-13
- [Apple: identity verification](https://developer.apple.com/help/account/membership/identity-verification/) · checked 2026-09-13
- [Apple: TestFlight](https://developer.apple.com/testflight/) · checked 2026-09-13
- [Apple forums: enrollment pending over 3 weeks](https://developer.apple.com/forums/thread/817247) · found 2026-09-13
- [Apple forums: enrollment stuck 45+ days](https://developer.apple.com/forums/thread/816626) · found 2026-09-13
- [Apple forums: unable to reuse bundle ID after TestFlight-only usage](https://developer.apple.com/forums/thread/821955) · found 2026-09-13
- [Play Console: get started, and the US$25 fee](https://support.google.com/googleplay/android-developer/answer/6112435) · checked 2026-09-13
- [Play Console: required information to create a developer account](https://support.google.com/googleplay/android-developer/answer/13628312) · checked 2026-09-13
- [Play Console: app testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465) · checked 2026-09-13
- [Play Console: set up an open, closed, or internal test](https://support.google.com/googleplay/android-developer/answer/9845334) · checked 2026-09-13
- [Play Console: content rating requirements](https://support.google.com/googleplay/android-developer/answer/9859655) · checked 2026-09-13
- [Android Developers Blog: boosting trust and transparency on Google Play (developer verification)](https://android-developers.googleblog.com/2023/07/boosting-trust-and-transparency-in-google-play.html) · checked 2026-09-13
- [Android: configure the app module (application id permanence)](https://developer.android.com/build/configure-app-module) · checked 2026-09-13

Repo sources read for this packet, at commit `bfd79be`: `docs/the-beta-build-plan.md` (items 2, 4,
5, 6, 43, 46 and the schedule section with I1, I2, I6 and exit lines E1 and E11) ·
`docs/decisions.md` ("The beta is six people on the stores' own test tracks", 2026-09-11; "'Shin
Ramen' is dead as a name", 2026-09-03) · `native/README.md` ("Store setup" and "The name is not
cleared yet") · `native/capacitor.config.json` · `native/android/app/build.gradle` ·
`native/android/app/src/main/res/values/strings.xml` ·
`native/ios/App/App.xcodeproj/project.pbxproj` · `app/src/scans.ts` · `app/src/migrations.ts` ·
`app/src/consent.ts` · `app/src/events.ts` · `app/src/photos.ts` · `CLAUDE.md` hard rule 1 ·
`memory/lessons.md` (2026-09-12).
