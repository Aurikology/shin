/**
 * Measuring 2.2: "Place items correctly. Pass when 95%+ right at category-or-parent
 * (190 of 200) on 200+ random hand-checked items per route, with the 95% lower bound
 * reported" (docs/price-category-requirements-2026-10-01.md line 46).
 *
 *   node src/placement-audit.ts draw  --db <catalogue.db> --out <sheet.csv> [--per-route 200] [--seed 1]
 *   node src/placement-audit.ts score --sheet <marked sheet.csv>
 *
 * DRAW. For every route that placed items (placed_by: path, barcode, text, meaning,
 * claude, top-level), 200 items drawn at random (a seeded shuffle, so the same seed
 * draws the same items) into one CSV sheet: the item, where it was placed (the path
 * from the top of its department), at what level and confidence, and three blank
 * columns a PERSON fills: right_at_category_or_parent (y/n), correct_category (when
 * wrong), marked_by. A route with fewer than 200 items is drawn whole and the
 * shortfall is reported. A sheet that already exists is never written over: it may
 * hold somebody's marks. Nothing here marks anything.
 *
 * SCORE. Reads a marked sheet. Per route: marked, right, wrong, unmarked, the share
 * right, and the exact one-sided 95% lower bound (Clopper-Pearson). A route passes
 * when at least 200 rows are marked and at least 95% of them are right (190 of 200).
 * A mark that is not y/n/yes/no, or a mark with no marked_by, stops the score. An
 * unmarked row is counted, and a sheet with any is incomplete and does not pass.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CASCADE_ROUTES, PlacementTree } from './placement-cascade.ts';

export const AUDIT_PER_ROUTE = 200;
export const AUDIT_TARGET = 0.95;
export const AUDIT_CONFIDENCE = 0.95;

export const AUDIT_COLUMNS = [
  'route',
  'department',
  'code',
  'name',
  'brands',
  'placed_path',
  'level',
  'confidence',
  'right_at_category_or_parent',
  'correct_category',
  'marked_by',
  'note',
] as const;
export type AuditColumn = (typeof AUDIT_COLUMNS)[number];
export type AuditRow = Record<AuditColumn, string>;

/* -------------------------------------------------------------- the bound */

function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** P(X >= k) for X ~ Binomial(n, p). */
function upperTail(k: number, n: number, p: number): number {
  if (p <= 0) return k <= 0 ? 1 : 0;
  if (p >= 1) return 1;
  let s = 0;
  for (let i = k; i <= n; i++) s += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p));
  return Math.min(1, s);
}

