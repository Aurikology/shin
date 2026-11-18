// mac/expiry-check.mjs
//
// R66 + R69: the monthly "what is about to expire" check. Prints the days left on
//   - the code-signing certificate(s) in the keychain (Apple Distribution / Development)
//   - every provisioning profile (newest copy of each name)
//   - Tailscale's node key for this Mac (an expired key silently drops the Mac off the tailnet)
//   - the App Store Connect API key (see the caveat below: Apple gives it no expiry date)
// and goes LOUD (health marker `certs` fails, mail once) when anything is under 30 days or expired.
//
//   node mac/expiry-check.mjs                 run, write the `certs` health marker
//   node mac/expiry-check.mjs --dry-run       print only: no marker, no mail, no network call
//   node mac/expiry-check.mjs --warn-days 45  change the 30-day threshold
//
// Run monthly (1st, 09:00) by the com.shin.expiry LaunchDaemon. The fix-watch lane treats
// certs.json older than 40 days as "the monthly check stopped running".
//
// What "unknown" means: a thing the script could not read (no certificate in a locked keychain, no
// App Store Connect key configured, Tailscale not installed) is printed as UNKNOWN and written into
// the marker's detail, but does not turn the marker red: a Mac that has no Tailscale would otherwise
// be red forever. Read the UNKNOWN lines once, after install, and decide whether each is expected.
//
// Caveats, stated plainly:
//  * App Store Connect API keys have no expiry date (Apple lists none in the portal or the API; as
//    far as I can tell they stay valid until a person revokes them). The honest check is "does Apple
//    still accept this key", one authenticated GET. A 401 is reported as EXPIRED (revoked or wrong).
//  * `security find-certificate` reads the login keychain. In a LaunchDaemon with nobody logged in that
//    keychain can be locked, which shows up as "no signing certificate found" (UNKNOWN). The same
//    script run from a Terminal on the Mac, or by hand with `sudo -u worker`, gives the true answer.
//  * Provisioning profiles are read from ~/Library/MobileDevice/Provisioning Profiles and the Xcode 16
//    location ~/Library/Developer/Xcode/UserData/Provisioning Profiles.

import { createPrivateKey, sign, X509Certificate } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { record } from './lib/health.mjs';

const DAY = 86400e3;
const SIGNING = /Apple (Distribution|Development)|iPhone (Distribution|Developer)|Developer ID|Mac Developer|3rd Party Mac/i;

export const daysLeft = (expires, now = Date.now()) => Math.floor((expires - now) / DAY);

export function classify(days, warnDays = 30) {
  if (days < 0) return 'expired';
  return days < warnDays ? 'warn' : 'ok';
}

/** Signing certificates in a block of PEM text: [{label, expires}], de-duplicated by fingerprint. */
export function certExpiries(pemText) {
  const out = [];
  const seen = new Set();
  const blocks = String(pemText ?? '').match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  for (const b of blocks) {
    let c;
    try {
      c = new X509Certificate(b);
    } catch {
      continue;
    }
    if (seen.has(c.fingerprint256)) continue;
    seen.add(c.fingerprint256);
    const cn = /CN=([^\n]+)/.exec(c.subject)?.[1]?.trim() ?? c.subject.replace(/\n/g, ', ');
    if (!SIGNING.test(cn)) continue;
    out.push({ label: cn, expires: Date.parse(c.validTo) });
  }
  return out;
}

/** A .mobileprovision is a signed blob with a plain-text plist inside; read Name and ExpirationDate from it. */
export function profileExpiry(buf) {
  const text = Buffer.from(buf).toString('latin1');
  const name = /<key>Name<\/key>\s*<string>([^<]*)<\/string>/.exec(text)?.[1];
  const date = /<key>ExpirationDate<\/key>\s*<date>([^<]*)<\/date>/.exec(text)?.[1];
  const expires = date ? Date.parse(date) : NaN;
  if (!name || Number.isNaN(expires)) return null;
  return { name, expires };
}

/** From `tailscale status --json`: a key expiry, "disabled" (never expires), or "unknown". */
export function tailscaleExpiry(status) {
  if (!status || status.BackendState !== 'Running' || !status.Self) return { state: 'unknown' };
  const k = status.Self.KeyExpiry;
  if (!k || String(k).startsWith('0001-')) return { state: 'disabled' };
  const t = Date.parse(k);
  return Number.isNaN(t) ? { state: 'unknown' } : { state: 'date', expires: t };
}

/** The ES256 token App Store Connect wants: 20 minutes at most, audience appstoreconnect-v1. */
export function ascJwt({ keyId, issuerId, pem, now = Math.floor(Date.now() / 1000) }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const body = b64({ iss: issuerId, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}

const defaultExec = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 30e3, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return null;
  }
};

function profileDirs(home) {
  return [join(home, 'Library', 'MobileDevice', 'Provisioning Profiles'), join(home, 'Library', 'Developer', 'Xcode', 'UserData', 'Provisioning Profiles')];
}

