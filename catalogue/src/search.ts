/**
 * Hybrid retrieval, three bands, and named neighbour rings.
 *
 * Decisions served here: 24 (text and vectors fused), 26 (three bands, not two),
 * 27 (rings, widened outward and named), 28 (Canada preferred, the rest still
 * reachable), 30 (a miss is recorded as a gap), and the raw material for 18
 * (confidence derived from several signals rather than a model's self-report).
 *
 * The fusion is Reciprocal Rank Fusion. It was chosen over adding weighted
 * scores because BM25 and cosine are not on the same scale and never will be:
 * BM25 is unbounded and corpus-dependent, cosine is bounded, and any fixed
 * weighting between them is a constant that silently rots as the catalogue
 * grows. RRF only reads positions, so it cannot rot that way.
 *
 * This module deliberately does NOT decide identity. It returns candidates and
 * the evidence behind each one. Deciding is stage 4's job, because identity also
 * depends on things the catalogue cannot see, like whether a barcode was present.
 */

import type { DatabaseSync } from 'node:sqlite';
import { toVecBlob } from './schema.ts';
import type { Embedder } from './embed.ts';

/** RRF's damping constant. 60 is the value from the original paper. */
const RRF_K = 60;

/** How deep each retriever goes before fusion. Deep enough that a result ranked
 *  poorly by one and well by the other still survives to be fused. */
const RETRIEVE_N = 60;

/**
 * Band thresholds, and the measurement that replaced the first set of them.
 *
 * THE FIRST VERSION WAS WRONG AND THE CATALOGUE SAID SO. CONFIDENT_SIM and a
 * LEAD_MARGIN on cosine were chosen before there were 122,158 rows to look at.
 * Against the real catalogue, twenty probes (ten naming one specific product by
 * brand and size, ten naming a kind of thing where several rows are equally
 * right) came back like this:
 *
 *   top cosine       pinned 0.895 to 0.925   open 0.900 to 0.932
 *   cosine lead      pinned -0.023 to 0.014  open -0.010 to 0.034
 *   rank fusion lead pinned  1.000 to 1.115  open  1.015 to 1.189
 *   brand agreement  pinned  8 of 10          open  0 of 10
 *
 * The two distributions are the same on cosine and on rank fusion. Neither
 * number knows anything about whether the query pinned a product down, and a
 * margin on either is a coin toss dressed as a threshold. The one signal that
 * separated them cleanly is whether the leader agrees with a brand or a size
 * the caller actually supplied. `src/calibrate-band.ts` reruns this.
 *
 * So the band is not a similarity threshold any more. It is: did the caller pin
 * something down, does the leader match it, and is the leader alone in matching
 * it. That last clause is the R6-versus-R6-Mark-II rule and it survives intact;
 * it just tests agreement rather than a cosine gap, because agreement is the
 * thing that turned out to carry the information.
 *
 * A caller who pinned nothing (a typed search with no brand and no size) can
 * never be confident, and that is right rather than a limitation: a person who
 * types "peanut butter" is asking to see the peanut butters.
 *
 *  FLOOR_SIM   below this the catalogue is not claiming to have the thing at
 *              all, and the answer is neighbours rather than candidates. This
 *              one is a floor, not a discriminator, and the measurement above
 *              does not bear on it.
 */
const FLOOR_SIM = 0.72;

/*
 * The largest a category may be and still be a ring.
 *
 * Measured on the loaded catalogue: 6,591 tags, median size 1, and the ones that
 * name something a shopper would recognise run 5 (fresh oranges) to 325 (peanut
 * butters). The next tier up is not a kind of thing at all: beverages 4,114,
 * snacks 7,252, plant based foods 15,226. A thousand sits in the gap.
 */
const MAX_RING_TAG = 1000;

export type Band = 'confident' | 'ambiguous' | 'miss';

export interface Candidate {
  readonly code: string;
  readonly name: string;
  readonly nameEn: string | null;
  readonly nameFr: string | null;
  readonly brands: string | null;
  readonly quantity: string | null;
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
  readonly leafCategory: string | null;
  readonly categoryPath: readonly string[];
  readonly allergens: readonly string[];
  readonly soldInCanada: boolean;
  /** Everything a confidence calculation upstream might want. Nothing is hidden. */
  readonly signals: {
    readonly textRank: number | null;
    readonly vectorRank: number | null;
    readonly bm25: number | null;
    /** Cosine similarity in 0..1, derived from the stored L2 distance. */
    readonly similarity: number | null;
    readonly rrf: number;
    readonly brandAgrees: boolean | null;
    readonly sizeAgrees: boolean | null;
  };
}

