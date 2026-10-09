/**
 * Shared helpers for the ux build 6 tests (ux-b6-*.test.mjs). Not a test file.
 *
 * Spec: docs/design/ux-evidence-2026-10-09.md, section 13, build 6.
 *
 * What is here:
 *   - the browser stand-in (mini-dom) installed BEFORE camera.js loads, as
 *     answer-consistency.test.mjs does it;
 *   - fixture verdicts (`FX`) built from test/verdict-fixtures.mjs, with
 *     high / medium / low confidence, with and without a shopper price, with
 *     sale dots and with a price far outside the band;
 *   - markup helpers: the three detents of a sheet, plain text with the bubble
 *     and the SVG taken out, a balanced-element reader;
 *   - a small CSS reader (rules by class, declared values, token lookup,
 *     font shorthand) so a test can say "the stroke is 2 px" about the stylesheet
 *     that ships, not about a copy of its numbers;
 *   - `roundEstimateCents`, the ORACLE for R-42's rounding rule (nearest 5 cents
 *     under $10, nearest 10 cents from $10 to $100, nearest dollar above $100),
 *     written from the spec's sentence and nowhere else;
 *   - `contrast` helpers over tokens.css, copied from tokens.test.mjs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from '../mini-dom.mjs';

export const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

export const cam = await import('../../public/js/screens/camera.js');
export const VC = await import('../../public/js/lib/verdict-chart.js');
export const store = await import('../../public/js/store.js');
export const { money } = await import('../../public/js/lib/money.js');
export const F = await import('../verdict-fixtures.mjs');

export const { distributionSheet } = cam;
export const Z90 = VC.Z90;

/* ------------------------------------------------------------- fixtures */

const p10 = (centre, s) => Math.round(Math.exp(Math.log(centre) - Z90 * s));
const p90 = (centre, s) => Math.round(Math.exp(Math.log(centre) + Z90 * s));

/** A shopper block as the server would send it: zone and offByPct from the EXACT centre. */
export function shopperBlock(cents, v, extra = {}) {
  const pct = ((cents - v.centreCents) / v.centreCents) * 100;
  const t = v.thresholds;
  const zone = pct <= -t.greatPct ? 'great' : pct <= -t.goodPct ? 'good' : pct >= t.badPct ? 'bad' : 'reasonable';
  return { cents, zone, offByPct: Math.round(pct * 10) / 10, beyond: null, suspect: null, ...extra };
}

export const dot = (cents, store_, quantity, seenOn = '2026-10-06', kind = 'regular', city = null) => ({ cents, store: store_, city, seenOn, kind, quantity });

/** Any verdict with its own centre and spread, p10/p90 worked out the way the contract says. */
export function verdictWith(over = {}) {
  const centreCents = over.centreCents ?? 599;
  const sigmaLog = over.sigmaLog ?? 0.18;
  const v = {
    ...F.GOOD,
    centreCents,
    sigmaLog,
    p10Cents: p10(centreCents, sigmaLog),
    p90Cents: p90(centreCents, sigmaLog),
    shopper: null,
    ...over,
  };
  if (over.shopperCents !== undefined) {
    v.shopper = over.shopperCents === null ? null : shopperBlock(over.shopperCents, v, over.shopperExtra ?? {});
    delete v.shopperCents;
    delete v.shopperExtra;
  }
  return v;
}

const FOUR = [
  dot(549, 'Save-On-Foods', '1 kg', '2026-10-06'),
  dot(599, 'Walmart', '1 kg', '2026-10-04'),
  dot(649, 'Metro', '1 kg', '2026-10-02'),
  dot(679, 'Sobeys', '1 kg', '2026-09-30'),
];

