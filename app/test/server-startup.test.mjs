/**
 * The startup guard, the invite door, the error line, the cost estimate and
 * the shop parser: the five pieces of this lane that are pure functions and
 * can therefore be checked completely rather than sampled.
 *
 * Plan items 1i, 1j, 39a, 9e and 11b.
 *
 * WHY THESE ARE NOT SOCKET TESTS. Each one is a decision made before or
 * outside a request: whether to open a port at all, whether a header matches,
 * what a log line says, what a call cost, what a third party's JSON means.
 * The routes that USE them are hit over a real socket in
 * `server-beta-routes.test.ts`, which is where "does the door actually refuse"
 * is answered; this file is where "does it refuse the right things" is, and
 * that needs cases a socket test would take a minute each to set up.
 *
 * THE FILE FACTS ARE INJECTED, so none of this builds directory trees on disk
 * and none of it depends on what happens to be in the temp folder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startupProblems, listenProblem, DATABASE_ENV } from '../src/startup.ts';
import { inviteAllows, inviteRequired, INVITE_HEADER, INVITE_EXEMPT } from '../src/invite.ts';
import { errorLine } from '../src/errlog.ts';
import { estimatedCostCents } from '../src/model-cost.ts';
import { parseCell, parseOverpass, hintFor, overpassQuery, STORES_OFFERED } from '../src/stores.ts';
import { nearestRank } from '../src/latency.ts';
import { retentionDays, DEFAULT_RETENTION_DAYS } from '../src/photos.ts';
import { endOfDay, serialisePayload, eventLine, MAX_EVENT_PAYLOAD_BYTES } from '../src/events.ts';

/** A filesystem that exists only in this object. */
const files = (existing, directories) => ({
  exists: (p) => existing.includes(p),
  isDirectory: (p) => directories.includes(p),
});

/* ------------------------------- 1i, startup ----------------------------- */

test('a clean machine has nothing to say', () => {
  assert.deepEqual(startupProblems({}, files([], [])), []);
});

test('a taken port is one sentence that names the fix', () => {
  const sentence = listenProblem({ code: 'EADDRINUSE' }, 4173);
  assert.match(sentence, /4173/);
  assert.match(sentence, /already in use/);
  // The fix, not just the diagnosis. This is the half that makes it worth a
  // sentence instead of a stack.
  assert.match(sentence, /PORT/);
  assert.ok(!sentence.includes('\n'), 'the guard printed more than one line');
});

test('a port this account may not have, and an address that is not on this machine', () => {
  assert.match(listenProblem({ code: 'EACCES' }, 80), /not allowed/);
  assert.match(listenProblem({ code: 'EADDRNOTAVAIL' }, 4173), /not available/);
});

test('an error nobody has a sentence for is not given an invented one', () => {
  // Null means "print the real error". Inventing a friendly sentence for an
  // unknown code is how a real cause gets hidden behind a guess.
  assert.equal(listenProblem({ code: 'ESOMETHINGNEW' }, 4173), null);
  assert.equal(listenProblem(new Error('plain'), 4173), null);
});

test('a database file that is missing inside a folder that exists is allowed through', () => {
  // This is every development machine in the project, and it is the exact
  // shape photo-route.test.ts sets up on purpose. The guard must not refuse it.
  const env = { SHIN_CATALOGUE: '/data/catalogue.db' };
  assert.deepEqual(startupProblems(env, files([], ['/data'])), []);
});

test('a database path whose folder does not exist is a typo or an unmounted disk', () => {
  const env = { SHIN_CATALOGUE: '/Volumes/nothere/catalogue.db' };
  const problems = startupProblems(env, files([], ['/data']));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /SHIN_CATALOGUE/);
  assert.match(problems[0], /Volumes/);
});

test('a database listed in SHIN_REQUIRE_DB must actually be there', () => {
  const env = { SHIN_REQUIRE_DB: 'catalogue', SHIN_CATALOGUE: '/data/catalogue.db' };
  const problems = startupProblems(env, files([], ['/data']));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /catalogue database is not at/);
  // And it passes the moment the file is there.
  assert.deepEqual(startupProblems(env, files(['/data/catalogue.db'], ['/data'])), []);
});

