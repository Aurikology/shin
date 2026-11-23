/**
 * The scenario check's pure core: the list of scenarios, the finders that pick real examples of each from the
 * real catalogue and prices files, the judge that reads one answer, the traffic weights and the summary.
 *
 * Nothing here starts a server or writes a file (scenario-check.mts does that), so tests hand it small fixture
 * databases or stubbed answers. Pexi's central goal (RULINGS.md, first entry): a barcode with a price range for as
 * many US and Canadian items as possible. No result is the worst outcome, a bad result (wrong product, wrong size,
 * misleading range, wrong currency) the second worst. The tool reports NUMBERS per scenario; only true
 * breakages (wrong product, converted or mismatched currency, a crash, a model call) are failures.
 */
import type { DatabaseSync } from 'node:sqlite';
import { codeKey, confRank, readAnswer, sameProduct, type KeyProduct, type Named } from '../answer-key/core.ts';

/* ------------------------------------------------------------------ the scenarios */

export type Market = 'CA' | 'US' | 'unknown';
export type Input =
  | 'barcode'
  | 'barcode_12_vs_13'
  | 'barcode_not_in_catalogue'
  | 'barcode_invalid'
  | 'barcode_store_internal'
  | 'typed_full'
  | 'typed_partial'
  | 'typed_typo'
  | 'typed_no_brand';
export type PriceState = 'own_price' | 'matcher_linked' | 'unlinked_name_only' | 'peers_only' | 'nothing' | 'price_on_barcode_only' | 'not_applicable';
export type Quality = 'many_recent' | 'single' | 'only_old' | 'only_sale' | 'shopper_only' | 'any';
export type Failure = 'none' | 'claude_cap' | 'claude_down' | 'claude_slow' | 'prices_unavailable';
/** Which data the example's prices are in, for the cross-market scenarios. */
export type DataCurrency = 'CAD' | 'USD' | 'any';

export interface Scenario {
  readonly id: string;
  readonly input: Input;
  readonly price: PriceState;
  readonly quality: Quality;
  readonly market: Market;
  readonly dataCurrency: DataCurrency;
  readonly failure: Failure;
  /** How the scenario was formed, in words, for the output. */
  readonly how: string;
}

const sc = (
  id: string,
  input: Input,
  price: PriceState,
  quality: Quality,
  market: Market,
  dataCurrency: DataCurrency,
  failure: Failure,
  how: string,
): Scenario => ({ id, input, price, quality, market, dataCurrency, failure, how });

/** The market's own currency, as the phone sends it. Unknown reads as the server's default, CAD. */
export const MARKET_CURRENCY: Record<Market, string> = { CA: 'CAD', US: 'USD', unknown: 'CAD' };

