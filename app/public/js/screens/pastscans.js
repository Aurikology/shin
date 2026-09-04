/**
 * Past scans. Every verdict and refusal the user has seen, newest first.
 *
 * OLMA audit rows 69 and 70: a "Collection" screen is a scan history, not a
 * watchlist, and the exact bug that spun row 70 into a rule here is a card
 * showing "Fair Price" while the same scan's own result screen said
 * "Outrageous". The fix is structural, not visual: this screen renders every
 * row straight from the stored verdict or refusal object (`store.js`'s
 * `history`, written once by `recordVerdict` and never recomputed), so there
 * is only ever one verdict per scan to disagree with.
 *
 * Row faces never animate (AVATAR.md section 3, row 47). Tapping a row reopens
 * that verdict read-only: no share, no watch, nothing that acts on a scan that
 * already happened.
 */

import { faceSvg, faceBlock, shinSay, cad, sellerOf, confidenceOf, dotsHtml, tierOf } from '../shin.js';
import { say, wordFor } from '../voice.js';
import * as store from '../store.js';

/** Plain screen labels, not Shin speaking: the reason a refusal happened, for a one-line row. */
const REFUSAL_LABEL = {
  no_identity: 'Refused, could not identify it',
  identity_unsure: 'Refused, not sure which one',
  category_unsupported: 'Refused, out of scope',
  no_source_response: 'Refused, no sources answered',
  too_few_points: 'Refused, not enough evidence',
  points_too_stale: 'Refused, evidence too old',
  comparison_incoherent: 'Refused, evidence disagreed',
  no_asking_price: 'Refused, no price given',
};

function ago(iso) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'just now';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function row(h) {
  const isVerdict = h.result?.kind === 'verdict';
  const face = isVerdict ? tierOf(h.result.tier).face : 'unknown';
  const label = isVerdict ? h.result.identity.label : (h.result?.identity?.label ?? h.query?.text ?? 'Unknown item');
  const askingCents = isVerdict ? h.result.askingCents : h.query?.askingCents;
  const seller = isVerdict ? sellerOf(h.result) : null;
  const sub = [seller, ago(h.at)].filter(Boolean).join(' · ');
  // OLMA row 70: the row's face carries the same solid-vs-hollow confidence
  // treatment the verdict sheet gave it. confidenceOf already returns the
  // "refuses" band for a non-verdict result, so this is one call for both
  // shapes of row, never a second opinion recomputed from nothing.
  const conf = confidenceOf(h.result);
  const tierId = isVerdict ? h.result.tier : 'unknown';

  return `
    <div class="prow-wrap">
      <button type="button" class="prow" data-open="${h.id}" data-tier="${tierId}" data-conf="${conf.level}">
        ${faceSvg(face, { size: 'face-row' })}
        <span class="prow-n">
          <b>${label}</b>
          <span>${sub}</span>
        </span>
        <span class="prow-p">${typeof askingCents === 'number' ? cad(askingCents) : 'no price given'}</span>
      </button>
      <button type="button" class="prow-del" data-remove="${h.id}" aria-label="Remove this scan">&times;</button>
    </div>`;
}

/** The read-only reopened verdict, AVATAR.md's per-scan face and tier, replayed rather than an error. */
function detail(h) {
  const isVerdict = h.result?.kind === 'verdict';

  if (isVerdict) {
    const v = h.result;
    const conf = confidenceOf(v);
    const source = sellerOf(v);
    const facts = { asking: cad(v.askingCents), usual: cad(v.spread.medianCents) };

    return `
      <div class="pmodal" data-act="modal">
        <div class="pmodal-card" data-tier="${v.tier}">
          ${faceBlock(tierOf(v.tier).face, { size: 'face-verdict' })}
          <h2>${wordFor(v.tier)}</h2>
          <p class="said">${say(v.tier, facts)}</p>
          <p class="pmodal-meta">${v.identity.label}${source ? ` · ${source}` : ''} · ${ago(h.at)}</p>
          <p class="pmodal-conf">${conf.label}${dotsHtml(conf.dots)}</p>
          <p class="pmodal-note">This is what Shin said at the time. Read-only.</p>
          <button type="button" class="linky" data-act="close-detail">Close</button>
        </div>
      </div>`;
  }

  const r = h.result;
  return `
    <div class="pmodal" data-act="modal">
      <div class="pmodal-card" data-tier="unknown">
        ${faceBlock('unknown', { size: 'face-verdict' })}
        <h2>${REFUSAL_LABEL[r?.reason] ?? 'Refused'}</h2>
        <p class="pmodal-meta">${h.query?.text ?? 'Unknown item'} · ${ago(h.at)}</p>
        <p class="said">${r?.detail ?? ''}</p>
        <p class="pmodal-note">This is what Shin said at the time. Read-only.</p>
        <button type="button" class="linky" data-act="close-detail">Close</button>
      </div>
    </div>`;
}

export default {
  id: 'pastscans',
  title: 'Past scans',

  render(root, ctx) {
    let openId = null;

    function paint() {
      const list = store.get().history;
      const open = openId ? list.find((h) => h.id === openId) : null;

      // A 64px header, callback to the last scan: this row's own tier face
      // and word if it was a verdict, "refused" if it was not, from facts
      // already resolved here (voice.js only ever interpolates them).
      const last = list[0];
      const lastIsVerdict = last?.result?.kind === 'verdict';
      const lastFace = last ? (lastIsVerdict ? tierOf(last.result.tier).face : 'unknown') : 'idle';
      const lastFacts = last ? {
        item: lastIsVerdict ? last.result.identity.label : (last.result?.identity?.label ?? last.query?.text ?? 'that one'),
        verdict: lastIsVerdict ? wordFor(last.result.tier) : 'refused',
      } : null;

      root.innerHTML = `
        <div class="page page-list">
          <header class="page-head">
            <button type="button" class="linky pback" data-act="back">Back</button>
            <p class="kicker">Past scans · ${list.length}</p>
            <h1>Past scans</h1>
          </header>

          ${
            list.length
              ? `<div class="plist-head">${shinSay(lastFace, 'pastscans_callback', lastFacts, { size: 64, anim: 'idle-breath' })}</div>
                 <div class="plist">${list.map(row).join('')}</div>`
              : `<div class="empty">
                   ${faceBlock('asleep', { size: 'face-verdict' })}
                   <p>${say('pastscans_empty')}</p>
                 </div>`
          }
        </div>
        ${open ? detail(open) : ''}`;
    }

    paint();
    const unsub = store.subscribe(paint);

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="back"]')) { ctx.go('watchlist'); return; }
      if (e.target.closest('[data-act="close-detail"]')) { openId = null; paint(); return; }
      // Clicking the modal's own backdrop closes it too; clicking the card must not.
      if (e.target.dataset.act === 'modal') { openId = null; paint(); return; }

      const del = e.target.closest('[data-remove]');
      if (del) { store.removeScan(del.dataset.remove); return; }

      const open = e.target.closest('[data-open]');
      if (open) { openId = open.dataset.open; paint(); }
    });

    return unsub;
  },
};
