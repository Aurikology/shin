/**
 * Writes the hosted "Terms, Privacy and Data" pages from the one document (public/js/legal/document.js).
 *
 * docs/store/terms.html and privacy.html (and their -fr twins) are the App Store's terms and privacy URLs
 * (plus-config.js LEGAL_URLS), so both names keep resolving and both carry the whole document.
 * test/legal-document.test.mjs fails when a page on disk differs from what this would write.
 *
 *   node scripts/build-legal-pages.mjs      (from app/)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { legalPageHtml } from '../public/js/legal/document.js';

export const PAGES = Object.freeze({
  'terms.html': 'en',
  'privacy.html': 'en',
  'terms-fr.html': 'fr',
  'privacy-fr.html': 'fr',
});

export const STORE_DIR = new URL('../../docs/store/', import.meta.url);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [file, lang] of Object.entries(PAGES)) {
    writeFileSync(new URL(file, STORE_DIR), legalPageHtml(lang, file));
    console.log(`wrote docs/store/${file}`);
  }
}
