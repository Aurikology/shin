/**
 * The share card.
 *
 * The frame is 4:5, not 9:16. It is a card people post, and 4:5 is the tallest
 * shape that survives a feed crop on every platform at once, so one export
 * covers all of them.
 *
 * Wordle's counterintuitive detail is kept exactly. Josh Wardle left the link
 * out because a link generated a preview that read as spam, and the grid spread
 * further with no attribution than it would have with one. So the frame carries
 * Shin's face, the verdict word, both prices and the item, with the wordmark
 * small in the corner. THERE IS NO LINK IN THE FRAME, and that absence is the
 * feature.
 *
 * HARD RULE: two prices, never the arithmetic between them. A difference shown
 * as an amount saved is a performance claim, and no savings figure here has been
 * measured against anything.
 *
 * The card is drawn on a canvas rather than in DOM, so what is on screen is the
 * exported PNG pixel for pixel rather than an approximation of it.
 *
 * WHY THIS FILE HAS COPIES OF THE TOKENS AT ALL. A canvas cannot cascade. Every
 * colour and every font has to arrive as a resolved literal, so this is the one
 * file in the app where a token value is written down twice, and therefore the
 * one file where the two copies can disagree. They did: `--ink-faint` moved on
 * 2026-09-05 for failing contrast at 4.31 and the fallback here stayed on the
 * abandoned #6E7783, and `--walk` and `--unknown` moved on 2026-09-06 and would
 * have done the same. See the loudness rule on `reader()` below and
 * `test/share-tokens.test.mjs`, which is what actually holds the two in step.
 */

import { faceSvg, confidenceOf, tierOf, sellerOf, SIZE_TOKENS } from '../shin.js';
import { money } from '../lib/money.js';
import { wordFor, say } from '../voice.js';
import { on } from '../lib/dom.js';
import { t } from '../ui-strings.js';
import { answerOf, answerLook, answerWord, answerLine } from '../lib/history-answer.js';

const W = 1080;
const H = 1350;

/*
 * The colour tokens the card needs, per theme, exactly as `public/css/tokens.css`
 * defines them. `dark` is the `:root` block; `light` is `:root[data-theme="light"]`
 * layered over it, so a token light theme does not re-declare -- `--brand`, and
 * every `-on` colour -- carries the dark value here the same way it does in the
 * cascade. tokens.css is the source and this table is the copy; when they differ
 * the test fails and the table is what gets fixed.
 */
const TOKENS = {
  '--ground':     { dark: '#0B0C0E', light: '#F3F1EC' },
  '--surface':    { dark: '#16181C', light: '#FFFFFF' },
  '--hairline':   { dark: '#2E333A', light: '#E2DDD5' },
  '--ink':        { dark: '#F7F5F2', light: '#14161A' },
  '--ink-muted':  { dark: '#A5ADB8', light: '#5E6570' },
  '--ink-faint':  { dark: '#848D99', light: '#606771' },
  '--brand':      { dark: '#E5165E', light: '#E5165E' },
  '--good':       { dark: '#12B76A', light: '#109F5C' },
  '--fair':       { dark: '#E8A020', light: '#BA801A' },
  '--walk':       { dark: '#C23619', light: '#C23619' },
  '--unknown':    { dark: '#5E6770', light: '#5E6770' },
  '--good-on':    { dark: '#04140C', light: '#04140C' },
  '--fair-on':    { dark: '#1A1204', light: '#1A1204' },
  '--walk-on':    { dark: '#FFFFFF', light: '#FFFFFF' },
  '--unknown-on': { dark: '#F7F5F2', light: '#F7F5F2' },
  /*
   * The bright variants, added for the price figure in the ELSEWHERE column
   * (see `col()` below). `--tier` is a FIELD colour -- it is what the verdict
   * band is filled with, and text drawn on it uses `--tier-on`. It was also
   * being used as the price figure's own colour, text sitting directly on
   * `--surface`, which is a different pairing tokens.css never measured this
   * one against, and checking only one theme missed half of it: DARK fails on
   * walk and unknown (walk #C23619 on dark --surface is 3.25, unknown #5E6770
   * is 3.09), LIGHT fails on good and fair instead (good #109F5C on light
   * --surface, which is white, is 3.42, fair #BA801A is 3.39) -- all four
   * under the 4.5 text under 24px needs, and the card's long-price path
   * (`SIZE.priceLong`, 56px canvas / 2.77 scale = 20px) is under 24px.
   * camera.css already has the fix for the same shape of problem: the
   * thin/refuses sheet states draw their tier-hued text in `--tier-bright`,
   * never `--tier`, because `--tier-bright` is the variant tokens.test.mjs
   * holds to the 4.5 floor. Same fix here, applied to all four tiers rather
   * than only the two that failed in one theme, since the pairing is wrong in
   * both, just for different tiers: dark walk-bright 6.26, dark unknown-
   * bright 6.66, light good-bright 7.55, light fair-bright 7.65.
   */
  '--good-bright':    { dark: '#38E08B', light: '#0A6138' },
  '--fair-bright':    { dark: '#FFC24D', light: '#6F4D0F' },
  '--walk-bright':    { dark: '#FF6A45', light: '#9A2B14' },
  '--unknown-bright': { dark: '#93A0AC', light: '#4C535A' },
};

