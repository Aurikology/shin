/**
 * Two years, one hour, and one owner.
 *
 * `grounded-record.ts` holds three rules that Google's terms
 * (https://ai.google.dev/gemini-api/terms, effective 2026-03-23) put on a
 * Grounded Result, and all three are the kind that fail silently:
 *
 *   TWO YEARS is the outer limit of the chat-history carve-out. Text past it
 *   is a breach that looks exactly like text inside it.
 *
 *   AN HOUR is the interim rule. A grounded answer fetched and then superseded
 *   before anybody saw it is not chat history of an end user, because no end
 *   user ever saw it, so it is deleted rather than kept. The deletion is
 *   time-driven rather than a call on the refine path, because a call on the
 *   refine path is a call somebody can forget, time out, or throw past.
 *
 *   ONE OWNER is "shown only to the end user who submitted the prompt",
 *   checked against the scan row's own device_id rather than against the
 *   argument the caller passed in.
 *
 * BOTH DIRECTIONS ARE ASSERTED on the window. A sweep that deletes everything
 * passes a test that only checks that old rows go, and it would destroy a
 * beta's history while looking correct.
 *
 * The clock is an argument everywhere in that file, so none of this waits two
 * years, sleeps, or mocks a global.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { openScanStore, recordScan } from '../src/scans.ts';
import {
  GROUNDED_INTERIM_MINUTES,
  GROUNDED_RETENTION_DAYS,
  dropInterimGrounded,
  keepGroundedForOwner,
  markGroundedShown,
  setGroundedModuleForTests,
  sweepGrounded,
  type Grounded,
  type GroundedModule,
  type GroundedWire,
} from '../src/grounded-record.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-grounded-retention-'));

/**
 * Lane L2's module, faked to its documented contract: `historyText` refuses a
 * cross-user read, which is the same rule this file asserts the row check
 * enforces one layer below.
 */
interface FakeBox {
  owner: string;
  text: string;
}
const fakeModule: GroundedModule = {
  toWire<T>(box: Grounded<T>, requestedBy: string): GroundedWire<T> {
    const b = box as unknown as FakeBox;
    if (b.owner !== requestedBy) throw new Error('cross-user request');
    // `block` is the frozen original and is generic; a fake has no real one,
    // so the empty object is asserted into place rather than widening the door.
    return { kind: 'grounded', forDevice: requestedBy, fetchedAt: 'T', block: {} as T, suggestionsHtml: '<div></div>' };
  },
  historyText(box, owner) {
    const b = box as unknown as FakeBox;
    if (b.owner !== owner) throw new Error('cross-user request');
    return b.text;
  },
  discard() {},
  provenanceOf(box) {
    const b = box as unknown as { owner?: string };
    return {
      forDevice: b.owner ?? 'device-A',
      fetchedAt: '2026-09-16T00:00:00.000Z',
      promptId: 'prices_reviews_description',
      provider: 'gemini',
      searchQueries: 0,
      model: 'gemini-3.5-flash-lite',
      usage: null,
    };
  },
};

const box = (owner: string, text: string): Grounded<unknown> =>
  ({ owner, text }) as unknown as Grounded<unknown>;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-14T12:00:00.000Z');
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY);

before(() => {
  openScanStore(join(dir, 'scans.db'));
  setGroundedModuleForTests(fakeModule);
});

