/**
 * CLAUDE READS THE PACK. RULINGS.md "A scan never ends with no result"
 * (2026-10-10): a barcode the catalogue does not hold goes to a live Open Food
 * Facts lookup first; when that finds nothing too, the camera frame of the item
 * goes to the cheapest Claude model to read the name, brand and size off the
 * pack. Claude never searches the web, and its name is labelled as Claude's
 * reading. Jamin: "There should never be somethig with no result."
 *
 * WHAT THIS FILE DOES, IN ORDER:
 *   1. takes ONE frame (a JPEG or PNG) and the canonical barcode, or null for a
 *      reading whose check digit failed (a misread has no key to save under);
 *   2. a barcode already read is answered from the saved reading, with no call
 *      and no cap slot: identity does not change, so a reading never expires;
 *   3. no ANTHROPIC_API_KEY returns `no_api_key` before anything is counted;
 *   4. counts the call against this UTC month BEFORE sending it, the same rule
 *      as the range ask (`range-ask.ts`): at or over SHIN_PACK_READ_MONTHLY_CAP
 *      it returns `monthly_cap_reached` and sends nothing;
 *   5. makes ONE call through `AnthropicProvider`: the frame, structured JSON,
 *      NO `tools` key at all (so no web search exists for the model to use),
 *      thinking disabled, on `RANGE_ASK_MODEL` (the cheapest Claude);
 *   6. validates hard: exactly the schema's four fields, a name that is a
 *      non-empty string. Nothing is repaired or guessed;
 *   7. logs EVERY call to `<store>.answers.jsonl` (valid, cannot read, refused
 *      by the validator, or no answer at all), and saves a valid reading under
 *      its barcode in the store, apart from every catalogue row.
 *
 * FILE SHAPE (version 1), written to a temp file and renamed like
 * `range-ask-store.ts`:
 *   { "version": 1, "month": "2026-10", "calls": 3,
 *     "readings": { "<barcode>": { name, brand, size, readAt, model, source: "claude_reading" } } }
 *
 * NOTHING HERE OPENS A SOCKET IN A TEST. `deps.provider` is injected; the
 * default provider is built only when none is passed.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';

import { loadDotEnv } from './env.ts';
import { classifyProviderError, type Provider, type ProviderImage } from './provider.ts';
import { AnthropicProvider } from './providers/anthropic.ts';
import { RANGE_ASK_MODEL } from './range-ask.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where the store lives unless a caller names another path. */
export const DEFAULT_PACK_STORE_PATH = join(REPO_ROOT, 'identify', 'data', 'pack-read.json');
export const DEFAULT_PACK_MONTHLY_CAP = 300;
/** The same cheapest Claude the range ask uses, so one model id is changed in one place. */
export const PACK_READ_MODEL = RANGE_ASK_MODEL;
const MAX_OUTPUT_TOKENS = 512;
const DEFAULT_TIMEOUT_MS = 20_000;

/* ------------------------------------------------------------------ types */

export interface PackReading {
  readonly name: string;
  readonly brand: string | null;
  readonly size: string | null;
  /** ISO time of the call that produced this reading. */
  readonly readAt: string;
  readonly model: string;
  /** Always this: the name is Claude's reading of the pack, never a catalogue row. */
  readonly source: 'claude_reading';
}

export type PackReadFailure =
  | 'no_frame'
  | 'no_api_key'
  | 'monthly_cap_reached'
  | 'cap_store_error'
  | 'model_error'
  | 'invalid_json'
  | 'extra_fields'
  | 'bad_known'
  | 'model_cannot_read'
  | 'no_name'
  | 'bad_field';

export type PackReadResult =
  | { readonly ok: true; readonly reading: PackReading; readonly cached: boolean; readonly logFault?: true }
  | { readonly ok: false; readonly reason: PackReadFailure; readonly detail?: string; readonly logFault?: true };

