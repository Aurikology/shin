# Pexi security check: V1 secrets, V2 dependencies and static review, V6 phone app (PC half)

Run 2026-11-16 from the lane worktree `C:\shin-lanes\sec-static` (commit dc4ef08, origin/main). Nothing was fixed,
committed or written to production. Labels: **checked** = I saw it in code, history or a command's output;
**suspected** = follows from what I saw but needs the Mac, the shipped build or a live call to confirm.
No secret value is printed here: where a key is named I give only its first 6 characters and its type.

## Verdict in one paragraph

No live secret of ours is in any history or in the public pages repo. Dependencies have no high or critical
advisory that a server route can reach. The hand read of `app/server.ts` and `app/src` found no SQL injection, no
path traversal, no uncapped body, no stack trace sent to a caller and no timing-unsafe secret compare. What it did
find: the invite code is built into the phone bundle (and, once public, shared by every shopper in one rate
bucket), the server listens on every network interface rather than only through the tunnel, nightly backups of
shopper data go unencrypted into a Dropbox folder the privacy pages never mention, and the privacy manifest
cannot be proved complete from the PC. 0 High, 4 Medium, 9 Low.

## Findings, ranked

### M1. The invite code ships inside the phone app, and every shopper shares one rate bucket (Medium; High if 1.0 keeps the invite on)
- **Named cost:** money (the Claude bill) and trust (one person can lock every shopper out).
- **Evidence (checked):** `native/scripts/sync-web.mjs:125` writes `window.SHIN_INVITE_CODE = <code>` into
  `js/native-config.js` in the bundle. An .ipa is a zip, so anyone with the app can read it. `app/src/invite.ts`
  gives every shopper the same name, `family`, for `SHIN_INVITE_CODE`, and `paidCallRefusal`
  (`app/server.ts:970-977`) counts paid calls per code name: defaults 200 per 10 minutes and 1,500 per day
  (`app/src/rate-limit.ts:84-85`) for ALL shoppers together. With the invite unset every caller is the single
  bucket `open` (same file), so the same ceiling applies.
- **What follows (suspected, needs the live server):** (a) once the app is public the "bouncer" is public
  knowledge; (b) one script with the code can use the 1,500 daily paid calls and every real shopper gets a refusal
  for the rest of the day; (c) with real traffic the legitimate shoppers alone could hit 1,500 a day.
  `invite.ts` says plainly it is "a bouncer, not a login", so the first point is by design for a closed beta; the
  gap is that nothing replaces it for a public 1.0.
- **Reproduce:** unzip the built .ipa, open `www/js/native-config.js` (the PC copy in `C:\shin\native\www` is a
  placeholder build, see below). For the bucket, read `paidCallRefusal` and `codeWindows`.
- **Smallest fix:** decide the 1.0 door. Either raise the per-code ceilings to a number that scales and rely on the
  per-address and per-device limits, or key the paid-call bucket on device id (proved by device key) as well as
  address, and treat the invite as optional at 1.0. (This overlaps V3 item 4; flag it there.)

### M2. Nightly backups of shopper data go unencrypted into a Dropbox folder the privacy pages do not mention (Medium, suspected)
- **Named cost:** shopper data, a privacy-law fine risk (Quebec transfer note, PIPEDA), trust.
- **Evidence (checked):** `mac/config.env.example:197` sets `SHIN_BACKUP_DIR=/Users/worker/Dropbox/shin-backup`
  and the comment above it says the folder is "synced by a cloud client (Dropbox/iCloud Drive/Drive)".
  `mac/07-backup.sh` copies scans, `people.db` (device to named person), the access log (IP, country, user
  agent), `corrections`, photos and shutter frames. The script has no encryption step (grep for
  gpg/openssl/encrypt found nothing). `docs/store/quebec-transfer-note.md` and `privacy.html` do not contain
  the word Dropbox (grep).
- **Suspected, not seen:** whether the real Mac's `config.env` uses that Dropbox path. The Mac session must read it.
- **Smallest fix:** point the backup at a local disk or an encrypted archive (one `openssl enc` or `age` line
  in `07-backup.sh`), or add Dropbox to the processor list in the privacy policy and transfer note. Jamin's call.

