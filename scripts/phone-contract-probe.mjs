#!/usr/bin/env node
/**
 * Phone contract probe: does the live server answer the packaged phone app?
 *
 * WHY THIS EXISTS (2026-11-07). Every test in app/test runs the app and the server on one origin,
 * so the browser's cross-origin rules never run. The packaged app runs at capacitor://localhost and
 * calls the server at another origin with custom headers, so every call is preflighted. From
 * 2026-10-28 the server refused every preflight and the phone app never completed one real call
 * (78,168 preflights, 0 POSTs, per the Mac's request log), while every test passed. This script
 * sends each request exactly as the phone does and applies the browser's own rules to the answers.
 *
 * WHAT IT SENDS. For every route the client code calls (app/public/js/api.js):
 *   1. the preflight a WebView sends (OPTIONS, Origin, Access-Control-Request-Method/-Headers);
 *   2. the real request, with the app's headers (api.js headers()).
 * GET routes are sent as the app sends them. The scan is /api/identify with preview=1, which the
 * server answers with the name alone: no scan row, no free scan counted, no model call (api.js
 * R-36). POST routes get a deliberately unparseable body, so a request that passes the door is
 * refused by the handler's own parser and nothing is written; that still shows whether the door
 * (origin rule, invite gate, device check) lets the phone through.
 *
 * WHAT IT CAN STILL WRITE. One probe device id, prefixed "probe-", may be bound to its key on the
 * first request (app/src/device-key.ts), and the access log records every request. /api/search may
 * record a typed search. Nothing else. /api/shutter/frame and /api/shelf/frame get the preflight
 * only, because their real requests upload images; /api/identify/demo too, because its GET records
 * a scan row. Checked against both the live code (741c3c8) and main (c093b96) on 2026-11-07: every
 * POST route sent here answers an unparseable body with 400 before writing anything.
 *
 * VERDICT PER ROUTE, by the browser's rules (Fetch standard, CORS protocol):
 *   preflight passes  = status 2xx AND Access-Control-Allow-Origin is the origin or "*"
 *                       AND every requested header is in Access-Control-Allow-Headers (or "*")
 *                       AND the method is GET/HEAD/POST or listed in Access-Control-Allow-Methods
 *   response readable = the real response carries Access-Control-Allow-Origin for the origin
 *   door passed       = the real status is not 401/403 (gate, origin rule, device check), not 405
 *   PHONE OK          = all three. Same-origin runs (--origin equal to the server's) skip the
 *                       CORS checks, as a browser does, so the script can be seen to pass.
 *
 * USAGE
 *   node scripts/phone-contract-probe.mjs [--base URL] [--origin ORIGIN] [--invite CODE] [--json]
 *   defaults: --base https://relay.anjiawenda.com  --origin capacitor://localhost
 * EXIT: 0 every route PHONE OK; 1 any route fails; 2 the server could not be reached at all.
 */

import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const BASE = arg('base', 'https://relay.anjiawenda.com').replace(/\/+$/, '');
const ORIGIN = arg('origin', 'capacitor://localhost');
const INVITE = arg('invite', '');
const AS_JSON = args.includes('--json');
const SAME_ORIGIN = new URL(BASE).origin === ORIGIN;

const DEVICE = `probe-${new Date().toISOString().slice(0, 10)}-${randomBytes(4).toString('hex')}`;
const DEVICE_KEY = randomBytes(16).toString('hex');
const GTIN = '0066721005694'; // a barcode the live catalogue answered on 2026-10-11 (Mac's scan log)
const BAD_BODY = '{"probe": '; // unparseable on purpose: a handler that reads it must refuse it

/** The headers api.js headers() sends on every request (no shutter, no Plus, no Claude yes). */
function appHeaders(extra = {}) {
  const h = {
    'x-shin-locale': 'en-CA',
    'x-shin-lang': 'en',
    'x-shin-device': DEVICE,
    'x-shin-device-key': DEVICE_KEY,
    ...extra,
  };
  if (INVITE) h['x-shin-invite'] = INVITE;
  return h;
}

