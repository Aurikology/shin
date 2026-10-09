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

/**
 * The name line the answer sheet and the lists print (UX evidence R-48, R-49, R-50).
 *
 * Brand first, size last, each once. The brand is prepended only when the name does not already
 * start with it (case aside), and never as a logo or a separate row; the size is appended only
 * when the name does not already carry it. A name that is already complete comes back unchanged.
 * No name is a bug in what was fed in, so it throws instead of printing a blank headline.
 */
export function nameLine({ brand, name, size } = {}) {
  const base = typeof name === 'string' ? cleanName(name) : '';
  if (base === '') throw new TypeError('nameLine: a name is required, the headline cannot be blank');
  let out = base;
  const b = typeof brand === 'string' ? brand.trim() : '';
  if (b !== '' && !squash(out).startsWith(squash(b))) out = `${b} ${out}`;
  const s = typeof size === 'string' ? size.trim() : '';
  if (s !== '' && !nameCarriesSize(out, s)) out = `${out} ${s}`;
  return out;
}

/**
 * A long name cut in the middle so the start (the brand) and the end (the size) both survive.
 *
 * The end is the last one or two words, whichever fits half the room; the start takes the rest and
 * stops at a word boundary. A budget too small to keep both ends throws: a three-character name is
 * not a name, and a silent ellipsis would hide that.
 */
export function middleEllipsis(text, maxChars) {
  if (typeof text !== 'string') throw new TypeError('middleEllipsis: text must be a string');
  if (!Number.isInteger(maxChars) || maxChars < 5) {
    throw new RangeError(`middleEllipsis: ${maxChars} characters cannot keep a start, an ellipsis and an end`);
  }
  if (text.length <= maxChars) return text;
  const room = maxChars - 1;
  const half = Math.floor(room / 2);
  const words = text.trim().split(/\s+/);
  let tail = words.slice(-2).join(' ');
  if (tail.length > half || words.length < 2) tail = words[words.length - 1];
  if (tail.length > half) tail = tail.slice(-half);
  let head = text.slice(0, room - tail.length);
  const cut = head.lastIndexOf(' ');
  if (text[head.length] !== ' ' && cut > 0) head = head.slice(0, cut);
  return `${head.trimEnd()}…${tail}`;
}
