/**
 * Saved. The only screen in the app that is a list.
 *
 * The shutter travels here at a reduced size, because the primary act is never
 * more than one tap away from anywhere. A list that traps you is how a camera
 * app quietly becomes a database.
 *
 * A drop is always stated against the regular price. Stating it against a capped
 * promotion presents a loss leader as the going rate, which is a bug this project
 * has already had once.
 *
 * The page is called "Saved," not "Watching": there is no re-queryable price
 * source in v1 (FLAGS.feed), so a name that reads as an ongoing promise is a
 * promise the app cannot keep. What is real is what got saved, at what price,
 * from what seller, on what day, and that is what the header and every row say.
 */

import { faceSvg, faceBlock, shinSay, cad, animateFace, confidenceOf, dotsHtml, sellerOf, tierOf } from '../shin.js';
import { say, wordFor } from '../voice.js';
import * as store from '../store.js';
import { FLAGS } from '../flags.js';

/** The most recent history entry whose verdict identity matches a saved row's id. */
function matchFor(history, id) {
  return history.find((h) => h.result?.kind === 'verdict' && h.result.identity?.id === id) ?? null;
}

function row(w, history) {
  const moved = typeof w.lastCents === 'number' && typeof w.usualCents === 'number'
    ? w.lastCents - w.usualCents
    : null;
  const cheaper = moved !== null && moved < 0;
  // Row faces never animate (AVATAR.md section 5), and the tier they wear is
  // the same delta already printed beside the price, not a second judgment.
  const face = moved === null || moved === 0 ? 'fair' : cheaper ? 'good' : 'walk';

  // OLMA row 70: when the saved row still has its original scan in history,
  // the row's face carries the same solid-vs-hollow confidence treatment the
  // verdict sheet gave it, not a second opinion recomputed from nothing.
  const match = matchFor(history, w.id);
  const conf = match ? confidenceOf(match.result) : null;
  const tierAttr = match ? ` data-tier="${match.result.tier}"` : '';
  const confAttr = conf ? ` data-conf="${conf.level}"` : '';

  return `
    <div class="wrow-wrap">
      <button type="button" class="wrow" data-open="${w.id}"${tierAttr}${confAttr}>
        ${faceSvg(face, { size: 'face-row' })}
        <span class="wrow-n">
          <b>${w.label}</b>
          <span>${w.askingSeller ? `${w.askingSeller} · ` : ''}saved ${ago(w.savedAt)}</span>
        </span>
        <span class="wrow-p${cheaper ? ' good' : ''}">
          ${cad(w.lastCents)}
          <em>${
            moved === null ? 'no usual price'
            : moved === 0 ? 'at the usual'
            : cheaper ? `▼ ${cad(Math.abs(moved))} under usual`
            : `▲ ${cad(moved)} over usual`
          }</em>
        </span>
      </button>
      <button type="button" class="wrow-del" data-unwatch="${w.id}" aria-label="Remove ${w.label} from saved">&times;</button>
    </div>`;
}

/**
 * The read-only reopened item, mirroring pastscans.js's `detail(h)`: when
 * the row's own scan is still in history, this is the verdict it produced.
 * When it is not (the watch entry itself never carries the verdict, only
 * `{id, label, category, lastCents, askingSeller, usualCents, savedAt}`),
 * this shows the row's own saved fields and says plainly that is all there is.
 */
function detailModal(w, match) {
  if (match) {
    const v = match.result;
    const conf = confidenceOf(v);
    const source = sellerOf(v);
    const facts = { asking: cad(v.askingCents), usual: cad(v.spread.medianCents) };

    return `
      <div class="pmodal" data-act="modal">
        <div class="pmodal-card" data-tier="${v.tier}">
          ${faceBlock(tierOf(v.tier).face, { size: 'face-verdict' })}
          <h2>${wordFor(v.tier)}</h2>
          <p class="said">${say(v.tier, facts)}</p>
          <p class="pmodal-meta">${v.identity.label}${source ? ` · ${source}` : ''} · ${ago(match.at)}</p>
          <p class="pmodal-conf">${conf.label}${dotsHtml(conf.dots)}</p>
          <p class="pmodal-note">This is what Shin said at the time. Read-only.</p>
          <button type="button" class="linky" data-act="close-detail">Close</button>
        </div>
      </div>`;
  }

  const facts = {
    item: w.label,
    seller: w.askingSeller ?? '',
    price: typeof w.lastCents === 'number' ? cad(w.lastCents) : '--',
    day: ago(w.savedAt),
  };
  return `
    <div class="pmodal" data-act="modal">
      <div class="pmodal-card" data-tier="fair">
        ${faceBlock('idle', { size: 'face-verdict' })}
        <h2>${w.label}</h2>
        <p class="said">${say('watchlist_saved_only', facts)}</p>
        <p class="pmodal-meta">${facts.seller ? `${facts.seller} · ` : ''}${facts.day}</p>
        <p class="pmodal-note">${say('watchlist_no_history_note')}</p>
        <button type="button" class="linky" data-act="close-detail">Close</button>
      </div>
    </div>`;
}

