/**
 * The box a Grounded Result lives in, and the only three doors out of it.
 *
 * WHY THIS FILE EXISTS AT ALL. Gemini returns two categorically different
 * kinds of output and the difference is a CONTRACT, not a preference. An
 * ungrounded answer (no search tool) is ordinary model output: storable
 * anywhere, no rules. An answer produced with the `google_search` tool on is a
 * Grounded Result, and Grounded Results are governed by
 * https://ai.google.dev/gemini-api/terms, "Grounding with Google Search",
 * effective 2026-03-23. The same text is section (k) of the Google Cloud
 * Service Specific Terms, modified 2026-07-29, so moving the call to Vertex
 * does not escape any of it.
 *
 * QUOTED VERBATIM, because a paraphrase of a licence is a paraphrase of a
 * lawsuit (ai.google.dev/gemini-api/terms, eff. 2026-03-23):
 *
 *   "You will not, and will not allow your end user or any third party to,
 *   cache, frame, syndicate, resell, analyze, train on, or otherwise learn
 *   from Grounded Results or Search Suggestions."
 *
 *   "will only display the Grounded Results with the associated Search
 *   Suggestion(s) to the end user who submitted the prompt."
 *
 *   "Unless permitted by Google in writing, you: (1) will not modify, or
 *   intersperse any other content with, the Grounded Results or Search
 *   Suggestions; and (2) will not place any interstitial content between any
 *   Link or Search Suggestions and the associated destination page..."
 *
 *   "you will not track whether those interactions were specifically with a
 *   given Search Suggestion or Grounded Result... including any specific Link"
 *
 * And the two carve-outs that make this app legal rather than impossible:
 *
 *   "You may copy and store, for up to two (2) years, the text of the Grounded
 *   Result(s)... in chat history of an end user of your application only for
 *   the purpose of allowing that end user to view their chat history."
 *
 *   ...storing temporarily "for the purpose of resubmitting the text of the
 *   Grounded Result in a subsequent prompt... to obtain a refined or improved
 *   Grounded Result to display to the end user", as long as undisplayed
 *   interim results are deleted.
 *
 * ============================================================================
 * WHY A BOX AND NOT A CONVENTION
 * ============================================================================
 *
 * Every write in this repo that could leak a Grounded Result takes a `string`:
 * `app/src/scans.ts` (`ScanPatch.verdictTier`, `ScanInput.modelJson`),
 * `price/src/store.ts` (`ObservationRow`), `catalogue/src/load.ts`. A comment
 * saying "do not store this" is a prose rule, and this repo has measured what
 * prose rules are worth: one was violated 892 times with the rate rising while
 * a mechanical guard let zero through. So the guard is mechanical in three
 * independent layers, and each layer catches what the other two cannot:
 *
 *   1. NOMINAL TYPE. `GroundedBox` is never exported as a value and carries a
 *      protected member, so nothing structural is assignable to it and it is
 *      assignable to nothing. A box cannot reach a parameter typed `string`.
 *      `identify/test/grounded-types.ts` is the standing proof.
 *   2. NO PAYLOAD ON THE OBJECT. The contents live in a module-private
 *      `WeakMap` keyed by the box. That is the point rather than a flourish: a
 *      `JSON.stringify` of some response object that happens to contain a box,
 *      or an error logger that captures one, leaks nothing, because there is
 *      nothing on the object to leak.
 *   3. LOUD INSTEAD OF QUIET. `toJSON`, `toString` and `Symbol.toPrimitive`
 *      all throw. A silent `{}` in a log line becomes a crash somebody fixes,
 *      and a template literal cannot quietly concatenate a Grounded Result
 *      into the middle of a Shin sentence, which is exactly the "will not
 *      modify, or intersperse any other content with" clause.
 *
 * And one runtime layer a type cannot do: `seal` DEEP-FREEZES the value, so
 * under ESM strict mode `.sort()`, `.push()`, `.reverse()` and a plain field
 * assignment all throw. "Will not modify" stops being a promise and becomes a
 * TypeError.
 */

/**
 * The device id a scan carries when nobody is attributed to it.
 *
 * DUPLICATED ON PURPOSE, not imported. `app/src/scan-summary.ts` owns this
 * constant for the server's own accounting, and `identify/` does not depend on
 * `app/` in either direction: importing it would create the first edge from a
 * leaf package into the server, and a runtime import across that boundary to
 * fetch one string is a dependency nobody would accept if it were written the
 * other way round. The two copies agreeing matters, so if the server ever
 * renames its sentinel this constant has to move with it. A rename that missed
 * this file fails safe: `seal` would stop refusing anonymous scans, which is
 * why this is stated here rather than left to be noticed.
 */
export const ANONYMOUS_DEVICE = 'unattributed';

/** A Grounded Result reached somewhere it is not allowed to go. */
export class GroundedLeak extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroundedLeak';
  }
}

/** Somebody other than the end user who submitted the prompt asked for it. */
export class GroundedOwnership extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroundedOwnership';
  }
}

