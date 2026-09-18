/*
 * CROSS-LANGUAGE RETRIEVAL: deriving a searchable second language for rows that
 * only have one.
 *
 * THE PROBLEM. Canada is bilingual and this catalogue is not. Of the 124,120
 * rows sold in Canada, 42,734 carry only an English name and 58,565 carry only
 * a French one -- 82% of the Canadian catalogue is single-language. A shopper
 * photographing the face of the package that is NOT the face we hold gives us a
 * query that shares no token with the row, and no amount of ranking can recover
 * a row the index cannot match. Measured on a leak-free harness (see
 * crosslang-eval.ts), a language flip costs roughly 25 points of recall@10.
 *
 * WHAT THIS FILE IS NOT. It is not a translator and it does not call one. Rule 8
 * of docs/jamin-gemini-rules.md: everything here runs offline and
 * deterministically, from the catalogue's own data. The bilingual lexicon is
 * built by statistical alignment over the 16,878 rows that happen to carry BOTH
 * names (build-lexicon.ts) -- the catalogue is its own parallel corpus.
 *
 * ============================================================================
 * THE DERIVED NAME IS FOR RETRIEVAL ONLY AND MUST NEVER BE SHOWN TO A SHOPPER.
 * ============================================================================
 * A machine-aligned token is not the product's name. It goes into product_fts so
 * a query can land on the row; the row that comes back is then displayed from
 * name/name_en/name_fr, which are untouched source data. `name_derived` is
 * deliberately absent from SELECT_COLS in search.ts and from the Row and
 * Candidate types, so there is no path by which it can reach a response.
 * test/crosslang.test.ts fails if that ever stops being true.
 *
 * WHY THERE IS NO "TIER 1" COPY STEP. The obvious first move is to notice that a
 * large share of "French-only" rows are not French at all -- "Trojan Ultra Thin
 * Condoms" and "Zudaifu" are both stored in name_fr -- and copy those into the
 * English column so they are findable in English. Measured: 82.7% of the
 * Canadian single-language population carries no marker of the language it is
 * stored under. And copying them buys exactly nothing, because `product_fts
 * MATCH "trojan ultra thin condoms"` with no column filter already searches
 * every indexed column and already finds that row. FTS5 is column-agnostic at
 * query time; the language columns are a storage detail, not a retrieval one.
 * Verified against the live catalogue before a single lexicon entry was written.
 *
 * So the language classifier below is not a mechanism of its own. It is the GATE
 * on translation: only a name that actually carries markers of its own language
 * is worth deriving from, and the other 82.7% are left alone. That keeps the
 * derived column small and keeps junk out of the index.
 */
import type { DatabaseSync } from 'node:sqlite';