const q = (o) => new URLSearchParams(o).toString();
/** Every route in app/public/js, with the method the app uses. kind: get | post | preflight-only */
const ROUTES = [
  { kind: 'get', path: `/api/identify?${q({ gtin: GTIN, preview: '1', deviceId: DEVICE })}`, label: 'scan a barcode (preview)' },
  { kind: 'get', path: `/api/search?${q({ q: 'oreo', limit: '5', deviceId: DEVICE })}`, label: 'typed search' },
  // Preflight only: GET /api/identify/demo records a scan row (server.ts recordScan in the demo branch).
  { kind: 'preflight-only', method: 'GET', path: '/api/identify/demo', label: 'demo scan' },
  { kind: 'get', path: '/api/quota', label: 'scans left this week' },
  { kind: 'get', path: `/api/consent?${q({ deviceId: DEVICE })}`, label: 'read consent' },
  { kind: 'get', path: `/api/scans?${q({ deviceId: DEVICE })}`, label: 'past scans' },
  { kind: 'get', path: `/api/stores?${q({ cell: '43.65,-79.38' })}`, label: 'nearby stores' },
  { kind: 'get', path: '/api/store-chains', label: 'store chains' },
  { kind: 'get', path: '/api/catalogue', label: 'catalogue status' },
  { kind: 'get', path: '/api/categories', label: 'categories' },
  { kind: 'get', path: '/api/scenarios', label: 'scenarios' },
  { kind: 'get', path: '/api/attribution', label: 'data licences screen' },
  { kind: 'post', path: '/api/price', label: 'price a scan' },
  { kind: 'post', path: '/api/match-text', label: 'match pack text' },
  { kind: 'post', path: '/api/identify/pack', label: 'read the pack' },
  { kind: 'post', path: '/api/identify/photo', label: 'identify by photo' },
  { kind: 'post', path: '/api/correction', label: 'correct an answer' },
  { kind: 'post', path: '/api/consent', label: 'save consent' },
  { kind: 'post', path: '/api/event', label: 'usage event' },
  { kind: 'post', path: '/api/events/batch', label: 'usage events batch' },
  { kind: 'post', path: '/api/scan-rating', label: 'rate a scan' },
  { kind: 'post', path: '/api/scan-rating/delete', label: 'delete a rating' },
  { kind: 'post', path: '/api/scan-price', label: 'enter a price' },
  { kind: 'post', path: '/api/scan-call', label: 'record buy or skip' },
  { kind: 'post', path: '/api/scan-pick', label: 'pick the right product' },
  { kind: 'post', path: '/api/scan/0/outcome', label: 'scan outcome' },
  { kind: 'preflight-only', path: '/api/shelf/frame', label: 'shelf photo upload' },
  { kind: 'preflight-only', path: '/api/shutter/frame', label: 'shutter frame upload' },
];

function originAllowed(res) {
  const v = res.headers.get('access-control-allow-origin');
  return v === '*' || v === ORIGIN;
}

function listHas(headerValue, wanted) {
  if (!headerValue) return false;
  const items = headerValue.split(',').map((s) => s.trim().toLowerCase());
  return items.includes('*') || items.includes(wanted.toLowerCase());
}

async function send(url, init) {
  try {
    const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const text = await res.text().catch(() => '');
    return { res, text };
  } catch (err) {
    return { error: String(err?.cause?.code ?? err?.message ?? err) };
  }
}

function bodyWhy(text) {
  try {
    const b = JSON.parse(text);
    return typeof b?.error === 'string' ? b.error.slice(0, 90) : '';
  } catch {
    return '';
  }
}

