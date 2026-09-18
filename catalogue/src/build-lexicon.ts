/*
 * BUILDS THE BILINGUAL LEXICON FROM THE CATALOGUE ITSELF. No network, no API key,
 * no translation service (rule 8, docs/jamin-gemini-rules.md).
 *
 * 16,878 rows in this catalogue carry an English name AND a genuinely different
 * French name. That is a parallel corpus, sitting in the database already, and
 * it is the only bilingual resource this project is allowed to use offline. Word
 * alignment over it gives a descriptor lexicon for free.
 *
 * THE METHOD is Dice coefficient over document co-occurrence, not an IBM model.
 * Product names are four to eight tokens, so position carries no information and
 * the fancier aligners have nothing to work with. For each (english token,
 * french token) pair appearing together in the same product's two names:
 *
 *     dice(e,f) = 2 * co(e,f) / (count(e) + count(f))
 *
 * Tokens IDENTICAL on both sides are dropped from both sides before counting.
 * They are brand names, numbers, or words French and English share, and leaving
 * them in makes every such token look perfectly aligned with itself and drags
 * the marginals around. Each row's own `brands` tokens are dropped too.
 *
 * THRESHOLDS, and why they are what they are. Measured on held-out rows
 * (rowid % 20 == 0, excluded from training so coverage is not self-reported):
 *
 *   minCo  minDice  topK   entries   held-out token coverage   rows with >=1
 *      8     0.34      1       266            25.8%                46.0%
 *      4     0.25      2       489            35.2%                60.2%
 *      3     0.20      2       686            39.5%                65.1%
 *      2     0.15      3     1,091            52.1%                75.7%
 *
 * Coverage is not the objective -- recall is -- so the setting was chosen by
 * running crosslang-eval.ts at each, not by reading that table. Direction fr2en,
 * n=780, leak-free, holdout honoured:
 *
 *   minCo  minDice  topK      r@1          r@3          r@10
 *      8     0.34      1    245 (31.4%)  400 (51.3%)  544 (69.7%)
 *      3     0.20      2    247 (31.7%)  409 (52.4%)  553 (70.9%)   <- shipped
 *      2     0.15      3    243 (31.2%)  404 (51.8%)  555 (71.2%)
 *
 * The aggressive setting buys two more rows at r@10 and gives back four at r@1
 * and five at r@3, which is the shape you get when a looser threshold starts
 * admitting wrong pairs: they widen the net and blunt the ranking. The
 * conservative setting is worse at every depth. The middle one is shipped.
 *
 * WHAT THIS LEXICON IS NOT. It is not correct. Dice alignment on 16k short names
 * produces real errors, and the ones it produces are instructive: "unsalted ->
 * salees" and "skimmed -> partiellement" are both wrong (they aligned to the
 * wrong half of "non salées" and "lait partiellement écrémé"), and both are
 * still in roughly the right lexical neighbourhood for BM25, which is the only
 * consumer. Nothing here is ever shown to a shopper -- see the header of
 * crosslang.ts -- so an error costs ranking, not credibility. That is the whole
 * reason the derived text is confined to the index.
 *
 * Usage:  node src/build-lexicon.ts [outPath] [--holdout N] [--minco N] [--mindice N] [--topk N]
 */
import { writeFileSync } from 'node:fs';
import { openCatalogueReadOnly } from './schema.ts';
import { contentTokens, brandTokens, type Lexicon } from './crosslang.ts';

export interface LexiconOptions {
  /** Rows with rowid % holdout === 0 are excluded from training. 0 trains on everything. */
  readonly holdout: number;
  readonly minCo: number;
  readonly minDice: number;
  readonly topK: number;
}

export const DEFAULT_LEXICON_OPTIONS: LexiconOptions = {
  holdout: 0, minCo: 3, minDice: 0.2, topK: 2,
};

interface Pair { rowid: number; en: string; fr: string; brands: string | null }

export function readParallelCorpus(db: { prepare: (s: string) => { all: (...a: unknown[]) => unknown[] } }): Pair[] {
  const set = (c: string) => `trim(coalesce(${c},'')) <> ''`;
  return db.prepare(
    `SELECT rowid, name_en AS en, name_fr AS fr, brands FROM product
     WHERE ${set('name_en')} AND ${set('name_fr')} AND lower(name_en) <> lower(name_fr)`,
  ).all() as unknown as Pair[];
}

