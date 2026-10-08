/**
 * Fetch the Open Food Facts category taxonomy for the category safeguards.
 *
 *   node src/fetch-categories.ts [source] [out] [--txt <url-or-path>] [--no-synonyms]
 *
 * `source` is categories.json (a URL or a local path); it defaults to
 * https://static.openfoodfacts.org/data/taxonomies/categories.json. `out` defaults to
 * data/off-categories.json. The synonyms are not in the JSON: they live in categories.txt, which
 * `--txt` names (a URL or a path; for a URL source ending .json it defaults to the same URL with
 * .txt). The txt is parsed and its synonyms are merged into the JSON entries as
 * `synonyms: {lang: [...]}`.
 *
 * FAILS LOUDLY. The job stops, installing nothing, when the JSON is not a non-empty object of
 * tag to entry, when no txt is named (pass --no-synonyms to say you mean it), when the txt cannot
 * be read, or when fewer than 99% of the txt's blocks match a JSON key. The match rate is printed
 * every run, with the first unmatched blocks. The sha256 and date are printed so they can be
 * recorded in category-baseline.json (the check fails loudly when the file's hash is not the
 * baseline's).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeName, taxonomyFromObject } from './category-taxonomy.ts';

/** Lower case, non-letters to '-', accents KEPT: how OFF keys protected names in other languages ("de:münchener-biere"). */
function normalizeKeepingAccents(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

export const DEFAULT_SOURCE = 'https://static.openfoodfacts.org/data/taxonomies/categories.json';
export const DEFAULT_TXT_SOURCE = 'https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/taxonomies/food/categories.txt';
export const MIN_MATCH_RATE = 0.99;

/** Read the bytes from a URL or a local path. */
export async function readSource(source: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`fetch ${source} answered ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(source);
}

/* ---------------------------------------------------------- categories.txt */

export interface TxtBlock {
  /** `lang:slug` of the block's first language line. */
  readonly key: string;
  /** The same with accents kept, which is how OFF keys some non-English entries. */
  readonly altKey: string;
  /** Names by language: the first term of each language line. */
  readonly names: Record<string, string>;
  /** Extra terms by language: every term after the first. */
  readonly synonyms: Record<string, string[]>;
  /** Parent keys, from the "< lang: Name" lines. */
  readonly parents: string[];
}

/** A language line: "fr: Boissons, boisson". A property line ("wikidata:en: Q1") does not match. */
const LANG_LINE = /^([a-z]{2,3}(?:[-_][a-z0-9]+)?):\s*(.*)$/;
const PARENT_LINE = /^<\s*([a-z]{2,3}(?:[-_][a-z0-9]+)?):\s*(.*)$/;

/** Split on commas that are not escaped with a backslash; "\," is a literal comma. */
export function splitTerms(text: string): string[] {
  return text
    .split(/(?<!\\),/)
    .map((t) => t.replace(/\\,/g, ',').trim())
    .filter((t) => t !== '');
}

/**
 * Parse categories.txt. Blocks are separated by blank lines. A block is an entry when it has at
 * least one language line; the synonym-header blocks ("synonyms:en: a, b"), stopword blocks and
 * comment-only blocks have none and are skipped. Comment lines (#) and property lines are ignored.
 */
export function parseCategoriesTxt(text: string): TxtBlock[] {
  const blocks: TxtBlock[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    const names: Record<string, string> = {};
    const synonyms: Record<string, string[]> = {};
    const parents: string[] = [];
    let key: string | null = null;
    let altKey = '';
    for (const line of raw.split('\n')) {
      if (line.trim() === '' || line.startsWith('#')) continue;
      const pm = PARENT_LINE.exec(line);
      if (pm) {
        const terms = splitTerms(pm[2]!);
        if (terms.length > 0) parents.push(`${pm[1]}:${normalizeName(terms[0]!)}`);
        continue;
      }
      const lm = LANG_LINE.exec(line);
      if (!lm) continue; // a property line, a "synonyms:xx:" header, or a stopwords line
      const terms = splitTerms(lm[2]!);
      if (terms.length === 0) continue;
      const lang = lm[1]!;
      if (key === null) {
        key = `${lang}:${normalizeName(terms[0]!)}`;
        altKey = `${lang}:${normalizeKeepingAccents(terms[0]!)}`;
      }
      if (names[lang] === undefined) {
        names[lang] = terms[0]!;
        if (terms.length > 1) synonyms[lang] = terms.slice(1);
      } else {
        synonyms[lang] = [...(synonyms[lang] ?? []), ...terms];
      }
    }
    if (key !== null) blocks.push({ key, altKey, names, synonyms, parents });
  }
  return blocks;
}

export interface MergeReport {
  readonly blocks: number;
  readonly matched: number;
  readonly rate: number;
  readonly unmatched: string[];
  readonly entriesWithSynonyms: number;
}

/**
 * Merge the txt's synonyms into the JSON entries (a new object; the input is not changed).
 * Throws when fewer than MIN_MATCH_RATE of the txt's blocks match a JSON key.
 */
export function mergeSynonyms(json: Record<string, Record<string, unknown>>, blocks: readonly TxtBlock[]): { merged: Record<string, Record<string, unknown>>; report: MergeReport } {
  if (blocks.length === 0) throw new Error('categories.txt holds no entries: nothing to merge, and an empty parse is not a pass');
  const byKey = new Map<string, string>();
  for (const k of Object.keys(json)) byKey.set(k.toLowerCase(), k);
  const merged: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(json)) merged[k] = { ...v };
  const extra = new Map<string, Record<string, Set<string>>>();
  const unmatched: string[] = [];
  let matched = 0;
  for (const b of blocks) {
    const real = byKey.get(b.key) ?? byKey.get(b.altKey);
    if (real === undefined) {
      unmatched.push(b.key);
      continue;
    }
    matched += 1;
    const bucket = extra.get(real) ?? {};
    for (const [lang, list] of Object.entries(b.synonyms)) {
      const set = (bucket[lang] ??= new Set());
      for (const s of list) set.add(s);
    }
    extra.set(real, bucket);
  }
  let withSyn = 0;
  for (const [real, bucket] of extra) {
    const existing = (merged[real]!.synonyms ?? {}) as Record<string, string[]>;
    const out: Record<string, string[]> = {};
    for (const [lang, list] of Object.entries(existing)) out[lang] = [...list];
    for (const [lang, set] of Object.entries(bucket)) {
      const have = new Set(out[lang] ?? []);
      for (const s of set) have.add(s);
      if (have.size > 0) out[lang] = [...have];
    }
    if (Object.keys(out).length > 0) {
      merged[real]!.synonyms = out;
      withSyn += 1;
    }
  }
  const rate = matched / blocks.length;
  const report: MergeReport = { blocks: blocks.length, matched, rate, unmatched: unmatched.slice(0, 10), entriesWithSynonyms: withSyn };
  if (rate < MIN_MATCH_RATE) {
    throw new Error(
      `categories.txt matched only ${matched} of ${blocks.length} blocks to a JSON key (${(rate * 100).toFixed(2)}%, the floor is ${MIN_MATCH_RATE * 100}%); ` +
        `first unmatched: ${report.unmatched.join(', ')}. The two files may be different versions, or the name normalisation is wrong.`,
    );
  }
  return { merged, report };
}

/* ----------------------------------------------------------------- install */

/** Validate the JSON (and merge the txt when given) and write the result to `out`. Throws before writing on a bad file. */
export function installTaxonomy(bytes: Buffer, out: string, txt?: string): { sha256: string; entries: number; report: MergeReport | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('categories.json is not valid JSON');
  }
  taxonomyFromObject(parsed, ''); // throws on a non-object or an empty file, before anything is written
  let outBytes = bytes;
  let report: MergeReport | null = null;
  if (txt !== undefined) {
    const { merged, report: r } = mergeSynonyms(parsed as Record<string, Record<string, unknown>>, parseCategoriesTxt(txt));
    report = r;
    outBytes = Buffer.from(JSON.stringify(merged), 'utf8');
  }
  const sha256 = createHash('sha256').update(outBytes).digest('hex');
  const tax = taxonomyFromObject(JSON.parse(outBytes.toString('utf8')) as unknown, sha256);
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.part`;
  writeFileSync(tmp, outBytes);
  renameSync(tmp, out);
  return { sha256, entries: tax.size, report };
}

function takeFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`);
  argv.splice(i, 2);
  return v;
}

async function main(args: readonly string[]): Promise<number> {
  const here = dirname(fileURLToPath(import.meta.url));
  const argv = [...args];
  try {
    const txtArg = takeFlag(argv, '--txt');
    const noSynonyms = argv.includes('--no-synonyms');
    const rest = argv.filter((a) => a !== '--no-synonyms');
    const source = rest[0] ?? DEFAULT_SOURCE;
    const out = rest[1] ?? join(here, '..', 'data', 'off-categories.json');
    let txtSource = txtArg;
    // The static host serves the JSON only; categories.txt lives in the Open Food Facts server repo.
    if (txtSource === undefined && !noSynonyms && source === DEFAULT_SOURCE) txtSource = DEFAULT_TXT_SOURCE;
    if (txtSource === undefined && !noSynonyms) {
      throw new Error('no categories.txt named: pass --txt <url-or-path>, or --no-synonyms to install the JSON without synonyms');
    }
    const txt = txtSource === undefined ? undefined : (await readSource(txtSource)).toString('utf8');
    const { sha256, entries, report } = installTaxonomy(await readSource(source), out, txt);
    console.log(`taxonomy: ${entries} entries from ${source} -> ${out}`);
    if (report) {
      console.log(`synonyms: ${report.matched} of ${report.blocks} txt blocks matched a JSON key (${(report.rate * 100).toFixed(2)}%); ${report.entriesWithSynonyms} entries carry synonyms`);
      if (report.unmatched.length > 0) console.log(`  first unmatched: ${report.unmatched.join(', ')}`);
    } else {
      console.log('synonyms: NONE merged (--no-synonyms); labels can resolve by key and name only');
    }
    console.log(`sha256 ${sha256}`);
    console.log(`fetched ${new Date().toISOString().slice(0, 10)}   (record both in category-baseline.json)`);
    return 0;
  } catch (err) {
    console.error(`taxonomy fetch FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => {
    process.exitCode = c;
  });
}
