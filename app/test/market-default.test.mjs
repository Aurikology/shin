// Shin is global (Jamin, 2026-09-17 walkthrough): a new user's market is empty until they choose one,
// never Canada. And the button he calls "Fix Results" on the welcome screen carries the same words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = (p) => readFileSync(new URL(`../public/js/${p}`, import.meta.url), 'utf8');

test('a fresh store holds no market, so nothing assumes a country', () => {
  const src = js('store.js');
  assert.match(src, /market: \{ country: '', currency: '' \}/);
  assert.doesNotMatch(src, /market: \{ country: 'Canada'/);
});

test('the You screen says "not set" for an empty market instead of a blank', () => {
  assert.match(js('screens/you.js'), /market\.country \? countryLabel\(market\.country\) : t\('you_market_unset'\)/);
  const strings = js('ui-strings.js');
  assert.match(strings, /you_market_unset: 'Not set'/);
  assert.match(strings, /you_market_unset: 'Non défini'/);
});

test('the correction button is called what the welcome screen calls it, in both languages', () => {
  const strings = js('ui-strings.js');
  const onb = js('onboarding-strings.js');
  assert.match(strings, /cam_correct_it: 'Fix Results'/);
  assert.match(onb, /Tap ‘Fix Results’/);
  assert.match(strings, /cam_correct_it: 'Corriger les résultats'/);
  assert.match(onb, /« Corriger les résultats »/);
});
