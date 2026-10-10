/**
 * D-234. The solid Save pill on the verdict sheet against the panel it sits on.
 *
 * The pill is `.pill.solid` (camera.js data-act="dist-save"). camera.css fills it
 * with --tier-on and inks it --tier: an inversion built for the SOLID panels,
 * where the panel is --tier. On the thin panel the ground is a 12% tint of the
 * tier over --ground, so in dark theme the good and fair pills (--good-on
 * #04140C, --fair-on #1A1204) were near-black on a near-black green or amber and
 * all but vanished. The pill colour followed the verdict zone, not the panel.
 *
 * Nothing here is copied from prose: the pill's fill and ink are resolved from
 * the `.pill.solid` rules in camera.css by selector, specificity and source
 * order, the panel ground from the `.sheet[data-conf=...]` rules, and every
 * var() and color-mix() from tokens.css, in both themes. A pill rule that moves
 * changes the number here.
 *
 * Floors: pill fill against the panel ground 3:1 (non-text graphic), pill label
 * against the pill fill 4.5:1 (14px bold text).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tokensCss = read('../public/css/tokens.css');
const cameraCss = read('../public/css/screens/camera.css').replace(/\/\*[\s\S]*?\*\//g, '');

/* ------------------------------------------------------------------ colour */

const srgb = (hex) => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const luminance = (hex) => {
  const [r, g, b] = srgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const toHex = (parts) =>
  '#' + parts.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, p) => {
  const A = srgb(a);
  const B = srgb(b);
  return toHex(A.map((c, i) => c * p + B[i] * (1 - p)));
};

/* ------------------------------------------------------------------ tokens */