export interface NeighbourRing {
  /** The category tag the ring was drawn at, e.g. "en:oranges". */
  readonly tag: string;
  /** Human-facing, already stripped of the language prefix and hyphens. */
  readonly label: string;
  /** 0 is the item's own leaf category; each step out is one wider. */
  readonly distanceOut: number;
  readonly members: readonly Candidate[];
}

export interface SearchQuery {
  readonly text?: string;
  readonly gtin?: string;
  readonly brand?: string;
  /** In the catalogue's base units, grams or millilitres. */
  readonly sizeValue?: number;
  readonly sizeUnit?: string;
  readonly limit?: number;
}

export interface SearchResult {
  readonly band: Band;
  readonly candidates: readonly Candidate[];
  /** Populated on a miss, and on an ambiguous result whose leader is weak. */
  readonly ring: NeighbourRing | null;
  readonly matchedBy: 'gtin' | 'hybrid' | 'none';
}

interface Row {
  code: string;
  name: string;
  name_en: string | null;
  name_fr: string | null;
  brands: string | null;
  quantity: string | null;
  size_value: number | null;
  size_unit: string | null;
  category_path: string;
  leaf_category: string | null;
  allergens: string;
  sold_in_canada: number;
}

const SELECT_COLS = `code, name, name_en, name_fr, brands, quantity, size_value,
  size_unit, category_path, leaf_category, allergens, sold_in_canada`;

/** Strips "en:" and hyphens so a tag can be shown to a person (decision 27). */
export function labelForTag(tag: string): string {
  return tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
}

/**
 * FTS5 is a query language, and a shopper's words are not one.
 *
 * An apostrophe or a stray quote in a product name is a syntax error rather than
 * a bad match, which turns "Nature's Path" into a thrown exception in front of a
 * user. Every token is quoted and OR-ed, and a trailing prefix wildcard is added
 * so a half-typed word still matches.
 */
