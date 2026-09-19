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
 *
 * ESCAPING. This file is where the app's one live self-XSS was: line 101 put
 * `h.query.text` -- the name the user types on the correction screen, or into
 * the camera's text route -- straight into `innerHTML`, so correcting an item
 * to `<img src=x onerror=alert(1)>` and opening this screen ran it. Every
 * interpolation of stored text now goes through `dom.js`'s `html` tag, and
 * `raw()` is used only for markup this file built itself (`faceSvg`,
 * `faceBlock`, `dotsHtml`, `shinSay`).
 */

import { faceSvg, faceBlock, shinSay, marketMoney, sellerOf, confidenceOf, dotsHtml, tierOf, geminiWordFor } from '../shin.js';
import { say, wordFor, refusalLabel } from '../voice.js';
import * as store from '../store.js';
import { escapeHtml, html, raw, ago, on } from '../lib/dom.js';
import { repainter, syncModal, modalKeys, onBackdrop } from '../lib/listscreen.js';
import { pageBar, backButton, goBack, removeGlyph } from '../lib/pagebar.js';
import { t } from '../ui-strings.js';

/*
 * The eight refusal reasons used to be a map here, described in this comment
 * as "plain screen labels, not Shin speaking". They were duplicated copy:
 * voice.js already owned eight refusal keys covering the same eight reasons in
 * three voices, and this map wrote each of them a ninth time in one. They are
 * `refusal_label_*` in voice.js now and reached through `refusalLabel`, which
 * falls back to the plain word for a reason code that has no key yet.
 *
 * camera.js is the other place a refusal reason reaches a screen and it has
 * not had this treatment. That file belongs to another lane this pass.
 */

/** The name to show for a history entry, verdict or refusal. */
function labelOf(h) {
  const isVerdict = h.result?.kind === 'verdict';
  return isVerdict ? h.result.identity.label : (h.result?.identity?.label ?? h.query?.text ?? t('past_scans_unknown_item'));
}

/**
 * One past-scan row. Exported for `test/escape.test.mjs`: the row builder is
 * the boundary between stored text and `innerHTML`, and it needs no DOM to
 * assert on.
 */
export function row(h) {
  const isVerdict = h.result?.kind === 'verdict';
  const face = isVerdict ? tierOf(h.result.tier).face : 'unknown';
  const label = labelOf(h);
  const askingCents = isVerdict ? h.result.askingCents : h.query?.askingCents;
  const seller = isVerdict ? sellerOf(h.result) : null;
  const sub = [seller, ago(h.at)].filter(Boolean).join(' · ');
  // OLMA row 70: the row's face carries the same solid-vs-hollow confidence
  // treatment the verdict sheet gave it. confidenceOf already returns the
  // "refuses" band for a non-verdict result, so this is one call for both
  // shapes of row, never a second opinion recomputed from nothing.
  const conf = confidenceOf(h.result);
  const tierId = isVerdict ? h.result.tier : 'unknown';

  // `data-fk` is the focus key listscreen.js's repainter restores by, built
  // from the entry's own id so it survives another row being deleted above it.
  return html`
    <div class="prow-wrap">
      <button type="button" class="row prow" data-open="${h.id}" data-fk="open:${h.id}"
              data-tier="${tierId}" data-conf="${conf.level}">
        ${raw(faceSvg(face, { size: 'face-row' }))}
        <span class="row-n">
          <b class="row-title">${label}</b>
          <span class="row-sub">${sub}</span>
        </span>
        <span class="prow-p">${typeof askingCents === 'number' ? marketMoney(askingCents) : t('past_scans_no_price')}</span>
      </button>
      <button type="button" class="rowdel prow-del" data-remove="${h.id}" data-fk="del:${h.id}">
        ${raw(removeGlyph())}
        <span class="sr-only">${t('past_scans_remove_of')} ${label}</span>
      </button>
    </div>`;
}

