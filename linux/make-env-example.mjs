// linux/make-env-example.mjs -- writes linux/pexi.env.example from the settings table (settings/src/index.ts),
// so the template can never drift from what the code reads.
//
//   node linux/make-env-example.mjs            rewrite linux/pexi.env.example
//   node linux/make-env-example.mjs --check    exit 1 when the file on disk is out of date
//
// Names only, never a value that is a secret. File format must satisfy BOTH systemd's EnvironmentFile= and
// `. file` in sh (the mac/*.sh jobs source it): one KEY=VALUE per line, no ${VAR} expansion, no spaces around =.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS } from '../settings/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'pexi.env.example');
const D = '/var/lib/pexi';

/** Where each secret comes from. Anything secret in SETTINGS that is not listed gets the generic note. */
const SOURCE = {
  ANTHROPIC_API_KEY: 'the Mac /Users/worker/shin/mac/config.env (same key), or console.anthropic.com > API keys',
  REVENUECAT_SECRET_KEY: 'the Mac config.env, or RevenueCat dashboard > Project settings > API keys (secret key)',
  SHIN_NETWORK_SALT: 'COPY the Mac value. Never make a new one: it would break the continuity of every hashed address',
  SHIN_ADMIN_TOKEN: 'the Mac config.env (same token; the PC scripts use it)',
  SHIN_INVITE_CODE: 'the Mac config.env',
  SHIN_INVITES: 'the Mac config.env (code:label pairs)',
  VOYAGE_API_KEY: 'the Mac config.env, or Voyage AI dashboard',
  BESTBUY_API_KEY: 'the Mac config.env, or developer.bestbuy.com',
  EBAY_CLIENT_SECRET: 'the Mac config.env, or developer.ebay.com keyset',
  SOLDCOMPS_API_KEY: 'the Mac config.env, or the SoldComps account',
};

/** Paths on the new box. Everything else in SETTINGS is written commented out with the code's own default. */
const VALUE = {
  PORT: '4173',
  SHIN_DATA_DIR: D,
  SHIN_CATALOGUE: `${D}/catalogue.db`,
  SHIN_SCANS: `${D}/scans.db`,
  SHIN_CORRECTIONS: `${D}/corrections.db`,
  SHIN_PRICES: `${D}/prices.db`,
  SHIN_GAPS: `${D}/gaps.db`,
  SHIN_REPEAT_CACHE: `${D}/repeat-cache.db`,
  SHIN_USER_CATALOGUE: `${D}/user-catalogue.db`,
  SHIN_PEOPLE_DB: `${D}/people.db`,
  SHIN_PHOTOS: `${D}/photos`,
  SHIN_SHUTTER_DIR: `${D}/shutter`,
  SHIN_ACCESS_LOG: `${D}/access.log`,
  SHIN_SPEND_CAP_STORE_PATH: `${D}/spend-cap.json`,
  SHIN_RANGE_ASK_STORE_PATH: `${D}/range-ask.json`,
  SHIN_PACK_READ_STORE_PATH: `${D}/pack-read.json`,
  SHIN_HEALTH_DIR: `${D}/health`,
  SHIN_BACKUP_DIR: `${D}/backup`,
};