/*
 * The type tokens, same deal. These live only in the `:root` block -- neither
 * light block re-declares one -- so they have a single value rather than a pair,
 * and the test checks them against `:root` alone.
 *
 * `--t-price-size` has a second value under `@media (max-width: 379px)`, which
 * is why no size except the label's is read from a token here: the card is a
 * fixed 1080px artboard and must not change with the phone it was made on.
 */
const TYPE = {
  '--f-display': '"Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif',
  '--f-ui': '"Instrument Sans", "Helvetica Neue", Arial, sans-serif',
  '--f-mono': '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
  '--t-price-weight': '800',
  '--t-price-track': '-.03em',
  '--t-verdict-weight': '800',
  '--t-verdict-track': '-.02em',
  '--t-body-weight': '400',
  '--t-body-leading': '1.45',
  '--t-row-weight': '600',
  '--t-label-size': '11px',
  '--t-label-weight': '600',
  '--t-label-track': '.12em',
};

/**
 * Development, for the purposes of "fail loudly rather than draw the wrong
 * colour". Deliberately host-based rather than a flag: a flag would have to be
 * remembered, and the whole class of bug this guards against is the one nobody
 * remembered to check.
 */
const DEV =
  typeof location !== 'undefined' &&
  (/^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname) ||
    location.hostname.endsWith('.local') ||
    location.protocol === 'file:');

class MissingTokenError extends Error {
  constructor(name) {
    super(`${name} did not resolve from the live stylesheet`);
    this.name = 'MissingTokenError';
  }
}

/** dark or light, resolved the way the cascade resolves it. */
function themeNow() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * One reader for every token the card draws with.
 *
 * The old shape was `pick('--x', '#hex')` with the hex inline at the call site,
 * which is how the stale `--ink-faint` survived a day: a wrong fallback is
 * invisible, because the computed value is almost always present and so the
 * wrong branch is almost never taken. This inverts that. In development a token
 * that does not resolve THROWS, drawCard's caller catches it, and the card
 * visibly becomes the text version with a line naming the token. In production
 * it still falls back rather than showing a user nothing -- but it logs, and the
 * literal it falls back to is the one the test keeps current.
 *
 * A share card is the one artefact that leaves the app and gets screenshotted.
 * It drifting is worse than it failing.
 */
