/**
 * Source order is trust order.
 *
 * `resolveIdentity` breaks confidence ties by taking the first source, so this
 * array is a decision and not a list. Recorded observations come first because
 * every one of them was seen by a person; the live adapters come after because
 * neither has been run. SoldComps is last: it never identifies, so its place in
 * the order only affects price gathering, and it is a keyword scraper with no
 * SLA behind it.
 */

import { RecordedSource } from './recorded.ts';
import { BestBuySource } from './bestbuy.ts';
import { SoldCompsSource } from './soldcomps.ts';
import type { PriceSource } from './source.ts';
import type { SpineDeps } from '../spine.ts';

export function defaultSources(): PriceSource[] {
  return [new RecordedSource(), new BestBuySource(), new SoldCompsSource()];
}

export function defaultDeps(): SpineDeps {
  const sources = defaultSources();
  const recorded = sources.find((s): s is RecordedSource => s instanceof RecordedSource);
  return {
    sources,
    identityNote: (id) => recorded?.identityNote(id),
  };
}
