/**
 * Alternatives: two modes and an extensible set of constraints. Beta-gaps item 18.
 *
 * Jamin, 2026-09-17: "There needs to be constraints in place for things like
 * buying things in massive bulk as that would natrually be massively cheaper.
 * There also needs to be constraints on what should be offered as an
 * alternative. If the user is buying from a supermarket, they natrually will not
 * accept matches like farm products. If they are buying something new, a used
 * ebay item should not be part of the price good or bad calculation. ... There
 * are two scenarios here: 1.(a user is seeking validation for if an item is a
 * good price, in this case, a farm product comparison might be useful towards
 * them, or even a used item on ebay might provide them with validation that a
 * product is not a good price) 2. (a user is seeking alternatives and genuinely
 * considering buying something or traveling to another store to get a cheaper
 * alternative, in this case, they would definitly not accept a farm alternative
 * if they are buying in a supermarket ...). Its also important to consider that
 * someone buying from a farm might consider buying from a supermarket)"
 * and: "when i state a problem and give examples, don't assume those examples are
 * the only aspects of the problem, they are just one of many."
 *
 * THE TWO MODES ARE DISTINCT, not a strictness dial:
 *  - 'validation': the user asks "is this a good price?". Evidence from a farm or
 *    a used listing is USEFUL, so it is kept and LABELLED, and a used price is
 *    never part of the good/bad arithmetic for someone buying new.
 *  - 'switching': the user is really considering buying the alternative or
 *    travelling for it. Anything they would not accept is EXCLUDED.
 *
 * THE CONSTRAINT SET IS OPEN. A constraint is a value in a registry; adding one
 * is `registerConstraint(...)`, and no other code changes. The first three are
 * Jamin's (`origin: 'jamin'`). The next four are SUGGESTED, reasoned from his
 * notes, and are labelled `origin: 'suggested'` so he can strike any of them:
 *   travel      "traveling to another store to get a cheaper alternative"
 *   membership  the warehouse-club case that "massive bulk" points at
 *   dietary     his organic example generalised: a hard attribute the user
 *               needs is never swapped away
 *   upgrade     "buy the new model for 200 dollars more" is an alternative that
 *               costs MORE, which is not evidence about the price of the old one
 *
 * UNKNOWN IS NEVER A VIOLATION. A constraint that cannot tell (the store type or
 * the condition was not given) allows the alternative. Rule 6 of the Gemini
 * rules: an answer with a mark beats no answer. The mark here is a label.
 *
 * WHERE THE ANSWER COMES FROM. Rule 3 of the beta gaps: alternatives are asked of
 * Gemini in the ONE scan call (`Shin_Gemini_Pricing_Engine/
 * alternatives_prompt_fragment.md`). This file is the catalogue-side shape:
 * the mode and constraint model, a tolerant parser for what Gemini returns, and
 * the fallback to the catalogue's own list (alternatives.ts) when Gemini gave
 * nothing usable. It never calls a model and never throws.
 */

import { samePriceBasis, type Market } from './market.ts';
import { isDirectFromProducer, type ProductKind, type StoreType, normalizeStoreType } from './product-kind.ts';
import type { ComparisonQuantity } from './units.ts';
import { toComparison } from './units.ts';

export type AlternativeMode = 'validation' | 'switching';

export type ItemCondition = 'new' | 'used' | 'refurbished' | 'unknown';

/**
 * How an alternative relates to the thing scanned.
 *  same_product      the same product at another seller
 *  substitute        another product of the same kind (non-organic for organic)
 *  used_copy         the same or an equivalent product, used
 *  newer_model       an upgrade, usually costing more
 *  other             anything else Gemini reports
 */
export type AlternativeKind = 'same_product' | 'substitute' | 'used_copy' | 'newer_model' | 'other';

/** The facts about one side of a comparison that constraints read. Every field may be unknown. */
export interface AlternativeSubject {
  readonly kind: ProductKind | null;
  readonly condition: ItemCondition;
  readonly storeType: StoreType;
  /** The pack size in Shin's comparison units, with the original kept. */
  readonly size: ComparisonQuantity | null;
  readonly membershipRequired: boolean | null;
  readonly distanceKm: number | null;
  /** Attributes it is known to satisfy: 'vegan', 'gluten-free', 'organic'. Lower case. */
  readonly attributes: readonly string[] | null;
  readonly relation: AlternativeKind | null;
}