export const FX = {
  /** High confidence, shopper price in the "good" zone (469 vs a 599 centre). */
  HIGH: verdictWith({ confidence: 'high', n: 4, dots: FOUR, shopperCents: 469 }),
  MEDIUM: verdictWith({ confidence: 'medium', n: 2, dots: FOUR.slice(0, 2), basis: 'leaf_category', shopperCents: 469 }),
  /** Low: one price blended with its category, the spec's own example reason. */
  LOW: verdictWith({ confidence: 'low', n: 1, basis: 'own_prices', centreCents: 1299, sigmaLog: 0.42, dots: [dot(1249, 'No Frills', '500 g')], shopperCents: 1599 }),
  /** Same bell, no shelf price: the going-rate card. Four sellers. */
  NO_PRICE: verdictWith({ confidence: 'high', n: 4, dots: FOUR, shopper: null }),
  /** A sale dot among regular ones, inside the band so it cannot move the axis. */
  SALE: verdictWith({
    centreCents: 1149, sigmaLog: 0.22, confidence: 'medium', n: 2, basis: 'leaf_category',
    dots: [dot(1199, 'BC Liquor', '750 ml', '2026-10-05'), dot(999, 'BC Liquor', '750 ml', '2026-10-01', 'sale'), dot(1049, 'NB Liquor', '750 ml', '2026-09-28')],
    shopperCents: 1099,
  }),
  /** A shelf price well outside the band: pinned at the edge, 3x the typical price. */
  OUTSIDE: verdictWith({ confidence: 'high', n: 4, dots: FOUR, shopperCents: 1799, shopperExtra: { beyond: 'high' } }),
  /** A shelf price within 15% of the typical price: the mark must still be drawn. */
  NEAR: verdictWith({ confidence: 'high', n: 4, dots: FOUR, shopperCents: 580 }),
};

/** Every fixture a "for all verdicts" test walks. */
export const ALL = Object.entries(FX);

export const NAME = 'Peanut Butter 1 kg';

export function render(v, opts = {}) {
  return distributionSheet(v, { name: NAME, ...opts });
}

/* ---------------------------------------------------------- the oracle */

/** R-42: nearest 5 cents under $10, nearest 10 cents from $10 to $100, nearest dollar above $100. */
export function roundEstimateCents(c) {
  if (!(c > 0)) throw new Error(`roundEstimateCents(${c}): not a positive amount`);
  if (c < 1000) return Math.round(c / 5) * 5;
  if (c < 10000) return Math.round(c / 10) * 10;
  return Math.round(c / 100) * 100;
}

/** "$4.35" the way the shipped formatter writes it. */
export const usd = (cents) => money(cents, 'CAD');

/** A regex for a price, tolerating a whole-dollar form above $100 ("$123" or "$123.00"). */
export function priceRe(cents) {
  if (cents >= 10000 && cents % 100 === 0) return new RegExp(`\\$${(cents / 100).toLocaleString('en-CA')}(?:\\.00)?(?![\\d,])`);
  return new RegExp(usd(cents).replace(/[$.]/g, '\\$&') + '(?![\\d])');
}

/* ---------------------------------------------------------- markup helpers */

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unent = (s) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENT[m]);

/** The three detents of a sheet's markup. */
export function parts(html) {
  const a = html.indexOf('<div class="sheet-peek">');
  const b = html.indexOf('<div class="sheet-half">');
  const c = html.indexOf('<div class="sheet-full">');
  if (a < 0 || b < 0 || c < 0 || !(a < b && b < c)) throw new Error('parts(): the sheet has no peek, half and full in that order');
  return { peek: html.slice(a, b), half: html.slice(b, c), full: html.slice(c) };
}

