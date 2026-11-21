// Looks each barcode up the way the phone does a scan: GET /api/identify?gtin=...&deviceId=probe-review-functions
// No x-shin-claude header (no Claude call). Writes answers.jsonl (raw fields) one line per barcode.
import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
const dir = new URL('.', import.meta.url);
const list = JSON.parse(readFileSync(new URL('barcodes.json', dir), 'utf8'));
const limit = Number(process.argv[2] ?? 200);
const outFile = new URL('answers.jsonl', dir);
const done = new Set(existsSync(outFile) ? readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).code) : []);
let batchNo = Number(process.env.BATCH ?? 1); let used = 0; let DEVICE = 'probe-review-functions-' + String(batchNo).padStart(2, '0');
let n = 0;
for (const item of list) {
  if (n >= limit) break;
  if (done.has(item.code)) continue;
  n++; if (used >= 9) { batchNo++; used = 0; DEVICE = 'probe-review-functions-' + String(batchNo).padStart(2, '0'); } used++;
  const url = `https://relay.anjiawenda.com/api/identify?gtin=${item.code}&deviceId=${DEVICE}`;
  const t = Date.now();
  let status = 0, body = null, err = null;
  try {
    const r = await fetch(url, { headers: { 'x-shin-device': DEVICE } });
    status = r.status;
    body = await r.json().catch(() => null);
  } catch (e) { err = String(e); }
  const rec = { device: DEVICE, ...item, status, err, ms: Date.now() - t, body };
  appendFileSync(outFile, JSON.stringify(rec) + '\n');
  if (status === 402 || status === 429) { console.error('stopped at', item.code, status, JSON.stringify(body)); break; }
  await new Promise((r) => setTimeout(r, 400));
}
console.error('requested', n);
