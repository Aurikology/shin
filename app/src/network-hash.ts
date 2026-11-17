/**
 * The network a request came from, as a salted hash, for the checks that ask "do these phones come from more than
 * one place" (typed prices, learned picks, the typed-name pool: security findings F1, F3, F10, 2026-11-16).
 *
 * The address comes from `clientAddress` (rate-limit.ts), which believes `cf-connecting-ip` only on a connection
 * from this machine (the Cloudflare tunnel). The network is the IPv4 /24 or IPv6 /48 (`networkHash` in
 * price/src/shopper-prices.ts); only the hash is stored, never the address. The salt is a server-side secret:
 * `SHIN_NETWORK_SALT`, or when that is unset a random one made once and kept in `<SHIN_DATA_DIR>/network-salt`
 * (mode 600), so a restart does not turn one network into two. If neither can be had the hash is null, which
 * counts as "no evidence of a network" (the checks then refuse), and the fault is logged once, loudly.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IncomingHttpHeaders } from 'node:http';
import * as settings from '../../settings/src/index.ts';
import { networkHash } from '../../price/src/shopper-prices.ts';
import { clientAddress } from './rate-limit.ts';

const cached = new Map<string, string>();
let faultLogged = false;

function saltFilePath(env: NodeJS.ProcessEnv): string {
  return join(settings.SHIN_DATA_DIR(env)?.trim() || join(process.cwd(), 'data'), 'network-salt');
}

/** The salt, or null when there is none and none can be made. */
export function networkSalt(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = settings.SHIN_NETWORK_SALT(env)?.trim();
  if (fromEnv) return fromEnv;
  const path = saltFilePath(env);
  const hit = cached.get(path);
  if (hit) return hit;
  try {
    if (existsSync(path)) {
      const stored = readFileSync(path, 'utf8').trim();
      if (stored.length >= 16) {
        cached.set(path, stored);
        return stored;
      }
    }
    const made = randomBytes(32).toString('hex');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${made}\n`, { mode: 0o600 });
    cached.set(path, made);
    return made;
  } catch (err) {
    if (!faultLogged) {
      faultLogged = true;
      console.error(`[network-hash-fault] no salt: set SHIN_NETWORK_SALT or make ${path} writable; typed prices and picks cannot count until then (${err instanceof Error ? err.message : String(err)})`);
    }
    return null;
  }
}

/** The hash of the network a request came from, or null. */
export function requestNetworkHash(
  headers: IncomingHttpHeaders,
  socketAddress: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return networkHash(clientAddress(headers, socketAddress), networkSalt(env));
}
