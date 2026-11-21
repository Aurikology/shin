/**
 * What a product is called on screen: the brand-and-name rules for a catalogue row, a photo
 * candidate and an answer, and the comparison those rules lean on. Moved out of screens/camera.js
 * on 2026-11-21 (the camera.js split, slice 2), verbatim. camera.js imports and re-exports these,
 * so every existing import keeps working.
 */
import { t } from '../../ui-strings.js';
import { locale } from '../../lib/locale.js';
import { pt } from '../../price-strings.js';
import { cleanName, nameCarriesSize } from '../../lib/product-name.js';

/**
 * A category tag as a shopper would read it. "en:apples" is "Apples".
 *
 * D-011's shape is a raw internal code reaching the glass, and `ringTag` is a
 * raw Open Food Facts taxonomy id: "en:apples", "en:dried-fruits",
 * "en:cereals-and-their-products". Nobody standing in an aisle reads those,
 * and a badge whose whole job is to say how wide a claim is cannot spend its
 * credibility on looking like a database dump.
 *
 * THIS IS `labelForTag` FROM `catalogue/src/alternatives.ts`, ON PURPOSE, and
 * that file's own comment says why it has to be: "Must match search.ts's
 * labelForTag exactly, or the same tag renders two different ways on one
 * screen." The same is true one layer out. The heading above these rows is
 * the server's `alternativesHeading`, which runs a tag through that function
 * to produce "Cheaper apples"; a badge under it rendering the SAME tag as
 * "Apples" in one case and "Dried Fruits" in another would be two spellings of
 * one category on one sheet. So: lower-cased FIRST (the prefix regex only
 * recognises a lower-case prefix), any two-letter language prefix stripped,
 * hyphens to spaces, and only the first letter capitalised, never every word.
 *
 * NO FRENCH, AND IT IS A KNOWN LIMIT RATHER THAN AN OVERSIGHT. The catalogue
 * stores one taxonomy id per category and it is the English one; there is no
 * French label in the row to reach for. Rendering the humanised English id in
 * both locales is the honest version of that -- it is what we actually have --
 * and inventing a French category name on the client would be the app making
 * up a fact about the catalogue. When the catalogue carries a translated
 * label, this function grows a locale argument and nothing else moves.
 *
 * Returns '' for anything that humanises to nothing ("en:", "-", whitespace),
 * which is what makes the caller fall back to the untagged label instead of
 * printing a dangling colon.
 */