export const UNKNOWN_SUBJECT: AlternativeSubject = {
  kind: null,
  condition: 'unknown',
  storeType: 'unknown',
  size: null,
  membershipRequired: null,
  distanceKm: null,
  attributes: null,
  relation: null,
};

/** What the user has told Shin that constraints may lean on. All optional. */
export interface UserConstraintPrefs {
  /** From the onboarding "Deal Alert Radius" or a setting. */
  readonly maxTravelKm?: number | null;
  readonly hasMembership?: boolean | null;
  /** Attributes the user needs, lower case. */
  readonly requiredAttributes?: readonly string[] | null;
}

export interface ConstraintContext {
  readonly mode: AlternativeMode;
  readonly original: AlternativeSubject;
  readonly candidate: AlternativeSubject;
  readonly user: UserConstraintPrefs;
}

export type ConstraintEffect =
  | { readonly effect: 'allow' }
  /** Not offered. Only ever returned in the mode where the user would not accept it. */
  | { readonly effect: 'exclude'; readonly code: string }
  /**
   * Kept, and shown with a mark. `evidenceOnly` means it may inform "is this a
   * good price" but must never enter the good/bad arithmetic (a used listing
   * against a new purchase).
   */
  | { readonly effect: 'label'; readonly code: string; readonly evidenceOnly?: boolean };

export interface Constraint {
  readonly id: string;
  /** 'jamin' is his own words; 'suggested' is reasoned from the notes and open to strike. */
  readonly origin: 'jamin' | 'suggested';
  /** One line for the prompt fragment and for anyone reading the registry. */
  readonly describes: string;
  readonly evaluate: (ctx: ConstraintContext) => ConstraintEffect;
}

const ALLOW: ConstraintEffect = { effect: 'allow' };

/** Pack sizes this far apart (either way) are a bulk-versus-ordinary comparison. */
const BULK_RATIO = 5;

const registry = new Map<string, Constraint>();

/** Adds or replaces a constraint. The set is open: this is the extension point. */
export function registerConstraint(c: Constraint): void {
  registry.set(c.id, c);
}

export function constraints(): readonly Constraint[] {
  return [...registry.values()];
}

// ── Jamin's three ────────────────────────────────────────────────────────────

registerConstraint({
  id: 'bulk',
  origin: 'jamin',
  describes:
    'A pack far larger than the one scanned is cheaper per unit by nature. Switching: not offered. Validation: kept and marked as a bulk comparison.',
  evaluate: ({ mode, original, candidate }) => {
    const a = original.size;
    const b = candidate.size;
    if (a === null || b === null || a.family !== b.family) return ALLOW;
    const ratio = b.baseValue / a.baseValue;
    let code: string | null = null;
    if (ratio >= BULK_RATIO) code = 'bulk_pack';
    else if (ratio <= 1 / BULK_RATIO) code = 'original_is_bulk';
    if (code === null) return ALLOW;
    return mode === 'switching' ? { effect: 'exclude', code } : { effect: 'label', code };
  },
});

registerConstraint({
  id: 'channel',
  origin: 'jamin',
  describes:
    'Farm versus store. A supermarket shopper will not take a farm alternative when switching, but a farm price is useful evidence when validating. A farm buyer may take a supermarket option.',
  evaluate: ({ mode, original, candidate }) => {
    const fromProducer = isDirectFromProducer(candidate.storeType);
    if (!fromProducer) return ALLOW;
    if (isDirectFromProducer(original.storeType)) return ALLOW;
    if (original.storeType === 'unknown') return ALLOW;
    return mode === 'switching'
      ? { effect: 'exclude', code: 'farm_for_store_shopper' }
      : { effect: 'label', code: 'farm_price_is_evidence' };
  },
});

registerConstraint({
  id: 'condition',
  origin: 'jamin',
  describes:
    'Used versus new. Someone buying new will not take a used item when switching, and a used price never enters the good/bad arithmetic; when validating it is kept as evidence only.',
  evaluate: ({ mode, original, candidate }) => {
    const candidateUsed = candidate.condition === 'used' || candidate.condition === 'refurbished';
    if (!candidateUsed || original.condition !== 'new') return ALLOW;
    return mode === 'switching'
      ? { effect: 'exclude', code: 'used_for_new_buyer' }
      : { effect: 'label', code: 'used_price_is_evidence_only', evidenceOnly: true };
  },
});

