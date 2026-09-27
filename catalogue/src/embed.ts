/**
 * The embedding half of hybrid retrieval (decisions 24 and 25).
 *
 * Two implementations behind one interface, and the choice is made by whether a
 * key exists rather than by a flag someone has to remember:
 *
 *   voyage-4  better retrieval, costs $0.06/M tokens with 200M free on signup,
 *             used whenever VOYAGE_API_KEY is set.
 *   local     multilingual-e5-small through ONNX, no key, no network, and the
 *             reason the catalogue is searchable today rather than after an
 *             account is created.
 *
 * Both are asked for the same 384 dimensions so the stored vectors are
 * interchangeable and swapping does not change the schema. It does mean a
 * re-embed, which `embed-all.ts` handles by dropping the vector table.
 *
 * Decision 25 says multilingual, and it is not decoration: it is what makes a
 * French query reach an English row when the full-text index cannot, because
 * the two languages share no tokens. The text index handles exact model numbers
 * and sizes, which embeddings blur. Neither alone is enough, which is decision 24.
 */

import * as settings from '../../settings/src/index.ts';
import { EMBED_DIM } from './schema.ts';

export interface Embedder {
  readonly id: string;
  readonly dim: number;
  /** A document as it is stored. */
  embedPassages(texts: string[]): Promise<Float32Array[]>;
  /** A user's query. Asymmetric models need to know which side they are on. */
  embedQuery(text: string): Promise<Float32Array>;
}

function l2normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i += 1) sum += v[i] * v[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i += 1) v[i] /= norm;
  return v;
}

/**
 * multilingual-e5-small, run locally through ONNX.
 *
 * e5 is asymmetric and trained with literal "query: " and "passage: " prefixes.
 * Dropping them is the classic silent quality loss with this family: everything
 * still returns results, they are just measurably worse, and nothing errors to
 * tell you. They are applied here so no caller can forget.
 */
class LocalEmbedder implements Embedder {
  readonly id = 'local:multilingual-e5-small';
  readonly dim = EMBED_DIM;
  #pipe: unknown = null;

  async #pipeline() {
    if (this.#pipe) return this.#pipe;
    const { pipeline } = await import('@huggingface/transformers');
    this.#pipe = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
      dtype: 'fp32',
    });
    return this.#pipe;
  }

  async #run(texts: string[]): Promise<Float32Array[]> {
    const pipe = (await this.#pipeline()) as (
      t: string[],
      o: Record<string, unknown>,
    ) => Promise<{ dims: number[]; data: Float32Array }>;
    const out = await pipe(texts, { pooling: 'mean', normalize: true });
    const [n, d] = out.dims as [number, number];
    if (d !== this.dim) {
      throw new Error(`embedder returned ${d} dims, schema expects ${this.dim}`);
    }
    const vectors: Float32Array[] = [];
    for (let i = 0; i < n; i += 1) {
      vectors.push(new Float32Array(out.data.slice(i * d, (i + 1) * d)));
    }
    return vectors;
  }

  embedPassages(texts: string[]): Promise<Float32Array[]> {
    return this.#run(texts.map((t) => `passage: ${t}`));
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const [v] = await this.#run([`query: ${text}`]);
    return v;
  }
}

/** voyage-4, asked for 384 dimensions so it drops into the same schema. */
class VoyageEmbedder implements Embedder {
  readonly id = 'voyage-4';
  readonly dim = EMBED_DIM;
  readonly #key: string;

  constructor(key: string) {
    this.#key = key;
  }

  async #call(texts: string[], inputType: 'document' | 'query'): Promise<Float32Array[]> {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.#key}`,
      },
      body: JSON.stringify({
        model: 'voyage-4',
        input: texts,
        input_type: inputType,
        output_dimension: EMBED_DIM,
        output_dtype: 'float',
      }),
    });
    if (!res.ok) {
      throw new Error(`voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    const out: Float32Array[] = new Array(texts.length);
    for (const row of body.data) {
      out[row.index] = l2normalize(Float32Array.from(row.embedding));
    }
    return out;
  }

  embedPassages(texts: string[]): Promise<Float32Array[]> {
    return this.#call(texts, 'document');
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const [v] = await this.#call([text], 'query');
    return v;
  }
}

/**
 * The one place the choice is made.
 *
 * Reported out loud by every caller, because a catalogue embedded with one model
 * and queried with another returns plausible nonsense and nothing errors.
 */
export function defaultEmbedder(): Embedder {
  const key = settings.VOYAGE_API_KEY();
  return key ? new VoyageEmbedder(key) : new LocalEmbedder();
}

/**
 * What gets embedded for a product.
 *
 * Both language names go in, separated, so the vector carries both. Brand and
 * the leaf category are included because "Kraft peanut butter" and "peanut
 * butter" should not be the same point in the space, and because a query is far
 * more often a brand plus a noun than either alone.
 */
export function passageText(p: {
  name: string;
  name_en?: string | null;
  name_fr?: string | null;
  brands?: string | null;
  leaf_category?: string | null;
  quantity?: string | null;
}): string {
  const names = [p.name_en, p.name_fr].filter(Boolean) as string[];
  const label = names.length > 0 ? [...new Set(names)].join(' / ') : p.name;
  const cat = p.leaf_category ? p.leaf_category.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ') : '';
  return [p.brands, label, p.quantity, cat].filter(Boolean).join(' ').slice(0, 500);
}