async function probe(route) {
  const method = route.method ?? (route.kind === 'get' ? 'GET' : 'POST');
  const reqHeaders = appHeaders(method === 'POST' ? { 'content-type': 'application/json' } : {});
  const url = `${BASE}${route.path}`;
  const out = { route: route.path.split('?')[0], label: route.label, method, problems: [] };

  // 1. The preflight.
  if (SAME_ORIGIN) {
    out.preflight = 'n/a (same origin)';
  } else {
    const requested = Object.keys(reqHeaders).map((k) => k.toLowerCase()).sort();
    const p = await send(url, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': requested.join(','),
      },
    });
    if (p.error) {
      out.preflight = `network error ${p.error}`;
      out.problems.push('preflight did not complete');
    } else {
      const { res } = p;
      out.preflight = String(res.status);
      if (res.status < 200 || res.status > 299) out.problems.push(`preflight answered ${res.status}, needs 2xx`);
      if (!originAllowed(res)) out.problems.push('preflight has no Access-Control-Allow-Origin for the app');
      const allowH = res.headers.get('access-control-allow-headers');
      const missing = requested.filter((h) => !listHas(allowH, h));
      if (missing.length) out.problems.push(`headers not allowed: ${missing.join(', ')}`);
      const allowM = res.headers.get('access-control-allow-methods');
      if (!['GET', 'HEAD', 'POST'].includes(method) && !listHas(allowM, method)) out.problems.push(`method ${method} not allowed`);
    }
  }

  // 2. The real request.
  if (route.kind === 'preflight-only') {
    out.status = 'not sent (it would write)';
  } else {
    const r = await send(url, {
      method,
      headers: SAME_ORIGIN ? reqHeaders : { ...reqHeaders, Origin: ORIGIN },
      ...(method === 'POST' ? { body: BAD_BODY } : {}),
    });
    if (r.error) {
      out.status = `network error ${r.error}`;
      out.problems.push('request did not complete');
    } else {
      const s = r.res.status;
      out.status = String(s);
      const why = bodyWhy(r.text);
      if (why) out.why = why;
      if (!SAME_ORIGIN && !originAllowed(r.res)) out.problems.push('response has no Access-Control-Allow-Origin, so the app cannot read it');
      if (s === 401 || s === 403) out.problems.push(`refused at the door (${s})`);
      else if (s === 405) out.problems.push('method not allowed (405)');
      else if (s >= 500) out.problems.push(`server error ${s}`);
      else if (s === 404) out.problems.push('route not found or switched off (404)');
      else if (s === 429) out.problems.push('rate limited (429)');
      else if (method === 'GET' && (s < 200 || s > 299)) out.problems.push(`GET answered ${s}`);
      // A POST answered 400 by its own parser passed the door: that is the expected result here.
    }
  }

  out.ok = out.problems.length === 0;
  return out;
}

async function main() {
  const health = await send(`${BASE}/api/health`, { headers: SAME_ORIGIN ? {} : { Origin: ORIGIN } });
  if (health.error) {
    console.error(`SERVER UNREACHABLE: ${BASE}/api/health: ${health.error}`);
    process.exit(2);
  }
  let startedAt = 'unknown';
  try {
    startedAt = JSON.parse(health.text).startedAt ?? 'unknown';
  } catch {
    /* health body not JSON: reported as unknown, the probe still runs */
  }

  const results = [];
  for (const r of ROUTES) results.push(await probe(r)); // one at a time: the door limiter is per address

  const failed = results.filter((r) => !r.ok);
  if (AS_JSON) {
    console.log(JSON.stringify({ base: BASE, origin: ORIGIN, device: DEVICE, startedAt, results }, null, 2));
  } else {
    console.log(`Phone contract probe  ${new Date().toISOString()}`);
    console.log(`server ${BASE} (started ${startedAt})  origin ${ORIGIN}${SAME_ORIGIN ? ' (same origin: CORS checks skipped)' : ''}`);
    console.log(`probe device ${DEVICE}\n`);
    for (const r of results) {
      const mark = r.ok ? 'OK  ' : 'FAIL';
      console.log(`${mark} ${r.method.padEnd(4)} ${r.route.padEnd(24)} ${r.label}`);
      console.log(`       preflight ${r.preflight}, request ${r.status}${r.why ? `, "${r.why}"` : ''}`);
      for (const p of r.problems) console.log(`       - ${p}`);
    }
    console.log(`\n${results.length - failed.length} of ${results.length} routes work for origin ${ORIGIN}; ${failed.length} fail.`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('PROBE CRASHED:', err);
  process.exit(2);
});
