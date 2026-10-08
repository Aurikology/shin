/**
 * The Open Food Facts category taxonomy as a reference the category safeguards
 * check against (docs/category-safeguards-2026-10-08.md, Part A).
 *
 * The file is `categories.json` from static.openfoodfacts.org/data/taxonomies/:
 * a JSON object whose keys are tags ("en:cheeses") and whose values carry
 * `parents` (the direct parents) and `children`. `fetch-categories.ts` also reads
 * `categories.txt` and merges its synonyms in as `synonyms: {lang: [...]}`, and
 * installs the result at catalogue/data/off-categories.json; its sha256 is
 * recorded in category-baseline.json so a changed file is noticed.
 *
 * Everything here is pure and read-only. A missing or unreadable file THROWS
 * (`TaxonomyError`): a check that cannot run must say so, never read as zero.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export class TaxonomyError extends Error {
  readonly reason: 'missing' | 'unreadable' | 'empty';
  constructor(reason: 'missing' | 'unreadable' | 'empty', message: string) {
    super(message);
    this.name = 'TaxonomyError';
    this.reason = reason;
  }
}

export interface Taxonomy {
  /** sha256 of the file's bytes, hex. */
  readonly sha256: string;
  /** How many entries the file holds. */
  readonly size: number;
  /** True when the tag is an entry of the taxonomy (case folded). */
  has(tag: string): boolean;
  /** The direct parents of a tag, empty for a root or an unknown tag. */
  parentsOf(tag: string): readonly string[];
  /** True when `ancestor` is a STRICT ancestor of `descendant` (a tag is not its own ancestor). */
  isAncestor(ancestor: string, descendant: string): boolean;
  /** Every strict ancestor of a tag, empty for a root or an unknown tag. */
  ancestorsOf(tag: string): ReadonlySet<string>;
  /** Length of the longest chain from a root to the tag: 0 for a root or an unknown tag. */
  depthOf(tag: string): number;
  /**
   * The taxonomy entry a raw category label means, or null when none does:
   * exact key; else `lang:slug` against every entry's names and synonyms in that
   * language; else, for a label with no language prefix, English then French;
   * else the alias file. Never guesses beyond those four steps.
   */
  resolveLabel(label: string): string | null;
}

/** Aliases: a raw label (normalised) to a taxonomy key. Loaded from catalogue/category-aliases.json. */
export type AliasMap = ReadonlyMap<string, string>;

const COMBINING = /[̀-ͯ]/g;
/** OFF writes some letters out in Latin rather than decomposing them. */
const LETTER_MAP: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', ı: 'i' };

/** Tags are compared lower-cased and trimmed, the way product_category stores them. */
export function foldTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * A name in OFF tag form: lower case, accents stripped, every run of
 * non-letters-and-digits one '-', no leading or trailing '-'. "Jus d'orange"
 * becomes "jus-d-orange". Letters of other scripts are kept.
 */
