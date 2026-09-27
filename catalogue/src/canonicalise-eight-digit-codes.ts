/**
 * ONE NUMBER, ONE ROW (the 8/13 half `dedupe-barcode-spellings.ts` left open).
 *
 * THE PROBLEM. `canonicalCode()` in `barcode.ts` pads an 8-digit EAN-8 out to 13
 * digits with five leading zeros -- GS1 writes an EAN-8 right-aligned in a
 * 13-digit field exactly as it writes a 12-digit UPC-A as a GTIN-13, and the
 * check digit (computed from the right) does not change. `load.ts` always
 * writes the padded spelling, but older food-database rows are still stored
 * unpadded, so one barcode is two rows: an 8-digit row and its zero-padded
 * 13-digit twin. Counted on the live catalogue 2026-09-26 (after the
 * 12/13-digit shape `dedupe-barcode-spellings.ts` already closed): 422 pairs
 * (844 rows) where an 8-digit code and `00000` + that code are BOTH present,
 * 396 of them both-`sold_in_canada`, matching this file's own earlier count of
 * the phone-pack collision before the 26 extra (non-Canadian) USDA pairs a
 * later load added. `export-pack.ts` groups by the NUMBER a code spells, so
 * both spellings of one barcode are one key, and it refuses to write a pack
 * once more than 50 rows share a key -- refused the Canadian pack on exactly
 * this class tonight.
 *
 * TWO JOBS.
 *
 * FOLD, when the 8-digit row's padded twin already exists. The 13-digit row
 * survives (it is the spelling `canonicalCode()` writes); nullable columns
 * that are NULL on the survivor and set on the dying row move across first,
 * `sold_in_canada` is raised to the max of the two, and the dying row plus its
 * `product_vec` and `product_category` rows go by rowid. Folding is gated on
 * the two rows plausibly being the same product -- see `samePlausibleProduct`
 * below for exactly what counts as evidence and why.
 *
 * RENAME, when the 8-digit row has NO padded twin: `code = '00000' || code`.
 * This is the durable half. Once every un-twinned 8-digit code is written in
 * `canonicalCode()`'s own spelling, no future load can write a second one,
 * because the loader's canonical form is the only spelling left in the table.
 *
 * WHY A NAME-TOKEN RULE IS NOT ENOUGH ON ITS OWN, measured before shipping
 * this. A literal "share a 4+ letter word, minus a small stopword list" rule
 * over the `name` column alone folds 369 of the 422 pairs and leaves 53
 * standing (106 rows) -- most of them the SAME product, just described in the
 * other official language ("Jus de raisin" / "Tropicana Pure Premium -
 * Grape"), or by a brand name the free-text `name` never repeats ("Aha" /
 * "AHA - Peach Honey Sparkling Water"). Left at 53, the residual collision
 * count for the Canadian pack (106 rows, both-Canadian pairs alone 102) is
 * still over `export-pack.ts`'s 50-row refusal line. So `brands` -- the
 * column this schema already carries for exactly this kind of identity
 * check -- is consulted too, in two narrow, high-precision ways (below), which
 * brings the both-Canada residual to 21 pairs (42 rows), under the line.
 *
 * WHY BRAND MATCHING STOPS SHORT OF "SHARE A WORD" THE SAME WAY NAMES DO.
 * Tried first, and reverted: a shared single word between the two `brands`
 * fields folds 398 of 422 -- but it also folds `00128582`, one of the two
 * pairs this file must never touch (`Natural Spring Water` [brand `Shell
 * Select`] against `SHELL SELECT SprPETDC168(12x0.5L) LCPCA : Eau de Source`
 * [brand `Shell`]), because both brand fields contain the bare word "Shell".
 * That pair is a genuine data fault -- two different physical products
 * sharing one misprinted or miskeyed barcode -- and nothing in the text says
 * which one is wrong; the task that produced this file names it explicitly as
 * a case that must survive untouched. A shared brand WORD cannot tell that
 * pair apart from a legitimate brand-family match ("Powerade" / "Powerade
 * Zero" is the identical shape and IS the same product), so word-level brand
 * matching is unsafe here and is not used. What IS used:
 *   - brand-exact: the two `brands` fields are the SAME manufacturer once
 *     lowercased, stripped of punctuation, and stripped of a small set of
 *     corporate suffixes ("canada", "inc", "ltd", "llc", "corp", "company",
 *     "co") that say nothing about which product this is -- "Coca-Cola
 *     Canada" and "Coca-Cola" canonicalise to the same string, "Shell Select"
 *     and "Shell" do not (different strings, not a suffix relationship).
 *   - name-is-brand: one row's name, reduced to just its first word, IS the
 *     other row's brand -- "Aha" / "Aha!" against a row whose OWN `brands`
 *     column says "AHA". This is an exact-equality check, not a substring
 *     check, precisely because `alnum("Shell Select").includes(alnum("Shell"))`
 *     is true and would silently re-introduce the same false fold; equality
 *     does not have that failure mode ("shell" != "shellselect").
 * One additional named alias, judged by hand rather than derived: `coke` is
 * Coca-Cola's own short name for its own product, so `brandCanonical` maps it
 * to the same string as `cocacola`. No other alias is added; everything else
 * a shared brand word would have caught but exact-match does not (Mountain
 * Dew / brand "MTN DEW", 7-Up spelled "7up"/"7 UP"/"7-Up" split into two
 * sub-4-letter tokens by the name rule) is left standing on purpose, because
 * it cannot be resolved without a rule that also folds the Shell pair.
 *
 * THE STOPWORD LIST, judged against what the live pair list actually
 * contains (2026-09-26), reasoned about in two groups:
 *   - category nouns that say only "this is a drink", not which one: water,
 *     juice, soda, drink(s), beverage(s), boisson(s) [French "drink"],
 *     gazeuse(s) [French "carbonated"], sparkling, mineral, spring (the
 *     "Perrier Mineral Water" / "Perrier ... Natural Spring Water" pair
 *     already shares the brand "Perrier"; these words add nothing on top).
 *   - marketing adjectives that describe the whole category, not the
 *     product: original, natural, select.
 * Deliberately NOT stopped, after checking each would break a real pair:
 * zero, sugar, free, diet, lemon, lime, punch, cola, cherry, berry (etc.) --
 * these name the FLAVOUR or FORMULATION, which is exactly what tells two
 * rows apart from two unrelated products under the same brand ("Coke Zero" /
 * "Coca-Cola - Coca-Cola Zero" shares only "zero", and it is right to fold:
 * the pair is fixed by the barcode already being identical, so the token
 * rule's only job is to catch the rare pair where the barcode is wrong, not
 * to disambiguate among different barcodes -- see next paragraph).
 *
 * WHY A GENERIC SHARED WORD IS SAFE FOR NAMES BUT NOT FOR THIS FILE'S
 * DECISION IN GENERAL: every pair compared here is already fixed by the
 * barcode (`q.code = '00000' || p.code`) before any text is read. The token
 * check is never used to FIND a candidate pair among unrelated rows -- it
 * only decides whether to TRUST a pair the barcode already produced. That is
 * why a generic word carries real evidence for names (two rows the loader
 * already says are the same barcode, that also share a word, are almost
 * certainly the same product) and why it does not for the free-standing
 * `brands` field the way it does for `name` (the Shell case shows a shared
 * brand word can survive between two rows that are NOT the same product).
 *
 * FALSIFIER, decided before the sample was drawn: hand-judge 30 folds picked
 * at random (seeded shuffle, reproducible) against both names and brands; if
 * more than 3 of 30 are not plausibly the same product, the fold rule is
 * wrong and this file should be run with folding disabled (RENAME only).
 * Result, recorded in `docs/eight-digit-canonicalisation-2026-09-26.md`: 0 of
 * 30 clearly wrong, one closest call named there ("Root beer" [brand
 * `Coca-Cola Canada`] against "Barq's - Crafted Soda Root Beer" [brand
 * `Barq's`], shared token "root"/"beer" -- generic enough that it could, in
 * principle, be a different Coca-Cola root beer under a reused code, but Barq's
 * is Coca-Cola's own root beer line and nothing else in the row disagrees).
 * The falsifier did not fire; folding ships.
 *
 * Run with no argument for a dry run, which counts and prints and writes
 * nothing. `--apply` does it, inside one transaction, rolled back on error.
 *
 *   node --experimental-strip-types catalogue/src/canonicalise-eight-digit-codes.ts
 *   node --experimental-strip-types catalogue/src/canonicalise-eight-digit-codes.ts --apply
 */
