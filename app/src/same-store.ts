/**
 * One store, two sources: marking Shin's own price for a store Gemini also
 * quoted.
 *
 * A barcode scan's answer carries Gemini's offers and, after them, Shin's own
 * recorded prices for the same barcode (RULINGS.md, "A scanned barcode answers
 * with Shin's own prices too"). Nothing checked the two lists against each
 * other, so one store could appear twice with no word about why. Both rows are
 * real observations from different sources, taken at different times, so
 * NEITHER is dropped and neither is merged into the other. The own row is
 * marked instead, and the client says one factual line about it.
 *
 * Pure: no I/O, no clock, nothing read from settings, and the input arrays are
 * never mutated. The own offers come back in the same order and the same
 * number; a matched one is a copy with `sameStoreAsGemini: true` added, and an
 * unmatched one is the very object that was passed in, so a response with no
 * match is byte-identical to the one before this file existed.
 */

/** The field an own offer carries when a Gemini offer names the same store. */
export const SAME_STORE_FIELD = 'sameStoreAsGemini';

/**
 * A store name reduced to what two sources would agree on.
 *
 * Lowercase; accents folded (a French and an English listing of the same shop
 * differ there most often); apostrophes removed outright, so "Loblaw's" and
 * "Loblaws" meet; every other run of punctuation turned into a space, so
 * "Walmart.ca" becomes two words; whitespace collapsed and trimmed; and one or
 * more trailing words "canada" or "ca" dropped, so "Costco Canada",
 * "costco.ca" and "Costco" are one store. A name that is ONLY such a word
 * keeps it rather than becoming empty. An empty key never matches anything.
 */
export function storeKey(name: unknown): string {
  if (typeof name !== 'string') return '';
  const folded = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stripped = folded.replace(/(?:\s+(?:canada|ca))+$/, '').trim();
  return stripped === '' ? folded : stripped;
}

/**
 * Shin's own offers, each marked when a Gemini offer's retailer is the same
 * store by `storeKey`. Never removes, reorders or rewrites an offer.
 */
export function markSameStore<T extends Record<string, unknown>>(
  geminiOffers: readonly { readonly retailer?: unknown }[] | null | undefined,
  ownOffers: readonly T[],
): (T & { readonly sameStoreAsGemini?: true })[] {
  const gemini = new Set<string>();
  for (const offer of geminiOffers ?? []) {
    const key = storeKey(offer?.retailer);
    if (key !== '') gemini.add(key);
  }
  return ownOffers.map((own) => {
    const key = storeKey(own.retailer);
    return key !== '' && gemini.has(key) ? { ...own, [SAME_STORE_FIELD]: true } : own;
  });
}
