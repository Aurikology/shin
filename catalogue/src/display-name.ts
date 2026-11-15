/**
 * The name a shopper reads for a catalogue row (D-261).
 *
 * Rows carry names the way their source wrote them: shop-listing titles in
 * capitals ("PINOT GRIS - VILLA MARIA PRIVATE BIN MARLBOROUGH"), a bare
 * "Deodorant" with the brand in another column, crowd entries ending in a full
 * stop or a flag emoji. Joining brand and name naively said a word twice
 * ("Lynx Deodorant Deodorant 150ml"), the shape D-014 fixed once on the screen.
 *
 * This builds ONE line, brand first and size last, each said once, and is
 * called from the one place a row becomes a Candidate (search.ts
 * rowToCandidate), so search results and barcode lookups read the same. It
 * never invents: a brand or size the row does not carry is not added, and
 * words are never reworded, only re-cased when the source shouted them. The
 * source's own text stays on the Candidate as `rawName`.
 */

/** A country flag drawn as two regional indicator letters, with an optional emoji selector. */
const FLAG_EMOJI = /[\u{1F1E6}-\u{1F1FF}]{2}\u{FE0F}?/gu;
/** Punctuation a title can end or start on without meaning anything. Keeps ! ? ) % and quotes. */
const TRAILING = /[\s.,;:\-–—_/|•·*]+$/u;
const LEADING = /^[\s.,;:\-–—_/|•·*]+/u;
/** A doubled word this long is a feed's mistake; shorter ones are real names ("Mahi Mahi", "Bora Bora"). */
const LONG_REPEAT = 5;

const UNITS =
  'kg|mg|g|gr|grams?|kilograms?|ml|millilit(?:re|er)s?|cl|dl|l|lt|lit(?:re|er)s?|oz|fl\\.? ?oz|lbs?|pounds?|' +
  'ct|count|pk|packs?|pcs?|pieces?|un|units?|ea|each|rolls?|sheets?|tablets?|capsules?|pods?|bags?|cans?|bottles?';
const SIZE_IN_TEXT = new RegExp(`(?:^|[^\\p{L}\\p{N}])\\d+(?:[.,]\\d+)?\\s*(?:${UNITS})(?![\\p{L}])`, 'iu');

/** Accents off, lower case, punctuation as spaces: how two strings are compared, never shown. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function words(s: string): string[] {
  const f = fold(s);
  return f === '' ? [] : f.split(' ');
}

/** Whether `inner` occurs in `outer` as whole words, in order. */
function containsWords(outer: readonly string[], inner: readonly string[]): boolean {
  if (inner.length === 0 || inner.length > outer.length) return false;
  for (let i = 0; i + inner.length <= outer.length; i += 1) {
    if (inner.every((w, k) => outer[i + k] === w)) return true;
  }
  return false;
}

/**
 * Title case for a string the source shouted end to end. A string is shouted
 * when none of its words of three letters or more (digits aside) has a lower
 * case letter. Kept as written even then: words of one or two letters (PC, KD,
 * T&T, ML), words with a digit (1KG, 7UP), words with no vowel (BBQ). Mixed
 * casing ("OREO Cookies", "iPhone") is deliberate and left alone.
 */
