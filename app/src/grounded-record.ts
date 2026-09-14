/**
 * Where a Grounded Result is kept, who it is kept for, and when it stops
 * being kept.
 *
 * Modelled line for line on `photos.ts`, and the resemblance is the point: a
 * retention rule that does not live beside the code that writes the thing is a
 * rule that stops matching reality the first time the write moves. Same shape,
 * same row-driven sweep, same injectable clock, same never-throws contract.
 *
 * WHAT A GROUNDED RESULT IS. Gemini answers two categorically different ways.
 * With no search tool on, the answer is ordinary model output and this file
 * has nothing to do with it: it goes in the shared catalogue like any other
 * answer. With `google_search` on, the answer is a Grounded Result, and
 * https://ai.google.dev/gemini-api/terms (effective 2026-03-23) says it is
 * never cached, never analysed, never learned from, and shown only to the end
 * user who submitted the prompt. The one carve-out that makes storing it at
 * all lawful is the chat-history clause: "You may copy and store, for up to
 * two (2) years, the text of the Grounded Result(s)... in chat history of an
 * end user of your application only for the purpose of allowing that end user
 * to view their chat history."
 *
 * SO THE RETENTION IS A CONSTANT AND NOT AN ENVIRONMENT VARIABLE, and this is
 * the one place this file deliberately refuses to copy `photos.ts`. That file
 * reads `SHIN_PHOTO_RETENTION_DAYS` and defaults to keep-forever, because
 * forever is a defensible choice about a photograph somebody took: it is our
 * data, the decision is the founder's, and the day somebody wants a window
 * back it should be a deploy rather than a commit. Forever is not a defensible
 * choice about a Grounded Result. It is a breach of the exact term this
 * constant exists to obey, so there is no null branch, no override, and
 * nothing to read out of a process that a misconfigured Mac could turn off by
 * being blank. `cutoff` on the sweep result is `string` and not
 * `string | null` for the same reason: this sweep always has a cutoff, and the
 * type says so before any comment has to.
 *
 * THE INTERIM RULE, which is the half that had to be impossible to forget.
 * A grounded answer can be fetched and then superseded by Shin's own refined
 * verdict before anybody sees it. That one is not chat history of an end user,
 * because no end user was ever shown it, so it must be deleted rather than
 * kept. The obvious way to do that is a delete call on the refine path, and
 * the obvious failure is that whoever writes the refine path forgets it, or an
 * exception skips it, or a timeout means the path never runs at all. So there
 * is no delete call on the happy path. Two time-driven devices instead:
 *
 *   1. `keepGroundedForOwner` always writes `grounded_shown = 0`. The only
 *      thing in the repo that ever writes 1 is `markGroundedShown`, and the
 *      only caller of that is the single helper in `server.ts` that turns a
 *      box into a response body. "Shown" is therefore a fact about a response
 *      that actually left the server, never an intention somebody had.
 *   2. `dropInterimGrounded` nulls the text on every row still marked unshown
 *      an hour after it was fetched. It runs inside `sweepGrounded` on the
 *      daily timer, and `dropInterimGroundedFor` runs at the head of
 *      `keepGroundedForOwner` for the same scan, so a second fetch clears the
 *      first fetch's interim row on its way in.
 *
 * A crashed request, a timed-out refine and a 500 are all covered without
 * anybody having to remember anything.
 *
 * OWNERSHIP IS READ OFF THE ROW, NEVER OFF THE ARGUMENT.
 * `keepGroundedForOwner` reads `scan.device_id` and compares it to the owner
 * before it writes a single byte, for the same reason the photo sweep is
 * driven by rows instead of by a directory walk: the database is the record of
 * what we hold, and a parameter is whatever the caller believed. "Shown only
 * to the end user who submitted the prompt" is a claim we have to be able to
 * prove from the data, not from the call site.
 *
 * WHAT IS NOT IN HERE. No route, no fetch, no prompt and no Google. This file
 * writes one column, clears it on two rules, and stops.
 */

import { activeScanStore, openScanStore } from './scans.ts';
import { logError } from './errlog.ts';
import { discard, historyText, toWire, type Grounded, type GroundedWire } from '../../identify/src/grounded.ts';

/*
 * THE BOX ITSELF IS ANOTHER PACKAGE'S. `identify/src/grounded.ts` owns the
 * sealed box and the three doors out of it; this file owns the one place on
 * disk a Grounded Result is allowed to land. Re-exported here so `server.ts`
 * has one import for all of it, and because the two names are only ever used
 * together with the rules in this header.
 */
export type { Grounded, GroundedWire };

