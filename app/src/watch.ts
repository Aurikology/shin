/**
 * THE STRICT READING OF /api/health: `watch`.
 *
 * `/api/health` answers `ok: true` whenever the process can serve a shopper, and the phone treats
 * anything else as "down". That is the right rule for the phone and the wrong one for the person
 * who has to act. This module builds the second answer, `watch: { ok, problems }`, which the
 * outside alarm reads (scripts/data-freshness.mjs, the Healthchecks ping from the Mac, the uptime
 * monitor's keyword). It is strict: each state that gives shoppers wrong or empty answers, or that
 * a person must act on, is a named problem with a plain sentence.
 *
 * WHY A SEPARATE FIELD AND NOT ok:false. Readiness lane fix-watch, 2026-11-18. A flipped `ok`
 * would make the phone show "server down" for a Claude cap that only costs shoppers the estimate.
 *
 * TWO LAYERS. `judgeWatch` is pure (the tests drive it with a plain object). `collectWatch` reads
 * the machine: the backup folder, the free disk, the deploy checker's last-seen file, the prices
 * file's source log. Everything it reads is cached for a minute so a busy health route costs one
 * read a minute, not one per request.
 *
 * A reading that cannot be taken is a problem, never a pass: "unknown until something shows it
 * could have found a hit" (agent CLAUDE.md). The one exception is a getter another lane has not
 * landed yet (`revenueCatHealth`), which reads as not yet reporting.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as settings from '../../settings/src/index.ts';
import { freeBytes } from './disk-guard.ts';
import { networkSalt } from './network-hash.ts';
import { HAMMER_IMPORT_REFUSED_KEY } from '../../price/src/hammer-sanity.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const BACKUP_MAX_HOURS = 36;
export const HAMMER_MAX_DAYS = 8;
export const RETENTION_MAX_DAYS = 3;
export const CHECKER_MAX_MINUTES = 15;
export const DEFAULT_MIN_FREE_GB = 10;
export const CATALOGUE_GRACE_SECONDS = 10 * 60;
export const CLAUDE_FAIL_RUN = 20;
export const CLAUDE_CAP_WARN_SHARE = 0.8;
export const REVENUECAT_FAILURES_LIMIT = 3;
/** RevenueCat lookups a buyer-facing budget refused in the last half hour before the watch fails (abuse review finding 6). */
export const REVENUECAT_BUYER_REFUSALS_LIMIT = 5;
/** Requests the limiters refused in the last hour before the watch fails: a flood, or limits set too tight. */
export const REFUSALS_HOUR_LIMIT = 1_000;
export const OPENPRICES_DEFAULT_MAX_DAYS = 60;
/**
 * Gap 84. Client crash reports received in the last hour at or above which the watch raises `client_crash_spike`.
 * There is no measured baseline (Aurik, 2026-11-17: "the app does not crash"; the log has no history to count), so this is
 * set by reasoning: a bad build crashes every phone on a screen, while one person retrying the same broken tap produces a
 * handful of reports (the app already collapses a loop to one report a second and the server logs at most 30 a minute).
 * 20 in an hour is well past one person and low enough that two or three phones on a broken screen trip it within the hour.
 * Re-read after the first week of real counts.
 */
export const CLIENT_CRASH_SPIKE_PER_HOUR = 20;