export function buildLexicon(pairs: readonly Pair[], opt: LexiconOptions): Lexicon {
  const co = new Map<string, number>();
  const cEn = new Map<string, number>();
  const cFr = new Map<string, number>();
  for (const p of pairs) {
    if (opt.holdout > 0 && Number(p.rowid) % opt.holdout === 0) continue;
    const own = brandTokens(p.brands);
    const E = new Set(contentTokens(p.en).filter((t) => !own.has(t)));
    const F = new Set(contentTokens(p.fr).filter((t) => !own.has(t)));
    for (const t of [...E]) if (F.has(t)) { E.delete(t); F.delete(t); }
    // A name with more than eight alignable tokens is a category dump, not a
    // product name; every pair it emits is noise against a big denominator.
    if (E.size === 0 || F.size === 0 || E.size > 8 || F.size > 8) continue;
    for (const e of E) cEn.set(e, (cEn.get(e) ?? 0) + 1);
    for (const f of F) cFr.set(f, (cFr.get(f) ?? 0) + 1);
    for (const e of E) for (const f of F) {
      // \u0000 as an escape, never a literal NUL byte: a raw NUL makes this
      // file BINARY to git -- undiffable, unreviewable, and fragile across editors.
      const k = `${e}\u0000${f}`;
      co.set(k, (co.get(k) ?? 0) + 1);
    }
  }
  const fwd = new Map<string, { t: string; d: number }[]>();
  const bwd = new Map<string, { t: string; d: number }[]>();
  for (const [k, c] of co) {
    if (c < opt.minCo) continue;
    const i = k.indexOf('\u0000');
    const e = k.slice(0, i), f = k.slice(i + 1);
    const d = (2 * c) / ((cEn.get(e) ?? 0) + (cFr.get(f) ?? 0));
    if (d < opt.minDice) continue;
    (fwd.get(e) ?? fwd.set(e, []).get(e)!).push({ t: f, d });
    (bwd.get(f) ?? bwd.set(f, []).get(f)!).push({ t: e, d });
  }
  const trim = (m: Map<string, { t: string; d: number }[]>): Record<string, string[]> => {
    const o: Record<string, string[]> = {};
    for (const [k, v] of m) o[k] = v.sort((a, b) => b.d - a.d || (a.t < b.t ? -1 : 1)).slice(0, opt.topK).map((x) => x.t);
    return o;
  };
  // Sorted keys so the shipped JSON is byte-stable across rebuilds and a diff
  // shows what actually changed rather than a hash-order reshuffle.
  const sortKeys = (o: Record<string, string[]>) =>
    Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return { en2fr: sortKeys(trim(fwd)), fr2en: sortKeys(trim(bwd)) };
}

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (n: string, d: number) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? Number(args[i + 1]) : d;
  };
  const out = args[0] && !args[0].startsWith('--') ? args[0] : new URL('./lexicon-fr-en.json', import.meta.url).pathname.replace(/^\//, '');
  const opt: LexiconOptions = {
    holdout: flag('holdout', DEFAULT_LEXICON_OPTIONS.holdout),
    minCo: flag('minco', DEFAULT_LEXICON_OPTIONS.minCo),
    minDice: flag('mindice', DEFAULT_LEXICON_OPTIONS.minDice),
    topK: flag('topk', DEFAULT_LEXICON_OPTIONS.topK),
  };
  const db = openCatalogueReadOnly(process.env.SHIN_DB ?? 'data/catalogue.db');
  const pairs = readParallelCorpus(db as never);
  const lex = buildLexicon(pairs, opt);
  writeFileSync(out, `${JSON.stringify(lex, null, 0)}\n`);
  console.log(`parallel pairs ${pairs.length}, holdout=${opt.holdout} minco=${opt.minCo} mindice=${opt.minDice} topk=${opt.topK}`);
  console.log(`wrote ${out}: fr2en ${Object.keys(lex.fr2en).length} entries, en2fr ${Object.keys(lex.en2fr).length}`);
  db.close();
}
