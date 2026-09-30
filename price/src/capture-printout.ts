/**
 * Store printouts in: a saved-as-PDF category page becomes raw capture rows,
 * then observation rows derived from them. Units A1 and A2 of
 * docs/price-system-build-plan-2026-09-28.md.
 *
 * ===========================================================================
 * READ THIS FIRST, DOWNSTREAM CONSUMERS (D2 and anything after it):
 * a printout row is price EVIDENCE only when `price_verified = 1`. Every other
 * printout row (`price_verified = 0`) holds the reader's best guess and its
 * flags, and is TRAINING DATA ONLY: never a price in a range, a verdict or an
 * answer. (Third audit, 2026-09-28: 24 of 83 adversarial products stored a
 * wrong price with no flag under the old "reject what looks wrong" model; the
 * model is now inverted, boss decision: a price is verified only when every
 * positive check below holds.)
 * ===========================================================================
 *
 * THE THREE STEPS, and why they are apart.
 *
 *   1. read    scripts/read-printout.py opens the PDF (PyMuPDF, the library the
 *              printout prototype was measured with; Node has no PDF reader in
 *              this repo) and prints every link rectangle with the words inside
 *              it, the words touching it from outside, and each word's render
 *              mode, direction, font and size. It decides nothing.
 *   2. keep    `storeCapture` writes that output, unedited, to `capture` and
 *              `capture_tile` (layer 1). EVERY product link (any link with /ip/
 *              in it, slug or not) becomes a tile; nothing is silently skipped.
 *   3. derive  `deriveFromRaw` turns the raw tables, and nothing else, into
 *              observation rows and logged drops; `applyDerived` writes them.
 *              `checkRebuild` re-runs it and compares with what is stored.
 *
 * WHEN A PRICE IS VERIFIED (`price_verified = 1`). Principle (boss decision,
 * 2026-09-28): TWO INDEPENDENT READS OF THE TILE AGREE, never one read alone.
 *
 *   The shelf read: the shelf price is the tile's largest money word (font size,
 *       then bold), not a unit, "was" or multi-buy price. On the real layout
 *       its cents are superscript flattened into one word, so a bare `$644` or
 *       `$1297` in bold shelf style reads as dollars and 2-digit cents.
 *   The second read, one of:
 *       unit_agrees  the printed unit price agrees with shelf price / size (size
 *                    from the link slug or the printed title) within 3%, in
 *                    100g, 100ml, g, ml, kg, l, lb, oz or each;
 *       by_weight    a by-weight tile ("avg price"): the avg price is the printed
 *                    unit price times the upper end of the printed weight range,
 *                    within the rounding of the printed figures.
 *   And every safety check:
 *   (a) no other money-like text anywhere in or touching the rectangle besides
 *       the shelf price and its unit price: no "was", no "save", no multi-buy,
 *       no second price, no bare decimal (a size like "1.36 kg" or a weight
 *       range like "0.15 - 0.23 KG" is not money);
 *   (b) the shelf price's words lie inside this tile's rectangle and inside NO
 *       other product's rectangle;
 *   (c) the token is not preceded, on its line or the line just above, by a
 *       count (for, /, x, a number), a range (-, en dash, to), From/Starting, a
 *       minus sign, or US/USD, and not followed by a range, US/USD, or a "/" or
 *       "per" on the next line;
 *   (d) the token's text is visible (render mode not 3) and upright;
 *   (e) ADDED BY THIS LANE: the shelf price sits directly above the tile's own
 *       printed title (the line matching the link's slug), within 60 pt.
 *       Measured on the 29 real printouts 2026-09-28: of the 797 tiles whose
 *       title could be found, 793 have it 0-60 pt below the shelf price;
 *   (f) ADDED BY THIS LANE: no "out of stock" / "sold out" / "unavailable";
 *   (g) the row carries no flag, except `ambiguous_dollar_spelling` and
 *       `price_by_weight`, which the second read resolves.
 *
 * Name: from the product LINK's slug, never the printed words (88 of 898 printed
 * names in the real printouts belonged to the neighbouring tile).
 *
 * NOT VERIFIED ON REAL PRINTOUTS. The 29 real Walmart printouts were not on the
 * machine this was written on; every rule here was set on synthetic PDFs
 * (scripts/make-printout-fixture.py and the audit fixtures).
 *
 * Usage: node src/capture-printout.ts <file.pdf>... [--store NAME] [--category NAME]
 *          [--captured-at ISO] [--images DIR] [--db PATH]
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import * as settings from '../../settings/src/index.ts';
import { openPrices, PRICES_DB_PATH, recordObservation, type ObservationRow } from './store.ts';
import { WALMART_SELLER } from './walmart.ts';

// ---------------------------------------------------------------------------
// Step 1: read
// ---------------------------------------------------------------------------

/** How the page drew a word: render type (3 = invisible), upright, font, size. */
export interface WordInfo {
  readonly r: number;
  readonly u: boolean;
  readonly f: string;
  readonly s: number;
}

/** One word as PyMuPDF gives it: x0, y0, x1, y1, text, block, line, word number, and how it was drawn. */
export type Word = [number, number, number, number, string, number, number, number, (WordInfo | null)?];

export interface RawLink {
  readonly page: number;
  readonly bbox: readonly [number, number, number, number];
  readonly uri: string;
  readonly words: readonly Word[];
  /** Words touching the rectangle from outside. Absent in raw written before 2026-09-28's third audit. */
  readonly near?: readonly Word[];
  readonly image: string | null;
}

export interface RawPrintout {
  readonly sha256: string;
  readonly page_count: number;
  readonly doc_title: string | null;
  readonly creation_date: string | null;
  readonly mtime: string;
  readonly links: readonly RawLink[];
}

const READER = fileURLToPath(new URL('../scripts/read-printout.py', import.meta.url));

/**
 * The Python to run. SHIN_PYTHON wins; otherwise `python` on Windows (where
 * `python3` is often the Store stub) and `python3` elsewhere.
 */
export function pythonCommand(): string {
  return settings.SHIN_PYTHON() ?? (process.platform === 'win32' ? 'python' : 'python3');
}

