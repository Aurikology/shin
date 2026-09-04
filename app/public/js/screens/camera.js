/**
 * The camera. This is the app.
 *
 * It replaces four screens that used to be four pages: scan, identify, verdict
 * and actions. They are one surface now, because the user never leaves the
 * picture they took. The frame freezes where it was shot, the reticle contracts
 * onto what was found, and a sheet rises over it. Going back is a downward drag.
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

import { faceSvg, faceBlock, cad, confidenceOf, dotsHtml, tierOf, sellerOf, animateFace } from '../shin.js';
import { say, wordFor } from '../voice.js';
import * as store from '../store.js';

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
    .map((p) => `<i class="rail-pt" style="left:${at(p.amountCents)}" title="${p.seller}"></i>`)
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
    </div>
    <p class="rail-note">Every price I found, lowest to highest. Nothing here is an average.</p>`;
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

/** Row 35's toast: earns nothing, writes nothing but the local signal. */
function feedbackToast() {
  return `
    <div class="toast" data-toast>
      ${faceBlock('pleased', { size: 'face-row' })}
      <span class="toast-text">${say('feedback_ack')}</span>
      <button type="button" class="toast-undo" data-act="thumbs-undo">Undo</button>
    </div>`;
}

function provenance(points) {
  if (!points.length) return '';
  return `<div class="prov">${points
    .map(
      (p) => `<div>
        <b>${p.seller}</b>
        <span>${cad(p.amountCents)} · ${p.observedAt.slice(5)} · ${p.kind}${p.limit ? ` (${p.limit})` : ''}</span>
      </div>`,
    )
    .join('')}</div>`;
}

function verdictSheet(v, scenario) {
  const conf = confidenceOf(v);
  const source = sellerOf(v);
  // Watch acknowledged (AVATAR.md row 32) morphs the verdict face in place,
  // no move, no re-render of anything else: still the tier's own face and
  // line once the acknowledgement has been seen, since the verdict itself
  // has not changed, only what happened since it landed.
  const watched = store.isWatched(v.identity.id);
  // The tier already knows which face it wears, unless the intense gate
  // (AVATAR.md section 2) is met: delighted or angry, with the tier's own
  // word and colour unchanged, per the coordinator's Chrome-walk note.
  const face = watched ? 'pleased' : intenseFaceFor(v, tierOf(v.tier).face, conf, source);
  const facts = { asking: cad(v.askingCents), usual: cad(v.spread.medianCents) };
  const watchFacts = { asking: cad(v.askingCents), seller: source, day: 'today' };
  const intenseKey = face === 'delighted' ? 'verdict_steal' : face === 'angry' ? 'verdict_ripoff' : null;
  const said = watched ? say('watching', watchFacts) : say(intenseKey ?? v.tier, facts);

  // The stand-in note sits in the peek, not the detail. It qualifies the number
  // the user is reading right now, and a caveat you have to drag a sheet open to
  // find is not a caveat.
  const standIn = scenario && scenario.observed === false
    ? `<p class="standin">This asking price is a stated stand-in, not a tag anyone read.</p>`
    : '';

  // Three detents (USAGE.md section 7 / DESIGN.md section 4, which agree with
  // each other exactly, over this build pass's own looser paraphrase of them):
  // peek carries the one wide primary and nothing else can push it below the
  // fold; half adds the rail, the confidence sentence and the provenance list;
  // full adds what Shin used in full and the one-tap correctness signal. The
  // two full-detent actions ("Find it cheaper nearby", "Show me a dupe") are
  // marked not-v1 in both docs, so full ships with no actions of its own.
  return `
    <section class="sheet" data-tier="${v.tier}" data-conf="${conf.level}" data-detent="peek" aria-live="polite">
      <span class="grabber" aria-hidden="true" role="button" tabindex="0" aria-label="Show more"></span>

      <div class="sheet-peek">
        <div class="sheet-head">
          ${faceBlock(face, { size: 'face-verdict' })}
          <div>
            <h2 class="vword">${wordFor(v.tier)}</h2>
            <p class="said">${said}</p>
          </div>
        </div>

        <div class="priceline">
          <span class="price">${cad(v.askingCents)}</span>
          <span class="sub">${source ? `at ${source}<br>` : ''}${goingRateRange(v)}</span>
        </div>

        <div class="confrow">
          ${dotsHtml(conf.dots)}
          <span class="conf-label">${conf.label}</span>
        </div>
        ${standIn}
        <p class="itemname">${v.identity.label}</p>

        <div class="actions actions-primary">
          <button type="button" class="pill solid wide" data-act="watch">
            ${watched ? say('peek_watching') : say(`peek_${v.tier}`)}
          </button>
        </div>
      </div>

      <div class="sheet-half">
        ${spreadRail(v)}
        ${v.disagreement ? `<p class="disagree">${v.disagreement.detail}</p>` : ''}
        <p class="because">${v.confidence.because}</p>
        ${provenance(v.comparisonSet)}
        <div class="actions">
          <button type="button" class="pill ghost" data-act="correct">Correct it</button>
          <button type="button" class="pill ghost" data-act="share">Share</button>
        </div>
      </div>

      <div class="sheet-full">
        ${v.lines.map((l) => `<p class="line">${l}</p>`).join('')}
        <div class="thumbs" role="group" aria-label="Was this verdict right?">
          <button type="button" class="thumb" data-act="thumbs-up" aria-label="This looks right">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4.5-8a2 2 0 0 1 2 2.2L12.5 9H19a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 20H9a2 2 0 0 1-2-2v-7z"/></svg>
          </button>
          <button type="button" class="thumb" data-act="thumbs-down" aria-label="This looks wrong">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3zm0 0-4.5 8a2 2 0 0 1-2-2.2l1-5.8H5a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.4 4H15a2 2 0 0 1 2 2v7z"/></svg>
          </button>
        </div>
        <div class="toast-slot" data-toast-slot></div>
      </div>
    </section>`;
}

