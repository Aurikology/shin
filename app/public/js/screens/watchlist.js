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
 *
 * ESCAPING. Every row on this screen is built with `dom.js`'s `html` tagged
 * template rather than a bare template literal, so `w.label` (which the user
 * types on the correction screen) and `w.askingSeller` (which comes off the
 * engine) cannot become markup. `raw()` is the only way past it and is used
 * only for HTML this file did not get from the store: `faceSvg`, `dotsHtml`,
 * `shinSay`. The bug this closes was live in `pastscans.js`; the same
 * interpolations were here.
 */

import { faceSvg, faceBlock, shinSay, cad, animateFace, confidenceOf, dotsHtml, sellerOf, tierOf } from '../shin.js';
import { say, wordFor } from '../voice.js';
import * as store from '../store.js';
import { FLAGS } from '../flags.js';
import { escapeHtml, html, raw, ago, on } from '../lib/dom.js';
import { repainter, syncModal, modalKeys, onBackdrop } from '../lib/listscreen.js';

/** The most recent history entry whose verdict identity matches a saved row's id. */
function matchFor(history, id) {
  return history.find((h) => h.result?.kind === 'verdict' && h.result.identity?.id === id) ?? null;
}

/**
 * One saved row.
 *
 * Exported for `test/escape.test.mjs`: the row builders are the boundary
 * between stored text and `innerHTML`, so they are the thing worth asserting
 * on, and asserting on them needs no DOM.
 */
export function row(w, history) {
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

  const delta = moved === null ? 'no usual price'
    : moved === 0 ? 'at the usual'
    : cheaper ? `▼ ${cad(Math.abs(moved))} under usual`
    : `▲ ${cad(moved)} over usual`;

  // `data-fk` is the focus key the repainter finds this control by after a
  // full teardown. Built from the row's id, never its index, so it survives
  // another row being deleted above it.
  return html`
    <div class="wrow-wrap">
      <button type="button" class="row wrow" data-open="${w.id}" data-fk="open:${w.id}"
              ${raw(match ? `data-tier="${escapeHtml(match.result.tier)}"` : '')}
              ${raw(conf ? `data-conf="${escapeHtml(conf.level)}"` : '')}>
        ${raw(faceSvg(face, { size: 'face-row' }))}
        <span class="row-n">
          <b class="row-title">${w.label}</b>
          <span class="row-sub">${w.askingSeller ? `${w.askingSeller} · ` : ''}saved ${ago(w.savedAt)}</span>
        </span>
        <span class="wrow-p${cheaper ? ' good' : ''}">
          ${cad(w.lastCents)}
          <em>${delta}</em>
        </span>
      </button>
      <button type="button" class="rowdel wrow-del" data-unwatch="${w.id}" data-fk="del:${w.id}">
        <span aria-hidden="true">&times;</span>
        <span class="sr-only">Remove ${w.label} from saved</span>
      </button>
    </div>`;
}

/**
 * The read-only reopened item, mirroring pastscans.js's `detail(h)`: when
 * the row's own scan is still in history, this is the verdict it produced.
 * When it is not (the watch entry itself never carries the verdict, only
 * `{id, label, category, lastCents, askingSeller, usualCents, savedAt}`),
 * this shows the row's own saved fields and says plainly that is all there is.
 *
 * `role="dialog"`, `aria-modal` and the focus trap are added after mount by
 * `listscreen.js`'s `syncModal`, because they are the same five omissions on
 * both of this app's two modals and one implementation is enough.
 */