/**
 * Everything one grounded answer arrived with. The ONLY input `seal` accepts.
 *
 * `fetchedAt` is not decoration: it starts the two-year clock the storage
 * carve-out grants, and a row with no fetch time cannot be expired by anything
 * later without guessing.
 */
export interface GroundedEnvelope<T> {
  readonly value: T;
  /** The Search Suggestions widget, byte for byte as Google returned it. */
  readonly suggestionsHtml: string;
  /** The one end user who submitted the prompt. Nobody else may be shown this. */
  readonly forDevice: string;
  readonly promptId: string;
  /** ISO 8601. The two-year clock starts here. */
  readonly fetchedAt: string;
  readonly provider: 'gemini';
  readonly searchQueries: number;
}

/** What crosses to the one device that asked. `block` is the frozen original. */
export interface GroundedWire<T> {
  readonly kind: 'grounded';
  readonly forDevice: string;
  readonly fetchedAt: string;
  /**
   * THE SAME FROZEN REFERENCE `seal` was handed. Never a copy, never a
   * reshaped projection, never a subset: a projection is a modification, and
   * the client renders this and the `suggestionsHtml` below together or
   * renders neither.
   */
  readonly block: T;
  readonly suggestionsHtml: string;
}

const INSPECT = Symbol.for('nodejs.util.inspect.custom');

/**
 * Never exported as a value. `export type Grounded<T> = GroundedBox<T>` below
 * is the only way any other file can name this, so no other file can construct
 * one, and `seal` is the single door in.
 */
class GroundedBox<T> {
  /**
   * The phantom. A protected member is what makes TypeScript treat this class
   * nominally instead of structurally: with it, no object literal and no
   * lookalike interface is assignable to `Grounded<T>`, and `Grounded<T>` is
   * assignable to nothing else. It is a METHOD rather than a field so it lives
   * on the prototype, because a class field would be an enumerable own
   * property and layer 2 above says a box carries nothing.
   */
  protected phantom(_value: T): void {
    /* never called; it exists to be in the type */
  }

  toJSON(): never {
    throw new GroundedLeak(
      'A Grounded Result cannot be serialised. It may be shown to the one device that asked ' +
        '(toWire), resubmitted to Google (resubmitText), or written to that device\'s own history ' +
        '(historyText). Nothing else.',
    );
  }

  toString(): never {
    throw new GroundedLeak(
      'A Grounded Result cannot be turned into a string here. Interspersing it with other ' +
        'content is forbidden by ai.google.dev/gemini-api/terms.',
    );
  }

  [Symbol.toPrimitive](): never {
    throw new GroundedLeak(
      'A Grounded Result cannot be coerced to a primitive. See toWire, resubmitText, historyText.',
    );
  }

  /**
   * So that a `console.log` of a structure holding one prints something a
   * human can act on rather than throwing inside the logger, which would turn
   * a debugging session into a crash with no message.
   */
  [INSPECT](): string {
    return '[Grounded Result: sealed]';
  }
}

/** The only name other files get. A box, and no way to build one but `seal`. */
export type Grounded<T> = GroundedBox<T>;

/**
 * Where the contents actually are. Module-private and a WeakMap, so the box
 * itself is empty and a discarded box is collectable with its payload.
 */
const CONTENTS = new WeakMap<GroundedBox<unknown>, GroundedEnvelope<unknown>>();

/**
 * "Will not modify", enforced at runtime instead of promised in a comment.
 *
 * Recursive, and cycle-safe because a grounded answer is parsed JSON today but
 * a self-referential object here would otherwise be an infinite loop in the
 * one code path that must never be the thing that takes the server down.
 */
function deepFreeze(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value !== 'object') return;
  const obj = value as object;
  if (seen.has(obj)) return;
  seen.add(obj);
  Object.freeze(obj);
  for (const key of Reflect.ownKeys(obj)) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
}

/**
 * THE ONE DOOR IN. Nothing else in this repo may call this: grep for `seal(`
 * and the answer is this declaration and `providers/gemini-grounded.ts`, which
 * is what `grounded.test.ts` asserts on every run.
 *
 * It REFUSES in one case: no owner, or the anonymous sentinel, because every
 * door out checks the owner and a box nobody owns could never be opened. The
 * server gives a scan with no device id an owner of its own for that request,
 * so this never costs a shopper an answer.
 *
 * NO SEARCH SUGGESTIONS IS NO LONGER A REFUSAL, 2026-09-15. It used to be:
 * the terms say they must be displayed with the result. Jamin the same day:
 * "don't prevent something from functioning just because of legal issues".
 * An answer that arrived without them is sealed with an empty string, shown,
 * and listed in the build report as a terms crossing left working.
 */
export function seal<T>(raw: GroundedEnvelope<T>): Grounded<T> {
  const owner = raw.forDevice?.trim() ?? '';
  if (owner === '' || owner === ANONYMOUS_DEVICE) {
    throw new GroundedOwnership(
      'A Grounded Result needs the end user who submitted the prompt. An anonymous or empty ' +
        'device cannot own one, so this answer is refused rather than stored.',
    );
  }
  deepFreeze(raw.value, new Set<object>());
  const envelope: GroundedEnvelope<T> = Object.freeze({ ...raw, forDevice: owner });

  const box = new GroundedBox<T>();
  CONTENTS.set(box as GroundedBox<unknown>, envelope as GroundedEnvelope<unknown>);
  return box;
}

