/**
 * The photo door, tested at the socket.
 *
 * RUNS A REAL SERVER over a real port, because every one of these cases is
 * about the HTTP edge and not about a function: a 413 is a status and a
 * lingering close, a 400 is what happens to bytes that are not an image, and a
 * 429 is a counter that has to survive between two requests. An in-process call
 * to a handler with a fake request would be the test agreeing with the code,
 * which is the shape DEFECTS.md standard 3 says has been green while the
 * product was broken.
 *
 * IMPORTED RATHER THAN SPAWNED, which is the one difference from
 * `body-cap.test.mjs`. The single thing that cannot be real here is the vision
 * call: there is no API key on this machine, so a test that made one would be
 * a test that never runs. `setGeminiTransportForTests` is how the double gets
 * in, and a child process cannot be handed an object. Everything else on the
 * path -- the body reader, the cap, the magic-byte check, the rate limit, the
 * outcome mapping and the scan row -- is the shipped code.
 *
 * Both stores are pointed at temp files BEFORE the modules load, because each
 * resolves its path once at import.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-photo-route-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
// No catalogue. The lookup is faked, and attaching the real multi-gigabyte
// file would make this the slowest suite in the repo for nothing.
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
// 0 asks the OS for a free port, which matters because the main session's
// server is usually already sitting on 4173.
process.env.PORT = '0';

process.env.GEMINI_API_KEY = 'test-key-never-sent';
// The photo route now declines on any machine that has not named the kind of
// key it holds, so this harness names one. Nothing here reaches Google -- the
// transport is a double -- but the route asks every machine the same question.
process.env.SHIN_GEMINI_TIER = 'paid';
const { server, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { openScanStore, allScans } = await import('../src/scans.ts');
import type { MessagesClient } from '../../identify/src/model.ts';

let port = 0;

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  setGeminiTransportForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

/* ----------------------------- the doubles ----------------------------- */

/**
 * What the model says it read off the pack.
 *
 * Every field of the extract schema, both the fields that were there before
 * 2026-09-09 and the ones the two-pass rewrite added, because the double has
 * to satisfy whichever version of `identify/src` it is run against and an
 * absent array is a crash rather than a null.
 */
const READING = {
  front_text: ['KRAFT DINNER', 'Original', '225 g'],
  barcode_digits: null,
  count: null,
  language_seen: 'en',
  brand: 'Kraft',
  name: 'Dinner',
  variant: 'Original',
  size_value: 225,
  size_unit: 'g',
  category: 'grocery',
  visible_text: 'KRAFT DINNER Original 225 g',
  alternates: [],
  self_confidence: 0.9,
  uncertainty: null,
};

/** A client that answers once, in the shape `parseJson` reads. */
function answeringClient(payload: unknown): MessagesClient {
  return {
    messages: {
      create: async () =>
        ({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        }) as never,
    },
  };
}

/** A client that never answers, in the way an aborted call looks. */
function abortingClient(): MessagesClient {
  return {
    messages: {
      create: async () => {
        throw Object.assign(new Error('the request was aborted'), { name: 'AbortError' });
      },
    },
  };
}

/** A photo scan is one Gemini call now; a recorded Gemini answers where the recorded Identifier stood. */
const useModel = (_client?: MessagesClient) => setGeminiTransportForTests(fakeTransport().transport);

/* ------------------------------ fixtures ------------------------------- */

/** A real 1x1 PNG, so the magic-byte check is reading a genuine header. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
/** JFIF: the SOI marker and an APP0 header. Enough to be a JPEG on the wire. */
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF\0', 'ascii'),
  Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
]);

