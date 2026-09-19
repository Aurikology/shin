/**
 * What used to turn a crop into fields, before every scan became one Gemini
 * call.
 *
 * RETIRED 2026-09-19. This file used to hold the two-pass `Identifier`
 * (an extract pass plus, when that did not settle it, a pick pass over the
 * catalogue rows), its prompts and schemas, its own clock, retry policy,
 * call-count cap and dollar cap, and the provider-selection logic
 * (`makeProvider`) that chose which vendor it ran on. `identify/src/identify.ts`
 * built one of these by default and reached the catalogue cascade;
 * `app/server.ts`'s `identifyPhoto` was the only caller, and it never runs any
 * more. Photo, barcode and typed-name scans are all one Gemini call now
 * (`identify/src/providers/gemini-scan.ts`), which does not construct an
 * `Identifier` and does not go through `makeProvider`.
 *
 * WHAT SURVIVED, because live code still imports it: the `FailureClass`
 * vocabulary and the `ModelCallError` it travels on (`cap.ts`, `provider.ts`
 * and `gemini-scan.ts` all classify failures this way), `Tier` (`app/server.ts`
 * still reads a request's tier), and the `MessagesClient` re-export (`cap.ts`
 * and `describe.ts` import it from here rather than from `providers/anthropic.ts`
 * directly).
 */

/**
 * Still exported from here, 2026-09-13.
 *
 * The type moved to `providers/anthropic.ts` when item 22 split the vendor out,
 * but `cap.ts`, `describe.ts` and two test files import it from this module. A
 * re-export costs nothing and keeps the refactor from reaching into packages it
 * has no business editing.
 */
export type { MessagesClient } from './providers/anthropic.ts';

export type Tier = 'basic' | 'pro';

/**
 * WHAT WENT WRONG, AS A FIELD RATHER THAN A SENTENCE (added 2026-09-08).
 *
 * The beta readiness audit found every failure on this path reaching the user
 * as one sentence: the photo could not be read. That sentence is fine for the
 * person holding the phone and useless to us, because an outage on our side
 * and a genuinely dark photo then become the same row in the scan log. A beta
 * run inside an outage would read back as a beta full of bad photographers.
 *
 * So the class is a field, kept separate from the copy. The copy may stay
 * identical for every model failure (hard rule 3: nothing is aimed at the
 * user, and "our rate limit is full" is not a repair anybody can perform)
 * while the log gets the distinction the copy deliberately does not carry.
 *
 * `unreadable_photo` is the only member here that is about the photograph.
 * Every other member is about us or about the wire.
 */
export type FailureClass =
  | 'unreadable_photo'
  | 'model_timeout'
  | 'model_rate_limited'
  | 'model_outage'
  | 'model_malformed'
  | 'model_client_error'
  | 'spend_cap_reached';

/** Every throw out of a model call is one of these, so a caller never has to guess. */
export class ModelCallError extends Error {
  readonly failure: FailureClass;
  /** How many API calls were actually spent before giving up. */
  readonly attempts: number;

  constructor(failure: FailureClass, message: string, attempts = 0) {
    super(message);
    this.name = 'ModelCallError';
    this.failure = failure;
    this.attempts = attempts;
  }
}
