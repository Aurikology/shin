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

import { faceBlock, cad, confidenceOf, dotsHtml, tierOf, sellerOf, animateFace, shinSay, updateShinSay } from '../shin.js';
import { say, wordFor, refusalLabel } from '../voice.js';
import * as store from '../store.js';
import { attachEye } from '../eye-attach.js';
import { escapeHtml } from '../lib/dom.js';
import { submitCorrection } from '../corrections.js';
import { identifyOffline } from '../offline-aisle.js';

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
};

/* ------------------------------------------------------------------ camera */

/**
 * A real camera when the browser will give one, a drawn shelf when it will not.
 *
 * The fallback is not a placeholder for a missing feature. A denied permission,
 * a desktop with no camera and a private window are all normal, and the app has
 * to be the same app in all of them.
 */
async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    return stream;
  } catch {
    return false;
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
function backButton(label = 'Back to camera') {
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
  return `<button type="button" class="grabber" data-act="detent-step" aria-label="Show more"></button>`;
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
  if (modifier.kind === 'percent') return `${cad(eff)} after ${modifier.pct}% off`;
  return `${cad(eff)} each`;
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
         aria-label="Prices found run ${cad(lowCents)} to ${cad(highCents)}. You are looking at ${cad(v.askingCents)}.">
      <span class="rail-track"></span>
      <span class="rail-band" style="left:${at(lowCents)};width:${pct(highCents) - pct(lowCents)}%"></span>
      ${marks}
      <i class="rail-you${outside ? ' out' : ''}" style="left:${at(v.askingCents)}"></i>
      <span class="rail-lo" style="left:${at(lowCents)}">${cad(lowCents)}</span>
      <span class="rail-hi" style="left:${at(highCents)}">${cad(highCents)}</span>
      <span class="rail-me" style="left:${at(v.askingCents)}">you</span>
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
  const mkt = store.market().country || 'Canada';
  if (lowCents === highCents || v.pointCount <= 1) {
    return `${cad(lowCents)} in ${mkt}, one seller`;
  }
  return `${cad(lowCents)} to ${cad(highCents)} in ${mkt}`;
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
      <button type="button" class="toast-undo" data-act="thumbs-undo">Undo</button>
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
        <span>${cad(p.amountCents)} &middot; ${p.observedAt.slice(5)} &middot; ${p.kind}${p.limit ? ` (${p.limit})` : ''}${
          delta !== null && delta > 0 ? ` &middot; ${cad(delta)} less` : ''
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
function cheaperSlot(code) {
  if (!code) return '';
  return `<div class="cheaper" data-cheaper><p class="detail">Looking for a cheaper one&hellip;</p></div>`;
}

/**
 * Paints the swaps into the slot the sheet left for them.
 *
 * The row sentence is the server's, printed as written. The rule about what
 * counts as cheaper lives in the catalogue package, and a screen that
 * paraphrases it is a second place that can be wrong about the same thing.
 *
 * An empty result still says something, in one quiet line, because "there is
 * nothing cheaper we can price" and "we did not look" are different facts and
 * silence would read as the second.
 */
async function fillCheaper(root, code, askingCents) {
  const box = root.querySelector('[data-cheaper]');
  if (!box || !code || typeof askingCents !== 'number') return;
  try {
    const r = await ctxApi.alternatives({ code, askingCents });
    if (!box.isConnected) return;
    if (!r.alternatives.length) {
      box.innerHTML = `<p class="detail">${r.heading}</p>`;
      return;
    }
    box.innerHTML = `
      <p class="detail">${r.heading}</p>
      <div class="prov">
        ${r.alternatives
          .map(
            // Name and the server's sentence, and nothing else. The sentence
            // already carries the seller, the price, the date it was seen and
            // the allergen caveat; an earlier version of this row appended the
            // allergen note a second time, which read as two different warnings
            // about one fact.
            (a) => `<div>
              <b>${escapeHtml(a.product.name)}</b>
              <span>${escapeHtml(a.line)}</span>
            </div>`,
          )
          .join('')}
      </div>`;
  } catch {
    // A lookup that threw is not "there is nothing cheaper". Saying so, rather
    // than leaving the placeholder sentence up forever, which would read as a
    // search still running.
    if (box.isConnected) {
      box.innerHTML = `<p class="detail">${escapeHtml(say('cam_cheaper_failed'))}</p>`;
    }
  }
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
  const facts = { asking: cad(v.askingCents), usual: cad(v.spread.medianCents) };
  const watchFacts = { asking: cad(v.askingCents), seller: source, day: 'today' };
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
    ? `<p class="standin">This asking price is a stated stand-in, not a tag anyone read.</p>`
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
  const disagreeFull = v.disagreement ? v.disagreement.detail : '';
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

      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay(face, spokenKey, spokenFacts, { size: 'face-verdict', tier: v.tier })}
          ${thumbImg(thumb)}
        </div>
        <h2 class="vword">${wordFor(v.tier)}</h2>

        <div class="priceline">
          <span class="price">${cad(v.askingCents)}</span>
          <span class="sub">${source ? `at ${source}<br>` : ''}${goingRateRange(v)}</span>
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
        ${cheaperSlot(codeOf(v, scenario))}
        <details class="why">
          <summary>Why</summary>
          ${disagreeRest ? `<p class="detail">${disagreeRest}</p>` : ''}
          <p class="detail">${escapeHtml(v.confidence.because)}</p>
        </details>
        <div class="actions">
          <button type="button" class="pill ghost" data-act="correct">Correct it</button>
          <button type="button" class="pill ghost" data-act="share">Share</button>
        </div>
      </div>

      <div class="sheet-full">
        ${v.lines.map((l) => `<p class="line">${escapeHtml(l)}</p>`).join('')}
        <div class="thumbs" role="group" aria-label="Was this verdict right?">
          <button type="button" class="thumb" data-act="thumbs-up" aria-label="This looks right">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4.5-8a2 2 0 0 1 2 2.2L12.5 9H19a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 20H9a2 2 0 0 1-2-2v-7z"/></svg>
          </button>
          <button type="button" class="thumb" data-act="thumbs-down" aria-label="This looks wrong">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3zm0 0-4.5 8a2 2 0 0 1-2-2.2l1-5.8H5a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.4 4H15a2 2 0 0 1 2 2v7z"/></svg>
          </button>
        </div>
        <div class="toast-slot" data-toast-slot></div>
        <button type="button" class="pill solid wide done-btn" data-act="cancel-scan">Done</button>
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
 */
const THIN_REASONS = new Set([
  'too_few_points',
  'points_too_stale',
  'no_source_response',
  'comparison_incoherent',
  'unusable_price_kinds',
  'points_future_dated',
  'all_points_from_asking_seller',
]);

function isThinReason(reason) {
  return THIN_REASONS.has(reason);
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
function refusalSheet(r, scenario, categoryLabels = [], keepable = null) {
  const category = scenario?.category ?? 'this';
  const isCategory = r.reason === 'category_unsupported';
  const isUnsure = r.reason === 'identity_unsure';
  const isNoIdentity = r.reason === 'no_identity';
  const isThin = isThinReason(r.reason);

  const titleKey = isCategory ? 'refuse_category' : isUnsure ? 'refuse_unsure' : isThin ? 'refuse_thin' : 'refuse_unknown';
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
  const mine = isCategory || isThin
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
          : `<p class="detail">Could not load the list just now.</p>`}
        ${categoryWhy
          ? `<details class="why"><summary>Why</summary><p class="detail">${categoryWhy}</p></details>`
          : ''}
      </div>`
    : `<div class="actions actions-primary">${
        keepable
          /* One action, never two. USAGE.md section 7 and section 4 both forbid
             a second pill on a refusal, and the label is the contract's own
             word. It is chrome rather than a voice key: two words, no sentence,
             and the same button on every attitude. What Shin SAYS about it is
             keep_it_ack, which has all three. */
          ? `<button type="button" class="pill solid" data-act="keepit">Keep it</button>`
          : isNoIdentity
            ? `<button type="button" class="pill solid" data-act="typeit">Type what it is</button>`
            : `<button type="button" class="pill solid" data-act="correct">Tell me the price</button>`
      }</div>`;

  return `
    <section class="sheet refusal" data-tier="unknown" data-conf="refuses" data-detent="peek" aria-live="polite" tabindex="-1">
      ${grabber()}
      ${isCategory ? backButton() : ''}
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('unknown', titleKey, titleFacts, { size: 'face-verdict' })}
        </div>
        ${mine}
        <p class="detail">${escapeHtml(isCategory ? categoryShort : r.detail)}</p>
        ${repairBlock}
        <p class="itemname">${escapeHtml(r.identity ? r.identity.label : 'No confident match')} &middot; ${refusalLabel(r.reason)}</p>
      </div>
      <div class="sheet-half">
        ${r.evidence.length
          ? `<p class="because">${say('refuse_evidence_some')}</p>${provenance(r.evidence)}`
          : `<p class="because">${say('refuse_evidence_none')}</p>`}
        ${r.evidenceNote
          ? `<details class="why"><summary>Why</summary><p class="detail">${escapeHtml(r.evidenceNote)}</p></details>`
          : ''}
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
                <span class="cand-meta">${cad(i.askingCents)}${i.askingSeller ? ` &middot; ${i.askingSeller}` : ''}${
                  i.observed ? '' : ' &middot; stand-in'
                }</span>
              </button>`,
            )
            .join('')}
          <button type="button" class="cand cand-none" data-pick="__none">
            <span class="cand-name">Something else</span>
            <span class="cand-meta">${say('cam_candidate_none')}</span>
          </button>
        </div>
        <p class="standin-note">Stand-in list until the camera can read the item.</p>
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
            <span class="cand-name">Keep the first one</span>
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
  if (!typed) return '<span class="ghosted">0.00</span>';
  const [whole, frac] = typed.split('.');
  return frac === undefined
    ? `${whole || '0'}<span class="ghosted">.00</span>`
    : `${whole || '0'}.${frac}${frac.length === 1 ? '<span class="ghosted">0</span>' : ''}`;
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
 * @param {string}  [opts.confirmLabel='Price it'] its accessible name.
 * @returns {string} markup: `.keypad` (1-9) followed by `.keypad-bottom`
 *   (`.`, `0`, backspace, and the confirm key when asked for). Every key carries
 *   `data-pad="<char>"`, the char being one of `1`-`9`, `.`, `0`, `⌫`; the
 *   confirm key carries `data-act="pad-confirm"` and `.key-confirm`.
 */
function keypadHtml({ confirm = false, canConfirm = false, confirmLabel = 'Price it' } = {}) {
  const key = (char, extra = '') =>
    `<button type="button" class="btn btn--key" data-pad="${char}"${extra}>${char}</button>`;
  return `
        <div class="keypad">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => key(k)).join('')}
        </div>
        <div class="keypad keypad-bottom${confirm ? '' : ' keypad-bottom-3'}">
          ${key('.')}
          ${key('0')}
          ${key('⌫', ' aria-label="Delete last digit"')}
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
 */
function pricePadSheet(item, typed = '', modifier = null, thumb = null) {
  const typedCents = parsePadPrice(typed);
  const effCents = effectivePriceCents(typedCents, modifier);
  const canConfirm = (effCents ?? 0) > 0;
  const effLabel = modifierLabel(typedCents, modifier);
  return `
    <section class="sheet padsheet" data-tier="unknown" data-conf="reading" tabindex="-1">
      <span class="grabber" aria-hidden="true"></span>
      ${backButton()}
      <div class="pad-headrow">
        <button type="button" class="pad-textbtn" data-act="pad-clear">Clear</button>
        <button type="button" class="pad-textbtn" data-act="pad-skip">Skip</button>
      </div>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${shinSay('asking', 'price_pad_prompt', {}, { size: 64 })}
          ${thumbImg(thumb)}
        </div>
        <p class="itemname">${escapeHtml(item.text)}</p>
        ${
          item.notThisQuery
            ? `<button type="button" class="pad-textbtn notthis" data-act="notthis">${escapeHtml(
                say('cam_notthis_offer'),
              )}</button>`
            : ''
        }
        <div class="amount pad-amount"><span class="amount-cur">$</span>${pricePadDisplay(typed)}</div>
        <p class="pad-effective" data-pad-effective${effLabel ? '' : ' hidden'}>${effLabel}</p>
        <div class="pad-mods" role="group" aria-label="Price modifiers">
          <button type="button" class="modbtn${modifier?.kind === 'percent' ? ' on' : ''}" data-modtoggle="percent">% off</button>
          <button type="button" class="modbtn${modifier?.kind === 'nfor' ? ' on' : ''}" data-modtoggle="nfor">N for $</button>
        </div>
        ${modifier?.kind === 'percent' ? `
        <div class="pad-mod-input">
          <label>Percent off <input type="number" inputmode="numeric" min="1" max="95" data-mod-value value="${modifier.pct ?? ''}" placeholder="20"></label>
        </div>` : ''}
        ${modifier?.kind === 'nfor' ? `
        <div class="pad-mod-input">
          <label>Items in the deal <input type="number" inputmode="numeric" min="2" max="20" data-mod-value value="${modifier.n ?? ''}" placeholder="3"></label>
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
  const sellers = new Set(pts.map((p) => p.seller)).size;
  const mkt = store.market().country || 'Canada';
  const single = pts.length <= 1 || lo === hi;
  const range = single ? cad(lo) : `${cad(lo)} to ${cad(hi)}`;
  const sellerWord = sellers === 1 ? '1 seller' : `${sellers} sellers`;
  const cheapest = pts.slice().sort((a, b) => a.amountCents - b.amountCents)[0];
  const label = refusal.identity ? refusal.identity.label : (item?.text ?? 'this');

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
        <h2 class="vword" style="font-size:20px">Going rate</h2>
        <div class="priceline">
          <span class="price sm">${range}</span>
          <span class="sub">${cheapest ? `at ${escapeHtml(cheapest.seller)}<br>` : ''}in ${mkt}, ${sellerWord}</span>
        </div>
        <p class="itemname">${escapeHtml(label)} &middot; no tag typed</p>
        <div class="actions actions-primary">
          <button type="button" class="pill solid wide" data-act="pad-reopen">Tell me the price</button>
        </div>
      </div>
      <div class="sheet-half">
        ${provenance(pts)}
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
      <button type="button" class="sheet-close" data-act="cancel-scan" aria-label="Cancel and go back to the viewfinder">
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
        <h2 class="vword" style="font-size:20px">Name it</h2>
        <form class="textroute-form" data-form="textroute">
          <input type="text" inputmode="text" autocomplete="off" placeholder="Brand and model&hellip;"
                 value="${value.replace(/"/g, '&quot;')}" data-textroute-input>
          <button type="submit" class="iconbtn-inline" aria-label="Search">
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