after(() => {
  setGroundedModuleForTests(null);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

/** A real scan row for this device, and its id. */
function scanFor(device: string): number {
  const id = recordScan({ deviceId: device, kind: 'barcode', query: '0068100084245', outcome: 'answered' });
  assert.ok(id !== null, 'the scan log would not write');
  return id as number;
}

function groundedTextOf(scanId: number): string | null {
  const db = openScanStore(join(dir, 'scans.db')).db;
  assert.ok(db, 'the scan store is not open');
  const row = db.prepare('SELECT grounded_json AS t FROM scan WHERE id = ?').get(scanId) as unknown as
    | { t: string | null }
    | undefined;
  return row?.t ?? null;
}

/* ------------------------------- the two years --------------------------- */

test('the window is the term\'s own number and it is not a setting', () => {
  assert.equal(GROUNDED_RETENTION_DAYS, 730);
  assert.equal(GROUNDED_INTERIM_MINUTES, 60);
  /*
   * NO `process.env` IN THAT FILE AT ALL, and this is the assertion that
   * carries the most weight in this suite. `photos.ts` reads
   * SHIN_PHOTO_RETENTION_DAYS and treats unset as forever, which is defensible
   * about a photograph and is a breach about a Grounded Result: a blank
   * variable on a badly configured Mac would turn a licence condition off with
   * nothing on any screen to say so. So retention here cannot be configured at
   * all, and the check is on the source rather than on behaviour, because
   * behaviour with the variable unset looks identical either way.
   */
  const source = readFileSync(fileURLToPath(new URL('../src/grounded-record.ts', import.meta.url)), 'utf8');
  assert.ok(!/process\.env/.test(source), 'grounded retention can be configured, and it must not be');
});

test('a grounded result past two years is swept, and one inside them is not', async () => {
  const oldId = scanFor('device-old');
  const youngId = scanFor('device-young');
  keepGroundedForOwner(oldId, 'device-old', box('device-old', 'old text'), daysBefore(731));
  keepGroundedForOwner(youngId, 'device-young', box('device-young', 'young text'), daysBefore(729));
  // Both were shown, so the hour-old reaper has no opinion about either and
  // what is being measured is only the two-year rule.
  markGroundedShown(oldId);
  markGroundedShown(youngId);

  const result = sweepGrounded(NOW);
  assert.equal(result.considered, 1);
  assert.equal(result.cleared, 1);
  // A string, never null. This sweep always has a cutoff; the type says so and
  // this asserts the type was not widened back.
  assert.equal(typeof result.cutoff, 'string');
  assert.equal(groundedTextOf(oldId), null, '731 days old survived the sweep');
  assert.equal(groundedTextOf(youngId), 'young text', '729 days old was swept early');
});

/* ------------------------------ the one owner ---------------------------- */

test('a grounded result is never written against somebody else\'s scan', async () => {
  const id = scanFor('device-A');
  const wrote = keepGroundedForOwner(id, 'device-B', box('device-B', 'B text'), NOW);
  assert.equal(wrote, false, 'a device wrote a grounded result onto another device\'s scan');
  assert.equal(groundedTextOf(id), null);
  // And the owner can still write to their own row, so the check is about the
  // owner rather than about the call failing generally.
  assert.equal(keepGroundedForOwner(id, 'device-A', box('device-A', 'A text'), NOW), true);
  assert.equal(groundedTextOf(id), 'A text');
});

/* -------------------------------- the hour ------------------------------- */

test('a grounded result nobody was ever shown is cleared an hour later', async () => {
  const id = scanFor('device-C');
  keepGroundedForOwner(id, 'device-C', box('device-C', 'never seen'), new Date(NOW.getTime() - 61 * 60 * 1000));
  // Never marked: no response carrying it left the server.
  assert.equal(groundedTextOf(id), 'never seen');
  const cleared = dropInterimGrounded(NOW);
  assert.ok(cleared >= 1);
  assert.equal(groundedTextOf(id), null, 'text no end user ever saw was kept');
});

test('a second fetch clears the first on its way in, and only what was shown survives', async () => {
  const id = scanFor('device-D');
  // Fetch one: fetched, never served, because the refined verdict came back
  // first. Nothing on any happy path deletes it.
  keepGroundedForOwner(id, 'device-D', box('device-D', 'first answer'), new Date(NOW.getTime() - 5 * 60 * 1000));
  assert.equal(groundedTextOf(id), 'first answer');

  // Fetch two, minutes later. The first one is cleared on the way in rather
  // than in an hour, because a superseded answer is superseded now.
  keepGroundedForOwner(id, 'device-D', box('device-D', 'second answer'), NOW);
  assert.equal(groundedTextOf(id), 'second answer');

  // Only the second one reached the person.
  assert.equal(markGroundedShown(id), true);

  // An hour later the reaper runs and leaves it alone, because it was shown.
  dropInterimGrounded(new Date(NOW.getTime() + 2 * 60 * 60 * 1000));
  const kept = groundedTextOf(id);
  assert.equal(kept, 'second answer');
  assert.notEqual(kept, 'first answer', 'an answer nobody was shown outlived the one they were');
});

test('a fetch is stored unshown, and only the server\'s one helper ever marks it', async () => {
  const id = scanFor('device-E');
  keepGroundedForOwner(id, 'device-E', box('device-E', 'pending'), NOW);
  const db = openScanStore(join(dir, 'scans.db')).db;
  assert.ok(db);
  const row = db.prepare('SELECT grounded_shown AS s FROM scan WHERE id = ?').get(id) as unknown as { s: number };
  assert.equal(row.s, 0, 'a fetch stored itself as already shown');
});

/* ------------------------- the timer nobody may forget ------------------- */

test('the daily sweep closure runs both sweeps, read out of the server\'s source', () => {
  /*
   * ONE TIMER, TWO SWEEPS. A second `setInterval` would be a second thing that
   * can be removed by a refactor, and the failure would be invisible: grounded
   * text simply sitting past two years with nothing on any screen about it.
   * This reads the closure rather than trusting that it was wired, which is
   * the only way to catch a call that was deleted rather than one that threw.
   */
  const source = readFileSync(fileURLToPath(new URL('../server.ts', import.meta.url)), 'utf8');
  const start = source.indexOf('const sweep = () => {');
  const end = source.indexOf('setInterval(sweep', start);
  assert.ok(start > 0 && end > start, 'the daily sweep closure moved; re-read server.ts');
  const closure = source.slice(start, end);
  assert.match(closure, /sweepPhotos\(\)/, 'the daily sweep stopped sweeping photos');
  assert.match(closure, /sweepGrounded\(\)/, 'the daily sweep stopped sweeping grounded results');
});
