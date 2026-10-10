/**
 * The source registry, 2026-10-09. Requirement 4.8 of
 * docs/price-category-requirements-2026-10-01.md: record each source's basis
 * for use (a licence, the site's terms, or pages he browses and saves by hand)
 * and run no automated reader on a site whose terms forbid one. Pass: every
 * source has a recorded basis; 0 automated readers on a forbidding site.
 * Plan docs/price-category-plan-2026-10-02.md, Part 6, 4.8: a registry the
 * database enforces; diagnosed by the registry audit; last resort, drop the
 * source.
 *
 * WHAT LIVES IN prices.db
 *
 *   source_registry  one entry per (seller, access), versioned by appending:
 *                    the newest id for a pair is the entry in force, and no
 *                    entry is ever edited or deleted (triggers refuse both).
 *                    `access` is 'automated' (a program reads the site) or
 *                    'by_hand' (pages a person browses and saves). `basis` is
 *                    'licence', 'terms', 'hand_saved', or 'unknown' when the
 *                    repo records none. `automated` is what the recorded basis
 *                    says about automated readers: 'permitted', 'forbidden',
 *                    or 'not_recorded'. CHECK constraints make the database
 *                    itself refuse an entry with no evidence or no citation, a
 *                    'terms' entry with no URL or no date read, a hand-saved
 *                    basis on an automated reader (or the reverse), and a
 *                    'permitted' that rests on anything but a licence or terms.
 *   source_use       one row per reader run that asked to use a source, the
 *                    entry it was judged under, and whether it was let through.
 *                    Append-only. The audit's "automated reader on a forbidding
 *                    site" count is read from here.
 *
 * ENFORCEMENT IS A PROPERTY OF THE FILE. `enforceSourceRegistry` records it in
 * store_meta and installs two triggers on `observation` that refuse a row (by
 * INSERT, or by an UPDATE that changes its seller) whose seller has no entry at
 * all. Every later `openPrices` of that file reinstalls them. Before enforcing,
 * every seller already holding rows but no entry gets one with basis 'unknown',
 * so existing rows keep loading and the audit names them.
 *
 * WHY NOT ON EVERY DATABASE BY DEFAULT. bench/src/harness.ts copies rows into
 * an in-memory openPrices database, and the bench and app test fixtures write
 * sellers that are not sources at all ('A', 'S1', 'Test Mart', 'loblaws').
 * Those packages are not this one's to edit, and registering made-up sellers
 * would be the invented basis this requirement exists to stop. So a database
 * is enforced when a real writer opens it: every CLI in price/src that writes
 * observations opens with `{ enforceSources: true }` and passes
 * `requireSourceUse` before it reads anything. An unenforced database is
 * reported as such by the audit, which then fails.
 *
 * WHERE THE CODE IS. The tables, the seeds, the triggers and
 * `enforceSourceRegistry` live in store.ts (openPrices installs them; see the
 * note there on why they cannot be imported from here). This file holds the
 * entry rules, the reader gate, the audit and the CLI, and re-exports the rest.
 *
 * WHAT THE SEEDS ARE. `SOURCE_SEEDS` records, for each seller that writes
 * observations today, only what the repo already documents, with the citation.
 * Where the repo records no licence and no terms reading, the basis is
 * 'unknown' and says so. Nothing here is a reading of any site made today. A
 * seed is inserted only when its (seller, access) has no entry yet, so a newer
 * entry appended by a person is never overwritten by the code.
 */


import type { DatabaseSync } from 'node:sqlite';
import {
  insertSourceEntry,
  isEnforced,
  openPrices,
  PRICES_DB_PATH,
  REGISTRY_TRIGGERS,
  type SourceAccess,
  type SourceBasis,
  type AutomatedUse,
  type SourceEntry,
} from './store.ts';

export {
  SOURCE_SEEDS,
  REGISTRY_TRIGGERS,
  installSourceRegistry,
  isEnforced,
  enforceSourceRegistry,
  type SourceAccess,
  type SourceBasis,
  type AutomatedUse,
  type SourceEntry,
} from './store.ts';

const ACCESS: readonly SourceAccess[] = ['automated', 'by_hand'];
const BASES: readonly SourceBasis[] = ['licence', 'terms', 'hand_saved', 'unknown'];
const AUTOMATED: readonly AutomatedUse[] = ['permitted', 'forbidden', 'not_recorded'];

export interface RegistryRow extends SourceEntry {
  readonly id: number;
  readonly recordedAt: string;
}

export class SourceRegistryError extends Error {
  override name = 'SourceRegistryError';
}

/* ------------------------------------------------------------ entries */

