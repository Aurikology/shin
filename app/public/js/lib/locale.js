/**
 * Which language Shin is speaking.
 *
 * Canada is bilingual and this app is aimed at Canadian grocery aisles, so
 * French is not a translation project bolted on at the end: it is half the
 * market. This module is the only place that decides which of the two is on,
 * and everything that prints a string reads it from here.
 *
 * THREE THINGS DECIDE THE ANSWER, in this order, and only the first is a
 * choice:
 *
 *   1. What the person picked on the You screen. Stored, and it wins forever
 *      after, including over a phone whose system language later changes.
 *   2. `navigator.language` and its list, when nothing was ever picked. A
 *      phone set to fr-CA opening this for the first time gets French without
 *      being asked, which is the whole point of the header existing.
 *   3. English, which is the fallback and never a claim about the reader.
 *
 * WHY THE CHOICE IS NOT IN store.js. See lib/persistence.js's `readSetting`:
 * voice.js and ui-strings.js are imported by every screen and are the first
 * two things that print, and putting the whole application state in front of
 * the first string was the wrong shape.
 *
 * A locale that is not one of `LOCALES` is treated as absent rather than
 * honoured, so a hand-edited localStorage value cannot make every table in the
 * app fall through to an empty string.
 */

import { readSetting, writeSetting } from './persistence.js';

const KEY = 'shin.locale';

/**
 * The two, with each one's name written IN that language.
 *
 * A language row that says "French" to somebody who cannot read English is a
 * row they cannot use, which is the one thing a language picker may never be.
 * So each option names itself: the English row says English, the French row
 * says Français, and neither is translated into the other.
 */
export const LOCALES = [
  { id: 'en', name: 'English', tag: 'en-CA' },
  { id: 'fr', name: 'Français', tag: 'fr-CA' },
];

export const DEFAULT_LOCALE = 'en';

/** True if `id` is a locale this build actually has a table for. */
export function isLocale(id) {
  return LOCALES.some((l) => l.id === id);
}

/**
 * What the browser is asking for, or null when it asks for nothing this build
 * has. `navigator.languages` first because it is the ordered preference list
 * and `navigator.language` is only its head; a phone set to English with
 * French second should still get English.
 *
 * Matched on the primary subtag, so fr, fr-CA and fr-FR all arrive at the same
 * table. The table is Canadian French either way, which is a deliberate choice
 * and not an accident of matching: this app has one French and it is the one
 * its market speaks.
 */
export function preferredLocale() {
  const nav = globalThis.navigator;
  const asked = nav ? (nav.languages?.length ? nav.languages : [nav.language]) : [];
  for (const tag of asked) {
    if (typeof tag !== 'string') continue;
    const primary = tag.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return null;
}

/** The locale in force right now: the stored choice, then the browser's, then English. */
export function locale() {
  const stored = readSetting(KEY, null);
  if (isLocale(stored)) return stored;
  return preferredLocale() ?? DEFAULT_LOCALE;
}

/** The BCP 47 tag for `document.documentElement.lang` and for the server. */
export function localeTag(id = locale()) {
  return LOCALES.find((l) => l.id === id)?.tag ?? 'en-CA';
}

/**
 * Picks a language.
 *
 * Writes, sets `lang` on the document immediately (the router sets it on every
 * paint too, but a picker that leaves the attribute stale until the next
 * navigation has told a screen reader the wrong thing for as long as the user
 * stays on the page), and fires `shin:locale` so anything already painted can
 * repaint itself. Returns false and changes nothing for a locale this build
 * does not have.
 */
export function setLocale(id) {
  if (!isLocale(id)) return false;
  writeSetting(KEY, id);
  applyLang();
  globalThis.dispatchEvent?.(new CustomEvent('shin:locale', { detail: { locale: id } }));
  return true;
}

/**
 * Stamps the current locale onto the document element.
 *
 * `lang` is not decoration: it is what a screen reader picks a voice from, and
 * an app that reads French copy in an English voice is less usable than one
 * that never translated anything. Guarded because this module is imported by
 * the string tables, which the test suite loads with no DOM at all.
 */
export function applyLang() {
  const el = globalThis.document?.documentElement;
  if (!el) return;
  el.lang = localeTag();
  applyManifest();
}

/**
 * Points `<link rel="manifest">` at the manifest for this language.
 *
 * A web app manifest is a static file and carries ONE `lang` and one
 * `description`, which is what the install prompt and the home-screen entry
 * are built from. There is no per-request negotiation to hook into here and no
 * way to express two languages in one file, so there are two files
 * (`manifest.webmanifest` and `manifest.fr.webmanifest`, identical but for
 * `lang` and `description`) and this swaps the link.
 *
 * The name is NOT translated between them: "Shin" is the product's name, the
 * icon is the same face, and an app that appears under two different names
 * depending on a setting is an app somebody cannot find on their own phone.
 *
 * Swapping the href after install does not rewrite an already-installed home
 * screen entry; the browser re-reads it on its own schedule. That is a real
 * limit of the platform rather than something this could do better, and the
 * thing that matters (everything inside the app) is not affected by it.
 */
function applyManifest() {
  const link = globalThis.document?.querySelector('link[rel="manifest"]');
  if (!link) return;
  const want = locale() === 'fr' ? '/manifest.fr.webmanifest' : '/manifest.webmanifest';
  if (link.getAttribute('href') !== want) link.setAttribute('href', want);
}
