/**
 * You. Settings, and the honest account of what Pexi can and cannot do.
 *
 * There is no "what Pexi can price" list any more. It counted the seven items
 * that were priced by hand, which stopped being what Pexi can answer the day a
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
import { improveOn, aiTextAnswer, setChoice } from '../choices.js';
import { escapeHtml, on } from '../lib/dom.js';
import { wireRadioGroup } from '../lib/radiogroup.js';
import { storagePersists } from '../lib/persistence.js';
import { pageBar, rowChevron, rowCheck } from '../lib/pagebar.js';
import { getDeviceId } from '../device.js';
import { t } from '../ui-strings.js';
import { LOCALES, locale, setLocale, localePinned } from '../lib/locale.js';
import { countryLabel, regionText } from './market.js';
import { rangePickerHtml, handleRangeClick } from '../lib/range-picker.js';
import { tagsOn, setTagsOn } from '../screen-tag-badge.js';
import { devOn, packReadOn, setPackReadOn } from '../dev-mode.js';
import { FLAGS } from '../flags.js';
import { MANAGE_URLS, REVIEW_URLS } from '../plus-config.js';
import { platformOf } from '../purchases.js';
import { APP_VERSION } from '../version.js';

/**
 * "Manage subscription": the store's own subscriptions page, or '' for no row.
 * D29 (2026-10-06): the page only means something inside the Android store
 * build, where the subscription was bought. In a browser tab it opened a
 * Google page that knows nothing about the person, so a browser gets no row.
 * 2026-11-17: the iPhone app ships, and the legal review (question 14, Quebec's
 * cancellation button) wants the row for every subscriber, so iOS gets Apple's
 * subscriptions page.
 */
export function manageSubscriptionUrl(win = globalThis.window) {
  const p = platformOf(win);
  return p === 'ios' || p === 'android' ? MANAGE_URLS[p] : '';
}

/**
 * "Rate Pexi": the store's own review page for this phone, or '' for no row (a browser, or Android with no
 * package id configured). A plain link the shopper taps; it is not tied to the platform review prompt.
 */
export function rateUrl(win = globalThis.window, urls = REVIEW_URLS) {
  const p = platformOf(win);
  return p === 'ios' || p === 'android' ? urls[p] || '' : '';
}

/**
 * When the server this app talks to last started, as `YYYY-MM-DD HH:MM`, or
 * null when it cannot be read. The server reports `startedAt` on /api/health;
 * that moment is the running build, derived at start rather than hand-set
 * (D28). `fetchFn` and `win` are injectable so a test needs no network.
 */