export interface WatchInputs {
  readonly nowMs: number;
  readonly uptimeSeconds: number;
  readonly catalogueUp: boolean;
  readonly scanLog: boolean;
  /** Scan-log write failures counted in the last hour. */
  readonly scanWriteFaultsRecent: number;
  readonly pricesDb: string;
  readonly claude: {
    readonly capReachedThisMonth: boolean;
    readonly used: number | null;
    readonly cap: number | null;
    readonly recentAnswered: number;
    readonly recentFailed: number;
  };
  /** Null until the money lane's getter exists. `recentBuyerRefusals`: lookups a buyer-facing budget refused, last 30 minutes. */
  readonly revenueCat: { readonly recentFailures: number; readonly recentBuyerRefusals?: number } | null;
  /** Requests the limiters refused in the last hour, by limiter (RevenueCat's own budgets excluded). */
  readonly refusalsLastHour?: Readonly<Record<string, number>>;
  readonly networkSalt: boolean;
  readonly retention: readonly { readonly part: string; readonly lastOkAt: number | null; readonly lastFailure: string | null }[];
  readonly backup: { readonly configured: boolean; readonly newestAt: number | null };
  readonly disk: { readonly freeBytes: number | null; readonly minBytes: number };
  readonly hammer: { readonly refreshedAt: string | null; readonly importRefused: { readonly at: string; readonly why: string } | null };
  readonly sources: readonly { readonly name: string; readonly lastLoadedAt: string | null; readonly maxDays: number }[];
  readonly checker: { readonly lastSeenAt: number | null };
  /** The Mac's unattended jobs (mac/README.md, markers in SHIN_HEALTH_DIR): failing now, or silent past their period. */
  readonly macJobs?: { readonly failed: readonly string[]; readonly stale: readonly string[] };
  /** The Mac's power source (pmset), null off macOS or when unreadable. The Mac ran flat on 2026-11-18: 2 hours down. */
  readonly power?: PowerReading | null;
  /** Client crash reports the server received in the last hour (gap 84). Absent from an older caller: not judged. */
  readonly clientCrashesLastHour?: number;
}

export interface PowerReading {
  readonly onBattery: boolean;
  readonly percent: number | null;
}

export interface WatchProblem {
  readonly code: string;
  readonly why: string;
}
export interface WatchReport {
  readonly ok: boolean;
  readonly problems: readonly WatchProblem[];
}

const gb = (bytes: number) => (bytes / 1e9).toFixed(1);

