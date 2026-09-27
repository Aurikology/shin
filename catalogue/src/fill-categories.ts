/**
 * Unit 9 of docs/catalogue-build-plan-2026-09-26.md: fill the category gap
 * for products that have no category at all.
 *
 * WHO THE UNCATEGORISED ROWS ACTUALLY ARE, MEASURED BEFORE ANY RULE WAS
 * WRITTEN. The plan's own hypothesis (raised because unit 8, next door, is
 * about electronics part numbers) was that most of the 134,865 would turn
 * out to be unreadable codes not worth a category. Measured 2026-09-26
 * against the post-cleanup catalogue: they are not. Of 131,503 no-category
 * rows, 129,495 (98.5%) come from the four Open *Facts sources (food,
 * beauty, pet food, "products"), every one of them with a human-readable
 * name, and 87,000 are Canadian. Electronics (`icecat`) contributes 8 rows
 * in total. The honest finding is the opposite of the hypothesis: this is
 * overwhelmingly real, nameable products that upstream simply never tagged.
 *
 * Checked and DROPPED: reading the category from the product's own source.
 * Sampled rows straight out of the raw files behind each source
 * (openbeautyfacts.jsonl.gz, canada.parquet) and `categories_tags` is
 * genuinely empty there too -- this is not a loader bug eating a category
 * the source published, it is upstream never having one. So there is
 * nothing to "read back"; a rule has to be built or the gap stays a gap.
 *
 * THE RULE HAS TWO ARMS. ONLY ONE OF THEM SHIPS.
 *
 *   1. BRAND, tried first, OFF BY DEFAULT (--brand-arm turns it on).
 *      The plan ranks brand affinity as the strongest evidence, so it was
 *      built and measured at 90%-agreement-of-3+: 538 rows fillable. Read
 *      by hand, it is not safe. At 90% it assigned "Pearl Couscous Salad"
 *      (brand Fontaine Santé, which mostly makes hummus) to `en:hummus`,
 *      wrong. Tightened to UNANIMOUS (100% of >=3 members): still wrong on
 *      a random sample, and not from noise -- from collision. "Milk"
 *      (brand "Black & White") was filed under `en:anti-perspirants`
 *      because a Nova Scotia evaporated-milk brand and an unrelated
 *      antiperspirant sub-line happen to print the identical brand string,
 *      and the antiperspirant SKUs outnumber the milk ones in this
 *      catalogue. "Shampoo" (brand "Vita Coco") was filed under
 *      `en:coconut-waters` for the same reason. This is unit 4's own
 *      failure shape one column over: a string matches by coincidence, not
 *      meaning, and no agreement threshold fixes a collision, because the
 *      collision produces its OWN unanimous agreement. Left in the code,
 *      off by default, so the evidence and the kill travel together.
 *
 *   2. NAME PHRASE against this catalogue's OWN vocabulary. THIS IS WHAT
 *      SHIPS. The set of
 *      leaf categories already in use, kept only where a leaf's readable
 *      form (`en:lean-ground-beef` -> "lean ground beef") is two to four
 *      words and has at least 3 members -- a single word is exactly the
 *      collision risk that killed unit 4 (aisle strings matching tag
 *      strings by coincidence, not meaning; "en:food" catching purees).
 *      Requiring a multi-word phrase to appear VERBATIM, as a run of
 *      adjacent tokens, in the product's own name is a much narrower claim
 *      than a single-word or substring match, and it reads overwhelmingly
 *      clean by hand (see docs/category-fill-2026-09-26.md).
 *
 *      NEGATION GUARD, found while measuring, not assumed away: "sans
 *      produits laitiers" (French for "dairy-free") contains the phrase
 *      "produits laitiers" ("dairy products") and would otherwise file a
 *      dairy-free item under dairy. A product whose matched phrase is
 *      immediately preceded by sans/without/non/sin is skipped rather than
 *      guessed at, because that direction of guess is a confident lie, not
 *      a rounding error.
 *
 * Bare part numbers (isBarePartNumber, from unit 8's own rule) are skipped
 * outright: a code has no words to match and brand affinity over a code is
 * not evidence about what the thing is.
 *
 * DRY RUN BY DEFAULT. `--apply` is required to write. Even then this never
 * imports load.ts and never runs while another process might be mid-write;
 * openCatalogueReadOnly is used for every read, and the one writer path
 * opens its own connection separately, only under --apply.
 */

