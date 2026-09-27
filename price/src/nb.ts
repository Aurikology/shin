/**
 * New Brunswick's liquor price list, ANBL's public PDF.
 *
 * ANBL (Alcool NB Liquor) publishes its whole price book as a free PDF, no
 * login, no rate limit noticed: `https://www.anbl.com/medias/PriceList-Public.pdf`.
 * It carries no date in its name, so the file's own bytes are the version -
 * see docs/catalogue-build-plan-2026-09-26.md section 15. Fetched fresh here
 * every run rather than checked in, for the same reason.
 *
 * EXTRACTION. `pdftotext -table` is required, not `-layout`: the PDF lays the
 * columns out with real column boundaries and `-table` reads those; `-layout`
 * re-flows text by eye and drags cells into the wrong column. The columns
 * are, in order: Class, an optional single-letter flag (seen blank, "N" or
 * "S" in this file, never explained on the page and not stored), UPC,
 * Description (the container size is baked into this text, e.g. "750ml"),
 * V/C, Sugar, Base, HST, Deposit, Price. Only Class, UPC, Description, Base,
 * HST, Deposit and Price are used; V/C, Sugar and the flag letter are not
 * this unit's concern.
 *
 * WHY BASE AND SHELF ARE STORED SEPARATELY, per the build plan. New
 * Brunswick's published "Price" column already has HST folded in; British
 * Columbia's single published price (unit 3, not yet built as of this
 * writing) does not. Averaging the two provinces' `price_cents` together
 * would silently average a tax-in number against a tax-out one. `price_cents`
 * here holds NB's shelf figure (Price, what a customer actually pays) and the
 * new `base_price_cents` column (store.ts, added today) holds the Base
 * figure, so a consumer that cares can tell the two apart or reconstruct
 * HST+deposit as the difference; this loader does not store HST and deposit
 * as their own columns because the plan only asked for base and shelf kept
 * apart, and `store.ts`'s own warning about `recordObservation` says every
 * column added has to be kept in three places in sync - two new columns cost
 * twice what one does for a fact nothing here needs on its own.
 *
 * A LINE THAT DOES NOT PARSE IS SKIPPED, NEVER FORCED. `pdftotext -table`
 * wraps a long description onto a second physical line when it does not fit
 * the column width (seen live: "Masi Campolongo Di Torbe Amarone Classico
 * DOC 3000ml" pushed the next product's own description down a line and left
 * that next line with only three dollar amounts instead of four). A row like
 * that is dropped and counted, not guessed at, because inventing a HST figure
 * from a wrapped line would be exactly the fabricated evidence CLAUDE.md's
 * hard rule 3 forbids. The falsifier below is what catches this going wrong
 * at scale; a handful dropped is a PDF artifact, not a regex bug.
 *
 * BARCODE CANONICALIZATION. Same rule as `crawl.ts`'s and `openprices.ts`'s
 * `pad13`: digits only, then left-padded with zeros to 13. An 8-digit EAN-8
 * is not algorithmically re-expanded into a 12-digit UPC-A (there is no such
 * conversion; EAN-8 is its own, unrelated numbering space) - its 8 real
 * digits are kept exactly as printed and simply zero-padded on the left,
 * which is what this same function already does for every length shorter
 * than 13.
 *
 * Run as: node --experimental-strip-types price/src/nb.ts [path-to-pdf]
 * The optional argument reuses an already-downloaded copy of the PDF instead
 * of fetching it again; useful for re-running the parser without re-pulling
 * 2.7 MB every time, and does not change what gets written.
 */

import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPrices, recordObservation, PRICES_DB_PATH, type JoinMethod } from './store.ts';
import { CATALOGUE_PATH } from './crawl.ts';

const SELLER = 'anbl';
const PDF_URL = 'https://www.anbl.com/medias/PriceList-Public.pdf';
const CLASSES = ['WINE', 'SPIRITS', 'BEER', 'OTHLIQ'] as const;

