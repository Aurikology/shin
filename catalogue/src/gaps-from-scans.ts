/**
 * A pass over the scan log that writes down which scanned barcodes Shin's own
 * catalogue does not hold, without ever reading the catalogue while a scan is
 * being served.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT INSIDE THE ROUTE. His rule, quoted where
 * `/api/identify` begins: "The server will not check shins own product list
 * for now. The only thing the server will do is call gemini." Three tests
 * hold that rule by counting calls to the catalogue during a scan and
 * demanding ZERO (`app/test/gemini-one-call.test.ts`,
 * `app/test/catalogue-feed.test.ts`, `app/test/over-cap-verdict-offers.test.ts`).
 * server.ts used to carry a `noteCatalogueBarcodeMiss` that looked the barcode
 * up as a background task queued from inside the request, and even queued
 * that way the count during the request was still one: the queued work runs
 * before the client's fetch resolves. Weakening the three tests to allow that
 * one call would have thrown away the only mechanical evidence the rule
 * holds, so the check was removed from the request path entirely and moved
 * here instead. The scan log already records every scan and its barcode
 * (`app/src/scans.ts`), so nothing new has to be captured at scan time to make
 * this possible after the fact -- and doing it here means it can be computed
 * for every barcode ever scanned, not only ones scanned from here on.
 *
 * NO CATALOGUE MEANS NO RECORD, carried over from the code this replaces.
 * "We cannot look" is not "we do not have it": a pass that cannot reach the
 * catalogue records nothing rather than inventing a miss, the same guarantee
 * `app/test/gemini-miss-gap.test.ts` pins from the server side (it runs with
 * no catalogue attached and asserts exact row counts). Here that means: no
 * `catalogue` argument, or a catalogue that fails to open, and this pass
 * writes zero gap rows and leaves its watermark untouched, so a later run
 * with the catalogue actually reachable still sees every scan that happened
 * while it was not.
 *
 * SAFE TO RUN TWICE. A JSON watermark file beside the gap log (see
 * `defaultWatermarkPath`) remembers the highest scan id this pass has already
 * folded into the gap log. A run only calls `recordGap` for barcode scans
 * newer than that watermark, so re-running the pass with no new scans writes
 * nothing and leaves every count exactly where the previous run left it. The
 * watermark advances past EVERY scan read (not only the missing barcodes), so
 * a text scan or a held barcode in between two misses is not looked at again
 * either. The watermark is written only in `--apply` mode; a dry run never
 * touches it, so running the report over and over never changes what the next
 * `--apply` will do.
 *
 * `recordGap` is called once per matching SCAN ROW, not once per distinct
 * barcode, so two scans of the same absent barcode in one run raise that
 * barcode's count by two, matching what actually happened rather than
 * collapsing it to "seen at least once this run". The catalogue itself is
 * only looked up once per distinct barcode either way (`byGtin` is not free
 * against a 4 GB file), the lookups are just fanned back out to every scan row
 * that shares the code before anything is written.
 *
 * HOW THIS WOULD BE SCHEDULED, AND WHY IT IS NOT. A person runs
 * `node src/gaps-from-scans.ts --apply` from `catalogue/` by hand, the way
 * `npm run search` is already run by hand. It could instead run nightly the
 * way `agent-day-plan` runs other passes on a schedule outside this repo. Not
 * wired up here: this project's rule is that no new machinery -- no hook, no
 * cron entry, nothing that runs on its own -- gets installed without him
 * (`CLAUDE.md`, "Machinery is frozen").
 *
 * USAGE (dry run by default; nothing is written until --apply):
 *
 *   node src/gaps-from-scans.ts             # report only
 *   node src/gaps-from-scans.ts --apply     # write the gap rows
 *
 * Env overrides: SHIN_SCANS, SHIN_GAPS, SHIN_CATALOGUE.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openScanStore, allScans, type ScanRow } from '../../app/src/scans.ts';
import { openCatalogueReadOnly } from './schema.ts';
import { Catalogue } from './search.ts';
import { defaultEmbedder } from './embed.ts';
import { canonicalCode } from './barcode.ts';
import { recordGap, openGapLog } from './gaps.ts';

/** A catalogue's exact-barcode lookup. `Catalogue` satisfies this; so does a test double. */
export interface CatalogueLookup {
  byGtin(code: string): unknown;
}

