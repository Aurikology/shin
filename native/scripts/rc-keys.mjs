/**
 * The build-time check on RevenueCat's public SDK keys (readiness R31, 2026-11-18).
 *
 * A release built with a missing or wrong key installs, opens and shows a paywall that cannot buy:
 * a missed first subscriber, a 1-star, and Apple rejects a broken purchase under guideline 2.1.
 * Returns the reason to stop the build, or null.
 *
 * - a secret key (sk_) never goes in an app, on either platform;
 * - an iOS key must be an `appl_` key and an Android key a `goog_` key, whatever the build;
 * - an iOS RELEASE build (`--release` or SHIN_RELEASE=1) must have a non-empty iOS key. A development
 *   build with no key still works and shows no plans.
 */
export function checkRevenueCatKeys(keys, { release = false } = {}) {
  const ios = String(keys?.ios ?? '').trim();
  const android = String(keys?.android ?? '').trim();
  for (const [name, value] of [['ios', ios], ['android', android]]) {
    if (value.startsWith('sk_')) return `revenuecat.config.json "${name}" is a SECRET key (sk_...). Only public SDK keys go in the app.`;
  }
  if (ios !== '' && !ios.startsWith('appl_')) {
    return 'revenuecat.config.json "ios" does not start with appl_. A key of another platform or a test key cannot sell on the App Store; copy the iOS public SDK key from the RevenueCat dashboard.';
  }
  if (android !== '' && !android.startsWith('goog_')) {
    return 'revenuecat.config.json "android" does not start with goog_. Copy the Android public SDK key from the RevenueCat dashboard.';
  }
  if (release && ios === '') {
    return 'an iOS release build needs the RevenueCat iOS key (appl_...) in revenuecat.config.json; without it the paywall cannot sell. Fill it in, or build without --release for a development build.';
  }
  return null;
}