test('SHIN_REQUIRE_DB naming something this server does not know is itself a problem', () => {
  const problems = startupProblems({ SHIN_REQUIRE_DB: 'weather' }, files([], []));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /weather/);
  // It names what it does know, so the fix is on the same line as the fault.
  for (const known of Object.keys(DATABASE_ENV)) assert.ok(problems[0].includes(known));
});

test('a required database whose variable was never set is named, not silently skipped', () => {
  const problems = startupProblems({ SHIN_REQUIRE_DB: 'prices' }, files([], []));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /SHIN_PRICES is not set/);
});

test('a PORT that is not a port number stops the start', () => {
  assert.match(startupProblems({ PORT: 'four thousand' }, files([], []))[0], /not a port number/);
  assert.match(startupProblems({ PORT: '70000' }, files([], []))[0], /not a port number/);
  assert.deepEqual(startupProblems({ PORT: '0' }, files([], [])), []);
});

test('every problem is reported, not only the first', () => {
  const env = { PORT: 'nope', SHIN_REQUIRE_DB: 'prices' };
  assert.equal(startupProblems(env, files([], [])).length, 2);
});

/* -------------------------------- 1j, invite ----------------------------- */

test('with no code configured every request passes, which is local development', () => {
  assert.equal(inviteRequired({}), null);
  assert.equal(inviteAllows(undefined, {}), true);
  assert.equal(inviteAllows('anything', {}), true);
  assert.equal(inviteAllows(undefined, { SHIN_INVITE_CODE: '   ' }), true);
});

test('with a code configured, only that code passes', () => {
  const env = { SHIN_INVITE_CODE: 'open-sesame' };
  assert.equal(inviteAllows('open-sesame', env), true);
  assert.equal(inviteAllows('open-sesam', env), false);
  assert.equal(inviteAllows('OPEN-SESAME', env), false);
  assert.equal(inviteAllows(undefined, env), false);
  assert.equal(inviteAllows('', env), false);
  assert.equal(inviteAllows(['open-sesame'], env), false);
});

test('a trailing newline on either side still matches', () => {
  // The single most common way a secret written by a process manager fails to
  // match, and the failure it produces looks like the code being wrong.
  assert.equal(inviteAllows('open-sesame\n', { SHIN_INVITE_CODE: 'open-sesame' }), true);
  assert.equal(inviteAllows('open-sesame', { SHIN_INVITE_CODE: ' open-sesame\n' }), true);
});

test('the header name and the exemption list are what the client lane was given', () => {
  assert.equal(INVITE_HEADER, 'x-shin-invite');
  assert.deepEqual(INVITE_EXEMPT, ['/api/health']);
});

/* ------------------------------- 39a, error log -------------------------- */

test('an error line is one JSON object carrying the scan id', () => {
  const line = errorLine(
    { where: '/api/price', scanId: 42, deviceId: 'd1', err: Object.assign(new Error('boom'), { code: 'EBOOM' }) },
    new Date('2026-09-11T12:00:00.000Z'),
  );
  assert.ok(!line.includes('\n'), 'a log line that spans lines cannot be grepped');
  const parsed = JSON.parse(line);
  assert.equal(parsed.scanId, 42);
  assert.equal(parsed.where, '/api/price');
  assert.equal(parsed.deviceId, 'd1');
  assert.equal(parsed.code, 'EBOOM');
  assert.equal(parsed.message, 'boom');
  assert.equal(parsed.at, '2026-09-11T12:00:00.000Z');
  assert.equal(parsed.level, 'error');
});

test('a failure before any scan existed says null rather than inventing a row', () => {
  const parsed = JSON.parse(errorLine({ where: '/api/stores', err: new Error('x') }));
  assert.equal(parsed.scanId, null);
  assert.equal(parsed.deviceId, null);
});