/** The strict verdict on one set of readings. Pure. */
export function judgeWatch(i: WatchInputs): WatchReport {
  const problems: WatchProblem[] = [];
  const add = (code: string, why: string) => problems.push({ code, why });

  if (!i.catalogueUp && i.uptimeSeconds > CATALOGUE_GRACE_SECONDS) {
    add('catalogue_not_loaded', `The product catalogue is not attached ${Math.round(i.uptimeSeconds / 60)} minutes after the server started, so scans answer "not seen" for everything.`);
  }
  if (!i.scanLog) add('scan_log_not_writing', 'The scan log is not open, so scans are not being recorded.');
  else if (i.scanWriteFaultsRecent > 0) add('scan_log_not_writing', `${i.scanWriteFaultsRecent} scan(s) failed to save in the last hour.`);

  if (i.pricesDb !== 'ok' && i.pricesDb !== 'not_checked') {
    add('prices_file_unusable', `The prices file cannot answer (${i.pricesDb}); every price range falls back to the Claude estimate.`);
  }

  const c = i.claude;
  if (c.capReachedThisMonth) {
    add('claude_cap_reached', 'The monthly Claude estimate cap is reached; shoppers whose product has no shop price get "No price here yet" until the month turns over. Raising the cap costs cents.');
  } else if (c.used !== null && c.cap !== null && c.cap > 0 && c.used / c.cap >= CLAUDE_CAP_WARN_SHARE) {
    add('claude_cap_near', `${c.used} of ${c.cap} monthly Claude estimates used (80 percent or more).`);
  }
  if (c.recentFailed >= CLAUDE_FAIL_RUN && c.recentAnswered === 0) {
    add('claude_account_failing', `The last ${c.recentFailed} Claude calls all failed. Check the Anthropic account: credit balance, card, key, model name.`);
  }

  if (i.revenueCat !== null && i.revenueCat.recentFailures >= REVENUECAT_FAILURES_LIMIT) {
    add('revenuecat_failing', `${i.revenueCat.recentFailures} RevenueCat checks failed recently; paying subscribers may be shown as free.`);
  }
  if (i.revenueCat !== null && (i.revenueCat.recentBuyerRefusals ?? 0) >= REVENUECAT_BUYER_REFUSALS_LIMIT) {
    add('revenuecat_lookups_capped', `${i.revenueCat.recentBuyerRefusals} RevenueCat checks for subscribers or new buyers were skipped in the last 30 minutes because the lookup budget was used up; a shopper who just paid may still see the paywall.`);
  }
  if (i.refusalsLastHour) {
    const total = Object.values(i.refusalsLastHour).reduce((a, b) => a + b, 0);
    if (total >= REFUSALS_HOUR_LIMIT) {
      const top = Object.entries(i.refusalsLastHour).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ');
      add('requests_refused_spike', `${total} requests were refused by the rate limits in the last hour (${top}): a flood, or shoppers being turned away.`);
    }
  }

  if (!i.networkSalt) add('network_salt_missing', 'The network salt is missing or unwritable, so typed prices and picks stop counting.');

  for (const r of i.retention) {
    if (r.lastFailure !== null) {
      add('retention_failing', `The ${r.part.replace('_', ' ')} cleanup failed: ${r.lastFailure}`);
    } else if (r.lastOkAt === null ? i.uptimeSeconds > DAY / 1000 : i.nowMs - r.lastOkAt > RETENTION_MAX_DAYS * DAY) {
      add('retention_stale', `The ${r.part.replace('_', ' ')} cleanup has not completed in over ${RETENTION_MAX_DAYS} days.`);
    }
  }

  if (!i.backup.configured) {
    add('backup_not_checked', 'The server does not know where the backups are kept, so their age cannot be checked.');
  } else if (i.backup.newestAt === null) {
    add('backup_stale', 'No backup copy was found in the backup folder.');
  } else if (i.nowMs - i.backup.newestAt > BACKUP_MAX_HOURS * HOUR) {
    add('backup_stale', `The newest backup is ${Math.round((i.nowMs - i.backup.newestAt) / HOUR)} hours old (limit ${BACKUP_MAX_HOURS}).`);
  }

  if (i.disk.freeBytes === null) add('disk_low', 'The free disk space could not be read.');
  else if (i.disk.freeBytes < i.disk.minBytes) add('disk_low', `${gb(i.disk.freeBytes)} GB free on the data disk (limit ${gb(i.disk.minBytes)} GB).`);

  if (i.hammer.importRefused !== null) {
    add('hammer_import_refused', `This week's Project Hammer prices were refused and last week's kept (${i.hammer.importRefused.at.slice(0, 10)}): ${i.hammer.importRefused.why}`);
  }
  if (i.hammer.refreshedAt === null) {
    add('hammer_never_refreshed', 'The weekly Project Hammer refresh has never finished on the live prices file.');
  } else {
    const t = Date.parse(i.hammer.refreshedAt);
    if (!Number.isFinite(t)) add('hammer_stale', `The Project Hammer refresh date is unreadable (${i.hammer.refreshedAt}).`);
    else if ((i.nowMs - t) / DAY > HAMMER_MAX_DAYS) {
      add('hammer_stale', `The last whole Project Hammer refresh was ${((i.nowMs - t) / DAY).toFixed(1)} days ago (limit ${HAMMER_MAX_DAYS}).`);
    }
  }

  for (const s of i.sources) {
    if (s.maxDays <= 0) continue;
    const t = s.lastLoadedAt === null ? NaN : Date.parse(s.lastLoadedAt);
    if (!Number.isFinite(t)) add('source_stale', `No load of ${s.name} prices is recorded.`);
    else if ((i.nowMs - t) / DAY > s.maxDays) add('source_stale', `${s.name} prices were last loaded ${Math.round((i.nowMs - t) / DAY)} days ago (limit ${s.maxDays}).`);
  }

  if (i.checker.lastSeenAt === null) {
    if (i.uptimeSeconds > 30 * 60) add('deploy_checker_silent', 'The deploy checker has never reported in, so a fix could not be shipped.');
  } else if (i.nowMs - i.checker.lastSeenAt > CHECKER_MAX_MINUTES * 60_000) {
    add('deploy_checker_silent', `The deploy checker was last seen ${Math.round((i.nowMs - i.checker.lastSeenAt) / 60_000)} minutes ago (limit ${CHECKER_MAX_MINUTES}).`);
  }

  for (const job of i.macJobs?.failed ?? []) add('mac_job_failed', `The Mac job "${job}" failed its last run.`);
  for (const job of i.macJobs?.stale ?? []) add('mac_job_stale', `The Mac job "${job}" has not reported within its period.`);

  if (i.power?.onBattery) {
    const left = i.power.percent === null ? '' : ` (${i.power.percent}% left)`;
    add('mac_on_battery', `The Mac is running on battery${left}. Plug it in: when the battery runs out, Pexi goes down.`);
  }

  const crashes = i.clientCrashesLastHour ?? 0;
  if (crashes >= CLIENT_CRASH_SPIKE_PER_HOUR) {
    add('client_crash_spike', `${crashes} app crash reports in the last hour (alarm at ${CLIENT_CRASH_SPIKE_PER_HOUR}). A build is probably broken on some screen: search the server log for client.js_error and group by build.`);
  }

  return { ok: problems.length === 0, problems };
}

