/**
 * Limits on how often one invite code, or one network address, can make the calls that cost money.
 *
 * WHY THIS EXISTS. The invite code keeps strangers out, and the dollar cap in `identify/src/cap.ts`
 * is the backstop under everything. Between them there was nothing that stopped one person, or one
 * leaked link, from using the whole day's budget alone and locking the other five out. The only
 * per-device ceiling is on the older photo route, and the device id is whatever the phone says it
 * is, so a script can send a new one every time. A code and a network address are the two things a
 * caller cannot make up per request.
 *
 * WHAT IT IS NOT. Not a login and not a security boundary. It is in memory: a restart forgets every
 * count, and it is one process. A limit that needed a database to start would be a reason not to
 * have one. The dollar cap survives restarts and is the number the bill follows.
 *
 * TWO WINDOWS per key, ten minutes and one day, because a burst and a slow drip are different
 * abuses. Defaults are set well above a person shopping (about six scans a minute for ten minutes
 * from one phone is already unusual) and are overridable in the environment.
 */

export interface Window {
  readonly ms: number;
  readonly limit: number;
}

export interface LimiterDecision {
  readonly allowed: boolean;
  /** Seconds until the oldest counted call leaves the window that refused, 0 when allowed. */
  readonly retryAfterSeconds: number;
}

const MAX_KEYS = 5_000;

export class KeyedLimiter {
  readonly #windows: readonly Window[];
  readonly #calls = new Map<string, number[]>();

  constructor(windows: readonly Window[]) {
    this.#windows = windows;
  }

  /**
   * Counts one call for `key` and says whether it may go ahead. A refused call is NOT counted, so a
   * caller who keeps hammering does not push their own release time further away.
   */
  check(key: string, now: number = Date.now()): LimiterDecision {
    const longest = Math.max(...this.#windows.map((w) => w.ms));
    const times = (this.#calls.get(key) ?? []).filter((t) => now - t < longest);
    for (const w of this.#windows) {
      const inside = times.filter((t) => now - t < w.ms);
      if (inside.length >= w.limit) {
        this.#calls.set(key, times);
        const oldest = inside[0] ?? now;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + w.ms - now) / 1000)) };
      }
    }
    times.push(now);
    this.#calls.set(key, times);
    if (this.#calls.size > MAX_KEYS) this.#sweep(now, longest);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Keys that have gone quiet are dropped, so the map cannot grow without bound. */
  #sweep(now: number, longest: number): void {
    for (const [key, times] of this.#calls) {
      if (times.every((t) => now - t >= longest)) this.#calls.delete(key);
    }
  }
}

function envCount(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const TEN_MINUTES = 10 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

/** Per invite code. A code can be on several phones (the family one is), so this is the roomier of the two. */
export function codeWindows(env: NodeJS.ProcessEnv = process.env): Window[] {
  return [
    { ms: TEN_MINUTES, limit: envCount(env, 'SHIN_RATE_CODE_PER_10MIN', 200) },
    { ms: ONE_DAY, limit: envCount(env, 'SHIN_RATE_CODE_PER_DAY', 1_500) },
  ];
}

/** Per network address. */
export function addressWindows(env: NodeJS.ProcessEnv = process.env): Window[] {
  return [
    { ms: TEN_MINUTES, limit: envCount(env, 'SHIN_RATE_IP_PER_10MIN', 90) },
    { ms: ONE_DAY, limit: envCount(env, 'SHIN_RATE_IP_PER_DAY', 600) },
  ];
}

/**
 * The address a request came from.
 *
 * Behind the Cloudflare tunnel every connection reaches this process from the tunnel itself, so the
 * socket address is the same for everybody and only the header Cloudflare sets says who is on the
 * other end. Cloudflare overwrites that header, so a caller going through the tunnel cannot forge
 * it. A caller who reaches this port directly can, which is why the port must not be reachable
 * except through the tunnel, and why the code limit exists as well.
 */
export function clientAddress(headers: Record<string, string | string[] | undefined>, socketAddress: string | undefined): string {
  const cf = headers['cf-connecting-ip'];
  const forwarded = Array.isArray(cf) ? cf[0] : cf;
  const trimmed = typeof forwarded === 'string' ? forwarded.trim() : '';
  return trimmed !== '' ? trimmed.slice(0, 64) : (socketAddress ?? 'unknown');
}