/**
 * The three functions this package needs out of that module, as an object so
 * that a test can stand in for the whole of it. See `setGroundedModuleForTests`.
 */
export interface GroundedModule {
  /** Throws on a cross-user request and on an anonymous device. */
  toWire<T>(box: Grounded<T>, requestedBy: string): GroundedWire<T>;
  /** The only text that may be written to disk. */
  historyText<T>(box: Grounded<T>, owner: string): string;
  discard<T>(box: Grounded<T>): void;
}

/**
 * TWO YEARS, THE TERM'S OWN NUMBER, AND NOT CONFIGURABLE.
 *
 * See the header: an environment variable here would be a switch that turns a
 * licence condition off, and a blank one on a badly configured machine would
 * turn it off silently. 730 rather than "2 * 365" so that grepping the number
 * out of the terms finds it in the code.
 */
export const GROUNDED_RETENTION_DAYS = 730;

/**
 * How long an unshown grounded answer is allowed to sit before the reaper
 * takes it. Long enough that a slow refine is never robbed mid-request, short
 * enough that a crash does not leave text on disk that no end user will ever
 * be shown, which is text the chat-history carve-out does not cover.
 */
export const GROUNDED_INTERIM_MINUTES = 60;

/* ------------------------------ the doors seam --------------------------- */

const REAL_DOORS: GroundedModule = { toWire, historyText, discard };

let moduleForTests: GroundedModule | null = null;

/**
 * TEST ONLY, and the same seam `setIdentifierForTests` is.
 *
 * A real box can only be built by `seal`, out of a real Gemini answer, and
 * there is no Google key on this machine. So the three doors are what a test
 * stands in for, exactly as the photo tests stand in for the vision call: the
 * ownership check, the interim rule and the sweep below are the shipped code
 * in every test that uses this.
 */
export function setGroundedModuleForTests(mod: GroundedModule | null): void {
  moduleForTests = mod;
}

/** The three doors out of a sealed box: the real ones, or a test's stand-in. */
export function groundedModule(): GroundedModule {
  return moduleForTests ?? REAL_DOORS;
}

/* ------------------------------- the writes ------------------------------ */

interface OwnerRow {
  device_id: string;
}

/**
 * Stores one Grounded Result against the scan it answers, for the one device
 * that asked, marked unshown.
 *
 * READS THE ROW AND CHECKS THE OWNER FIRST. `owner` is what the caller
 * believes; `scan.device_id` is what we recorded when the person scanned. They
 * disagree exactly in the case this check exists for, and in that case nothing
 * is written at all.
 *
 * CLEARS THIS SCAN'S PREVIOUS INTERIM ROW ON THE WAY IN, before the ownership
 * check and before anything else can fail, so that a second fetch for a scan
 * whose first answer was never shown cannot leave the first one behind.
 *
 * Never throws, and returns whether the text was stored. A false is a fact the
 * caller may ignore: the answer to the person still goes out, it just does not
 * join their history.
 */
export function keepGroundedForOwner(
  scanId: number,
  owner: string,
  box: Grounded<unknown>,
  now: Date = new Date(),
): boolean {
  dropInterimGroundedFor(scanId);
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const row = store.db.prepare('SELECT device_id FROM scan WHERE id = ?').get(scanId) as unknown as
      | OwnerRow
      | undefined;
    if (!row || row.device_id !== owner) return false;
    /*
     * `historyText` IS THE ONLY TEXT THAT MAY BE WRITTEN TO DISK, and it
     * refuses an anonymous owner and a cross-user owner of its own accord. So
     * the ownership rule is checked twice by two different mechanisms that
     * cannot both be removed by one edit: the row above, and the box itself.
     */
    const text = groundedModule().historyText(box, owner);
    /*
     * `grounded_at` IS THE FETCH TIME AND NEVER `scanned_at`. A scan re-priced
     * a year after it was taken starts its own two-year clock, because the
     * clock the term sets runs from when we received the Grounded Result.
     *
     * The device id is repeated in the WHERE clause. The read above already
     * settled ownership; this is the same check said in the one statement that
     * actually writes, so there is no window between them.
     */
    const result = store.db
      .prepare('UPDATE scan SET grounded_json = ?, grounded_at = ?, grounded_shown = 0 WHERE id = ? AND device_id = ?')
      .run(text, now.toISOString(), scanId, owner);
    return Number(result.changes) > 0;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    logError({ where: 'grounded.keep', scanId, deviceId: owner, err });
    return false;
  }
}

