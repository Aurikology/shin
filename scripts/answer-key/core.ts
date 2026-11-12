/**
 * The answer key: what to ask, what a right answer looks like, and the rules a server answer is held to.
 * Pure functions plus one HTTP asker; no server is started here (run.mts and the test do that).
 *
 * WHICH RESPONSE FIELDS NAME THE PRODUCT AND ITS CONFIDENCE (read from GET /api/identify, 2026-11-11):
 *   - A barcode answer ("?gtin=") names the product in `identity` { barcode, name, brand, size }.
 *   - A typed answer ("?text=") names it in `identity` too when the catalogue-first route resolved one
 *     product; the older route puts it in `product` { code, name, brands, quantity }. `pickCandidates`
 *     are only a list to choose from: they are not an answer and are never read as one.
 *   - Confidence is `verdict.confidence` ('high' | 'medium' | 'low'), and what the price was judged on is
 *     `verdict.basis` ('own_prices' is the product's own shelf prices). `verdict` is null when no verdict was
 *     given; then `range` (basis 'this_product' means the range card is that product's own range) and
 *     `lowConfidence` are all there is.
 *
 * RULES
 *   R1 barcode control: asking by barcode identifies that product.
 *   R2 never confidently wrong: a typed answer naming a DIFFERENT product (different code AND different
 *      normalised brand+name+size) must be 'low', must not be judged on 'own_prices', and its range card must
 *      not be that product's own. Any of the three is a finding. The one that matters.
 *   R3 the full "brand name size" text should find the product or an equivalent (low severity).
 *   R4 the same ask twice gives the same answer.
 *   R5 the typo form never answers with higher confidence than the full form when it names a different product.
 *   R6 a wrong-word form (the product's brand and size pinned, one name word replaced by an unrelated word)
 *      is never banded `confident`, and never answers above 'low' by name (D-074, bug M09). Two probes:
 *      the catalogue searched in process with brand and size pinned (the only way to reach the band: no
 *      HTTP route pins them), and the typed route with the brand, wrong name and size typed out.
 *   R7 in any typed search result list (GET /api/search), no two rows read the same to a shopper: the same
 *      words of brand and name in order (a repeated word said once) and the same normalised size (D-245, bug M10).
 *   Plus: an HTTP error, a 5 s timeout, or a non-JSON answer is a finding.
 */

export const ASK_TIMEOUT_MS = 5_000;
export const UNPRICED_CENTS = 499;

export interface KeyProduct {
  code: string;
  name: string;
  brand: string | null;
  size: string | null;
  /** Median of the product's own prices in the prices file, or null when it has none. */
  medianCents: number | null;
  /** The catalogue's own size columns (grams or millilitres), used to pin the size in the R6 in-process probe. */
  sizeValue?: number | null;
  sizeUnit?: string | null;
}

export type VariantKind = 'barcode' | 'full' | 'nameSize' | 'name' | 'brandName' | 'typo' | 'lower' | 'head' | 'wrong';

/** The unrelated word that replaces one name word in the wrong-word form. Not a word in any catalogue name. */
export const WRONG_WORD = 'Xylophone';

export interface Variant {
  kind: VariantKind;
  text: string;
}

export interface AskResult {
  /** HTTP status, or null when no answer came (timeout, connection refused). */
  status: number | null;
  json: Record<string, any> | null;
  ms: number;
  /** Set when the ask failed in a way that is itself a finding: 'http 500', 'timeout 5000 ms', 'not json'. */
  error: string | null;
}

export type Asker = (kind: 'barcode' | 'text', value: string, cents: number, device: string) => Promise<AskResult>;

export interface Named {
  code: string | null;
  name: string | null;
  brand: string | null;
  size: string | null;
}

export interface Reading {
  named: Named | null;
  confidence: string | null;
  basis: string | null;
  rangeBasis: string | null;
  signature: string;
}

export type Rule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'ERR';

/** One row of a result list, as a shopper would read it. */
export interface ListRow {
  code: string | null;
  name: string | null;
  brand: string | null;
  size: string | null;
}

export interface ListAnswer {
  band: string | null;
  rows: ListRow[];
  /** Set when the search failed or did not answer: itself a finding. */
  error: string | null;
}

