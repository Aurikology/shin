/**
 * ONE unit conversion. Beta-gaps item 20.
 *
 * Jamin, 2026-09-17: "items should not be matched based on quantity and should be
 * converted to the units of comparison used in this app. However, the original
 * units should alos be stored."
 *
 * Shin's comparison units are per 100 g, per 100 ml, and each. Anything else is
 * converted into one of those, and the ORIGINAL value and unit ride along in
 * every result so the caller can store both.
 *
 * WHY THIS FILE EXISTS. `catalogue/src/alternatives.ts` used to compute
 * `(cents / size) * 100` for every unit and require the two sizes to carry the
 * SAME unit string. A 2 kg pack priced against a 500 g pack was therefore not
 * comparable at all, and a lone 2 kg row priced "per 100 g" came out a thousand
 * times too high. `price/src/verdict.ts` (`UNIT_SCALE`, D-061) had the arithmetic
 * right for kg and l. Two copies of a conversion is how they disagreed, so the
 * conversion is here once and both read it. `test/units.test.ts` proves this
 * table gives the verdict's own numbers for every unit the verdict knows.
 *
 * DELIBERATE DIFFERENCE FROM THE VERDICT'S TABLE: an unrecognised unit returns
 * null here, where the verdict's `unitOf` treats it as grams. Treating an unknown
 * "oz" or "stk" as grams is a silent wrong number; null makes the caller fall
 * back to the ticket price and say so. Anything the verdict knows, this knows.
 *
 * NO CURRENCY IN THIS FILE, AND NO CONVERSION OF ONE. A unit price is cents per
 * comparison unit in whatever currency the price was in (item 19).
 *
 * Imperial units are US customary (fl oz, gal, qt, pt). UK fluid measures differ
 * by about 4 percent; a UK shelf that prints imperial fluid ounces is not
 * covered, and the caller gets a normal answer that is that much off. It is
 * named here so the gap is not a surprise (reverses if a UK market is served).
 */

export type UnitFamily = 'mass' | 'volume' | 'count';
export type BaseUnit = 'g' | 'ml' | 'ea';
export type ComparisonLabel = '100 g' | '100 ml' | 'each';

interface UnitDef {
  readonly family: UnitFamily;
  /** How many base units one of this unit is. */
  readonly factor: number;
}

/** Keyed by the normalised spelling (see `normUnit`). */
const UNITS: Readonly<Record<string, UnitDef>> = {
  // mass, base g
  mg: { family: 'mass', factor: 0.001 },
  g: { family: 'mass', factor: 1 },
  gr: { family: 'mass', factor: 1 },
  gram: { family: 'mass', factor: 1 },
  grams: { family: 'mass', factor: 1 },
  gramme: { family: 'mass', factor: 1 },
  grammes: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  kilo: { family: 'mass', factor: 1000 },
  kilos: { family: 'mass', factor: 1000 },
  kilogram: { family: 'mass', factor: 1000 },
  kilograms: { family: 'mass', factor: 1000 },
  oz: { family: 'mass', factor: 28.349523125 },
  ounce: { family: 'mass', factor: 28.349523125 },
  ounces: { family: 'mass', factor: 28.349523125 },
  lb: { family: 'mass', factor: 453.59237 },
  lbs: { family: 'mass', factor: 453.59237 },
  pound: { family: 'mass', factor: 453.59237 },
  pounds: { family: 'mass', factor: 453.59237 },
  // volume, base ml
  ml: { family: 'volume', factor: 1 },
  milliliter: { family: 'volume', factor: 1 },
  milliliters: { family: 'volume', factor: 1 },
  millilitre: { family: 'volume', factor: 1 },
  millilitres: { family: 'volume', factor: 1 },
  cl: { family: 'volume', factor: 10 },
  dl: { family: 'volume', factor: 100 },
  l: { family: 'volume', factor: 1000 },
  lt: { family: 'volume', factor: 1000 },
  liter: { family: 'volume', factor: 1000 },
  liters: { family: 'volume', factor: 1000 },
  litre: { family: 'volume', factor: 1000 },
  litres: { family: 'volume', factor: 1000 },
  'fl oz': { family: 'volume', factor: 29.5735295625 },
  floz: { family: 'volume', factor: 29.5735295625 },
  pt: { family: 'volume', factor: 473.176473 },
  pint: { family: 'volume', factor: 473.176473 },
  pints: { family: 'volume', factor: 473.176473 },
  qt: { family: 'volume', factor: 946.352946 },
  quart: { family: 'volume', factor: 946.352946 },
  quarts: { family: 'volume', factor: 946.352946 },
  gal: { family: 'volume', factor: 3785.411784 },
  gallon: { family: 'volume', factor: 3785.411784 },
  gallons: { family: 'volume', factor: 3785.411784 },
  // count, base ea
  ea: { family: 'count', factor: 1 },
  each: { family: 'count', factor: 1 },
  ct: { family: 'count', factor: 1 },
  count: { family: 'count', factor: 1 },
  pc: { family: 'count', factor: 1 },
  pcs: { family: 'count', factor: 1 },
  piece: { family: 'count', factor: 1 },
  pieces: { family: 'count', factor: 1 },
  unit: { family: 'count', factor: 1 },
  units: { family: 'count', factor: 1 },
};

