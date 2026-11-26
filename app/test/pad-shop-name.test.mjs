/**
 * The price pad's shop row is announced with what it shows (2026-11-26, the a11y sweep's
 * label-content-name-mismatch on `.ilist-row.pad-shop`, there since at least 5176dec).
 *
 * The row draws "Shop" and, beside it, the chosen shop or "Choose". It carried
 * aria-label="Shop", which replaces the visible text as the accessible name: VoiceOver read
 * "Shop, button" and never the shop the price would be filed at, and a Voice Control user
 * saying "tap Loblaws" had nothing by that name to tap (WCAG 2.5.3, label in name).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });
const { padShopRow } = await import('../public/js/screens/camera.js');

const nameOf = (html) => {
  const label = /aria-label="([^"]*)"/.exec(html);
  if (label) return label[1];
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};
const visibleOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('the shop row is named by everything it shows: "Shop" and the chosen shop, or "Choose"', () => {
  for (const shop of [{ name: 'Loblaws' }, null]) {
    const html = padShopRow(shop, true);
    const shown = visibleOf(html);
    assert.ok(shown.length > 4, `the row shows nothing: ${html}`);
    assert.ok(nameOf(html).includes(shown), `announced as "${nameOf(html)}" while it shows "${shown}"`);
  }
  assert.ok(visibleOf(padShopRow({ name: 'Loblaws' }, true)).includes('Loblaws'), 'control: the chosen shop is not drawn');
});
