/**
 * The camera. This is the app.
 *
 * It replaces four screens that used to be four pages: scan, identify, verdict
 * and actions. They are one surface now, because the user never leaves the
 * picture they took. The frame freezes where it was shot, the reticle contracts
 * onto what was found, and a sheet rises over it. Going back is a downward drag,
 * and now also a labelled button on every sheet that has no forward-only path.
 *
 * Three things here are rules rather than choices:
 *
 *   The refusal is not an error path. Five of the seven known items refuse, so
 *   refusal is the most common outcome of the primary action and it gets the
 *   same care as the answer: its own face, its own colour, and one thing to do
 *   next. It is grey and never red.
 *
 *   The asking price is never invented. The candidates come from the corpus with
 *   the price the hand pilot actually recorded, and any price that was a stated
 *   stand-in rather than an observed tag is labelled on screen as one.
 *
 *   Every price is priced against its own seller. `askingSeller` travels with
 *   the query, always, so the store being judged is never inside its own
 *   comparison set. That is a build standard earned by the same bug twice.
 */

import { faceBlock, confidenceOf, dotsHtml, tierOf, sellerOf, animateFace, shinSay, updateShinSay } from '../shin.js';
import { say, wordFor, refusalLabel } from '../voice.js';
import * as store from '../store.js';
import { attachEye, startCaptureQueue } from '../eye-attach.js';
import { startShelfCapture } from '../eye-shelf.js';
import { escapeHtml, ago } from '../lib/dom.js';
import { rowCheck } from '../lib/pagebar.js';
import { wireRadioGroup } from '../lib/radiogroup.js';
import { t } from '../ui-strings.js';
import * as shops from '../shops.js';
import { countryLabel, countryIn } from './market.js';
import { locale } from '../lib/locale.js';
import { priorPrices, historyChartHtml } from '../lib/price-history.js';
import { money, currencyMark } from '../lib/money.js';
import { render as renderProse, renderLines } from '../prose.js';
import { submitCorrection } from '../corrections.js';
import { identifyOffline } from '../offline-aisle.js';
import { track } from '../track.js';
import { refreshCell } from '../geocell.js';
import { mountGrounded } from '../grounded.js';
// The Gemini answer's headline values, lifted out of the wire in grounded.js,
// the only file that reads inside it.
import { geminiReading } from '../grounded.js';
import { geminiWordFor } from '../shin.js';
import { getDeviceId } from '../device.js';
import { FLAGS } from '../flags.js';

/**
 * The camera states in which the docked face is faded out by `camera.css`.
 *
 * This list and the selector list in `camera.css` under "Hidden whenever a
 * sheet has risen" are one fact written twice, and they have to agree: a state
 * in the stylesheet and not here leaves an invisible face animating (D-017), a
 * state here and not in the stylesheet freezes a face the user can see.
 */
const FACE_HIDDEN_IN = new Set(['choosing', 'asking', 'reading', 'texting', 'result']);

/**
 * Item 8's second half. The `cam.dataset.state !== 'idle'` guard already on
 * `shoot()` and the barcode button stops a second request landing WHILE one
 * is in flight; it does nothing once `reset()` has already put the state back
 * to `idle`, and the very next tap was accepted immediately (failure.md
 * D8.1/D8.5). This is the floor under that: no two captures start closer
 * together than this, counted from the moment either one actually started.
 */
export const MIN_CAPTURE_INTERVAL_MS = 1200;

/**
 * Pure so the arithmetic is checked without a DOM: `lastCaptureAt` of 0 means
 * nothing has been captured yet this screen, which always allows. `now` and
 * `lastCaptureAt` are both `Date.now()`-shaped epoch milliseconds.
 */
export function captureAllowed(now, lastCaptureAt, minIntervalMs = MIN_CAPTURE_INTERVAL_MS) {
  return lastCaptureAt === 0 || now - lastCaptureAt >= minIntervalMs;
}

/**
 * The four things the viewfinder is ever allowed to say, and the lines they map
 * to.
 *
 * The map is here and not in the eye because the eye measures and this screen
 * speaks. Adding a fifth entry means first finding a measurement that earns it:
 * the eye produces a key only when a number taken off the live frame says that
 * exact thing is wrong right now, which is what keeps this from becoming the
 * five-rule checklist OLMA showed four times before anything had failed.
 */
const COACH_LINES = {
  hold: 'cam_hold_still',
  glare: 'cam_glare',
  closer: 'cam_closer',
  pick: 'cam_pick_one',
  // Items 9 and 11 (2026-09-17): centre the barcode, and too dark to read
  // (only ever produced when the torch setting is off).
  centre_left: 'cam_centre_left',
  centre_right: 'cam_centre_right',
  centre_up: 'cam_centre_up',
  centre_down: 'cam_centre_down',
  dark: 'cam_too_dark',
};

/* ------------------------------------------------------------------ camera */

/**
 * A real camera when the browser will give one, a drawn shelf when it will not.
 *
 * The fallback is not a placeholder for a missing feature. A denied permission,
 * a desktop with no camera and a private window are all normal, and the app has
 * to be the same app in all of them.
 *
 * Item 9: `stream` used to be the whole return value, so a denied permission and
 * a machine with no camera at all were the same falsy value by the time the
 * caller saw it (failure.md D9.1) -- both landed on the drawn shelf with
 * nothing distinguishing them. `reason` names which one happened, the same
 * three values `onboarding.js`'s `askCamera` already classifies
 * (`'granted' | 'denied' | 'unavailable'`), read off `err.name` the same way.
 */
async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) return { stream: false, reason: 'unavailable' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    return { stream, reason: 'granted' };
  } catch (err) {
    return { stream: false, reason: err && err.name === 'NotAllowedError' ? 'denied' : 'unavailable' };
  }
}

function stopCamera(stream) {
  if (stream && typeof stream.getTracks === 'function') {
    for (const t of stream.getTracks()) t.stop();
  }
}

/**
 * Row 40: the frozen frame at the moment of the shutter press, only when a
 * real camera is behind the feed. The drawn shelf is not a photograph of
 * anything, so it captures nothing rather than pretend a fake frame is real
 * evidence. Kept small on purpose: a 96px square, centre-cropped, as a JPEG
 * data URL that never leaves the phone (nothing in api.js sends it anywhere).
 */
