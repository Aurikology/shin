# The beta build plan

Written 2026-09-11 from the founder's decisions of the same day (decisions log: the six-person
store-track beta, review scores only through official APIs, a stored scan rating). Every item
below that is not Aurik's carries the steps that add up to it. Numbers match the 46-item
inventory given to the founder in chat. Aurik's items (21 prompt levers, 22 Claude versus Grok,
23 Google Lens, 31 interface translation, 44 accounts) are listed only by title.

Owner tags: repo (the system builds it) · you (the founder) · Aurik · later (after the beta).
Every repo step ends at a consumer-side check, never at the lane's own word.

## Before the six-person beta

**1. Hosted API with HTTPS, catalogue, backups, migrations.** repo, account is yours
a. You open the server account and the domain; credentials go in the environment file, never the repo.
b. Provision a box with at least 20 GB of disk; install the same Node major the tests run on, because the server uses Node's built-in SQLite.
c. Copy the four packages (app, spine, price, catalogue, identify); run the install in each, since each carries its own dependencies.
d. Upload the 4.13 GB catalogue with its vector table; verify the checksum after transfer (a download once reached the right size and still failed to decompress).
e. Run the server under a process manager that restarts it; port and data paths come from environment variables.
f. Put a reverse proxy with an automatic certificate in front, on the domain.
g. Nightly backup of the scans, prices, corrections and gaps databases to a second location; restore once to prove the backup is real.
h. Add a schema-version table and run pending additive migrations at start; today columns are added ad hoc with no version.
i. Guard startup: a taken port or a missing database logs a sentence and exits, instead of crashing.
j. Check from a phone on cellular: the identify route answers a known barcode over HTTPS.

**2. Native wrapper for iOS and Android.** repo; the iOS build runs on your Mac
a. Add a base URL setting so the seven relative API calls go to the hosted domain inside the wrapper.
b. Make the barcode reader and MediaPipe wasm files load relative to the bundle instead of the site root.
c. Confirm the service worker is harmless inside the wrapper, or disable it there.
d. Create the wrapper project: app id, the name (after the trademark search), icons, splash; iOS scheme set to https on localhost so the camera has a secure context.
e. Android: declare the camera permission and allow inline media. iOS: the camera usage description string.
f. Build the Android bundle on Windows; build the iOS app in Xcode on the Mac; sign both with the developer accounts.
g. Check: install on one phone of each kind, scan a real barcode over cellular, get a verdict.

**3. Camera and barcode verified inside the wrapper, native fallback.** repo
a. Test matrix on one iPhone and one Android: barcode scan, photo capture, torch, permission prompt persistence across restarts.
b. If the web camera fails inside the wrapper: the native barcode plugin for the barcode path and the native camera plugin for the photo path, behind the same client calls.
c. Record the result per device in the readiness notes.

**4. TestFlight internal group and Play internal track.** repo, on the accounts you open
a. Once the accounts clear: create the App Store Connect record and the Play Console app.
b. Upload the iOS build from Xcode; add the six people as internal testers.
c. Upload the Android bundle to the internal track; add the six emails; share the opt-in link.
d. Check: one install per platform on a phone that is not yours.

**5. Trademark search and the name.** repo runs it, you decide
a. Search the CIPO database for "Shin" in classes 9 and 42, and the US register.
b. Record every hit with number, class and status.
c. You decide keep or rename; the app record is named only after this.

**6. Truthful privacy screen and express consent.** repo drafts, you approve
a. Write the true data statement: every scan is stored, and with consent the photo and a coarse location; where, for what, how to delete.
b. First-launch consent: photos and location as separate opt-ins, off by default, showing what is collected, who sees it, why, and the risk.
c. Store each choice per device with a timestamp; the server refuses to keep a photo or location when the flag is absent.
d. Withdrawal: toggles on the You screen; a delete-my-data path (email for the beta).
e. Replace the false "stays on the device" text everywhere it appears.
f. You approve the wording before it ships.

**7. Scan id returned.** repo
a. Both identify routes merge the new scan row id into their response.
b. The client keeps the id on its current-verdict object.
c. Corrections attach by id when present, instead of the last-answered lookup.
d. Tests: the response carries the id; a correction with an id lands on that row.

**8. Scan rating.** repo
a. Table: scan id, device id, rating, reason, rated at; additive migration.
b. Route: post a rating; a second tap overwrites; refused without a scan id.
c. Client: thumbs tap posts; thumbs-down reveals four reason chips (wrong product, wrong price, no price, too slow); undo within four seconds deletes.
d. The You screen stats show rated counts.
e. Tests: stored, overwritten, deleted on undo, refused without an id.

**9. Complete scan record.** repo
a. Photo bytes saved to a photos folder keyed by scan id, path on the scan row, only with consent on.
b. Full model output stored as JSON on the scan row: what it read, brand, size, confidence, the candidate rows and the chosen index. Today only the label is kept and the candidates never leave the server.
c. The typed price linked to the scan id.
d. The verdict as shown: tier, confidence, seller count.
e. App version, platform, round-trip latency, model cost estimate per call.
f. Migration adds the columns; a test covers each write.

**10. Event log.** repo
a. One table: id, device id, event type, JSON payload, created at.
b. Client events: app opened, scan started, answer shown, thumbs, correction, share, consent change. Server events: model call made, source used, refusal reason.
c. An export command that dumps a date range as JSON lines.

**11. Coarse location and store.** repo
a. A neighbourhood-level cell (about one kilometre) computed on the phone, never raw coordinates, sent only with consent.
b. Match the cell against OpenStreetMap shops; offer the nearest three; one tap picks; store id and name on the scan row.
c. The typed price carries the store, so prices become per store.

