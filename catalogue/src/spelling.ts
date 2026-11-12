/**
 * Spelling fallback for typed search (D-263, D-269).
 *
 * Meaning search is parked (RULINGS, Catalogue scope), so only exact words
 * match, and one wrong letter found nothing: "dedorant", "cheerois", "ketchp"
 * all came back empty on the live server. This corrects a word the catalogue
 * has never indexed to the most frequent word it HAS indexed within one edit
 * (two for a word of seven letters or more), where an edit is one letter
 * added, dropped, changed, or two neighbours swapped.
 *
 * NO REINDEX AND NO WRITE TO THE CATALOGUE. The vocabulary is read from the
 * FTS index the catalogue already has, through an fts5vocab table created in
 * the connection's TEMP schema. TEMP is private to the connection and
 * writable even when the catalogue file is opened read-only, which is how the
 * live worker opens it (schema.ts openCatalogueReadOnly); the test opens a
 * read-only file the same way to prove it.
 *
 * WHAT IS HELD IN MEMORY, AND ITS BOUND. Only words of 3 to 24 plain letters
 * (after the index's own accent folding) seen in at least MIN_DOCS products:
 * a word in one product is as likely to be someone's typo as the right
 * spelling, and correcting TO a typo is worse than not correcting. Numbers,
 * part numbers and barcodes are never held and never corrected. Stored as one
 * string plus three Int32Arrays, about (letters + 12) bytes a word, with a
 * hard cap of MAX_WORDS: past it the frequency floor doubles and the rarer
 * words are dropped, so the cost cannot grow without limit. `stats().bytes`
 * says what it actually came to; the build logs it.
 *
 * BUILT IN STEPS, NEVER IN ONE BLOCK. node:sqlite is synchronous and the
 * worker that owns this connection also answers searches, each under a 5 s
 * ceiling (service.ts). Reading a multi-million-word vocabulary in one go
 * would hold every search behind it, so it is read in key-ordered chunks with
 * the event loop let through between them. Until it is done, `correct`
 * answers null: a typo during the first seconds after a restart finds what it
 * found before this existed, nothing worse.
 */

import type { DatabaseSync, StatementSync } from 'node:sqlite';

/** A word must appear in at least this many products to be offered as a correction. */
export const MIN_DOCS = 2;
/** Hard bound on words held. At ~20 bytes a word this is ~40 MB at the very worst. */
export const MAX_WORDS = 2_000_000;
/** Words read per step of the build. Measured on a 2 M row synthetic index: 20,000 a step, worst step 39 ms. */
const CHUNK = 20_000;
const MIN_LEN = 3;
const MAX_LEN = 24;
/** Shorter than this, one edit away is too many real words to guess between ("oj", "tp", "pb"). */
const MIN_CORRECTABLE = 4;
/** From this length on, two edits are allowed. */
const TWO_EDITS_FROM = 7;

const PLAIN = /^[a-z]+$/;

