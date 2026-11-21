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

/**
 * How many different callers one limiter remembers (R81). It was 5,000, so a day with more phones or
 * addresses than that made the limiter forget the oldest ones and their limits weakened. 100,000 keys
 * is a few tens of MB at worst and far above any day Pexi can have.
 */
const MAX_KEYS = 100_000;

/*
 * REFUSALS, COUNTED (R36). A 429 was invisible: nobody was told a shopper had been turned away. Every
 * refusal a NAMED limiter makes adds to today's count, for the health body to show and an alarm to read.
 * In memory, by UTC day; a restart starts the day's count again.
 */
const refusals = { day: '', total: 0, byName: {} as Record<string, number> };
/** Every refusal since this process started, by limiter name: the watch reads how fast these rise. */
const refusalsSinceStart: Record<string, number> = {};

function countRefusal(name: string, now: number): void {
  refusalsSinceStart[name] = (refusalsSinceStart[name] ?? 0) + 1;
  const day = new Date(now).toISOString().slice(0, 10);
  if (refusals.day !== day) {
    refusals.day = day;
    refusals.total = 0;
    refusals.byName = {};
  }
  refusals.total += 1;
  refusals.byName[name] = (refusals.byName[name] ?? 0) + 1;
}

/** Today's refusals (UTC day) across every limiter, total and by limiter name. For /api/health. */
export function limiterRefusals(): { day: string; total: number; byName: Record<string, number> } {
  return { day: refusals.day || new Date().toISOString().slice(0, 10), total: refusals.total, byName: { ...refusals.byName } };
}

/** Refusals since this process started, by limiter name. Only goes up, so the watch can read its rise. */
export function limiterRefusalsSinceStart(): Record<string, number> {
  return { ...refusalsSinceStart };
}

export class KeyedLimiter {
  readonly #windows: readonly Window[];
  readonly #name: string;
  readonly #calls = new Map<string, number[]>();