/** Variables the jobs and scripts read that are not rows in SETTINGS. [name, value, note, secret?] */
const EXTRA = [
  ['ANTHROPIC_API_KEY', '', SOURCE.ANTHROPIC_API_KEY, true],
  ['NODE_BIN', '/usr/local/bin/node', 'set by linux/provision.sh', false],
  ['SHIN_REPO_DIR', '/opt/pexi/live', 'the clone the server runs from (the Mac layout: ~/shin-live)', false],
  ['SHIN_TUNNEL_HOSTNAME', 'relay.anjiawenda.com', 'public address; the deploy check reads it (not a secret)', false],
  ['SHIN_DEADMAN_URL', '', 'healthchecks.io check "pexi-server" > its ping URL (docs/readiness/needs-jamin.md)', true],
  ['SHIN_HC_PING_KEY', '', 'healthchecks.io > project Settings > Ping key (one key, one check per failing job: see linux/README.md, Alerts)', true],
  ['SHIN_ALERT_URL', '', 'optional: any HTTPS URL that takes a POST with the text (e.g. an ntfy.sh topic); used as well as Healthchecks', true],
  ['SHIN_HEALTH_MAIL', '', 'leave empty on Linux (the PC-Mac mailbox does not exist here); alerts go over HTTPS', false],
  ['KROGER_CLIENT_ID', '', 'the Mac config.env, or developer.kroger.com > the Pexi app', true],
  ['KROGER_CLIENT_SECRET', '', 'same place as KROGER_CLIENT_ID', true],
  ['SHIN_RESTIC_REPOSITORY', '', 'Jamin picks the off-site target (needs-jamin.md); same value as on the Mac', false],
  ['SHIN_RESTIC_PASSWORD_FILE', '/etc/pexi/restic-password', 'file mode 0600 owned by pexi; the SAME password as the Mac repository, kept in his password manager', false],
  ['RESTIC_BIN', '/usr/bin/restic', 'apt installs it here', false],
  ['RESTIC_PASSWORD', '', 'not needed: the password file is used. Backend keys (B2, S3, ...) go below as the target requires', true],
  ['SHIN_OFFSITE_MAX_AGE_H', '36', 'hours before the off-site copy counts as stale', false],
  ['SHIN_DISK_MIN_GB', '10', 'integrity job fails below this much free disk (75 GB box)', false],
  ['SHIN_REQUEST_LOG', `${D}/privacy/request-log.csv`, 'copy ~/shin-privacy/request-log.csv from the Mac: restores re-run deletions from it', false],
  ['SHIN_INBOX_DIR', `${D}/inbox`, 'where Mac collectors drop price files for the server to ingest (linux/CUTOVER.md, "what stays on the Mac")', false],
  ['SHIN_IMPORT_TOKEN', '', 'make one: openssl rand -hex 32; the same value goes in the Mac collectors\' config as SHIN_IMPORT_TOKEN', true],
  ['SHIN_STAGE_DIR', '/opt/pexi/stage', 'where a commit is tested before it goes live', false],
  ['SHIN_DEPLOY_CHECK_PUBLIC', '0', 'set to 1 at cutover: the deploy check then also requires the public address to show the new process', false],
  ['SHIN_DEPLOY_REMOTE','', 'git URL of the repo the deploy checker pulls main from (read-only deploy key)', false],
];

const clip = (s, n = 118) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

export function render() {
  const out = [];
  out.push('# /etc/pexi/pexi.env -- the one environment file for the Pexi server and every job on the VPS.');
  out.push('#');
  out.push('# Install:  sudo install -m 0600 -o pexi -g pexi linux/pexi.env.example /etc/pexi/pexi.env   then fill the blanks.');
  out.push('# Read by: systemd (EnvironmentFile=) and by the mac/*.sh jobs (`. /etc/pexi/pexi.env`), so keep it plain:');
  out.push('# KEY=VALUE, no ${VAR}, no spaces around =, no export. Mode must stay 0600.');
  out.push('# Generated by linux/make-env-example.mjs from settings/src/index.ts. Do not hand-edit this example; regenerate it.');
  out.push('# Names only: no real value of a secret is ever written here or committed.');
  out.push('');
  out.push('# ---- paths and addresses (set; change only if the layout changes) ----');
  const seen = new Set();
  const emit = (name, value, note, secret) => {
    if (seen.has(name)) return;
    seen.add(name);
    if (note) out.push(`# ${secret ? 'SECRET. ' : ''}${clip(note)}`);
    out.push(`${name}=${value}`);
  };
  for (const [n, v, note, s] of EXTRA.filter((e) => !e[3] && e[1] !== '')) emit(n, v, note, s);
  for (const [name, value] of Object.entries(VALUE)) emit(name, value, '', false);
  out.push('');
  out.push('# ---- secrets (blank here; fill on the server; each says where the value comes from) ----');
  for (const [n, v, note, s] of EXTRA.filter((e) => e[3])) emit(n, v, note, s);
  for (const s of SETTINGS.filter((x) => x.secret)) emit(s.env, '', SOURCE[s.env] ?? 'the Mac config.env (same value)', true);
  out.push('');
  out.push('# ---- optional (the code has its own default; uncomment to override) ----');
  for (const [n, v, note] of EXTRA.filter((e) => !e[3] && e[1] === '')) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(`# ${clip(note)}`);
    out.push(`# ${n}=${v}`);
  }
  for (const s of SETTINGS) {
    if (seen.has(s.env)) continue;
    seen.add(s.env);
    out.push(`# default: ${clip(s.default, 100)}`);
    out.push(`# ${s.env}=`);
  }
  return `${out.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const text = render();
  if (process.argv.includes('--check')) {
    let have = '';
    try { have = readFileSync(OUT, 'utf8'); } catch { /* missing counts as stale */ }
    if (have !== text) {
      console.error('linux/pexi.env.example is out of date: run node linux/make-env-example.mjs');
      process.exit(1);
    }
    console.log('linux/pexi.env.example is current');
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote ${OUT}`);
  }
}
