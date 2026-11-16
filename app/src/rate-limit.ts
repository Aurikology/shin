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

import * as settings from '../../settings/src/index.ts';

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
    if (this.#calls.size > MAX_KEYS) this.#shrink(now, longest);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /**
   * Keeps the map bounded, and cheap however many keys a caller invents (security check A7, f6). Quiet
   * keys are swept at most once a minute; if the map is still over the ceiling, the oldest-entered
   * keys go, one per call, so a flood of made-up addresses costs O(1) a request, not a scan of all of them.
   */
  #lastSweep = 0;
  #shrink(now: number, longest: number): void {
    if (now - this.#lastSweep >= 60_000) {
      this.#lastSweep = now;
      for (const [key, times] of this.#calls) {
        if (times.every((t) => now - t >= longest)) this.#calls.delete(key);
      }
    }
    while (this.#calls.size > MAX_KEYS) {
      const oldest = this.#calls.keys().next();
      if (oldest.done) break;
      this.#calls.delete(oldest.value);
    }
  }
}

function envCount(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const TEN_MINUTES = 10 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

/** Per invite code. A code can be on several phones (the family one is), so this is the roomier of the two. */
export function codeWindows(env: NodeJS.ProcessEnv = process.env): Window[] {
  return [
    { ms: TEN_MINUTES, limit: envCount(settings.SHIN_RATE_CODE_PER_10MIN(env), 200) },
    { ms: ONE_DAY, limit: envCount(settings.SHIN_RATE_CODE_PER_DAY(env), 1_500) },
  ];
}

/** Per network address. */
export function addressWindows(env: NodeJS.ProcessEnv = process.env): Window[] {
  return [
    { ms: TEN_MINUTES, limit: envCount(settings.SHIN_RATE_IP_PER_10MIN(env), 90) },
    { ms: ONE_DAY, limit: envCount(settings.SHIN_RATE_IP_PER_DAY(env), 600) },
  ];
}

/**
 * Every API request from one address (Jamin's App Store list, item 4). Far above a phone: the usage
 * queue alone sends a batch every five seconds, and a household or a carrier can share one address.
 * This stops a flood; the paid-call windows above stop spending.
 */
export function doorWindows(env: NodeJS.ProcessEnv = process.env): Window[] {
  return [
    { ms: TEN_MINUTES, limit: envCount(settings.SHIN_RATE_DOOR_IP_PER_10MIN(env), 1_200) },
    { ms: ONE_DAY, limit: envCount(settings.SHIN_RATE_DOOR_IP_PER_DAY(env), 15_000) },
  ];
}

/**
 * Free barcode scans from one address in a day. The free limit is keyed on a device id the phone
 * makes up, so a new id is a new week; this is what a new id cannot reset.
 */
export function freeScanAddressWindows(env: NodeJS.ProcessEnv = process.env): Window[] {
  return [{ ms: ONE_DAY, limit: envCount(settings.SHIN_FREE_SCANS_PER_IP_DAY(env), 30) }];
}

/**
 * True for a request this machine made to itself: a loopback socket with no tunnel header. The
 * tunnel always sets the header, so a shopper never reads as local. A laptop, the suite and the
 * Mac's own health checks are not who these limits are for.
 */
export function isLocalRequest(headers: Record<string, string | string[] | undefined>, socketAddress: string | undefined): boolean {
  if (headers['cf-connecting-ip']) return false;
  return isLoopbackSocket(socketAddress);
}

/** True when the connection itself came from this machine: the tunnel's end of the pipe, or a laptop's own browser. */
export function isLoopbackSocket(socketAddress: string | undefined): boolean {
  return socketAddress === '127.0.0.1' || socketAddress === '::1' || socketAddress === '::ffff:127.0.0.1';
}

/**
 * The network an address sits in: an IPv4 /24 or an IPv6 /64. One bot can rent many addresses next
 * door to each other; the Claude limits count them together (security check A2).
 */
export function networkOf(address: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/i.exec(address);
  if (v4) return `${v4[1]}.0/24`;
  if (address.includes(':')) return `${address.toLowerCase().split(':').slice(0, 4).join(':')}::/64`;
  return address;
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
  // The header is believed only on a connection from this machine (the tunnel). From any other
  // socket it is whatever the caller typed, so the socket address is the only honest answer.
  if (!isLoopbackSocket(socketAddress)) return socketAddress ?? 'unknown';
  const cf = headers['cf-connecting-ip'];
  const forwarded = Array.isArray(cf) ? cf[0] : cf;
  const trimmed = typeof forwarded === 'string' ? forwarded.trim() : '';
  return trimmed !== '' ? trimmed.slice(0, 64) : (socketAddress ?? 'unknown');
}
