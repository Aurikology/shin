import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readCatalogue } from '../src/estimate.ts';

// The estimate's own catalogue read must take a row's department (Kroger shampoo is beauty) over its source's (food).
function catalogue(withColumn: boolean): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE product (code TEXT, name TEXT, name_en TEXT, brands TEXT, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT, leaf_category TEXT, source TEXT${withColumn ? ', department TEXT' : ''})`);
  const cols = withColumn ? '(code, name, source, department) VALUES (?, ?, ?, ?)' : '(code, name, source) VALUES (?, ?, ?)';
  const add = db.prepare(`INSERT INTO product ${cols}`);
  if (withColumn) {
    add.run('0001111111111', 'Kroger Shampoo 12 oz', 'kroger-names', 'beauty');
    add.run('0001111111128', 'Kroger Bread', 'kroger-names', null);
  } else {
    add.run('0001111111111', 'Kroger Shampoo 12 oz', 'kroger-names');
  }
  return db;
}

test('a row with its own department is read as that department, not its source default', () => {
  const db = catalogue(true);
  try {
    const out = readCatalogue(db, ['0001111111111', '0001111111128']);
    const dept = [...out.values()].map((r) => [r.name, r.department]);
    assert.deepEqual(dept.sort(), [['Kroger Bread', 'food'], ['Kroger Shampoo 12 oz', 'beauty']]);
  } finally {
    db.close();
  }
});

test('a catalogue without the department column still reads the source default', () => {
  const db = catalogue(false);
  try {
    const out = readCatalogue(db, ['0001111111111']);
    assert.equal([...out.values()][0]?.department, 'food');
  } finally {
    db.close();
  }
});