/**
 * The read-only reopened verdict, AVATAR.md's per-scan face and tier, replayed
 * rather than an error.
 *
 * `role="dialog"`, `aria-modal`, the focus trap, Escape and focus return are
 * added after mount by `listscreen.js`'s `syncModal` and `modalKeys`: they were
 * the same five omissions on both of this app's modals, so there is one
 * implementation rather than two.
 */
export function detail(h) {
  const isVerdict = h.result?.kind === 'verdict';

  if (isVerdict) {
    const v = h.result;
    const conf = confidenceOf(v);
    const source = sellerOf(v);
    const facts = { asking: marketMoney(v.askingCents), usual: marketMoney(v.spread.medianCents) };

    return html`
      <div class="pmodal" data-act="modal">
        <div class="pmodal-card" data-tier="${v.tier}" tabindex="-1">
          ${raw(faceBlock(tierOf(v.tier).face, { size: 'face-verdict' }))}
          <h2>${wordFor(v.tier)}</h2>
          <p class="said">${say(v.tier, facts)}</p>
          <p class="pmodal-meta">${v.identity.label}${source ? ` · ${source}` : ''} · ${ago(h.at)}</p>
          <p class="pmodal-conf">${conf.label}${raw(dotsHtml(conf.dots))}</p>
          <p class="pmodal-note">${say('read_only_note')}</p>
          <button type="button" class="linky" data-act="close-detail">${t('close')}</button>
        </div>
      </div>`;
  }

  /*
   * A Gemini answer, reopened. The stored row keeps two plain facts beside it
   * (`query.answered`, `query.zone`, written when the answer landed), so the
   * heading is the word the sheet headlined it with and the wire is never
   * opened here. It is not a refusal and must not be headed as one.
   */
  if (h.result?.kind === 'gemini') {
    const conf = confidenceOf(h.result);
    return html`
      <div class="pmodal" data-act="modal">
        <div class="pmodal-card" data-tier="unknown" tabindex="-1">
          ${raw(faceBlock('unknown', { size: 'face-verdict' }))}
          <h2>${geminiWordFor(h)}</h2>
          <p class="pmodal-meta">${h.query?.text ?? t('past_scans_unknown_item')} · ${ago(h.at)}</p>
          ${raw(conf.label ? html`<p class="pmodal-conf">${conf.label}</p>` : '')}
          <p class="pmodal-note">${say('read_only_note')}</p>
          <button type="button" class="linky" data-act="close-detail">${t('close')}</button>
        </div>
      </div>`;
  }

  const r = h.result;
  return html`
    <div class="pmodal" data-act="modal">
      <div class="pmodal-card" data-tier="unknown" tabindex="-1">
        ${raw(faceBlock('unknown', { size: 'face-verdict' }))}
        <h2>${refusalLabel(r?.reason)}</h2>
        <p class="pmodal-meta">${h.query?.text ?? t('past_scans_unknown_item')} · ${ago(h.at)}</p>
        <p class="said">${r?.detail ?? ''}</p>
        <p class="pmodal-note">${say('read_only_note')}</p>
        <button type="button" class="linky" data-act="close-detail">${t('close')}</button>
      </div>
    </div>`;
}