export function buildScenarios(): { scenarios: Scenario[]; dropped: { combo: string; why: string }[] } {
  const s: Scenario[] = [];
  // A. a barcode the catalogue has, by what the prices file holds for it. Market CA, the main market.
  s.push(sc('barcode/own_price/many_recent', 'barcode', 'own_price', 'many_recent', 'CA', 'CAD', 'none', 'barcode in catalogue, 3+ prices in the last 90 days on this exact barcode'));
  s.push(sc('barcode/own_price/single', 'barcode', 'own_price', 'single', 'CA', 'CAD', 'none', 'barcode in catalogue, exactly one regular price on this barcode'));
  s.push(sc('barcode/own_price/only_old', 'barcode', 'own_price', 'only_old', 'CA', 'CAD', 'none', 'barcode in catalogue, every price on it older than a year'));
  s.push(sc('barcode/own_price/only_sale', 'barcode', 'own_price', 'only_sale', 'CA', 'CAD', 'none', 'barcode in catalogue, every price on it is a sale price'));
  s.push(sc('barcode/own_price/shopper_only', 'barcode', 'own_price', 'shopper_only', 'CA', 'any', 'none', 'barcode in catalogue, only shopper-typed prices (needs --corrections)'));
  s.push(sc('barcode/matcher_linked', 'barcode', 'matcher_linked', 'any', 'CA', 'CAD', 'none', 'barcode in catalogue, its price row was linked to it by the name matcher (join_method name)'));
  s.push(sc('barcode/unlinked_name_only', 'barcode', 'unlinked_name_only', 'any', 'CA', 'CAD', 'none', 'barcode in catalogue; a price with no barcode reads as the same product by name but is not linked (price and barcode exist, not integrated)'));
  s.push(sc('barcode/peers_only', 'barcode', 'peers_only', 'any', 'CA', 'CAD', 'none', 'barcode in catalogue, no price of its own, 3+ priced products in its category'));
  s.push(sc('barcode/nothing', 'barcode', 'nothing', 'any', 'CA', 'CAD', 'none', 'barcode in catalogue, no price on it and none in its category: falls to the (stubbed) Claude range ask'));
  // B. the same product as 12 and 13 digits.
  s.push(sc('barcode_12_vs_13/own_price', 'barcode_12_vs_13', 'own_price', 'many_recent', 'CA', 'CAD', 'none', 'priced products whose code starts with 0, asked as the 12-digit UPC-A and as the 13-digit form; the two must agree'));
  // C. not in the catalogue.
  s.push(sc('barcode_not_in_catalogue/price_on_barcode_only', 'barcode_not_in_catalogue', 'price_on_barcode_only', 'any', 'CA', 'CAD', 'none', 'a barcode the prices file has and the catalogue does not'));
  s.push(sc('barcode_not_in_catalogue/nothing', 'barcode_not_in_catalogue', 'nothing', 'any', 'CA', 'any', 'none', 'a valid barcode (check digit right) that neither file has; made by the seeded generator and checked absent'));
  // D. codes that are not products.
  s.push(sc('barcode_invalid', 'barcode_invalid', 'not_applicable', 'any', 'CA', 'any', 'none', 'a catalogue barcode with its check digit changed, checked absent'));
  s.push(sc('barcode_store_internal', 'barcode_store_internal', 'not_applicable', 'any', 'CA', 'any', 'none', 'codes starting with 2 (store-internal and weighed-label ranges): real ones from the catalogue, else made ones checked absent'));
  // E. typed names, by price state of the product they name.
  const typed: [Input, string][] = [
    ['typed_full', 'brand, name and size typed in full'],
    ['typed_partial', 'the first words of the full name only'],
    ['typed_typo', 'the full name with two letters swapped in its longest word'],
    ['typed_no_brand', 'name and size, brand left out'],
  ];
  const states: [PriceState, Quality, string][] = [
    ['own_price', 'many_recent', 'product with 3+ recent prices on its barcode'],
    ['peers_only', 'any', 'product with no price of its own but priced category peers'],
    ['nothing', 'any', 'product with no price and no priced category peers'],
  ];
  for (const [input, tdesc] of typed) {
    for (const [price, quality, sdesc] of states) {
      s.push(sc(`${input}/${price}`, input, price, quality, 'CA', 'CAD', 'none', `${tdesc}; ${sdesc}`));
    }
  }
  // F. market.
  s.push(sc('market_US/own_price_in_USD', 'barcode', 'own_price', 'any', 'US', 'USD', 'none', 'US market, product whose prices are all in USD'));
  s.push(sc('market_CA/price_only_in_USD', 'barcode', 'own_price', 'any', 'CA', 'USD', 'none', 'Canadian market, product whose only prices are in USD: must never be converted or shown as CAD'));
  s.push(sc('market_US/price_only_in_CAD', 'barcode', 'own_price', 'any', 'US', 'CAD', 'none', 'US market, product whose only prices are in CAD: must never be converted or shown as USD'));
  s.push(sc('market_unknown/own_price_in_CAD', 'barcode', 'own_price', 'any', 'unknown', 'CAD', 'none', 'no market sent, product priced in CAD (the server defaults to CAD)'));
  s.push(sc('market_US/nothing', 'barcode', 'nothing', 'any', 'US', 'any', 'none', 'US market, product with no price and no priced peers: Claude range ask in USD (stubbed)'));
  s.push(sc('market_unknown/nothing', 'barcode', 'nothing', 'any', 'unknown', 'any', 'none', 'no market sent, product with no price and no priced peers'));
  // G. failures, set up through the stub and the environment, never through data.
  s.push(sc('failure/claude_cap_reached', 'barcode', 'nothing', 'any', 'CA', 'any', 'claude_cap', 'no price anywhere and the Claude monthly cap already used (stub refuses)'));
  s.push(sc('failure/claude_down', 'barcode', 'nothing', 'any', 'CA', 'any', 'claude_down', 'no price anywhere and the Claude call errors'));
  s.push(sc('failure/claude_slow', 'barcode', 'nothing', 'any', 'CA', 'any', 'claude_slow', 'no price anywhere and the Claude call outlasts the wait the answer allows'));
  s.push(sc('failure/prices_unavailable', 'barcode', 'own_price', 'many_recent', 'CA', 'CAD', 'prices_unavailable', 'products that have prices, asked while the price file is missing'));

  const dropped = [
    { combo: 'barcode_invalid x any price state', why: 'no price attaches to a code that is not a product' },
    { combo: 'barcode_store_internal x price states', why: 'a store-internal code carries no catalogue price rows; one scenario covers it' },
    { combo: 'barcode_12_vs_13 x nothing/peers_only', why: 'the 12-vs-13 question is the same lookup for any price state; the priced case shows it' },
    { combo: 'typed_* x matcher_linked / unlinked / only_old / only_sale / single', why: 'the price state is a property of the product, already covered by the barcode scenarios; typed forms are varied against three states' },
    { combo: 'typed_* x US / unknown market', why: 'market handling is a property of the price step, covered by the barcode market scenarios' },
    { combo: 'barcode_not_in_catalogue x price quality', why: 'a price on a barcode the catalogue lacks has no name to judge quality against; one scenario' },
    { combo: 'failure x own_price states', why: 'a Claude failure cannot matter when a price exists (Claude is not asked); only the price-file failure is run against priced products' },
    { combo: 'market CA x CAD price, market US x USD price (two of the four)', why: 'CA with CAD is the base scenario barcode/own_price/many_recent; US with USD is market_US/own_price_in_USD' },
  ];
  return { scenarios: s, dropped };
}

/* ------------------------------------------------------------------ examples and finders */

export interface Example {
  /** The catalogue (or prices) code this example stands for. */
  readonly code: string;
  readonly name: string | null;
  readonly brand: string | null;
  readonly size: string | null;
  /** What is sent: a barcode or typed text. */
  readonly kind: 'barcode' | 'text';
  readonly value: string;
  /** A second form of the same barcode for the 12-vs-13 pair. */
  readonly altValue?: string;
  /** True when no product should be named for this input (invalid, made up). */
  readonly expectsNoProduct: boolean;
  /** The product the answer must name, or null when there is none to compare with. */
  readonly target: KeyProduct | null;
  /** A real price held for it in the prices file, in cents, in `knownCurrency`. */
  readonly knownCents: number | null;
  readonly knownCurrency: string | null;
  /** The currencies of every price the files hold for it. */
  readonly dataCurrencies: string[];
  readonly note?: string;
}

export interface CatProduct {
  code: string;
  name: string | null;
  name_en: string | null;
  brands: string | null;
  quantity: string | null;
  size_value: number | null;
  size_unit: string | null;
  leaf_category: string | null;
  category_path: string | null;
  sold_in_canada: number;
}

export interface Agg {
  code: string;
  n: number;
  nRegular: number;
  nSale: number;
  nRecent: number;
  newest: string;
  sellers: number;
  currencies: string[];
  methods: string[];
}

export interface FinderCtx {
  cat: DatabaseSync;
  prices: DatabaseSync | null;
  corrections: DatabaseSync | null;
  asOf: string;
  rand: () => number;
  agg: Map<string, Agg>;
  /** Computed once, on first use. */
  peers?: { leaf: Map<string, number>; parent: Map<string, number> };
}

const DAY = 86_400_000;
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
export const daysBefore = (asOf: string, n: number): string => isoDay(new Date(Date.parse(`${asOf}T00:00:00Z`) - n * DAY));

const tableExists = (db: DatabaseSync | null, name: string): boolean => {
  if (!db) return false;
  return (db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as unknown) !== undefined;
};
const hasColumn = (db: DatabaseSync, table: string, col: string): boolean =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]).some((c) => c.name === col);

