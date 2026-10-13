/**
 * The chooser behind the cascade's Claude slot (price-category plan 2.1). The slot
 * (placement-cascade.ts `ClaudeListChooser`) hands over an item and a FIXED short
 * list of candidate categories, the top few the routes put forward; Claude picks one
 * id from that list or abstains.
 *
 * This file never calls Claude by itself. The client is INJECTED (`ClaudeClient`):
 * tests pass a fake, and a real client is written where a key exists. Nothing here
 * reads an environment variable, opens a socket or imports an SDK.
 *
 * WHAT IT GUARANTEES
 *   - Only the list. An id that is not on the list Claude was shown is refused:
 *     counted (`rejectedNotOnList`) and abstained, never placed. The cascade
 *     refuses it again if a chooser ever returns one.
 *   - A cap. `maxCalls` is the most client calls this chooser makes; past it the
 *     chooser abstains without calling and counts `skippedForCap`. A run that needs
 *     more raises the cap on purpose.
 *   - One answer per item. The answer to (item, list) is cached, abstentions too;
 *     asking again costs no call and does not count against the cap. The cache map
 *     can be passed in and kept between runs.
 *   - Nothing swallowed. A client that throws stops the run. A reply that is not
 *     the JSON asked for is an abstention that is COUNTED (`unreadable`), not a
 *     silent null.
 *
 * THE CONFIDENCE IS CLAUDE'S OWN STATEMENT, NOT A MEASURED HIT RATE. It is checked
 * only to be a number in 0..1; the cascade's bar (PLACEMENT_CONFIDENCE_BAR, itself
 * uncalibrated) decides whether it places. Claude's accuracy on this task has not
 * been measured: no live call has been made.
 */

import type { ClaudeListChooser } from './placement-cascade.ts';

export interface ClaudeRequest {
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
}

/** The one thing the chooser needs from a model: a prompt in, text out. */
export interface ClaudeClient {
  complete(request: ClaudeRequest): Promise<string>;
}

export interface CachedChoice {
  readonly nodeId: number | null;
  readonly confidence: number;
}

export interface ClaudeChooserStats {
  /** Client calls made. */
  readonly calls: number;
  readonly cacheHits: number;
  readonly skippedForCap: number;
  readonly picked: number;
  readonly abstained: number;
  readonly rejectedNotOnList: number;
  readonly unreadable: number;
}

export interface ClaudeChooser extends ClaudeListChooser {
  stats(): ClaudeChooserStats;
}

export interface ClaudeChooserOptions {
  readonly client: ClaudeClient;
  /** The most client calls this chooser may make. A whole number, 0 or more. */
  readonly maxCalls: number;
  /** Answers already known, keyed by item and list; filled as the chooser answers. */
  readonly cache?: Map<string, CachedChoice>;
  readonly log?: (line: string) => void;
}

export const CLAUDE_MAX_TOKENS = 100;

const SYSTEM = [
  'You place one retail product in one category of a fixed list.',
  'You are shown the product name and a numbered list of candidate categories; each has an id and a path from the broadest level down to the category.',
  'Choose the single most specific category on the list that the product truly belongs to. If none of them fits, or you cannot tell, abstain.',
  'Reply with JSON only, no other text: {"id": <an id from the list>, "confidence": <number from 0 to 1>} or {"id": null}.',
  'Never invent an id that is not on the list.',
].join(' ');

/** "en:dairy-products" -> "dairy products", for the prompt only. */
function words(tag: string): string {
  return tag.replace(/^[a-z]{2,3}(?:[-_][a-z0-9]+)?:/i, '').replace(/[-_]+/g, ' ').trim();
}

function cacheKey(item: { readonly code: string }, list: readonly { readonly nodeId: number }[]): string {
  return `${item.code}\u0000${list.map((c) => c.nodeId).join(',')}`;
}

function parseReply(text: string): { id: number | null; confidence: number } | 'unreadable' {
  const m = /\{[^{}]*\}/.exec(text);
  if (!m) return 'unreadable';
  let v: unknown;
  try {
    v = JSON.parse(m[0]);
  } catch {
    return 'unreadable';
  }
  if (!v || typeof v !== 'object' || !('id' in v)) return 'unreadable';
  const { id, confidence } = v as { id: unknown; confidence?: unknown };
  if (id === null) return { id: null, confidence: 0 };
  if (typeof id !== 'number' || !Number.isInteger(id)) return 'unreadable';
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return 'unreadable';
  return { id, confidence };
}

export function claudeChooser(opts: ClaudeChooserOptions): ClaudeChooser {
  if (!Number.isInteger(opts.maxCalls) || opts.maxCalls < 0) throw new Error(`claudeChooser: maxCalls ${opts.maxCalls} is not a whole number of 0 or more`);
  const cache = opts.cache ?? new Map<string, CachedChoice>();
  const log = opts.log ?? (() => {});
  const s = { calls: 0, cacheHits: 0, skippedForCap: 0, picked: 0, abstained: 0, rejectedNotOnList: 0, unreadable: 0 };
  let capLogged = false;
  return {
    stats: () => ({ ...s }),
    async choose(item, list) {
      if (list.length === 0) throw new Error(`claudeChooser: ${item.code} was given an empty list; the slot never sends one`);
      const key = cacheKey(item, list);
      const hit = cache.get(key);
      if (hit) {
        s.cacheHits += 1;
        return hit.nodeId === null ? null : { nodeId: hit.nodeId, confidence: hit.confidence };
      }
      if (s.calls >= opts.maxCalls) {
        s.skippedForCap += 1;
        if (!capLogged) {
          capLogged = true;
          log(`claude-chooser: call cap ${opts.maxCalls} reached; the rest abstain without a call`);
        }
        return null;
      }
      s.calls += 1;
      const user = [
        `Product (${item.department}): ${item.name}`,
        'Candidate categories:',
        ...list.map((c) => `id ${c.nodeId}: ${c.path.map(words).join(' > ')}`),
      ].join('\n');
      const reply = await opts.client.complete({ system: SYSTEM, user, maxTokens: CLAUDE_MAX_TOKENS });
      const parsed = parseReply(String(reply ?? ''));
      if (parsed === 'unreadable') {
        s.unreadable += 1; // not cached: a garbled reply is not an answer, and a later run may ask again
        return null;
      }
      if (parsed.id === null) {
        s.abstained += 1;
        cache.set(key, { nodeId: null, confidence: 0 });
        return null;
      }
      if (!list.some((c) => c.nodeId === parsed.id)) {
        s.rejectedNotOnList += 1;
        cache.set(key, { nodeId: null, confidence: 0 });
        return null;
      }
      s.picked += 1;
      cache.set(key, { nodeId: parsed.id, confidence: parsed.confidence });
      return { nodeId: parsed.id, confidence: parsed.confidence };
    },
  };
}
