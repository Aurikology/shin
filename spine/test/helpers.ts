import type {
  CategoryId,
  PricePoint,
  ProductIdentity,
  SpineQuery,
} from '../src/contract.ts';
import type { PriceSource, SourceAvailability } from '../src/sources/source.ts';

export const AS_OF = '2026-09-03T18:00:00Z';

export function point(
  seller: string,
  amountCents: number,
  kind: PricePoint['kind'] = 'regular',
  observedAt = '2026-09-03',
  extra: Partial<PricePoint> = {},
): PricePoint {
  return {
    seller,
    amountCents,
    currency: 'CAD',
    kind,
    observedAt,
    sourceId: 'test',
    ...extra,
  };
}

export function identity(
  category: CategoryId,
  confidence = 0.99,
  label = 'Test product',
): ProductIdentity {
  return { id: 'test:1', label, category, confidence, resolvedBy: 'test' };
}

/** A source that returns exactly what the test handed it, and nothing clever. */
export class StubSource implements PriceSource {
  readonly id = 'stub';
  readonly label = 'Stub';
  readonly verified = true;
  readonly categories: readonly CategoryId[];

  #identity: ProductIdentity | null;
  #points: PricePoint[];
  #availability: SourceAvailability;

  constructor(
    id: ProductIdentity | null,
    points: PricePoint[],
    availability: SourceAvailability = { ok: true },
  ) {
    this.#identity = id;
    this.#points = points;
    this.#availability = availability;
    this.categories = id ? [id.category] : ['grocery', 'tech', 'used', 'furniture', 'produce'];
  }

  available(): SourceAvailability {
    return this.#availability;
  }

  async identify(_query: SpineQuery): Promise<ProductIdentity | null> {
    return this.#identity;
  }

  async prices(): Promise<readonly PricePoint[]> {
    return this.#points;
  }
}
