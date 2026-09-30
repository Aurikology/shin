/**
 * The price line: one horizontal line, three named zones, one large dot for
 * the thing in your hand and a small dot for every price found.
 *
 * The founder's picture of it, 2026-09-14: "the prices showing up as a
 * colored line with a large dot as the photographed items price and smaller
 * dots as all the sources prices", and then, separately: "there also needs to
 * be measures in place that label each dot on the graph with its actrual
 * quantity". Both halves are load-bearing. A dot with no quantity on it is a
 * comparison between a four-litre jug and a 355 mL can presented as if it
 * were a comparison between two prices, which is worse than showing nothing.
 *
 * THIS FILE NEVER SEES THE GEMINI WIRE. It takes plain numbers and plain
 * strings that `grounded.js` lifted across one for one. That is deliberate:
 * `grounded.js` is the only file allowed to read inside a Grounded Result,
 * and the way to keep that true is for the drawing code to be incapable of
 * reaching the source. Hand this function a shape it understands and it draws
 * it; it cannot ask where the numbers came from.
 *
 * POSITIONS ARE READ, NEVER COMPUTED. Every `position` here arrives from the
 * server and is placed as given. Working out on the client where a grounded
 * price sits relative to a median would be this app analysing a Grounded
 * Result, which the Gemini API terms forbid, and it would also be a second
 * implementation of arithmetic that already exists on the server and would
 * drift from it. The client's entire contribution is geometry and words:
 * where on the screen a given fraction lands, and what the zone is called.
 * `test/grounded-client.test.mjs` proves the direction of that dependency by
 * breaking a wire position and asserting the dot moves.
 *
 * THE ZONE WORDS NAME THE USER'S RANGE (superseded 2026-09-30: the verdict now speaks his
 * words, great / good / reasonable / bad, against the shopper's own thresholds).
 * That is the founder's ruling of 2026-09-14 and it is also the only shape
 * that survives hard rule 2: Competition Act s.74.01(1)(b) needs adequate and
 * proper testing behind a performance claim, and four test files in this repo
 * ban a grading word outside a real verdict. So the zones read "under your
 * line", "in the middle", "over your line". Those describe a boundary the
 * user set on the You page. They are not "good", "fair", "high", "a deal" or
 * "over the usual", and none of the French is "cher", "aubaine", "rabais" or
 * "au-dessus du prix". The words are in `ui-strings.js` so both languages sit
 * side by side where a reviewer can read them against the ban list.
 *
 * NEVER COLOUR ALONE. Each zone carries its word on the screen. A shopper
 * with a red-green deficiency, in a sunlit aisle, holding the phone at
 * arm's length, is the normal case for this app and not an edge one.
 *
 * SIZE, NOT COLOUR, IS WHAT MAKES THE BIG DOT BIG. Same reason. The scanned
 * item's dot is larger and carries its own label row; it is never merged into
 * a cluster and never has to compete for space with a store dot.
 */

import { t } from './ui-strings.js';

/**
 * The phone this is designed against. 390 px is the narrow case the repo
 * checks (the other is 375x575), and the label layout below is solved at that
 * width rather than at a desktop width and hoped for.
 */
export const DESIGN_WIDTH = 390;

/** Side padding the track sits inside, so an edge dot's label has somewhere to go. */
export const TRACK_INSET = 16;

/**
 * THE GAUGE SPEAKS IN 0 TO 100, THIS FILE DRAWS IN 0 TO 1.
 *
 * `identify/src/gauge.ts` puts the median at 50 and runs the line from 0 to
 * 100, because that is the shape the founder described and the shape Gemini's
 * sandbox returns. Everything below this line works in fractions, because CSS
 * does. Converting in exactly one named place is the point: the alternative is
 * a `/ 100` sprinkled through nine call sites, and the ninth one gets missed.
 *
 * This is NOT computing a position. The position is Gemini's; the only thing
 * happening here is a change of units, the same way `money()` turns cents into
 * dollars without deciding what the price is.
 *
 * Added 2026-09-14 after the two halves were built against two different
 * scales and a dot at the median would have drawn at fifty times the width of
 * the line.
 */
export function asFraction(position) {
  const n = typeof position === 'number' && Number.isFinite(position) ? position : null;
  if (n === null) return null;
  return n / 100;
}