export interface PackReadDeps {
  /** The Claude provider. Default: an `AnthropicProvider` over the SDK client (reads ANTHROPIC_API_KEY). Tests always pass one. */
  readonly provider?: Provider;
  /** Calls allowed per UTC month. Default 300 when absent; anything present that is not a whole number >= 0 is 0. */
  readonly monthlyCap?: number;
  /** The count-and-readings file. Default `identify/data/pack-read.json`. */
  readonly storePath?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

/* ----------------------------------------------------------------- prompt */

export const PACK_SYSTEM =
  'You read one retail product package in a photo. Report only the product name, brand and size that are ' +
  'printed and visible on the package. Never guess from the barcode digits, from memory of similar products, ' +
  'or from anything not printed. If you cannot read a product name, set known to false and every other field to null.';

const PACK_USER =
  'What product is this? Reply with JSON only: known, name (the product name as printed, without the brand), ' +
  'brand (as printed, or null), size (the net quantity as printed, for example "303 g", or null).';

export const PACK_SCHEMA = {
  name: 'pack_reading',
  schema: {
    type: 'object',
    properties: {
      known: { type: 'boolean' },
      // anyOf rather than a type array: the nullable shape the Anthropic provider is known to pass (range-ask.ts).
      name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      brand: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      size: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
    required: ['known', 'name', 'brand', 'size'],
    additionalProperties: false,
  },
} as const;

const SCHEMA_KEYS: ReadonlySet<string> = new Set(Object.keys(PACK_SCHEMA.schema.properties));

type Validated = { ok: true; value: { name: string; brand: string | null; size: string | null } } | { ok: false; reason: PackReadFailure; detail?: string };

/** Hard checks on the model's object. Never repairs, never substitutes. */
export function validatePackReading(raw: unknown): Validated {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'invalid_json', detail: 'the answer is not a JSON object' };
  const o = raw as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => !SCHEMA_KEYS.has(k));
  if (extra.length > 0) return { ok: false, reason: 'extra_fields', detail: extra.join(',') };
  if (typeof o.known !== 'boolean') return { ok: false, reason: 'bad_known' };
  if (o.known === false) return { ok: false, reason: 'model_cannot_read' };
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (name === '') return { ok: false, reason: 'no_name' };
  const optional = (v: unknown): string | null | undefined => (v === null ? null : typeof v === 'string' ? v.trim() || null : undefined);
  const brand = optional(o.brand);
  const size = optional(o.size);
  if (brand === undefined || size === undefined || name.length > 160 || (brand?.length ?? 0) > 80 || (size?.length ?? 0) > 40) {
    return { ok: false, reason: 'bad_field' };
  }
  return { ok: true, value: { name, brand, size } };
}

/* ------------------------------------------------------------------ store */

interface PackStore {
  readonly version: 1;
  readonly month: string;
  readonly calls: number;
  readonly readings: Readonly<Record<string, PackReading>>;
}

