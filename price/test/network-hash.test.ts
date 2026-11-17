/**
 * The network a typed price came from: an IPv4 /24 or an IPv6 /48, kept only as a salted hash
 * (security finding F1, 2026-11-16). Never the address.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { networkHash, networkPrefix, removeShopperPricesFor, saveShopperPrice } from '../src/shopper-prices.ts';
import { DatabaseSync } from 'node:sqlite';

test('an IPv4 address is its /24, and mapped IPv4 is read as IPv4', () => {
  assert.equal(networkPrefix('203.0.113.77'), '203.0.113.0/24');
  assert.equal(networkPrefix('203.0.113.200'), '203.0.113.0/24');
  assert.equal(networkPrefix('::ffff:203.0.113.5'), '203.0.113.0/24');
  assert.equal(networkPrefix('203.0.114.77'), '203.0.114.0/24');
});

test('an IPv6 address is its /48, with the :: gap filled in', () => {
  assert.equal(networkPrefix('2001:db8:1:2:3:4:5:6'), '2001:db8:1::/48');
  assert.equal(networkPrefix('2001:db8:1:ffff::1'), '2001:db8:1::/48');
  assert.equal(networkPrefix('2001:DB8:1::1'), '2001:db8:1::/48');
  assert.equal(networkPrefix('2001:db8::1'), '2001:db8:0::/48');
  assert.equal(networkPrefix('::1'), '0:0:0::/48');
});

test('things that are not an address have no network', () => {
  for (const bad of ['', 'unknown', '999.1.1.1', '1.2.3', 'a:b:c:d:e:f:g:h', '1::2::3', null, undefined]) {
    assert.equal(networkPrefix(bad as string | null | undefined), null, String(bad));
  }
});

test('the hash is the same for one network, differs between networks, and needs a salt', () => {
  const a = networkHash('203.0.113.7', 'salt-1');
  assert.ok(a && a.length === 24);
  assert.equal(networkHash('203.0.113.250', 'salt-1'), a);
  assert.notEqual(networkHash('203.0.114.7', 'salt-1'), a);
  assert.notEqual(networkHash('203.0.113.7', 'salt-2'), a, 'another salt, another hash');
  assert.equal(networkHash('203.0.113.7', ''), null);
  assert.equal(networkHash('nonsense', 'salt-1'), null);
  assert.ok(!a!.includes('203'), 'the address is not in the hash');
});

test('the owner tool: a dry run counts, a real run deletes only that product', () => {
  const db = new DatabaseSync(':memory:');
  const row = { region: null, store: null, seenOn: '2026-11-14', centreCents: null };
  saveShopperPrice(db, { ...row, code: '0068100090011', deviceId: 'a', priceCents: 500 });
  saveShopperPrice(db, { ...row, code: '68100090011', deviceId: 'b', priceCents: 500 });
  saveShopperPrice(db, { ...row, code: '999', deviceId: 'a', priceCents: 500 });
  assert.equal(removeShopperPricesFor(db, '0068100090011', true), 2);
  assert.equal(removeShopperPricesFor(db, '0068100090011', true), 2, 'a dry run deletes nothing');
  assert.equal(removeShopperPricesFor(db, '0068100090011', false), 2);
  assert.equal(removeShopperPricesFor(db, '0068100090011', true), 0);
  assert.equal(removeShopperPricesFor(db, '999', true), 1, 'the other product is untouched');
});
