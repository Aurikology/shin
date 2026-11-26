# Legal review G: coverage and hostile reading (2026-11-26)

Not legal advice; nobody here is a lawyer. Inputs: 00-inventory.md (I-001..I-217) and area reviews A (privacy), B (data sources), C (claims), D (subscriptions/business), E (platform policies), F (IP/security/ownership). "Verified" below means I read the code or the page this session; "UNVERIFIED" means I did not retrieve the primary text. Nothing was edited in code. No source file contents of credentials are repeated here.

Key: A-G6 = review A gap row G6; A§1a = review A section 1a table row; B-row = review B section 4 table row; E-gapN = review E "top gaps" number N; "UNCOVERED" = no area review addresses the item; I then judged it (verdict column). N-numbers point to section 2.

## 1. Coverage table

### Routes (I-001..I-038)
| Item | Where covered | Verdict |
|---|---|---|
| I-001 shutter frame | A§1a Photos | OK. Verified: route returns 404 unless shutter log env is on (server.ts:3002-3008) |
| I-002 shelf frame | A§1a Photos | OK. Verified: server refuses 403 while FLAGS.photoId is false (shelf.ts:126), and the phone does not start the loop (camera.js:3269) |
| I-003 catalogue | UNCOVERED | OK, no personal data (PD) |
| I-004 categories | UNCOVERED | OK, no PD |
| I-005 scenarios | UNCOVERED | OK, test list, no PD |
| I-006 identify/demo | A§1a device id | OK |
| I-007 quota | A§1a Purchases | OK |
| I-008 identify | A§1a Scans; A§1b | OK, see A-G3 |
| I-009 match-text | A§1a Location | OK |
| I-010 search | A§1a Usage events (typed text) | OK |
| I-011 identify/pack | A§1b (refused for shoppers) | OK |
| I-012 identify/photo | A§1a Photos | OK. Verified: returns `no_model_call`, never reads the photo (server.ts:3761-3790) |
| I-013 price | A§1a device id | OK |
| I-014 correction | A§1a typed price; E-gap5 | GAP-minor (E-gap5, UGC terms) |
| I-015 scans | A-G7 | OK |
| I-016 scan-rating | A-G6 | OK |
| I-017 rating delete | A§1c (says no in-app erase; this route is one) | OK, A understates |
| I-018 consent | A§1c, A-G1/G2/G9 | GAP (A-G1) |
| I-019 event | A§1a Usage events | OK |
| I-020 client-error | A§1a Crash data | UNVERIFIED retention (A) |
| I-021 events/batch | A§1a Usage events | OK |
| I-022 stores | A§1a Location (Overpass) | OK |
| I-023 store-chains | UNCOVERED | OK, no PD |
| I-024 scan-price | A§1a typed price | OK |
| I-025 scan-call | A§1a (class: ratings) | OK |
| I-026 scan-pick | A§1a Network code; A-G6 | OK |
| I-027 health | UNCOVERED | OK. Verified: returns uptime, flags, counters, no PD (server.ts:4544-4560); exempt from invite by design |
| I-028 latency | UNCOVERED | OK. Verified: admin token only (server.ts:4623) |
| I-029 attribution | B (credit list) | OK |
| I-030 app-status | UNCOVERED | OK, no PD |
| I-031 pack-version | UNCOVERED | OK, no PD |
| I-032 pack | B-row OFF (no notice in pack) | GAP (B), ODbL 4.2 |
| I-033 static files | UNCOVERED | OK |
| I-034 CORS/OPTIONS | UNCOVERED | OK; allow-origin header not read, UNVERIFIED; API is invite/device-keyed, not cookie-authenticated |
| I-035 admin/tables | F§3 Secrets (admin token, timingSafeEqual) | OK |
| I-036 admin/sql | F§3 Secrets | OK (read-only DB open) |
| I-037 admin/people | F§3; A-G6 | OK |
| I-038 admin/file?path= | F§3 Secrets (token only) | OK on token; path handling of `file?path=` not read, UNVERIFIED |

