/**
 * The weekly free scans left, said on the answer sheet before the limit refuses one at the shelf.
 * 2026-11-21 readiness review, business rank 7 and gap 45: "The weekly limit is invisible until it refuses
 * a scan at the shelf ... Surprise walls cost ratings; a warned shopper converts at a moment they chose."
 *
 * NOT A NAG. One quiet line at the foot of the answer the shopper is already reading, only from 3 free
 * scans left (WARN_AT), never for Pexi Plus, never when the server sets no limit, and never a pop-up. Its
 * tap opens the Plus screen; nothing else changes.
 *
 * HOW IT KNOWS. `api.identify` announces `pexi:scan-counted` after a priced barcode scan was answered (a
 * typed name is free and uncounted, the pricing ruling, so it says nothing). This
 * file then asks `/api/quota`, the server's own count, rather than guessing which scans counted.
 *
 * WHY OUTSIDE camera.js: the camera file is being split (2026-11-21), so this draws into the open sheet
 * (`.sheet`) from outside it, building nodes rather than markup.
 */
import { t } from './ui-strings.js';

/** The line shows from this many free scans left this week. */
export const WARN_AT = 3;
/** The sheet is drawn just after the answer arrives; look for it a few times. */
const TRIES = 6;
const TRY_EVERY_MS = 300;

/** The line for one /api/quota answer, or '' for none. */
export function scansLeftLine(q) {
  if (!q || typeof q !== 'object' || q.plus === true) return '';
  const { limit, remaining } = q;
  if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(remaining)) return '';
  const left = Math.max(0, remaining);
  if (left > WARN_AT) return '';
  return left === 0 ? t('scans_left_none') : t('scans_left_some', { n: String(left) });
}

/**
 * Puts the line at the foot of the open answer sheet. Returns the line, or null when no sheet is open.
 * Once per sheet: a second call finds the first line and leaves it.
 */
export function mountScansLeft(doc, text, onPlus) {
  if (!text || !doc) return null;
  const sheet = doc.querySelector('.sheet');
  if (!sheet) return null;
  const already = sheet.querySelector('[data-scans-left]');
  if (already) return already;
  const line = doc.createElement('p');
  line.setAttribute('class', 'fineprint scans-left');
  line.setAttribute('data-scans-left', '');
  const btn = doc.createElement('button');
  btn.setAttribute('type', 'button');
  btn.setAttribute('class', 'pw-link');
  btn.textContent = `${text} · ${t('scans_left_get_plus')}`;
  btn.addEventListener('click', (e) => {
    e?.stopPropagation?.();
    onPlus();
  });
  line.appendChild(btn);
  sheet.appendChild(line);
  return line;
}

/**
 * The camera's scans-left pill, 2026-11-25. Aurik: *"make sure there is a feature where the users can
 * see how many scans remaining they have"*. The sheet line above only speaks from 3 left, and the
 * Settings row is two taps away, so the count was invisible for most of a week. The pill sits under the
 * camera's top band whenever the server sets a limit, Plus included (its own 100), and says nothing
 * when there is no limit. Its tap opens the Plus screen. Text only, no pop-up.
 */
export function meterText(q) {
  if (!q || typeof q !== 'object') return '';
  const { limit, remaining } = q;
  if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(remaining)) return '';
  const left = Math.max(0, remaining);
  if (q.plus === true) return t('meter_plus_left', { n: String(left), limit: String(limit) });
  return left === 0 ? t('meter_none_left') : t('meter_free_left', { n: String(left), limit: String(limit) });
}

/** Paints one /api/quota answer into the camera pill; hides it when there is nothing to say. */
export function paintMeter(el, q) {
  if (!el) return;
  const text = meterText(q);
  el.textContent = text;
  el.hidden = !text;
  if (!text) { el.removeAttribute('data-level'); return; }
  const left = Math.max(0, q.remaining);
  el.setAttribute('data-level', left === 0 ? 'none' : (left <= WARN_AT && q.plus !== true ? 'low' : 'ok'));
}

/** Asks the server's count and paints the camera pill if one is on screen. Never throws. */
export function refreshMeter({ api, doc = globalThis.document } = {}) {
  if (typeof api?.quota !== 'function' || !doc?.querySelector) return Promise.resolve();
  return Promise.resolve(api.quota()).then((q) => {
    const el = doc.querySelector('[data-scan-meter]');
    if (el) paintMeter(el, q);
  }).catch(() => { /* no count, no pill */ });
}

/** Wired once from main.js. `plusActive` skips the request entirely for a subscriber. */
export function startScansLeft({ api, go, plusActive = () => false, win = globalThis.window, doc = globalThis.document } = {}) {
  if (!win?.addEventListener || typeof api?.quota !== 'function') return;
  win.addEventListener('pexi:scan-counted', () => {
    void Promise.resolve(api.quota()).then((q) => {
      /* 2026-11-25: the camera pill follows every counted scan, Plus included. */
      const meter = doc?.querySelector?.('[data-scan-meter]');
      if (meter) paintMeter(meter, q);
      if (plusActive()) return;
      const text = scansLeftLine(q);
      if (!text) return;
      let tries = 0;
      const attempt = () => {
        if (mountScansLeft(doc, text, () => go('paywall'))) return;
        tries += 1;
        if (tries < TRIES) setTimeout(attempt, TRY_EVERY_MS);
      };
      attempt();
    }).catch(() => { /* no count, no line: the limit screen still explains itself */ });
  });
}
