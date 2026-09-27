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
 * caught, 100 let through) read by hand against this predicate.
 */
export function isBarePartNumber(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (/\s/.test(trimmed)) return false; // multi-word: a real name, not a code
  return /\d/.test(trimmed); // single word with a digit: a code, not a word
}

/**
 * THE ONE LINE THAT TURNS UNIT 8 ON OR OFF.
 *
 * OFF BY DEFAULT. THE FALSIFIER FIRED. Full run in
 * docs/part-number-exclusion-2026-09-26.md: of twenty typed searches run
 * before and after, two lost the exact product they used to find --
 * "tp-link tl-wn821n" returned the TL-WN821N adapter at rank 1 before this
 * flag and no TL-WN821N row at all after it; "brother mfc-j4610dw" returned
 * MFC-J4610DW at rank 2 before and no MFC-J4610DW row at all after. Both
 * queries are a shopper typing a manufacturer's own marketed model number,
 * which this predicate cannot tell apart from an internal SKU nobody ever
 * types (its whole job, "single token with a digit", is syntactic and
 * cannot see that difference) -- so the rule caught real, typeable names
 * along with the unfindable ones, which is exactly the falsifier this unit
 * names: "a typed search that used to return the right product no longer
 * does... the exclusion rule caught real names too."
 *
 * Flip this to `true` to turn the exclusion on. Every place that reads it
 * -- the SQL clause in #runFts and the vector-arm filter in `search()`,
 * both in search.ts -- reverses together. byGtin and the neighbour ring
 * never read this flag and are unaffected either way.
 */
export const EXCLUDE_BARE_PART_NUMBERS_FROM_TEXT_SEARCH = false;

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