### M3. The server listens on every network interface, so the tunnel is not the only door (Medium)
- **Named cost:** money (rate limits can be dodged) and shopper data on a shared network.
- **Evidence (checked):** `app/server.ts:4298` is `server.listen(PORT, ...)` with no host, which binds all
  interfaces. `app/src/rate-limit.ts:127-141` trusts the `cf-connecting-ip` header for the client address and
  its own comment says "a caller who reaches this port directly can [forge it], which is why the port must not be
  reachable except through the tunnel". `isLocalRequest` also exempts a loopback socket with no such header from
  the door limiter. The tunnel config targets `http://localhost:4173` (`mac/cloudflared/config.yml.example:22`),
  so binding to loopback would not break it.
- **Reproduce:** from another machine on the Mac's network, `curl http://<mac-lan-ip>:4173/api/health`; then send
  a different `cf-connecting-ip` header each time to a limited route and see the per-address limit never trip
  (the invite code is still required for everything but `/api/health`).
- **Smallest fix:** `server.listen(PORT, '127.0.0.1', ...)`. The Mac half (V7) should also confirm the macOS firewall.

### M4. The privacy manifest and the privacy label cannot be proved complete from the PC (Medium, suspected)
- **Named cost:** App Store rejection or a warning email (ITMS-91053 class), and a wrong privacy label.
- **Evidence (checked):** `native/ios/App/App/PrivacyInfo.xcprivacy` has `NSPrivacyAccessedAPITypes` empty. The
  app's own Swift (`AppDelegate.swift`, `SceneDelegate.swift`) calls no required-reason API, so empty is right for
  the app itself. Capacitor core ships its own manifest, also empty (`node_modules/@capacitor/ios/.../PrivacyInfo.xcprivacy`).
  The pods are not on the PC (`ios/App/Pods` is absent), so I could not read their manifests. The plugin source
  for `@capacitor/filesystem` reads file creation dates (`IONFileStructures+Converters.swift:45`), which is a
  file-timestamp API that needs a declared reason somewhere in the app or its pods. `Podfile.lock` pulls in
  GoogleUtilities/UserDefaults (UserDefaults API) and GoogleDataTransport through ML Kit.