test('a thrown thing that is not an Error still produces a line', () => {
  const parsed = JSON.parse(errorLine({ where: 'somewhere', err: 'just a string' }));
  assert.equal(parsed.message, 'just a string');
  assert.equal(parsed.code, null);
});

/* ------------------------------- 9e, model cost -------------------------- */

test('a call that reached the model is estimated, and one that never did is null', () => {
  assert.equal(estimatedCostCents('pro', 1, true, {}), 0.68);
  assert.equal(estimatedCostCents('basic', 1, true, {}), 0.23);
  // Nothing was spent, so nothing is recorded. A 0 would be a measurement.
  assert.equal(estimatedCostCents('pro', 1, false, {}), null);
});

test('two passes is two calls, because the hard fallback is a whole second one', () => {
  assert.equal(estimatedCostCents('pro', 2, true, {}), 1.36);
});

test('the environment overrides the rate card, and a junk value does not', () => {
  assert.equal(estimatedCostCents('pro', 1, true, { SHIN_COST_PRO_CENTS: '1.5' }), 1.5);
  assert.equal(estimatedCostCents('basic', 1, true, { SHIN_COST_BASIC_CENTS: '0' }), 0);
  // Junk falls back to the published estimate rather than to zero, because
  // zero is a claim that a call was free.
  assert.equal(estimatedCostCents('pro', 1, true, { SHIN_COST_PRO_CENTS: 'free' }), 0.68);
});

/* --------------------------------- 11, stores ---------------------------- */

test('a cell is snapped onto the kilometre grid whatever precision it arrives at', () => {
  assert.equal(parseCell('43.2609,-79.9192').text, '43.26,-79.92');
  assert.equal(parseCell(' 43.26 , -79.92 ').text, '43.26,-79.92');
  // The server coarsens, so a client that sent six decimals does not get six
  // decimals stored. This is the privacy promise as a line of code.
  assert.equal(parseCell('43.264891,-79.919233').text, '43.26,-79.92');
});

test('a cell always has two decimal places, so it matches itself in a column', () => {
  assert.equal(parseCell('43,-79').text, '43.00,-79.00');
  assert.equal(parseCell('0,0').text, '0.00,0.00');
});

test('anything that is not a pair of numbers on Earth is refused', () => {
  for (const bad of [null, undefined, '', 'here', '43.26', '43.26,-79.92,5', '91,0', '0,181', 'a,b']) {
    assert.equal(parseCell(bad), null, `${bad} was accepted as a cell`);
  }
});

test('the nearest three named shops come back, nearest first', () => {
  const cell = parseCell('43.26,-79.92');
  const body = JSON.stringify({
    elements: [
      { type: 'node', id: 3, lat: 43.28, lon: -79.92, tags: { name: 'Far Mart', shop: 'supermarket' } },
      { type: 'way', id: 1, center: { lat: 43.2601, lon: -79.9201 }, tags: { name: 'Near Mart', shop: 'supermarket' } },
      { type: 'node', id: 2, lat: 43.262, lon: -79.921, tags: { name: 'Middle Mart', shop: 'convenience' } },
      { type: 'node', id: 4, lat: 43.2605, lon: -79.92, tags: { shop: 'supermarket' } },
      { type: 'node', id: 5, lat: 43.2606, lon: -79.92, tags: { name: 'Fourth Mart', shop: 'supermarket' } },
    ],
  });
  const stores = parseOverpass(body, cell);
  assert.equal(stores.length, STORES_OFFERED);
  assert.deepEqual(stores.map((s) => s.name), ['Near Mart', 'Fourth Mart', 'Middle Mart']);
  // A way, not just a node: a supermarket is usually a building.
  assert.equal(stores[0].id, 'way/1');
});

test('a shop with no name is dropped, because a blank line is not a choice', () => {
  const cell = parseCell('43.26,-79.92');
  const body = JSON.stringify({ elements: [{ type: 'node', id: 4, lat: 43.26, lon: -79.92, tags: { shop: 'x' } }] });
  assert.deepEqual(parseOverpass(body, cell), []);
});

