/**
 * Unit 8 of docs/catalogue-build-plan-2026-09-26.md: what to do with the
 * electronics rows whose only name is a bare part number.
 *
 * WHAT "BARE PART NUMBER" MEANS HERE, AND WHY.
 *
 * A row counts as a bare part number when its display name is a single
 * token (no whitespace) that contains at least one digit. That is the
 * whole rule. Two things follow from it and were chosen on purpose:
 *
 *   1. A name with a space is never caught, no matter what it contains.
 *      "Z-Slip Label", "3 Year Extended Warranty (Renewal/High Volume)"
 *      and "1GB 266MHz DDR ECC Registered CL2.5 DIMM, x4" are all
 *      multi-token and all pass through untouched -- a shopper can type
 *      "extended warranty" or "266MHz DDR" and land on them. This is also
 *      what keeps grocery rows like "Milk 2%" and "Tylenol 500" out of the
 *      rule without a single special case for groceries: both are two
 *      tokens, so the space check clears them before the digit check ever
 *      runs.
 *   2. A single token needs a digit to be caught. A name that is one word
 *      and no digits ("Chromebook", "Router") is still a real word a
 *      person would type, so it is left alone. "LV-7545" and "AP9520T"
 *      are one token each and both carry a digit, so both are caught --
 *      which is correct, because neither is a word anyone would type to
 *      find them; they are only ever found by their barcode.
 *
 * This was measured, not assumed: see part-number.test.ts and
 * docs/part-number-exclusion-2026-09-26.md for the 200-row sample (100
 * caught, 100 let through) read by hand against this predicate, and for
 * the FIRST version of this file's rule, which shipped off because its own
 * acceptance test's falsifier fired: it could not tell a manufacturer's
 * marketed model number ("TL-WN821N", "MFC-J4610DW") apart from an internal
 * SKU nobody types, so it hid real products a shopper typed by name.
 */
export function isBarePartNumber(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (/\s/.test(trimmed)) return false; // multi-word: a real name, not a code
  return /\d/.test(trimmed); // single word with a digit: a code, not a word
}

/**
 * THE SECOND VERSION: THE ROW STAYS FINDABLE WHEN THE QUERY NAMES IT.
 *
 * The first version excluded a bare-part-number row unconditionally, and its
 * falsifier fired: "tp-link tl-wn821n" and "brother mfc-j4610dw" used to find
 * the exact product and stopped. The fix is not a smarter row predicate --
 * `isBarePartNumber` cannot tell a marketed model number from an internal SKU
 * from the row alone, and no amount of pattern-matching on the name fixes
 * that, because both shapes are the same shape. The person typing the query
 * already knows which one they meant. So the row's SHAPE still decides
 * whether it is normally hidden from the word arm, but the QUERY decides
 * whether this one search may still see it: a bare-part-number row surfaces
 * only when one of the query's own tokens, or a run of them typed back to
 * back, spells its name out.
 *
 * "tp-link tl-wn821n" tokenizes (ftsTokens) to ["tp","link","tl","wn821n"].
 * The row "TL-WN821N" normalizes to "tlwn821n". The adjacent pair "tl" +
 * "wn821n" concatenates to "tlwn821n" -- a match, so the row surfaces. A
 * plain "mouse" query has no token or run of tokens that spells any bare
 * row's name, so none of them surface. Nothing here classifies a token as a
 * "model number" or a "SKU" -- it only asks whether the query, read as one
 * continuous string with the punctuation a person might or might not have
 * typed, contains this row's name.
 */
const NORMALIZE_RE = /[-.\s]/g;

/** Lowercased, with hyphens, periods and whitespace removed. Applied to both
 * sides of the match so "TL-WN821N", "tlwn821n" and "TL WN821N" all collapse
 * to the same string, "tlwn821n". */
function normalizeBareToken(s: string): string {
  return s.toLowerCase().replace(NORMALIZE_RE, '');
}

/**
 * Splits a raw query the same way `ftsTokens` (search.ts) does, EXCEPT it
 * keeps single-character tokens.
 *
 * FOUND WHILE RUNNING THE SECOND VERSION'S OWN ACCEPTANCE TEST. "zyxel
 * gs2200-8" failed to find the row "GS2200-8": `ftsTokens` drops tokens of
 * length 1 to keep FTS from scoring on noise, so the query's own trailing
 * "8" -- split off by the hyphen, same as every other bare-number match here
 * -- never reached `bareMatchCandidates`, and "gs2200" alone does not equal
 * "gs22008". FTS retrieval and this reconstruction want different things
 * from the same split: FTS should ignore a lone digit, and this needs every
 * character the shopper typed. So this is its own tokenizer, not a reuse of
 * `ftsTokens`, even though the split pattern is identical.
 */
export function rawQueryTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/["*()]/g, ' ')
    .split(/[^\p{L}\p{N}.]+/u)
    .filter((t) => t.length > 0);
}

/**
 * How many of the query's tokens in a row may be glued together looking for
 * a match. Bare part numbers in this catalogue run up to a handful of
 * hyphenated groups ("Z1BE-28XP-3C0" is three); six is generous headroom
 * without letting an unrelated long query accidentally spell a short code
 * one token at a time.
 */
const MAX_MATCH_WINDOW = 6;