import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { openCatalogue, openCatalogueReadOnly, rebuildFts, rebuildCategories } from './schema.ts';
import { isBarePartNumber } from './part-number.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const APPLY = process.argv.includes('--apply');
/**
 * Off by default. See the header: unanimous brand agreement does not
 * distinguish real evidence from a brand-string collision, and it produced
 * confidently wrong assignments on measurement (milk -> anti-perspirants).
 * Passing this flag reopens an arm this file's own falsifier killed.
 */
const BRAND_ARM = process.argv.includes('--brand-arm');

/** A brand needs at least this many already-categorised products to speak for itself. */
const BRAND_MIN_MEMBERS = 3;
/** How much of a brand's categorised products must agree. Unanimous: see the header. */
const BRAND_UNANIMOUS = 1.0;

/** A vocabulary phrase needs at least this many already-categorised members. */
const PHRASE_MIN_MEMBERS = 3;
/** Phrase length window. One word is the unit-4 collision risk; five+ is rare and slow. */
const PHRASE_MIN_WORDS = 2;
const PHRASE_MAX_WORDS = 4;

const NEGATORS = new Set(['sans', 'without', 'non', 'sin']);

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(Boolean);
}

interface CatRow {
  brands: string | null;
  category_path: string;
  leaf_category: string | null;
}

interface BrandRule {
  leaf: string;
  path: string;
}

interface PhraseRule {
  leaf: string;
  path: string;
  members: number;
}

function buildRules(db: DatabaseSync): { brandRules: Map<string, BrandRule>; phraseRules: Map<string, PhraseRule> } {
  const categorized = db
    .prepare(
      `SELECT brands, category_path, leaf_category FROM product
       WHERE category_path <> '[]' AND leaf_category IS NOT NULL`,
    )
    .all() as unknown as CatRow[];

  // --- Brand histogram: brand -> leaf -> { n, path } ---
  const brandHist = new Map<string, Map<string, { n: number; path: string }>>();
  // --- Vocabulary: leaf -> { members, words, pathVotes } ---
  // pathVotes: the SAME leaf tag is stored under more than one full ancestor
  // chain on 1,236 of 3,807 candidate leaves, measured (e.g. en:plant-based
  // sometimes comes through en:pastas/en:spaghetti and sometimes does not,
  // because OFF's own tagging is inconsistent, not because the leaf is wrong).
  // Picking "whichever row is read first" assigned a chili the ancestor
  // chain of spaghetti. The mode -- the path this leaf's own categorised
  // members agree on most -- is the only defensible choice: it is what most
  // of the evidence actually says, not an accident of scan order.
  const vocab = new Map<string, { members: number; words: string[]; pathVotes: Map<string, number> }>();

  for (const r of categorized) {
    const leaf = r.leaf_category!;

    let v = vocab.get(leaf);
    if (!v) {
      const bare = leaf.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim();
      v = { members: 0, words: bare.split(/\s+/).filter(Boolean), pathVotes: new Map() };
      vocab.set(leaf, v);
    }
    v.members += 1;
    v.pathVotes.set(r.category_path, (v.pathVotes.get(r.category_path) ?? 0) + 1);

    if (r.brands) {
      for (const b0 of r.brands.split(',')) {
        const b = norm(b0);
        if (!b) continue;
        let m = brandHist.get(b);
        if (!m) { m = new Map(); brandHist.set(b, m); }
        let e = m.get(leaf);
        if (!e) { e = { n: 0, path: r.category_path }; m.set(leaf, e); }
        e.n += 1;
      }
    }
  }

  const brandRules = new Map<string, BrandRule>();
  for (const [b, m] of brandHist) {
    const total = [...m.values()].reduce((s, e) => s + e.n, 0);
    if (total < BRAND_MIN_MEMBERS) continue;
    let best: { leaf: string; n: number; path: string } | null = null;
    for (const [leaf, e] of m) {
      if (!best || e.n > best.n) best = { leaf, n: e.n, path: e.path };
    }
    if (best && best.n / total >= BRAND_UNANIMOUS) {
      brandRules.set(b, { leaf: best.leaf, path: best.path });
    }
  }

  const phraseRules = new Map<string, PhraseRule>();
  for (const [leaf, v] of vocab) {
    if (v.members < PHRASE_MIN_MEMBERS) continue;
    if (v.words.length < PHRASE_MIN_WORDS || v.words.length > PHRASE_MAX_WORDS) continue;
    let modePath = '';
    let modeVotes = -1;
    for (const [path, votes] of v.pathVotes) {
      if (votes > modeVotes) { modePath = path; modeVotes = votes; }
    }
    const phrase = v.words.join(' ').toLowerCase();
    const existing = phraseRules.get(phrase);
    if (!existing || v.members > existing.members) {
      phraseRules.set(phrase, { leaf, path: modePath, members: v.members });
    }
  }

  return { brandRules, phraseRules };
}

