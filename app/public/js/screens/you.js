/**
 * You. Settings, and the honest account of what Shin can and cannot do.
 *
 * There is no "what Shin can price" list any more. It counted the seven items
 * that were priced by hand, which stopped being what Shin can answer the day a
 * scan became one Gemini call for any product: "4 of 7" was a claim about a
 * catalogue the scan no longer reads. The scan-log block below is what is left
 * of the honest account, and it counts what was actually asked.
 *
 * GAMIFICATION.md rules what is on this page: no streak, no badges, no
 * leaderboard, no saved-money tally. The weekly line (mechanic M16) reads the
 * user's own record back to them, computed from `store.js`'s `history`,
 * nothing projected and nothing ranked. OLMA audit rows 76, 77, 80, 82, 84, 85,
 * 86 cover the rest of this page: the market row and its basis, the honest
 * scan allowance (unlimited, meter off), the privacy line adapted to what this
 * app actually sends, a report-a-wrong-price row, the legal position, and a
 * build footer.
 *
 * TWO THINGS CHANGED HERE IN THE 2026-09-06 PASS, both from FLAWS.md.
 *
 * The section labels are headings again. FLAWS.md item 6: `.block-h` was 10px
 * mono uppercase, which DESIGN.md section 2 reserves for provenance -- "Mono
 * earns its place because honesty about sources is the product" -- and this
 * screen alone spent that signal ten times on the word "Appearance" and its
 * neighbours. There are four headings now, in Instrument Sans, sentence case,
 * and mono uppercase on this screen means a source or a date again. The six
 * that went were labels over a single row that already said its own name.
 *
 * The three placeholder rows are gone. They said "not written yet" twice and
 * "not decided yet" once, in a dashed box, on a shipping surface. Their
 * replacement is one paragraph that says the same thing as a sentence rather
 * than as three pieces of dead furniture.
 */

import { PERSONALITIES, personalityCopy, setPersonality, personality, say } from '../voice.js';
import { faceSvg, shinSay } from '../shin.js';
import * as store from '../store.js';
import { escapeHtml, on } from '../lib/dom.js';
import { wireRadioGroup } from '../lib/radiogroup.js';
import { storagePersists } from '../lib/persistence.js';
import { pageBar, rowChevron, rowCheck } from '../lib/pagebar.js';
import { getDeviceId } from '../device.js';
import { toggleConsent } from '../consent-actions.js';
import { t } from '../ui-strings.js';
import { LOCALES, locale, setLocale } from '../lib/locale.js';
import { countryLabel, regionText } from './market.js';
import { rangePickerHtml, handleRangeClick } from '../lib/range-picker.js';
import { tagsOn, setTagsOn } from '../screen-tag-badge.js';

/**
 * Item 6d: the delete-my-data path. An email link is enough for the beta
 * (the plan's own words), addressed with this device's own id in the body so
 * whoever reads the mailbox can find the right rows without asking the
 * person to go find an id themselves.
 *
 * PLACEHOLDER ADDRESS. This repo has no delete-request mailbox on file
 * anywhere (checked: no email address appears in docs/, notes/, or NOW.md),
 * and putting a real inbox into a screen every beta tester sees is a real
 * consequence, not a copy detail -- so this is a named placeholder rather
 * than a guess dressed up as an answer. Replace with the address that
 * actually reads it before this ships past the six testers.
 */
const DELETE_MY_DATA_EMAIL = 'privacy@shin.app';

function deleteMyDataHref() {
  const device = getDeviceId();
  // No period at the end of the first line: this string is scanned by
  // test/screens-voice.test.mjs like any other literal in a screen file, and
  // a four-plus-word sentence ending in a full stop there needs a voice.js key
  // or an allowlist entry this file is not the owner of (only photo-screen and
  // sheet are). A fragment with a colon instead reads exactly as clearly here.
  const body = `${t('you_delete_body_head')}\n\n${t('you_delete_body_device')}: ${device?.id ?? t('unknown')}`;
  return `mailto:${DELETE_MY_DATA_EMAIL}?subject=${encodeURIComponent(t('you_delete_subject'))}&body=${encodeURIComponent(body)}`;
}