function postPhoto(body: unknown, raw?: string) {
  return fetch(`http://127.0.0.1:${port}/api/identify/photo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

const photoRows = () => allScans(openScanStore()).filter((r) => r.kind === 'photo');

/* ------------------------------- the tests ------------------------------ */

test('a PNG Gemini reads comes back as an unchecked answer, from the one call', async () => {
  const t = fakeTransport();
  setGeminiTransportForTests(t.transport);
  const res = await postPhoto({ image: PNG_1x1.toString('base64'), sharpness: 80, deviceId: 'png-device' });
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { product: unknown; unchecked: { name: string } | null; failure: string | null; reason: string };
  assert.equal(seen.product, null, 'a catalogue product answered a photo scan');
  assert.equal(seen.unchecked?.name, 'Kraft Dinner Original');
  assert.equal(seen.reason, 'unchecked');
  assert.equal(seen.failure, null);
  assert.equal(t.calls.length, 1, 'a photo scan must be exactly one Gemini call');
});

test('the scan row for that call is one row, kind photo, outcome answered', async () => {
  const rows = photoRows().filter((r) => r.device_id === 'png-device');
  assert.equal(rows.length, 1, 'a photo call wrote something other than exactly one row');
  assert.equal(rows[0].outcome, 'answered');
  assert.equal(rows[0].failure_class, null);
  assert.equal(rows[0].source, 'gemini');
  assert.match(rows[0].query_text ?? '', /^Kraft Dinner Original/);
});

test('a JPEG payload is accepted, not just a PNG', async () => {
  useModel();
  const res = await postPhoto({ image: JPEG.toString('base64'), deviceId: 'jpeg-device' });
  assert.equal(res.status, 200);
  const seen = (await res.json()) as { unchecked: unknown };
  assert.ok(seen.unchecked, 'a JPEG was refused where a PNG was accepted');
});

test('a body over the 3 MiB cap is refused with a 413', async () => {
  const over = JSON.stringify({ image: PNG_1x1.toString('base64'), pad: 'x'.repeat(3 * 1024 * 1024) });
  assert.ok(Buffer.byteLength(over) > 3 * 1024 * 1024);
  const res = await postPhoto(null, over);
  assert.equal(res.status, 413);
  const seen = (await res.json()) as { error: string };
  assert.match(seen.error, /over the 3145728 byte limit/);
});

test('a body under the cap that is not JSON is a 400, not a 413 and not a 500', async () => {
  const res = await postPhoto(null, 'this is not JSON at all');
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /did not parse as JSON/);
});

test('base64 that is not an image is refused before a model call is spent', async () => {
  const t = fakeTransport();
  setGeminiTransportForTests(t.transport);
  const res = await postPhoto({ image: Buffer.from('hello there').toString('base64') });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /PNG or a JPEG/);
  assert.equal(t.calls.length, 0, 'the route reached Gemini for something that is not an image');
});

test('a missing image field is a 400', async () => {
  const res = await postPhoto({ sharpness: 40 });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /image is required/);
});

test('a model that times out is a 200 carrying the class, never a 500', async () => {
  process.env.SHIN_GEMINI_TIMEOUT_MS = '25';
  setGeminiTransportForTests(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('the request was aborted')));
      }),
  );
  try {
    const res = await postPhoto({ image: PNG_1x1.toString('base64'), sharpness: 90, deviceId: 'timeout-device' });
    assert.equal(res.status, 200, 'a model failure reached the client as a server error');
    const seen = (await res.json()) as { product: unknown; failure: string; reason: string; categoryWhy: string; lowConfidence: boolean };
    assert.equal(seen.product, null);
    assert.equal(seen.failure, 'model_timeout');
    assert.equal(seen.reason, 'model_timeout');
    assert.equal(seen.lowConfidence, true);
    // Hard rule 3: the sentence is about the photograph and the repair, never
    // about our timeouts.
    assert.doesNotMatch(seen.categoryWhy, /timeout|model|rate limit/i);
  } finally {
    delete process.env.SHIN_GEMINI_TIMEOUT_MS;
  }
});

test('the timed-out call is logged with failure_class model_timeout', async () => {
  const rows = photoRows().filter((r) => r.device_id === 'timeout-device');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, 'refused');
  assert.equal(rows[0].failure_class, 'model_timeout');
});

test('the thirty-first photo in ten minutes is refused, and the thirtieth is not', async () => {
  useModel(answeringClient(READING));
  const body = { image: PNG_1x1.toString('base64'), sharpness: 80, deviceId: 'greedy-device' };
  let last: Response | null = null;
  for (let i = 0; i < 30; i += 1) {
    last = await postPhoto(body);
    assert.equal(last.status, 200, `call ${i + 1} was refused before the limit`);
    await last.json();
  }
  const over = await postPhoto(body);
  assert.equal(over.status, 429);
  const seen = (await over.json()) as { error: string };
  // A plain sentence, not a code and not a header the screen has to translate.
  assert.match(seen.error, /photos in a short time/);

  // The ceiling is this route and this device, not the server.
  const other = await postPhoto({ ...body, deviceId: 'patient-device' });
  assert.equal(other.status, 200);
  await other.json();
});