function utcMonth(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

function isReading(v: unknown): v is PackReading {
  const r = v as Partial<PackReading> | null;
  return !!r && typeof r === 'object' && typeof r.name === 'string' && r.name !== '' && typeof r.readAt === 'string' && r.source === 'claude_reading';
}

/** A missing or unparseable file reads as empty (the same choice range-ask-store.ts makes, and says out loud). */
function readStore(storePath: string, nowMs: number): PackStore {
  const month = utcMonth(nowMs);
  if (!existsSync(storePath)) return { version: 1, month, calls: 0, readings: {} };
  let parsed: Partial<{ month: unknown; calls: unknown; readings: unknown }>;
  try {
    parsed = JSON.parse(readFileSync(storePath, 'utf8')) as typeof parsed;
  } catch {
    return { version: 1, month, calls: 0, readings: {} };
  }
  const readings: Record<string, PackReading> = {};
  if (parsed.readings !== null && typeof parsed.readings === 'object') {
    for (const [k, v] of Object.entries(parsed.readings as Record<string, unknown>)) if (isReading(v)) readings[k] = v;
  }
  const calls = parsed.month === month && typeof parsed.calls === 'number' && Number.isFinite(parsed.calls) && parsed.calls >= 0 ? Math.floor(parsed.calls) : 0;
  return { version: 1, month, calls, readings };
}

function writeStore(storePath: string, state: PackStore): void {
  mkdirSync(dirname(storePath), { recursive: true });
  const tmp = `${storePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), 'utf8');
  renameSync(tmp, storePath);
}

/** How many pack reads were sent this UTC month. */
export function monthlyPackReads(storePath: string, nowMs: number): { month: string; calls: number } {
  const s = readStore(storePath, nowMs);
  return { month: s.month, calls: s.calls };
}

/** The saved reading for `barcode`, or null. Never throws: an unreadable store is no reading. */
export function savedPackReading(storePath: string, barcode: string): PackReading | null {
  if (!barcode) return null;
  try {
    return readStore(storePath, Date.now()).readings[barcode] ?? null;
  } catch {
    return null;
  }
}

/** The answer log beside `storePath`: `pack-read.json` -> `pack-read.answers.jsonl`. */
export function packAnswersPath(storePath: string): string {
  return storePath.replace(/\.json$/i, '') + '.answers.jsonl';
}

export const PACK_LOG_FAULT_TAG = '[pack-log-fault]';

/** One row per call sent. A row that cannot be written is said out loud and flagged, never swallowed; the answer still goes out. */
function logCall(storePath: string, row: Record<string, unknown>): boolean {
  try {
    const path = packAnswersPath(storePath);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(row) + '\n', 'utf8');
    return true;
  } catch (err) {
    console.error(`${PACK_LOG_FAULT_TAG} the pack reading row was not stored: outcome=${String(row.outcome)} - ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function capOf(v: number | undefined): number {
  if (v === undefined) return DEFAULT_PACK_MONTHLY_CAP;
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

/* ------------------------------------------------------------------ entry */

/**
 * Asks Claude, once, with no tools, to read the name, brand and size off
 * `frame`. `barcode` is the canonical code the reading is saved under, or null
 * for a misread. NEVER THROWS: every failure is `{ ok: false, reason }`.
 */
export async function readPack(frame: ProviderImage, barcode: string | null, deps: PackReadDeps = {}): Promise<PackReadResult> {
  const clock = deps.now ?? Date.now;
  const storePath = deps.storePath ?? DEFAULT_PACK_STORE_PATH;
  if (!frame || !(frame.bytes instanceof Uint8Array) || frame.bytes.length === 0) return { ok: false, reason: 'no_frame' };

  if (barcode) {
    const saved = savedPackReading(storePath, barcode);
    if (saved) return { ok: true, reading: saved, cached: true };
  }

  let provider = deps.provider;
  if (!provider) {
    loadDotEnv();
    let client: Anthropic;
    try {
      client = new Anthropic({ maxRetries: 0 });
    } catch {
      return { ok: false, reason: 'no_api_key' };
    }
    if ((client.apiKey ?? '').trim() === '') return { ok: false, reason: 'no_api_key' };
    provider = new AnthropicProvider(client);
  }

  try {
    const s = readStore(storePath, clock());
    if (s.calls >= capOf(deps.monthlyCap)) return { ok: false, reason: 'monthly_cap_reached' };
    writeStore(storePath, { ...s, calls: s.calls + 1 });
  } catch (err) {
    // A store that cannot be written cannot count, so the call does not go out.
    return { ok: false, reason: 'cap_store_error', detail: `the count could not be saved: ${String(err)}` };
  }

  const model = deps.model ?? PACK_READ_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs && deps.timeoutMs > 0 ? deps.timeoutMs : DEFAULT_TIMEOUT_MS);
  const readAt = new Date(clock()).toISOString();
  const base = { barcode, readAt, model };

  let value: unknown;
  let answeredBy: string;
  try {
    const res = await provider.send<unknown>({
      model,
      images: [frame],
      system: PACK_SYSTEM,
      user: PACK_USER,
      schema: PACK_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinking: 'disabled',
      signal: controller.signal,
    });
    value = res.value;
    answeredBy = res.model;
  } catch (err) {
    const failure = classifyProviderError(err);
    const message = String((err as Error)?.message ?? err);
    if (failure === 'model_malformed') {
      return flagged({ ok: false, reason: 'invalid_json', detail: message }, logCall(storePath, { ...base, outcome: 'invalid_json', detail: message, raw: null }));
    }
    const outcome = failure === 'unreadable_photo' ? 'refused' : 'transport_error';
    return flagged({ ok: false, reason: 'model_error', detail: `${failure}: ${message}` }, logCall(storePath, { ...base, outcome, detail: `${failure}: ${message}`, raw: null }));
  } finally {
    clearTimeout(timer);
  }

  const checked = validatePackReading(value);
  const logged = logCall(storePath, { ...base, model: answeredBy, outcome: checked.ok ? 'ok' : checked.reason, raw: value ?? null });
  if (!checked.ok) return flagged(checked, logged);

  const reading: PackReading = { ...checked.value, readAt, model: answeredBy, source: 'claude_reading' };
  if (barcode) {
    try {
      const s = readStore(storePath, clock());
      writeStore(storePath, { ...s, readings: { ...s.readings, [barcode]: reading } });
    } catch (err) {
      // The reading stands for this scan; the next scan of the code will simply read again. Said out loud.
      console.error(`${PACK_LOG_FAULT_TAG} the reading for ${barcode} was not saved - ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return flagged({ ok: true, reading, cached: false }, logged);
}

function flagged<T extends PackReadResult>(result: T, saved: boolean): T {
  return saved ? result : ({ ...result, logFault: true } as T);
}