/** Catalogue codes are 13 digits, zero padded. Same rule crawl.ts's and openprices.ts's pad13 use. */
export function pad13(upc: string): string {
  const digits = upc.replace(/\D/g, '');
  return digits.length >= 13 ? digits.slice(-13) : digits.padStart(13, '0');
}

/** One line of the extracted table that had a class, a barcode and all four prices. */
export interface NbRow {
  readonly cls: string;
  readonly upc: string;
  readonly description: string;
  readonly baseCents: number;
  readonly hstCents: number;
  readonly depositCents: number;
  readonly shelfCents: number;
}

/** Whole dollars and cents, e.g. "1,234.56", to integer cents. Never rounds away real money: input is always two decimal places in this source. */
function toCents(s: string): number {
  return Math.round(Number.parseFloat(s.replace(/,/g, '')) * 100);
}

const LINE_START = new RegExp(`^(${CLASSES.join('|')})\\s+(?:([A-Z])\\s+)?(\\d{6,14})\\s+(.*)$`);
const DOLLAR = /\$([\d,]+\.\d{1,2})/g;

/**
 * Parses one physical line of the `pdftotext -table` output. Returns null for
 * anything that is not a priced product row: page headers, blank lines, and
 * the wrapped-description artifact described in the file header, which always
 * shows up as a line with the wrong number of dollar amounts.
 */
function parseLine(line: string): NbRow | null {
  const m = LINE_START.exec(line);
  if (m === null) return null;
  const [, cls, , upc, rest] = m;

  const dollars: string[] = [];
  const positions: number[] = [];
  let d: RegExpExecArray | null;
  DOLLAR.lastIndex = 0;
  while ((d = DOLLAR.exec(rest)) !== null) {
    dollars.push(d[1]);
    positions.push(d.index);
  }
  if (dollars.length !== 4) return null;

  const description = rest.slice(0, positions[0]).trim().replace(/\s+/g, ' ');
  const [baseS, hstS, depositS, shelfS] = dollars;
  return {
    cls,
    upc,
    description,
    baseCents: toCents(baseS),
    hstCents: toCents(hstS),
    depositCents: toCents(depositS),
    shelfCents: toCents(shelfS),
  };
}