### Outbound calls (I-039..I-062)
| Item | Where | Verdict |
|---|---|---|
| I-039 Anthropic | A§1b; E Anthropic table | GAP A-G3; OK on terms |
| I-040 RevenueCat REST | A§1a Purchases; E RevenueCat | OK |
| I-041 Open Food Facts live | B-row OFF (rate, UA) | OK |
| I-042 Open Prices | B-row Open Prices | minor GAP (UA has no contact) |
| I-043 Overpass | A§1a Location; B-row OSM | OK; public instance "problematic" (B) |
| I-044 Gemini removed | A§1b; B Gemini row | UNCOVERED residue: N5 |
| I-045 phone-to-server host | A§1c (Ontario, Cloudflare tunnel) | UNCOVERED: domain, owner, expiry. N1 |
| I-046 RevenueCat SDK | A§1a Purchases | OK |
| I-047 out-links (apple/google/GitHub Pages) | E (store links); GitHub Pages UNCOVERED | see section 3 (hosting) |
| I-048 mailto | A§1c | OK |
| I-049 CSP, fastly fallback | A-G11 (MediaPipe endpoint) | fastly.jsdelivr fallback UNCOVERED; verified present in `eye.js:538`, override to local wasm per inventory; UNVERIFIED by network capture; fold into A-G11 capture |
| I-050 Notion | UNCOVERED | OK if deploy reports hold no device id or photos; UNVERIFIED |
| I-051 GitLab/GitHub remotes | F§3 (GitHub 2FA) | GAP F; GitLab 2FA unknown |
| I-052 App Store Connect API | UNCOVERED | OK, operator key |
| I-053 Healthchecks ping | UNCOVERED | OK, URL ping only |
| I-054 self-health | UNCOVERED | OK |
| I-055 Cloudflare tunnel | A§1c, A-G4, A-G11 | Cloudflare terms UNVERIFIED (the fetched terms page defers to unread Service-Specific Terms) |
| I-056 Voyage | B-row Voyage | OK for names; terms unread (B) |
| I-057 HF model download | UNCOVERED | OK; model licence not read, UNVERIFIED |
| I-058 HF dataset | B-row OFF Canada | OK |
| I-059 eBay | UNCOVERED | OK while spine is not in the shopper path (grep shows app/price import none live; UNVERIFIED). Cost if live: eBay key revoked |
| I-060 Best Buy | B-row Best Buy | OK while inert |
| I-061 sold-comps | UNCOVERED | same as I-059 |
| I-062 Google Fonts at build | F§2 (fonts) | OK, runtime self-hosted |

### Databases and retention (I-063..I-090)
| Item | Where | Verdict |
|---|---|---|
| I-063 scan table | A§1a Scans; A-G6 | OK; typed text stays after id strip (A) |
| I-064 scan_rating | A-G6 | OK |
| I-065 event | A§1a | OK (12 months) |
| I-066 consent | A§1a; A-G6 (no sweep) | GAP A-G6 |
| I-067 device_user | A-G6 | GAP A-G6 |
| I-068 device_preference | A-G6 | GAP A-G6 |
| I-069 gemini_call | A§1b names the table | UNCOVERED content: whole Gemini request/response bodies kept; N5 |
| I-070 scan_pick/offer/later/outcome, plus_seen | A-G6 (plus_seen); retention covers rest | plus_seen GAP A-G6 |
| I-071 device_key | A-G6 | GAP A-G6 |
| I-072 device_person (tester names) | A-G6 | GAP A-G6 |
| I-073 corrections.db | A§1a | OK |
| I-074 shopper_price | A§1a Network code | OK |
| I-075 user-catalogue.db (device_key, scan_id) | UNCOVERED (A-G6 list omits it) | probable GAP: N2 |
| I-076 gaps.db | UNCOVERED | OK likely (barcodes only), UNVERIFIED for device column |
| I-077 repeat-cache.db | UNCOVERED | UNVERIFIED, never read |
| I-078 access.log | A§1a Server request log | OK |
| I-079 network-salt | A§1a Network code | OK |
| I-080 photos dir | A§1a Photos (says none uploaded) | UNCOVERED retention: N3 |
| I-081 shelf/shutter frames | A§1a Photos | OK (verified gated, see I-002) |
| I-082 Claude JSON caches | A§1b (answers logged, 90-day cache) | OK |
| I-083 app/data/deleted | UNCOVERED | N4 |
| I-084 phone localStorage | A§1a device id row | allowBackup side UNCOVERED: N6 |
| I-085 retention.ts | A-G6; A§1a log row | GAP A-G6 |
| I-086 photo retention default off (forever) | UNCOVERED | N3 |
| I-087 grounded 730 days | UNCOVERED | OK (constant set from Gemini terms, grounded-record.ts header) |
| I-088 scan_offer purge | A-G6 | OK |
| I-089 deletion on request | A§1c; A-G7 | OK with weak spot |
| I-090 backups | A§1c; A-G11 (R2); F§3 Backups | OK; destination UNVERIFIED (A-G11). Backups restore pre-strip ids; the 14/15-day ageing is the control |

