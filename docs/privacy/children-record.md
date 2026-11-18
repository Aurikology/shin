# Pexi: "likely to be accessed by children" record (2026-11-18)

One page, written because the OPC's Children's Privacy Code asks for the decision in writing (legal review,
`docs/security-check/legal-review-2026-11-17.md`, questions 2, 4, 5 and 6; register items R53 and R91). **Draft for Jamin
Xu, the person in charge of personal information, to read and sign. Not legal advice.** Facts come from the code, the
privacy page and the Terms; anything not checked is labelled ASSUMED.

## 1. The decision

Pexi is **likely to be accessed by children**. It is a free, all-ages iPhone app rated 4+, its Terms (section 2) say it is
for people of all ages, and it has a friendly mascot. The Code applies "regardless of whether children are the intended or
primary audience", so we treat the Code as the standard even though only PIPEDA is binding law.

Pexi is **not aimed at children** and is not in the Kids Category.

## 2. What we collect from any user, so also from a child

Source: `docs/store/privacy.html` and `docs/store/listing.md`.
- A random device id and a secret, both made on the phone and kept in the Keychain. No name, email, phone number, birth date, contacts or account.
- What is scanned or typed, the answer given, usage events, and a server log (time, address requested, IP address, country, user agent).
- Rough location (a 1 km square) only if the user turns it on; off by default. Exact coordinates are refused by the server.
- Typed prices and store picks, which can be used in answers to other shoppers.
- No photos or camera images leave the phone in this version. No ads, no ad identifiers, no tracking across other companies' apps.

## 3. Why this is acceptable, in our reasoning

- **Necessary to give the service.** The scan, the device id that runs the weekly quota and the short-lived security log are
  needed to answer the shopper who asked. We rely on the "clearly for the minor's benefit" reading for these (legal
  review, question 2: unsettled, so this is a position, not a certainty).
- **Nothing sensitive is asked.** No name, no contact detail, no age. Implied consent for necessary, non-sensitive data is
  the PIPEDA basis (legal review, question 5).
- **The optional parts are off by default.** Location is off until the user turns it on, and the privacy page tells a
  person under 14 to ask a parent first. Sharing a typed price is the user's own act.
- **Retention is short.** Request logs 90 days, usage events 12 months, the device id removed from scans after 24 months
  (`app/src/retention.ts`). The unswept tables listed in `docs/privacy/data-requests.md` stay until a request.
- **Deletion is easy.** Delete my data in the app prepares an email; a parent can write to the support address and the
  records tied to that device are deleted (`docs/privacy/data-requests.md`, section 1b).
- **The AI model never sees the child.** Claude receives a product name, brand, size, category and country only, with no
  device id, image or location, and only if the user said yes. Anthropic's minors guidelines apply where a minor interacts
  directly with the model; here nobody talks to it, and a grocery price range is not a high-risk use (legal review,
  question 6). The version of Anthropic's commercial terms in force on the day the account was opened has not been read
  for an age clause: ASSUMED none (a June 2025 copy had none).

## 4. What we have not done, and the cost

- **No age screen and no parent step for under 13s.** A strict reading of the Code points to one. The likely cost of
  having none is an OPC complaint that ends in recommendations, not a fine (legal review, question 5). Decision for 1.0:
  no age gate; revisit if a complaint arrives or the Code's final text adds a deadline.
- **No under-14 line on the location screen yet.** The privacy page has it (both languages, 2026-11-18). Putting it on the
  screen where location is explained is Jamin's call and an app change (not in this lane).
- **Purchases.** A subscription bought by a minor without Ask to Buy may be voidable (legal review, question 7). Pexi cannot
  refund an App Store purchase; only Apple can. Policy: reply the same day with Apple's refund link
  (reportaproblem.apple.com), say Pexi supports the refund, never contest a parent's request. Text is in
  `docs/readiness/TEMPLATES.md`, "Refund or purchase by a child".

## 5. Who answers and when

Jamin Xu answers every parent or regulator message. First reply within 2 business days (our own target). Review this record
when: a parent or regulator writes, the OPC publishes the final Code, the app collects a new kind of data
(`docs/readiness/before-changing-data-use.md`), or on 2027-01-20 (comment deadline), whichever is first.

Read and signed: __________________  Date: ____________