// ── Suggested, reasoned from his notes, open to strike ───────────────────────

registerConstraint({
  id: 'travel',
  origin: 'suggested',
  describes:
    'Switching means going there. An alternative farther than the user is willing to travel is not offered when switching.',
  evaluate: ({ mode, candidate, user }) => {
    if (mode !== 'switching') return ALLOW;
    const max = user.maxTravelKm;
    if (max === null || max === undefined || candidate.distanceKm === null) return ALLOW;
    return candidate.distanceKm > max ? { effect: 'exclude', code: 'too_far' } : ALLOW;
  },
});

registerConstraint({
  id: 'membership',
  origin: 'suggested',
  describes:
    'A price that needs a paid membership is not a price every shopper can pay. Switching: not offered unless the user has one. Validation: kept and marked.',
  evaluate: ({ mode, candidate, user }) => {
    if (candidate.membershipRequired !== true) return ALLOW;
    if (user.hasMembership === true) return ALLOW;
    return mode === 'switching'
      ? { effect: 'exclude', code: 'membership_needed' }
      : { effect: 'label', code: 'membership_needed' };
  },
});

registerConstraint({
  id: 'attributes',
  origin: 'suggested',
  describes:
    'An attribute the user needs (vegan, gluten-free, organic when they said so) is never swapped away. A candidate known to lack one is not offered when switching; one that is not known to have it is marked.',
  evaluate: ({ mode, candidate, user }) => {
    const required = (user.requiredAttributes ?? []).map((s) => s.toLowerCase());
    if (required.length === 0 || mode !== 'switching') return ALLOW;
    if (candidate.attributes === null) return { effect: 'label', code: 'attributes_unverified' };
    const have = new Set(candidate.attributes.map((s) => s.toLowerCase()));
    return required.every((r) => have.has(r)) ? ALLOW : { effect: 'exclude', code: 'missing_required_attribute' };
  },
});

registerConstraint({
  id: 'upgrade',
  origin: 'suggested',
  describes:
    'A newer model that costs more is an upgrade, not evidence about this price. Validation: not offered. Switching: kept and marked as an upgrade.',
  evaluate: ({ mode, candidate }) => {
    if (candidate.relation !== 'newer_model') return ALLOW;
    return mode === 'validation'
      ? { effect: 'exclude', code: 'upgrade_not_evidence' }
      : { effect: 'label', code: 'upgrade_costs_more' };
  },
});

// ── Evaluation ───────────────────────────────────────────────────────────────

export interface ConstraintLabel {
  readonly constraint: string;
  readonly origin: 'jamin' | 'suggested';
  readonly code: string;
  readonly evidenceOnly: boolean;
}

export interface ConstraintResult {
  readonly allowed: boolean;
  readonly labels: readonly ConstraintLabel[];
  /** Why it was excluded. Empty when allowed. */
  readonly excludedBy: readonly { readonly constraint: string; readonly origin: 'jamin' | 'suggested'; readonly code: string }[];
  /** True when any label says the price may inform but never enter the arithmetic. */
  readonly evidenceOnly: boolean;
}

/**
 * Runs every registered constraint (or the ones named) over one candidate. Never
 * throws: a constraint that throws is skipped and reported as an unverified label,
 * because a broken rule must never crash the system (Jamin, rule 2).
 */
export function evaluateConstraints(ctx: ConstraintContext, only?: readonly string[]): ConstraintResult {
  const labels: ConstraintLabel[] = [];
  const excludedBy: { constraint: string; origin: 'jamin' | 'suggested'; code: string }[] = [];
  for (const c of registry.values()) {
    if (only && !only.includes(c.id)) continue;
    let out: ConstraintEffect;
    try {
      out = c.evaluate(ctx);
    } catch {
      labels.push({ constraint: c.id, origin: c.origin, code: 'constraint_failed', evidenceOnly: false });
      continue;
    }
    if (out.effect === 'exclude') excludedBy.push({ constraint: c.id, origin: c.origin, code: out.code });
    else if (out.effect === 'label') {
      labels.push({ constraint: c.id, origin: c.origin, code: out.code, evidenceOnly: out.evidenceOnly === true });
    }
  }
  return {
    allowed: excludedBy.length === 0,
    labels,
    excludedBy,
    evidenceOnly: labels.some((l) => l.evidenceOnly),
  };
}