function captureThumb(video, isLive) {
  if (!isLive || !video || !video.videoWidth || !video.videoHeight) return null;
  try {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    g.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

/**
 * The same 96px thumbnail, made from the eye's crop rather than from a centre
 * square of the live feed. Same size and same shape on screen; what is inside
 * it is the object that was found instead of whatever happened to be in the
 * middle of the frame.
 */
async function thumbFromCrop(crop) {
  try {
    const bitmap = await createImageBitmap(crop.blob);
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const side = Math.min(bitmap.width, bitmap.height);
    g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

/** Row 40: the thumbnail beside an identity, when one was captured. */
function thumbImg(thumb) {
  return thumb ? `<img class="scan-thumb" src="${thumb}" width="40" height="40" alt="" loading="lazy">` : '';
}

/**
 * Rows the candidate list, the price pad and the type-it route all lacked: a
 * labelled way back, not only the swipe-to-dismiss that nothing on screen
 * teaches. Same icon and handler as the working sheet's own close,
 * `cancel-scan`, which already resets straight to the live viewfinder.
 */
function backButton(label = t('back_to_camera')) {
  return `<button type="button" class="sheet-close" data-act="cancel-scan" aria-label="${escapeHtml(label)}">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
  </button>`;
}

/**
 * The grabber on a sheet that has somewhere to go, as a real control.
 *
 * It used to be `<span class="grabber" aria-hidden="true" role="button"
 * tabindex="0" aria-label="Show more">` with no key handler anywhere in the
 * repo -- `grep -rn "keydown" public/js` returned zero hits -- which is the
 * worst of the three available states at once: in the tab order, announced as a
 * button, hidden from the accessibility tree by `aria-hidden`, and inert on
 * every key. A keyboard user reached it, was told it was a button, and nothing
 * happened.
 *
 * Made a real `<button>` rather than promoting `.sheet-head` to the control,
 * because the head is not a control: it holds Shin's face, his spoken bubble
 * (which changes text while the sheet is open) and the frozen-frame thumbnail,
 * and a button's accessible name is its whole subtree -- so promoting the head
 * would name this control with a paragraph of speech and would re-announce it
 * every time the bubble changed. The head keeps its drag, which is a gesture
 * and not a control, and the grabber keeps its own short, stable name.
 *
 * Only the two sheets with a half or full detent get one. The candidate list,
 * the pad, the going-rate card, the working wait and the type-it route all top
 * out at peek, so their grabber stays a decorative `<span aria-hidden="true">`:
 * a focusable control that cannot do anything is the defect this is fixing.
 */
function grabber() {
  return `<button type="button" class="grabber" data-act="detent-step" aria-label="${escapeHtml(t('cam_show_more'))}"></button>`;
}

/**
 * Row 43: a tag can say "20% off" or "3 for $5" instead of one flat number.
 * Both recompute the unit price Shin actually judges; the typed number stops
 * being the asking price once a modifier is active, and the confirm key sends
 * the effective price, never the sticker number alone.
 */
function effectivePriceCents(typedCents, modifier) {
  if (typedCents == null) return null;
  if (!modifier) return typedCents;
  if (modifier.kind === 'percent') {
    const pct = modifier.pct;
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return typedCents;
    return Math.max(0, Math.round(typedCents * (1 - pct / 100)));
  }
  if (modifier.kind === 'nfor') {
    const n = modifier.n;
    if (!Number.isFinite(n) || n < 2) return typedCents;
    return Math.round(typedCents / n);
  }
  return typedCents;
}

/** The labelled effective price under the pad, e.g. "$5.00 after 20% off". */
function modifierLabel(typedCents, modifier) {
  if (typedCents == null || !modifier) return '';
  const eff = effectivePriceCents(typedCents, modifier);
  if (eff === null || eff === typedCents) return '';
  if (modifier.kind === 'percent') return `${money(eff)} after ${modifier.pct}% off`;
  return `${money(eff)} each`;
}

/**
 * Row 83: a short buzz on a verdict landing and on a refusal landing, never
 * anywhere else. Off whenever the browser has no vibrate, and off whenever
 * You's "Buzz on verdicts" toggle (Lane C, a `buzz` field on `store`) says so.
 * Read defensively, so this works whether or not that field has landed yet:
 * `undefined` and `true` both mean on, only `false` turns it off.
 */
function hapticsOn() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
    && store.get().buzz !== false;
}
function buzz(pattern) {
  if (!hapticsOn()) return;
  try { navigator.vibrate(pattern); } catch { /* best effort only, never blocks anything */ }
}

/* ------------------------------------------------------------- sheet parts */

/**
 * The spread, drawn.
 *
 * The scale covers the asking price as well as the comparison range, so a tag
 * priced above everything Shin found lands visibly outside the band instead of
 * being clamped onto its end. Clamping would hide exactly the case worth seeing,
 * which is the one where the shelf is the outlier.
 *
 * The band is the range of real prices. The marker is where the user is standing.
 *
 * Row 57: the track, the band and the evidence ticks are neutral (`--ink`, the
 * app's own ink token), never the tier hue. The dot (`.rail-you`) is the one
 * mark that carries the verdict colour, because it is the only mark that IS
 * the verdict; everything else on the rail is evidence, and evidence is not
 * for or against anything until the dot lands on it.
 */
function spreadRail(v) {
  const { lowCents, highCents } = v.spread;
  const lo = Math.min(lowCents, v.askingCents);
  const hi = Math.max(highCents, v.askingCents);
  const span = Math.max(1, hi - lo);
  // A little air at both ends so a marker sitting on the extreme is not half
  // outside its own drawing.
  const pct = (c) => 6 + ((c - lo) / span) * 88;
  const at = (c) => `${pct(c)}%`;

  const marks = v.comparisonSet
    .map((p) => `<i class="rail-pt" style="left:${at(p.amountCents)}" title="${escapeHtml(p.seller)}"></i>`)
    .join('');

  const outside = v.askingCents > highCents || v.askingCents < lowCents;

  return `
    <div class="rail" role="img"
         aria-label="${escapeHtml(t('cam_rail_alt', { low: money(lowCents), high: money(highCents), asking: money(v.askingCents) }))}">
      <span class="rail-track"></span>
      <span class="rail-band" style="left:${at(lowCents)};width:${pct(highCents) - pct(lowCents)}%"></span>
      ${marks}
      <i class="rail-you${outside ? ' out' : ''}" style="left:${at(v.askingCents)}"></i>
      <span class="rail-lo" style="left:${at(lowCents)}">${money(lowCents)}</span>
      <span class="rail-hi" style="left:${at(highCents)}">${money(highCents)}</span>
      <span class="rail-me" style="left:${at(v.askingCents)}">${escapeHtml(t('cam_rail_you'))}</span>
    </div>`;
}

/**
 * The verdict's own "usually" line, replaced by the range itself (OLMA audit
 * rows 56, 58): low to high from the comparables that actually set the tier,
 * with the market named so the number has a referent. A single point is never
 * dressed up as a range; it is said as one number and one seller. Never a
 * count-up: this renders once, from numbers the engine already settled.
 */
function goingRateRange(v) {
  const { lowCents, highCents } = v.spread;
  const country = store.market().country;
  const mkt = country ? countryIn(country) : '';
  if (lowCents === highCents || v.pointCount <= 1) {
    return t('cam_rate_single', { price: money(lowCents), market: mkt });
  }
  return t('cam_rate_range', { low: money(lowCents), high: money(highCents), market: mkt });
}

/**
 * AVATAR.md section 2, "The going rate, defined without an average": the
 * median of the comparable set, and with an even count, the lower of the
 * two middle values. This is deliberately not v.spread.medianCents, which
 * rounds an average of the two middle values on an even count; the intense
 * gate below is written against the stricter order-statistic definition the
 * design doc names, computed from v.comparisonSet, the same set that set
 * the tier.
 */
function goingRateOrderStatCents(v) {
  const vals = v.comparisonSet.map((p) => p.amountCents).sort((a, b) => a - b);
  if (!vals.length) return null;
  const mid = vals.length >> 1;
  return vals.length % 2 === 1 ? vals[mid] : vals[mid - 1];
}

/**
 * AVATAR.md section 2, "The intense forms: thresholds and confidence
 * gates" (per-screen table rows 21 and 24). Delighted needs 25% or more
 * under the going rate and at or below the lowest comparable; angry needs
 * 40% or more over and above the highest comparable, plus the seller's name
 * visible on the same screen as the price (hard rule 4: the aggression
 * needs a legible target). Both need Certain or Fairly sure confidence;
 * thin evidence degrades to the plain tier face, never the intense one,
 * which is the whole reason the gate exists (a loud wrong verdict is worse
 * than a quiet one). Never called for the going-rate card: that card has no
 * asking price to be angry or delighted about.
 */
function intenseFaceFor(v, plainFace, conf, source) {
  if (conf.level !== 'certain' && conf.level !== 'sure') return plainFace;
  const rate = goingRateOrderStatCents(v);
  if (rate === null || rate <= 0) return plainFace;
  const { lowCents, highCents } = v.spread;
  if (v.askingCents <= rate * 0.75 && v.askingCents <= lowCents) return 'delighted';
  if (source && v.askingCents >= rate * 1.4 && v.askingCents >= highCents) return 'angry';
  return plainFace;
}

/**
 * Row 35's toast: earns nothing, writes nothing but the local signal.
 * avatar-presence.md's floor: never smaller than 48 where Shin speaks, and
 * this toast has a bubble line, so it is the shared shinSay component at
 * face-page (48) with pleased-nod, not the bare 28px row face it used to be.
 */
function feedbackToast() {
  return `
    <div class="toast" data-toast>
      ${shinSay('pleased', 'feedback_ack', {}, { size: 'face-page', anim: 'pleased-nod' })}
      <button type="button" class="toast-undo" data-act="thumbs-undo">${escapeHtml(t('cam_undo'))}</button>
    </div>`;
}

/**
 * Row 62: sorted by price, with the cheapest marked and its delta from the
 * asking price stated ("$0.74 less"), so the seller list doubles as "buy it
 * there instead." Only when `askingCents` is given (the verdict's own list);
 * a refusal's evidence list has no asking price to be cheaper than, so it
 * keeps its original order and no mark, exactly as before.
 */
function provenance(points, askingCents) {
  if (!points.length) return '';
  const withDelta = typeof askingCents === 'number';
  const list = withDelta ? points.slice().sort((a, b) => a.amountCents - b.amountCents) : points;
  const cheapest = withDelta && list.length > 1 ? list[0] : null;
  return `<div class="prov">${list
    .map((p) => {
      const isCheapest = p === cheapest;
      const delta = isCheapest ? askingCents - p.amountCents : null;
      return `<div${isCheapest ? ' class="prov-best"' : ''}>
        <b>${escapeHtml(p.seller)}</b>
        <span>${money(p.amountCents)} &middot; ${p.observedAt.slice(5)} &middot; ${escapeHtml(t('kind_' + p.kind))}${p.limit ? ` (${escapeHtml(p.limit)})` : ''}${
          delta !== null && delta > 0 ? ` &middot; ${escapeHtml(t('cam_less', { amount: money(delta) }))}` : ''
        }</span>
      </div>`;
    })
    .join('')}</div>`;
}

/**
 * Where the cheaper swaps go, drawn empty and filled when they arrive.
 *
 * IN THE HALF DETENT, NOT THE PEEK, and that is the whole reason this is a
 * placeholder rather than a late `insertAdjacentHTML`. The list arrives after
 * the verdict, so wherever it lands it lands under somebody's eyes; landing
 * below the fold means the reflow happens on a part of the sheet nobody is
 * reading yet. Nothing here animates: this appears on every verdict, which is
 * the loop of the whole product, and motion on the thing you see most is the
 * first motion to become noise.
 *
 * Nothing at all is drawn without a barcode, because the lookup is keyed on one
 * and an empty box that could never fill is worse than no box.
 */
function cheaperSlot(code, placeholder = null) {
  if (!code) return '';
  /* The waiting line, and the refusal path supplies its own. The default says
     "cheaper", which is arithmetic against the number the verdict above it has
     already judged; a refusal has judged nothing, so it passes its own heading
     in and the rows land underneath it when they arrive. */
  const wait = placeholder === null
    ? 'Looking for a cheaper one&hellip;'
    : escapeHtml(placeholder);
  return `<div class="cheaper" data-cheaper><p class="detail">${wait}</p></div>`;
}

/**
 * WHICH RING A SWAP CAME FROM, and the one rule that matters here.
 *
 * The catalogue looks for a cheaper thing on the leaf category first, and
 * steps ONE level up to the parent when the leaf has nothing. Those two are
 * not the same claim. A leaf swap is a substitute: Gala for Honeycrisp, and
 * "cheaper" means "instead of this". A parent swap is one category wider, and
 * the shopper has to be told, because D-036 is exactly this -- "it is the word
 * `cheaper` doing the lying, since it implies `instead of this`".
 *
 * MISSING IS LEAF, NEVER PARENT. An older catalogue build answers with no
 * `ring` at all, and the two ways to read that absence are not symmetric.
 * Reading it as parent would print "looser" over rows that are not, which
 * makes the qualifier meaningless on the rows that need it. Reading it as leaf
 * leaves those rows saying exactly what they said before this change, which is
 * the state D-036 already describes and does not make worse. Looser is the
 * claim that needs an explicit signal, so only an explicit 'parent' earns it.
 */
function ringOf(a) {
  return a && a.ring === 'parent' ? 'parent' : 'leaf';
}

/**
 * A category tag as a shopper would read it. "en:apples" is "Apples".
 *
 * D-011's shape is a raw internal code reaching the glass, and `ringTag` is a
 * raw Open Food Facts taxonomy id: "en:apples", "en:dried-fruits",
 * "en:cereals-and-their-products". Nobody standing in an aisle reads those,
 * and a badge whose whole job is to say how wide a claim is cannot spend its
 * credibility on looking like a database dump.
 *
 * THIS IS `labelForTag` FROM `catalogue/src/alternatives.ts`, ON PURPOSE, and
 * that file's own comment says why it has to be: "Must match search.ts's
 * labelForTag exactly, or the same tag renders two different ways on one
 * screen." The same is true one layer out. The heading above these rows is
 * the server's `alternativesHeading`, which runs a tag through that function
 * to produce "Cheaper apples"; a badge under it rendering the SAME tag as
 * "Apples" in one case and "Dried Fruits" in another would be two spellings of
 * one category on one sheet. So: lower-cased FIRST (the prefix regex only
 * recognises a lower-case prefix), any two-letter language prefix stripped,
 * hyphens to spaces, and only the first letter capitalised, never every word.
 *
 * NO FRENCH, AND IT IS A KNOWN LIMIT RATHER THAN AN OVERSIGHT. The catalogue
 * stores one taxonomy id per category and it is the English one; there is no
 * French label in the row to reach for. Rendering the humanised English id in
 * both locales is the honest version of that -- it is what we actually have --
 * and inventing a French category name on the client would be the app making
 * up a fact about the catalogue. When the catalogue carries a translated
 * label, this function grows a locale argument and nothing else moves.
 *
 * Returns '' for anything that humanises to nothing ("en:", "-", whitespace),
 * which is what makes the caller fall back to the untagged label instead of
 * printing a dangling colon.
 */
function humaniseTag(tag) {
  if (typeof tag !== 'string') return '';
  const label = tag.trim().toLowerCase().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

/**
 * Leaf swaps first, parent swaps after, and within a ring the server's order
 * is kept exactly.
 *
 * Two partitions rather than a comparator: `Array.prototype.sort` is required
 * to be stable now, but a comparator that returns 0 for same-ring pairs states
 * the within-ring order as an incidental property of the sort rather than as
 * the rule. Filtering twice says it outright and cannot be wrong.
 */
function swapsByRing(alternatives) {
  const rows = Array.isArray(alternatives) ? alternatives : [];
  return [
    ...rows.filter((a) => ringOf(a) === 'leaf'),
    ...rows.filter((a) => ringOf(a) === 'parent'),
  ];
}

/**
 * One swap row: the ring it came from, the product, and the server's sentence.
 *
 * The ring label goes FIRST and spans the row, above the name, because its job
 * is to be read before the price is. A qualifier under a number has already
 * lost: the number was believed on the way past it.
 *
 * The tag is printed when the catalogue named one, because "one category up"
 * is a shape and "one category up, in Biscuits" is something a shopper can
 * check, and it goes through `humaniseTag` on the way: what arrives is
 * "en:biscuits". When the field is absent, or humanises to nothing, the
 * untagged label still lands -- the looser claim cannot depend on an optional
 * string, and an empty tag must not leave a dangling colon on the row.
 */
function swapRow(a) {
  const ring = ringOf(a);
  const tag = humaniseTag(a.ringTag);
  const label = ring === 'parent'
    ? (tag ? t('cam_swap_looser_in', { tag }) : t('cam_swap_looser'))
    : (tag ? t('cam_swap_same_in', { tag }) : t('cam_swap_same'));
  // Name and the server's sentence, and nothing else. The sentence
  // already carries the seller, the price, the date it was seen and
  // the allergen caveat; an earlier version of this row appended the
  // allergen note a second time, which read as two different warnings
  // about one fact.
  //
  // THE SENTENCE IS STILL THE CATALOGUE'S, D-097 only changed what it is
  // made of. `a.line` is finished English and was printed verbatim under
  // this French badge; `a.structuredLine` is the same sentence as codes
  // plus raw facts, and `renderProse` writes it in the reader's language
  // or hands back `a.line` unchanged when it cannot. No rule about what
  // counts as cheaper moved into this screen.
  return `<div class="swap swap-${ring}" data-ring="${ring}">
              <span class="swap-ring">${escapeHtml(label)}</span>
              <b>${escapeHtml(displayName(a.product))}</b>
              <span>${escapeHtml(renderProse(a.structuredLine, a.line))}</span>
            </div>`;
}

/**
 * The whole cheaper block as a string, heading included.
 *
 * Pure and exported so `app/test/cheaper-rings.test.mjs` can render it for
 * real, the same trade `price-only.test.mjs` and `shops.test.mjs` already
 * make: the ordering rule and the two labels are the feature, and the only
 * way to hold them is to render and look.
 *
 * The heading is the server's and is escaped here. It was interpolated raw
 * until this change; it is server-written text either way, and a heading that
 * names a category is not a place to keep an exception.
 *
 * WHEN EVERY ROW IS A PARENT SWAP the block says so above the rows as well.
 * The server's heading names the ORIGINAL's own leaf category ("Cheaper
 * tortilla chips"), which is true of the shelf it looked at and false of every
 * row under it once the leaf came back empty. The row badges alone would leave
 * that heading standing unqualified over a list that contradicts it.
 *
 * `opts.allLooserKey` REPLACES THAT LINE ON A SHEET WITH NO COMPARISON ON IT,
 * and the default is the verdict's own wording, byte for byte, so nothing on
 * the verdict path moves. docs/plan-always-a-price.md section 3: "cheaper" is
 * arithmetic against a number the sheet has already judged, and on a refusal
 * there is no such number, so the refusal path passes `cam_swap_all_looser_ref`
 * and a heading of its own. The ROWS are identical on both paths: "Same kind
 * of thing" and "Looser swap" say how wide a claim is, which is true whether
 * or not anything was judged.
 */
function cheaperList(heading, alternatives, opts = {}) {
  const rows = swapsByRing(alternatives);
  const head = `<p class="detail">${escapeHtml(heading)}</p>`;
  // A heading over nothing reads as a list still loading. Seen live 2026-09-14
  // under a refusal: "Similar things that are priced" and then blank. The
  // sentence is Shin's and it is per path, because the verdict's version may
  // say "cheaper" and the refusal's never can.
  if (rows.length === 0) return `<p class="detail">${escapeHtml(say(opts.emptyKey ?? 'cam_cheaper_none'))}</p>`;
  const allLooser = rows.every((a) => ringOf(a) === 'parent');
  return `
      ${head}
      ${allLooser ? `<p class="detail swap-all-looser">${escapeHtml(t(opts.allLooserKey ?? 'cam_swap_all_looser'))}</p>` : ''}
      <div class="prov">
        ${rows.map(swapRow).join('')}
      </div>`;
}

/**
 * Removes the refusal's "here is something similar" line once the swaps it
 * pointed at turn out not to exist. Rendered on the refusal path only, so on
 * a verdict sheet there is nothing to find and this is a no-op.
 */
function dropSwapPromise(root) {
  for (const el of root.querySelectorAll('[data-swap-promise]')) el.remove();
}

/** Set once when the screen renders, so the two helpers above can reach the API. */
let ctxApi = null;

/**
 * The barcode this verdict is about, or null.
 *
 * Three places hold it and none of them holds it always: the judge's own
 * identity when the spine resolved one, the code read off the package on the
 * barcode route, and the catalogue row's code on the typed route. Taking the
 * first that exists is not a fallback chain papering over a bug; those are
 * three genuinely different ways a person can arrive at the same product, and
 * only one of them fires per scan.
 */
/**
 * The empty container the Gemini block is mounted into.
 *
 * It is empty on purpose. Every other block on this sheet is built as an HTML
 * string and assigned with `innerHTML`, and the grounded block is the one
 * thing that cannot be: escaping it would show a reader Google's markup
 * instead of Google's Search Suggestions, and concatenating it unescaped into
 * this template would put remote HTML into the same `innerHTML` as everything
 * else on the sheet. So `grounded.js` builds real nodes, `textContent` for
 * every field and exactly one `innerHTML` for Google's own rendered markup,
 * and this slot is where they go.
 *
 * TWO SECTIONS, NEVER ONE LIST. Shin's own prices are the `provenance` list
 * above; this sits below it as a separate section with its own heading. A
 * reader has to be able to tell which numbers came from Shin's sources and
 * which came from a Google search, and a merged list makes that
 * unanswerable. It is also the "will not intersperse" term from the other
 * side: folding our rows into Google's would be exactly that.
 */
function groundedSlot() {
  return '<div data-grounded-slot></div>';
}

/**
 * Mount the grounded block, if the payload carried one.
 *
 * Called right after every `slot.innerHTML = verdictSheet(...)`, because the
 * container only exists once that assignment has happened. Nothing is awaited
 * and nothing is fetched: the block arrived with the verdict, so this is pure
 * rendering and it cannot delay the answer.
 *
 * `shelfLabel` is the scanned item's own quantity and price, formatted by
 * Shin from Shin's own data. It is passed IN rather than worked out inside
 * `price-line.js`, and it is the founder's rule applied to the large dot as
 * well as the small ones: "there also needs to be measures in place that
 * label each dot on the graph with its actrual quantity". The quantity comes
 * from the identity label, which is where this app already carries a pack
 * size; when an identity has none, the label is still the item and its price,
 * which is the most this client honestly knows.
 */
function fillGrounded(slot, v) {
  const container = slot.querySelector('[data-grounded-slot]');
  if (!container) return;
  const label = v.identity?.label;
  mountGrounded(container, v.grounded, {
    // A refusal can arrive with no identity and no price; the gauge's own
    // label for the item is used then, rather than ", $NaN".
    shelfLabel: label && Number.isFinite(v.askingCents) ? `${label}, ${money(v.askingCents)}` : null,
  });
}

function codeOf(v, scenario) {
  return v?.identity?.gtin ?? scenario?.scannedGtin ?? scenario?.gtin ?? null;
}

function verdictSheet(v, scenario, thumb, acked = false) {
  const conf = confidenceOf(v);
  const source = sellerOf(v);
  // Landing and acknowledgement are two different things (founder's walk,
  // this round): whether the item is ALREADY saved decides only what the
  // primary button reads ("Saved" instead of the tier's own word), never
  // the face or the line. The verdict's own face and line -- angry, walk,
  // fair, good, delighted -- land every time, including on an item that
  // was saved on a previous visit, because the emotion IS the verdict. An
  // already-saved item with a rip-off verdict has to look like a rip-off.
  // `acked` is the one exception: it is passed true only by the watch
  // handler below, only in the same tap that just added the save, so the
  // pleased morph and the "Saved. I have the number and the day." line are
  // the acknowledgement of that action, in this session, never the
  // landing state of a sheet that simply opened.
  const alreadySaved = store.isWatched(v.identity.id);
  // The tier already knows which face it wears, unless the intense gate
  // (AVATAR.md section 2) is met: delighted or angry, with the tier's own
  // word and colour unchanged, per the coordinator's Chrome-walk note.
  const face = acked ? 'pleased' : intenseFaceFor(v, tierOf(v.tier).face, conf, source);
  const facts = { asking: money(v.askingCents), usual: money(v.spread.medianCents) };
  const watchFacts = { asking: money(v.askingCents), seller: source, day: 'today' };
  const intenseKey = face === 'delighted' ? 'verdict_steal' : face === 'angry' ? 'verdict_ripoff' : null;
  // avatar-presence.md's opening rule: Shin is always a face and a speech
  // bubble, one component, never a heading of the screen's own. The tier
  // word stays the sheet's own chrome (below); the spoken line is what goes
  // in shinSay's bubble.
  const spokenKey = acked ? 'watching' : (intenseKey ?? v.tier);
  const spokenFacts = acked ? watchFacts : facts;

  // The stand-in note sits in the peek, not the detail. It qualifies the number
  // the user is reading right now, and a caveat you have to drag a sheet open to
  // find is not a caveat.
  const standIn = scenario && scenario.observed === false
    ? `<p class="standin">${escapeHtml(t('cam_standin_note'))}</p>`
    : '';

  // Row: the half detent used to carry four paragraphs of the engine's own
  // prose in a row (the rail's own caption, the full spread sentence, the
  // confidence sentence, then the seller list) -- more than a shopper in an
  // aisle reads. Kept: the rail itself, the seller list, and one sentence
  // under the rail. `v.disagreement.detail` is true, engine-written text,
  // never rewritten -- only cut at its own first sentence boundary, same
  // technique as the produce refusal's "Why". The remainder, plus the
  // confidence line, fold behind that same disclosure rather than being
  // dropped outright: real evidence, just not owed to every reader.
  // Rendered in the reader's language from the code and facts beside it; the
  // English is the fallback, exactly as the confidence line does.
  const disagreeFull = v.disagreement ? renderProse(v.disagreement.structuredDetail, v.disagreement.detail) : '';
  const disagreeCut = disagreeFull.indexOf('. ');
  const disagreeShort = disagreeCut === -1 ? disagreeFull : disagreeFull.slice(0, disagreeCut + 1);
  const disagreeRest = disagreeCut === -1 ? '' : disagreeFull.slice(disagreeCut + 2);

  // Three detents (USAGE.md section 7 / DESIGN.md section 4, which agree with
  // each other exactly, over this build pass's own looser paraphrase of them):
  // peek carries the one wide primary and nothing else can push it below the
  // fold; half adds the rail, the confidence sentence and the provenance list;
  // full adds what Shin used in full, the one-tap correctness signal, and (row
  // 68) one obvious Done that closes the whole sheet in a single tap.
  return `
    <section class="sheet verdict" data-tier="${v.tier}" data-conf="${conf.level}" data-detent="peek" aria-live="polite" tabindex="-1">
      ${grabber()}
      ${/* The labelled way back at landing (2026-09-14). Done sits at the full
           detent, which a sheet that opened on its own after a barcode read
           has not reached. */ ''}
      ${backButton()}

      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay(face, spokenKey, spokenFacts, { size: 'face-verdict', tier: v.tier })}
          ${thumbImg(thumb)}
        </div>
        <h2 class="vword">${wordFor(v.tier)}</h2>

        <div class="priceline">
          <span class="price">${money(v.askingCents)}</span>
          <span class="sub">${source ? `${escapeHtml(t('cam_at_seller', { seller: source }))}<br>` : ''}${goingRateRange(v)}</span>
        </div>

        <div class="confrow">
          ${dotsHtml(conf.dots)}
          <span class="conf-label">${escapeHtml(conf.label)}</span>
        </div>
        ${standIn}
        <p class="itemname">${escapeHtml(v.identity.label)}</p>

        <div class="actions actions-primary">
          <button type="button" class="pill solid wide" data-act="watch">
            ${alreadySaved ? say('peek_watching') : say(`peek_${v.tier}`)}
          </button>
        </div>
      </div>

      <div class="sheet-half">
        ${spreadRail(v)}
        ${disagreeShort ? `<p class="disagree">${escapeHtml(disagreeShort)}</p>` : ''}
        ${provenance(v.comparisonSet, v.askingCents)}
        ${groundedSlot()}
        ${cheaperSlot(codeOf(v, scenario))}
        <details class="why">
          <summary>${escapeHtml(t('cam_why'))}</summary>
          ${disagreeRest ? `<p class="detail">${disagreeRest}</p>` : ''}
          <p class="detail">${escapeHtml(renderProse(v.confidence.structuredBecause, v.confidence.because))}</p>
          ${/* D-013. `evidenceNote` is declared on Refusal and nothing declares
                it on Verdict today, so this branch is dark on every payload the
                engine currently produces. It is here because the field is
                research prose about a doubted identity, and the same doubt can
                survive into an answer: the day a verdict carries one, the
                evidence lands behind the same disclosure the refusal puts it
                behind rather than reaching nobody, which is exactly the state
                D-013 logged. Escaped, and absent when absent. */ ''}
          ${v.evidenceNote
            ? `<p class="detail">${escapeHtml(v.evidenceNote)}</p>`
            : ''}
        </details>
        <div class="actions">
          <button type="button" class="pill ghost" data-act="correct">${escapeHtml(t('cam_correct_it'))}</button>
          <button type="button" class="pill ghost" data-act="share">${escapeHtml(t('cam_share'))}</button>
        </div>
      </div>

      <div class="sheet-full">
        ${/*
             The engine's own lines, in the reader's language where this build
             can manage it. `renderLines` hands back `v.lines` untouched in
             English and for any line whose codes it has not been taught, so
             this is the same markup it has always been and the English bytes
             are the engine's own. prose.js has the rules. */ ''}
        ${renderLines(v.structuredLines, v.lines).map((l) => `<p class="line">${escapeHtml(l)}</p>`).join('')}
        <div class="thumbs" role="group" aria-label="${escapeHtml(t('cam_verdict_right_q'))}">
          <button type="button" class="thumb" data-act="thumbs-up" aria-label="${escapeHtml(t('cam_looks_right'))}">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4.5-8a2 2 0 0 1 2 2.2L12.5 9H19a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 20H9a2 2 0 0 1-2-2v-7z"/></svg>
          </button>
          <button type="button" class="thumb" data-act="thumbs-down" aria-label="${escapeHtml(t('cam_looks_wrong'))}">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3zm0 0-4.5 8a2 2 0 0 1-2-2.2l1-5.8H5a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.4 4H15a2 2 0 0 1 2 2v7z"/></svg>
          </button>
        </div>
        <div class="toast-slot" data-toast-slot></div>
        <button type="button" class="pill solid wide done-btn" data-act="cancel-scan">${escapeHtml(t('done'))}</button>
      </div>
    </section>`;
}

/**
 * The refusal, which is a screen and not an error.
 *
 * Every reason gets its own sentence and its own repair, because "could not
 * price this" with no way forward is how a user learns to stop scanning.
 *
 * The category refusal's repair used to navigate to the You page's coverage
 * list, which abandoned the scan and the framed photo behind it. It now stays
 * on this sheet: a short list of what Shin can price, fetched once when the
 * camera opens and handed in here, never a second endpoint spent per refusal.
 */
/**
 * Every reason that means "prices were found and none of them can settle this",
 * as opposed to "we do not know what this is".
 *
 * One list, because two callers need it and they must never disagree: the sheet
 * picks the refuse_thin title from it, and the scan decides whether Keep it is
 * offered. The list gained three members on 2026-09-07 when the engine stopped
 * answering four different filter conditions with one code (D-012). Missing one
 * here is not cosmetic: an unlisted reason falls through to the refuse_unknown
 * title, so a Tide refusal with thirteen prices behind it would tell the shopper
 * Shin could not identify the product.
 *
 * The last three stopped being EMITTED on 2026-09-08, when the thin-verdict
 * path started answering those shortfalls instead of refusing on them. They
 * stay listed, and this is the whole of D-011's app half: they are still
 * members of the engine's closed `RefusalReason` union, and a refusal is a
 * stored record as well as a live answer -- a scan taken before that date and
 * reopened from Past scans hands one of these three straight back to this
 * function. Dropping them because nothing produces them today would put the
 * refuse_unknown title, "could not identify it", over thirteen prices the
 * sheet is about to list underneath it.
 */
const THIN_REASONS = new Set([
  'too_few_points',
  'no_source_response',
  'comparison_incoherent',
  'points_future_dated',
  'unusable_price_kinds',
  'points_too_stale',
  'all_points_from_asking_seller',
]);

function isThinReason(reason) {
  return THIN_REASONS.has(reason);
}

/**
 * The four ways the photo model itself never got a real look at the picture,
 * as opposed to looking and failing to read it. docs/the-photo-path.md
 * section 3: `identifyPhoto`'s `failure` field, minus `too_large` and
 * `rate_limited` (the route declining the request, handled before a scan is
 * ever attempted) and `unreadable_photo` (the model did look).
 *
 * Titled apart from `refuse_unknown` in `refusalSheet` below for hard rule 3:
 * an outage is not the shopper's photo being unclear, and saying so would be
 * the aggression landing on the wrong target.
 */
const MODEL_DOWN_REASONS = new Set([
  'model_timeout',
  'model_outage',
  'model_rate_limited',
  'spend_cap_reached',
]);

/** Each model-down failure's own sentence in voice.js, keyed by the failure code. */
const PHOTO_MODEL_FAILURE_LINES = {
  model_timeout: 'cam_photo_model_timeout',
  model_outage: 'cam_photo_model_outage',
  model_rate_limited: 'cam_photo_model_rate_limited',
  spend_cap_reached: 'cam_photo_spend_cap_reached',
};

/**
 * Item 9. The two ways the ROUTE declines a request before a model is ever
 * asked, as opposed to `MODEL_DOWN_REASONS` above (the model was asked and did
 * not answer). Both used to fall through to `cam_photo_unreadable` -- an
 * honest-miss line for what is actually a server-side throttle or a payload
 * over the cap (failure.md D9.5) -- which is exactly the class of wrong
 * answer hard rule 3 exists to stop: it reads as the shopper's photo being at
 * fault. Kept apart from `MODEL_DOWN_REASONS` because `refusalSheet` below
 * gives the two families the same treatment (a suppressed "said" line, since
 * the per-class sentence already carries both halves) but a different title.
 */
const THROTTLE_REASONS = new Set(['too_large', 'rate_limited', 'photo_tier_unsafe']);

/**
 * Item 9's countdown sentence, built from the server's own `retryAfterSeconds`
 * (app/server.ts `tooManyCalls`, threaded through by api.js) rather than a
 * guessed number -- the field already existed and nothing displayed it
 * (failure.md D9.1). `seconds` null or non-positive means the header did not
 * carry one; the line still answers (hard rule 1, always an answer), it just
 * has no number to count down. Exported and pure so the sentence itself is
 * checked without a DOM or a running timer; the interval that calls this once
 * a second to paint a live countdown is glue, not logic, and is source-checked
 * the way this file's other timers are.
 */
export function retryCountdownLine(seconds, who) {
  const whole = typeof seconds === 'number' && Number.isFinite(seconds) ? Math.ceil(seconds) : null;
  // No countdown to show: pass no fact at all. say()'s own MISSING_FACT
  // detection then falls back to the localized BARE row for this key,
  // instead of a hardcoded English placeholder living in a screen file.
  const facts = whole && whole > 0 ? { seconds: `${whole}s` } : {};
  return say('cam_scan_rate_limited', facts, who);
}

/**
 * What "Keep it" needs before it can be offered, or null.
 *
 * AVATAR.md section 3 row 39 gives the thin refusal exactly one action and
 * names it Keep it; DESIGN.md section 5 says it "records what the user read,
 * dated and attributed to a named seller". Both halves of that are conditions,
 * not decoration:
 *
 * - **A price the shopper actually gave.** Keep it exists so nobody is asked to
 *   type a number they typed ninety seconds ago. With no asking price there is
 *   nothing to keep, and the honest action is the one that asks for it.
 * - **A named shop.** A correction with no seller cannot be excluded from its
 *   own comparison later, so `store.recordCorrection` refuses to invent one and
 *   the engine uses the literal word "given" when none was named. A price
 *   attributed to nowhere is not evidence, it is a number.
 *
 * Only the thin refusals qualify. The other three are a different problem: no
 * identity and unsure-which-one do not know what the price would be about, and
 * an unsupported category has already said it will not price this at all.
 */
function keepableFrom(r, scenario, askingCents, isThin) {
  if (!isThin) return null;
  if (typeof askingCents !== 'number' || !Number.isFinite(askingCents) || askingCents <= 0) return null;
  const seller = (scenario?.askingSeller ?? '').trim();
  if (seller === '') return null;
  return {
    askingCents,
    seller,
    code: scenario?.scannedGtin ?? null,
    productId: r.identity?.id ?? null,
    label: r.identity?.label ?? scenario?.text ?? null,
    category: scenario?.category ?? null,
  };
}

/*
 * EVERYTHING TEXTUAL IN THIS FILE'S SHEETS IS ESCAPED AT THE SINK, ADDED
 * 2026-09-08.
 *
 * These builders write their result into `innerHTML`, and until today they
 * interpolated product labels, sellers, confidence labels and refusal details
 * raw. One of those carried text the shopper typed: the no-match refusal on the
 * type-it route puts the typed name into `detail`, so typing an `<img
 * src=x onerror=...>` into the name field and submitting it executed. Confirmed
 * against the built markup, not reasoned about.
 *
 * The four list screens were converted to `dom.js`'s escaping tag when that hole
 * was found in `pastscans.js`; this file was not, and it is the one with the
 * whole primary flow in it.
 *
 * ESCAPED AT THE SINK RATHER THAN AT THE SOURCE, on purpose. A sheet builder
 * cannot tell a catalogue name from something a person typed, and the rule "the
 * caller escapes" is one every future caller has to remember. The rule here is
 * that nothing textual reaches `innerHTML` from these functions without going
 * through `escapeHtml`, which is checkable by reading one file.
 */
/*
 * THE PRICE ROUTE OUT OF A REFUSAL, added 2026-09-13.
 *
 * Asked for in those words: "there should be a enter the price based on the
 * photo that the user entered if the barcode is not visible". Before today the
 * no-identity refusal offered "Type what it is" and nothing else, so a shopper
 * holding a tag Shin could not read had one option, and it was to do Shin's
 * job by hand. Standing in front of a price with no way to write it down is
 * the moment this app is least useful and most annoying.
 *
 * WHY IT IS NOT A SECOND PILL, and this is a real constraint rather than a
 * style choice. USAGE.md section 4 and section 7 both say a refusal carries
 * ONE action, and test/sheet.test.mjs and test/photo-screen.test.mjs both
 * count `class="pill` and assert exactly one. That rule is right: the second
 * pill on a refusal has historically been "Try again", which the downward drag
 * already does, and two equal-weight buttons on a sheet that has just failed
 * is a shopper being asked to choose between two repairs they did not want.
 *
 * So the repair stays one pill and this is a text button underneath it, which
 * is the same shape `notthis` already uses on the pad: a secondary route,
 * visibly lighter than the action above it, taking nothing away from it. The
 * primary repair can still produce a real verdict; this one never can, and the
 * hierarchy says so before the shopper taps anything.
 */
function priceRouteBtn(on) {
  if (!on) return '';
  return `<button type="button" class="pad-textbtn priceonly" data-act="priceonly">${escapeHtml(t('cam_just_the_price'))}</button>`;
}

function refusalSheet(r, scenario, categoryLabels = [], keepable = null, opts = {}) {
  const category = scenario?.category ?? 'this';
  const isCategory = r.reason === 'category_unsupported';
  const isUnsure = r.reason === 'identity_unsure';
  const isNoIdentity = r.reason === 'no_identity';
  const isThin = isThinReason(r.reason);
  const isModelDown = MODEL_DOWN_REASONS.has(r.reason);
  const isThrottled = THROTTLE_REASONS.has(r.reason);

  /*
   * A PRICED SUBSTITUTE UNDER A REFUSAL THAT COULD NOT CALL THE PRICE.
   * 2026-09-14, and it is the founder's own sentence made safe:
   *
   *   "if there is no comparison say that it is expensive and there is no
   *    comparison, we can offer another item for this that is worth their
   *    money but not identical."
   *
   * The second half ships and the first half cannot. "Expensive" with no
   * comparison behind it is a price representation with no adequate basis,
   * which hard rule 2 forbids outright; `refuse_thin_swaps` in voice.js has
   * the whole reasoning. What is left is the part that was always the useful
   * part: Shin will not call this one, and here is a thing beside it that
   * somebody has actually priced. The substitute carries the value.
   *
   * BOTH CONDITIONS ARE REAL, neither is defensive coding:
   *
   * - **A code.** `/api/alternatives` is keyed on a barcode. Without one there
   *   is no query to send, so the box could never fill and drawing it would be
   *   a promise the sheet cannot keep.
   * - **An asking price.** The catalogue's rule for what counts as an
   *   alternative is "priced below what you are being asked", so with no
   *   asking price there is no cut-off and the rows would mean nothing.
   *
   * ONLY THE THIN REFUSALS. The other reasons are a different failure: no
   * identity and unsure-which-one do not know what the swaps would be swaps
   * FOR, and an unsupported category has already said it will not price this
   * kind of thing at all, so offering substitutes in it contradicts the
   * sentence directly above them.
   */
  const swapsOffered = isThin
    && !!opts.swapCode
    && typeof opts.askingCents === 'number'
    && Number.isFinite(opts.askingCents);

  const titleKey = isCategory
    ? 'refuse_category'
    : isUnsure
      ? 'refuse_unsure'
      : isModelDown
        ? 'refuse_unavailable'
        : isThrottled
          ? 'refuse_declined'
          : isThin
            ? 'refuse_thin'
            : 'refuse_unknown';
  const titleFacts = isCategory ? { category } : {};

  // Row 8: a category refusal's detail is the engine's own paragraph, true
  // and real, but written for someone auditing the rule, not a shopper mid
  // aisle -- PLU codes, the public price series, underlying inflation. A
  // shopper does not read that, and printing all of it makes the sheet
  // harder to use and uglier, which reference.md names as a defect on its
  // own. Only the first sentence shows inline; the rest is the same words,
  // verbatim, behind a native disclosure, never rewritten or shortened into
  // something the engine did not actually say.
  let categoryShort = '';
  let categoryWhy = '';
  if (isCategory) {
    const cut = r.detail.indexOf('. ');
    categoryShort = cut === -1 ? r.detail : r.detail.slice(0, cut + 1);
    categoryWhy = cut === -1 ? '' : r.detail.slice(cut + 2);
  }

  // The engine writes its own sentence naming the repair. Shin's voice sits
  // above it; the engine's detail is never paraphrased, because it is the part
  // that says what actually happened.
  //
  // Model-down is not given a `said` line of its own here. It used to render
  // `refuse_unavailable_why` ("This is the reader, not your photo. The
  // barcode and typing it still work.") above `r.detail`'s own per-class line
  // (`cam_photo_model_*`, e.g. "The photo reader took too long to answer this
  // one. The barcode and typing it still work.") -- both stating the same two
  // facts, what happened and what still works, in almost the same words. The
  // per-class line already carries both; this line only repeated them.
  //
  // The thin refusal gets one, and only when there is something to hand over.
  // `refuse_thin_swaps` ends by pointing at the rows below it, so rendering it
  // over an empty box would be the line breaking its own promise in the same
  // breath; with no swaps the refusal stands exactly as it did.
  const mine = swapsOffered
    ? `<p class="said" data-swap-promise>${say('refuse_thin_swaps')}</p>`
    : isCategory || isThin || isModelDown || isThrottled
      ? ''
      : `<p class="said">${say(isUnsure ? 'refuse_unsure_why' : 'refuse_unknown_why')}</p>`;

  // USAGE.md section 4 ("the single action, by reason") and section 7 ("on a
  // refusal: one action only... there is no share and no watch on a refusal")
  // both forbid a second pill here. `Try again` used to sit beside the repair;
  // it is now the same downward drag that already dismisses the sheet, so it
  // costs no second button.
  // Row 17/88/89, take: the no-identity refusal's one action is a second
  // route, not the dead end it used to be. USAGE.md C2 names it "Type what
  // it is"; every other reason keeps its existing repair.
  const repairBlock = isCategory
    ? `<div class="actions-primary cat-repair">
        <p class="said">${say('refuse_category_repair')}</p>
        ${categoryLabels.length
          ? `<ul class="cat-chips">${categoryLabels.map((c) => `<li>${c}</li>`).join('')}</ul>`
          : `<p class="detail">${escapeHtml(t('cam_list_failed'))}</p>`}
        ${categoryWhy
          ? `<details class="why"><summary>${escapeHtml(t('cam_why'))}</summary><p class="detail">${categoryWhy}</p></details>`
          : ''}
      </div>`
    : `<div class="actions actions-primary">${
        keepable
          /* One action, never two. USAGE.md section 7 and section 4 both forbid
             a second pill on a refusal, and the label is the contract's own
             word. It is chrome rather than a voice key: two words, no sentence,
             and the same button on every attitude. What Shin SAYS about it is
             keep_it_ack, which has all three. */
          ? `<button type="button" class="pill solid" data-act="keepit">${escapeHtml(t('cam_keep_it'))}</button>`
          : isNoIdentity || isModelDown || isThrottled
            ? `<button type="button" class="pill solid" data-act="typeit">${escapeHtml(t('cam_type_what_it_is'))}</button>`
            : `<button type="button" class="pill solid" data-act="correct">${escapeHtml(t('cam_correct_it'))}</button>`
      }</div>`;

  return `
    <section class="sheet refusal" data-tier="unknown" data-conf="refuses" data-detent="peek" aria-live="polite" tabindex="-1">
      ${grabber()}
      ${/* Every refusal, not only the category one (2026-09-14): a barcode
           read lands here with no shutter press, and a sheet whose only way
           back is an untaught drag traps the shopper away from the camera. */ ''}
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('unknown', titleKey, titleFacts, { size: 'face-verdict' })}
        </div>
        ${mine}
        ${/* 2026-09-15: an unchecked answer is still the answer, shown first. */ ''}
        ${scenario?.unchecked && scenario?.text
          ? `<p class="said unchecked-answer">${escapeHtml(t('cam_unchecked_answer', { label: scenario.text }))}</p>`
          : ''}
        <p class="detail">${escapeHtml(isCategory ? categoryShort : renderProse(r.structuredDetail, r.detail))}</p>
        ${repairBlock}
        ${priceRouteBtn(opts.priceRoute)}
        <p class="itemname">${escapeHtml(r.identity ? r.identity.label : scenario?.unchecked && scenario?.text ? scenario.text : t('cam_no_confident_match'))} &middot; ${
          /*
           * `refusalLabel` restates the reason as a full sentence, e.g.
           * "Refused. The photo reader took too long." -- exactly the fact
           * `r.detail` above already gave, in fuller words. That is the right
           * call when this footer is the ONLY sentence a reason gets, which
           * is what it is on a reopened refusal in pastscans.js; here it sits
           * under a sentence that already said it. The footer adds a fact
           * (the plain word "Refused") without repeating the one it does not
           * need to say twice.
           */
          isModelDown ? t('cam_refused_sentence') : refusalLabel(r.reason)
        }</p>
      </div>
      <div class="sheet-half">
        ${r.evidence.length
          ? `<p class="because">${say('refuse_evidence_some')}</p>${provenance(r.evidence)}`
          : `<p class="because">${say('refuse_evidence_none')}</p>`}
        ${r.evidenceNote
          ? `<details class="why"><summary>${escapeHtml(t('cam_why'))}</summary><p class="detail">${escapeHtml(r.evidenceNote)}</p></details>`
          : ''}
        ${/* The search's prices and reviews, on a refusal too (2026-09-15):
             our own engine refusing for want of sellers must not hide what the
             search found. Still its own section, below Shin's evidence. */ ''}
        ${groundedSlot()}
        ${/*
             Below the fold, the same place the verdict keeps it, and for the
             same reason: the rows arrive after the sheet does, so the reflow
             lands on a part of the sheet nobody is reading yet. The sheet is
             still `data-tier="unknown"` with no share and no watch, which is
             what docs/plan-always-a-price.md section 3 requires of an answer
             that carries no tier -- this adds a reference to a refusal, it
             does not turn one into a verdict. */ ''}
        ${swapsOffered ? cheaperSlot(opts.swapCode, t('cam_similar_priced')) : ''}
      </div>
    </section>`;
}

/**
 * The whole sheet for a scan with no connection (beta gap item 21): one title,
 * one plain sentence, no product name, no price, no action that could answer
 * from what the phone holds. The back button and the drag down are the way out.
 */
/**
 * THE GEMINI ANSWER (beta gaps item 3, 2026-09-19).
 *
 * `/api/price` now answers a scan with one Gemini answer, `{ kind: 'gemini',
 * ...marks, grounded }`, and never with a `verdict`. Until this sheet existed a
 * good answer fell into the refusal branch and the shopper saw a refusal for
 * it, on the app's main screen.
 *
 * SHIN COMPUTES AND SHOWS NO PRICE MATH HERE (rule 6 of the beta gaps list).
 * The headline word is Gemini's own zone code for the shelf price against the
 * user's lines, put into words by the same three strings the price line uses
 * (`priceline_zone_*`, which say "your line" and never grade the price). The
 * middle price and the shelf label are Gemini's values handed in as text by
 * `geminiReading`; there is no `money()`, no percentage and no comparison in this
 * function. The offers, reviews, alternatives and the price line itself are the
 * grounded block, mounted by `fillGrounded` exactly as the verdict sheet
 * mounts it. The catalogue is not consulted for an answer, so this sheet has
 * no swaps slot and `fillCheaper` never runs on it.
 *
 * NO WATCH AND NO SHARE. Both need an identity id and a usual price in cents,
 * which the verdict carried and this answer does not (and Shin may not work
 * one out from Gemini's numbers). A sheet that offered them would offer two
 * buttons that could only do nothing.
 */
const GEMINI_ZONE_KEY = {
  under_your_line: 'priceline_zone_under',
  middle: 'priceline_zone_middle',
  over_your_line: 'priceline_zone_over',
};

/*
 * Gemini's zone, in the tier names the colour system already binds.
 *
 * `tokens.css` binds `--tier`, `--tier-bright` and `--tier-on` off
 * `[data-tier]`, and `DESIGN.md` Law 2 is "hue for the judgment, fill for the
 * confidence". This sheet hardcoded `data-tier="unknown"`, so after the Gemini
 * rewrite every answer painted in the unknown grey and a good price, a fair
 * one and a walk away were the same colour on the app's main screen. The zone
 * was on the section the whole time, in `data-zone`, and nothing read it: no
 * CSS rule and no JS anywhere keys on `data-tier` except the token bindings.
 *
 * No zone stays unknown, which is the honest answer: with no shelf price there
 * is no judgment to give a hue to.
 */
const GEMINI_ZONE_TIER = {
  under_your_line: 'good',
  middle: 'fair',
  over_your_line: 'walk_away',
};

/** The thumbs pair for the Gemini answer sheet; the verdict sheet keeps its own copy of the same markup. */
function thumbsBlock() {
  return `<div class="thumbs" role="group" aria-label="${escapeHtml(t('cam_verdict_right_q'))}">
          <button type="button" class="thumb" data-act="thumbs-up" aria-label="${escapeHtml(t('cam_looks_right'))}">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4.5-8a2 2 0 0 1 2 2.2L12.5 9H19a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 20H9a2 2 0 0 1-2-2v-7z"/></svg>
          </button>
          <button type="button" class="thumb" data-act="thumbs-down" aria-label="${escapeHtml(t('cam_looks_wrong'))}">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3zm0 0-4.5 8a2 2 0 0 1-2-2.2l1-5.8H5a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.4 4H15a2 2 0 0 1 2 2v7z"/></svg>
          </button>
        </div>`;
}

/**
 * The price-match line (docs/mvp-plan.md, "show this to the cashier"): the
 * server's `priceMatch { store, line, conditions, seller, url }`, produced
 * only when the scan carried both a store name and a shelf price. The line and
 * the conditions are the server's words from app/src/price-match.ts, shown as
 * they arrived; nothing is computed here. No block at all without a line.
 */
export function priceMatchBlock(pm) {
  const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const line = text(pm?.line);
  if (!line) return '';
  const conditions = Array.isArray(pm.conditions)
    ? pm.conditions.map(text).filter(Boolean)
    : (text(pm.conditions) ? [text(pm.conditions)] : []);
  const seller = text(pm.seller);
  const url = text(pm.url);
  const link = seller && url && /^https?:\/\//i.test(url)
    ? `<a class="pm-seller" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(seller)}</a>`
    : (seller ? `<span class="pm-seller">${escapeHtml(seller)}</span>` : '');
  return `<section class="pm" data-price-match aria-label="${escapeHtml(t('pm_heading'))}">
          <h3 class="gem-alts-heading">${escapeHtml(t('pm_heading'))}</h3>
          <p class="pm-line" data-pm-line>${escapeHtml(line)}</p>
          ${link ? `<p class="detail">${link}</p>` : ''}
          ${conditions.length ? `<ul class="pm-conditions">${conditions.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
        </section>`;
}

/**
 * Whether an answer says it is cheaper elsewhere, which is when the one-tap
 * "What did you do?" row shows (docs/mvp-plan.md, "Acts on it"). Two signals,
 * both the server's and neither computed here: Gemini's own zone put the shelf
 * price over the user's line, or the server found a cheaper offer a till here
 * will match.
 */
export function saysCheaperElsewhere(zone, priceMatch) {
  return zone === 'over_your_line' || Boolean(priceMatch && typeof priceMatch.line === 'string' && priceMatch.line.trim());
}

const OUTCOME_KEYS = ['bought_elsewhere', 'price_matched', 'bought_here', 'not_bought'];

/** The one-tap outcome row. Each button posts its outcome once (api.js `postScanOutcome`). */
export function outcomeRow() {
  return `<div class="gem-outcome" role="group" aria-labelledby="gem-outcome-q" data-outcome-row>
          <p class="detail" id="gem-outcome-q">${escapeHtml(t('outcome_q'))}</p>
          <div class="gem-outcome-opts">
            ${OUTCOME_KEYS.map((k) => `<button type="button" class="pill ghost" data-act="outcome" data-outcome="${k}" aria-pressed="false">${escapeHtml(t(`outcome_${k}`))}</button>`).join('')}
          </div>
        </div>`;
}

/**
 * Whether this Gemini reply is a failure to answer rather than an answer.
 * `failure` is the server's own code (a call that did not come back), the
 * `nothing_to_price` reason is a request with nothing to look up, and a block
 * with nothing to show is the same thing to the person holding the phone. An
 * answer marked "not fully confident" is NOT a failure: it still shows.
 */
function geminiFailed(result) {
  if (!result || result.kind !== 'gemini') return false;
  if (result.failure || result.reason === 'nothing_to_price') return true;
  return !geminiReading(result.grounded).hasContent;
}

const GEMINI_ALT_KINDS = ['same_product', 'substitute', 'used_copy', 'newer_model', 'other'];

/**
 * Gemini's alternatives (beta gap item 18), a plain list under the answer: the
 * name, why it is an alternative, and its price as Gemini returned it. Every
 * word and figure is the model's; Shin adds no price math here, and a row whose
 * reason is missing falls back to a plain sentence for its kind. NO SECTION AT
 * ALL when there are none, not an empty heading.
 */
function alternativesBlock(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const items = rows.map((a) => {
    const kind = GEMINI_ALT_KINDS.indexOf(a.kind) === -1 ? 'other' : a.kind;
    const named = a.brand && !a.name.toLowerCase().includes(a.brand.toLowerCase()) ? `${a.brand} ${a.name}` : a.name;
    const why = [a.reason ?? t(`gem_alt_kind_${kind}`), a.store ? t('gem_alt_at', { store: a.store }) : null]
      .filter(Boolean)
      .join(', ');
    /* The store's link beside the price when the row carried one (2026-09-21,
       every price shows its store and its link). The href is the wire's value. */
    const link = a.url
      ? `<a class="gem-alt-link" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.store ?? t('open'))}</a>`
      : '';
    return `<li class="gem-alt" data-gem-alt><span class="gem-alt-name">${escapeHtml(named)}</span><span class="gem-alt-price">${escapeHtml(a.price)}</span><span class="gem-alt-why">${escapeHtml(why)}</span>${link}</li>`;
  });
  return `<section class="gem-alts" data-gemini-alternatives aria-label="${escapeHtml(t('gem_alt_heading'))}">
          <h3 class="gem-alts-heading">${escapeHtml(t('gem_alt_heading'))}</h3>
          <ul class="gem-alt-list">${items.join('')}</ul>
        </section>`;
}

/**
 * WHEN THE ANSWER WAS CHECKED, as one short sentence, or '' when there is
 * nothing honest to say.
 *
 * Ruling 1 (docs/decisions.md) permits a repeat scan of a known barcode to be
 * answered from a stored answer, and states the condition it is permitted
 * under: the price "is cached for six hours and ALWAYS SHOWN WITH WHEN IT WAS
 * CHECKED". That half was never built, so a shopper could be shown a price up
 * to six hours old as though it had just been looked up. This is that half.
 *
 * It is Shin's own fact about when Shin asked, not one of Gemini's bytes, so
 * it is a sentence of ours OUTSIDE the grounded root (grounded.js, term 1) and
 * its words live in ui-strings.js.
 *
 * `ago` is lib/dom.js's, already used by past scans, saved and the watchlist,
 * and it is the file that owns the units and the French word order. A second
 * relative-time function would be a second set of thresholds to keep in step.
 *
 * THE THREE WAYS A CLOCK LIES, all of them answered here rather than in the
 * string table:
 *   - no time on the wire, or one no clock can parse: `geminiReading` already
 *     turned both into null, and null renders nothing at all. Never "checked
 *     unknown", which claims a check happened at an hour nobody knows.
 *   - a time in the future, which a phone whose clock is behind the server's
 *     produces routinely: it takes the bare "just now" sentence. `ago` would
 *     clamp it to "0 min ago", and nothing here can ever print "in 3 hours".
 *   - under a minute old, which is every fresh scan: the same bare sentence,
 *     because "checked 0 min ago" is a worse way to say "just now".
 */
function geminiCheckedLine(fetchedAt) {
  if (fetchedAt === null || fetchedAt === undefined) return '';
  const at = Date.parse(fetchedAt);
  if (!Number.isFinite(at)) return '';
  const elapsed = Date.now() - at;
  if (elapsed < 60000) return t('cam_gem_checked_now');
  return t('cam_gem_checked', { when: ago(fetchedAt) });
}

function geminiSheet(result, item, thumb, earlier = []) {
  const g = geminiReading(result.grounded);
  // The server's price-match line (the camera puts the identify call's one on
  // the result when the price answer carried none).
  const priceMatch = result.priceMatch ?? null;
  const unsure = result.lowConfidence === true || g.lowConfidence;
  const conf = confidenceOf({ ...result, failure: null, reason: undefined, lowConfidence: unsure });
  const zoneKey = g.zone ? GEMINI_ZONE_KEY[g.zone] : null;
  const name = g.name ?? item?.text ?? '';
  // The headline is Gemini's word on the user's scale; with no shelf price to
  // place there is no zone, and the product's name leads instead.
  const headline = zoneKey ? t(zoneKey) : (name || t('cam_gem_answered_word'));
  const medianLine = g.median === null
    ? ''
    : escapeHtml(g.unitLabel === null
      ? t('cam_gem_median_bare', { median: g.median })
      : t('cam_gem_median', { median: g.median, unit: g.unitLabel }));
  const shelfLine = g.shelfLabel === null ? '' : escapeHtml(t('cam_gem_shelf', { label: g.shelfLabel }));
  const lines = [medianLine, shelfLine].filter(Boolean).join('<br>');
  const reasons = Array.isArray(result.confidenceReasons) ? result.confidenceReasons : g.confidenceReasons;
  const checked = geminiCheckedLine(g.fetchedAt);

  return `
    <section class="sheet verdict gemini" data-kind="gemini" data-tier="${GEMINI_ZONE_TIER[g.zone] ?? 'unknown'}" data-zone="${escapeHtml(g.zone ?? '')}" data-conf="${conf.level}" data-conf-reasons="${escapeHtml(reasons.join(' '))}" data-detent="peek" aria-live="polite" tabindex="-1">
      ${grabber()}
      ${backButton()}

      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay(unsure ? 'unknown' : 'idle', unsure ? 'gem_unsure' : 'gem_answer', {}, { size: 'face-verdict', tier: 'unknown' })}
          ${thumbImg(thumb)}
        </div>
        <h2 class="vword${zoneKey ? '' : ' small'}" data-gemini-headline>${escapeHtml(headline)}</h2>
        ${lines ? `<div class="priceline"><span class="sub" data-gemini-figures>${lines}</span></div>` : ''}
        ${unsure ? `<div class="confrow"><span class="conf-label" data-not-confident>${escapeHtml(conf.label)}</span></div>` : ''}
        ${zoneKey && name ? `<p class="itemname">${escapeHtml(name)}</p>` : ''}
        ${checked ? `<p class="conf-label gem-checked" data-gem-checked>${escapeHtml(checked)}</p>` : ''}
      </div>

      <div class="sheet-half">
        ${groundedSlot()}
        ${priceMatchBlock(priceMatch)}
        ${saysCheaperElsewhere(g.zone, priceMatch) ? outcomeRow() : ''}
        ${alternativesBlock(g.alternatives)}
        ${(() => {
          const chart = historyChartHtml(earlier, { format: (c) => money(c), heading: t('cam_hist_heading'), alt: t('cam_hist_alt', { n: String(Array.isArray(earlier) ? earlier.length : 0) }) });
          return chart ? `<div class="gem-hist" data-gem-history>${chart}</div>` : '';
        })()}
        <div class="actions">
          <button type="button" class="pill ghost" data-act="correct">${escapeHtml(t('cam_correct_it'))}</button>
        </div>
      </div>

      <div class="sheet-full">
        ${thumbsBlock()}
        <div class="toast-slot" data-toast-slot></div>
        <button type="button" class="pill solid wide done-btn" data-act="cancel-scan">${escapeHtml(t('done'))}</button>
      </div>
    </section>`;
}

/**
 * The state for a Gemini reply that did not carry an answer. Plain and kind:
 * one line in the mascot's voice, one way to try again, never the raw code and
 * never the refusal sheet's "could not price this" wording, because nothing was
 * refused. It is the needs-connection sheet's shape (peek only), so it lands
 * on a control the shopper can reach.
 */
function geminiFailureSheet(result, item) {
  const key = result.reason === 'nothing_to_price' ? 'gem_nothing' : 'gem_failed';
  return `
    <section class="sheet refusal gemini-failed" data-kind="gemini" data-tier="unknown" data-conf="refuses" data-detent="peek" aria-live="polite" tabindex="-1" data-gemini-failed>
      <span class="grabber" aria-hidden="true"></span>
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('unknown', key, {}, { size: 'face-verdict' })}
        </div>
        ${item?.text ? `<p class="itemname">${escapeHtml(item.text)}</p>` : ''}
        <div class="actions actions-primary">
          <button type="button" class="pill solid" data-act="gem-retry">${escapeHtml(t('try_again'))}</button>
        </div>
      </div>
    </section>`;
}

export function needsConnectionSheet() {
  return `
    <section class="sheet refusal" data-tier="unknown" data-conf="refuses" data-detent="peek" aria-live="polite" tabindex="-1" data-needs-connection>
      ${grabber()}
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('unknown', 'cam_needs_connection', {}, { size: 'face-verdict' })}
        </div>
        <p class="detail">${escapeHtml(say('cam_offline_no_price'))}</p>
      </div>
    </section>`;
}


/**
 * AVATAR.md row 36: the refusal's landing is `verdict-land` at 340ms, then
 * `slow-blink`, never the shake/buzz/red a normal miss might otherwise get.
 * Called right after a refusal sheet's markup is mounted, on its own face.
 * Row 83: the same landing is where the refusal's short haptic buzz lives,
 * once, here, so every refusal (category, unsure, unknown, thin, and the
 * network-error and no-match refusals built inline below) gets it the same
 * way instead of four separate call sites remembering to add it.
 */
function playRefusalLanding(slot) {
  buzz(14);
  const el = slot.querySelector('.face');
  if (!el) return;
  animateFace(el, 'verdict-land');
  setTimeout(() => animateFace(el, 'slow-blink'), 340);
}

/**
 * What Shin might be looking at. Real items, real recorded asking prices.
 *
 * Reframed from a refusal (the fixed stand-in list used to borrow the unsure
 * refusal's face and lines) to a plain question: this is not Shin failing to
 * separate two things he found, it is the one honest thing to ask when there
 * is no vision model yet. `asking`, not `unknown`; "Which one is it?", not
 * "I am not sure which one this is."
 */
function candidateSheet(items) {
  return `
    <section class="sheet candidates" data-tier="unknown" data-conf="reading" tabindex="-1">
      <span class="grabber" aria-hidden="true"></span>
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head compact">
          ${shinSay('asking', 'cam_candidate_prompt', {}, { size: 64 })}
        </div>
        <div class="cands">
          ${items
            .map(
              (i) => `<button type="button" class="cand" data-pick="${i.id}">
                <span class="cand-name">${escapeHtml(i.text)}</span>
                <span class="cand-meta">${money(i.askingCents)}${i.askingSeller ? ` &middot; ${i.askingSeller}` : ''}${
                  i.observed ? '' : ' &middot; stand-in'
                }</span>
              </button>`,
            )
            .join('')}
          <button type="button" class="cand cand-none" data-pick="__none">
            <span class="cand-name">${escapeHtml(t('cam_something_else'))}</span>
            <span class="cand-meta">${say('cam_candidate_none')}</span>
          </button>
        </div>
        <!-- The caption on the stand-in list. Shortened and set in the
             interface face by the elevation pass: it was mono uppercase, which
             this file reserves for a recorded measurement, and a caption in
             caps at the foot of the glass reads as a developer's note. The
             claim is unchanged; only the wording is tighter and the full stop
             is gone, a caption not being a sentence. -->
        <p class="standin-note">${escapeHtml(t('cam_standins_caption'))}</p>
      </div>
    </section>`;
}

/**
 * The ranked list behind a pick, reopened by "not this?".
 *
 * NOT `candidateSheet`, and the difference is the whole reason there are two.
 * That one is the stand-in list the camera shows because there is no vision
 * model yet: seven hand-priced things, offered before Shin has looked at
 * anything. This one is the rest of what a real search actually found, offered
 * after Shin has already answered, when the band said the answer was one of
 * several plausible rows rather than the only one.
 *
 * So it carries no asking price and no stand-in note. These rows are catalogue
 * products, not priced shelf entries; a price appears after one is picked, in
 * the pad, the same as the first time round. Putting a number here would be
 * inventing one.
 *
 * The row already on screen is dropped by the caller, not here, so an empty
 * list reaching this function means the search found nothing else and the
 * sentence says exactly that rather than drawing an empty box.
 */
function searchCandidateSheet(items, query) {
  return `
    <section class="sheet candidates" data-tier="unknown" data-conf="reading" tabindex="-1">
      <span class="grabber" aria-hidden="true"></span>
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head compact">
          ${shinSay('asking', items.length ? 'cam_notthis_prompt' : 'cam_notthis_empty', { query }, { size: 64 })}
        </div>
        <div class="cands">
          ${items
            .map(
              (i) => `<button type="button" class="cand" data-pick-code="${escapeHtml(i.code)}">
                <span class="cand-name">${escapeHtml(i.label)}</span>
                ${i.meta ? `<span class="cand-meta">${escapeHtml(i.meta)}</span>` : ''}
              </button>`,
            )
            .join('')}
          <button type="button" class="cand cand-none" data-act="notthis-back">
            <span class="cand-name">${escapeHtml(t('cam_keep_the_first_one'))}</span>
            <span class="cand-meta">${escapeHtml(say('cam_notthis_keep'))}</span>
          </button>
        </div>
      </div>
    </section>`;
}

/**
 * The typed-price display, shared shape with `correct.js`'s own pad: a ghosted
 * ".00" until it is actually typed, never a placeholder that could be misread
 * as a real number.
 */
function pricePadDisplay(typed) {
  const sep = padSeparator();
  if (!typed) return `<span class="ghosted">0${sep}00</span>`;
  const [whole, frac] = typed.split('.');
  return frac === undefined
    ? `${whole || '0'}<span class="ghosted">${sep}00</span>`
    : `${whole || '0'}${sep}${frac}${frac.length === 1 ? '<span class="ghosted">0</span>' : ''}`;
}

/**
 * The decimal separator the reader sees. The pad buffer itself always holds
 * "." (parsePadPrice and the key handler never change), because the buffer is
 * a number and the separator is a way of writing one; a French reader typing
 * a price sees the comma every French price on this screen already uses, and
 * the French refusal for an unreadable price can honestly say "virgule".
 */
function padSeparator() {
  return locale() === 'fr' ? ',' : '.';
}

/**
 * The amount line above the keypad, currency mark and digits in the reader's
 * order: "$4.99" in English, "4,99 $" in French, the same order `money()` prints
 * everywhere else. The mark is the user's market currency's own (`currencyMark`);
 * with no market chosen there is no mark and the pad shows the digits alone.
 * Both pad hosts paint it from here so they cannot disagree.
 */
function padAmountHtml(typed) {
  const digits = pricePadDisplay(typed);
  const mark = escapeHtml(currencyMark());
  if (mark === '') return digits;
  return locale() === 'fr'
    ? `${digits}<span class="amount-cur amount-cur-after">${mark}</span>`
    : `<span class="amount-cur">${mark}</span>${digits}`;
}

/**
 * The keypad, once, for both pads.
 *
 * `camera.css .padsheet .keypad` and `correct.css .keypad` were two
 * implementations of one component, and `pricePadDisplay` above was duplicated
 * verbatim as `display()` inside correct.js. This is the markup half of that
 * duplication removed: the keys come from here and carry Foundation's
 * `.btn .btn--key` (components.css), so the fill, the radius, the display face,
 * the tabular figures and the one focus ring are stated once, and each pad only
 * says what is genuinely its own -- row height, and whether there is a confirm
 * key in the bottom row at all.
 *
 * Deliberately NOT carrying the bare `.key` class any more. `correct.css`
 * declares `.key` and `.keypad` unscoped, so those rules were reaching into the
 * camera's sheet pad -- `.key { background: var(--surface) }` against
 * camera.css's own `--raised`, at equal specificity, settled by nothing but
 * which file screens.css imports last. The camera's keys are addressed as
 * `.padsheet .btn--key` now and the two pads cannot paint each other by
 * accident.
 *
 * The digits are one 3x3 grid and the bottom row is its own, because the confirm
 * key has to read as the keypad's own key (USAGE.md A1 0:13.4) rather than a
 * button underneath it. A pad with no confirm (the correction screen's, whose
 * commit is its page CTA) gets a three-column bottom row instead of four, so it
 * stays the same 3-wide field of keys all the way down.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.confirm=false]           render the confirm key.
 * @param {boolean} [opts.canConfirm=false]        whether that key is enabled.
 * @param {string}  [opts.confirmLabel] its accessible name. Defaults to the
 *   translated "Price it"; read at call time, never at module load, because
 *   the language can change under a running page (the You screen's row).
 * @returns {string} markup: `.keypad` (1-9) followed by `.keypad-bottom`
 *   (`.`, `0`, backspace, and the confirm key when asked for). Every key carries
 *   `data-pad="<char>"`, the char being one of `1`-`9`, `.`, `0`, `⌫`; the
 *   confirm key carries `data-act="pad-confirm"` and `.key-confirm`.
 */
function keypadHtml({ confirm = false, canConfirm = false, confirmLabel = t('cam_price_it') } = {}) {
  // `label` is what the key shows; `data-pad` is what the handler reads. They
  // differ for one key only: the decimal, which reads "," in French.
  const key = (char, extra = '', label = char) =>
    `<button type="button" class="btn btn--key" data-pad="${char}"${extra}>${label}</button>`;
  return `
        <div class="keypad">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => key(k)).join('')}
        </div>
        <div class="keypad keypad-bottom${confirm ? '' : ' keypad-bottom-3'}">
          ${key('.', '', padSeparator())}
          ${key('0')}
          ${key('⌫', ` aria-label="${escapeHtml(t('cam_delete_last_digit'))}"`)}
          ${confirm
            ? `<button type="button" class="btn btn--key key-confirm" data-act="pad-confirm" aria-label="${confirmLabel}"${canConfirm ? '' : ' disabled'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </button>`
            : ''}
        </div>`;
}

/** The pad buffer, read as cents, or null if it does not parse as a usable
    amount. Shared by the render function (the confirm key's disabled state)
    and the screen (what actually gets priced). */
function parsePadPrice(buf) {
  if (!buf) return null;
  const n = Number.parseFloat(buf);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * The asking price pad. OLMA audit rows 38, 40, 41, 42, 44, take: a large
 * keypad with decimal and backspace, a Clear, and a Skip that proceeds with no
 * asking price at all (that is the going-rate card, not a refusal).
 *
 * The identified item's name is the confirmation above the field (row 40, now
 * joined by the frozen-frame thumbnail when one exists).
 *
 * Row 43: an optional "% off" or "N for $" modifier recomputes the effective
 * unit price under the typed number, labelled, and it is that effective price
 * the confirm key actually sends, never the sticker number alone.
 *
 * USAGE.md A1 0:13.4 says "the pad's own key is the continue," built literally
 * here as a confirm key inside the keypad grid rather than a debounce after
 * typing stops: a pause guessing that typing has finished is exactly how
 * someone who types "2", glances back at the tag, then types ".49" gets
 * priced at $2.00, and a wrong verdict is worse than no verdict (CLAUDE.md
 * priority 1). Nothing submits until the confirm key is pressed, and it is
 * disabled until the effective price parses to more than zero.
 *
 * Clear is gated the same way, on the buffer rather than the price: it was live
 * from the moment the pad opened, with nothing to clear, and a control that
 * does nothing when pressed teaches a person their taps are not being read.
 * Rendered inert here and toggled live by the screen's paintPadEffective, which
 * is where the confirm key's own state already lives.
 *
 * NOTE, and it is a real trap: test/sheet.test.mjs asserts on this function's
 * OUTPUT with `.includes(' disabled')`, so the markup below must not carry the
 * word in an HTML comment. Prose about the attribute belongs here, outside the
 * template literal, not in the string this returns.
 */
/**
 * The shop row that sits on the price pad, or nothing at all.
 *
 * NOTHING AT ALL IS THE DEFAULT AND IT IS NOT A DEGRADED STATE. Location
 * consent is off until somebody turns it on (`consent.js`), and with it off
 * this returns '' -- no row, no shortlist, no question, and the pad is
 * character for character the pad that shipped before this feature. A price
 * with no shop on it is still worth recording, which is the rule the whole
 * correction queue already runs on, so there is nothing here to block or
 * nudge with.
 *
 * WITH CONSENT ON IT IS A STATEMENT, NOT A PROMPT. It says which shop the
 * price is about to be filed at -- already filled in, on every visit after
 * the first, from what this device remembers about this cell -- and tapping
 * it opens the shortlist. That is the shape the brief asks for: the shopper
 * taps once per shop, ever, and reads the row the rest of the time.
 *
 * @param {{name: string}|null} shop  the chosen shop, or null for none chosen
 *   yet. `null` still renders the row (with "Choose"): the row is how the
 *   shortlist is reached, so hiding it when nothing is chosen would hide the
 *   only way to choose.
 * @param {boolean} allowed  whether location consent is on.
 */
function padShopRow(shop, allowed) {
  if (!allowed) return '';
  const value = shop?.name ? escapeHtml(shop.name) : escapeHtml(t('cam_shop_choose'));
  return `
        <button type="button" class="ilist-row pad-shop" data-act="pad-shop"
                aria-label="${escapeHtml(t('cam_shop'))}">
          <span class="ilist-l">${escapeHtml(t('cam_shop'))}</span>
          <span class="ilist-v">${value}</span>
        </button>`;
}

/**
 * The shortlist itself. One tap, and then never again for this shop.
 *
 * THE INSET GROUPED LIST, not a new control: this is the same `.ilist` the
 * market picker and the You screen's attitude picker are built from, with the
 * same `role="radiogroup"` and the same `rowCheck()`, so a shopper who has
 * used either already knows what this is and `lib/radiogroup.js` wires the
 * keyboard for free.
 *
 * ORDER IS `shops.js`'s AND NOT THIS FUNCTION'S. What arrives here is already
 * in the order it goes on screen (the shop last confirmed in this cell, then
 * the ones this device confirms most, then by distance). This renders it.
 *
 * THE "NO SHOP" ROW IS NOT A CANCEL. It is a real answer -- a market stall, a
 * shop nobody has mapped, a tap on the wrong row a minute ago -- and it files
 * the price with no shop, which is what the app did before any of this and is
 * still a price worth having.
 *
 * @param {{id:string,name:string,hint?:string,count?:number}[]} shops
 * @param {string|null} chosenId  which row is checked.
 */
function storePickerSheet(shops, chosenId = null) {
  const rows = shops.map((s) => {
    const on = s.id === chosenId;
    return `
          <button type="button" class="ilist-row shop-row${on ? ' on' : ''}"
                  role="radio" aria-checked="${on}" data-shop="${escapeHtml(s.id)}">
            <span class="ilist-l">${escapeHtml(s.name)}${
              (s.count ?? 0) > 0 ? ` <span class="shop-usual">${escapeHtml(t('cam_shop_usual'))}</span>` : ''
            }</span>
            ${s.hint ? `<span class="ilist-v">${escapeHtml(s.hint)}</span>` : ''}
            ${rowCheck()}
          </button>`;
  }).join('');

  return `
    <section class="sheet shopsheet" data-tier="unknown" data-conf="reading" tabindex="-1">
      <span class="grabber" aria-hidden="true"></span>
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('asking', shops.length ? 'shop_pick_prompt' : 'shop_none_nearby', {}, { size: 64 })}
        </div>
        <h2 class="vword" style="font-size:20px">${escapeHtml(t('correct_which_shop'))}</h2>
        <div class="ilist shop-list" role="radiogroup" aria-label="${escapeHtml(t('correct_which_shop'))}">
          ${rows}
          <button type="button" class="ilist-row shop-row${chosenId ? '' : ' on'}"
                  role="radio" aria-checked="${!chosenId}" data-shop="__none">
            <span class="ilist-l">${escapeHtml(t('cam_shop_none'))}</span>
            ${rowCheck()}
          </button>
        </div>
      </div>
    </section>`;
}

/**
 * "What is it?", on the pad that has no identity behind it. 2026-09-14.
 *
 * OPTIONAL, AND THE PRICE NEVER WAITS ON IT. The founder's words are "there
 * should be a feature where the user can manually add the price in and name
 * it", and the order of those two matters: an empty field still files the
 * price, `pad-confirm` is gated on the number alone, and nothing here can
 * block a shopper who is standing in an aisle and only wants the number down.
 *
 * WHY IT IS WORTH A FIELD AT ALL, WHICH IS NOT A UI ARGUMENT. An unidentified
 * observation has NO KEY. It carries no barcode and no product id, so
 * `correctionsFor` can never match it, it can never become a price point, and
 * it can never join the comparison set for the thing it was actually about.
 * It hangs off `scan.typed_price_cents` and stops there. A typed name is the
 * first key that row has ever had: the only handle a later pass has for
 * rejoining "$4.99 at Metro on 14 September" to a product, whether that pass
 * is a person reading Past scans or a matcher run over the corpus.
 * docs/plan-always-a-price.md's rung (a) "only unconfirmed shopper prices" is
 * exactly where a name-plus-price lands once it can be rejoined. Without the
 * name the number is a fact about nothing.
 *
 * A plain text input, not a search. The type-it route already exists for
 * "match me against the corpus" and it produces a verdict; this one is a note
 * on a record, matched by nobody today, and dressing it as a lookup would
 * promise a result it does not return.
 */
function padNameField(on, typedLabel) {
  if (!on) return '';
  return `
        <div class="pad-name">
          <label>${escapeHtml(t('cam_what_is_it'))}
            <input type="text" data-obs-label autocomplete="off" enterkeyhint="done"
                   placeholder="${escapeHtml(t('cam_what_is_it_hint'))}"
                   value="${escapeHtml(typedLabel)}">
          </label>
        </div>`;
}

/**
 * Row 25: the two-way choice on the price pad, validation or switching, made by
 * the user. `mode` is the one showing as chosen. Only the scan-time pad carries
 * it: a pad opened for anything else has no scan to send the choice with.
 */
function padAltChoice(mode) {
  if (mode !== 'validation' && mode !== 'switching') return '';
  const btn = (m) => `<button type="button" class="modbtn" data-alt-mode="${m}" aria-pressed="${mode === m}">${escapeHtml(t(`cam_alt_${m}`))}</button>`;
  return `
        <div class="pad-alt" role="group" aria-label="${escapeHtml(t('cam_alt_group'))}" data-pad-alt>
          ${btn('validation')}
          ${btn('switching')}
        </div>`;
}

function pricePadSheet(item, typed = '', modifier = null, thumb = null, shop = null, shopAllowed = false, typedLabel = '', altMode = null) {
  const typedCents = parsePadPrice(typed);
  const effCents = effectivePriceCents(typedCents, modifier);
  const canConfirm = (effCents ?? 0) > 0;
  const effLabel = modifierLabel(typedCents, modifier);
  return `
    <section class="sheet padsheet" data-tier="unknown" data-conf="reading" tabindex="-1">
      <span class="grabber" aria-hidden="true"></span>
      ${backButton()}
      <div class="pad-headrow">
        <button type="button" class="pad-textbtn" data-act="pad-clear"${typed ? '' : ' disabled'}>${escapeHtml(t('clear'))}</button>
        <button type="button" class="pad-textbtn" data-act="pad-skip">${escapeHtml(t('skip'))}</button>
      </div>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('asking', 'price_pad_prompt', {}, { size: 64 })}
          ${thumbImg(thumb)}
        </div>
        <p class="itemname">${escapeHtml(item.text)}</p>
        ${padNameField(!!item.observationOnly, typedLabel)}
        ${
          item.notThisQuery
            ? `<button type="button" class="pad-textbtn notthis" data-act="notthis">${escapeHtml(
                say('cam_notthis_offer'),
              )}</button>`
            : ''
        }
        ${padShopRow(shop, shopAllowed)}
        ${padAltChoice(altMode)}
        <div class="amount pad-amount">${padAmountHtml(typed)}</div>
        <p class="pad-effective" data-pad-effective${effLabel ? '' : ' hidden'}>${effLabel}</p>
        <div class="pad-mods" role="group" aria-label="${escapeHtml(t('cam_price_modifiers'))}">
          <button type="button" class="modbtn${modifier?.kind === 'percent' ? ' on' : ''}" data-modtoggle="percent">${escapeHtml(t('cam_percent_off_suffix'))}</button>
          <button type="button" class="modbtn${modifier?.kind === 'nfor' ? ' on' : ''}" data-modtoggle="nfor">${escapeHtml(t('cam_n_for'))}</button>
        </div>
        ${modifier?.kind === 'percent' ? `
        <div class="pad-mod-input">
          <label>${escapeHtml(t('cam_percent_off'))} <input type="number" inputmode="numeric" min="1" max="95" data-mod-value value="${modifier.pct ?? ''}" placeholder="20"></label>
        </div>` : ''}
        ${modifier?.kind === 'nfor' ? `
        <div class="pad-mod-input">
          <label>${escapeHtml(t('cam_items_in_the_deal'))} <input type="number" inputmode="numeric" min="2" max="20" data-mod-value value="${modifier.n ?? ''}" placeholder="3"></label>
        </div>` : ''}
        ${keypadHtml({ confirm: true, canConfirm })}
      </div>
    </section>`;
}

/**
 * The going-rate card. USAGE.md section 2, OLMA audit rows 44, 56, 58: no
 * asking price supplied, so this is not a verdict and not the refusal grey.
 * It renders straight from the `no_asking_price` refusal's own `evidence`
 * array, which is the comparables the engine already gathered before it found
 * out there was nothing to judge them against, never a second endpoint and
 * never an invented number.
 */
function goingRateCard(refusal, item) {
  const pts = refusal.evidence;
  const amounts = pts.map((p) => p.amountCents);
  const lo = Math.min(...amounts);
  const hi = Math.max(...amounts);
  // D-081: `sellerId` is identity for counting distinct sellers; `seller` is
  // the display and matching name and is not guaranteed to be a stable key
  // (two spellings of the same store). Falls back to `seller` for a point
  // that predates `sellerId`.
  const sellers = new Set(pts.map((p) => p.sellerId ?? p.seller)).size;
  const country = store.market().country;
  const mkt = country ? countryIn(country) : '';
  const single = pts.length <= 1 || lo === hi;
  const range = single ? money(lo) : t('cam_rate_to', { low: money(lo), high: money(hi) });
  const sellerWord = t('cam_seller_count', { n: String(sellers) });
  const cheapest = pts.slice().sort((a, b) => a.amountCents - b.amountCents)[0];
  const label = refusal.identity ? refusal.identity.label : (item?.text ?? t('cam_this'));

  return `
    <section class="sheet goingrate" data-tier="unknown" data-conf="reading" tabindex="-1">
      <!-- A real grabber, like the verdict and the refusal, because this card
           has a half detent too: the seller list below is the whole evidence
           for the range quoted above it, and it was as unreachable from a
           keyboard as the verdict's own was. Found by app/test/sheet.test.mjs
           asserting the rule rather than the two known cases. -->
      ${grabber()}
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('asking', 'going_rate', {}, { size: 'face-working' })}
        </div>
        <h2 class="vword" style="font-size:20px">${escapeHtml(t('cam_going_rate'))}</h2>
        <div class="priceline">
          <span class="price sm">${range}</span>
          <span class="sub">${cheapest ? `${escapeHtml(t('cam_at_seller', { seller: cheapest.seller }))}<br>` : ''}${escapeHtml(t('cam_in_market', { market: mkt, sellers: sellerWord }))}</span>
        </div>
        <p class="itemname">${escapeHtml(label)} &middot; ${escapeHtml(t('cam_no_tag_typed'))}</p>
        <div class="actions actions-primary">
          <button type="button" class="pill solid wide" data-act="pad-reopen">${escapeHtml(t('cam_tell_me_the_price'))}</button>
        </div>
      </div>
      <div class="sheet-half">
        ${provenance(pts)}
      </div>
    </section>`;
}

/**
 * The price was written down and Shin cannot call it. 2026-09-13.
 *
 * NOT A VERDICT, AND NOT A REFUSAL WEARING A NUMBER. Those are the two things
 * this card had to avoid being, and the reason it is its own function rather
 * than a branch inside `verdictSheet` or `refusalSheet`.
 *
 * It is not a verdict because there is nothing to judge against: the photo was
 * never identified, so there is no comparison set, not a thin one. The
 * recorded decision that a low-confidence identity must not produce a verdict
 * is the weaker case; this is the stronger one. Nothing here is near a number,
 * because there is no number to be near. So: `data-tier="unknown"`, no
 * `vword`, no tier colour, and no `share` or `watch` -- there is nothing to
 * share and nothing to follow.
 *
 * It is not a refusal because something useful actually happened. The price is
 * saved, against this scan, beside the photo, and it will still be there when
 * somebody can say what the thing was. `data-conf="reading"` rather than
 * `refuses` is that distinction in the markup: Shin is not turning the shopper
 * away, Shin is taking a note.
 *
 * The price is the biggest thing on it, formatted by `money()` like every other
 * price in this app (`4,99 $` in French, and never re-implemented here), and
 * the caption under it says in chrome what the bubble says in Shin's voice.
 */
/*
 * `name` IS WHAT THE SHOPPER TYPED, AND NOTHING ELSE. It is not a resolved
 * identity and must never read as one: the card still says `data-tier`
 * "unknown", still carries no verdict word, no share and no watch. It only
 * replaces "No name for it", which is the honest caption when nobody said
 * anything and a false one the moment somebody did. Escaped like everything
 * else that reaches `innerHTML` here: this is the one string on the card a
 * person typed, which is the class of input that got a `<img src=x onerror>`
 * onto a refusal sheet on 2026-09-08.
 */
function observationCard(cents, seller, thumb = null, name = null) {
  return `
    <section class="sheet observed" data-tier="unknown" data-conf="reading" tabindex="-1">
      <span class="grabber" aria-hidden="true"></span>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('pleased', 'price_only_recorded', { price: money(cents), seller: seller || '' }, {
            size: 'face-ack',
            anim: 'pleased-nod',
          })}
          ${thumbImg(thumb)}
        </div>
        <h2 class="vword" style="font-size:20px">${escapeHtml(t('cam_price_written_down'))}</h2>
        <div class="priceline">
          <span class="price sm">${money(cents)}</span>
        </div>
        <p class="itemname">${escapeHtml(
          typeof name === 'string' && name.trim() ? name.trim() : t('cam_no_name_for_it'),
        )}${seller ? ` &middot; ${escapeHtml(seller)}` : ''}</p>
      </div>
    </section>`;
}

const WORKING_STEPS = ['working_step1', 'working_step2', 'working_step3'];

/**
 * The wait, named. OLMA audit row 47 (three named states), row 48 (the item
 * echoed as soon as it is known), row 49 (a close that aborts and returns to
 * the live viewfinder). AVATAR.md rows 16 to 19.
 *
 * The three steps advance on real events only (identification chosen, the
 * price request actually sent, its response actually received), which is
 * wired in the screen, not here; this function only ever renders the step it
 * is told. The one timed thing here, `slow`, never invents a finished step,
 * it only changes the current step's own word once the 0.8s budget has
 * passed while still waiting on the same request (row 19).
 */
function workingSheet(itemLabel, step = 0, opts = {}) {
  const slow = !!opts.slow;
  // Deliberately not shinSay here, unlike every other sheet in this file.
  // The working state's face sits beside three lines (row 47, AVATAR.md rows
  // 16-19), not one: shinSay's bubble holds a single say() line, so folding
  // this in would mean either repeating the current step's own text a
  // second time inside the bubble, or dropping the two dimmed steps, and
  // both make the wait harder to read than the plain three-line list. The
  // face still carries the doc's own face-working (76) size.
  return `
    <section class="sheet working" data-tier="unknown" data-conf="reading" tabindex="-1">
      <span class="grabber" aria-hidden="true"></span>
      <button type="button" class="sheet-close" data-act="cancel-scan" aria-label="${escapeHtml(t('cam_cancel_scan'))}">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <div class="sheet-peek working-peek">
        ${faceBlock('thinking', { size: 'face-working' })}
        <div class="wsteps">
          ${WORKING_STEPS.map(
            (k, i) => `<div class="wstep${i === step ? ' now' : ''}">${i === step ? say(slow ? 'working_slow' : k) : say(k)}</div>`,
          ).join('')}
        </div>
        <p class="itemname">${escapeHtml(itemLabel)}</p>
      </div>
    </section>`;
}

/**
 * Type it instead, the text route out of a refusal. AVATAR.md row 41, OLMA
 * audit rows 17, 88, 89, take: the field rises over a still-visible, blurred
 * (never hidden) viewfinder, and the prompt names brand and model because a
 * typed name has to hit the fixed corpus, which is what it is matched
 * against.
 */
function textRouteSheet(value = '') {
  return `
    <section class="sheet textroute" data-tier="unknown" data-conf="reading" tabindex="-1">
      <span class="grabber" aria-hidden="true"></span>
      ${backButton()}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('asking', 'text_route_prompt', {}, { size: 64 })}
        </div>
        <h2 class="vword" style="font-size:20px">${escapeHtml(t('cam_name_it'))}</h2>
        <form class="textroute-form" data-form="textroute">
          <input type="text" inputmode="text" autocomplete="off" placeholder="${escapeHtml(t('cam_brand_model_placeholder'))}"
                 value="${value.replace(/"/g, '&quot;')}" data-textroute-input>
          <button type="submit" class="iconbtn-inline" aria-label="${escapeHtml(t('cam_search'))}">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </button>
        </form>
      </div>
    </section>`;
}

/**
 * Whether typed text names one of the catalogue's own items closely enough to
 * proceed. Matched against the catalogue endpoint (OLMA audit row 88: brand
 * and model give the closest match), never against the pricing engine, so a
 * miss costs nothing and never spends a request the way `/api/price` would.
 */
function matchCatalogue(text, catalogueItems) {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const it of catalogueItems) {
    const label = it.label.toLowerCase();
    const score = words.filter((w) => label.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  // Needs to hit at least as many significant words as it would take to be a
  // repair rather than a coincidence. One shared word ("the", already
  // filtered, or a brand alone) is not a match; brand and model together is.
  return bestScore >= Math.min(2, words.length) ? best : null;
}

/**
 * Case- and accent-insensitive equality, so "Häagen-Dazs" (the catalogue's
 * clean `brands` field) and "HAAGEN-DAZS" (a scraped retailer title's own
 * casing of the same word) compare equal. `String.includes`/`startsWith`
 * alone do not: they compare code points, and an accented letter is a
 * different code point from its bare form.
 */
function normalizeForCompare(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Brand, name and size, without repeating the brand when the name already
 * leads with it.
 *
 * D-014: a catalogue row's `name` is sometimes the scraped retailer page
 * title verbatim, which already opens with the brand in its own casing --
 * "HAAGEN-DAZS Extraz Strawberry Cheesecake Ice Cream, 450 ml" against a
 * clean `brands` field of "Häagen-Dazs". A plain case-insensitive substring
 * check treated those as two different strings, because of the accent, and
 * prepended the clean brand onto a name that already carried it: "Häagen-Dazs
 * HAAGEN-DAZS Extraz Strawberry Cheesecake Ice Cream, 450 ml". Comparing
 * through `normalizeForCompare` on both sides fixes that: when the name
 * (accent- and case-folded) starts with the brand, the brand is not said
 * twice. When it does not, the catalogue's brand is the only source of that
 * fact and leads the label -- this is "catalogue brand + name + size when the
 * catalogue row is joined"; a caller with no `product` (no catalogue row) has
 * nothing to pass here and falls back to whatever raw text it has instead.
 */
/**
 * The product's own name, in the language the shopper is reading.
 *
 * `nameFr` is a REAL FRENCH NAME off the catalogue row, not a translation of
 * `name`: catalogue/src/schema.ts keeps `name_en` and `name_fr` as separate
 * columns because whoever published the row wrote both, and what is on the bag
 * in a Quebec aisle is not what a translator would produce from the English.
 * So French prefers it and falls back to `name`, which is what most rows have
 * and what every row has.
 *
 * English never reads `nameFr`, even when `name` is missing: showing a French
 * product name to an English reader because the English column happened to be
 * empty is a worse answer than the row's own `name`, and `name` is never null.
 */
function displayName(p) {
  const fr = (p.nameFr ?? '').trim();
  if (locale() === 'fr' && fr) return fr;
  return (p.name ?? '').trim();
}

function productLabel(p) {
  const parts = [];
  const brand = (p.brands ?? '').split(',')[0].trim();
  const name = displayName(p);
  const brandLeadsName = brand !== '' && normalizeForCompare(name).startsWith(normalizeForCompare(brand));
  if (brand && !brandLeadsName) parts.push(brand);
  parts.push(name);
  if (p.quantity && !normalizeForCompare(name).includes(normalizeForCompare(String(p.quantity)))) {
    parts.push(p.quantity);
  }
  return parts.join(' ');
}

/**
 * One row for a candidate list: a title (name + size) and a meta line (the
 * brand, or the category when the brand had to move into the title instead).
 *
 * The photo route's vision-model candidates and the typed route's "not
 * this?" candidates used to build a row each in its own way and disagreed:
 * the photo list said "Kraft Kraft Dinner 4080 g" with a second "KRAFT"
 * underneath it, brand in both the title and the meta. This is the one place
 * either list decides what a row says, so they cannot diverge again. The
 * dedupe rule is `productLabel`'s own (accent- and case-insensitive, name
 * leads): when the name already opens with the brand, the title is just name
 * and size and the brand moves down to the meta line, said once. When it does
 * not, the row has nowhere else to put the brand and still name the product,
 * so the brand leads the title instead, and the meta line falls back to the
 * category (or nothing) rather than repeating the brand that is now in the
 * title already.
 */
function candidateRow({ brand, name, size, category } = {}) {
  const b = (brand ?? '').trim();
  const n = (name ?? '').trim();
  const s = size ? String(size).trim() : '';
  const brandLeadsName = b !== '' && normalizeForCompare(n).startsWith(normalizeForCompare(b));
  const title = brandLeadsName ? [n, s] : [b, n, s];
  return {
    label: title.filter(Boolean).join(' '),
    meta: brandLeadsName ? b : (category ?? ''),
  };
}

/** Brand, name and size off a photo-route candidate row (`{ brand, name, size }`), through the same rule `candidateRow` uses everywhere else. */
function photoCandidateLabel(c) {
  return candidateRow({ brand: c?.brand, name: c?.name, size: c?.size }).label;
}

/* Exported for the sheet-layout check, which is `app/test/sheet.test.mjs` as of
   2026-09-06 (this comment named `scripts/check-sheet.mjs` for two commits and
   that file was never written). It renders every sheet outside the browser and
   asserts by string that the peek detent carries a primary action before any
   half-detent markup, that a refusal carries exactly one action and is never
   tier-red, and that nothing focusable is hidden behind `aria-hidden`.
   Exporting these changes nothing about how the screen itself calls them. */
export { verdictSheet, refusalSheet, pricePadSheet, goingRateCard, workingSheet, textRouteSheet };
// The Gemini answer, its plain failure state, and the one test that tells them apart.
export { geminiSheet, geminiFailureSheet, geminiFailed };

/* The shop shortlist joins them 2026-09-13, same reason: `padShopRow` and
   `storePickerSheet` are pure string builders, so app/test/shops.test.mjs can
   render them for real in both languages rather than asserting about the
   source that produces them. */
export { padShopRow, storePickerSheet };

/* `observationCard` joins them 2026-09-13. Same reason as the six above, and
   one more that is specific to it: the whole claim of that card is that it
   never renders a verdict, and the only way to hold a never is to render it
   and look. See `app/test/price-only.test.mjs`. */
export { observationCard };

/* Exported with them 2026-09-08, when "not this?" gave the ranked search its
   first caller. It is in the same check for the same reason: it is a sheet, and
   the one rule it has of its own -- an empty list says so in a sentence rather
   than drawing an empty box -- is only true if something asserts it. */
export { searchCandidateSheet };

/* Exported 2026-09-10 for the D-014 label test: `productLabel` decides what a
   catalogue row is called on the verdict and the pad, and `candidateRow`
   decides what a candidate-list row says, in both the photo and typed
   candidate lists. Neither is browser-only; both take plain data and return a
   string, so both are asserted directly rather than by source-scanning. */
export { productLabel, candidateRow };

/* Exported 2026-09-09 for `app/test/refusal-voice.test.mjs`, D-011's app half.
   The list it reads is the seam between this file and the engine's closed
   RefusalReason union, and a seam nothing asserts is how the last three codes
   went missing from it. The check reads the union out of spine's contract, so
   the next code added there fails here rather than shipping as
   "could not identify it" over a screen full of prices. */
export { isThinReason };

/*
 * Exported for the correction screen (correct.js), which had its own copy of
 * both of these. The keypad is one component with two hosts; see keypadHtml's
 * own comment for what the camera's pad keeps for itself and why the bare
 * `.key` class is gone. `parsePadPrice` travels with them because a pad that
 * renders the same digits and reads them back differently is the same
 * duplication one layer down.
 */
export { keypadHtml, pricePadDisplay, parsePadPrice, padAmountHtml, padSeparator };

/*
 * Exported 2026-09-13 with the leaf/parent swap rule. `cheaperList` is a pure
 * string builder over the alternatives the server returned, and the two things
 * it must never get wrong -- a parent swap labelled as a plain substitute, and
 * a swap with NO ring labelled as looser -- are only holdable by rendering
 * them. `ringOf` travels with it because "missing is leaf" is the rule, not an
 * implementation detail of the renderer, and `humaniseTag` because a raw
 * "en:apples" on the glass is D-011's shape. See app/test/cheaper-rings.test.mjs.
 */
export { cheaperList, ringOf, humaniseTag };

/* ------------------------------------------------------------------ screen */

export default {
  id: 'camera',
  title: 'Shin',

  render(root, ctx) {
    // The two sheet-filling helpers above sit outside this method because the
    // sheet builders do, and they need the same API this render was handed.
    ctxApi = ctx.api;
    /*
     * Item 11a, the other half. `main.js` already warms the cell on app start
     * when location consent carries over from an earlier session; this covers
     * the case that misses, which is most of them -- a fresh install (consent
     * now defaults on, so this is the very first ask) and a session where
     * consent was switched on from the You screen and the camera was already
     * open. The camera screen is also the one place in the app "why is Shin
     * asking for my location" has an obvious answer on screen, which is the
     * only reason a permission prompt is ever the right moment to fire one.
     * Never awaited: a slow or denied OS prompt must not hold up the
     * viewfinder (same rule main.js states for its own call).
     */
    if (store.consent().location) void refreshCell();
    root.innerHTML = `
      <div class="cam" data-state="idle">
        <!-- FLAWS.md item 12: every other screen has an h1 and this one had no
             heading element at all, so a screen reader's heading list skipped
             the app's main surface entirely and router.js has nothing to move
             focus to after a paint. Visually hidden because the wordmark below
             is already the visible identity and a second one drawn over a live
             feed would be chrome for its own sake. -->
        <h1 class="sr-only" tabindex="-1">${escapeHtml(t('cam_label'))}</h1>
        <div class="feed">
          <video class="feed-video" playsinline muted autoplay></video>
          <div class="feed-fallback" aria-hidden="true">
            <span class="shelf s1"></span><span class="shelf s2"></span><span class="shelf s3"></span>
          </div>
          <span class="feed-vignette" aria-hidden="true"></span>
          <!-- The focus wash: the frame at full brightness, the rest of the
               feed a quarter darker, at idle only. Drawn here rather than on
               the reticle because it belongs to the picture, not to the mark
               over it; camera.css has the shape of it. -->
          <span class="feed-focus" aria-hidden="true"></span>
        </div>

        <!-- The torch, the wordmark, and a spacer that balances it. Nothing
             else lives in this band: the settings icon that used to sit up here
             duplicated the one in the bottom bar, the top right corner of a
             camera is the hardest place on the phone for a thumb to reach, and
             Shin's own dock moved down under the frame it talks about. -->
        <div class="cam-top">
          <button type="button" class="torch-btn" data-act="torch" aria-label="${escapeHtml(t('cam_torch'))}" aria-pressed="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/></svg>
          </button>
          <span class="wordmark">shin<i>.</i></span>
          <span class="cam-top-spacer" aria-hidden="true"></span>
        </div>

        <div class="reticle" aria-hidden="true"><b></b><b></b><b></b><b></b></div>

        <!-- Everything the eye draws over the feed that is not the reticle: the
             other objects it found, as buttons you can tap to scan one of them
             instead, and the mark on a barcode it is part way through reading.
             Both are created and positioned by eye-attach.js and both are empty
             when there is nothing to say, which is most of the time. -->
        <div class="frame-marks" data-slot="marks"></div>

        <!-- Shin docked under the frame, above the bottom bar: the aim hint, the
             escalated hint, the torch acknowledgement, the second-visit callback
             and the identifying morph all happen in this one component, never a
             second face competing with it. It reads as the caption to the frame
             because that is what it has always been saying. -->
        <div class="cam-shin" data-slot="cam-shin"></div>

        <div class="sheet-slot"></div>

        <!-- The two nav destinations now say their own names. The aria-labels
             are unchanged and still win as the accessible name, so the word
             under the glyph and the word a screen reader reads are the same
             one rather than two descriptions of the same button. -->
        <div class="cam-bar">
          <button type="button" class="nav-btn" data-act="watchlist" aria-label="${escapeHtml(t('nav_saved'))}">
            <span class="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </span>
            <span class="nav-badge" hidden></span>
            <span class="nav-label" aria-hidden="true">${escapeHtml(t('nav_saved'))}</span>
          </button>
          <!-- No mode to pick first (owner, 2026-09-19: "simply click the scan
               button to scan barcode and photo button to take photo"). The
               middle of the bar is three icon buttons, always there: the
               barcode, the shutter and, smaller, the typed-name search. The
               eye decodes every frame at idle either way, so the barcode
               button only asks it for the code it has already voted on, and
               nothing is sent until a button is pressed (rule 2 stands).
               The barcode button gets the is-ready class while a vote has a winner. -->
          <button type="button" class="scan-code-btn" data-act="scan-barcode" aria-label="${escapeHtml(t('cam_scan_barcode'))}">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M8 8v8M12 8v8M16 8v8"/></svg>
          </button>
          <button type="button" class="shutter" data-act="shoot" aria-label="${escapeHtml(t('cam_shutter'))}">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </button>
          <!-- W30's Manual Search, now a small keyboard button: it opens the
               same typed-name field the type-it route uses. -->
          <button type="button" class="type-btn" data-act="manual-search" aria-label="${escapeHtml(t('cam_mode_manual'))}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>
          </button>
          <button type="button" class="nav-btn" data-act="you" aria-label="${escapeHtml(t('nav_you'))}">
            <span class="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
            </span>
            <span class="nav-label" aria-hidden="true">${escapeHtml(t('nav_you'))}</span>
          </button>
        </div>
      </div>`;

    const cam = root.querySelector('.cam');
    const slot = root.querySelector('.sheet-slot');
    /* FLAGS.photoId off (docs/mvp-plan.md): no photo button. Taken out of the
       live DOM rather than out of the template above, so the markup (and every
       test that pins it) is exactly what switching the flag back on restores. */
    if (!FLAGS.photoId) root.querySelector('.cam-bar .shutter')?.remove();
    const video = root.querySelector('.feed-video');
    const badge = root.querySelector('.nav-badge');
    const camShin = root.querySelector('.cam-shin');

    let stream = null;
    let eye = null;
    let lastCrop = null;
    let scenarios = [];
    let catalogueItems = [];
    let supportedCategories = [];
    let last = null;      // { result, scenario, thumb }
    /*
     * THE SERVER'S OWN ID FOR THE SCAN ON SCREEN, or null. 2026-09-13.
     *
     * `/api/identify` and `/api/identify/photo` both return `scanId`, and the
     * photo route returns it ON ITS FAILURE PATHS TOO, on purpose: a photo
     * that could not be read still wrote a durable row, and that row is the
     * only thing a price with no product can be attached to. Held here so the
     * price route out of a refusal has somewhere to send the number.
     *
     * Cleared by `reset()` with everything else. A scan id belonging to the
     * previous scan is exactly the kind of quietly-wrong attachment this file
     * clears `coachKey` and `scanThumb` to avoid: it would file this aisle's
     * price against the last aisle's photo.
     */
    let lastScanId = null;
    /*
     * THE PRICE QUERY THE SERVER ALREADY STARTED A SEARCH UNDER. 2026-09-15.
     *
     * `/api/identify` and `/api/identify/photo` both begin the price search in
     * the background the moment they name a product, filed under the exact
     * `{ text, gtin }` they echo back here. `/api/price` collects that search
     * by rebuilding the same key, so this object has to travel back untouched.
     *
     * Rebuilding it here instead is what used to happen and it is the defect:
     * `productLabel()` drops the brand when the name already begins with it
     * and appends the pack size, so the two strings differed and every scan
     * paid for a second search that the shopper then waited on.
     *
     * Same lifecycle as `lastScanId`, and cleared by `reset()` with it for the
     * same reason: the previous aisle's query would collect the previous
     * aisle's search.
     */
    let lastPriceQuery = null;
    /* The server's price-match line for this scan, off the identify response
       (2026-09-21). Only there when the request carried a store name and a
       shelf price. Shown on the answer as it arrived; see `priceMatchBlock`. */
    let lastPriceMatch = null;
    let dead = false;
    // When the eye or the plain camera actually went live, for "ms since
    // camera start" on a barcode read (track.js). Null until one of the two
    // `attachEye(...).then` branches below sets it, and a barcode read before
    // either lands (never observed, kept here rather than assumed away) reads
    // as an honest null instead of a negative number.
    let cameraStartedAt = null;
    // When the type-it route is open with nothing submitted yet, so that
    // leaving it (cancel, Escape, or navigating away entirely) can be told
    // apart from submitting it. Set true by the `typeit` action, set false by
    // either the submit handler or the abandonment check in `reset()` --
    // never both, so a submission is never double-counted as an abandonment.
    let typedSearchPending = false;
    // The moment `cam.dataset.state` last changed, so a scan left mid-way
    // (backgrounded, or the screen torn down by navigation) can report how
    // long the person spent in whatever state they left it in. Set from
    // inside `setState` itself, which is the one place a transition is known.
    let stateEnteredAt = Date.now();
    // Item 10: router.go re-renders into the same rootEl on every
    // navigation, but rootEl itself is never replaced, only its innerHTML.
    // Every one of this render's own root.addEventListener calls below used
    // to stay live forever, uncancelled, so a second visit to the camera
    // stacked a second click/pointerdown/pointerup/input/submit listener on
    // top of the first (still-referencing-detached-nodes) one instead of
    // replacing it. Harmless most of the time, since the stale listener's
    // own `dead` guard (this render's cleanup below sets it) makes its
    // delayed work no-op -- but two listeners racing the same real pointer
    // event on the same live target is exactly the kind of thing that can
    // swallow a tap under the wrong timing, and it is unconditionally wrong
    // regardless. One AbortController per render; its signal goes on every
    // listener this render owns, and the cleanup aborts it, so a screen
    // reached the sixth time behaves identically to the first.
    const listeners = new AbortController();
    let torchOn = false;
    let hintEscalated = false;
    let hintTimer = null;
    let torchAckTimer = null;
    let secondVisitShown = false;
    /** Item 9: set once `startCamera` resolves to a denied permission, read
        and cleared by `showInitialIdleContent`'s first paint so the docked
        face says so exactly once, the same way `secondVisitShown` gates its
        own one-time line. */
    let cameraDenied = false;
    /* What the current refusal would keep, or null. Held here rather than read
       off the DOM because the price and the shop are facts about the scan, not
       about the markup, and a button cannot be trusted to carry money. */
    let lastKeepable = null;
    let scanThumb = null;
    let coachKey = null;
    let camShinEl = camShin ? camShin.querySelector('.shin-say') : null;
    /* Decision 15: a stable barcode is truth and never competes with a photo
       for the same capture. Set the instant a barcode read begins, so a crop
       that lands in the same narrow window `onCapture` does not start the
       photo route underneath a barcode already being resolved. Cleared by
       `reset()`, which is every path back to idle. */
    let barcodeInFlight = false;
    /** Item 8: epoch ms of the last capture that actually started (shutter or a
        sent barcode read), or 0 before the first one this screen. Read by
        `captureAllowed`. Deliberately NOT cleared by `reset()`: the gap this
        closes is exactly the tap that lands the instant `reset()` puts the
        state back to `idle` (failure.md D8.5), so the interval has to survive
        the reset that would otherwise waive it. */
    let lastCaptureAt = 0;
    /** Item 9: the live countdown repainting a rate-limited refusal's own
        detail line once a second, or null while none is showing. Cleared by
        `reset()` and by this render's own teardown, same as every other timer
        here. */
    let retryCountdownTimer = null;
    /** The code the current scan came from, when a barcode started it. */
    let scanBarcode = null;
    /** The code the eye's vote has settled on (the button is showing for it), or null. */
    let barcodeReady = null;
    /** The shelf price typed at scan time, in cents, or null when skipped or not yet asked. Cleared by `reset()`. */
    let scanShelfCents = null;
    /*
     * `leftBarcode` and `REREAD_QUIET_MS` were DELETED here, 2026-09-15.
     *
     * They were a ten-second quiet window on the code the shopper had just
     * backed out of, and they only ever existed because the camera read
     * whatever was in front of it: come back to the viewfinder with the same
     * package still in frame and it re-read it within a few frames and dropped
     * the shopper on the same answer they had just left.
     *
     * Rule 2 removes the cause. A read now happens only when "Scan the
     * barcode" is pressed, so the same code in frame does nothing at all until
     * the shopper asks for it -- and when they do ask for it, having just
     * looked at it, they mean it. A quiet window would now be the app refusing
     * a button press, which is the opposite defect.
     */
    /*
     * There is no scan mode any more (2026-09-19): the barcode button, the
     * shutter and the keyboard button are all always there, and each one is its
     * own scan. Rule 2 is untouched: the eye decodes at idle, but a read only
     * leaves it when the barcode button is pressed. What survives of the old
     * mode is this one flag, set when the keyboard button opens the name field,
     * so the submit knows to ask the shelf price first (W30's Manual Search)
     * where the type-it route out of a refusal identifies first.
     */
    let manualSearch = false;
    /** The line that answers a barcode press with nothing read, put back to the aim hint when it runs out; the scan clears it. */
    let scanPressTimer = null;
    /** D-026's caller, started once below. The teardown `startCaptureQueue`
        returns, held so the render's own cleanup can call it. */
    let stopCaptureQueue = () => {};

    /*
     * The eye first, the old plain camera second.
     *
     * The eye is what makes the reticle land on the object rather than sit in
     * the middle of the frame waiting to be lined up with, and it is what reads
     * a barcode without anybody pressing anything. When it cannot start, for a
     * denied permission or a browser that will not run it, the screen falls
     * back to exactly the camera it had before and every control stays where it
     * is. Neither branch is an error path.
     */
    attachEye(video, {
      reticle: root.querySelector('.reticle'),
      marks: root.querySelector('.frame-marks'),
    }, {
      // Item 11: the user's torch setting, read now; changing it on the You
      // screen takes effect the next time this screen mounts.
      torch: { mode: store.get().torchMode, threshold: store.get().torchThreshold },
      barcodeMode: true,
      // Item 7: the vote has a winner (or lost it). Shows the button; sends nothing.
      onBarcodeReady,
      /*
       * A read can only arrive because the shopper pressed "Scan barcode": the
       * eye decodes every frame and votes, and tells the screen when a code has
       * a majority (`onBarcodeReady`, which only shows the button), but it emits
       * `onBarcode` from `scanBarcode()` alone, the button's press. So there is
       * no unsolicited read to filter and results never pop up on their own.
       *
       * The idle gate stays: the ordinary "a sheet is up, this screen is busy"
       * guard every handler in this render has.
       */
      onBarcode: (read) => {
        if (dead || cam.dataset.state !== 'idle') return;
        onBarcode(read);
      },
      onTorch: (on) => { if (!dead) setTorch(on); },
      /*
       * The measured coaching line, which is the only kind that gets said.
       *
       * It arrives already gated: the eye has held the condition for the best
       * part of a second, has already tried whatever it can do itself about
       * it, and will not send another for at least the length of time this one
       * takes to read. So the screen's whole job is to put it in the mouth of
       * the face that is already docked there, and to put the ordinary aim
       * hint back when it clears. Never a second surface, never a toast, and
       * never a list of rules before anything has gone wrong.
       */
      onCoach: (key) => {
        if (dead || cam.dataset.state !== 'idle') return;
        coachKey = key;
        if (key) {
          // A real problem outranks the four-second nothing-detected nudge,
          // and having something to say means the nudge is not the thing
          // wrong with this frame.
          clearTimeout(hintTimer);
          track('coaching_line_shown', { key });
          dockSay('asking', COACH_LINES[key], {}, 'nudge-arrive');
        } else {
          showAimHint();
          armHintEscalation();
        }
      },
      onCapture: (crop) => {
        if (dead) return;
        // The crop, not a centre square of the whole shelf. This is the frozen
        // frame the verdict later shows, and it is also what would be sent to
        // be read, so the two can never disagree about what was photographed.
        lastCrop = crop;
        thumbFromCrop(crop).then((url) => { if (!dead && url) scanThumb = url; });
        /*
         * ONLY A SHUTTER PRESS MAKES A CROP INTO A PHOTO SCAN, 2026-09-15,
         * reworded 2026-09-19 when the scan modes went. A barcode lives on the
         * BACK of the package, so the frame that reads one is a photograph of
         * the back -- the least identifiable side there is. Sending it to be
         * identified would spend an image call to be told nothing.
         *
         * Nothing routes an unbidden crop here today: `autoCapture` is passed
         * false in eye-attach.js. But `Camera`'s own default is
         * `options.autoCapture ?? TRUE` (app/src/eye/camera.ts), so the only
         * thing standing between the idle camera and a crop of the back of a
         * box is one `?? false` in another file. That is an accident of two
         * unrelated settings, not an invariant, so the invariant is written
         * down here where the crop is consumed: `shoot()` puts the screen in
         * `framing` before it asks the eye for the capture, and a crop that
         * arrives in any other state was not asked for by that press.
         */
        if (cam.dataset.state !== 'framing') return;
        // Decision 15: a stable barcode already answers. The manual shutter
        // will not fire while a barcode is already being handled -- this guard
        // is the belt for the narrow window where both can start within the
        // same tick.
        if (barcodeInFlight) return;
        void handlePhotoCapture(crop);
      },
    }).then((e) => {
      if (dead) { e.stop(); return; }
      eye = e;
      if (e.live) {
        cam.dataset.camera = 'live';
        cameraStartedAt = Date.now();
        track('camera_live', { drawn: false });
        showInitialIdleContent();
        startShelf();
        return;
      }
      startCamera(video).then(({ stream: s, reason }) => {
        if (dead) { stopCamera(s); return; }
        stream = s;
        // No camera is not a broken app. The drawn shelf carries the same layout
        // so every control stays exactly where it is.
        cam.dataset.camera = s ? 'live' : 'drawn';
        cameraStartedAt = Date.now();
        // Item 9: a denied permission and no-camera-at-all used to be one
        // `camera_drawn` event; `reason` is now the one that says which.
        track(s ? 'camera_live' : reason === 'denied' ? 'camera_denied' : 'camera_drawn', { drawn: !s, reason });
        cameraDenied = !s && reason === 'denied';
        showInitialIdleContent();
      });
    });

    // D-026: `startCaptureQueue` has been exported and called by nothing. A
    // photo taken with no signal is queued by the eye (decision 13) and has to
    // be drained by somebody once the network comes back; this screen is that
    // somebody, because it is the one place a queued crop can still become a
    // real answer. Started once per mount, torn down with the render's own
    // cleanup below.
    // FLAGS.photoId off: photos queued offline stay on the phone, unsent, until
    // the flag is back on.
    if (FLAGS.photoId) startCaptureQueue(sendQueuedCapture).then((stop) => {
      if (dead) { stop(); return; }
      stopCaptureQueue = stop;
    });

    /*
     * Continuous shelf capture (item 16, 2026-09-17): while the viewfinder is
     * idle and photo consent is on, a cropped picture of what the camera sees
     * is stored on the server every few seconds. Storage only, no model call;
     * throttled and consent-gated in src/eye/shelf.ts, and it stands down the
     * moment a scan, pad or answer is on screen. Started once the eye is
     * live, stopped with the screen.
     */
    let stopShelfCapture = () => {};
    const startShelf = () => {
      startShelfCapture({
        video,
        isBusy: () => cam.dataset.state !== 'idle',
        consentOn: () => store.consent().photos === true,
      }).then((h) => {
        if (dead) { h.stop(); return; }
        stopShelfCapture = () => h.stop();
      });
    };

    ctx.api.scenarios()
      .then((d) => { scenarios = d.items; })
      .catch(() => { scenarios = []; });

    // Row 88's catalogue match, for the text route out of a refusal. Fetched
    // once, up front, so a typed name resolves without spending a request the
    // way `/api/price` would.
    ctx.api.catalogue()
      .then((d) => { catalogueItems = d.items; })
      .catch(() => { catalogueItems = []; });

    // The category refusal's own repair (row: "the repair stays on the
    // sheet"): fetched once, up front, never re-fetched per refusal.
    ctx.api.categories()
      .then((d) => { supportedCategories = (Array.isArray(d) ? d : []).filter((c) => !c.unsupported).map((c) => c.label); })
      .catch(() => { supportedCategories = []; });

    function paintBadge() {
      const n = store.get().watchlist.length;
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    paintBadge();
    const unsub = store.subscribe(paintBadge);

    const camBar = root.querySelector('.cam-bar');

    /**
     * W30's Manual Search: the same name field the type-it route uses, opened by
     * the keyboard button. Submitting it asks the shelf price first (with the
     * validation or switching choice on the pad) and then sends the typed name
     * as ONE Gemini text call, through `runTypedSearch`. Idle only.
     */
    function openManualSearch() {
      if (cam.dataset.state !== 'idle') return;
      setState('texting');
      typedSearchPending = true;
      manualSearch = true;
      slot.innerHTML = textRouteSheet();
      mounted('[data-textroute-input]');
    }

    /**
     * Whether the eye is decoding frames: at idle, always. A sheet, a pad or an
     * answer on screen means nobody is aiming, and the decode is the heaviest
     * thing the loop does, so it stands down while a scan is under way (item
     * 16's "never slowing the scan" holds for this too). The shutter's photo
     * scan is not a decode either, so it stands down for that as well.
     */
    function syncDecoding() {
      const idle = !cam.dataset.state || cam.dataset.state === 'idle';
      eye?.setBarcodeMode?.(idle);
    }

    /** The barcode button is always there; it lights (`is-ready`) exactly when the vote has a winner, at idle. */
    function paintBarcodeButton() {
      const btn = root.querySelector('.scan-code-btn');
      if (!btn) return;
      const idle = !cam.dataset.state || cam.dataset.state === 'idle';
      btn.classList.toggle('is-ready', idle && Boolean(barcodeReady));
    }

    /**
     * The eye's vote settled on a code, or lost it. Never sends anything by
     * itself. `barcode_button_shown` keeps its name because the watcher and the
     * analytics already read it; it now means the button lit up, not appeared.
     */
    function onBarcodeReady(ready) {
      if (dead) return;
      const was = Boolean(barcodeReady);
      barcodeReady = ready;
      paintBarcodeButton();
      if (ready && !was) track('barcode_button_shown', { format: ready.format, frames: ready.frames });
    }

    /**
     * The barcode button pressed with no code settled to send. The old button
     * only appeared once there was one, so this press had no precedent; the
     * honest answer is the coaching line that says what to do, on the docked
     * face where every other measured line already lands, and then the aim hint
     * back. A measured line already on screen ("Barcode. Hold it there.", "Aim a
     * little left") is about this very frame and names a better next step than a
     * general one, so it is said again, visibly, instead of being talked over.
     */
    function sayNoBarcode() {
      clearTimeout(scanPressTimer);
      if (coachKey) {
        dockSay('asking', COACH_LINES[coachKey], {}, 'nudge-arrive');
        return;
      }
      clearTimeout(hintTimer);
      track('coaching_line_shown', { key: 'no_barcode' });
      // With the photo route off there is no other way in, so the line names
      // the one there is (docs/mvp-plan.md: "Point me at the barcode").
      dockSay('asking', FLAGS.photoId ? 'cam_no_barcode' : 'cam_point_barcode', {}, 'nudge-arrive');
      scanPressTimer = setTimeout(() => {
        if (dead || cam.dataset.state !== 'idle' || coachKey) return;
        showAimHint();
        armHintEscalation();
      }, 3500);
    }

    /**
     * The state, and with it whether the bottom bar is reachable at all.
     *
     * The bar slides away on `result` and `choosing` and is covered by the
     * sheet on `asking` and `texting`. In all four it was still in the tab
     * order: Tab out of the verdict sheet landed on three invisible buttons
     * (Saved, the shutter, You) with the focus ring drawn where nothing is,
     * and a stray Tab-and-Enter during price entry navigated away to Saved
     * mid-scan. Measured with elementFromPoint on the running app: during
     * `asking` the shutter's own centre returns no element at all, and all
     * three still took `focus()`.
     *
     * `inert` and not `visibility: hidden`, for two reasons. It leaves
     * `visibility` alone, so camera.css's slide-out animates exactly as it did
     * -- hiding it outright would make the bar vanish instead of slide, and
     * delaying the hide to the end of the slide is precisely what does not
     * work: both `visibility 0s linear var(--t-rise)` and
     * `visibility var(--t-rise) linear` were tried on the running app and left
     * the bar computing `visible`, with the shutter still focusable, four
     * seconds after the verdict landed. And `inert` is the primitive that
     * actually says the thing: this subtree is not interactive right now, in
     * the tab order and in the accessibility tree together.
     */
    function setState(next) {
      if (cam.dataset.state !== next) stateEnteredAt = Date.now();
      cam.dataset.state = next;
      const sheetUp = next === 'result' || next === 'choosing' || next === 'asking' || next === 'texting';
      if (camBar) camBar.inert = sheetUp;
      /*
       * The alternate-object buttons the eye draws are hidden by opacity while
       * a sheet is up (camera.css, `.frame-marks`), which hides them from the
       * pointer and not from the keyboard: they stayed real buttons with an
       * accessible name, Tab landed on them, the ring drew over nothing, and
       * pressing one did nothing because the click handler returns early off
       * `idle`. The same defect the cam-bar `inert` line above was written to
       * remove, in the one place it did not reach. `inert` covers both.
       */
      const marks = root.querySelector('.frame-marks');
      if (marks) marks.inert = next !== 'idle';
      paintBarcodeButton();
      syncDecoding();
      parkDockedFace(FACE_HIDDEN_IN.has(next));
    }

    /**
     * A scan started and never finished: task item 4's `scan_abandoned`. Read
     * `cam.dataset.state` rather than keeping a separate flag, because that
     * field is already the one thing every exit path (`reset`, this screen's
     * own teardown, backgrounding) can look at without threading a second
     * piece of state through all of them.
     *
     * `idle` AND `result` ARE BOTH EXCLUDED. `idle` is a finished or
     * never-started scan; `result` is the one non-idle state that already
     * carries an answer -- the identify verdict is on screen -- so closing it
     * (the done button, or `reset`'s other callers) is a finished scan, not
     * an abandoned one. Task item 4 asks for "mid-scan without an
     * answer/action", and by `result` the answer has already arrived.
     * Everything else (`framing`, `reading`, `choosing`, `asking`,
     * `texting`) is a scan with no answer yet -- the `reason` says which door
     * it left through.
     */
    function trackScanAbandonedIfMidScan(reason) {
      const state = cam.dataset.state;
      if (!state || state === 'idle' || state === 'result') return;
      track('scan_abandoned', { state, reason, msElapsed: Date.now() - stateEnteredAt });
    }

    /**
     * D-017. The docked face fades to `opacity: 0` in five of the camera's
     * states but stays mounted, so whatever it was last told to do keeps
     * running. Measured at the price pad: three `think-dots` circles on a
     * 900ms infinite loop, repainting for the whole interaction, none of it
     * visible. A phone held up in an aisle pays for that.
     *
     * Opacity is not a kill switch, so the fix is the one primitive that is:
     * `data-anim="none"`, which `face.css` answers with `animation: none
     * !important` on the face and every group inside it. setTorch already
     * writes exactly this attribute for the same reason (stillness the CSS has
     * to honour), and `animateFace` cannot be used because 'none' is not one of
     * the thirteen names it accepts.
     *
     * Written and cleared here rather than only written, because `dockSay`'s
     * sentinel clear only fires when something speaks. Coming back to the
     * viewfinder from a verdict does not always speak, and a docked face left
     * parked would sit still for the rest of the session.
     */
    function parkDockedFace(park) {
      if (!camShinEl) return;
      const f = camShinEl.querySelector('.face');
      if (!f) return;
      if (park) f.dataset.anim = 'none';
      else if (f.dataset.anim === 'none') f.dataset.anim = '';
    }

    /**
     * Row: second visit, useful and appealing. If the store has a past scan,
     * Shin's first bubble on this camera is a callback to it, not the aim
     * hint. Facts arrive already formatted; the verdict word reuses `wordFor`
     * so a returning "good"/"about right"/"walk away" reads in the same words
     * the verdict itself used.
     */
    function lastScanFacts() {
      const history = store.get().history;
      if (!history.length) return null;
      const h = history[0];
      const label = h.result?.identity?.label ?? h.query?.text ?? t('cam_that_item');
      const sellerName = h.result ? sellerOf(h.result) : null;
      const centsRaw = h.query?.askingCents ?? (h.result?.kind === 'verdict' ? h.result.askingCents : undefined);
      const word = h.result?.kind === 'verdict'
        ? wordFor(h.result.tier)
        : h.result?.kind === 'gemini' ? geminiWordFor(h) : t('cam_refused_word');
      return {
        item: label,
        seller: sellerName || '',
        asking: typeof centsRaw === 'number' ? money(centsRaw) : '',
        word,
      };
    }

    /**
     * Every update to the docked face's bubble goes through this rather than
     * calling updateShinSay directly. setTorch (below) is the one place
     * camera.js deliberately marks the mounted face `data-anim="none"`, for
     * the torch acknowledgement's stillness; morphFace's own rowSized gate
     * reads that same attribute to mean "this is a permanent face-row, never
     * animate again". Anything that moves the docked face on from that line
     * clears the sentinel first, or the docked face would freeze static for
     * the rest of the session.
     */
    function dockSay(state, key, facts, anim) {
      if (!camShinEl) return;
      const f = camShinEl.querySelector('.face');
      if (f && f.dataset.anim === 'none') f.dataset.anim = '';
      updateShinSay(camShinEl, state, key, facts, anim);
    }

    /** Whichever of the two idle lines is current: the plain hint, or the
        one-time escalation past four seconds of nothing detected. */
    function showAimHint(anim) {
      if (!camShinEl) return;
      // A measured line is on screen. It is about this frame, it names a thing
      // to do, and the generic hint would be talking over it.
      if (coachKey) return;
      if (hintEscalated) dockSay('asking', 'hint_escalated', {}, anim ?? 'nudge-arrive');
      else dockSay('idle', 'cam_aim_hint', {}, anim);
    }

    /*
     * Row 9, unprompted, once per camera session: four seconds live with
     * nothing detected escalates the hint's face and line. Cleared the
     * instant a scan starts (that is a detection); never re-armed once it
     * has fired, even across a reset back to idle. Only starts once the
     * plain aim hint is actually showing, i.e. after the second-visit
     * callback (if any) has already had its own six seconds.
     */
    function armHintEscalation() {
      clearTimeout(hintTimer);
      if (hintEscalated) return;
      hintTimer = setTimeout(() => {
        if (dead || hintEscalated || coachKey || cam.dataset.state !== 'idle') return;
        /* One of the two unprompted sources AVATAR.md section 3 allows, and
           the budget is asked before it speaks rather than after. If the
           answer is no it is dropped, never queued: the moment an unprompted
           line was for does not come back, and a line that arrives late is a
           worse interruption than the one that was skipped. */
        if (!store.canInterrupt()) return;
        hintEscalated = true;
        showAimHint('nudge-arrive');
        store.recordInterruption();
      }, 4000);
    }

    /**
     * What the docked face opens with once the camera has resolved (granted,
     * denied, or drawn): the second-visit callback for one appearance if the
     * store has history, otherwise straight to the aim hint. The callback
     * gives way to the aim hint after six seconds or on the first shutter
     * press, whichever comes first (`shoot()` clears `hintTimer` itself).
     */
    function showInitialIdleContent() {
      if (!camShinEl || dead) return;
      /* Item 9: a denied camera permission gets its own one-time line, ahead
         of the second-visit callback and the aim hint, the same shape both of
         those already use (fire once, then fall to the aim hint after six
         seconds or the first shutter press). */
      if (cameraDenied) {
        cameraDenied = false;
        dockSay('idle', 'cam_camera_denied', {}, 'idle-breath');
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => {
          if (dead || cam.dataset.state !== 'idle') return;
          showAimHint();
          armHintEscalation();
        }, 6000);
        return;
      }
      /* The other unprompted source. Same rule: ask first, and fall through
         to the aim hint (which is not unprompted, it is the resting state of
         a screen the user opened) if the budget is spent. */
      const facts = !secondVisitShown && store.canInterrupt() ? lastScanFacts() : null;
      if (facts) {
        secondVisitShown = true;
        dockSay('idle', 'cam_second_visit', facts, 'idle-breath');
        store.recordInterruption();
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => {
          if (dead || cam.dataset.state !== 'idle') return;
          showAimHint();
          armHintEscalation();
        }, 6000);
      } else {
        showAimHint();
        armHintEscalation();
      }
    }

    // Row 14: the one-sentence privacy line, shown while permission is being
    // asked (this promise is exactly that moment) and swapped out for the
    // real idle content the instant it resolves either way.
    if (camShin) {
      camShin.innerHTML = shinSay('idle', 'cam_privacy_line', {}, { size: 64 });
      camShinEl = camShin.querySelector('.shin-say');
    }

    /* Chrome, not a face (AVATAR.md row 10): the visibly lit scene is the
       torch's own feedback (OLMA audit row 90), the icon just says which
       state it is in. The docked face gets one short acknowledgement line,
       then returns to whatever hint it was already showing. */
    /*
     * The torch button asks the camera hardware first and reflects what
     * actually happened, rather than lighting the icon and hoping. A phone with
     * no torch is common and is not a failure the user hears about: the icon
     * simply does not latch. When the eye is not running, the old behaviour
     * stands, because the drawn shelf has a torch state too.
     */
    function requestTorch(on) {
      if (eye?.live) {
        eye.setTorch(on).then((worked) => { if (!dead && !worked) setTorch(false); });
        return;
      }
      setTorch(on);
    }

    /*
     * A barcode ends the guessing. It arrives without a shutter press, so the
     * screen jumps straight from idle to the working state with an identity
     * already in hand and no candidate list to choose from: there is nothing to
     * choose between when the package told us what it is.
     */
    async function onBarcode(read) {
      // Decision 15, the other half: raised before anything else so a photo
      // capture landing in the same window defers to the code. `reset()`
      // lowers it again on the way back to idle.
      barcodeInFlight = true;
      scanBarcode = read.value;
      clearTimeout(hintTimer);
      clearTimeout(scanPressTimer);
      clearTimeout(torchAckTimer);
      coachKey = null;
      scanThumb = captureThumb(video, cam.dataset.camera === 'live');
      // The shutter log's own pattern (shoot(), 2026-09-13), now on a barcode
      // read too: the whole frame goes to the server the same way a shutter
      // press's frame does, and every request this read causes carries the id
      // (server.ts's recordShutterRequest), so a barcode scan leaves a frame
      // on the server the same as a photo scan does. Collecting everything
      // means a barcode read is no longer the one path that leaves nothing
      // behind but the decoded code.
      ctx.api.beginShutter?.(video);
      track('barcode_read', {
        value: read.value,
        format: read.format,
        frames: read.frames,
        msSinceCameraStart: cameraStartedAt === null ? null : Date.now() - cameraStartedAt,
      });
      // THE SHELF PRICE IS ASKED NOW, before anything is identified (item 10,
      // 2026-09-17): "asking the user for the price as soon as they scan instead
      // of waiting for a product identification first. This way, the price can
      // get sent to gemini along with the rest of the prompt." The scan request
      // is sent when the pad is confirmed or skipped (`submitScanPrice`), and it
      // carries the price. Skipping still gets an answer.
      askPriceFirst({ kind: 'barcode', code: read.value });
    }

    /**
     * The pad, opened at scan time with nothing identified yet. The item on it
     * is only a caption (the digits, or "what you photographed"); the scan
     * request itself waits on the pad so the price can ride in it.
     */
    function askPriceFirst(pending) {
      scanShelfCents = null;
      openPad({
        id: null,
        text: pending.kind === 'barcode' ? pending.code : pending.kind === 'text' ? pending.text : t('cam_what_you_photographed'),
        category: null,
        gtin: pending.kind === 'barcode' ? pending.code : null,
        notThisQuery: null,
        pendingScan: pending,
      });
    }

    /**
     * The pad was confirmed (`cents`) or skipped (`null`) on a pending scan:
     * NOW the scan request goes out, carrying the price when there is one.
     */
    function submitScanPrice(cents) {
      const pending = padItem?.pendingScan;
      if (!pending) return;
      scanShelfCents = typeof cents === 'number' && cents > 0 ? cents : null;
      /*
       * WHAT THIS SCAN IS FOR, sent with every call it makes (api.js
       * `setScanIntent`). `mode` is the user's own pick on the pad (row 25),
       * or what they always got: validation with a price, switching without.
       * `hint` is W30's Price Tag hint, sent with every shutter photo (the
       * camera button is the only photo route): the picture is a shelf tag, so
       * Gemini reads the tag's name and price. Cleared by `reset()`.
       */
      const altMode = effectiveAlt(scanShelfCents);
      ctx.api.setScanIntent?.({
        mode: altMode,
        ...(pending.kind === 'photo' ? { hint: 'price_tag' } : {}),
      });
      track('scan_price_at_scan', { typed: scanShelfCents !== null, kind: pending.kind, mode: altMode });
      if (pending.kind === 'barcode') void resolveBarcode(pending.code, scanShelfCents);
      else if (pending.kind === 'text') void runTypedSearch(pending.text, scanShelfCents, true);
      else void resolvePhoto(pending.crop, scanShelfCents);
    }

    /** The barcode's identification and answer, once the price question is settled. */
    async function resolveBarcode(code, cents) {
      const myGen = ++gen;
      slot.innerHTML = '';
      dockSay('thinking', 'reading', {}, 'think-dots');
      setState('framing');

      /*
       * The real catalogue, 5.18 million products, asked directly. This costs
       * about 2 ms and nothing else in the app is allowed to slow it down: it
       * is the unlimited free path, and on a packaged grocery item it settles
       * what the thing is before the shutter is ever pressed.
       */
      let found = null;
      try {
        /*
         * `value`, not `text`. A StableRead is { value, format, box, frames }
         * and has never carried a `text`; that was the name of the raw zxing
         * field, one layer down, before the GTIN was pulled out of it. Reading
         * the wrong one here cost the whole barcode path silently: undefined
         * went to identify, identify with no gtin answers 400, the throw was
         * swallowed by the catch below, and every successful scan landed on
         * "read fine, we have never seen it" while the catalogue sat there
         * holding the product. Nothing threw and nothing logged, which is why
         * it survived the commit that was meant to turn this path on.
         */
        found = await catalogueLookup(code, cents);
      } catch {
        found = null;
      }
      // Cancelled (reset bumps `gen`) while the lookup was out: paint nothing.
      if (dead || myGen !== gen) return;

      /*
       * Item 9: a real throttle, never shown as the offline sentence below.
       * Checked first because a rate-limited response never carries
       * `needsConnection`, `product` or `unchecked` either. Reuses the same
       * refusal painter the photo route uses for its own rate limit
       * (`showPhotoRefusal`), rather than a second sheet shape: one more
       * `.sheet.refusal` variant is one more screen-tags.js entry to keep in
       * step with docs/screen-tags.md, for a surface that reads identically
       * either way.
       */
      if (found?.rateLimited) {
        showPhotoRefusal('rate_limited', retryCountdownLine(found.retryAfterSeconds));
        startRetryCountdown(found.retryAfterSeconds);
        return;
      }

      // The weekly free scans are used (402 scan_limit): the subscription screen.
      if (found?.scanLimit) { openPaywall(found.scanLimit); return; }

      /*
       * No connection (beta gap item 21, his word "the app will not be usable
       * offline"): say so, in one plain sentence, and stop. Nothing is named
       * and nothing is sent on to be priced. `offline-aisle.js` says why.
       */
      if (found?.needsConnection) {
        slot.innerHTML = needsConnectionSheet();
        playRefusalLanding(slot);
        setState('result');
        mounted();
        return;
      }

      if (found) {
        /*
         * `scannedGtin` carries the code the package itself published, and only
         * ever from here. The price judge scores a barcode-resolved identity at
         * 0.81 and a name-resolved one at 0.64, and the grocery floor sits
         * between them, so the same product comes back as a verdict when the
         * code travels and as "not sure enough this is the right groceries" when
         * only the words do. Measured on Lay's Classic Potato Chips: with the
         * code, walk_away against $3.47 at Walmart; without it, identity_unsure
         * on the identical row.
         *
         * It is deliberately not `item.gtin`, which the typed route also sets
         * from a catalogue match on words alone. Passing that one would hand the
         * judge barcode-grade certainty for a guess, which is the same error
         * pointing the other way and the worse of the two.
         */
        // The price the shopper typed at scan time, or none (skipped, which
        // still gets the going-rate answer). Never asked a second time.
        proceed({ ...found, scannedGtin: code }, cents ?? undefined);
        return;
      }

      // Read fine, and we do not have it. Decision 22's sentence, not a failure
      // of the camera and not shown as one.
      setState('choosing');
      track('candidates_shown', { source: 'barcode_miss', count: scenarios.length });
      slot.innerHTML = candidateSheet(scenarios);
      mounted();
    }

    /**
     * A barcode to something `proceed` can price, or null.
     *
     * Falls back to the hand-priced demo shelf when the catalogue is not
     * attached, so the app still demonstrates itself on a machine that does not
     * have the 3.47 GB file sitting next to it.
     */
    async function catalogueLookup(code, shelfPriceCents) {
      /*
       * The priced shelf first, for the same reason the typed route asks it
       * first: a product somebody has actually recorded a price for produces a
       * verdict, and a catalogue row nobody has priced produces a refusal.
       * None of the seven carries a barcode today, so this never fires yet, and
       * it is here so that the day one does, the barcode reaches the price
       * rather than walking past it.
       */
      const priced = catalogueItems.find((i) => i.gtin && sameCode(i.gtin, code));
      if (priced) return priced;

      /*
       * The server first, always, because it is the only one of the two that
       * can carry a category and therefore the only one that can lead to a
       * verdict. The pack is the floor under it, not a faster path around it.
       */
      let id = null;
      try {
        id = await ctx.api.identify({ gtin: code, shelfPriceCents });
        // The row the server just wrote for this scan. Kept whatever the
        // answer was: a refused identification is exactly the case the
        // price route below exists for.
        if (Number.isInteger(id?.scanId)) lastScanId = id.scanId;
        // The query the server already started a price search under. Held
        // exactly as it arrived; see `lastPriceQuery`.
        lastPriceQuery = id?.priceQuery ?? null; lastPriceMatch = id?.priceMatch ?? null;
      } catch {
        id = null; // No signal. The aisle this app was built for.
      }

      /*
       * Item 9: a real server throttle on the barcode route, not a dead
       * connection. Before `identify()` carried its own 429/413 branch this
       * had no failure field at all, so a rate limit here fell through to
       * `id === null` below and was shown as "no connection" (failure.md
       * D9.1/D9.5). Checked before the unchecked/product/offline branches
       * because none of those fields exist on a throttled response.
       */
      if (id?.failure === 'rate_limited') {
        return { rateLimited: true, retryAfterSeconds: id.retryAfterSeconds ?? null };
      }
      /* The weekly limit (2026-09-21): the server said no on purpose, so the
         pack below must not answer instead. */
      if (id?.failure === 'scan_limit') return { scanLimit: id };

      /*
       * Two ways to end up with nothing from the server, and the pack can help
       * with both: the request never landed, and the catalogue is not attached
       * to the server at all. The third way, `catalogueUp` with no product, is
       * the catalogue saying it has never seen this code -- and the pack is a
       * slice of that same catalogue, so it cannot know better. Asking it there
       * would only spend time to be told the same thing.
       */
      /*
       * 2026-09-15: a code the catalogue does not know, NAMED BY A WEB SEARCH,
       * goes on to be priced as that name, labelled unchecked. Jamin: "Having
       * a response that is not checked is infinitely better than having the
       * user scan something, wait 10 seconds, only to get told the app
       * doesn't know".
       */
      if (id && !id.product && id.unchecked?.label) {
        return {
          id: null,
          text: id.unchecked.label,
          category: id.category ?? null,
          gtin: code,
          unchecked: true,
        };
      }

      if (id && id.catalogueUp && !id.product) return null;

      if (id?.product) {
        return {
          id: id.product.code,
          text: productLabel(id.product),
          category: id.category,
          categoryWhy: id.categoryWhy,
          gtin: id.product.code,
        };
      }

      /*
       * 2026-09-19 (beta gap item 21): no request that reached the server means
       * no answer. `identifyOffline` no longer looks anything up; it returns
       * the "needs a connection" marker, and only when the request itself
       * failed. A server that DID answer without a product is not a missing
       * connection and falls through to the candidate sheet as before.
       */
      return id === null ? identifyOffline(code) : null;
    }

    function sameCode(a, b) {
      const n = (s) => String(s).replace(/\D/g, '').replace(/^0+/, '');
      return n(a) === n(b);
    }

    function setTorch(on) {
      torchOn = on;
      cam.dataset.torch = on ? 'on' : 'off';
      track('torch', { on });
      root.querySelector('.torch-btn')?.setAttribute('aria-pressed', String(on));
      clearTimeout(torchAckTimer);
      if (on && camShinEl && cam.dataset.state === 'idle') {
        dockSay('idle', 'cam_torch_on');
        // avatar-presence.md gives "none" for camera, torch on. Passing
        // 'none' as updateShinSay's own opts.anim does not reach this: that
        // sentinel is only honoured by shinSay's initial-mount string (a
        // fresh face-row's data-anim, written once into markup that never
        // animates); morphFace's animateFace call only recognises the
        // thirteen real animation names and would silently ignore 'none',
        // leaving idle-breath (idle's default) running. Written directly on
        // the mounted face instead: face.css's `[data-anim="none"]` rule is
        // `!important` and stops any animation unconditionally, exactly the
        // effect 'none' has everywhere else it is honoured.
        const torchFace = camShinEl.querySelector('.face');
        if (torchFace) torchFace.dataset.anim = 'none';
        torchAckTimer = setTimeout(() => {
          if (dead || cam.dataset.state !== 'idle') return;
          showAimHint();
        }, 2600);
      }
    }

    let gen = 0;
    let padBuffer = '';
    let padItem = null;
    let padModifier = null;
    /* What the shopper typed into "What is it?", held here rather than read off
       the DOM at confirm time. A modifier toggle repaints the whole pad from
       `padHtml`, so a name kept only in the input would vanish the moment
       somebody tapped "% off" -- the same class of bug the shop row's own
       comment describes. Empty string, never null: it is rendered straight
       back into `value`. */
    let padLabel = '';
    /* Row 25: what the user chose on the pad, `validation` or `switching`, or
       null while they have not touched the choice. With no choice the mode
       follows the typed price exactly as it did before there was a choice:
       validation once a shelf price is typed, switching while it is skipped. */
    let padAlt = null;
    function effectiveAlt(cents) {
      return padAlt ?? (typeof cents === 'number' && cents > 0 ? 'validation' : 'switching');
    }
    /* The shortlist as it was last rendered, so a tap on a row resolves to the
       shop object that built it rather than to the row's own text. */
    let shopList = [];

    function paintPad() {
      const amountEl = slot.querySelector('.pad-amount');
      if (amountEl) amountEl.innerHTML = padAmountHtml(padBuffer);
      paintPadEffective();
    }

    /** Repaints only the two disabled states and the effective-price label, so
        typing into the modifier's own number input never loses focus the way a
        full re-render would. */
    function paintPadEffective() {
      const typedCents = parsePadPrice(padBuffer);
      const effCents = effectivePriceCents(typedCents, padModifier);
      const confirmBtn = slot.querySelector('.key-confirm');
      if (confirmBtn) confirmBtn.disabled = !((effCents ?? 0) > 0);
      // Clear is gated on the buffer itself, never on the parsed price: "0" and
      // "." are both things a person typed and both things Clear has to be able
      // to take back, and neither of them parses to a price worth confirming.
      const clearBtn = slot.querySelector('[data-act="pad-clear"]');
      if (clearBtn) clearBtn.disabled = !padBuffer;
      // The choice follows the typed price until the user flips it.
      const shownAlt = effectiveAlt(effCents);
      for (const b of slot.querySelectorAll('[data-alt-mode]')) {
        b.setAttribute('aria-pressed', String(b.dataset.altMode === shownAlt));
      }
      const effEl = slot.querySelector('[data-pad-effective]');
      if (effEl) {
        const label = modifierLabel(typedCents, padModifier);
        effEl.textContent = label;
        effEl.hidden = !label;
      }
    }

    /*
     * Row 41, 42, 44, take: the asking price pad. Its own confirm key is the
     * continue (USAGE.md A1 0:13.4), never a pause after typing stops: a
     * debounce here would price "2", a glance back at the tag, then ".49" as
     * $2.00, and a wrong verdict outranks no verdict (CLAUDE.md priority 1).
     * Clear resets the buffer; Skip proceeds with no asking price at all,
     * which is the going-rate card, not a refusal.
     */
    /**
     * The rows the last "not this?" put on screen, so a tap can be resolved
     * back to a product without the button carrying one in an attribute.
     */
    let notThisResults = [];

    /**
     * Ask the same query again and show everything it found.
     *
     * The row already on the pad is dropped from the list. It is the one thing
     * the shopper has just said is wrong, and leaving it in makes the list read
     * as if Shin did not hear.
     *
     * A search that fails leaves the pad exactly as it was and says so. It is
     * an optional second look at an answer that already exists, so there is
     * nothing here worth losing a half-typed price over: the failure is the
     * one case where the affordance simply does nothing, and it says that out
     * loud rather than emptying the screen.
     */
    async function reopenCandidates() {
      const query = padItem?.notThisQuery;
      if (!query) return;
      track('not_this', { query });
      const from = padItem;
      let found;
      try {
        found = await ctx.api.search({ text: query, limit: 8 });
      } catch (err) {
        console.error('not-this search failed:', err);
        const head = slot.querySelector('.itemname');
        if (head && !dead) {
          head.insertAdjacentHTML(
            'afterend',
            `<p class="detail">${escapeHtml(say('cam_notthis_failed'))}</p>`,
          );
        }
        return;
      }
      if (dead || padItem !== from) return;
      notThisResults = (found.candidates ?? [])
        .filter((c) => !sameCode(c.code, from.gtin ?? from.id ?? ''))
        .map((c) => {
          const category = c.leafCategory ?? from.category;
          const row = candidateRow({
            brand: c.brands ? String(c.brands).split(',')[0].trim() : '',
            /* The catalogue's own French name when there is one and the reader
               is French. `/api/search` spreads the raw candidate rows, so this
               column is already on the wire; displayName has the rule. */
            name: displayName(c),
            size: c.quantity,
            category,
          });
          return { code: c.code, label: row.label, category, meta: row.meta };
        });
      setState('choosing');
      track('candidates_shown', { source: 'not_this', count: notThisResults.length, query });
      slot.innerHTML = searchCandidateSheet(notThisResults, query);
      mounted();
    }

    /**
     * The pad, rendered. Every repaint of it goes through here.
     *
     * There were three `slot.innerHTML = pricePadSheet(...)` lines before the
     * shop row existed, and a fourth argument that some of them remembered to
     * pass would be exactly the bug this feature cannot afford: a pad that
     * shows the shop when it opens, loses it when a modifier is toggled, and
     * files the price at a shop the shopper can no longer see.
     *
     * `shops.chosenFor()` is the seeding, and it is why a second visit to a
     * cell costs no taps: it reads the device's own record of which shop was
     * confirmed in this cell and returns it, without asking the OS for
     * anything. With consent off it returns null and `padShopRow` renders
     * nothing.
     */
    function padHtml() {
      return pricePadSheet(
        padItem,
        padBuffer,
        padModifier,
        scanThumb,
        shops.chosenFor(),
        shops.locationAllowed(),
        padLabel,
        padItem?.pendingScan ? effectiveAlt(effectivePriceCents(parsePadPrice(padBuffer), padModifier)) : null,
      );
    }

    function openPad(item, { force = false } = {}) {
      /*
       * The price was already asked at scan time (item 10). An identity that
       * turns up later (a candidate picked, a typed name resolved) is priced
       * with THAT number instead of asking a second time. A skipped price
       * (`null`) opens the pad as it always did, so the going-rate card's
       * "tell me the price" and a typed route still work. `pendingScan` items
       * ARE the scan-time ask, and observation-only ones are their own route.
       */
      if (!force && !item.pendingScan && !item.observationOnly && scanShelfCents !== null) {
        proceed(item, scanShelfCents);
        return;
      }
      padItem = item;
      padBuffer = '';
      padModifier = null;
      padLabel = '';
      padAlt = null;
      setState('asking');
      slot.innerHTML = padHtml();
      mounted();
    }

    /**
     * The shortlist, opened because the shopper tapped the shop row.
     *
     * THE OS IS ASKED HERE AND NOWHERE ELSE IN THIS SCREEN. `openShortlist`
     * refreshes the cell only when there is no fresh one and consent is
     * already on, so a location prompt -- if the browser shows one at all --
     * arrives on the tap that means "which shop am I in", which is the one
     * moment it explains itself. Nothing about a scan waits on it.
     *
     * A list that comes back empty still renders, with its own line and the
     * "no shop" row: an empty sheet after a tap reads as broken, and the
     * honest answer ("nobody has mapped the shops here") is one the shopper
     * can act on by typing the price anyway.
     */
    async function openShopPicker() {
      const myGen = gen;
      setState('asking');
      const { shops: list } = await shops.openShortlist();
      // The scan moved on while a third-party server was thinking. Painting a
      // shop list over whatever is there now would be the same class of bug
      // as a late identify response painting over a live refusal (D-083).
      if (dead || myGen !== gen || cam.dataset.state !== 'asking') return;
      // "Usual" marks a shop this device has confirmed before, which is the
      // pattern half of the ask made visible: the shopper can see that Shin
      // knows where they go, rather than only feeling it in the ordering.
      shopList = list;
      slot.innerHTML = storePickerSheet(list, shops.chosenId());
      mounted();
      /*
       * The keyboard the markup promises. `lib/radiogroup.js` exists because
       * `role="radiogroup"` over `role="radio"` children with nothing handling
       * arrow keys is worse than plain buttons: it tells a screen reader to
       * arrow between the options and then nothing moves. Re-wired on every
       * open because the sheet is rebuilt from a string each time, and bound
       * to this screen's own signal so it comes off with the screen.
       */
      wireRadioGroup(slot.querySelector('.shop-list'), { signal: listeners.signal });
    }

    /**
     * A price with nothing to compare it to, written down anyway. 2026-09-13.
     *
     * WHAT THIS IS AND IS NOT. It is an observation: a number, a photo and a
     * shop, hanging off the scan row the server already wrote. It is not a
     * correction -- `/api/correction` carries it because it is the route that
     * already takes a typed price with a client id, a device and a scan id,
     * and inventing a second endpoint for the same three fields would be worse
     * -- and the server does not file it as one. With no code and no product
     * id it never enters the corrections store, because `correctionsFor`
     * matches on a code or a product id and could never read it back; it goes
     * on `scan.typed_price_cents`, a column that exists for exactly this.
     *
     * LOCAL FIRST, like every other price this app takes. `submitCorrection`
     * writes to the device synchronously and flushes in the background, so the
     * card below is telling the truth about a write that has already happened,
     * and an aisle with no signal keeps the number instead of losing it. That
     * is the same contract `keepit` above runs on, and the same reason neither
     * awaits anything.
     *
     * THE STORE IS ATTACHED IF IT IS KNOWN AND NEVER ASKED FOR. The brief is
     * explicit that this must not add a question to the flow, and an
     * unattributed observation is still worth having. The coarse cell rides
     * along inside `corrections.js` when location consent is on, and the
     * server's `locationFor` drops it again if it is not -- consent is checked
     * on both sides, and neither side trusts the other to have done it.
     *
     * CONSENT GOVERNS THE PHOTO, NOT THE PRICE. Nothing here consults the
     * photo flag: a shopper who declined to have pictures kept still gets
     * their typed price recorded, because the price is a fact they chose to
     * type and the photograph is one they did not choose to keep. The photo
     * half was already decided at capture time, in the server's own
     * `keepPhoto` check, and is none of this function's business.
     *
     * THE TYPED NAME IS THE ONLY KEY THIS ROW WILL EVER HAVE, added
     * 2026-09-14, and that is why the field above it exists -- not because the
     * card looks better with a name on it. An unidentified observation carries
     * no code and no product id, so it can never become a price point and
     * never joins the comparison set for the thing it was about:
     * `correctionsFor` matches on a code or a product id and would never read
     * it back. It lands on `scan.typed_price_cents` and stops. A name typed by
     * the person who was standing in front of it is the first handle anything
     * later has for rejoining that number to a product, and rung (a) of
     * docs/plan-always-a-price.md ("only unconfirmed shopper prices") is
     * exactly where it lands when that rejoin exists.
     *
     * Empty stays null rather than becoming "", because the server reads
     * `str(c.label) ?? scanRow?.resolved_label` and an empty string is a
     * value: it would shadow a label a later pass managed to resolve.
     */
    function recordObservation(cents) {
      const seller = sellerNow();
      const typedName = padLabel.trim();
      track('correction', { code: null, amountCents: cents, seller, scanId: lastScanId, kind: 'observation' });
      submitCorrection({
        // No code and no product id, said explicitly rather than by omission.
        // This is the whole shape of the thing: a price about a scan, not
        // about a product, because nobody could say what the product was.
        code: null,
        productId: null,
        label: typedName || null,
        category: padItem?.category ?? null,
        amountCents: cents,
        seller,
        storeId: sellerIdNow(),
        kind: 'regular',
        scanId: lastScanId,
      });
      slot.innerHTML = observationCard(cents, seller, scanThumb, typedName || null);
      buzz(14);
      setState('result');
      mounted();
    }

    /**
     * The shop, if this device has already named one, and otherwise nothing.
     *
     * Never a prompt and never a guess. `market()` holds a country and a
     * currency, which is a market and not a seller, so it is deliberately not
     * used as one here: filing an observation against "Canada" would put a
     * word in the seller column that no later reader could do anything with,
     * and the engine already treats an invented seller as worse than none.
     */
    function sellerNow() {
      try {
        return shops.chosenName();
      } catch {
        return '';
      }
    }

    /**
     * The same shop, as its identity rather than its name (D-081).
     *
     * `sellerNow()` above is the DISPLAY AND MATCHING name -- what goes on the
     * card and what the spine's own-store filter compares against -- and two
     * spellings of one shop are two sellers to anything counting them.
     * `sellerIdNow()` is OpenStreetMap's `node/1234` for the shop that was
     * tapped, which is one shop in both spellings and two shops across two
     * branches of a chain, and it is what distinct-seller counting keys on.
     *
     * Null whenever no shop was tapped. Never derived from the name.
     */
    function sellerIdNow() {
      try {
        return shops.chosenId();
      } catch {
        return null;
      }
    }

    function shoot() {
      if (cam.dataset.state !== 'idle') return;
      // FLAGS.photoId off: no photo is taken or sent, whatever called this.
      if (!FLAGS.photoId) { sayNoBarcode(); return; }
      if (!captureAllowed(Date.now(), lastCaptureAt)) return;
      lastCaptureAt = Date.now();
      clearTimeout(hintTimer);
      clearTimeout(scanPressTimer);
      clearTimeout(torchAckTimer);
      coachKey = null;
      setState('framing');
      // Row 40: the frozen frame, captured now, at the moment of the shutter
      // press, so it is the picture the verdict later shows, not a later
      // re-grab of a feed that has already moved on.
      scanThumb = captureThumb(video, cam.dataset.camera === 'live');
      // The shutter log (2026-09-13): the whole frame goes to the server now,
      // and every request this press causes carries its id (api.js beginShutter).
      ctx.api.beginShutter?.(video);
      // With the eye running, the shutter also takes the real capture: a short
      // burst, the sharpest frame of it, cropped to what was found. It replaces
      // the thumbnail above when it lands, which is a frame or two later and
      // always before the sheet it appears on.
      lastCrop = null;
      // The same docked face morphs to thinking, in place, rather than a
      // separate sheet popping up over it for 420ms.
      dockSay('thinking', 'reading', {}, 'think-dots');
      if (eye?.live) {
        // With the eye running, the shutter takes the real capture and the
        // answer paints from handlePhotoCapture, never from a timer. The eye
        // always yields a crop (a centre fallback when nothing was detected) or
        // reports trouble, so nothing here has to stand in for it. Found
        // 2026-09-09 by walking the photo path at 390px: the stand-in timer
        // below used to fire regardless and, on a fast answer, painted the
        // demo list over a real refusal (D-083).
        void eye.capture();
        return;
      }
      // No eye: the frame is already frozen by the state change. This pause is
      // the reticle contracting, not a fake loading bar over an instant answer,
      // and the list it lands on is the hand-priced stand-in because there is
      // no crop to send.
      setTimeout(() => {
        if (dead) return;
        track('candidates_shown', { source: 'shutter_no_eye', count: scenarios.length });
        slot.innerHTML = candidateSheet(scenarios);
        setState('choosing');
        // The bottom bar has just slid away and taken the shutter the user
        // pressed with it. Without this the focus goes with it -- see mounted().
        mounted();
      }, 420);
    }

    /*
     * Row 47, 48, 49, take: the wait, named. Three steps advanced on real
     * events only, never on a timer that pretends: identification chosen is
     * why this function is called at all, the request being sent moves it to
     * step two, and the response actually landing moves it to step three and
     * ends the wait. `gen` voids a cancelled or superseded run so a late
     * response from an abandoned scan can never paint over a live one.
     */
    async function proceed(item, askingCents) {
      const myGen = ++gen;
      let step = 0;
      let slow = false;
      setState('reading');
      slot.innerHTML = workingSheet(item.text, step);
      mounted();

      // Row 19: past the 0.8s budget, the step already showing changes its
      // own word. Never a new step, and it never fires once the answer has
      // already landed.
      // AVATAR.md section 5 row 6: step-swap is a 160ms label crossfade and
      // the face does not move. So the step labels are patched in place and
      // the mounted face (with its think-dots loop) is never replaced;
      // re-rendering the whole sheet here would restart the dots from zero
      // and re-run the sheet's own rise on every step.
      const patchSteps = (nextStep, isSlow) => {
        const steps = slot.querySelectorAll('.wstep');
        if (steps.length !== WORKING_STEPS.length) {
          slot.innerHTML = workingSheet(item.text, nextStep, { slow: isSlow });
          mounted();
          return;
        }
        steps.forEach((elStep, i) => {
          elStep.classList.toggle('now', i === nextStep);
          elStep.textContent = i === nextStep ? say(isSlow ? 'working_slow' : WORKING_STEPS[i]) : say(WORKING_STEPS[i]);
        });
      };

      const slowTimer = setTimeout(() => {
        if (dead || myGen !== gen) return;
        slow = true;
        patchSteps(step, true);
      }, 800);

      try {
        step = 1; // Event: the price request is actually about to be sent.
        if (myGen === gen) {
          patchSteps(step, slow);
          // AVATAR.md row 17/section 5 row 6: the named step changed, once.
          animateFace(slot.querySelector('.face'), 'step-swap');
        }
        const result = await ctx.api.price({
          text: item.text,
          // The single strongest identity signal the app ever holds, and
          // without it the judge re-derives identity from the words and doubts
          // itself on a product it was just handed the code for.
          //
          // BOTH FIELDS, and that is the fix for a defect this line's own
          // comment described while the line caused it. `scannedGtin` is set
          // only by the raw barcode read. The two routes that resolve a code
          // out of the catalogue, a barcode we had to look up and a typed
          // search, both write `gtin` instead, so their code was dropped here
          // and every one of their scans went to the judge as words. Walking
          // the typed route on Lay's Classic, a product with fresh prices under
          // its own barcode, returned "Not sure enough this is the right
          // groceries and household" instead of a verdict.
          gtin: item.scannedGtin ?? item.gtin,
          category: item.category,
          askingCents,
          // Always, when there is a price to attribute. The store being
          // judged must never land inside its own comparison set.
          askingSeller: askingCents !== undefined ? (item.askingSeller ?? undefined) : undefined,
          /*
           * THE SCAN THIS PRICE IS ABOUT. 2026-09-15.
           *
           * Held since the identify call and never sent until now, which is
           * why the verdict as it was shown -- tier, confidence band, distinct
           * sellers -- was never written onto the scan row: the server's write
           * is guarded on this field and the field was never in the body.
           *
           * `undefined` rather than null when there is no scan, because
           * JSON.stringify drops an undefined key entirely and the server's
           * guard is `Number.isInteger`: a null would travel and be refused,
           * an absent key never travels at all. A price asked about something
           * nobody scanned is an ordinary case (the catalogue screen does it).
           */
          scanId: lastScanId ?? undefined,
          /*
           * And the query the server already started a search under, handed
           * back byte-for-byte so `/api/price` collects that search instead of
           * starting a second one. See `lastPriceQuery`.
           */
          priceQuery: lastPriceQuery ?? undefined,
        });
        clearTimeout(slowTimer);
        if (dead || myGen !== gen) return;
        step = 2; // Event: the response has actually arrived.
        last = { result, scenario: item, thumb: scanThumb, askingCents };
        /* W33: this user's own earlier prices for the same item, read BEFORE
           this scan is written into history so it is not counted against itself. */
        const earlier = priorPrices(store.get().history, {
          gtin: item.scannedGtin ?? item.gtin ?? '',
          names: [item.text, geminiReading(result.grounded).name].filter(Boolean),
        });
        /* A Gemini answer is stored with two plain facts on its row, so past
           scans, the weekly line and the good-find state never open the answer
           to learn them: whether it answered, and Gemini's own zone code. */
        store.recordVerdict(result, {
          text: item.text,
          askingCents,
          thumb: scanThumb,
          ...((item.scannedGtin ?? item.gtin) ? { gtin: item.scannedGtin ?? item.gtin } : {}),
          ...(result.kind === 'gemini'
            ? { answered: !geminiFailed(result), zone: geminiReading(result.grounded).zone }
            : {}),
        });
        if (result.kind === 'gemini') {
          /* THE ANSWER THIS ROUTE NOW GIVES. Never the refusal sheet, and
             never `fillCheaper`: the catalogue is not consulted for an answer,
             so any alternatives are the ones inside Gemini's own block. */
          lastKeepable = null;
          if (geminiFailed(result)) {
            slot.innerHTML = geminiFailureSheet(result, item);
            playRefusalLanding(slot);
          } else {
            // The price-match line the identify call carried, onto the answer
            // it belongs to, unless the price answer brought its own.
            if (lastPriceMatch && !result.priceMatch) result.priceMatch = lastPriceMatch;
            slot.innerHTML = geminiSheet(result, item, scanThumb, earlier);
            fillGrounded(slot, result);
            buzz(16);
          }
        } else if (result.kind === 'verdict') {
          slot.innerHTML = verdictSheet(result, item, scanThumb);
          // The Gemini block, if the payload carried one. Synchronous: it
          // arrived with the verdict, so there is nothing to wait for.
          fillGrounded(slot, result);
          // Row 83: the verdict landing, once, right here.
          buzz(16);
        } else if (result.reason === 'no_asking_price') {
          // Section 2's couch card, not a refusal: Shin has the comparison
          // set, only the one number was never supplied.
          slot.innerHTML = goingRateCard(result, item);
        } else {
          lastKeepable = keepableFrom(result, item, askingCents, isThinReason(result.reason));
          /* The code the swaps would be swaps FOR, on a refusal that resolved
             an identity but could not settle the price. Null on every other
             reason, which is what stops the sheet drawing a box that could
             never fill. */
          const swapCode = isThinReason(result.reason) ? codeOf(result, item) : null;
          slot.innerHTML = refusalSheet(result, item, supportedCategories, lastKeepable, {
            priceRoute: lastScanId !== null,
            swapCode,
            askingCents,
          });
          // What the web search found, on the refusal too.
          fillGrounded(slot, result);
          playRefusalLanding(slot);
        }
        setState('result');
        mounted();
      } catch (err) {
        clearTimeout(slowTimer);
        if (dead || myGen !== gen) return;
        /* The error text goes to the console and not to the sheet. It used to
           be concatenated onto the end of the shopper's sentence, which put a
           raw JavaScript message on the screen of the one person who cannot
           act on it: the same class of fault as D-011. */
        console.error('scan failed:', err);
        /*
         * A PRICE CALL THAT THROWS IS THE SAME KIND, RETRYABLE STATE the Gemini
         * failure variants use (rule 6, always an answer), never the refusal
         * sheet: nothing was refused, the answer did not come, and the refusal
         * wording ("could not price this") says something untrue. The name
         * survives (`item.text` is what the app knew it was pricing, offline
         * included), and `last` is set to THIS scan so "Try again" repeats it
         * and not whichever scan the shopper made before.
         */
        last = { result: { kind: 'gemini', failure: 'model_outage' }, scenario: item, thumb: scanThumb, askingCents };
        slot.innerHTML = geminiFailureSheet(last.result, item);
        playRefusalLanding(slot);
        setState('result');
        mounted();
      }
    }

    /**
     * The photo route: the crop the eye just captured, sent to be read.
     * Section 3 of docs/the-photo-path.md is the contract; this is the client
     * half of it.
     *
     * Four outcomes, and each one gets its own screen rather than a shared
     * guess:
     *
     *   identity, band not low   `proceed` with the price the shopper gave at
     *                            scan time (item 10, 2026-09-17), or none if
     *                            they skipped it; the pad is no longer asked
     *                            after identification.
     *   candidates                `searchCandidateSheet`, the same picker
     *                            "not this?" already uses, so choosing among
     *                            photo candidates feels like the choice it
     *                            already is elsewhere in this file.
     *   failure                   a refusal, in Shin's voice and never the raw
     *                            class (hard rule 3, D-011's whole point).
     *   failure: 'offline'        the crop goes into the eye's own queue
     *                            rather than being lost, decision 13.
     *
     * `gen` is the same generation counter `proceed()` guards its own
     * continuation with: `reset()` bumps it on the way back to idle, which is
     * what stops a slow photo answer from painting over a scan the shopper
     * has already left.
     */
    function handlePhotoCapture(crop) {
      if (dead || barcodeInFlight) return;
      // FLAGS.photoId off: a crop is never turned into a photo scan.
      if (!FLAGS.photoId) return;
      // The price is asked first (item 10); the crop waits in the pending scan
      // and is sent, with the price, by `resolvePhoto` once the pad is done.
      askPriceFirst({ kind: 'photo', crop });
    }

    /** The photo's identification and answer, once the price question is settled. */
    async function resolvePhoto(crop, cents) {
      const myGen = ++gen;
      setState('reading');
      slot.innerHTML = workingSheet(t('cam_what_you_photographed'), 0);
      mounted();

      let id;
      try {
        id = await ctx.api.identifyPhoto(crop.blob, { sharpness: crop.sharpness, shelfPriceCents: cents ?? undefined });
        // The row the server just wrote for this scan. Kept whatever the
        // answer was: a refused identification is exactly the case the
        // price route below exists for.
        if (Number.isInteger(id?.scanId)) lastScanId = id.scanId;
        // The query the server already started a price search under. Held
        // exactly as it arrived; see `lastPriceQuery`.
        lastPriceQuery = id?.priceQuery ?? null; lastPriceMatch = id?.priceMatch ?? null;
      } catch (err) {
        console.error('photo identify failed:', err);
        id = { product: null, failure: 'offline' };
      }
      if (dead || myGen !== gen) return;

      if (id?.failure === 'offline') {
        void enqueuePhotoCapture(crop);
        showPhotoRefusal('no_source_response', say('cam_photo_offline'));
        return;
      }

      /*
       * Item 9. Both used to fall through to the generic `modelLine`/`no_identity`
       * branches below and paint `cam_photo_unreadable` -- an honest miss on
       * the PHOTO for what is actually the route declining the request before
       * a model ever saw it (failure.md D9.5). `too_large` only still reaches
       * here after item 10's own shrink-and-retry has already given up.
       */
      if (id?.failure === 'too_large') {
        showPhotoRefusal('too_large', say('cam_photo_too_large'));
        return;
      }
      if (id?.failure === 'rate_limited') {
        showPhotoRefusal('rate_limited', retryCountdownLine(id.retryAfterSeconds));
        startRetryCountdown(id.retryAfterSeconds);
        return;
      }
      /*
       * The server is on a Gemini key it may not send a photograph to, or on
       * one it was never told the kind of. Its decision, made before the image
       * was read, so it belongs with the two above rather than with the model
       * failures: nothing looked at this photo and nothing is wrong with it.
       * Not queued for a later retry either -- the answer will be the same
       * until someone changes the server's environment.
       */
      if (id?.failure === 'photo_tier_unsafe') {
        showPhotoRefusal('photo_tier_unsafe', say('cam_photo_tier_unsafe'));
        return;
      }

      /*
       * 2026-09-15: whatever the model read is the answer when the catalogue
       * cannot match it, labelled unchecked, and it goes straight on to the
       * price like any other identity. Never "we do not have it" when there is
       * a reading to show.
       */
      if (!id?.product && id?.unchecked?.label) {
        track('unchecked_answer', { source: 'photo' });
        // Straight on to the price with the number asked at scan time; the
        // pad is not shown a second time (item 10).
        proceed({
          id: null,
          text: id.unchecked.label,
          category: id.category ?? null,
          gtin: null,
          unchecked: true,
          notThisQuery: null,
        }, cents ?? undefined);
        return;
      }

      const modelLine = id?.failure ? PHOTO_MODEL_FAILURE_LINES[id.failure] : null;
      if (modelLine) {
        showPhotoRefusal(id.failure, say(modelLine));
        return;
      }

      // `unreadable_photo`, or a failure code this build does not know the
      // name of yet: both are an honest miss on what the photo itself showed,
      // so both read as `no_identity` -- the same reason the typed route's
      // own no-match refusal uses.
      if (id?.failure) {
        showPhotoRefusal('no_identity', say('cam_photo_unreadable'));
        return;
      }

      if (Array.isArray(id?.candidates) && id.candidates.length) {
        const readAs = id.reading || photoCandidateLabel(id.candidates[0]) || t('cam_the_photo');
        const mapped = id.candidates.map((c) => {
          const row = candidateRow({ brand: c.brand, name: c.name, size: c.size });
          return { code: c.code, label: row.label || t('cam_unlabelled_item'), meta: row.meta };
        });
        setState('choosing');
        track('candidates_shown', { source: 'photo', count: mapped.length });
        slot.innerHTML = searchCandidateSheet(mapped, readAs);
        mounted();
        return;
      }

      if (id?.product && id.band !== 'low') {
        // The price was asked at scan time (item 10), so an identity goes
        // straight on to the answer with it instead of to a second pad.
        proceed({
          id: id.product.code,
          text: productLabel(id.product),
          category: id.category,
          gtin: id.product.code,
          notThisQuery: null,
        }, cents ?? undefined);
        return;
      }

      // No product, no candidates, no named failure. Rare, and still an
      // honest miss rather than a silent one.
      showPhotoRefusal('no_identity', say('cam_photo_unreadable'));
    }

    /** Every photo-route refusal's own paint: build the sheet, land it, focus it. */
    function showPhotoRefusal(reason, detail) {
      if (dead) return;
      slot.innerHTML = refusalSheet(
        { kind: 'refusal', reason, detail, identity: null, evidence: [] },
        null,
        supportedCategories,
        null,
        /* The photo route's whole point. `/api/identify/photo` writes a scan row
           and returns its id even when it could not read the picture, so an
           unidentified photo already has somewhere durable for a price to go. */
        { priceRoute: lastScanId !== null },
      );
      playRefusalLanding(slot);
      setState('result');
      mounted();
    }

    /**
     * Item 9: the live half of the rate-limit countdown. `retryCountdownLine`
     * (exported above) is the pure sentence; this is the glue that repaints it
     * once a second against whichever refusal is currently on screen (the
     * photo route's `.detail` paragraph or the barcode route's
     * `[data-rate-limited] .detail`), so the number shown keeps agreeing with
     * the server's own `retryAfterSeconds` rather than freezing at the value
     * it arrived with. Stops itself at zero, and is cleared by `reset()` and
     * by this render's own teardown like every other timer here.
     */
    function startRetryCountdown(seconds) {
      clearInterval(retryCountdownTimer);
      retryCountdownTimer = null;
      const whole = typeof seconds === 'number' && Number.isFinite(seconds) ? Math.ceil(seconds) : 0;
      if (whole <= 0) return;
      let remaining = whole;
      retryCountdownTimer = setInterval(() => {
        remaining -= 1;
        const el = slot.querySelector('.detail');
        if (dead || !el || remaining < 0) {
          clearInterval(retryCountdownTimer);
          retryCountdownTimer = null;
          return;
        }
        el.textContent = retryCountdownLine(remaining);
      }, 1000);
    }

    /**
     * D-026's caller. `startCaptureQueue` hands back a `PendingCapture` (id,
     * blob, gtin, takenAt, note, attempts); `identifyPhoto` only needs the
     * blob, and the queue only needs to know whether to stop asking.
     * `offline` is the one answer that means "still no signal", so it is the
     * one answer that keeps the item queued; every other answer, including a
     * refusal, means the request reached the server and the queue's job here
     * is done.
     */
    function sendQueuedCapture(item) {
      return ctx.api.identifyPhoto(item.blob, {})
        .then((res) => res?.failure !== 'offline')
        .catch(() => false);
    }

    /** Decision 13: the capture goes into durable storage before anything
        else, so a lost network never loses the photo. */
    async function enqueuePhotoCapture(crop) {
      try {
        const mod = await import('/js/eye.js');
        await mod.enqueue({
          blob: crop.blob,
          gtin: null,
          takenAt: Date.now(),
          note: say('cam_photo_offline'),
        });
      } catch (err) {
        console.error('could not queue an offline photo:', err);
      }
    }

    /**
     * The scan after the weekly free ones (402 `scan_limit`, 2026-09-21): the
     * scan is over, and the subscription screen opens with the server's own
     * counts. Nothing was priced, so nothing is recorded as an answer.
     */
    function openPaywall(limit) {
      track('scan_limit_hit', { limit: limit?.limit ?? null, used: limit?.used ?? null });
      reset();
      ctx.go('paywall', { limit: limit?.limit ?? undefined, used: limit?.used ?? undefined, resetsAt: limit?.resetsAt ?? undefined });
    }

    function reset() {
      // Leaving the type-it route with nothing submitted is an abandoned
      // typed search, task item 4's own phrase: "typed search text including
      // text typed then abandoned". Read before `slot.innerHTML` below wipes
      // the field that holds it.
      if (typedSearchPending) {
        const abandonedText = (slot.querySelector('[data-textroute-input]')?.value ?? '').trim();
        track('typed_search', { text: abandonedText, abandoned: true });
        typedSearchPending = false;
      }
      trackScanAbandonedIfMidScan('reset');
      clearTimeout(scanPressTimer);
      clearInterval(retryCountdownTimer);
      retryCountdownTimer = null;
      gen++; // Voids any in-flight proceed() continuation, including a photo capture's.
      slot.innerHTML = '';
      last = null;
      lastKeepable = null;
      lastScanId = null;
      lastPriceQuery = null;
      lastPriceMatch = null;
      scanShelfCents = null;
      padAlt = null;
      // The scan is over: its mode and hint do not ride on the next one.
      ctx.api.setScanIntent?.({});
      barcodeReady = null;
      scanThumb = null;
      // A pick belongs to the scan that has just ended. Carrying it into the
      // next one would frame whatever happens to overlap the old rectangle,
      // which is the class of quietly-wrong framing this whole system exists
      // to remove.
      coachKey = null;
      barcodeInFlight = false;
      // Nothing is remembered about the code just left any more: with rule
      // 2's button there is no unsolicited re-read of the code still in frame
      // to suppress. See the note by `manualSearch`.
      scanBarcode = null;
      manualSearch = false;
      // Drops the eye's pick AND any arming the shopper walked away from, so
      // coming back to the viewfinder is never mid-read.
      eye?.clearSelection?.();
      setState('idle');
      showInitialIdleContent();
      // The sheet that had focus has just been deleted. Back to the shutter,
      // which is where the viewfinder's own attention is and the one control
      // a returning user wants next. Otherwise focus falls to `body` and the
      // next Tab starts again from the top of the document.
      // The barcode button when the shutter is not there (FLAGS.photoId off).
      (root.querySelector('.shutter') ?? root.querySelector('.scan-code-btn'))?.focus({ preventScroll: true });
    }

    root.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const id = pick.dataset.pick;
        if (id === '__none') {
          track('candidate_pick', { id, wrong: true });
          // An honest unknown. The engine is asked a question it cannot answer
          // rather than the app faking the refusal, so the refusal on screen is
          // the engine's own.
          openPad({ text: 'a thing shin has never seen', category: 'grocery' });
          return;
        }
        track('candidate_pick', { id, wrong: false });
        const item = scenarios.find((s) => s.id === id);
        if (item) openPad(item);
        return;
      }

      /*
       * A row in the shop shortlist, tapped. The one tap this feature costs,
       * and the last one for this shop: `chooseShop` records it against the
       * coarse cell, so the next pad opened in this square comes up with the
       * shop already on it.
       *
       * `__none` is a real answer and not a cancel -- see `storePickerSheet`.
       * Either way the shopper lands back on the pad with the price they had
       * already typed still in the buffer, because `padBuffer` was never
       * touched and the pad is rebuilt from it.
       */
      const shopPick = e.target.closest('[data-shop]');
      if (shopPick) {
        const id = shopPick.dataset.shop;
        /* The shop object comes from the list that was rendered, not from
           reading the row's own text back out of the DOM: the row carries a
           "Usual" badge and an escaped hint beside the name, so scraping it
           would file the price under a name with a badge word glued to it. */
        const picked = id === '__none' ? null : shopList.find((s) => s.id === id);
        shops.chooseShop(picked ?? null);
        buzz(8);
        setState('asking');
        slot.innerHTML = padHtml();
        mounted('[data-act="pad-shop"]');
        return;
      }

      const notThis = e.target.closest('[data-act="notthis"]');
      if (notThis) {
        void reopenCandidates();
        return;
      }

      const back = e.target.closest('[data-act="notthis-back"]');
      if (back) {
        track('not_this_back', {});
        // Straight back to the pad on the item that was already picked. The
        // buffer is deliberately not cleared: a shopper who had typed half a
        // price, looked at the list and decided the first answer was right
        // should not have to type it again.
        setState('asking');
        slot.innerHTML = padHtml();
        mounted();
        return;
      }

      const pickCode = e.target.closest('[data-pick-code]');
      if (pickCode) {
        const chosen = notThisResults.find((c) => c.code === pickCode.dataset.pickCode);
        track('candidate_pick', { code: pickCode.dataset.pickCode, found: !!chosen });
        if (chosen) {
          /*
           * A pick from this list is a different product, so it starts a fresh
           * pad rather than editing the old one: the typed buffer belonged to
           * the row that was just rejected, and carrying it over would price a
           * new item at a number somebody entered for a different one.
           *
           * `notThisQuery` is not carried either. The shopper has now seen the
           * whole list and chosen from it, so there is nothing left to reopen.
           */
          openPad({
            id: chosen.code,
            text: chosen.label,
            category: chosen.category,
            gtin: chosen.code,
          });
        }
        return;
      }

      const padKey = e.target.closest('[data-pad]');
      if (padKey) {
        const k = padKey.dataset.pad;
        if (k === '⌫') padBuffer = padBuffer.slice(0, -1);
        else if (k === '.') { if (!padBuffer.includes('.')) padBuffer += padBuffer ? '.' : '0.'; }
        else if (padBuffer.includes('.') && padBuffer.split('.')[1].length >= 2) { /* two decimals is a price */ }
        else padBuffer += k;
        paintPad();
        return;
      }

      // Row 25: the user flips validation and switching on the pad. Only the
      // pressed states change, so a half-typed price and the caret stay put.
      const altBtn = e.target.closest('[data-alt-mode]');
      if (altBtn) {
        padAlt = altBtn.dataset.altMode === 'switching' ? 'switching' : 'validation';
        paintPadEffective();
        return;
      }

      const modToggle = e.target.closest('[data-modtoggle]');
      if (modToggle) {
        const kind = modToggle.dataset.modtoggle;
        padModifier = padModifier && padModifier.kind === kind
          ? null
          : (kind === 'percent' ? { kind: 'percent', pct: 20 } : { kind: 'nfor', n: 3 });
        slot.innerHTML = padHtml();
        // The whole sheet was repainted under the button that was just pressed,
        // so the press has to be given back its own control rather than the
        // sheet: a modifier is toggled on, checked, and toggled off again, and
        // that is three presses of the same key.
        mounted(`[data-modtoggle="${kind}"]`);
        return;
      }

      /*
       * The tap on one of the other objects the camera found.
       *
       * This is the whole of object selection as a control, and it is deliberately
       * not a mode: there is no "choose an object" step to enter or leave, no
       * confirm, and no way to end up with nothing selected. The camera has always
       * already framed its best guess, and tapping a neighbour moves the frame
       * onto that one instead. Getting it wrong costs one more tap.
       */
      const altPick = e.target.closest('.alt-box');
      if (altPick) {
        if (cam.dataset.state !== 'idle') return;
        eye?.select?.(Number(altPick.dataset.alt) || 0);
        buzz(8);
        return;
      }

      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;

      /*
       * The grabber, pressed. Keyboard only, and the guard is the reason.
       *
       * A pointer tap on the grabber already steps, in the pointerup handler
       * at the bottom of this render, because that handler carries the drag as
       * well and a tap is just a drag of under 40px. The grabber is a real
       * <button> now, so Enter and Space arrive here as a click -- and so does
       * a tap. `detail` is what separates them: a click synthesised from a key
       * press reports 0, a click from a real tap reports 1 or more. Without
       * this the same tap would be counted twice and skip a detent.
       */
      if (act === 'detent-step') {
        if (e.detail !== 0) return;
        const sheet = btn.closest('.sheet');
        if (!sheet) return;
        const at = clampDetent(sheet, sheet.dataset.detent || 'peek');
        setDetent(sheet, at === maxDetent(sheet) ? 'peek' : stepUp(sheet, at));
        return;
      }

      if (act === 'shoot') { shoot(); return; }
      /*
       * The two branches the barcode flow turns on (item 7, 2026-09-17).
       *
       * `scan-barcode` is the barcode button, always there: it asks the eye for
       * the digits of the code the last second or two of frames agreed on, and
       * that is the only way a barcode ever leaves the eye. The eye emits
       * `onBarcode` synchronously from this call, so the scan flow starts below
       * in `onBarcode`. With no settled code (or no eye) it answers with the
       * coaching line instead of doing nothing. `manual-search` is the keyboard
       * button and opens the name field.
       */
      if (act === 'manual-search') { openManualSearch(); return; }
      if (act === 'scan-barcode') {
        if (cam.dataset.state !== 'idle') return;
        if (!captureAllowed(Date.now(), lastCaptureAt)) return;
        track('barcode_scan_pressed', {});
        const sent = eye?.scanBarcode?.();
        if (!sent) {
          // Nothing settled, or the code left the frame between the vote and
          // the press. Nothing was sent; say what to do.
          barcodeReady = null;
          paintBarcodeButton();
          sayNoBarcode();
          return;
        }
        lastCaptureAt = Date.now();
        buzz(8);
        return;
      }
      if (act === 'watchlist') { ctx.go('watchlist'); return; }
      if (act === 'you') { ctx.go('you'); return; }
      if (act === 'torch') { requestTorch(!torchOn); return; }

      // The shop row on the pad. The only thing in this screen that can cause
      // a location read, and it does so because the shopper asked which shop
      // they are in.
      if (act === 'pad-shop') { void openShopPicker(); return; }
      if (act === 'pad-clear') { padBuffer = ''; paintPad(); return; }
      // The pad's own confirm key (USAGE A1 0:13.4): nothing submits until
      // this is pressed. No debounce, no auto-submit on a pause. Row 43:
      // sends the effective price under any active modifier, not the typed
      // sticker number.
      if (act === 'pad-confirm') {
        const typedCents = parsePadPrice(padBuffer);
        const cents = effectivePriceCents(typedCents, padModifier);
        if (cents === null || cents <= 0) return;
        /*
         * THE PRICING ENGINE IS NOT ASKED. 2026-09-13, and it is the point of
         * the whole route rather than an optimisation.
         *
         * `proceed` sends the number to `/api/price`, which answers with a
         * verdict or a refusal. With no identity there is no query to send:
         * the engine would be handed a price and no product, and whatever came
         * back would be an answer to a question nobody asked. A refusal from
         * the engine here would also be a SECOND refusal on top of the one the
         * shopper is already looking at, which reads as the app failing twice
         * at something it never attempted.
         *
         * So this path never calls it. It writes the observation down and says
         * so, which is the honest whole of what happened.
         */
        if (padItem?.observationOnly) { recordObservation(cents); return; }
        // The scan-time ask (item 10): the request goes out now, carrying it.
        if (padItem?.pendingScan) { submitScanPrice(cents); return; }
        proceed(padItem, cents);
        return;
      }
      // Skip proceeds with no asking price at all (row 44): not a refusal,
      // the going-rate card.
      if (act === 'pad-skip') {
        /* Nothing to skip TO on the observation route. The going-rate card is
           built out of the comparison set the engine gathered, and there is no
           comparison set here, so skipping the price leaves literally nothing
           to show -- which is the viewfinder. */
        if (padItem?.observationOnly) { reset(); return; }
        // Skipped at scan time: the request still goes out, with no price, and
        // still gets an answer (the going-rate card at worst).
        if (padItem?.pendingScan) { submitScanPrice(null); return; }
        proceed(padItem, undefined);
        return;
      }

      /*
       * The price route out of a refusal. Opens the SAME pad every other price
       * goes through -- the thumb-sized keys, the percent-off and multi-buy
       * modifiers, the confirm key that is the only thing that submits -- with
       * no identity on it. `openPad` already takes a loose `{ text, category }`
       * item (the `__none` pick below does exactly that), so this reuses that
       * shape and adds the one flag that changes what confirm means.
       */
      if (act === 'priceonly') {
        openPad({
          text: t('cam_no_name_for_it'),
          category: null,
          observationOnly: true,
        });
        return;
      }
      if (act === 'pad-reopen' && last?.scenario) { openPad(last.scenario, { force: true }); return; }

      // Row 17, 88, 89, take: the second route out of a no-identity refusal.
      if (act === 'typeit') {
        setState('texting');
        typedSearchPending = true;
        manualSearch = false;
        slot.innerHTML = textRouteSheet();
        // The one sheet where a specific control is the obvious landing: the
        // whole route is "type the name", and the field is the route.
        mounted('[data-textroute-input]');
        return;
      }

      // Row 49/68, take: aborts the scan in progress, or closes a finished
      // one, and returns to the live viewfinder. The downward drag below does
      // the same thing; this is the discoverable control both rows ask for,
      // now shared by the working sheet's close, the verdict's own Done, and
      // the candidate list / price pad / type-it route's new back button.
      if (act === 'cancel-scan') { reset(); return; }

      if (act === 'correct') {
        ctx.go('correct', last?.scenario ? { text: last.scenario.text, category: last.scenario.category } : {});
        return;
      }
      /*
       * Keep it. AVATAR.md section 3 rows 39 and 40, and the last unbuilt
       * action on the surface five of seven scans end on.
       *
       * The whole point is that it asks for nothing. The shopper typed the
       * price ninety seconds ago and Shin could not settle it; making them
       * open a form and type the same number again is the app charging a
       * person for its own gap. The number, the shop and the day are already
       * in hand, so this is one tap.
       *
       * `submitCorrection` writes locally first and flushes in the background,
       * which is the right shape for the aisle: the acknowledgement below is
       * about the local write, which has already happened, and a phone with no
       * signal keeps the price rather than losing it.
       *
       * Reactive and therefore unbudgeted (AVATAR.md's own distinction): this
       * lands inside two seconds of the user's own tap on the same surface, so
       * it does not touch the interruption budget and must not ask it.
       */
      if (act === 'keepit' && lastKeepable) {
        const k = lastKeepable;
        lastKeepable = null; // One tap. A second would be a second witness that does not exist.
        track('correction', { code: k.code, amountCents: k.askingCents, seller: k.seller, kind: 'keepit' });
        submitCorrection({
          code: k.code,
          productId: k.productId,
          label: k.label,
          category: k.category,
          amountCents: k.askingCents,
          seller: k.seller,
          kind: 'regular',
        });
        const head = slot.querySelector('.sheet-head');
        if (head) {
          head.innerHTML = shinSay(
            'pleased',
            'keep_it_ack',
            { asking: money(k.askingCents), seller: k.seller, day: 'today' },
            { size: 'face-ack', anim: 'pleased-nod' },
          );
        }
        /* The action goes with the acknowledgement. It is spent: this sheet
           holds for two seconds and then drops to the viewfinder, and there is
           nothing left to tap. Leaving the button up while the guard above
           makes a second press do nothing is a dead control, which is worse
           than no control, and it invites the double-submit the one-price-per
           -shop-per-day index exists to catch rather than avoiding it here. */
        slot.querySelector('.actions-primary')?.remove();
        // Row 40: it holds, then the sheet drops to a live viewfinder. Held
        // against the generation counter so a scan started during the hold
        // wins rather than being wiped by a timer from the one before it.
        const heldGen = gen;
        window.setTimeout(() => {
          if (dead || heldGen !== gen) return;
          reset();
        }, 2000);
        return;
      }
      if (act === 'share' && last?.result?.kind === 'verdict') {
        ctx.go('share', { id: last.result.identity.id });
        return;
      }
      if (act === 'watch' && last?.result?.kind === 'verdict') {
        const v = last.result;
        // Only a tap that just ADDED the save gets the acknowledgement.
        // Read the state before toggling: the same "watch" tap unsaves an
        // already-saved item, and an unsave gets no pleased morph, no
        // "Saved" line -- it goes straight back to the tier's own face.
        const wasSaved = store.isWatched(v.identity.id);
        store.toggleWatch({
          id: v.identity.id,
          label: v.identity.label,
          category: v.category,
          lastCents: v.askingCents,
          // The seller travels with the saved record. A watch that forgets where
          // the price was seen re-prices the item against its own shelf later.
          askingSeller: sellerOf(v),
          usualCents: v.spread.medianCents,
          // Row 40: the frozen frame travels with the saved record too, so
          // "which one was that" has an answer later.
          thumb: last.thumb ?? null,
        });
        // Watch acknowledged (row 32) morphs the verdict face in place, so the
        // whole sheet is repainted from the same v/scenario rather than only
        // the button, and the detent the user was reading is carried across
        // the repaint.
        const prevDetent = slot.querySelector('.sheet')?.dataset.detent;
        slot.innerHTML = verdictSheet(v, last.scenario, last.thumb ?? null, !wasSaved);
        // Rebuilt from scratch by the save, so the grounded block has to be
        // mounted again for the same reason the swaps have to be refetched.
        fillGrounded(slot, v);
        const nextSheet = slot.querySelector('.sheet');
        if (nextSheet && prevDetent) setDetent(nextSheet, prevDetent);
        // Same repaint-under-the-press as the modifier toggles: the save button
        // is a toggle, and the second press has to land on the same key.
        mounted('[data-act="watch"]');
        return;
      }
      /* The scan a thumb is about, for a Gemini answer: the id the answer
         carries, else the one the scan was opened under. A verdict has none
         and its thumbs stay the local signal they were. */
      const ratedScan = last?.result?.kind === 'gemini'
        ? (Number.isInteger(last.result.scanId) ? last.result.scanId : lastScanId)
        : null;
      if (act === 'gem-retry' && last?.scenario) {
        // The same scan again: `proceed` sends the same scan id, so the server
        // recalls or re-asks under the row that already exists.
        void proceed(last.scenario, last.askingCents);
        return;
      }
      if (act === 'outcome') {
        // "What did you do?" after a cheaper-elsewhere answer: one tap, sent
        // once, marked on the row. Not awaited and never thrown, like a thumb.
        const outcome = btn.dataset.outcome;
        const row = btn.closest('[data-outcome-row]');
        if (row?.dataset.sent === '1') return;
        if (row) row.dataset.sent = '1';
        row?.querySelectorAll('[data-outcome]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        track('scan_outcome', { outcome, scanId: ratedScan });
        if (Number.isInteger(ratedScan)) void ctx.api.postScanOutcome?.({ scanId: ratedScan, outcome });
        const q = row?.querySelector('#gem-outcome-q');
        if (q) q.textContent = t('outcome_noted');
        return;
      }
      if (act === 'thumbs-up' || act === 'thumbs-down') {
        // The one-tap correctness signal (DESIGN.md section 4, full detent).
        // GAMIFICATION.md M12 / OLMA audit rows 64, 65, take: it earns
        // nothing and writes nothing but this local signal. Row 35's toast
        // acknowledges the tap, Undo live for four seconds.
        //
        // On a Gemini answer the thumb is also kept against its scan id, on
        // the phone and on the server (item 13: every rating is kept). Not
        // awaited and never thrown: a rating is feedback about an answer that
        // is already on screen.
        if (Number.isInteger(ratedScan)) {
          const rating = act === 'thumbs-up' ? 'up' : 'down';
          store.recordRating({ scanId: ratedScan, rating });
          void ctx.api.postScanRating?.({ deviceId: getDeviceId()?.id, scanId: ratedScan, rating });
        }
        btn.parentElement.querySelectorAll('.thumb').forEach((t) => t.classList.remove('picked'));
        btn.classList.add('picked');
        const toastSlot = btn.closest('.sheet-full')?.querySelector('[data-toast-slot]');
        if (toastSlot) {
          toastSlot.innerHTML = feedbackToast();
          clearTimeout(toastSlot._timer);
          toastSlot._timer = setTimeout(() => { toastSlot.innerHTML = ''; }, 4000);
        }
        return;
      }
      if (act === 'thumbs-undo') {
        if (Number.isInteger(ratedScan)) {
          store.deleteRating(ratedScan);
          void ctx.api.deleteScanRating?.({ deviceId: getDeviceId()?.id, scanId: ratedScan });
        }
        const toastSlot = btn.closest('[data-toast-slot]');
        btn.closest('.sheet-full')?.querySelectorAll('.thumb').forEach((t) => t.classList.remove('picked'));
        if (toastSlot) { clearTimeout(toastSlot._timer); toastSlot.innerHTML = ''; }
        return;
      }
    }, { signal: listeners.signal });

    root.addEventListener('input', (e) => {
      /* "What is it?", kept in the screen's own state as it is typed. Nothing
         is repainted: the field is already showing what was typed, and a
         repaint here would take the caret with it. */
      const nameInput = e.target.closest('[data-obs-label]');
      if (nameInput) { padLabel = nameInput.value; return; }
      const modInput = e.target.closest('[data-mod-value]');
      if (!modInput || !padModifier) return;
      const n = Number.parseFloat(modInput.value);
      if (padModifier.kind === 'percent') padModifier.pct = Number.isFinite(n) ? n : NaN;
      else if (padModifier.kind === 'nfor') padModifier.n = Number.isFinite(n) ? n : NaN;
      paintPadEffective();
    }, { signal: listeners.signal });

    root.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-form="textroute"]');
      if (!form) return;
      e.preventDefault();
      const text = (form.querySelector('[data-textroute-input]')?.value ?? '').trim();
      if (!text) return;
      // Typed search text, submitted. Kept whole: events.ts's own header now
      // allows free text a person typed, on the founder's word that
      // everything collected trains Shin's models and answers other
      // shoppers, and a typed name is exactly the input that decides whether
      // the catalogue match below was worth building.
      typedSearchPending = false;
      track('typed_search', { text, abandoned: false });
      // Manual Search (W30): the shelf price is asked first, on the pad, and
      // the typed name then goes out as one Gemini text call carrying it.
      if (manualSearch) { manualSearch = false; askPriceFirst({ kind: 'text', text }); return; }
      await runTypedSearch(text, null, false);
    }, { signal: listeners.signal });

    /**
     * The typed name's identification, `asked` when the shelf price was already
     * asked on the pad (`cents` is then the price or null for a skipped one, and
     * the pad is not opened a second time). Not asked: the type-it route out of a
     * refusal, which identifies first and opens the pad after, as before.
     */
    async function runTypedSearch(text, cents, asked) {
      const myGen = asked ? ++gen : gen;
      if (asked) {
        setState('reading');
        slot.innerHTML = workingSheet(text, 0);
        mounted();
      }

      /*
       * The hand-priced shelf is asked FIRST, and that ordering is the whole
       * point rather than a leftover.
       *
       * The catalogue knows 5,182,591 products and the price engine has
       * observations for seven. Typing "Kraft Dinner 225g" against the
       * catalogue finds a real 200 g row that nobody has ever priced, and the
       * answer is an honest refusal. Asking the priced shelf first finds the
       * 225 g box somebody actually stood in a store and recorded, and the
       * answer is a verdict. Preferring the row we can price over the row we
       * merely have is not a demo shortcut; it is the same preference the
       * product will keep once the priced set is thousands rather than seven.
       */
      let typed = null;
      const priced = asked ? null : matchCatalogue(text, catalogueItems);
      if (priced) {
        typed = scenarios.find((s) => s.id === priced.id) ?? {
          text: priced.label,
          category: priced.category,
        };
      }

      /*
       * Nothing priced matches, so ask the real catalogue. Measured against
       * 5,182,591 rows: 11 to 300 ms depending on how common the words are.
       */
      if (!typed) {
        try {
          const id = await ctx.api.identify({ text, shelfPriceCents: cents ?? undefined });
          // The row the server just wrote for this scan. Kept whatever the
          // answer was: a refused identification is exactly the case the
          // price route below exists for.
          if (Number.isInteger(id?.scanId)) lastScanId = id.scanId;
          // The query the server already started a price search under. Held
          // exactly as it arrived; see `lastPriceQuery`.
          lastPriceQuery = id?.priceQuery ?? null; lastPriceMatch = id?.priceMatch ?? null;
          // The weekly free scans are used (402 scan_limit): the subscription screen.
          if (id?.failure === 'scan_limit') { openPaywall(id); return; }
          if (id.catalogueUp && id.product) {
            typed = {
              id: id.product.code,
              text: productLabel(id.product),
              category: id.category,
              gtin: id.product.code,
              /*
               * The query is kept so "not this?" has something to search again
               * with, and it is kept only when BOTH halves are true.
               *
               * The band alone is not enough, and finding that out is what this
               * field cost. A text-only query is `ambiguous` by construction:
               * `#band` in catalogue/src/search.ts scores how much of what the
               * caller PINNED the top row agrees with, a plain text query pins
               * neither brand nor size, so the lead is 0 and the band returns
               * ambiguous before it has looked at a single rival. Gating on it
               * alone puts "not this?" under every typed scan, including the
               * ones where the list opens to say there was nothing else -- the
               * face-saving offer /api/search's own comment warns against.
               *
               * `otherCandidates` is the half that actually counts rivals. Both
               * together mean what the affordance claims: the pick was not
               * pinned down, and there is something else to show.
               */
              notThisQuery:
                id.band === 'ambiguous' && id.otherCandidates > 0 ? text : null,
            };
          } else if (asked && id?.unchecked?.label) {
            // Whatever Gemini read is the answer when the catalogue has no
            // match, labelled unchecked, as the photo and barcode routes do.
            typed = {
              id: null,
              text: id.unchecked.label,
              category: id.category ?? null,
              gtin: null,
              unchecked: true,
              notThisQuery: null,
            };
          }
        } catch {
          typed = null;
        }
      }
      if (dead || (asked && myGen !== gen)) return;
      if (typed) {
        // Asked on the pad already: price it with that number, never ask twice.
        if (asked) proceed(typed, cents ?? undefined);
        else openPad(typed);
        return;
      }
      // No match: the unsure refusal, the engine's own shape, never a fake
      // "not found" screen. It carries the second route again.
      last = null;
      slot.innerHTML = refusalSheet(
        {
          kind: 'refusal',
          reason: 'no_identity',
          detail: say('cam_text_no_match', { query: text }),
          identity: null,
          evidence: [],
        },
        null,
        supportedCategories,
        null,
        { priceRoute: lastScanId !== null },
      );
      playRefusalLanding(slot);
      setState('result');
      mounted();
    }

    /* The sheet moves between three detents: peek, half, full. A drag of more
       than 40px moves one detent in that direction (downward past peek
       dismisses); a tap on the grabber or head steps forward, wrapping from
       the sheet's own top detent back to peek. A sheet with no sheet-half or
       sheet-full content (the candidate sheet) has nowhere to go, so it just
       stays at peek. */
    const ORDER = ['peek', 'half', 'full'];
    function maxDetent(sheet) {
      if (sheet.querySelector('.sheet-full')) return 'full';
      if (sheet.querySelector('.sheet-half')) return 'half';
      return 'peek';
    }
    function clampDetent(sheet, d) {
      const max = maxDetent(sheet);
      return ORDER.indexOf(d) > ORDER.indexOf(max) ? max : d;
    }
    function stepUp(sheet, d) {
      const max = maxDetent(sheet);
      return ORDER[Math.min(ORDER.indexOf(d) + 1, ORDER.indexOf(max))];
    }
    function stepDown(d) {
      return ORDER[Math.max(ORDER.indexOf(d) - 1, 0)];
    }

    /**
     * The one place a detent is written. Every path -- drag, tap, arrow key,
     * the watch repaint -- goes through here, so the grabber's own name can
     * never say the opposite of where the sheet actually is.
     */
    function setDetent(sheet, next) {
      const d = clampDetent(sheet, next);
      sheet.dataset.detent = d;
      syncGrabber(sheet);
      return d;
    }

    /**
     * The grabber's accessible name says what pressing it will DO, and that
     * changes with the detent: it steps up until the sheet is at its own top
     * detent and then wraps back to peek. `aria-expanded` was the obvious
     * alternative and it is the wrong shape here -- it has two values and this
     * control has three positions, so at half it would have to claim either
     * "expanded" (there is another detent above) or "collapsed" (the rail and
     * the seller list are already open), and both are false.
     */
    function syncGrabber(sheet) {
      const g = sheet.querySelector('button.grabber');
      if (!g) return;
      const at = clampDetent(sheet, sheet.dataset.detent || 'peek');
      g.setAttribute('aria-label', at === maxDetent(sheet) ? t('cam_back_to_summary') : t('cam_show_more'));
    }

    /**
     * Called after every sheet is written into the slot.
     *
     * Focus is the half of this that matters. The bottom bar slides away on
     * `data-state="result"` and `"choosing"` (which is right -- DESIGN.md wants
     * the brand pink off the verdict surface), so the shutter the user had just
     * pressed is gone from under the focus ring, and before this the focus went
     * with it: back to `body`, one screen away from everything the sheet
     * offers. The sheet itself takes it instead (`tabindex="-1"` on the
     * section, so it is a focus target and not a tab stop), which is the same
     * move a dialog makes and it puts the next Tab on the sheet's own first
     * control. `preferred` overrides that where a specific control is the
     * obvious landing -- the type-it field, or the button that was just
     * repainted underneath the user.
     */
    function mounted(preferred) {
      const sheet = slot.querySelector('.sheet');
      if (!sheet) return;
      syncGrabber(sheet);
      const target = (preferred && slot.querySelector(preferred)) || sheet;
      // preventScroll: `.sheet` is its own scroll container and it has just
      // animated in from translateY(100%). Letting focus scroll it lands the
      // user part way down a peek that is meant to open at its own top.
      target.focus?.({ preventScroll: true });
    }

    let dragFrom = null;
    root.addEventListener('pointerdown', (e) => {
      const sheet = e.target.closest('.sheet');
      if (!sheet || !e.target.closest('.grabber, .sheet-head')) return;
      dragFrom = { y: e.clientY, detent: clampDetent(sheet, sheet.dataset.detent || 'peek'), sheet };
      sheet.setPointerCapture?.(e.pointerId);
    }, { signal: listeners.signal });
    root.addEventListener('pointerup', (e) => {
      if (!dragFrom) return;
      const dy = e.clientY - dragFrom.y;
      const { sheet, detent } = dragFrom;
      dragFrom = null;
      if (dy < -40) setDetent(sheet, stepUp(sheet, detent));
      else if (dy > 40) {
        if (detent === 'peek') { reset(); return; }
        setDetent(sheet, stepDown(detent));
      } else {
        setDetent(sheet, detent === maxDetent(sheet) ? 'peek' : stepUp(sheet, detent));
      }
    }, { signal: listeners.signal });

    /*
     * The same three detents, from the keyboard.
     *
     * `grep -rn "keydown" public/js` returned zero hits repo-wide before this,
     * and the detents were `pointerdown`/`pointerup` only. Everything that
     * lives at half or full -- the price rail, the seller list, Correct it,
     * Share, both thumbs and Done -- was unreachable without a pointer. That is
     * not a rough edge on the feature; it is the feature missing for anyone on
     * a keyboard.
     *
     * Up and Down step one detent, which is the move the drag already makes.
     * Escape is the way out: back to peek from half or full, and out of the
     * sheet entirely from peek, which is exactly what a downward drag past peek
     * does. On a sheet with nowhere to go (the candidate list, the pad, the
     * going-rate card, the working wait, the type-it route) Escape is the only
     * one of the three that does anything, and it cancels the scan -- the same
     * thing their own close button does.
     *
     * Arrow keys inside a field belong to the field: the pad's "% off" and
     * "N for $" spinners step by one on Up and Down, and the type-it input
     * moves its caret. Only Escape is taken there, because a field you cannot
     * back out of without a mouse is the defect one layer down.
     *
     * Scrolling a long detent stays on Tab, PageUp and PageDown -- `.sheet` is
     * the scroll container and is focusable, so those reach it without the
     * arrows having to do two jobs.
     *
     * Nothing here animates, so there is nothing for prefers-reduced-motion to
     * turn off: a stepped detent is the same `data-detent` write the drag
     * makes, and camera.css's own reduced-motion block already drops the
     * transition on `.sheet-half` and `.sheet-full`.
     */
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Escape') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const sheet = slot.querySelector('.sheet');
      if (!sheet) return;
      const inField = e.target instanceof HTMLElement
        && (e.target.closest('input, textarea, select') !== null || e.target.isContentEditable);
      if (inField && e.key !== 'Escape') return;

      const at = clampDetent(sheet, sheet.dataset.detent || 'peek');
      if (e.key === 'Escape') {
        e.preventDefault();
        if (at === 'peek') { reset(); return; }
        setDetent(sheet, 'peek');
        // Back to peek means back to the top of the peek. A sheet left scrolled
        // where the full detent had it shows the verdict's middle.
        sheet.scrollTop = 0;
        return;
      }
      const next = e.key === 'ArrowUp' ? stepUp(sheet, at) : stepDown(at);
      if (next === at) return; // Already at an end. Let the key do whatever it would.
      e.preventDefault();
      setDetent(sheet, next);
    }, { signal: listeners.signal });

    // Backgrounded mid-scan: the tab was hidden (switched app, locked the
    // phone, answered a call) while a scan was open with no answer yet.
    // `{ signal: listeners.signal }` ties this to the same teardown as every
    // other listener above, so a screen change removes it along with them
    // rather than leaking one listener per camera mount.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) trackScanAbandonedIfMidScan('backgrounded');
    }, { signal: listeners.signal });

    return () => {
      // Leaving the camera screen entirely (navigated elsewhere) while a scan
      // was open with no answer yet. Before `dead = true` and the rest of
      // teardown so `cam.dataset.state` is still whatever it was left in.
      trackScanAbandonedIfMidScan('left_screen');
      dead = true;
      listeners.abort();
      unsub();
      eye?.stop();
      stopCamera(stream);
      stopCaptureQueue();
      stopShelfCapture();
      clearTimeout(hintTimer);
      clearTimeout(scanPressTimer);
      clearTimeout(torchAckTimer);
      clearInterval(retryCountdownTimer);
    };
  },
};
