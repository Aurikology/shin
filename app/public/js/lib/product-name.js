/**
 * A product's name as a shopper should read it (N09, 2026-10-07).
 *
 * The catalogue holds names the way a store feed wrote them: a branding prefix
 * ("WF • ᴄᴀ", a short tag, a bullet and a run of small capitals) in front of the
 * words, and a size written into the name that the size field then repeats
 * ("95 pack 95 pack"). Neither is part of what the product is called, so both
 * come off at the one place every label is built. Nothing is added or reworded,
 * so a name that is already clean comes back byte for byte.
 */

/* Small capitals and modifier letters used as decoration: U+1D00 to U+1D7F, U+A730 to U+A7FF, and the Latin small capitals in U+0299 and U+029F. */
const FANCY_LETTERS = /[ᴀ-ᵿꜰ-ꟿʙʟʀɪʏɢʜ]+/g;
/* A country flag drawn as two regional indicator letters, which some fonts show as "CA". */
const FLAG_EMOJI = /[\u{1F1E6}-\u{1F1FF}]{1,2}️?/gu;
/* A short tag, a bullet, then whatever the feed glued on: "WF • ", "PC • ". */
const TAG_PREFIX = /^\s*[A-Za-z]{1,4}\s*[•·●]\s*/;

function squash(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** One name with the feed's decoration taken off. */
export function cleanName(raw) {
  let s = String(raw ?? '');
  if (!s) return '';
  s = s.replace(TAG_PREFIX, '');
  s = s.replace(FLAG_EMOJI, '');
  s = s.replace(FANCY_LETTERS, '');
  s = s.replace(/\s*[•·●]\s*/g, ' ');
  s = s.replace(/\s{2,}/g, ' ').trim();
  // A quantity written twice in a row at the end: "95 pack 95 pack".
  return s.replace(/(\b\d+(?:[.,]\d+)?\s*[A-Za-z]+)\s+\1\s*$/i, '$1');
}

/**
 * Whether `name` already ends in (or carries) `size`, so the size is not
 * written twice. "Kleenex ... 95 pack" and size "95 pack" is a repeat.
 */
export function nameCarriesSize(name, size) {
  const a = ` ${squash(name)} `;
  const b = squash(size);
  return b !== '' && a.includes(` ${b} `);
}
