/**
 * Claude cost attack tests, V3 (d) of the 2026-11-16 check. Each test asserts the SAFE behaviour; a
 * failure is a hole. The fake Claude counts every product name it is sent, so "how many Claude
 * calls can one caller force" is a count, not a guess. Nothing leaves the machine.
 *
 * Every request carries cf-connecting-ip, exactly as the Cloudflare tunnel sends it, because a
 * request without it reads as local and skips the per-address limits. The default limits are in
 * force (door 1200 per 10 min, paid calls 90 per 10 min per address and 200 per 10 min per code).
 * With no invite required every caller shares the one code bucket, "open".
 *
 * The measured counts are printed as diagnostics (the lines starting "# measured") and quoted in
 * docs/security-check/v3-route-access.md.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './security-harness.mjs';

const h = await boot({ products: 3, consent: true });
after(() => h.close());

let n = 0;
const name = () => `Zzqx Cost Probe ${(n += 1)} Brandless`;
const ask = (device, ip, extra = {}) =>
  h.get(
    `/api/identify?text=${encodeURIComponent(name())}&countryCode=CA&region=Ontario&deviceId=${device}`,
    { 'x-shin-claude': '1', 'cf-connecting-ip': ip, ...extra },
  );
const addr = (i) => `203.0.${Math.floor(i / 250)}.${(i % 250) + 1}`;
const reset = () => h.mod.resetPaidCallLimitersForTests(process.env);

test('d1: one address cannot force more than 90 Claude calls in ten minutes', async (t) => {
  reset();
  const before = h.claude.asked.length;
  for (let i = 0; i < 150; i += 1) await ask(`device-cost-a${i % 3}-0001`, '198.51.100.1');
  const sent = h.claude.asked.length - before;
  t.diagnostic(`measured: one address, 150 typed names, ${sent} Claude calls`);
  assert.ok(sent <= 90, `${sent} Claude calls from one address in one burst`);
});

test('d2: one device id cannot force more Claude calls than one address can, however many addresses it uses', async (t) => {
  reset();
  const before = h.claude.asked.length;
  for (let i = 0; i < 300; i += 1) await ask('device-cost-single-0002', addr(i));
  const sent = h.claude.asked.length - before;
  t.diagnostic(`measured: one device id over 300 different claimed addresses, ${sent} Claude calls`);
  assert.ok(sent <= 90, `one device id forced ${sent} Claude calls in one burst`);
});

test('d3: many fresh device ids from one address cannot force more than the address limit either', async (t) => {
  reset();
  const before = h.claude.asked.length;
  for (let i = 0; i < 150; i += 1) await ask(`fresh-cost-id-${i}-000`, '198.51.100.3');
  const sent = h.claude.asked.length - before;
  t.diagnostic(`measured: 150 fresh device ids, one address, ${sent} Claude calls`);
  assert.ok(sent <= 90, `${sent} Claude calls from one address across fresh device ids`);
});

test('d4: many fresh devices over many addresses stay under the shared 200 per ten minutes', async (t) => {
  reset();
  const before = h.claude.asked.length;
  for (let i = 0; i < 400; i += 1) await ask(`fresh-cost-id-${i}-100`, addr(i));
  const sent = h.claude.asked.length - before;
  t.diagnostic(`measured: 400 fresh devices over 400 claimed addresses, ${sent} Claude calls in one burst`);
  assert.ok(sent <= 200, `${sent} Claude calls across the shared bucket`);
});

test('d5: when one caller has used up the shared Claude allowance, a different shopper still gets an estimate', async () => {
  // The bucket is empty after d4 (no reset here on purpose). A shopper from a new address asks once.
  const before = h.claude.asked.length;
  const r = await ask('device-honest-shopper-0005', '192.0.2.77');
  assert.equal(r.status, 200);
  assert.equal(h.claude.asked.length, before + 1, 'the honest shopper was refused a Claude estimate because someone else used up the shared bucket');
});

test('d6: when the monthly cap is reached the server stops calling Claude and says so out loud', async (t) => {
  reset();
  process.env.SHIN_RANGE_ASK_MONTHLY_CAP = '1';
  const lines = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  const realWarn = console.warn;
  const realError = console.error;
  process.stderr.write = (chunk, ...rest) => {
    lines.push(String(chunk));
    return realWrite(chunk, ...rest);
  };
  console.warn = (...a) => {
    lines.push(a.join(' '));
    realWarn(...a);
  };
  console.error = (...a) => {
    lines.push(a.join(' '));
    realError(...a);
  };
  let health;
  const before = h.claude.asked.length;
  try {
    for (let i = 0; i < 6; i += 1) await ask('device-cap-0007', '198.51.100.7');
    health = await (await h.get('/api/health', {})).json();
  } finally {
    process.stderr.write = realWrite;
    console.warn = realWarn;
    console.error = realError;
    delete process.env.SHIN_RANGE_ASK_MONTHLY_CAP;
  }
  const sent = h.claude.asked.length - before;
  t.diagnostic(`measured: cap set to 1, 6 attempts, ${sent} Claude call(s)`);
  assert.ok(sent <= 1, `the cap was 1 and ${sent} calls were sent`);
  const spoke = lines.some((l) => /cap/i.test(l) && /(range|claude|monthly)/i.test(l));
  const healthSays = JSON.stringify(health).toLowerCase().includes('cap');
  assert.ok(spoke || healthSays, 'the monthly cap was hit and nothing in the log or on the health page said so');
});

test('d7: the pack read cap and the developer gate hold under a flood of frames from fresh devices', async () => {
  reset();
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const before = h.claude.frames;
  for (let i = 0; i < 40; i += 1) {
    await h.post('/api/identify/pack', { frame: PNG, deviceId: `fresh-pack-id-${i}-0000` }, { 'x-shin-claude': '1', 'cf-connecting-ip': addr(i + 5000) });
  }
  assert.equal(h.claude.frames, before, 'a non-developer made the server send a frame to Claude');
});

test('d8: unique map cells from one address cannot each cause an outbound Overpass lookup', async (t) => {
  reset();
  let outbound = 0;
  h.mod.setStoreFetcherForTests(async () => {
    outbound += 1;
    return JSON.stringify({ elements: [] });
  });
  try {
    for (let i = 0; i < 100; i += 1) {
      const lat = (40 + (i % 50) * 0.01).toFixed(2);
      const lon = (-80 + Math.floor(i / 50) * 0.01).toFixed(2);
      await h.get(`/api/stores?cell=${lat},${lon}`, { 'cf-connecting-ip': '198.51.100.8' });
    }
  } finally {
    h.mod.setStoreFetcherForTests(null);
  }
  t.diagnostic(`measured: 100 unique map cells from one address, ${outbound} outbound Overpass lookups`);
  assert.ok(outbound <= 30, `${outbound} outbound Overpass lookups from one address in one burst`);
});
