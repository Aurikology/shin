import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanStoreName, pluDisplayNames } from '../src/hammer-produce.ts';
import { cleanListName, pluByCode, pluList } from '../src/plu.ts';

test('cleanStoreName drops sizes, counts, bulk and fresh words, parentheses and the organic word', () => {
  assert.equal(cleanStoreName('Squash, 110 Gram'), 'Squash');
  assert.equal(cleanStoreName('Navel Oranges Medium 1 Count'), 'Navel Oranges Medium');
  assert.equal(cleanStoreName('Beets - Bulk, Fresh, 170 Gram'), 'Beets');
  assert.equal(cleanStoreName('Cara Cara (Red Navel), Fresh, 200 Gram'), 'Cara Cara');
  assert.equal(cleanStoreName('Organic Bananas, Bunch'), 'Bananas');
  assert.equal(cleanStoreName('BANANAS'), 'Bananas');
  assert.equal(cleanStoreName('Nectarines - Large, Fresh, 150 Gram'), 'Large Nectarines');
  assert.equal(cleanStoreName('Pears - Asian, Yellow, Fresh, 235 Gram'), 'Asian Yellow Pears');
  assert.equal(cleanStoreName('Potatoes - Russet Potatoes Bulk, 320 Gram'), 'Russet Potatoes');
  assert.equal(cleanStoreName('Celery - Bunch, Fresh, 675 Gram'), 'Celery');
});

test('cleanListName drops parentheses and puts the variety first in comma names', () => {
  assert.equal(cleanListName('Navel, Cara Cara (Red) Oranges'), 'Cara Cara Navel Oranges');
  assert.equal(cleanListName('Romaine, Red Lettuce'), 'Red Romaine Lettuce');
  assert.equal(cleanListName('Small Bell, Greenhouse - Green Peppers (capsicums)'), 'Small Bell Greenhouse - Green Peppers');
  assert.equal(cleanListName('Bananas'), 'Bananas');
  assert.equal(cleanListName('Alkmene Apples'), 'Alkmene Apples');
  assert.equal(cleanListName('Granadilla, Orange Passion fruit'), 'Granadilla Orange Passion fruit');
});

test('pluDisplayNames: the most common cleaned store name wins; ties go to the longer name; a name too thin for the list name is ignored', () => {
  const names = pluDisplayNames([
    { base: '4011', name: 'Bananas, Bunch' },
    { base: '4011', name: 'Banana' },
    { base: '4011', name: 'BANANAS' },
    { base: '4011', name: 'Organic Bananas, Bunch' },
    { base: '3110', name: 'Cara Cara (Red Navel), Fresh, 200 Gram' },
    { base: '3110', name: 'Cara Cara Orange' },
    { base: '4086', name: 'Squash, 110 Gram' },
  ]);
  assert.equal(names['4011'], 'Bananas');
  assert.equal(names['3110'], 'Cara Cara Orange');
  assert.equal(names['4086'], undefined);
});

test('a shopper reads the store-derived name from the committed file, with Organic in front for the organic code', () => {
  const file = JSON.parse(readFileSync(new URL('../src/plu-display.json', import.meta.url), 'utf8')) as Record<string, string>;
  assert.ok(Object.keys(file).length > 100);
  for (const base of Object.keys(file)) assert.ok(pluList()[base], `${base} is not on the PLU list`);
  assert.equal(pluByCode('3110')?.name, file['3110']);
  assert.match(String(pluByCode('3110')?.name), /^Cara Cara/);
  assert.equal(pluByCode('94011')?.name, `Organic ${file['4011']}`);
  assert.equal(pluByCode('4022')?.name, file['4022']);
  // The list text is still there for anything that needs it.
  assert.equal(pluByCode('3110')?.listName, 'Navel, Cara Cara (Red) Oranges');
});

test('a code with no store name gets the cleaned list text', () => {
  const file = JSON.parse(readFileSync(new URL('../src/plu-display.json', import.meta.url), 'utf8')) as Record<string, string>;
  const missing = Object.keys(pluList()).find((c) => !file[c] && /,/.test(pluList()[c]));
  assert.ok(missing);
  assert.equal(pluByCode(missing)?.name, cleanListName(pluList()[missing]));
});