function reader() {
  const cs = getComputedStyle(document.documentElement);
  const theme = themeNow();
  return function read(name) {
    const live = (cs.getPropertyValue(name) || '').trim();
    if (live) return live;
    const table = TOKENS[name];
    const stale = table ? table[theme] : TYPE[name];
    // No literal at all is a programming error in this file, in either mode.
    if (stale === undefined) throw new MissingTokenError(name);
    if (DEV) throw new MissingTokenError(name);
    console.error(`share card: ${name} did not resolve; drawing the ${theme} literal ${stale}`);
    return stale;
  };
}

/** Read the live theme, so the card matches the app the user is looking at. */
function palette(read, tierId) {
  const tierVar = { good: '--good', fair: '--fair', walk_away: '--walk' }[tierId] ?? '--unknown';
  return {
    ground: read('--ground'),
    surface: read('--surface'),
    hairline: read('--hairline'),
    ink: read('--ink'),
    muted: read('--ink-muted'),
    faint: read('--ink-faint'),
    brand: read('--brand'),
    tier: read(tierVar),
    tierOn: read(`${tierVar}-on`),
    // Text ON --surface, not a field fill -- see the block comment on the
    // TOKENS table above.
    tierBright: read(`${tierVar}-bright`),
  };
}

/*
 * The card's type, reconciled against DESIGN.md section 2.
 *
 * WHAT THE CARD TAKES FROM THE SPEC AND WHAT IT KEEPS. The spec's table gives
 * each role a family, a weight and a tracking together, because that triple is
 * what makes a price hero a price hero. The canvas took none of it: it declared
 * its own three font builders re-listing families already in tokens.css, set no
 * tracking anywhere at all, spaced the label role at 5px on 22px (.227em)
 * against the spec's .12em, and drew the item name in Bricolage, which section 2
 * reserves for "the price numeral and the verdict word. Nothing else."
 *
 * So every triple below is now read from the `--t-*` role tokens. The SIZES are
 * still the card's own, and that is a decision rather than an omission. The
 * app's hierarchy puts the price hero on top because the user is standing in a
 * shop looking at a tag; the card's hierarchy puts the verdict word on top
 * because it is a post. And the card carries TWO prices side by side in one box
 * where the viewfinder carries one alone -- the spec's 72px hero at this
 * artboard's scale is 199px, and no realistic price fits a 422px column at that
 * size. Sizes are named constants below rather than numbers inline, so the next
 * person can see there is a ramp and what it is.
 *
 * The one size that IS taken from the spec is the label, because a label has a
 * floor rather than a hierarchy: 11px, at the artboard's scale.
 *
 * DESIGN.md's other rule that lands here: two prices, never the arithmetic
 * between them. Nothing below computes a saving and nothing may.
 */
const CARD_SCALE = W / 390; // the artboard measured against a phone's own width, 2.77

function typeset(read) {
  const em = (name, size) => `${(parseFloat(read(name)) || 0) * size}px`;
  return {
    display: read('--f-display'),
    ui: read('--f-ui'),
    mono: read('--f-mono'),

    priceWeight: read('--t-price-weight'),
    priceTrack: (size) => em('--t-price-track', size),
    verdictWeight: read('--t-verdict-weight'),
    verdictTrack: (size) => em('--t-verdict-track', size),
    bodyWeight: read('--t-body-weight'),
    bodyLeading: parseFloat(read('--t-body-leading')) || 1.45,
    rowWeight: read('--t-row-weight'),
    labelSize: Math.round((parseFloat(read('--t-label-size')) || 11) * CARD_SCALE), // 11 -> 30
    labelWeight: read('--t-label-weight'),
    labelTrack: (size) => em('--t-label-track', size),
  };
}

