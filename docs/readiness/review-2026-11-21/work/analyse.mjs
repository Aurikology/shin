import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url);
const rows = readFileSync(new URL('answers.jsonl', dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const csvEsc = (s) => { s = String(s ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const out = [['group', 'barcode', 'off_name', 'status', 'outcome', 'found', 'priced', 'verdict', 'confidence', 'verdict_basis', 'range_low', 'range_median', 'range_high', 'range_basis', 'range_n', 'pexi_name', 'pexi_brand', 'pexi_size', 'ms']];
const odd = [];
const c = { total: rows.length, found: 0, priced: 0, verdict: 0, s402: 0, s_other: 0, hiConf: 0 };
for (const r of rows) {
  const b = r.body ?? {};
  const found = r.status === 200 && b.outcome === 'catalogue_hit' && b.identity != null;
  const priced = found && b.range != null && b.range.medianCents != null;
  const verdict = found && b.verdict != null;
  if (r.status === 402) c.s402++; else if (r.status !== 200) c.s_other++;
  if (found) c.found++; if (priced) c.priced++; if (verdict) c.verdict++;
  if (verdict && b.verdict.confidence === 'high') c.hiConf++;
  const rg = b.range ?? {};
  out.push([r.group, r.code, r.name, r.status, b.outcome ?? '', found, priced, verdict ? (b.verdict.kind ?? 'yes') : '', b.verdict?.confidence ?? '', b.verdict?.basis ?? '', rg.lowCents != null ? (rg.lowCents / 100).toFixed(2) : '', rg.medianCents != null ? (rg.medianCents / 100).toFixed(2) : '', rg.highCents != null ? (rg.highCents / 100).toFixed(2) : '', rg.basis ?? '', rg.n ?? '', b.identity?.name ?? '', b.identity?.brand ?? '', b.identity?.size ?? '', r.ms]);
  const why = [];
  if (verdict && !priced) why.push('verdict with no price');
  if (found && !priced) why.push('found but no price: ' + (b.noRangeReason ?? ''));
  if (priced && rg.basis !== 'this_product') why.push('range is ' + rg.basis + ' (n=' + rg.n + ') not this product');
  if (priced && rg.highCents > 3 * rg.lowCents) why.push('wide range ' + rg.lowCents + '-' + rg.highCents);
  if (priced && rg.medianCents > 5000) why.push('median over $50');
  if (priced && rg.medianCents < 100) why.push('median under $1');
  if (found && b.identity?.name && r.name) { // crude name agreement: share of >3-letter words
    const words = (s) => new Set(String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
    const a = words(r.name), bb = words(b.identity.name + ' ' + (b.identity.brand ?? ''));
    let hit = 0; for (const w of a) if (bb.has(w)) hit++;
    if (a.size && hit === 0) why.push('name differs from Open Food Facts: ' + r.name + ' vs ' + b.identity.name);
  }
  if (why.length) odd.push({ code: r.code, group: r.group, off_name: r.name, pexi: b.identity?.name, size: b.identity?.size, median: rg.medianCents, why });
}
writeFileSync(new URL('../answers.csv', dir), out.map((l) => l.map(csvEsc).join(',')).join('\n') + '\n');
writeFileSync(new URL('odd.json', dir), JSON.stringify(odd, null, 1));
const byGroup = {};
for (const r of rows) { const g = (byGroup[r.group] ??= { n: 0, found: 0, priced: 0 }); g.n++; const b = r.body ?? {}; if (b.outcome === 'catalogue_hit') g.found++; if (b.range?.medianCents != null) g.priced++; }
console.log(JSON.stringify(c), '\nodd', odd.length, '\n', JSON.stringify(byGroup));
const outcomes = {}; for (const r of rows) { const k = r.status + ':' + (r.body?.outcome ?? ''); outcomes[k] = (outcomes[k] ?? 0) + 1; } console.log(outcomes);
const times = rows.map((r) => r.ms).sort((a, b) => a - b); console.log('ms p50', times[Math.floor(times.length / 2)], 'p95', times[Math.floor(times.length * 0.95)]);
