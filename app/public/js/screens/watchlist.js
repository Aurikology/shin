/**
 * Watching. The only screen in the app that is a list.
 *
 * The shutter travels here at a reduced size, because the primary act is never
 * more than one tap away from anywhere. A list that traps you is how a camera
 * app quietly becomes a database.
 *
 * A drop is always stated against the regular price. Stating it against a capped
 * promotion presents a loss leader as the going rate, which is a bug this project
 * has already had once.
 */

import { faceSvg, faceBlock, cad, animateFace } from '../shin.js';
import { say } from '../voice.js';
import * as store from '../store.js';
import { FLAGS } from '../flags.js';

function row(w) {
  const moved = typeof w.lastCents === 'number' && typeof w.usualCents === 'number'
    ? w.lastCents - w.usualCents
    : null;
  const cheaper = moved !== null && moved < 0;
  // Row faces never animate (AVATAR.md section 5), and the tier they wear is
  // the same delta already printed beside the price, not a second judgment.
  const face = moved === null || moved === 0 ? 'fair' : cheaper ? 'good' : 'walk';

  return `
    <div class="wrow-wrap">
      <button type="button" class="wrow" data-open="${w.id}">
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
      <button type="button" class="wrow-del" data-unwatch="${w.id}" aria-label="Remove ${w.label} from watching">&times;</button>
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
  title: 'Watching',

  render(root, ctx) {
    // AVATAR.md section 5 row 11: `wake`, once, the first time this session
    // the list goes from empty to one row. `null` on the very first paint so
    // opening the screen already populated never counts as the transition.
    let prevLen = null;

    function paint() {
      const s = store.get();
      const list = s.watchlist;
      const dropped = list.filter(
        (w) => typeof w.lastCents === 'number' && typeof w.usualCents === 'number' && w.lastCents < w.usualCents,
      );

      root.innerHTML = `
        <div class="page page-list">
          <header class="page-head">
            <p class="kicker">${
              list.length === 0
                ? 'Nothing saved yet'
                : `${list.length} thing${list.length === 1 ? '' : 's'} · ${dropped.length} under the usual`
            }</p>
            <h1>Watching</h1>
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
              ? `<div class="wlist">${list.map(row).join('')}</div>`
              : `<div class="empty">
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
        </div>`;

      if (prevLen === 0 && list.length > 0) {
        animateFace(root.querySelector('.wlist .face'), 'wake');
      }
      prevLen = list.length;
    }

    paint();
    const unsub = store.subscribe(paint);

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="pastscans"]')) { ctx.go('pastscans'); return; }
      if (e.target.closest('[data-act="removed"]')) { ctx.go('removed'); return; }

      const unwatch = e.target.closest('[data-unwatch]');
      if (unwatch) { store.toggleWatch({ id: unwatch.dataset.unwatch }); return; }

      const open = e.target.closest('[data-open]');
      if (open) ctx.go('camera');
    });

    return unsub;
  },
};
