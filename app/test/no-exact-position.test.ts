/**
 * Requirement 5.6 (docs/price-category-requirements-2026-10-01.md): "Keep
 * consent off by default; store only a coarse area, never exact GPS. Pass when:
 * 0 exact positions stored." Plan Part 6, 5.6: "Consent off by default; area
 * coarse by construction", diagnosed by a column audit. RULINGS.md "Location
 * and photo consent default off until answered": "only a coarse kilometre-wide
 * cell is stored, never exact GPS".
 *
 * Written before the fix. What the code did on 2026-10-09: `locationFor`
 * already nulled the four exact columns on a scan, but `/api/event` and
 * `/api/events/batch` stored any payload whole (events.ts said coordinates
 * were allowed), the access log kept the full URL including any `lat=`/`lon=`
 * an old client sent, and nothing in the database refused an exact position.
 *
 * The audit is structural so a column or payload added later is caught too:
 * every column of every table whose NAME reads like a position must be empty,
 * every text value anywhere must hold no precise coordinate pair and no JSON
 * key that names a position, and every stored cell must be the two-decimal
 * grid. Controls: the coarse cell is still stored when location consent is on,
 * the non-position parts of an event survive, and the consent event's own
 * `location: true` survives (a scrubber that dropped every key named
 * "location" would fail here).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { startHarness, TATERS, type Harness } from './customer-data-harness.ts';

let h: Harness;
before(async () => {
  h = await startHarness('no-exact-pos');
});
after(async () => {
  await h.close();
});

const LAT = 43.123456;
const LON = -79.654321;
const PAIR = `${LAT},${LON}`;

/** Key names that mean an exact position, whatever case or separator a client used. */
const POSITION_KEY = /^(lat|lng|lon|long|latitude|longitude|accuracy|altitude|altitudeaccuracy|heading|coords|coordinates|gps|geo|geolocation|position|exactlat|exactlon|exactaccuracy|exactat|locatedat)$/;
const POSITION_COLUMN = /(^|_)(lat|lon|lng|latitude|longitude|accuracy|gps|coord|coords|coordinates|geo|position)(_|$)/;
/** Three or more decimals on both halves: finer than the kilometre grid. */
const PRECISE_PAIR = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/;
const GRID_CELL = /^-?\d{1,2}\.\d{2},-?\d{1,3}\.\d{2}$/;

function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) keysOf(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k.toLowerCase().replace(/[^a-z]/g, ''));
      keysOf(v, out);
    }
  }
  return out;
}