function unshout(s: string): string {
  const long = s.match(/[\p{L}\p{N}'’]+/gu)?.filter((w) => w.length >= 3 && !/\p{N}/u.test(w)) ?? [];
  if (long.length === 0 || long.some((w) => /\p{Ll}/u.test(w))) return s;
  return s.replace(/[\p{L}\p{N}'’]+/gu, (w) => {
    if (w.length <= 2 || /\p{N}/u.test(w) || !/[AEIOUYÀ-ÖØ-Ý]/u.test(w)) return w;
    return w[0] + w.slice(1).toLowerCase();
  });
}

/** A long word said twice in a row ("Deodorant Deodorant") said once. */
function collapseRepeats(s: string): string {
  const parts = s.split(/(\s+)/);
  const out: string[] = [];
  let lastWord = '';
  for (const p of parts) {
    if (/^\s+$/.test(p) || p === '') { out.push(p); continue; }
    const f = fold(p);
    if (f !== '' && f === lastWord && f.length >= LONG_REPEAT) {
      if (out.length > 0 && /^\s+$/.test(out[out.length - 1]!)) out.pop();
      continue;
    }
    out.push(p);
    lastWord = f;
  }
  return out.join('');
}

/** One source string tidied for reading: flag emoji, edge punctuation, shouting and doubled words removed. */
export function cleanSourceText(raw: string | null | undefined): string {
  let s = String(raw ?? '').replace(FLAG_EMOJI, ' ').replace(/\s+/g, ' ');
  s = s.replace(TRAILING, '').replace(LEADING, '');
  return collapseRepeats(unshout(s)).trim();
}

/** Whether the text already states a size: a number followed by a unit, or the quantity text itself. */
function carriesSize(text: string, size: string): boolean {
  if (SIZE_IN_TEXT.test(text)) return true;
  const q = fold(size).replace(/ /g, '');
  return q !== '' && fold(text).replace(/ /g, '').includes(q);
}

function formatSize(value: number, unit: string): string {
  const v = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return `${v} ${unit}`;
}

export interface NameParts {
  readonly name: string;
  readonly brands: string | null;
  readonly quantity: string | null;
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
}

/**
 * Brand, name and size as one line, each once.
 *
 * The brand leads unless the name already holds one of the row's brands (a
 * comma list counts any of them). Where the brand ends on the words the name
 * starts with ("Lynx Deodorant" + "Deodorant"), the overlap is said once; a
 * name wholly inside the brand reads as the brand. The size goes last, from the
 * quantity text, else from the stored value and unit, unless the line already
 * states a size.
 */
export function shopperName(row: NameParts): string {
  let line = cleanSourceText(row.name) || String(row.name ?? '').trim();
  const brands = String(row.brands ?? '')
    .split(',')
    .map((b) => cleanSourceText(b))
    .filter((b) => b !== '');
  const nameWords = words(line);
  if (brands.length > 0 && !brands.some((b) => containsWords(nameWords, words(b)))) {
    const brand = brands[0]!;
    const brandWords = words(brand);
    if (containsWords(brandWords, nameWords)) {
      line = brand;
    } else {
      // The longest run of the brand's last words that the name starts with.
      let overlap = 0;
      for (let k = Math.min(brandWords.length, nameWords.length); k > 0; k -= 1) {
        if (brandWords.slice(-k).every((w, i) => nameWords[i] === w)) { overlap = k; break; }
      }
      const rest = overlap === 0 ? line : dropLeadingWords(line, overlap);
      line = rest === '' ? brand : `${brand} ${rest}`;
    }
  }
  const quantity = cleanSourceText(row.quantity);
  const size =
    quantity !== ''
      ? quantity
      : typeof row.sizeValue === 'number' && Number.isFinite(row.sizeValue) && row.sizeValue > 0 && row.sizeUnit
        ? formatSize(row.sizeValue, row.sizeUnit)
        : '';
  if (size !== '' && !carriesSize(line, size)) line = `${line} ${size}`;
  return line;
}

/** The catalogue columns a Candidate's names are built from. */
export interface NameColumns {
  readonly name: string;
  readonly name_en: string | null;
  readonly name_fr: string | null;
  readonly brands: string | null;
  readonly quantity: string | null;
  readonly size_value: number | null;
  readonly size_unit: string | null;
}

/**
 * A row's names for a Candidate. `name` is the full shopper line. `nameEn` and
 * `nameFr` are tidied (cleanSourceText) but get no brand or size added,
 * because the two readers that use them already add those themselves
 * (app catalogue-first `labelOf` appends the size unconditionally, the screen's
 * `candidateRow` prepends the brand), and adding them here would say them twice.
 */
export function shopperNames(row: NameColumns): { name: string; rawName: string; nameEn: string | null; nameFr: string | null } {
  const tidy = (s: string | null): string | null => (s === null ? null : cleanSourceText(s) || s);
  return {
    name: shopperName({ name: row.name, brands: row.brands, quantity: row.quantity, sizeValue: row.size_value, sizeUnit: row.size_unit }),
    rawName: row.name,
    nameEn: tidy(row.name_en),
    nameFr: tidy(row.name_fr),
  };
}

/** `text` without its first `n` words, keeping the rest exactly as written. */
function dropLeadingWords(text: string, n: number): string {
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null = null;
  for (let i = 0; i < n; i += 1) {
    m = re.exec(text);
    if (!m) return '';
  }
  return m ? text.slice(m.index + m[0].length).replace(LEADING, '') : text;
}

/** A shopper-facing name past this many characters is read as an advert and shortened (adShortName). */
export const AD_NAME_LIMIT = 40;

/** Where an advert-style title turns from the product into its sales copy. */
const AD_BREAK = /\s*[,;(]\s*|\s+(?:with|filled|stuffed|containing|made|pack of|pk of|case of|box of|for)\s+/i;

const SIZE_GLOBAL = new RegExp(SIZE_IN_TEXT.source, 'giu');

/** Each word the source shouted (three letters or more, a vowel) in title case; mixed casing is left alone. */
function unshoutWords(s: string): string {
  return s.replace(/[\p{L}'’]+/gu, (w) =>
    w.length >= 3 && w === w.toUpperCase() && /[AEIOUYÀ-ÖØ-Ý]/u.test(w) ? w[0] + w.slice(1).toLowerCase() : w,
  );
}

/**
 * The name a shopper reads when the catalogue's name is an advert ("Nutella BISCUITS, Golden Cookies Filled
 * with Rich Hazelnut Spread, Pack of 20 Cookies 276g" for a 276 g box of biscuits): brand, product, size.
 *
 * DISPLAY ONLY. Matching and pricing keep reading the catalogue's own name; this is applied where a name is
 * shown. A name of AD_NAME_LIMIT characters or fewer comes back exactly as given, and so does a long one with
 * nothing to cut at (or whose first clause is itself still long): a name is never guessed at.
 *
 * The product is the first clause up to the first comma, bracket or sales word ("with", "filled", "pack of"),
 * with any size taken off and shouted words put in title case. The brand leads unless the clause carries it; a
 * first clause that is only the brand takes the next one. The size is the row's own `size`, else the one the
 * name states, and is written last unless the clause already says it.
 */
export function adShortName(name: string, brand: string | null, size: string | null): string {
  const full = String(name ?? '').trim();
  if (full.length <= AD_NAME_LIMIT) return full;
  const clauses = full.split(AD_BREAK).map((c) => c.trim()).filter((c) => c !== '');
  if (clauses.length < 2) return full;
  const brandText = cleanSourceText((brand ?? '').split(',')[0]);
  const brandWords = words(brandText);
  const productOf = (c: string) => c.replace(SIZE_GLOBAL, ' ').replace(/\s+/g, ' ').trim();
  let product = productOf(clauses[0]!);
  if (brandWords.length > 0 && words(product).join(' ') === brandWords.join(' ') && clauses[1]) {
    product = `${product} ${productOf(clauses[1])}`.trim();
  }
  product = unshoutWords(product);
  if (product === '' || product.length > AD_NAME_LIMIT) return full;
  let line = product;
  if (brandWords.length > 0 && !containsWords(words(line), brandWords)) line = `${brandText} ${line}`;
  const stated = full.match(SIZE_IN_TEXT);
  const sizeText = (size ?? '').trim() || (stated ? stated[0].replace(/^[^\p{L}\p{N}]+/u, '') : '');
  if (sizeText !== '' && !carriesSize(line, sizeText)) line = `${line} ${sizeText}`;
  return line.length < full.length ? line : full;
}
