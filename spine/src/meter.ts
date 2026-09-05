/**
 * How many image searches are left, and what runs out when they do.
 * Decisions 43, 44, 45, 46, 47.
 *
 * WHAT COUNTS (decision 44). A search is charged only when it produced an
 * identification the user accepted. A blurry photo, a refusal, a wrong answer
 * they corrected, and a product the catalogue does not have are all free.
 * Charging for our own miss is the fastest route to a one star review, and it
 * also quietly inverts the incentive: a pipeline that charges for failures gets
 * paid more the worse it is.
 *
 * WHAT RUNS OUT (decision 45). Not the camera. Past the limit the photo is
 * still taken, the product is still named, and the cheaper alternatives are
 * still shown. The verdict is the part that is gated, because it is the part
 * that is worth paying for. They see we found it; they pay for the answer.
 *
 * WHEN THE UPGRADE IS OFFERED (decision 46). On the result, next to the thing
 * they cannot see. Never as a screen in front of the work. An interstitial
 * before the photo asks somebody to pay for a promise; an offer on the result
 * asks them to pay for something already sitting in front of them.
 *
 * The ledger is append only. A counter that can be decremented is a counter
 * that drifts, and the interesting questions (which searches counted, and why)
 * are unanswerable from a number.
 */

export type Plan = 'basic' | 'pro';

/** Decision 43. His design: three a week on the free tier. */
export const BASIC_IMAGE_SEARCHES = 3;
/** Decision 47. Rolling, not calendar. A Monday reset is a Sunday cliff. */
export const WINDOW_DAYS = 7;

/**
 * Why a search did or did not count. Stored, so the meter can always answer
 * "what did I spend them on" without anyone reconstructing it.
 */
export type Charge =
  /** Identified, and the user accepted it. The only outcome that costs one. */
  | 'accepted'
  /** Identified, and the user said it was wrong. Decision 44: free. */
  | 'corrected'
  /** We could not read the photo. Ours, so free. */
  | 'unreadable'
  /** Read fine, the catalogue does not have it. Free. */
  | 'not_in_catalogue'
  /** A barcode. Decision 43: never metered, it costs us nothing. */
  | 'barcode';

const COUNTS: ReadonlySet<Charge> = new Set<Charge>(['accepted']);

export interface Entry {
  readonly at: string;
  readonly charge: Charge;
  /** What was identified, for the ledger to be readable by a person. */
  readonly label: string | null;
}

export interface MeterState {
  readonly plan: Plan;
  readonly entries: readonly Entry[];
}

export interface MeterView {
  readonly plan: Plan;
  readonly used: number;
  readonly allowance: number;
  readonly remaining: number;
  /** Decision 45: false only for the verdict, never for identity. */
  readonly verdictAvailable: boolean;
  /**
   * Decision 47: null at full. A meter shown when nothing has been spent is a
   * standing advertisement for a limit the user has not met.
   */
  readonly line: string | null;
  /** When the oldest counted search falls out of the window. */
  readonly nextFreeAt: string | null;
}

function withinWindow(entries: readonly Entry[], now: Date): Entry[] {
  const cutoff = now.getTime() - WINDOW_DAYS * 86_400_000;
  return entries.filter((e) => {
    const t = Date.parse(e.at);
    return Number.isFinite(t) && t > cutoff;
  });
}

export function charge(state: MeterState, charge: Charge, label: string | null, now = new Date()): MeterState {
  return { ...state, entries: [...state.entries, { at: now.toISOString(), charge, label }] };
}

export function view(state: MeterState, now = new Date()): MeterView {
  if (state.plan === 'pro') {
    return {
      plan: 'pro',
      used: 0,
      allowance: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      verdictAvailable: true,
      line: null,
      nextFreeAt: null,
    };
  }

  const counted = withinWindow(state.entries, now).filter((e) => COUNTS.has(e.charge));
  const used = counted.length;
  const remaining = Math.max(0, BASIC_IMAGE_SEARCHES - used);

  const oldest = counted
    .map((e) => Date.parse(e.at))
    .sort((a, b) => a - b)[0];
  const nextFreeAt =
    remaining === 0 && oldest !== undefined
      ? new Date(oldest + WINDOW_DAYS * 86_400_000).toISOString()
      : null;

  return {
    plan: 'basic',
    used,
    allowance: BASIC_IMAGE_SEARCHES,
    remaining,
    verdictAvailable: remaining > 0,
    // Decision 47: silent at full.
    line:
      used === 0
        ? null
        : remaining > 0
          ? `${remaining} photo search${remaining === 1 ? '' : 'es'} left this week`
          : 'No photo searches left this week',
    nextFreeAt,
  };
}

/**
 * The offer, shaped by decision 46: it exists only on a result, and only when
 * something is actually being withheld. Returns null the rest of the time so no
 * screen has anywhere to put a nag.
 */
export function upgradeOffer(v: MeterView, hasIdentity: boolean): string | null {
  if (v.plan === 'pro' || v.verdictAvailable) return null;
  if (!hasIdentity) return null;
  return 'We found it and we have the prices. Unlock the price check.';
}

/**
 * Decision 45 spelled out for the result screen so nobody has to infer it from
 * a boolean: what is still free when the meter is empty.
 */
export function gatedParts(v: MeterView): { identity: boolean; alternatives: boolean; verdict: boolean } {
  return { identity: false, alternatives: false, verdict: !v.verdictAvailable };
}