### Android and iOS (I-091..I-112)
| Item | Where | Verdict |
|---|---|---|
| I-091 allowBackup=true | UNCOVERED | GAP-minor: N6 |
| I-092 INTERNET | E Permissions | OK |
| I-093 CAMERA | E 2.5.14 | OK |
| I-094 VIBRATE | E | OK |
| I-095 COARSE_LOCATION | E-gap2 | OK |
| I-096 FINE_LOCATION | E-gap2 | GAP (E) |
| I-097 location features optional | UNCOVERED | OK |
| I-098 camera required | UNCOVERED | OK, no legal angle |
| I-099 FileProvider | UNCOVERED | OK, exported=false |
| I-100 MainActivity exported | UNCOVERED | OK, launcher only |
| I-101 ACCESS_NETWORK_STATE | UNCOVERED | OK, normal permission |
| I-102 BILLING | E Payments | OK |
| I-103 Amazon IAP receiver | UNCOVERED | OK-low: N10 |
| I-104 ML Kit / data transport | E SDK Requirements (declare in Data safety) | UNVERIFIED: ML Kit's own data-collection disclosure not read |
| I-105 build config | E Target API | OK |
| I-106..I-109 iOS usage strings | E 5.1.1(iii), 5.1.5 | OK-minor (photo library strings) |
| I-110 export flag | E Export compliance | OK, UNVERIFIED on Apple page; see section 3 (US export rules) |
| I-111 PrivacyInfo | A-OK6; E App Privacy | OK pending A-G1/G5 |
| I-112 iOS target, iPad | E 2.4.1 | OK |

### Dependencies (I-113..I-129)
| Item | Where | Verdict |
|---|---|---|
| I-113 MediaPipe | F§2 GAP; A-G11 | GAP (notice file) |
| I-114 zxing-wasm | F§2 GAP | GAP (notice file) |
| I-115 esbuild | F (build only) | OK |
| I-116 Capacitor | F§2 | GAP (notice file) |
| I-117 in-app-review | F§2 ("etc.") | GAP (same fix) |
| I-118 ML Kit | F§2 ASSUMPTION | UNVERIFIED terms |
| I-119 RevenueCat SDK | F§2; E | GAP (notice file) |
| I-120 secure-storage | F§2 ("etc.") | GAP (same fix) |
| I-121 Android library tree | F (states Gradle artefacts not done) | UNCOVERED; UNVERIFIED, Apache-2.0 presumed |
| I-122 Fonts | F§2 | GAP confirmed by me: `app/public/fonts` holds Inter-OFL.txt only, no Plex licence; same in `native/www/fonts` |
| I-123 faces SVG | F§2 QUESTION | open question for owner |
| I-124 icons, screenshots | F§2 (icon.svg only) | screenshots UNCOVERED; origin question |
| I-125 native copies | F§2 (www fonts) | same as I-122 |
| I-126 anthropic sdk | F§2 | OK |
| I-127 LGPL sharp | F§2 bullet | OK, see below |
| I-128 server deps | F§2 | OK |
| I-129 models and data loaded | UNCOVERED | OK; e5 model licence UNVERIFIED |

### Collectors (I-130..I-156)
| Item | Where | Verdict |
|---|---|---|
| I-130 OFF | B-row OFF | OPEN QUESTION (B) |
| I-131 Open Beauty etc. | B-row OFF | same |
| I-132 Open Prices | B-row | minor GAP |
| I-133 OSM | B-row | OK; open question join |
| I-134 Icecat | B-row | OPEN QUESTIONS, cl.10 |
| I-135 USDA | B-row | OK |
| I-136 BC LDB | B-row | OK, add link |
| I-137 StatCan | B-row | PROBABLE GAP (wording) |
| I-138 Hammer | B-row | GAP-minor, see below |
| I-139 Kroger names | B-row | no licence |
| I-140 Kroger API | B-row | GAP (5(e)) |
| I-141 ANBL | B-row | OK for use; retention question |
| I-142 Walmart | B-row (reading not re-read) | same |
| I-143 Return-It | B-row | same |
| I-144 Consignaction | B-row | same |
| I-145 Metro | B-row | OPEN QUESTION |
| I-146 Canadian Tire | B-row SOF/CT | OK, registry forbids |
| I-147 Save-On-Foods | B-row | OK |
| I-148 Best Buy | B-row | OK inert |
| I-149 eBay, sold-comps | UNCOVERED | see I-059 |
| I-150 PLU | B-row | PROBABLE GAP (credit) |
| I-151 HF Canada dataset | B-row OFF | OK |
| I-152 taxonomies | B-row (licence not checked) | UNVERIFIED |
| I-153 lexicon fr-en | UNCOVERED | UNVERIFIED origin; owner question |
| I-154 crawler scripts, us-ip-probe | B (UA facts) partial | UNVERIFIED; `us-ip-probe` use of US IPs to reach US sites not assessed |
| I-155 shopper-typed ranges | A§1a; C | OK |
| I-156 offline pack | B-row OFF | GAP (B) |