export function readPrintout(pdfPath: string, imagesDir: string | null = null): RawPrintout {
  const args = [READER, pdfPath, ...(imagesDir ? ['--images', imagesDir] : [])];
  const out = execFileSync(pythonCommand(), args, { maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' });
  return JSON.parse(out) as RawPrintout;
}

// ---------------------------------------------------------------------------
// Step 2: keep
// ---------------------------------------------------------------------------

/** Any link that points at a product page: /ip/ anywhere in its path. Every one becomes a tile. */
export function isProductLink(uri: string): boolean {
  return /\/ip\//.test(uri);
}

/**
 * A Walmart product link's slug and id: /ip/<slug>/<id>, or /ip/<id> with no
 * slug (slug ''). Null when the link has /ip/ but no id can be read; such a
 * link still becomes a tile and a `no_product_id` drop.
 */
export function productLink(uri: string): { slug: string; id: string } | null {
  const m = /\/ip\/(?:([^/?#]+)\/)?([0-9A-Za-z]+)(?:[/?#]|$)/.exec(uri);
  return m ? { slug: m[1] ?? '', id: m[2] } : null;
}

/** The product id a tile is stored under: the link's id, or the link itself when it has none. */
function tileProductId(uri: string): string {
  return productLink(uri)?.id ?? `?${uri}`;
}

export interface CaptureOptions {
  readonly filePath: string;
  readonly sourceKind?: string;
  readonly seller?: string;
  /** 'unknown' when the page does not say; the 29 printouts do not. */
  readonly store?: string;
  readonly storeCategory?: string | null;
  /** ISO time the page was saved. Default: the PDF's creation date, else the file's mtime. */
  readonly capturedAt?: string | null;
  /**
   * The intake run (one CLI invocation, one person's session). With no store,
   * the captures of one run are one unknown store. Default: a new run per call.
   */
  readonly intakeRun?: string | null;
}

/** A fresh intake run id. */
export function newIntakeRun(): string {
  return `run-${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** "D:20260927231000-04'00'" -> "2026-09-27T23:10:00-04:00". Null when it is not that shape. */
export function pdfDate(d: string | null): string | null {
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/.exec(d ?? '');
  if (!m) return null;
  const tz = m[7] ? (m[7] === 'Z' ? 'Z' : m[7].replace(/'/g, '').replace(/(\d{2})(\d{2})$/, '$1:$2')) : '';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}${tz}`;
}

/**
 * Write one printout's raw rows. Idempotent on the file's sha256: the same
 * file read again returns the existing capture and writes nothing, because raw
 * is never edited. Returns the capture id and whether it was new.
 */
export function storeCapture(db: DatabaseSync, raw: RawPrintout, opts: CaptureOptions): { id: number; isNew: boolean } {
  const had = db.prepare('SELECT id FROM capture WHERE sha256 = ?').get(raw.sha256) as unknown as
    | { id: number }
    | undefined;
  if (had) return { id: had.id, isNew: false };
  const products = raw.links.filter((l) => isProductLink(l.uri));
  db.exec('BEGIN');
  try {
    const r = db
      .prepare(
        `INSERT INTO capture (file_path, sha256, source_kind, seller, store, store_category, captured_at,
                              page_count, doc_title, creation_date, other_links, ingested_at, intake_run)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        opts.filePath,
        raw.sha256,
        opts.sourceKind ?? 'printout_pdf',
        opts.seller ?? WALMART_SELLER,
        opts.store ?? 'unknown',
        opts.storeCategory ?? null,
        opts.capturedAt ?? pdfDate(raw.creation_date) ?? raw.mtime,
        raw.page_count,
        raw.doc_title,
        raw.creation_date,
        raw.links.length - products.length,
        new Date().toISOString(),
        opts.intakeRun ?? newIntakeRun(),
      );
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare(
      `INSERT INTO capture_tile (capture_id, page, x0, y0, x1, y1, retailer_product_id, retailer_url, words_json,
                                 tile_image, near_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const l of products) {
      ins.run(id, l.page, l.bbox[0], l.bbox[1], l.bbox[2], l.bbox[3], tileProductId(l.uri), l.uri,
        JSON.stringify(l.words), l.image, l.near === undefined ? null : JSON.stringify(l.near));
    }
    db.exec('COMMIT');
    return { id, isNew: true };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Step 3: derive. Pure functions of the raw rows.
// ---------------------------------------------------------------------------

/** No-break, thin and figure spaces read as a plain space, so `5$ 98` is `5$ 98` (same length). */
const ODD_SPACE = /[    ]/g;

interface Span {
  readonly start: number;
  readonly end: number;
  readonly word: Word;
}
interface Line {
  readonly text: string;
  readonly block: number;
  readonly spans: readonly Span[];
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Lines with, for every character range, the word it came from, so a token can be traced to its words. */
function lineSpans(words: readonly Word[]): Line[] {
  const out: { text: string; block: number; spans: Span[]; x0: number; y0: number; x1: number; y1: number }[] = [];
  let key = '';
  for (const w of words) {
    const k = `${w[5]}:${w[6]}`;
    let line = out[out.length - 1];
    if (k !== key || !line) {
      line = { text: '', block: w[5], spans: [], x0: w[0], y0: w[1], x1: w[2], y1: w[3] };
      out.push(line);
    } else {
      line.text += ' ';
    }
    const t = w[4].replace(ODD_SPACE, ' ');
    line.spans.push({ start: line.text.length, end: line.text.length + t.length, word: w });
    line.text += t;
    line.x0 = Math.min(line.x0, w[0]);
    line.y0 = Math.min(line.y0, w[1]);
    line.x1 = Math.max(line.x1, w[2]);
    line.y1 = Math.max(line.y1, w[3]);
    key = k;
  }
  return out;
}

/** The words of a tile as lines, in reading order (PyMuPDF block + line numbers). */
export function tileLines(words: readonly Word[]): string[] {
  return lineSpans(words).map((l) => l.text.trim()).filter(Boolean);
}

/*
 * ONE GRAMMAR FOR A MONEY TOKEN, used by the shelf price, the "was" price, a
 * multi-buy and a unit price alike. Eight capture groups, in order:
 *
 *   1,2  `5$ 98`, `1,299$ 00`   superscript cents              spelling 'sup'  (whole)
 *   3,4  `$5.98`, `$1,299.00`   plain decimal                  spelling 'dec'  (whole)
 *   5,6  `$598`                 no decimal shown               spelling 'bare'
 *   7    `$1,299`               whole dollars, thousands       spelling 'bare'
 *   8    `$5`                   whole dollars                  spelling 'bare'
 *
 * No alternative may start or end inside a longer number: each refuses a
 * digit, `.` or `,` on either side. Money no rule reads whole is "unparsed".
 */
const INT = String.raw`(\d{1,3}(?:,\d{3})+|\d{1,4})`;
const MONEY_SRC =
  String.raw`(?:(?<![\d.,])${INT}\$ ?(\d{2})(?![\d,])` +
  String.raw`|(?<![\d.,])\$ ?${INT}\.(\d{2})(?![\d,])` +
  String.raw`|(?<![\d.,])\$(\d{1,4})(\d{2})(?![\d.,])` +
  String.raw`|(?<![\d.,])\$ ?(\d{1,3}(?:,\d{3})+)(?![\d.,])` +
  String.raw`|(?<![\d.,])\$ ?(\d{1,2})(?![\d.,]))`;
/** Any word after a slash or "per" makes the money before it a unit price, never the shelf price. */
const PER_WORD = String.raw`(?:\s*/\s*(\d*\s*[A-Za-z]+)|\s+per\s+(\d*\s*[A-Za-z]+))`;

const PRICE_RE = new RegExp(MONEY_SRC, 'g');
/** Groups 1-8 money, 9 cents, 10 slash unit, 11 "per" unit. */
const UNIT_RE = new RegExp(String.raw`(?:${MONEY_SRC}|(?<![\d.,])(\d+(?:\.\d+)?)\s*¢)${PER_WORD}`, 'gi');
/** A multi-buy: "2 for $5.00", "2/$5.00", "2/$500". Group 1 the count, 2-9 money. */
const MULTI_RE = new RegExp(String.raw`(?<![\d.,])(\d{1,3})\s*(?:for|/)\s*${MONEY_SRC}`, 'gi');
/** A "was" price: "Was $4.27", "was 4$ 27", "Reg. $4.27". Groups 1-8 money. */
const WAS_RE = new RegExp(String.raw`\b(?:was|reg\.?)\s*:?\s*${MONEY_SRC}`, 'gi');
const MONEY_NC = MONEY_SRC.replace(/\((?!\?)/g, '(?:');
/**
 * Walmart's sale layout prints the old price struck through, with no "was" word:
 * "Now $3.97 $4.97 $1.13/100g". Measured on the 29 real printouts 2026-09-30: all
 * 49 sale tiles have this shape. Group 1 "Now" and the sale price, group 2 the old price.
 */
const NOW_WAS_RE = new RegExp(String.raw`(\bnow\s*:?\s*${MONEY_NC}\s+)(${MONEY_NC})`, 'gi');
/** "You save $1.00". Groups 1-8 money. */
const SAVE_RE = new RegExp(String.raw`\bsave\s*:?\s*${MONEY_SRC}`, 'gi');

/** The old price after "Now <price>", and the line with only that old price blanked. */
function takeNowWas(line: string): { cents: number | null; rest: string } {
  let cents: number | null = null;
  let rest = line;
  for (const m of line.matchAll(NOW_WAS_RE)) {
    const at = (m.index ?? 0) + m[1].length;
    const money = [...m[2].matchAll(PRICE_RE)][0];
    cents ??= money ? moneyAt(money, 1)!.cents : null;
    rest = rest.slice(0, at) + ' '.repeat(m[2].length) + rest.slice(at + m[2].length);
  }
  return { cents, rest };
}
/** A comma decimal (French: `3,47$`, `26,2¢`, `$3,47`). Never parsed. */
const COMMA_RE = /(?<![\d.,])\d{1,4},\d{1,2}(?![\d,])\s*(?:\$|¢)|\$\s?\d{1,4},\d{1,2}(?![\d,])/g;
/** Thousands grouped by a space (`1 299$ 00`, `$1 299.00`): read by nobody as a whole, never verified. */
const SPACE_THOUSANDS_RE = /\d \d{3}(?:\$| ?\$|\.\d{2})|\$ ?\d{1,3} \d{3}(?!\d)/;
/** Any money left over once every rule above has taken its tokens. */
const LEFTOVER_RE = /\$\s?\d|\d\s?\$|\d\s?¢/;
/** Digits other than 0-9 (Arabic-Indic, Devanagari, fullwidth, ...): never read. */
const OTHER_DIGIT_RE = /(?![0-9])\p{Nd}/u;
/** Money-like text of any kind, for the "no other money in the tile" check. */
const MONEYLIKE_RE = /[$¢]|[.,]\d{2}(?!\d)|(?![0-9])\p{Nd}/u;
/** A decimal money token, for judging a no-decimal spelling by its neighbours. */
const DECIMAL_MONEY_RE = /\$\s?\d[\d,]*\.\d{2}(?!\d)|\d[\d,]*\.\d{2}\s?\$/;
/** What may not come right before a price: count, range, "from", minus, US, or a digit (a split number). */
const BAD_BEFORE_RE = /(?:\bfor|\/|\bx|[-‒-―−]|\bto|\bfrom|\bstarting(?:\s+at)?|\bUS|\bUSD|\d|\bsave|\bwas|\breg\.?)\s*$/i;
/** What may not come right after a price on its line: a range, US/USD, a slash or "per". */
const BAD_AFTER_RE = /^\s*(?:[-‒-―−]|to\b|US\b|USD\b|\/|per\b|\d)/i;
/** A price whose next line starts like this is a unit price split over two lines, or a range. */
const BAD_NEXT_RE = /^\s*(?:\/|per\b|[-‒-―−]|to\b|US\b|USD\b|\.\d)/i;
const STOCK_RE = /out of stock|sold out|unavailable|not available/i;

/** 'bare_cents' is `$598`: dollars and 2-digit cents with the decimal point lost. 'bare' is `$5` or `$1,299`. */
type Spelling = 'sup' | 'dec' | 'bare_cents' | 'bare';

interface Money {
  readonly cents: number;
  readonly spelling: Spelling;
}

/** The money token in groups base..base+7 of a match built on MONEY_SRC. */
function moneyAt(m: RegExpMatchArray, base: number): Money | null {
  const g = (i: number) => m[base + i];
  const n = (s: string) => Number(s.replace(/,/g, ''));
  if (g(0) !== undefined) return { cents: n(g(0)) * 100 + Number(g(1)), spelling: 'sup' };
  if (g(2) !== undefined) return { cents: n(g(2)) * 100 + Number(g(3)), spelling: 'dec' };
  if (g(4) !== undefined) return { cents: Number(g(4)) * 100 + Number(g(5)), spelling: 'bare_cents' };
  if (g(6) !== undefined) return { cents: n(g(6)) * 100, spelling: 'bare' };
  if (g(7) !== undefined) return { cents: Number(g(7)) * 100, spelling: 'bare' };
  return null;
}

/** Every match of `re` on `line`, and the line with those spans blanked so no later rule reads them again. */
function take(line: string, re: RegExp): { matches: RegExpMatchArray[]; rest: string } {
  const matches = [...line.matchAll(re)];
  let rest = line;
  for (const m of matches) {
    const at = m.index ?? 0;
    rest = rest.slice(0, at) + ' '.repeat(m[0].length) + rest.slice(at + m[0].length);
  }
  return { matches, rest };
}

/** Every shelf price on one line, in the order they appear (unit, multi-buy and was prices excluded). */
export function pricesOnLine(line: string): number[] {
  let rest = take(line.replace(ODD_SPACE, ' '), COMMA_RE).rest;
  rest = take(rest, UNIT_RE).rest;
  rest = take(rest, MULTI_RE).rest;
  rest = take(rest, WAS_RE).rest;
  rest = takeNowWas(rest).rest;
  rest = take(rest, SAVE_RE).rest;
  return take(rest, PRICE_RE).matches.map((m) => moneyAt(m, 1)!.cents);
}

function normUnit(u: string): string {
  const s = u.toLowerCase().replace(/\s+/g, '');
  const m = /^(\d*)([a-z]+)$/.exec(s)!;
  const alias: Record<string, string> = { ea: 'each', count: 'each', ct: 'each', sheets: 'sheet', pcs: 'pc' };
  const unit = alias[m[2]] ?? m[2];
  return m[1] && m[1] !== '1' ? m[1] + unit : unit;
}

/**
 * Split superscript cents: `$5` and `98` as two words, the second right after
 * the first. Joined as `$5.98` only when the geometry is CLEAN: the second at
 * most 3/4 the height of the first and its bottom at least 1.5 pt above the
 * first's. Otherwise joined as `$598`, spelling 'bare', never verified.
 */
function joinSuperscripts(words: readonly Word[], origin: Map<Word, readonly Word[]>): Word[] {
  const out: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (b && /^\$\d{1,4}$/.test(a[4]) && /^\d{2}$/.test(b[4])) {
      const ha = a[3] - a[1];
      const hb = b[3] - b[1];
      const gap = b[0] - a[2];
      const overlapY = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (gap >= -1 && gap <= 0.6 * ha && overlapY > 0) {
        const clean = hb <= 0.75 * ha && a[3] - b[3] >= 1.5;
        const joined: Word = [a[0], Math.min(a[1], b[1]), b[2], Math.max(a[3], b[3]),
          clean ? `${a[4]}.${b[4]}` : `${a[4]}${b[4]}`, a[5], a[6], a[7], a[8] ?? null];
        origin.set(joined, [a, b]);
        out.push(joined);
        i += 1;
        continue;
      }
    }
    out.push(a);
  }
  return out;
}

/** The raw words behind a (possibly joined) word. */
function rawOf(w: Word, origin: ReadonlyMap<Word, readonly Word[]>): readonly Word[] {
  return origin.get(w) ?? [w];
}

/** Whether the text around [start, end) on `lines[i]` puts a count, range, minus, "from" or US before or after it. */
function badContext(lines: readonly Line[], i: number, start: number, end: number): boolean {
  const line = lines[i];
  if (BAD_BEFORE_RE.test(line.text.slice(0, start))) return true;
  if (BAD_AFTER_RE.test(line.text.slice(end))) return true;
  const h = line.y1 - line.y0;
  const near = (o: Line) => o.x1 > line.x0 - 20 && o.x0 < line.x1 + 20;
  const prev = lines.slice(0, i).reverse().find((o) => o.y1 <= line.y0 + 1 && line.y0 - o.y1 <= 1.5 * h && near(o));
  if (prev && BAD_BEFORE_RE.test(prev.text)) return true;
  const next = lines.slice(i + 1).find((o) => o.y0 >= line.y1 - 1 && o.y0 - line.y1 <= 1.5 * h && near(o));
  if (next && BAD_NEXT_RE.test(next.text)) return true;
  return false;
}

export interface PriceToken extends Money {
  /** No decimal shown and none beside it (same line or block), or a split superscript of unclear shape. */
  readonly ambiguous: boolean;
  /** One of its words was also inside another product's rectangle; the depth rule gave it to this tile. */
  readonly contested: boolean;
  /** A count, range, "from", minus or US sits right before or after it (its own line and neighbours). */
  readonly badContext: boolean;
  /** The raw words it was read from. */
  readonly words: readonly Word[];
  /** Font size and weight it was drawn in, or null when the reader gave none. */
  readonly style: { readonly size: number; readonly bold: boolean } | null;
  /** The rest of its own words, before or after the money ("−$4.97", "US$4.97"), is a bad context marker. */
  readonly edgeBad: boolean;
}

export interface TileReading {
  /** Shelf prices in reading order. Never a unit, multi-buy or "was" price. */
  readonly prices: readonly PriceToken[];
  /** "2 for $5.00": the count and the total, as printed. */
  readonly multi: { readonly count: number; readonly totalCents: number; readonly text: string; readonly contested: boolean } | null;
  readonly wasCents: number | null;
  /** "You save $1.00": the printed difference, used only to check the "was" price. */
  readonly saveCents: number | null;
  /** The unit price exactly as printed, e.g. "$2.62/100g" or "1$ 99/100g". */
  readonly unitPrinted: string | null;
  readonly unitCents: number | null;
  readonly unitPer: string | null;
  readonly saleMark: boolean;
  readonly byWeight: boolean;
  /** Comma-decimal money seen (`3,47$`), verbatim. Never parsed. */
  readonly commaDecimal: readonly string[];
  /** Money-looking text no rule could read whole, or digits other than 0-9. */
  readonly unparsed: readonly string[];
  /** Thousands grouped by a space somewhere in the tile. */
  readonly spaceThousands: boolean;
  /** The raw words the unit price was read from. */
  readonly unitWords: readonly Word[];
}

/**
 * Read one tile's words into a best guess. Knows nothing about names: those
 * come from the link. Whether the guess is VERIFIED is decided afterwards, by
 * `verifyPrice`, against the whole rectangle.
 *
 * `contested` holds the words the depth rule gave this tile over a rival.
 */
export function readTile(rawWords: readonly Word[], contested: ReadonlySet<Word> = new Set()): TileReading {
  const origin = new Map<Word, readonly Word[]>();
  const words = joinSuperscripts(rawWords, origin);
  const isContested = (w: Word) => rawOf(w, origin).some((r) => contested.has(r));
  const unclearJoin = (w: Word) => origin.has(w) && !w[4].includes('.');

  let wasCents: number | null = null;
  let saveCents: number | null = null;
  let unitPrinted: string | null = null;
  let unitCents: number | null = null;
  let unitPer: string | null = null;
  let multi: TileReading['multi'] = null;
  let saleMark = false;
  let byWeight = false;
  let spaceThousands = false;
  let unitWords: Word[] = [];
  const prices: PriceToken[] = [];
  const commaDecimal: string[] = [];
  const unparsed: string[] = [];
  const lines = lineSpans(words);
  const wordsOf = (line: Line, m: RegExpMatchArray) => {
    const a = m.index ?? 0;
    const b = a + m[0].length;
    return line.spans.filter((s) => s.start < b && s.end > a).map((s) => s.word);
  };
  lines.forEach((line, li) => {
    const text = line.text;
    if (/^(rollback|clearance|reduced price)\b/i.test(text.trim())) saleMark = true;
    if (/avg price|by weight/i.test(text)) byWeight = true;
    if (SPACE_THOUSANDS_RE.test(text)) spaceThousands = true;
    if (OTHER_DIGIT_RE.test(text)) unparsed.push(text.trim());

    const comma = take(text, COMMA_RE);
    for (const m of comma.matches) commaDecimal.push(m[0].trim());
    const unit = take(comma.rest, UNIT_RE);
    for (const m of unit.matches) {
      if (unitPrinted !== null) break;
      unitPrinted = m[0].trim();
      unitCents = m[9] !== undefined ? Number(m[9]) : moneyAt(m, 1)!.cents;
      unitPer = normUnit(m[10] ?? m[11]);
      unitWords = wordsOf(line, m).flatMap((w) => [...rawOf(w, origin)]);
    }
    const mb = take(unit.rest, MULTI_RE);
    for (const m of mb.matches) {
      if (multi !== null) break;
      multi = { count: Number(m[1]), totalCents: moneyAt(m, 2)!.cents, text: m[0].trim(), contested: wordsOf(line, m).some(isContested) };
    }
    const was = take(mb.rest, WAS_RE);
    for (const m of was.matches) wasCents ??= moneyAt(m, 1)!.cents;
    const nowWas = takeNowWas(was.rest);
    wasCents ??= nowWas.cents;
    const save = take(nowWas.rest, SAVE_RE);
    for (const m of save.matches) saveCents ??= moneyAt(m, 1)!.cents;
    const shelf = take(save.rest, PRICE_RE);
    for (const m of shelf.matches) {
      const money = moneyAt(m, 1)!;
      const own = wordsOf(line, m);
      const at = m.index ?? 0;
      const lineRest = text.slice(0, at) + ' '.repeat(m[0].length) + text.slice(at + m[0].length);
      const blockRest = lines.filter((l) => l !== line && l.block === line.block).map((l) => l.text).join(' ');
      const decimalBeside = DECIMAL_MONEY_RE.test(lineRest) || DECIMAL_MONEY_RE.test(blockRest);
      prices.push({
        ...money,
        ambiguous: own.some(unclearJoin) || ((money.spelling === 'bare' || money.spelling === 'bare_cents') && !decimalBeside),
        contested: own.some(isContested),
        badContext: badContext(lines, li, at, at + m[0].length),
        words: own.flatMap((w) => [...rawOf(w, origin)]),
        style: styleOf(own.flatMap((w) => [...rawOf(w, origin)])),
        edgeBad: (() => {
          const first = line.spans.find((sp) => sp.end > at);
          const last = [...line.spans].reverse().find((sp) => sp.start < at + m[0].length);
          const before = first ? text.slice(first.start, at) : '';
          const after = last ? text.slice(at + m[0].length, last.end) : '';
          return (before !== '' && BAD_BEFORE_RE.test(before)) || (after !== '' && BAD_AFTER_RE.test(after));
        })(),
      });
    }
    if (LEFTOVER_RE.test(shelf.rest)) unparsed.push(shelf.rest.replace(/\s+/g, ' ').trim());
  });
  return { prices, multi, wasCents, saveCents, unitPrinted, unitCents, unitPer, saleMark, byWeight, commaDecimal, unparsed, spaceThousands, unitWords };
}

function styleOf(words: readonly Word[]): PriceToken['style'] {
  const infos = words.map((w) => w[8]).filter((i): i is WordInfo => !!i);
  if (infos.length === 0 || infos.length !== words.length) return null;
  return { size: Math.max(...infos.map((i) => i.s)), bold: infos.every((i) => /bold|black|heavy/i.test(i.f)) };
}

/**
 * The shelf read: the tile's largest shelf-price token by font size, then bold,
 * then reading order. Without drawing information (raw from a reader that gave
 * none), the first whole, clear token.
 */
export function shelfCandidate(r: TileReading): PriceToken | null {
  if (r.prices.length === 0) return null;
  if (r.prices.some((p) => p.style === null)) return bestGuess(r);
  return r.prices.reduce((best, p) =>
    p.style!.size > best.style!.size || (p.style!.size === best.style!.size && p.style!.bold && !best.style!.bold) ? p : best,
  );
}

/** The best guess among a tile's shelf prices: the first whole, clear one, else the first. */
function bestGuess(r: TileReading): PriceToken | null {
  return r.prices.find((p) => (p.spelling === 'sup' || p.spelling === 'dec') && !p.ambiguous && !p.badContext) ?? r.prices[0] ?? null;
}

/** The product name from a Walmart slug: "Kraft-Smooth-Peanut-Butter-1-kg" -> "Kraft Smooth Peanut Butter 1 kg". */
export function nameFromSlug(slug: string): string {
  let s = slug;
  try {
    s = decodeURIComponent(slug);
  } catch {
    // a malformed escape is kept as written
  }
  // "2-5-kg" is 2.5 kg. Only one or two digits after the dash, so "12-355-ml" stays 12 355 ml.
  s = s.replace(/(\d)-(\d{1,2})-(kg|g|ml|l|lb|oz)\b/gi, '$1.$2 $3');
  // "Campbell-s" is Campbell's: a lone "s" word after a word is a possessive the slug lost.
  s = s.replace(/(\w)-s(?=-|$)/g, "$1's");
  return s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const SIZE_UNITS: Record<string, readonly [string, number]> = {
  g: ['g', 1], gr: ['g', 1], kg: ['g', 1000], lb: ['g', 453.6], lbs: ['g', 453.6], oz: ['g', 28.35],
  ml: ['ml', 1], cl: ['ml', 10], l: ['ml', 1000], lt: ['ml', 1000], litre: ['ml', 1000], liter: ['ml', 1000],
  'fl oz': ['ml', 29.57], count: ['each', 1], ct: ['each', 1], pk: ['each', 1], pack: ['each', 1], pcs: ['each', 1],
};
const SIZE_RE = /(?:(\d+)\s*(?:x|\/)\s*)?(\d+(?:[.,]\d+)?)\s*(fl oz|kg|gr|g|ml|cl|lt|litre|liter|l|lbs|lb|oz|count|ct|pk|pack|pcs)\b/gi;

/** Sizes in a name, as [base unit, amount in base units] plus the text they were read from. */
export function sizesIn(name: string): { base: string; amount: number; text: string }[] {
  const out: { base: string; amount: number; text: string }[] = [];
  for (const m of name.matchAll(SIZE_RE)) {
    const [base, k] = SIZE_UNITS[m[3].toLowerCase()];
    const v = Number(m[2].replace(',', '.')) * k;
    if (!(v > 0)) continue;
    out.push({ base, amount: v, text: m[0].trim() });
    if (m[1]) out.push({ base, amount: v * Number(m[1]), text: m[0].trim() });
  }
  return out;
}

const PER: Record<string, readonly [string, number]> = {
  g: ['g', 1], '100g': ['g', 100], kg: ['g', 1000], lb: ['g', 453.6],
  ml: ['ml', 1], '100ml': ['ml', 100], l: ['ml', 1000], each: ['each', 1], oz: ['g', 28.35],
};

/**
 * Standing check 2: price / size against the printed unit price. Returns null
 * when the tile lacks one side (nothing to compare), otherwise whether they
 * agree and the computed figures. Tolerance is the prototype's: within 3% or
 * 1 cent, and any of the name's sizes may agree (12 x 355 ml is 355 and 4260).
 */
export function unitAgreement(
  priceCents: number,
  name: string,
  unitCents: number | null,
  unitPer: string | null,
): { agrees: boolean; computed: number[] } | null {
  if (unitCents === null || unitPer === null) return null;
  const per = PER[unitPer];
  if (!per) return null; // an unusual base ("10g") is left unchecked rather than guessed at
  const same = sizesIn(name).filter((s) => s.base === per[0]);
  if (same.length === 0) return null;
  const computed = same.map((s) => Math.round(((priceCents / s.amount) * per[1]) * 10) / 10);
  const tol = Math.max(1, 0.03 * unitCents);
  return { agrees: computed.some((c) => Math.abs(c - unitCents) <= tol), computed };
}

/** "Pasta & Pasta Sauce | Walmart Canada" -> "Pasta & Pasta Sauce". */
export function categoryFromTitle(title: string | null): string | null {
  if (!title) return null;
  const c = title.split('|')[0].trim();
  return c || null;
}

export interface Drop {
  readonly seller: string;
  /** The capture's store ('unknown' when the page does not say). */
  readonly store: string;
  readonly retailerProductId: string;
  readonly seenOn: string;
  readonly captureTileId: number | null;
  readonly reason:
    | 'no_price_in_tile'
    /** The only price inside the rectangle sits where a neighbouring product's rectangle also reaches. */
    | 'price_only_in_overlap'
    /** The tile's only money is a unit price ("$0.26/sheet"); no shelf price was printed. */
    | 'no_shelf_price'
    /** The tile's price is written with a decimal comma (`3,47$`); not parsed. */
    | 'comma_decimal'
    /** Money-looking text no rule could read whole, or digits other than 0-9. */
    | 'unparsed_price'
    /** The link has /ip/ but no product id could be read from it. */
    | 'no_product_id'
    | 'no_name_in_link'
    /** The same product on the same day from another store (or another unknown-store capture) already holds the key. */
    | 'same_key_other_store'
    | 'key_held_by_other_source';
}

interface TileRow {
  id: number;
  capture_id: number;
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  retailer_product_id: string;
  retailer_url: string;
  words_json: string;
  near_json: string | null;
  tile_image: string | null;
  seller: string;
  store: string;
  store_category: string | null;
  doc_title: string | null;
  captured_at: string;
  intake_run: string | null;
}

const TORONTO_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * The day a capture's prices were seen, in America/Toronto: a page saved at
 * 11:18 PM on the 27th is the 27th, though its PDF stamps 03:18 UTC on the
 * 28th. A timestamp with no zone is taken as already local.
 */
export function seenOn(capturedAt: string): string {
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(capturedAt)) return capturedAt.slice(0, 10);
  const d = new Date(capturedAt);
  return Number.isNaN(d.getTime()) ? capturedAt.slice(0, 10) : TORONTO_DATE.format(d);
}

/**
 * Which store a tile's price belongs to, for grouping. A named store groups
 * with itself. An unknown store groups with the captures of its own intake run
 * (one person's session, one store), never with another run's.
 */
function storeKey(t: TileRow): string {
  return t.store === 'unknown' ? `unknown@${t.intake_run ?? `capture${t.capture_id}`}` : t.store;
}

function holds(t: TileRow, w: Word): boolean {
  const cx = (w[0] + w[2]) / 2;
  const cy = (w[1] + w[3]) / 2;
  return t.x0 <= cx && cx <= t.x1 && t.y0 <= cy && cy <= t.y1;
}

const EDGES = ['x0', 'x1', 'y0', 'y1'] as const;

/**
 * How far inside `t` the word's centre sits, measured only to the edges the
 * competing rectangles do NOT share with it.
 */
function depthAgainst(t: TileRow, w: Word, rivals: readonly TileRow[]): number {
  const cx = (w[0] + w[2]) / 2;
  const cy = (w[1] + w[3]) / 2;
  const dist = { x0: cx - t.x0, x1: t.x1 - cx, y0: cy - t.y0, y1: t.y1 - cy };
  let d = Infinity;
  for (const e of EDGES) {
    if (rivals.every((r) => Math.abs(r[e] - t[e]) <= 1)) continue;
    d = Math.min(d, dist[e]);
  }
  return d;
}

/**
 * A tile's OWN words, for the best guess. A word two products' rectangles both
 * hold goes to the one it sits clearly deeper inside, else to nobody. Any price
 * read from such a word is flagged `overlap_assigned` and never verified.
 */
function ownWords(
  t: TileRow,
  words: readonly Word[],
  samePage: readonly TileRow[],
): { own: Word[]; contested: Set<Word> } {
  const contested = new Set<Word>();
  const own = words.filter((w) => {
    const holding = samePage.filter((o) => holds(o, w));
    if (new Set(holding.map((o) => o.retailer_product_id)).size <= 1) return true;
    const byProduct = new Map<string, number>();
    for (const o of holding) {
      const rivals = holding.filter((r) => r.retailer_product_id !== o.retailer_product_id);
      const d = depthAgainst(o, w, rivals);
      byProduct.set(o.retailer_product_id, Math.max(d, byProduct.get(o.retailer_product_id) ?? -1));
    }
    const ranked = [...byProduct].sort((a, b) => b[1] - a[1]);
    const [[owner, best], [, second]] = ranked;
    const mine = owner === t.retailer_product_id && best >= 2 * second && best - second >= 10;
    if (mine) contested.add(w);
    return mine;
  });
  return { own, contested };
}

function fold(s: string): string[] {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((x) => /[a-z]{2,}/.test(x));
}

/** A weight range printed on a by-weight tile: "0.15 - 0.23 KG". */
const WEIGHT_RANGE_RE = /(\d+(?:[.,]\d+)?)\s*[-\u2012-\u2015]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|lbs?)\b/i;
/** Money-like text once the shelf price, its unit price and any weight range are blanked. */
const OTHER_MONEY_RE = /[$¢]|(?<![\d.,])\d*[.,]\d{2}(?!\d)(?!\s*(?:kg|g|l|ml|lbs?|oz|cm|mm|m|%|x|pk|ct|pack|count)\b)|(?![0-9])\p{Nd}/iu;
/** Flags the second read resolves; every other flag blocks verification. */
const RESOLVED_BY_SECOND_READ = new Set(['ambiguous_dollar_spelling', 'price_by_weight']);

/** The second read, unit_agrees: printed unit price vs shelf price / size, within 3%. */
export function unitAgreesStrict(priceCents: number, texts: readonly string[], unitCents: number | null, unitPer: string | null): boolean {
  if (unitCents === null || unitPer === null || !(unitCents > 0)) return false;
  const per = PER[unitPer];
  if (!per) return false;
  return texts
    .flatMap((t) => sizesIn(t))
    .filter((z) => z.base === per[0])
    .some((z) => Math.abs((priceCents / z.amount) * per[1] - unitCents) <= 0.03 * unitCents);
}

/** Cents of rounding in a printed unit price: "15¢" is 1, "65.9¢" 0.1, "$1.52/kg" 1, "$1.5/kg" 10. */
function unitResolution(printed: string): number {
  const cents = /(\d+(?:\.(\d+))?)\s*¢/.exec(printed);
  if (cents) return 10 ** -(cents[2]?.length ?? 0);
  const dollars = /\$\s?\d+(?:\.(\d+))?/.exec(printed);
  return 10 ** (2 - (dollars?.[1]?.length ?? 0));
}

/**
 * The second read, by_weight: on an "avg price" tile, the avg price is the unit
 * price times the upper end of the printed weight range, within the rounding of
 * the printed unit price (half its last digit) and of the price (half a cent).
 */
export function byWeightAgrees(priceCents: number, texts: readonly string[], unitCents: number | null, unitPer: string | null, unitPrinted: string | null): boolean {
  if (unitCents === null || unitPer === null || unitPrinted === null) return false;
  const per = PER[unitPer];
  if (!per || per[0] !== 'g') return false;
  const range = texts.map((t) => WEIGHT_RANGE_RE.exec(t)).find((m) => m !== null);
  if (!range) return false;
  const k = SIZE_UNITS[range[3].toLowerCase()]?.[1] ?? 1;
  const hiGrams = Number(range[2].replace(',', '.')) * k;
  const units = hiGrams / per[1];
  const half = unitResolution(unitPrinted) / 2;
  return priceCents >= (unitCents - half) * units - 0.5 && priceCents <= (unitCents + half) * units + 0.5;
}

export type VerifiedBy = 'unit_agrees' | 'by_weight';

/**
 * The shelf read, the second read, and the safety checks in the header.
 * Returns the checks that FAILED (empty: verified) and which second read held.
 * Pure: reads only raw-derived values.
 */
function verifyPrice(
  t: TileRow,
  token: PriceToken | null,
  r: TileReading,
  own: readonly Word[],
  all: readonly Word[],
  near: readonly Word[] | null,
  samePage: readonly TileRow[],
  name: string,
  flags: readonly string[],
): { fails: string[]; by: VerifiedBy | null } {
  const fails: string[] = [];
  if (!token) return { fails: ['no_shelf_price'], by: null };
  // The shelf read: a whole spelling, or `$NNN` cents-flattened in bold shelf style.
  if (token.spelling === 'bare' || (token.spelling === 'bare_cents' && !token.style?.bold)) fails.push('spelling');
  if (token.words.some((w) => w[8] && /\//.test(w[4]))) fails.push('spelling');
  if (near === null) fails.push('no_near_words');
  const want = new Set(fold(name));
  const titleLines = lineSpans(own).filter((l) => {
    const toks = fold(l.text);
    return toks.length > 0 && !/[$¢]/.test(l.text) && toks.filter((x) => want.has(x)).length >= Math.max(1, 0.6 * toks.length);
  });
  const texts = [name, ...titleLines.map((l) => l.text), ...lineSpans(all).map((l) => l.text)];
  // The second read.
  let by: VerifiedBy | null = null;
  if (r.byWeight) {
    if (byWeightAgrees(token.cents, texts, r.unitCents, r.unitPer, r.unitPrinted)) by = 'by_weight';
  } else if (unitAgreesStrict(token.cents, [name, ...titleLines.map((l) => l.text)], r.unitCents, r.unitPer)) {
    by = 'unit_agrees';
  }
  if (!by) fails.push('no_second_read');
  // (a) no other money in or touching the rectangle, besides the shelf price and its unit price.
  const skip = new Set([...token.words, ...r.unitWords]);
  const rectLines = lineSpans([...all, ...(near ?? [])].slice().sort((p, q) => p[1] - q[1] || p[0] - q[0] || p[5] - q[5]));
  for (const l of rectLines) {
    let text = l.text;
    for (const sp of l.spans) if (skip.has(sp.word)) text = text.slice(0, sp.start) + ' '.repeat(sp.end - sp.start) + text.slice(sp.end);
    text = text.replace(new RegExp(WEIGHT_RANGE_RE.source, 'gi'), (m) => ' '.repeat(m.length));
    if (OTHER_MONEY_RE.test(text)) {
      fails.push('other_money');
      break;
    }
  }
  // (b) inside this rectangle and no other product's.
  const rivals = samePage.filter((o) => o.retailer_product_id !== t.retailer_product_id);
  if (token.contested || token.words.some((w) => rivals.some((o) => holds(o, w)))) fails.push('in_other_rect');
  // (c) no count, range, "from", minus or US around it, judged on everything in the rectangle
  // EXCEPT its unit price: on the real layout the unit price follows the shelf price on the
  // same line ("$644 16¢/100ml"), and it is the second read, not a context word.
  const tokenWords = new Set(token.words);
  const unitSet = new Set(r.unitWords);
  const ctxLines = lineSpans(
    [...all, ...(near ?? [])].filter((w) => !unitSet.has(w)).sort((p, q) => p[1] - q[1] || p[0] - q[0] || p[5] - q[5]),
  );
  const li = ctxLines.findIndex((l) => l.spans.some((sp) => tokenWords.has(sp.word)));
  if (li < 0 || token.edgeBad) fails.push('context');
  else {
    const spans = ctxLines[li].spans.filter((sp) => tokenWords.has(sp.word));
    if (badContext(ctxLines, li, spans[0].start, spans[spans.length - 1].end)) fails.push('context');
  }
  // (d) visible and upright.
  for (const w of token.words) {
    const info = w[8];
    if (!info) fails.push('no_render_info');
    else {
      if (info.r === 3) fails.push('invisible');
      if (!info.u) fails.push('rotated');
    }
  }
  // (e) directly above the tile's own printed title.
  const ty1 = Math.max(...token.words.map((w) => w[3]));
  const tx0 = Math.min(...token.words.map((w) => w[0]));
  const tx1 = Math.max(...token.words.map((w) => w[2]));
  if (!titleLines.some((l) => l.y0 >= ty1 - 1 && l.y0 - ty1 <= 60 && l.x1 > tx0 - 20 && l.x0 < tx1 + 20)) {
    fails.push('not_above_title');
  }
  // (f) no stock status.
  if (STOCK_RE.test([...all, ...(near ?? [])].map((w) => w[4]).join(' '))) fails.push('stock_status');
  // (g) no flag the second read does not resolve.
  if (flags.some((f) => !RESOLVED_BY_SECOND_READ.has(f.split(':')[0]))) fails.push('flagged');
  const unique = [...new Set(fails)];
  return { fails: unique, by: unique.length === 0 ? by : null };
}

export interface Derived {
  readonly rows: ObservationRow[];
  readonly drops: Drop[];
  /** For each row key "seller/sku/day", the verification checks that failed (empty: verified). */
  readonly unverifiedBecause: ReadonlyMap<string, readonly string[]>;
  /** For each verified row key, which second read held. */
  readonly verifiedBy: ReadonlyMap<string, VerifiedBy>;
}

/**
 * Every observation row the raw tables imply, and every product link that
 * could not become one with the reason. Reads capture and capture_tile ONLY.
 */
export function deriveFromRaw(db: DatabaseSync): Derived {
  const tiles = db
    .prepare(
      `SELECT t.id, t.capture_id, t.page, t.x0, t.y0, t.x1, t.y1, t.retailer_product_id, t.retailer_url, t.words_json,
              t.near_json, t.tile_image, c.seller, c.store, c.store_category, c.doc_title, c.captured_at, c.intake_run
         FROM capture_tile t JOIN capture c ON c.id = t.capture_id
        ORDER BY t.capture_id, t.page, t.y0, t.x0, t.id`,
    )
    .all() as unknown as TileRow[];
  const pages = new Map<string, TileRow[]>();
  for (const t of tiles) {
    const k = `${t.capture_id}:${t.page}`;
    const p = pages.get(k);
    if (p) p.push(t);
    else pages.set(k, [t]);
  }
  const groups = new Map<string, TileRow[]>();
  for (const t of tiles) {
    const k = JSON.stringify([t.seller, storeKey(t), t.retailer_product_id, seenOn(t.captured_at)]);
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const rows: ObservationRow[] = [];
  const drops: Drop[] = [];
  const because = new Map<string, readonly string[]>();
  const verifiedBy = new Map<string, VerifiedBy>();
  const taken = new Map<string, ObservationRow>();
  for (const g of groups.values()) {
    const first = g[0];
    const day = seenOn(first.captured_at);
    const drop = (reason: Drop['reason']) =>
      drops.push({ seller: first.seller, store: first.store, retailerProductId: first.retailer_product_id, seenOn: day, captureTileId: first.id, reason });
    const link = productLink(first.retailer_url);
    if (!link) {
      drop('no_product_id');
      continue;
    }
    const name = nameFromSlug(link.slug);
    if (!/[A-Za-z]{2,}/.test(name)) {
      drop('no_name_in_link');
      continue;
    }
    const read = g.map((t) => {
      const all = JSON.parse(t.words_json) as Word[];
      const near = t.near_json === null ? null : (JSON.parse(t.near_json) as Word[]);
      const samePage = pages.get(`${t.capture_id}:${t.page}`) ?? [];
      const { own, contested } = ownWords(t, all, samePage);
      return { t, all, near, own, samePage, r: readTile(own, contested), whole: readTile(all) };
    });
    if (read.some((x) => x.r.unparsed.length > 0)) {
      drop('unparsed_price');
      continue;
    }
    const hasPrice = (r: TileReading) => r.prices.length > 0 || r.multi !== null;
    const priced = read.filter((x) => hasPrice(x.r));
    if (priced.length === 0) {
      if (read.some((x) => x.r.commaDecimal.length > 0)) drop('comma_decimal');
      else if (read.some((x) => hasPrice(x.whole))) drop('price_only_in_overlap');
      else if (read.some((x) => x.r.unitPrinted !== null)) drop('no_shelf_price');
      else drop('no_price_in_tile');
      continue;
    }
    const chosen = priced[0];
    const { t, r, whole } = chosen;
    const token = shelfCandidate(r);
    const flags: string[] = [];
    let priceCents: number;
    if (token) {
      priceCents = token.cents;
      if (token.ambiguous) flags.push(`ambiguous_dollar_spelling:${priceCents}`);
      if (token.contested) flags.push('overlap_assigned');
      if (r.multi) flags.push(`multi_buy_offer:${r.multi.count} for ${r.multi.totalCents}`);
    } else {
      // Only a multi-buy was printed: the row holds the price of one, and says so.
      const m = r.multi!;
      priceCents = Math.round(m.totalCents / m.count);
      flags.push(`multi_buy:${m.count} for ${m.totalCents}`);
      if (m.contested) flags.push('overlap_assigned');
    }
    if (!(priceCents > 0)) {
      drop('unparsed_price'); // a zero price is a misreading, never a price
      continue;
    }
    if (r.commaDecimal.length > 0) flags.push(`comma_decimal:${r.commaDecimal.join('|')}`);
    if (r.spaceThousands || whole.spaceThousands) flags.push('space_thousands');
    const distinctInTile = [...new Set(r.prices.map((p) => p.cents))];
    if (distinctInTile.length > 1) flags.push(`multiple_prices_in_tile:${distinctInTile.join(',')}`);
    const chosenOf = (x: TileReading) => shelfCandidate(x)?.cents ?? Math.round(x.multi!.totalCents / x.multi!.count);
    const distinctAcross = [...new Set(priced.map((x) => chosenOf(x.r)))];
    if (distinctAcross.length > 1) flags.push(`conflicting_prices:${distinctAcross.join(',')}`);
    if (whole.prices.length > r.prices.length) flags.push('neighbour_price_ignored');
    if (r.byWeight) flags.push('price_by_weight');
    if (r.wasCents !== null && r.wasCents <= priceCents) flags.push(`was_not_above_price:was=${r.wasCents},price=${priceCents}`);
    if (r.wasCents !== null && r.saveCents !== null && r.wasCents - priceCents !== r.saveCents) {
      flags.push(`save_disagrees:was=${r.wasCents},price=${priceCents},save=${r.saveCents}`);
    }
    let unitCents = r.unitCents;
    const agreement = unitAgreement(priceCents, name, r.unitCents, r.unitPer);
    if (agreement && !agreement.agrees) {
      flags.push(`unit_price_disagrees:printed=${r.unitCents}/${r.unitPer},computed=${agreement.computed.join('|')}`);
      unitCents = null; // withheld: the printed text stays in unit_label, the number is not used
    }
    // The same product, same day, from another store or another unknown-store capture: never merged.
    const pk = `${t.seller}/${t.retailer_product_id}/${day}`;
    const earlier = taken.get(pk);
    if (earlier) {
      drop('same_key_other_store');
      const f = earlier.flags ? (JSON.parse(earlier.flags) as string[]) : [];
      if (!f.includes('other_store_same_day')) {
        const updated = { ...earlier, flags: JSON.stringify([...f, 'other_store_same_day']), priceVerified: 0 };
        rows[rows.indexOf(earlier)] = updated;
        taken.set(pk, updated);
        because.set(pk, [...(because.get(pk) ?? []), 'flagged']);
        verifiedBy.delete(pk);
      }
      continue;
    }
    const { fails, by } = verifyPrice(t, token, r, chosen.own, chosen.all, chosen.near, chosen.samePage, name, flags);
    const sale = r.saleMark || r.wasCents !== null;
    const size = sizesIn(name)[0]?.text ?? null;
    const row: ObservationRow = {
      code: null,
      seller: t.seller,
      sellerSku: t.retailer_product_id,
      sellerName: name,
      sellerBrand: null,
      priceCents,
      kind: sale ? 'promotional' : 'regular',
      unitPriceCents: unitCents,
      unitLabel: r.unitPrinted,
      currency: 'CAD',
      country: 'CA',
      region: null,
      joinMethod: 'none',
      pageGtin: null,
      seenOn: day,
      url: t.retailer_url,
      imageUrl: null,
      inStock: null,
      // store.ts's convention: NULL store_name is "unknown". The raw capture row keeps the literal 'unknown'.
      storeName: t.store === 'unknown' ? null : t.store,
      storeCity: null,
      storeOsm: null,
      basePriceCents: null,
      storeCategory: t.store_category ?? categoryFromTitle(t.doc_title),
      wasCents: r.wasCents,
      isSale: sale ? 1 : 0,
      unitPricePer: r.unitPer,
      // No brand list is consulted here, and a guessed brand is worse than none.
      parsedBrand: null,
      parsedSize: size,
      parsedVariant: null,
      captureTileId: t.id,
      tileImage: t.tile_image,
      flags: flags.length ? JSON.stringify(flags) : null,
      priceVerified: fails.length === 0 ? 1 : 0,
    };
    rows.push(row);
    taken.set(pk, row);
    because.set(pk, fails);
    if (by) verifiedBy.set(pk, by);
  }
  return { rows, drops, unverifiedBecause: because, verifiedBy };
}

/** The observation columns a derived row fills, with the ObservationRow field each comes from. */
const COMPARED: readonly (readonly [keyof ObservationRow, string])[] = [
  ['code', 'code'], ['sellerName', 'seller_name'], ['sellerBrand', 'seller_brand'], ['priceCents', 'price_cents'],
  ['kind', 'kind'], ['unitPriceCents', 'unit_price_cents'], ['unitLabel', 'unit_label'], ['currency', 'currency'],
  ['country', 'country'], ['region', 'region'], ['joinMethod', 'join_method'], ['pageGtin', 'page_gtin'],
  ['url', 'url'], ['imageUrl', 'image_url'], ['inStock', 'in_stock'], ['storeName', 'store_name'],
  ['storeCity', 'store_city'], ['storeOsm', 'store_osm'], ['basePriceCents', 'base_price_cents'],
  ['storeCategory', 'store_category'], ['wasCents', 'was_cents'], ['isSale', 'is_sale'],
  ['unitPricePer', 'unit_price_per'], ['parsedBrand', 'parsed_brand'], ['parsedSize', 'parsed_size'],
  ['parsedVariant', 'parsed_variant'], ['captureTileId', 'capture_tile_id'], ['tileImage', 'tile_image'],
  ['flags', 'flags'], ['priceVerified', 'price_verified'],
];

function storedAt(db: DatabaseSync, seller: string, sku: string, day: string): Record<string, unknown> | undefined {
  return db
    .prepare('SELECT * FROM observation WHERE seller = ? AND seller_sku = ? AND seen_on = ?')
    .get(seller, sku, day) as Record<string, unknown> | undefined;
}

export interface ApplyReport {
  readonly written: number;
  readonly drops: readonly Drop[];
  /** Rows written with price_verified = 1. */
  readonly verified: number;
}

/**
 * Write what the raw tables imply. A key already held by a row from another
 * source (a crawl row, capture_tile_id NULL) is not overwritten: INSERT OR
 * REPLACE would delete that row, code and all. It is logged as a drop instead,
 * unless this intake wrote that key itself earlier (the `capture_written`
 * ledger), in which case someone else replaced or unlinked OUR row and that is
 * left for `checkRebuild` to report, not quietly logged as expected.
 * Rows are never deleted here.
 */
export function applyDerived(db: DatabaseSync): ApplyReport {
  const { rows, drops } = deriveFromRaw(db);
  const all: Drop[] = [...drops];
  let written = 0;
  let verified = 0;
  const ledger = db.prepare(
    'SELECT 1 FROM capture_written WHERE seller = ? AND retailer_product_id = ? AND seen_on = ?',
  );
  const record = db.prepare(
    // OR IGNORE, never OR REPLACE: the ledger is append-only (triggers refuse UPDATE and DELETE).
    `INSERT OR IGNORE INTO capture_written (seller, retailer_product_id, seen_on, capture_tile_id, written_at)
     VALUES (?,?,?,?,?)`,
  );
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const held = storedAt(db, row.seller, row.sellerSku, row.seenOn);
      if (held && held.capture_tile_id === null) {
        if (!ledger.get(row.seller, row.sellerSku, row.seenOn)) {
          all.push({ seller: row.seller, store: row.storeName ?? 'unknown', retailerProductId: row.sellerSku, seenOn: row.seenOn, captureTileId: row.captureTileId ?? null, reason: 'key_held_by_other_source' });
        }
        continue;
      }
      recordObservation(db, row);
      record.run(row.seller, row.sellerSku, row.seenOn, row.captureTileId ?? null, now);
      written += 1;
      if (row.priceVerified === 1) verified += 1;
    }
    db.exec('DELETE FROM capture_drop');
    const ins = db.prepare(
      `INSERT OR REPLACE INTO capture_drop (seller, store, retailer_product_id, seen_on, capture_tile_id, reason)
       VALUES (?,?,?,?,?,?)`,
    );
    for (const d of all) ins.run(d.seller, d.store, d.retailerProductId, d.seenOn, d.captureTileId, d.reason);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { written, drops: all, verified };
}

export interface RebuildCheck {
  /** True only when every stored raw-derived row is exactly what raw alone rebuilds. */
  readonly ok: boolean;
  readonly compared: number;
  /** Raw implies a row that is not stored. */
  readonly missing: readonly string[];
  /** A stored raw-derived row that raw no longer implies (its tile or file was deleted). */
  readonly extra: readonly string[];
  readonly differ: readonly { key: string; column: string; stored: unknown; rebuilt: unknown }[];
  /**
   * A row this intake wrote (the ledger says so) that is gone, or whose
   * capture_tile_id is now NULL: unlinked by hand, or replaced by another
   * writer's INSERT OR REPLACE. Red: the raw-derived layer lost a row.
   */
  readonly unlinked: readonly string[];
  /** A stored raw-derived row with no ledger entry: written by something other than this intake. Red. */
  readonly unledgered: readonly string[];
  /** Raw implies a row whose key a non-raw row held BEFORE intake; expected, not a failure. */
  readonly heldByOther: number;
}

/**
 * The rebuild check (A1 done-when): rebuild every raw-derived observation row
 * from raw alone and compare it, column by column, with what is stored.
 */
export function checkRebuild(db: DatabaseSync): RebuildCheck {
  const { rows } = deriveFromRaw(db);
  const missing: string[] = [];
  const differ: { key: string; column: string; stored: unknown; rebuilt: unknown }[] = [];
  const expected = new Set<string>();
  const unlinked = new Set<string>();
  let heldByOther = 0;
  let compared = 0;
  const wrote = new Set(
    (
      db.prepare('SELECT seller, retailer_product_id, seen_on FROM capture_written').all() as unknown as {
        seller: string;
        retailer_product_id: string;
        seen_on: string;
      }[]
    ).map((r) => `${r.seller}/${r.retailer_product_id}/${r.seen_on}`),
  );
  for (const row of rows) {
    const key = `${row.seller}/${row.sellerSku}/${row.seenOn}`;
    const stored = storedAt(db, row.seller, row.sellerSku, row.seenOn);
    if (!stored) {
      if (wrote.has(key)) unlinked.add(key);
      else missing.push(key);
      continue;
    }
    if (stored.capture_tile_id === null) {
      if (wrote.has(key)) unlinked.add(key);
      else heldByOther += 1;
      continue;
    }
    expected.add(key);
    compared += 1;
    for (const [field, column] of COMPARED) {
      const rebuilt = row[field] ?? (field === 'priceVerified' ? 0 : null);
      if (stored[column] !== rebuilt) differ.push({ key, column, stored: stored[column], rebuilt });
    }
  }
  // A ledger key raw no longer implies, whose stored row is gone or unlinked, is lost too.
  for (const key of wrote) {
    if (expected.has(key) || unlinked.has(key)) continue;
    const [seller, sku, day] = key.split('/');
    const stored = storedAt(db, seller, sku, day);
    if (!stored || stored.capture_tile_id === null) unlinked.add(key);
  }
  const extra = (
    db
      .prepare('SELECT seller, seller_sku, seen_on FROM observation WHERE capture_tile_id IS NOT NULL')
      .all() as unknown as { seller: string; seller_sku: string; seen_on: string }[]
  )
    .map((r) => `${r.seller}/${r.seller_sku}/${r.seen_on}`);
  // Every raw-derived row must be one this intake wrote.
  const unledgered = extra.filter((k) => !wrote.has(k)).sort();
  const extraOnly = extra.filter((k) => !expected.has(k));
  return {
    ok: missing.length === 0 && extraOnly.length === 0 && differ.length === 0 && unlinked.size === 0 && unledgered.length === 0,
    compared,
    missing,
    extra: extraOnly,
    differ,
    unlinked: [...unlinked].sort(),
    unledgered,
    heldByOther,
  };
}

export interface RawFileCheck {
  /** True only when every capture's file is present, hashes to what was kept, and (if re-read) gives the same tiles. */
  readonly ok: boolean;
  readonly checked: number;
  readonly missingFile: readonly string[];
  readonly hashMismatch: readonly string[];
  /** Re-reading the file gave different product tiles from the ones kept (only when `reread`). */
  readonly tileMismatch: readonly string[];
}

/**
 * Raw against the file it came from, kept apart from the rebuild check:
 * `checkRebuild` proves the observation layer matches raw; this proves raw
 * still matches the file. Re-hashes each capture's file against its sha256;
 * with `reread`, also re-reads the PDF (needs Python) and compares the product
 * tiles, word for word (inside and near words), with the stored ones.
 */
export function checkRawFiles(db: DatabaseSync, options: { reread?: boolean } = {}): RawFileCheck {
  const caps = db.prepare('SELECT id, file_path, sha256 FROM capture ORDER BY id').all() as unknown as {
    id: number;
    file_path: string;
    sha256: string;
  }[];
  const missingFile: string[] = [];
  const hashMismatch: string[] = [];
  const tileMismatch: string[] = [];
  for (const c of caps) {
    const label = `capture ${c.id} (${c.file_path})`;
    if (!existsSync(c.file_path)) {
      missingFile.push(label);
      continue;
    }
    const sha = createHash('sha256').update(readFileSync(c.file_path)).digest('hex');
    if (sha !== c.sha256) {
      hashMismatch.push(label);
      continue;
    }
    if (!options.reread) continue;
    const fresh = readPrintout(c.file_path)
      .links.filter((l) => isProductLink(l.uri))
      .map((l) => JSON.stringify([l.page, ...l.bbox, l.uri, JSON.stringify(l.words), l.near === undefined ? null : JSON.stringify(l.near)]));
    const kept = (
      db
        .prepare('SELECT page, x0, y0, x1, y1, retailer_url, words_json, near_json FROM capture_tile WHERE capture_id = ? ORDER BY id')
        .all(c.id) as unknown as { page: number; x0: number; y0: number; x1: number; y1: number; retailer_url: string; words_json: string; near_json: string | null }[]
    ).map((t) => JSON.stringify([t.page, t.x0, t.y0, t.x1, t.y1, t.retailer_url, t.words_json, t.near_json]));
    if (fresh.length !== kept.length || fresh.some((f, i) => f !== kept[i])) {
      tileMismatch.push(`${label}: file gives ${fresh.length} product tiles, raw holds ${kept.length}`);
    }
  }
  return {
    ok: missingFile.length === 0 && hashMismatch.length === 0 && tileMismatch.length === 0,
    checked: caps.length,
    missingFile,
    hashMismatch,
    tileMismatch,
  };
}

// ---------------------------------------------------------------------------
// Intake: read + keep + derive
// ---------------------------------------------------------------------------

export interface IntakeReport {
  readonly captureId: number;
  readonly newCapture: boolean;
  /** Product links in the file: every one is a tile. */
  readonly tiles: number;
  readonly products: number;
  readonly otherLinks: number;
  readonly apply: ApplyReport;
}

export function intakeRaw(db: DatabaseSync, raw: RawPrintout, opts: CaptureOptions): IntakeReport {
  const cap = storeCapture(db, raw, opts);
  const products = raw.links.filter((l) => isProductLink(l.uri));
  return {
    captureId: cap.id,
    newCapture: cap.isNew,
    tiles: products.length,
    products: new Set(products.map((l) => tileProductId(l.uri))).size,
    otherLinks: raw.links.length - products.length,
    apply: applyDerived(db),
  };
}

export function intakePrintout(
  db: DatabaseSync,
  pdfPath: string,
  opts: Omit<CaptureOptions, 'filePath'> & { imagesDir?: string | null } = {},
): IntakeReport {
  const raw = readPrintout(pdfPath, opts.imagesDir ?? null);
  return intakeRaw(db, raw, { ...opts, filePath: resolve(pdfPath) });
}

function main(argv: string[]): void {
  const flag = (name: string): string | null => {
    const i = argv.indexOf(name);
    if (i < 0) return null;
    const v = argv[i + 1];
    argv.splice(i, 2);
    return v ?? null;
  };
  const dbPath = flag('--db') ?? PRICES_DB_PATH;
  const store = flag('--store') ?? 'unknown';
  const storeCategory = flag('--category');
  const capturedAt = flag('--captured-at');
  const imagesDir = flag('--images');
  const intakeRun = newIntakeRun(); // every file of this invocation is one session
  if (argv.length === 0) {
    process.stderr.write('usage: node src/capture-printout.ts <file.pdf>... [--store NAME] [--category NAME] [--captured-at ISO] [--images DIR] [--db PATH]\n');
    process.exitCode = 2;
    return;
  }
  const db = openPrices(dbPath);
  try {
    for (const pdf of argv) {
      const r = intakePrintout(db, pdf, { store, storeCategory, capturedAt, imagesDir, intakeRun });
      const why = new Map<string, number>();
      for (const d of r.apply.drops) why.set(d.reason, (why.get(d.reason) ?? 0) + 1);
      console.log(
        `${pdf}: capture ${r.captureId}${r.newCapture ? '' : ' (already kept)'}; ${r.tiles} product links, ` +
          `${r.products} products, ${r.otherLinks} other links; rows written (all captures) ${r.apply.written}, ` +
          `verified ${r.apply.verified}; drops ${[...why].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
      );
    }
    const c = checkRebuild(db);
    console.log(
      `rebuild check: ${c.ok ? 'OK' : 'RED'}; compared ${c.compared}, missing ${c.missing.length}, ` +
        `extra ${c.extra.length}, differ ${c.differ.length}, unlinked ${c.unlinked.length}, unledgered ${c.unledgered.length}, ` +
        `held by another source ${c.heldByOther}`,
    );
    const f = checkRawFiles(db, { reread: true });
    console.log(
      `raw vs file check: ${f.ok ? 'OK' : 'RED'}; ${f.checked} captures, missing file ${f.missingFile.length}, ` +
        `hash mismatch ${f.hashMismatch.length}, tile mismatch ${f.tileMismatch.length}`,
    );
    if (!c.ok || !f.ok) process.exitCode = 1;
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
