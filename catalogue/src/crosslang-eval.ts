/*
 * THE ONLY HONEST OFFLINE MEASUREMENT OF CROSS-LANGUAGE RECALL.
 *
 * WHY THE DRY-RUN EVAL CANNOT ANSWER THIS. identify/eval's manifest carries the
 * catalogue's own `name` and `brand` as the query text -- on 200 of 200 rows.
 * The query IS the answer key, so it scores ~195/200 and would score ~195/200
 * against any index that contains the catalogue at all. It cannot detect a
 * paraphrase, and it certainly cannot detect a language flip. Any claim about
 * cross-language retrieval measured on it is measuring the leak.
 *
 * THE SHAPE THAT IS LEAK-FREE. Take the rows that carry BOTH names and a
 * genuinely different one in each. Build a throwaway index holding ONE of the
 * two languages. Query it with the OTHER. The query text is then provably not in
 * the index, which is exactly the situation a shopper creates when they
 * photograph the English face of a row we hold only in French.
 *
 *   direction fr2en : index name_fr, query with name_en  (simulates a FR-only row)
 *   direction en2fr : index name_en, query with name_fr  (simulates an EN-only row)
 *
 * The CONTROL queries the same index with the language it DOES hold. The gap
 * between the two is the whole cost of the language flip, measured rather than
 * assumed, and it is the only number this work can honestly claim to move.
 *
 * NO LEAK FROM THE LEXICON EITHER. The evaluation rows are bilingual, and the
 * lexicon is built by aligning bilingual rows, so a lexicon trained on all of
 * them would have memorised the answers. `--holdout N` excludes rowid % N == 0
 * from training and the harness scores on exactly those rows. Train and test do
 * not overlap. The derived text for an evaluation row is computed from the
 * INDEXED language alone, never from the query language.
 *
 * Nothing here touches the network. The vector arm is disabled and the embedder
 * passed in throws if anything tries, so a missing VOYAGE_API_KEY cannot quietly
 * become a network call.
 *
 * Usage:
 *   node src/crosslang-eval.ts --dir fr2en --mod 20 [--derived] [--control]
 *                              [--cols name_fr,brands,leaf_category]
 */
import { copyFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openCatalogueReadOnly, rebuildFts } from './schema.ts';
import { Catalogue } from './search.ts';
import { LanguageModel, derive, type Lexicon, type Lang } from './crosslang.ts';
import { loadLexicon } from './backfill-derived.ts';
import { buildLexicon, readParallelCorpus, DEFAULT_LEXICON_OPTIONS } from './build-lexicon.ts';

export type Direction = 'fr2en' | 'en2fr';

export interface EvalOptions {
  readonly sourceDb: string;
  readonly workDb: string;
  readonly direction: Direction;
  /** Sample and holdout modulus: rows with rowid % mod === 0 are the test set. */
  readonly mod: number;
  /** Index the derived column and backfill it (the AFTER condition). */
  readonly derived: boolean;
  /** Query with the language the index HOLDS, to establish the ceiling. */
  readonly control: boolean;
  /** Override the indexed column list. Defaults follow `direction` and `derived`. */
  readonly columns?: readonly string[];
  /** Train the lexicon here rather than loading the shipped one. Keeps the holdout honest. */
  readonly lexicon?: Lexicon;
}

export interface EvalResult {
  readonly n: number;
  readonly r1: number; readonly r3: number; readonly r10: number;
  readonly columns: readonly string[];
  readonly derivedRows: number;
  readonly lost: readonly string[];
}

/** An embedder that exists only to prove the vector arm never runs. */
const NO_EMBEDDER = {
  embedQuery(): never { throw new Error('crosslang-eval is offline: the vector arm must not run'); },
  embedPassage(): never { throw new Error('crosslang-eval is offline: no embedding'); },
} as never;

