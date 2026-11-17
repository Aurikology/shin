/**
 * "You added a price": what an identify answer says about the shelf price the shopper typed on the pad
 * (docs/decisions.md, 2026-11-15, "Shopper prices"). The answer carries:
 *
 *   contributed: boolean      true when THIS request's price was saved for other shoppers
 *   pricesAdded: number       how many prices this device has saved in all, counting this one
 *   contributedWhy?: string   only when a price was typed and not saved:
 *                             'not_identified' | 'weighed_label' | 'already_today' | 'typo_guard'
 *                             | 'probe_device' | 'bad_price' | 'store_unavailable'
 *
 * A price is saved only for a product Pexi identified by its barcode: the catalogue (including loose produce by
 * its PLU), a shop's own row for the barcode, or Open Food Facts. A name Claude read off the pack or a shopper
 * picked from typed text is a guess at the product, so it is never saved against (the typed-name identity work
 * stays out until after launch, docs/decisions.md "Four launch calls"). A weighed label's embedded price is a
 * total for one cut, not a shelf price, so it is not saved either.
 *
 * The product's centre for the typo guard is the one in the answer the shopper just saw: the verdict's centre
 * when it stands on prices for this product (`own_prices`), else the range's median when that range is this
 * product's. A product with neither has no centre, so nothing is guarded.
 *
 * Never throws; a store that cannot be written is `contributed: false`.
 */
import type { DatabaseSync } from 'node:sqlite';
import { saveShopperPrice, shopperPriceCount } from '../../price/src/shopper-prices.ts';
import type { CatalogueAnswer, CatalogueRecord } from './catalogue-first.ts';

export interface ShopperContribution {
  readonly contributed: boolean;
  readonly pricesAdded: number;
  readonly contributedWhy?: string;
}

export function productCentre(answer: Pick<CatalogueAnswer, 'range'>, record: Pick<CatalogueRecord, 'verdict'>): number | null {
  const v = record.verdict;
  if (v && v.basis === 'own_prices' && Number.isFinite(v.centreCents) && v.centreCents > 0) return v.centreCents;
  const r = answer.range;
  if (r && r.basis === 'this_product' && typeof r.medianCents === 'number' && r.medianCents > 0) return r.medianCents;
  return null;
}

/** Whether the answer names the product by its barcode (not by a guess), so a price can be filed under it. */
function identifiedByBarcode(answer: CatalogueAnswer, record: CatalogueRecord): boolean {
  if (!record.resolvedCode) return false;
  if (answer.outcome === 'catalogue_hit') return true;
  if (answer.outcome === 'named_outside_catalogue') return answer.identitySource === 'open_food_facts';
  // A shop's own row for the barcode names it (design case 2).
  return answer.outcome === 'not_in_catalogue' && answer.storeIdentity !== null;
}

export function shopperContribution(s: {
  store: DatabaseSync | null;
  device: string;
  answer: CatalogueAnswer;
  record: CatalogueRecord;
  priced: { cents: number | null; region: string | null; storeName: string | null };
  today: string;
  /** The network this request came from, hashed (network-hash.ts). Null when it could not be made. */
  networkHash?: string | null;
}): ShopperContribution {
  try {
    const count = () => shopperPriceCount(s.store, s.device);
    if (s.priced.cents === null) return { contributed: false, pricesAdded: count() };
    if (s.answer.shelfPrice !== null) return { contributed: false, pricesAdded: count(), contributedWhy: 'weighed_label' };
    if (!identifiedByBarcode(s.answer, s.record)) return { contributed: false, pricesAdded: count(), contributedWhy: 'not_identified' };
    const saved = saveShopperPrice(s.store, {
      deviceId: s.device,
      code: s.record.resolvedCode!,
      priceCents: s.priced.cents,
      region: s.priced.region,
      store: s.priced.storeName,
      seenOn: s.today,
      centreCents: productCentre(s.answer, s.record),
      networkHash: s.networkHash ?? null,
    });
    if (saved.ok) return { contributed: true, pricesAdded: count() };
    return { contributed: false, pricesAdded: count(), contributedWhy: saved.why };
  } catch (err) {
    console.error(`[shopper-price-fault] contribution_failed ${err instanceof Error ? err.message : String(err)}`);
    return { contributed: false, pricesAdded: 0, contributedWhy: 'store_unavailable' };
  }
}
