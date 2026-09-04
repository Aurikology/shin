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

import { faceSvg, cad, confidenceOf, dotsHtml, tierOf, sellerOf } from '../shin.js';
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
  // The tier already knows which face it wears. A second map here would be a
  // second opinion about the same thing.
  const face = tierOf(v.tier).face;
  const facts = { asking: cad(v.askingCents), usual: cad(v.spread.medianCents) };

  // The stand-in note sits in the peek, not the detail. It qualifies the number
  // the user is reading right now, and a caveat you have to drag a sheet open to
  // find is not a caveat.
  const standIn = scenario && scenario.observed === false
    ? `<p class="standin">This asking price is a stated stand-in, not a tag anyone read.</p>`
    : '';

  const source = sellerOf(v);

  return `
    <section class="sheet" data-tier="${v.tier}" data-conf="${conf.level}" aria-live="polite">
      <span class="grabber" aria-hidden="true"></span>

      <div class="sheet-peek">
        <div class="sheet-head">
          ${faceSvg(face, { size: 96 })}
          <div>
            <h2 class="vword">${wordFor(v.tier)}</h2>
            <p class="said">${say(v.tier, facts)}</p>
          </div>
        </div>

        <div class="priceline">
          <span class="price">${cad(v.askingCents)}</span>
          <span class="sub">${source ? `at ${source}<br>` : ''}usually ${cad(v.spread.medianCents)}</span>
        </div>

        <div class="confrow">
          ${dotsHtml(conf.dots)}
          <span class="conf-label">${conf.label}</span>
        </div>
        ${standIn}
        <p class="itemname">${v.identity.label}</p>
      </div>

      <div class="sheet-more">
        ${v.lines.map((l) => `<p class="line">${l}</p>`).join('')}
        ${spreadRail(v)}
        ${v.disagreement ? `<p class="disagree">${v.disagreement.detail}</p>` : ''}
        <p class="because">${v.confidence.because}</p>
        ${provenance(v.comparisonSet)}
        <div class="actions">
          <button type="button" class="pill solid" data-act="watch">
            ${store.isWatched(v.identity.id) ? 'Watching' : 'Watch it'}
          </button>
          <button type="button" class="pill ghost" data-act="correct">Correct it</button>
          <button type="button" class="pill ghost" data-act="share">Share</button>
        </div>
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

  const repair = isCategory
    ? `<button type="button" class="pill ghost" data-act="categories">What I can price</button>`
    : `<button type="button" class="pill solid" data-act="correct">Tell me the price</button>
       <button type="button" class="pill ghost" data-act="again">Try again</button>`;

  return `
    <section class="sheet refusal" data-tier="unknown" data-conf="refuses" aria-live="polite">
      <span class="grabber" aria-hidden="true"></span>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${faceSvg('unknown', { size: 96 })}
          <div>
            <h2 class="vword small">${title}</h2>
            ${mine}
          </div>
        </div>
        <p class="detail">${r.detail}</p>
        <div class="actions">${repair}</div>
        <p class="itemname">${r.identity ? r.identity.label : 'No confident match'} · ${r.reason.replace(/_/g, ' ')}</p>
      </div>
      <div class="sheet-more">
        ${r.evidence.length
          ? `<p class="because">What I did find, which was not enough to call it.</p>${provenance(r.evidence)}`
          : `<p class="because">I found nothing at all for this. That is a gap in what I have been taught, not a fact about the market.</p>`}
      </div>
    </section>`;
}

function readingSheet() {
  return `
    <section class="sheet reading" data-tier="unknown" data-conf="reading">
      <span class="grabber" aria-hidden="true"></span>
      <div class="sheet-peek">
        <div class="sheet-head">
          ${faceSvg('thinking', { size: 76 })}
          <div><h2 class="vword small">${say('reading')}</h2></div>
        </div>
      </div>
    </section>`;
}

/** What Shin might be looking at. Real items, real recorded asking prices. */
function candidateSheet(items) {
  return `
    <section class="sheet candidates" data-tier="unknown" data-conf="reading">
      <span class="grabber" aria-hidden="true"></span>
      <div class="sheet-peek">
        <div class="sheet-head compact">
          ${faceSvg('thinking', { size: 62 })}
          <div>
            <h2 class="vword small">Is it one of these?</h2>
            <p class="said">I cannot read a tag yet, so you tell me.</p>
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
      <div class="sheet-more"></div>
    </section>`;
}

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
          <span class="wordmark">shin<i>.</i></span>
        </div>

        <div class="reticle" aria-hidden="true"><b></b><b></b><b></b><b></b></div>
        <p class="cam-hint">Point at a price tag</p>

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
    let last = null;      // { result, scenario }
    let dead = false;

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

    function paintBadge() {
      const n = store.get().watchlist.length;
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    paintBadge();
    const unsub = store.subscribe(paintBadge);

    function setState(next) { cam.dataset.state = next; }

    function shoot() {
      if (cam.dataset.state !== 'idle') return;
      setState('framing');
      slot.innerHTML = readingSheet();
      // The frame is already frozen by the state change. This pause is the
      // reticle contracting, not a fake loading bar over an instant answer.
      setTimeout(() => {
        if (dead) return;
        slot.innerHTML = candidateSheet(scenarios);
        setState('choosing');
      }, 420);
    }

    async function priceScenario(item) {
      setState('reading');
      slot.innerHTML = readingSheet();
      try {
        const result = await ctx.api.price({
          text: item.text,
          category: item.category,
          askingCents: item.askingCents,
          // Always. The store being judged must never land inside its own
          // comparison set, and the only way the engine can exclude it is if
          // the caller says where the price was seen.
          askingSeller: item.askingSeller ?? undefined,
        });
        if (dead) return;
        last = { result, scenario: item };
        store.recordVerdict(result, { text: item.text, askingCents: item.askingCents });
        slot.innerHTML = result.kind === 'verdict'
          ? verdictSheet(result, item)
          : refusalSheet(result, item);
        setState('result');
      } catch (err) {
        if (dead) return;
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
        setState('result');
      }
    }

    function reset() {
      slot.innerHTML = '';
      last = null;
      setState('idle');
    }

    root.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const id = pick.dataset.pick;
        if (id === '__none') {
          // An honest unknown. The engine is asked a question it cannot answer
          // rather than the app faking the refusal, so the refusal on screen is
          // the engine's own.
          priceScenario({ text: 'a thing shin has never seen', category: 'grocery', askingCents: 999 });
          return;
        }
        const item = scenarios.find((s) => s.id === id);
        if (item) priceScenario(item);
        return;
      }

      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;

      if (act === 'shoot') { shoot(); return; }
      if (act === 'again') { reset(); return; }
      if (act === 'watchlist') { ctx.go('watchlist'); return; }
      if (act === 'you') { ctx.go('you'); return; }
      if (act === 'categories') { ctx.go('you'); return; }

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
        btn.textContent = store.isWatched(v.identity.id) ? 'Watching' : 'Watch it';
        return;
      }
    });

    /* The sheet drags between its detents. Downward past the peek dismisses. */
    let dragFrom = null;
    root.addEventListener('pointerdown', (e) => {
      const sheet = e.target.closest('.sheet');
      if (!sheet || !e.target.closest('.grabber, .sheet-head')) return;
      dragFrom = { y: e.clientY, open: sheet.classList.contains('open'), sheet };
      sheet.setPointerCapture?.(e.pointerId);
    });
    root.addEventListener('pointerup', (e) => {
      if (!dragFrom) return;
      const dy = e.clientY - dragFrom.y;
      const { sheet, open } = dragFrom;
      dragFrom = null;
      if (dy < -40) sheet.classList.add('open');
      else if (dy > 40) { if (open) sheet.classList.remove('open'); else reset(); }
      else sheet.classList.toggle('open');
    });

    return () => {
      dead = true;
      unsub();
      stopCamera(stream);
    };
  },
};