/** Longest matching vocabulary phrase in a name, or null. Skips negated matches. */
function matchPhrase(
  tokens: string[],
  phraseRules: Map<string, PhraseRule>,
): { leaf: string; path: string; phrase: string } | null {
  for (let n = PHRASE_MAX_WORDS; n >= PHRASE_MIN_WORDS; n -= 1) {
    for (let i = 0; i + n <= tokens.length; i += 1) {
      const phrase = tokens.slice(i, i + n).join(' ');
      const hit = phraseRules.get(phrase);
      if (!hit) continue;
      const before = tokens[i - 1];
      if (before && NEGATORS.has(before)) continue; // "sans produits laitiers" etc: skip, don't guess
      // CONTRADICTION GUARD, found while judging the 30-row sample, not
      // assumed away. "Alcoholic Ginger Beer" matched "ginger beer", whose
      // own stored path is beverages > non-alcoholic-beverages >
      // non-alcoholic-beers > ginger-beer -- the vocabulary's own ancestor
      // chain says non-alcoholic, and the product's own name says the
      // opposite. Matching the leaf and ignoring what the category's own
      // path already asserts is exactly the aisle-string failure one column
      // over: right word, wrong thing. Skip when the word right before the
      // match directly contradicts a "non-X" segment already in the path.
      if (before === 'alcoholic' && hit.path.includes('non-alcoholic')) continue;
      return { leaf: hit.leaf, path: hit.path, phrase };
    }
  }
  return null;
}

interface NoCatRow {
  rowid: number;
  code: string;
  name: string;
  brands: string | null;
  source: string;
  sold_in_canada: number;
}

interface Decision {
  rowid: number;
  code: string;
  name: string;
  source: string;
  sold_in_canada: number;
  via: 'brand' | 'phrase';
  detail: string;
  leaf: string;
  path: string;
}