export function normalizeName(name: string): string {
  const lower = name.normalize('NFD').replace(COMBINING, '').toLowerCase();
  const mapped = lower.replace(/[ßæœøđłı]/g, (c) => LETTER_MAP[c] ?? c);
  return mapped.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

const LANG_PREFIX = /^([a-z]{2,3}(?:[-_][a-z0-9]+)?):(.*)$/;

/** Split "fr:jus d'orange" into its language and the rest; null when the label has no language prefix. */
function splitPrefix(label: string): { lang: string; rest: string } | null {
  const m = LANG_PREFIX.exec(label.trim().toLowerCase());
  return m ? { lang: m[1]!, rest: m[2]!.trim() } : null;
}

interface RawEntry {
  parents?: unknown;
  name?: unknown;
  synonyms?: unknown;
}

/** Build a taxonomy from parsed JSON. `sha256` is passed in so the same bytes give the same hash. */
export function taxonomyFromObject(obj: unknown, sha256: string, aliases?: AliasMap): Taxonomy {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TaxonomyError('unreadable', 'the taxonomy is not a JSON object of tag -> entry');
  }
  const parents = new Map<string, readonly string[]>();
  const hasChildren = new Set<string>();
  /** `lang:slug` to { key to "matched by the entry's name, not only a synonym" }. */
  const index = new Map<string, Map<string, boolean>>();
  const addIndex = (lang: string, text: unknown, key: string, isName: boolean): void => {
    if (typeof text !== 'string') return;
    const slug = normalizeName(text);
    if (slug === '') return;
    const k = `${lang.toLowerCase()}:${slug}`;
    let m = index.get(k);
    if (!m) index.set(k, (m = new Map()));
    m.set(key, (m.get(key) ?? false) || isName);
  };
  for (const [rawKey, entry] of Object.entries(obj as Record<string, unknown>)) {
    const key = foldTag(rawKey);
    const e = (entry ?? {}) as RawEntry;
    const p = e.parents;
    const ps = Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string').map(foldTag) : [];
    parents.set(key, ps);
    for (const up of ps) hasChildren.add(up);
    if (e.name && typeof e.name === 'object') {
      for (const [lang, n] of Object.entries(e.name as Record<string, unknown>)) addIndex(lang, n, key, true);
    }
    if (e.synonyms && typeof e.synonyms === 'object') {
      for (const [lang, list] of Object.entries(e.synonyms as Record<string, unknown>)) {
        if (Array.isArray(list)) for (const s of list) addIndex(lang, s, key, false);
      }
    }
  }
  if (parents.size === 0) throw new TaxonomyError('empty', 'the taxonomy has no entries');

  const aliasMap = new Map<string, string>();
  for (const [from, to] of aliases ?? []) {
    const target = foldTag(to);
    if (!parents.has(target)) throw new TaxonomyError('unreadable', `alias "${from}" points at "${to}", which is not in the taxonomy`);
    aliasMap.set(from, target);
  }

  const memo = new Map<string, ReadonlySet<string>>();
  const ancestorsOf = (tag: string): ReadonlySet<string> => {
    const hit = memo.get(tag);
    if (hit) return hit;
    const seen = new Set<string>();
    const stack = [...(parents.get(tag) ?? [])];
    while (stack.length > 0) {
      const t = stack.pop()!;
      if (seen.has(t)) continue; // also guards a cycle in the data
      seen.add(t);
      for (const up of parents.get(t) ?? []) stack.push(up);
    }
    memo.set(tag, seen);
    return seen;
  };

  const depthMemo = new Map<string, number>();
  const depthOf = (tag: string, trail: Set<string> = new Set()): number => {
    const hit = depthMemo.get(tag);
    if (hit !== undefined) return hit;
    if (trail.has(tag)) return 0; // a cycle in the data
    trail.add(tag);
    let d = 0;
    for (const up of parents.get(tag) ?? []) d = Math.max(d, 1 + depthOf(up, trail));
    trail.delete(tag);
    depthMemo.set(tag, d);
    return d;
  };

  /** Several entries can carry one name: a name beats a synonym, an English key beats another, then the shallower, then alphabetical. */
  const bestOf = (cands: Map<string, boolean>): string =>
    [...cands.entries()].sort((a, b) => {
      if (a[1] !== b[1]) return a[1] ? -1 : 1;
      const ae = a[0].startsWith('en:') ? 0 : 1;
      const be = b[0].startsWith('en:') ? 0 : 1;
      if (ae !== be) return ae - be;
      const d = depthOf(a[0]) - depthOf(b[0]);
      return d !== 0 ? d : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    })[0]![0];

  /**
   * A non-English key with no parents and no children is an orphan; when an English entry
   * carries the same name in that language, the English entry is the real one (the
   * "other-language duplicates" of the safeguards doc, A3).
   */
  const redirectDuplicate = (key: string): string => {
    const pre = splitPrefix(key);
    if (!pre || pre.lang === 'en') return key;
    if ((parents.get(key) ?? []).length > 0 || hasChildren.has(key)) return key;
    const cands = index.get(`${pre.lang}:${pre.rest}`);
    if (!cands) return key;
    const english = new Map([...cands].filter(([k]) => k !== key && k.startsWith('en:')));
    return english.size > 0 ? bestOf(english) : key;
  };

  const byLanguageName = (lang: string, text: string): string | null => {
    const slug = normalizeName(text);
    const cands = slug === '' ? undefined : index.get(`${lang}:${slug}`);
    return cands && cands.size > 0 ? bestOf(cands) : null;
  };

  const resolveLabel = (label: string): string | null => {
    const folded = foldTag(label);
    if (folded === '') return null;
    if (parents.has(folded)) return redirectDuplicate(folded);
    const pre = splitPrefix(folded);
    let hit: string | null = null;
    if (pre) {
      const slugKey = `${pre.lang}:${normalizeName(pre.rest)}`;
      hit = parents.has(slugKey) ? redirectDuplicate(slugKey) : byLanguageName(pre.lang, pre.rest);
    } else {
      for (const lang of ['en', 'fr']) {
        const slugKey = `${lang}:${normalizeName(folded)}`;
        if (parents.has(slugKey)) {
          hit = redirectDuplicate(slugKey);
          break;
        }
        hit = byLanguageName(lang, folded);
        if (hit) break;
      }
    }
    if (hit) return hit;
    return aliasMap.get(normalizeName(label)) ?? null;
  };

  return {
    sha256,
    size: parents.size,
    has: (tag) => parents.has(foldTag(tag)),
    parentsOf: (tag) => parents.get(foldTag(tag)) ?? [],
    isAncestor: (ancestor, descendant) => ancestorsOf(foldTag(descendant)).has(foldTag(ancestor)),
    ancestorsOf: (tag) => ancestorsOf(foldTag(tag)),
    depthOf: (tag) => depthOf(foldTag(tag)),
    resolveLabel,
  };
}

