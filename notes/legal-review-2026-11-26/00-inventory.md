# Pexi legal review: 00 inventory

Built 2026-11-25 from the working tree of C:\shin (branch as checked out, no code edited). Every list says which command made it so a later pass can rerun it. All paths are relative to C:\shin unless shown. Line numbers are as of this build. "Read" means the lines were opened; "grep only" means the item was found by search and its behaviour was not read in full (marked GO where a later pass must read it).

Counts: H1 routes 38 (I-001..I-038); H2 outbound 24 (I-039..I-062); H3 data 28 (I-063..I-090); H4 permissions 22 (I-091..I-112); H5 dependencies 17 groups (I-113..I-129); H6 collectors 27 (I-130..I-156); H7 user content 14 (I-157..I-170); H8 email/notify 8 (I-171..I-178); H9 text surfaces 14 (I-179..I-192); H10 accounts 17 (I-193..I-209); H11 AI 8 (I-210..I-217).

## 1. HTTP routes the server exposes

Command (rerun from C:\shin\app): `node <scratch>/routes.mjs` which lists every line matching `^\s{4}if \(url\.pathname (===|\.startsWith)` in server.ts, plus `grep -nE "route === " src/admin.ts`, plus `grep -nE "req\.method [!=]==" server.ts`. Cross-check: `grep -noE "'/api/[a-z/-]+'" server.ts | sort -u`. Dispatcher is `createServer(async (req,res)` at app/server.ts:2656. Every /api/ route except those in INVITE_EXEMPT sits behind the invite header (app/server.ts:2963); /api/admin/* behind the admin token (app/server.ts:2954). "PD" = takes or returns personal/device data (device id, typed text, location, photo).

- I-001 app/server.ts:3002 POST /api/shutter/frame. Camera frame upload for the shutter log. OFF unless SHIN_SHUTTER_LOG=on (src/shutter-log.ts:15,56). PD: photo + device header. GO read shutter-log.ts.
- I-002 app/server.ts:3039 POST /api/shelf/frame. Shelf-tag frame, saved by src/shelf.ts:145. PD: photo, deviceId. GO.
- I-003 app/server.ts:3057 GET /api/catalogue. Catalogue summary. No PD.
- I-004 app/server.ts:3058 GET /api/categories. Category list. No PD.
- I-005 app/server.ts:3059 GET /api/scenarios. Test scenarios list (dev). No PD.
- I-006 app/server.ts:3080 POST /api/identify/demo. Demo scan, marked is_demo. PD: deviceId.
- I-007 app/server.ts:3138 GET /api/quota. Scans left, asks RevenueCat (I-040). PD: deviceId.
- I-008 app/server.ts:3169 GET|POST /api/identify. Main scan: gtin or typed text, deviceId, cell, storeId, storeName, shelf price (fields at server.ts:3169-3260 via `pick(...)`). Returns identity, price range, verdict. PD: device id, typed text, rough location, store, typed price. Can reach Claude (I-210, I-211).
- I-009 app/server.ts:3418 POST /api/match-text. Typed-name match; body has cell, storeId, storeName, lat, lon, accuracy, locatedAt (server.ts:3435-3439). PD: location, typed text.
- I-010 app/server.ts:3494 GET /api/search. Query params q, limit, deviceId. PD: typed text, device id.
- I-011 app/server.ts:3651 POST /api/identify/pack. Camera picture of a pack; may go to Claude (I-211). PD: photo.
- I-012 app/server.ts:3761 POST /api/identify/photo. Photo identify path. PD: photo, deviceId. GO read.
- I-013 app/server.ts:3791 POST /api/price. Price lookup for a product. PD: deviceId.
- I-014 app/server.ts:3892 POST /api/correction. Shopper files a price seen at a shop (clientId, deviceId, scanId, seller, price, kind). Stored in price/src/corrections.ts:126. PD + user content (I-160).
- I-015 app/server.ts:4103 GET /api/scans. A device's own scan summary (needs deviceId, owned by device key) or all devices with admin header. PD.
- I-016 app/server.ts:4139 POST /api/scan-rating. Shopper rates an answer. PD.
- I-017 app/server.ts:4183 POST /api/scan-rating/delete. Removes a rating (ratings.ts:159). PD.
- I-018 app/server.ts:4221 GET|POST /api/consent. Reads/writes the consent row (photos, location); `accepted:true` sets both (server.ts:4247-4251). PD.
- I-019 app/server.ts:4283 POST /api/event. One usage event (type, payload, deviceId). PD.
- I-020 app/server.ts:4333 POST /api/client-error. Client crash report. PD likely (device id, stack). GO.
- I-021 app/server.ts:4353 POST /api/events/batch. Batch of usage events (track.js). PD.
- I-022 app/server.ts:4409 GET /api/stores. Nearby stores by cell. PD: rough location. Calls Overpass (I-043).
- I-023 app/server.ts:4431 GET /api/store-chains. Chain list. No PD.
- I-024 app/server.ts:4452 POST /api/scan-price. Typed shelf price onto a scan (shopper-report.ts). PD + user content.
- I-025 app/server.ts:4487 POST /api/scan-call. Shopper's own great/good/reasonable/bad call. PD.
- I-026 app/server.ts:4510 POST /api/scan-pick. Which product the shopper picked (learned pick). PD + user content.
- I-027 app/server.ts:4544 GET /api/health. Health and counters (unauthenticated? GO: confirm what it returns). INVITE_EXEMPT at src/invite.ts:131.
- I-028 app/server.ts:4621 GET /api/latency. Latency stats, param days. No PD expected.
- I-029 app/server.ts:4633 GET /api/attribution. Data-source credits (src/attribution.ts:191,225). No PD.
- I-030 app/server.ts:4639 GET /api/app-status. App kill/upgrade status. INVITE_EXEMPT. No PD.
- I-031 app/server.ts:4641 GET /api/pack-version (param scope). Offline pack version. No PD.
- I-032 app/server.ts:4659 GET /api/pack and /api/pack/<scope>-<version>.bin. Offline catalogue pack download. No PD.
- I-033 app/server.ts:4672 GET any other path: static files from app/public (screens, js, css, fonts). 404 for unknown /api/ at server.ts:4669.
- I-034 app/server.ts:2775 OPTIONS preflight, CORS GET/POST/OPTIONS (server.ts:2798-2800).
- I-035 app/src/admin.ts:140 GET /api/admin/tables. Admin token only. PD (table listing).
- I-036 app/src/admin.ts:157 /api/admin/sql. Admin token; runs read-only SQL on the scan DB (admin.ts:104 opens readOnly). PD, full scan data.
- I-037 app/src/admin.ts:174 /api/admin/people (device_person table, invite names). PD.
- I-038 app/src/admin.ts:181,189,200 /api/admin/access, /shutter, /file?path= (reads access log, shutter frames, files). PD.

Also set at app/server.ts:2640-2660: Content-Security-Policy for web (connect-src 'self', form-action 'self', frame-ancestors 'none').

## 2. Outbound network calls

Command: `grep -rnE "fetch\(|https?\.request|new Anthropic|urlopen|requests\.(get|post)" --include=*.ts --include=*.mjs --include=*.py --include=*.sh --include=*.js app/server.ts app/src identify/src price/src catalogue/src spine/src mac app/public/js native/www/js`, and hosts by `grep -rnoE "https?://[A-Za-z0-9._-]+\.[a-z]{2,}" <same dirs>`. Server runtime (live phone traffic) is I-039..I-044; phone/client is I-045..I-049; batch collectors in H6; ops in I-050..I-056.

Server runtime
- I-039 Anthropic API (host api.anthropic.com, via SDK, no URL in repo). identify/src/range-ask.ts:400-405 sends product name, brand, size, category, market, text only, no image (range-ask.ts header lines 1-30). Capped monthly. Also identify/src/pack-read.ts:255-260 sends one camera JPEG/PNG frame (pack-read.ts header). Both via identify/src/providers/anthropic.ts:57. Key ANTHROPIC_API_KEY. `describe.ts:264` also calls client.messages.create (product descriptions; GO: is it wired live? grep found no import in app/).
- I-040 RevenueCat REST (api.revenuecat.com/v1/subscribers/<deviceId>) at app/src/scan-quota.ts:387. Sends the device id in the URL; secret REVENUECAT_SECRET_KEY. Receives entitlement.
- I-041 Open Food Facts world.openfoodfacts.org at app/src/open-food-facts.ts:158 (User-Agent with the app address, line 62). Sends a barcode.
- I-042 Open Prices host is a batch collector only, see I-132.
- I-043 Overpass API overpass-api.de (override SHIN_OVERPASS) at app/src/stores.ts:323. POST of a map query built from the shopper's rough cell. GO: confirm query granularity (stores.ts ~ line 330+).
- I-044 No Gemini call exists: commit e217bf7 "Remove the Gemini call path". `grep -rn "generativelanguage" --include=*.ts --include=*.js .` returns none. Residue: gemini_call table (migrations.ts:497), GEMINI_API_KEY line in mac/config.env.example:254, grounded.js UI, grounded-record.ts. identify/src/providers/price-verifier.ts "fetches one page" by comment but has no fetch( match (injected).

Client (phone and web)
- I-045 The app's own server. Base from window.SHIN_API_BASE (app/public/js/api.js:119); native config native/config/shin-api.config.json apiBase = https://relay.anjiawenda.com (Cloudflare tunnel to the Mac, mac/01-cloudflare-tunnel.md:29,58). fetch at api.js:301; keepalive events track.js; pack download pack.js:275,303.
- I-046 RevenueCat SDK, native only: app/public/js/purchases.js:82 `plugin.configure({apiKey, appUserID: getDeviceId().id})`. Talks to RevenueCat and the store billing service; sends the device id as app user id.
- I-047 Links opened out of app: apps.apple.com (app/public/js/remote-status.js:36; plus-config.js:93,108), play.google.com (plus-config.js:94,109), xu826jamin.github.io/pexi/terms.html and privacy.html (plus-config.js:49-50).
- I-048 mailto: links (not network): app/public/js/screens/you.js:122,132,141 (Delete my data, contact), to the app address.
- I-049 Web CSP connect-src 'self' (server.ts:2648); native CSP in native/www/index.html:15. zxing-wasm bundle contains a fallback URL fastly.jsdelivr.net (app/public/js/eye.js:538) but src/eye/barcode.ts:182 overrides locateFile to the local wasm (grep only: GO to confirm never reached).

Ops (no shopper data expected)
- I-050 Notion API api.notion.com: mac/deploy/notion.mjs (NOTION_TOKEN); deploy reports.
- I-051 GitLab ls-remote/fetch: mac/deploy/checker.mjs:33,54; mac/deploy/deployer.mjs:331. Remotes: `git remote -v` shows origin gitlab.com/shin3223636/shin.git (fetch+push), push also to github.com/xu826Jamin/shin.git, remote github.
- I-052 Apple App Store Connect api.appstoreconnect.apple.com: mac/expiry-check.mjs (SHIN_ASC_KEY_ID/FILE).
- I-053 Healthchecks hc-ping.com dead-man ping: scripts/deadman-probe.mjs:13,41 (SHIN_DEADMAN_URL), mac/05-install-launchd.sh:56.
- I-054 Self-health fetch https://<host>/api/health: mac/deploy/checker.mjs:54; localhost probe deployer.mjs:200.
- I-055 Cloudflare tunnel (cloudflared, mac/cloudflared, mac/01-cloudflare-tunnel.md).
- I-056 Voyage AI api.voyageai.com/v1/embeddings: catalogue/src/embed.ts:131 (VOYAGE_API_KEY). Sends product names to build vectors (batch, not live).
- I-057 Hugging Face model download via @huggingface/transformers (catalogue/package.json dep). GO.
- I-058 Hugging Face dataset fetch: catalogue/src/fetch_canada.py (huggingface.co).
- I-059 eBay api.ebay.com / api.sandbox.ebay.com: spine/src/sources/ebay.ts:300,370 (EBAY_* keys).
- I-060 Best Buy api.bestbuy.com: spine/src/sources/bestbuy.ts:190, price/src/bestbuy-ratings.ts:223,337.
- I-061 Sold-comps api.sold-comps.com: spine/src/sources/soldcomps.ts:141.
- I-062 Fonts: scripts only, app/scripts/fonts.mjs fetches fonts.googleapis.com at build time; runtime fonts are self-hosted (index.html:67, CSP font-src 'self').

## 3. Databases, tables, columns, retention

Commands: `grep -rnE "CREATE TABLE( IF NOT EXISTS)? +[a-z_]+" --include=*.ts --include=*.mjs --include=*.py --exclude-dir=node_modules .` (82 hits; test and archive excluded), and `grep -nE "addColumnIfMissing\(db, '[a-z_]+', '[a-z_]+'" app/src/migrations.ts`. Stores opened: `grep -rnE "new DatabaseSync\(" app price catalogue identify`.

Live stores holding shopper data (app/data, price/data on the server)
- I-063 app/data/scans.db, table scan (app/src/scans.ts:74): device_id, kind, query_text (typed text), resolved_code/label, confidence, outcome, corrected_code, scanned_at; migrations add cell, store_id, store_name, user_id, exact_lat/exact_lon/exact_accuracy/exact_at (migrations.ts:307-310), photo_path, model_json, typed_price_cents, grounded_json, shopper_call, consent_photos, consent_location (migrations.ts:747-751), app_version, platform, country, currency, estimate_* fields, answer_path. GO: confirm exact_* columns are now written as null (comment in app/server.ts around 4244-4250 says locationFor writes null).
- I-064 scan_rating (migrations.ts:168) and scan_rating_history (:449): ratings with device_id, user_id.
- I-065 event (migrations.ts:195): device_id, type, payload, created_at, user_id. Usage analytics. Retention 12 months.
- I-066 consent (migrations.ts:230): device_id, photos, location, updated_at, user_id. The record of acceptance.
- I-067 device_user (migrations.ts:278): device_id to user_id link.
- I-068 device_preference (migrations.ts:374).
- I-069 gemini_call (migrations.ts:497): every old Gemini request and response stored whole (historic; now no live writer). Retained per retention.ts DEVICE_TABLES.
- I-070 scan_pick (migrations.ts:753, net_hash added :933), scan_later_answer (:772), scan_offer (:936), scan_act_outcome (app/src/scan-quota.ts:583), plus_seen (app/src/scan-quota.ts:285: devices RevenueCat confirmed as Plus).
- I-071 device_key (app/src/device-key.ts:70): device_id, key_hash, bound_at (hash of the device secret).
- I-072 app/data/people.db table device_person (app/src/admin.ts:87): device_id, person (invite name), first_seen, last_seen. Links a device to the name on an invite link.
- I-073 price/data/corrections.db table correction (price/src/corrections.ts:126): client_id, device_id, subject, code, label, seller, price_cents, kind, seen_on, recorded_at, capture, witness. Shopper-typed prices.
- I-074 shopper_price (price/src/shopper-prices.ts:52): device_id, code, price_cents, region, store, seen_on, centre_cents, net_hash (hashed /24 network, src/network-hash.ts:7-12).
- I-075 app/data/user-catalogue.db tables user_product, user_observation (store_name, region, price_cents, device_key, scan_id), user_branch, user_offer, user_review (catalogue/src/user-catalogue.ts:78,105,135,149,167). Built from scans.
- I-076 app/data/gaps.db table gap (catalogue/src/gaps.ts:41): barcodes not found, from scans.
- I-077 app/data/repeat-cache.db (grep only, GO) and category-faults.json (app/src/category-guard.ts:110).
- I-078 app/data/access.log: request log lines (app/src/access-log.ts:110; records Origin, invite name, device). 90 days.
- I-079 app/data/network-salt (app/src/network-hash.ts:44, mode 600).
- I-080 app/data/photos/ (app/src/photos.ts:139): shopper photographs, consent gated; folder set by SHIN_PHOTOS / SHIN_DATA_DIR.
- I-081 shelf frames (app/src/shelf.ts:145-146) and shutter frames (app/src/shutter-log.ts:147-188, off unless env on).
- I-082 JSON/JSONL files from Claude features: identify/src/range-ask-store.ts:154,240 (cache keyed on product name + brand + size + market, answers log), identify/src/pack-read.ts:188,220 (saved pack readings + .answers.jsonl), identify/src/cap.ts:172 (call counter), identify/src/describe.ts:227 (description cache).
- I-083 app/data/deleted/ (GO: what it holds; likely output of scripts/privacy/device-data.mjs).
- I-084 Client storage on the phone: localStorage device id (app/public/js/device.js:29-32), device secret (device.js:66-69; native copy in capacitor-secure-storage-plugin, device.js:91-94), other keys (`grep -rhoE "localStorage.setItem\(['\"][A-Za-z0-9_.:-]+" app/public/js`: only one literal key found, others use constants; GO full enumerate).

Non-shopper stores (reference data; no shopper rows): price/data/prices.db (price/src/store.ts tables observation, capture, capture_tile, identity_link, source_registry:1320, source_use:1337 etc.), catalogue db (catalogue/src/schema.ts:101,170 product, product_category; placement.ts, price-layer.ts hierarchy tables, name-meaning.ts:93 name_vector), price/src/bestbuy-ratings.ts:114,132.

Retention and deletion code
- I-085 app/src/retention.ts:1-30,36-46: request logs 90 days (REQUEST_LOG_DAYS), usage events 12 months (USAGE_EVENT_MONTHS, delete), scans/ratings/shopper prices 24 months (DEVICE_ID_MONTHS, row stays, device id replaced by `removed:<id>`; migration 21, migrations.ts:884). DEVICE_TABLES list from line 46. Nightly backups and stdout log NOT reached (retention.ts:19-20).
- I-086 app/src/photos.ts:77-96: photo retention is OFF by default (DEFAULT_RETENTION_DAYS = null; unset SHIN_PHOTO_RETENTION_DAYS = keep forever). Sweep at app/server.ts:4856.
- I-087 app/src/grounded-record.ts:118 GROUNDED_RETENTION_DAYS = 730; sweep app/server.ts:4864-4870.
- I-088 app/src/scans.ts:683 scan_offer purged by age (OFFER_KEEP_MS).
- I-089 Deletion on request: app/public/js/screens/you.js:122-132 builds an email; the work is manual via scripts/privacy/device-data.mjs (delete <id> --yes), process in docs/privacy/data-requests.md; restore re-delete mac/redelete-requests.mjs (45-day window). Only in-app self-service delete is /api/scan-rating/delete (I-017).
- I-090 Backups: mac/07-backup.sh, mac/14-offsite-backup.sh, mac/15-restore-test.sh (contain device data; offsite destination GO).

## 4. Android permissions, iOS keys, encryption flags

Commands: `grep -nE "uses-permission|uses-feature|allowBackup" native/android/app/src/main/AndroidManifest.xml`; merged: `grep -nE "uses-permission" native/android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml` (build artifact, rerun after a build); `grep -nE "<key>|<string>" native/ios/App/App/Info.plist native/ios/App/App/PrivacyInfo.xcprivacy`.

Android source manifest (native/android/app/src/main/AndroidManifest.xml)
- I-091 :5 android:allowBackup="true" (app data may go to Google backup; includes localStorage device id).
- I-092 :40 INTERNET.
- I-093 :45 CAMERA (barcode, photos).
- I-094 :49 VIBRATE (haptics).
- I-095 :54 ACCESS_COARSE_LOCATION.
- I-096 :55 ACCESS_FINE_LOCATION (declared; comment says only a ~1 km cell leaves the phone, geocell.js).
- I-097 :56-57 uses-feature location, location.gps required=false.
- I-098 :58-59 uses-feature camera required=true, camera.autofocus required=false.
- I-099 :28-30 FileProvider (exported=false, grants URI permissions).
- I-100 MainActivity exported=true, launcher intent only (:18).
Added by libraries in the merged release manifest (lines in that file): ACCESS_NETWORK_STATE (:67), com.android.vending.BILLING (:68), com.getpexi.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION (:74), Amazon IAP ResponseReceiver (:195), ML Kit and Google data-transport services (:165,171,279,285).
- I-101 ACCESS_NETWORK_STATE (merged :67).
- I-102 com.android.vending.BILLING (merged :68).
- I-103 Amazon IAP receiver and RevenueCat SimulatedStoreErrorDialogActivity in the shipped manifest (merged :195,208). Surprise: Amazon billing component present in a Play build.
- I-104 Google data-transport/ML Kit services (merged :171,279,285): ML Kit can send usage metrics to Google (GO read terms).
- I-105 Android build: applicationId com.getpexi.app, versionName 1.0.0, minSdk 24, targetSdk 36 (native/android/app/build.gradle:20-24, native/android/variables.gradle:2-4), minifyEnabled false (:47).

iOS (native/ios/App/App/Info.plist)
- I-106 :27-28 NSCameraUsageDescription ("read barcodes and product labels, on your phone").
- I-107 :29-30 NSLocationWhenInUseUsageDescription ("rough area, only if you turn it on").
- I-108 :31-32 NSPhotoLibraryUsageDescription.
- I-109 :33-34 NSPhotoLibraryAddUsageDescription.
- I-110 :25-26 ITSAppUsesNonExemptEncryption = false (export flag). Android has no equivalent flag; HTTPS only.
- I-111 PrivacyInfo.xcprivacy: NSPrivacyTracking false (:20-21); collected types, all Linked=true Tracking=false: DeviceID (:29), ProductInteraction (:43), SearchHistory (:57), OtherUserContent (:71), CoarseLocation (:85), PerformanceData (:98), OtherDiagnosticData, PurchaseHistory; accessed API: FileTimestamp C617.1 only. Note: declares CoarseLocation but not photos/camera images; GO compare with the actual collection (I-063, I-080).
- I-112 iOS target: platform :ios 16.0 (native/ios/App/Podfile:3); pods list from `grep -nE "^  - [A-Za-z]" native/ios/App/Podfile.lock`; iPhone only (UIRequiredDeviceCapabilities armv7, Info.plist:58-60; iPad orientations still listed :66-71, GO).

## 5. Third-party dependencies and licences

Commands: `node <scratch>/lic.mjs app native catalogue price identify spine` (reads every node_modules/*/package.json licence field; script lists direct deps and any non-permissive licence). Counts below come from its output. Vendored files: `find app/public -type f \( -path "*vendor*" -o -path "*fonts*" \)`.

