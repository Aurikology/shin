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

import { faceBlock, shinSay, cad } from '../shin.js';
import { say } from '../voice.js';
import * as store from '../store.js';
import { html, raw, agoDays, on } from '../lib/dom.js';
import { repainter } from '../lib/listscreen.js';
import { pageBar, backButton, goBack, removeGlyph, restoreGlyph } from '../lib/pagebar.js';
import { t } from '../ui-strings.js';

function itemOf(r) {
  if (r.kind === 'watch') {
    return { label: r.label, cents: typeof r.lastCents === 'number' ? r.lastCents : null };
  }
  const isVerdict = r.result?.kind === 'verdict';
  return {
    label: isVerdict ? r.result.identity.label : (r.result?.identity?.label ?? r.query?.text ?? t('removed_unknown_item')),
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

  /*
   * The two controls sit IN the row now, at its right edge, the same 44px
   * targets the saved and past-scan rows carry. The three lists were three
   * shapes: a row beside a boxed cross on two of them, and here a card with its
   * actions stacked under a hairline inside it. One shape, so that moving
   * between the three screens is not three things to learn.
   *
   * The permanent delete keeps its two taps and keeps saying so in words. A
   * glyph cannot carry "Tap again, gone for good", and a destructive act whose
   * confirmation is invisible is not a confirmation, so the button drops the
   * glyph and widens to the sentence for as long as it is armed. It is
   * `--ink-faint` until then: quiet while it is only an option, red once it
   * will actually happen on the next tap.
   *
   * ARMED, WITHOUT LOOKING AT IT. The widened sentence is visual, and it was
   * the only thing saying the next press destroys something, so the button's
   * ACCESSIBLE NAME changes with it: "Delete X for good" becomes "Press again
   * to delete X for good". That reaches a keyboard user for free, through what
   * this row already has rather than anything new -- arming the button repaints
   * the screen, and listscreen.js's repainter puts focus back on the control
   * with the same `data-fk`, so the reader lands on the button again and reads
   * the name it has now.
   *
   * NOT a live region, and that is a measured call rather than a preference.
   * router.js records it: a live region that is removed and re-inserted in the
   * same tick announces nothing, because the platform has no old value to diff
   * against. Every node on this screen is thrown away on every repaint, so a
   * `role="status"` on the armed text would be inserted already-populated and
   * would be silent at exactly the moment it was added for.
   */
  return html`
    <div class="rrow-wrap">
      <div class="rrow">
        <span class="row-n">
          <b class="row-title">${label}</b>
          <span class="row-sub">${t('removed_label')} ${agoDays(r.removedAt)} · ${t('removed_days_left', { n: String(left) })}</span>
        </span>
        <span class="rrow-p money">${typeof cents === 'number' ? cad(cents) : '--'}</span>
      </div>
      <button type="button" class="rowdel rrow-restore" data-restore="${key}" data-fk="restore:${key}">
        ${raw(restoreGlyph())}
        <span class="sr-only">${t('restore')} ${label}</span>
      </button>
      <button type="button" class="rowdel rrow-del${confirming ? ' confirming' : ''}"
              data-del="${key}" data-fk="del:${key}">
        ${raw(confirming ? `<span class="rrow-confirm">${t('removed_tap_again')}</span>` : removeGlyph())}
        <span class="sr-only">${confirming
          ? `${t('removed_press_again')} ${label} ${t('removed_for_good')}`
          : `${t('delete')} ${label} ${t('removed_for_good')}`}</span>
      </button>
    </div>`;
}

export default {
  id: 'removed',
  title: 'Recently removed',
  titleKey: 'removed_title',

  render(root, ctx) {
    let confirmKey = null;
    /*
     * `error` is real and reachable: a `removed` entry written by an older
     * build can be any shape. `loading` is written and NOT reached in this
     * build -- `store.get()` is synchronous localStorage -- and is stated as
     * such rather than left to be found. The long version is in watchlist.js.
     */
    /*
     * An unreadable store is an error, not an empty list. store.loadFault()
     * says whether the last read failed to parse or was blocked outright; if
     * it did, this screen opens in its error state rather than drawing "you
     * have saved nothing" over somebody's actual data.
     */
    let phase = store.loadFault() ? 'error' : 'ready';

    store.purgeRemoved();

    function paint() {
      const list = store.get().removed;

      let body;
      if (phase === 'loading') {
        body = html`<div class="list-state"><p class="fineprint">${say('removed_loading')}</p></div>`;
      } else if (phase === 'error') {
        // Same shape and voice as you.js's engine failure.
        body = html`
          <div class="list-state">
            <p class="fineprint">${say('removed_failed')}</p>
            <button type="button" class="linky" data-act="retry" data-fk="retry:removed">${t('try_again')}</button>
          </div>`;
      } else if (list.length) {
        body = html`<div class="rlist">${raw(list.map((r) => row(r, confirmKey)).join(''))}</div>`;
      } else {
        /*
         * The empty state, and it is now the same one the other two lists have.
         *
         * All three say `asleep` at `face-verdict`, centred, breathing. That is
         * what AVATAR.md rows 42 (watchlist empty) and 48 (past scans empty)
         * specify, and an empty Recently removed is the same moment on the same
         * kind of screen: a list with nothing in it, which is not a failure and
         * is not worth a different face. `sleep-breath` is not passed -- it is
         * `asleep`'s own default in shin.js's DEFAULT_ANIM, which is how the
         * other two get it, so asking for it by name here would be a second
         * place for it to drift.
         *
         * This was `idle` at `face-page`, still, inside a `shinSay` bubble. The
         * reason recorded for the smaller face was "the same 48px component as
         * the header above it", and that header no longer renders in this state
         * (two faces talking on one screen), so the reason had outlived itself.
         * The string key is untouched; only the face, the size, the animation
         * and the unit that carries them changed, which is the same `faceBlock`
         * and line the siblings use rather than a bubble beside a 96px face.
         */
        body = html`
          <div class="empty">
            ${raw(faceBlock('asleep', { size: 'face-verdict' }))}
            <p>${say('removed_empty')}</p>
          </div>`;
      }

      root.innerHTML = html`
        <div class="page page-list">
          <header class="page-head">
            ${raw(backButton())}
            ${raw(phase === 'ready' ? html`<p class="kicker">${t('removed_title')} · ${list.length}</p>` : '')}
            <h1>${t('removed_title')}</h1>
          </header>

          ${raw(
            /*
             * ONE FACE ON A SCREEN, AVATAR.md's opening rule. With the list
             * empty this header unit and the empty state below it were two
             * Shins talking on one 390px screen, and they were saying the same
             * thing twice: "Kept for 30 days" over a list with nothing in it to
             * keep. The retention line is a fact ABOUT ROWS, so it appears when
             * there are rows. With none, the empty state is the only face and
             * the header above is the kicker and the heading alone.
             *
             * Saved and Past scans were checked for the same double and do not
             * have it: both build their header unit inside the `list.length`
             * branch already, so their empty states are the only face there
             * too. This makes the third screen agree with the two rather than
             * inventing a rule for it.
             */
            phase === 'ready' && list.length
              ? html`<div class="rheader">${raw(shinSay('idle', 'removed_retention', {}, { size: 'face-page', anim: 'none' }))}</div>`
              : '',
          )}

          ${raw(body)}

          ${raw(pageBar('watchlist'))}
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
      // See pastscans.js: back is history, not a second forward move.
      if (e.target.closest('[data-act="back"]')) { goBack(ctx, 'watchlist'); return; }
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="watchlist"]')) { ctx.go('watchlist'); return; }
      if (e.target.closest('[data-act="you"]')) { ctx.go('you'); return; }
      if (e.target.closest('[data-act="retry"]')) { phase = store.reload() ? 'error' : 'ready'; repaint(); return; }

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