export function loadAgg(prices: DatabaseSync | null, asOf: string): Map<string, Agg> {
  const out = new Map<string, Agg>();
  if (!prices || !tableExists(prices, 'observation')) return out;
  const sale = hasColumn(prices, 'observation', 'is_sale') ? "(kind != 'regular' OR coalesce(is_sale, 0) = 1)" : "kind != 'regular'";
  const rows = prices
    .prepare(
      `SELECT code, count(*) AS n, sum(CASE WHEN ${sale} THEN 0 ELSE 1 END) AS nreg, sum(CASE WHEN ${sale} THEN 1 ELSE 0 END) AS nsale,
              sum(CASE WHEN seen_on >= ? THEN 1 ELSE 0 END) AS nrecent, max(seen_on) AS newest, count(DISTINCT seller) AS sellers,
              group_concat(DISTINCT currency) AS currencies, group_concat(DISTINCT join_method) AS methods
         FROM observation WHERE code IS NOT NULL AND code != '' GROUP BY code`,
    )
    .all(daysBefore(asOf, 90)) as unknown as { code: string; n: number; nreg: number; nsale: number; nrecent: number; newest: string; sellers: number; currencies: string; methods: string }[];
  for (const r of rows) {
    out.set(r.code, {
      code: r.code,
      n: r.n,
      nRegular: r.nreg,
      nSale: r.nsale,
      nRecent: r.nrecent,
      newest: r.newest,
      sellers: r.sellers,
      currencies: (r.currencies ?? '').split(',').filter(Boolean),
      methods: (r.methods ?? '').split(',').filter(Boolean),
    });
  }
  return out;
}

export function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const COLS = 'code, name, name_en, brands, quantity, size_value, size_unit, leaf_category, category_path, sold_in_canada';
export function getProduct(cat: DatabaseSync, code: string): CatProduct | null {
  return (cat.prepare(`SELECT ${COLS} FROM product WHERE code = ?`).get(code) as unknown as CatProduct | undefined) ?? null;
}

export const productName = (p: CatProduct): string => (p.name_en?.trim() || p.name?.trim() || '');
const firstBrand = (p: CatProduct): string | null => ((p.brands ?? '').split(',')[0].trim() || null);
const sizeOf = (p: CatProduct): string | null =>
  p.quantity?.trim() || (p.size_value !== null && p.size_unit ? `${p.size_value} ${p.size_unit}` : null);

export function toTarget(p: CatProduct): KeyProduct {
  return { code: p.code, name: productName(p), brand: firstBrand(p), size: sizeOf(p), medianCents: null, sizeValue: p.size_value, sizeUnit: p.size_unit };
}

/** The leaf and parent tags of a product, the way the range ladder reads them (the parent is the tag before the leaf). */
function tagsOf(p: CatProduct): { leaf: string | null; parent: string | null } {
  let path: string[] = [];
  try {
    const j = JSON.parse(p.category_path ?? '[]');
    if (Array.isArray(j)) path = j.filter((x): x is string => typeof x === 'string');
  } catch {
    path = [];
  }
  const leaf = p.leaf_category ?? path[path.length - 1] ?? null;
  const at = leaf ? path.lastIndexOf(leaf) : -1;
  const parent = at > 0 ? path[at - 1] : null;
  return { leaf, parent };
}

function peersOf(ctx: FinderCtx): NonNullable<FinderCtx['peers']> {
  if (ctx.peers) return ctx.peers;
  const leaf = new Map<string, number>();
  const parent = new Map<string, number>();
  for (const code of ctx.agg.keys()) {
    const p = getProduct(ctx.cat, code);
    if (!p) continue;
    const t = tagsOf(p);
    if (t.leaf) leaf.set(t.leaf, (leaf.get(t.leaf) ?? 0) + 1);
    if (t.parent) parent.set(t.parent, (parent.get(t.parent) ?? 0) + 1);
  }
  ctx.peers = { leaf, parent };
  return ctx.peers;
}

/** A priced product other than this one shares the leaf or the parent (a product counts itself in the maps). */
function pricedPeers(ctx: FinderCtx, p: CatProduct): number {
  const { leaf, parent } = peersOf(ctx);
  const t = tagsOf(p);
  const own = ctx.agg.has(p.code) ? 1 : 0;
  return Math.max((t.leaf ? (leaf.get(t.leaf) ?? 0) : 0) - own, (t.parent ? (parent.get(t.parent) ?? 0) : 0) - own);
}

/** The real price held for a code: the median regular price in the commonest currency among its newest rows. */
export function knownPrice(prices: DatabaseSync | null, code: string): { cents: number | null; currency: string | null } {
  if (!prices) return { cents: null, currency: null };
  const rows = prices.prepare('SELECT price_cents AS c, currency AS cur, kind FROM observation WHERE code = ? ORDER BY seen_on DESC LIMIT 50').all(code) as unknown as { c: number; cur: string; kind: string }[];
  const regular = rows.filter((r) => r.kind === 'regular');
  const use = regular.length > 0 ? regular : rows;
  if (use.length === 0) return { cents: null, currency: null };
  const cur = use[0].cur;
  const xs = use.filter((r) => r.cur === cur).map((r) => r.c).sort((a, b) => a - b);
  const m = Math.floor(xs.length / 2);
  return { cents: xs.length % 2 ? xs[m] : Math.round((xs[m - 1] + xs[m]) / 2), currency: cur };
}

function exampleOf(ctx: FinderCtx, p: CatProduct, form: Input, extra: Partial<Example> = {}): Example | null {
  const brand = firstBrand(p);
  const name = productName(p);
  const size = sizeOf(p);
  const target = toTarget(p);
  const agg = ctx.agg.get(p.code);
  const kp = knownPrice(ctx.prices, p.code);
  const base = {
    code: p.code, name, brand, size, target, expectsNoProduct: false,
    knownCents: kp.cents, knownCurrency: kp.currency, dataCurrencies: agg?.currencies ?? [],
  };
  const said = (v: string): Example => ({ ...base, kind: 'text', value: v, ...extra });
  const nameHasBrand = brand !== null && name.toLowerCase().includes(brand.toLowerCase());
  const full = [nameHasBrand ? null : brand, name, size].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  switch (form) {
    case 'barcode':
      return { ...base, kind: 'barcode', value: p.code, ...extra };
    case 'barcode_12_vs_13':
      if (!(p.code.length === 13 && p.code.startsWith('0'))) return null;
      return { ...base, kind: 'barcode', value: p.code, altValue: p.code.slice(1), ...extra };
    case 'typed_full':
      return brand && name && size ? said(full) : null;
    case 'typed_partial': {
      const words = full.split(' ');
      return brand && name && size && words.length >= 3 ? said(words.slice(0, Math.max(2, Math.ceil(words.length * 0.6))).join(' ')) : null;
    }
    case 'typed_typo': {
      if (!(brand && name && size)) return null;
      const words = full.split(' ');
      let at = -1;
      for (let i = 0; i < words.length; i += 1) if (/^[A-Za-z]{5,}$/.test(words[i]) && (at < 0 || words[i].length > words[at].length)) at = i;
      if (at < 0) return null;
      const w = words[at];
      const m = Math.floor(w.length / 2);
      words[at] = w.slice(0, m - 1) + w[m] + w[m - 1] + w.slice(m + 1);
      return said(words.join(' '));
    }
    case 'typed_no_brand': {
      if (!(brand && name && size)) return null;
      const stripped = name.replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').replace(/\s+/g, ' ').trim();
      return stripped.length >= 3 ? said(`${stripped} ${size}`) : null;
    }
    default:
      return null;
  }
}