  constructor(windows: readonly Window[], name = 'unnamed') {
    this.#windows = windows;
    this.#name = name;
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
        countRefusal(this.#name, now);
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
 * Every API request from one address (Jamin's App Store list, item 4): the HIGH ABUSE CEILING, since
 * 2026-11-18 (R36). A campus, a store's Wi-Fi or a carrier is many honest phones behind one address, so
 * this is five times the old number and no longer the limit a phone meets; the per-phone window
 * (`doorDeviceWindows`) is. The ceiling still stops a script that rotates device ids.
 */
export function doorWindows(env: NodeJS.ProcessEnv = process.env): Window[] {
  return [
    { ms: TEN_MINUTES, limit: envCount(settings.SHIN_RATE_DOOR_IP_PER_10MIN(env), 6_000) },
    { ms: ONE_DAY, limit: envCount(settings.SHIN_RATE_DOOR_IP_PER_DAY(env), 75_000) },
  ];
}

/**
 * Every API request from one phone (its x-shin-device id), the number a single phone meets. Far above
 * a phone: the usage queue alone sends a batch every five seconds. Not a security boundary on its own,
 * since a script can send a new id per request; the address ceiling above catches that.
 */
export function doorDeviceWindows(): Window[] {
  return [
    { ms: TEN_MINUTES, limit: 1_200 },
    { ms: ONE_DAY, limit: 15_000 },
  ];
}

/**
 * Free barcode scans from one address in a day: the high abuse ceiling under the per-phone weekly
 * limit (30 became 150 on 2026-11-18, R36: fifteen first-time phones on one campus address used to hit
 * it). The free limit is keyed on a device id the phone makes up, so a new id is a new week; this is
 * what a new id cannot reset.
 */
export function freeScanAddressWindows(env: NodeJS.ProcessEnv = process.env): Window[] {
  return [{ ms: ONE_DAY, limit: envCount(settings.SHIN_FREE_SCANS_PER_IP_DAY(env), FREE_SCANS_PER_ADDRESS_DAY) }];
}

/*
 * A NEW PHONE ID MUST NOT BE A NEW WEEK (abuse review 2026-11-21, finding 3; gap 48), AND A STORE'S
 * WI-FI MUST NOT TURN SHOPPERS AWAY ON THEIR FIRST SCAN (blind review, finding 6).
 *
 * The two pull against each other: a private browser window and fifty shoppers on one guest Wi-Fi both
 * look like many phone ids on one address. What tells them apart is what the ids DO: someone resetting
 * their week uses up a phone's 10 free scans and then shows up as a brand-new phone on the same
 * address, again and again; shoppers mostly do not use all 10 on their first day. So:
 *
 *   - A phone that used up its free week on an address is a "spent phone" there for a day.
 *   - Once an address has FRESH_ID_SPENT_PHONES spent phones in the last day, a phone id whose first
 *     counted scan is less than a day old ("new today") gets FRESH_ID_FREE_SCANS free scans on that
 *     address, not 10. Its first scans always answer, so a new shopper is never refused on the first.
 *   - Phones older than a day are never touched by this, whatever the address has seen; they meet only
 *     their own weekly limit and the high per-address ceiling below.
 *   - The per-address ceiling on all free scans is high (2,000 a day; was 150) because the rule above
 *     does the work against resets, and the ceiling only has to stop a script.
 *
 * What it costs a reset: about FRESH_ID_FREE_SCANS scans per new private window, with the onboarding
 * each time. What it costs an honest shopper: on an address where three phones used up their week
 * today, a phone installed today gets 3 free scans there until tomorrow (then its full 10 apply, minus
 * what it used). The full fix is a device attestation (Apple App Attest), which one phone cannot mint.
 */
export const FREE_SCANS_PER_ADDRESS_DAY = 2_000;
/**
 * Free scans a day by phones new today, per address: what a script rotating ids one scan at a time can
 * get. Twice the old all-phones ceiling, since established phones no longer use any of it.
 */
export const FREE_SCANS_NEW_PHONES_PER_ADDRESS_DAY = 300;
export function freeScanNewPhoneWindows(): Window[] {
  return [{ ms: ONE_DAY, limit: FREE_SCANS_NEW_PHONES_PER_ADDRESS_DAY }];
}
export const FRESH_ID_SPENT_PHONES = 3;
export const FRESH_ID_FREE_SCANS = 3;
/** How long a phone counts as new, and how long a spent phone marks its address. */
export const FRESH_ID_WINDOW_MS = ONE_DAY;

/** Phones that used up their free week, per address key, over the last day. In memory, bounded. */
export class SpentPhones {
  readonly #byAddress = new Map<string, Map<string, number>>();

  /** Notes that `phone` used up its free week on `address`. */
  note(address: string, phone: string, now: number = Date.now()): void {
    let phones = this.#byAddress.get(address);
    if (!phones) {
      phones = new Map();
      this.#byAddress.set(address, phones);
      if (this.#byAddress.size > MAX_KEYS) {
        const oldest = this.#byAddress.keys().next();
        if (!oldest.done) this.#byAddress.delete(oldest.value);
      }
    }
    phones.delete(phone);
    phones.set(phone, now);
    // Only the count up to the threshold matters; keep a few more than that per address.
    while (phones.size > FRESH_ID_SPENT_PHONES * 4) {
      const oldest = phones.keys().next();
      if (oldest.done) break;
      phones.delete(oldest.value);
    }
  }

  /** How many different phones used up their free week on `address` in the last day. */
  count(address: string, now: number = Date.now()): number {
    const phones = this.#byAddress.get(address);
    if (!phones) return 0;
    for (const [phone, at] of phones) if (now - at >= FRESH_ID_WINDOW_MS) phones.delete(phone);
    if (phones.size === 0) this.#byAddress.delete(address);
    return phones.size;
  }
}

/** The phone id a request names, if it has the shape a phone makes (8 to 64 letters, digits, _ or -), else null. */
export function phoneIdOf(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers['x-shin-device'];
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
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
 * The first four 16-bit groups of an IPv6 address (its /64), written without leading zeros, or null
 * when the text is not an IPv6 address. `::` is expanded first, so 2001:db8::1 and 2001:db8:0:0::2
 * read as the same network (the old split on ':' gave them different keys).
 */
function ipv6Prefix64(address: string): string | null {
  let a = address.trim().toLowerCase();
  const zone = a.indexOf('%');
  if (zone >= 0) a = a.slice(0, zone);
  if (!a.includes(':') || !/^[0-9a-f:.]+$/.test(a)) return null;
  // An embedded IPv4 tail (::1.2.3.4) is the last 32 bits, beyond the /64: drop it to two zero groups.
  if (a.includes('.')) a = a.replace(/[0-9.]+$/, '0:0');
  const halves = a.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] === '' ? [] : halves[0]!.split(':');
  const right = halves.length === 2 && halves[1] !== '' ? halves[1]!.split(':') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...left, ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => '0'), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':');
}

/**
 * The network an address sits in: an IPv4 /24 or an IPv6 /64. One bot can rent many addresses next
 * door to each other; the Claude limits count them together (security check A2).
 */
export function networkOf(address: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/i.exec(address);
  if (v4) return `${v4[1]}.0/24`;
  const v6 = ipv6Prefix64(address);
  if (v6 !== null) return `${v6}::/64`;
  if (address.includes(':')) return `${address.toLowerCase().split(':').slice(0, 4).join(':')}::/64`;
  return address;
}

/**
 * THE KEY EVERY PER-ADDRESS LIMIT COUNTS (abuse review 2026-11-21, finding 2): an IPv4 address as it
 * is, an IPv6 address as its /64. A home, a phone on a carrier, or a rented server is handed a whole
 * /64 and can send from any of its 2^64 addresses, so counting the full IPv6 address let one
 * connection rotate past every limit. An IPv4-mapped address (::ffff:1.2.3.4) is its IPv4 address.
 */
export function addressKey(address: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(address.trim());
  if (v4) return v4[1]!;
  const v6 = ipv6Prefix64(address);
  return v6 !== null ? `${v6}::/64` : address;
}

/**
 * A DAILY BUDGET OF UNITS per key (events written, for example), where one request can spend many
 * units at once. `KeyedLimiter` keeps one timestamp per call, which is the wrong shape for 200 events
 * a request. By UTC day; in memory like the rest of this file; bounded the same way.
 */
export class DailyBudget {
  readonly #limit: number;
  readonly #name: string;
  #day = '';
  readonly #used = new Map<string, number>();

  constructor(limit: number, name: string) {
    this.#limit = limit;
    this.#name = name;
  }

  /** How many of the `want` units `key` may spend now (0 to `want`); the granted ones are counted. */
  take(key: string, want: number, now: number = Date.now()): number {
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.#day) {
      this.#day = day;
      this.#used.clear();
    }
    const used = this.#used.get(key) ?? 0;
    const granted = Math.max(0, Math.min(want, this.#limit - used));
    if (granted < want) countRefusal(this.#name, now);
    if (granted > 0) {
      this.#used.set(key, used + granted);
      if (this.#used.size > MAX_KEYS) {
        const oldest = this.#used.keys().next();
        if (!oldest.done) this.#used.delete(oldest.value);
      }
    }
    return granted;
  }

  /** Units `key` has left today, without spending any. */
  left(key: string, now: number = Date.now()): number {
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.#day) return this.#limit;
    return Math.max(0, this.#limit - (this.#used.get(key) ?? 0));
  }
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
