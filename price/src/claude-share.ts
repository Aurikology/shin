/**
 * HOW MANY SCANS STILL REACH CLAUDE. Replays real barcode scans through today's price ladder, with
 * the Claude range ask replaced by a counter that answers "no" (so the ladder goes on to its last
 * rungs, and nothing is spent), and reports the share that would have asked Claude. Run twice in one
 * go: as builds that do not send `knows=national_average` see it, and with the Statistics Canada rung.
 *
 * Jamin, 2026-11-08: "go" (after Hammer went live: measure the share of scans still reaching Claude).
 *
 *   node price/src/claude-share.ts --scans <scans.db> --prices <prices.db> --catalogue <catalogue.db>
 *        [--since YYYY-MM-DD] [--region ON] [--json]
 *
 * Every database is opened read-only. Distinct barcodes are replayed, once each, from barcode scans
 * by real devices (probe, test and demo rows left out); the share is reported per distinct barcode
 * and weighted by how often each was scanned. It counts asks the ladder would make; the live ask also
 * needs the shopper's yes to Claude and a free monthly slot, so the live share can only be lower.
 */
import { DatabaseSync } from 'node:sqlite';
import { answerBarcodeFromCatalogue, type BarcodeDeps } from '../../app/src/catalogue-first.ts';
import { canonicalBarcode } from '../../app/src/barcode.ts';
import { sortByName } from '../../app/src/distribution.ts';
import { Catalogue } from '../../catalogue/src/search.ts';
import { loadTable, nationalAverageFor } from './statcan.ts';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** Devices that are not shoppers: the live probes, the route tests, the demo. */
const NOT_A_SHOPPER = /^(probe|cf-|test|demo|smoke|e2e)/i;

export interface ShareResult {
  readonly variant: string;
  readonly barcodes: number;
  readonly scans: number;
  readonly askedBarcodes: number;
  readonly askedScans: number;
  readonly byBasis: Record<string, number>;
  readonly notInCatalogue: number;
}

export async function measure(opts: {
  scans: DatabaseSync;
  prices: DatabaseSync;
  catalogue: DatabaseSync;
  since: string;
  region: string;
}): Promise<ShareResult[]> {
  const rows = opts.scans
    .prepare(
      `SELECT COALESCE(NULLIF(resolved_code, ''), query_text) AS code, device_id AS device
         FROM scan WHERE kind = 'barcode' AND scanned_at >= ? AND COALESCE(is_demo, 0) = 0`,
    )
    .all(opts.since) as { code: string | null; device: string }[];
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.code || NOT_A_SHOPPER.test(r.device)) continue;
    const c = canonicalBarcode(r.code.trim());
    if (!c) continue;
    counts.set(c.gtin, (counts.get(c.gtin) ?? 0) + 1);
  }
  const embedderOff = {
    id: 'claude-share:none',
    dim: 384,
    async embedPassages(): Promise<never> {
      throw new Error('no vectors in the replay');
    },
    async embedQuery(): Promise<never> {
      throw new Error('no vectors in the replay');
    },
  };
  const cat = new Catalogue(opts.catalogue, embedderOff as unknown as ConstructorParameters<typeof Catalogue>[1], null);
  const table = loadTable();
  const out: ShareResult[] = [];
  for (const variant of ['as builds 3 to 5 see it', 'with Statistics Canada']) {
    let askedBarcodes = 0;
    let askedScans = 0;
    let notInCatalogue = 0;
    const byBasis: Record<string, number> = {};
    for (const [gtin, n] of counts) {
      let asked = false;
      const deps: BarcodeDeps = {
        lookup: cat as unknown as { byGtin(code: string): unknown },
        prices: opts.prices,
        catalogue: opts.catalogue,
        country: 'CA',
        currency: 'CAD',
        asOf: new Date().toISOString().slice(0, 10),
        region: opts.region,
        askRange: async () => {
          asked = true;
          return { ok: false, reason: 'model_error' } as never;
        },
        sortName: sortByName(cat as unknown as { search(q: unknown): Promise<unknown> }),
        claudeWaitMs: 2000,
        ...(variant === 'with Statistics Canada' ? { nationalAverage: (q) => nationalAverageFor(q, table) } : {}),
      };
      const c = canonicalBarcode(gtin)!;
      const { answer } = await answerBarcodeFromCatalogue(c, deps);
      if (answer.outcome === 'not_in_catalogue') notInCatalogue++;
      const basis = answer.verdict?.basis ?? `no verdict (${answer.rangeSource ?? 'none'})`;
      byBasis[basis] = (byBasis[basis] ?? 0) + 1;
      if (asked) {
        askedBarcodes++;
        askedScans += n;
      }
    }
    out.push({
      variant,
      barcodes: counts.size,
      scans: [...counts.values()].reduce((a, b) => a + b, 0),
      askedBarcodes,
      askedScans,
      byBasis,
      notInCatalogue,
    });
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)) {
  const scans = arg('scans');
  const prices = arg('prices');
  const catalogue = arg('catalogue');
  if (!scans || !prices || !catalogue) {
    console.error('usage: node price/src/claude-share.ts --scans <scans.db> --prices <prices.db> --catalogue <catalogue.db> [--since YYYY-MM-DD] [--region ON] [--json]');
    process.exit(2);
  }
  const open = (p: string) => new DatabaseSync(p, { readOnly: true });
  const results = await measure({
    scans: open(scans),
    prices: open(prices),
    catalogue: open(catalogue),
    since: arg('since') ?? '2000-01-01',
    region: arg('region') ?? 'ON',
  });
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 1));
  else {
    for (const r of results) {
      const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '0.0');
      console.log(`${r.variant}: ${r.askedBarcodes} of ${r.barcodes} distinct barcodes (${pct(r.askedBarcodes, r.barcodes)}%) would ask Claude; ${r.askedScans} of ${r.scans} scans (${pct(r.askedScans, r.scans)}%); not in catalogue ${r.notInCatalogue}`);
      console.log(`  verdict basis: ${Object.entries(r.byBasis).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
  }
}