export interface ListQuery {
  text: string;
  brand?: string | null;
  sizeValue?: number | null;
  sizeUnit?: string | null;
}

export type Lister = (q: ListQuery) => Promise<ListAnswer>;

/** The two list probes. Either may be absent (a real catalogue run has no in-process catalogue to pin brand and size on). */
export interface Lists {
  /** The catalogue searched in process with brand and size pinned (rule R6). */
  pinned?: Lister;
  /** The typed search list, GET /api/search (rule R7). */
  typed?: Lister;
}

export interface Finding {
  rule: Rule;
  severity: 'high' | 'low';
  code: string;
  variant: VariantKind | 'list';
  text: string;
  priceCents: number;
  why: string;
  got: Record<string, unknown>;
  repro: string;
  /** For ordering the worst R2 cases first. */
  score: number;
}

/* ------------------------------------------------------------------ text */

/** Lowercase, accents folded, every non-alphanumeric run a single space. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The identity two catalogue rows share when they are the same product listed twice. */
export function identityKey(brand: string | null | undefined, name: string | null | undefined, size: string | null | undefined): string {
  // "225 g", "225g" and "225 G" are one size; a number glued to or spaced from its unit must not split a product in two.
  return [norm(brand), norm(name), sizeKeyOf(size)].join('|');
}

/** A size with its number glued to its unit: "225 g", "225g" and "225 G" are one size. */
export function sizeKeyOf(size: string | null | undefined): string {
  return norm(size).replace(/(\d)\s+(?=[a-z])/g, '$1');
}

/**
 * What a shopper reads on a result row: the words of brand and name in order, a repeated word said once
 * ("Oreo / OREO" with brand Oreo reads "oreo"), plus the size. Two rows with the same reading have nothing
 * on screen to choose between (D-245). Order is kept, so "chocolate milk" and "milk chocolate" stay two rows.
 */
export function readsAs(brand: string | null | undefined, name: string | null | undefined, size: string | null | undefined): string {
  const words = norm(`${brand ?? ''} ${name ?? ''}`).split(' ').filter(Boolean);
  return `${[...new Set(words)].join(' ')}|${sizeKeyOf(size)}`;
}

/** The name with its last word swapped for an unrelated one: a shopper who half remembers the product. */
export function wrongWordName(name: string): string {
  const words = name.trim().split(/\s+/);
  words[words.length - 1] = WRONG_WORD;
  return words.join(' ');
}

/** A barcode compared by digits with leading zeros dropped, so UPC-A and EAN-13 spellings meet. */
export function codeKey(code: string | null | undefined): string {
  return (code ?? '').replace(/\D+/g, '').replace(/^0+/, '');
}

/** Swaps two adjacent different letters in the longest word (4+ letters). Null when no word allows it. */
export function typoOf(text: string): string | null {
  const words = text.split(/(\s+)/);
  let best = -1;
  for (let i = 0; i < words.length; i += 1) {
    if (!/^[A-Za-z]{4,}$/.test(words[i])) continue;
    if (best < 0 || words[i].length > words[best].length) best = i;
  }
  if (best < 0) return null;
  const w = words[best].split('');
  const mid = Math.floor(w.length / 2);
  // From the middle outwards, so the first and last letters (which a shopper rarely gets wrong) stay.
  const order: number[] = [];
  for (let d = 0; d < w.length; d += 1) {
    for (const i of [mid - 1 - d, mid + d]) if (i >= 1 && i < w.length - 1 && !order.includes(i)) order.push(i);
  }
  for (const i of order) {
    if (w[i].toLowerCase() !== w[i + 1]?.toLowerCase() && i + 1 < w.length) {
      [w[i], w[i + 1]] = [w[i + 1], w[i]];
      words[best] = w.join('');
      return words.join('');
    }
  }
  return null;
}