function decide(
  rows: readonly NoCatRow[],
  brandRules: Map<string, BrandRule>,
  phraseRules: Map<string, PhraseRule>,
): Decision[] {
  const out: Decision[] = [];
  for (const r of rows) {
    if (isBarePartNumber(r.name)) continue; // no words to match, brand affinity over a code proves nothing

    // Arm 1: brand, strict. Off by default -- see BRAND_ARM and the header.
    if (BRAND_ARM && r.brands) {
      let hit: BrandRule | undefined;
      for (const b0 of r.brands.split(',')) {
        hit = brandRules.get(norm(b0));
        if (hit) break;
      }
      if (hit) {
        out.push({
          rowid: r.rowid, code: r.code, name: r.name, source: r.source, sold_in_canada: r.sold_in_canada,
          via: 'brand', detail: r.brands, leaf: hit.leaf, path: hit.path,
        });
        continue;
      }
    }

    // Arm 2: name phrase against this catalogue's own vocabulary.
    const m = matchPhrase(tokenize(r.name), phraseRules);
    if (m) {
      out.push({
        rowid: r.rowid, code: r.code, name: r.name, source: r.source, sold_in_canada: r.sold_in_canada,
        via: 'phrase', detail: m.phrase, leaf: m.leaf, path: m.path,
      });
    }
  }
  return out;
}

function main(): void {
  const reader = openCatalogueReadOnly(DB_PATH);
  reader.exec('PRAGMA busy_timeout = 120000');

  const before = (reader.prepare(`SELECT count(*) AS n FROM product WHERE category_path = '[]'`).get() as { n: number }).n;
  console.log(`no-category rows before: ${before}`);

  const { brandRules, phraseRules } = buildRules(reader);
  console.log(`brand rules built (unanimous, >=${BRAND_MIN_MEMBERS} members): ${brandRules.size}` + (BRAND_ARM ? '' : '  [OFF -- pass --brand-arm to reopen it, see the header]'));
  console.log(`phrase rules (${PHRASE_MIN_WORDS}-${PHRASE_MAX_WORDS} words, >=${PHRASE_MIN_MEMBERS} members): ${phraseRules.size}`);

  const rows = reader
    .prepare(`SELECT rowid, code, name, brands, source, sold_in_canada FROM product WHERE category_path = '[]'`)
    .all() as unknown as NoCatRow[];

  const decisions = decide(rows, brandRules, phraseRules);
  const byVia = { brand: 0, phrase: 0 };
  const byViaCanada = { brand: 0, phrase: 0 };
  for (const d of decisions) {
    byVia[d.via] += 1;
    if (d.sold_in_canada) byViaCanada[d.via] += 1;
  }

  console.log(`\nwould fill: ${decisions.length} of ${before} (${(100 * decisions.length / before).toFixed(1)}%)`);
  console.log(`  via brand : ${byVia.brand}  (${byViaCanada.brand} Canadian)`);
  console.log(`  via phrase: ${byVia.phrase}  (${byViaCanada.phrase} Canadian)`);
  console.log(`projected no-category after: ${before - decisions.length}`);

  const dumpPath = process.env.SHIN_FILL_DUMP;
  if (dumpPath) {
    writeFileSync(dumpPath, JSON.stringify(decisions, null, 2));
    console.log(`dumped ${decisions.length} decisions to ${dumpPath}`);
  }

  reader.close();

  if (!APPLY) {
    console.log('\nDRY RUN. Pass --apply to write. Nothing was changed.');
    return;
  }

  console.log('\n--apply given: writing.');
  const db = openCatalogue(DB_PATH);
  const update = db.prepare(
    `UPDATE product SET category_path = ?, leaf_category = ?, category_source = ? WHERE rowid = ?`,
  );
  db.exec('BEGIN');
  let n = 0;
  for (const d of decisions) {
    update.run(d.path, d.leaf, d.via === 'brand' ? 'inferred-brand' : 'inferred-name-phrase', BigInt(d.rowid));
    n += 1;
    if (n % 5000 === 0) {
      db.exec('COMMIT');
      db.exec('BEGIN');
    }
  }
  db.exec('COMMIT');

  console.log('rebuilding FTS and category membership index...');
  rebuildFts(db);
  rebuildCategories(db);

  const after = (db.prepare(`SELECT count(*) AS n FROM product WHERE category_path = '[]'`).get() as { n: number }).n;
  console.log(`no-category rows after: ${after}`);
  console.log('RESTART THE SEARCH WORKERS: rebuildCategories invalidates their memoized tag sizes.');
}

main();