async function runCrossLanguageEval(opt: EvalOptions): Promise<EvalResult> {
  const indexedName = opt.direction === 'fr2en' ? 'name_fr' : 'name_en';
  const queriedName = opt.direction === 'fr2en' ? 'name_en' : 'name_fr';
  const from: Lang = opt.direction === 'fr2en' ? 'fr' : 'en';
  const columns = opt.columns
    ?? [indexedName, 'brands', 'leaf_category', ...(opt.derived ? ['name_derived'] : [])];

  copyFileSync(opt.sourceDb, opt.workDb);
  const w = new DatabaseSync(opt.workDb);
  // DELETE journal, not WAL: the throwaway is opened read-only a line later and
  // a WAL file left behind by this connection makes that open fail.
  w.exec('PRAGMA journal_mode = DELETE');
  for (const [c, t] of [['name_derived', 'TEXT'], ['derived_source', 'TEXT']] as const) {
    const have = (w.prepare('PRAGMA table_info(product)').all() as unknown as { name: string }[]).map((r) => r.name);
    if (!have.includes(c)) w.exec(`ALTER TABLE product ADD COLUMN ${c} ${t}`);
  }

  let derivedRows = 0;
  if (opt.derived) {
    const lex = opt.lexicon ?? loadLexicon();
    const lm = LanguageModel.fromCatalogue(w);
    // Derive from the INDEXED language only. The queried language is the thing
    // being predicted; feeding it in would be the leak this file exists to avoid.
    const rows = w.prepare(`SELECT rowid, ${indexedName} AS n, brands FROM product
      WHERE trim(coalesce(${indexedName},'')) <> ''`).all() as unknown as
      { rowid: number; n: string; brands: string | null }[];
    const up = w.prepare('UPDATE product SET name_derived = ?, derived_source = ? WHERE rowid = ?');
    for (const r of rows) {
      const d = derive({ name: r.n, brands: r.brands }, from, lex, lm);
      if (d) { up.run(d.text, d.source, r.rowid); derivedRows++; }
    }
  }

  w.exec('DROP TABLE IF EXISTS product_fts');
  w.exec(`CREATE VIRTUAL TABLE product_fts USING fts5(
    ${columns.join(', ')},
    content='product', content_rowid='rowid',
    tokenize="unicode61 remove_diacritics 2")`);
  rebuildFts(w);
  w.close();

  const db = openCatalogueReadOnly(opt.workDb);
  const cat = new Catalogue(db, NO_EMBEDDER);
  const set = (c: string) => `trim(coalesce(${c},'')) <> ''`;
  const sample = db.prepare(
    `SELECT rowid, code, name_en, name_fr, brands FROM product
     WHERE sold_in_canada = 1 AND ${set('name_en')} AND ${set('name_fr')}
       AND lower(name_en) <> lower(name_fr) AND (rowid % ${opt.mod}) = 0`,
  ).all() as unknown as Record<string, string>[];

  let n = 0, r1 = 0, r3 = 0, r10 = 0;
  const lost: string[] = [];
  for (const p of sample) {
    const text = String(opt.control ? p[indexedName] : p[queriedName]);
    const res = await cat.search({
      text: [p.brands, text].filter(Boolean).join(' ').slice(0, 300),
      brand: p.brands || undefined,
      limit: 10,
      vectors: false,
    });
    const k = res.candidates.findIndex((c) => c.code === p.code);
    n++;
    if (k === 0) r1++;
    if (k >= 0 && k < 3) r3++;
    if (k >= 0) r10++;
    else if (lost.length < 20) lost.push(`${p.code} ${indexedName}="${p[indexedName]}" <- q="${text}"`);
  }
  db.close();
  return { n, r1, r3, r10, columns, derivedRows, lost };
}

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2);
  const val = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const mod = Number(val('mod', '20'));
  const direction = val('dir', 'fr2en') as Direction;
  const sourceDb = val('db', process.env.SHIN_DB ?? 'data/catalogue.db');
  const workDb = val('work', `${process.env.TMPDIR ?? '.'}/crosslang-work.db`);
  const cols = val('cols', '');
  // Trained with the SAME modulus the harness scores on, so the test rows are
  // never in the lexicon's training data. This is the point of the flag.
  const src = openCatalogueReadOnly(sourceDb);
  const num = (k: string, d: number) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
  const lexicon = buildLexicon(readParallelCorpus(src as never), {
    holdout: mod,
    minCo: num('minco', DEFAULT_LEXICON_OPTIONS.minCo),
    minDice: num('mindice', DEFAULT_LEXICON_OPTIONS.minDice),
    topK: num('topk', DEFAULT_LEXICON_OPTIONS.topK),
  });
  src.close();
  const r = await runCrossLanguageEval({
    sourceDb, workDb, direction, mod,
    derived: args.includes('--derived'),
    control: args.includes('--control'),
    columns: cols ? cols.split(',') : undefined,
    lexicon,
  });
  const pc = (x: number) => ((x / r.n) * 100).toFixed(1);
  console.log(`${direction}${args.includes('--control') ? ' CONTROL' : ''} cols=[${r.columns.join(',')}] derivedRows=${r.derivedRows}`);
  console.log(`  n=${r.n}  r@1=${r.r1} (${pc(r.r1)}%)  r@3=${r.r3} (${pc(r.r3)}%)  r@10=${r.r10} (${pc(r.r10)}%)`);
  if (args.includes('--lost')) r.lost.forEach((s) => console.log('  LOST ' + s));
}