// Resolved the same way server.ts resolves its own defaults: absolute, beside
// the package that owns the file, so running this from any cwd finds the same
// files the running app uses, and SHIN_* still wins for tests and deployment.
const DEFAULT_SCANS_DB = process.env.SHIN_SCANS
  ?? fileURLToPath(new URL('../../app/data/scans.db', import.meta.url));
const DEFAULT_GAPS_DB = process.env.SHIN_GAPS
  ?? fileURLToPath(new URL('../../app/data/gaps.db', import.meta.url));
const DEFAULT_CATALOGUE_DB = process.env.SHIN_CATALOGUE
  ?? fileURLToPath(new URL('../data/catalogue.db', import.meta.url));

function defaultWatermarkPath(gapsPath: string): string {
  return join(dirname(gapsPath) || '.', 'gaps-from-scans.watermark.json');
}

interface Watermark {
  lastScanId: number;
}

function readWatermark(path: string): Watermark {
  try {
    if (!existsSync(path)) return { lastScanId: 0 };
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Watermark>;
    const lastScanId = Number(parsed.lastScanId);
    return { lastScanId: Number.isFinite(lastScanId) ? lastScanId : 0 };
  } catch {
    // A watermark that cannot be read is treated as "start from the top" --
    // it can only ever cause a rescan, never a skipped scan, so it fails safe.
    return { lastScanId: 0 };
  }
}

function writeWatermark(path: string, mark: Watermark): void {
  try {
    mkdirSync(dirname(path) || '.', { recursive: true });
    writeFileSync(path, JSON.stringify(mark), 'utf8');
  } catch {
    // Losing the watermark only costs a re-scan on the next run, not a wrong
    // answer, so it is swallowed the same way every write in this pass is.
  }
}

export interface GapsFromScansOptions {
  /** Where the scan log lives. Defaults to SHIN_SCANS or the app's own default path. */
  scansPath?: string;
  /** Where the gap log lives. Defaults to SHIN_GAPS or the app's own default path. */
  gapsPath?: string;
  /** Overrides where the run's watermark is kept. Defaults beside the gap log. */
  watermarkPath?: string;
  /**
   * The catalogue to check barcodes against. Omitted, or explicitly `null`,
   * means no catalogue is attached: nothing is looked up and nothing is
   * written, because "we cannot look" is not "we do not have it".
   */
  catalogue?: CatalogueLookup | null;
  /** Write the findings through `recordGap`. Defaults to false: report only. */
  apply?: boolean;
}

export interface GapsFromScansSummary {
  /** Every scan whose kind is 'barcode' and which resolved to a code. */
  readonly barcodeScans: number;
  /** Distinct canonical codes among those scans. */
  readonly distinctBarcodes: number;
  /** Distinct canonical codes the catalogue does not hold. Empty with no catalogue attached. */
  readonly missingBarcodes: string[];
  /** Scan occurrences of a missing barcode not yet folded in by an earlier --apply. */
  readonly newSinceLastRun: number;
  /** `recordGap` calls actually made this run. Always 0 unless `apply` and a catalogue were given. */
  readonly written: number;
}

/**
 * Runs the pass once. Pure with respect to the catalogue and the scan log
 * (neither is written to); the only side effect, and only in `--apply` mode,
 * is `recordGap` calls against the gap log and the watermark file beside it.
 */