/* Exported for the sheet-layout check, which is `app/test/sheet.test.mjs` as of
   2026-09-06 (this comment named `scripts/check-sheet.mjs` for two commits and
   that file was never written). It renders every sheet outside the browser and
   asserts by string that the peek detent carries a primary action before any
   half-detent markup, that a refusal carries exactly one action and is never
   tier-red, and that nothing focusable is hidden behind `aria-hidden`.
   Exporting these changes nothing about how the screen itself calls them. */
export { verdictSheet, refusalSheet, pricePadSheet, goingRateCard, workingSheet, textRouteSheet };

/* Exported with them 2026-09-08, when "not this?" gave the ranked search its
   first caller. It is in the same check for the same reason: it is a sheet, and
   the one rule it has of its own -- an empty list says so in a sentence rather
   than drawing an empty box -- is only true if something asserts it. */
export { searchCandidateSheet };

/*
 * Exported for the correction screen (correct.js), which had its own copy of
 * both of these. The keypad is one component with two hosts; see keypadHtml's
 * own comment for what the camera's pad keeps for itself and why the bare
 * `.key` class is gone. `parsePadPrice` travels with them because a pad that
 * renders the same digits and reads them back differently is the same
 * duplication one layer down.
 */
export { keypadHtml, pricePadDisplay, parsePadPrice };

