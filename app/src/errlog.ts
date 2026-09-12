/**
 * Errors as rows rather than as prose. Plan item 39a.
 *
 * WHAT IS BROKEN TODAY. Every failure in this server arrives as
 * `console.error('/api/alternatives failed:', err)`, which produces a line of
 * English followed by a stack. Three of those in a log tell you three things
 * went wrong. None of them tells you WHICH SCAN it was, so the one question
 * worth asking during a six-person beta -- a tester says "it broke when I
 * scanned the cereal", and the scan row for that cereal is right there with an
 * id -- cannot be answered by searching. The id is the join, and it was never
 * written down.
 *
 * ONE JSON OBJECT PER LINE, to stderr. Not a log library and not a file: a
 * process manager on his Mac already captures stderr, `grep` already finds a
 * scan id in a line of JSON, and `jq` already groups by `where`. Adding a
 * dependency and a rotation policy to a beta with six people is machinery
 * before evidence.
 *
 * STDERR, NEVER STDOUT, and it is load bearing rather than tidy: the event
 * export (`export-events.ts`) writes JSON lines to stdout, and a log line
 * landing in that stream would corrupt an export that somebody is piping into
 * `jq`. The two streams are the two audiences.
 *
 * WHAT NEVER GOES IN A LINE. No photo bytes, no coordinates, no request body.
 * A log is the easiest place in a product to leak into and the hardest place
 * to notice it, and the privacy statement in plan item 6a has to stay true of
 * the whole system rather than of the database alone. What goes in is: when,
 * where in the code, which scan, which device, the error's code and message.
 *
 * THE MESSAGE STAYS OUT OF THE RESPONSE. That rule is this repo's D-011 and it
 * is not weakened here: an internal string on the screen of somebody who
 * cannot act on it is not an answer. This file is the place it goes instead,
 * where somebody can.
 */

export interface ErrorEntry {
  /** Where in the product, not where in the file. A route path, or a stage name. */
  readonly where: string;
  /** The join to the scan log. Null when the failure happened before a row existed. */
  readonly scanId?: number | null;
  readonly deviceId?: string | null;
  readonly err?: unknown;
  /** Anything small and non-identifying that makes the line worth reading. */
  readonly detail?: Record<string, string | number | boolean | null>;
}

/**
 * TEST ONLY. Redirects lines away from stderr so a test can read what was
 * logged instead of asserting on a spy it wrote itself.
 *
 * Nothing in the product calls this. The seam exists because the alternative
 * is a test that checks the server did not throw, which is a test that agrees
 * with the code rather than checking the thing the item asked for: that the
 * scan id is in the line.
 */
let sink: ((line: string) => void) | null = null;
export function setErrorSinkForTests(fn: ((line: string) => void) | null): void {
  sink = fn;
}

/** The line, as a string, so the formatting is testable without a stream. */
export function errorLine(entry: ErrorEntry, now: Date = new Date()): string {
  const err = entry.err;
  const line: Record<string, unknown> = {
    at: now.toISOString(),
    level: 'error',
    where: entry.where,
    scanId: entry.scanId ?? null,
    deviceId: entry.deviceId ?? null,
    code: (err as NodeJS.ErrnoException)?.code ?? null,
    message: err instanceof Error ? err.message : err === undefined ? null : String(err),
  };
  if (entry.detail) line.detail = entry.detail;
  /*
   * The stack is the last field and it is the only one that can be long, so a
   * line cut off by a log viewer still carries everything that identifies it.
   * It is included because a beta's errors are read by the person who wrote
   * the code, and excluded from nothing else here.
   */
  if (err instanceof Error && err.stack) line.stack = err.stack;
  return JSON.stringify(line);
}

/** Writes one line. Never throws: a logger that can fail a request is worse than no logger. */
export function logError(entry: ErrorEntry, now: Date = new Date()): void {
  try {
    const line = errorLine(entry, now);
    if (sink) sink(line);
    else process.stderr.write(`${line}\n`);
  } catch {
    /* A logger that throws would take down the route it was reporting on. */
  }
}