/** A GS1 check digit for the digits given (any length). */
export function checkDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

const maxRowid = (db: DatabaseSync, table: string): number => (db.prepare(`SELECT max(rowid) AS m FROM ${table}`).get() as unknown as { m: number | null }).m ?? 0;

/** Seeded random catalogue rows (by rowid probe), kept while `accept` says so, up to `n`, within `probes` tries. */
function sampleCatalogue(ctx: FinderCtx, n: number, accept: (p: CatProduct) => boolean, probes = 60_000): CatProduct[] {
  const m = maxRowid(ctx.cat, 'product');
  const out: CatProduct[] = [];
  const seen = new Set<string>();
  if (m === 0) return out;
  const stmt = ctx.cat.prepare(`SELECT ${COLS} FROM product WHERE rowid = ?`);
  if (m <= probes) {
    // A small catalogue: walk it all in shuffled order rather than hope the probes land.
    const ids = shuffled(Array.from({ length: m }, (_, i) => i + 1), ctx.rand);
    for (const id of ids) {
      const p = stmt.get(id) as unknown as CatProduct | undefined;
      if (p && !seen.has(p.code) && accept(p)) {
        seen.add(p.code);
        out.push(p);
        if (out.length >= n) break;
      }
    }
    return out;
  }
  for (let i = 0; i < probes && out.length < n; i += 1) {
    const p = stmt.get(1 + Math.floor(ctx.rand() * m)) as unknown as CatProduct | undefined;
    if (p && !seen.has(p.code) && accept(p)) {
      seen.add(p.code);
      out.push(p);
    }
  }
  return out;
}

/** Examples from the priced codes whose aggregate passes `want`, in seeded order, kept while the catalogue has them. */
function fromPriced(ctx: FinderCtx, n: number, form: Input, want: (a: Agg) => boolean, accept: (p: CatProduct) => boolean = () => true): Example[] {
  const out: Example[] = [];
  const codes = shuffled([...ctx.agg.values()].filter(want).map((a) => a.code), ctx.rand);
  for (const code of codes) {
    if (out.length >= n) break;
    const p = getProduct(ctx.cat, code);
    if (!p || !productName(p) || !accept(p)) continue;
    const ex = exampleOf(ctx, p, form);
    if (ex) out.push(ex);
  }
  return out;
}

const only = (a: Agg, cur: string): boolean => a.currencies.length > 0 && a.currencies.every((c) => c === cur);
const inCanada = (p: CatProduct): boolean => p.sold_in_canada === 1;

/** Observations with no barcode whose name reads as one catalogue product that has no price of its own. */
function unlinkedExamples(ctx: FinderCtx, n: number, form: Input): Example[] {
  const out: Example[] = [];
  const prices = ctx.prices;
  if (!prices || !tableExists(prices, 'observation')) return out;
  const m = maxRowid(prices, 'observation');
  const row = prices.prepare('SELECT seller_name AS sn, seller_brand AS sb, price_cents AS c, currency AS cur, rowid AS rid FROM observation WHERE rowid = ? AND code IS NULL');
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const fts = tableExists(ctx.cat, 'product_fts');
  const used = new Set<string>();
  const tries = Math.min(m, 6000);
  const ids = m <= 6000 ? shuffled(Array.from({ length: m }, (_, i) => i + 1), ctx.rand) : Array.from({ length: tries }, () => 1 + Math.floor(ctx.rand() * m));
  for (const id of ids) {
    if (out.length >= n) break;
    const r = row.get(id) as unknown as { sn: string; sb: string | null; c: number; cur: string } | undefined;
    if (!r || !r.sn) continue;
    const words = norm(r.sn).split(' ').filter(Boolean);
    if (words.length < 2 || !fts) continue;
    let hits: CatProduct[] = [];
    try {
      hits = ctx.cat
        .prepare(`SELECT ${COLS.split(', ').map((c) => `p.${c}`).join(', ')} FROM product_fts f JOIN product p ON p.rowid = f.rowid WHERE product_fts MATCH ? LIMIT 20`)
        // Only the letters-only words: the index holds names and brands, not sizes. The check below does the exact work.
        .all(words.filter((w) => /^[a-z]{2,}$/.test(w)).slice(0, 4).map((w) => `"${w}"`).join(' ') || '""') as unknown as CatProduct[];
    } catch {
      continue;
    }
    for (const p of hits) {
      if (used.has(p.code) || ctx.agg.has(p.code) || !inCanada(p) || !productName(p)) continue;
      // The seller's words are all words the catalogue row has (brand, name, size) and include every word of its name.
      const have = new Set(norm(`${firstBrand(p) ?? ''} ${productName(p)} ${sizeOf(p) ?? ''}`).split(' '));
      const mine = new Set(words);
      if (!words.every((w) => have.has(w)) || !norm(productName(p)).split(' ').every((w) => mine.has(w))) continue;
      const ex = exampleOf(ctx, p, form);
      if (!ex) continue;
      used.add(p.code);
      out.push({ ...ex, knownCents: r.c, knownCurrency: r.cur, dataCurrencies: [r.cur], note: `unlinked price row "${r.sn}"` });
      break;
    }
  }
  return out;
}

