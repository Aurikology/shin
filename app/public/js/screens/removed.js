/**
 * Recently removed. OLMA audit row 75: a saved scan is the only record of what
 * a thing cost when the user looked, and a delete with no recovery destroys
 * data the corpus does not have. Same reasoning covers an unwatched item
 * (requirement 2 of this pass), so both land here.
 *
 * Thirty days, stated on the header rather than implied. Restore is one tap.
 * Deleting for good is a second tap on the same button, never a dialog.
 */

import { shinSay, cad } from '../shin.js';
import * as store from '../store.js';

function ago(iso) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'just now';
  const days = Math.floor((Date.now() - at) / 86400000);
  if (days <= 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function itemOf(r) {
  if (r.kind === 'watch') {
    return { label: r.label, cents: typeof r.lastCents === 'number' ? r.lastCents : null };
  }
  const isVerdict = r.result?.kind === 'verdict';
  return {
    label: isVerdict ? r.result.identity.label : (r.result?.identity?.label ?? r.query?.text ?? 'Unknown item'),
    cents: isVerdict ? r.result.askingCents : (r.query?.askingCents ?? null),
  };
}

function row(r, confirmKey) {
  const key = `${r.kind}:${r.id}`;
  const { label, cents } = itemOf(r);
  const left = store.daysLeft(r.removedAt);
  const confirming = confirmKey === key;

  return `
    <div class="rrow-wrap">
      <div class="rrow">
        <span class="rrow-n">
          <b>${label}</b>
          <span>Removed ${ago(r.removedAt)} · ${left} day${left === 1 ? '' : 's'} left</span>
        </span>
        <span class="rrow-p">${typeof cents === 'number' ? cad(cents) : '--'}</span>
      </div>
      <div class="rrow-actions">
        <button type="button" class="linky" data-restore="${key}">Restore</button>
        <button type="button" class="linky danger${confirming ? ' confirming' : ''}" data-del="${key}">
          ${confirming ? 'Tap again, gone for good' : 'Delete'}
        </button>
      </div>
    </div>`;
}

export default {
  id: 'removed',
  title: 'Recently removed',

  render(root, ctx) {
    let confirmKey = null;

    store.purgeRemoved();

    function paint() {
      const list = store.get().removed;

      root.innerHTML = `
        <div class="page page-list">
          <header class="page-head">
            <button type="button" class="linky pback" data-act="back">Back</button>
            <p class="kicker">Recently removed · ${list.length}</p>
            <h1>Recently removed</h1>
          </header>

          <div class="rheader">${shinSay('idle', 'removed_retention', {}, { size: 'face-page', anim: 'none' })}</div>

          ${
            list.length
              ? `<div class="rlist">${list.map((r) => row(r, confirmKey)).join('')}</div>`
              : `<div class="rempty">${shinSay('idle', 'removed_empty', {}, { size: 'face-page', anim: 'none' })}</div>`
          }
        </div>`;
    }

    paint();
    const unsub = store.subscribe(paint);

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="back"]')) { ctx.go('watchlist'); return; }

      const restore = e.target.closest('[data-restore]');
      if (restore) {
        const [kind, id] = restore.dataset.restore.split(':');
        confirmKey = null;
        store.restoreRemoved(kind, id);
        return;
      }

      const del = e.target.closest('[data-del]');
      if (del) {
        const key = del.dataset.del;
        if (confirmKey === key) {
          const [kind, id] = key.split(':');
          confirmKey = null;
          store.permanentlyRemove(kind, id);
        } else {
          confirmKey = key;
          paint();
        }
      }
    });

    return unsub;
  },
};
