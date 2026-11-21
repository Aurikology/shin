/**
 * One string, so it exists in one place.
 *
 * main.js's BUILD_STAMP and api.js's `appVersion` field (item 2a's contract:
 * "Send appVersion, platform and cell on identify bodies") used to have no
 * shared source, which is exactly the drift main.js's own comment on
 * BUILD_STAMP warns about for a different number ("a number written in prose
 * beside the thing it counts drifts the first time the thing changes and
 * nothing fails"). Both read this one constant now.
 *
 * Update this string when a build pass changes user-visible behaviour, same
 * rule BUILD_STAMP always carried.
 *
 * It is also the build identity the server judges (R13, remote-status.js): SHIN_APP_MIN_VERSION is this
 * same `YYYY-MM-DD.N` format, and a build below it is shown "Please update Pexi". A PHONE build no longer
 * needs this bumped by hand: native/scripts/sync-web.mjs stamps the copy in native/www with
 * `<build date>.<Xcode build number>` (native/scripts/app-version.mjs), so it rises with every upload.
 * This file's own string is what the web server and a browser report.
 * 2026-11-18.1 is the first build that asks; every build before it reads as older.
 */
export const APP_VERSION = '2026-11-18.1';