function findAscKey(home, env) {
  const id = env.SHIN_ASC_KEY_ID;
  if (!id) return null;
  const candidates = [
    env.SHIN_ASC_KEY_FILE,
    join(home, '.appstoreconnect', 'private_keys', `AuthKey_${id}.p8`),
    join(home, 'private_keys', `AuthKey_${id}.p8`),
    join(home, '.private_keys', `AuthKey_${id}.p8`),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function ascCheck({ home, env, fetchImpl }) {
  if (!env.SHIN_ASC_KEY_ID || !env.SHIN_ASC_ISSUER_ID) return { unknown: 'App Store Connect key (SHIN_ASC_KEY_ID / SHIN_ASC_ISSUER_ID not set in config.env)' };
  const file = findAscKey(home, env);
  if (!file) return { unknown: `App Store Connect key (AuthKey_${env.SHIN_ASC_KEY_ID}.p8 not found)` };
  let token;
  try {
    token = ascJwt({ keyId: env.SHIN_ASC_KEY_ID, issuerId: env.SHIN_ASC_ISSUER_ID, pem: readFileSync(file, 'utf8') });
  } catch (e) {
    return { unknown: `App Store Connect key (cannot read ${file}: ${String(e.message).slice(0, 80)})` };
  }
  try {
    const res = await fetchImpl('https://api.appstoreconnect.apple.com/v1/apps?limit=1', { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20e3) });
    if (res.status === 200) return { item: { kind: 'asc', label: `App Store Connect key ${env.SHIN_ASC_KEY_ID} (Apple shows no expiry date; accepted today)`, days: null, status: 'ok' } };
    if (res.status === 401 || res.status === 403) return { item: { kind: 'asc', label: `App Store Connect key ${env.SHIN_ASC_KEY_ID} REJECTED by Apple (HTTP ${res.status}: revoked, wrong issuer id, or role removed)`, days: null, status: 'expired' } };
    return { unknown: `App Store Connect key (Apple answered HTTP ${res.status})` };
  } catch (e) {
    return { unknown: `App Store Connect key (could not reach Apple: ${e.name})` };
  }
}

/**
 * Everything, in one pass. Returns { ok, items, unknown, detail }. `ok` is false when any item is
 * warn or expired. Writes the `certs` marker unless dryRun.
 */
export async function runChecks({
  home = homedir(), env = process.env, now = Date.now(), exec = defaultExec, offline = false, dryRun = false,
  warnDays = 30, tailscaleBin, fetchImpl = fetch,
} = {}) {
  const items = [];
  const unknown = [];
  const add = (kind, label, expires) => {
    const days = daysLeft(expires, now);
    items.push({ kind, label, expires, days, status: classify(days, warnDays) });
  };

  // signing certificates
  const pem = exec('security', ['find-certificate', '-a', '-p']);
  const certs = pem ? certExpiries(pem) : [];
  if (!certs.length) unknown.push('signing certificate (none readable in the keychain; a locked keychain looks the same)');
  for (const c of certs) add('certificate', c.label, c.expires);

  // provisioning profiles: newest copy of each name, so an old superseded copy never alarms
  const newest = new Map();
  for (const dir of profileDirs(home)) {
    let files = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.mobileprovision') || f.endsWith('.provisionprofile'));
    } catch {}
    for (const f of files) {
      try {
        const p = profileExpiry(readFileSync(join(dir, f)));
        if (p && (!newest.has(p.name) || p.expires > newest.get(p.name))) newest.set(p.name, p.expires);
      } catch {}
    }
  }
  if (!newest.size) unknown.push('provisioning profile (none found under Library/MobileDevice or Xcode UserData)');
  for (const [name, expires] of newest) add('profile', `profile ${name}`, expires);

  // Tailscale
  const tsBin = tailscaleBin || env.TAILSCALE_BIN || '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
  const tsOut = exec(tsBin, ['status', '--json']);
  let ts = { state: 'unknown' };
  try {
    ts = tailscaleExpiry(tsOut ? JSON.parse(tsOut) : null);
  } catch {}
  if (ts.state === 'date') add('tailscale', 'Tailscale node key (re-authenticate, or disable key expiry in the admin console)', ts.expires);
  else if (ts.state === 'disabled') items.push({ kind: 'tailscale', label: 'Tailscale node key: expiry is disabled (never expires)', days: null, status: 'ok' });
  else unknown.push('Tailscale key expiry (tailscale not running here, or not readable by this account)');

  // App Store Connect
  if (offline) unknown.push('App Store Connect key (offline run)');
  else {
    const a = await ascCheck({ home, env, fetchImpl });
    if (a.item) items.push(a.item);
    else unknown.push(a.unknown);
  }

  const bad = items.filter((i) => i.status !== 'ok');
  const ok = bad.length === 0;
  const detail = ok
    ? `all ${items.length} item(s) over ${warnDays} days${unknown.length ? `; unreadable: ${unknown.length}` : ''}`
    : bad.map((i) => (i.days == null ? i.label : `${i.label}: ${i.days < 0 ? `EXPIRED ${-i.days} day(s) ago` : `${i.days} day(s) left`}`)).join('; ');
  if (!dryRun) record({ job: 'certs', ok, detail, env });
  return { ok, items, unknown, detail };
}

export function formatLine(i) {
  const when = i.expires ? new Date(i.expires).toISOString().slice(0, 10) : '          ';
  const left = i.days == null ? '' : i.days < 0 ? `EXPIRED ${-i.days} days ago` : `${i.days} days left`;
  return `  ${i.status === 'ok' ? 'ok     ' : i.status === 'warn' ? 'SOON   ' : 'EXPIRED'} ${when} ${left.padEnd(18)} ${i.label}`;
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const wi = argv.indexOf('--warn-days');
  const warnDays = wi >= 0 ? Number(argv[wi + 1]) || 30 : 30;
  const r = await runChecks({ dryRun, offline: dryRun, warnDays });
  console.log(`expiry-check${dryRun ? ' (dry run: no marker, no network)' : ''}: threshold ${warnDays} days`);
  for (const i of r.items) console.log(formatLine(i));
  for (const u of r.unknown) console.log(`  UNKNOWN ${u}`);
  console.log(r.ok ? 'expiry-check: OK' : `expiry-check: LOUD, ${r.detail}`);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((c) => {
    process.exitCode = c;
  });
}