Shipped to phones (web bundle and native)
- I-113 @mediapipe/tasks-vision 1.0.1, Apache-2.0 (app/package.json). Vendored wasm: app/public/js/vendor/mediapipe-wasm/*.wasm and *_internal.js (3 builds, ~11 MB each) plus bundle chunk app/public/js/chunks/vision_bundle-QFUEQ3YV.js. GO check shipped licence/NOTICE text.
- I-114 zxing-wasm 3.1.3, MIT; vendored app/public/js/vendor/zxing_reader.wasm (1.0 MB; zxing-cpp is Apache-2.0, GO confirm notice).
- I-115 esbuild 0.28.2, MIT, build only.
- I-116 Capacitor core/android/ios/camera/filesystem/haptics/text-zoom, MIT (native/package.json).
- I-117 @capacitor-community/in-app-review 8.0.0, MIT.
- I-118 @capacitor-mlkit/barcode-scanning and text-recognition 8.2.1, Apache-2.0 plugins; they pull Google ML Kit (proprietary, ML Kit terms, not in node_modules; pods GoogleMLKit/*, native/ios/App/Podfile.lock:32-52; android com.google.mlkit:barcode-scanning, play-services-code-scanner in plugin build.gradle:67-68). Flag: not an open licence. Text recognition pods include Chinese, Devanagari, Japanese, Korean models.
- I-119 @revenuecat/purchases-capacitor 13.6.0, MIT; RevenueCat native SDKs (PurchasesHybridCommon, purchases-hybrid-common:19.0.0).
- I-120 capacitor-secure-storage-plugin 0.14.2, MIT.
- I-121 Android library tree: androidx appcompat, coordinatorlayout, core-splashscreen, camera-* (Apache-2.0 presumed, GO confirm from gradle licences), native/android/app/build.gradle:60-68.
- I-122 Fonts: app/public/fonts Inter (OFL 1.1, text shipped at app/public/fonts/Inter-OFL.txt) and IBM Plex Mono (6 woff2, also SIL OFL 1.1) with NO OFL text file for Plex Mono in the repo. Flag OFL. Generated by app/scripts/fonts.mjs, css app/public/css/fonts.css.
- I-123 Faces: 39 SVGs app/public/faces/{blunt,deadpan,warm}/*.svg generated by app/scripts/build-faces.mjs from app/public/js/face-art.js (own art by header; origin GO confirm).
- I-124 Icons/images: app/public/icon.svg, icon-180.png, store screenshots docs/store/screenshots, docs/store/play-screenshots (own; origin GO).
- I-125 Native web copy: native/www (generated by native/scripts/sync-web.mjs) and copies under native/android/app/src/main/assets/public and native/ios/App/App/public duplicate the above.

Run on the server
- I-126 @anthropic-ai/sdk 0.124.0, MIT (identify/package.json).
- I-127 catalogue: @huggingface/transformers 3.8.1 Apache-2.0; onnxruntime-node 1.21.0 MIT; sqlite-vec 0.1.9 "MIT OR Apache". 54 packages: MIT 24, BSD-3 13, Apache-2.0 5, ISC 4, BlueOak 4, MIT OR Apache 2, (MIT OR CC0) 1, and ONE copyleft: @img/sharp-win32-x64 0.34.5 "Apache-2.0 AND LGPL-3.0-or-later" (Windows build of sharp's libvips; the Mac build is a different package, GO check which ships on the Mac).
- I-128 app/server uses only Node built-ins plus the above; price, settings, bench, scripts/* have empty dependency lists (`node -e` over each package.json). spine devDeps typescript (Apache-2.0), @types/node (MIT).
- I-129 Models and data shipped or loaded: embedding model files via transformers (cache location GO); Python collectors use stdlib urllib only (catalogue/src/*.py).

Licence-flag summary: LGPL-3.0-or-later (I-127), OFL-1.1 fonts (I-122), Google ML Kit proprietary terms (I-118), no GPL/AGPL/CC-BY-SA found in node_modules. Data licences (ODbL etc.) are under H6.

## 6. External data sources and collectors

Commands: `ls catalogue/src price/src`; hosts `grep -rnoE "https?://..." catalogue/src price/src app/src/attribution.ts mac`; licence register `app/src/attribution.ts:68-179` (the app's own SHOPPER_SOURCES) and `price/src/store.ts:1320` (source_registry), `catalogue/src/source-rights.ts`. Data files: `ls catalogue/data price/data`.

Sources the app itself declares (attribution.ts line = entry start; licence text as the file states it)
- I-130 Open Food Facts, ODbL (attribution.ts:76-78). Collector catalogue/src/fetch_open_facts.py:40; live lookup app/src/open-food-facts.ts:158.
- I-131 Open Beauty Facts / Open Pet Food Facts / Open Products Facts, ODbL (:83-85); fetch_open_facts.py (static.open*facts.org).
- I-132 Open Prices, ODbL (:90-92); price/src/openprices.ts:156; mac/openprices-refresh.sh.
- I-133 OpenStreetMap, ODbL with credit (:97-99); live via Overpass (I-043).
- I-134 Open Icecat, Icecat Open Content License, not ODbL (:104-109); catalogue/src/fetch_icecat.py (data.icecat.biz), prepare_rows_icecat.py.
- I-135 USDA FoodData Central, CC0 (:114-116); catalogue/src/prepare_rows_usda.py, verify_rows_usda.py.
- I-136 BC Liquor Distribution Branch, Open Government Licence BC (:121-123); price/src/bcldb.ts, price/data/bc_liquor_store_product_price_list_june_2026.csv.
- I-137 Statistics Canada table 18-10-0245-01, Open Government Licence Canada (:128-130); price/src/statcan.ts, price/statcan-averages.json.
- I-138 Project Hammer (jacobfilipp.com), "No licence stated by the publisher" (:135-137); price/src/hammer*.ts, mac/hammer-refresh.sh:43. FLAG used live.
- I-139 Kroger product names 2022 listing, no licence stated (:142-144); price/src/kroger-names.ts (raw.githubusercontent.com).
- I-140 Kroger Developer API, Kroger terms (:149-151); price/src/kroger-api.ts:395, kroger-backfill.ts, mac/kroger-refresh.sh, mac/kroger-codes.mjs.
- I-141 ANBL liquor PDF, NO reuse licence, terms forbid copying/redistribution (:156-158); price/src/nb.ts:160. File says not used in any answer since 2026-10-10.
- I-142 Walmart Canada, NO reuse licence, terms forbid scrapers (:163-165); price/src/walmart.ts, walmart-sitemap.ts:258,330 (robots.txt fetch). 22 rows outside terms per the file.
- I-143 Return-It BC, no licence, robots disallow (:170-172); catalogue/src/fetch_returnit.py:136. Not used since 2026-11-05.
- I-144 Consignaction Quebec, personal non-commercial only (:177-179); catalogue/src/fetch_consignaction.py:99. Not used since 2026-11-05.
Other collectors found in code but not in that register (GO confirm each against price/src/store.ts:1320 registry and attribution)
- I-145 Metro Quebec: catalogue/src/fetch_metro.py:40, prepare_rows_metro.py (www.metro.ca).
- I-146 Canadian Tire: price/src/canadiantire.ts:156, canadiantire-run.ts (www.canadiantire.ca, tooling comment "known-safe rate").
- I-147 Save-On-Foods storefront gateway: price/src/saveonfoods.ts:304, saveonfoods-run.ts (storefrontgateway.saveonfoods.com).
- I-148 Best Buy API: price/src/bestbuy-ratings.ts, spine/src/sources/bestbuy.ts.
- I-149 eBay and sold-comps (spine/src/sources/ebay.ts, soldcomps.ts), scraping-as-a-service host api.sold-comps.com.
- I-150 PLU codes: price/src/plu.ts, plu-codes.json, plu-display.json (github.com source, GO licence).
- I-151 Hugging Face Canada dataset: catalogue/src/fetch_canada.py (huggingface.co, GO which dataset and licence).
- I-152 Taxonomy files: catalogue/src/category-taxonomy.ts and fetch-categories.ts:40 (raw.githubusercontent.com, static.openfoodfacts.org taxonomies).
- I-153 Lexicon: catalogue/src/lexicon-fr-en.json, build-lexicon.ts (origin GO).
- I-154 Scripts that collect: scripts/crawler/ (crawl.mjs, worker.mjs, lib), scripts/us-coverage.mjs, scripts/us-ip-probe.mjs, docs/readiness/review-2026-11-21/work/lookup.mjs.
- I-155 Shopper-typed data feeding ranges (see H7), price/src/shopper-prices.ts.
- I-156 Offline pack built from catalogue: catalogue/src/export-pack.ts, served at /api/pack (I-032).

## 7. Where user-generated content enters

Command: `grep -nE "readBody\(req" app/server.ts` (23 bodies) and `grep -noE "searchParams\.get\('[a-zA-Z_]+'\)" app/server.ts`; client inputs `grep -rn "<input\|contenteditable\|textarea" app/public/js/screens`. "Visible to others" decided from the headers read, GO to prove each.

- I-157 Typed product text: /api/identify text= (I-008), /api/search q= (I-010), /api/match-text (I-009). Stored in scan.query_text (I-063). Not shown to other shoppers directly; learned picks (I-160) and the typed-name pool (src/network-hash.ts:2-4 "typed-name pool") may feed answers.
- I-158 Typed shelf price: /api/scan-price (I-024), pad on /api/identify. Saved to shopper_price only for barcode-identified products and passes a typo guard (src/shopper-contribution.ts:1-24). Other shoppers see it as part of price ranges once corroborated (src/shopper-report.ts:7-16: a lone report does not move the range until an independent source agrees).
- I-159 Store name and store id typed or picked: storeName/storeId in /api/identify, /api/match-text, /api/stores; stored in scan.store_name, shopper_price.store, correction.seller, user_observation.store_name.
- I-160 Price corrections /api/correction (I-014): label, seller, price, kind (regular/promotional), seen_on. Feed other shoppers' price statistics via correctionsFor. Switch SHIN_SHOPPER_VOICE=off stops it affecting answers (src/shopper-voice.ts); removal tool scripts/security/remove-shopper-input.mjs.
- I-161 Learned barcode picks /api/scan-pick (I-026): shopper chooses a product for a typed name; can change what other shoppers get for the same barcode (src/shopper-voice.ts:2-4).
- I-162 Ratings of an answer /api/scan-rating (I-016); not shown to others (GO).
- I-163 Shopper's own great/good/reasonable/bad call /api/scan-call (I-025); not shown to others (GO).
- I-164 Photos: /api/identify/photo, /api/identify/pack, /api/shelf/frame, /api/shutter/frame (I-001,I-002,I-011,I-012). Stored with consent (I-080,I-081). Not shown to other shoppers (GO confirm no route serves app/data/photos except admin /api/admin/file, I-038).
- I-165 Location: coarse cell, optional exact lat/lon (I-009, I-063).
- I-166 Client errors /api/client-error (I-020) and usage events (I-019, I-021).
- I-167 Invite link name (SHIN_INVITES name:code, app/src/invite.ts:57-66) recorded per device (I-072); operator-assigned, not typed by shopper.
- I-168 In-app list/watchlist/savings screens: app/public/js/screens/watchlist.js, savings.js, pastscans.js; local to the phone (GO confirm no upload).
- I-169 Share screen: app/public/js/screens/share.js (743 lines) and lib/native-share.js. GO read: what is shared and to whom.
- I-170 Reviews/offers from scans: user_review, user_offer (I-075) are derived from model output, not typed.

## 8. Email, notification, invite, referral flows

Command: `grep -rnE "mailto:|nodemailer|sendmail|sendBeacon|navigator.share|Share.share|notify|push" app/public/js app/src app/server.ts mac scripts`.

- I-171 No server-side email to shoppers exists (no mail library or SMTP match under app/, identify/, price/, catalogue/).
- I-172 mailto links open the shopper's own mail app: Delete my data and contact (app/public/js/screens/you.js:122,132,141) to usepexiapp@gmail.com.
- I-173 Customer contact address appears in paywall seller strings (app/public/js/ui-strings.js:115,117,118 EN; :956-958 FR), User-Agents (app/src/open-food-facts.ts:62, app/src/stores.ts:310), store pages docs/store/*.html (mailto in index.html:29, privacy.html:53). Personal address jymnxu: `grep -rlE "jymnxu" app/public docs/store native/config native/www app/src` found none.
- I-174 Invite flow: shared header code x-shin-invite checked at app/src/invite.ts (door), names per code, SHIN_INVITES env; native build ships inviteCode "android-public" in native/config/shin-api.config.json (so the door is effectively public for that build).
- I-175 Native share sheet: app/public/js/lib/native-share.js, screens/share.js.
- I-176 In-app review prompt: @capacitor-community/in-app-review, app/public/js/review-prompt.js; plus-config.js:108-109 write-review links.
- I-177 No push notification plugin in native/package.json; no referral code found (`grep -rniE "referral|refer a friend" app/public/js app/src` not run beyond this; GO).
- I-178 Operator alerts (not shopper): mac/lib/health.mjs:46-56 sends "MAC JOB FAILED" to the PC via the claude-mailbox script; src/watch.ts builds alarm codes; deadman I-053.

## 9. Customer-facing text surfaces

Commands: `sed -n 49,894p app/public/js/ui-strings.js | grep -oE "^  [a-zA-Z0-9]+_" | sort | uniq -c | sort -rn` (EN block lines 49-894, FR block 896-1589, 607 keys each); `grep -oE '<section class="legal-section" id="[a-z-]+"' docs/store/*.html`; `wc -l app/public/js/screens/*.js`.

- I-179 app/public/js/ui-strings.js EN 607 keys, FR 607 keys. Prefix counts (EN): cam 97, vd 93, you 74, paywall 49, prog 25, cat 25, share 22, priceline 17, guide 15, grounded 14, face 14, setup 12, correct 12, saved 11, ranges 11, removed 9, savings 8, market 8, past 7, nav 7, gem 7, outcome 6, country 6, kind 5, dev 5, conf 5, tm 4, range 4, note 4, scans 3, ea 3, screen 2, perm 2, and one each of try, pm, pad, not, legal, back, app, answer, agree.
- I-180 app/public/js/onboarding-strings.js 278 keys (the onboarding steps, includes consent and paywall steps).
- I-181 app/public/js/paywall-strings.js 12 keys; price-strings.js 32 keys.
- I-182 app/public/js/prose.js (737 lines), voice.js (1848 lines EN), voice-fr.js (1002 lines FR): spoken/long copy. GO enumerate.
- I-183 The one legal document "Terms, Privacy and Data": source app/public/js/legal/document.js (EN sections line refs 45-266: about 45, short 53, who 72, prices 80, ai 87, records 95, why 111, sharing 125, keep 146, rights 160, contrib 180, sources 187, use 199, plus 213, security 230, warranty 237, liability 244, changes 251, law 259, contact 266; FR from line 285), sources register app/public/js/legal/sources.js, shown by app/public/js/screens/agree.js (127 lines). 20 sections each language.
- I-184 Generated web pages: docs/store/privacy.html, terms.html, privacy-fr.html, terms-fr.html (56 lines each, same 20 section ids, built by app/scripts/build-legal-pages.mjs) and docs/store/index.html (support page, 52 lines, deleting-my-data item at :34). Hosted at xu826jamin.github.io/pexi/ per docs/store/listing.md:55-56,181.
- I-185 Store listing text: docs/store/listing.md (195 lines, Apple), docs/store/play-listing.md (101 lines, Google; data-safety answers around :77), docs/store/quebec-transfer-note.md.
- I-186 Store screenshots: docs/store/screenshots/{iphone-6.3,iphone-6.9,ipad-13-held} (+plans.json), docs/store/play-screenshots/ 4 PNGs (01-camera, 02-shelf-price, 03-verdict, 04-you).
- I-187 Screens (customer UI files): app/public/js/screens/*.js: agree, camera (7224 lines), correct, guide, market, onboarding, pastscans, paywall, permissions, progress, removed, savings, setup, share, watchlist, you; plus index.html and manifest.webmanifest / manifest.fr.webmanifest.
- I-188 Native strings: iOS Info.plist usage text (I-106..I-109), Android app_name resources (native/android/app/src/main/res, GO).
- I-189 Privacy support documents (operator-facing but legally relevant): docs/privacy/breach-plan.md, children-record.md, data-requests.md, opc-comment-draft.md; docs/support/replies.md (canned replies).
- I-190 Marketing: ads/introducing-pexi, ads/steal-or-ripoff (video scripts; ads/*/vo.mjs, music.mjs use external services), docs/marketing-video-lessons-2026-11-12.md. GO read claims.
- I-191 Paywall seller/refund lines: ui-strings.js:115-118 (EN), :956-958 (FR); paywall screen app/public/js/screens/paywall.js (466 lines); plus-config.js (terms/privacy/manage links).
- I-192 The old-name check: `grep -cE "\bShin\b"` returned 0 in ui-strings.js, privacy.html, listing.md, play-listing.md, index.html, manifest.webmanifest.