import { DatabaseSync } from 'node:sqlite';
import * as sqliteVec from 'sqlite-vec';
import { copyFileSync, existsSync, statSync } from 'node:fs';

const DB = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const apply = process.argv.includes('--apply');

// ---------------------------------------------------------------------------
// Name/brand matching. See the file header for why each piece is here.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'water', 'juice', 'soda', 'drink', 'drinks', 'beverage', 'beverages',
  'boisson', 'boissons', 'gazeuse', 'gazeuses',
  'sparkling', 'mineral', 'spring',
  'original', 'natural', 'select',
]);

/** Corporate suffixes that say who bottles a product, not what it is. */
const BRAND_SUFFIXES = new Set(['inc', 'ltd', 'llc', 'corp', 'canada', 'company', 'co']);

/** The one named brand alias, judged by hand -- see the file header. */
const BRAND_ALIAS: Record<string, string> = { coke: 'cocacola' };

/** Words of 4+ letters, lowercased, punctuation as a separator. Accents kept. */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
}

/** Lowercased, every non-alphanumeric character removed (no separators left). */
function alnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, '');
}

function sharedNameToken(a: string, b: string): string | null {
  const ta = new Set(tokens(a).filter((t) => !STOPWORDS.has(t)));
  const tb = new Set(tokens(b).filter((t) => !STOPWORDS.has(t)));
  for (const t of ta) if (tb.has(t)) return t;
  return null;
}

