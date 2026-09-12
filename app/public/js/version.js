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
 */
export const APP_VERSION = '2026-09-11.1';
