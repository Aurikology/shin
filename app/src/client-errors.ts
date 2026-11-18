/**
 * R09: crash reporting that stays on Pexi's own server.
 *
 * WHY NOT A SERVICE. Sentry, Firebase Crashlytics and the like are one more third party that gets
 * the phone's address and a device fingerprint, one more line in the privacy policy and the App
 * Store's data-use labels, and an SDK inside the iOS build. What Pexi needs is narrower: "this build
 * threw this error at this line". The app already talks to this server, so it posts that and nothing
 * else (`app/public/js/crash-report.js`), and this file turns it into one log line.
 * Native crashes (the app being killed by iOS) are not JavaScript errors; those arrive without any SDK
 * in App Store Connect under TestFlight / App Analytics crashes.
 *
 * WHAT IS KEPT: the build number, what kind of error, its message, the file name, line and column, and
 * a short stack. WHAT IS NOT: the device id, any account, address, position or request body. The route
 * never reads `deviceId` from the report, so a client that sends one anyway has it dropped here, not
 * trusted to omit it. File names are reduced from URLs to the bare name, so no query string (which
 * could carry a code or a search) reaches the log.
 *
 * THE LINE goes through `logError` (`where: 'client.js_error'`), the same stderr JSON stream every
 * other server fault uses, so `grep client.js_error` in the server log counts them by build.
 */

const BUILD = /^\d{4}-\d{2}-\d{2}\.\d{1,4}$/;
const MAX_MESSAGE = 300;
const MAX_STACK = 1500;
const MAX_SOURCE = 120;
const KINDS = new Set(['error', 'unhandledrejection']);

export interface ClientError {
  readonly build: string;
  readonly kind: string;
  readonly message: string;
  readonly source: string;
  readonly line: number;
  readonly col: number;
  readonly stack: string;
}

/** `https://host/js/a/b.js?v=3#x` becomes `b.js`; text with no URL is returned as it was. */
function bareFile(text: string): string {
  return text.replace(/https?:\/\/[^\s)'"]+/g, (url) => {
    // Stack frames end in ":line:col"; keep those, drop the host, the folders and any query.
    const where = /(?::\d+){1,2}$/.exec(url)?.[0] ?? '';
    const path = (where ? url.slice(0, -where.length) : url).split(/[?#]/)[0] ?? '';
    return (path.slice(path.lastIndexOf('/') + 1) || 'page') + where;
  });
}

const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e7 ? Math.floor(v) : 0);

/** The report as it will be logged, or null when it has no message at all. Reads only the named fields. */
export function cleanClientError(raw: unknown): ClientError | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.message !== 'string' || r.message.trim() === '') return null;
  return {
    build: typeof r.build === 'string' && BUILD.test(r.build) ? r.build : 'unknown',
    kind: typeof r.kind === 'string' && KINDS.has(r.kind) ? r.kind : 'error',
    message: bareFile(r.message).slice(0, MAX_MESSAGE),
    source: typeof r.source === 'string' ? bareFile(r.source).slice(0, MAX_SOURCE) : '',
    line: int(r.line),
    col: int(r.col),
    stack: typeof r.stack === 'string' ? bareFile(r.stack).slice(0, MAX_STACK) : '',
  };
}

/**
 * At most `limit` reports are logged in any `windowMs`. A loop that throws on every frame would
 * otherwise turn the log into the thing that fills the disk. The first refusal in a window is
 * reported so the log says it happened; the rest are silent.
 */
export class ClientErrorBudget {
  private windowStart = 0;
  private used = 0;
  private told = false;
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 30, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  take(now: number = Date.now()): 'ok' | 'first_refusal' | 'refused' {
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.used = 0;
      this.told = false;
    }
    if (this.used < this.limit) {
      this.used += 1;
      return 'ok';
    }
    if (!this.told) {
      this.told = true;
      return 'first_refusal';
    }
    return 'refused';
  }
}
