/**
 * Daily caps on the two things an open door lets a stranger do: spend the month's Claude budget, and
 * write prices into the pool other shoppers read (legal review 2026-11-26, N7: the Android build's
 * invite word gates nothing, so the only real limits are per phone and per address).
 *
 * TWO KINDS, each counted per phone (the `x-shin-device` id, or the device a price body names) and per
 * address (an IPv4 address or an IPv6 /64, `addressKey`):
 *
 *   claude   an answer that needed a Claude call      40 per phone per day, 100 per address per day
 *   price    a typed price or correction submitted    60 per phone per day, 300 per address per day
 *
 * Set by environment (src/../settings): SHIN_CAP_CLAUDE_DEVICE_PER_DAY, SHIN_CAP_CLAUDE_IP_PER_DAY,
 * SHIN_CAP_PRICE_DEVICE_PER_DAY, SHIN_CAP_PRICE_IP_PER_DAY. A value that is not a whole number above
 * zero falls back to its default, so a typo cannot switch a cap off.
 *
 * A phone id is whatever the phone says, so a script can invent one per request: the address cap is the
 * one that catches that. Neither is a login. In memory, like src/rate-limit.ts: a restart forgets the
 * counts, and the monthly dollar cap (identify/src/range-ask-store.ts) is the number the bill follows.
 *
 * The refusal is a 429 with Retry-After (the apps already handle a 429 on these routes); the first time
 * a key trips on a given day, one line goes to the server log, then no more for that key that day.
 */
import * as settings from '../../settings/src/index.ts';
import { KeyedLimiter } from './rate-limit.ts';

export type CapKind = 'claude' | 'price';
export type CapScope = 'device' | 'address';

export interface CapLimits {
  readonly claudeDevice: number;
  readonly claudeAddress: number;
  readonly priceDevice: number;
  readonly priceAddress: number;
}

export const CAP_DEFAULTS: CapLimits = { claudeDevice: 40, claudeAddress: 100, priceDevice: 60, priceAddress: 300 };

const DAY_MS = 24 * 60 * 60 * 1000;

function whole(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function capLimits(env: NodeJS.ProcessEnv = process.env): CapLimits {
  return {
    claudeDevice: whole(settings.SHIN_CAP_CLAUDE_DEVICE_PER_DAY(env), CAP_DEFAULTS.claudeDevice),
    claudeAddress: whole(settings.SHIN_CAP_CLAUDE_IP_PER_DAY(env), CAP_DEFAULTS.claudeAddress),
    priceDevice: whole(settings.SHIN_CAP_PRICE_DEVICE_PER_DAY(env), CAP_DEFAULTS.priceDevice),
    priceAddress: whole(settings.SHIN_CAP_PRICE_IP_PER_DAY(env), CAP_DEFAULTS.priceAddress),
  };
}

export interface CapRefusal {
  readonly kind: CapKind;
  readonly scope: CapScope;
  readonly limit: number;
  readonly retryAfterSeconds: number;
}

export class DailyCaps {
  readonly limits: CapLimits;
  readonly #limiters: Record<`${CapKind}:${CapScope}`, KeyedLimiter>;
  readonly #logged = new Set<string>();
  #loggedDay = '';
  readonly #log: (line: string) => void;

  constructor(env: NodeJS.ProcessEnv = process.env, log: (line: string) => void = (line) => console.log(line)) {
    this.limits = capLimits(env);
    this.#log = log;
    const day = (limit: number, name: string) => new KeyedLimiter([{ ms: DAY_MS, limit }], name);
    this.#limiters = {
      'claude:device': day(this.limits.claudeDevice, 'cap-claude-device'),
      'claude:address': day(this.limits.claudeAddress, 'cap-claude-address'),
      'price:device': day(this.limits.priceDevice, 'cap-price-device'),
      'price:address': day(this.limits.priceAddress, 'cap-price-address'),
    };
  }

  /**
   * Counts one use against the phone and the address and says whether it may go ahead. `device` is null
   * for a caller with no usable phone id (only the address is counted). Returns the refusal or null.
   * A refused use is not counted, so hammering does not push the release time away.
   */
  use(kind: CapKind, device: string | null, address: string, now: number = Date.now()): CapRefusal | null {
    if (device !== null) {
      const d = this.#limiters[`${kind}:device`].check(`device:${device}`, now);
      if (!d.allowed) return this.#tripped(kind, 'device', device, d.retryAfterSeconds, now);
    }
    const a = this.#limiters[`${kind}:address`].check(`ip:${address}`, now);
    if (!a.allowed) return this.#tripped(kind, 'address', address, a.retryAfterSeconds, now);
    return null;
  }

  #tripped(kind: CapKind, scope: CapScope, who: string, retryAfterSeconds: number, now: number): CapRefusal {
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.#loggedDay) {
      this.#loggedDay = day;
      this.#logged.clear();
    }
    const key = `${kind}:${scope}:${who}`;
    const limit = scope === 'device' ? (kind === 'claude' ? this.limits.claudeDevice : this.limits.priceDevice) : kind === 'claude' ? this.limits.claudeAddress : this.limits.priceAddress;
    if (!this.#logged.has(key) && this.#logged.size < 10_000) {
      this.#logged.add(key);
      // A phone id is shortened: the line says which kind of caller, not the whole identifier.
      const shown = scope === 'device' ? `${who.slice(0, 8)}...` : who;
      this.#log(`[daily-cap] ${kind} cap of ${limit} a day reached for ${scope} ${shown}; refusing with 429 until it frees`);
    }
    return { kind, scope, limit, retryAfterSeconds };
  }
}

/** The words a 429 from a cap carries. Plain, and no promise about when beyond the number of seconds. */
export function capMessage(kind: CapKind): string {
  return kind === 'claude'
    ? 'Pexi has made its price estimates for this phone today. Try again tomorrow.'
    : 'That is a lot of prices for one day. Try again tomorrow.';
}