/** Read the alias file: {"aliases": {"<raw label>": {"to": "<taxonomy key>", ...}}}. Throws when it is missing or malformed. */
export function loadAliases(path: string): AliasMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new TaxonomyError('unreadable', `alias file cannot be read: ${path} (${err instanceof Error ? err.message : String(err)})`);
  }
  const list = (parsed as { aliases?: unknown } | null)?.aliases;
  if (!list || typeof list !== 'object' || Array.isArray(list)) throw new TaxonomyError('unreadable', `alias file has no "aliases" object: ${path}`);
  const out = new Map<string, string>();
  for (const [label, v] of Object.entries(list as Record<string, unknown>)) {
    const to = typeof v === 'string' ? v : (v as { to?: unknown } | null)?.to;
    if (typeof to !== 'string' || to === '') throw new TaxonomyError('unreadable', `alias "${label}" has no target in ${path}`);
    out.set(normalizeName(label), to);
  }
  return out;
}

/** catalogue/category-aliases.json, next to category-baseline.json. */
export const DEFAULT_ALIASES_PATH = fileURLToPath(new URL('../category-aliases.json', import.meta.url));
/** catalogue/data/off-categories.json, where fetch-categories.ts installs the taxonomy. */
export const DEFAULT_TAXONOMY_PATH = fileURLToPath(new URL('../data/off-categories.json', import.meta.url));

/**
 * Read the taxonomy from a local path. Throws `TaxonomyError` when it is missing, unreadable or empty.
 * `aliasesPath` adds the alias file (see `resolveLabel`); a missing alias file is an error, not a skip.
 */