// ── The shape Gemini returns, and a parser that never throws ─────────────────

/** One alternative, as Gemini reports it. Prices are the seller's own numbers in the seller's currency. */
export interface AlternativeOffer {
  readonly name: string;
  readonly brand: string | null;
  readonly kind: AlternativeKind;
  readonly storeName: string | null;
  readonly storeType: StoreType;
  readonly condition: ItemCondition;
  readonly priceCents: number;
  /** ISO 4217. Always the currency the price was quoted in; never converted. */
  readonly currency: string | null;
  /** The pack size as printed, with the original kept. Null when Gemini gave none. */
  readonly size: ComparisonQuantity | null;
  readonly membershipRequired: boolean | null;
  readonly distanceKm: number | null;
  readonly attributes: readonly string[] | null;
  readonly url: string | null;
  /** Gemini's own unit-price figure if it gave one. Shin never computes a displayed one. */
  readonly unitPriceCents: number | null;
  readonly source: 'gemini' | 'catalogue';
}

export interface ParsedAlternatives {
  readonly offers: readonly AlternativeOffer[];
  /** One entry per row that could not be used, so a bad answer is counted, never silent. */
  readonly dropped: readonly { readonly index: number; readonly reason: string }[];
}

const KINDS: ReadonlySet<string> = new Set(['same_product', 'substitute', 'used_copy', 'newer_model', 'other']);
const CONDITIONS: ReadonlySet<string> = new Set(['new', 'used', 'refurbished']);

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
function num(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

/**
 * Reads the `alternatives` array of Gemini's answer. Repairs what can be
 * repaired (a price given as a string, a missing kind), drops what cannot (no
 * name, no price), and drops a price quoted in a currency other than the user's
 * market's: Shin never converts, so a foreign-currency row is not comparable and
 * is reported as dropped, not shown converted. Never throws, whatever it is given.
 */
export function parseAlternativesAnswer(raw: unknown, market: Market): ParsedAlternatives {
  const offers: AlternativeOffer[] = [];
  const dropped: { index: number; reason: string }[] = [];
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === 'object' && Array.isArray((raw as { alternatives?: unknown }).alternatives)
      ? ((raw as { alternatives: unknown[] }).alternatives)
      : [];
  list.forEach((row, index) => {
    try {
      if (row === null || typeof row !== 'object') return void dropped.push({ index, reason: 'not an object' });
      // The prompt fragment asks for snake_case, as the rest of the response schema
      // is; camelCase is accepted too, so a model that drifts between the two is
      // read, not dropped.
      const r: Record<string, unknown> = { ...(row as Record<string, unknown>) };
      for (const [snake, camel] of [
        ['price_cents', 'priceCents'], ['store_name', 'storeName'], ['store_type', 'storeType'],
        ['membership_required', 'membershipRequired'], ['distance_km', 'distanceKm'],
        ['unit_price_cents', 'unitPriceCents'],
      ] as const) {
        if (r[camel] === undefined && r[snake] !== undefined) r[camel] = r[snake];
      }
      const name = str(r.name);
      if (name === null) return void dropped.push({ index, reason: 'no name' });
      // Cents preferred; a price in currency units is read as major units when only that came.
      const cents = num(r.priceCents) ?? (num(r.price) === null ? null : Math.round(num(r.price)! * 100));
      if (cents === null || cents <= 0) return void dropped.push({ index, reason: 'no usable price' });
      const currency = str(r.currency)?.toUpperCase() ?? null;
      if (market.currency !== null && currency !== null && !samePriceBasis(currency, market.currency)) {
        return void dropped.push({ index, reason: `priced in ${currency}, not ${market.currency}; never converted` });
      }
      const sz = r.size as { value?: unknown; unit?: unknown } | null | undefined;
      const kind = str(r.kind);
      const cond = str(r.condition)?.toLowerCase() ?? '';
      offers.push({
        name,
        brand: str(r.brand),
        kind: kind !== null && KINDS.has(kind) ? (kind as AlternativeKind) : 'other',
        storeName: str(r.storeName),
        storeType: normalizeStoreType(str(r.storeType) ?? str(r.storeName)),
        condition: CONDITIONS.has(cond) ? (cond as ItemCondition) : 'unknown',
        priceCents: cents,
        currency,
        size: sz ? toComparison(num(sz.value), str(sz.unit)) : null,
        membershipRequired: bool(r.membershipRequired),
        distanceKm: num(r.distanceKm),
        attributes: Array.isArray(r.attributes)
          ? (r.attributes.filter((a): a is string => typeof a === 'string').map((a) => a.toLowerCase()))
          : null,
        url: str(r.url),
        unitPriceCents: num(r.unitPriceCents),
        source: 'gemini',
      });
    } catch {
      dropped.push({ index, reason: 'unreadable row' });
    }
  });
  return { offers, dropped };
}

function subjectOfOffer(o: AlternativeOffer): AlternativeSubject {
  return {
    kind: null,
    condition: o.condition,
    storeType: o.storeType,
    size: o.size,
    membershipRequired: o.membershipRequired,
    distanceKm: o.distanceKm,
    attributes: o.attributes,
    relation: o.kind,
  };
}

export interface ConstrainedOffer {
  readonly offer: AlternativeOffer;
  readonly labels: readonly ConstraintLabel[];
  readonly evidenceOnly: boolean;
}

export interface AlternativesRequest {
  readonly mode: AlternativeMode;
  readonly original: AlternativeSubject;
  readonly market: Market;
  readonly user?: UserConstraintPrefs;
}

export interface AlternativesResolution {
  readonly mode: AlternativeMode;
  readonly source: 'gemini' | 'catalogue_fallback' | 'none';
  readonly offers: readonly ConstrainedOffer[];
  /** Offers the constraints removed, kept so the exclusion is visible to a reviewer. */
  readonly excluded: readonly { readonly offer: AlternativeOffer; readonly by: readonly { constraint: string; code: string }[] }[];
  readonly dropped: readonly { readonly index: number; readonly reason: string }[];
  /** True whenever the list did not come cleanly from Gemini. The app marks the answer, never blocks it. */
  readonly notFullyConfident: boolean;
}

export function applyConstraints(offers: readonly AlternativeOffer[], req: AlternativesRequest): {
  readonly offers: readonly ConstrainedOffer[];
  readonly excluded: AlternativesResolution['excluded'];
} {
  const kept: ConstrainedOffer[] = [];
  const excluded: { offer: AlternativeOffer; by: { constraint: string; code: string }[] }[] = [];
  for (const offer of offers) {
    const res = evaluateConstraints({
      mode: req.mode,
      original: req.original,
      candidate: subjectOfOffer(offer),
      user: req.user ?? {},
    });
    if (res.allowed) kept.push({ offer, labels: res.labels, evidenceOnly: res.evidenceOnly });
    else excluded.push({ offer, by: res.excludedBy.map((e) => ({ constraint: e.constraint, code: e.code })) });
  }
  return { offers: kept, excluded };
}

/**
 * The fallback path. Gemini's alternatives are the answer (rule 3). When Gemini
 * gave none, or every row was dropped or excluded, the catalogue's own list
 * (alternatives.ts, via `fallback`) is used instead, marked not-fully-confident,
 * with the same mode and constraints applied to it. A fallback that throws is an
 * empty list. Nothing here throws.
 */
export async function resolveAlternatives(
  geminiRaw: unknown,
  req: AlternativesRequest,
  fallback?: () => Promise<readonly AlternativeOffer[]>,
): Promise<AlternativesResolution> {
  const parsed = parseAlternativesAnswer(geminiRaw, req.market);
  const applied = applyConstraints(parsed.offers, req);
  if (applied.offers.length > 0) {
    return {
      mode: req.mode,
      source: 'gemini',
      offers: applied.offers,
      excluded: applied.excluded,
      dropped: parsed.dropped,
      notFullyConfident: parsed.dropped.length > 0,
    };
  }
  let fromCatalogue: readonly AlternativeOffer[] = [];
  try {
    fromCatalogue = fallback ? await fallback() : [];
  } catch {
    fromCatalogue = [];
  }
  const fb = applyConstraints(fromCatalogue, req);
  return {
    mode: req.mode,
    source: fb.offers.length > 0 ? 'catalogue_fallback' : 'none',
    offers: fb.offers,
    excluded: [...applied.excluded, ...fb.excluded],
    dropped: parsed.dropped,
    notFullyConfident: true,
  };
}
