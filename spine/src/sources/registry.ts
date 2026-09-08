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
 * Corrections sit second, between the two. A correction was seen by a person,
 * which is the property that puts `recorded.ts` first, but by the shopper rather
 * than by us, so it does not outrank a row we checked ourselves. It outranks
 * `observed.ts` because a correction names the actual shop and most observed
 * rows cannot, which is the difference between a price that can be excluded from
 * its own comparison and one that cannot. This position costs nothing either
 * way in the tie-break the paragraph above is really about: `CorrectionSource`
 * returns null from `identify()` on every query, so it can never be the source
 * that resolves an identity.
 *
 * eBay is last of all, and that is a judgement about the KIND of number rather
 * than about the adapter. Best Buy returns a retailer's own shelf and sale
 * price, which is what somebody will actually charge. eBay returns what
 * strangers are asking, which `contract.ts` defines as upward-biased and never
 * a clearing price, and the free key cannot see sold prices at all. An asking
 * price is the weakest evidence in the system, so it breaks no ties.
 *
 * SOLDCOMPS SITS WITH THE OTHER UNRUN ADAPTERS, AND THAT IS NOT WHERE IT
 * BELONGS. Added to this array 2026-09-08; before that it existed as a file
 * nothing imported.
 *
 * On the kind of number it returns, it should outrank both adapters above it
 * for `used`: it reports SOLD eBay listings, and `categories.ts` says a sold
 * price "records what someone was actually willing to pay", which is the one
 * thing an asking price is definitionally not. The corpus has zero sold prices
 * today, so this is also the only path to a `sold` basis that exists.
 *
 * It is last anyway, because this array's order is trust and trust is earned by
 * being run. `verified` is false on it for the same reason it is false on the
 * two above: nobody has pointed it at the live endpoint with a real key. Moving
 * it up on the strength of the KIND of number it would return, before anyone
 * has seen a number come back, would be ranking a promise above a measurement,
 * which is the mistake the first paragraph of this file exists to prevent.
 *
 * REVERSES WHEN: somebody runs it against api.sold-comps.com with a real
 * SOLDCOMPS_API_KEY and puts the result in the scoreboard. At that point its
 * position is a live question and the argument above is the case for moving it
 * ahead of eBay and Best Buy for `used`.
 *
 * Registering it costs nothing until then. Its `available()` returns
 * `ok: false, reason: 'SOLDCOMPS_API_KEY is not set'`, the same shape Best Buy
 * uses, so with no key it is a reportable absence rather than a source that
 * returns nothing silently. That visibility is the actual reason to register it
 * now rather than on the day the key arrives: `source.ts` says an unverified
 * adapter returning nothing is indistinguishable from a category with no
 * prices, and a file nobody imports cannot even say which it is.
 */

import { RecordedSource } from './recorded.ts';
import { CorrectionSource } from './corrections.ts';
import { ObservedSource } from './observed.ts';
import { BestBuySource } from './bestbuy.ts';
import { EbaySource } from './ebay.ts';
import { SoldCompsSource } from './soldcomps.ts';
import type { PriceSource } from './source.ts';
import type { SpineDeps } from '../spine.ts';

export function defaultSources(): PriceSource[] {
  return [
    new RecordedSource(),
    new CorrectionSource(),
    new ObservedSource(),
    new BestBuySource(),
    new EbaySource(),
    new SoldCompsSource(),
  ];
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
