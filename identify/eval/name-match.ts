/**
 * DID GEMINI NAME THE RIGHT PRODUCT? An inexact matcher that says so out loud.
 *
 * WHY THIS EXISTS. The old eval (`identify/eval/run.ts`) scored a catalogue
 * CODE: a string either equalled the expected GTIN or it did not, and the
 * measurement carried no error of its own. The scan path Gemini now owns
 * (`identify/src/providers/gemini-scan.ts`, one call per scan) returns a
 * NAME -- "Kraft Dinner Original Macaroni & Cheese, 225 g" against a manifest
 * row that says brand "Kraft", name "Macaroni & Cheese", size "225 g". No
 * string comparison settles that, so the scorer is now a piece of software
 * with an error rate, and it has to admit it.
 *
 * THE DESIGN, in one line: three signals -- brand agreement, expected-name
 * token coverage, size agreement -- combined by fixed thresholds into RIGHT,
 * WRONG or UNCERTAIN. Nothing is forced into right/wrong. `uncertain` is a
 * first-class answer and the rows in it are a hand-review list, which is a
 * deliverable, not a failure.
 *
 * ============================ WHAT IT GETS WRONG ==========================
 * Read this before quoting any accuracy number this matcher produced.
 *
 *  1. FALSE WRONG on store brands. The manifest writes some retailer brands as
 *     "Compliments • Sobeys"; Gemini is likely to say "Sobeys" or "Compliments"
 *     alone, and a house brand is often reported as the retailer's own name.
 *     Multi-brand expected strings are split on the bullet and any part may
 *     match, which covers that case but not "Great Value" <-> "Walmart".
 *     DIRECTION: understates accuracy on the 18 `store-brand` rows.
 *
 *  2. FALSE RIGHT on generic short names. 17 identify rows have fewer than two
 *     substantive expected tokens ("Almond", "Chips", "Cheezies", "Nesquik").
 *     A single token is covered or not, so coverage is 0.0 or 1.0 with nothing
 *     between, and a long Gemini name will contain the token almost by
 *     accident. Mitigated: when the expected name is that short, a verdict of
 *     RIGHT requires brand agreement, and without it the row goes UNCERTAIN.
 *     DIRECTION: still overstates accuracy where the brand also agrees.
 *
 *  3. FALSE WRONG on language. The photos are Canadian bilingual packaging.
 *     Gemini answering in French ("Céréales au son") against an English
 *     manifest name collapses coverage to near zero. Accents are folded, words
 *     are not translated. DIRECTION: understates accuracy, unmeasured amount.
 *
 *  4. SIZE: ounces are ambiguous. "12 oz" is a weight to this parser; fluid
 *     ounces are a volume. Cross-dimension comparisons (g against mL) are
 *     therefore called `unknown` rather than `disagree`, which lets a genuine
 *     size error through. DIRECTION: overstates accuracy on the 54 `size-pair`
 *     rows, which are the rows the set exists to discriminate.
 *
 *  5. SIZE: a disagreeing size is scored WRONG, not UNCERTAIN, and that is a
 *     deliberate call. The `size-pair` rows are in the set precisely to catch
 *     "right product, wrong jar", and abstaining there would forfeit the
 *     measurement the rows were chosen for. It costs accuracy wherever Gemini
 *     reported the case size and the shelf item was the single.
 *
 *  6. IT NEVER SEES THE PHOTO. A confidently named different product from the
 *     same brand at the same size reads RIGHT. No text matcher can catch that;
 *     only a human looking at the photo can, which is the other reason the
 *     uncertain list is reviewed by hand.
 *
 *  7. The thresholds below (0.60 / 0.80 / 0.30) were chosen by reading the
 *     manifest, NOT fitted to any measured outcome, because no live run has
 *     ever happened. They are a starting point to be re-tuned against the
 *     first hand-reviewed run, and any number derived from them inherits that.
 * ==========================================================================
 */

/* ------------------------------------------------------------ thresholds */

/** Every threshold in one place, so a report can print the rule it applied. */
export const MATCH_THRESHOLDS = {
  /** Expected-token coverage needed for RIGHT when the brand agrees. */
  coverageWithBrand: 0.6,
  /** Coverage needed for RIGHT when the brand could not be checked either way. */
  coverageWithoutBrand: 0.8,
  /** Below this, the row is WRONG however the other signals fell. */
  coverageFloor: 0.3,
  /** Expected names with fewer than this many substantive tokens are too thin to score alone. */
  thinNameTokens: 2,
  /** Relative tolerance when comparing two sizes in the same dimension. */
  sizeTolerance: 0.02,
} as const;

/* ---------------------------------------------------------- normalisation */

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'with', 'in']);

