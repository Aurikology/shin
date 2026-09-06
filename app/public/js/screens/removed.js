/**
 * Recently removed. OLMA audit row 75: a saved scan is the only record of what
 * a thing cost when the user looked, and a delete with no recovery destroys
 * data the corpus does not have. Same reasoning covers an unwatched item
 * (requirement 2 of this pass), so both land here.
 *
 * Thirty days, stated on the header rather than implied. Restore is one tap.
 * Deleting for good is a second tap on the same button, never a dialog.
 *
 * ESCAPING. A removed row carries the same stored text the two lists it came
 * from carry -- a watch's `label`, a scan's `identity.label` or the `query.text`
 * the user typed -- so it had the same hole `pastscans.js` had, one list
 * further along. Every interpolation goes through `dom.js`'s `html` tag.
 */

import { shinSay, cad } from '../shin.js';
import * as store from '../store.js';
import { html, raw, agoDays, on } from '../lib/dom.js';
import { repainter } from '../lib/listscreen.js';

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

/**
 * One removed row. Exported for `test/escape.test.mjs`.
 *
 * `agoDays`, not `ago`: this screen's local copy was never one of the two
 * duplicates, because the question here is how much of a thirty-day window is
 * left, and minutes would be noise (dom.js says the same in its own comment).
 */
export function row(r, confirmKey) {
  const key = `${r.kind}:${r.id}`;
  const { label, cents } = itemOf(r);
  const left = store.daysLeft(r.removedAt);
  const confirming = confirmKey === key;

  return html`
    <div class="rrow-wrap row">
      <div class="rrow">
        <span class="row-n">
          <b class="row-title">${label}</b>
          <span class="row-sub">Removed ${agoDays(r.removedAt)} · ${left} day${left === 1 ? '' : 's'} left</span>
        </span>
        <span class="rrow-p money">${typeof cents === 'number' ? cad(cents) : '--'}</span>
      </div>
      <div class="rrow-actions">
        <button type="button" class="linky" data-restore="${key}" data-fk="restore:${key}">
          Restore<span class="sr-only"> ${label}</span>
        </button>
        <button type="button" class="linky danger${confirming ? ' confirming' : ''}"
                data-del="${key}" data-fk="del:${key}">
          ${confirming ? 'Tap again, gone for good' : 'Delete'}<span class="sr-only"> ${label}</span>
        </button>
      </div>
    </div>`;
}

export default {
  id: 'removed',
  title: 'Recently removed',

  render(root, ctx) {
    let confirmKey = null;
    /*
     * `error` is real and reachable: a `removed` entry written by an older
     * build can be any shape. `loading` is written and NOT reached in this
     * build -- `store.get()` is synchronous localStorage -- and is stated as
     * such rather than left to be found. The long version is in watchlist.js.
     */
    let phase = 'ready';

    store.purgeRemoved();

    function paint() {
      const list = store.get().removed;

      let body;
      if (phase === 'loading') {
        body = html`<div class="list-state"><p class="fineprint">Reading what was removed…</p></div>`;
      } else if (phase === 'error') {
        // Same shape and voice as you.js's engine failure.
        body = html`
          <div class="list-state">
            <p class="fineprint">I could not read what was removed.</p>
            <button type="button" class="linky" data-act="retry" data-fk="retry:removed">Try again</button>
          </div>`;
      } else if (list.length) {
        body = html`<div class="rlist">${raw(list.map((r) => row(r, confirmKey)).join(''))}</div>`;
      } else {
        /*
         * The empty state.
         *
         * The other two lists use `.empty` -- a 96px asleep face, centred, with
         * one voiced line -- and this one used its own `.rempty` box, so the
         * three screens ended a hair apart. It now uses `.empty`'s container,
         * for that consistency, and keeps the 48px `shinSay` unit inside it
         * rather than swapping in a 96px `faceBlock`: AVATAR.md section 3 row
         * 46 and voice.js's own comment on `removed_empty` both specify "the
         * same 48px component as the header above it", and the line was written
         * for that unit. Consistent container, spec-sized contents.
         */
        body = html`<div class="empty rempty">${raw(shinSay('idle', 'removed_empty', {}, { size: 'face-page', anim: 'none' }))}</div>`;
      }

      root.innerHTML = html`
        <div class="page page-list">
          <header class="page-head">
            <button type="button" class="linky pback" data-act="back" data-fk="nav:back">Back</button>
            ${raw(phase === 'ready' ? html`<p class="kicker">Recently removed · ${list.length}</p>` : '')}
            <h1>Recently removed</h1>
          </header>

          <div class="rheader">${raw(shinSay('idle', 'removed_retention', {}, { size: 'face-page', anim: 'none' }))}</div>

          ${raw(body)}
        </div>`;
    }

    /** A row built from a malformed stored entry lands here, not in
     *  router.js's exception page. */
    function safePaint() {
      if (phase === 'error') { paint(); return; }
      try {
        paint();
      } catch (err) {
        console.error('Recently removed failed to render', err);
        phase = 'error';
        paint();
      }
    }

    // No modal on this screen, so no `syncModal`: what the repainter is here
    // for is the second tap. Confirming a delete repaints the whole list, and
    // before this the "Tap again, gone for good" button the user was standing
    // on was destroyed and focus fell to the body -- so the confirmation could
    // not be completed from the keyboard at all.
    const repaint = repainter(root, safePaint);

    safePaint();

    const listeners = new AbortController();

    on(root, 'click', (e) => {
      if (e.target.closest('[data-act="back"]')) { ctx.go('watchlist'); return; }
      if (e.target.closest('[data-act="retry"]')) { phase = 'ready'; repaint(); return; }

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
          repaint();
        }
      }
    }, listeners.signal);

    // Wrapped, not passed: subscribers are called with the new state, and
    // `repaint`'s first argument is a focus key to prefer.
    const unsub = store.subscribe(() => repaint());
    return () => {
      unsub();
      listeners.abort();
    };
  },
};