/**
 * The problem codes the PUBLIC health body may name (gap 96). The blind review (finding 13) hid the
 * detail because it maps the server's weak moments; that also left the outside alarm with "watch.ok is
 * false and no problems are listed". So the public body says WHICH non-security check failed, as a short
 * code and nothing else: no words, no readings. Anything about keys, accounts, billing, the salt or the
 * rate limits (what a flood attack would want to know) stays on the admin and local body only. A code
 * that is not on this list is never public, so a new check is private until someone adds it here.
 */
export const PUBLIC_PROBLEM_CODES: readonly string[] = [
  'catalogue_not_loaded',
  'scan_log_not_writing',
  'prices_file_unusable',
  'claude_cap_reached',
  'claude_cap_near',
  'retention_failing',
  'retention_stale',
  'backup_not_checked',
  'backup_stale',
  'disk_low',
  'hammer_import_refused',
  'hammer_never_refreshed',
  'hammer_stale',
  'source_stale',
  'deploy_checker_silent',
  'mac_job_failed',
  'mac_job_stale',
  'mac_on_battery',
  'client_crash_spike',
];

/** The allowlisted codes of a report, once each, in the order they were found. Pure. */
export function publicProblemCodes(report: WatchReport): string[] {
  const out: string[] = [];
  for (const p of report.problems) if (PUBLIC_PROBLEM_CODES.includes(p.code) && !out.includes(p.code)) out.push(p.code);
  return out;
}

/* ----------------------------------------------------------- state the server feeds */

export interface Sample {
  readonly at: number;
  readonly total: number;
}

/**
 * How much a counter that only goes up rose inside the last `windowMs`. The baseline is the latest
 * sample taken at or before the window's start; with none, the counter started at zero with the
 * process, so all of it is recent.
 */
export function recentRise(samples: readonly Sample[], totalNow: number, nowMs: number, windowMs: number): number {
  let base = 0;
  for (const s of samples) if (s.at <= nowMs - windowMs) base = s.total;
  return Math.max(0, totalNow - base);
}

/** Keeps a short history of one cumulative counter so a fault that happened once does not fail the alarm for ever. */
export class RisingCounter {
  private samples: Sample[] = [];
  /** Records `total` and returns how much it rose over `windowMs`. */
  sample(total: number, nowMs: number, windowMs: number): number {
    const rise = recentRise(this.samples, total, nowMs, windowMs);
    const last = this.samples[this.samples.length - 1];
    if (!last || nowMs - last.at >= 60_000) this.samples.push({ at: nowMs, total });
    const keepFrom = nowMs - 3 * windowMs;
    while (this.samples.length > 2 && this.samples[1]!.at < keepFrom) this.samples.shift();
    return rise;
  }
}

/** Claude failures that are about the account or the key, as opposed to an answer we could not use or our own limits. */
const ACCOUNT_FAILURES = new Set(['no_api_key', 'model_error', 'circuit_open', 'cap_store_error']);
/** Our own limits and consent: not a sign anything is wrong with the account. */
const NOT_A_CALL = new Set(['monthly_cap_reached', 'daily_cap_reached', 'rate_limited', 'no_claude_consent', 'no_name', 'no_frame', 'unsupported_market']);

/** The last 20 Claude calls, each either answered (the model replied) or failed at the account. */
export class ClaudeOutcomes {
  private ring: boolean[] = [];
  note(result: { ok: boolean; reason?: string }): void {
    if (!result.ok) {
      const reason = result.reason ?? '';
      if (NOT_A_CALL.has(reason)) return;
      this.ring.push(ACCOUNT_FAILURES.has(reason) ? false : true);
    } else this.ring.push(true);
    while (this.ring.length > CLAUDE_FAIL_RUN) this.ring.shift();
  }
  recent(): { recentAnswered: number; recentFailed: number } {
    const answered = this.ring.filter(Boolean).length;
    return { recentAnswered: answered, recentFailed: this.ring.length - answered };
  }
}