function validateEntry(e: SourceEntry): void {
  const who = `${String(e?.seller)}/${String(e?.access)}`;
  if (typeof e.seller !== 'string' || e.seller.trim() === '') throw new SourceRegistryError('a registry entry needs a seller');
  if (!ACCESS.includes(e.access)) throw new SourceRegistryError(`${who}: access must be one of ${ACCESS.join(', ')}`);
  if (!BASES.includes(e.basis)) throw new SourceRegistryError(`${who}: basis must be one of ${BASES.join(', ')}, got ${JSON.stringify(e.basis)}`);
  if (!AUTOMATED.includes(e.automated)) throw new SourceRegistryError(`${who}: automated must be one of ${AUTOMATED.join(', ')}`);
  if (typeof e.evidence !== 'string' || e.evidence.trim() === '') throw new SourceRegistryError(`${who}: an entry needs its evidence`);
  if (typeof e.cite !== 'string' || e.cite.trim() === '') throw new SourceRegistryError(`${who}: an entry needs a cite (where the repo records it)`);
  if (e.basis === 'terms' && (!e.evidenceUrl || !e.readOn)) {
    throw new SourceRegistryError(`${who}: a terms basis needs the terms URL and the day they were read`);
  }
  if ((e.basis === 'hand_saved') !== (e.access === 'by_hand')) {
    throw new SourceRegistryError(`${who}: hand_saved is the basis of a by_hand source and only of one`);
  }
  if (e.automated === 'permitted' && e.basis !== 'licence' && e.basis !== 'terms') {
    throw new SourceRegistryError(`${who}: permission for an automated reader must rest on a licence or the terms`);
  }
}

export function registerSource(db: DatabaseSync, e: SourceEntry): number {
  validateEntry(e);
  return insertSourceEntry(db, e);
}

interface DbRow {
  id: number;
  seller: string;
  access: SourceAccess;
  basis: SourceBasis;
  evidence: string;
  evidence_url: string | null;
  read_on: string | null;
  automated: AutomatedUse;
  cite: string;
  recorded_at: string;
}

function fromDb(r: DbRow): RegistryRow {
  return {
    id: Number(r.id),
    seller: r.seller,
    access: r.access,
    basis: r.basis,
    evidence: r.evidence,
    evidenceUrl: r.evidence_url,
    readOn: r.read_on,
    automated: r.automated,
    cite: r.cite,
    recordedAt: r.recorded_at,
  };
}

/** The entry in force for each (seller, access): the newest one. */
export function currentRegistry(db: DatabaseSync): RegistryRow[] {
  return (
    db
      .prepare(
        `SELECT * FROM source_registry WHERE id IN (SELECT MAX(id) FROM source_registry GROUP BY seller, access)
          ORDER BY seller, access`,
      )
      .all() as unknown as DbRow[]
  ).map(fromDb);
}

function currentEntry(db: DatabaseSync, seller: string, access: SourceAccess): RegistryRow | null {
  const r = db
    .prepare('SELECT * FROM source_registry WHERE seller = ? AND access = ? ORDER BY id DESC LIMIT 1')
    .get(seller, access) as unknown as DbRow | undefined;
  return r ? fromDb(r) : null;
}

/* ------------------------------------------------------------ the gate */

/**
 * The one gate every reader passes before it reads: runIntake calls it, and so
 * does every legacy writer's CLI. Throws SourceRegistryError when the source
 * has no entry for this kind of access, or when an automated reader asks for a
 * source whose entry forbids one. Every ask, let through or not, is written to
 * source_use.
 */
export function requireSourceUse(db: DatabaseSync, seller: string, access: SourceAccess): RegistryRow {
  if (!ACCESS.includes(access)) throw new SourceRegistryError(`${seller}: access must be one of ${ACCESS.join(', ')}`);
  const e = currentEntry(db, seller, access);
  let refusal: string | null = null;
  if (e === null) {
    const any = db.prepare('SELECT 1 FROM source_registry WHERE seller = ?').get(seller) !== undefined;
    refusal = any
      ? `${seller}: no ${access} entry in the source registry; a ${access === 'by_hand' ? 'by_hand reader needs a hand_saved entry' : 'automated reader needs an automated entry'}`
      : `${seller}: no entry in the source registry; record its basis (licence, terms, or hand-saved) before reading it`;
  } else if (access === 'automated' && e.automated === 'forbidden') {
    refusal = `${seller}: the recorded basis forbids an automated reader (${e.basis}: ${e.evidence}); only pages saved by hand may be read`;
  }
  db.prepare('INSERT INTO source_use (seller, access, registry_id, allowed, reason, used_at) VALUES (?,?,?,?,?,?)').run(
    seller,
    access,
    e?.id ?? null,
    refusal === null ? 1 : 0,
    refusal,
    new Date().toISOString(),
  );
  if (refusal !== null) throw new SourceRegistryError(refusal);
  return e!;
}

/* ------------------------------------------------------------ the audit */

export interface RegistryAudit {
  readonly enforced: boolean;
  readonly triggersMissing: readonly string[];
  readonly entries: readonly RegistryRow[];
  /** Entries in force whose basis is 'unknown'. Requirement 4.8 fails while any remain. */
  readonly unknownBasis: readonly RegistryRow[];
  /** Sellers holding observation rows with no entry at all. */
  readonly unregistered: readonly { seller: string; rows: number }[];
  /** Reader runs let through as automated under an entry that forbids one. Must be 0. */
  readonly automatedOnForbidding: readonly { id: number; seller: string; registryId: number; usedAt: string }[];
  /** Sellers with rows but no reader run on the source_use ledger (rows written before the gate, or around it). */
  readonly rowsWithoutGate: readonly { seller: string; rows: number }[];
  readonly pass: boolean;
}