### User content (I-157..I-170)
| Item | Where | Verdict |
|---|---|---|
| I-157 typed text | A§1a; A§1b | OK |
| I-158 typed shelf price | A§1a | OK |
| I-159 store names | A§1a | OK |
| I-160 corrections | A§1a; E-gap5 | GAP-minor (E) |
| I-161 learned picks | A§1a (net hash); E-gap5 | OK; others see changed answers |
| I-162 ratings | A-G6 | OK |
| I-163 shopper call | A-G6 | OK |
| I-164 photos | A§1a | OK |
| I-165 location | A§1a; A-G9 | JUDGMENT (A) |
| I-166 errors/events | A§1a | OK |
| I-167 invite name | A-G6 (device_person) | GAP A-G6 |
| I-168 local lists | UNCOVERED | OK if local only; UNVERIFIED |
| I-169 share screen | C§1.3 (store names on card) | content of share card UNVERIFIED |
| I-170 user_review/offer from model output | UNCOVERED | OK, derived, no typed personal text |

### Email, notifications, invite (I-171..I-178)
| Item | Where | Verdict |
|---|---|---|
| I-171 no server email | UNCOVERED | OK; CASL see section 3 |
| I-172 mailto | A§1c | OK |
| I-173 contact address | D (stale useshin address note) | OK |
| I-174 invite header, public code | UNCOVERED | N7 |
| I-175 native share | UNCOVERED | OK, OS share sheet |
| I-176 in-app review | E 3.2.2 | OK |
| I-177 referral | UNCOVERED | OK none exist; contest/referral rules would apply if added |
| I-178 operator alerts | UNCOVERED | OK, internal |

### Text surfaces (I-179..I-192)
| Item | Where | Verdict |
|---|---|---|
| I-179 ui-strings | C§1 | GAPs per C |
| I-180 onboarding strings | C§1.1-1.2 | GAP "any product" (C) |
| I-181 paywall/price strings | D Part 1 | OK |
| I-182 prose/voice | C§1.2 (legacy lines) | reachability unverified (C) |
| I-183 legal document | A, C, D | see A-G1..G6 |
| I-184 hosted legal pages | A-OK2 | hosting terms UNCOVERED, section 3 |
| I-185 store listings | A-G5; C; E-gap3 | GAP (documents) |
| I-186 store screenshots | UNCOVERED | UNVERIFIED: not opened; check they show no real retailer price as a verdict |
| I-187 screens | C, E | per C and E |
| I-188 Android app_name | UNCOVERED | OK trivial |
| I-189 privacy support docs | A-G7; F§3 breach plan | opc-comment-draft not read by any review, UNVERIFIED |
| I-190 marketing ads | UNCOVERED | N8 |
| I-191 seller/refund lines | D rows 6, 15 | GAP row 6 |
| I-192 old-name check | UNCOVERED | OK, inventory shows 0 hits |

### Accounts (I-193..I-209)
| Item | Where | Verdict |
|---|---|---|
| I-193 Apple | D, E | per D, E |
| I-194 Google Play | D, E | per E |
| I-195 RevenueCat | E; E-gap6 | GAP-minor |
| I-196 Anthropic | E | OK |
| I-197 Cloudflare, domain | A§1c, A-G11 | domain UNCOVERED: N1 |
| I-198 GitHub, Pages | F§3 (2FA) | Pages UNCOVERED, section 3 |
| I-199 GitLab | F§3 partial | GitLab 2FA UNVERIFIED |
| I-200 Gmail, old address, credential file | D stale-address note only | UNCOVERED file: N9 |
| I-201 Notion | UNCOVERED | see I-050 |
| I-202 Healthchecks | UNCOVERED | OK |
| I-203 Voyage | B-row | OK |
| I-204 Kroger, BestBuy, eBay accounts | B-row Kroger | account-holder identity unknown; UNVERIFIED |
| I-205 Mac as host | F§3 Machine hosting; A§1c | GAP F (state unknown) |
| I-206 GEMINI key in example config | UNCOVERED | N5 |
| I-207 Overpass/OFF | B | OK |
| I-208 Bitwarden | UNCOVERED | UNVERIFIED where master secrets live |
| I-209 D-U-N-S/org path | D row 22 (incorporate) | OK, decision |

### AI (I-210..I-217)
| Item | Where | Verdict |
|---|---|---|
| I-210 Claude range label | C R5; E | OK |
| I-211 pack reading | A§1b | OK, refused for shoppers |
| I-212 describe.ts | UNCOVERED | OK if not wired (inventory: no import in app/), UNVERIFIED |
| I-213 claude-chooser | UNCOVERED | OK batch only |
| I-214 Pexi math | C (R1) | OK |
| I-215 dormant Gemini UI | C§1.2 (legacy sheet, reachability unverified) | N5 |
| I-216 AI legal text | A-OK1; C | OK |
| I-217 Anthropic/Voyage catalogue building | B-row Voyage; B note on placement | GAP B (Icecat cl.10, placement not filtered) |