/** The exact one-sided lower confidence bound on a proportion (Clopper-Pearson): k right of n. */
export function clopperPearsonLower(k: number, n: number, confidence = AUDIT_CONFIDENCE): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`clopperPearsonLower: n ${n} must be a positive whole number`);
  if (!Number.isInteger(k) || k < 0 || k > n) throw new Error(`clopperPearsonLower: k ${k} must be a whole number from 0 to n (${n})`);
  const alpha = 1 - confidence;
  if (k === 0) return 0;
  if (k === n) return alpha ** (1 / n);
  let lo = 0;
  let hi = k / n;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (upperTail(k, n, mid) < alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* --------------------------------------------------------------- the draw */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AuditDraw {
  readonly rows: AuditRow[];
  readonly shortfall: Record<string, { wanted: number; available: number }>;
}

export function drawAuditSample(db: DatabaseSync, opts: { readonly perRoute?: number; readonly seed?: number; readonly routes?: readonly string[] } = {}): AuditDraw {
  const perRoute = opts.perRoute ?? AUDIT_PER_ROUTE;
  const seed = opts.seed ?? 1;
  const present = (db.prepare(`SELECT DISTINCT placed_by FROM item_placement WHERE placed_by <> 'unplaced'`).all() as unknown as { placed_by: string }[]).map((r) => r.placed_by);
  const order = ['path', ...CASCADE_ROUTES] as string[];
  const routes = (opts.routes ?? present).filter((r) => present.includes(r)).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1);
  });
  for (const r of opts.routes ?? []) if (!present.includes(r)) throw new Error(`drawAuditSample: no item was placed by route ${r}`);
  const tree = PlacementTree.load(db);
  const codesOf = db.prepare('SELECT code FROM item_placement WHERE placed_by = ? ORDER BY code');
  const item = db.prepare(
    `SELECT p.code, p.name, p.name_en, p.name_fr, p.brands, ip.leaf_id, ip.level, ip.confidence, n.department
       FROM product p JOIN item_placement ip ON ip.code = p.code JOIN placement_node n ON n.node_id = ip.leaf_id WHERE p.code = ?`,
  );
  const rows: AuditRow[] = [];
  const shortfall: AuditDraw['shortfall'] = {};
  routes.forEach((route, ri) => {
    const codes = (codesOf.all(route) as unknown as { code: string }[]).map((r) => r.code);
    const rnd = mulberry32(seed * 1000003 + ri);
    const take = Math.min(perRoute, codes.length);
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(rnd() * (codes.length - i));
      [codes[i], codes[j]] = [codes[j]!, codes[i]!];
    }
    if (codes.length < perRoute) shortfall[route] = { wanted: perRoute, available: codes.length };
    for (const code of codes.slice(0, take)) {
      const r = item.get(code) as {
        code: string; name: string; name_en: string | null; name_fr: string | null; brands: string | null;
        leaf_id: number; level: number | null; confidence: number | null; department: string;
      };
      const names = [...new Set([r.name_en, r.name_fr, r.name].filter((x): x is string => !!x && x.trim() !== ''))];
      const path = tree.pathOf(r.leaf_id);
      rows.push({
        route,
        department: r.department,
        code: r.code,
        name: names.join(' / '),
        brands: r.brands ?? '',
        placed_path: path.length > 0 ? path.join(' > ') : `(${r.department}, top level only)`,
        level: r.level === null ? '' : String(r.level),
        confidence: r.confidence === null ? '' : r.confidence.toFixed(3),
        right_at_category_or_parent: '',
        correct_category: '',
        marked_by: '',
        note: '',
      });
    }
  });
  return { rows, shortfall };
}

/* ---------------------------------------------------------------- the CSV */

function cell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function auditSheetCsv(rows: readonly AuditRow[]): string {
  return [AUDIT_COLUMNS.join(','), ...rows.map((r) => AUDIT_COLUMNS.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

/** RFC 4180 CSV: quoted fields may hold commas, doubled quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  let any = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += ch;
      continue;
    }
    if (ch === '"') {
      q = true;
      any = true;
    } else if (ch === ',') {
      row.push(f);
      f = '';
      any = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
      any = false;
    } else {
      f += ch;
      any = true;
    }
  }
  if (q) throw new Error('parseCsv: a quoted field never closes');
  if (any || f !== '' || row.length > 0) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

/** Writes a sheet; refuses a path that exists, because it may hold a person's marks. */
export function writeAuditSheet(rows: readonly AuditRow[], path: string): void {
  if (existsSync(path)) throw new Error(`writeAuditSheet: ${path} exists; a sheet that may hold marks is never overwritten`);
  writeFileSync(path, auditSheetCsv(rows), { encoding: 'utf8', flag: 'wx' });
}

/* -------------------------------------------------------------- the score */

export interface RouteScore {
  readonly marked: number;
  readonly right: number;
  readonly wrong: number;
  readonly unmarked: number;
  readonly share: number | null;
  /** Exact one-sided 95% lower bound on the share right; null with nothing marked. */
  readonly lowerBound95: number;
  readonly pass: boolean;
}

export interface SheetScore {
  readonly routes: Record<string, RouteScore>;
  readonly complete: boolean;
  readonly pass: boolean;
}

const YES = new Set(['y', 'yes']);
const NO = new Set(['n', 'no']);

export function scoreAuditSheet(text: string): SheetScore {
  const rows = parseCsv(text.replace(/^﻿/, '')).filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) throw new Error('scoreAuditSheet: the sheet is empty, there is no header');
  const head = rows[0]!.map((h) => h.trim());
  const col = (name: AuditColumn) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`scoreAuditSheet: the sheet has no "${name}" column`);
    return i;
  };
  const cRoute = col('route');
  const cCode = col('code');
  const cMark = col('right_at_category_or_parent');
  const cBy = col('marked_by');
  const acc = new Map<string, { right: number; wrong: number; unmarked: number }>();
  rows.slice(1).forEach((r, i) => {
    const route = (r[cRoute] ?? '').trim();
    if (!route) throw new Error(`scoreAuditSheet: row ${i + 2} has no route`);
    const a = acc.get(route) ?? { right: 0, wrong: 0, unmarked: 0 };
    acc.set(route, a);
    const mark = (r[cMark] ?? '').trim().toLowerCase();
    if (mark === '') {
      a.unmarked += 1;
      return;
    }
    if (!YES.has(mark) && !NO.has(mark)) throw new Error(`scoreAuditSheet: row ${i + 2} (${r[cCode]}) is marked "${r[cMark]}"; a mark is y or n`);
    if ((r[cBy] ?? '').trim() === '') throw new Error(`scoreAuditSheet: row ${i + 2} (${r[cCode]}) is marked but its marked_by is empty; a person signs each mark`);
    if (YES.has(mark)) a.right += 1;
    else a.wrong += 1;
  });
  const routes: Record<string, RouteScore> = {};
  let complete = true;
  for (const [route, a] of acc) {
    const marked = a.right + a.wrong;
    if (a.unmarked > 0) complete = false;
    routes[route] = {
      marked,
      right: a.right,
      wrong: a.wrong,
      unmarked: a.unmarked,
      share: marked === 0 ? null : a.right / marked,
      lowerBound95: marked === 0 ? 0 : clopperPearsonLower(a.right, marked),
      pass: marked >= AUDIT_PER_ROUTE && a.right / marked >= AUDIT_TARGET,
    };
  }
  const all = Object.values(routes);
  return { routes, complete, pass: complete && all.length > 0 && all.every((r) => r.pass) };
}