/**
 * Approximate advance width of one character of the label font, in CSS pixels.
 *
 * A measured width needs a laid-out browser, and this app has no DOM in its
 * test run by decision. So the layout is solved against a conservative
 * constant instead: over-estimating a label's width can only ever push two
 * labels further apart, which is the safe direction to be wrong in. The test
 * uses this same constant, so "no two labels overlap" is a statement about
 * the thing the code actually did rather than about a second guess.
 */
export const CHAR_PX = 6.6;

/** Clear space demanded between two labels on the same side. */
export const MIN_GAP_PX = 8;

/** Two dots closer than this on screen are one marker, not two. */
export const MERGE_PX = 14;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A label's width on screen, from its text. See CHAR_PX for why it is a constant. */
export function labelWidth(text) {
  return String(text ?? '').length * CHAR_PX;
}

/**
 * The text of one marker's label.
 *
 * A single dot shows the wire's own `label`, which is the quantity-and-price
 * string the server built ("6 x 355 mL, $4.49"). A merged marker cannot show
 * three labels in one place, so it shows how many it stands for and opens on
 * a tap. Either way the quantity is never dropped: it is either on screen or
 * one tap away, and the tap is on Shin's own chart rather than on anything of
 * Google's.
 *
 * A price that needs a membership, or that a marketplace seller lists, still
 * counts in the middle and says so beside its quantity ("6 x 355 mL, $4.49 ·
 * members only"). The marks are codes off the wire, worded here in the
 * reader's language; nothing is worked out from them.
 */
const MARK_KEYS = { member_only: 'priceline_mark_members', marketplace: 'priceline_mark_marketplace' };

function pointText(point) {
  const marks = Array.isArray(point.marks) ? point.marks.filter((m) => m in MARK_KEYS) : [];
  return [String(point.label ?? ''), ...marks.map((m) => t(MARK_KEYS[m]))].join(' · ');
}

function markerLabel(group, points) {
  if (group.members.length === 1) return pointText(points[group.members[0]]);
  return t('priceline_merged', { n: String(group.members.length) });
}

/**
 * Where one marker's label box lands, in CSS pixels.
 *
 * Centred on the dot and NOT clamped to the viewport, because the CSS does
 * not clamp either: `.pl-label` is centred on its marker with a
 * `translateX(-50%)` and nothing pulls it back from an edge. A layout solved
 * against a clamp the browser does not apply is a layout that reports clean
 * and overlaps on the phone, which is exactly what the 390 px render pass
 * caught the first time this was written. The two have to agree.
 */
function boxOf(group, points, widthPx) {
  const inner = widthPx - TRACK_INSET * 2;
  const centre = TRACK_INSET + (asFraction(group.position) ?? 0) * inner;
  const w = labelWidth(markerLabel(group, points));
  const left = centre - w / 2;
  return { left, right: left + w };
}

/**
 * Where every store dot's label goes, at a given width, with nothing
 * overlapping anything.
 *
 * Exported and pure so the overlap promise is checkable without a browser.
 * The rule the test asserts is exactly the rule this function enforces: two
 * labels on the same side are never closer than MIN_GAP_PX.
 *
 * THE SORT HERE IS GEOMETRY, NOT A RE-RANKING. `grounded.js` is forbidden to
 * sort, because re-ordering the rows of a Grounded Result changes what the
 * reader is told the search found. This is a different act: the dots are
 * already drawn at the positions the wire gave, and walking them left to
 * right is the only way to know which two are adjacent on screen. No
 * position is changed and no row is reordered on the list above.
 *
 * Three steps, in order:
 *   1. Dots within MERGE_PX of each other become one marker. The merged
 *      marker sits at the position of its FIRST member, never at an average
 *      of them: an average is a position this client computed, and computed
 *      positions are the thing this file exists not to have.
 *   2. Markers alternate above and below the line, left to right.
 *   3. Any two markers that still collide on the same side are merged with
 *      the marker between them and the alternation is redone. This loop can
 *      only ever reduce the marker count, so it stops.
 */