/**
 * Records that a grounded answer actually left the server.
 *
 * THE ONLY WRITER OF 1 IN THE REPO, and its only caller is the single helper
 * in `server.ts` that builds a response carrying a grounded block. That is
 * what makes "shown" evidence rather than intention, and it is what the
 * interim reaper reads to decide what nobody has seen.
 *
 * A null id is a scan the log could not record, which is a real state on every
 * route here. It writes nothing and says so rather than throwing.
 */
export function markGroundedShown(scanId: number | null): boolean {
  if (scanId === null) return false;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const result = store.db.prepare('UPDATE scan SET grounded_shown = 1 WHERE id = ?').run(scanId);
    return Number(result.changes) > 0;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    logError({ where: 'grounded.shown', scanId, err });
    return false;
  }
}

/**
 * Nulls the text on every row that was fetched more than an hour ago and never
 * shown to anybody. Returns how many rows were cleared.
 *
 * Never throws. Runs on the daily timer inside `sweepGrounded`.
 */
export function dropInterimGrounded(now: Date = new Date()): number {
  const before = new Date(now.getTime() - GROUNDED_INTERIM_MINUTES * 60 * 1000).toISOString();
  return clearGrounded(
    'UPDATE scan SET grounded_json = NULL WHERE grounded_json IS NOT NULL AND grounded_shown = 0 AND grounded_at < ?',
    [before],
    'grounded.interim',
  );
}

/**
 * The same reaper scoped to one scan, and with no age on it.
 *
 * NO AGE, deliberately: the caller is `keepGroundedForOwner`, and a new fetch
 * for this scan supersedes the old one NOW rather than in an hour. Waiting out
 * the clock here would leave a superseded answer readable for an hour for no
 * reason, which is the opposite of what the hour is for.
 */
export function dropInterimGroundedFor(scanId: number): number {
  return clearGrounded(
    'UPDATE scan SET grounded_json = NULL WHERE grounded_json IS NOT NULL AND grounded_shown = 0 AND id = ?',
    [scanId],
    'grounded.interim',
  );
}

function clearGrounded(sql: string, values: (string | number)[], where: string): number {
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    return Number(store.db.prepare(sql).run(...values).changes);
  } catch (err) {
    logError({ where, err });
    return 0;
  }
}

/* ------------------------------- the sweep ------------------------------- */

export interface GroundedSweepResult {
  /** Rows whose grounded text was older than the cutoff. */
  readonly considered: number;
  /** Rows whose `grounded_json` was cleared by the two-year rule. */
  readonly cleared: number;
  /** Rows cleared by the interim rule in the same pass. */
  readonly interimCleared: number;
  /**
   * The moment before which a Grounded Result is too old to keep. A string and
   * never null: unlike a photograph, this always has a cutoff, and the type is
   * where that is said first.
   */
  readonly cutoff: string;
}

interface AgedGroundedRow {
  id: number;
}

/**
 * Clears every Grounded Result past its two years, and every interim one past
 * its hour, in one pass.
 *
 * DRIVEN BY THE DATABASE, like `sweepPhotos`: the rows are the record of what
 * we hold. There is no directory to walk here, which makes the rule easier to
 * keep rather than harder to break, and the row-at-a-time loop is kept anyway
 * so that `considered` and `cleared` are two separately observed numbers
 * rather than one number reported twice.
 *
 * THE ROW SURVIVES THE TEXT. Clearing nulls `grounded_json` and touches
 * nothing else: what was scanned, what we answered and when stay, because they
 * are ours. The Grounded Result is the part the term lends us for two years.
 *
 * NEVER THROWS. It runs at start and on a timer, where the only thing a throw
 * could do is take down a server that was otherwise fine.
 */
export function sweepGrounded(now: Date = new Date()): GroundedSweepResult {
  const interimCleared = dropInterimGrounded(now);
  const cutoff = new Date(now.getTime() - GROUNDED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const store = activeScanStore() ?? openScanStore();
  let rows: AgedGroundedRow[] = [];
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    rows = store.db
      .prepare('SELECT id FROM scan WHERE grounded_json IS NOT NULL AND grounded_at < ?')
      .all(cutoff) as unknown as AgedGroundedRow[];
  } catch (err) {
    logError({ where: 'grounded.sweep', err });
    return { considered: 0, cleared: 0, interimCleared, cutoff };
  }

  let cleared = 0;
  for (const row of rows) {
    // One row that will not clear must not stop the rest, the same rule the
    // photo sweep keeps about one file that will not delete.
    cleared += clearGrounded('UPDATE scan SET grounded_json = NULL WHERE id = ?', [row.id], 'grounded.sweep');
  }
  return { considered: rows.length, cleared, interimCleared, cutoff };
}