export function loadTaxonomy(path: string, opts: { aliasesPath?: string } = {}): Taxonomy {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new TaxonomyError(code === 'ENOENT' ? 'missing' : 'unreadable', `taxonomy file ${code === 'ENOENT' ? 'is missing' : 'cannot be read'}: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TaxonomyError('unreadable', `taxonomy file is not valid JSON: ${path}`);
  }
  const aliases = opts.aliasesPath ? loadAliases(opts.aliasesPath) : undefined;
  return taxonomyFromObject(parsed, createHash('sha256').update(bytes).digest('hex'), aliases);
}

let unavailableLogged = false;

/** Log `[category-fault] taxonomy_unavailable` once per process. */
export function logTaxonomyUnavailableOnce(why: string, log: (line: string) => void = (l) => console.error(l)): void {
  if (unavailableLogged) return;
  unavailableLogged = true;
  log(`[category-fault] taxonomy_unavailable - the substitute ring falls back to the position rule: ${why}`);
}

/** Test hook: forget that the fault was logged. */
export function resetTaxonomyUnavailableLog(): void {
  unavailableLogged = false;
}

/**
 * The taxonomy the substitute ring reads, or null. A failure to load is logged ONCE per process as
 * `[category-fault] taxonomy_unavailable`; the caller then runs the old position rule. Never silent.
 */
export function loadRingTaxonomy(path: string = DEFAULT_TAXONOMY_PATH, log: (line: string) => void = (l) => console.error(l)): Taxonomy | null {
  try {
    return loadTaxonomy(path);
  } catch (err) {
    logTaxonomyUnavailableOnce(err instanceof Error ? err.message : String(err), log);
    return null;
  }
}

/* ----------------------------------------------------------------- faults */

/** The category faults a product's own tags can show (Part A, A1 to A4). */
export type PathFault = 'two_branches' | 'parent_not_ancestor' | 'unknown_tag' | 'leaf_is_ancestor';

/**
 * The deepest tags of a product: the tags that are in the taxonomy and are not
 * an ancestor of any other of the product's tags. Two or more of them sit on
 * separate branches.
 */
export function deepestTags(tags: readonly string[], tax: Taxonomy): string[] {
  const known = [...new Set(tags.map(foldTag))].filter((t) => tax.has(t));
  return known.filter((t) => !known.some((o) => o !== t && tax.isAncestor(t, o)));
}

/**
 * Which faults one product's tag list shows. `tags` is the stored category
 * path, broad to specific, exactly as the range ladder and the ring read it:
 * the leaf is the LAST tag and the "parent" is the tag before it.
 *
 *   two_branches        A1  two or more deepest tags (a pick was made with no record)
 *   parent_not_ancestor A2  the tag before the last is not an ancestor of the last
 *   unknown_tag         A3  a tag that is not an entry in the taxonomy
 *   leaf_is_ancestor    A4  the last tag is an ancestor of another of the product's tags
 *
 * A path with no tags shows none: there is nothing to check, and the caller
 * counts such rows separately.
 */
export function faultsOfPath(tags: readonly string[], tax: Taxonomy): PathFault[] {
  if (tags.length === 0) return [];
  const out: PathFault[] = [];
  const folded = tags.map(foldTag);
  if (deepestTags(folded, tax).length >= 2) out.push('two_branches');
  if (folded.length >= 2 && !tax.isAncestor(folded[folded.length - 2]!, folded[folded.length - 1]!)) out.push('parent_not_ancestor');
  if (folded.some((t) => !tax.has(t))) out.push('unknown_tag');
  const leaf = folded[folded.length - 1]!;
  if (folded.some((t) => t !== leaf && tax.isAncestor(leaf, t))) out.push('leaf_is_ancestor');
  return out;
}

/**
 * Serve time: a parent rung was used, so the tag called "parent" must be an
 * ancestor of the leaf in the taxonomy. Returns the fault kind or null.
 */
export function parentRungFault(leaf: string, parent: string, tax: Taxonomy): 'parent_not_ancestor' | null {
  return tax.isAncestor(parent, leaf) ? null : 'parent_not_ancestor';
}
