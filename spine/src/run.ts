/**
 * One scan, from the shutter to the three things on screen.
 * Decisions 48, 49, 50, 51, 52, 53 and 54.
 *
 * THREE ARRIVALS, NOT ONE WAIT (decision 49). The name lands first, then the
 * price, then the cheaper options. The alternative is a single spinner held
 * until the slowest of three network calls returns, which makes a one second
 * answer feel like a four second one and a four second one feel broken.
 *
 * NAMED STEPS, NEVER A SPINNER (decision 50). Every step announces itself
 * before it runs. A named step that stalls tells the user something ("checking
 * prices" hanging means the shop is slow, and the name they already have is
 * still right); a spinner that stalls tells them nothing and the only available
 * reading is that the whole app is broken.
 *
 * EIGHT SECONDS AND THEN WHAT LANDED (decision 51). No external call may hold
 * the screen longer than that. Past the cap we show what arrived and name what
 * did not, which is a different screen from a failure and reads as one.
 *
 * OURS AND THE WORLD'S ARE DIFFERENT SENTENCES (decision 53). "The label was
 * too blurry" is ours and comes with a repair the user can perform. "Nobody
 * sells this in Canada" is the world's and comes with no instruction, because
 * there is nothing they did wrong and nothing they can do.
 *
 * Emitted as an async iterator rather than callbacks so the ordering is a
 * property of this file and not of whatever screen is consuming it.
 */

/** Decision 51. */
export const CALL_CAP_MS = 8_000;
/** Decision 48. Exceeding these is a defect, not a preference. */
/*
 * 2026-09-09: photo moved from 4,000 to 7,000. The photo path is now two vision
 * calls when the first cannot settle it (extract, then a pick from the
 * catalogue's own rows, docs/the-photo-path.md section 2), and the 4,000 figure
 * was one call against a 2 s p99 bar nobody had measured. It stays inside the
 * 8,000 cap on purpose: the cap is the promise to the screen, the budget is
 * the number the log judges a run against. Re-measured once a key exists.
 */
export const BUDGET_MS = { barcode: 1_000, photo: 7_000 } as const;

export type Step =
  | 'reading the barcode'
  | 'looking at the photo'
  | 'searching the catalogue'
  | 'checking prices'
  | 'finding cheaper options';

export type Fault = 'ours' | 'theirs' | 'world';

/**
 * Why a photo did not become an identity, added 2026-09-08.
 *
 * Restated here rather than imported: this file imports nothing on purpose
 * (see ScanPorts), and a shared type would be the first import. The list is
 * owned by identify/src/model.ts and this is a copy of it; the two are checked
 * against each other by the identify package's own tests, not by the compiler.
 *
 * It exists because `Refusal` is copy and copy is the wrong place for this.
 * The beta readiness audit found a rate limit, an outage and a dark photo all
 * arriving as the same sentence, which is right for the screen and wrong for
 * the log: an outage during a beta would have been indistinguishable from bad
 * photographs in the data. So the sentence stays shared and the class travels
 * beside it, as its own field on the event.
 */
export type FailureClass =
  | 'unreadable_photo'
  | 'model_timeout'
  | 'model_rate_limited'
  | 'model_outage'
  | 'model_malformed'
  | 'model_client_error'
  | 'spend_cap_reached';

export interface Refusal {
  /** Decision 52: the step that came up empty, named. */
  readonly step: Step;
  readonly fault: Fault;
  readonly says: string;
  /** Decision 52: exactly one repair, and only when there is one. */
  readonly repair: string | null;
}

export type ScanEvent =
  | { readonly type: 'step'; readonly step: Step }
  | { readonly type: 'identity'; readonly name: string; readonly confidence: unknown; readonly ms: number }
  | { readonly type: 'verdict'; readonly verdict: unknown; readonly ms: number }
  | { readonly type: 'alternatives'; readonly items: readonly unknown[]; readonly ms: number }
  | { readonly type: 'ring'; readonly label: string; readonly members: readonly unknown[] }
  | { readonly type: 'gated'; readonly part: 'verdict'; readonly offer: string }
  | { readonly type: 'refusal'; readonly refusal: Refusal; readonly failure?: FailureClass }
  /** Decision 51: the call did not come back in time, and the screen says so. */
  | { readonly type: 'timed_out'; readonly step: Step; readonly says: string; readonly failure?: FailureClass }
  | { readonly type: 'done'; readonly ms: number };