function ago(iso) {
  if (!iso) return 'just now';
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default {
  id: 'watchlist',
  title: 'Saved',

  render(root, ctx) {
    // AVATAR.md section 5 row 11: `wake`, once, the first time this session
    // the list goes from empty to one row. `null` on the very first paint so
    // opening the screen already populated never counts as the transition.
    // The call lands on the header face (below), not a row face: every row
    // face is `face-row` (28px) and `data-anim="none"` there is unconditional
    // (shin.js), so a wake aimed at a row could structurally never play.
    let prevLen = null;
    let openId = null;

    function paint() {
      const s = store.get();
      const list = s.watchlist;
      const dropped = list.filter(
        (w) => typeof w.lastCents === 'number' && typeof w.usualCents === 'number' && w.lastCents < w.usualCents,
      );
      const openEntry = openId ? list.find((w) => w.id === openId) : null;
      const openMatch = openEntry ? matchFor(s.history, openEntry.id) : null;

      const first = list[0];
      const firstMoved = first && typeof first.lastCents === 'number' && typeof first.usualCents === 'number'
        ? first.lastCents - first.usualCents
        : null;
      const headerFace = firstMoved === null || firstMoved === 0 ? 'fair' : firstMoved < 0 ? 'good' : 'walk';
      const headerFacts = first ? {
        item: first.label,
        seller: first.askingSeller ?? '',
        price: cad(first.lastCents),
        day: ago(first.savedAt),
      } : null;

      root.innerHTML = `
        <div class="page page-list">
          <header class="page-head">
            <p class="kicker">${
              list.length === 0
                ? 'Nothing saved yet'
                : `${list.length} thing${list.length === 1 ? '' : 's'} · ${dropped.length} under the usual`
            }</p>
            <h1>Saved</h1>
          </header>

          ${
            // Row 45 is dark, not v1: without a re-queryable source, "under
            // the usual" is a snapshot taken at save time, not a movement
            // Shin watched happen, and a nudging face would claim the
            // latter. FLAGS.feed is the same switch row 33's promise waits
            // on, for the same reason (USAGE.md C4).
            FLAGS.feed && dropped.length
              ? `<div class="drop-card" data-tier="good">
                   ${faceBlock('nudging', { size: 'face-page' })}
                   <div>
                     <b>${say('dropped', {
                       asking: cad(dropped[0].lastCents),
                       seller: dropped[0].askingSeller ?? 'the seller you saved it at',
                       usual: cad(dropped[0].usualCents),
                     })}</b>
                     <span>${dropped[0].label}, under the usual ${cad(dropped[0].usualCents)}.</span>
                   </div>
                 </div>`
              : ''
          }

          ${
            list.length
              ? `<div class="wlist-head">${shinSay(headerFace, 'watchlist_callback', headerFacts, { size: 64, anim: 'idle-breath' })}</div>
                 <div class="wlist">${list.map((w) => row(w, s.history)).join('')}</div>`
              : `<div class="empty" data-act="wake-empty">
                   ${faceBlock('asleep', { size: 'face-verdict' })}
                   <p>${say('watchlist_empty')}</p>
                 </div>`
          }

          <div class="wmore">
            <button type="button" class="rowbtn" data-act="pastscans">
              <span>Past scans</span>
              <span class="rowbtn-v">${s.history.length}</span>
            </button>
            <button type="button" class="rowbtn" data-act="removed">
              <span>Recently removed</span>
              <span class="rowbtn-v">${s.removed.length}</span>
            </button>
          </div>

          <div class="page-foot">
            <button type="button" class="mini-shutter" data-act="camera" aria-label="Scan something"></button>
          </div>
        </div>
        ${openEntry ? detailModal(openEntry, openMatch) : ''}`;

      if (prevLen === 0 && list.length > 0) {
        animateFace(root.querySelector('.wlist-head .face'), 'wake');
      }
      prevLen = list.length;
    }

    paint();
    const unsub = store.subscribe(paint);

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="pastscans"]')) { ctx.go('pastscans'); return; }
      if (e.target.closest('[data-act="removed"]')) { ctx.go('removed'); return; }

      if (e.target.closest('[data-act="wake-empty"]')) {
        animateFace(root.querySelector('.empty .face'), 'wake');
        return;
      }

      const unwatch = e.target.closest('[data-unwatch]');
      if (unwatch) { store.toggleWatch({ id: unwatch.dataset.unwatch }); return; }

      if (e.target.closest('[data-act="close-detail"]') || e.target.dataset.act === 'modal') {
        openId = null;
        paint();
        return;
      }

      const open = e.target.closest('[data-open]');
      if (open) { openId = open.dataset.open; paint(); }
    });

    return unsub;
  },
};