## 2. New gaps from the uncovered items (and the ones you named)

Each is OK or GAP with named cost and smallest fix. Primary sources I fetched this session are marked FETCHED; everything else is UNVERIFIED.

**N1. The server host relay.anjiawenda.com (GAP, operational with a legal edge).** Facts, verified: every phone talks only to this host (`native/config/shin-api.config.json`); the legal document, source list, privacy page and both store listings contain zero mentions of it (grep count 0 in document.js, sources.js, privacy.html, listings); the document does name Cloudflare as carrying traffic (document.js:134). The domain is the owner's, bought for a paused project (ACT), paid through 2027-08-19, and the ACT note says auto-renew "is being turned off" (C:\ACT\NOW.md:20-22; docs/readiness/REGISTER.md R01). What it tells users: nothing; the name is unrelated to Pexi. Legal view: the privacy text need not print a hostname (PIPEDA Sch.1 cl. 4.8 openness, Quebec P-39.1 s.8 require categories and third persons, not hostnames; UNVERIFIED wording), so no gap on disclosure. The gap is that paying subscribers depend on a name that may lapse. Named cost: total outage for all installs, Apple 3.1.2(a) "ongoing value" and a refund wave, a consumer claim for a paid service that stopped. Smallest fix: renew now for several years, add the registrar login to the account list, calendar 2027-07-19. Also decide whether the registrant record shows the owner's personal name (WHOIS privacy), UNVERIFIED.

**N2. Tables carrying a device key that the 24-month sweep skips (probable GAP).** `retention.ts:46-55` omits `user_observation` (device_key, store_name, price, scan_id) in user-catalogue.db and anything in repeat-cache.db (never read). Same class as A-G6, named cost the same: PIPEDA Sch.1 cl. 4.5.3 / P-39.1 s.23 finding and a false retention sentence (A-G6). Fix: add to the sweep or extend the reworded promise.

**N3. Photos "kept forever" (GAP only for old data).** Verified: `retentionDays()` returns null (keep forever) unless an env var is a positive number (photos.ts:77-96); but the shipped build uploads no photo and the server refuses (see I-001, I-002, I-012), and the PC data copy holds 0 photo files. The Mac copy was not counted. Doc says "does not upload photos" (document.js:62) which is true now but silent on earlier beta photos. Named cost: PIPEDA Sch.1 cl. 4.5.3 (destroy when no longer needed) and Quebec s.23; an Apple 5.1.1(i) retention statement that is silent. Smallest fix: count photos on the Mac; delete them or set SHIN_PHOTO_RETENTION_DAYS; if FLAGS.photoId is ever turned on, the document line at document.js:19 comment must change first (the file already warns).

**N4. Deletion safety copies (UNVERIFIED GAP).** `app/data/deleted` on the PC holds a `user-catalogue-before-...db` and `user-store-deleted-...json` files dated 2026-09-26, i.e. removed rows kept in a folder that no sweep or backup rule names. If the Mac has the same, a deleted device's data persists beyond the "backups age out in about 15 days" promise (A§1c). Named cost: false erasure statement, same sources as N2. Fix: age that folder out at 15 days or include it in the data-request checklist.

**N5. Leftover Gemini config, display code and stored calls (GAP-minor).** Facts: no live call (inventory I-044); `GEMINI_API_KEY` placeholder in `mac/config.env.example:254`; `grounded.js` and camera.js still render a Gemini "grounded" block; the `gemini_call` table keeps every old request/response whole, with the retention sweep removing only the device id (`retention.ts:54`). Google is not named in the document as a recipient, so shoppers who tested while Gemini was live had data sent to Google without that disclosure (A§1b says older notes described photos going to Gemini). Gemini's own grounded-result terms (cited in grounded-record.ts header, https://ai.google.dev/gemini-api/terms, effective 2026-03-23, not re-fetched) limit storage to two years, which the 730-day sweep honours. Named cost: disclosure and retention findings on beta data (PIPEDA 4.5.3); if the dead UI is reachable, an "Other options at <store>" sheet with model-made prices (C row 5 equivalent). Smallest fix: delete the `gemini_call` bodies, remove the example key line, and confirm by one grep and one test that no payload can set the grounded block.