/* The card's own ramp. Not the spec's -- see the block comment above. */
const SIZE = {
  verdict: 108,   // the largest text on the card, because the card is a post
  line: 38,       // Shin's own sentence, the part people quote
  item: 46,       // the product name
  price: 76,      // both price columns; the short size below when the figure is long
  priceLong: 56,
  wordmark: 42,
};
/*
 * The seller, and the range, under each price. NOT a constant: it is the label
 * size, because the label is this card's floor. It was 24px, which at the size
 * a feed shows a 1080px card is 8.7 CSS px -- smaller than the 11px label, which
 * is the smallest thing DESIGN.md section 2 defines anywhere, and smaller than
 * the kicker directly above it, which inverted the two. Body at the artboard's
 * scale would be 44px and would fight the price beside it, so the sub sits on
 * the floor rather than at its role's own size.
 */
const subSize = (f) => f.labelSize;

/**
 * Shin's face as a bitmap.
 *
 * faceSvg paints with whatever colour it is handed, so it is handed a literal
 * here: CSS custom properties do not resolve inside an <img> and would come out
 * black on black. The xmlns it already carries is the other half of this, and it
 * is why the face has eyebrows on the exported card.
 */
function faceImage(expression, size, ink, who) {
  const svg = faceSvg(expression, { size, ink, who });
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Canvas tracking is a context property rather than part of the font shorthand,
 * and it is not supported everywhere. Every call site goes through here so that
 * none of them has to carry its own copy of the guard, and none of them can
 * forget to put the value back.
 */
function track(g, value) {
  if ('letterSpacing' in g) g.letterSpacing = value;
}

function wrap(g, text, maxWidth, maxLines) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (g.measureText(last).width > maxWidth) {
      let cut = last;
      while (cut.length > 1 && g.measureText(`${cut}...`).width > maxWidth) cut = cut.slice(0, -1);
      lines[maxLines - 1] = `${cut}...`;
    }
  }
  return lines;
}