/** The index's own folding (unicode61 remove_diacritics 2): accents off, lower case. */
export function foldWord(word: string): string {
  return word.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

function maskOf(word: string): number {
  let m = 0;
  for (let i = 0; i < word.length; i += 1) m |= 1 << (word.charCodeAt(i) - 97);
  return m;
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Optimal string alignment distance between `a` and pool[from, to), giving up
 * (returning max + 1) as soon as every cell of a row is past `max`.
 * Rows are reused across calls; words are at most MAX_LEN letters.
 */
const ROW_A = new Int32Array(MAX_LEN + 3);
const ROW_B = new Int32Array(MAX_LEN + 3);
const ROW_C = new Int32Array(MAX_LEN + 3);
function distance(a: string, pool: string, from: number, to: number, max: number): number {
  const n = to - from;
  let prev2 = ROW_A;
  let prev = ROW_B;
  let cur = ROW_C;
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    let rowMin = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j += 1) {
      const bc = pool.charCodeAt(from + j - 1);
      const cost = ac === bc ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && ac === pool.charCodeAt(from + j - 2) && a.charCodeAt(i - 2) === bc) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[n];
}

export interface SpellingStats {
  readonly ready: boolean;
  readonly words: number;
  /** Estimated bytes held: the letters plus three 4-byte arrays per word. */
  readonly bytes: number;
  readonly buildMs: number;
  /** The frequency floor in force; above MIN_DOCS only if MAX_WORDS was reached. */
  readonly minDocs: number;
}

export class Speller {
  readonly #db: DatabaseSync;
  #probe: StatementSync | null = null;
  #prefix: StatementSync | null = null;
  #building: Promise<void> | null = null;

  #pool = '';
  #starts = new Int32Array(1);
  #docs = new Int32Array(0);
  #masks = new Int32Array(0);
  /** byLength[L] is the first index of words of length L; words are stored sorted by length. */
  #byLength = new Int32Array(MAX_LEN + 2);
  #ready = false;
  #buildMs = 0;
  #minDocs = MIN_DOCS;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #table(): void {
    if (this.#probe) return;
    this.#db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS temp.shin_vocab USING fts5vocab(main, product_fts, 'row')`);
    this.#probe = this.#db.prepare('SELECT 1 AS found FROM temp.shin_vocab WHERE term = ?');
    this.#prefix = this.#db.prepare('SELECT 1 AS found FROM temp.shin_vocab WHERE term > ? AND term < ? LIMIT 1');
  }

  /** Builds the in-memory vocabulary in steps. Idempotent: every caller gets the same promise. */
  start(): Promise<void> {
    this.#building ??= this.#build().catch((err: unknown) => {
      // Loud, and never a search failure: without the vocabulary a typo finds what it found before.
      console.error(`[catalogue-fault] spelling_unavailable ${err instanceof Error ? err.message : String(err)}`);
    });
    return this.#building;
  }

  async #build(): Promise<void> {
    const started = Date.now();
    this.#table();
    const step = this.#db.prepare('SELECT term, doc FROM temp.shin_vocab WHERE term > ? LIMIT ?');
    let terms: string[] = [];
    let docs: number[] = [];
    let after = '';
    let capped = false;
    for (;;) {
      const rows = step.all(after, CHUNK) as unknown as { term: string; doc: number }[];
      if (rows.length === 0) break;
      after = rows[rows.length - 1]!.term;
      for (const { term, doc } of rows) {
        if (doc < this.#minDocs || term.length < MIN_LEN || term.length > MAX_LEN || !PLAIN.test(term)) continue;
        terms.push(term);
        docs.push(doc);
      }
      while (terms.length >= MAX_WORDS) {
        this.#minDocs *= 2;
        const keep = docs.map((d, i) => (d >= this.#minDocs ? i : -1)).filter((i) => i >= 0);
        terms = keep.map((i) => terms[i]!);
        docs = keep.map((i) => docs[i]!);
        if (!capped) console.warn(`[catalogue-fault] spelling_vocabulary_capped at ${MAX_WORDS} words; floor raised to ${this.#minDocs} products`);
        capped = true;
      }
      // Let queued searches through between steps (see the header).
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    const order = terms.map((_, i) => i).sort((a, b) => terms[a]!.length - terms[b]!.length);
    const n = order.length;
    const starts = new Int32Array(n + 1);
    const docArr = new Int32Array(n);
    const masks = new Int32Array(n);
    const byLength = new Int32Array(MAX_LEN + 2).fill(n);
    const parts: string[] = [];
    let at = 0;
    for (let k = 0; k < n; k += 1) {
      const t = terms[order[k]!]!;
      if (byLength[t.length] === n) byLength[t.length] = k;
      starts[k] = at;
      docArr[k] = docs[order[k]!]!;
      masks[k] = maskOf(t);
      parts.push(t);
      at += t.length;
    }
    starts[n] = at;
    // A length with no words starts where the next longer one does.
    for (let L = MAX_LEN; L >= 0; L -= 1) if (byLength[L]! > byLength[L + 1]!) byLength[L] = byLength[L + 1]!;
    this.#pool = parts.join('');
    this.#starts = starts;
    this.#docs = docArr;
    this.#masks = masks;
    this.#byLength = byLength;
    this.#ready = true;
    this.#buildMs = Date.now() - started;
    const s = this.stats();
    console.log(`[catalogue] spelling vocabulary ready: ${s.words} words, ${(s.bytes / 1e6).toFixed(1)} MB, ${s.buildMs} ms`);
  }

  stats(): SpellingStats {
    const n = this.#docs.length;
    return {
      ready: this.#ready,
      words: n,
      bytes: this.#pool.length + 4 * (n + 1) + 8 * n + 4 * this.#byLength.length,
      buildMs: this.#buildMs,
      minDocs: this.#minDocs,
    };
  }

  /** Whether the index holds this exact word, at any frequency. Works before the build finishes. */
  known(word: string): boolean {
    this.#table();
    return this.#probe!.get(foldWord(word)) !== undefined;
  }

  /** Whether some indexed word starts with this one, i.e. it may be half typed. */
  startsAWord(word: string): boolean {
    this.#table();
    const w = foldWord(word);
    return this.#prefix!.get(w, `${w}￿`) !== undefined;
  }

  /**
   * The most frequent held word within reach of `word`, or null.
   *
   * Null when the build has not finished, when the word is not plain letters
   * (numbers and barcodes are never corrected), when it is too short to guess
   * at, when the index already holds it (a correct word is never corrected),
   * and when nothing is close enough. Fewer edits win before frequency does.
   */
  correct(word: string): string | null {
    if (!this.#ready) return null;
    const w = foldWord(word);
    if (!PLAIN.test(w) || w.length < MIN_CORRECTABLE || w.length > MAX_LEN) return null;
    if (this.known(w)) return null;
    const max = w.length >= TWO_EDITS_FROM ? 2 : 1;
    const qm = maskOf(w);
    const lo = this.#byLength[Math.max(0, w.length - max)]!;
    const hi = this.#byLength[Math.min(MAX_LEN + 1, w.length + max + 1)]!;
    let best = -1;
    let bestD = max + 1;
    for (let k = lo; k < hi; k += 1) {
      // A substitution changes at most two letters of the set, an insertion or deletion one, a swap none.
      if (popcount(this.#masks[k]! ^ qm) > 2 * max) continue;
      const d = distance(w, this.#pool, this.#starts[k]!, this.#starts[k + 1]!, Math.min(max, bestD));
      if (d > max) continue;
      if (d < bestD || (d === bestD && this.#docs[k]! > this.#docs[best]!)) {
        best = k;
        bestD = d;
      }
    }
    return best < 0 ? null : this.#pool.slice(this.#starts[best]!, this.#starts[best + 1]!);
  }
}