function shopperOnly(ctx: FinderCtx, n: number): Example[] {
  const out: Example[] = [];
  if (!tableExists(ctx.corrections, 'shopper_price')) return out;
  const codes = (ctx.corrections!.prepare('SELECT DISTINCT code FROM shopper_price').all() as unknown as { code: string }[]).map((r) => r.code);
  for (const code of shuffled(codes, ctx.rand)) {
    if (out.length >= n) break;
    if (ctx.agg.has(code)) continue;
    const p = getProduct(ctx.cat, code);
    if (!p || !productName(p)) continue;
    const ex = exampleOf(ctx, p, 'barcode');
    if (!ex) continue;
    const r = ctx.corrections!.prepare('SELECT price_cents AS c FROM shopper_price WHERE code = ? ORDER BY seen_on DESC LIMIT 1').get(code) as unknown as { c: number } | undefined;
    out.push({ ...ex, knownCents: r?.c ?? null, knownCurrency: r ? 'CAD' : null, dataCurrencies: [], note: 'shopper-typed price only' });
  }
  return out;
}

/** Barcodes: the catalogue's own with the digit changed (invalid), or made valid ones neither file holds. */
function madeCodes(ctx: FinderCtx, n: number, kind: 'invalid' | 'absent' | 'store_internal'): Example[] {
  const out: Example[] = [];
  const hasCode = ctx.cat.prepare('SELECT 1 AS x FROM product WHERE code = ?');
  const absent = (c: string): boolean => (hasCode.get(c) as unknown) === undefined && !ctx.agg.has(c);
  const mk = (value: string, note: string): Example => ({
    code: value, name: null, brand: null, size: null, kind: 'barcode', value, expectsNoProduct: true, target: null,
    knownCents: null, knownCurrency: null, dataCurrencies: [], note,
  });
  if (kind === 'store_internal') {
    const real = sampleCatalogue(ctx, n, (p) => /^2\d{11,12}$/.test(p.code) && productName(p) !== '', 80_000);
    for (const p of real) {
      const ex = exampleOf(ctx, p, 'barcode');
      if (ex) out.push({ ...ex, note: 'real store-internal code in the catalogue' });
    }
  }
  let guard = 0;
  while (out.length < n && guard < 5000) {
    guard += 1;
    if (kind === 'invalid') {
      const p = sampleCatalogue(ctx, 1, (x) => /^\d{13}$/.test(x.code), 500)[0];
      if (!p) break;
      const bad = String((Number(p.code[12]) + 1 + Math.floor(ctx.rand() * 8)) % 10);
      const value = p.code.slice(0, 12) + bad;
      if (value !== p.code && absent(value) && checkDigit(value.slice(0, 12)) !== bad) out.push(mk(value, `${p.code} with its check digit changed`));
    } else {
      const prefix = kind === 'store_internal' ? '2' : String(1 + Math.floor(ctx.rand() * 8));
      let body = prefix;
      while (body.length < 12) body += String(Math.floor(ctx.rand() * 10));
      const value = body + checkDigit(body);
      if (absent(value) && !out.some((e) => e.value === value)) out.push(mk(value, kind === 'store_internal' ? 'made store-internal code, absent from both files' : 'made valid code, absent from both files'));
    }
  }
  return out;
}

/** A barcode the prices file has and the catalogue does not. */
function priceOnBarcode(ctx: FinderCtx, n: number): Example[] {
  const out: Example[] = [];
  for (const code of shuffled([...ctx.agg.keys()], ctx.rand)) {
    if (out.length >= n) break;
    if (getProduct(ctx.cat, code)) continue;
    const a = ctx.agg.get(code)!;
    const kp = knownPrice(ctx.prices, code);
    out.push({
      code, name: null, brand: null, size: null, kind: 'barcode', value: code, expectsNoProduct: false, target: null,
      knownCents: kp.cents, knownCurrency: kp.currency, dataCurrencies: a.currencies, note: 'in the prices file, not in the catalogue',
    });
  }
  return out;
}

/** Catalogue products (Canada) with no price of their own, by what their category holds. */
function unpriced(ctx: FinderCtx, n: number, form: Input, withPeers: boolean): Example[] {
  const eligible = (p: CatProduct): boolean => {
    if (!inCanada(p) || !productName(p) || ctx.agg.has(p.code) || !/^\d{8,14}$/.test(p.code)) return false;
    const peers = pricedPeers(ctx, p);
    return withPeers ? peers >= 3 : peers === 0;
  };
  const out: Example[] = [];
  for (const p of sampleCatalogue(ctx, n * 6, (x) => /^\d{8,14}$/.test(x.code) && inCanada(x) && productName(x) !== '' && !ctx.agg.has(x.code))) {
    if (out.length >= n) break;
    if (!eligible(p)) continue;
    const ex = exampleOf(ctx, p, form);
    if (ex) out.push(ex);
  }
  return out;
}

/** The examples of a scenario: up to `n` real ones, [] when today's data has none. */
export function findExamples(s: Scenario, ctx: FinderCtx, n: number): Example[] {
  const form: Input = s.input === 'barcode_not_in_catalogue' || s.input === 'barcode_invalid' || s.input === 'barcode_store_internal' ? 'barcode' : s.input;
  const sale = (a: Agg): boolean => a.nSale === a.n;
  switch (s.id) {
    case 'barcode_not_in_catalogue/price_on_barcode_only':
      return priceOnBarcode(ctx, n);
    case 'barcode_not_in_catalogue/nothing':
      return madeCodes(ctx, n, 'absent');
    case 'barcode_invalid':
      return madeCodes(ctx, n, 'invalid');
    case 'barcode_store_internal':
      return madeCodes(ctx, n, 'store_internal');
    case 'barcode/own_price/shopper_only':
      return shopperOnly(ctx, n);
    case 'barcode/matcher_linked':
      return fromPriced(ctx, n, 'barcode', (a) => a.methods.includes('name'), inCanada);
    case 'barcode/unlinked_name_only':
      return unlinkedExamples(ctx, n, 'barcode');
    case 'market_US/own_price_in_USD':
      return fromPriced(ctx, n, 'barcode', (a) => only(a, 'USD'));
    case 'market_CA/price_only_in_USD':
      return fromPriced(ctx, n, 'barcode', (a) => only(a, 'USD'));
    case 'market_US/price_only_in_CAD':
      return fromPriced(ctx, n, 'barcode', (a) => only(a, 'CAD') && a.nRecent >= 1);
    case 'market_unknown/own_price_in_CAD':
      return fromPriced(ctx, n, 'barcode', (a) => only(a, 'CAD') && a.nRecent >= 1, inCanada);
    default:
      break;
  }
  if (s.price === 'own_price') {
    const quality: Record<Quality, (a: Agg) => boolean> = {
      many_recent: (a) => a.nRecent >= 3 && only(a, 'CAD'),
      single: (a) => a.n === 1 && a.nRegular === 1 && a.newest >= daysBefore(ctx.asOf, 365) && only(a, 'CAD'),
      only_old: (a) => a.newest < daysBefore(ctx.asOf, 365) && only(a, 'CAD'),
      only_sale: (a) => sale(a) && only(a, 'CAD'),
      shopper_only: () => false,
      any: () => true,
    };
    const typedNeeds = form.startsWith('typed') || form === 'barcode_12_vs_13';
    return fromPriced(ctx, n, form, quality[s.quality], typedNeeds || form === 'barcode' ? inCanada : () => true);
  }
  if (s.price === 'peers_only') return unpriced(ctx, n, form, true);
  if (s.price === 'nothing') return unpriced(ctx, n, form, false);
  return [];
}