- **Not verified:** whether `IONFilesystemLib`, the ML Kit pods and GoogleUtilities ship manifests that cover
  those APIs (I believe Google's recent pods do, but I did not see it). Google's ML Kit privacy page
  (developers.google.com/ml-kit/android-ios-app-privacy) did not say what, if anything, the on-device barcode and
  text APIs send to Google, so whether the label and "no image leaves the phone" need a note about ML Kit
  usage data is **to confirm**.
- **Mac check:** in Xcode, Product > Archive > Generate Privacy Report, and read App Store Connect's email for build 8.
- **Smallest fix:** if the report lists a missing API, add it to `PrivacyInfo.xcprivacy` with its reason code.

### L1. A third party's storefront key is in history (Low)
- **Named cost:** none to us; a retailer could rotate it and break the Canadian Tire price source.
- **Evidence (checked, gitleaks `generic-api-key`):** `price/src/canadiantire.ts:28` and `:61`, first added in
  commit 38c5c4d (2026-09-05), type Azure API Management subscription key, first 6 characters `c01ef3`. The file's own
  comment says it is the public key Canadian Tire's page hands every anonymous visitor. I did not verify that
  claim against the live site. It is not one of our accounts, so there is nothing of ours to rotate.
- **Smallest fix:** none needed; optionally read it from an env var.

### L2. Stale source maps may ship in the phone bundle (Low)
- **Named cost:** trust only (readable source for the camera reader; the vendor part is public code).
- **Evidence (checked):** `native/scripts/sync-web.mjs:99` is `cpSync(source, dest, { recursive: true })` with no
  filter. `C:\shin\app\public\js\eye.js.map` and `...\chunks\vision_bundle-SWDWE6A5.js.map` exist (dated Nov 5) and
  were copied into `C:\shin\native\www` and `ios\App\App\public` (dated Oct 9, a placeholder build, see below).
  `app/scripts/build-eye.mjs:50` now sets `sourcemap: false`, and `app/server.ts:4185` refuses to serve `.map`, so
  the server side is clean. Whether build 8's .ipa contains them is **unknown** (built on the Mac).
- **Reproduce:** `find <ipa>/www -name "*.map"`.
- **Smallest fix:** filter `*.map` out of that `cpSync`, and delete the two stale files.

### L3. A stranger can sometimes read a server file path (Low)
- **Named cost:** trust (internal layout); no direct data loss.
- **Evidence (checked in code):** `/api/health` needs no invite (`app/src/invite.ts:127`) and returns
  `categoryCheckWhy` when the category check is off (`app/src/category-guard.ts:176-179`), whose text can include
  a file path (`catalogue/src/category-taxonomy.ts:236,264,270`). `app/server.ts:383,623,3134` also puts the
  catalogue attach error text into `/api/search` and identify answers when the catalogue is down (behind the invite).
  Only when something is already broken; I did not see it leak live.
- **Reproduce:** start a local copy with the taxonomy file missing and `curl /api/health`.
- **Smallest fix:** send a fixed word ("off") in `categoryCheckWhy` and `why`, keep the text in the log.

### L4. The admin SQL route lets the token holder write and read other files (Low)
- **Named cost:** none beyond what the token already gives (it already reads the whole data folder through
  `/api/admin/file`); matters only if the token leaks.
- **Evidence (checked, run locally on a throwaway database):** a read-only `node:sqlite` connection still ran
  `VACUUM INTO '<path>'` (a new file appeared) and `ATTACH DATABASE '<other.db>'`. `app/src/admin.ts:151-154`
  passes the posted text straight to `db.prepare(sql)`.
- **Smallest fix:** accept only statements that start with `SELECT` or `WITH` (after trimming).

### L5. The device key lives in the web view's localStorage, which iOS backs up (Low, suspected)
- **Named cost:** shopper identity (a restored or copied backup carries the key); a storage purge resets identity.
- **Evidence (checked):** `app/public/js/device.js:12-98` keeps `shin.deviceId` and `shin.deviceSecret` in
  `localStorage`. The plugins used are Camera, Filesystem, Haptics, TextZoom, InAppReview, ML Kit, RevenueCat; none
  is Preferences or a Keychain plugin. A grep of `@capacitor/ios` for `isExcludedFromBackup` found nothing, and
  `AppDelegate.swift` sets none. That web storage is in the app's backed-up Library by iOS default is from memory
  (**suspected**). Rollback side: if iOS clears the storage the phone becomes a new device and gets a new free week,
  which the per-address daily limit (`SHIN_FREE_SCANS_PER_IP_DAY`, default 30) partly covers.
- **Smallest fix:** none needed for 1.0; for later, keep the key in the Keychain through a plugin.

### L6. Dependency advisories, none reachable from a route (Low)
- **Evidence (checked, `npm audit --json`, read-only):** `app` 0, `spine` 0, `price` 0, `identify` 0.
  `catalogue`: 2 high, both the same chain, `@huggingface/transformers` (direct) via `sharp`
  (libvips, libheif, librsvg advisories; fix is a major bump to 4.3.2). `native`: 1 high, 6 moderate, all in the build
  tool `@capacitor/cli` (brace-expansion, glob, minimatch, rimraf, uuid, xcode; fix available).
- **Reachability:** `catalogue/src/embed.ts:77` and `name-meaning.ts:356` import transformers only to embed text;
  nothing in `app/` or `catalogue/src` passes it an image, and photo scanning was removed (e217bf7), so `sharp`'s
  image decoders get no shopper input. The native packages run on the Mac while building and are not in the
  shipped app. Pods (ML Kit 8.0.0, RevenueCat 5.89.0, Capacitor 8.5.2) have no PC-side scanner; I did not check them
  against advisories.
- **Smallest fix:** `npm audit fix` in `native/` at the next build; bump transformers when convenient.

### L7. A Debug build would have the web inspector on (Low)
- **Evidence (checked):** `native/ios/App/App.xcodeproj/project.pbxproj:368-381` (Debug) sets `-DDEBUG`; Capacitor
  turns on `isInspectable` when `DEBUG` is defined (`CAPInstanceDescriptor.swift:140-141`).
  Release (`:390-`) has no `-DDEBUG`, and `capacitor.config.json` has no `ios.webContentsDebuggingEnabled`, so an
  Archive build has it off. No `CAPACITOR_DEBUG` key is in `Info.plist`.
- **Smallest fix:** none; submit only Archive (Release) builds.

### L8. Where each server secret is set is only partly written down (Low)
- **Evidence (checked):** `mac/config.env.example` lists `ANTHROPIC_API_KEY`, `SHIN_INVITE_CODE`, `GEMINI_API_KEY`
  (a leftover; Gemini was removed in e217bf7) and the paths, but not `REVENUECAT_SECRET_KEY`, `SHIN_ADMIN_TOKEN`,
  `SHIN_DEVELOPER_DEVICES`, `SHIN_INVITES`, `SHIN_PLUS_TRUST_CLIENT`, the `SHIN_RATE_*` settings or `NOTION_TOKEN`
  (read by `mac/deploy/notion.mjs`). A rebuilt Mac without `REVENUECAT_SECRET_KEY` makes nobody Plus, paying
  subscribers included (`app/src/scan-quota.ts:155`). No script runs `chmod 600` on `mac/config.env`.
- **Smallest fix:** list the missing names in the example file, and add `chmod 600 mac/config.env` to the install
  steps.

### L9. A device id nobody has bound yet can be claimed by whoever sends it first (Low, suspected)
- **Evidence (checked in code):** `app/src/device-key.ts` `ownsDevice` returns true for an id with no bound key, and
  `bindDevice` binds the first key seen. A phone that never reached the server with a key is claimable by anyone who
  learns its id. Ids are random UUIDs and the first request of a current build binds the key, so the window is
  small. Left for V3, which tests it.

## Env names the server reads and where each is set

`settings/src/index.ts` is the one table; the `secret: true` rows are marked S. Set means "named in repo docs".

| Name | S | Where the repo says it is set |
|---|---|---|
| ANTHROPIC_API_KEY | S | Mac `config.env` (example line, read by the Anthropic SDK and `identify/src/env.ts`, which also loads a root `.env`) |
| REVENUECAT_SECRET_KEY | S | Not in `mac/` or `config.env.example`; `docs/launch-gaps-2026-11-06.md:48` says Jamin sets it |
| SHIN_ADMIN_TOKEN | S | Not on the Mac per the docs; held in Jamin's own shell (`CLAUDE.md:211`, beta-data skill) |
| SHIN_INVITE_CODE | S | Mac `config.env`; also baked into the phone build from `native/config/shin-api.config.json` (gitignored) |
| SHIN_INVITES (name:code list) | S | `mac/deploy/deployer.mjs` only; not in the example |
| SHIN_DEVELOPER_DEVICES | | Not documented in `mac/` or `docs/` |
| SHIN_PLUS_TRUST_CLIENT | | `docs/decisions.md` only |
| VOYAGE_API_KEY, BESTBUY_API_KEY, EBAY_CLIENT_ID, EBAY_APP_ID, EBAY_CLIENT_SECRET, EBAY_CERT_ID, SOLDCOMPS_API_KEY | S | Spine sources, optional, unset means the source is off; not in `mac/` |
| NOTION_TOKEN, SHIN_NOTION_TOKEN_OVERRIDE | S | `mac/deploy` (not read by the server) |
| PORT, SHIN_DATA_DIR, SHIN_CATALOGUE, SHIN_SCANS, SHIN_CORRECTIONS, SHIN_PRICES, SHIN_GAPS, SHIN_USER_CATALOGUE, SHIN_PEOPLE_DB, SHIN_PHOTOS, SHIN_SHUTTER_DIR, SHIN_ACCESS_LOG, SHIN_SPEND_CAP_STORE_PATH, SHIN_RANGE_ASK_STORE_PATH, SHIN_PACK_READ_STORE_PATH, SHIN_VECTORS, SHIN_OVERPASS | | Mac `config.env.example` |
| SHIN_RATE_CODE_*, SHIN_RATE_IP_*, SHIN_RATE_DOOR_IP_*, SHIN_FREE_SCANS_PER_WEEK, SHIN_PLUS_SCANS_PER_WEEK, SHIN_FREE_SCANS_PER_IP_DAY, SHIN_RANGE_ASK_MONTHLY_CAP, SHIN_PACK_READ_MONTHLY_CAP, SHIN_PHOTO_*_CAP_CAD, SHIN_PHOTO_RETENTION_DAYS, SHIN_SHUTTER_LOG, SHIN_CATALOGUE_FIRST, SHIN_REQUIRE_DB, SHIN_PYTHON, SHIN_MODEL_*, SHIN_COST_*_CENTS | | Defaults in code; no Mac doc sets them |

Whether the live Mac really has any of these set I could not see from the PC; `NOW.md:73` says only that the invite
code is set. Rotation: ANTHROPIC and REVENUECAT keys in their dashboards (Jamin's accounts); invite code and admin
token by editing the Mac's environment and restarting (the invite also needs a new app build, see M1).

## V1 scan record

- **gitleaks 8.30.1** (downloaded into `C:\Users\xujam\AppData\Local\Temp\glk`), `git --log-opts=--all`: 1,024
  commits with diffs scanned of 1,075 reachable (44 merge commits and 7 empty ones have no diff). Refs: main, 5
  origin/github feature branches, `claude/current-work-status-uktpa1`, `current-work-status-uktpa1`. Result: 2 hits,
  both L1 above (the same key, two lines).
- **My own scanner** over the full `git log -p --all` for Anthropic `sk-ant-`, OpenAI, Gemini `AIza`, GitHub
  `ghp_`/`github_pat_`, GitLab `glpat-`, Stripe `sk_`/`rk_`/`whsec_`, RevenueCat `appl_`/`goog_`/`sk_`, Cloudflare
  tunnel tokens and `TunnelSecret`, JWT-shaped strings, PEM private keys, AWS and Slack keys, `*TOKEN/SECRET/PASSWORD/
  API_KEY/INVITE/ADMIN =` assignments, `x-shin-admin` or Authorization header literals, and file names `.env`, `.pem`,
  `.p8`, `.p12`, `.mobileprovision`, `.keystore`, `.sqlite`, `.db`, `.ipa`. Every assignment hit was a test fixture
  (`test-key`, `admin-token-for-tests`, `letmein-test`, `sk_test_never_sent`, `secret-test-token`) or a placeholder
  (`paste-the-real-invite-code-here`). No private key, no `.env` or certificate file was ever added to history.
- **History of the phone config:** `native/config/shin-api.config.json` was tracked once; both versions in history
  (4ab2b62, deleted in 34665b5) hold only `REPLACE-WITH-REAL-...` placeholders. No real invite code was ever committed.
- **Public pages repo** `xu826Jamin/pexi` (cloned to a temp folder, 5 commits, 5 HTML files): gitleaks no leaks, my
  scanner no hits; the only addresses in it are the public support email and `reportaproblem.apple.com`.
- **Phone bundle on the PC:** `native/ios/App/App/public` (164 files, 39 MB) and `native/www` are a placeholder
  build dated Oct 9: API base `REPLACE-WITH-REAL-HOSTNAME.example.invalid`, invite code
  `REPLACE-WITH-REAL-INVITE-CODE`, RevenueCat keys empty. No Anthropic, Google, GitHub, Stripe or private-key
  strings, no internal hostnames or developer device ids, no admin token name. It contains the two `.map` files (L2).
  **The real build-8 bundle was not on the PC, so the shipped build is not scanned.** The Mac or Aurik's machine
  must run `grep -rIE "sk-ant-|AIza|BEGIN .*PRIVATE|x-shin-admin"` and `find -name "*.map"` on the unzipped .ipa.
  `native/config/revenuecat.config.json` (gitignored) holds an `appl_` key (RevenueCat's public SDK key type, made to
  be in the app). The only real host in the repo is `relay.anjiawenda.com` (`mac/config.env.example`, the beta-data
  skill); a hostname is public by nature, but the apex is also the paused ACT venture's domain.

## V2 static review: checked and found clean

- **SQL:** every `prepare`/`exec` with request-derived text uses bound parameters; the interpolated ones build
  column names or placeholder lists from code (`scans.ts:906`, `scan-marks.ts:52`, `events.ts:259`,
  `ratings.ts:249`, `own-prices.ts:742`). Full-text `MATCH ?` is bound (`catalogue/src/search.ts:1269`,
  `text-match.ts:536`). The admin `sql` route is the one exception (L4), token only.
- **File paths from request input:** `saveShutterFrame` needs `id` to match a UUID regex
  (`shutter-log.ts:29,180`); `saveShelfFrame` needs `deviceId` to match `^[A-Za-z0-9_-]{8,64}$` (`shelf.ts:50`)
  and checks the picture's magic bytes; neither can hold a dot or slash. `/api/pack` only accepts the
  scope words `grocery` or `canada` and reads a fixed path (`pack-route.ts`). Static files: normalised, then
  must start with `PUBLIC_DIR`, and `.map` is refused (`server.ts:4180-4186`). `/api/admin/file` resolves under
  the data folder and refuses anything outside it (`admin.ts:182`).
- **Body size:** every JSON route goes through `readBody` (running-total cap; 8 KB default, 1 MB event batch,
  3 MB pack and shelf, 16 MB shutter frame) and refuses before buffering. The shutter and shelf image routes also
  check size caps per device per day and free disk.
- **JSON.parse without try:** none on request data (`readBody` wraps it; the others are in try or read fixed files).
- **Error echo:** the catch-all answers a fixed sentence and logs the detail (`server.ts:4211-4237`); no `.stack`
  or `err.message` is sent, except the L3 cases.
- **Secret compares:** invite, admin token and device key all use `timingSafeEqual` (`invite.ts:79-87`,
  `admin.ts:57-63`, `device-key.ts:127-132`); the length is compared first, which leaks only length. No `===`
  on a secret anywhere in `server.ts` or `src/`.
- **CORS:** never `*`; the allowed origins are the three phone schemes plus same-host; no credentials header;
  `x-shin-admin` is deliberately not in the allowed headers; OPTIONS from a foreign origin gets 403.
- **Admin check:** the token is trimmed, constant-time, and the whole `/api/admin/*` tree answers 404 when the token
  is unset and 401 otherwise; it also sits behind the door rate limiter.
- **CI:** `.github/workflows/server-alarm.yml` passes the manual input through `env`, not into the shell text, so no
  script injection; token permission is `contents: read`.
- **Semgrep was not run** (not installed); the hand read above stands in for it.

## V6 phone app, PC half: checked and found clean

- `capacitor.config.json`: app id `com.getpexi.app`, `hostname: localhost`, https schemes, no `allowNavigation`, no
  `cleartext`, no debug flag. No external navigation is allowed by default.
- `Info.plist`: no `NSAppTransportSecurity` key, so iOS default (https only) applies; the API base must be https
  (the bundle's connect-src is built from it, `sync-web.mjs`). `ITSAppUsesNonExemptEncryption` false. No
  `UIFileSharingEnabled`. Permission strings exist for camera, location when in use, photo library and add-only photo
  library, all in plain words that match the privacy pages ("only if you turn it on"). The camera string says
  "photograph items" while the policy says no image leaves the phone; the two are consistent but a reviewer may ask.
- The bundle's own page security: CSP `default-src 'self'`, scripts only from the app, `connect-src` limited to the
  app and the API origin (`sync-web.mjs:130-140`). There is a client-side developer switch (`?dev=1`), but the one
  server route it gates (the Claude pack read) is refused server-side unless the device proves it is a developer
  (`server.ts:3290-3310`).
- `PrivacyInfo.xcprivacy` present, tracking false, no tracking domains, eight data types all marked linked to the
  device id, matches the comment's claim that no photo leaves the phone (M4 covers what the PC could not see).

## Not done, and why

- The shipped .ipa and the Pods (Mac or Aurik).
- Whether the live Mac's environment has each setting (V7, Mac session).
- Live probes of production (V5), route-by-route attack tests (V3).
- Advisory check of the iOS pods against a vulnerability database.