/**
 * When each client crash report (`POST /api/client-error`, logged as client.js_error) reached the server. Kept in memory, so a
 * restart forgets it: a spike that is still happening refills within minutes. Bounded, so a flood costs a few KB, not a leak.
 */
export class ClientCrashLog {
  private stamps: number[] = [];
  private static readonly KEEP = 5000;
  note(nowMs: number = Date.now()): void {
    this.stamps.push(nowMs);
    if (this.stamps.length > ClientCrashLog.KEEP) this.stamps.splice(0, this.stamps.length - ClientCrashLog.KEEP);
  }
  lastHour(nowMs: number = Date.now()): number {
    const from = nowMs - HOUR;
    this.stamps = this.stamps.filter((t) => t > from);
    return this.stamps.length;
  }
  size(): number {
    return this.stamps.length;
  }
}

/** When each cleanup last finished well, and what the last failure said. */
export class RetentionMarks {
  private parts = new Map<string, { lastOkAt: number | null; lastFailure: string | null }>();
  constructor(names: readonly string[]) {
    for (const n of names) this.parts.set(n, { lastOkAt: null, lastFailure: null });
  }
  note(part: string, failure: string | null, nowMs: number = Date.now()): void {
    const p = this.parts.get(part) ?? { lastOkAt: null, lastFailure: null };
    if (failure === null) {
      p.lastOkAt = nowMs;
      p.lastFailure = null;
    } else p.lastFailure = failure;
    this.parts.set(part, p);
  }
  snapshot(): { part: string; lastOkAt: number | null; lastFailure: string | null }[] {
    return [...this.parts].map(([part, v]) => ({ part, ...v }));
  }
}

export const claudeOutcomes = new ClaudeOutcomes();
export const retentionMarks = new RetentionMarks(['scan_data', 'request_log']);
export const clientCrashes = new ClientCrashLog();
const scanWriteRise = new RisingCounter();
const revenueCatRise = new RisingCounter();
const revenueCatBuyerRise = new RisingCounter();

/* ----------------------------------------------------------- readings from the machine */

/** The newest backup folder under `dir` (named like 20261118-040001), by its modified time, or null. */
export function newestBackupAt(dir: string): number | null {
  try {
    const names = readdirSync(dir).filter((n) => /^\d{8}-\d{6}$/.test(n));
    let newest: number | null = null;
    for (const n of names) {
      const m = statSync(join(dir, n)).mtimeMs;
      if (newest === null || m > newest) newest = m;
    }
    return newest;
  } catch {
    return null;
  }
}

/** How long each Mac job may stay silent before it counts as stopped (mac/README.md, "Where the health markers are"). */
export const MAC_JOB_MAX_HOURS: Readonly<Record<string, number>> = {
  backup: 36, offsite: 36, integrity: 36, disk: 36, logrotate: 36, 'restore-test': 240, certs: 960,
};

/**
 * The Mac's job markers: `<job>.json` on every run ({job, ok, at, ...}) and `<job>.FAILED` while failing.
 * A job with no .json yet is not installed and is not judged; a missing folder means none are. Never throws.
 */
export function readMacMarkers(dir: string, nowMs: number): { checkerAt: number | null; failed: string[]; stale: string[] } {
  const out = { checkerAt: null as number | null, failed: [] as string[], stale: [] as string[] };
  try {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.FAILED')) out.failed.push(name.slice(0, -'.FAILED'.length));
      if (!name.endsWith('.json')) continue;
      const job = name.slice(0, -'.json'.length);
      let at = NaN;
      try {
        const m = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { at?: unknown; lastCheckAt?: unknown };
        at = Date.parse(String(m.lastCheckAt ?? m.at ?? ''));
      } catch {
        /* unreadable marker: fall back to the file time */
      }
      if (!Number.isFinite(at)) at = statSync(join(dir, name)).mtimeMs;
      if (job === 'checker') out.checkerAt = at;
      const max = MAC_JOB_MAX_HOURS[job];
      if (max !== undefined && nowMs - at > max * 3_600_000) out.stale.push(job);
    }
  } catch {
    /* a folder we cannot read reports nothing rather than breaking health */
  }
  out.failed.sort();
  out.stale.sort();
  return out;
}