/** The ways a shopper types the product. Duplicate texts (no brand, say) are asked once. */
export function variantsOf(p: KeyProduct): Variant[] {
  const brand = p.brand?.trim() || '';
  const size = p.size?.trim() || '';
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
  const full = join(brand, p.name, size);
  const out: Variant[] = [
    { kind: 'full', text: full },
    { kind: 'nameSize', text: join(p.name, size) },
    { kind: 'name', text: p.name.trim() },
    { kind: 'brandName', text: join(brand, p.name) },
  ];
  // The first two words of a longer name ("kraft dinner" for "Kraft Dinner Original"): the way people shorten it.
  const words = p.name.trim().split(/\s+/);
  if (words.length >= 3) out.push({ kind: 'head', text: words.slice(0, 2).join(' ') });
  const typo = typoOf(p.name.trim());
  if (typo) out.push({ kind: 'typo', text: typo });
  out.push({ kind: 'lower', text: norm(full) });
  out.push({ kind: 'wrong', text: join(brand, wrongWordName(p.name), size) });
  const seen = new Set<string>();
  return out.filter((v) => {
    if (!v.text || seen.has(v.text)) return false;
    seen.add(v.text);
    return true;
  });
}

export function priceFor(p: KeyProduct): number {
  return p.medianCents !== null && p.medianCents > 0 ? p.medianCents : UNPRICED_CENTS;
}

/* ------------------------------------------------------------------ reading an answer */

const CONF_RANK: Record<string, number> = { low: 1, medium: 2, high: 3 };
export const confRank = (c: string | null): number => (c ? (CONF_RANK[c] ?? 0) : 0);

export function readAnswer(json: Record<string, any> | null): Reading {
  if (!json) return { named: null, confidence: null, basis: null, rangeBasis: null, signature: 'none' };
  let named: Named | null = null;
  const id = json.identity;
  const pr = json.product;
  if (id && typeof id === 'object') {
    named = { code: id.barcode ?? null, name: id.name ?? null, brand: id.brand ?? null, size: id.size ?? null };
  } else if (pr && typeof pr === 'object') {
    named = { code: pr.code ?? null, name: pr.name ?? pr.nameEn ?? null, brand: pr.brands ?? null, size: pr.quantity ?? null };
  }
  const v = json.verdict && typeof json.verdict === 'object' ? json.verdict : null;
  const confidence: string | null = v ? (v.confidence ?? null) : json.lowConfidence === true ? 'low' : (json.range?.confidence ?? null);
  const basis: string | null = v ? (v.basis ?? null) : null;
  const rangeBasis: string | null = json.range?.basis ?? null;
  const signature = JSON.stringify([
    named && [codeKey(named.code), identityKey(named.brand, named.name, named.size)],
    v && [v.kind, v.basis, v.confidence, v.centreCents, v.n],
    json.range && [json.range.basis, json.range.lowCents, json.range.highCents, json.range.medianCents],
    json.rangeSource ?? null,
    json.outcome ?? null,
    json.matchedBy ?? null,
    json.band ?? null,
    Array.isArray(json.pickCandidates) ? json.pickCandidates.map((c: any) => codeKey(c?.barcode ?? c?.code)) : null,
  ]);
  return { named, confidence, basis, rangeBasis, signature };
}

export function sameProduct(named: Named | null, p: KeyProduct): boolean {
  if (!named) return false;
  if (named.code && codeKey(named.code) === codeKey(p.code)) return true;
  return identityKey(named.brand, named.name, named.size) === identityKey(p.brand, p.name, p.size);
}

/* ------------------------------------------------------------------ the checker */

export interface CheckResult {
  findings: Finding[];
  asks: number;
  /** Total milliseconds spent waiting on answers, for a per-ask figure. */
  askMs: number;
}

const querySuffix = (device: string, region: string) => `countryCode=CA&region=${encodeURIComponent(region)}&deviceId=${encodeURIComponent(device)}`;

export function reproPath(kind: 'barcode' | 'text', value: string, cents: number, device: string, region = 'British Columbia'): string {
  const key = kind === 'barcode' ? `gtin=${encodeURIComponent(value)}` : `text=${encodeURIComponent(value)}`;
  return `/api/identify?${key}&shelfPriceCents=${cents}&${querySuffix(device, region)}`;
}

function summary(a: AskResult, r: Reading): Record<string, unknown> {
  return { status: a.status, error: a.error, named: r.named, confidence: r.confidence, basis: r.basis, rangeBasis: r.rangeBasis };
}