const blockAt = (src, selector) => {
  const start = src.indexOf(selector);
  assert.notEqual(start, -1, `no ${selector} block`);
  const open = src.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  const out = {};
  for (const [, name, value] of src.slice(open + 1, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
};

const tokensNoComments = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
const DARK = blockAt(tokensNoComments, ':root {');
const LIGHT = { ...DARK, ...blockAt(tokensNoComments, ':root[data-theme="light"]') };
const TIER_BIND = {
  good: blockAt(tokensNoComments, '[data-tier="good"]'),
  fair: blockAt(tokensNoComments, '[data-tier="fair"]'),
  walk_away: blockAt(tokensNoComments, '[data-tier="walk_away"]'),
  unknown: blockAt(tokensNoComments, '[data-tier="unknown"]'),
};

/** Resolve a CSS colour value: hex, var(--x[, fallback]), color-mix(in srgb, A p%, B). */
const resolve = (value, env) => {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  const va = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v);
  if (va) {
    if (env[va[1]] !== undefined) return resolve(env[va[1]], env);
    assert.ok(va[2], `${va[1]} is not defined and has no fallback`);
    return resolve(va[2], env);
  }
  const cm = /^color-mix\(\s*in srgb\s*,\s*([\s\S]+?)\s+(\d+(?:\.\d+)?)%\s*,\s*([\s\S]+)\)$/.exec(v);
  if (cm) return mix(resolve(cm[1], env), resolve(cm[3], env), Number(cm[2]) / 100);
  assert.fail(`cannot resolve colour value: ${value}`);
};

/* --------------------------------------------------------------------- css */

const rules = [];
{
  let order = 0;
  for (const [, sel, body] of cameraCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = {};
    for (const [, prop, val] of body.matchAll(/(?:^|;|\s)([a-z-]+)\s*:\s*([^;]+)/g)) decls[prop] = val.trim();
    for (const one of sel.split(',')) rules.push({ sel: one.trim().replace(/\s+/g, ' '), decls, order: order++ });
  }
}

/** Attribute qualifiers like [data-tier="good"] on a compound selector. */
const attrsOf = (s) => [...s.matchAll(/\[data-(tier|conf)="(\w+)"\]/g)].map((m) => [m[1], m[2]]);

/** The winning declaration of `prop` for the pill in sheet context `ctx`. */
const pillDecl = (prop, ctx) => {
  let best = null;
  for (const r of rules) {
    const m = /^(\.sheet(?:\[data-(?:tier|conf)="\w+"\])*) \.pill\.solid$|^(\.pill\.solid)$/.exec(r.sel);
    if (!m || r.decls[prop] === undefined) continue;
    const attrs = m[1] ? attrsOf(m[1]) : [];
    if (!attrs.every(([k, v]) => ctx[k] === v)) continue;
    const spec = (m[1] ? 1 : 0) + attrs.length + 2;
    if (!best || spec > best.spec || (spec === best.spec && r.order > best.order)) best = { spec, order: r.order, value: r.decls[prop] };
  }
  assert.ok(best, `no .pill.solid rule sets ${prop} for ${JSON.stringify(ctx)}`);
  return best.value;
};

/** The sheet's own ground for a confidence state (rule `.sheet[data-conf="x"]`). */
const panelDecl = (conf) => {
  const r = rules.find((x) => x.sel === `.sheet[data-conf="${conf}"]` && x.decls.background !== undefined);
  assert.ok(r, `camera.css has no .sheet[data-conf="${conf}"] background`);
  return r.decls.background;
};

/* -------------------------------------------------------------------- test */

const TIERS = ['good', 'fair', 'walk_away', 'unknown'];
/** certain/sure are the solid panels, thin the hollow one; refuses and reading are the sheets
    that carry only the unknown tier. */
const CONFS = [
  ['certain', TIERS],
  ['sure', TIERS],
  ['thin', TIERS],
  ['refuses', ['unknown']],
  ['reading', ['unknown']],
];
const THEMES = [['dark', DARK], ['light', LIGHT]];

const cases = [];
for (const [theme, T] of THEMES) {
  for (const [conf, tiers] of CONFS) {
    for (const tier of tiers) {
      const env = { ...T, ...TIER_BIND[tier] };
      const ctx = { tier, conf };
      const panel = resolve(panelDecl(conf), env);
      const fill = resolve(pillDecl('background', ctx), env);
      const label = resolve(pillDecl('color', ctx), env);
      cases.push({
        id: `${theme} ${conf} ${tier}`,
        panel, fill, label,
        fillOnPanel: ratio(fill, panel),
        labelOnFill: ratio(label, fill),
      });
    }
  }
}

test('D-234: the Save pill is at least 3:1 against its panel on every tier, confidence and theme', () => {
  const red = cases.filter((c) => c.fillOnPanel < 3);
  assert.deepEqual(
    red.map((c) => `${c.id}: fill ${c.fill} on panel ${c.panel} is ${c.fillOnPanel.toFixed(2)}`),
    [],
  );
});

test('D-234: the Save pill label is at least 4.5:1 against its fill on every tier, confidence and theme', () => {
  const red = cases.filter((c) => c.labelOnFill < 4.5);
  assert.deepEqual(
    red.map((c) => `${c.id}: label ${c.label} on fill ${c.fill} is ${c.labelOnFill.toFixed(2)}`),
    [],
  );
});

test('D-234: the check can go red (a near-black pill on a dark green tint is under 3:1)', () => {
  const panel = mix(DARK['--good'], DARK['--ground'], 0.12);
  assert.ok(ratio(DARK['--good-on'], panel) < 3, 'the old good-on-tint pairing must measure under 3:1');
  assert.ok(cases.length >= 2 * (3 * 4 + 2), 'the matrix lost cases');
});

test('D-234: worst measured case (informational)', () => {
  const w = [...cases].sort((a, b) => a.fillOnPanel - b.fillOnPanel)[0];
  const l = [...cases].sort((a, b) => a.labelOnFill - b.labelOnFill)[0];
  console.log(`worst fill/panel ${w.id} ${w.fillOnPanel.toFixed(2)}; worst label/fill ${l.id} ${l.labelOnFill.toFixed(2)}`);
});