function humaniseTag(tag) {
  if (typeof tag !== 'string') return '';
  const label = tag.trim().toLowerCase().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

/**
 * What a catalogue answer at capture says the barcode is (R-36): `{ label, query }`,
 * or null when it cannot say (not in the catalogue, a refusal, a limit). An
 * identity that arrives with no name THROWS: the alternative is a caption of
 * digits or "undefined" passed off as the item.
 */
function captureNameFrom(id, code) {
  if (!id || typeof id !== 'object' || id.failure || id.scanLimit) return null;
  if (id.kind === 'catalogue') {
    if (!id.identity) return null;
    const { brand, name, size } = id.identity;
    if (cleanName(name) === '') throw new Error(`the catalogue answered barcode ${code} with an item that has no name`);
    return { label: candidateRow({ brand, name, size }).label, query: cleanName(name) };
  }
  if (id.product) {
    if (displayName(id.product) === '') throw new Error(`the server answered barcode ${code} with a product that has no name`);
    return { label: productLabel(id.product), query: cleanName(displayName(id.product)) };
  }
  return null;
}

/**
 * Whether typed text names one of the catalogue's own items closely enough to
 * proceed. Matched against the catalogue endpoint (OLMA audit row 88: brand
 * and model give the closest match), never against the pricing engine, so a
 * miss costs nothing and never spends a request the way `/api/price` would.
 */
function matchCatalogue(text, catalogueItems) {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const it of catalogueItems) {
    const label = it.label.toLowerCase();
    const score = words.filter((w) => label.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  // Needs to hit at least as many significant words as it would take to be a
  // repair rather than a coincidence. One shared word ("the", already
  // filtered, or a brand alone) is not a match; brand and model together is.
  return bestScore >= Math.min(2, words.length) ? best : null;
}

/**
 * Case- and accent-insensitive equality, so "Häagen-Dazs" (the catalogue's
 * clean `brands` field) and "HAAGEN-DAZS" (a scraped retailer title's own
 * casing of the same word) compare equal. `String.includes`/`startsWith`
 * alone do not: they compare code points, and an accented letter is a
 * different code point from its bare form.
 */
function normalizeForCompare(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Brand, name and size, without repeating the brand when the name already
 * leads with it.
 *
 * D-014: a catalogue row's `name` is sometimes the scraped retailer page
 * title verbatim, which already opens with the brand in its own casing --
 * "HAAGEN-DAZS Extraz Strawberry Cheesecake Ice Cream, 450 ml" against a
 * clean `brands` field of "Häagen-Dazs". A plain case-insensitive substring
 * check treated those as two different strings, because of the accent, and
 * prepended the clean brand onto a name that already carried it: "Häagen-Dazs
 * HAAGEN-DAZS Extraz Strawberry Cheesecake Ice Cream, 450 ml". Comparing
 * through `normalizeForCompare` on both sides fixes that: when the name
 * (accent- and case-folded) starts with the brand, the brand is not said
 * twice. When it does not, the catalogue's brand is the only source of that
 * fact and leads the label -- this is "catalogue brand + name + size when the
 * catalogue row is joined"; a caller with no `product` (no catalogue row) has
 * nothing to pass here and falls back to whatever raw text it has instead.
 */
/**
 * The product's own name, in the language the shopper is reading.
 *
 * `nameFr` is a REAL FRENCH NAME off the catalogue row, not a translation of
 * `name`: catalogue/src/schema.ts keeps `name_en` and `name_fr` as separate
 * columns because whoever published the row wrote both, and what is on the bag
 * in a Quebec aisle is not what a translator would produce from the English.
 * So French prefers it and falls back to `name`, which is what most rows have
 * and what every row has.
 *
 * English never reads `nameFr`, even when `name` is missing: showing a French
 * product name to an English reader because the English column happened to be
 * empty is a worse answer than the row's own `name`, and `name` is never null.
 */
function displayName(p) {
  const fr = (p.nameFr ?? '').trim();
  if (locale() === 'fr' && fr) return fr;
  return (p.name ?? '').trim();
}

function productLabel(p) {
  const parts = [];
  const brand = (p.brands ?? '').split(',')[0].trim();
  const name = displayName(p);
  const brandLeadsName = brand !== '' && normalizeForCompare(name).startsWith(normalizeForCompare(brand));
  if (brand && !brandLeadsName) parts.push(brand);
  parts.push(name);
  if (p.quantity && !normalizeForCompare(name).includes(normalizeForCompare(String(p.quantity)))) {
    parts.push(p.quantity);
  }
  return parts.join(' ');
}

/**
 * One row for a candidate list: a title (name + size) and a meta line (the
 * brand, or the category when the brand had to move into the title instead).
 *
 * The photo route's vision-model candidates and the typed route's "not
 * this?" candidates used to build a row each in its own way and disagreed:
 * the photo list said "Kraft Kraft Dinner 4080 g" with a second "KRAFT"
 * underneath it, brand in both the title and the meta. This is the one place
 * either list decides what a row says, so they cannot diverge again. The
 * dedupe rule is `productLabel`'s own (accent- and case-insensitive, name
 * leads): when the name already opens with the brand, the title is just name
 * and size and the brand moves down to the meta line, said once. When it does
 * not, the row has nowhere else to put the brand and still name the product,
 * so the brand leads the title instead, and the meta line falls back to the
 * category (or nothing) rather than repeating the brand that is now in the
 * title already.
 */
/**
 * The product-type line for a catalogue candidate, in the reader's language
 * (D38). The leaf is often a French Open Food Facts tag; an English reader gets
 * the nearest English ancestor on the row's own path, or no line at all, never
 * French words (and never the raw "en:..." tag). A French reader keeps the leaf.
 */
function categoryLineOf(c) {
  const leaf = c?.leafCategory ?? null;
  const path = Array.isArray(c?.categoryPath) ? c.categoryPath : [];
  const english = (tag) => typeof tag === 'string' && /^en:/i.test(tag);
  if (locale() === 'fr') return humaniseTag(leaf ?? path[path.length - 1]);
  if (english(leaf)) return humaniseTag(leaf);
  const up = [...path].reverse().find(english);
  return up ? humaniseTag(up) : '';
}

function candidateRow({ brand, name, size, category } = {}) {
  const b = cleanName(brand);
  const n = cleanName(name);
  // N09: a size the name already carries is not written a second time.
  const s = size && !nameCarriesSize(n, size) ? cleanName(size) : '';
  const brandLeadsName = b !== '' && normalizeForCompare(n).startsWith(normalizeForCompare(b));
  const title = brandLeadsName ? [n, s] : [b, n, s];
  return {
    label: title.filter(Boolean).join(' '),
    meta: brandLeadsName ? b : cleanName(category ?? ''), // D-268 B16: raw "FILLED BISCUITS" category tags
  };
}

/**
 * What an answer is called on its sheet: the matched item's name (`ownMatch`), else the identity the answer carries
 * (produce by PLU answers with `identity.name`, "Bananas", and no ownMatch), else what the shopper typed.
 */
function answerName(answer, typedText = '') {
  const m = answer?.ownMatch ?? answer?.identity ?? null;
  return m && cleanName(m.name) ? candidateRow({ brand: m.brand, name: m.name, size: m.size }).label : typedText;
}

export { normalizeForCompare, displayName, productLabel, categoryLineOf, candidateRow, answerName, matchCatalogue, captureNameFrom, humaniseTag };