## 10. Accounts, vendors, services the app depends on

Commands: `grep -rhoE "[A-Z_]*(KEY|TOKEN|SECRET)[A-Z_]*" settings/src app/src identify/src price/src spine/src mac/config.env.example | sort | uniq -c`, `git remote -v`, docs/the-store-accounts-packet.md, mac/*.md.

- I-193 Apple Developer Program and App Store Connect (listing, app id 6821190920 in plus-config.js:108 and remote-status.js:36; SHIN_ASC_KEY_ID/FILE, mac/expiry-check.mjs).
- I-194 Google Play Console (docs/store/play-listing.md); package com.getpexi.app.
- I-195 RevenueCat (REVENUECAT_SECRET_KEY server side; native/config/revenuecat.config.json holds a public iOS SDK key, android key empty).
- I-196 Anthropic (ANTHROPIC_API_KEY; monthly caps SHIN_RANGE_ASK_MONTHLY_CAP, SHIN_PACK_READ_MONTHLY_CAP).
- I-197 Cloudflare: zone anjiawenda.com, named tunnel hostname relay.anjiawenda.com (mac/01-cloudflare-tunnel.md:29,58). This is the host every phone talks to; it is not a Pexi-named domain.
- I-198 GitHub: account xu826Jamin; remote github.com/xu826Jamin/shin.git (git remote -v); GitHub Pages site xu826jamin.github.io/pexi hosting terms, privacy, support (plus-config.js:49-50).
- I-199 GitLab shin3223636/shin (origin; deploy source for the Mac, mac/deploy/checker.mjs).
- I-200 Gmail address usepexiapp@gmail.com (customer contact, docs/store/listing.md:88,192); old useshinapp@gmail.com stays open (also file C:\shin\useshinapp@gmail.com.txt at repo root: GO what it contains, not opened).
- I-201 Notion (mac/deploy/notion.mjs, NOTION_TOKEN) for deploy reports.
- I-202 Healthchecks hc-ping.com (SHIN_DEADMAN_URL).
- I-203 Voyage AI (VOYAGE_API_KEY, batch).
- I-204 Kroger developer account (KROGER_CLIENT_ID/SECRET), Best Buy (BESTBUY_API_KEY), eBay (EBAY_* x5), sold-comps.
- I-205 The Mac itself as the production host (launchd, mac/launchd, mac/run-server.sh; Tailscale per mac/expiry-check.mjs:5-7). Backups: mac/07-backup.sh, mac/14-offsite-backup.sh (destination GO).
- I-206 Google AI Studio GEMINI_API_KEY still listed in mac/config.env.example:254 although the call path is removed (I-044).
- I-207 Overpass and Open Food Facts public APIs (no account; fair-use User-Agent).
- I-208 Bitwarden: `grep -rniE "bitwarden" --include=*.md --include=*.ts --include=*.mjs --include=*.sh .` over C:\shin returned NO file. Whether keys live in Bitwarden is not stated in this repo (GO ask; the search could have missed other file types).
- I-209 D-U-N-S / organisation path: docs/the-store-accounts-packet.md section 1c (discussed, status GO).

## 11. Where AI output reaches a shopper, and its label

Commands: `grep -niE "claude|\bAI\b" app/public/js/ui-strings.js`, `grep -n "claude_reading\|claude_typical" app/public/js app/src`, entry points `grep -rn "new Anthropic" identify/src`.

- I-210 Claude price-range estimate (range-ask.ts, text only; fallback after catalogue, StatCan and shopper prices). Shown on the verdict sheet. Labels (EN): "Estimated by AI" (ui-strings.js:284 cat_basis_ai, :288 range_word_ai, :428 vd_basis_ai_line, :442 vd_note_claude_estimate), "Pexi's AI estimate for this item" (:373 vd_prov_claude_typical), "an AI estimate for this item" (:397), "an AI estimate" (:427). FR: :1165, :1184, :1209, :1224.
- I-211 Claude reading of a camera picture of a pack (pack-read.ts; name, brand, size only). Label: "Name read off the pack by AI" (ui-strings.js:297 cat_named_by_ai) selected at app/public/js/screens/camera.js:1924 when identitySource === 'claude_reading'. Developer-only switch dev_pack_read (ui-strings.js:850-851; server must also list the phone).
- I-212 Description text (identify/src/describe.ts, "written from the label" per its header): GO whether any live route returns it.
- I-213 Catalogue category chooser (catalogue/src/claude-chooser.ts): client injected, header says no SDK or socket in that file; used by placement batch jobs, not live (GO).
- I-214 Verdict wording and ranges computed by Pexi math (not AI): app/src/catalogue-first.ts, price/src/estimate.ts, range.ts; the "Pexi's own estimate" label is separate (ui-strings.js:372 comment).
- I-215 Dormant Gemini "grounded" block still rendered by app/public/js/grounded.js and screens/camera.js:54-57,645 (strings grounded_ 14 keys, gem_ 7 keys), and the server shapes catalogue matches as a "grounded wire" (app/server.ts:1209,1564). Whether any live answer still shows Gemini labelling: GO.
- I-216 Legal text on AI: document section id "ai" (app/public/js/legal/document.js:87, FR :327; docs/store/privacy.html #ai) and play-listing data-safety answers.
- I-217 The Anthropic and Voyage models used for catalogue building (embeddings, placement) never reach a shopper directly; their output is stored in catalogue tables (H3).