**N6. Android allowBackup="true" (GAP-minor).** FETCHED, developer.android.com/identity/data/autobackup: default is true; backups cover shared preferences, files and databases to the user's Google Drive, restored on any install including during device setup; the page recommends excluding "files that have device-specific identifiers" and says users can opt out via allowBackup false or `dataExtractionRules`. Pexi's device id lives in WebView localStorage (device.js:29-32; WebView storage is in the app data directory, assumed covered by "most directories", UNVERIFIED). Effects: (1) Pexi's device id and 64-hex secret can be copied to a second phone, so two phones share one identity and one quota (confuses deletion requests: A-G7); (2) Data safety form: Google's own backup is not Pexi sending data, but the form answer was not checked (E R28 area). The iOS secret is in Keychain, not backed up the same way. Named cost: quota and deletion confusion, not a fine. Smallest fix: `android:allowBackup="false"` or a `data-extraction-rules` file that excludes the WebView local storage.

**N7. Public invite code in the Android build (OK on law, with a cost on money).** Verified: config says the live server does not require a code ("checked: a request with none answered 200") and the code `android-public` is only a label (shin-api.config.json `_comment`); invite.ts header says the door exists to stop strangers spending the model budget. So the API is open: any caller can burn Claude calls, bounded by the monthly cap (E Anthropic table; cap noted in inventory I-196), and can write corrections into the shopper price pool. Named cost: Anthropic spend up to the cap, and poisoned shopper prices (a retailer or competitor complaint about false data, see hostile cases). Not a privacy gap (no data returned without a device id). Smallest fix: keep device-key ownership checks (already present, `owns()`), consider rate limits per IP and the existing typo guard on typed prices.

**N8. Marketing ads (OK, two small points).** Verified: ad build scripts call Google's generative API for the voice-over (`ads/introducing-pexi/vo.mjs:40`) and music (`ads/steal-or-ripoff/music.mjs:31`). No retailer name appears in the ad scenes I grepped (steal-or-ripoff, rip-off-hunt). Costs: Gemini API output terms for commercial use not read (UNVERIFIED), and the claim "Know if it's a rip-off." (steal-or-ripoff/scene.js:463) is a performance claim of the C row 2 type. Fix: read Google's terms on output use before posting; keep the C rewording ("see if the price is a good one") for ads too.

**N9. A plaintext credential file at the repo root (GAP, low probability, named cost: account takeover).** A file `useshinapp@gmail.com.txt` at C:\shin root holds the old support mailbox address and what looks like its password (36 bytes; I did not copy it). Verified: untracked, gitignored by `*@gmail.com.txt` (`.gitignore:88`), never committed; the GitHub copy of the repo is private. That mailbox is still open (I-200) and may receive customers' replies from the pre-rename period, so a takeover would expose people's emails. Smallest fix: move the password to the password manager, delete the file, change the password.

**N10. Amazon billing receiver in the Play build (OK).** The RevenueCat Android SDK ships Amazon IAP components in the merged manifest (I-103). They only act on Amazon devices and send nothing without it. UNVERIFIED by capture. Cost: a Play reviewer asks; answer is a one-line SDK note in Data safety/Target audience review. No fix needed beyond the A-G11 network capture.

