/**
 * Test support: rebuild a test catalogue's category index without the real taxonomy.
 *
 * `rebuildCategories` needs a taxonomy and throws without one. The older tests build tiny
 * catalogues out of made-up tags ("en:peanut-butters") that no real taxonomy holds, and what
 * they test is the ring and search behaviour, not the taxonomy. This builds a taxonomy from
 * the catalogue's own stored paths (every label an entry, each one's parent the label before
 * it in the path) so every label resolves to itself and the index is what the tests always
 * assumed. It is a fixture builder and lives in test/, never in src/.
 */
import type { DatabaseSync } from 'node:sqlite';
import { foldTag, taxonomyFromObject } from '../../src/category-taxonomy.ts';
import type { Taxonomy } from '../../src/category-taxonomy.ts';
import { rebuildCategories } from '../../src/schema.ts';
import type { RebuildCategoriesResult } from '../../src/schema.ts';

/** A taxonomy whose entries are exactly the labels in the catalogue's stored paths. */
export function pathTaxonomy(db: DatabaseSync): Taxonomy {
  const entries: Record<string, { parents: string[] }> = {};
  for (const r of db.prepare('SELECT category_path FROM product').all() as unknown as { category_path: string }[]) {
    const path = JSON.parse(r.category_path) as string[];
    path.forEach((label, i) => {
      const key = foldTag(label);
      const e = (entries[key] ??= { parents: [] });
      const prev = i > 0 ? foldTag(path[i - 1]!) : null;
      if (prev !== null && prev !== key && !e.parents.includes(prev)) e.parents.push(prev);
    });
  }
  if (Object.keys(entries).length === 0) entries['en:test-placeholder'] = { parents: [] };
  return taxonomyFromObject(entries, 'test-path-taxonomy');
}

/** rebuildCategories with the catalogue's own labels as the taxonomy, printing nothing. */
export function rebuildCategoriesFromPaths(db: DatabaseSync): RebuildCategoriesResult {
  return rebuildCategories(db, { taxonomy: pathTaxonomy(db), log: () => {} });
}