test('an answer that is not JSON, or is JSON of the wrong shape, is an empty list', () => {
  const cell = parseCell('43.26,-79.92');
  assert.deepEqual(parseOverpass('<html>rate limited</html>', cell), []);
  assert.deepEqual(parseOverpass('{"remark":"timed out"}', cell), []);
  assert.deepEqual(parseOverpass('', cell), []);
});

test('the hint tells two branches of one chain apart, and is never coordinates', () => {
  assert.equal(hintFor({ 'addr:housenumber': '75', 'addr:street': 'King St E' }), '75 King St E');
  assert.equal(hintFor({ 'addr:street': 'King St E' }), 'King St E');
  assert.equal(hintFor({ 'addr:city': 'Hamilton' }), 'Hamilton');
  assert.equal(hintFor({ shop: 'convenience' }), 'convenience store');
  assert.equal(hintFor({ shop: 'department_store' }), 'department store');
  assert.equal(hintFor({}), '');
});

test('the query asks for nodes, ways and relations around the cell centre', () => {
  const q = overpassQuery(parseCell('43.26,-79.92'));
  assert.match(q, /nwr\["shop"\]/);
  assert.match(q, /around:\d+,43.26,-79.92/);
  assert.match(q, /out center/);
});

/* -------------------------------- 39c, latency --------------------------- */

test('the p95 is a latency something actually took, never an interpolation', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
  assert.equal(nearestRank(twenty, 0.95), 1900);
  assert.equal(nearestRank(twenty, 0.5), 1000);
  // One measurement is its own p95. Anything else would invent a number.
  assert.equal(nearestRank([42], 0.95), 42);
  assert.equal(nearestRank([], 0.95), 0);
});

/* -------------------------------- 39d, retention ------------------------- */

test('retention is ninety days unless the environment says otherwise', () => {
  assert.equal(retentionDays({}), DEFAULT_RETENTION_DAYS);
  assert.equal(DEFAULT_RETENTION_DAYS, 90);
  assert.equal(retentionDays({ SHIN_PHOTO_RETENTION_DAYS: '30' }), 30);
  // A typo must never mean "delete everything on the next sweep".
  assert.equal(retentionDays({ SHIN_PHOTO_RETENTION_DAYS: 'ninety' }), 90);
  assert.equal(retentionDays({ SHIN_PHOTO_RETENTION_DAYS: '0' }), 90);
  assert.equal(retentionDays({ SHIN_PHOTO_RETENTION_DAYS: '-5' }), 90);
});

/* --------------------------------- 10, events ---------------------------- */

test('a bare date as the upper bound includes that whole day', () => {
  assert.equal(endOfDay('2026-09-11'), '2026-09-12T00:00:00.000Z');
  // Anything already carrying a time is left exactly as it was.
  assert.equal(endOfDay('2026-09-11T10:00:00.000Z'), '2026-09-11T10:00:00.000Z');
});

test('a payload that cannot be written down as JSON is a sentence, not a throw', () => {
  const circular = {};
  circular.self = circular;
  assert.ok('why' in serialisePayload(circular));
  assert.ok('why' in serialisePayload({ big: 'x'.repeat(MAX_EVENT_PAYLOAD_BYTES) }));
  assert.deepEqual(serialisePayload(undefined), { json: null });
  assert.deepEqual(serialisePayload({ a: 1 }), { json: '{"a":1}' });
});

test('an exported line nests the payload so jq can reach into it', () => {
  const line = JSON.parse(
    eventLine({ id: 1, device_id: 'd', type: 'thumbs', payload: '{"rating":"up"}', created_at: 'T', user_id: null }),
  );
  assert.equal(line.payload.rating, 'up');
  assert.equal(line.type, 'thumbs');
  assert.ok(!('userId' in line), 'a null user id was written into the export');
});

test('a payload that will not parse is kept verbatim rather than dropped', () => {
  const line = JSON.parse(
    eventLine({ id: 1, device_id: 'd', type: 'x', payload: 'not json', created_at: 'T', user_id: null }),
  );
  assert.equal(line.payload, null);
  assert.equal(line.payloadRaw, 'not json');
});
