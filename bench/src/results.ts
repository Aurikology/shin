/**
 * Writing results. A result file is never overwritten: every run gets its own
 * name (date, time, and a short hash of the content), and the write uses the
 * exclusive flag, so a same-day rerun cannot erase a record that a sealed
 * batch was opened.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function resultName(prefix: string, body: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const hash = createHash('sha256').update(body).update(String(now.getTime())).update(String(process.pid)).digest('hex').slice(0, 8);
  return `${prefix}-${stamp}-${hash}.json`;
}

/** Writes `obj` as a new file under `dir` and returns its path. Throws rather than overwrite. */
export function writeResult(dir: string, prefix: string, obj: unknown, now = new Date()): string {
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(obj, null, 2) + '\n';
  const path = join(dir, resultName(prefix, body, now));
  writeFileSync(path, body, { flag: 'wx' });
  return path;
}