async function drawCard(canvas, card) {
  const read = reader();
  const pal = palette(read, card.tierId);
  const f = typeset(read);
  const g = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;

  const pad = 88;
  const mid = W / 2;

  g.fillStyle = pal.ground;
  g.fillRect(0, 0, W, H);

  // The tier band. Solid when Shin is sure, hollow when the evidence is thin:
  // the same rule the sheet follows, so a screenshot and the app agree.
  const solid = card.level === 'certain' || card.level === 'sure';
  if (solid) {
    g.fillStyle = pal.tier;
    g.fillRect(0, 0, W, 760);
  } else {
    g.strokeStyle = pal.tier;
    g.lineWidth = 6;
    g.setLineDash(card.level === 'refuses' ? [22, 16] : []);
    g.strokeRect(3, 3, W - 6, 757);
    g.setLineDash([]);
  }
  const onBand = solid ? pal.tierOn : pal.tier;

  g.textAlign = 'center';

  // The face, which is the token the card exists to carry. AVATAR.md row 49:
  // face-share, 220px, the one size token above face-verdict.
  const faceSize = SIZE_TOKENS['face-share'];
  const img = await faceImage(card.expression, faceSize, onBand, card.who);
  if (img) g.drawImage(img, mid - faceSize / 2, 108, faceSize, faceSize);

  // The verdict word, the largest text on the card. Verdict role: display, 800,
  // -.02em, sentence case -- `wordFor` returns it already cased and nothing
  // here shouts it.
  g.fillStyle = onBand;
  g.font = `${f.verdictWeight} ${SIZE.verdict}px ${f.display}`;
  track(g, f.verdictTrack(SIZE.verdict));
  g.fillText(card.word, mid, 520);
  track(g, '0px');

  // Shin's own sentence, which is the part people quote. Body role: UI face,
  // 400, 1.45 leading, and section 2's two lines maximum.
  g.font = `${f.bodyWeight} ${SIZE.line}px ${f.ui}`;
  const lineStep = Math.round(SIZE.line * f.bodyLeading);
  wrap(g, card.line, W - pad * 2, 2).forEach((l, i) => g.fillText(l, mid, 588 + i * lineStep));

  // The item. Row-title role -- UI face, 600. It was Bricolage 700, and section
  // 2 reserves Bricolage for the price numeral and the verdict word.
  g.fillStyle = pal.ink;
  g.font = `${f.rowWeight} ${SIZE.item}px ${f.ui}`;
  wrap(g, card.label, W - pad * 2, 2).forEach((l, i) => g.fillText(l, mid, 872 + i * 56));

  // The two prices, both of them, never the difference between them.
  const boxTop = 960;
  const boxH = 230;
  g.fillStyle = pal.surface;
  g.strokeStyle = pal.hairline;
  g.lineWidth = 2;
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(pad, boxTop, W - pad * 2, boxH, 26);
  else g.rect(pad, boxTop, W - pad * 2, boxH);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(mid, boxTop + 40);
  g.lineTo(mid, boxTop + boxH - 40);
  g.stroke();

  /*
   * A price column. The figure takes the price role's weight and tracking; the
   * kicker over it takes the label role, which is exactly what "ON THE TAG" is
   * -- mono, uppercase, provenance -- at 11px scaled to the artboard and .12em
   * rather than the flat 5px that was hard-coded here.
   *
   * NO TABULAR FIGURES, and this is the one surface in the product where that
   * is true. Canvas2D has no `fontVariantNumeric` and no way to reach a font
   * feature at all, so the rule cannot be applied. It costs nothing that
   * matters here -- tabular figures buy stability across a value that changes,
   * and a card is a still -- but the rule says "everywhere, always", so the one
   * exception is written down rather than left to be discovered.
   */
  const col = (x, kicker, value, sub, valueColor) => {
    g.fillStyle = pal.faint;
    g.font = `${f.labelWeight} ${f.labelSize}px ${f.mono}`;
    track(g, f.labelTrack(f.labelSize));
    g.fillText(kicker, x, boxTop + 66);
    track(g, '0px');

    const size = value.length > 7 ? SIZE.priceLong : SIZE.price;
    g.fillStyle = valueColor;
    g.font = `${f.priceWeight} ${size}px ${f.display}`;
    track(g, f.priceTrack(size));
    g.fillText(value, x, boxTop + 148);
    track(g, '0px');

    g.fillStyle = pal.muted;
    g.font = `${f.bodyWeight} ${subSize(f)}px ${f.ui}`;
    wrap(g, sub, mid - pad - 30, 1).forEach((l) => g.fillText(l, x, boxTop + 194));
  };
  col(W * 0.27, t('share_on_the_tag_caps'), card.askingText, card.askingSub, pal.ink);
  // pal.tierBright, not pal.tier: this text sits on --surface, not on the tier
  // field, and the field colour under-contrasts there. See the TOKENS
  // comment above.
  col(W * 0.73, t('share_elsewhere_caps'), card.elsewhereText, card.elsewhereSub, pal.tierBright);

  /*
   * How sure Shin was, on the card, because a screenshot outlives the screen.
   * Label role, like the two kickers above it.
   *
   * The baseline moved from +62 to +44 when the label role went from 24px to
   * the spec's 11px-at-artboard-scale, 30px. Measured on the canvas: at +62 the
   * taller glyphs left 11px between this line's descender and the date's cap
   * height below it, which is 4 CSS px at the size a feed shows the card and
   * reads as one crowded block. The box's bottom edge is at 1190 and the
   * wordmark's cap top at 1256; +44 puts the line's 21px ascent centred in that
   * 66px gap, 23 above and 22 below.
   */
  g.fillStyle = pal.faint;
  g.font = `${f.labelWeight} ${f.labelSize}px ${f.mono}`;
  track(g, f.labelTrack(f.labelSize));
  g.fillText(card.confidence, mid, boxTop + boxH + 44);
  track(g, '0px');

  // The wordmark, small, in the corner. No link, on purpose.
  g.textAlign = 'left';
  g.font = `${f.priceWeight} ${SIZE.wordmark}px ${f.display}`;
  g.fillStyle = pal.ink;
  g.fillText('shin', pad, H - 62);
  g.fillStyle = pal.brand;
  g.fillText('.', pad + g.measureText('shin').width, H - 62);

  // The date: the third of the card's three label-role strings. Provenance is
  // what section 2 reserves the mono face for, and a date is provenance.
  g.textAlign = 'right';
  g.fillStyle = pal.faint;
  g.font = `${f.labelWeight} ${f.labelSize}px ${f.mono}`;
  track(g, f.labelTrack(f.labelSize));
  g.fillText(card.stamp, W - pad, H - 66);
  track(g, '0px');
}

