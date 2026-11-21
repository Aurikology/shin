/**
 * The phone build's APP_VERSION, taken from the Xcode build number (review 2026-11-21, ops finding 2).
 *
 * The update gate (R13, app/public/js/remote-status.js) judges the build by APP_VERSION, a
 * `YYYY-MM-DD.N` string. It used to be typed by hand for each build and tied to nothing, so a fix could
 * ship under the same string as the bad build and "raise the minimum" would block both or neither.
 * Now native/scripts/sync-web.mjs stamps the COPY of js/version.js in native/www with
 * `<build date>.<CURRENT_PROJECT_VERSION>`. Apple needs a higher build number for every upload, so the
 * gate's number rises with every upload and cannot repeat. app/public/js/version.js (what the web
 * server serves) is left alone.
 */

/** The number in Xcode's CURRENT_PROJECT_VERSION. Both build configurations must carry the same one. */
export function readBuildNumber(pbxprojText) {
  const found = [...String(pbxprojText).matchAll(/CURRENT_PROJECT_VERSION\s*=\s*(\d+)\s*;/g)].map((m) => Number(m[1]));
  if (found.length === 0) {
    throw new Error('no numeric CURRENT_PROJECT_VERSION in the Xcode project, so the build number is unknown. Set it in Xcode (target App, General, Build), or pass SHIN_BUILD_NUMBER=<n>.');
  }
  if (new Set(found).size > 1) {
    throw new Error(`the Xcode project's build configurations disagree on CURRENT_PROJECT_VERSION (${[...new Set(found)].join(', ')}). Set one number in Xcode, or pass SHIN_BUILD_NUMBER=<n>.`);
  }
  return found[0];
}

/** `YYYY-MM-DD.N` (UTC date of the build, N = build number), the format app/src/app-status.ts accepts. */
export function versionFor(build, date = new Date()) {
  if (!Number.isInteger(build) || build < 1 || build > 9999) {
    throw new Error(`the build number must be a whole number of 1 to 4 digits (the server gate accepts YYYY-MM-DD.N with N that long); got ${build}`);
  }
  return `${date.toISOString().slice(0, 10)}.${build}`;
}

/** version.js's source with its APP_VERSION string replaced. Throws if the line is not there. */
export function stampVersionSource(source, version) {
  const line = /(export const APP_VERSION\s*=\s*)(['"])[^'"\n]*\2/;
  if (!line.test(source)) throw new Error("js/version.js no longer has an `export const APP_VERSION = '...'` line; update native/scripts/app-version.mjs");
  return source.replace(line, `$1'${version}'`);
}
