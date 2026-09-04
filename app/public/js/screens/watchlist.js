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

import { faceSvg, cad } from '../shin.js';
import { say } from '../voice.js';
import * as store from '../store.js';

function row(w) {
  const moved = typeof w.lastCents === 'number' && typeof w.usualCents === 'number'
    ? w.lastCents - w.usualCents
    : null;
  const cheaper = moved !== null && moved < 0;

  return `
    <button type="button" class="wrow" data-open="${w.id}">
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
    </button>`;
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
            dropped.length
              ? `<div class="drop-card" data-tier="good">
                   ${faceSvg('pleased', { size: 44 })}
                   <div>
                     <b>${say('dropped', { asking: cad(dropped[0].lastCents) })}</b>
                     <span>${dropped[0].label}, under the usual ${cad(dropped[0].usualCents)}.</span>
                   </div>
                 </div>`
              : ''
          }

          ${
            list.length
              ? `<div class="wlist">${list.map(row).join('')}</div>`
              : `<div class="empty">
                   ${faceSvg('fair', { size: 64 })}
                   <p>Nothing here yet. Scan something and save it, and I will keep an eye on the price.</p>
                 </div>`
          }

          <div class="page-foot">
            <button type="button" class="mini-shutter" data-act="camera" aria-label="Scan something"></button>
          </div>
        </div>`;
    }

    paint();
    const unsub = store.subscribe(paint);

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      const open = e.target.closest('[data-open]');
      if (open) ctx.go('camera');
    });

    return unsub;
  },
};