/** A brand string reduced to the manufacturer it names, suffixes stripped. */
function brandCanonical(b: string): string {
  const words = b
    .toLowerCase()
    .split(/[^a-z0-9À-ɏ]+/)
    .filter((t) => t.length > 0 && !BRAND_SUFFIXES.has(t));
  const joined = words.join('');
  return BRAND_ALIAS[joined] ?? joined;
}

/** A name's first word, accents folded off, for matching against a brand. */
function firstToken(s: string): string {
  const words = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words[0] ?? '';
}

/**
 * Whether an 8-digit row and its zero-padded 13-digit twin plausibly name the
 * same product. Returns the reason it matched, or null to leave the pair
 * alone. See the file header for the full reasoning behind each tier.
 */
function samePlausibleProduct(
  pName: string,
  pBrand: string | null,
  qName: string,
  qBrand: string | null,
): string | null {
  const nameHit = sharedNameToken(pName, qName);
  if (nameHit) return `name-token:${nameHit}`;

  if (pBrand && qBrand) {
    const bp = brandCanonical(pBrand);
    const bq = brandCanonical(qBrand);
    if (bp.length >= 3 && bp === bq) return `brand-exact:${bp}`;
  }
  if (qBrand) {
    const bq = brandCanonical(qBrand);
    if (bq.length >= 3 && firstToken(pName) === bq) return `name-is-brand:${bq}`;
  }
  if (pBrand) {
    const bp = brandCanonical(pBrand);
    if (bp.length >= 3 && firstToken(qName) === bp) return `name-is-brand:${bp}`;
  }
  return null;
}

// ---------------------------------------------------------------------------

function open(readOnly: boolean): DatabaseSync {
  const db = new DatabaseSync(DB, { allowExtension: true, readOnly });
  sqliteVec.load(db);
  db.exec('PRAGMA busy_timeout = 120000');
  return db;
}

/** Every nullable, non-primary-key column, read from the schema, not typed by hand. */
function rescueColumns(db: DatabaseSync): string[] {
  const cols = db.prepare('PRAGMA table_info(product)').all() as unknown as {
    name: string;
    notnull: number;
    pk: number;
  }[];
  return cols.filter((c) => c.pk === 0 && c.notnull === 0).map((c) => c.name);
}

interface Pair {
  dropRow: number;
  dropCode: string;
  dropName: string;
  dropBrand: string | null;
  dropCanada: number;
  keepRow: number;
  keepCode: string;
  keepName: string;
  keepBrand: string | null;
  keepCanada: number;
}

/** Every 8-digit row that has a zero-padded 13-digit twin, both sides read. */
function fetchPairs(db: DatabaseSync): Pair[] {
  return db
    .prepare(
      `SELECT p.rowid AS dropRow, p.code AS dropCode, p.name AS dropName, p.brands AS dropBrand,
              p.sold_in_canada AS dropCanada,
              q.rowid AS keepRow, q.code AS keepCode, q.name AS keepName, q.brands AS keepBrand,
              q.sold_in_canada AS keepCanada
       FROM product p JOIN product q ON q.code = '00000' || p.code
       WHERE length(p.code) = 8`,
    )
    .all() as unknown as Pair[];
}

