/**
 * The daily dollar cap on photo calls. Item 13c of the beta build plan.
 *
 * THIS IS NOT THE SAME CAP model.ts ALREADY HAS. `model.ts`'s `#send` refuses
 * once `SHIN_MODEL_DAILY_CALLS` calls (default 2,000) have gone out in a UTC
 * day -- a loop guard, in-memory, reset by a restart, and blind to the fact
 * that a call costs money at all. Item 13c asks for a different thing: a cap
 * denominated in dollars, defaulting to $10 CAD a day, read from an
 * environment variable, that survives the process restarting. Both caps are
 * real and neither replaces the other: the call-count cap catches a runaway
 * loop cheaply with no state to lose; this one is the number a founder can
 * actually reason about on a bill.
 *
 * WHERE THIS HOOKS IN. `identify/src/model.ts`'s `Identifier` takes an
 * optional `client: MessagesClient` in its constructor and calls nothing but
 * `client.messages.create(...)` on it (`model.ts` line ~588 for the extract
 * call, ~616 for the tag call, ~677 for the pick call). `MessagesClient` is a
 * plain structural interface, not a class with `#private` fields, so it can
 * be wrapped from outside model.ts without editing it: `withSpendCap` below
 * returns something that satisfies that interface, checks and charges the
 * cap before ever calling the real client, and throws the SAME
 * `ModelCallError('spend_cap_reached', ...)` model.ts's own cap throws on the
 * call-count path. That error already carries the right `FailureClass` all
 * the way up: `#send`'s catch classifies it via `failureOf`, which returns
 * `err.failure` unchanged for anything that is already a `ModelCallError`,
 * so `fromCrop`'s `catch` in identify.ts logs `failure: 'spend_cap_reached'`
 * exactly as it does today for the existing cap. Verified by reading that
 * path, not by running it -- there is no key on this machine to call through
 * it for real (identify/test/cap.test.ts exercises the wrapper directly with
 * a fake client instead).
 *
 * WHAT IS NOT DONE HERE, on purpose, per this lane's scope: nothing in
 * `identify/src/model.ts` or `identify/src/identify.ts` is edited. The wiring
 * that would make this cap actually run in the app -- constructing an
 * `Identifier` with `withSpendCap(...)` wrapped around its real client, at
 * whichever file does that construction (today `app/server.ts`) -- and the
 * one sentence identify.ts's `fromCrop` shows on ANY failure ("That photo
 * could not be read. Try again a little closer.") are both named exactly, at
 * the bottom of this comment block's sibling in the session report, rather
 * than made.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ModelCallError, type MessagesClient } from './model.ts';
import { loadDotEnv } from './env.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Overridable so a test never touches the real store or the real env var. */
export interface SpendCapOptions {
  readonly capCad?: number;
  readonly storePath?: string;
}

const DEFAULT_CAP_CAD = 10;
const DEFAULT_STORE_PATH = join(REPO_ROOT, 'identify', 'data', 'spend-cap.json');

/*
 * THE COST ESTIMATE.
 *
 * model.ts's own header comment (decision 21) prices one pro (Sonnet 5)
 * identification call, at the crop size this app sends, at $0.0068 USD --
 * the same figure identify/eval/run.ts's report() already uses for its cost
 * column. That is the one sourced number in this repo. There is no published
 * per-call figure for basic (Haiku 4.5) here, so rather than invent one, this
 * charges every call -- basic or pro, extract or pick -- at the pro figure.
 * That is an overestimate for basic, never an underestimate, which is the
 * safe direction for a cap: it trips sooner than the real spend would
 * justify, not later.
 */
const ESTIMATED_COST_USD_PER_CALL = 0.0068;

/*
 * Anthropic bills in USD; the cap is asked for in CAD. No live rate is
 * fetched -- this lane makes no network calls -- so this is a fixed,
 * approximate conversion, not a measured one. Update it, or wire in a real
 * rate, before this number is the thing a bill gets checked against.
 */