/** Plain text of a fragment: tags gone, SVG gone, entities decoded, spaces collapsed. */
export function plain(fragment) {
  return unent(
    fragment
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

/**
 * The peek as reading order: the face's speech bubble is taken out (it is
 * Pexi's line, not a layout element), the whole bell becomes the token BELL,
 * everything else is its text.
 */
export function peekFlow(html) {
  const { peek } = parts(html);
  const noBubble = peek.replace(/<p class="bubble-text">[\s\S]*?<\/p>/g, ' ');
  const bell = noBubble.replace(/<figure class="vbell"[\s\S]*?<\/figure>/, ' BELL ');
  return plain(bell);
}

/** The element that opens at `openIdx` of `html`, whole, tags balanced on the same tag name. */
export function elementAt(html, openIdx) {
  const m = /^<([a-zA-Z][\w-]*)/.exec(html.slice(openIdx));
  if (!m) throw new Error('elementAt(): no tag at that index');
  const tag = m[1];
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'g');
  re.lastIndex = openIdx;
  let depth = 0;
  for (let x = re.exec(html); x; x = re.exec(html)) {
    if (x[2] === '/') {
      if (x.index === openIdx) return html.slice(openIdx, re.lastIndex);
      continue;
    }
    depth += x[1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(openIdx, re.lastIndex);
  }
  throw new Error(`elementAt(): <${tag}> at ${openIdx} never closes`);
}

/** Every element whose opening tag matches `openRe` (a RegExp WITHOUT the g flag), whole. */
export function elementsMatching(html, openRe) {
  const re = new RegExp(openRe.source, 'g');
  const out = [];
  for (let m = re.exec(html); m; m = re.exec(html)) out.push({ index: m.index, open: m[0], html: elementAt(html, m.index) });
  return out;
}

/** Attribute value off an opening tag string, or null. */
export const attr = (open, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(open);
  return m ? unent(m[1]) : null;
};

/** The SVG of the bell, whole. */
export function svgOf(html) {
  const f = /<figure class="vbell"[\s\S]*?<\/figure>/.exec(html);
  if (!f) throw new Error('svgOf(): the sheet has no bell <figure class="vbell">');
  const m = /<svg[\s\S]*?<\/svg>/.exec(f[0]);
  if (!m) throw new Error('svgOf(): the bell has no <svg>');
  return m[0];
}

/** The viewBox size of the bell: [width, height]. */
export function viewBox(html) {
  const m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svgOf(html));
  if (!m) throw new Error('viewBox(): the bell has no "0 0 W H" viewBox');
  return [Number(m[1]), Number(m[2])];
}

/** Text elements inside the bell: [{ cls, text, open }]. */
export function svgTexts(html) {
  return [...svgOf(html).matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map((m) => ({
    open: m[0].slice(0, m[0].indexOf('>') + 1),
    cls: attr(`<text${m[1]}>`, 'class') ?? '',
    text: unent(m[2].replace(/<[^>]+>/g, '')),
  }));
}

/* ------------------------------------------------------------ the CSS we ship */

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
export const CSS_FILES = {
  tokens: read('../../public/css/tokens.css'),
  camera: read('../../public/css/screens/camera.css'),
  components: read('../../public/css/components.css'),
  shell: read('../../public/css/shell.css'),
  share: read('../../public/css/screens/share.css'),
};

/** Flat list of { sel, body, media } for every style rule outside @keyframes. Not a CSS parser: it reads these files. */
export function parseRules(src) {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let i = 0;
  let prelude = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      const p = prelude.trim();
      if (p.startsWith('@')) {
        if (/^@(keyframes|font-face)/.test(p)) {
          let depth = 1;
          i += 1;
          while (i < text.length && depth > 0) {
            if (text[i] === '{') depth += 1;
            else if (text[i] === '}') depth -= 1;
            i += 1;
          }
          prelude = '';
          continue;
        }
        stack.push(p);
        prelude = '';
        i += 1;
        continue;
      }
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') depth -= 1;
        j += 1;
      }
      rules.push({ sel: p, body: text.slice(i + 1, j - 1), media: stack.join(' ') });
      i = j;
      prelude = '';
      continue;
    }
    if (ch === '}') {
      stack.pop();
      prelude = '';
      i += 1;
      continue;
    }
    prelude += ch;
    i += 1;
  }
  return rules;
}

const ALL_RULES = Object.values(CSS_FILES).flatMap(parseRules);

/** Declarations of one rule body, last wins. */
export function decls(body) {
  const out = {};
  let depth = 0;
  let cur = '';
  const flush = () => {
    const k = cur.indexOf(':');
    if (k > 0) out[cur.slice(0, k).trim()] = cur.slice(k + 1).trim();
    cur = '';
  };
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ';' && depth === 0) flush();
    else cur += ch;
  }
  flush();
  return out;
}

/**
 * The declared value of `prop` for the class `cls` outside any @media, from the
 * LAST rule (file order, tokens then camera then the rest as loaded here) whose
 * selector list has a part ending in `.cls` with no pseudo-class or attribute
 * after it. null when nothing declares it.
 */