/* ------------------------------------------------------------------ the judge */

export type Rung = 'own_price' | 'matcher' | 'category' | 'national' | 'claude' | 'prior' | 'other' | 'none';

export interface AskResult {
  status: number | null;
  json: Record<string, any> | null;
  ms: number;
  error: string | null;
}

export interface Outcome {
  answered: boolean;
  noResult: boolean;
  named: Named | null;
  nameMatches: boolean | null;
  currency: string | null;
  rung: Rung;
  lowCents: number | null;
  highCents: number | null;
  ms: number;
  status: number | null;
  error: string | null;
  inSample: boolean | null;
  breakages: string[];
  bad: string[];
  stubCalls: number;
}

export function rungOf(json: Record<string, any> | null, matcherLinked = false): Rung {
  if (!json) return 'none';
  const range = json.range && typeof json.range === 'object' ? json.range : null;
  const verdict = json.verdict && typeof json.verdict === 'object' ? json.verdict : null;
  if (!range && !verdict) return 'none';
  const rs: string | null = json.rangeSource ?? null;
  const rb: string | null = range?.basis ?? null;
  const vb: string | null = verdict?.basis ?? null;
  if (rs === 'claude_typical' || rb === 'gemini_typical' || rb === 'claude_typical' || vb === 'claude_typical') return 'claude';
  if (rs === 'national_average' || vb === 'national_average') return 'national';
  // A last-rung estimate drawn from this product's own prices (one or two shops, under the 3-shop bar in
  // price/src/range.ts) is still this product's price, so it is judged as one, including the in-sample check.
  if (rs === 'shin_estimate' && (rb === 'own_prices' || vb === 'own_prices')) return matcherLinked ? 'matcher' : 'own_price';
  if (rs === 'fixed_prior' || rs === 'shin_estimate' || rb === 'fixed_prior') return 'prior';
  if (rb === 'this_product') return matcherLinked ? 'matcher' : 'own_price';
  if (rb === 'leaf_category' || rb === 'parent_category') return 'category';
  if (vb === 'own_prices') return matcherLinked ? 'matcher' : 'own_price';
  if (vb === 'leaf_category' || vb === 'parent_category') return 'category';
  if (vb === 'category_prior' || vb === 'department_prior') return 'prior';
  return 'other';
}

function rangeOf(json: Record<string, any> | null): { low: number | null; high: number | null } {
  const r = json?.range;
  if (r && typeof r === 'object' && typeof r.lowCents === 'number' && typeof r.highCents === 'number') return { low: r.lowCents, high: r.highCents };
  const v = json?.verdict;
  if (v && typeof v === 'object' && typeof v.p10Cents === 'number' && typeof v.p90Cents === 'number') return { low: v.p10Cents, high: v.p90Cents };
  return { low: null, high: null };
}