/**
 * The refusal, which is a screen and not an error.
 *
 * Every reason gets its own sentence and its own repair, because "could not
 * price this" with no way forward is how a user learns to stop scanning.
 */
function refusalSheet(r, scenario) {
  const category = scenario?.category ?? 'this';
  const isCategory = r.reason === 'category_unsupported';
  const isUnsure = r.reason === 'identity_unsure';
  const isNoIdentity = r.reason === 'no_identity';
  const isThin = r.reason === 'too_few_points'
    || r.reason === 'points_too_stale'
    || r.reason === 'no_source_response'
    || r.reason === 'comparison_incoherent';

  const title = isCategory
    ? say('refuse_category', { category })
    : isUnsure
      ? say('refuse_unsure')
      : isThin
        ? say('refuse_thin')
        : say('refuse_unknown');

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
  const repair = isCategory
    ? `<button type="button" class="pill ghost" data-act="categories">What I can price</button>`
    : isNoIdentity
      ? `<button type="button" class="pill solid" data-act="typeit">Type what it is</button>`
      : `<button type="button" class="pill solid" data-act="correct">Tell me the price</button>`;

  return `
    <section class="sheet refusal" data-tier="unknown" data-conf="refuses" data-detent="peek" aria-live="polite">
      <span class="grabber" aria-hidden="true" role="button" tabindex="0" aria-label="Show more"></span>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${faceBlock('unknown', { size: 'face-verdict' })}
          <div>
            <h2 class="vword small">${title}</h2>
            ${mine}
          </div>
        </div>
        <p class="detail">${r.detail}</p>
        <div class="actions actions-primary">${repair}</div>
        <p class="itemname">${r.identity ? r.identity.label : 'No confident match'} · ${r.reason.replace(/_/g, ' ')}</p>
      </div>
      <div class="sheet-half">
        ${r.evidence.length
          ? `<p class="because">${say('refuse_evidence_some')}</p>${provenance(r.evidence)}`
          : `<p class="because">${say('refuse_evidence_none')}</p>`}
      </div>
    </section>`;
}

/**
 * AVATAR.md row 36: the refusal's landing is `verdict-land` at 340ms, then
 * `slow-blink`, never the shake/buzz/red a normal miss might otherwise get.
 * Called right after a refusal sheet's markup is mounted, on its own face.
 */