export function gapsFromScans(options: GapsFromScansOptions = {}): GapsFromScansSummary {
  const scansPath = options.scansPath ?? DEFAULT_SCANS_DB;
  const gapsPath = options.gapsPath ?? DEFAULT_GAPS_DB;
  const watermarkPath = options.watermarkPath ?? defaultWatermarkPath(gapsPath);
  const catalogue = options.catalogue ?? null;
  const apply = options.apply ?? false;

  const scanStore = openScanStore(scansPath);
  const rows: ScanRow[] = allScans(scanStore);

  const barcodeRows = rows.filter(
    (r): r is ScanRow & { resolved_code: string } => r.kind === 'barcode' && !!r.resolved_code,
  );
  const codeByRow = new Map<number, string>();
  const distinct = new Set<string>();
  for (const row of barcodeRows) {
    const code = canonicalCode(row.resolved_code);
    codeByRow.set(row.id, code);
    distinct.add(code);
  }

  // NO CATALOGUE MEANS NO RECORD: with none attached, every lookup below is
  // skipped, `missingBarcodes` stays empty, and nothing is ever written.
  const missing = new Set<string>();
  if (catalogue) {
    for (const code of distinct) {
      if (catalogue.byGtin(code) === null) missing.add(code);
    }
  }

  const watermark = readWatermark(watermarkPath);
  const newRows = barcodeRows
    .filter((r) => r.id > watermark.lastScanId && missing.has(codeByRow.get(r.id)!))
    .sort((a, b) => a.id - b.id);

  let written = 0;
  if (apply && catalogue) {
    if (newRows.length > 0) {
      openGapLog(gapsPath);
      for (const row of newRows) {
        recordGap({
          gtin: codeByRow.get(row.id)!,
          note: 'catalogue_miss (offline pass, gaps-from-scans)',
          catalogueMissing: true,
        });
        written += 1;
      }
    }
    // Advance past every scan read, not only the missing ones, so a held
    // barcode or a text scan in between two misses is never looked at again.
    const highest = rows.reduce((max, r) => Math.max(max, r.id), watermark.lastScanId);
    writeWatermark(watermarkPath, { lastScanId: highest });
  }

  return {
    barcodeScans: barcodeRows.length,
    distinctBarcodes: distinct.size,
    missingBarcodes: [...missing],
    newSinceLastRun: newRows.length,
    written,
  };
}

/**
 * Opens the real catalogue read-only for this pass. `PRAGMA busy_timeout` is
 * set long (120 s) because the file this points at in production is several
 * GB and other jobs write to it while this runs; a locked file should make
 * this wait, not make it report a zero that looks like a clean sweep.
 *
 * Returns null, with a reason, when the file cannot be opened at all -- the
 * same "no catalogue attached" case `gapsFromScans` already treats as
 * "nothing is known, so nothing is recorded" rather than an error.
 */
function openCatalogueForLookup(path: string): { catalogue: CatalogueLookup } | { error: string } {
  try {
    const db = openCatalogueReadOnly(path);
    db.exec('PRAGMA busy_timeout = 120000');
    const catalogue = new Catalogue(db, defaultEmbedder()) as unknown as CatalogueLookup;
    return { catalogue };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const opened = openCatalogueForLookup(DEFAULT_CATALOGUE_DB);

  if ('error' in opened) {
    console.log(`No catalogue attached at ${DEFAULT_CATALOGUE_DB}: ${opened.error}`);
    console.log('Nothing looked up, nothing recorded: "we cannot look" is not "we do not have it".');
    return;
  }

  const summary = gapsFromScans({ catalogue: opened.catalogue, apply });
  console.log(`scans database: ${DEFAULT_SCANS_DB}`);
  console.log(`gaps database:  ${DEFAULT_GAPS_DB}`);
  console.log(`catalogue:      ${DEFAULT_CATALOGUE_DB}`);
  console.log(`barcode scans read: ${summary.barcodeScans}`);
  console.log(`distinct barcodes scanned: ${summary.distinctBarcodes}`);
  console.log(`barcodes the catalogue does not hold: ${summary.missingBarcodes.length}`);
  console.log(
    apply
      ? `gap rows written this run: ${summary.written}`
      : `gap rows this run WOULD write (pass --apply to write): ${summary.newSinceLastRun}`,
  );
  if (!apply && summary.missingBarcodes.length > 0) {
    console.log('missing barcodes:', summary.missingBarcodes.join(', '));
  }
}

// Runs only when invoked directly (`node src/gaps-from-scans.ts`), never on import,
// the same discipline `barcode.ts`'s own comment names as the reason it exists in
// its own file: importing this module for `gapsFromScans` or `CatalogueLookup`
// must never open a database as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