/** What the card would say if it had to be typed into a message box. */
function cardText(card) {
  return [
    `${t('share_shin_says')} ${card.word}.`,
    card.label,
    `${t('share_on_the_tag')} ${card.askingText}${card.askingSub ? ` (${card.askingSub})` : ''}`,
    `${t('share_elsewhere')} ${card.elsewhereText}${card.elsewhereSub ? ` (${card.elsewhereSub})` : ''}`,
    '',
    card.line,
  ].join('\n');
}

/** The card for a verdict-bell answer (D08): the zone word and the two prices the sheet showed. */
function answerCard(entry) {
  const a = answerOf(entry);
  const look = answerLook(a);
  const label = a.label || entry.query?.text || t('past_scans_unknown_item');
  const hasAsk = typeof a.askingCents === 'number';
  return {
    tierId: look.tier,
    expression: look.face,
    who: undefined,
    level: look.level,
    word: answerWord(a),
    line: answerLine(a),
    label,
    askingText: hasAsk ? money(a.askingCents, a.currency) : t('share_no_price_caps'),
    askingSub: '',
    elsewhereText: money(a.centreCents, a.currency),
    elsewhereSub: a.p10Cents === a.p90Cents
      ? t('share_one_price_one_seller')
      : t('share_range', { low: money(a.p10Cents, a.currency), high: money(a.p90Cents, a.currency) }),
    confidence: t(`share_conf_${a.confidence}`).toUpperCase(),
    stamp: new Date(entry.at ?? Date.now())
      .toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      .toUpperCase(),
  };
}