/** When the deploy checker last said it was alive: the time inside the file, else the file's own time. Null when there is no file. */
export function checkerSeenAt(file: string): number | null {
  try {
    if (!existsSync(file)) return null;
    const t = Date.parse(readFileSync(file, 'utf8').trim());
    return Number.isFinite(t) ? t : statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

export interface PricesFileReadings {
  readonly importRefused: { at: string; why: string } | null;
  /** Last allowed automated use of each source, from the source log every loader writes to. */
  readonly sourceUse: Record<string, string>;
}

/** What the prices file says about its own loads. Read-only, never throws. */
export function readPricesFileReadings(file: string): PricesFileReadings {
  const empty: PricesFileReadings = { importRefused: null, sourceUse: {} };
  if (!existsSync(file)) return empty;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    let importRefused: PricesFileReadings['importRefused'] = null;
    try {
      const row = db.prepare('SELECT value FROM store_meta WHERE key = ?').get(HAMMER_IMPORT_REFUSED_KEY) as { value: string } | undefined;
      if (row) {
        const parsed = JSON.parse(row.value) as { at?: unknown; why?: unknown };
        if (typeof parsed.at === 'string') importRefused = { at: parsed.at, why: typeof parsed.why === 'string' ? parsed.why : 'no reason recorded' };
      }
    } catch {
      /* no store_meta table or a mark nobody can read: no refusal to report */
    }
    const sourceUse: Record<string, string> = {};
    try {
      const rows = db.prepare('SELECT seller, MAX(used_at) AS at FROM source_use WHERE allowed = 1 GROUP BY seller').all() as unknown as { seller: string; at: string }[];
      for (const r of rows) sourceUse[r.seller] = r.at;
    } catch {
      /* an older file with no source log */
    }
    return { importRefused, sourceUse };
  } catch {
    return empty;
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
}

let cachedReadings: { at: number; file: string; value: PricesFileReadings } | null = null;
function pricesReadings(file: string, nowMs: number): PricesFileReadings {
  if (cachedReadings && cachedReadings.file === file && nowMs - cachedReadings.at < 60_000) return cachedReadings.value;
  const value = readPricesFileReadings(file);
  cachedReadings = { at: nowMs, file, value };
  return value;
}

let cachedBackup: { at: number; dir: string; value: number | null } | null = null;
function backupReading(dir: string, nowMs: number): number | null {
  if (cachedBackup && cachedBackup.dir === dir && nowMs - cachedBackup.at < 60_000) return cachedBackup.value;
  const value = newestBackupAt(dir);
  cachedBackup = { at: nowMs, dir, value };
  return value;
}

/**
 * Reads `pmset -g batt` output: the first line names the source ("Now drawing from 'Battery Power'" or "'AC Power'"),
 * the next carries the charge ("85%;"). Null when the text names neither source.
 */
export function parsePmsetBatt(text: string): PowerReading | null {
  const source = /drawing from '([^']+)'/.exec(text)?.[1];
  if (source === undefined) return null;
  const pct = /(\d{1,3})%/.exec(text)?.[1];
  return { onBattery: /battery/i.test(source), percent: pct === undefined ? null : Number(pct) };
}

let cachedPower: { at: number; value: PowerReading | null } | null = null;
function powerReading(nowMs: number): PowerReading | null {
  if (process.platform !== 'darwin') return null;
  if (cachedPower && nowMs - cachedPower.at < 60_000) return cachedPower.value;
  let value: PowerReading | null = null;
  try {
    value = parsePmsetBatt(execFileSync('/usr/bin/pmset', ['-g', 'batt'], { encoding: 'utf8', timeout: 2000 }));
  } catch {
    // allow-silent-catch: an unreadable power source is "unknown", and the watch keeps every other check
    value = null;
  }
  cachedPower = { at: nowMs, value };
  return value;
}

export type FileVaultState = 'on' | 'off' | 'in_progress';