interface Decision {
  fold: Pair[];
  leave: Array<Pair & { reason: null }>;
}

function decide(pairs: Pair[]): Decision {
  const fold: Pair[] = [];
  const leave: Array<Pair & { reason: null }> = [];
  for (const pair of pairs) {
    const reason = samePlausibleProduct(pair.dropName, pair.dropBrand, pair.keepName, pair.keepBrand);
    if (reason) fold.push(pair);
    else leave.push({ ...pair, reason: null });
  }
  return { fold, leave };
}

function collisionCounts(db: DatabaseSync): { groups: number; rows: number } {
  const row = db
    .prepare(
      `SELECT count(*) AS groups, coalesce(sum(cnt), 0) AS rows FROM (
         SELECT CAST(code AS INTEGER) AS n, count(*) AS cnt
         FROM product
         WHERE code GLOB '[0-9]*' AND code NOT GLOB '*[^0-9]*' AND length(code) <= 14
         GROUP BY n HAVING cnt > 1)`,
    )
    .get() as { groups: number; rows: number };
  return row;
}

function counts(db: DatabaseSync): Record<string, number> {
  const one = (sql: string): number => (db.prepare(sql).get() as { c: number }).c;
  const coll = collisionCounts(db);
  return {
    products: one('SELECT count(*) AS c FROM product'),
    eightDigit: one("SELECT count(*) AS c FROM product WHERE length(code) = 8"),
    noTwin: one(
      `SELECT count(*) AS c FROM product p WHERE length(p.code) = 8
       AND NOT EXISTS (SELECT 1 FROM product q WHERE q.code = '00000' || p.code)`,
    ),
    collisionGroups: coll.groups,
    collisionRows: coll.rows,
  };
}