**LGPL sharp (OK).** Server-side transitive package of @huggingface/transformers, installed only for local image processing in catalogue tools (not in app/ or native/ manifests). LGPL-3.0 duties attach when you convey the library; the server runs it, it is not shipped to phones (F§2). Text of the licence not fetched here, UNVERIFIED (https://www.gnu.org/licenses/lgpl-3.0.html). Cost if ever bundled: source and relink duties. Fix: none now; do not bundle in a build.

**Font licence file (GAP confirmed).** OFL 1.1 requires the copyright notice and licence text with every distributed copy of the font (the Inter file states it; F§2 cites clause 2). I confirmed `app/public/fonts` and `native/www/fonts` contain Inter-OFL.txt and six Plex Mono woff2 with no Plex licence. Cost: a licence-breach complaint, low. Fix: add IBM Plex's LICENSE.txt (https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt, per F) beside the files, and generate a notices file.

**Walmart Canada, ANBL, Return-It, Consignaction, Hammer: no reuse licence.** B covers each (row 115, row 109). My additions: (a) Hammer is the one with no licence that is live in answers (98,918 observations); the owner's 2026-11 ruling says do not raise the legal side again (RULINGS.md:349-359, cited in B), so I note it once: the lowest-cost control is the seller-level separability B already named. (b) For the four held-but-unused sources, whether they remain in the production DB was not counted; delete the rows if retention itself is a risk. (c) None of the four carry a credit; consistent with not shown.

## 3. Hostile readings (what each would argue that A to F did not)

1. **Office of the Privacy Commissioner.** Strongest case: one tap bundles consent to usage analytics, AI sharing, location and photos, and none can be withdrawn (A-G1, G2 raised). New angle not raised: the operational safeguards against what Pexi tells people. Pexi's document says records are kept 24 months then de-identified and promises deletion and "backups age out" (A§1c), but the data sits on one personal laptop with disk encryption and firewall off, GitHub 2FA off, and a push deploys (F§3, state as of 11-06, current unknown), under PIPEDA Sch.1 cl. 4.7 safeguards (UNVERIFIED wording). The OPC would also read the retention sentence against N2 and N4 and call the policy inaccurate, and would call the open API (N7) and the owner-run manual deletion with a "two products" identity check weak. Cheapest remedies: GitHub 2FA, the sweep list, deleting safety copies.
2. **Commission d'accès à l'information (Quebec).** New angle: s.8.1/s.9.1 aside (A-G9), the strongest is s.14 that consent not requested in plain language "separately from other information" is without effect, applied to a first-launch screen that Quebecers see in English only because French is pinned off (C§1.4, flags.js:45-46). Together the consent is both bundled and in a language the person chose not to use. P-39.1 s.17 outside-Quebec communication with no per-recipient assessment (A-G4). Whether the Act binds an Ontario sole proprietor is open (A-R23), but a CAI complaint would be answered by a request to show the assessment, which does not exist.
3. **Competition Bureau.** Beyond C's "Certain", "any product", "Nobody else": the claim "new prices every week" (ui-strings.js guide and onboarding) rests on a Hammer data set imported on 2026-11-07 and refreshed by a weekly job (hammer-refresh.sh; a snapshot of nine grocers in one Toronto neighbourhood per B), while the onboarding says "store prices near you" and "compare local deals" (C§1.1). For a shopper in Halifax or Vancouver the "near you" prices are a Toronto snapshot or a Statistics Canada average scaled by a Hammer factor. Under s.74.01(1)(a) with the general impression test (s.74.03(5), C R3), "near you" is the weakest wording. Also "the typical shopper" comparison (C). Cost: up to $750,000 for an individual first order (C R4).
4. **Office québécois de la langue française.** C found the English-only pin. New: (a) the name PEXI is not a registered trademark in Canada (F§1a zero results), and the Quebec regulation on trademarks in languages other than French (C-11, r.9) permits a non-French mark without French wording only when registered; whether it reaches an app interface was not retrieved, UNVERIFIED. (b) Customer support "Contact" and refund lines are English. (c) The yearly Plus price renewal text is in English for Quebec storefront buyers. Fix is the same flag flip as C plus the trademark filing in F.
5. **Apple App Review.** Strongest practical rejection: 2.1 completeness. The reviewer's phone talks to a laptop behind a tunnel (I-045, I-205), and any outage during review is a rejection ("app doesn't load"), then a second at 4.2 if Anthropic estimates are the only content. New: reviewers ask why `NSPhotoLibraryUsageDescription` strings exist when no photo is saved (E notes it as minor), and whether the privacy label's "DeviceID linked" matches the RevenueCat app user id (it does). Also Apple 5.1.1(i): policy says photos not uploaded but the consent row sets photos true (A-G9); a reviewer reading the database or a network log sees "consent: photos true".
6. **Google Play review.** New: the Android build declares fine location while the policy says only a 1 km cell leaves the phone (E-gap2), enables Auto Backup of a device identity (N6), ships a Play build with Amazon billing components (N10), and has an empty Android RevenueCat key (E-gap6) so the Plus paragraph in the listing sells something that cannot be bought. Also Data safety "optional" versus all-true on accept (A-G5). A rejection here also blocks the new personal-account closed-testing requirement (E).
7. **A data owner (Kroger, Metro, Walmart, Open Food Facts).** Kroger: 4(a) bars analysis "to develop marketing or business strategies directly or indirectly targeting Kroger customers", and Pexi is a consumer price comparer that displays Kroger store prices to the public; 5(e) bars permanent copies (B). Their remedy is cut-off and indemnity (9(c), Ohio). Metro: a personal-use clause with a sitemap read after a 403 and a changed UA (B); a bot-detection complaint. Walmart: B's "22 rows outside terms" are still in the DB. Open Food Facts: the association's argument is that a paid app's offline pack carries their names to every phone with no licence notice (B), while the share-alike database offer is "on request" and no file exists. Their remedy is a public call-out on their forum and a request to App Store/Play as an IP report.
8. **A retailer named in a verdict.** Pexi prints a retailer name beside "Bad price"; the price came from a snapshot, a Statistics Canada average, or another shopper's typed price (I-158) that anyone with the public Android code can submit (N7). The retailer's argument: a false price attributed to them on an app that labels it "Pexi's estimate" is publication of a false statement about their business; Trademarks Act s.22 depreciation of goodwill (C R13) is the statutory hook, product disparagement or defamation the common-law hook (UNVERIFIED, not researched). The disclaimer helps but sits in the terms, not at the sheet. Fix: C's rewording and never print a store name on an AI-only or typed-price-only verdict.
9. **A shopper who paid for Plus and was unhappy.** Arguments not raised: (a) the server was a home laptop that went down (readiness register R01/R02), so the paid 100 scans a week were unavailable; Terms let Pexi "change, suspend or stop at any time", which Quebec CPA s.11.2 and s.10 (C R10, D row 11) say cannot cut a consumer's rights, UNVERIFIED text. (b) The paywall appears when the 10-scan quota is hit; that is a legitimate gate, but with "100 a week, enough to check your whole cart" (ui-strings.js:136) a heavy cart exceeds it. (c) "Refunds are handled by Apple" plus no postal address (D row 6, D row 15) reads as a refusal to refund, when Ontario CPA rights apply "despite any agreement" (D s.7 memory). Remedy path: Apple refund request, chargeback, Ontario or Quebec consumer complaint, small-claims. Cost small per person, reputational and refund-reimbursement under Apple's schedule 6.3 (D).
10. **Aurik.** Strongest case (beyond F): 470 commits under the collaborator, no signed assignment (F, copyright s.13(4)), the listing assigns "Aurik owns the age-rating answers" (D facts), and the collaborator can push to the deploy remote with 2FA off. He could argue partnership profit-sharing without any paper (Partnerships Act, UNVERIFIED), co-ownership of the app code and shopper-facing text, and joint liability for the Terms. New: he is also named in repo notes as co-signer of store answers while the seller name is Jamin Xu individual; a Play/Apple dispute, an Apple age-rating answer attributed to the wrong person, or a payout to the account holder only. Whether he is an adult, employee or contractor is unknown in the repo (F§4); a minor cannot be bound by an assignment as easily (UNVERIFIED).

## 4. Areas no file covers at all

| Area | One-line verdict |
|---|---|
| Accessibility (AODA, ACA, WCAG) | C row R14 covers the statutes by memory; no contrast or text-scale test exists. OK on law (sole proprietor, UNVERIFIED), cheap to test before launch. Apple/Google do not require it. |
| CASL (anti-spam) | OK: no server email exists (I-171); support replies answer inbound mail. s.6 text not retrieved (s.12(1) applies it only where a Canadian computer system is used, FETCHED https://laws-lois.justice.gc.ca/eng/acts/E-1.6/page-2.html); applies if any marketing email or push is added. |
| Children | A (COPPA, Quebec under 14, OPC) and E (Play Families, Anthropic minors) cover; unresolved owner decision on target audience. |
| Data export / portability | A-G7 covers access by email; no machine-readable export tool was reviewed. P-39.1 s.27 style portability right (the 2024 portability duty, UNVERIFIED) is likely engaged for Quebec only; the manual script is the whole answer. |
| US export controls on encryption | Apple answer false for non-exempt encryption is in E; the Google/US BIS self-classification for mass-market encryption is not read; UNVERIFIED, standard HTTPS usage qualifies as exempt per Apple's own page (not fetched). |
| Tax (GST/HST, income) | D rows 16-21 cover; accountant. |
| Insurance | F§5 covers; none bought. |
| Record keeping (tax and money) | Not covered: CRA expects books and records for six years (Income Tax Act s.230, Excise Tax Act s.286, both UNVERIFIED here); Apple/Google statements are the sales records. Verdict: GAP-minor; keep monthly store reports and the tax-on-commission invoices in a dated folder. Note this does not conflict with 24-month privacy retention as it is financial data without shopper identity. |
| Domain and hosting terms | Cloudflare free plan: the fetched terms page defers to Service-Specific Terms I could not read (UNVERIFIED); N1 for the registrar. Verdict: UNVERIFIED, read the Tunnel and R2 terms once. |
| GitHub terms (private repo, Pages) | GitHub Pages is a static site; terms and privacy pages hosted at a personal username (xu826jamin.github.io) mean a rename or suspension kills the required policy URL and shows a personal handle in every store listing. GitHub's Pages restriction on commercial transaction hosting (UNVERIFIED, not fetched) is not triggered by static legal pages. Verdict: GAP-minor, mirror the pages on a Pexi-named host before launch. |
| EU digital-services trader rules | If the app is in EU storefronts, Apple/Google require an individual trader to publish address and phone (UNVERIFIED, not fetched). Territory setting not in code; D row 14 notes the same unknown for US. Verdict: confirm territories; if Canada only, N/A. |
| Gmail as business support | Using a free personal mailbox as the seller line is allowed (UNVERIFIED terms); loss of the mailbox (2FA recovery, R40 in readiness) would cut the delete-my-data path (30-day clock, A R9). Verdict: OK; add a recovery owner. |
| Contests, referrals, ratings incentives | OK, none exist (I-177); E bars incentivised reviews. |

Coverage: 217 of 217 items mapped