/** Reads `fdesetup status` output ("FileVault is On." / "FileVault is Off." / "Encryption in progress: ..."). Null when it says none of these. */
export function parseFdesetupStatus(text: string): FileVaultState | null {
  if (/(?:en|de)cryption in progress/i.test(text)) return 'in_progress';
  if (/FileVault is On/i.test(text)) return 'on';
  if (/FileVault is Off/i.test(text)) return 'off';
  return null;
}

/**
 * Whether the Mac's disk is encrypted (gap 83, R08). Information only, not a problem: an unplanned restart with FileVault on
 * waits at the unlock screen, and which state the Mac is in has to be known before that can be planned for. `fdesetup status`
 * needs no sudo. Cached for an hour because it does not change by itself. Null off macOS or when unreadable.
 */
let cachedFileVault: { at: number; value: FileVaultState | null } | null = null;
function fileVaultReading(nowMs: number): FileVaultState | null {
  if (process.platform !== 'darwin') return null;
  if (cachedFileVault && nowMs - cachedFileVault.at < HOUR) return cachedFileVault.value;
  let value: FileVaultState | null = null;
  try {
    value = parseFdesetupStatus(execFileSync('/usr/bin/fdesetup', ['status'], { encoding: 'utf8', timeout: 3000 }));
  } catch {
    // allow-silent-catch: an unreadable FileVault state is "unknown", shown as null; it is information, not a pass or a fail
    value = null;
  }
  cachedFileVault = { at: nowMs, value };
  return value;
}

/** What the money lane's RevenueCat getter reports, read defensively: the export may not exist yet. */
export interface RevenueCatReading {
  readonly failures: number;
  /** Lookups a buyer-facing budget refused since start (scan-quota.ts revenueCatHealth), when reported. */
  readonly buyerRefusals?: number;
}
export function readRevenueCat(mod: unknown): RevenueCatReading | null {
  try {
    const getter = (mod as Record<string, unknown> | null)?.['revenueCatHealth'];
    if (typeof getter !== 'function') return null;
    const r = (getter as () => unknown)();
    const failures = (r as { failures?: unknown } | null)?.failures;
    if (typeof failures !== 'number' || !Number.isFinite(failures)) return null;
    const buyerRefusals = (r as { buyerRefusals?: unknown } | null)?.buyerRefusals;
    return typeof buyerRefusals === 'number' && Number.isFinite(buyerRefusals) ? { failures, buyerRefusals } : { failures };
  } catch {
    return null;
  }
}

/** Limiter names whose refusals are the RevenueCat lookup budget (read on their own, above), not requests turned away. */
const NOT_A_REQUEST_REFUSAL = /^revenuecat-/;
const refusalRises = new Map<string, RisingCounter>();
/** How much each limiter's since-start refusal count rose in the last hour. */
function refusalsInLastHour(sinceStart: Readonly<Record<string, number>>, nowMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, total] of Object.entries(sinceStart)) {
    if (NOT_A_REQUEST_REFUSAL.test(name)) continue;
    let c = refusalRises.get(name);
    if (!c) {
      c = new RisingCounter();
      refusalRises.set(name, c);
    }
    const rise = c.sample(total, nowMs, HOUR);
    if (rise > 0) out[name] = rise;
  }
  return out;
}

export interface CollectDeps {
  readonly nowMs: number;
  readonly startedAt: number;
  readonly catalogueUp: boolean;
  readonly scanLog: boolean;
  readonly customerDataFaults: Record<string, number>;
  readonly pricesDb: string;
  readonly pricesPath: string;
  readonly hammerRefreshedAt: string | null;
  readonly claudeCap: { reached: boolean; since: string | null };
  readonly claudeCalls: { used: number | null; cap: number | null };
  readonly revenueCat: RevenueCatReading | null;
  /** Refusals since start by limiter name (rate-limit.ts limiterRefusalsSinceStart); absent reads as none. */
  readonly refusalsSinceStart?: Readonly<Record<string, number>>;
  readonly env?: NodeJS.ProcessEnv;
}

