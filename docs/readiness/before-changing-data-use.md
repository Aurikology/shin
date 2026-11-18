# Before shipping a change that uses data differently (one page, 2026-11-18)

Register item R47. Use it before any release, server deploy or vendor change. It takes ten minutes. **If the answer to the
first question is yes, the change does not ship until every box below is ticked.** Reason: Apple, the privacy regulators and
the shoppers each have a published promise to compare against, and today nothing checks that our own changes keep it.

## 1. Does this change what we collect, who receives it, or why?

Yes if the change does any of these:
- [ ] A new field, event, header, log line or table that holds something about a phone or a person (a device id, an IP address, a scan, a typed word, a location, a purchase).
- [ ] A new service receives anything (a new vendor, a new SDK or plugin, a new API call), or an existing one receives something new (Anthropic, RevenueCat, Cloudflare, Open Food Facts, Overpass, Apple, Google, a new analytics tool).
- [ ] A longer keep time, a new kind of backup or log, or a table with no deletion path.
- [ ] A new use: training or tuning on shopper data, showing one shopper's entry to others, contacting a shopper, ads.
- [ ] Anything that touches children differently (a new screen where a child could enter data, a feature that shares).

No to all: write "no data-use change" in the commit message and ship.

## 2. If yes, update these four in the same release

| What | Where | Done when |
|---|---|---|
| **Privacy policy** | `docs/store/privacy.html` and `docs/store/privacy-fr.html`, and the effective date and footer on both | The new collection, recipient, purpose and keep time are in the text, in both languages. Bump the effective date. Deploy the pages (R60 check). |
| **App Store privacy label** | `docs/store/listing.md` ("App Privacy answers"), then App Store Connect, App Privacy | The table row matches the code. If the label changes, answer it in App Store Connect before the build goes in. |
| **Privacy manifest** | `native/ios/App/App/PrivacyInfo.xcprivacy`, and the privacy report on the real archive (Xcode, Product, Archive, Generate Privacy Report) | Every collected data type and every required-reason API the app or its plugins use is listed; the report shows nothing unexpected. |
| **Quebec transfer note** | `docs/store/quebec-transfer-note.md` | A new recipient has a row: what they receive, whether it is personal information, where it is, why, the safeguard. A recipient outside Quebec is named on the privacy page ("Outside your province"). |

## 3. Then check these, the ones people forget

- [ ] **Deletion.** Does `scripts/privacy/device-data.mjs` (export and delete) cover the new table or field? If not, add it before shipping.
- [ ] **Retention.** Is the new data in the cleanup (`app/src/retention.ts`) or written down as "kept until a request"?
- [ ] **Backups and logs.** Does the new data land in a log or backup that is never rotated?
- [ ] **Children.** Does `docs/privacy/children-record.md` still describe what is collected?
- [ ] **Breach plan.** Does `docs/privacy/breach-plan.md` need a new line (a new place data can leak from)?
- [ ] **Vendor terms.** Did you read the new vendor's terms and privacy page, and write the date in the vendor table (`HANDOVER.md`)?
- [ ] **Customer words.** Are the in-app first-run screens and the store text still true? (Plain, confident, no doubts volunteered; nothing false.)

## 4. Sign-off

Written in the commit message or the release note: `data-use: none`, or `data-use: <what changed>; policy, label, manifest,
transfer note updated <date>`. Jamin signs off any change that adds a recipient or a keep time.

Source: `docs/security-check/legal-review-2026-11-17.md` (questions 3 and 11), `docs/store/quebec-transfer-note.md`.
