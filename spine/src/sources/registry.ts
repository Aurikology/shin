/**
 * Source order is trust order.
 *
 * `resolveIdentity` breaks confidence ties by taking the first source, so this
 * array is a decision and not a list. Recorded observations come first because
 * every one of them was seen by a person. Observed prices come second: real,
 * already-crawled data, but nothing in it was checked by a human the way every
 * row in `recorded.ts` was. The live adapters come last because neither has
 * ever been run.
 *
 * eBay is last of all, and that is a judgement about the KIND of number rather
 * than about the adapter. Best Buy returns a retailer's own shelf and sale
 * price, which is what somebody will actually charge. eBay returns what
 * strangers are asking, which `contract.ts` defines as upward-biased and never
 * a clearing price, and the free key cannot see sold prices at all. An asking
 * price is the weakest evidence in the system, so it breaks no ties.
 */

import { RecordedSource } from './recorded.ts';
import { ObservedSource } from './observed.ts';
import { BestBuySource } from './bestbuy.ts';
import { EbaySource } from './ebay.ts';
import type { PriceSource } from './source.ts';
import type { SpineDeps } from '../spine.ts';

export function defaultSources(): PriceSource[] {
  return [new RecordedSource(), new ObservedSource(), new BestBuySource(), new EbaySource()];
}

export function defaultDeps(): SpineDeps {
  const sources = defaultSources();
  const recorded = sources.find((s): s is RecordedSource => s instanceof RecordedSource);
  const observed = sources.find((s): s is ObservedSource => s instanceof ObservedSource);
  return {
    sources,
    identityNote: (id) => recorded?.identityNote(id) ?? observed?.identityNote(id),
  };
}