export function detailModal(w, match) {
  if (match) {
    const v = match.result;
    const conf = confidenceOf(v);
    const source = sellerOf(v);
    const facts = { asking: cad(v.askingCents), usual: cad(v.spread.medianCents) };

    return html`
      <div class="pmodal" data-act="modal">
        <div class="pmodal-card" data-tier="${v.tier}" tabindex="-1">
          ${raw(faceBlock(tierOf(v.tier).face, { size: 'face-verdict' }))}
          <h2>${wordFor(v.tier)}</h2>
          <p class="said">${say(v.tier, facts)}</p>
          <p class="pmodal-meta">${v.identity.label}${source ? ` · ${source}` : ''} · ${ago(match.at)}</p>
          <p class="pmodal-conf">${conf.label}${raw(dotsHtml(conf.dots))}</p>
          <p class="pmodal-note">${say('read_only_note')}</p>
          <button type="button" class="linky" data-act="close-detail">Close</button>
        </div>
      </div>`;
  }

  // Raw facts, not escaped: this line goes through the `html` tag below, which
  // escapes every interpolation exactly once. The header bubble in `paint`
  // does the opposite and for the opposite reason -- see the comment there.
  const facts = {
    item: w.label,
    seller: w.askingSeller ?? '',
    price: typeof w.lastCents === 'number' ? cad(w.lastCents) : '--',
    day: ago(w.savedAt),
  };
  return html`
    <div class="pmodal" data-act="modal">
      <div class="pmodal-card" data-tier="fair" tabindex="-1">
        ${raw(faceBlock('idle', { size: 'face-verdict' }))}
        <h2>${w.label}</h2>
        <p class="said">${say('watchlist_saved_only', facts)}</p>
        <p class="pmodal-meta">${facts.seller ? `${facts.seller} · ` : ''}${facts.day}</p>
        <p class="pmodal-note">${say('watchlist_no_history_note')}</p>
        <button type="button" class="linky" data-act="close-detail">Close</button>
      </div>
    </div>`;
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
    /** The focus key of the row that opened the dialog, so closing it puts the
     *  user back on that row rather than at the top of the document. */
    let returnKey = null;
    /*
     * The three states this screen can be in.
     *
     * `error` is real and reachable: a `watchlist` or `history` entry stored by
     * an older build can be any shape, and one that throws while its row is
     * being built used to take the whole screen down to router.js's exception
     * page (FLAWS item 5, "shows the exception and offers no way out"). Now the
     * list says so in the same voice you.js uses when the engine does not
     * answer, and offers the retry that page does not.
     *
     * `loading` is written and NOT reached in this build, and that is stated
     * here rather than left to be discovered: `store.get()` is synchronous
     * localStorage, so there is no gap between asking and having. It exists
     * because the same three screens are where a re-queryable source lands
     * (FLAGS.feed), and because the copy for it should be decided once, beside
     * the error copy, not improvised on the day the read becomes a fetch.
     */
    /*
     * An unreadable store is an error, not an empty list. store.loadFault()
     * says whether the last read failed to parse or was blocked outright; if
     * it did, this screen opens in its error state rather than drawing "you
     * have saved nothing" over somebody's actual data.
     */
    let phase = store.loadFault() ? 'error' : 'ready';

    function paint() {
      const s = store.get();
      const list = s.watchlist;
      const dropped = list.filter(
        (w) => typeof w.lastCents === 'number' && typeof w.usualCents === 'number' && w.lastCents < w.usualCents,
      );
      const openEntry = openId ? list.find((w) => w.id === openId) : null;
      const openMatch = openEntry ? matchFor(s.history, openEntry.id) : null;

      /**
       * The header callback: the most recently saved row, read back.
       *
       * Built inside the branch that uses it rather than above the branch, so
       * that a stored entry which makes it throw cannot throw a second time on
       * the error paint -- which would put the screen in router.js's exception
       * page, the exact outcome the error state exists to replace.
       */
      function header() {
        const first = list[0];
        const moved = first && typeof first.lastCents === 'number' && typeof first.usualCents === 'number'
          ? first.lastCents - first.usualCents
          : null;
        const face = moved === null || moved === 0 ? 'fair' : moved < 0 ? 'good' : 'walk';
        // Not pre-escaped any more: `shinSay` escapes the line it builds, as
        // of 2026-09-06. Escaping here as well would double-escape, because
        // escapeHtml is not idempotent -- a shop called "Tom & Jerry" would
        // read as "Tom &amp;amp; Jerry" on the screen.
        const facts = first ? {
          item: first.label,
          seller: first.askingSeller ?? '',
          price: cad(first.lastCents),
          day: ago(first.savedAt),
        } : {};
        return shinSay(face, 'watchlist_callback', facts, { size: 64, anim: 'idle-breath' });
      }

      let body;
      if (phase === 'loading') {
        body = html`<div class="list-state"><p class="fineprint">${say('watchlist_loading')}</p></div>`;
      } else if (phase === 'error') {
        // Same shape and the same voice as you.js's engine failure, which is
        // the only other place in the app that admits a read did not work.
        body = html`
          <div class="list-state">
            <p class="fineprint">${say('watchlist_failed')}</p>
            <button type="button" class="linky" data-act="retry" data-fk="retry:watchlist">Try again</button>
          </div>`;
      } else if (list.length) {
        body = html`
          <div class="wlist-head">${raw(header())}</div>
          <div class="wlist">${raw(list.map((w) => row(w, s.history)).join(''))}</div>`;
      } else {
        // FLAWS item 13: this screen used to state the same fact three times --
        // the kicker "NOTHING SAVED YET", the heading "Saved", and the line
        // "Nothing here yet." The kicker is dropped while the list is empty
        // (see the header below), so what is left is the heading, one line in
        // Shin's voice, and the shutter in the footer as the way out.
        body = html`
          <div class="empty" data-act="wake-empty">
            ${raw(faceBlock('asleep', { size: 'face-verdict' }))}
            <p>${say('watchlist_empty')}</p>
          </div>`;
      }

      root.innerHTML = html`
        <div class="page page-list">
          <header class="page-head">
            ${raw(list.length && phase === 'ready'
              ? html`<p class="kicker">${list.length} thing${list.length === 1 ? '' : 's'} · ${dropped.length} under the usual</p>`
              : '')}
            <h1>Saved</h1>
          </header>

          ${raw(
            // Row 45 is dark, not v1: without a re-queryable source, "under
            // the usual" is a snapshot taken at save time, not a movement
            // Shin watched happen, and a nudging face would claim the
            // latter. FLAGS.feed is the same switch row 33's promise waits
            // on, for the same reason (USAGE.md C4).
            FLAGS.feed && dropped.length
              ? html`<div class="drop-card" data-tier="good">
                   ${raw(faceBlock('nudging', { size: 'face-page' }))}
                   <div>
                     <b>${say('dropped', {
                       asking: cad(dropped[0].lastCents),
                       seller: dropped[0].askingSeller ?? 'the seller you saved it at',
                       usual: cad(dropped[0].usualCents),
                     })}</b>
                     <span>${dropped[0].label}, under the usual ${cad(dropped[0].usualCents)}.</span>
                   </div>
                 </div>`
              : '',
          )}

          ${raw(body)}

          <div class="wmore">
            <button type="button" class="rowbtn" data-act="pastscans" data-fk="nav:pastscans">
              <span>Past scans</span>
              <span class="rowbtn-v">${s.history.length}</span>
            </button>
            <button type="button" class="rowbtn" data-act="removed" data-fk="nav:removed">
              <span>Recently removed</span>
              <span class="rowbtn-v">${s.removed.length}</span>
            </button>
          </div>

          <div class="page-foot">
            <button type="button" class="mini-shutter" data-act="camera" aria-label="Scan something" data-fk="nav:camera"></button>
          </div>
        </div>
        ${raw(phase === 'ready' && openEntry ? detailModal(openEntry, openMatch) : '')}`;

      if (prevLen === 0 && list.length > 0) {
        animateFace(root.querySelector('.wlist-head .face'), 'wake');
      }
      prevLen = list.length;
    }

    /**
     * The guarded paint. A row built from a malformed stored entry throws
     * here, not into router.js's exception screen; the screen re-paints once
     * into its own error state and stays usable.
     */
    function safePaint() {
      if (phase === 'error') { paint(); return; }
      try {
        paint();
      } catch (err) {
        // The exception goes to the console, never to the screen: FLAWS item 5
        // is that showing a user the raw message is not telling them anything.
        console.error('Saved failed to render', err);
        phase = 'error';
        paint();
      }
    }

    const repaint = repainter(root, safePaint, syncModal);

    function closeModal() {
      openId = null;
      const back = returnKey;
      returnKey = null;
      repaint(back);
    }

    safePaint();
    syncModal(root);

    // Item: every listener here used to attach to the persistent `#screen` and
    // was never removed, so a second visit to Saved ran two click handlers on
    // the same node -- two `store.toggleWatch` calls for one tap on a delete.
    // One controller per render, aborted in the cleanup below, the same shape
    // camera.js has used since its own fix.
    const listeners = new AbortController();

    on(root, 'click', (e) => {
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="pastscans"]')) { ctx.go('pastscans'); return; }
      if (e.target.closest('[data-act="removed"]')) { ctx.go('removed'); return; }

      if (e.target.closest('[data-act="retry"]')) {
        // Ask storage again; seed the phase from what it says, not from hope.
        phase = store.reload() ? 'error' : 'ready';
        repaint();
        return;
      }

      if (e.target.closest('[data-act="wake-empty"]')) {
        animateFace(root.querySelector('.empty .face'), 'wake');
        return;
      }

      if (e.target.closest('[data-act="close-detail"]') || onBackdrop(e)) {
        closeModal();
        return;
      }

      const unwatch = e.target.closest('[data-unwatch]');
      if (unwatch) { store.toggleWatch({ id: unwatch.dataset.unwatch }); return; }

      const open = e.target.closest('[data-open]');
      if (open) { openId = open.dataset.open; returnKey = open.dataset.fk ?? null; repaint(); }
    }, listeners.signal);

    on(document, 'keydown', modalKeys(root, () => openId !== null, closeModal), listeners.signal);

    // Wrapped, not passed: subscribers are called with the new state, and
    // `repaint`'s first argument is a focus key to prefer.
    const unsub = store.subscribe(() => repaint());
    return () => {
      unsub();
      listeners.abort();
    };
  },
};
