/**
 * The recorded-observation source.
 *
 * Every price in `data/observations.json` was observed by a person and carries
 * the date it was observed. Nothing in this file invents a number, and nothing
 * in this file goes to the network, which is what makes the spine runnable and
 * testable today, before any credential exists.
 *
 * This is also the shape a paid feed will arrive in, so the live adapters are a
 * fetch and a mapping away rather than a rewrite.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CategoryId, PricePoint, ProductIdentity, SpineQuery } from '../contract.ts';
import { CATEGORY_IDS } from '../contract.ts';
import type { PriceSource, SourceAvailability } from './source.ts';
import { overlap } from './source.ts';

interface RecordedProduct {
  id: string;
  label: string;
  category: CategoryId;
  brand?: string;
  gtin?: string;
  model?: string;
  size?: { value: number; unit: 'g' | 'kg' | 'ml' | 'l' | 'ea' };
  /** How sure the person recording it was that this is the thing that was asked for. */
  identityConfidence: number;
  /** Extra strings a query might use. The label is always matched too. */
  matchTerms?: string[];
  /** Why identityConfidence is what it is, when it is not 1. */
  identityNote?: string;
  points: PricePoint[];
}

interface RecordedStore {
  recordedAt: string;
  provenance: string;
  products: RecordedProduct[];
}

const DEFAULT_PATH = fileURLToPath(new URL('../../data/observations.json', import.meta.url));

/** Minimum query-token overlap before we will claim a match at all. */
const MATCH_FLOOR = 0.5;

export class RecordedSource implements PriceSource {
  readonly id = 'recorded';
  readonly label = 'Hand-recorded observations';
  readonly categories: readonly CategoryId[] = CATEGORY_IDS;
  readonly verified = true;

  #store: RecordedStore;

  constructor(path: string = DEFAULT_PATH) {
    this.#store = JSON.parse(readFileSync(path, 'utf8')) as RecordedStore;
  }

  get recordedAt(): string {
    return this.#store.recordedAt;
  }

  get provenance(): string {
    return this.#store.provenance;
  }

  available(): SourceAvailability {
    return this.#store.products.length > 0
      ? { ok: true }
      : { ok: false, reason: 'observation store is empty' };
  }

  async identify(query: SpineQuery): Promise<ProductIdentity | null> {
    const candidates = query.category
      ? this.#store.products.filter((p) => p.category === query.category)
      : this.#store.products;

    if (query.gtin) {
      const hit = candidates.find((p) => p.gtin === query.gtin);
      if (hit) return this.#toIdentity(hit);
    }

    const text = query.text ?? '';
    if (text.trim() === '') return null;

    let best: RecordedProduct | null = null;
    let bestScore = 0;
    for (const p of candidates) {
      const haystack = [p.label, p.brand ?? '', p.model ?? '', ...(p.matchTerms ?? [])].join(' ');
      const score = overlap(text, haystack);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best === null || bestScore < MATCH_FLOOR) return null;
    // Fold how well the query matched into the confidence we report.
    //
    // Without this, identityConfidence describes the stored ROW rather than this
    // query's fit to it, so "kd cup" and "kraft dinner 900g" both resolved to the
    // 225g box and printed "the product is a certain match". Every price after
    // that was accurate and about a different product, which is the exact failure
    // the identity floor exists to stop.
    return this.#toIdentity(best, bestScore);
  }

  async prices(identity: ProductIdentity): Promise<readonly PricePoint[]> {
    const hit = this.#store.products.find((p) => p.id === identity.id);
    return hit ? hit.points : [];
  }

  /** The note explaining a low identity confidence, for the refusal text. */
  identityNote(id: string): string | undefined {
    return this.#store.products.find((p) => p.id === id)?.identityNote;
  }

  #toIdentity(p: RecordedProduct, matchScore = 1): ProductIdentity {
    return {
      id: p.id,
      label: p.label,
      category: p.category,
      brand: p.brand,
      gtin: p.gtin,
      model: p.model,
      size: p.size,
      confidence: p.identityConfidence * matchScore,
      resolvedBy: this.id,
    };
  }
}