function fetchPdf(): Promise<Buffer> {
  return fetch(PDF_URL).then(async (res) => {
    if (!res.ok) throw new Error(`ANBL price list fetch failed: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
}

/** Shells out to pdftotext -table, the extraction the build plan requires; -layout mangles the columns. */
function extractTable(pdfPath: string): string {
  return execFileSync('pdftotext', ['-table', pdfPath, '-'], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  });
}

async function main(): Promise<void> {
  const localPath = process.argv[2] ?? null;
  let pdfPath = localPath;
  let cleanup: (() => void) | null = null;

  if (pdfPath === null) {
    const bytes = await fetchPdf();
    const dir = mkdtempSync(join(tmpdir(), 'anbl-'));
    pdfPath = join(dir, 'PriceList-Public.pdf');
    writeFileSync(pdfPath, bytes);
    cleanup = () => unlinkSync(pdfPath!);
    console.log(`fetched ${bytes.length} bytes`);
  }

  const text = extractTable(pdfPath!);
  if (cleanup) cleanup();

  /* pdftotext writes CRLF. A trailing \r left on each line would sit between
   * `(.*)` and the `$` anchor in LINE_START below and fail every match,
   * since `.` never matches a line terminator and `$` (no multiline flag)
   * only matches the true end of the string - not "the end, modulo one
   * trailing \r". Strip it once here rather than teach every regex about it. */
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const cat = new DatabaseSync(CATALOGUE_PATH, { readOnly: true });
  const catStmt = cat.prepare('SELECT 1 FROM product WHERE code = ?');
  const isCatalogued = (code: string): boolean => catStmt.get(code) !== undefined;

  const db = openPrices(PRICES_DB_PATH);
  const today = new Date().toISOString().slice(0, 10);

  let candidateLines = 0;
  let parsed = 0;
  let skippedMalformed = 0;
  let skippedZeroPrice = 0;
  const byClass = new Map<string, number>();
  const barcodes = new Set<string>();
  let joined = 0;
  let unjoined = 0;
  let descriptionRecovered = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^(WINE|SPIRITS|BEER|OTHLIQ)\s/.test(line)) continue;
    candidateLines += 1;

    const row = parseLine(line);
    if (row === null) {
      skippedMalformed += 1;
      continue;
    }
    if (row.shelfCents <= 0 || row.baseCents <= 0) {
      skippedZeroPrice += 1;
      continue;
    }

    /*
     * DESCRIPTION RECOVERY, found while chasing the coordinator's price-range
     * flag on 2026-09-26 (see the file header). A description this short and
     * purely numeric is never real product text; it is the "V/C" or "Sugar"
     * or vintage-year cell sitting right after an EMPTY description column,
     * which happens when the row above wrapped onto a second physical line
     * and pushed this row's own description text up onto that orphan line
     * instead of leaving it beside this row's barcode. Confirmed live against
     * 12 sampled cases (Baileys Almande, BenRiach 17YO, Glenlivet French Oak
     * Reserve 15, etc.): the line immediately above, when it is not itself a
     * new class row, is that missing description, verbatim, not invented.
     * Barcode and all four prices for this row were never in question - they
     * come from this row's own line - only the name was ever at risk, and
     * only for rows this short-numeric check catches.
     */
    let description = row.description;
    if (/^[0-9]{1,4}$/.test(description)) {
      const prev = i > 0 ? lines[i - 1] : '';
      const prevTrimmed = prev.trim().replace(/\s+/g, ' ');
      if (prevTrimmed !== '' && !/^(WINE|SPIRITS|BEER|OTHLIQ)\s/.test(prev)) {
        description = prevTrimmed;
        descriptionRecovered += 1;
      }
    }

    const code13 = pad13(row.upc);
    const has = isCatalogued(code13);
    const joinMethod: JoinMethod = has ? 'gtin' : 'none';
    if (has) joined += 1;
    else unjoined += 1;

    barcodes.add(code13);
    byClass.set(row.cls, (byClass.get(row.cls) ?? 0) + 1);

    recordObservation(db, {
      code: has ? code13 : null,
      seller: SELLER,
      sellerSku: row.upc,
      sellerName: description,
      sellerBrand: null,
      priceCents: row.shelfCents,
      basePriceCents: row.baseCents,
      kind: 'regular',
      unitPriceCents: null,
      unitLabel: null,
      currency: 'CAD',
      country: 'CA',
      region: 'New Brunswick',
      joinMethod,
      seenOn: today,
      url: PDF_URL,
      imageUrl: null,
      inStock: null,
      pageGtin: has ? null : code13,
    });
    parsed += 1;
  }

  cat.close();
  db.close();

  console.log('');
  console.log(`  candidate lines          ${candidateLines}`);
  console.log(`  parsed and recorded      ${parsed}`);
  console.log(`  skipped, malformed       ${skippedMalformed}`);
  console.log(`  skipped, zero price      ${skippedZeroPrice}`);
  console.log(`  joined to catalogue      ${joined}`);
  console.log(`  stored unjoined          ${unjoined}`);
  console.log(`  distinct barcodes        ${barcodes.size}`);
  console.log(`  descriptions recovered   ${descriptionRecovered}  (wrap artifact, see file header)`);
  for (const [cls, n] of byClass) console.log(`    ${cls.padEnd(10)} ${n}`);
  console.log('');

  if (parsed < 6000) {
    console.error(
      `FALSIFIER TRIPPED: only ${parsed} rows parsed, under 6000. The PDF layout likely shifted; do not trust this run.`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  void main();
}
