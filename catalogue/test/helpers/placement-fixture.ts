/**
 * A small in-memory catalogue for the Stage 3 placement tests (price-category plan,
 * "Placing items", 2.1 to 2.4). Temp data only: every database here is ':memory:'
 * or a file under the OS temp folder.
 */
import type { DatabaseSync } from 'node:sqlite';
import { openCatalogue, rebuildFts } from '../../src/schema.ts';
import { buildPlacement, ensurePlacementSchema } from '../../src/placement.ts';

export interface FixtureRow {
  readonly code: string;
  readonly source: string;
  readonly path: readonly string[];
  readonly name?: string;
  readonly nameFr?: string;
  readonly brands?: string;
  readonly canada?: boolean;
}

export function fixtureCatalogue(rows: readonly FixtureRow[]): DatabaseSync {
  const db = openCatalogue(':memory:');
  const ins = db.prepare(
    `INSERT INTO product (code, name, name_en, name_fr, brands, category_path, leaf_category, allergens, sold_in_canada, source)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const r of rows) {
    const name = r.name ?? `item ${r.code}`;
    ins.run(r.code, name, name, r.nameFr ?? null, r.brands ?? null, JSON.stringify(r.path), r.path.at(-1) ?? null, '[]', r.canada === false ? 0 : 1, r.source);
  }
  rebuildFts(db);
  return db;
}

/** The catalogue with the Stage 2 placement layer built on it (the stored paths placed, the rest unplaced). */
export function placedFixture(rows: readonly FixtureRow[]): DatabaseSync {
  const db = fixtureCatalogue(rows);
  ensurePlacementSchema(db);
  buildPlacement(db, { log: () => {} });
  return db;
}

export function nodeIdOf(db: DatabaseSync, department: string, tag: string): number {
  const r = db.prepare('SELECT node_id FROM placement_node WHERE department = ? AND tag = ?').get(department, tag) as { node_id: number } | undefined;
  if (!r) throw new Error(`fixture: no node ${department} ${tag}`);
  return r.node_id;
}

export interface PlacementRowView {
  readonly code: string;
  readonly tag: string;
  readonly kind: string;
  readonly placedBy: string;
  readonly level: number | null;
  readonly confidence: number | null;
}

export function placementOf(db: DatabaseSync, code: string): PlacementRowView {
  const r = db
    .prepare(
      `SELECT ip.code, n.tag, n.kind, ip.placed_by, ip.level, ip.confidence
         FROM item_placement ip JOIN placement_node n ON n.node_id = ip.leaf_id WHERE ip.code = ?`,
    )
    .get(code) as { code: string; tag: string; kind: string; placed_by: string; level: number | null; confidence: number | null } | undefined;
  if (!r) throw new Error(`fixture: ${code} has no placement`);
  return { code: r.code, tag: r.tag, kind: r.kind, placedBy: r.placed_by, level: r.level, confidence: r.confidence };
}

export function logLength(db: DatabaseSync): number {
  return (db.prepare('SELECT count(*) AS n FROM placement_log').get() as { n: number }).n;
}
