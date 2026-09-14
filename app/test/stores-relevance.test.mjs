/**
 * The shop shortlist asks for shops a price can belong to, and nothing else.
 *
 * WHY THIS FILE EXISTS. The query was `nwr["shop"]`, which is "every retail
 * premises within a kilometre". Measured against the live Overpass API on
 * 2026-09-14, that came back from downtown Hamilton as five car repair shops,
 * four hairdressers, three beauty salons, a shoe shop and a travel agent, and
 * from downtown Montreal as nineteen clothes shops, five jewellers and an
 * erotic boutique. Both answers filled the sixty element ceiling, so the noise
 * was not cosmetic: it was crowding grocers out of the answer.
 *
 * The opposite failure was worse and quieter. A pharmacy is tagged
 * `amenity=pharmacy`, not `shop=pharmacy`, so a query on `shop` cannot see one
 * at all. Every Jean Coutu, Uniprix and Pharmaprix in the Montreal cell was
 * invisible, in a country where a drugstore is a grocery run.
 *
 * Two things are held here, and they are the two halves of that bug: the query
 * asks for the right kinds, and the parser keeps only the right kinds no
 * matter what the answer contains.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCell,
  parseOverpass,
  overpassQuery,
  hintFor,
  SHOP_KINDS,
  AMENITY_KINDS,
} from '../src/stores.ts';

const CELL = parseCell('43.26,-79.87');

test('every kind Shin prices is actually asked for', () => {
  const q = overpassQuery(CELL);
  for (const kind of SHOP_KINDS) {
    assert.ok(q.includes(kind), `the query never asks for shop=${kind}`);
  }
  for (const kind of AMENITY_KINDS) {
    assert.ok(q.includes(kind), `the query never asks for amenity=${kind}`);
  }
  // The two keys, both present. A pharmacy is unreachable without the second.
  assert.match(q, /nwr\["shop"~/);
  assert.match(q, /nwr\["amenity"~/);
});

test('the query no longer asks for every shop on Earth', () => {
  const q = overpassQuery(CELL);
  assert.ok(!q.includes('["shop"]'), 'the bare shop tag is back, and so are the hairdressers');
  // Anchored, so that shop=car_parts cannot answer a request for farm.
  assert.match(q, /\^\(/);
  assert.match(q, /\)\$/);
});

test('the radius, the timeout and the ceiling are the ones that were there', () => {
  const q = overpassQuery(CELL);
  assert.match(q, /\[timeout:10\]/);
  assert.match(q, /around:1200,43.26,-79.87/);
  assert.match(q, /out center 60;$/);
});

/** One answer of each kind that matters, at four different distances. */
const MIXED = JSON.stringify({
  elements: [
    {
      type: 'node', id: 1, lat: 43.2601, lon: -79.8701,
      tags: { name: 'Jean Coutu', amenity: 'pharmacy', 'addr:housenumber': '20', 'addr:street': 'King St E' },
    },
    {
      type: 'way', id: 2, center: { lat: 43.2603, lon: -79.8702 },
      tags: { name: 'No Frills', shop: 'supermarket' },
    },
    {
      type: 'node', id: 3, lat: 43.2605, lon: -79.8703,
      tags: { name: 'Collective Arts', shop: 'brewery' },
    },
    {
      type: 'node', id: 4, lat: 43.2607, lon: -79.8704,
      tags: { name: 'Sharp Cuts', shop: 'hairdresser' },
    },
  ],
});

test('a pharmacy and a supermarket come back; a brewery and a hairdresser do not', () => {
  const stores = parseOverpass(MIXED, CELL);
  assert.deepEqual(stores.map((s) => s.name), ['Jean Coutu', 'No Frills']);
});

test('the rows are the same shape the screen already reads', () => {
  const stores = parseOverpass(MIXED, CELL);
  // id, name, hint: exactly what public/js/shops.js cleans and orders. The
  // pharmacy is a full row, not a degraded one.
  assert.deepEqual(stores[0], { id: 'node/1', name: 'Jean Coutu', hint: '20 King St E' });
  assert.deepEqual(stores[1], { id: 'way/2', name: 'No Frills', hint: 'supermarket' });
});

test('a place with no address is still named by what it is, amenity included', () => {
  // The old code read tags.shop here, so a pharmacy with no street got a blank
  // line under its name and two branches of Jean Coutu were indistinguishable.
  assert.equal(hintFor({ amenity: 'pharmacy' }), 'pharmacy');
  assert.equal(hintFor({ amenity: 'marketplace' }), 'marketplace');
  assert.equal(hintFor({ shop: 'department_store' }), 'department store');
  // Not a kind Shin offers, so there is nothing to say about it.
  assert.equal(hintFor({ shop: 'hairdresser' }), '');
});

test('an amenity Shin does not price is not a shop', () => {
  const body = JSON.stringify({
    elements: [
      { type: 'node', id: 9, lat: 43.26, lon: -79.87, tags: { name: 'The Ship', amenity: 'pub' } },
      { type: 'node', id: 10, lat: 43.26, lon: -79.87, tags: { name: 'Scotiabank', amenity: 'bank' } },
    ],
  });
  assert.deepEqual(parseOverpass(body, CELL), []);
});