export function layoutMarkers(points, widthPx = DESIGN_WIDTH) {
  const usable = [];
  for (let i = 0; i < points.length; i += 1) {
    if (num(points[i] && points[i].position) !== null) usable.push(i);
  }
  usable.sort((a, b) => points[a].position - points[b].position);

  let groups = [];
  const inner = widthPx - TRACK_INSET * 2;
  for (const i of usable) {
    const last = groups[groups.length - 1];
    if (last && (asFraction(points[i].position - last.position) ?? 0) * inner < MERGE_PX) {
      last.members.push(i);
    } else {
      groups.push({ position: points[i].position, members: [i] });
    }
  }

  for (let guard = 0; guard <= points.length + 2; guard += 1) {
    let clash = -1;
    for (let i = 0; i + 2 < groups.length; i += 1) {
      // i and i+2 are the neighbours that share a side under a strict
      // alternation, so they are the only pair that can collide.
      const a = boxOf(groups[i], points, widthPx);
      const b = boxOf(groups[i + 2], points, widthPx);
      if (a.right + MIN_GAP_PX > b.left) {
        clash = i;
        break;
      }
    }
    if (clash === -1) break;
    const merged = {
      position: groups[clash].position,
      members: groups[clash].members.concat(groups[clash + 1].members),
    };
    groups.splice(clash, 2, merged);
  }

  return groups.map((g, i) => ({
    position: g.position,
    members: g.members,
    side: i % 2 === 0 ? 'above' : 'below',
  }));
}

/**
 * The three zone names, from the server's neutral codes.
 *
 * The server sends `under_your_line` / `middle` / `over_your_line` and never a
 * word. That split is the whole safety mechanism: the code carries no
 * judgment, the word is written once per language in `ui-strings.js`, and a
 * reviewer checking hard rule 2 has one file to read instead of a grep across
 * a renderer.
 */
const ZONE_KEY = {
  under_your_line: 'priceline_zone_under',
  middle: 'priceline_zone_middle',
  over_your_line: 'priceline_zone_over',
};

function zoneWord(code) {
  const key = ZONE_KEY[code];
  return key ? t(key) : '';
}

/**
 * The sentence on the large dot, which is the one a shopper actually reads.
 *
 * "your price, 18% over the middle of 6 prices". It states where the user's
 * own line put it and how far from the middle of what was found; it does not
 * say the price is anything. `pct` arrives already worked out from the
 * server, same rule as every other number here.
 */
function shelfReading(shelf, count) {
  const n = String(count);
  // One price is a line too: "the one price found" and not "the middle of 1 prices".
  const one = count === 1 ? '_one' : '';
  const pct = num(shelf && shelf.pct);
  if (shelf && shelf.zone === 'middle') return t(`priceline_you_middle${one}`, { n });
  if (pct === null) return t(`priceline_you_middle${one}`, { n });
  const abs = String(Math.abs(pct));
  if (shelf.zone === 'under_your_line' || pct < 0) return t(`priceline_you_under${one}`, { pct: abs, n });
  return t(`priceline_you_over${one}`, { pct: abs, n });
}

/**
 * Ticks along the line.
 *
 * The server's own ticks are used when it sends them. When it does not, they
 * are derived here, and that is allowed where recomputing a price position is
 * not: a tick is axis furniture at a round percentage, not a statement about
 * anything that was found. Every 5%, or every 10% once the span is over 30,
 * because thirteen labelled ticks on a 390 px phone is a grey smear.
 */
function tickList(spec) {
  const given = Array.isArray(spec.ticks) ? spec.ticks : null;
  if (given && given.length > 0) {
    return given.map((tick) => {
      if (typeof tick === 'number') return { position: tick, label: tick === 0.5 ? t('priceline_tick_middle') : '' };
      const label = tick.label === 'middle' || tick.middle === true ? t('priceline_tick_middle') : String(tick.label ?? '');
      return { position: num(tick.position) ?? 0, label };
    });
  }
  const span = num(spec.span);
  if (span === null || span <= 0) return [];
  const step = span > 30 ? 10 : 5;
  const out = [];
  for (let pct = -Math.floor(span / 2); pct <= Math.floor(span / 2); pct += step) {
    const position = 0.5 + pct / span;
    if (position < 0 || position > 1) continue;
    out.push({ position, label: pct === 0 ? t('priceline_tick_middle') : `${pct > 0 ? '+' : ''}${pct}%` });
  }
  return out;
}

function el(doc, tag, className) {
  const node = doc.createElement(tag);
  if (className) node.setAttribute('class', className);
  return node;
}