export async function buildStamp(fetchFn = globalThis.fetch, win = globalThis.window) {
  if (typeof fetchFn !== 'function') return null;
  const headers = win?.SHIN_INVITE_CODE ? { 'x-shin-invite': win.SHIN_INVITE_CODE } : {};
  const res = await fetchFn(`${win?.SHIN_API_BASE ?? ''}/api/health`, { headers });
  if (!res?.ok) return null;
  const at = new Date((await res.json())?.startedAt);
  if (Number.isNaN(at.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`;
}

/**
 * The quota row's text, or '' for no row: Plus says its 100 a week, or how many
 * of the Plus cap are left when the server sets one; a limit the server
 * set says how many are left; no limit (null from the server) says nothing.
 */
export function quotaText(q) {
  if (!q || typeof q !== 'object') return '';
  if (q.plus === true) {
    if (Number.isInteger(q.limit) && Number.isInteger(q.remaining)) {
      return t('you_plus_scans_left', { remaining: String(Math.max(0, q.remaining)), limit: String(q.limit) });
    }
    return t('you_plus_on');
  }
  if (!Number.isInteger(q.limit) || !Number.isInteger(q.remaining)) return '';
  return t('you_scans_left', { remaining: String(Math.max(0, q.remaining)), limit: String(q.limit) });
}

/**
 * Item 6d: the delete-my-data path. An email link is enough for the beta
 * (the plan's own words), addressed with this device's own id in the body so
 * whoever reads the mailbox can find the right rows without asking the
 * person to go find an id themselves.
 *
 * THE ADDRESS IS THE PRIVACY POLICY'S OWN (D15, 2026-10-06). It used to be a
 * named placeholder at a made-up domain, while the privacy policy page told
 * people to write to usepexiapp@gmail.com for the same request. One address,
 * everywhere: this one, and a test reads the policy to keep it so.
 */
export const DELETE_MY_DATA_EMAIL = 'usepexiapp@gmail.com';

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
 * 2026-11-21 readiness review (ops 7, gap 85): "Help and contact", a mail to the same support address
 * with the app version in it and nothing else, so a shopper whose Plus did not unlock has a way to write.
 */
export function contactHref(version = APP_VERSION) {
  const body = `\n\n${t('you_contact_body_build')}: ${version}`;
  return `mailto:${DELETE_MY_DATA_EMAIL}?subject=${encodeURIComponent(t('you_contact_subject'))}&body=${encodeURIComponent(body)}`;
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
    /* N06: stored data that could not be read is a fault, never "Nothing scanned this week" (the D41 shape). */
    const unreadable = Boolean(store.loadFault());
    const weekKey = unreadable ? 'pastscans_failed' : weekProud ? 'you_weekly_proud' : 'you_weekly';
    const manageUrl = manageSubscriptionUrl();
    const rate = rateUrl();
    const ratedCounts = store.ratedCounts();
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
     * no terminal punctuation either -- neither is Pexi talking and neither
     * is on this file's own allowlist, so a four-plus-word sentence ending
     * in a full stop there would fail test/screens-voice.test.mjs's rule 2,
     * which this file does not own. A fragment reads exactly as clearly and
     * is not a sentence by that rule's own definition.
     *
     * Item 6d/6e. The "What Pexi does with your data" section used to open
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
        ${/* 2026-11-22 (Aurik): "It should only be settings and take out the other word". */ ''}
        <header class="page-head">
          <h1>${escapeHtml(t('you_title'))}</h1>
        </header>

        ${/* 2026-11-22 (Aurik: "the setting screen needs improvement because theres no flow"): one long
             "Settings" block held eleven unrelated controls, so the page is grouped the way a shopper looks
             for things, most-used first: prices, scanning, look and language, Pexi Plus, your
             activity, privacy, then help. Every control and caption is the one it was; only the grouping and
             the order changed, and the haptics row became a switch. Later the same day (Aurik): the Deadpan / Warm / Blunt picker is gone ("remove the
             Deadpan,blunt, etc versions of pexi"), and the week line and your activity moved to Progress. */ ''}
        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('you_prices_h'))}</h2>
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

          ${/* FLAGS.market off pins Canada at boot, so no picker row and no caption. */ !store.marketPinned() ? `<div class="ilist">
            <button type="button" class="ilist-row" data-act="market">
              <span class="ilist-l">${escapeHtml(t('you_market'))}</span>
              <span class="ilist-v">${escapeHtml((market.country ? countryLabel(market.country) : t('you_market_unset')) + (regionText(market) ? `, ${regionText(market)}` : ''))}</span>
              ${rowChevron()}
            </button>
          </div>
          <p class="fineprint">${escapeHtml(t('you_market_caption'))}</p>` : ''}
        </section>

        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('you_scanning_h'))}</h2>
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

          ${/* 2026-11-22: a switch like the privacy switches, not a row with an On/Off word; it now covers every
               press as well as the verdict (lib/haptics.js startPressHaptics). */ ''}
          <div class="ilist consent-list">
            <div class="ilist-row consent-row">
              <div class="consent-text">
                <span class="ilist-l" id="you-buzz-l">${escapeHtml(t('you_buzz'))}</span>
                <p class="fineprint">${escapeHtml(t('you_buzz_caption'))}</p>
              </div>
              <button type="button" class="switch${store.buzzOn() ? ' on' : ''}" data-act="buzz" role="switch"
                      aria-checked="${store.buzzOn()}" aria-labelledby="you-buzz-l"></button>
            </div>
          </div>
        </section>

        <section class="block">
          <h2 class="sect-h">${escapeHtml(t(localePinned() ? 'you_look_only_h' : 'you_look_h'))}</h2>
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
          ${/* FLAGS.languages off pins English at boot (flags-boot.js), so no row. */ !localePinned() ? `
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
          <p class="fineprint">${escapeHtml(t('you_language_caption'))}</p>` : ''}

        </section>

        ${/* Pexi Plus (2026-09-21): this week's free scans from /api/quota, filled
             after the paint and shown only when the server sets a limit, and the
             store's own subscription page, which is the only place a
             subscription is changed or cancelled. */ ''}
        <section class="block" data-plus-block>
          <h2 class="sect-h">${escapeHtml(t('paywall_title'))}</h2>
          <div class="ilist">
            ${/* R-35: the paywall is one tap from here and two from the camera, with Restore purchases on it. */ ''}
            <button type="button" class="ilist-row" data-act="plus">
              <span class="ilist-l">${escapeHtml(t('paywall_title'))}</span>
              ${rowChevron()}
            </button>
            ${/* 2026-11-22: no Savings overview row; Progress is where the shopper's record grows (screens/progress.js). */ ''}
            <div class="ilist-row" data-quota-row hidden><span class="ilist-l" data-quota-text></span></div>
            ${/* D29: the store page is a dead end anywhere but the Android store build, so no row. */ manageUrl ? `<a class="ilist-row" href="${escapeHtml(manageUrl)}" target="_blank" rel="noopener noreferrer" data-manage-sub>
              <span class="ilist-l">${escapeHtml(t('you_manage_sub'))}</span>
              ${rowChevron()}
            </a>` : ''}
          </div>
        </section>


        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('you_data_h'))}</h2>
          ${/* 2026-11-25 (Jamin: one document, no off switches): the Claude, photos, location and usage
               switches and the data paragraph are gone. Everything they said is in the Terms, Privacy and
               Data document, accepted once on first launch; the row below reopens it read-only (Apple
               5.1.1(i): the privacy policy stays reachable in the app). */ ''}
          ${/* 2026-11-26 (legal review A G1 to G3; Apple 5.1.1(ii), 5.1.2(i)): the two optional choices live
               here, where the shopper can change them any time. Both read the answer on this phone and write it
               to the server with the time (screens/agree.js `setChoice`); the server is what enforces them. */ ''}
          <div class="ilist consent-list">
            <div class="ilist-row consent-row">
              <div class="consent-text">
                <span class="ilist-l" id="you-improve-l">${escapeHtml(t('improve_title'))}</span>
                <p class="fineprint">${escapeHtml(t('improve_body'))}</p>
              </div>
              <button type="button" class="switch${improveOn() ? ' on' : ''}" data-act="improve" role="switch"
                      aria-checked="${improveOn()}" aria-labelledby="you-improve-l"></button>
            </div>
            <div class="ilist-row consent-row">
              <div class="consent-text">
                <span class="ilist-l" id="you-ai-text-l">${escapeHtml(t('you_ai_text_title'))}</span>
                <p class="fineprint">${escapeHtml(t('you_ai_text_caption'))}</p>
              </div>
              <button type="button" class="switch${aiTextAnswer() === 'yes' ? ' on' : ''}" data-act="ai-text" role="switch"
                      aria-checked="${aiTextAnswer() === 'yes'}" aria-labelledby="you-ai-text-l"></button>
            </div>
          </div>
          <div class="ilist">
            <button type="button" class="ilist-row" data-act="legal">
              <span class="ilist-l">${escapeHtml(t('legal_title'))}</span>
              ${rowChevron()}
            </button>
          </div>

          ${/* 2026-11-21: "No scan limit." is true only when the server sets none, so it is drawn hidden and
               shown by the /api/quota answer below when that answer says there is no limit. */ ''}
          <p class="fineprint" data-no-meter hidden>${escapeHtml(t('you_no_meter'))}</p>
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
          <h2 class="sect-h">${escapeHtml(t('you_help_h'))}</h2>
          <div class="ilist">
            ${/* 2026-11-22: the new-user walkthrough, again (screens/guide.js; RULINGS: watchable more than once). */ ''}
            <button type="button" class="ilist-row" data-act="guide">
              <span class="ilist-l">${escapeHtml(t('you_guide_row'))}</span>
              ${rowChevron()}
            </button>
            ${/* FLAGS.onboarding off: no welcome to watch again. */ FLAGS.onboarding ? `<button type="button" class="ilist-row" data-act="welcome">
              <span class="ilist-l">${escapeHtml(t('onb_replay_row'))}</span>
              ${rowChevron()}
            </button>` : ''}
            <a class="ilist-row" href="${escapeHtml(contactHref())}" data-contact>
              <span class="ilist-l">${escapeHtml(t('you_contact'))}</span>
              <span class="ilist-v">${escapeHtml(t('you_email'))}</span>
              ${rowChevron()}
            </a>
            <button type="button" class="ilist-row" data-act="report">
              <span class="ilist-l">${escapeHtml(t('you_report'))}</span>
              <span class="ilist-v">${escapeHtml(t('you_report_fastest'))}</span>
              ${rowChevron()}
            </button>
            ${rate ? `<a class="ilist-row" href="${escapeHtml(rate)}" target="_blank" rel="noopener noreferrer" data-rate-pexi>
              <span class="ilist-l">${escapeHtml(t('you_rate'))}</span>
              ${rowChevron()}
            </a>` : ''}
          </div>
        </section>

        ${/* Developer row: a tool for the owner. The switch shows an On/Off word because
             a bare switch has no styling in this stylesheet (see the buzz row above,
             which does the same). Off means no badge element exists at all. */ ''}
        ${/* D28: only when the developer switch is already on or ?dev=1 was used. */ devOn({ tagsOn: tagsOn() }) ? `<section class="block">
          <h2 class="sect-h">${escapeHtml(t('dev_heading'))}</h2>
          <div class="ilist">
            <button type="button" class="ilist-row" data-tags-switch role="switch" aria-checked="false">
              <span class="ilist-l">${escapeHtml(t('dev_tags'))}</span><span class="ilist-v" data-tags-v></span>
            </button>
            ${/* The pack read (2026-10-10, developer-only): off by default. The device id is
                 shown because the server must list it too (SHIN_DEVELOPER_DEVICES). */ ''}
            <button type="button" class="ilist-row" data-pack-read-switch role="switch" aria-checked="false">
              <span class="ilist-l">${escapeHtml(t('dev_pack_read'))}</span><span class="ilist-v" data-pack-read-v></span>
            </button>
          </div>
          <p class="fineprint">${escapeHtml(t('dev_tags_caption'))}</p>
          <p class="fineprint">${escapeHtml(t('dev_pack_read_caption'))} ${escapeHtml(t('you_delete_body_device'))}: ${escapeHtml(getDeviceId()?.id ?? t('unknown'))}</p>
        </section>` : ''}

        <p class="fineprint buildline" data-build>${escapeHtml(t('you_build'))} ${escapeHtml(t('unknown'))}</p>

        ${pageBar('you')}
      </div>`;

    function paintBuzz() {
      const sw = root.querySelector('[data-act="buzz"]');
      if (!sw) return;
      const isOn = store.buzzOn();
      sw.setAttribute('aria-checked', String(isOn));
      sw.classList.toggle('on', isOn);
    }
    paintBuzz();

    /* D28: the build line is read from the running server, never from a number
       somebody set by hand. A failed fetch leaves "unknown" in place. */
    void buildStamp().then((stamp) => {
      if (ac.signal.aborted || !stamp) return;
      const line = root.querySelector('[data-build]');
      if (line) line.textContent = `${t('you_build')} ${stamp}`; // D-268 F31: no "(when this server last started)"
    }).catch(() => {});

    /* This week's scans, from the server's own count. Never awaited: the page
       is whole without it, and a failed fetch leaves the row out. */
    void Promise.resolve(ctx.api?.quota?.()).then((q) => {
      if (ac.signal.aborted) return;
      const noMeter = root.querySelector('[data-no-meter]');
      if (noMeter && q && typeof q === 'object' && q.limit === null && q.plus !== true) noMeter.hidden = false;
      const text = quotaText(q);
      const row = root.querySelector('[data-quota-row]');
      if (!row || !text) return;
      row.querySelector('[data-quota-text]').textContent = text;
      row.hidden = false;
      const block = root.querySelector('[data-plus-block]');
      if (block) { block.hidden = false; block.style.display = ''; }
    }).catch(() => {});

    /** The Developer row's switch, painted from the badge's own state, never from the last tap. */
    function paintTags() {
      const row = root.querySelector('[data-tags-switch]');
      if (!row) return;
      const isOn = tagsOn();
      row.setAttribute('aria-checked', String(isOn));
      row.querySelector('[data-tags-v]').textContent = isOn ? t('on') : t('off');
    }
    paintTags();

    /** The pack-read switch, painted from the stored setting the camera reads, never from the last tap. */
    function paintPackRead() {
      const row = root.querySelector('[data-pack-read-switch]');
      if (!row) return;
      const isOn = packReadOn();
      row.setAttribute('aria-checked', String(isOn));
      row.querySelector('[data-pack-read-v]').textContent = isOn ? t('on') : t('off');
    }
    paintPackRead();

    // Both attitude and theme are radio groups whose ARIA promised arrow keys.
    for (const g of root.querySelectorAll('[role="radiogroup"]')) {
      wireRadioGroup(g, { signal: ac.signal });
    }

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
        // R79: the Keychain copy (storage-backup.js) listens for this, as it does for `shin:locale`.
        globalThis.dispatchEvent?.(new CustomEvent('shin:theme', { detail: { theme: next } }));
        // D-268 F28 (2026-11-11 walk): only the theme's own options. Walking every
        // .seg-o on the screen cleared Percentage/Dollar, the range chips and the torch row.
        const group = themeOpt.closest('[role="radiogroup"]') ?? root;
        for (const el of group.querySelectorAll('[data-theme]')) {
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
      for (const [act, key] of [['improve', 'improve'], ['ai-text', 'aiText']]) {
        const sw = e.target.closest(`[data-act="${act}"]`);
        if (!sw || !root.contains(sw)) continue;
        const next = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', String(next));
        sw.classList.toggle('on', next);
        void setChoice(ctx.api, { [key]: next });
        return;
      }
      if (e.target.closest('[data-tags-switch]')) {
        setTagsOn(!tagsOn());
        paintTags();
        return;
      }
      if (e.target.closest('[data-pack-read-switch]')) {
        setPackReadOn(!packReadOn());
        paintPackRead();
        return;
      }
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="progress"]')) { ctx.go('progress'); return; } // the bar, 2026-11-22
      if (e.target.closest('[data-act="watchlist"]')) { ctx.go('watchlist'); return; }
      // No branch for data-act="you": the bar marks it as the current page, and
      // pressing the page you are on must not push a second entry for it.
      if (e.target.closest('[data-act="market"]')) { ctx.go('market'); return; }
      // Watch the welcome again: opt-in, unlimited. `replay` is what tells the
      // onboarding screen to change nothing it does not have to (onboarding-flow.js).
      if (e.target.closest('[data-act="welcome"]')) { ctx.go('onboarding', { replay: 1 }); return; }
      if (e.target.closest('[data-act="guide"]')) { ctx.go('guide', { replay: 1 }); return; }
      if (e.target.closest('[data-act="plus"]')) { ctx.go('paywall'); return; }
      if (e.target.closest('[data-act="savings"]')) { ctx.go('savings'); return; }
      if (e.target.closest('[data-act="legal"]')) { ctx.go('agree'); return; }
      if (e.target.closest('[data-act="report"]')) ctx.go('correct', {});
    }, ac.signal);

    return () => ac.abort();
  },
};