const APPROXIMATE_USD_TO_CAD = 1.35;

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function resolveOptions(opts?: SpendCapOptions): { capCad: number; storePath: string } {
  loadDotEnv();
  return {
    capCad: opts?.capCad ?? envFloat('SHIN_PHOTO_DAILY_CAP_CAD', DEFAULT_CAP_CAD),
    storePath: opts?.storePath ?? process.env.SHIN_SPEND_CAP_STORE_PATH ?? DEFAULT_STORE_PATH,
  };
}

/** The UTC day the cap resets on. Not local: two machines have to agree. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SpendCapState {
  readonly day: string;
  readonly cad: number;
}

/**
 * Reads the store. A missing file, a corrupt file, or a file from a day that
 * has since turned over all read the same way: as a fresh day with nothing
 * spent yet. A corrupt store is never a crash -- the cap either allows or
 * refuses a photo call, and neither answer to a torn write is worth losing
 * the call over.
 */
function readState(storePath: string): SpendCapState {
  const day = today();
  if (!existsSync(storePath)) return { day, cad: 0 };
  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as Partial<SpendCapState>;
    if (typeof parsed.day === 'string' && typeof parsed.cad === 'number' && parsed.day === day) {
      return { day, cad: parsed.cad };
    }
  } catch {
    // Falls through to a fresh day below.
  }
  return { day, cad: 0 };
}

function writeState(storePath: string, state: SpendCapState): void {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(state), 'utf8');
}

/** What has been spent today. For a health endpoint, and for tests. */
export function currentSpend(opts?: SpendCapOptions): { day: string; cad: number; capCad: number } {
  const { capCad, storePath } = resolveOptions(opts);
  const state = readState(storePath);
  return { day: state.day, cad: state.cad, capCad };
}

/**
 * Charges `costCad` against today's cap, or refuses.
 *
 * Reserve-then-spend: the charge is written to disk before the caller is
 * told to proceed, the same ordering model.ts's own `reserveCall` uses for
 * the call-count cap ("the cap is checked before the socket is opened,
 * because a cap that refuses after the request went out is a log line rather
 * than a cap"). This process is single-threaded per call site in practice
 * (one Node event loop, one `Identifier` per process today), so a real race
 * between two `messages.create` calls both reading "under the cap" before
 * either writes is not a case this file defends against; the write-before-
 * proceed ordering is what it can do cheaply, not a claim of atomicity across
 * processes or restarts mid-call.
 */
export function reserveSpend(costCad: number, opts?: SpendCapOptions): boolean {
  const { capCad, storePath } = resolveOptions(opts);
  const state = readState(storePath);
  if (state.cad + costCad > capCad) return false;
  writeState(storePath, { day: state.day, cad: state.cad + costCad });
  return true;
}

/** Back to zero, as if the day just turned over. A test uses this; nothing in production needs to. */
export function resetSpendCap(opts?: SpendCapOptions): void {
  const { storePath } = resolveOptions(opts);
  writeState(storePath, { day: today(), cad: 0 });
}

/** The estimated CAD cost of one call. See the header comment for why every model is priced the same. */
export function estimatedCostCad(): number {
  return ESTIMATED_COST_USD_PER_CALL * APPROXIMATE_USD_TO_CAD;
}

/**
 * The sentence shown when a photo call is refused for spend, not for the
 * photo. Hard rule 3: the aggression points at the price, the store, or the
 * brand, never at the user, and this is not the user's problem to carry
 * either way -- it names the limit plainly and gives the one thing left to
 * do, the same way `docs/the-photo-path.md`'s existing refusals do.
 */
export function spendCapRefusalMessage(): string {
  return "Today's photo budget is spent. Type the price in instead, or try again tomorrow.";
}

/**
 * Wraps a real `MessagesClient` so a call past today's dollar cap never
 * reaches the wire. Pass the result to `new Identifier(apiKey, wrapped)`
 * (model.ts's constructor already accepts a `client`) and every `read()` and
 * `pick()` call routes through this check first, because both are built from
 * the same `#send` -> `client.messages.create` path.
 */
export function withSpendCap(client: MessagesClient, opts?: SpendCapOptions): MessagesClient {
  return {
    messages: {
      async create(body, options) {
        if (!reserveSpend(estimatedCostCad(), opts)) {
          throw new ModelCallError('spend_cap_reached', spendCapRefusalMessage());
        }
        return client.messages.create(body, options);
      },
    },
  };
}