function toFtsQuery(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/["*()]/g, ' ')
    .split(/[^\p{L}\p{N}.]+/u)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return '';
  return tokens.map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(' OR ');
}

/** sqlite-vec stores L2 distance; with unit vectors this recovers cosine. */
function similarityFromDistance(distance: number): number {
  return Math.max(0, Math.min(1, 1 - (distance * distance) / 2));
}

function normalizeBrand(b: string): string {
  return b.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowToCandidate(
  row: Row,
  signals: Candidate['signals'],
  query: SearchQuery,
): Candidate {
  const brandAgrees =
    query.brand && row.brands
      ? normalizeBrand(row.brands).includes(normalizeBrand(query.brand)) ||
        normalizeBrand(query.brand).includes(normalizeBrand(row.brands.split(',')[0] ?? ''))
      : null;

  // Within 5%: pack sizes are printed rounded and "500 ml" and "0.5 L" should
  // not read as different products (decision 19).
  const sizeAgrees =
    query.sizeValue && row.size_value && query.sizeUnit === row.size_unit
      ? Math.abs(row.size_value - query.sizeValue) / query.sizeValue <= 0.05
      : null;

  return {
    code: row.code,
    name: row.name,
    nameEn: row.name_en,
    nameFr: row.name_fr,
    brands: row.brands,
    quantity: row.quantity,
    sizeValue: row.size_value,
    sizeUnit: row.size_unit,
    leafCategory: row.leaf_category,
    categoryPath: JSON.parse(row.category_path) as string[],
    allergens: JSON.parse(row.allergens) as string[],
    soldInCanada: row.sold_in_canada === 1,
    signals: { ...signals, brandAgrees, sizeAgrees },
  };
}

export class Catalogue {
  readonly #db: DatabaseSync;
  readonly #tagSizes = new Map<string, number>();
  readonly #embedder: Embedder;

  constructor(db: DatabaseSync, embedder: Embedder) {
    this.#db = db;
    this.#embedder = embedder;
  }

  /** Exact barcode lookup. Decision 15: a barcode is truth, so it short-circuits. */
  byGtin(gtin: string): Candidate | null {
    const normalized = gtin.replace(/\D/g, '');
    // A UPC-A read is the same product as its EAN-13 form with a leading zero,
    // and retailers publish both. Trying the padded and stripped forms costs
    // two indexed lookups and avoids a false "we have never seen this".
    const forms = new Set([normalized, normalized.padStart(13, '0'), normalized.replace(/^0+/, '')]);
    for (const form of forms) {
      if (!form) continue;
      const row = this.#db
        .prepare(`SELECT ${SELECT_COLS} FROM product WHERE code = ?`)
        .get(form) as Row | undefined;
      if (row) {
        return rowToCandidate(
          row,
          { textRank: null, vectorRank: null, bm25: null, similarity: 1, rrf: 1, brandAgrees: null, sizeAgrees: null },
          {},
        );
      }
    }
    return null;
  }

  #textSearch(text: string): { row: Row; bm25: number }[] {
    const q = toFtsQuery(text);
    if (!q) return [];
    const rows = this.#db
      .prepare(
        `SELECT ${SELECT_COLS.split(', ').map((c) => `p.${c.trim()}`).join(', ')},
                bm25(product_fts, 4.0, 4.0, 2.0, 1.0) AS score
         FROM product_fts f
         JOIN product p ON p.rowid = f.rowid
         WHERE product_fts MATCH ?
         ORDER BY score
         LIMIT ?`,
      ).all(q, RETRIEVE_N) as unknown as (Row & { score: number })[];
    return rows.map((r) => ({ row: r, bm25: r.score }));
  }

  async #vectorSearch(text: string): Promise<{ row: Row; similarity: number }[]> {
    const vec = await this.#embedder.embedQuery(text);
    const hits = this.#db
      .prepare(
        `SELECT rowid, distance FROM product_vec
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      ).all(toVecBlob(vec), RETRIEVE_N) as unknown as { rowid: bigint | number; distance: number }[];
    if (hits.length === 0) return [];

    const ids = hits.map((h) => Number(h.rowid));
    const rows = this.#db
      .prepare(`SELECT rowid, ${SELECT_COLS} FROM product WHERE rowid IN (${ids.map(() => '?').join(',')})`).all(...ids) as unknown as (Row & { rowid: number })[];
    const byId = new Map(rows.map((r) => [Number(r.rowid), r]));

    const out: { row: Row; similarity: number }[] = [];
    for (const h of hits) {
      const row = byId.get(Number(h.rowid));
      if (row) out.push({ row, similarity: similarityFromDistance(h.distance) });
    }
    return out;
  }

  /**
   * The neighbour ring (decision 27).
   *
   * Walks the category path from the most specific tag outward, stopping at the
   * first ring that has enough members to be worth showing. The tag it stopped
   * at is returned, because the screen has to say which ring this is: "we do not
   * have that one, here are other oranges" is a different sentence from "here
   * are other fruits", and showing the second while saying the first is the kind
   * of small lie that costs the whole product's credibility.
   */
  ring(categoryPath: readonly string[], want: number, exclude?: string): NeighbourRing | null {
    for (let i = categoryPath.length - 1; i >= 0; i -= 1) {
      const tag = categoryPath[i];

      // A tag this big is not a kind of thing, it is a shelf of the whole shop,
      // and three arbitrary rows from it read as the app having lost the plot.
      // The measured split is clean: the tags that name something a shopper
      // would recognise run from 5 members (fresh oranges) to a few hundred
      // (peanut butters, kombuchas), and the next ones up are "beverages" at
      // 4,114 and "plant based foods" at 15,226. Asking for a Pink Lady apple
      // and being shown three beverages is the failure this prevents.
      if (this.#tagSize(tag) > MAX_RING_TAG) continue;
      // Membership is a path question, not a leaf question. Matching on the leaf
      // is the version that looks right and never widens: nothing has "citrus"
      // as its deepest tag, so the wider ring would always come back empty.
      const rows = this.#db
        .prepare(
          `SELECT ${SELECT_COLS.split(', ').map((c) => `p.${c.trim()}`).join(', ')}
           FROM product_category pc
           JOIN product p ON p.rowid = pc.rowid_ref
           WHERE pc.tag = ? AND p.code != ?
           ORDER BY p.sold_in_canada DESC, (p.size_value IS NOT NULL) DESC, p.name
           LIMIT ?`,
        ).all(tag, exclude ?? '', want) as unknown as Row[];
      // One honest neighbour at the right level beats three at the wrong one.
      // "We do not have that one, here is the other orange we have" is true;
      // widening to "here are some fruits" to reach a quota is not.
      if (rows.length >= 1) {
        return {
          tag,
          label: labelForTag(tag),
          distanceOut: categoryPath.length - 1 - i,
          members: rows.map((r) =>
            rowToCandidate(
              r,
              { textRank: null, vectorRank: null, bm25: null, similarity: null, rrf: 0, brandAgrees: null, sizeAgrees: null },
              {},
            ),
          ),
        };
      }
    }
    return null;
  }

  /** Cached: the ring walk asks about the same handful of tags constantly. */
  #tagSize(tag: string): number {
    const hit = this.#tagSizes.get(tag);
    if (hit !== undefined) return hit;
    const row = this.#db
      .prepare('SELECT count(*) AS n FROM product_category WHERE tag = ?')
      .get(tag) as { n: number };
    this.#tagSizes.set(tag, row.n);
    return row.n;
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    if (query.gtin) {
      const hit = this.byGtin(query.gtin);
      if (hit) return { band: 'confident', candidates: [hit], ring: null, matchedBy: 'gtin' };
    }

    const text = query.text?.trim();
    if (!text) {
      this.#recordGap(query);
      return { band: 'miss', candidates: [], ring: null, matchedBy: 'none' };
    }

    const [textHits, vecHits] = await Promise.all([
      Promise.resolve(this.#textSearch(text)),
      this.#vectorSearch(text),
    ]);

    // Fuse on rank, keeping each retriever's own evidence attached so the caller
    // can see WHY something ranked where it did.
    const merged = new Map<
      string,
      { row: Row; textRank: number | null; vectorRank: number | null; bm25: number | null; similarity: number | null; rrf: number }
    >();

    textHits.forEach((h, i) => {
      merged.set(h.row.code, {
        row: h.row,
        textRank: i + 1,
        vectorRank: null,
        bm25: h.bm25,
        similarity: null,
        rrf: 1 / (RRF_K + i + 1),
      });
    });
    vecHits.forEach((h, i) => {
      const existing = merged.get(h.row.code);
      if (existing) {
        existing.vectorRank = i + 1;
        existing.similarity = h.similarity;
        existing.rrf += 1 / (RRF_K + i + 1);
      } else {
        merged.set(h.row.code, {
          row: h.row,
          textRank: null,
          vectorRank: i + 1,
          bm25: null,
          similarity: h.similarity,
          rrf: 1 / (RRF_K + i + 1),
        });
      }
    });

    const ranked = [...merged.values()].sort((a, b) => {
      if (b.rrf !== a.rrf) return b.rrf - a.rrf;
      // Decision 28: Canada preferred, never a hard filter.
      return b.row.sold_in_canada - a.row.sold_in_canada;
    });

    const limit = query.limit ?? 5;
    const candidates = ranked
      .slice(0, limit)
      .map((m) =>
        rowToCandidate(
          m.row,
          {
            textRank: m.textRank,
            vectorRank: m.vectorRank,
            bm25: m.bm25,
            similarity: m.similarity,
            rrf: m.rrf,
            brandAgrees: null,
            sizeAgrees: null,
          },
          query,
        ),
      );

    const band = this.#band(candidates);

    // A ring is attached whenever the leader is not good enough to stand alone,
    // so the screen never has to make a second round trip to have something to
    // show (decisions 26, 27, 48).
    // Drawn from the best ranked candidate that actually has a category, not
    // from the leader alone. Only a quarter of the catalogue arrived with a
    // category and duplicate listings of the same product are common, so the
    // leader is very often an uncategorised twin of a row two places below it
    // that knows exactly what it is. Reading only the leader is why asking for
    // a kind of orange the catalogue does not stock returned no other oranges,
    // when it had 367 of them.
    const withPath = candidates.find((c) => c.categoryPath.length > 0);
    const ring =
      band === 'confident'
        ? null
        : this.ring(withPath?.categoryPath ?? [], 3, candidates[0]?.code);

    if (band === 'miss') this.#recordGap(query);

    return { band, candidates, ring, matchedBy: candidates.length > 0 ? 'hybrid' : 'none' };
  }

  #band(candidates: readonly Candidate[]): Band {
    const top = candidates[0];
    if (!top) return 'miss';
    const topSim = top.signals.similarity ?? 0;

    if (topSim < FLOOR_SIM && top.signals.textRank !== 1) return 'miss';

    // How much of what the caller pinned down this row matches. Null means the
    // caller did not supply it, which is different from supplying it and being
    // contradicted, and is scored differently: an absent brand cannot earn
    // confidence and does not destroy it either.
    const agreement = (c: Candidate) =>
      (c.signals.brandAgrees === true ? 1 : 0) + (c.signals.sizeAgrees === true ? 1 : 0);
    const contradicted = (c: Candidate) =>
      c.signals.brandAgrees === false || c.signals.sizeAgrees === false;

    const lead = agreement(top);
    if (lead === 0) return 'ambiguous';
    if (contradicted(top)) return 'ambiguous';

    // Alone in matching, or not confident. Two rows that both carry the brand
    // and the size the label showed are two rows the user has to choose
    // between, however far apart their cosines happen to fall.
    const rivals = candidates.slice(1).filter((c) => agreement(c) >= lead).length;
    if (rivals > 0) return 'ambiguous';

    return 'confident';
  }

  /** Decision 30: a miss is recorded, and nothing typed is promoted automatically. */
  #recordGap(query: SearchQuery): void {
    this.#db
      .prepare(
        `INSERT INTO catalogue_gap (gtin, query_text, observed_at, note)
         VALUES (?, ?, ?, ?)`,
      )
      .run(query.gtin ?? null, query.text ?? null, new Date().toISOString(), null);
  }
}