export function registryAudit(db: DatabaseSync): RegistryAudit {
  const enforced = isEnforced(db);
  const triggers = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'observation'").all() as unknown as {
      name: string;
    }[]).map((t) => t.name),
  );
  const triggersMissing = REGISTRY_TRIGGERS.filter((t) => !triggers.has(t));
  const entries = currentRegistry(db);
  const unknownBasis = entries.filter((e) => e.basis === 'unknown');
  const unregistered = (
    db
      .prepare(
        `SELECT seller, COUNT(*) AS n FROM observation o
          WHERE NOT EXISTS (SELECT 1 FROM source_registry r WHERE r.seller = o.seller) GROUP BY seller ORDER BY seller`,
      )
      .all() as unknown as { seller: string; n: number }[]
  ).map((r) => ({ seller: r.seller, rows: Number(r.n) }));
  const automatedOnForbidding = (
    db
      .prepare(
        `SELECT u.id, u.seller, u.registry_id, u.used_at FROM source_use u JOIN source_registry r ON r.id = u.registry_id
          WHERE u.allowed = 1 AND u.access = 'automated' AND r.automated = 'forbidden' ORDER BY u.id`,
      )
      .all() as unknown as { id: number; seller: string; registry_id: number; used_at: string }[]
  ).map((r) => ({ id: Number(r.id), seller: r.seller, registryId: Number(r.registry_id), usedAt: r.used_at }));
  const rowsWithoutGate = (
    db
      .prepare(
        `SELECT seller, COUNT(*) AS n FROM observation o
          WHERE NOT EXISTS (SELECT 1 FROM source_use u WHERE u.seller = o.seller AND u.allowed = 1) GROUP BY seller ORDER BY seller`,
      )
      .all() as unknown as { seller: string; n: number }[]
  ).map((r) => ({ seller: r.seller, rows: Number(r.n) }));
  const pass =
    enforced && triggersMissing.length === 0 && unknownBasis.length === 0 && unregistered.length === 0 && automatedOnForbidding.length === 0;
  return { enforced, triggersMissing, entries, unknownBasis, unregistered, automatedOnForbidding, rowsWithoutGate, pass };
}

/** Throws SourceRegistryError listing every reason requirement 4.8 does not pass on this database. */
export function assertSourceRegistry(db: DatabaseSync): RegistryAudit {
  const a = registryAudit(db);
  if (a.pass) return a;
  const problems: string[] = [];
  if (!a.enforced) problems.push('this database is not under the source registry (enforceSourceRegistry has never run on it)');
  if (a.enforced && a.triggersMissing.length > 0) problems.push(`registry triggers missing on observation: ${a.triggersMissing.join(', ')}`);
  for (const e of a.unknownBasis) problems.push(`${e.seller}/${e.access}: basis unknown (${e.cite})`);
  for (const u of a.unregistered) problems.push(`${u.seller}: ${u.rows} rows and no registry entry`);
  for (const f of a.automatedOnForbidding) problems.push(`${f.seller}: automated reader run ${f.id} at ${f.usedAt} under entry ${f.registryId}, which forbids one`);
  throw new SourceRegistryError(`source registry audit failed (requirement 4.8):\n  ${problems.join('\n  ')}`);
}

/* ------------------------------------------------------------ CLI */

/**
 * node src/registry.ts audit [--db PATH]    print the audit; exit 1 unless it passes
 * node src/registry.ts enforce [--db PATH]  put the database under the registry, then audit
 */
async function main(argv: string[]): Promise<void> {
  const i = argv.indexOf('--db');
  const path = i >= 0 ? argv[i + 1]! : PRICES_DB_PATH;
  const cmd = argv[0];
  if (cmd !== 'audit' && cmd !== 'enforce') {
    process.stderr.write('usage: node src/registry.ts audit|enforce [--db PATH]\n');
    process.exitCode = 2;
    return;
  }
  const db = openPrices(path, { enforceSources: cmd === 'enforce' });
  try {
    const a = registryAudit(db);
    console.log(`source registry, ${path}: enforced ${a.enforced}, ${a.entries.length} entries in force`);
    for (const e of a.entries) console.log(`  ${e.seller} / ${e.access}: ${e.basis}, automated ${e.automated}  [${e.cite}]`);
    for (const u of a.unregistered) console.log(`  UNREGISTERED ${u.seller}: ${u.rows} rows`);
    for (const f of a.automatedOnForbidding) console.log(`  AUTOMATED ON FORBIDDING ${f.seller}: run ${f.id}`);
    for (const r of a.rowsWithoutGate) console.log(`  no gated reader run on record for ${r.seller} (${r.rows} rows)`);
    console.log(`basis unknown: ${a.unknownBasis.length}; automated readers on a forbidding site: ${a.automatedOnForbidding.length}; pass ${a.pass}`);
    if (!a.pass) process.exitCode = 1;
  } finally {
    db.close();
  }
}

if (import.meta.filename === process.argv[1]) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