**12. User id column.** repo
a. Nullable user id on the scan, rating, correction, event and consent tables.
b. A device-to-user link table, empty until accounts exist.

**13. Card on the model console and a dollar cap.** you and Aurik, then repo
a. Add the card; set the console's spend limit.
b. Put the key in the server environment.
c. A daily dollar cap in code that refuses photo calls past it and says so in the app's voice.

**14. The eval run for real.** repo
a. Run the 40-photo eval against real models; record top-1, cost and latency per tier.
b. Add 20 produce and 20 tech photos with known answers.
c. Re-run; the numbers set the model tiers and decide whether the classifier's routing pays.

**15. "One shopper saw this."** repo
a. Verdict rule: one typed price with no other source shows "one shopper saw $X at store, date", never a tier.
b. Corroboration: a typed price counts toward a tier only when a second device or a crawled source agrees within a band.
c. Per-device typed-price rate limit; a reporter reliability score that starts at zero and rises with corroborated reports.
d. Test: a single report never yields a tier.

**16. Price seed for the testers' stores.** repo where a site permits it, you in the aisle otherwise
a. You name the stores.
b. Per store: a crawl adapter where the site's product pages permit it, as Canadian Tire's do; otherwise an afternoon walk with the app typing prices, which is the beta itself.
c. Target: the 200 items per store the six of you actually buy.

**17. Canadian Tire at scale.** repo
a. Run the adapter over the catalogue's tech and hardware barcodes at its measured delay; log matches and misses in the attempt table.
b. Rejoin unmatched rows nightly.

**18. Best Buy adapter.** repo, you decide
a. Fix the currency label; mark rows as US.
b. You decide: US prices shown as labelled reference, or not at all.

**19. Tester-visible defects.** repo, one failing test first for each
a. Cheaper alternatives of the wrong kind.
b. The price-spread rail unreadable on ripoff cases.
c. Startup crash unguarded (covered by 1i).
d. A correction saved with no product attached.

## The full product, during and after the beta

**20. On-device kind classifier.** repo
a. Vendor the EfficientNet-Lite0 model file; the classifier code already ships in the vision bundle.
b. Map the 1,000 labels to fruit, packaged, tech, other.
c. Run on the crop before any model call: produce goes to the produce refusal with the typed-price path; tech to the pro tier; packaged to the basic tier.
d. Measure on the extended eval set: routing accuracy and credits saved.

**24. Photo verification against the catalogue's image.** paused with the image catalogue
a. No steps. Reopens on a measured top-1 below the floor after the pick pass.

**25. Open Food Facts quality fields.** repo
a. Loader reads Nutri-Score, NOVA group, additives count, ingredients text, generic name.
b. Five columns added; reload the 212k Open Food Facts rows from the local source file.
c. The product answer returns them.

**26. Descriptions.** repo
a. A prompt that takes catalogue facts only and writes two sentences in the app's language, forbidden to add facts.
b. Cache per product and language.
c. On screen labelled "written from the label".

**27. Best Buy US ratings for tech.** repo
a. Sign up for the key.
b. Lookup by barcode; store average, count, URL, fetched date; refresh weekly.
c. Shown only for tech categories, labelled "Best Buy (US)" with the link.

**28. Canadian Tire developer portal.** repo
a. Sign up; read what it exposes; write the result with the reopen condition.

**29. Amazon ratings.** later
a. Associates account; wait for referred sales; Creators API lookup by barcode; same display component.

**30. Review display.** repo
a. One component: score, count, source name, link; shown only when a licensed source has a row; nothing generated.

**32. French search.** repo
a. Run the 40 eval queries in French; fix the ranking where French names lose.

**33. Icecat.** you sign up, repo loads
a. Credentials in the environment; run the loader; count rows and the join rate to Walmart's tech rows.

**34. Price source enumeration.** repo research
a. List every class: retailer sitemaps and page data, official and affiliate feeds, flyers, open datasets, paid feeds, crowd reports, receipts.
b. Per source: Canadian coverage, barcode join rate, cost per thousand lookups, terms.
c. Rank by priced Canadian products per dollar; the top two become adapters.

**35. Walmart.** you decide
a. Record the blocked state and the US-only affiliate API; drop, or a route their terms permit.

**36. Competitor study.** repo research
a. Enumerate by class: flyer aggregators, price trackers, scan-and-verdict apps, resale comps, cashback and coupon apps, retailer apps, visual search.
b. Per app: data source, identification method, models and pricing, the one part worth taking, each with a source.
c. The data-source column feeds item 34.

**37. Correctness check.** repo procedure, testers supply the shelf
a. Each beta scan photographs the shelf tag as the price seen.
b. Twenty verdicts compared against the shelf and a second store.
c. The rate recorded on the scoreboard as correctness, beside coverage.

**38. Mascot art.** you and Aurik

**39. Operations.** repo
a. Structured error log with the scan id.
b. Per-device rate limit on the photo route.
c. Uptime ping and a daily latency p95.
d. Photo retention of 90 days, then deletion.

## Public launch

**40. Privacy policy.** repo drafts, you approve
a. The document, hosted at a URL, matching the consent screen word for word.

**41. Store privacy declarations.** repo drafts, you submit
a. Apple: user content (photos), location, identifiers. Google: photos and videos, location, device or other ids.

**42. Listing.** repo drafts, you submit
a. Age rating, target API level, listing text, screenshots at both phone sizes.

**43. Google closed test.** you
a. Twelve testers opted in for fourteen continuous days; six more people than the beta.

**45. Paid tier and store billing.** you decide, later
a. Define what is paid; entitlement column; Apple in-app purchase and Google Play Billing; no Stripe inside the app.

**46. Store submissions.** you