/** Every exact position found anywhere in the scan database, as human-readable findings. */
function auditDatabase(path: string): string[] {
  const findings: string[] = [];
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    for (const table of tables) {
      const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
      for (const col of cols) {
        if (POSITION_COLUMN.test(col.toLowerCase())) {
          const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} IS NOT NULL`).get() as { n: number }).n;
          if (n > 0) findings.push(`${table}.${col}: ${n} non-null rows`);
        }
      }
      const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      for (const row of rows) {
        for (const [col, value] of Object.entries(row)) {
          if (typeof value !== 'string') continue;
          if (PRECISE_PAIR.test(value)) findings.push(`${table}.${col}: precise coordinate pair in ${value.slice(0, 120)}`);
          if (col === 'cell' && !GRID_CELL.test(value)) findings.push(`${table}.cell is not the grid: ${value}`);
          if (value.startsWith('{') || value.startsWith('[')) {
            try {
              const bad = keysOf(JSON.parse(value)).filter((k) => POSITION_KEY.test(k));
              if (bad.length) findings.push(`${table}.${col}: position keys ${bad.join(',')} in ${value.slice(0, 120)}`);
            } catch {
              /* not JSON; the pair check above still ran */
            }
          }
        }
      }
    }
  } finally {
    db.close();
  }
  return findings;
}

function auditAccessLog(path: string): string[] {
  if (!existsSync(path)) return [];
  const findings: string[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let url = '';
    try {
      url = decodeURIComponent(String(JSON.parse(line).url ?? ''));
    } catch {
      url = line;
    }
    if (PRECISE_PAIR.test(url)) findings.push(`access.log: precise pair in ${url}`);
    if (/[?&](lat|lon|lng|latitude|longitude|accuracy|locatedAt)=/i.test(url)) findings.push(`access.log: position parameter in ${url}`);
  }
  return findings;
}

test('5.6: consent is off by default, so a device that never answered keeps no area at all', async () => {
  const res = await h.get(`/api/identify?gtin=${TATERS}&deviceId=pos-never&cell=${encodeURIComponent(PAIR)}&lat=${LAT}&lon=${LON}`);
  const [row] = h.rows<Record<string, unknown>>('SELECT * FROM scan WHERE id = ?', res.scanId as number);
  assert.equal(row!.cell, null, 'a cell was kept for a device that never consented');
  assert.equal(row!.store_name, null);
});

test('5.6: exact positions sent every way a client can send them reach no storage; the coarse cell does', async () => {
  const device = 'pos-yes';
  const consent = await h.post('/api/consent', { deviceId: device, photos: false, location: true });
  assert.equal(consent.body.stored, true);

  // Identify by query string, with an over-precise cell and the four exact fields an old client sent.
  const q = `cell=${encodeURIComponent(PAIR)}&lat=${LAT}&lon=${LON}&accuracy=4.2&locatedAt=2026-10-09T12:00:00Z`;
  const scanned = await h.get(`/api/identify?gtin=${TATERS}&deviceId=${device}&${q}`);
  const [row] = h.rows<Record<string, unknown>>('SELECT * FROM scan WHERE id = ?', scanned.scanId as number);
  assert.equal(row!.cell, '43.12,-79.65', 'control: the coarse cell is the one location fact kept');

  // One event, every position shape inside it, plus fields that must survive.
  const one = await h.post('/api/event', {
    deviceId: device,
    type: 'scan_started',
    payload: {
      note: 'kept',
      lat: LAT,
      longitude: LON,
      accuracy: 3,
      coords: { latitude: LAT, longitude: LON },
      where: PAIR,
      nested: [{ Lat: LAT, Lng: LON, label: 'kept too' }],
    },
  });
  assert.equal(one.status, 200);
  assert.equal(one.body.stored, true, 'control: the event itself must still be recorded');

  // The batch door.
  const batch = await h.post('/api/events/batch', {
    events: [
      { deviceId: device, type: 'tap', payload: { screen: 'camera', position: { lat: LAT, lon: LON } } },
      { deviceId: device, type: 'tap', payload: { screen: 'camera', gps: PAIR } },
    ],
  });
  assert.equal(batch.body.stored, 2);

  // A correction carrying the exact fields too.
  await h.post('/api/correction', { deviceId: device, scanId: scanned.scanId, priceCents: 399, cell: PAIR, lat: LAT, lon: LON });

  const findings = [...auditDatabase(h.scansPath), ...auditAccessLog(h.accessLogPath)];
  assert.deepEqual(findings, [], `exact positions reached storage:\n${findings.join('\n')}`);

  // Controls: what is not a position survived.
  const events = h.rows<{ type: string; payload: string | null }>('SELECT type, payload FROM event WHERE device_id = ? ORDER BY id', device);
  const started = events.find((e) => e.type === 'scan_started');
  assert.ok(started, 'the event was not stored');
  const payload = JSON.parse(started!.payload!);
  assert.equal(payload.note, 'kept');
  assert.equal(payload.nested[0].label, 'kept too');
  assert.equal(payload.where, '43.12,-79.65', 'a precise pair in a free field is snapped to the grid, not kept');
  const consentEvent = events.find((e) => e.type === 'consent_change');
  assert.ok(consentEvent, 'the consent change event is missing');
  assert.equal(JSON.parse(consentEvent!.payload!).location, true, 'the consent answer itself was scrubbed');
});

test('5.6 known-bad: the database refuses an exact position written around the app code', async () => {
  const db = new DatabaseSync(h.scansPath);
  try {
    const id = (db.prepare('SELECT id FROM scan LIMIT 1').get() as { id: number }).id;
    assert.throws(() => db.prepare('UPDATE scan SET exact_lat = ? WHERE id = ?').run(LAT, id), /exact position/i);
    assert.throws(
      () => db.prepare("INSERT INTO event (device_id, type, payload, created_at) VALUES ('raw', 't', ?, 'now')").run(JSON.stringify({ lat: LAT })),
      /exact position/i,
    );
    // Control: an event with no position still inserts.
    db.prepare("INSERT INTO event (device_id, type, payload, created_at) VALUES ('raw', 't', ?, 'now')").run(JSON.stringify({ on: true }));
  } finally {
    db.close();
  }
});

test('5.6 known-bad: recordScan handed an exact reading writes none of it, and says so loudly', async () => {
  const { recordScan, getScan } = await import('../src/scans.ts');
  const { customerDataFaults } = await import('../src/customer-data-faults.ts');
  const before = customerDataFaults().exact_position_dropped ?? 0;
  const id = recordScan({ deviceId: 'pos-direct', kind: 'barcode', query: '1', outcome: 'answered', exactLat: LAT, exactLon: LON, exactAccuracy: 3 });
  assert.ok(id, 'the scan itself must still be recorded (always answer)');
  const row = getScan(id!)!;
  assert.equal(row.exact_lat, null);
  assert.equal(row.exact_lon, null);
  assert.equal(row.exact_accuracy, null);
  assert.ok((customerDataFaults().exact_position_dropped ?? 0) > before, 'the dropped position was not counted');
});