export default {
  id: 'share',
  title: 'Share',
  titleKey: 'share_title',

  render(root, ctx) {
    const entry = ctx.store.get().history.find(
      (h) => (h.result?.kind === 'verdict' && (!ctx.params.id || h.result.identity?.id === ctx.params.id))
        || (answerOf(h) && (!ctx.params.id || answerOf(h).id === ctx.params.id)),
    );
    if (!entry) {
      ctx.replace('camera');
      return;
    }

    const v = entry.result;
    const conf = answerOf(entry) ? null : confidenceOf(v);
    const tier = answerOf(entry) ? null : tierOf(v.tier);

    const card = answerOf(entry) ? answerCard(entry) : {
      tierId: v.tier,
      expression: tier.face,
      who: undefined,
      level: conf.level,
      word: wordFor(v.tier),
      line: say(v.tier, { asking: money(v.askingCents), usual: money(v.spread.medianCents) }),
      label: v.identity.label,
      askingText: money(v.askingCents),
      askingSub: sellerOf(v) ? `${t('share_at_seller', { seller: sellerOf(v) })}` : '',
      elsewhereText: money(v.spread.medianCents),
      elsewhereSub:
        v.spread.lowCents === v.spread.highCents
          ? t('share_one_price_one_seller')
          : t('share_range', { low: money(v.spread.lowCents), high: money(v.spread.highCents) }),
      confidence: conf.label.toUpperCase(),
      /* Uppercased so it sits in the label role beside the two price kickers
         and the confidence line, which is the role mono is reserved for. */
      stamp: new Date(entry.at ?? Date.now())
        .toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        .toUpperCase(),
    };

    root.innerHTML = `
      <div class="page page-share">
        <header class="page-head">
          <p class="kicker">${t('share_kicker')}</p>
          <h1>${t('share_post_it')}</h1>
        </header>

        <p class="fineprint">${t('share_no_link_why')}</p>

        <div class="shr-frame">
          <canvas class="shr-canvas"
                  role="img"
                  aria-label="${t('share_card_alt', { word: card.word, label: card.label, asking: card.askingText, elsewhere: card.elsewhereText })}"></canvas>
          <pre class="shr-fallback" hidden></pre>
        </div>

        <p class="shr-status" role="status"></p>
        <!-- page-foot has to be the LAST child, not this line. shell.css's
             own comment on page-foot says its no-overlap guarantee IS "the
             last child": sticky is still in flow, so the last item in flow
             clears it at the bottom of the scroll, and nothing does if
             something follows it. This line used to sit after the footer and
             sat under it, the same shape as the You screen's build-line bug
             shell.css's page-bar comment records. -->
        <div class="page-foot">
          <button type="button" class="cta" data-act="save">${t('share_save_image')}</button>
          <div class="shr-secondary">
            <button type="button" class="linky" data-act="copy">${t('share_copy_text')}</button>
            <button type="button" class="linky" data-act="back">${t('back_to_camera')}</button>
          </div>
        </div>
      </div>`;

    const canvas = root.querySelector('.shr-canvas');
    const fallback = root.querySelector('.shr-fallback');
    const status = root.querySelector('.shr-status');

    /*
     * One controller for everything this render owns: the click listener on the
     * persistent `#screen`, and the in-flight font-and-draw work that used to be
     * guarded by a separate `alive` flag returned as the cleanup. Two mechanisms
     * answering one question -- "is this render still the current one?" -- is
     * how one of them ends up not being checked, and the listener was the one
     * that never was: it attached to `#screen`, which the router never replaces,
     * so every visit to this screen left another live handler behind it.
     * camera.js:915 is the same fix, and its comment is the long version.
     */
    const listeners = new AbortController();
    const gone = () => listeners.signal.aborted;

    /* Drawing failed, so show the text version rather than a card that might be
       drawn in a palette the app no longer uses. `why` is only surfaced in
       development: in production the user gets the outcome and the console gets
       the reason. */
    function degrade(err, why) {
      console.error('card draw failed', err);
      canvas.hidden = true;
      fallback.hidden = false;
      fallback.textContent = cardText(card);
      if (DEV && err instanceof MissingTokenError) {
        status.textContent = `${why} ${err.message}`;
        return true;
      }
      return false;
    }

    (async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
        if (gone()) return;
        await drawCard(canvas, card);
      } catch (err) {
        if (gone()) return;
        degrade(err, t('share_card_failed'));
      }
    })();

    on(root, 'click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'back') { ctx.go('camera'); return; }

      if (act === 'copy') {
        try {
          await navigator.clipboard.writeText(cardText(card));
          if (gone()) return;
          ctx.store.update((s) => ({ ...s, shareCount: (s.shareCount ?? 0) + 1 }));
          status.textContent = t('share_copied');
        } catch {
          if (gone()) return;
          fallback.hidden = false;
          fallback.textContent = cardText(card);
          status.textContent = t('share_clipboard_blocked');
        }
        return;
      }

      if (act === 'save') {
        status.textContent = t('share_rendering');
        try {
          await drawCard(canvas, card);
          const blob = await new Promise((res, rej) => {
            canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob gave nothing'))), 'image/png');
          });
          if (gone()) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `shin-${card.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          ctx.store.update((s) => ({ ...s, shareCount: (s.shareCount ?? 0) + 1 }));
          status.textContent = t('share_saved_to_downloads');
        } catch (err) {
          if (gone()) return;
          const named = degrade(err, t('share_export_failed_text'));
          if (!named) status.textContent = t('share_export_failed');
        }
      }
    }, listeners.signal);

    return () => listeners.abort();
  },
};
