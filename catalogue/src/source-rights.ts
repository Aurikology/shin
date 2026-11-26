/**
 * What Pexi may do with each catalogue source (decision 2026-11-05: Pexi must hold the rights to
 * everything it shows). One named list per rule, so a change of rights is one diff here and not a
 * hunt through the read paths.
 *
 * This file's only import is the settings module (the catalogue, the price ladders and the app all read it).
 * The `product.source` keys are what the loaders write: catalogue/src/fetch_returnit.py
 * (SOURCE = "returnit") and catalogue/src/fetch_consignaction.py (SOURCE = "consignaction"); the
 * Icecat key is the one prepare_rows_icecat.py writes. app/src/attribution.ts records the terms.
 *
 * Rows are never deleted from a database. A row whose source is listed here is simply not read.
 */

import * as settings from '../../settings/src/index.ts';

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

/**
 * An SQL condition that keeps out the sources whose licence bars machine learning, to AND into the
 * WHERE clause of anything that feeds a model. `alias` as in `licensedOnlySql`.
 */
export function modelAllowedSql(alias = ''): string {
  const list = NEVER_SENT_TO_A_MODEL_SOURCES.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
  return `(${alias}source IS NULL OR ${alias}source NOT IN (${list}))`;
}

/** True when the row's source may not be read at all. */
export function isUnlicensedSource(source: unknown): boolean {
  return typeof source === 'string' && (UNLICENSED_SOURCES.includes(source) || excludedCatalogueSources().includes(source));
}

/*
 * THE KILL SWITCH (decision 2026-11-25): every external data source stays, but any one of them
 * must be removable from shopper answers within minutes if its owner objects. Set
 * SHIN_EXCLUDED_SOURCES=kroger,hammer (comma separated switch names, any case) and restart: rows of
 * those sources are not read by any answer path. The setting is read ONCE, when this module loads.
 * Default empty: nothing changes. Rows are never deleted by the switch (price/src/purge-source.ts
 * is the command that deletes).
 *
 * One switch name covers both stores. A catalogue row names its source in `product.source`; a price
 * row names its seller in `observation.seller`; the two spell the same company differently (the
 * Kroger price API writes seller 'Kroger', the Kroger name file writes catalogue source
 * 'kroger-names'), so this table maps one switch name to the spelling in each store.
 *
 * A name not in the table is not an error (a typo that silently did nothing would be the worst
 * outcome for an emergency switch): it is applied as written to BOTH columns, and one line on
 * stderr says so.
 */
export interface SourceSwitch {
  /** `product.source` values removed. */
  readonly catalogue: readonly string[];
  /** `observation.seller` values removed (compared lower-cased). */
  readonly sellers: readonly string[];
}

export const SOURCE_SWITCHES: Readonly<Record<string, SourceSwitch>> = {
  kroger: { catalogue: ['kroger-names'], sellers: ['Kroger', 'kroger-names'] },
  hammer: { catalogue: ['hammer'], sellers: ['hammer'] },
  openfoodfacts: { catalogue: ['openfoodfacts'], sellers: [] },
  openbeautyfacts: { catalogue: ['openbeautyfacts'], sellers: [] },
  openpetfoodfacts: { catalogue: ['openpetfoodfacts'], sellers: [] },
  openproductsfacts: { catalogue: ['openproductsfacts'], sellers: [] },
  openprices: { catalogue: [], sellers: ['openprices'] },
  icecat: { catalogue: ['icecat'], sellers: [] },
  usda: { catalogue: ['usda'], sellers: [] },
  metro: { catalogue: ['metro'], sellers: [] },
  returnit: { catalogue: ['returnit'], sellers: [] },
  consignaction: { catalogue: ['consignaction'], sellers: [] },
  walmart: { catalogue: [], sellers: ['Walmart'] },
  canadiantire: { catalogue: [], sellers: ['Canadian Tire'] },
  saveonfoods: { catalogue: [], sellers: ['Save-On-Foods'] },
  bcldb: { catalogue: [], sellers: ['bcldb'] },
  anbl: { catalogue: [], sellers: ['anbl'] },
};