/**
 * Decision 53's table, written once.
 *
 * Kept as data rather than scattered strings so that the difference between a
 * failure of ours and a fact about the world stays visible to whoever edits it
 * next. Nothing here is red, and nothing here guesses. Decision 54.
 */
export const REFUSALS: Record<string, Refusal> = {
  blurry: {
    step: 'looking at the photo',
    fault: 'ours',
    says: 'That came out too soft to read the label.',
    repair: 'Hold still for a second and try again.',
  },
  no_text: {
    step: 'looking at the photo',
    fault: 'ours',
    says: 'We could not find any label in that photo.',
    repair: 'Point at the front of the package and fill more of the frame.',
  },
  model_down: {
    step: 'looking at the photo',
    fault: 'ours',
    says: 'Our side could not process that photo.',
    repair: 'Try once more.',
  },
  not_in_catalogue: {
    step: 'searching the catalogue',
    fault: 'world',
    says: 'We know what this is and it is not in our catalogue yet.',
    // Nothing they can do, so nothing is asked of them. Decision 52's "exactly
    // one" is a ceiling, not a quota.
    repair: null,
  },
  no_prices: {
    step: 'checking prices',
    fault: 'world',
    says: 'Nobody we read sells this right now, so there is no price to compare.',
    repair: null,
  },
  // REMOVED 2026-09-05: one_seller. A single seller is now answered rather than
  // declined, and the verdict carries a lower confidence with "one seller" named
  // as the reason. Keeping the refusal here as well meant the screen printed a
  // price judgement and then a sentence saying no judgement was possible.
  no_alternatives: {
    step: 'finding cheaper options',
    fault: 'world',
    says: 'Nothing comparable is cheaper right now.',
    repair: null,
  },
  offline: {
    step: 'checking prices',
    fault: 'theirs',
    says: 'You are offline, so we kept the photo.',
    repair: 'We will finish this as soon as you are back on.',
  },
};

/** Decision 51. Resolves to the sentinel instead of throwing, so the stream continues. */
const LATE = Symbol('late');

async function within<T>(p: Promise<T>, ms = CALL_CAP_MS): Promise<T | typeof LATE> {
  let timer: ReturnType<typeof setTimeout>;
  const capped = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => resolve(LATE), ms);
  });
  try {
    return await Promise.race([p, capped]);
  } finally {
    clearTimeout(timer!);
  }
}

/** What the run needs. Every one of these is injected, so this file has no imports. */
export interface ScanPorts {
  /** Null when no barcode was in frame. Decision 15: a barcode skips the model. */
  readonly gtin: string | null;
  identify(): Promise<
    | { kind: 'identified'; name: string; confidence: unknown; sizeValue: number | null; sizeUnit: string | null; shelfCents: number | null; key: string }
    | { kind: 'not_in_catalogue'; readAs: string; ring: { label: string; members: readonly unknown[] } | null }
    | {
        kind: 'unreadable';
        reason: 'blurry' | 'no_text' | 'model_down';
        /**
         * Added 2026-09-08 beside `reason`, not in place of it. `reason` picks
         * the sentence and there are three of those; this says what actually
         * happened and there are seven. Optional so a port written before this
         * date still satisfies the shape.
         */
        failure?: FailureClass;
      }
  >;
  prices(key: string): Promise<{ verdict: unknown; sellerCount: number } | null>;
  alternatives(key: string, shelfCents: number | null): Promise<readonly unknown[]>;
  /** Decision 45: false gates the verdict and nothing else. */
  verdictAvailable: boolean;
  upgradeOffer: string | null;
  now?: () => number;
  /**
   * The cap, overridable only so a test can assert the timeout path without
   * spending eight seconds doing it. Production never sets it: decision 51 is
   * eight seconds, and a caller who could shorten it could also lengthen it.
   */
  capMs?: number;
}

/**
 * The whole scan, in the order the screen should paint it.
 *
 * Identity is awaited because everything downstream is keyed on it. Price and
 * alternatives are started together the moment identity lands and yielded in
 * whichever order they arrive, because neither depends on the other and making
 * the cheaper options wait for a slow shop is a self-inflicted second of
 * silence.
 */