export function declared(cls, prop) {
  const tail = new RegExp(`(?:^|[\\s>+~])(?:[a-z0-9]+)?\\.${cls}$`);
  let val = null;
  for (const r of ALL_RULES) {
    if (r.media) continue;
    if (!r.sel.split(',').some((part) => tail.test(part.trim()))) continue;
    const d = decls(r.body);
    if (d[prop] !== undefined) val = d[prop];
    if (prop === 'font-size' && d.font) val = fontOf(d.font).size !== null ? `${fontOf(d.font).size}px` : val;
    if (prop === 'font-weight' && d.font) val = fontOf(d.font).weight !== null ? String(fontOf(d.font).weight) : val;
  }
  return val;
}

/** `font: 700 13px var(--f-ui)` => { weight: 700, size: 13 }. */
export function fontOf(shorthand) {
  const w = /(?:^|\s)([1-9]00|bold|normal)\b/.exec(shorthand);
  const s = /(\d+(?:\.\d+)?)px/.exec(shorthand);
  return { weight: w ? (w[1] === 'bold' ? 700 : w[1] === 'normal' ? 400 : Number(w[1])) : null, size: s ? Number(s[1]) : null };
}

/** Root-level custom properties of tokens.css (dark theme / default). */
export function rootTokens(selector = ':root {') {
  const start = CSS_FILES.tokens.indexOf(selector);
  if (start < 0) throw new Error(`tokens.css has no ${selector}`);
  const open = CSS_FILES.tokens.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < CSS_FILES.tokens.length; i += 1) {
    if (CSS_FILES.tokens[i] === '{') depth += 1;
    else if (CSS_FILES.tokens[i] === '}' && --depth === 0) break;
  }
  const out = {};
  for (const [, name, value] of CSS_FILES.tokens.slice(open + 1, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

/** A px size from a value that may be a `var(--token)` of tokens.css, or null. */
export function px(value) {
  if (value == null) return null;
  const v = /var\((--[\w-]+)\)/.exec(value);
  const raw = v ? rootTokens()[v[1]] : value;
  const m = /^(\d+(?:\.\d+)?)px$/.exec(String(raw ?? '').trim());
  return m ? Number(m[1]) : null;
}

/* ------------------------------------------------------------- the rendering scale */

/** The phone the spec names for the chart minimums: 360 px wide. */
export const SCREEN_W = 360;

/** Horizontal padding of `.sheet` in px, read from camera.css (`padding: 12px 20px ...`). */
export function sheetPadX() {
  const rule = ALL_RULES.filter((r) => !r.media && r.sel.split(',').some((p) => p.trim() === '.sheet')).map((r) => decls(r.body).padding).filter(Boolean).pop();
  const parts_ = (rule ?? '').split(/\s+/);
  const x = parts_.length === 1 ? parts_[0] : parts_[1];
  const n = /^(\d+(?:\.\d+)?)px$/.exec(x ?? '');
  if (!n) throw new Error(`sheetPadX(): cannot read the sheet padding from "${rule}"`);
  return Number(n[1]);
}

/** How many screen px one viewBox unit is, on a 360 px phone, for this sheet's bell. */
export function chartScale(html) {
  const [vbW] = viewBox(html);
  return (SCREEN_W - 2 * sheetPadX()) / vbW;
}

/* ----------------------------------------------------------------- contrast */

const srgb = (hex) => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const luminance = (hex) => {
  const [r, g, b] = srgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const toHex = (parts_) => '#' + parts_.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, p) => {
  const A = srgb(a);
  const B = srgb(b);
  return toHex(A.map((c, i) => c * p + B[i] * (1 - p)));
};

export const THEMES = (() => {
  const dark = rootTokens(':root {');
  const light = { ...dark, ...rootTokens(':root[data-theme="light"]') };
  return [['dark', dark], ['light', light]];
})();
export const TIER_IDS = ['good', 'fair', 'walk'];

/** Pull every number and zone out of a stat so a failed message can show the actual. */
export const fmtList = (xs) => xs.map((x) => (typeof x === 'number' ? x.toFixed(2) : String(x))).join(', ');

/** Run `fn` with the clock pinned (Date.now and `new Date()`), then restore it. */
export function withNow(iso, fn) {
  const Real = Date;
  const t = new Real(iso).getTime();
  class Fake extends Real {
    constructor(...a) {
      if (a.length === 0) super(t);
      else super(...a);
    }

    static now() {
      return t;
    }
  }
  globalThis.Date = Fake;
  try {
    return fn();
  } finally {
    globalThis.Date = Real;
  }
}