/** Takes every reading and returns the strict report with the readings behind it. */
export function collectWatch(d: CollectDeps): { watch: WatchReport; readings: Record<string, unknown> } {
  const env = d.env ?? process.env;
  const dataDir = settings.SHIN_DATA_DIR(env)?.trim() || join(process.cwd(), 'data');
  const backupDir = settings.SHIN_BACKUP_DIR(env)?.trim() ?? '';
  const minGb = Number(settings.SHIN_WATCH_MIN_FREE_GB(env));
  const minBytes = (Number.isFinite(minGb) && minGb > 0 ? minGb : DEFAULT_MIN_FREE_GB) * 1e9;
  const opDays = settings.SHIN_WATCH_OPENPRICES_DAYS(env)?.trim();
  const opMax = opDays !== undefined && /^\d+$/.test(opDays) ? Number(opDays) : OPENPRICES_DEFAULT_MAX_DAYS;

  const prices = pricesReadings(d.pricesPath, d.nowMs);
  const free = freeBytes(dataDir);
  const newestBackup = backupDir === '' ? null : backupReading(backupDir, d.nowMs);
  const mac = readMacMarkers(settings.SHIN_HEALTH_DIR(env)?.trim() || join(dataDir, 'health'), d.nowMs);
  const checkerAt = mac.checkerAt ?? checkerSeenAt(join(dataDir, 'checker-seen'));
  const scanFaults = scanWriteRise.sample(d.customerDataFaults['scan_write_failed'] ?? 0, d.nowMs, HOUR);
  const rcRecent =
    d.revenueCat === null
      ? null
      : {
          recentFailures: revenueCatRise.sample(d.revenueCat.failures, d.nowMs, 30 * 60_000),
          ...(d.revenueCat.buyerRefusals !== undefined
            ? { recentBuyerRefusals: revenueCatBuyerRise.sample(d.revenueCat.buyerRefusals, d.nowMs, 30 * 60_000) }
            : {}),
        };
  const refusalsLastHour = d.refusalsSinceStart ? refusalsInLastHour(d.refusalsSinceStart, d.nowMs) : undefined;
  const sinceMonth = d.claudeCap.since === null ? null : new Date(d.claudeCap.since).toISOString().slice(0, 7);
  const capThisMonth = d.claudeCap.reached && sinceMonth === new Date(d.nowMs).toISOString().slice(0, 7);
  const openPricesLast = prices.sourceUse['openprices'] ?? null;
  const power = powerReading(d.nowMs);

  const inputs: WatchInputs = {
    nowMs: d.nowMs,
    uptimeSeconds: Math.round((d.nowMs - d.startedAt) / 1000),
    catalogueUp: d.catalogueUp,
    scanLog: d.scanLog,
    scanWriteFaultsRecent: scanFaults,
    pricesDb: d.pricesDb,
    claude: { capReachedThisMonth: capThisMonth, used: d.claudeCalls.used, cap: d.claudeCalls.cap, ...claudeOutcomes.recent() },
    revenueCat: rcRecent,
    ...(refusalsLastHour ? { refusalsLastHour } : {}),
    networkSalt: networkSalt(env) !== null,
    retention: retentionMarks.snapshot(),
    backup: { configured: backupDir !== '', newestAt: newestBackup },
    disk: { freeBytes: free, minBytes },
    hammer: { refreshedAt: d.hammerRefreshedAt, importRefused: prices.importRefused },
    sources: [{ name: 'openprices', lastLoadedAt: openPricesLast, maxDays: opMax }],
    checker: { lastSeenAt: checkerAt },
    macJobs: { failed: mac.failed, stale: mac.stale },
    power,
    clientCrashesLastHour: clientCrashes.lastHour(d.nowMs),
  };
  return {
    watch: judgeWatch(inputs),
    readings: {
      diskFreeGb: free === null ? null : Number(gb(free)),
      newestBackupAt: newestBackup === null ? null : new Date(newestBackup).toISOString(),
      deployCheckerSeenAt: checkerAt === null ? null : new Date(checkerAt).toISOString(),
      sourcesLoaded: prices.sourceUse,
      claudeRecent: claudeOutcomes.recent(),
      ...(refusalsLastHour ? { refusalsLastHour } : {}),
      power,
      fileVault: fileVaultReading(d.nowMs),
      clientCrashesLastHour: inputs.clientCrashesLastHour,
    },
  };
}
