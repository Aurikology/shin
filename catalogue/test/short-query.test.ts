/**
 * D-269: a typed "pc" timed out at 5 seconds and the shopper got an error.
 *
 * A two-letter prefix matches millions of rows in the real catalogue and the
 * word search ordered every one of them by bm25 before cutting to sixty. The
 * fix is bounded work, so these tests pin the bound itself (how much the engine
 * is asked to score), which holds on any machine, instead of a stopwatch that
 * would pass on a fast one and fail on a slow one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, EMBED_DIM } from '../src/schema.ts';
import { Catalogue } from '../src/search.ts';
import type { Embedder } from '../src/embed.ts';

const embedder: Embedder = {
  id: 'test:zero',
  dim: EMBED_DIM,
  async embedPassages(texts: string[]) {
    return texts.map(() => new Float32Array(EMBED_DIM));
  },
  async embedQuery() {
    return new Float32Array(EMBED_DIM);
  },
};

const MANY = 6000;

function fixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN');
  for (let i = 0; i < MANY; i += 1) {
    const code = String(2000000000000 + i);
    insert.run(code, `Desktop PC model ${i}`, `Desktop PC model ${i}`, null, 'Acme', null, null, null, '[]', 'en:electronics', '[]', 0, 'icecat');
  }
  insert.run('0068100084245', 'PC Ketchup', 'PC Ketchup', null, 'PC', '1 L', 1000, 'ml', '["en:sauces"]', 'en:sauces', '[]', 1, 'openfoodfacts');
  insert.run('0068100084252', 'Pcb Tester', 'Pcb Tester', null, 'Acme', null, null, null, '[]', 'en:electronics', '[]', 0, 'icecat');
  db.exec('COMMIT');
  rebuildFts(db);

  // Record every statement the word search runs and how many rows each handed back.
  const ran: { sql: string; params: unknown[]; rows: number }[] = [];
  const prepare = db.prepare.bind(db);
  (db as unknown as { prepare: (sql: string) => unknown }).prepare = (sql: string) => {
    const stmt = prepare(sql);
    if (!sql.includes('product_fts MATCH')) return stmt;
    const all = stmt.all.bind(stmt);
    stmt.all = (...params: never[]) => {
      const rows = all(...params);
      ran.push({ sql, params, rows: rows.length });
      return rows;
    };
    return stmt;
  };
  return { cat: new Catalogue(db, embedder), ran };
}

test('"pc" asks the engine to score a bounded number of rows, never every match', async () => {
  const { cat, ran } = fixture();
  const result = await cat.search({ text: 'pc', limit: 5, vectors: false });
  assert.ok(result.candidates.length > 0 && result.candidates.length <= 5);
  assert.ok(ran.length > 0, 'the word search ran');
  for (const r of ran) {
    assert.doesNotMatch(r.sql, /ORDER BY score/, 'ordering every match by bm25 is what ran past 5 seconds');
    assert.ok(r.rows <= 2000, `scored ${r.rows} rows`);
  }
});

test('a short word is the exact word, not a prefix that matches the catalogue', async () => {
  const { cat, ran } = fixture();
  await cat.search({ text: 'pc', limit: 5, vectors: false });
  const match = ran[0]!.params[0] as string;
  assert.equal(match, '"pc"');
  const names = (await cat.search({ text: 'pc', limit: 60, vectors: false })).candidates.map((c) => c.name);
  assert.ok(!names.includes('Pcb Tester'), 'pcb is not pc');
});

test('a short word beside a real word still finds the product both name', async () => {
  const { cat } = fixture();
  const result = await cat.search({ text: 'pc ketchup', limit: 5, vectors: false });
  assert.equal(result.candidates[0]?.name, 'PC Ketchup');
});

test('a normal word keeps its ranked search and its half-typed prefix', async () => {
  const { cat, ran } = fixture();
  const result = await cat.search({ text: 'ketch', limit: 5, vectors: false });
  assert.equal(result.candidates[0]?.name, 'PC Ketchup');
  assert.match(ran[0]!.sql, /ORDER BY score/);
  assert.equal(ran[0]!.params[0], '"ketch"*');
});