/* ------------------------------------------------------------------ screen */

export default {
  id: 'camera',
  title: 'Shin',

  render(root, ctx) {
    // The two sheet-filling helpers above sit outside this method because the
    // sheet builders do, and they need the same API this render was handed.
    ctxApi = ctx.api;
    root.innerHTML = `
      <div class="cam" data-state="idle">
        <!-- FLAWS.md item 12: every other screen has an h1 and this one had no
             heading element at all, so a screen reader's heading list skipped
             the app's main surface entirely and router.js has nothing to move
             focus to after a paint. Visually hidden because the wordmark below
             is already the visible identity and a second one drawn over a live
             feed would be chrome for its own sake. -->
        <h1 class="sr-only" tabindex="-1">Shin camera</h1>
        <div class="feed">
          <video class="feed-video" playsinline muted autoplay></video>
          <div class="feed-fallback" aria-hidden="true">
            <span class="shelf s1"></span><span class="shelf s2"></span><span class="shelf s3"></span>
          </div>
          <span class="feed-vignette" aria-hidden="true"></span>
        </div>

        <!-- The wordmark and nothing else. The settings icon that used to sit up
             here duplicated the one in the bottom bar, and the top right corner
             of a camera is the hardest place on the phone for a thumb to reach. -->
        <div class="cam-top">
          <button type="button" class="torch-btn" data-act="torch" aria-label="Torch" aria-pressed="false">
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

        <!-- Shin docked on the viewfinder, top-left under the wordmark: the aim
             hint, the escalated hint, the torch acknowledgement, the second-visit
             callback and the identifying morph all happen in this one component,
             never a second face competing with it. Replaces the old 28px hint
             pill, which is gone. -->
        <div class="cam-shin" data-slot="cam-shin"></div>

        <div class="sheet-slot"></div>

        <div class="cam-bar">
          <button type="button" class="nav-btn" data-act="watchlist" aria-label="Saved">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            <span class="nav-badge" hidden></span>
          </button>
          <button type="button" class="shutter" data-act="shoot" aria-label="Scan what you are pointing at"></button>
          <button type="button" class="nav-btn" data-act="you" aria-label="You">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
          </button>
        </div>
      </div>`;

    const cam = root.querySelector('.cam');
    const slot = root.querySelector('.sheet-slot');
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
    let dead = false;
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
    /* What the current refusal would keep, or null. Held here rather than read
       off the DOM because the price and the shop are facts about the scan, not
       about the markup, and a button cannot be trusted to carry money. */
    let lastKeepable = null;
    let scanThumb = null;
    let coachKey = null;
    let camShinEl = camShin ? camShin.querySelector('.shin-say') : null;

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
      },
    }).then((e) => {
      if (dead) { e.stop(); return; }
      eye = e;
      if (e.live) {
        cam.dataset.camera = 'live';
        showInitialIdleContent();
        return;
      }
      startCamera(video).then((s) => {
        if (dead) { stopCamera(s); return; }
        stream = s;
        // No camera is not a broken app. The drawn shelf carries the same layout
        // so every control stays exactly where it is.
        cam.dataset.camera = s ? 'live' : 'drawn';
        showInitialIdleContent();
      });
    });

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
      cam.dataset.state = next;
      if (camBar) camBar.inert = next === 'result' || next === 'choosing' || next === 'asking' || next === 'texting';
      parkDockedFace(FACE_HIDDEN_IN.has(next));
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
      const label = h.result?.identity?.label ?? h.query?.text ?? 'that item';
      const sellerName = h.result ? sellerOf(h.result) : null;
      const centsRaw = h.query?.askingCents ?? (h.result?.kind === 'verdict' ? h.result.askingCents : undefined);
      const word = h.result?.kind === 'verdict' ? wordFor(h.result.tier) : 'Refused';
      return {
        item: label,
        seller: sellerName || '',
        asking: typeof centsRaw === 'number' ? cad(centsRaw) : '',
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
      clearTimeout(hintTimer);
      clearTimeout(torchAckTimer);
      coachKey = null;
      scanThumb = captureThumb(video, cam.dataset.camera === 'live');
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
        found = await catalogueLookup(read.value);
      } catch {
        found = null;
      }
      if (dead) return;

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
        proceed({ ...found, scannedGtin: read.value }, null);
        return;
      }

      // Read fine, and we do not have it. Decision 22's sentence, not a failure
      // of the camera and not shown as one.
      setState('choosing');
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
    async function catalogueLookup(code) {
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
        id = await ctx.api.identify({ gtin: code });
      } catch {
        id = null; // No signal. The aisle this app was built for.
      }

      /*
       * Two ways to end up with nothing from the server, and the pack can help
       * with both: the request never landed, and the catalogue is not attached
       * to the server at all. The third way, `catalogueUp` with no product, is
       * the catalogue saying it has never seen this code -- and the pack is a
       * slice of that same catalogue, so it cannot know better. Asking it there
       * would only spend time to be told the same thing.
       */
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

      return identifyOffline(code);
    }

    /** Brand, name and size, without repeating the brand when the name has it. */
    function productLabel(p) {
      const parts = [];
      const brand = (p.brands ?? '').split(',')[0].trim();
      if (brand && !p.name.toLowerCase().includes(brand.toLowerCase())) parts.push(brand);
      parts.push(p.name);
      if (p.quantity && !p.name.toLowerCase().includes(String(p.quantity).toLowerCase())) {
        parts.push(p.quantity);
      }
      return parts.join(' ');
    }

    function sameCode(a, b) {
      const n = (s) => String(s).replace(/\D/g, '').replace(/^0+/, '');
      return n(a) === n(b);
    }

    function setTorch(on) {
      torchOn = on;
      cam.dataset.torch = on ? 'on' : 'off';
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

    function paintPad() {
      const amountEl = slot.querySelector('.pad-amount');
      if (amountEl) amountEl.innerHTML = `<span class="amount-cur">$</span>${pricePadDisplay(padBuffer)}`;
      paintPadEffective();
    }

    /** Repaints only the confirm-disabled state and the effective-price
        label, so typing into the modifier's own number input never loses
        focus the way a full re-render would. */
    function paintPadEffective() {
      const typedCents = parsePadPrice(padBuffer);
      const effCents = effectivePriceCents(typedCents, padModifier);
      const confirmBtn = slot.querySelector('.key-confirm');
      if (confirmBtn) confirmBtn.disabled = !((effCents ?? 0) > 0);
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
        .map((c) => ({
          code: c.code,
          label: productLabel(c),
          category: c.leafCategory ?? from.category,
          meta: c.brands ? String(c.brands).split(',')[0].trim() : '',
        }));
      setState('choosing');
      slot.innerHTML = searchCandidateSheet(notThisResults, query);
      mounted();
    }

    function openPad(item) {
      padItem = item;
      padBuffer = '';
      padModifier = null;
      setState('asking');
      slot.innerHTML = pricePadSheet(item, padBuffer, padModifier, scanThumb);
      mounted();
    }

    function shoot() {
      if (cam.dataset.state !== 'idle') return;
      clearTimeout(hintTimer);
      clearTimeout(torchAckTimer);
      coachKey = null;
      setState('framing');
      // Row 40: the frozen frame, captured now, at the moment of the shutter
      // press, so it is the picture the verdict later shows, not a later
      // re-grab of a feed that has already moved on.
      scanThumb = captureThumb(video, cam.dataset.camera === 'live');
      // With the eye running, the shutter also takes the real capture: a short
      // burst, the sharpest frame of it, cropped to what was found. It replaces
      // the thumbnail above when it lands, which is a frame or two later and
      // always before the sheet it appears on.
      lastCrop = null;
      if (eye?.live) void eye.capture();
      // The same docked face morphs to thinking, in place, rather than a
      // separate sheet popping up over it for 420ms.
      dockSay('thinking', 'reading', {}, 'think-dots');
      // The frame is already frozen by the state change. This pause is the
      // reticle contracting, not a fake loading bar over an instant answer.
      setTimeout(() => {
        if (dead) return;
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
        });
        clearTimeout(slowTimer);
        if (dead || myGen !== gen) return;
        step = 2; // Event: the response has actually arrived.
        last = { result, scenario: item, thumb: scanThumb };
        store.recordVerdict(result, { text: item.text, askingCents, thumb: scanThumb });
        if (result.kind === 'verdict') {
          slot.innerHTML = verdictSheet(result, item, scanThumb);
          // Not awaited: the verdict is the answer and must not wait on a
          // second lookup. The swaps land in the half detent, below the fold,
          // whenever they arrive.
          void fillCheaper(slot, codeOf(result, item), result.askingCents);
          // Row 83: the verdict landing, once, right here.
          buzz(16);
        } else if (result.reason === 'no_asking_price') {
          // Section 2's couch card, not a refusal: Shin has the comparison
          // set, only the one number was never supplied.
          slot.innerHTML = goingRateCard(result, item);
        } else {
          lastKeepable = keepableFrom(result, item, askingCents, isThinReason(result.reason));
          slot.innerHTML = refusalSheet(result, item, supportedCategories, lastKeepable);
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
         * The name survives the failure. `item.offline` means the barcode was
         * answered off the pack on this phone, with the network already down,
         * so this refusal is that scan's expected ending and not a surprise --
         * and the one thing worth saying is the thing we do know. Naming the
         * product here is the whole reason the pack is on the phone; dropping
         * it into "no confident match", which is what an unset identity prints,
         * would throw away the answer at the last step.
         *
         * It is passed on every path, not just the offline one. Whatever the
         * price call was going to do, the app always knew what it was pricing.
         */
        slot.innerHTML = refusalSheet(
          {
            kind: 'refusal',
            reason: 'no_source_response',
            detail: item.offline ? say('cam_offline_no_price') : say('cam_sources_failed'),
            identity: item.text ? { label: item.text } : null,
            evidence: [],
          },
          item,
          supportedCategories,
        );
        playRefusalLanding(slot);
        setState('result');
        mounted();
      }
    }

    function reset() {
      gen++; // Voids any in-flight proceed() continuation.
      slot.innerHTML = '';
      last = null;
      lastKeepable = null;
      scanThumb = null;
      // A pick belongs to the scan that has just ended. Carrying it into the
      // next one would frame whatever happens to overlap the old rectangle,
      // which is the class of quietly-wrong framing this whole system exists
      // to remove.
      coachKey = null;
      eye?.clearSelection?.();
      setState('idle');
      showInitialIdleContent();
      // The sheet that had focus has just been deleted. Back to the shutter,
      // which is where the viewfinder's own attention is and the one control a
      // returning user wants next -- otherwise focus falls to `body` and the
      // next Tab starts again from the top of the document.
      root.querySelector('.shutter')?.focus({ preventScroll: true });
    }

    root.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const id = pick.dataset.pick;
        if (id === '__none') {
          // An honest unknown. The engine is asked a question it cannot answer
          // rather than the app faking the refusal, so the refusal on screen is
          // the engine's own.
          openPad({ text: 'a thing shin has never seen', category: 'grocery' });
          return;
        }
        const item = scenarios.find((s) => s.id === id);
        if (item) openPad(item);
        return;
      }

      const notThis = e.target.closest('[data-act="notthis"]');
      if (notThis) {
        void reopenCandidates();
        return;
      }

      const back = e.target.closest('[data-act="notthis-back"]');
      if (back) {
        // Straight back to the pad on the item that was already picked. The
        // buffer is deliberately not cleared: a shopper who had typed half a
        // price, looked at the list and decided the first answer was right
        // should not have to type it again.
        setState('asking');
        slot.innerHTML = pricePadSheet(padItem, padBuffer, padModifier, scanThumb);
        mounted();
        return;
      }

      const pickCode = e.target.closest('[data-pick-code]');
      if (pickCode) {
        const chosen = notThisResults.find((c) => c.code === pickCode.dataset.pickCode);
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

      const modToggle = e.target.closest('[data-modtoggle]');
      if (modToggle) {
        const kind = modToggle.dataset.modtoggle;
        padModifier = padModifier && padModifier.kind === kind
          ? null
          : (kind === 'percent' ? { kind: 'percent', pct: 20 } : { kind: 'nfor', n: 3 });
        slot.innerHTML = pricePadSheet(padItem, padBuffer, padModifier, scanThumb);
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
      if (act === 'watchlist') { ctx.go('watchlist'); return; }
      if (act === 'you') { ctx.go('you'); return; }
      if (act === 'torch') { requestTorch(!torchOn); return; }

      if (act === 'pad-clear') { padBuffer = ''; paintPad(); return; }
      // The pad's own confirm key (USAGE A1 0:13.4): nothing submits until
      // this is pressed. No debounce, no auto-submit on a pause. Row 43:
      // sends the effective price under any active modifier, not the typed
      // sticker number.
      if (act === 'pad-confirm') {
        const typedCents = parsePadPrice(padBuffer);
        const cents = effectivePriceCents(typedCents, padModifier);
        if (cents === null || cents <= 0) return;
        proceed(padItem, cents);
        return;
      }
      // Skip proceeds with no asking price at all (row 44): not a refusal,
      // the going-rate card.
      if (act === 'pad-skip') { proceed(padItem, undefined); return; }
      if (act === 'pad-reopen' && last?.scenario) { openPad(last.scenario); return; }

      // Row 17, 88, 89, take: the second route out of a no-identity refusal.
      if (act === 'typeit') {
        setState('texting');
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
            { asking: cad(k.askingCents), seller: k.seller, day: 'today' },
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
        // The sheet was rebuilt from scratch by the save, so the swaps have to
        // be fetched again: they live in the markup that was just replaced.
        void fillCheaper(slot, codeOf(v, last.scenario), v.askingCents);
        const nextSheet = slot.querySelector('.sheet');
        if (nextSheet && prevDetent) setDetent(nextSheet, prevDetent);
        // Same repaint-under-the-press as the modifier toggles: the save button
        // is a toggle, and the second press has to land on the same key.
        mounted('[data-act="watch"]');
        return;
      }
      if (act === 'thumbs-up' || act === 'thumbs-down') {
        // The one-tap correctness signal (DESIGN.md section 4, full detent).
        // GAMIFICATION.md M12 / OLMA audit rows 64, 65, take: it earns
        // nothing and writes nothing but this local signal. Row 35's toast
        // acknowledges the tap, Undo live for four seconds.
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
        const toastSlot = btn.closest('[data-toast-slot]');
        btn.closest('.sheet-full')?.querySelectorAll('.thumb').forEach((t) => t.classList.remove('picked'));
        if (toastSlot) { clearTimeout(toastSlot._timer); toastSlot.innerHTML = ''; }
        return;
      }
    }, { signal: listeners.signal });

    root.addEventListener('input', (e) => {
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
      const priced = matchCatalogue(text, catalogueItems);
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
          const id = await ctx.api.identify({ text });
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
          }
        } catch {
          typed = null;
        }
      }
      if (dead) return;
      if (typed) {
        openPad(typed);
        return;
      }
      // No match: the unsure refusal, the engine's own shape, never a fake
      // "not found" screen. It carries the second route again.
      last = null;
      slot.innerHTML = refusalSheet(
        {
          kind: 'refusal',
          reason: 'no_identity',
          detail: `Nothing in what Shin has been taught matches "${text}".`,
          identity: null,
          evidence: [],
        },
        null,
        supportedCategories,
      );
      playRefusalLanding(slot);
      setState('result');
      mounted();
    }, { signal: listeners.signal });

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
      g.setAttribute('aria-label', at === maxDetent(sheet) ? 'Back to the summary' : 'Show more');
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

    return () => {
      dead = true;
      listeners.abort();
      unsub();
      eye?.stop();
      stopCamera(stream);
      clearTimeout(hintTimer);
      clearTimeout(torchAckTimer);
    };
  },
};
