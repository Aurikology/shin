/**
 * R09: the app tells Pexi's own server when its JavaScript throws and nothing catches it.
 *
 * One small report, to `/api/client-error`: the build number, the message, the file, line and column,
 * and a short stack. No device id, no account, no position, no third party (server side:
 * src/client-errors.ts). It is the cheapest answer to "the app broke on a tester's phone and we never
 * heard": without it a build that throws on start is invisible until someone complains.
 *
 * LOADED FIRST by main.js, so its listeners are armed before the rest of the app's modules evaluate and
 * an error in one of them at start-up is still caught.
 *
 * LIMITS, so this can never become the problem: MAX_REPORTS per session, the same error (message, file,
 * line) only once, and a sender that fails or throws is ignored. Browser notices that are not faults
 * (the ResizeObserver loop message) are skipped.
 */
import { postClientError } from './api.js';
import { APP_VERSION } from './version.js';

export const MAX_REPORTS = 5;
const NOT_A_FAULT = /^ResizeObserver loop/;

export function startCrashReports({ target = globalThis.window, send = postClientError } = {}) {
  if (!target || typeof target.addEventListener !== 'function') return;
  const seen = new Set();
  let count = 0;

  function report(kind, message, source, line, col, stack) {
    try {
      const text = String(message ?? '').trim();
      if (!text || NOT_A_FAULT.test(text)) return;
      const key = `${kind}|${text}|${source}|${line}`;
      if (seen.has(key) || count >= MAX_REPORTS) return;
      seen.add(key);
      count += 1;
      const out = send({ build: APP_VERSION, kind, message: text, source: String(source ?? ''), line: Number(line) || 0, col: Number(col) || 0, stack: String(stack ?? '') });
      out?.catch?.(() => {});
    } catch {
      /* a reporter that fails must never be the next error */
    }
  }

  target.addEventListener('error', (e) => {
    report('error', e?.message ?? e?.error?.message, e?.filename, e?.lineno, e?.colno, e?.error?.stack);
  });
  target.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason;
    report('unhandledrejection', reason instanceof Error ? reason.message : String(reason), '', 0, 0, reason instanceof Error ? reason.stack : '');
  });
}

if (globalThis.window && typeof globalThis.window.addEventListener === 'function') startCrashReports();
