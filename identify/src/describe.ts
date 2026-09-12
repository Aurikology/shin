/**
 * Two-sentence product descriptions, written from catalogue facts only.
 * Item 26 of the beta build plan.
 *
 * The screen's label -- "written from the label" -- is the client lane's to
 * show (item 26c; the row this file answers to is
 * `identify/src/cap.ts, identify/eval/*, identify/src/describe.ts` in the
 * plan's lane table, never the screen). What belongs here is the module and
 * the cache: a prompt built from nothing but the facts a catalogue row
 * actually carries, and code that checks what came back against those same
 * facts before it is ever cached or handed to a caller.
 *
 * WHY A CHECK AND NOT ONLY A PROMPT (item 26's own wording: "the
 * forbidden-to-add-facts rule must be enforced by code that checks the
 * output against the input facts, not only by the prompt text, because a
 * prompt instruction is not a check"). `verifyDescription` below is that
 * code. It is not a general fact-checker -- nothing short of a second model
 * call could catch every way two sentences might drift from what a label
 * actually says -- but it catches the one class of drift that is both
 * mechanical to detect and the most damaging to get wrong: a number in the
 * output (a weight, a percentage, a count) that does not trace back to any
 * number anywhere in the facts handed in. It also enforces two sentences,
 * exactly, because "two sentences" is itself part of the ask and a model
 * asked for two will sometimes write one or three. And, because this repo's
 * own hard rule holds for anything generated: no em dash in the result,
 * checked here rather than trusted to the prompt.
 *
 * WHAT THIS DOES NOT CHECK: a brand name swapped for another real brand, an
 * invented health claim with no number in it, a category asserted that
 * contradicts the one given. Those need either a second model pass or a
 * proper NLI check, and building one was not asked for here; naming the gap
 * is the honest version of enforcing it.
 *
 * No key exists on this machine and this file makes no network call of its
 * own; `identify/test/describe.test.ts` exercises the whole path -- prompt,
 * cache, and the check -- against a fake `MessagesClient`, the same
 * instrument `identify/test/model.test.ts` already uses for the same reason.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Anthropic from '@anthropic-ai/sdk';

import { type MessagesClient } from './model.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_CACHE_PATH = join(REPO_ROOT, 'identify', 'data', 'descriptions.json');

/**
 * Exactly the facts a catalogue row can actually offer, and nothing this
 * file cannot point back to. Kept structural and independent of
 * `catalogue/src/search.ts`'s `Candidate` or `identify/src/identify.ts`'s
 * `CatalogueCandidate` on purpose -- the same reason `identify/src/identify.ts`
 * takes a `CatalogueLookup` function instead of a catalogue import -- so this
 * module stays callable from anywhere a set of facts exists, and does not
 * gain a dependency on either file's shape.
 */
export interface CatalogueFacts {
  readonly name: string;
  readonly brand: string | null;
  /** A display string, e.g. "500 g" or "1.5 L" -- not a bare number and unit pair. */
  readonly quantity: string | null;
  /** Human-readable, e.g. "breakfast cereals", not the taxonomy key ("en:breakfast-cereals"). */
  readonly category: string | null;
  /** Item 25's Open Food Facts quality fields, when that lane has landed them. All optional. */
  readonly ingredients?: string | null;
  readonly nutriScore?: string | null;
  readonly novaGroup?: number | null;
  readonly additivesCount?: number | null;
}

export interface DescribeOptions {
  readonly cachePath?: string;
  /** Defaults to Haiku: two sentences of label copy is not a job for the pro tier. */
  readonly model?: string;
}

export interface Description {
  readonly text: string;
  readonly language: string;
  /** True when this came from the cache rather than a fresh call. */
  readonly cached: boolean;
}

const DEFAULT_MODEL = 'claude-haiku-4-5';

/** Thrown by `verifyDescription`. Never thrown past `describeProduct`, which cache-misses instead of caching a failed check. */
export class DescriptionCheckError extends Error {
  constructor(reason: string) {
    super(`description failed its own-fact check: ${reason}`);
    this.name = 'DescriptionCheckError';
  }
}

/** Every fact's string form, concatenated, for the number check to search. Never shown to anyone; a search surface, not a display string. */
function factsBlob(facts: CatalogueFacts): string {
  return [
    facts.name,
    facts.brand,
    facts.quantity,
    facts.category,
    facts.ingredients,
    facts.nutriScore,
    facts.novaGroup,
    facts.additivesCount,
  ]
    .filter((v) => v !== null && v !== undefined)
    .map(String)
    .join(' \n ');
}