function envelopeOf<T>(box: Grounded<T>): GroundedEnvelope<T> {
  const found = CONTENTS.get(box as GroundedBox<unknown>);
  if (!found) {
    throw new GroundedLeak(
      'This Grounded Result has been discarded. The terms require an undisplayed interim result ' +
        'to be deleted, and it was. There is nothing left to read.',
    );
  }
  return found as GroundedEnvelope<T>;
}

/**
 * DOOR OUT ONE: to the one user who asked, and to nobody else.
 *
 * "will only display the Grounded Results with the associated Search
 * Suggestion(s) to the end user who submitted the prompt." The check is an
 * exact string match on the device id rather than anything fuzzier, because
 * every way of being approximately right about who owns an answer is a way of
 * showing one person's grounded answer to another person.
 */
export function toWire<T>(box: Grounded<T>, requestedBy: string): GroundedWire<T> {
  const envelope = envelopeOf(box);
  const asker = requestedBy?.trim() ?? '';
  if (asker === '' || asker === ANONYMOUS_DEVICE) {
    throw new GroundedOwnership(
      'An anonymous request cannot be the end user who submitted the prompt.',
    );
  }
  if (asker !== envelope.forDevice) {
    throw new GroundedOwnership(
      'This Grounded Result belongs to the device that submitted the prompt and may be shown to ' +
        'no other device.',
    );
  }
  return {
    kind: 'grounded',
    forDevice: envelope.forDevice,
    fetchedAt: envelope.fetchedAt,
    block: envelope.value,
    suggestionsHtml: envelope.suggestionsHtml,
  };
}

/**
 * DOOR OUT TWO: back to Google, unchanged.
 *
 * The refinement carve-out, and the ONLY thing this text may be used for here:
 * "resubmitting the text of the Grounded Result in a subsequent prompt... to
 * obtain a refined or improved Grounded Result to display to the end user".
 * The caller that resubmits must `discard` any interim answer it does not
 * display.
 *
 * A string comes back byte identical. Anything else comes back as JSON, which
 * is not a reshaping: it is the same values in the only form a prompt can
 * carry, and no field is renamed, dropped, reordered by us, translated or
 * re-voiced on the way.
 */
export function resubmitText<T>(box: Grounded<T>): string {
  const envelope = envelopeOf(box);
  if (typeof envelope.value === 'string') return envelope.value;
  return JSON.stringify(envelope.value);
}

/**
 * DOOR OUT THREE: the only text that may ever be written to disk.
 *
 * "You may copy and store, for up to two (2) years, the text of the Grounded
 * Result(s)... in chat history of an end user of your application only for the
 * purpose of allowing that end user to view their chat history." Which is why
 * `owner` is required and checked here too: the carve-out is for THAT user's
 * history row, and a write onto anybody else's row is outside it. The two-year
 * expiry is the caller's to enforce off `fetchedAt`; this function cannot know
 * when the row will be read.
 */
export function historyText<T>(box: Grounded<T>, owner: string): string {
  const envelope = envelopeOf(box);
  const who = owner?.trim() ?? '';
  if (who === '' || who === ANONYMOUS_DEVICE) {
    throw new GroundedOwnership('A Grounded Result cannot be written to an anonymous history.');
  }
  if (who !== envelope.forDevice) {
    throw new GroundedOwnership(
      'A Grounded Result may be stored only in the chat history of the end user who submitted ' +
        'the prompt.',
    );
  }
  return typeof envelope.value === 'string' ? envelope.value : JSON.stringify(envelope.value);
}

/**
 * The interim rule, at the memory level.
 *
 * An undisplayed interim Grounded Result must be deleted. Dropping the
 * reference would get there eventually and at a time nobody chose; deleting
 * the WeakMap entry is the deletion happening at the line that decided not to
 * display it. Every door throws afterwards, which is the point: a later read
 * of a discarded answer is a bug that should be loud.
 */
export function discard<T>(box: Grounded<T>): void {
  CONTENTS.delete(box as GroundedBox<unknown>);
}

/**
 * Facts ABOUT a grounded answer that are not the answer: when it arrived, who
 * it belongs to, which provider, how many searches it took.
 *
 * Deliberately never includes the value or the suggestions HTML, so a caller
 * can log that a grounded call happened, and expire a row on its age, without
 * any path to the content. Counting searches is measurement of our own call,
 * not analysis of a Grounded Result, and it records nothing about which
 * Suggestion or Link anybody interacted with, which is the clause that matters
 * here.
 */
export function provenanceOf<T>(
  box: Grounded<T>,
): { forDevice: string; fetchedAt: string; promptId: string; provider: 'gemini'; searchQueries: number } {
  const envelope = envelopeOf(box);
  return {
    forDevice: envelope.forDevice,
    fetchedAt: envelope.fetchedAt,
    promptId: envelope.promptId,
    provider: envelope.provider,
    searchQueries: envelope.searchQueries,
  };
}