/** The two lists one switch spec resolves to. Pure: the spec is passed in. */
export function resolveExcluded(spec: string | undefined | null, warn: (line: string) => void = (l) => console.error(l)): { catalogue: string[]; sellers: string[] } {
  const catalogue = new Set<string>();
  const sellers = new Set<string>();
  for (const raw of (spec ?? '').split(',')) {
    const name = raw.trim().toLowerCase();
    if (name === '') continue;
    const known = SOURCE_SWITCHES[name];
    if (known) {
      known.catalogue.forEach((c) => catalogue.add(c));
      known.sellers.forEach((s) => sellers.add(s.toLowerCase()));
    } else {
      warn(`SHIN_EXCLUDED_SOURCES: "${name}" is not in the switch table (source-rights.ts); applied as written to catalogue source and price seller`);
      catalogue.add(name);
      sellers.add(name);
    }
  }
  return { catalogue: [...catalogue].sort(), sellers: [...sellers].sort() };
}

let excluded = resolveExcluded(settings.SHIN_EXCLUDED_SOURCES());

/** Catalogue `product.source` values the kill switch removes (empty by default). */
export function excludedCatalogueSources(): readonly string[] {
  return excluded.catalogue;
}

/** Lower-cased `observation.seller` values the kill switch removes (empty by default). */
export function excludedSellers(): readonly string[] {
  return excluded.sellers;
}

/** TESTS ONLY: replace the setting the module read at start. Returns a function that restores it. */
export function setExcludedSourcesForTest(spec: string): () => void {
  const before = excluded;
  excluded = resolveExcluded(spec, () => {});
  return () => {
    excluded = before;
  };
}

/** True when a price row's seller is removed by the kill switch. */
export function isExcludedSeller(seller: unknown): boolean {
  return typeof seller === 'string' && excluded.sellers.length > 0 && excluded.sellers.includes(seller.toLowerCase());
}

/**
 * SQL to AND into a WHERE clause over `observation`: ' AND lower(seller) NOT IN (...)', or the empty
 * string when nothing is excluded, so the default query text is the one it always was. `alias` with its dot.
 */
export function sellerAllowedSql(alias = ''): string {
  if (excluded.sellers.length === 0) return '';
  const list = excluded.sellers.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
  return ` AND lower(${alias}seller) NOT IN (${list})`;
}

/*
 * SHIN_ICECAT_NO_AI (decision 2026-11-25, default OFF). Open Icecat licence clause 10 bars machine
 * learning and generative AI. The paths that existed on 2026-11-06 (embed-all.ts vectors, the vector
 * search, the Claude range ask in catalogue-first.ts and server.ts) already keep Icecat out, always,
 * through NEVER_SENT_TO_A_MODEL_SOURCES; that is not behind this switch. The switch covers the paths
 * built after: the placement run's name-meaning embeddings and nearest neighbours (name-meaning.ts,
 * placement-cascade.ts) and the Claude category chooser. With the switch off they read Icecat rows as
 * they always did; set SHIN_ICECAT_NO_AI=1 and restart (or rerun the placement) to take Icecat out.
 */
let icecatNoAi = ['1', 'true', 'yes', 'on'].includes((settings.SHIN_ICECAT_NO_AI() ?? '').trim().toLowerCase());

/** True when the placement run's learning and model paths must leave Icecat rows out. */
export function icecatNoAiOn(): boolean {
  return icecatNoAi;
}

/** TESTS ONLY: set the switch the module read at start. Returns a function that restores it. */
export function setIcecatNoAiForTest(on: boolean): () => void {
  const before = icecatNoAi;
  icecatNoAi = on;
  return () => {
    icecatNoAi = before;
  };
}

/** Sources the switch keeps out of the placement run's embeddings, neighbours and model calls (none when it is off). */
export function aiBarredSources(): readonly string[] {
  return icecatNoAi ? NEVER_SENT_TO_A_MODEL_SOURCES : [];
}

/** True when this row's source is kept out of learning and model paths by the switch. */
export function isAiBarredSource(source: unknown): boolean {
  return typeof source === 'string' && icecatNoAi && NEVER_SENT_TO_A_MODEL_SOURCES.includes(source);
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
  const list = [...UNLICENSED_SOURCES, ...excludedCatalogueSources()].map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
  // `source` is NOT NULL in the catalogue schema; the IS NULL arm keeps a hand-built table without one readable.
  return `(${alias}source IS NULL OR ${alias}source NOT IN (${list}))`;
}