/** The checker. `ask` is the only thing that touches a server, so a test can hand in a stubbed answer. */
export async function checkProduct(p: KeyProduct, ask: Asker, device: string, region = 'British Columbia', lists: Lists = {}): Promise<CheckResult> {
  const findings: Finding[] = [];
  let asks = 0;
  let askMs = 0;
  const cents = priceFor(p);

  const once = async (kind: 'barcode' | 'text', value: string, vk: VariantKind) => {
    const a = await ask(kind, value, cents, device);
    asks += 1;
    askMs += a.ms;
    const r = readAnswer(a.json);
    const repro = reproPath(kind, value, cents, device, region);
    if (a.error) {
      findings.push({ rule: 'ERR', severity: 'high', code: p.code, variant: vk, text: value, priceCents: cents, why: a.error, got: summary(a, r), repro, score: 1000 });
    }
    return { a, r, repro };
  };

  // R1: the barcode control.
  const bar = await once('barcode', p.code, 'barcode');
  if (!bar.a.error && !sameProduct(bar.r.named, p)) {
    findings.push({
      rule: 'R1', severity: 'high', code: p.code, variant: 'barcode', text: p.code, priceCents: cents,
      why: bar.r.named ? 'the barcode answer names a different product' : 'the barcode answer names no product',
      got: summary(bar.a, bar.r), repro: bar.repro, score: 500,
    });
  }
  const bar2 = await once('barcode', p.code, 'barcode');
  if (!bar.a.error && !bar2.a.error && bar.r.signature !== bar2.r.signature) {
    findings.push({ rule: 'R4', severity: 'high', code: p.code, variant: 'barcode', text: p.code, priceCents: cents, why: 'the same barcode ask answered differently the second time', got: { first: summary(bar.a, bar.r), second: summary(bar2.a, bar2.r) }, repro: bar.repro, score: 400 });
  }

  const readings = new Map<VariantKind, Reading>();
  for (const v of variantsOf(p)) {
    const first = await once('text', v.text, v.kind);
    if (first.a.error) continue;
    readings.set(v.kind, first.r);
    const { r } = first;

    // R2: a typed answer that names a different product must be 'low' and not that product's own prices.
    if (r.named && !sameProduct(r.named, p)) {
      const why: string[] = [];
      if (r.basis === 'own_prices') why.push("judged on the other product's own prices");
      if (r.confidence !== null && r.confidence !== 'low') why.push(`confidence "${r.confidence}"`);
      if (!first.a.json?.verdict && r.rangeBasis === 'this_product') why.push("the range card is the other product's own range");
      if (why.length > 0) {
        findings.push({
          rule: 'R2', severity: 'high', code: p.code, variant: v.kind, text: v.text, priceCents: cents,
          why: `named "${r.named.brand ?? ''} ${r.named.name ?? ''} ${r.named.size ?? ''}" (${r.named.code}) instead: ${why.join('; ')}`,
          got: summary(first.a, r), repro: first.repro,
          score: confRank(r.confidence) * 10 + (r.basis === 'own_prices' ? 5 : 0) + (v.kind === 'name' || v.kind === 'brandName' || v.kind === 'head' ? 2 : 0),
        });
      }
    }

    // R6 (typed route): a wrong-word form that still names THIS product must not answer above 'low'. (A different
    // product named is R2's case, above.)
    if (v.kind === 'wrong' && r.named && sameProduct(r.named, p) && confRank(r.confidence) > confRank('low')) {
      findings.push({
        rule: 'R6', severity: 'high', code: p.code, variant: v.kind, text: v.text, priceCents: cents,
        why: `a wrong-word form named the product at confidence "${r.confidence}"`,
        got: summary(first.a, r), repro: first.repro, score: 600 + confRank(r.confidence),
      });
    }

    // R7: the list a shopper sees for this typed text has no two rows that read the same.
    if (lists.typed) findings.push(...(await listFindings(v.text, lists.typed, p.code, v.kind)));

    // R3: the full text should find the product (or an equivalent).
    if (v.kind === 'full' && !sameProduct(r.named, p)) {
      findings.push({
        rule: 'R3', severity: 'low', code: p.code, variant: v.kind, text: v.text, priceCents: cents,
        why: r.named ? `the full text found "${r.named.name}" (${r.named.code}) instead` : 'the full text found no single product',
        got: summary(first.a, r), repro: first.repro, score: 1,
      });
    }

    // R4: asked again, the answer is the same. Repeated for the two forms a shopper types most.
    if (v.kind === 'full' || v.kind === 'name') {
      const again = await once('text', v.text, v.kind);
      if (!again.a.error && again.r.signature !== r.signature) {
        findings.push({ rule: 'R4', severity: 'high', code: p.code, variant: v.kind, text: v.text, priceCents: cents, why: 'the same ask answered differently the second time', got: { first: summary(first.a, r), second: summary(again.a, again.r) }, repro: first.repro, score: 400 });
      }
    }
  }

  // R6 (in process): the catalogue searched with brand and size pinned and one wrong word in the name is never `confident`.
  if (lists.pinned && p.brand && p.sizeValue != null && p.sizeUnit) {
    const text = wrongWordName(p.name);
    const q: ListQuery = { text, brand: p.brand, sizeValue: p.sizeValue, sizeUnit: p.sizeUnit };
    const repro = `catalogue.search ${JSON.stringify(q)}`;
    asks += 1;
    const ans = await lists.pinned(q);
    if (ans.error) {
      findings.push({ rule: 'ERR', severity: 'high', code: p.code, variant: 'wrong', text, priceCents: cents, why: ans.error, got: { band: ans.band }, repro, score: 1000 });
    } else if (ans.band === 'confident') {
      const top = ans.rows[0];
      findings.push({
        rule: 'R6', severity: 'high', code: p.code, variant: 'wrong', text, priceCents: cents,
        why: `brand and size pinned with one wrong word, and the search still banded confident on "${top?.brand ?? ''} ${top?.name ?? ''} ${top?.size ?? ''}" (${top?.code ?? 'no row'})`,
        got: { band: ans.band, rows: ans.rows.slice(0, 3) }, repro, score: 700,
      });
    }
  }

  // R5: the typo form never answers more confidently than the full form when it names a different product.
  const typo = readings.get('typo');
  const full = readings.get('full');
  if (typo && typo.named && !sameProduct(typo.named, p) && confRank(typo.confidence) > confRank(full?.confidence ?? null)) {
    const tv = variantsOf(p).find((x) => x.kind === 'typo')!;
    findings.push({
      rule: 'R5', severity: 'high', code: p.code, variant: 'typo', text: tv.text, priceCents: cents,
      why: `the typo form named another product at "${typo.confidence}", above the full form's "${full?.confidence ?? 'none'}"`,
      got: { typo, full: full ?? null }, repro: reproPath('text', tv.text, cents, device, region), score: 300,
    });
  }
  return { findings, asks, askMs };
}

