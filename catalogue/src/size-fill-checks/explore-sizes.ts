/**
 * Read-only exploration for unit 7 (Fill the missing sizes). Not the filler
 * itself -- just gathers evidence on how well units.ts's parseQuantity, used
 * as-is, covers the quantity column and product names, so the real filler is
 * built from measurement rather than a guess.
 */
import { openCatalogueReadOnly } from '../schema.ts';
import { parseQuantity, toComparison } from '../units.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const db = openCatalogueReadOnly(DB_PATH);
db.exec('PRAGMA busy_timeout = 120000');

const FOOD_WHERE = "sold_in_canada = 1 AND source = 'openfoodfacts'";

const total = (db.prepare(`SELECT count(*) AS n FROM product WHERE ${FOOD_WHERE}`).get() as { n: number }).n;
const noSize = (db.prepare(`SELECT count(*) AS n FROM product WHERE ${FOOD_WHERE} AND size_value IS NULL`).get() as { n: number }).n;
console.log(`food&drink total: ${total}, no-size: ${noSize}`);

const rows = db
  .prepare(
    `SELECT code, name, name_en, name_fr, quantity FROM product
     WHERE ${FOOD_WHERE} AND size_value IS NULL`,
  )
  .all() as { code: string; name: string; name_en: string | null; name_fr: string | null; quantity: string | null }[];

console.log(`no-size rows fetched: ${rows.length}`);

let quantityPresent = 0;
let quantityParsedFirstMatch = 0; // parseQuantity as-is (first regex match only)
let quantityParsedAnyValidMatch = 0; // scanning all matches for first VALID unit

function scanAllMatches(text: string): { value: number; unit: string } | null {
  const t = text.trim().toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const re = /(?:(\d+)\s*[x*]\s*)?(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|[a-z]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const pack = m[1] ? Number(m[1]) : null;
    const each = Number(m[2]);
    const unit = m[3];
    const comp = toComparison(each, unit);
    if (comp && Number.isFinite(each) && each > 0) {
      return { value: pack ? pack * each : each, unit };
    }
  }
  return null;
}

for (const r of rows) {
  if (r.quantity && r.quantity.trim() !== '') {
    quantityPresent++;
    const first = parseQuantity(r.quantity);
    if (first && toComparison(first.value, first.unit)) quantityParsedFirstMatch++;
    const any = scanAllMatches(r.quantity);
    if (any) quantityParsedAnyValidMatch++;
  }
}

console.log(`rows with non-empty quantity text: ${quantityPresent}`);
console.log(`  parseQuantity (first match) succeeds: ${quantityParsedFirstMatch}`);
console.log(`  scan-all-matches (first VALID unit) succeeds: ${quantityParsedAnyValidMatch}`);

// Name extraction: how often does parseQuantity (first match) vs scan-all
// find a size in the display name, and how often is it anchored at the end?
let nameFirstMatch = 0;
let nameAnyValidMatch = 0;
let nameAnyValidAtEnd = 0;
const sampleAtEnd: string[] = [];
const sampleNotAtEnd: string[] = [];

function findEndAnchoredMatch(text: string): { value: number; unit: string; matchedText: string } | null {
  const t = text.trim();
  const lower = t.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const re = /(?:(\d+)\s*[x*]\s*)?(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|[a-z]+)\b/g;
  const matches: { start: number; end: number; pack: number | null; each: number; unit: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower))) {
    const pack = m[1] ? Number(m[1]) : null;
    const each = Number(m[2]);
    const unit = m[3];
    if (toComparison(each, unit)) {
      matches.push({ start: m.index, end: m.index + m[0].length, pack, each, unit });
    }
  }
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  // "at the end": nothing but closing punctuation/whitespace after the match.
  const tail = lower.slice(last.end);
  const atEnd = /^[\s).,;:!]*$/.test(tail);
  return {
    value: last.pack ? last.pack * last.each : last.each,
    unit: last.unit,
    matchedText: t.slice(last.start, last.end) + (atEnd ? ' [END]' : ' [MID]'),
  };
}

for (const r of rows) {
  const display = r.name_en || r.name_fr || r.name;
  if (!display) continue;
  const first = parseQuantity(display);
  if (first && toComparison(first.value, first.unit)) nameFirstMatch++;
  const found = findEndAnchoredMatch(display);
  if (found) {
    nameAnyValidMatch++;
    if (found.matchedText.endsWith('[END]')) {
      nameAnyValidAtEnd++;
      if (sampleAtEnd.length < 10) sampleAtEnd.push(`${display}  =>  ${found.matchedText}`);
    } else if (sampleNotAtEnd.length < 10) {
      sampleNotAtEnd.push(`${display}  =>  ${found.matchedText}`);
    }
  }
}

console.log(`\nname extraction over ${rows.length} no-size rows:`);
console.log(`  parseQuantity (first match) succeeds: ${nameFirstMatch}`);
console.log(`  scan-all-matches (last valid) succeeds: ${nameAnyValidMatch}`);
console.log(`  of which anchored at end of name: ${nameAnyValidAtEnd}`);
console.log(`\nsample END-anchored:`);
sampleAtEnd.forEach((s) => console.log('  ' + s));
console.log(`\nsample NOT end-anchored (would be excluded):`);
sampleNotAtEnd.forEach((s) => console.log('  ' + s));

db.close();