/** `left:` for a fraction of the track, inset so an end dot is not half off screen. */
function leftStyle(position) {
  return `left:calc(${TRACK_INSET}px + (100% - ${TRACK_INSET * 2}px) * ${asFraction(position) ?? 0})`;
}

/**
 * Draw it.
 *
 * @param {object} spec
 *   median, unitLabel, span, ticks, zoneUnderBoundary, zoneOverBoundary  as sent
 *   by identify/src/gauge.ts, positions on a 0 to 100 line with the median at 50
 *   shelf   {position, zone, pct} for the scanned item, positions as sent
 *   points  [{retailer, position, price, label}] for the stores, order as sent
 *   excluded  rows the server left out, shown as a count and nothing more
 *   shelfLabel  the scanned item's own quantity-and-price line, Shin's own
 *     data formatted by Shin. Falls back to the median's unit line when the
 *     caller has nothing, because an unlabelled large dot is the one thing
 *     the founder's second sentence rules out.
 * @param {object} [opts] .doc to build in, .widthPx to lay out against
 * @returns {Element|null}
 */
export function priceLine(spec, opts = {}) {
  if (!spec) return null;
  const doc = opts.doc ?? globalThis.document;
  const widthPx = opts.widthPx ?? DESIGN_WIDTH;
  const points = Array.isArray(spec.points) ? spec.points : [];
  const shelf = spec.shelf ?? null;
  if (points.length === 0 && !shelf) return null;

  const wrap = el(doc, 'div', 'priceline-chart');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', t('priceline_label'));

  /* ------------------------------------------------------------- zones --- */

  /*
   * `zoneUnderBoundary` and `zoneOverBoundary`, which is what
   * `identify/src/gauge.ts` actually emits. This file read `goodBoundary` and
   * `badBoundary` until 2026-09-14; nothing ever sent those, so both zone
   * edges fell to their defaults and the whole band read as one zone. The
   * names are neutral on purpose: `good` and `bad` are grading words and the
   * gauge is forbidden to use them, which is the same reason the zones below
   * are called `under_your_line` and `over_your_line`.
   */
  const underBoundary = asFraction(num(spec.zoneUnderBoundary));
  const overBoundary = asFraction(num(spec.zoneOverBoundary));
  const zones = el(doc, 'div', 'pl-zones');
  const bounds = [
    ['under_your_line', 0, underBoundary ?? 0],
    ['middle', underBoundary ?? 0, overBoundary ?? 1],
    ['over_your_line', overBoundary ?? 1, 1],
  ];
  for (const [code, from, to] of bounds) {
    const zone = el(doc, 'div', 'pl-zone');
    zone.setAttribute('data-zone', code);
    // The word, on the screen, inside the band it names. This is the line
    // that makes the chart readable without colour, and it is why the zone
    // divs carry text at all rather than being three coloured rectangles.
    zone.setAttribute('style', `left:${from * 100}%;width:${(to - from) * 100}%`);
    const word = el(doc, 'span', 'pl-zone-word');
    word.textContent = zoneWord(code);
    zone.appendChild(word);
    zones.appendChild(zone);
  }
  wrap.appendChild(zones);

  /* ------------------------------------------------------------- ticks --- */

  const ticks = el(doc, 'div', 'pl-ticks');
  for (const tick of tickList(spec)) {
    const mark = el(doc, 'span', 'pl-tick');
    mark.setAttribute('style', leftStyle(tick.position));
    if (tick.label) {
      const label = el(doc, 'span', 'pl-tick-label');
      label.textContent = tick.label;
      mark.appendChild(label);
    }
    ticks.appendChild(mark);
  }
  wrap.appendChild(ticks);

  /* ------------------------------------------------- the store dots ------ */

  const track = el(doc, 'div', 'pl-track');
  const groups = layoutMarkers(points, widthPx);
  for (const group of groups) {
    const marker = el(doc, 'div', `pl-marker pl-${group.side}`);
    marker.setAttribute('style', leftStyle(group.position));
    marker.setAttribute('data-count', String(group.members.length));

    const dot = el(doc, 'span', 'pl-dot');
    marker.appendChild(dot);
    // A short leader line from the dot out to its label, so a label sitting
    // off to one side is still unambiguously attached to its own dot.
    marker.appendChild(el(doc, 'span', 'pl-leader'));

    if (group.members.length === 1) {
      const label = el(doc, 'span', 'pl-label');
      label.textContent = pointText(points[group.members[0]]);
      marker.appendChild(label);
    } else {
      // Merged: a button, because it opens. It is Shin's own chart furniture
      // and sits outside the grounded root, so tracking a tap on it is fine;
      // it carries no `data-act` anyway, since what it means is "expand a
      // cluster" and not a product decision worth an event of its own.
      const button = doc.createElement('button');
      button.setAttribute('type', 'button');
      button.setAttribute('class', 'pl-label pl-merged');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = markerLabel(group, points);
      marker.appendChild(button);

      const open = el(doc, 'ul', 'pl-cluster');
      open.setAttribute('hidden', '');
      for (const i of group.members) {
        const li = el(doc, 'li', null);
        li.textContent = pointText(points[i]);
        open.appendChild(li);
      }
      marker.appendChild(open);
      /*
       * "expands on tap", wired here rather than left to the screen.
       *
       * The quantities inside are the whole point of merging instead of
       * dropping a label, so the control that reveals them cannot be
       * something a caller has to remember to connect. `hidden` is toggled
       * as a property, not through a class, so the list is hidden from a
       * screen reader too while it is closed rather than merely invisible.
       */
      if (typeof button.addEventListener === 'function') {
        button.addEventListener('click', () => {
          const nowOpen = button.getAttribute('aria-expanded') === 'true';
          button.setAttribute('aria-expanded', String(!nowOpen));
          if (nowOpen) open.setAttribute('hidden', '');
          else open.removeAttribute('hidden');
        });
      }
    }
    track.appendChild(marker);
  }

  /* --------------------------------------------------- the large dot ----- */

  if (shelf && num(shelf.position) !== null) {
    /*
     * THE DOT IS POSITIONED; THE LABEL IS A FULL-WIDTH ROW UNDER IT.
     *
     * The first version of this put both inside one marker centred on the
     * dot, and the 390 px render pass measured 65 px of horizontal overflow
     * and an overlap with a store label: the scanned item's line is the
     * longest string on the chart ("6 x 355 mL, $6.19, your price, 18% over
     * the middle of 5 prices") and centring that on a dot at 72% of the
     * track pushes it off the screen. A label that runs off the edge is the
     * founder's rule broken by the layout rather than by the code.
     *
     * So the row spans the chart, wraps, and centres its own text, and the
     * dot keeps its position with a leader down to it. `data-position` is on
     * the marker so the position it was given stays readable from the DOM
     * even though the marker itself is no longer placed by it.
     */
    const marker = el(doc, 'div', 'pl-marker pl-shelf');
    marker.setAttribute('data-zone', String(shelf.zone ?? ''));
    marker.setAttribute('data-position', String(shelf.position));
    const dot = el(doc, 'span', 'pl-dot pl-dot-big');
    dot.setAttribute('style', leftStyle(shelf.position));
    marker.appendChild(dot);
    const leader = el(doc, 'span', 'pl-leader');
    leader.setAttribute('style', leftStyle(shelf.position));
    marker.appendChild(leader);
    const label = el(doc, 'span', 'pl-label pl-shelf-label');
    // Quantity first, then the reading. The founder's rule covers the large
    // dot too: "label each dot on the graph with its actrual quantity".
    label.textContent = spec.shelfLabel
      ? `${spec.shelfLabel}, ${shelfReading(shelf, points.length)}`
      : shelfReading(shelf, points.length);
    marker.appendChild(label);
    track.appendChild(marker);
  }

  wrap.appendChild(track);

  /* ----------------------------------------------------------- caption --- */

  const caption = el(doc, 'p', 'pl-caption');
  // "Per 100 mL, 6 prices found". Never the word "factually": it reads as a
  // claim about correctness that nothing here has measured, which is hard
  // rule 2 territory, and it is also not a word anyone says.
  caption.textContent = t(points.length === 1 ? 'priceline_caption_one' : 'priceline_caption', {
    unit: String(spec.unitLabel ?? ''),
    n: String(points.length),
  });
  wrap.appendChild(caption);

  const excluded = Array.isArray(spec.excluded) ? spec.excluded : [];
  if (excluded.length > 0) {
    const note = el(doc, 'p', 'pl-excluded');
    note.textContent = t('priceline_excluded', { n: String(excluded.length) });
    wrap.appendChild(note);
  }

  return wrap;
}
