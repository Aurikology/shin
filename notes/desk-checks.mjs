/**
 * Acceptance checks for the current desk pass, run by scripts/desk-check.mjs.
 * Written BEFORE the lanes start; a lane never edits this file. Rewritten each batch, history in git
 * (batch 2026-11-19 a: audit, replies, register is commit c63563c's version).
 *
 * Batch 2026-11-20 (Aurik's PC): close the storage-audit gaps a phone build can close.
 *   look + language survive a wipe, the look shows on that launch
 *   a big watchlist keeps its newest entries; Past scans keeps its newest scans
 *   the audit's rows say so
 * Not done here: the invite code (the phone app carries it itself; browser beta only), unsent offline work.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const read = (root, p) => readFileSync(join(root, p), 'utf8');
const AUDIT = 'docs/readiness/storage-audit.md';
const row = (audit, key) => audit.split(/\r?\n/).find((l) => l.startsWith('| `' + key + '`')) ?? '';

export const checks = [
  { id: 'gate-typecheck', what: 'app typecheck', cmd: 'npm run typecheck', cwd: 'app' },
  { id: 'gate-test', what: 'app test suite', cmd: 'npm test', cwd: 'app' },
  { id: 'gate-repo', what: 'repo fast checks (hooks, guards)', cmd: 'node scripts/checks.mjs' },
  { id: 'gate-one-source', what: 'no retired wording repeated', cmd: 'node scripts/one-source.mjs' },
  { id: 'gaps-tests', what: 'the five wipe tests written before the fix', cmd: 'node --test test/storage-backup-gaps.test.mjs', cwd: 'app' },
  { id: 'gaps-tests-unchanged', what: 'nobody edited those tests to pass', fn: async ({ root }) => {
    const h = createHash('sha256').update(readFileSync(join(root, 'app/test/storage-backup-gaps.test.mjs'))).digest('hex');
    return { ok: h === '51f5157982ca19e83acdac97729a3ff7cf671fea14f3b009d0304af355b35a9a', evidence: h.slice(0, 12) };
  } },
  { id: 'audit-rows', what: 'audit rows for theme, locale, watchlist, history say backed up', fn: async ({ root }) => {
    const a = read(root, AUDIT);
    const bad = ['shin.theme', 'shin.locale', 'shin.v1.watchlist', 'shin.v1.history'].filter((k) => !/backed up/i.test(row(a, k)));
    return { ok: bad.length === 0, evidence: `not "backed up": ${bad.join(', ') || 'none'}` };
  } },
  { id: 'audit-invite-native', what: 'audit says the invite gap is browser-only', fn: async ({ root }) => {
    const r = row(read(root, AUDIT), 'shin-invite');
    return { ok: /browser/i.test(r) && /SHIN_INVITE_CODE/.test(r), evidence: r.slice(0, 160) };
  } },
  { id: 'no-em-dash', what: 'no em dash in changed or new files', fn: async ({ root }) => {
    const out = execSync('git status --porcelain', { cwd: root }).toString().split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim());
    const bad = out.filter((f) => { try { return readFileSync(join(root, f), 'utf8').includes(String.fromCharCode(0x2014)); } catch { return false; } });
    return { ok: bad.length === 0, evidence: bad.join(', ') || 'none' };
  } },
];