const BASE_OF: Readonly<Record<UnitFamily, BaseUnit>> = { mass: 'g', volume: 'ml', count: 'ea' };
const LABEL_OF: Readonly<Record<UnitFamily, ComparisonLabel>> = {
  mass: '100 g',
  volume: '100 ml',
  count: 'each',
};

/** Lower case, dots and stray spaces removed: "Fl. Oz." and "fl oz" are one unit. */
function normUnit(unit: string): string {
  return unit.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

/** A size expressed in Shin's comparison units, with the original kept. */
export interface ComparisonQuantity {
  readonly family: UnitFamily;
  readonly baseUnit: BaseUnit;
  /** The size in the base unit: grams, millilitres or items. */
  readonly baseValue: number;
  /** The unit prices in this family are per this. */
  readonly label: ComparisonLabel;
  /** 100 for mass and volume, 1 for count. */
  readonly perQuantity: 100 | 1;
  /** Exactly what was given. Never overwritten by the conversion. */
  readonly original: { readonly value: number; readonly unit: string };
}

/**
 * A size in Shin's comparison unit, or null when the value or the unit cannot be
 * converted (zero, negative, not a number, or a unit this table does not know).
 * Null is "not comparable", never a guess.
 */
export function toComparison(value: number | null | undefined, unit: string | null | undefined): ComparisonQuantity | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  if (unit === null || unit === undefined) return null;
  const def = UNITS[normUnit(unit)];
  if (!def) return null;
  return {
    family: def.family,
    baseUnit: BASE_OF[def.family],
    baseValue: value * def.factor,
    label: LABEL_OF[def.family],
    perQuantity: def.family === 'count' ? 1 : 100,
    original: { value, unit },
  };
}

/** Two sizes can be compared on a unit price only when they are the same family. */
export function sameFamily(a: ComparisonQuantity | null, b: ComparisonQuantity | null): boolean {
  return a !== null && b !== null && a.family === b.family;
}

export interface UnitPrice {
  /** Cents per `label`. Can be fractional; a locale rounds at its own formatter. */
  readonly unitCents: number;
  readonly label: ComparisonLabel;
  readonly perQuantity: 100 | 1;
  readonly baseUnit: BaseUnit;
  /** The size the price was divided by, in the ORIGINAL units. */
  readonly original: { readonly value: number; readonly unit: string };
}

/**
 * The price per comparison unit. `amountCents` is in whatever currency the price
 * is in; nothing here knows or converts currencies.
 */
export function unitPriceCents(
  amountCents: number,
  value: number | null | undefined,
  unit: string | null | undefined,
): UnitPrice | null {
  const q = toComparison(value, unit);
  if (q === null || !Number.isFinite(amountCents)) return null;
  return {
    unitCents: (amountCents / q.baseValue) * q.perQuantity,
    label: q.label,
    perQuantity: q.perQuantity,
    baseUnit: q.baseUnit,
    original: q.original,
  };
}

/**
 * Reads a printed quantity such as "500 g", "1.5 L", "12 oz", "6 x 355 ml" or
 * "6 * 355ml". A multipack is multiplied out: the value returned is the total.
 * Null when nothing in the text is a recognised size. A comma decimal ("1,5 l")
 * is read as a decimal point, which is what every non-English shelf prints.
 */
export function parseQuantity(text: string | null | undefined): { value: number; unit: string; packCount: number | null } | null {
  if (!text) return null;
  const t = text.trim().toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const m = /(?:(\d+)\s*[x*]\s*)?(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|[a-z]+)\b/.exec(t);
  if (!m) return null;
  const pack = m[1] ? Number(m[1]) : null;
  const each = Number(m[2]);
  const unit = m[3];
  if (!Number.isFinite(each) || each <= 0 || UNITS[normUnit(unit)] === undefined) return null;
  return { value: pack ? pack * each : each, unit, packCount: pack };
}

/**
 * The conversion as SQL, so a query can rank rows on the converted size without
 * pulling them all into memory. Built from the table above, so SQL and
 * TypeScript cannot disagree. `unitCol` and `valueCol` are column references the
 * caller controls (never user input).
 */
export function sqlBaseValue(valueCol: string, unitCol: string): string {
  const whens = Object.entries(UNITS)
    .map(([k, d]) => `WHEN '${k}' THEN ${valueCol} * ${d.factor}`)
    .join(' ');
  return `(CASE lower(trim(${unitCol})) ${whens} END)`;
}

export function sqlFamily(unitCol: string): string {
  const whens = Object.entries(UNITS)
    .map(([k, d]) => `WHEN '${k}' THEN '${d.family}'`)
    .join(' ');
  return `(CASE lower(trim(${unitCol})) ${whens} END)`;
}