/** Reads one answer (and the 12-digit twin, when asked) against the example and the scenario. Pure. */
export function judge(ex: Example, s: Scenario, a: AskResult, twin: AskResult | null = null, stubCalls = 0): Outcome {
  const breakages: string[] = [];
  const bad: string[] = [];
  const json = a.json;
  const marketCurrency = MARKET_CURRENCY[s.market];
  if (a.status === null || a.status >= 500) breakages.push(`no_answer: ${a.error ?? `http ${a.status}`}`);
  const reading = readAnswer(json);
  const named = reading.named && (reading.named.name || reading.named.code) ? reading.named : null;
  const rung = rungOf(json, s.price === 'matcher_linked');
  const { low, high } = rangeOf(json);
  const shown = json?.range && typeof json.range === 'object' ? json.range : null;
  const currency: string | null = (shown?.currency ?? json?.verdict?.currency ?? null) || null;
  const noResult = !json || a.status !== 200 || rung === 'none';

  // The product the answer names.
  let nameMatches: boolean | null = null;
  if (named && ex.target) {
    nameMatches = sameProduct(named, ex.target);
    if (!nameMatches) {
      const sure = ex.kind === 'barcode' || confRank(reading.confidence) >= 2;
      (sure ? breakages : bad).push(`wrong_product: asked ${ex.value}, named "${[named.brand, named.name, named.size].filter(Boolean).join(' ')}" (${named.code ?? 'no code'})`);
    }
  } else if (named && ex.expectsNoProduct) {
    breakages.push(`named_a_product_for_a_code_that_has_none: "${named.name}" (${named.code ?? 'no code'})`);
  }

  // Currency.
  if (!noResult && currency && currency !== marketCurrency) breakages.push(`currency_mismatch: market ${s.market} wants ${marketCurrency}, answer says ${currency}`);
  const crossMarket = ex.dataCurrencies.length > 0 && ex.dataCurrencies.every((c) => c !== marketCurrency);
  if (crossMarket && (rung === 'own_price' || rung === 'matcher' || rung === 'category') && json?.rangeSource === 'shin_prices') {
    breakages.push(`other_market_price_used: the only prices are in ${ex.dataCurrencies.join('/')}, the market is ${s.market}, the answer shows a Pexi price range (${low}-${high} ${currency ?? '?'})`);
  }

  // Statistics Canada's national average is Canadian data: it is never a US shopper's price, whatever label it carries.
  if (rung === 'national' && s.market === 'US') {
    breakages.push(`canadian_average_shown_to_us_market: a national average (Statistics Canada, Canadian dollars) is shown for a US market as ${currency ?? '?'} ${low}-${high}`);
  }

  // A range for typed words that named no product is the broad guess, not this item's price.
  if (!named && ex.target && ex.kind === 'text' && !noResult) bad.push('range_for_unidentified_product');

  // The range itself.
  if (low !== null && high !== null && (low <= 0 || high <= 0 || low > high || !Number.isInteger(low) || !Number.isInteger(high))) {
    breakages.push(`invalid_range: ${low}-${high}`);
  }

  // In-sample: the server holds this price, so an own-price range should contain it.
  let inSample: boolean | null = null;
  if ((rung === 'own_price' || rung === 'matcher') && ex.knownCents !== null && ex.knownCurrency === marketCurrency && low !== null && high !== null) {
    inSample = low <= ex.knownCents && ex.knownCents <= high;
    if (!inSample) bad.push(`range_misses_known_price: ${low}-${high} does not hold ${ex.knownCents}`);
  }

  // 12 digits against 13.
  if (twin) {
    const t = twin.json;
    const tn = readAnswer(t).named;
    const tr = rangeOf(t);
    const same = (tn ? codeKey(tn.code) : '') === (named ? codeKey(named.code) : '') && tr.low === low && tr.high === high;
    if (twin.status === null || twin.status >= 500) breakages.push(`no_answer on the 12-digit form: ${twin.error ?? `http ${twin.status}`}`);
    else if (!same) breakages.push(`forms_disagree: 13-digit ${named?.code ?? 'no product'} ${low}-${high}, 12-digit ${tn?.code ?? 'no product'} ${tr.low}-${tr.high}`);
  }

  for (const b of breakages) if (!bad.includes(b) && !/^no_answer/.test(b)) bad.push(b.split(':')[0]);
  return {
    answered: !noResult,
    noResult,
    named,
    nameMatches,
    currency,
    rung,
    lowCents: low,
    highCents: high,
    ms: a.ms,
    status: a.status,
    error: a.error,
    inSample,
    breakages,
    bad: [...new Set(bad)],
    stubCalls,
  };
}

/* ------------------------------------------------------------------ the summary */

export interface Row {
  scenario: Scenario;
  example: Example | null;
  outcome: Outcome | null;
}

export interface ScenarioSummary {
  id: string;
  how: string;
  input: Input;
  price: PriceState;
  quality: Quality;
  market: Market;
  failure: Failure;
  examples: number;
  note: string | null;
  noResultShare: number | null;
  badResultShare: number | null;
  rungMix: Record<string, number>;
  breakages: number;
  breakageKinds: Record<string, number>;
  inSample: { checked: number; contained: number } | null;
  stubCalls: number;
  latencyMs: { p50: number; p95: number } | null;
  trafficShare: number | null;
  change: { noResultShare: number | null; badResultShare: number | null; breakages: number; examples: number } | null;
}

const pct = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

export function summarise(scenarios: readonly Scenario[], rows: readonly Row[], shares: Map<string, number | null>, previous: { scenarios?: ScenarioSummary[] } | null): ScenarioSummary[] {
  const prev = new Map((previous?.scenarios ?? []).map((p) => [p.id, p]));
  return scenarios.map((s) => {
    const mine = rows.filter((r) => r.scenario.id === s.id && r.example && r.outcome);
    const outs = mine.map((r) => r.outcome!);
    const n = outs.length;
    const rungMix: Record<string, number> = {};
    for (const o of outs) rungMix[o.rung] = (rungMix[o.rung] ?? 0) + 1;
    const kinds: Record<string, number> = {};
    for (const o of outs) for (const b of o.breakages) kinds[b.split(':')[0]] = (kinds[b.split(':')[0]] ?? 0) + 1;
    const checked = outs.filter((o) => o.inSample !== null);
    const row: ScenarioSummary = {
      id: s.id,
      how: s.how,
      input: s.input,
      price: s.price,
      quality: s.quality,
      market: s.market,
      failure: s.failure,
      examples: n,
      note: n === 0 ? 'no example in today\'s data' : null,
      noResultShare: n ? outs.filter((o) => o.noResult).length / n : null,
      badResultShare: n ? outs.filter((o) => o.bad.length > 0).length / n : null,
      rungMix,
      breakages: outs.reduce((t, o) => t + o.breakages.length, 0),
      breakageKinds: kinds,
      inSample: checked.length ? { checked: checked.length, contained: checked.filter((o) => o.inSample).length } : null,
      stubCalls: outs.reduce((t, o) => t + o.stubCalls, 0),
      latencyMs: n ? { p50: Math.round(pct(outs.map((o) => o.ms), 0.5)), p95: Math.round(pct(outs.map((o) => o.ms), 0.95)) } : null,
      trafficShare: shares.get(s.id) ?? null,
      change: null,
    };
    const p = prev.get(s.id);
    if (p) {
      row.change = {
        noResultShare: row.noResultShare !== null && p.noResultShare !== null ? row.noResultShare - p.noResultShare : null,
        badResultShare: row.badResultShare !== null && p.badResultShare !== null ? row.badResultShare - p.badResultShare : null,
        breakages: row.breakages - p.breakages,
        examples: row.examples - p.examples,
      };
    }
    return row;
  });
}

const share = (x: number | null): string => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
const signed = (x: number | null, unit = ''): string => (x === null ? 'n/a' : `${x > 0 ? '+' : ''}${unit === '%' ? Math.round(x * 100) : x}${unit}`);