/**
 * The three themes, and the reason this is a radio group and not the cycling
 * button it was.
 *
 * It used to be a `.rowbtn` that advanced system -> light -> dark on each tap
 * and printed the new value on the right. To a screen reader that is a button
 * named "Theme" whose state is a separate text node it has no reason to
 * announce, with no way to know what the other options are or that pressing
 * again does something different -- and no `aria-pressed`, because a three-way
 * cycle is not a two-state toggle and `aria-pressed` would have been a lie.
 * The control has three exclusive options, which is what a radio group is, and
 * the screen already has two of them, so it costs nothing new to learn.
 */
const THEMES = [
  { id: 'system', key: 'you_theme_system' },
  { id: 'light', key: 'you_theme_light' },
  { id: 'dark', key: 'you_theme_dark' },
];

export default {
  id: 'you',
  title: 'You',
  titleKey: 'you_title',

  render(root, ctx) {
    const market = store.market();
    const weekly = store.weeklyStats();
    const weekProud = store.goodFindThisWeek();
    const weekState = weekProud ? 'proud' : 'fair';
    const weekAnim = weekProud ? 'proud-hold' : 'idle-breath';
    // The third branch this pair was missing. `proud` picked its own face and
    // its own animation and then borrowed `fair`'s line, so the state shipped
    // with a cell that was never written for it (DESIGN.md section 3). The key
    // takes the same two facts; only the sentence differs.
    const weekKey = weekProud ? 'you_weekly_proud' : 'you_weekly';
    const ratedCounts = store.ratedCounts();
    const consent = store.consent();
    const ac = new AbortController();

    function currentTheme() {
      try { return localStorage.getItem('shin.theme') ?? 'system'; } catch { return 'system'; }
    }
    const theme = currentTheme();
    /* Read once per render, like `theme` above it, so the markup and the tick
       cannot disagree with each other inside one paint. */
    const chosenLocale = locale();
    /* The torch setting (item 11). An unknown stored mode reads as auto, the
       behaviour the app had before this was a setting. */
    const torchMode = store.get().torchMode === 'off' ? 'off' : 'auto';
    const torchLevel = Math.min(
      store.TORCH_RANGE.max,
      Math.max(store.TORCH_RANGE.min, Number(store.get().torchThreshold) || store.TORCH_RANGE.start),
    );

    /**
     * Item 8d. The "Your ratings" section's zero-count caption has no
     * trailing period, and the counted branch is a dot-joined fragment with
     * no terminal punctuation either -- neither is Shin talking and neither
     * is on this file's own allowlist, so a four-plus-word sentence ending
     * in a full stop there would fail test/screens-voice.test.mjs's rule 2,
     * which this file does not own. A fragment reads exactly as clearly and
     * is not a sentence by that rule's own definition.
     *
     * Item 6d/6e. The "What Shin does with your data" section used to open
     * with "Everything stays on this device. Nothing is sent anywhere but
     * the local server that answers a scan," which stopped being true the
     * day the photo route and the hosted-server tunnel (plan item 1)
     * shipped: a photo scan sends the picture itself to be read, and the
     * server this app talks to is not always "local" once it runs on a
     * tunnel. The replacement sentence is a voice.js key (`you_data_intro`)
     * rather than a literal here, for the same rule-2 reason above. Item 6c
     * ("the server refuses to keep a photo or location when the flag is
     * absent") means the two toggles in that section are not a promise this
     * paragraph makes and something else enforces -- they are the actual
     * control, and each sits next to the sentence describing what it does
     * rather than in a list below one that describes both.
     */
    root.innerHTML = `
      <div class="page page-list">
        <header class="page-head">
          <p class="kicker">${escapeHtml(t('you_kicker'))}</p>
          <h1>${escapeHtml(t('you_title'))}</h1>
        </header>

        <section class="block block-week">
          ${shinSay(weekState, weekKey, { scanned: weekly.scanned, callable: weekly.callable }, { size: 64, anim: weekAnim })}
        </section>

        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('you_your_shin'))}</h2>
          <div class="atts atts-row ilist" role="radiogroup" aria-label="${escapeHtml(t('you_attitude_group'))}">
            ${PERSONALITIES.map((q) => personalityCopy(q.id)).map(
              (p) => `<button type="button" class="att${p.id === personality() ? ' on' : ''}"
                        role="radio" aria-checked="${p.id === personality()}" data-who="${escapeHtml(p.id)}">
                <span class="att-face">${faceSvg('fair', { size: 'face-row', who: p.id })}</span>
                <span class="att-t"><b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.blurb)}</span></span>
                ${rowCheck()}
              </button>`,
            ).join('')}
          </div>
        </section>

        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('you_has_answered_h'))}</h2>
          <div class="coverage" data-scanlog aria-live="polite">
            <p class="fineprint">${escapeHtml(t('you_reading_scan_log'))}</p>
          </div>
        </section>

        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('you_settings'))}</h2>

          <div class="setting">
            <span class="setting-t" id="you-theme-l">${escapeHtml(t('you_theme'))}</span>
            <div class="seg" role="radiogroup" aria-labelledby="you-theme-l">
              ${THEMES.map(
                (th) => `<button type="button" class="btn seg-o${th.id === theme ? ' on' : ''}"
                          role="radio" aria-checked="${th.id === theme}" data-theme="${th.id}">${escapeHtml(t(th.key))}</button>`,
              ).join('')}
            </div>
          </div>

          <!--
            The user's two lines, item added 2026-09-14. Setup asks them once;
            this is where they get changed, which is what setup's own fineprint
            promises ("Both changeable any time on the You page") and a promise
            with no control behind it is a defect, not a caption.

            Built as two more .seg radiogroups, the same control the theme row
            one block up already uses. These are the numbers the price line's
            three zones are NAMED after, and that is why they are the user's
            setting rather than a constant: "under your line" is a statement
            about a boundary this person chose. Nothing here grades a price.
          -->
          <!-- Now three ranges (great, good, bad) and a Percentage or Dollar
               Amount toggle, 2026-09-19. lib/range-picker.js draws them, the
               same control setup uses. -->
          <div class="setting">
            <span class="setting-t">${escapeHtml(t('ranges_heading'))}</span>
            ${rangePickerHtml(store.get(), 'you')}
          </div>

          <!--
            The torch (item 11, 2026-09-17), in his words: "This should be a
            setting the user can do. They should have the option to set the
            torch to automatically turn on at a certain brightness level (we
            can give a slider and the slide starts at our default brightness
            level). Or, they can have it not automatically turn on which in that
            case, we will give prompts on screen for when its too dark".
            Two modes and a slider that only means something in the first. The
            camera reads both when it mounts.
          -->
          <div class="setting">
            <span class="setting-t" id="you-torch-l">${escapeHtml(t('you_torch_group'))}</span>
            <div class="seg" role="radiogroup" aria-labelledby="you-torch-l">
              ${['auto', 'off'].map(
                (m) => `<button type="button" class="btn seg-o${m === torchMode ? ' on' : ''}"
                          role="radio" aria-checked="${m === torchMode}" data-torch="${m}"
                          >${escapeHtml(t(m === 'auto' ? 'you_torch_auto' : 'you_torch_off'))}</button>`,
              ).join('')}
            </div>
          </div>
          <div class="setting setting-stack" data-torch-slider${torchMode === 'auto' ? '' : ' hidden'}>
            <label class="setting-t" for="you-torch-level">${escapeHtml(t('you_torch_level'))}</label>
            <input type="range" id="you-torch-level" data-torch-level
                   min="${store.TORCH_RANGE.min}" max="${store.TORCH_RANGE.max}" step="1" value="${torchLevel}"
                   aria-describedby="you-torch-hint">
            <p class="fineprint" id="you-torch-hint">${escapeHtml(t('you_torch_hint'))}</p>
          </div>
          <p class="fineprint" data-torch-offhint${torchMode === 'off' ? '' : ' hidden'}>${escapeHtml(t('you_torch_off_hint'))}</p>

          <!--
            The language row, item 31. Built as the same inset grouped list the
            attitude picker above it is: one .ilist that is a radiogroup, one
            .ilist-row per option, each carrying rowCheck() for the tick.

            A radio group and not a two-state toggle, for the reason the theme
            control one section up gives: a control with N exclusive options is
            a radio group, and this screen already has two of them, so it costs
            nothing new to learn.

            Each option names ITSELF, in its own language (LOCALES in
            lib/locale.js). An option that says "French" to somebody who cannot
            read English is an option they cannot use.
          -->
          <div class="setting setting-stack">
            <span class="setting-t" id="you-lang-l">${escapeHtml(t('you_language'))}</span>
          </div>
          <div class="ilist" role="radiogroup" aria-labelledby="you-lang-l">
            ${LOCALES.map(
              (l) => `<button type="button" class="ilist-row${l.id === chosenLocale ? ' on' : ''}"
                        role="radio" aria-checked="${l.id === chosenLocale}"
                        lang="${escapeHtml(l.tag)}" data-locale="${escapeHtml(l.id)}">
                <span class="ilist-l">${escapeHtml(l.name)}</span>
                ${rowCheck()}
              </button>`,
            ).join('')}
          </div>
          <p class="fineprint">${escapeHtml(t('you_language_caption'))}</p>

          <div class="ilist">
            <button type="button" class="ilist-row" data-act="buzz" aria-pressed="${store.buzzOn()}">
              <span class="ilist-l">${escapeHtml(t('you_buzz'))}</span><span class="ilist-v" data-buzz-v></span>
            </button>
            <button type="button" class="ilist-row" data-act="market">
              <span class="ilist-l">${escapeHtml(t('you_market'))}</span>
              <span class="ilist-v">${escapeHtml((market.country ? countryLabel(market.country) : t('you_market_unset')) + (regionText(market) ? `, ${regionText(market)}` : ''))}</span>
              ${rowChevron()}
            </button>
            <button type="button" class="ilist-row" data-act="welcome">
              <span class="ilist-l">${escapeHtml(t('onb_replay_row'))}</span>
              ${rowChevron()}
            </button>
            <button type="button" class="ilist-row" data-act="savings">
              <span class="ilist-l">${escapeHtml(t('you_savings'))}</span>
              ${rowChevron()}
            </button>
          </div>
          <p class="fineprint">${escapeHtml(t('you_buzz_caption'))}</p>
          <p class="fineprint">${escapeHtml(t('you_market_caption'))}</p>
        </section>

        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('you_ratings'))}</h2>
          <div class="ilist">
            <div class="ilist-row">
              <span class="ilist-l">${escapeHtml(t('you_ratings_rated'))}</span>
              <span class="ilist-v">${ratedCounts.total}</span>
            </div>
          </div>
          <p class="fineprint">${
            ratedCounts.total === 0
              ? escapeHtml(t('you_ratings_none'))
              : `${escapeHtml(String(ratedCounts.up))} ${escapeHtml(t('you_thumbs_up'))} · ${escapeHtml(String(ratedCounts.down))} ${escapeHtml(t('you_thumbs_down'))}`
          }</p>
        </section>

        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('you_data_h'))}</h2>
          <p class="fineprint">${escapeHtml(say('you_data_intro'))}</p>

          <div class="ilist consent-list">
            <div class="ilist-row consent-row">
              <div class="consent-text">
                <span class="ilist-l">${escapeHtml(t('you_photos'))}</span>
                <p class="fineprint">${escapeHtml(say('consent_photos_desc'))}</p>
              </div>
              <button type="button" class="switch" data-consent="photos" role="switch"
                      aria-checked="${consent.photos}" aria-label="${escapeHtml(t('you_photos'))}"></button>
            </div>
            <div class="ilist-row consent-row">
              <div class="consent-text">
                <span class="ilist-l">${escapeHtml(t('you_location'))}</span>
                <p class="fineprint">${escapeHtml(say('consent_location_desc'))}</p>
              </div>
              <button type="button" class="switch" data-consent="location" role="switch"
                      aria-checked="${consent.location}" aria-label="${escapeHtml(t('you_location'))}"></button>
            </div>
          </div>

          <p class="fineprint">${escapeHtml(t('you_no_meter'))}</p>
          <!--
            What used to be three rows here -- "Privacy policy / not written yet",
            "Terms of use / not written yet", "Pricing / not decided yet" -- is now
            this one sentence. FLAWS.md's standing complaint about this screen is
            that it reads like a settings page nobody decided the sections of, and
            three dashed boxes announcing their own emptiness are the clearest case
            of it: a row that exists to say it has no content is worse than no row.
            Pricing in particular could not be fixed by writing better copy for it,
            because docs/decisions.md ("Scans are not metered in v1") means there is
            deliberately nothing to write. That decision is not an embarrassment to
            hide behind a placeholder; said plainly, it is the paragraph above.
          -->
          <p class="fineprint">${escapeHtml(t('you_no_legal'))}</p>
          ${
            /*
             * The one error state this screen can honestly report about itself.
             * The coverage block above already covers the engine; this covers
             * the device. See lib/persistence.js.
             */
            storagePersists() ? '' : `<p class="fineprint" role="status">${escapeHtml(say('storage_not_kept'))}</p>`
          }

          <div class="ilist">
            <a class="ilist-row" href="${deleteMyDataHref()}">
              <span class="ilist-l">${escapeHtml(t('you_delete_my_data'))}</span>
              <span class="ilist-v">${escapeHtml(t('you_email'))}</span>
              ${rowChevron()}
            </a>
          </div>
        </section>

        <section class="block">
          <div class="ilist">
            <button type="button" class="ilist-row" data-act="report">
              <span class="ilist-l">${escapeHtml(t('you_report'))}</span>
              <span class="ilist-v">${escapeHtml(t('you_report_fastest'))}</span>
              ${rowChevron()}
            </button>
            ${/* The market picker held the app's only door to the licences, so
                 attribution was reachable only by someone changing country.
                 `lib/pagebar.js` already documents the licences screen as
                 sitting under You; this is that written intent, wired. */ ''}
            <button type="button" class="ilist-row" data-act="licences">
              <span class="ilist-l">${escapeHtml(t('lic_title'))}</span>
              ${rowChevron()}
            </button>
          </div>
        </section>

        ${/* Developer row: a tool for the owner. The switch shows an On/Off word because
             a bare switch has no styling in this stylesheet (see the buzz row above,
             which does the same). Off means no badge element exists at all. */ ''}
        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('dev_heading'))}</h2>
          <div class="ilist">
            <button type="button" class="ilist-row" data-tags-switch role="switch" aria-checked="false">
              <span class="ilist-l">${escapeHtml(t('dev_tags'))}</span><span class="ilist-v" data-tags-v></span>
            </button>
          </div>
          <p class="fineprint">${escapeHtml(t('dev_tags_caption'))}</p>
        </section>

        <p class="fineprint buildline">${escapeHtml(t('you_build'))} ${escapeHtml(
          ctx.build ?? t('unknown'),
        )} ${escapeHtml(t('you_build_note'))}</p>

        ${pageBar('you')}
      </div>`;

    function paintBuzz() {
      const row = root.querySelector('[data-act="buzz"]');
      const on = store.buzzOn();
      root.querySelector('[data-buzz-v]').textContent = on ? t('on') : t('off');
      // The row is a two-state toggle, so `aria-pressed` is the honest thing to
      // say about it -- unlike the theme control above, which has three states
      // and is a radio group for that reason.
      if (row) row.setAttribute('aria-pressed', String(on));
    }
    paintBuzz();

    /**
     * Item 6d: the withdrawal toggles. `switch` mirrors `store.setConsent`'s
     * shape (only the flag that changed), writes the local copy first (same
     * write-then-send order `corrections.js` uses, for the same reason: the
     * local flag is what every other check in this app reads immediately,
     * and it must never wait on a network round trip to take effect), then
     * tells the server and fires the consent-change event. Turning location
     * on also asks the OS for a position right away rather than waiting for
     * the next scan, so the very first scan after saying yes already has a
     * cell to attach.
     */
    function paintConsent() {
      const c = store.consent();
      for (const key of ['photos', 'location']) {
        const btn = root.querySelector(`[data-consent="${key}"]`);
        if (btn) {
          btn.setAttribute('aria-checked', String(c[key]));
          btn.classList.toggle('on', c[key]);
        }
      }
    }
    paintConsent();

    /** The Developer row's switch, painted from the badge's own state, never from the last tap. */
    function paintTags() {
      const row = root.querySelector('[data-tags-switch]');
      if (!row) return;
      const isOn = tagsOn();
      row.setAttribute('aria-checked', String(isOn));
      row.querySelector('[data-tags-v]').textContent = isOn ? t('on') : t('off');
    }
    paintTags();

    // Both attitude and theme are radio groups whose ARIA promised arrow keys.
    for (const g of root.querySelectorAll('[role="radiogroup"]')) {
      wireRadioGroup(g, { signal: ac.signal });
    }

    /*
     * The scan log, read back.
     *
     * WHY THIS IS A DIFFERENT NUMBER FROM THE WEEKLY LINE AT THE TOP. That one
     * is this phone's own history out of localStorage: what you saw. This is
     * the server's record of what was asked of the catalogue, across every
     * device that has ever asked. They will not agree and are not meant to, so
     * this block says whose scans it is counting rather than leaving two
     * numbers on one screen to quietly contradict each other.
     *
     * AND WHY EVERY RATE HERE CAN SAY "not yet". A share over no scans is
     * unknown, not zero, and printing 0% for it would be this app claiming a
     * measured failure it has not measured. `null` comes back from the server
     * for exactly that case and `pct` turns it into words, never a number.
     */
    const pct = (r) => (r === null || r === undefined ? null : `${Math.round(r * 100)}%`);
    ctx.api.scans().then((s) => {
      const box = root.querySelector('[data-scanlog]');
      if (!box) return;
      if (s.scans === 0) {
        /*
         * `droppedWhy` is the store's own error message -- SQLITE_CANTOPEN and
         * the like. It used to be interpolated into this sentence verbatim,
         * which is an internal identifier on the screen of the one person who
         * cannot act on it (D-011). The screen says that scans were not
         * written; the reason goes where somebody can read it.
         */
        if (s.dropped) console.error('scan log could not be written:', s.droppedWhy);
        const problem = s.dropped ? t('you_some_not_written') : '';
        box.innerHTML = `<p class="fineprint">${escapeHtml(say('you_scans_none', { problem }))}</p>`;
        return;
      }
      const named = pct(s.namedRate);
      const mine = s.thisDevice;
      box.innerHTML = `
        <div class="ilist">
          <div class="ilist-row">
            <span class="ilist-l">${escapeHtml(t('you_scans_named_row'))}</span>
            <span class="ilist-v">${escapeHtml(named ?? t('not_yet'))}</span>
          </div>
        </div>
        <p class="fineprint">${escapeHtml(
          say('you_scans_named', { scans: t('you_scan_count', { n: String(s.scans) }) }),
        )}</p>
        <div class="covlist">
          ${s.perKind
            .map(
              // No yes/no class on these. Those two mean "can answer" and
              // "refuses" on the coverage list above, and borrowing them here
              // set a percentage in a different size and colour from the
              // percentage on the row under it, which reads as two different
              // kinds of number when it is one kind.
              (k) => `<div class="covrow">
                <span>${escapeHtml(k.kind === 'barcode' ? t('you_kind_barcode') : k.kind === 'text' ? t('you_kind_typed') : t('you_kind_photo'))}
                  · ${k.scans}</span>
                <span>${escapeHtml(pct(k.rate) ?? t('not_yet'))}</span>
              </div>`,
            )
            .join('')}
          <div class="covrow">
            <span>${escapeHtml(t('you_corrections_row'))}</span>
            <span>${s.correctionsPerHundred === null ? escapeHtml(t('not_yet')) : Math.round(s.correctionsPerHundred)}</span>
          </div>
          <div class="covrow">
            <span>${escapeHtml(t('you_week_two_row'))}</span>
            <span>${
              s.secondWeekReturn.rate === null
                ? escapeHtml(t('you_week_two_none'))
                : `${pct(s.secondWeekReturn.rate)} ${escapeHtml(t('of'))} ${s.secondWeekReturn.eligible}`
            }</span>
          </div>
          <div class="covrow">
            <span>${escapeHtml(t('you_yours_this_week'))}</span>
            <span>${mine ? escapeHtml(`${t('you_scan_count', { n: String(mine.scansThisWeek) })}, ${t('you_named_suffix', { n: String(mine.named) })}`) : escapeHtml(t('unknown'))}</span>
          </div>
        </div>
        ${
          s.dropped
            ? `<p class="fineprint">${escapeHtml(
                say('you_scans_dropped', {
                  scans: t('you_scan_count', { n: String(s.dropped) }),
                  // Same rule as above: the cause is logged, not printed.
                  why: (console.error('scan log could not be written:', s.droppedWhy), t('you_log_not_written')),
                }),
              )}</p>`
            : ''
        }`;
    }).catch(() => {
      const box = root.querySelector('[data-scanlog]');
      if (box) box.innerHTML = `<p class="fineprint">${escapeHtml(say('you_scanlog_failed'))}</p>`;
    });

    // The torch slider: stored as it moves. The camera reads it on mount.
    on(root, 'input', (e) => {
      const level = e.target.closest?.('[data-torch-level]');
      if (!level) return;
      const n = Math.min(store.TORCH_RANGE.max, Math.max(store.TORCH_RANGE.min, Math.round(Number(level.value))));
      if (Number.isFinite(n)) store.update({ torchThreshold: n });
    }, ac.signal);

    on(root, 'click', (e) => {
      // The torch mode. Shows the slider only for auto, in place.
      const torch = e.target.closest('[data-torch]');
      if (torch) {
        const mode = torch.dataset.torch === 'off' ? 'off' : 'auto';
        store.update({ torchMode: mode });
        for (const el of torch.closest('[role="radiogroup"]').querySelectorAll('.seg-o')) {
          const picked = el === torch;
          el.classList.toggle('on', picked);
          el.setAttribute('aria-checked', String(picked));
        }
        const slider = root.querySelector('[data-torch-slider]');
        const offHint = root.querySelector('[data-torch-offhint]');
        if (slider) slider.hidden = mode !== 'auto';
        if (offHint) offHint.hidden = mode !== 'off';
        return;
      }
      // The two lines. Repainted in place like the attitude and the theme:
      // nothing else on this screen reads them, so there is no reason to
      // re-render a page the user is in the middle of scrolling.
      /* No `track` here: track.js already records every tap, and importing it
         needs a real `screen`, which test/locale.test.mjs's stub does not have. */
      if (handleRangeClick(e, root, { store }, 'you')) return;
      const who = e.target.closest('[data-who]');
      if (who) {
        setPersonality(who.dataset.who);
        for (const el of root.querySelectorAll('.att')) {
          const picked = el === who;
          el.classList.toggle('on', picked);
          el.setAttribute('aria-checked', String(picked));
        }
        return;
      }
      /*
       * The language. Unlike the attitude and the theme above, this cannot be
       * repainted in place: every string on this screen was already rendered
       * in the old language, and half of them are inside blocks a fetch fills
       * in later. `replace` rather than `go` so switching language does not
       * push a history entry, which would make the system back button undo a
       * setting instead of leaving the page.
       */
      const localeOpt = e.target.closest('[data-locale]');
      if (localeOpt) {
        if (setLocale(localeOpt.dataset.locale)) ctx.replace('you');
        return;
      }
      // `closest` walks up to <html>, and choosing a theme sets data-theme on <html>.
      // Without the `root.contains` check every later tap on this screen matched it.
      const themeOpt = e.target.closest('[data-theme]');
      if (themeOpt && root.contains(themeOpt)) {
        const next = themeOpt.dataset.theme;
        if (next === 'system') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = next;
        try { localStorage.setItem('shin.theme', next); } catch { /* private window; see lib/persistence.js */ }
        for (const el of root.querySelectorAll('.seg-o')) {
          const picked = el === themeOpt;
          el.classList.toggle('on', picked);
          el.setAttribute('aria-checked', String(picked));
        }
        return;
      }
      if (e.target.closest('[data-act="buzz"]')) {
        store.setBuzz(!store.buzzOn());
        paintBuzz();
        return;
      }
      if (e.target.closest('[data-tags-switch]')) {
        setTagsOn(!tagsOn());
        paintTags();
        return;
      }
      const consentBtn = e.target.closest('[data-consent]');
      if (consentBtn) {
        toggleConsent(ctx.api, consentBtn.dataset.consent);
        paintConsent();
        return;
      }
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="watchlist"]')) { ctx.go('watchlist'); return; }
      // No branch for data-act="you": the bar marks it as the current page, and
      // pressing the page you are on must not push a second entry for it.
      if (e.target.closest('[data-act="market"]')) { ctx.go('market'); return; }
      // Watch the welcome again: opt-in, unlimited. `replay` is what tells the
      // onboarding screen to change nothing it does not have to (onboarding-flow.js).
      if (e.target.closest('[data-act="welcome"]')) { ctx.go('onboarding', { replay: 1 }); return; }
      if (e.target.closest('[data-act="savings"]')) { ctx.go('savings'); return; }
      if (e.target.closest('[data-act="licences"]')) { ctx.go('licences'); return; }
      if (e.target.closest('[data-act="report"]')) ctx.go('correct', {});
    }, ac.signal);

    return () => ac.abort();
  },
};