export async function* scan(ports: ScanPorts): AsyncGenerator<ScanEvent> {
  const clock = ports.now ?? (() => Date.now());
  const t0 = clock();

  yield { type: 'step', step: ports.gtin ? 'reading the barcode' : 'looking at the photo' };

  const cap = ports.capMs ?? CALL_CAP_MS;
  const id = await within(ports.identify(), cap);
  if (id === LATE) {
    yield {
      type: 'timed_out',
      step: 'looking at the photo',
      says: 'That is taking longer than it should.',
      failure: 'model_timeout',
    };
    yield { type: 'refusal', refusal: REFUSALS.model_down, failure: 'model_timeout' };
    yield { type: 'done', ms: clock() - t0 };
    return;
  }

  if (id.kind === 'unreadable') {
    // The sentence comes from `reason` and the class from `failure`. A port
    // that predates the field gets the nearest honest class from its reason
    // rather than nothing, so the log never has a blank where a scan failed.
    yield {
      type: 'refusal',
      refusal: REFUSALS[id.reason],
      failure: id.failure ?? (id.reason === 'model_down' ? 'model_outage' : 'unreadable_photo'),
    };
    yield { type: 'done', ms: clock() - t0 };
    return;
  }

  if (id.kind === 'not_in_catalogue') {
    // Decision 22 and decision 53 meeting: this is the world's gap, not the
    // user's mistake, and the ring is the useful thing we still have.
    yield { type: 'refusal', refusal: REFUSALS.not_in_catalogue };
    if (id.ring) yield { type: 'ring', label: id.ring.label, members: id.ring.members };
    yield { type: 'done', ms: clock() - t0 };
    return;
  }

  // Arrival one. Decision 48: this never waits for price.
  yield { type: 'identity', name: id.name, confidence: id.confidence, ms: clock() - t0 };

  yield { type: 'step', step: 'checking prices' };
  const pricePromise = within(ports.prices(id.key), cap);
  // Started now, not after the price returns. Decision 49.
  const altPromise = within(ports.alternatives(id.key, id.shelfCents), cap);

  const pending: Promise<ScanEvent[]>[] = [
    pricePromise.then((p): ScanEvent[] => {
      const ms = clock() - t0;
      if (p === LATE) {
        return [{ type: 'timed_out', step: 'checking prices', says: 'Prices did not come back in time.' }];
      }
      if (p === null || p.sellerCount === 0) {
        return [{ type: 'refusal', refusal: REFUSALS.no_prices }];
      }
      if (!ports.verdictAvailable) {
        // Decision 45 and 46: the identity and the alternatives already
        // shipped; this is the only part behind the offer, and the offer sits
        // on the result.
        return [{ type: 'gated', part: 'verdict', offer: ports.upgradeOffer ?? '' }];
      }
      // CHANGED 2026-09-05, on his instruction. A one seller result used to
      // ship the verdict AND a refusal saying one seller is not enough to say
      // if it is a good price, which is the screen contradicting itself in two
      // consecutive lines. The verdict now carries its own confidence and the
      // reasons behind it, so the doubt has somewhere to live that is not a
      // second paragraph taking the first one back.
      return [{ type: 'verdict', verdict: p.verdict, ms }];
    }),
    altPromise.then((a): ScanEvent[] => {
      const ms = clock() - t0;
      if (a === LATE) {
        return [{ type: 'timed_out', step: 'finding cheaper options', says: 'Cheaper options did not come back in time.' }];
      }
      if (a.length === 0) return [{ type: 'refusal', refusal: REFUSALS.no_alternatives }];
      return [{ type: 'alternatives', items: a, ms }];
    }),
  ];

  yield { type: 'step', step: 'finding cheaper options' };

  // Whichever lands first is shown first, and each is yielded the moment it
  // settles. Awaiting the pair and then yielding both would satisfy every other
  // assertion in this file and quietly cost a second of silence on every scan,
  // which is exactly the failure decision 49 exists to prevent.
  for await (const events of asCompleted(pending)) {
    for (const e of events) yield e;
  }

  yield { type: 'done', ms: clock() - t0 };
}

/** Yields each promise's value as it settles, in completion order. */
async function* asCompleted<T>(promises: readonly Promise<T>[]): AsyncGenerator<T> {
  const tagged = promises.map((p, i) => p.then((v) => ({ i, v })));
  const remaining = new Set(tagged.keys());
  while (remaining.size > 0) {
    const { i, v } = await Promise.race([...remaining].map((k) => tagged[k]));
    remaining.delete(i);
    yield v;
  }
}

/**
 * Decision 48 as an assertion rather than an aspiration.
 *
 * Called by whatever records a run. A budget nobody measures is a sentence in a
 * document, and this one is the difference between the product feeling instant
 * and feeling like a web page.
 */
export function overBudget(gtin: string | null, ms: number): boolean {
  return ms > (gtin ? BUDGET_MS.barcode : BUDGET_MS.photo);
}