/** Every run of digits, with an optional decimal point, that appears in a string. "500 g" and "590g" both yield "500"/"590". */
function numbersIn(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

/**
 * Splits on sentence-ending punctuation, discarding empty fragments (a
 * trailing period leaves one). Good enough for the plain declarative copy
 * this prompt asks for; not a general sentence tokenizer, and does not need
 * to be one for two sentences of label description.
 */
function sentenceCount(text: string): number {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

/**
 * The check item 26 asked for: mechanical, run on the actual text, not on
 * trusting the prompt that produced it. Throws `DescriptionCheckError`
 * naming exactly what failed, so a caller (or a test) never has to guess
 * which rule tripped.
 */
export function verifyDescription(text: string, facts: CatalogueFacts): void {
  if (text.includes('—')) {
    throw new DescriptionCheckError('contains an em dash, which nothing generated here is allowed to');
  }
  const sentences = sentenceCount(text);
  if (sentences !== 2) {
    throw new DescriptionCheckError(`asked for two sentences, got ${sentences}`);
  }
  const known = new Set(numbersIn(factsBlob(facts)));
  const unknown = numbersIn(text).filter((n) => !known.has(n));
  if (unknown.length > 0) {
    throw new DescriptionCheckError(
      `contains the number${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}, present in the output but not anywhere in the facts it was given`,
    );
  }
}

/*
 * THE PROMPT.
 *
 * Everything the model is given is in the user turn's JSON, built from
 * `CatalogueFacts` field by field; there is no second source of product
 * information in this call for it to draw on even by accident. The system
 * prompt states the constraint the way the rest of this repo's own prompts
 * do (model.ts's SYSTEM and PICK_SYSTEM), as an instruction a well-behaved
 * model follows most of the time -- which is exactly why `verifyDescription`
 * exists as a second, independent check on what actually came back.
 */
const SYSTEM = `You write short product descriptions for a shopping app.

Rules:
- Write exactly two sentences.
- Use only the facts given to you in the user message. Do not add a fact,
  a number, a claim or a detail that is not present there.
- If a fact is missing, do not guess it or imply it; write around the gap.
- Plain, factual, second person avoided. No marketing language, no
  superlatives, no exclamation points, no em dashes.
- Write in the requested language and nothing else.`;

function userTurn(facts: CatalogueFacts, language: string): string {
  return `Language: ${language}\n\nFacts:\n${JSON.stringify(facts, null, 2)}`;
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// ---------------------------------------------------------------- the cache
//
// One JSON file, keyed by product code and language, the same
// read-whole/write-whole approach cap.ts's spend store uses and for the same
// reason: this is one small file written rarely, not a store that needs
// partial reads. Persists across a restart, unlike model.ts's in-process
// caches (there are none for this; this is the first one this module adds).

interface CacheEntry {
  readonly text: string;
  /** A hash of the facts this text was generated from. A product whose facts changed (item 25 backfilling quality fields, a correction) invalidates its own cache entry rather than serving stale copy under a fact that no longer holds. */
  readonly factsHash: string;
  readonly generatedAt: string;
}

type CacheFile = Record<string, CacheEntry>;

function cacheKey(code: string, language: string): string {
  return `${code}::${language}`;
}

function hashFacts(facts: CatalogueFacts): string {
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex');
}

function readCache(path: string): CacheFile {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CacheFile;
  } catch {
    // A corrupt cache file is a cache miss, never a crash; the next
    // successful write repairs it.
    return {};
  }
}

function writeCache(path: string, cache: CacheFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2), 'utf8');
}

/** Read-only: for a health check, a test, or a cache-hit-rate report, without generating anything. */
export function cachedDescription(
  code: string,
  language: string,
  facts: CatalogueFacts,
  opts?: DescribeOptions,
): Description | null {
  const cache = readCache(opts?.cachePath ?? DEFAULT_CACHE_PATH);
  const entry = cache[cacheKey(code, language)];
  if (!entry || entry.factsHash !== hashFacts(facts)) return null;
  return { text: entry.text, language, cached: true };
}

/**
 * The one entry point. Cache hit (same code, same language, same facts) never
 * calls the model at all; a miss calls it once, runs `verifyDescription` on
 * what comes back, and only writes to the cache -- and only returns -- once
 * that check passes. A description that fails the check is never cached and
 * never silently swapped for something else; the error propagates, because
 * serving a description this file cannot back is worse than serving none
 * (hard rule 3's own shape: the failure is ours to own, not something to
 * paper over toward the person reading the screen).
 */
export async function describeProduct(
  code: string,
  facts: CatalogueFacts,
  language: string,
  client: MessagesClient,
  opts?: DescribeOptions,
): Promise<Description> {
  const cachePath = opts?.cachePath ?? DEFAULT_CACHE_PATH;
  const hit = cachedDescription(code, language, facts, opts);
  if (hit) return hit;

  const message = await client.messages.create({
    model: opts?.model ?? DEFAULT_MODEL,
    max_tokens: 200,
    system: SYSTEM,
    messages: [{ role: 'user', content: userTurn(facts, language) }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const text = extractText(message);
  verifyDescription(text, facts);

  const cache = readCache(cachePath);
  cache[cacheKey(code, language)] = { text, factsHash: hashFacts(facts), generatedAt: new Date().toISOString() };
  writeCache(cachePath, cache);

  return { text, language, cached: false };
}
