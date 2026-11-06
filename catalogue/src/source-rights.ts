/**
 * What Pexi may do with each catalogue source (decision 2026-11-05: Pexi must hold the rights to
 * everything it shows). One named list per rule, so a change of rights is one diff here and not a
 * hunt through the read paths.
 *
 * This file has no imports on purpose: the catalogue, the price ladders and the app all read it.
 * The `product.source` keys are what the loaders write: catalogue/src/fetch_returnit.py
 * (SOURCE = "returnit") and catalogue/src/fetch_consignaction.py (SOURCE = "consignaction"); the
 * Icecat key is the one prepare_rows_icecat.py writes. app/src/attribution.ts records the terms.
 *
 * Rows are never deleted from a database. A row whose source is listed here is simply not read.
 */

/**
 * Sources that grant no reuse licence (Return-It, BC: robots.txt bars the registry path;
 * Consignaction, Quebec: personal non-commercial copying only). No answer, search result, typed
 * lookup, barcode lookup, broad guess or offline pack may use one of their rows.
 */
export const UNLICENSED_SOURCES: readonly string[] = ['returnit', 'consignaction'];

/**
 * Sources whose licence bars machine learning and generative AI (Open Icecat licence v1.4,
 * clause 10). A product whose name, brand, size and category come only from one of these is never
 * sent to a model; it is answered with the broad-guess range a product with no price gets.
 */
export const NEVER_SENT_TO_A_MODEL_SOURCES: readonly string[] = ['icecat'];

/** True when the row's source may not be read at all. */
export function isUnlicensedSource(source: unknown): boolean {
  return typeof source === 'string' && UNLICENSED_SOURCES.includes(source);
}

/** True when a product that rests only on this source must not be described to a model. */
export function isNeverSentToAModel(source: unknown): boolean {
  return typeof source === 'string' && NEVER_SENT_TO_A_MODEL_SOURCES.includes(source);
}

/**
 * An SQL condition that keeps unlicensed rows out, to AND into a WHERE clause. `alias` is the
 * product table's alias with its dot ('p.'), or '' for none. The keys are constants of this file,
 * so they are written into the text rather than bound.
 */
export function licensedOnlySql(alias = ''): string {
  const list = UNLICENSED_SOURCES.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
  // `source` is NOT NULL in the catalogue schema; the IS NULL arm keeps a hand-built table without one readable.
  return `(${alias}source IS NULL OR ${alias}source NOT IN (${list}))`;
}
