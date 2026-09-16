/**
 * DOES SHIN SHOW THE RIGHT PRICE? The eval beside this one measures whether the
 * product was IDENTIFIED. Nothing measured whether the number under it is true,
 * which is the whole product.
 *
 * THE GROUND TRUTH is `spine/data/observations.json`: seven products priced BY
 * HAND off public Canadian pages on 2026-09-03, seller by seller, in cents, with
 * promotional prices marked as promotional. It is small and it is real, which is
 * the right trade for a truth set. Nothing here is generated.
 *
 * WHAT IT MEASURES, in order of how much it can be trusted:
 *
 *   1. COVERAGE -- did the grounded search return any Canadian price at all?
 *      Drift-free: a product either got prices or it did not, and no amount of
 *      time passing changes that. This is the number to read first.
 *   2. SELLER OVERLAP -- did it name a seller the pilot also saw?
 *   3. PRICE ERROR -- how far the medians are apart. READ THIS LAST AND LOOSELY:
 *      the truth was recorded 2026-09-03 and real shelf prices move, so an error
 *      here is model error PLUS drift and this harness cannot separate them. A
 *      large error is a question, never a verdict.
 *
 * NOTHING GROUNDED IS WRITTEN DOWN. Counts, medians and errors are computed in
 * memory and printed; Google's own text, links and offers are never persisted,
 * because storing them is the thing the terms forbid (identify/src/grounded.ts).
 * That the arithmetic happens here at all is the crossing D-111 records.
 */
import { readFileSync } from 'node:fs';
import { GeminiGroundedLookup } from '../src/providers/gemini-grounded.ts';
import { toWire } from '../src/grounded.ts';

interface TruthPoint { seller: string; amountCents: number; kind?: string; currency?: string }
interface TruthProduct {
  id: string; label: string; brand?: string; category?: string;
  size?: { value: number; unit: string }; points: TruthPoint[];
}

const median = (ns: number[]): number | null => {
  if (ns.length === 0) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export async function runPriceTruth(opts: { limit?: number; delayMs?: number } = {}): Promise<number> {
  const raw = JSON.parse(readFileSync(new URL('../../spine/data/observations.json', import.meta.url), 'utf8'));
  const recordedAt: string = raw.recordedAt ?? 'unknown';
  const products: TruthProduct[] = (raw.products ?? []).slice(0, opts.limit ?? 99);

  console.log(`price truth: ${products.length} hand-priced products, recorded ${recordedAt}`);
  console.log('prices move, so read COVERAGE first and the error last.\n');
  console.log('product                          | ms    | offers | truth n | gemini med | truth med | diff   | sellers seen also');
  console.log('-'.repeat(122));

  let withOffers = 0;
  let sellerHits = 0;
  const errs: number[] = [];

  for (const p of products) {
    // Only REGULAR prices are comparable: a promotional 55c against a regular
    // 147c is not the model being wrong, it is a different question.
    const truthRegular = p.points.filter((x) => (x.kind ?? 'regular') === 'regular').map((x) => x.amountCents);
    const truthMed = median(truthRegular);
    const dev = `truth-${p.id}-${Date.now()}`;
    const lookup = new GeminiGroundedLookup({});
    const t0 = Date.now();
    let offers: { retailer?: string; price?: number; currency?: string | null }[] = [];
    let failure: string | null = null;
    try {
      const box = await lookup.lookupPrice(
        {
          text: p.label,
          askingCents: truthMed ?? 499,
          sizeValue: p.size?.value ?? null,
          sizeUnit: p.size?.unit ?? null,
        },
        dev,
      );
      // `lookupPrice` answers null when there is nothing to open, and the wire
      // shape has been both flat and wrapped in a `block` across this file's
      // history, so both are read rather than assumed.
      const wire = box === null ? null : (toWire(box, dev) as unknown as Record<string, unknown> | null);
      const inner = (wire && typeof wire.block === 'object' ? wire.block : wire) as { offers?: typeof offers } | null;
      offers = inner?.offers ?? [];
    } catch (e) {
      failure = (e as { failure?: string })?.failure ?? 'error';
    }
    const ms = Date.now() - t0;

    // CAD only. A USD listing is a different currency, not a cheaper price, and
    // the item rules already say so on the wire.
    const cad = offers.filter((o) => (o.currency ?? 'CAD').toUpperCase() === 'CAD' && typeof o.price === 'number');
    const gemMed = median(cad.map((o) => Math.round((o.price as number) * 100)));
    if (cad.length > 0) withOffers += 1;

    const truthSellers = new Set(p.points.map((x) => norm(x.seller)));
    const also = cad.map((o) => o.retailer ?? '').filter((r) => [...truthSellers].some((t) => norm(r).includes(t) || t.includes(norm(r))));
    if (also.length > 0) sellerHits += 1;

    let diff = '-';
    if (gemMed != null && truthMed != null && truthMed > 0) {
      const pct = ((gemMed - truthMed) / truthMed) * 100;
      errs.push(Math.abs(pct));
      diff = `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
    }
    console.log(
      p.label.slice(0, 32).padEnd(32), '|',
      String(ms).padStart(5), '|',
      String(failure ?? cad.length).padStart(6), '|',
      String(truthRegular.length).padStart(7), '|',
      String(gemMed == null ? '-' : (gemMed / 100).toFixed(2)).padStart(10), '|',
      String(truthMed == null ? '-' : (truthMed / 100).toFixed(2)).padStart(9), '|',
      diff.padStart(6), '|', [...new Set(also)].join(', ') || '-',
    );
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
  }

  const n = products.length;
  console.log('-'.repeat(122));
  console.log(`COVERAGE        : ${withOffers}/${n} products got at least one Canadian price.`);
  console.log(`SELLER OVERLAP  : ${sellerHits}/${n} named a seller the pilot also saw.`);
  console.log(
    errs.length
      ? `MEDIAN |ERROR|  : ${median(errs.map((e) => Math.round(e)))}% across ${errs.length} comparable products (MODEL ERROR PLUS 13 DAYS OF DRIFT -- not separable here).`
      : 'MEDIAN |ERROR|  : not computed, nothing comparable came back.',
  );
  console.log('\ncoverage is the number that decides whether Gemini can be the price source at all.');
  return withOffers;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('\\').join('/').split('/').pop() ?? '')) {
  const limit = Number(process.argv.find((a, i) => process.argv[i - 1] === '--limit')) || undefined;
  await runPriceTruth({ limit, delayMs: 1200 });
}
