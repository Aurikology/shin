/**
 * category-line -- the one session-start line that carries a category fault to a
 * place a person sees (docs/category-safeguards-2026-10-08.md; ruling widened
 * 2026-10-08: a fault must reach the chat reply or the next session's start
 * message, never only a log).
 *
 * It reads two files on this machine and nothing else:
 *   category-check-last.json  beside the catalogue db: the last load-check run
 *                             (exit status, the counts, the baseline, the time)
 *   category-faults.json      in the server's data dir: serve-time faults
 *                             ({ total, faults: [{ kind, barcode, at }] })
 *
 * It returns ONE line, or null when there is nothing to say:
 *   - a missing file says nothing (no run yet, no server data here);
 *   - an unreadable file says that it is unreadable;
 *   - a last check that failed, or any count above its baseline, is said every
 *     session until the next run fixes it;
 *   - serve-time faults are said once per batch: the number already told is kept
 *     in category-faults-seen.json beside the faults file (the data dir is
 *     machine-local and never committed), so the next session only hears new ones.
 *
 * Never throws. No network.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function uniq(paths) {
  return [...new Set(paths.filter(Boolean).map((p) => resolve(p)))];
}

/** Read a JSON file. { missing: true } when absent, { error } when unreadable, else { value }. */
function readJson(file) {
  if (!existsSync(file)) return { missing: true };
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

const COUNT_KEYS = ['A1', 'A2', 'A3', 'A4', 'A6', 'A7'];

function checkPiece(file) {
  const r = readJson(file);
  if (r.missing) return null;
  if (r.error) return `${file} is unreadable (${r.error})`;
  const v = r.value;
  if (!v || typeof v !== 'object' || typeof v.exit !== 'number') return `${file} is unreadable (no exit status in it)`;
  const when = typeof v.at === 'string' ? v.at.slice(0, 10) : 'unknown date';
  if (v.exit !== 0) {
    const first = Array.isArray(v.failures) && v.failures.length > 0 ? `: ${String(v.failures[0]).slice(0, 120)}` : '';
    return `the last category load check FAILED (exit ${v.exit}, ${when})${first}`;
  }
  const over = [];
  if (v.counts && v.baseline) {
    for (const k of COUNT_KEYS) {
      if (typeof v.counts[k] === 'number' && typeof v.baseline[k] === 'number' && v.counts[k] > v.baseline[k]) over.push(`${k} ${v.counts[k]} over ${v.baseline[k]}`);
    }
  } else {
    return `${file} is unreadable (exit 0 but no counts or baseline in it)`;
  }
  return over.length > 0 ? `the last category load check (${when}) has counts above baseline: ${over.join(', ')}` : null;
}

function faultsPiece(file, writeState) {
  const r = readJson(file);
  if (r.missing) return null;
  if (r.error) return `${file} is unreadable (${r.error})`;
  const v = r.value;
  if (!v || typeof v !== 'object' || typeof v.total !== 'number' || !Array.isArray(v.faults)) return `${file} is unreadable (unexpected shape)`;
  const marker = join(dirname(file), 'category-faults-seen.json');
  const m = readJson(marker);
  const seen = m.value && typeof m.value.total === 'number' ? m.value.total : 0;
  if (v.total === seen) return null;
  // A total below the one already told means the file was started again: everything in it is new.
  const fresh = v.total > seen ? v.total - seen : v.total;
  const last = v.faults[v.faults.length - 1];
  const latest = last ? `, latest ${last.kind} ${last.barcode} at ${String(last.at).slice(0, 16)}` : '';
  if (writeState) {
    try {
      writeFileSync(marker, JSON.stringify({ total: v.total, told: new Date().toISOString() }));
    } catch {
      // Not recorded as told: the next session says it again, which is the safe direction.
    }
  }
  return `${fresh} new serve-time category fault${fresh === 1 ? '' : 's'} (${file})${latest}`;
}

/**
 * The line for this machine, or null.
 * @param {{ root: string, env?: Record<string,string|undefined>, writeState?: boolean }} o
 */
export function categoryLine({ root, env = process.env, writeState = true }) {
  try {
    const dbDirs = uniq([env.SHIN_CATALOGUE ? dirname(env.SHIN_CATALOGUE) : null, join(root, 'catalogue', 'data')]);
    const dataDirs = uniq([env.SHIN_DATA_DIR, join(root, 'app', 'data'), join(root, 'data')]);
    const pieces = [];
    for (const d of dbDirs) {
      const p = checkPiece(join(d, 'category-check-last.json'));
      if (p) pieces.push(p);
    }
    for (const d of dataDirs) {
      const p = faultsPiece(join(d, 'category-faults.json'), writeState);
      if (p) pieces.push(p);
    }
    if (pieces.length === 0) return null;
    return `- **CATEGORY FAULT: ${pieces.join('; ')}.** Tell him in your first reply.`;
  } catch (err) {
    return `- CATEGORY FAULT check could not run: ${err instanceof Error ? err.message : String(err)}`;
  }
}