function playRefusalLanding(slot) {
  const el = slot.querySelector('.face');
  if (!el) return;
  animateFace(el, 'verdict-land');
  setTimeout(() => animateFace(el, 'slow-blink'), 340);
}

/**
 * The wait, between a shutter press and an answer.
 *
 * AVATAR.md row 11 (identifying, right after the shutter) and rows 16 to 19
 * (working through the price search once a candidate is picked) are two
 * different moments with two different sizes; this screen renders both
 * through the same sheet component, so the size is the one thing that tells
 * them apart until the sheet itself is split in two.
 */
function readingSheet(size = 'face-working') {
  return `
    <section class="sheet reading" data-tier="unknown" data-conf="reading">
      <span class="grabber" aria-hidden="true"></span>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${faceBlock('thinking', { size })}
          <div><h2 class="vword small">${say('reading')}</h2></div>
        </div>
      </div>
    </section>`;
}

/**
 * What Shin might be looking at. Real items, real recorded asking prices.
 *
 * AVATAR.md row 37, the unsure refusal: two or more candidates and Shin
 * cannot separate them without help, which is exactly this screen's state.
 * Row 13 (the identity chip's wrong-item repair) was the other candidate for
 * this spot, but it only exists after a chip has already named one item and
 * been tapped as wrong; here there is no chip yet, only the candidate list
 * itself as the one action, which is row 37's own description. So this
 * screen reuses row 37's strings and its size, `face-verdict` at `unknown`,
 * rather than row 13's `face-row`.
 */
