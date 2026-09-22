/**
 * Turns the MVP switches in flags.js into the app's state, once, at boot
 * (main.js calls this before the router starts).
 *
 * `languages` off pins the locale to English (lib/locale.js `pinLocale`), and
 * `market` off pins the market to Canada (store.js `pinMarket`). Pins, rather
 * than a flag read inside `locale()` and `market()`, so both modules still work
 * alone and the French tables and the market picker keep their own tests with
 * the pin off. The You screen hides the language row and the market row
 * whenever the matching pin is set.
 *
 * `onboarding` and `photoId` need nothing here: `firstScreen()` and camera.js
 * read them where they decide.
 */

import { FLAGS } from './flags.js';
import { pinLocale, DEFAULT_LOCALE } from './lib/locale.js';
import { pinMarket } from './store.js';

/** The country the market is pinned to while FLAGS.market is off. */
export const PINNED_COUNTRY = 'CA';

export function applyFlags(flags = FLAGS) {
  pinLocale(flags.languages ? null : DEFAULT_LOCALE);
  pinMarket(flags.market ? null : PINNED_COUNTRY);
}