/**
 * Every string a bare-part-number row's normalized name would have to equal
 * for THIS query to be allowed to show it: each of the query's own tokens
 * (pass `rawQueryTokens(text)`, not `ftsTokens(text)` -- see that function's
 * comment for why), normalized, and every contiguous run of up to
 * `MAX_MATCH_WINDOW` of them concatenated with no separator. Computed once
 * per query and checked by both retrieval arms, so "asus rt-n66u" and
 * "RT-N66U" and "rt n66u" all produce a set containing "rtn66u" and a plain
 * "asus router" query produces a set that contains none of the electronics
 * rows' bare names.
 */
export function bareMatchCandidates(queryTokens: readonly string[]): ReadonlySet<string> {
  const norm = queryTokens.map(normalizeBareToken);
  const out = new Set<string>();
  for (let i = 0; i < norm.length; i++) {
    let acc = '';
    for (let j = i; j < norm.length && j < i + MAX_MATCH_WINDOW; j++) {
      acc += norm[j];
      if (acc.length === 0) continue;
      out.add(acc);
    }
  }
  return out;
}

/**
 * THE ONE LINE THAT TURNS UNIT 8 ON OR OFF.
 *
 * Flip this to `true` to turn the exclusion on. Every place that reads it
 * -- the SQL clause in #runFts and the vector-arm filter in `search()`,
 * both in search.ts -- reverses together. byGtin and the neighbour ring
 * never read this flag and are unaffected either way.
 *
 * State as of the second version's own acceptance test:
 * docs/part-number-exclusion-2026-09-26.md records whether it passed and,
 * if so, this constant was turned on by the same commit that recorded it.
 */
export const EXCLUDE_BARE_PART_NUMBERS_FROM_TEXT_SEARCH = true;

/**
 * The SQL form of `isBarePartNumber`, scoped to `source = 'icecat'`.
 *
 * The scope is deliberate and narrower than the JS predicate above: the
 * 200-row sample this rule was measured against is all Canadian
 * electronics (source 'icecat'), because that is the population unit 8's
 * numbers describe. Dropping the source check would apply an unmeasured
 * rule to every other source in the catalogue, which is exactly the
 * "confidently wrong" failure this build is trying to avoid. Widen it only
 * after someone measures a sample from the sources being added.
 *
 * SQLite has no loaded regex extension (only sqlite-vec), so this is
 * written with functions SQLite already has: INSTR for "contains a space"
 * and GLOB's `[0-9]` character class for "contains a digit". Both are
 * evaluated against the same text the display name resolves to,
 * COALESCE(name_en, name), which is what a shopper actually sees and what
 * isBarePartNumber is defined over.
 */
export function barePartNumberSqlClause(alias: string): string {
  const name = `COALESCE(${alias}.name_en, ${alias}.name)`;
  return `(${alias}.source = 'icecat' AND INSTR(${name}, ' ') = 0 AND ${name} GLOB '*[0-9]*')`;
}

/**
 * The SQL form of `normalizeBareToken`, applied to the same display name
 * `barePartNumberSqlClause` reads. Used to compare a row's name against the
 * query's own `bareMatchCandidates`, bound in as an `IN (...)` list -- see
 * #runFts in search.ts for the query this is spliced into.
 */
export function normalizedNameSql(alias: string): string {
  const name = `COALESCE(${alias}.name_en, ${alias}.name)`;
  return `REPLACE(REPLACE(REPLACE(LOWER(${name}), '-', ''), ' ', ''), '.', '')`;
}

/**
 * The row-level twin of `barePartNumberSqlClause`, for rows already pulled
 * into memory rather than filtered in SQL.
 *
 * NEEDED BECAUSE THE WORD SEARCH IS HYBRID, NOT JUST FTS. search.ts's
 * `search()` fuses two retrievers: `#runFts` (filtered in SQL by the clause
 * above) and `#vectorSearch`, which runs a KNN over `product_vec` and cannot
 * take a SQL WHERE at all -- vec0 does not support one. Found while running
 * this unit's own acceptance test: with only the SQL clause in place,
 * "asus rt-n66u" still returned the bare row "RT-N66U" as the top fused
 * result, because the embedding model places a part-number token close
 * enough to its own brand+model query to win the vector arm even though the
 * same row is correctly absent from the text arm. So `search()` calls this
 * on the vector arm's hits before fusion -- same flag, same source scope,
 * same definition, just evaluated in JS instead of SQL.
 */
export function isBarePartNumberRow(row: {
  readonly source: string;
  readonly name: string;
  readonly name_en: string | null;
}): boolean {
  return row.source === 'icecat' && isBarePartNumber(row.name_en ?? row.name);
}

/**
 * Whether THIS row may appear in THIS query's results: always true for a row
 * that is not a bare part number, and for one that is, only when its
 * normalized name is one of the query's `bareMatchCandidates`. This is the
 * single function both arms should call once they have a candidate set --
 * `#runFts` calls the SQL equivalent instead (`normalizedNameSql` bound into
 * an `IN` list) because it never pulls a row into JS it does not already
 * intend to return, but the vector arm has no SQL to push this into, so it
 * calls this directly on each of its hits.
 */
export function bareRowAllowed(
  row: { readonly source: string; readonly name: string; readonly name_en: string | null },
  candidates: ReadonlySet<string>,
): boolean {
  if (!isBarePartNumberRow(row)) return true;
  return candidates.has(normalizeBareToken(row.name_en ?? row.name));
}
