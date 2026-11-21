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

/** Wired once from main.js. `plusActive` skips the request entirely for a subscriber. */
export function startScansLeft({ api, go, plusActive = () => false, win = globalThis.window, doc = globalThis.document } = {}) {
  if (!win?.addEventListener || typeof api?.quota !== 'function') return;
  win.addEventListener('pexi:scan-counted', () => {
    if (plusActive()) return;
    void Promise.resolve(api.quota()).then((q) => {
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