export default {
  id: 'pastscans',
  title: 'Past scans',
  titleKey: 'past_scans',

  render(root, ctx) {
    let openId = null;
    /** The focus key of the row that opened the dialog, so closing it puts the
     *  user back on that row rather than at the top of the document. */
    let returnKey = null;
    /*
     * `error` is real and reachable: a `history` entry stored by an older build
     * can be any shape, and one that throws while its row is built used to take
     * the whole screen down to router.js's exception page. `loading` is written
     * and NOT reached in this build -- `store.get()` is synchronous
     * localStorage -- and is stated as such rather than left to be found. See
     * the longer note in watchlist.js.
     */
    /*
     * An unreadable store is an error, not an empty list. store.loadFault()
     * says whether the last read failed to parse or was blocked outright; if
     * it did, this screen opens in its error state rather than drawing "you
     * have saved nothing" over somebody's actual data.
     */
    let phase = store.loadFault() ? 'error' : 'ready';

    function paint() {
      const list = store.get().history;
      const open = openId ? list.find((h) => h.id === openId) : null;

      /**
       * A 64px header, callback to the last scan: this row's own tier face
       * and word if it was a verdict, "refused" if it was not, from facts
       * already resolved here (voice.js only ever interpolates them).
       *
       * Computed inside the branch that uses it, not above the branch. It used
       * to be hoisted, and a stored entry that made it throw threw again on the
       * error paint -- which put the screen in router.js's exception page,
       * exactly the outcome the error state exists to replace.
       */
      function header() {
        const last = list[0];
        const isVerdict = last?.result?.kind === 'verdict';
        const face = last ? (isVerdict ? tierOf(last.result.tier).face : 'unknown') : 'idle';
        // Not pre-escaped any more: `shinSay` escapes its own line as of
        // 2026-09-06, and escaping twice is a visible bug rather than a safe
        // default -- escapeHtml is not idempotent.
        const facts = last ? {
          item: last.result?.identity?.label ?? last.query?.text ?? t('past_scans_that_one'),
          verdict: isVerdict
            ? wordFor(last.result.tier)
            : last.result?.kind === 'gemini' ? geminiWordFor(last) : 'refused',
        } : {};
        return shinSay(face, 'pastscans_callback', facts, { size: 64, anim: 'idle-breath' });
      }

      let body;
      if (phase === 'loading') {
        body = html`<div class="list-state"><p class="fineprint">${say('pastscans_loading')}</p></div>`;
      } else if (phase === 'error') {
        // The same shape and voice as you.js's engine failure, which is the
        // only other place in the app that admits a read did not work.
        body = html`
          <div class="list-state">
            <p class="fineprint">${say('pastscans_failed')}</p>
            <button type="button" class="linky" data-act="retry" data-fk="retry:pastscans">${t('try_again')}</button>
          </div>`;
      } else if (list.length) {
        body = html`
          <div class="plist-head">${raw(header())}</div>
          <div class="plist">${raw(list.map(row).join(''))}</div>`;
      } else {
        body = html`
          <div class="empty">
            ${raw(faceBlock('asleep', { size: 'face-verdict' }))}
            <p>${say('pastscans_empty')}</p>
          </div>`;
      }

      root.innerHTML = html`
        <div class="page page-list">
          <header class="page-head">
            ${raw(backButton())}
            ${raw(phase === 'ready' ? html`<p class="kicker">${t('past_scans')} · ${list.length}</p>` : '')}
            <h1>${t('past_scans')}</h1>
          </header>

          ${raw(body)}

          ${raw(pageBar('watchlist'))}
        </div>
        ${raw(phase === 'ready' && open ? detail(open) : '')}`;
    }

    /** A row built from a malformed stored entry lands in this screen's own
     *  error state, not in router.js's exception page. */
    function safePaint() {
      if (phase === 'error') { paint(); return; }
      try {
        paint();
      } catch (err) {
        console.error('Past scans failed to render', err);
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

    // One AbortController per render. This handler used to attach to the
    // persistent `#screen` and was never removed, so a second visit ran two
    // copies of it: two `store.removeScan` calls for one tap on a delete.
    const listeners = new AbortController();

    on(root, 'click', (e) => {
      // Back is the browser's back, not a forward move dressed as one: router.js
      // pushes an entry on every `go`, so Saved is already the previous entry.
      if (e.target.closest('[data-act="back"]')) { goBack(ctx, 'watchlist'); return; }
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="watchlist"]')) { ctx.go('watchlist'); return; }
      if (e.target.closest('[data-act="you"]')) { ctx.go('you'); return; }
      if (e.target.closest('[data-act="retry"]')) { phase = store.reload() ? 'error' : 'ready'; repaint(); return; }

      // Clicking the modal's own backdrop closes it; clicking the card must
      // not. This used to be `e.target.dataset.act === 'modal'`, true only when
      // the pointer was over the overlay element and nothing else.
      if (e.target.closest('[data-act="close-detail"]') || onBackdrop(e)) { closeModal(); return; }

      const del = e.target.closest('[data-remove]');
      if (del) { store.removeScan(del.dataset.remove); return; }

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