/** Lower-cases, strips accents, turns `&` into `and`, drops punctuation. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trailing plural `s` folded away so "chips" and "chip" are one token. */
function stem(token: string): string {
  return token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token;
}

/** The tokens a name is judged on: folded, stemmed, stopwords and 1-character noise removed. */
export function tokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const raw of fold(text).split(' ')) {
    if (raw === '' || raw.length < 2) continue;
    if (STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

/** Tokens that carry discriminative weight: not pure numbers or unit words. */
const UNIT_WORDS = new Set(['g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'ct', 'pk', 'pack', 'count', 'x']);
export function substantiveTokens(text: string | null | undefined): string[] {
  return tokens(text).filter((t) => !/^[0-9.]+$/.test(t) && !UNIT_WORDS.has(t));
}

/* --------------------------------------------------------------- signals */

export type Agreement = 'agree' | 'disagree' | 'unknown';

/**
 * Brand agreement. The expected side may name two brands ("Compliments • Sobeys",
 * a house brand and its retailer); either one matching is agreement. When
 * Gemini gave no brand field, the brand is looked for inside its product name,
 * because `labelOf` folds the brand into the label when the name already
 * contains it. Absence on either side is `unknown`, never `disagree`: a model
 * that simply did not state a brand has not contradicted anything.
 */
export function brandAgreement(expected: string | null | undefined, gotBrand: string | null | undefined, gotName: string | null | undefined): Agreement {
  const wanted = (expected ?? '')
    .split(/[•|/]|,| or /i)
    .map((p) => fold(p))
    .filter((p) => p !== '');
  if (wanted.length === 0) return 'unknown';

  const got = fold(gotBrand ?? '');
  const inName = fold(gotName ?? '');

  const hit = (candidate: string, hay: string): boolean => {
    if (hay === '') return false;
    if (hay === candidate) return true;
    const hayTokens = new Set(tokens(hay));
    const wantTokens = tokens(candidate);
    if (wantTokens.length === 0) return false;
    const covered = wantTokens.filter((t) => hayTokens.has(t)).length;
    return covered / wantTokens.length >= 0.5;
  };

  if (wanted.some((w) => hit(w, got))) return 'agree';
  if (got === '' && wanted.some((w) => hit(w, inName))) return 'agree';
  if (got === '') return 'unknown';
  return 'disagree';
}

/**
 * Share of the expected name's tokens that appear in Gemini's name. Coverage,
 * not Jaccard: Gemini returns longer, fuller names than the manifest's short
 * ones, and penalising the extra words would punish a better answer. The
 * brand is allowed to satisfy a token, because "Kraft Dinner" names the brand
 * inside the product name.
 */
export function coverage(expectedName: string | null | undefined, gotName: string | null | undefined, gotBrand?: string | null): number {
  const want = tokens(expectedName);
  if (want.length === 0) return 0;
  const have = new Set([...tokens(gotName), ...tokens(gotBrand)]);
  let hit = 0;
  for (const t of want) if (have.has(t)) hit += 1;
  return hit / want.length;
}

/** Jaccard over the same token sets. Reported alongside coverage as the "is Gemini talking about something else entirely" signal. */
export function jaccard(expectedName: string | null | undefined, gotName: string | null | undefined): number {
  const a = new Set(tokens(expectedName));
  const b = new Set(tokens(gotName));
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/* ------------------------------------------------------------------ size */

export type SizeDimension = 'mass' | 'volume' | 'count';

export interface ParsedSize {
  /** Total, pack count already multiplied in. */
  readonly total: number;
  readonly dimension: SizeDimension;
  /** The pack multiplier that was found ("12 x 355 mL" -> 12), 1 when there was none. */
  readonly pack: number;
}

const MASS: Record<string, number> = { g: 1, gr: 1, gram: 1, grams: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592, lbs: 453.592 };
const VOLUME: Record<string, number> = { ml: 1, millilitre: 1, l: 1000, litre: 1000, liter: 1000, cl: 10 };
const COUNT = new Set(['ct', 'count', 'pk', 'pack', 'each', 'ea', 'unit', 'units', 'piece', 'pieces']);

/**
 * "750 mL", "12 x 355 mL", "1.5 kg", "24 ct" -> a comparable total.
 * Returns null when nothing parseable is there, and null is never an error:
 * 41 manifest rows carry no size at all.
 */
export function parseSize(text: string | null | undefined): ParsedSize | null {
  if (!text) return null;
  const s = fold(text).replace(/\bx\b/g, ' x ');
  const packMatch = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*([a-z]+)/.exec(s);
  if (packMatch) {
    const pack = Number(packMatch[1]);
    const each = Number(packMatch[2]);
    const unit = packMatch[3];
    const dim = MASS[unit] ? 'mass' : VOLUME[unit] ? 'volume' : COUNT.has(unit) ? 'count' : null;
    if (dim && Number.isFinite(pack) && Number.isFinite(each)) {
      const factor = dim === 'mass' ? MASS[unit] : dim === 'volume' ? VOLUME[unit] : 1;
      return { total: pack * each * factor, dimension: dim, pack };
    }
  }
  const one = /(\d+(?:\.\d+)?)\s*([a-z]+)/.exec(s);
  if (!one) return null;
  const value = Number(one[1]);
  const unit = one[2];
  if (!Number.isFinite(value)) return null;
  if (MASS[unit] !== undefined) return { total: value * MASS[unit], dimension: 'mass', pack: 1 };
  if (VOLUME[unit] !== undefined) return { total: value * VOLUME[unit], dimension: 'volume', pack: 1 };
  if (COUNT.has(unit)) return { total: value, dimension: 'count', pack: 1 };
  return null;
}

/**
 * Size agreement. Unparseable on either side, or two different dimensions, is
 * `unknown` -- see error mode 4: "12 oz" may be weight or fluid volume and
 * this parser cannot tell, so calling a cross-dimension pair a disagreement
 * would manufacture failures out of its own ignorance.
 */
export function sizeAgreement(expected: string | null | undefined, got: string | null | undefined): Agreement {
  const a = parseSize(expected);
  const b = parseSize(got);
  if (!a || !b) return 'unknown';
  if (a.dimension !== b.dimension) return 'unknown';
  const tol = Math.max(a.total, b.total) * MATCH_THRESHOLDS.sizeTolerance;
  return Math.abs(a.total - b.total) <= tol ? 'agree' : 'disagree';
}

/* ------------------------------------------------------------- the verdict */

export type MatchVerdict = 'right' | 'wrong' | 'uncertain';

export interface Expected {
  readonly brand: string | null;
  readonly name: string | null;
  readonly size: string | null;
}

export interface Got {
  readonly brand: string | null;
  readonly name: string | null;
  readonly size: string | null;
}

export interface NameMatch {
  readonly verdict: MatchVerdict;
  readonly brand: Agreement;
  readonly size: Agreement;
  readonly coverage: number;
  readonly jaccard: number;
  /** True when the expected name was too thin to carry a verdict on its own (error mode 2). */
  readonly thinExpectedName: boolean;
  /** Every rule that fired, in the order it fired, so a verdict can be argued with. */
  readonly reasons: readonly string[];
}

/**
 * The rule, stated once so the report can print it:
 *
 *   no answer at all                              -> wrong   (no_label)
 *   brand disagrees                               -> wrong   (brand_mismatch)
 *   coverage < 0.30                               -> wrong   (coverage_floor)
 *   size disagrees                                -> wrong   (size_mismatch)   [error mode 5]
 *   thin expected name and brand not agreeing     -> uncertain
 *   brand agrees and coverage >= 0.60             -> right
 *   brand unknown and coverage >= 0.80            -> right
 *   anything else                                 -> uncertain
 */
export function matchName(expected: Expected, got: Got | null): NameMatch {
  const reasons: string[] = [];
  const thin = substantiveTokens(expected.name).length < MATCH_THRESHOLDS.thinNameTokens;

  if (got === null || (!got.name && !got.brand)) {
    return { verdict: 'wrong', brand: 'unknown', size: 'unknown', coverage: 0, jaccard: 0, thinExpectedName: thin, reasons: ['no_label'] };
  }

  const brand = brandAgreement(expected.brand, got.brand, got.name);
  const size = sizeAgreement(expected.size, got.size);
  const cov = coverage(expected.name, got.name, got.brand);
  const jac = jaccard(expected.name, got.name);
  const base = { brand, size, coverage: cov, jaccard: jac, thinExpectedName: thin } as const;

  if (brand === 'disagree') {
    reasons.push('brand_mismatch');
    return { ...base, verdict: 'wrong', reasons };
  }
  if (cov < MATCH_THRESHOLDS.coverageFloor) {
    reasons.push('coverage_floor');
    return { ...base, verdict: 'wrong', reasons };
  }
  if (size === 'disagree') {
    reasons.push('size_mismatch');
    return { ...base, verdict: 'wrong', reasons };
  }
  if (thin && brand !== 'agree') {
    reasons.push('thin_expected_name');
    return { ...base, verdict: 'uncertain', reasons };
  }
  if (brand === 'agree' && cov >= MATCH_THRESHOLDS.coverageWithBrand) {
    reasons.push('brand_and_coverage');
    return { ...base, verdict: 'right', reasons };
  }
  if (brand === 'unknown' && cov >= MATCH_THRESHOLDS.coverageWithoutBrand) {
    reasons.push('coverage_only');
    return { ...base, verdict: 'right', reasons };
  }
  reasons.push('below_threshold');
  return { ...base, verdict: 'uncertain', reasons };
}