/**
 * R7: ask the typed search list for `text`; every row must read differently from every other. A list that
 * could not be fetched is a finding too, never a pass.
 */
export async function listFindings(text: string, typed: Lister, code: string, variant: VariantKind | 'list'): Promise<Finding[]> {
  const ans = await typed({ text });
  const repro = `/api/search?q=${encodeURIComponent(text)}&limit=10`;
  if (ans.error) {
    return [{ rule: 'ERR', severity: 'high', code, variant, text, priceCents: 0, why: `the typed search list: ${ans.error}`, got: { band: ans.band }, repro, score: 1000 }];
  }
  const seen = new Map<string, ListRow>();
  const out: Finding[] = [];
  for (const row of ans.rows) {
    const key = readsAs(row.brand, row.name, row.size);
    const first = seen.get(key);
    if (first) {
      out.push({
        rule: 'R7', severity: 'high', code, variant, text, priceCents: 0,
        why: `two rows read the same, "${row.brand ?? ''} ${row.name ?? ''} ${row.size ?? ''}" (${first.code}) and (${row.code})`,
        got: { first, second: row, rows: ans.rows.length }, repro, score: 200,
      });
    } else seen.set(key, row);
  }
  return out;
}

/* ------------------------------------------------------------------ the HTTP asker */

