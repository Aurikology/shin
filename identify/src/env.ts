/*
 * The key lives in a file, not in a shell. Added 2026-09-09.
 *
 * The SDK resolves credentials from the environment and from an OAuth
 * profile, and this machine has neither: the shells this repo is driven
 * from do not inherit a variable set after they started, and nothing here
 * loads dotenv. So the one place a founder can put a key without it
 * touching a chat, a commit or a shell history is a repo-root `.env`, which
 * `.gitignore` already refuses. This reads it once, only for names that are
 * not already set, and never prints a value.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadDotEnv(path = join(REPO_ROOT, '.env')): string[] {
  if (!existsSync(path)) return [];
  const loaded: string[] = [];
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) {
      process.env[name] = value;
      loaded.push(name);
    }
  }
  return loaded;
}