function main(): number {
  if (!existsSync(DB)) {
    console.log(`no catalogue at ${DB}`);
    return 1;
  }

  const ro = open(true);
  const RESCUE = rescueColumns(ro);
  console.log('rescuing (schema-derived):', RESCUE);

  const before = counts(ro);
  console.log('BEFORE:', JSON.stringify(before));

  const pairs = fetchPairs(ro);
  const { fold, leave } = decide(pairs);

  const reasonCounts: Record<string, number> = {};
  for (const p of fold) {
    const reason = samePlausibleProduct(p.dropName, p.dropBrand, p.keepName, p.keepBrand)!.split(':')[0];
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  console.log(`\nfold candidates: ${fold.length} (by reason: ${JSON.stringify(reasonCounts)})`);
  console.log(`leave-alone (no plausible match): ${leave.length}`);
  for (const l of leave) {
    console.log(
      `  8=${l.dropCode} "${l.dropName}" [${l.dropBrand ?? 'NULL'}] canada=${l.dropCanada}` +
        `  <->  13=${l.keepCode} "${l.keepName}" [${l.keepBrand ?? 'NULL'}] canada=${l.keepCanada}`,
    );
  }

  /** rowid -> value for one column, batched in one query rather than one per row. */
  function columnMap(db: DatabaseSync, col: string, rowids: number[]): Map<number, unknown> {
    const map = new Map<number, unknown>();
    if (rowids.length === 0) return map;
    const placeholders = rowids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT rowid AS r, ${col} AS v FROM product WHERE rowid IN (${placeholders})`).all(
      ...rowids,
    ) as unknown as { r: number; v: unknown }[];
    for (const row of rows) map.set(row.r, row.v);
    return map;
  }

  const keepRows = fold.map((p) => p.keepRow);
  const dropRows = fold.map((p) => p.dropRow);
  const rescuable: Record<string, number> = {};
  for (const col of RESCUE) {
    const keepVals = columnMap(ro, col, keepRows);
    const dropVals = columnMap(ro, col, dropRows);
    let n = 0;
    for (const p of fold) if (keepVals.get(p.keepRow) === null && dropVals.get(p.dropRow) !== null) n += 1;
    rescuable[col] = n;
  }
  console.log('\nfields to copy off the dying row before it goes:', JSON.stringify(rescuable));
  console.log(`\nrename candidates (8-digit, no twin at all): ${before.noTwin}`);
  ro.close();

  if (!apply) {
    console.log('\nDRY RUN. Nothing written. Re-run with --apply.');
    return 0;
  }

  // A file with the right name is not a backup unless it is at least as new
  // as the database it claims to copy. This file's OWN backup, never the two
  // backups `dedupe-barcode-spellings.ts` owns.
  const backup = `${DB}.before-8digit-canon`;
  const stale = existsSync(backup) && statSync(backup).mtimeMs < statSync(DB).mtimeMs;
  if (!existsSync(backup) || stale) {
    console.log(`\ncopying ${DB} to ${backup} (${(statSync(DB).size / 1e9).toFixed(2)} GB)`);
    copyFileSync(DB, backup);
  }
  console.log(`backup in place: ${backup}, written ${new Date(statSync(backup).mtimeMs).toISOString()}`);

  const db = open(false);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('BEGIN');
  try {
    db.exec('CREATE TEMP TABLE fold_pairs (keep_row INTEGER PRIMARY KEY, drop_row INTEGER NOT NULL)');
    const insertPair = db.prepare('INSERT INTO fold_pairs (keep_row, drop_row) VALUES (?, ?)');
    for (const p of fold) insertPair.run(p.keepRow, p.dropRow);

    // 1. Rescue nullable columns from the dying row onto the survivor.
    for (const col of RESCUE) {
      db.exec(
        `UPDATE product SET ${col} = (` +
          `SELECT d.${col} FROM fold_pairs fp JOIN product d ON d.rowid = fp.drop_row WHERE fp.keep_row = product.rowid` +
          `) WHERE ${col} IS NULL AND EXISTS (` +
          `SELECT 1 FROM fold_pairs fp JOIN product d ON d.rowid = fp.drop_row WHERE fp.keep_row = product.rowid AND d.${col} IS NOT NULL)`,
      );
    }

    // 2. sold_in_canada rises to the max of the two.
    db.exec(
      `UPDATE product SET sold_in_canada = 1 WHERE sold_in_canada = 0 AND rowid IN (` +
        `SELECT fp.keep_row FROM fold_pairs fp JOIN product d ON d.rowid = fp.drop_row WHERE d.sold_in_canada = 1)`,
    );

    // 3. Delete the dying rows' vector and category rows, then the rows.
    db.exec('DELETE FROM product_vec WHERE rowid IN (SELECT drop_row FROM fold_pairs)');
    db.exec('DELETE FROM product_category WHERE rowid_ref IN (SELECT drop_row FROM fold_pairs)');
    const deleted = db.prepare('DELETE FROM product WHERE rowid IN (SELECT drop_row FROM fold_pairs)').run();
    console.log(`\nfolded (deleted) ${deleted.changes} dying rows`);

    // 4. RENAME: an 8-digit row with no twin at all writes the padded spelling.
    const renamed = db
      .prepare(
        `UPDATE product SET code = '00000' || code WHERE length(code) = 8` +
          ` AND NOT EXISTS (SELECT 1 FROM product q WHERE q.code = '00000' || product.code)`,
      )
      .run();
    console.log(`renamed ${renamed.changes} un-twinned 8-digit rows to their padded spelling`);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.log('ROLLED BACK, nothing changed:', err instanceof Error ? err.message : String(err));
    db.close();
    return 1;
  }

  // product_fts is external-content over product, so a delete or a code
  // change leaves it stale until rebuilt.
  console.log('\nrebuilding the text index, which reads the product table rather than copying it');
  db.exec("INSERT INTO product_fts(product_fts) VALUES('rebuild')");

  const after = counts(db);
  console.log('AFTER:', JSON.stringify(after));
  const removed = before.products - after.products;
  console.log(`removed ${removed} products (expected ${fold.length})`);
  db.close();

  const ok = removed === fold.length && after.eightDigit === leave.length && after.noTwin === 0;
  console.log(
    ok
      ? 'PASS: products fell by exactly the fold count, every un-twinned 8-digit row is gone, and only the left-alone pairs still carry an 8-digit code'
      : `FAIL: removed ${removed} (expected ${fold.length}), eightDigit left ${after.eightDigit} (expected ${leave.length}), noTwin left ${after.noTwin} (expected 0)`,
  );
  return ok ? 0 : 1;
}

process.exit(main());
