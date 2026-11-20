/**
 * Acceptance checks for the current desk pass, run by scripts/desk-check.mjs.
 * Written BEFORE the lanes start; a lane never edits this file. Rewritten each batch, history in git.
 *
 * Batch 2026-11-19 (Aurik's PC): the readiness items that need no phone.
 *   R79  storage audit: every stored key has a written fate (backed up, Keychain, server keeps it,
 *        recomputed, or an accepted loss)
 *   R21  restore reply for support, with the lookup steps behind it
 *   R-Q  five French canned replies (success-11: cancel, refund, delete my data, wrong price, not in my store)
 *   FR   French Terms carry the same sections, numbers, prices, dates, links and emails as the English
 *   reg  register rows R14, R44, R79 no longer say "gap" for work already in code
 * Not scriptable (the verifier checks these by hand): R83 calendar reminders exist; French reads naturally.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (root, p) => readFileSync(join(root, p), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;| /g, ' ');
/** Sections of a markdown file keyed by their "## " heading. */
const sections = (md) => Object.fromEntries(md.split(/^## /m).slice(1).map((s) => [s.split('\n')[0].trim().toLowerCase(), s]));

const AUDIT = 'docs/readiness/storage-audit.md';
const REPLIES = 'docs/support/replies.md';
const FATES = ['backed up', 'keychain', 'server keeps', 'recomputed', 'accepted loss', 'not storage'];

export const checks = [
  // ---- gate (the tree as committed must still be green)
  { id: 'gate-typecheck', what: 'app typecheck', cmd: 'npm run typecheck', cwd: 'app' },
  { id: 'gate-test', what: 'app test suite', cmd: 'npm test', cwd: 'app' },
  { id: 'gate-repo', what: 'repo fast checks (hooks, guards)', cmd: 'node scripts/checks.mjs' },
  { id: 'gate-one-source', what: 'no retired wording repeated', cmd: 'node scripts/one-source.mjs' },
  { id: 'no-em-dash', what: 'no em dash in any file this batch wrote', fn: async ({ root }) => {
    const bad = [AUDIT, REPLIES].filter((p) => existsSync(join(root, p)) && read(root, p).includes('—'));
    return { ok: bad.length === 0, evidence: bad.join(', ') || 'none' };
  } },

  // ---- R79
  { id: 'r79-every-key', what: 'storage audit names every shin key the app code uses', fn: async ({ root }) => {
    if (!existsSync(join(root, AUDIT))) return { ok: false, evidence: `${AUDIT} missing` };
    const audit = read(root, AUDIT);
    const keys = new Set();
    for (const f of walk(join(root, 'app/public/js')).filter((f) => f.endsWith('.js'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['"`](shin[.:_-][A-Za-z0-9._:-]+)['"`]/g)) keys.add(m[1]);
    }
    const missing = [...keys].filter((k) => !audit.includes(k));
    return { ok: keys.size > 0 && missing.length === 0, evidence: `${keys.size} keys in code, missing from audit: ${missing.join(', ') || 'none'}` };
  } },
  { id: 'r79-every-fate', what: 'every audit row gives the key a fate', fn: async ({ root }) => {
    if (!existsSync(join(root, AUDIT))) return { ok: false, evidence: 'missing' };
    const rows = read(root, AUDIT).split('\n').filter((l) => /^\|\s*`?shin[.:_-]/.test(l));
    const bad = rows.filter((r) => !FATES.some((f) => r.toLowerCase().includes(f)));
    return { ok: rows.length > 0 && bad.length === 0, evidence: `${rows.length} rows, no fate: ${bad.map((r) => r.slice(0, 40)).join(' ; ') || 'none'}` };
  } },

  // ---- R21 and the French replies
  { id: 'replies-sections', what: 'restore reply + five French replies present', fn: async ({ root }) => {
    if (!existsSync(join(root, REPLIES))) return { ok: false, evidence: `${REPLIES} missing` };
    const s = Object.keys(sections(read(root, REPLIES)));
    const want = [/restore/, /annul/, /rembours/, /suppr|effac/, /prix/, /magasin|épicerie|offert|disponible/];
    const miss = want.filter((w) => !s.some((h) => w.test(h)));
    return { ok: miss.length === 0, evidence: `headings: ${s.join(' | ')}; missing: ${miss.join(' ') || 'none'}` };
  } },
  { id: 'replies-french', what: 'the five French replies are in French', fn: async ({ root }) => {
    if (!existsSync(join(root, REPLIES))) return { ok: false, evidence: 'missing' };
    const fr = Object.entries(sections(read(root, REPLIES))).filter(([h]) => !/restore/.test(h));
    const bad = fr.filter(([, body]) => {
      const w = body.toLowerCase().match(/\b[\p{L}']+\b/gu) ?? [];
      const frHits = w.filter((x) => ['vous', 'votre', 'nous', 'pour', 'merci', 'les', 'des', 'est'].includes(x)).length;
      const enHits = w.filter((x) => ['the', 'your', 'you', 'thanks', 'please', 'with'].includes(x)).length;
      return frHits < 5 || enHits > frHits / 4;
    });
    return { ok: fr.length >= 5 && bad.length === 0, evidence: `${fr.length} French sections, not French enough: ${bad.map(([h]) => h).join(', ') || 'none'}` };
  } },
  { id: 'replies-fr-screen-names', what: 'French replies name screens as the French app does (Toi, not Vous)', fn: async ({ root }) => {
    if (!existsSync(join(root, REPLIES))) return { ok: false, evidence: 'missing' };
    const bad = read(root, REPLIES).match(/écran Vous|onglet Vous/g) ?? [];
    return { ok: bad.length === 0, evidence: `${bad.length} wrong screen names (ui-strings.js nav_you is 'Toi')` };
  } },
  { id: 'r21-lookup-steps', what: 'restore reply carries the order-number lookup steps', fn: async ({ root }) => {
    if (!existsSync(join(root, REPLIES))) return { ok: false, evidence: 'missing' };
    const [, body = ''] = Object.entries(sections(read(root, REPLIES))).find(([h]) => /restore/.test(h)) ?? [];
    const need = [/revenuecat/i, /order (id|number)/i, /restore purchases?/i, /apple id|same apple account/i];
    const miss = need.filter((n) => !n.test(body));
    return { ok: miss.length === 0, evidence: `missing: ${miss.join(' ') || 'none'}` };
  } },

  // ---- French Terms against the English (content check, independent of any lane)
  { id: 'terms-fr-same-shape', what: 'French Terms: same section count as English', fn: async ({ root }) => {
    const n = (p) => (read(root, p).match(/<h2/g) ?? []).length;
    const en = n('docs/store/terms.html'), fr = n('docs/store/terms-fr.html');
    return { ok: en === fr && en > 0, evidence: `en ${en}, fr ${fr}` };
  } },
  { id: 'terms-fr-same-facts', what: 'French Terms: every number, price, link and email of the English is there', fn: async ({ root }) => {
    const en = strip(read(root, 'docs/store/terms.html'));
    const fr = strip(read(root, 'docs/store/terms-fr.html')).replace(/(\d)\s(\d{3})/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2');
    const facts = new Set([
      ...(en.match(/https?:\/\/[^\s"'<)]+/g) ?? []),
      ...(en.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []),
      ...(en.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/g) ?? []),
    ]);
    const missing = [...facts].filter((f) => !fr.includes(f.replace(/[.,;:]$/, '')));
    return { ok: missing.length === 0, evidence: `${facts.size} facts, missing in French: ${missing.join(' ') || 'none'}` };
  } },

  // ---- register brought to the code
  { id: 'register-r14-r44-r79', what: 'register no longer says "gap" for R14, R44, R79', fn: async ({ root }) => {
    const rows = read(root, 'docs/readiness/register.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const stale = rows.filter((r) => ['R14', 'R44', 'R79'].includes(r.id) && r.state === 'gap');
    return { ok: stale.length === 0, evidence: rows.filter((r) => ['R14', 'R44', 'R79'].includes(r.id)).map((r) => `${r.id}=${r.state}`).join(' ') };
  } },
];