/* -------------------------------------------------------------------- CLI */

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function main(argv: readonly string[]): number {
  try {
    if (argv[0] === 'draw') {
      const dbPath = arg('--db', argv);
      const out = arg('--out', argv);
      if (!dbPath || !out) throw new Error('usage: draw --db <catalogue.db> --out <sheet.csv> [--per-route 200] [--seed 1]');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const d = drawAuditSample(db, { perRoute: Number(arg('--per-route', argv) ?? AUDIT_PER_ROUTE), seed: Number(arg('--seed', argv) ?? 1) });
        writeAuditSheet(d.rows, out);
        const per: Record<string, number> = {};
        for (const r of d.rows) per[r.route] = (per[r.route] ?? 0) + 1;
        console.log(`placement-audit: wrote ${d.rows.length} rows to ${out}: ${JSON.stringify(per)}`);
        if (Object.keys(d.shortfall).length > 0) console.error(`placement-audit: routes with fewer than ${AUDIT_PER_ROUTE} items, drawn whole: ${JSON.stringify(d.shortfall)}`);
      } finally {
        db.close();
      }
      return 0;
    }
    if (argv[0] === 'score') {
      const sheet = arg('--sheet', argv);
      if (!sheet) throw new Error('usage: score --sheet <marked sheet.csv>');
      const s = scoreAuditSheet(readFileSync(sheet, 'utf8'));
      for (const [route, r] of Object.entries(s.routes)) {
        console.log(
          `placement-audit: ${route}: ${r.right} right of ${r.marked} marked (${r.unmarked} unmarked), share ${r.share === null ? 'n/a' : (r.share * 100).toFixed(1) + '%'}, 95% lower bound ${(r.lowerBound95 * 100).toFixed(1)}%: ${r.pass ? 'PASS' : 'FAIL'}`,
        );
      }
      if (!s.pass) {
        console.error(`placement-audit FAILED: ${s.complete ? 'a route is under 190 of 200' : 'the sheet is not fully marked'}`);
        return 1;
      }
      return 0;
    }
    throw new Error('usage: draw ... | score ...');
  } catch (err) {
    console.error(`placement-audit FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