/** Lowercase, strip diacritics: matches the FTS tokenizer (unicode61 remove_diacritics 2). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Split on anything that is not a letter or a digit, the way FTS5 unicode61 does. */
export function tokenize(s: string | null | undefined): string[] {
  return (s ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(fold);
}

/** Tokens worth aligning: no single letters, no bare numbers. */
export function contentTokens(s: string | null | undefined): string[] {
  return tokenize(s).filter((t) => t.length > 1 && !/^\d+$/.test(t));
}

/**
 * The row's OWN brand tokens, which are never translated.
 *
 * Deliberately per-row and not a catalogue-wide set of every token that has ever
 * appeared in a `brands` field. That global set is 26,930 tokens wide and
 * swallows ordinary nouns -- some brand somewhere is called "Chocolat" -- which
 * on first measurement cut the alignable French vocabulary from 2,512 tokens to
 * 604 and dropped lexicon coverage from 40% to 9%. The `brands` column tells you
 * what this row's brand is; that is the only brand this row's name can contain.
 */
export function brandTokens(brands: string | null | undefined): Set<string> {
  return new Set(contentTokens(brands));
}

export type Lang = 'en' | 'fr';

/** One token's evidence: how many single-language rows of each language contain it. */
export interface TokenStats { readonly en: number; readonly fr: number; }

/**
 * Which language a name is actually written in, judged token by token.
 *
 * The language TAGS in this data are unreliable -- the whole reason this file
 * exists -- so the tags are not consulted. What is consulted is the catalogue's
 * own single-language populations: a token that shows up overwhelmingly in
 * French-only rows and hardly ever in English-only rows is French evidence.
 *
 * That corpus is disjoint from the bilingual rows the evaluation harness scores
 * on, by construction, so the classifier cannot be reading its own answer key.
 */
export class LanguageModel {
  readonly #df: Map<string, TokenStats>;
  readonly #nEn: number;
  readonly #nFr: number;
  /** log-odds past which a token counts as evidence. log(4) = four times likelier. */
  readonly #threshold: number;
  /** Below this many observations a token is evidence of nothing. */
  readonly #minDf: number;

  constructor(df: Map<string, TokenStats>, nEn: number, nFr: number, threshold = Math.log(4), minDf = 20) {
    this.#df = df; this.#nEn = nEn; this.#nFr = nFr;
    this.#threshold = threshold; this.#minDf = minDf;
  }

  /** Builds the model from the catalogue's single-language rows. Bilingual rows are excluded. */
  static fromCatalogue(db: DatabaseSync): LanguageModel {
    const set = (c: string) => `trim(coalesce(${c},'')) <> ''`;
    const pull = (have: string, lack: string) =>
      db.prepare(`SELECT ${have} AS n FROM product WHERE ${set(have)} AND NOT ${set(lack)}`)
        .all() as unknown as { n: string }[];
    const en = pull('name_en', 'name_fr');
    const fr = pull('name_fr', 'name_en');
    const df = new Map<string, { en: number; fr: number }>();
    const tally = (rows: { n: string }[], key: 'en' | 'fr') => {
      for (const r of rows) {
        for (const t of new Set(contentTokens(r.n))) {
          let a = df.get(t);
          if (!a) df.set(t, (a = { en: 0, fr: 0 }));
          a[key]++;
        }
      }
    };
    tally(en, 'en'); tally(fr, 'fr');
    return new LanguageModel(df, en.length, fr.length);
  }

  /** 'en' | 'fr' when the token is distinctive, null when it is neutral or unseen. */
  markerOf(token: string): Lang | null {
    if (/^\d+$/.test(token)) return null;
    const a = this.#df.get(token);
    if (!a || a.en + a.fr < this.#minDf) return null;
    const A = 2; // add-2 smoothing: one sighting is not a language
    const pe = (a.en + A) / (this.#nEn + 2 * A);
    const pf = (a.fr + A) / (this.#nFr + 2 * A);
    const s = Math.log(pf / pe);
    if (s >= this.#threshold) return 'fr';
    if (s <= -this.#threshold) return 'en';
    return null;
  }

  /**
   * Does this name carry real markers of `lang`?
   *
   * An accent is hard French evidence on its own and short-circuits the corpus:
   * no English product name contains "é", and a French name short enough to have
   * no distinctive token may still have one.
   */
  carriesMarkers(name: string | null | undefined, lang: Lang, brands?: string | null): boolean {
    if (!name) return false;
    if (lang === 'fr' && /[àâäçéèêëîïôöùûüÿœæ]/i.test(name)) return true;
    const own = brandTokens(brands);
    return contentTokens(name).some((t) => !own.has(t) && this.markerOf(t) === lang);
  }
}

/** The shipped lexicon's shape: one source token to at most a few target tokens. */
export interface Lexicon {
  readonly en2fr: Readonly<Record<string, readonly string[]>>;
  readonly fr2en: Readonly<Record<string, readonly string[]>>;
}

/**
 * What produced a derived name, kept on the row so no claim is unattributed.
 *
 * 'name-only' is not a translation. It is the verbatim `name` of a row that has
 * no name_en and no name_fr -- 28,038 rows, 96.9% of which cannot currently be
 * found by their own name text, because `product_fts` indexes the two language
 * columns and not `name`. They ride in this column because the alternative,
 * adding `name` to the index, duplicates 184,302 rows that already work (see
 * FTS_COLUMNS in schema.ts). The provenance marker is what keeps the two cases
 * distinguishable; the column is retrieval-only either way.
 */
export type DerivedSource = 'lexicon-fr2en' | 'lexicon-en2fr' | 'name-only';

export interface Derivation {
  /** The derived tokens, space-joined. Never a sentence, never displayable. */
  readonly text: string;
  readonly source: DerivedSource;
  /** How many of the name's own content tokens the lexicon could translate. */
  readonly translated: number;
  /** How many it could not, and therefore left alone. */
  readonly untranslated: number;
}

/**
 * Derives searchable other-language tokens for a single-language row.
 *
 * Only the TRANSLATED tokens are emitted, never the whole name. The untranslated
 * remainder is already in the index under its own column -- re-emitting it would
 * double its term frequency and quietly re-rank rows that needed no help at all.
 * The derived column is additional signal or it is nothing.
 *
 * A token with no confident entry is left out rather than guessed at: a wrong
 * translation costs more than a missing one, because it can pull an unrelated
 * row up over the right one.
 *
 * Returns null when there is nothing worth indexing -- which is the common case,
 * and is meant to be.
 */
export function derive(
  row: { readonly name: string | null; readonly brands: string | null },
  from: Lang,
  lex: Lexicon,
  lm: LanguageModel,
): Derivation | null {
  if (!row.name) return null;
  // The gate: a name with no markers of its own language is already findable
  // from either language, because FTS5 MATCH does not filter by column.
  if (!lm.carriesMarkers(row.name, from, row.brands)) return null;

  const table = from === 'fr' ? lex.fr2en : lex.en2fr;
  const own = brandTokens(row.brands);
  const out = new Set<string>();
  let translated = 0, untranslated = 0;
  for (const t of contentTokens(row.name)) {
    if (own.has(t)) continue;               // never translate the brand
    const hit = table[t];
    if (hit && hit.length > 0) { translated++; for (const x of hit) out.add(x); }
    else untranslated++;
  }
  if (out.size === 0) return null;
  return {
    text: [...out].join(' '),
    source: from === 'fr' ? 'lexicon-fr2en' : 'lexicon-en2fr',
    translated,
    untranslated,
  };
}