export function renderMarkdown(meta: { asOf: string; seed: number; n: number; weighted: boolean; scansNote: string; benchLine: string; previous: boolean; dropped: { combo: string; why: string }[] }, rows: readonly ScenarioSummary[]): string {
  const lines: string[] = [];
  lines.push(`# Scenario check, ${meta.asOf}`, '');
  lines.push(`Seed ${meta.seed}, up to ${meta.n} real examples per scenario. ${meta.scansNote}`);
  lines.push('Numbers, not verdicts: only the Breakages column is a failure. Own-price ranges checked against a held price are in-sample (the server holds that price).', '');
  lines.push('| scenario | examples | no-result | bad-result | rung mix | breakages | traffic share | change vs previous |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const mix = Object.entries(r.rungMix).map(([k, v]) => `${k} ${v}`).join(', ') || (r.examples === 0 ? 'no example in today\'s data' : '');
    const kinds = Object.entries(r.breakageKinds).map(([k, v]) => `${k} ${v}`).join(', ');
    const ch = r.change ? `no-result ${signed(r.change.noResultShare, '%')}, bad ${signed(r.change.badResultShare, '%')}, breakages ${signed(r.change.breakages)}` : meta.previous ? 'new scenario' : '';
    lines.push(`| ${r.id} | ${r.examples} | ${share(r.noResultShare)} | ${share(r.badResultShare)} | ${mix} | ${r.breakages}${kinds ? ` (${kinds})` : ''} | ${share(r.trafficShare)} | ${ch} |`);
  }
  lines.push('', '## How each scenario was formed', '');
  for (const r of rows) lines.push(`- ${r.id}: ${r.how}`);
  lines.push('', '## Combinations dropped', '');
  for (const d of meta.dropped) lines.push(`- ${d.combo}: ${d.why}`);
  lines.push('', '## Held-out accuracy', '', 'This check measures what the server answers; it does not duplicate the bench. For held-out accuracy of the price model run:', '', '    ' + meta.benchLine, '');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ real traffic */

export type InputGroup = 'barcode_in_catalogue' | 'barcode_not_in_catalogue' | 'barcode_invalid' | 'typed' | 'other';
export type RungGroup = 'own' | 'category' | 'fallback';

export interface TrafficCell {
  input: InputGroup;
  market: Market;
  rung: RungGroup;
  n: number;
}

/** The scans that count as real traffic: funnel-report.mjs's definition plus devices that ever sent a load_test event. */
export function realScanFilter(testDevices: readonly string[], syntheticQueries: readonly string[], hasEvent: boolean): string {
  const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`;
  return [
    "device_id NOT LIKE 'probe-%'",
    testDevices.length ? `device_id NOT IN (${testDevices.map(quote).join(', ')})` : '1',
    `device_id NOT IN (SELECT device_id FROM scan WHERE kind = 'text' AND lower(trim(query_text)) IN (${syntheticQueries.map(quote).join(', ')}))`,
    hasEvent ? "device_id NOT IN (SELECT device_id FROM event WHERE type = 'load_test')" : '1',
    'coalesce(is_demo, 0) = 0',
  ].join(' AND ');
}

export function loadTraffic(scans: DatabaseSync, testDevices: readonly string[], syntheticQueries: readonly string[]): { cells: TrafficCell[]; total: number; hasMarket: boolean } {
  const has = (c: string): boolean => hasColumn(scans, 'scan', c);
  const hasMarket = has('country');
  const filter = realScanFilter(testDevices, syntheticQueries, tableExists(scans, 'event') && hasColumn(scans, 'event', 'type'));
  const demo = has('is_demo') ? filter : filter.replace('coalesce(is_demo, 0) = 0', '1');
  const rows = scans
    .prepare(
      `SELECT kind, failure_class AS fc, resolved_code IS NOT NULL AS hc, ${hasMarket ? "coalesce(country, '')" : "''"} AS country,
              ${has('range_source') ? 'range_source' : 'NULL'} AS rs, ${has('range_basis') ? 'range_basis' : 'NULL'} AS rb, count(*) AS n
         FROM scan WHERE ${demo} GROUP BY 1, 2, 3, 4, 5, 6`,
    )
    .all() as unknown as { kind: string; fc: string | null; hc: number; country: string; rs: string | null; rb: string | null; n: number }[];
  const cells = new Map<string, TrafficCell>();
  let total = 0;
  for (const r of rows) {
    const input: InputGroup =
      r.kind === 'text' ? 'typed' : r.kind !== 'barcode' ? 'other' : r.fc === 'invalid_barcode' ? 'barcode_invalid' : r.fc === 'not_in_catalogue' ? 'barcode_not_in_catalogue' : r.hc ? 'barcode_in_catalogue' : 'other';
    const market: Market = r.country === 'CA' ? 'CA' : r.country === 'US' ? 'US' : 'unknown';
    const rung: RungGroup = r.rs === 'shin_prices' && r.rb === 'this_product' ? 'own' : r.rs === 'shin_prices' && (r.rb === 'leaf_category' || r.rb === 'parent_category') ? 'category' : 'fallback';
    const key = `${input}|${market}|${rung}`;
    const c = cells.get(key) ?? { input, market, rung, n: 0 };
    c.n += r.n;
    cells.set(key, c);
    total += r.n;
  }
  return { cells: [...cells.values()], total, hasMarket };
}

/**
 * The share of real traffic in the cell a scenario sits in (input group x market x price rung), or null where the scan
 * columns cannot tell: price quality, the matcher, failures, cross-currency, the 12-digit form and store-internal codes.
 * Cells are not additive: several scenarios can sit in one cell.
 */
export function trafficShare(s: Scenario, traffic: { cells: TrafficCell[]; total: number; hasMarket: boolean } | null): number | null {
  if (!traffic || traffic.total === 0) return null;
  if (s.failure !== 'none' || s.input === 'barcode_12_vs_13' || s.input === 'barcode_store_internal') return null;
  if (s.id.includes('price_only_in')) return null;
  if (['single', 'only_old', 'only_sale', 'shopper_only'].includes(s.quality)) return null;
  if (s.price === 'matcher_linked' || s.price === 'unlinked_name_only') return null;
  if (s.market !== 'CA' && !traffic.hasMarket) return null;
  const input: InputGroup = s.input.startsWith('typed') ? 'typed' : s.input === 'barcode_not_in_catalogue' ? 'barcode_not_in_catalogue' : s.input === 'barcode_invalid' ? 'barcode_invalid' : 'barcode_in_catalogue';
  const rungWanted: RungGroup | null = s.price === 'own_price' ? 'own' : s.price === 'peers_only' ? 'category' : s.price === 'nothing' ? 'fallback' : null;
  const n = traffic.cells
    .filter((c) => c.input === input && c.market === s.market && (rungWanted === null || c.rung === rungWanted))
    .reduce((t, c) => t + c.n, 0);
  return n / traffic.total;
}