/** The typed search list over HTTP (GET /api/search). Text only: that is all the route takes. */
export function httpLister(base: string): Lister {
  return async (q) => {
    const path = `/api/search?q=${encodeURIComponent(q.text)}&limit=10`;
    try {
      const res = await fetch(base + path, { signal: AbortSignal.timeout(ASK_TIMEOUT_MS) });
      if (res.status !== 200) return { band: null, rows: [], error: `http ${res.status}` };
      const json = (await res.json()) as { band?: string; candidates?: any[]; error?: string };
      if (json.error) return { band: json.band ?? null, rows: [], error: json.error };
      const rows = (json.candidates ?? []).map((c) => ({ code: c?.code ?? null, name: c?.name ?? c?.nameEn ?? null, brand: c?.brands ?? null, size: c?.quantity ?? null }));
      return { band: json.band ?? null, rows, error: null };
    } catch (err) {
      return { band: null, rows: [], error: `no answer: ${String((err as Error)?.message ?? err)}` };
    }
  };
}

/** The catalogue searched in process (rule R6). `catalogue` is the Catalogue the server was handed. */
export function catalogueLister(catalogue: unknown): Lister {
  const c = catalogue as { search(q: unknown): Promise<{ band?: string; candidates?: any[] }> };
  return async (q) => {
    try {
      const res = await c.search({ text: q.text, brand: q.brand ?? undefined, sizeValue: q.sizeValue ?? undefined, sizeUnit: q.sizeUnit ?? undefined, limit: 5, vectors: false });
      const rows = (res.candidates ?? []).map((x) => ({ code: x?.code ?? null, name: x?.name ?? null, brand: x?.brands ?? null, size: x?.quantity ?? null }));
      return { band: res.band ?? null, rows, error: null };
    } catch (err) {
      return { band: null, rows: [], error: `search threw: ${String((err as Error)?.message ?? err)}` };
    }
  };
}

export function httpAsker(base: string, region = 'British Columbia'): Asker {
  return async (kind, value, cents, device) => {
    const path = reproPath(kind, value, cents, device, region);
    const t0 = performance.now();
    try {
      const res = await fetch(base + path, { signal: AbortSignal.timeout(ASK_TIMEOUT_MS) });
      const ms = performance.now() - t0;
      const text = await res.text();
      if (res.status !== 200) return { status: res.status, json: null, ms, error: `http ${res.status}` };
      try {
        const json = JSON.parse(text);
        if (json === null || typeof json !== 'object' || Array.isArray(json)) return { status: 200, json: null, ms, error: 'not a json object' };
        return { status: 200, json, ms, error: null };
      } catch {
        return { status: 200, json: null, ms, error: 'not json' };
      }
    } catch (err) {
      const ms = performance.now() - t0;
      const name = (err as { name?: string })?.name;
      if (name === 'TimeoutError' || name === 'AbortError') return { status: null, json: null, ms, error: `timeout ${ASK_TIMEOUT_MS} ms` };
      return { status: null, json: null, ms, error: `no answer: ${String((err as Error)?.message ?? err)}` };
    }
  };
}

/* ------------------------------------------------------------------ the run */

export interface RunSummary {
  productsChecked: number;
  asks: number;
  askMs: number;
  findings: Finding[];
  perRule: Record<Rule, number>;
  elapsedMs: number;
}

export async function runKey(
  products: readonly KeyProduct[],
  ask: Asker,
  opts: { region?: string; concurrency?: number; onProgress?: (done: number, total: number) => void; runId?: string; lists?: Lists; listProbes?: readonly string[] } = {},
): Promise<RunSummary> {
  const t0 = performance.now();
  const findings: Finding[] = [];
  let asks = 0;
  let askMs = 0;
  let done = 0;
  let next = 0;
  const runId = opts.runId ?? Date.now().toString(36);
  const worker = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= products.length) return;
      const r = await checkProduct(products[i], ask, `ak-${runId}-${i}`, opts.region, opts.lists);
      findings.push(...r.findings);
      asks += r.asks;
      askMs += r.askMs;
      done += 1;
      opts.onProgress?.(done, products.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker));
  // Typed texts worth a list check that no product's own forms cover (lookalike rows the catalogue holds, say).
  if (opts.lists?.typed) for (const text of opts.listProbes ?? []) findings.push(...(await listFindings(text, opts.lists.typed, '', 'list')));
  const perRule: Record<Rule, number> = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, R7: 0, ERR: 0 };
  for (const f of findings) perRule[f.rule] += 1;
  return { productsChecked: done, asks, askMs, findings, perRule, elapsedMs: performance.now() - t0 };
}