function candidateSheet(items) {
  return `
    <section class="sheet candidates" data-tier="unknown" data-conf="reading">
      <span class="grabber" aria-hidden="true"></span>
      <div class="sheet-peek">
        <div class="sheet-head compact">
          ${faceBlock('unknown', { size: 'face-verdict' })}
          <div>
            <h2 class="vword small">${say('refuse_unsure')}</h2>
            <p class="said">${say('refuse_unsure_why')}</p>
          </div>
        </div>
        <div class="cands">
          ${items
            .map(
              (i) => `<button type="button" class="cand" data-pick="${i.id}">
                <span class="cand-name">${i.text}</span>
                <span class="cand-meta">${cad(i.askingCents)}${i.askingSeller ? ` · ${i.askingSeller}` : ''}${
                  i.observed ? '' : ' · stand-in'
                }</span>
              </button>`,
            )
            .join('')}
          <button type="button" class="cand cand-none" data-pick="__none">
            <span class="cand-name">Something else</span>
            <span class="cand-meta">I will almost certainly refuse</span>
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
 * The identified item's name is the confirmation above the field (row 40, the
 * photo thumbnail adapted to the name chip since there is no camera model).
 *
 * USAGE.md A1 0:13.4 says "the pad's own key is the continue," built literally
 * here as a confirm key inside the keypad grid rather than a debounce after
 * typing stops: a pause guessing that typing has finished is exactly how
 * someone who types "2", glances back at the tag, then types ".49" gets
 * priced at $2.00, and a wrong verdict is worse than no verdict (CLAUDE.md
 * priority 1). Nothing submits until the confirm key is pressed, and it is
 * disabled until the buffer parses to more than zero.
 */
function pricePadSheet(item, typed = '') {
  const canConfirm = (parsePadPrice(typed) ?? 0) > 0;
  return `
    <section class="sheet padsheet" data-tier="unknown" data-conf="reading">
      <span class="grabber" aria-hidden="true"></span>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${faceBlock('asking', { size: 'face-page' })}
          <div>
            <h2 class="vword pad-prompt" style="font-size:19px">${say('price_pad_prompt')}</h2>
            <p class="said">${item.text}</p>
          </div>
        </div>
        <div class="amount pad-amount"><span class="amount-cur">$</span>${pricePadDisplay(typed)}</div>
        <div class="keypad">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9']
            .map((k) => `<button type="button" class="key" data-pad="${k}">${k}</button>`)
            .join('')}
        </div>
        <div class="keypad keypad-bottom">
          <button type="button" class="key" data-pad=".">.</button>
          <button type="button" class="key" data-pad="0">0</button>
          <button type="button" class="key" data-pad="⌫" aria-label="Backspace">⌫</button>
          <button type="button" class="key key-confirm" data-act="pad-confirm" aria-label="Price it"${canConfirm ? '' : ' disabled'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </button>
        </div>
        <div class="actions">
          <button type="button" class="pill ghost" data-act="pad-clear">Clear</button>
          <button type="button" class="pill ghost" data-act="pad-skip">Skip</button>
        </div>
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
    <section class="sheet goingrate" data-tier="unknown" data-conf="reading">
      <span class="grabber" aria-hidden="true"></span>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${faceBlock('asking', { size: 'face-working' })}
          <div>
            <h2 class="vword" style="font-size:20px">Going rate</h2>
            <p class="said">${say('going_rate')}</p>
          </div>
        </div>
        <div class="priceline">
          <span class="price sm">${range}</span>
          <span class="sub">${cheapest ? `at ${cheapest.seller}<br>` : ''}in ${mkt}, ${sellerWord}</span>
        </div>
        <p class="itemname">${label} &middot; no tag typed</p>
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
  return `
    <section class="sheet working" data-tier="unknown" data-conf="reading">
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
        <p class="itemname">${itemLabel}</p>
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
    <section class="sheet textroute" data-tier="unknown" data-conf="reading">
      <span class="grabber" aria-hidden="true"></span>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${faceBlock('asking', { size: 'face-page' })}
          <div>
            <h2 class="vword" style="font-size:20px">Name it</h2>
            <p class="said">${say('text_route_prompt')}</p>
          </div>
        </div>
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

/* Exported for the sheet-layout check (`node scripts/check-sheet.mjs` or
   equivalent): it renders verdictSheet/refusalSheet outside the browser and
   asserts by string that the peek detent carries a primary action before any
   half-detent markup, and that a refusal never carries two buttons. Exporting
   these changes nothing about how the screen itself calls them. */
export { verdictSheet, refusalSheet, pricePadSheet, goingRateCard, workingSheet, textRouteSheet };

/* ------------------------------------------------------------------ screen */

export default {
  id: 'camera',
  title: 'Shin',

  render(root, ctx) {
    root.innerHTML = `
      <div class="cam" data-state="idle">
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
        <p class="cam-hint">${faceSvg('idle', { size: 'face-row' })}<span>Point at a price tag</span></p>

        <div class="sheet-slot"></div>

        <div class="cam-bar">
          <button type="button" class="nav-btn" data-act="watchlist" aria-label="Watching">
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

    let stream = null;
    let scenarios = [];
    let catalogueItems = [];
    let last = null;      // { result, scenario }
    let dead = false;
    let torchOn = false;
    let hintEscalated = false;
    let hintTimer = null;

    startCamera(video).then((s) => {
      if (dead) { stopCamera(s); return; }
      stream = s;
      // No camera is not a broken app. The drawn shelf carries the same layout
      // so every control stays exactly where it is.
      cam.dataset.camera = s ? 'live' : 'drawn';
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

    function paintBadge() {
      const n = store.get().watchlist.length;
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    paintBadge();
    const unsub = store.subscribe(paintBadge);

    function setState(next) { cam.dataset.state = next; }

    /*
     * Row 9, unprompted, once per camera session: four seconds live with
     * nothing detected escalates the hint's face and line. Cleared the
     * instant a scan starts (that is a detection); never re-armed once it
     * has fired, even across a reset back to idle.
     */
    function armHintEscalation() {
      clearTimeout(hintTimer);
      if (hintEscalated) return;
      hintTimer = setTimeout(() => {
        if (dead || hintEscalated || cam.dataset.state !== 'idle') return;
        hintEscalated = true;
        const hintText = root.querySelector('.cam-hint span');
        const hintFace = root.querySelector('.cam-hint .face');
        if (hintText) hintText.textContent = say('hint_escalated');
        if (hintFace) hintFace.outerHTML = faceSvg('asking', { size: 'face-row' });
      }, 4000);
    }
    armHintEscalation();

    /* Chrome, not a face (AVATAR.md row 10): the visibly lit scene is the
       torch's own feedback (OLMA audit row 90), the icon just says which
       state it is in. */
    function setTorch(on) {
      torchOn = on;
      cam.dataset.torch = on ? 'on' : 'off';
      root.querySelector('.torch-btn')?.setAttribute('aria-pressed', String(on));
    }

    let gen = 0;
    let padBuffer = '';
    let padItem = null;

    function paintPad() {
      const el = slot.querySelector('.pad-amount');
      if (el) el.innerHTML = `<span class="amount-cur">$</span>${pricePadDisplay(padBuffer)}`;
      const confirmBtn = slot.querySelector('.key-confirm');
      if (confirmBtn) confirmBtn.disabled = !((parsePadPrice(padBuffer) ?? 0) > 0);
    }

    /*
     * Row 41, 42, 44, take: the asking price pad. Its own confirm key is the
     * continue (USAGE.md A1 0:13.4), never a pause after typing stops: a
     * debounce here would price "2", a glance back at the tag, then ".49" as
     * $2.00, and a wrong verdict outranks no verdict (CLAUDE.md priority 1).
     * Clear resets the buffer; Skip proceeds with no asking price at all,
     * which is the going-rate card, not a refusal.
     */
    function openPad(item) {
      padItem = item;
      padBuffer = '';
      setState('asking');
      slot.innerHTML = pricePadSheet(item, padBuffer);
    }

    function shoot() {
      if (cam.dataset.state !== 'idle') return;
      clearTimeout(hintTimer);
      setState('framing');
      slot.innerHTML = readingSheet('face-row');
      // The frame is already frozen by the state change. This pause is the
      // reticle contracting, not a fake loading bar over an instant answer.
      setTimeout(() => {
        if (dead) return;
        slot.innerHTML = candidateSheet(scenarios);
        setState('choosing');
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

      // Row 19: past the 0.8s budget, the step already showing changes its
      // own word. Never a new step, and it never fires once the answer has
      // already landed.
      const slowTimer = setTimeout(() => {
        if (dead || myGen !== gen) return;
        slow = true;
        slot.innerHTML = workingSheet(item.text, step, { slow: true });
      }, 800);

      try {
        step = 1; // Event: the price request is actually about to be sent.
        if (myGen === gen) {
          slot.innerHTML = workingSheet(item.text, step, { slow });
          // AVATAR.md row 17/section 5 row 6: the named step changed, once.
          animateFace(slot.querySelector('.face'), 'step-swap');
        }
        const result = await ctx.api.price({
          text: item.text,
          category: item.category,
          askingCents,
          // Always, when there is a price to attribute. The store being
          // judged must never land inside its own comparison set.
          askingSeller: askingCents !== undefined ? (item.askingSeller ?? undefined) : undefined,
        });
        clearTimeout(slowTimer);
        if (dead || myGen !== gen) return;
        step = 2; // Event: the response has actually arrived.
        last = { result, scenario: item };
        store.recordVerdict(result, { text: item.text, askingCents });
        if (result.kind === 'verdict') {
          slot.innerHTML = verdictSheet(result, item);
        } else if (result.reason === 'no_asking_price') {
          // Section 2's couch card, not a refusal: Shin has the comparison
          // set, only the one number was never supplied.
          slot.innerHTML = goingRateCard(result, item);
        } else {
          slot.innerHTML = refusalSheet(result, item);
          playRefusalLanding(slot);
        }
        setState('result');
      } catch (err) {
        clearTimeout(slowTimer);
        if (dead || myGen !== gen) return;
        slot.innerHTML = refusalSheet(
          {
            kind: 'refusal',
            reason: 'no_source_response',
            detail: `I could not reach my own sources just now. ${String(err.message ?? err)}`,
            identity: null,
            evidence: [],
          },
          item,
        );
        playRefusalLanding(slot);
        setState('result');
      }
    }

    function reset() {
      gen++; // Voids any in-flight proceed() continuation.
      slot.innerHTML = '';
      last = null;
      setState('idle');
      armHintEscalation();
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

      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;

      if (act === 'shoot') { shoot(); return; }
      if (act === 'watchlist') { ctx.go('watchlist'); return; }
      if (act === 'you') { ctx.go('you'); return; }
      if (act === 'categories') { ctx.go('you'); return; }
      if (act === 'torch') { setTorch(!torchOn); return; }

      if (act === 'pad-clear') { padBuffer = ''; paintPad(); return; }
      // The pad's own confirm key (USAGE A1 0:13.4): nothing submits until
      // this is pressed. No debounce, no auto-submit on a pause.
      if (act === 'pad-confirm') {
        const cents = parsePadPrice(padBuffer);
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
        return;
      }

      // Row 49, take: aborts the scan in progress and returns to the live
      // viewfinder. The downward drag below does the same thing; this is the
      // discoverable control the row asks for.
      if (act === 'cancel-scan') { reset(); return; }

      if (act === 'correct') {
        ctx.go('correct', last?.scenario ? { text: last.scenario.text, category: last.scenario.category } : {});
        return;
      }
      if (act === 'share' && last?.result?.kind === 'verdict') {
        ctx.go('share', { id: last.result.identity.id });
        return;
      }
      if (act === 'watch' && last?.result?.kind === 'verdict') {
        const v = last.result;
        store.toggleWatch({
          id: v.identity.id,
          label: v.identity.label,
          category: v.category,
          lastCents: v.askingCents,
          // The seller travels with the saved record. A watch that forgets where
          // the price was seen re-prices the item against its own shelf later.
          askingSeller: sellerOf(v),
          usualCents: v.spread.medianCents,
        });
        // Watch acknowledged (row 32) morphs the verdict face in place, so the
        // whole sheet is repainted from the same v/scenario rather than only
        // the button, and the detent the user was reading is carried across
        // the repaint.
        const prevDetent = slot.querySelector('.sheet')?.dataset.detent;
        slot.innerHTML = verdictSheet(v, last.scenario);
        const nextSheet = slot.querySelector('.sheet');
        if (nextSheet && prevDetent) nextSheet.dataset.detent = clampDetent(nextSheet, prevDetent);
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
    });

    root.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-form="textroute"]');
      if (!form) return;
      e.preventDefault();
      const text = (form.querySelector('[data-textroute-input]')?.value ?? '').trim();
      if (!text) return;
      const match = matchCatalogue(text, catalogueItems);
      if (match) {
        const item = scenarios.find((s) => s.id === match.id) ?? { text: match.label, category: match.category };
        openPad(item);
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
      );
      playRefusalLanding(slot);
      setState('result');
    });

    /* The sheet moves between three detents: peek, half, full. A drag of more
       than 40px moves one detent in that direction (downward past peek
       dismisses); a tap on the grabber or head steps forward, wrapping from
       the sheet's own top detent back to peek. A sheet with no sheet-half or
       sheet-full content (the reading and candidate sheets) has nowhere to
       go, so it just stays at peek. */
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

    let dragFrom = null;
    root.addEventListener('pointerdown', (e) => {
      const sheet = e.target.closest('.sheet');
      if (!sheet || !e.target.closest('.grabber, .sheet-head')) return;
      dragFrom = { y: e.clientY, detent: clampDetent(sheet, sheet.dataset.detent || 'peek'), sheet };
      sheet.setPointerCapture?.(e.pointerId);
    });
    root.addEventListener('pointerup', (e) => {
      if (!dragFrom) return;
      const dy = e.clientY - dragFrom.y;
      const { sheet, detent } = dragFrom;
      dragFrom = null;
      if (dy < -40) sheet.dataset.detent = stepUp(sheet, detent);
      else if (dy > 40) {
        if (detent === 'peek') { reset(); return; }
        sheet.dataset.detent = stepDown(detent);
      } else {
        sheet.dataset.detent = detent === maxDetent(sheet) ? 'peek' : stepUp(sheet, detent);
      }
    });

    return () => {
      dead = true;
      unsub();
      stopCamera(stream);
      clearTimeout(hintTimer);
    };
  },
};
