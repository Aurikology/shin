/**
 * THE ONE GEMINI CALL A SCAN MAKES, for photo, barcode and typed-name scans alike.
 *
 * Jamin's rules (`docs/jamin-gemini-rules.md`, `docs/beta-gaps-2026-09-19.md`
 * items 1 to 6, 12 and 14): Gemini is the only provider on the scan path; one
 * call returns the product, the prices, the reviews AND the price math against
 * the user's own thresholds; Shin shows that answer as it stands and never its
 * own arithmetic; the server does not consult Shin's catalogue for the answer;
 * an answer with a "not fully confident" mark beats no answer.
 *
 * WHAT THIS FILE OWNS
 *   - the prompt: `Shin_Gemini_Pricing_Engine/` (system text, pricing guide,
 *     scan template, response schema), filled per scan;
 *   - the model choice per scan (Gemini 2.5 and a 3.x model side by side,
 *     picked by a stable hash of the device id, overridable by env);
 *   - the request, sent over the Interactions API the rest of this package
 *     already speaks (`./gemini.ts`), with `google_search` and NOTHING ELSE;
 *   - reading the answer without ever throwing at the person: a JSON that is
 *     malformed is repaired, and one that cannot be is marked, and the scan
 *     still returns something;
 *   - turning the answer into the block shapes the phone already draws, with
 *     the verdict lifted straight out of Gemini's own `price_verdict`;
 *   - `checkMath`, the hidden re-check of Gemini's arithmetic (item 14). It
 *     is never displayed: its only output is a mark on the stored call.
 *
 * ON GEMINI 2.5 THE SCHEMA IS NOT SENT. Google allows a response schema with
 * search "only to Gemini 3 series models" (structured-output docs, recorded in
 * `docs/jamin-gemini-rules.md`). So on 2.5 the JSON shape is written into the
 * prompt text and the reply is parsed here. On 3.x both are sent.
 *
 * NOTHING HERE OPENS A SOCKET IN A TEST. `transport` is injected.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyProviderError, type TokenUsage } from '../provider.ts';
import type { FailureClass } from '../model.ts';
import { spendCapRefusalMessage } from '../cap.ts';
import { LONE_CLAIM_CEILING, LONE_CLAIM_FLOOR } from '../gauge.ts';
import { interactionsUrl, mediaResolution, thinkingLevel, usageOf } from './gemini.ts';
import {
  cleanUrl,
  parseJson,
  walkSteps,
  type Citation,
  type GroundedTransport,
  type PriceBlock,
  type PriceOffer,
  type ShownOffer,
  type ShownReview,
} from './gemini-grounded.ts';

/* ------------------------------------------------------------------ models */

export const DEFAULT_GEMINI_25 = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_3 = 'gemini-3.8-flash';

export type ModelFamily = '2.5' | '3.x';

export interface ModelChoice {
  readonly model: string;
  readonly family: ModelFamily;
  /** 'env' when SHIN_GEMINI_MODEL forced it, 'hash' when SHIN_GEMINI_SPLIT=1 split devices, otherwise 'default'. */
  readonly via: 'env' | 'hash' | 'default';
}

/** 3.x ids start `gemini-3`. Anything else is treated as 2.5, the default. */
export function familyOf(model: string): ModelFamily {
  return /^gemini-3/i.test(model.trim()) ? '3.x' : '2.5';
}

/**
 * Which model answers THIS scan. Deterministic: the same device always gets the
 * same model, so a shopper's scans are comparable with each other, and across
 * devices the two split roughly in half. `SHIN_GEMINI_MODEL` forces one model
 * for every scan (the paid-key test and any rollback use it). The two ids
 * themselves come from `SHIN_GEMINI_MODEL_25` and `SHIN_GEMINI_MODEL_3`.
 */
export function modelForScan(deviceId: string, env: NodeJS.ProcessEnv = process.env): ModelChoice {
  const forced = env.SHIN_GEMINI_MODEL?.trim();
  if (forced) return { model: forced, family: familyOf(forced), via: 'env' };
  const v25 = env.SHIN_GEMINI_MODEL_25?.trim() || DEFAULT_GEMINI_25;
  const v3 = env.SHIN_GEMINI_MODEL_3?.trim() || DEFAULT_GEMINI_3;
  // Jamin, 2026-09-22: "gemini 2.5 is not accessible" on the beta server. Every scan goes to 3.x
  // unless SHIN_GEMINI_SPLIT=1 turns the half-and-half 2.5/3.x comparison back on.
  if (env.SHIN_GEMINI_SPLIT?.trim() !== '1') return { model: v3, family: familyOf(v3), via: 'default' };
  const byte = createHash('sha256').update(deviceId).digest()[0];
  return (byte & 1) === 0
    ? { model: v25, family: familyOf(v25), via: 'hash' }
    : { model: v3, family: familyOf(v3), via: 'hash' };
}

/* ------------------------------------------------------------ user context */

/**
 * The user's own two boundaries, as the client store holds them
 * (`lineUnderPct`, `lineOverPct` in `app/public/js/store.js`).
 */
export interface Thresholds {
  /**
   * In percent mode (the default): `underPct` is the GOOD range (percent below the
   * median) and `overPct` the BAD one (percent above), `greatPct` the deeper GREAT
   * one. In dollar mode (`unit: 'amount'`) the user's three amounts are in
   * `amounts` (money per item at the shelf's size) and the percent fields hold
   * the default range only, unused by the prompt; the prompt has Gemini convert.
   */
  readonly underPct: number;
  readonly overPct: number;
  readonly greatPct?: number;
  readonly unit?: 'percent' | 'amount';
  readonly amounts?: { readonly great: number; readonly good: number; readonly bad: number } | null;
  /** 'user' when the request carried them, 'default' when the default range was used. */
  readonly source: 'user' | 'default';
}

export const DEFAULT_THRESHOLDS: Thresholds = { underPct: 10, overPct: 10, greatPct: 20, unit: 'percent', amounts: null, source: 'default' };

function amountIn(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null;
}

function pctIn(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Reads the `thresholds` a request carried: the store's own keys, or the
 * shorter names, or a JSON string of either. A missing or unreadable object is
 * the default range, never a scan without one (`docs/beta-gaps-2026-09-19.md`
 * item 6).
 */
export function readThresholds(raw: unknown): Thresholds {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return DEFAULT_THRESHOLDS;
    }
  }
  if (!obj || typeof obj !== 'object') return DEFAULT_THRESHOLDS;
  const o = obj as Record<string, unknown>;
  const D = DEFAULT_THRESHOLDS;
  /* The current shape is { unit, great, good, bad }, all three in `unit` (the
     app's lib/scan-body.js). The store's own keys and the shorter names are still
     read, as percents, so an older client keeps working. */
  if (o.unit === 'amount') {
    const great = amountIn(o.great);
    const good = amountIn(o.good);
    const bad = amountIn(o.bad);
    if (great === null && good === null && bad === null) return DEFAULT_THRESHOLDS;
    return {
      underPct: D.underPct, overPct: D.overPct, greatPct: D.greatPct, unit: 'amount',
      amounts: { great: great ?? 2, good: good ?? 1, bad: bad ?? 1 }, source: 'user',
    };
  }
  const under = pctIn(o.good ?? o.lineUnderPct ?? o.underPct ?? o.under);
  const over = pctIn(o.bad ?? o.lineOverPct ?? o.overPct ?? o.over);
  const great = pctIn(o.great ?? o.lineGreatPct ?? o.greatPct);
  if (under === null && over === null && great === null) return DEFAULT_THRESHOLDS;
  const u = under ?? D.underPct;
  return {
    underPct: u, overPct: over ?? D.overPct, greatPct: Math.max(great ?? D.greatPct ?? 20, u), unit: 'percent', amounts: null, source: 'user',
  };
}

export function readShelfPriceCents(raw: unknown): number | null {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export type ScanType = 'photo' | 'barcode' | 'text';

/* ------------------------------------------------------------ alternatives */

/**
 * The two jobs an alternative can do (`docs/beta-gaps-2026-09-19.md` item 18).
 * `validation`: the user is judging a price they are already looking at, so a
 * farm or used price is useful evidence. `switching`: the user is choosing
 * between shops or products, so only what they would really accept.
 */
export type AlternativesMode = 'validation' | 'switching';

/**
 * HOW THE APP KNOWS WHICH MODE. The scan carries no explicit intent today, so
 * it is read from the one fact that separates the two: a shelf price. A price
 * typed at scan time means the user has a specific item in hand at a specific
 * price and is asking whether it is a good one (validation). No price means they
 * have chosen nothing yet and are looking across products and shops (switching).
 * An explicit `mode` on the request, if a client ever sends one, wins.
 */
export function alternativesModeFor(shelfPriceCents: number | null | undefined, explicit?: unknown): AlternativesMode {
  if (explicit === 'validation' || explicit === 'switching') return explicit;
  return typeof shelfPriceCents === 'number' && shelfPriceCents > 0 ? 'validation' : 'switching';
}

/** What the prompt's alternatives section needs about the user. Every field but the mode may be unknown. */
export interface AlternativesContext {
  readonly mode: AlternativesMode;
  /** One of the store types of `catalogue/src/product-kind.ts`, or null when the shop is not known. */
  readonly storeType?: string | null;
  readonly condition?: 'new' | 'used' | 'refurbished' | null;
  readonly maxTravelKm?: number | null;
  readonly hasMembership?: boolean | null;
  readonly requiredAttributes?: readonly string[] | null;
}

export interface ScanInput {
  readonly kind: ScanType;
  /** Digits, for a barcode scan. The image is NEVER sent with them. */
  readonly barcode?: string | null;
  /** A typed name, for a text scan. */
  readonly text?: string | null;
  readonly image?: { readonly bytes: Uint8Array; readonly mediaType: string } | null;
  readonly sharpness?: number | null;
  readonly shelfPriceCents?: number | null;
  readonly thresholds?: Thresholds;
  readonly market?: string | null;
  readonly currency?: string | null;
  readonly language?: string | null;
  readonly userInput?: string | null;
  /** The alternatives section's context. Absent means validation with nothing else known. */
  readonly alternatives?: AlternativesContext;
  /**
   * The values for the market rules' placeholders (`MARKET_COUNTRY_OR_UNKNOWN`,
   * `MARKET_REGION_OR_UNKNOWN`, `MARKET_CURRENCY_OR_UNKNOWN`, `REGION_MATTERS_HINT`,
   * `CROSS_BORDER_HINT`), built from the user's location by
   * `marketPromptFields` in `catalogue/src/market.ts`. Anything absent is the
   * word "unknown": a market is never defaulted.
   */
  readonly marketFields?: Readonly<Record<string, string>>;
}

/* ------------------------------------------------------------ the package */

interface Engine {
  readonly system: string;
  readonly template: string;
  readonly schema: Record<string, unknown>;
}

let engine: Engine | null = null;

export function engineDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'Shin_Gemini_Pricing_Engine');
}

/** Read once, from the package on disk, so editing the package changes the prompt. */
export function loadEngine(): Engine {
  if (engine) return engine;
  const dir = engineDir();
  const read = (name: string): string => readFileSync(join(dir, name), 'utf8');
  engine = {
    system: `${read('GEMINI_SYSTEM.md').trim()}\n\n${read('PRICING_GUIDE.md').trim()}`,
    template: read('scan_prompt.md'),
    schema: JSON.parse(read('response_schema.json')) as Record<string, unknown>,
  };
  return engine;
}

/** A compact example object built from a JSON schema, for asking for the shape in words. */
export function skeleton(node: unknown): unknown {
  const n = node as { type?: unknown; properties?: Record<string, unknown>; items?: unknown; enum?: unknown[] };
  if (!n || typeof n !== 'object') return 'any';
  const types = Array.isArray(n.type) ? (n.type as string[]) : n.type ? [n.type as string] : [];
  const objectLike = types.includes('object') && n.properties;
  const arrayLike = types.includes('array') && n.items;
  const nullable = types.includes('null');
  if (objectLike) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n.properties as Record<string, unknown>)) out[k] = skeleton(v);
    return nullable ? { '(or null)': out } : out;
  }
  if (arrayLike) return [skeleton(n.items)];
  if (Array.isArray(n.enum)) return n.enum.map((x) => (x === null ? 'null' : String(x))).join('|');
  return types.length ? types.join('|') : 'any';
}

const NOT_STATED = 'not stated (do not assume any country; use the currency and store on the shelf if the image shows them)';

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, key: string) => (key in values ? values[key] : whole));
}

/**
 * The user's three ranges as the lines the prompt states. Percent mode names the
 * numbers outright. Dollar mode names the amounts and the unit, and the prompt's
 * price math (scan_prompt.md) tells Gemini how to turn them into percents.
 */
export function rangesText(t: Thresholds): string {
  if (t.unit === 'amount' && t.amounts) {
    const a = t.amounts;
    return [
      'Unit: DOLLAR AMOUNTS in the user\'s currency, per item at the shelf size (the shelf price against the median price for that same size).',
      `Great range: ${a.great} or more below the median`,
      `Good range: ${a.good} or more below the median`,
      `Bad range: more than ${a.bad} above the median`,
    ].join('\n');
  }
  return [
    'Unit: PERCENT of the median.',
    `Great range: ${t.greatPct ?? 20}% or more below the median`,
    `Good range: ${t.underPct}% or more below the median`,
    `Bad range: more than ${t.overPct}% above the median`,
  ].join('\n');
}

export interface BuiltPrompt {
  readonly system: string;
  readonly user: string;
}

export function buildScanPrompt(input: ScanInput, family: ModelFamily): BuiltPrompt {
  const e = loadEngine();
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  const currency = input.currency?.trim() || null;
  const shelf =
    input.shelfPriceCents && input.shelfPriceCents > 0
      ? `${(input.shelfPriceCents / 100).toFixed(2)}${currency ? ` ${currency}` : ''}`
      : 'null';
  const imageNote =
    input.kind === 'photo'
      ? `The supplied image is Shin's selected cropped scan image. Image sharpness score: ${
          typeof input.sharpness === 'number' && Number.isFinite(input.sharpness) ? input.sharpness : 'null'
        }`
      : 'No image is supplied for this scan.';
  const output =
    family === '3.x'
      ? 'Return only the structured object defined by the response schema.'
      : 'Return ONLY one JSON object and nothing else: no Markdown, no code fence, no text before or after it. ' +
        'It must have exactly this shape (a type list such as string|null means that kind of value or null; ' +
        'an array holds zero or more of the element shown; "(or null)" means the whole object may be null):\n' +
        JSON.stringify(skeleton(e.schema));
  const alt: AlternativesContext = input.alternatives ?? { mode: alternativesModeFor(input.shelfPriceCents) };
  const mf = input.marketFields ?? {};
  const known = (v: string | null | undefined, none: string): string => (v && v.trim() !== '' ? v.trim() : none);
  const user = fill(e.template, {
    MARKET_COUNTRY_OR_UNKNOWN: known(mf.MARKET_COUNTRY_OR_UNKNOWN, 'unknown'),
    MARKET_REGION_OR_UNKNOWN: known(mf.MARKET_REGION_OR_UNKNOWN, 'unknown'),
    MARKET_CURRENCY_OR_UNKNOWN: known(mf.MARKET_CURRENCY_OR_UNKNOWN, 'unknown'),
    REGION_MATTERS_HINT: known(mf.REGION_MATTERS_HINT, 'unknown'),
    CROSS_BORDER_HINT: known(mf.CROSS_BORDER_HINT, 'unknown'),
    ALTERNATIVES_MODE: alt.mode,
    USER_STORE_TYPE_OR_UNKNOWN: known(alt.storeType, 'unknown'),
    USER_CONDITION_OR_UNKNOWN: known(alt.condition, 'unknown'),
    USER_MAX_TRAVEL_KM_OR_NULL: typeof alt.maxTravelKm === 'number' && Number.isFinite(alt.maxTravelKm) ? String(alt.maxTravelKm) : 'null',
    USER_HAS_MEMBERSHIP_OR_NULL: typeof alt.hasMembership === 'boolean' ? String(alt.hasMembership) : 'null',
    USER_REQUIRED_ATTRIBUTES_OR_NONE: alt.requiredAttributes && alt.requiredAttributes.length ? alt.requiredAttributes.join(', ') : 'none',
    SCAN_TYPE: input.kind,
    BARCODE_OR_NULL: input.barcode?.trim() || 'null',
    MARKET: input.market?.trim() || NOT_STATED,
    CURRENCY: currency || NOT_STATED,
    LANGUAGE: input.language?.trim() || 'not stated (answer in the language of the product and the market)',
    SHELF_PRICE_OR_NULL: shelf,
    USER_INPUT_OR_NULL: [input.text?.trim() ? `The user typed the name: ${input.text.trim()}` : '', input.userInput?.trim() ?? '']
      .filter(Boolean)
      .join(' ') || 'null',
    THRESHOLDS_SOURCE: t.source === 'user' ? "the user's own setting" : 'the default range, because the user has set none',
    RANGES_TEXT: rangesText(t),
    IMAGE_NOTE: imageNote,
    OUTPUT_FORMAT: output,
  });
  return { system: e.system, user };
}

/* ----------------------------------------------------------------- request */

export interface RequestBody {
  model: string;
  system_instruction: string;
  input: unknown[] | string;
  tools: { type: string }[];
  store: false;
  response_format?: { type: 'text'; mime_type: 'application/json'; schema: unknown };
  generation_config?: { thinking_level: string };
}

/**
 * ITEM 7. Whether this scan carries anything a search could be spent on: a
 * barcode, typed text, a typed name, or an actual photograph. Ruling 6
 * (docs/decisions.md 2026-09-19): grounding is skipped only in this one case,
 * "where a grounded query would be spent on nothing." Every other scan
 * grounds exactly as before. Never Shin's own catalogue and never a cache
 * check (a different item): only whether there is an identity to search for.
 */
export function hasSearchableIdentity(input: ScanInput): boolean {
  if (input.barcode && input.barcode.trim() !== '') return true;
  if (input.text && input.text.trim() !== '') return true;
  if (input.userInput && input.userInput.trim() !== '') return true;
  if (input.image && input.image.bytes && input.image.bytes.length > 0) return true;
  return false;
}

export function buildRequestBody(
  input: ScanInput,
  choice: ModelChoice,
): { body: RequestBody; prompt: BuiltPrompt; grounded: boolean } {
  const prompt = buildScanPrompt(input, choice.family);
  const parts: unknown[] =
    input.kind === 'photo' && input.image
      ? [
          {
            type: 'image',
            data: Buffer.from(input.image.bytes).toString('base64'),
            mime_type: input.image.mediaType,
            resolution: mediaResolution(),
          },
          { type: 'text', text: prompt.user },
        ]
      : [{ type: 'text', text: prompt.user }];
  const grounded = hasSearchableIdentity(input);
  const body: RequestBody = {
    model: choice.model,
    system_instruction: prompt.system,
    input: parts.length === 1 ? prompt.user : parts,
    tools: grounded ? [{ type: 'google_search' }] : [],
    store: false,
  };
  if (choice.family === '3.x') {
    body.response_format = { type: 'text', mime_type: 'application/json', schema: loadEngine().schema };
    body.generation_config = { thinking_level: thinkingLevel(choice.model) };
  }
  return { body, prompt, grounded };
}

/** The request as it is stored: complete, with image bytes stood in for by their hash and size. */
export function requestForRecord(body: RequestBody): { json: string; imageRef: string | null } {
  let imageRef: string | null = null;
  const clone = JSON.parse(
    JSON.stringify(body, (_k, v) => v),
  ) as RequestBody;
  if (Array.isArray(clone.input)) {
    clone.input = clone.input.map((p) => {
      const part = p as { type?: string; data?: string };
      if (part.type === 'image' && typeof part.data === 'string') {
        const bytes = Buffer.from(part.data, 'base64');
        imageRef = `image:sha256:${createHash('sha256').update(bytes).digest('hex')}:${bytes.length}B`;
        return { ...part, data: `[${imageRef}; bytes are in the photos folder only with consent]` };
      }
      return p;
    });
  }
  return { json: JSON.stringify(clone), imageRef };
}

/* ------------------------------------------------------------ reading text */

/** Closes every open string, array and object in `s`, in the order they were opened. */
function closeUp(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = s;
  if (inStr) out += '"';
  out = out.replace(/[,:\s]+$/, '');
  return out + stack.reverse().join('');
}

function lastCommaOutsideString(s: string): number {
  let inStr = false;
  let esc = false;
  let last = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === ',') last = i;
  }
  return last;
}

/**
 * Best effort at a JSON object out of text that is not clean JSON: prose
 * around it, a fence, trailing commas, or an answer cut off mid-array. A cut
 * answer is closed up, and if that still does not parse the tail is cut back
 * one field at a time, so a truncated list of offers costs the last offers and
 * not the whole answer. Null only when nothing object-shaped is there.
 */
export function repairJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let s = text.slice(start).replace(/```[\s\S]*$/, '').replace(/,\s*([}\]])/g, '$1');
  for (let i = 0; i < 400; i++) {
    try {
      const v = JSON.parse(closeUp(s));
      if (v && typeof v === 'object') return v;
      return null;
    } catch {
      const cut = lastCommaOutsideString(s);
      if (cut <= 0) return null;
      s = s.slice(0, cut);
    }
  }
  return null;
}

/**
 * ITEM 17, the last-resort recovery, tried only for the model path that gets
 * no schema at all (family '2.5': nothing forces its reply to be clean JSON,
 * so it is the one path a stray wrapper actually reaches; a 3.x reply was
 * sent a schema and is trusted to have honoured it). Two wrapper shapes,
 * confirmed here to defeat both existing passes (the direct parse and the
 * balanced-bracket repair above):
 *
 *   DOUBLE-ENCODED: the whole reply is a JSON STRING holding the JSON, not the
 *   object itself. A direct parse succeeds structurally but yields a string,
 *   which the object check above already rejects; there is no unescaped `{`
 *   in the outer text for the balanced-bracket pass to find.
 *
 *   `text='...'` OR `text="..."`: a Python-repr-looking assignment around the
 *   answer (WhiteChristmas, `backend/src/main.py:89-111`), for the one shape
 *   of it that is not already recovered by the passes above.
 *
 * Whichever shape unwraps, the SAME three passes (direct parse, tolerant
 * slice, balanced-bracket repair) are tried again on what came out. A no-op,
 * returning null, on ordinary text: this never fires on an answer neither
 * shape describes, and it costs nothing when the answer was clean already.
 */
export function stripWrapperArtifact(text: string): string | null {
  const trimmed = text.trim();
  try {
    const direct = JSON.parse(trimmed);
    if (typeof direct === 'string' && direct.trim() !== '') return direct;
  } catch {
    /* not double-encoded */
  }
  const wrapped = trimmed.match(/^text\s*=\s*(['"])([\s\S]*)\1\s*$/);
  if (wrapped) return wrapped[2];
  return null;
}

/**
 * Where a SECOND top-level JSON object starts in one reply.
 *
 * The recorded website run (test/fixtures/gemini-website/
 * piece4-prices-reviews-description.json) says "Two JSON blocks came back
 * concatenated in one reply, not one", the first cut off mid-object and the
 * second complete. `parseJson` already prefers the LAST fenced block for that
 * reason; an unfenced pair had no such rule, so the balanced-bracket repair
 * walked back into the TRUNCATED first block and returned it as the answer.
 *
 * A start counts only when it begins a line AND the last thing written before
 * it is not `:`, `,` or `[`. The line test is what a concatenated block looks
 * like; the second test is what keeps a PRETTY-PRINTED reply out, because in
 * one of those every array element and nested value also opens at a line
 * start. Without it, a pretty-printed answer cut off mid-object would come
 * back as its own last offer, which is a far worse reading than the one this
 * function exists to fix.
 */
export function blockStarts(text: string): number[] {
  const starts: number[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch !== '{') continue;
    let j = i - 1;
    while (j >= 0 && /[ \t\r\n`]/.test(text[j])) j--;
    if (j >= 0 && !text.slice(j + 1, i).includes('\n')) continue; // not at a line start
    if (j >= 0 && (text[j] === ':' || text[j] === ',' || text[j] === '[')) continue; // a value or an element, not a block
    starts.push(i);
  }
  return starts;
}

export type ParseStatus = 'clean' | 'repaired' | 'failed' | 'none';

/** The three passes, in the order `interpretText` runs them, over one piece of text. */
function readObject(text: string): Record<string, unknown> | null {
  try {
    const direct = JSON.parse(text);
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  const tolerant = parseJson(text);
  if (tolerant && typeof tolerant === 'object' && !Array.isArray(tolerant)) return tolerant as Record<string, unknown>;
  const repaired = repairJson(text);
  if (repaired && typeof repaired === 'object' && !Array.isArray(repaired)) return repaired as Record<string, unknown>;
  return null;
}

export function interpretText(
  text: string | null,
  family?: ModelFamily,
): { value: Record<string, unknown> | null; status: ParseStatus } {
  if (text === null) return { value: null, status: 'none' };
  const trimmed = text.trim();
  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return { value: direct as Record<string, unknown>, status: 'clean' };
    }
  } catch {
    /* fall through */
  }
  /* Two or more blocks in one reply: the LAST one is the answer and the ones
     before it are drafts, the same rule `parseJson` already applies to fenced
     blocks. Each block is cut at the next block's start so it can never
     swallow the one after it. A reply with one block takes exactly the path
     below, untouched. */
  const starts = blockStarts(trimmed);
  if (starts.length > 1) {
    for (let i = starts.length - 1; i >= 0; i--) {
      const end = i + 1 < starts.length ? starts[i + 1] : trimmed.length;
      const value = readObject(trimmed.slice(starts[i], end));
      if (value !== null) return { value, status: 'repaired' };
    }
  }
  const tolerant = parseJson(trimmed);
  if (tolerant && typeof tolerant === 'object' && !Array.isArray(tolerant)) {
    return { value: tolerant as Record<string, unknown>, status: 'repaired' };
  }
  const repaired = repairJson(trimmed);
  if (repaired && typeof repaired === 'object' && !Array.isArray(repaired)) {
    return { value: repaired as Record<string, unknown>, status: 'repaired' };
  }
  if (family === '2.5') {
    const unwrapped = stripWrapperArtifact(trimmed);
    if (unwrapped !== null) {
      try {
        const direct2 = JSON.parse(unwrapped);
        if (direct2 && typeof direct2 === 'object' && !Array.isArray(direct2)) {
          return { value: direct2 as Record<string, unknown>, status: 'repaired' };
        }
      } catch {
        /* fall through to the tolerant passes below */
      }
      const tolerant2 = parseJson(unwrapped);
      if (tolerant2 && typeof tolerant2 === 'object' && !Array.isArray(tolerant2)) {
        return { value: tolerant2 as Record<string, unknown>, status: 'repaired' };
      }
      const repaired2 = repairJson(unwrapped);
      if (repaired2 && typeof repaired2 === 'object' && !Array.isArray(repaired2)) {
        return { value: repaired2 as Record<string, unknown>, status: 'repaired' };
      }
    }
  }
  return { value: null, status: 'failed' };
}

/* ------------------------------------------------------------ the answer */

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function s(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
function n(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function b(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

/** Everything the phone needs from the answer, read defensively so it can never throw. */
export interface ReadAnswer {
  readonly product: {
    readonly name: string | null;
    readonly brand: string | null;
    readonly size: string | null;
    readonly description: string | null;
    readonly confidence: number | null;
    readonly sources: { readonly name: string | null; readonly brand: string | null; readonly size: string | null };
  };
  readonly offers: readonly ReadOffer[];
  readonly reviews: readonly { rating: number | null; count: number | null; summary: string; url: string | null }[];
  readonly verdict: ReadVerdict | null;
  readonly overallConfidence: number | null;
  /** The currency Gemini says the shelf price is in (`pricing_summary.shelf_currency`), upper-cased, or null. Read for the hidden check only. */
  readonly shelfCurrency: string | null;
  /** Gemini's alternatives, read tolerantly. A bad or missing section is marked here and never fails the scan. */
  readonly alternatives: ReadAlternatives;
}

/**
 * How the `alternatives` section arrived, so a bad answer is marked and not silent.
 *   ok       every row was usable (and there is at least one)
 *   empty    Gemini returned an empty list, which is a correct answer
 *   partial  some rows were unusable and dropped, the rest are kept
 *   missing  the section was absent or not a list: no alternatives, the scan still answers
 */
export type AlternativesStatus = 'ok' | 'empty' | 'partial' | 'missing';

export interface ReadAlternative {
  readonly name: string;
  readonly brand: string | null;
  readonly kind: 'same_product' | 'substitute' | 'used_copy' | 'newer_model' | 'other';
  /** Gemini's one sentence on why this is an alternative, in the user's language. Null when it gave none. */
  readonly reason: string | null;
  readonly storeName: string | null;
  readonly storeType: string | null;
  readonly condition: 'new' | 'used' | 'refurbished' | 'unknown';
  /** The price as Gemini returned it, ready to read out. Shin does no arithmetic on it. */
  readonly priceText: string;
  readonly currency: string | null;
  /** The pack size as advertised, joined into text. Null when Gemini gave none. */
  readonly size: string | null;
  readonly url: string | null;
  readonly attributes: readonly string[];
  readonly notes: readonly string[];
}

export interface ReadAlternatives {
  readonly status: AlternativesStatus;
  readonly items: readonly ReadAlternative[];
  /** Rows that could not be used, one entry each, so a bad answer is counted. */
  readonly dropped: readonly { readonly index: number; readonly reason: string }[];
}

export const MAX_ALTERNATIVES = 5;
const ALT_KINDS: ReadonlySet<string> = new Set(['same_product', 'substitute', 'used_copy', 'newer_model', 'other']);
const ALT_CONDITIONS: ReadonlySet<string> = new Set(['new', 'used', 'refurbished']);

/** A price the way it is read out, from an integer in the currency's minor unit. Formatting only. */
function priceTextFromMinor(minor: number, currency: string | null): string {
  if (currency !== null && /^[A-Za-z]{3}$/.test(currency)) {
    try {
      const fmt = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() });
      const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
      return fmt.format(minor / 10 ** digits);
    } catch {
      /* an unknown code: fall through to the plain form */
    }
  }
  return `${(minor / 100).toFixed(2)}${currency ? ` ${currency}` : ''}`;
}

function strList(v: unknown): string[] {
  return arr(v)
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .map((x) => x.trim());
}

/**
 * Reads the `alternatives` section of Gemini's answer. NEVER THROWS, whatever it
 * is given. A row with no name or no price is dropped and counted; a missing or
 * non-list section is marked `missing` and yields none; more than five rows are
 * cut to five. A price is kept as Gemini wrote it (`price_text`), and only when
 * that is absent is one written from `price_cents`, as text, never as a number
 * Shin then reasons about.
 */
export function readAlternatives(raw: unknown): ReadAlternatives {
  let list: unknown[] | null = null;
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    const inner = (raw as { alternatives?: unknown; items?: unknown }).alternatives ?? (raw as { items?: unknown }).items;
    if (Array.isArray(inner)) list = inner;
  }
  if (list === null) return { status: 'missing', items: [], dropped: [] };
  if (list.length === 0) return { status: 'empty', items: [], dropped: [] };

  const items: ReadAlternative[] = [];
  const dropped: { index: number; reason: string }[] = [];
  list.forEach((row, index) => {
    try {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return void dropped.push({ index, reason: 'not an object' });
      const r = row as Record<string, unknown>;
      const name = s(r.name);
      if (name === null) return void dropped.push({ index, reason: 'no name' });
      const currency = s(r.currency)?.toUpperCase() ?? null;
      const minor = n(r.price_cents);
      const priceText = s(r.price_text) ?? (minor !== null && minor > 0 ? priceTextFromMinor(minor, currency) : null);
      if (priceText === null) return void dropped.push({ index, reason: 'no usable price' });
      if (items.length >= MAX_ALTERNATIVES) return; // more than five is cut to five, which is not a bad row
      const kind = s(r.kind);
      const cond = s(r.condition)?.toLowerCase() ?? '';
      const size = rec(r.size);
      const sizeValue = n(size.value);
      const sizeUnit = s(size.unit);
      items.push({
        name,
        brand: s(r.brand),
        kind: kind !== null && ALT_KINDS.has(kind) ? (kind as ReadAlternative['kind']) : 'other',
        reason: s(r.reason),
        storeName: s(r.store_name),
        storeType: s(r.store_type),
        condition: ALT_CONDITIONS.has(cond) ? (cond as 'new' | 'used' | 'refurbished') : 'unknown',
        priceText,
        currency,
        size: sizeValue !== null ? `${sizeValue}${sizeUnit ? ` ${sizeUnit}` : ''}` : null,
        url: cleanUrl(r.url),
        attributes: strList(r.attributes),
        notes: strList(r.constraint_notes),
      });
    } catch {
      dropped.push({ index, reason: 'unreadable row' });
    }
  });
  return { status: dropped.length > 0 ? 'partial' : 'ok', items, dropped };
}

export interface ReadOffer {
  readonly raw: Record<string, unknown>;
  readonly retailer: string | null;
  readonly price: number | null;
  /** The currency Gemini gave this offer, upper-cased, or null. Read for the hidden check only. */
  readonly currency: string | null;
  readonly unitPrice: number | null;
  readonly inMedian: boolean;
  readonly exclusionReason: string | null;
  readonly pctVsMedian: number | null;
  readonly position: number | null;
}

export interface ReadVerdict {
  readonly available: boolean;
  readonly noVerdictReason: string | null;
  readonly comparisonUnit: string | null;
  readonly median: number | null;
  readonly offersInMedian: number | null;
  readonly spanPct: number | null;
  readonly zoneUnderBoundary: number | null;
  readonly zoneOverBoundary: number | null;
  readonly shelf: { unitPrice: number | null; pct: number | null; position: number | null; zone: string | null; label: string | null } | null;
  readonly confidence: 'thin' | 'ok';
  readonly sizeAssumed: boolean;
}

export function readAnswer(value: Record<string, unknown> | null): ReadAnswer | null {
  if (value === null) return null;
  const p = rec(value.product);
  const src = rec(p.sources);
  const offers: ReadOffer[] = arr(value.offers).map((o) => {
    const r = rec(o);
    return {
      raw: r,
      retailer: s(r.retailer),
      price: n(r.price),
      currency: s(r.currency)?.toUpperCase() ?? null,
      unitPrice: n(r.unit_price),
      inMedian: r.in_median === true,
      exclusionReason: s(r.exclusion_reason),
      pctVsMedian: n(r.pct_vs_median),
      position: n(r.position),
    };
  });
  const v = rec(value.price_verdict);
  const hasVerdict = Object.keys(v).length > 0;
  const shelfRaw = rec(v.shelf);
  return {
    product: {
      name: s(p.name),
      brand: s(p.brand),
      size: s(p.size),
      description: s(p.description),
      confidence: n(p.identification_confidence),
      sources: { name: s(src.name), brand: s(src.brand), size: s(src.size) },
    },
    offers,
    reviews: arr(value.reviews)
      .map((x) => rec(x))
      .map((r) => ({ rating: n(r.rating), count: n(r.review_count), summary: s(r.summary) ?? '', url: cleanUrl(r.url) }))
      .filter((r) => r.summary !== '' || r.rating !== null),
    verdict: hasVerdict
      ? {
          available: v.verdict_available === true,
          noVerdictReason: s(v.no_verdict_reason),
          comparisonUnit: s(v.comparison_unit),
          median: n(v.median_unit_price),
          offersInMedian: n(v.offers_in_median),
          spanPct: n(v.span_pct),
          zoneUnderBoundary: n(v.zone_under_boundary),
          zoneOverBoundary: n(v.zone_over_boundary),
          shelf: Object.keys(shelfRaw).length
            ? {
                unitPrice: n(shelfRaw.unit_price),
                pct: n(shelfRaw.pct_vs_median),
                position: n(shelfRaw.position),
                zone: s(shelfRaw.zone),
                label: s(shelfRaw.label),
              }
            : null,
          confidence: v.confidence === 'thin' ? 'thin' : 'ok',
          sizeAssumed: v.size_assumed === true,
        }
      : null,
    overallConfidence: n(rec(value.uncertainty).overall_confidence),
    shelfCurrency: s(rec(value.pricing_summary).shelf_currency)?.toUpperCase() ?? null,
    alternatives: readAlternatives(value.alternatives),
  };
}

/* -------------------------------------------------- item 17, schema re-check */

export type SchemaViolationKind = 'unknown_key' | 'missing_required' | 'wrong_type' | 'too_many_items';

export interface SchemaViolation {
  readonly path: string;
  readonly kind: SchemaViolationKind;
  readonly detail: string;
}

type JsonSchemaNode = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  maxItems?: number;
  additionalProperties?: boolean;
};

function schemaTypes(node: JsonSchemaNode): string[] {
  return Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  return true;
}

/**
 * ITEM 17. Re-validates the parsed object against `response_schema.json`,
 * INDEPENDENTLY of whether the model was ever sent that schema (2.5 never is,
 * and 3.x adhering to its own schema is not proof this file agrees with it).
 * Every unknown key is counted rather than silently dropped, the way the
 * plain readers above (`s`/`n`/`b`/`rec`) already silently drop one. Never
 * throws, never used to refuse an answer (rule 6): its only output is a list,
 * for the caller to record.
 */
export function validateAgainstSchema(value: unknown, schema: unknown, path = '$'): SchemaViolation[] {
  const node = schema as JsonSchemaNode;
  const types = schemaTypes(node);
  const out: SchemaViolation[] = [];
  if (types.length > 0 && !types.some((t) => matchesType(value, t))) {
    out.push({ path, kind: 'wrong_type', detail: `expected ${types.join('|')}, got ${value === null ? 'null' : typeof value}` });
    return out;
  }
  if (types.includes('object') && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = node.properties ?? {};
    if (node.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) out.push({ path: `${path}.${key}`, kind: 'unknown_key', detail: key });
      }
    }
    for (const key of node.required ?? []) {
      if (!(key in obj)) out.push({ path: `${path}.${key}`, kind: 'missing_required', detail: key });
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) out.push(...validateAgainstSchema(obj[key], sub, `${path}.${key}`));
    }
  } else if (types.includes('array') && Array.isArray(value)) {
    if (typeof node.maxItems === 'number' && value.length > node.maxItems) {
      out.push({ path, kind: 'too_many_items', detail: `${value.length} items, more than ${node.maxItems}` });
    }
    if (node.items) {
      value.forEach((item, i) => out.push(...validateAgainstSchema(item, node.items as JsonSchemaNode, `${path}[${i}]`)));
    }
  }
  return out;
}

/* ------------------------------------------------------------ item 4, guards */

export type PriceSuppressionReason = 'currency_mismatch' | 'implausible_price';

/** A price this file decided not to show, and why. Never silent (ruling 4, docs/decisions.md 2026-09-19). */
export interface PriceSuppression {
  readonly retailer: string | null;
  readonly reason: PriceSuppressionReason;
}

/** What an offer is checked against: never Shin's own computed median, always Gemini's own. */
export interface GuardReference {
  readonly currency: string | null;
  readonly median: number | null;
}

/**
 * The one reference every guard call in this file builds from: Gemini's own
 * shelf currency if it gave one, else the scan's own declared currency, never
 * Shin's; Gemini's own stated median, never one Shin recomputed. Shared by
 * `runGeminiScan` (to compute what to record) and `toAnswerBlock` (to compute
 * what to show) so the two are never able to disagree on what a guard call means.
 */
export function guardReferenceFor(answer: ReadAnswer | null, scanCurrency: string | null): GuardReference {
  return {
    currency: (answer?.shelfCurrency ?? scanCurrency ?? null)?.trim().toUpperCase() || null,
    median: answer?.verdict?.median ?? null,
  };
}

/**
 * ITEM 4. Two of the three live price guards (the third, the hidden math
 * check, stays audit-only below -- `identify/test/gemini-scan.test.ts` "the
 * block shows Gemini's own median, not one recomputed from its offers" is
 * deliberate, and this function never touches the verdict). A price that
 * fails either check is WITHHELD (its `price`/`unitPrice` become null, which
 * drops it out of what `shownFrom` builds), never replaced with a guess, and
 * the withholding is recorded rather than silent (ruling 4). Both checks are
 * skipped, never guessed, when the reference itself is unknown: a null
 * `reference.currency` or `reference.median` guards nothing.
 *
 *   CURRENCY: an offer whose stated currency does not match the reference
 *   (Gemini's own shelf currency, or failing that the scan's own declared
 *   currency -- never Shin's).
 *
 *   PLAUSIBILITY FLOOR: an offer whose unit price falls outside
 *   `LONE_CLAIM_FLOOR`/`LONE_CLAIM_CEILING` of the reference median (the same
 *   band `gauge.ts` already uses for the grounded-only flow), where the
 *   reference is Gemini's own stated median, never one Shin computed.
 */
export function guardOffers(
  offers: readonly ReadOffer[],
  reference: GuardReference,
): { readonly offers: readonly ReadOffer[]; readonly suppressed: readonly PriceSuppression[] } {
  const suppressed: PriceSuppression[] = [];
  const guarded = offers.map((o) => {
    if (o.price === null) return o;
    if (reference.currency !== null && o.currency !== null && o.currency !== reference.currency) {
      suppressed.push({ retailer: o.retailer, reason: 'currency_mismatch' });
      return { ...o, price: null, unitPrice: null };
    }
    if (
      reference.median !== null &&
      reference.median > 0 &&
      o.unitPrice !== null &&
      (o.unitPrice < reference.median * LONE_CLAIM_FLOOR || o.unitPrice > reference.median * LONE_CLAIM_CEILING)
    ) {
      suppressed.push({ retailer: o.retailer, reason: 'implausible_price' });
      return { ...o, price: null, unitPrice: null };
    }
    return o;
  });
  return { offers: guarded, suppressed };
}

/* -------------------------------------------------------- item 20, latency */

export interface StageLatency {
  readonly promptBuildMs: number;
  readonly requestMs: number;
  readonly parseMs: number;
  readonly validateMs: number;
}

/* ---------------------------------------------------------------- the run */

export interface GeminiRun {
  readonly model: string;
  readonly family: ModelFamily;
  readonly via: 'env' | 'hash' | 'default';
  readonly scanType: ScanType;
  /** The full request body as sent, image bytes replaced by a stub. */
  readonly requestJson: string;
  readonly systemText: string;
  /** The exact user-turn prompt. */
  readonly promptText: string;
  /** Digits for a barcode, an image reference for a photo, the typed name for text. */
  readonly inputRef: string | null;
  readonly thresholds: Thresholds;
  readonly shelfPriceCents: number | null;
  /** The scan's own declared currency, ISO code, upper-cased. Read for the live price guard only (item 4). */
  readonly currency: string | null;
  /** The whole HTTP response body as received, or null when nothing came back. */
  readonly responseRaw: string | null;
  readonly httpStatus: number | null;
  /** The model's final answer text. */
  readonly answerText: string | null;
  readonly parseStatus: ParseStatus;
  readonly answer: ReadAnswer | null;
  readonly parsed: Record<string, unknown> | null;
  readonly citations: readonly Citation[];
  readonly searchQueries: readonly string[];
  readonly suggestionsHtml: string;
  readonly usage: TokenUsage;
  readonly ms: number;
  readonly failure: FailureClass | null;
  readonly failureMessage: string | null;
  /** Why the answer carries a "not fully confident" mark, empty when it does not. */
  readonly confidenceReasons: readonly string[];
  /** True when the phone must show the "not fully confident" mark. */
  readonly lowConfidence: boolean;
  /**
   * True when this call went out (or was stopped) past the daily soft spend cap.
   * It is a mark on the scan and never a reason to refuse one.
   */
  readonly overCap: boolean;
  /** ITEM 7. False only when the scan had no searchable identity at all (ruling 6). */
  readonly grounded: boolean;
  /** ITEM 14/4. Never shown, never used to withhold anything here: an audit mark only. */
  readonly mathCheck: MathCheck;
  /** ITEM 4. Every price this run withheld before the answer was built, and why. */
  readonly priceSuppressions: readonly PriceSuppression[];
  /** ITEM 20. Prompt build, the HTTP call, parsing and re-validation, alongside `ms` (the total). */
  readonly stageMs: StageLatency;
  /** ITEM 17. What the parsed object had that `response_schema.json` does not allow. */
  readonly schemaViolations: readonly SchemaViolation[];
  readonly unknownKeyCount: number;
}

export interface RunOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly transport?: GroundedTransport;
  readonly timeoutMs?: number;
  readonly deviceId: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => number;
  /**
   * The daily spend cap (identify/src/cap.ts). Called once, just before the
   * call would go out, and only when a key is present. A plain `false`, or
   * `{ allowed: false }`, means the HARD runaway ceiling was hit: no call is
   * made, and the run comes back marked `spend_cap_reached` (a kind, retryable
   * answer, never a throw). Crossing only the SOFT cap does not refuse:
   * `{ allowed: true, overCap: true }` lets the call go and marks the run
   * `overCap` (audit rows 16 and 32: always an answer).
   */
  readonly spendGuard?: () => boolean | { readonly allowed: boolean; readonly overCap: boolean };
}

const DEFAULT_TIMEOUT_MS = 30_000;

function confidenceOf(answer: ReadAnswer | null, status: ParseStatus, failure: FailureClass | null): string[] {
  const reasons: string[] = [];
  if (failure) reasons.push(`no_answer:${failure}`);
  if (status === 'repaired') reasons.push('answer_repaired');
  if (status === 'failed' || status === 'none') reasons.push('answer_unparsed');
  if (answer) {
    if (!answer.product.name) reasons.push('no_product_name');
    if (answer.product.confidence !== null && answer.product.confidence < 0.5) reasons.push('identification_confidence_low');
    if (answer.overallConfidence !== null && answer.overallConfidence < 0.5) reasons.push('overall_confidence_low');
  }
  return reasons;
}

/**
 * Makes the one call. NEVER THROWS at the caller: every failure comes back as
 * a run with `failure` set and `lowConfidence` true, because the person gets an
 * answer or a marked absence of one, and never a stack trace (rule 6).
 */
export async function runGeminiScan(input: ScanInput, opts: RunOptions): Promise<GeminiRun> {
  const clock = opts.now ?? Date.now;
  const started = clock();
  const env = opts.env ?? process.env;
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;
  const choice = modelForScan(opts.deviceId, env);
  const inputRef =
    input.kind === 'barcode' ? (input.barcode ?? null) : input.kind === 'text' ? (input.text ?? null) : null;
  const grounded = hasSearchableIdentity(input);

  // ITEM 20. Timestamps for the stage breakdown, set as each stage finishes.
  // Any left null when `finish()` runs means that stage never happened, and
  // reads as zero rather than a guess.
  let tAfterBuild: number | null = null;
  let tAfterRequest: number | null = null;
  let tAfterParse: number | null = null;
  let tAfterValidate: number | null = null;
  function stageMsNow(): StageLatency {
    return {
      promptBuildMs: tAfterBuild !== null ? tAfterBuild - started : clock() - started,
      requestMs: tAfterBuild !== null && tAfterRequest !== null ? tAfterRequest - tAfterBuild : 0,
      parseMs: tAfterRequest !== null && tAfterParse !== null ? tAfterParse - tAfterRequest : 0,
      validateMs: tAfterParse !== null && tAfterValidate !== null ? tAfterValidate - tAfterParse : 0,
    };
  }

  let requestJson = '{}';
  let systemText = '';
  let promptText = '';
  let imageRef: string | null = null;
  let body: RequestBody | null = null;
  try {
    const built = buildRequestBody({ ...input, thresholds }, choice);
    body = built.body;
    systemText = built.prompt.system;
    promptText = built.prompt.user;
    const rec2 = requestForRecord(body);
    requestJson = rec2.json;
    imageRef = rec2.imageRef;
    tAfterBuild = clock();
  } catch (err) {
    return finish({ failure: 'model_client_error', failureMessage: `The prompt could not be built: ${String(err)}` });
  }

  let overCap = false;

  function finish(over: Partial<GeminiRun> & { failure?: FailureClass | null; failureMessage?: string | null }): GeminiRun {
    const parseStatus = over.parseStatus ?? 'none';
    const answer = over.answer ?? null;
    const failure = over.failure ?? null;
    const reasons = confidenceOf(answer, parseStatus, failure);
    return {
      model: choice.model,
      family: choice.family,
      via: choice.via,
      scanType: input.kind,
      requestJson,
      systemText,
      promptText,
      inputRef: inputRef ?? imageRef,
      thresholds,
      shelfPriceCents: input.shelfPriceCents ?? null,
      currency: input.currency?.trim().toUpperCase() || null,
      responseRaw: null,
      httpStatus: null,
      answerText: null,
      parseStatus,
      answer,
      parsed: null,
      citations: [],
      searchQueries: [],
      suggestionsHtml: '',
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      ms: clock() - started,
      failureMessage: null,
      grounded,
      mathCheck: { checked: false, mismatches: [], skipped: [] },
      priceSuppressions: [],
      stageMs: stageMsNow(),
      schemaViolations: [],
      unknownKeyCount: 0,
      ...over,
      failure,
      overCap,
      confidenceReasons: reasons,
      lowConfidence: reasons.length > 0,
    };
  }

  const apiKey = (opts.apiKey ?? process.env.GEMINI_API_KEY ?? '').trim();
  if (apiKey === '') return finish({ failure: 'model_client_error', failureMessage: 'No GEMINI_API_KEY, so no call was made.' });
  if (opts.spendGuard) {
    const verdict = opts.spendGuard();
    const allowed = typeof verdict === 'boolean' ? verdict : verdict.allowed;
    overCap = typeof verdict === 'boolean' ? !verdict : verdict.overCap;
    if (!allowed) return finish({ failure: 'spend_cap_reached', failureMessage: spendCapRefusalMessage() });
  }

  const base =
    opts.baseUrl ??
    process.env.SHIN_GEMINI_GROUNDED_BASE_URL ??
    process.env.SHIN_GEMINI_BASE_URL ??
    'https://generativelanguage.googleapis.com/v1beta/interactions';
  const transport: GroundedTransport = opts.transport ?? ((url, init) => fetch(url, init) as ReturnType<GroundedTransport>);
  const envTimeout = Number(env.SHIN_GEMINI_TIMEOUT_MS);
  const timeoutMs = opts.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: { ok: boolean; status: number; text(): Promise<string> };
  let raw: string;
  try {
    try {
      res = await transport(interactionsUrl(base), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      raw = await res.text();
      tAfterRequest = clock();
    } catch (err) {
      const timedOut = controller.signal.aborted;
      return finish({
        failure: timedOut ? 'model_timeout' : 'model_outage',
        failureMessage: timedOut ? 'The call ran out of time.' : `The call did not reach Gemini: ${String(err)}`,
      });
    }
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return finish({
      failure: classifyProviderError({ status: res.status, message: raw }),
      failureMessage: `Gemini answered HTTP ${res.status}: ${raw.slice(0, 300)}`,
      responseRaw: raw,
      httpStatus: res.status,
    });
  }

  let outer: { steps?: unknown; usage?: Record<string, unknown>; model?: unknown };
  try {
    outer = JSON.parse(raw) as typeof outer;
  } catch {
    return finish({ failure: 'model_malformed', failureMessage: 'The reply was not JSON.', responseRaw: raw, httpStatus: res.status });
  }
  const walked = walkSteps(Array.isArray(outer.steps) ? (outer.steps as Record<string, unknown>[]) : []);
  const usage = usageOf(outer.usage);
  if (walked.text === null) {
    return finish({
      failure: 'model_malformed',
      failureMessage: 'The reply carried no model output.',
      responseRaw: raw,
      httpStatus: res.status,
      usage,
      searchQueries: walked.searchQueries,
      citations: walked.citations,
      suggestionsHtml: walked.suggestionsHtml ?? '',
    });
  }
  const read = interpretText(walked.text, choice.family);
  tAfterParse = clock();

  const answer = readAnswer(read.value);
  // ITEM 4. Currency and plausibility, computed live, against Gemini's own
  // stated reference -- never Shin's own math. `run.answer` stays the answer
  // exactly as Gemini gave it (the hidden math check, item 14, and the eval
  // harness both need Gemini's own numbers, unwithheld); `toAnswerBlock` is
  // where a withheld price actually leaves what the phone is shown, applying
  // this same guard again at display time (see its header).
  const reference: GuardReference = guardReferenceFor(answer, input.currency ?? null);
  const guardResult = answer ? guardOffers(answer.offers, reference) : { offers: [], suppressed: [] };
  const mathCheck = checkMath(answer, thresholds, { shelfPriceCents: input.shelfPriceCents, currency: input.currency });
  // ITEM 17. Independent of whether this model was ever sent the schema at all.
  const schemaViolations = read.value !== null ? validateAgainstSchema(read.value, loadEngine().schema) : [];
  const unknownKeyCount = schemaViolations.filter((v) => v.kind === 'unknown_key').length;
  tAfterValidate = clock();

  return finish({
    responseRaw: raw,
    httpStatus: res.status,
    answerText: walked.text,
    parseStatus: read.status,
    parsed: read.value,
    answer,
    citations: walked.citations,
    searchQueries: walked.searchQueries,
    suggestionsHtml: walked.suggestionsHtml ?? '',
    usage,
    mathCheck,
    priceSuppressions: guardResult.suppressed,
    stageMs: stageMsNow(),
    schemaViolations,
    unknownKeyCount,
  });
}

/* ------------------------------------------------- what the phone is shown */

export interface AnswerBlock extends Omit<PriceBlock, 'verdict' | 'offers'> {
  readonly offers: readonly (ShownOffer & {
    readonly unitPrice: number | null;
    readonly inMedian: boolean;
    readonly exclusionReason: string | null;
    readonly pctVsMedian: number | null;
  })[];
  /** Gemini's own verdict, lifted across field for field. Null when it gave none. */
  readonly verdict: GeminiPriceLine | null;
  /** Identity, in the shape the barcode block had. */
  readonly name: string | null;
  readonly brand: string | null;
  readonly size: string | null;
  readonly facts: readonly { readonly field: 'name' | 'brand' | 'size'; readonly value: string; readonly url: string | null; readonly hasLink: boolean }[];
  /** Which model answered this scan. */
  readonly model: string;
  /** True when the phone must say it is not fully confident in this answer. */
  readonly lowConfidence: boolean;
  readonly confidenceReasons: readonly string[];
  readonly parseStatus: ParseStatus;
  /** True when a shelf price was sent with the scan; false means the verdict has no placement for it. */
  readonly shelfPriceSent: boolean;
  /**
   * Gemini's alternatives, as it returned them, at most five, best first. Empty
   * when there are none. NEVER part of the median or the verdict; Shin adds no
   * price math to them. `alternativesStatus` says how the section arrived.
   */
  readonly alternatives: readonly ReadAlternative[];
  readonly alternativesStatus: AlternativesStatus;
}

export interface GeminiPriceLine {
  readonly median: number;
  readonly n: number;
  readonly unitLabel: string;
  readonly span: number | null;
  readonly zoneUnderBoundary: number | null;
  readonly zoneOverBoundary: number | null;
  readonly ticks: readonly [];
  readonly points: readonly { retailer: string; position: number; url: string | null; label: string; marks: readonly ('member_only' | 'marketplace')[] }[];
  readonly excluded: readonly { retailer: string; code: string; note: string; label: string; url: string | null }[];
  readonly shelf: { readonly position: number; readonly zone: string; readonly pct: number } | null;
  readonly shelfLabel: string;
  readonly sizeAssumed: boolean;
  readonly confidence: 'thin' | 'ok';
  readonly shortfalls: readonly [];
}

function specsText(v: unknown): string | null {
  const list = arr(v).filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return list.length ? list.join(', ') : null;
}

function shownFrom(o: ReadOffer): AnswerBlock['offers'][number] | null {
  const r = o.raw;
  const url = cleanUrl(r.url);
  const price = o.price;
  const retailer = o.retailer ?? (url ? new URL(url).hostname.replace(/^www\./, '') : null);
  if (price === null || retailer === null) return null;
  const multi = b(r.multi_buy) === true;
  const bogo = b(r.bogo) === true;
  const offer: PriceOffer = {
    retailer,
    price,
    url,
    sizeValue: n(r.size_value),
    sizeUnit: s(r.size_unit),
    packCount: n(r.pack_count),
    modelNumber: s(r.model_number),
    specs: specsText(r.specs),
    condition: s(r.condition),
    currency: s(r.currency),
    marketplace: s(r.marketplace_status) === null ? null : s(r.marketplace_status) === 'marketplace',
    memberOnly: b(r.membership_required),
    dealKind: multi ? 'multi_buy' : bogo ? 'bogo' : null,
    dealUnits: multi ? n(r.quantity_covered) : null,
    observedAt: null,
    organic: b(r.organic),
    storeBrand: b(r.store_brand) === true ? 'store brand' : null,
    soldByWeight: b(r.sold_by_weight),
  };
  return {
    ...offer,
    hasLink: url !== null,
    unitPrice: o.unitPrice,
    inMedian: o.inMedian,
    exclusionReason: o.exclusionReason,
    pctVsMedian: o.pctVsMedian,
  };
}

const NO_LINE_CODES = new Set(['no_offers_on_line', 'no_shelf_size']);

/**
 * The phone's block, built from Gemini's own numbers. There is NO arithmetic
 * here: every median, percentage, position and zone is copied from
 * `price_verdict` and the per-offer fields. That is the whole of item 3, and
 * `identify/test/gemini-scan.test.ts` breaks it on purpose (a stated median
 * that disagrees with the offers is shown as stated).
 */
export function toAnswerBlock(run: GeminiRun): AnswerBlock {
  const raw = run.answer;
  // ITEM 4. The same guard `runGeminiScan` already recorded a suppression list
  // for, applied again here at display time: this is the one place a withheld
  // price actually leaves what the phone is shown. `run.answer` itself stays
  // Gemini's own, unwithheld, for consumers that need its own numbers (the
  // hidden math check, item 14, and the eval harness).
  const a = raw ? { ...raw, offers: guardOffers(raw.offers, guardReferenceFor(raw, run.currency)).offers } : null;
  const offers = (a?.offers ?? []).map(shownFrom).filter((x): x is NonNullable<typeof x> => x !== null);
  const reviews: ShownReview[] = (a?.reviews ?? []).map((r) => ({
    rating: r.rating,
    count: r.count,
    summary: r.summary,
    url: r.url,
    source: r.url ? new URL(r.url).hostname.replace(/^www\./, '') : r.summary.length > 40 ? `${r.summary.slice(0, 40).trim()}...` : r.summary || String(r.rating),
    hasLink: r.url !== null,
  }));

  const v = a?.verdict ?? null;
  let verdict: GeminiPriceLine | null = null;
  let noLineReason: AnswerBlock['noLineReason'] = null;
  if (v && v.available && v.median !== null) {
    const onLine = offers.filter((o) => o.inMedian);
    verdict = {
      median: v.median,
      n: v.offersInMedian ?? onLine.length,
      unitLabel: v.comparisonUnit ?? 'item',
      span: v.spanPct,
      zoneUnderBoundary: v.zoneUnderBoundary,
      zoneOverBoundary: v.zoneOverBoundary,
      ticks: [],
      points: (a?.offers ?? [])
        .map((o) => ({ o, shown: shownFrom(o) }))
        .filter((x) => x.shown && x.o.inMedian && x.o.position !== null)
        .map((x) => ({
          retailer: x.shown!.retailer,
          position: x.o.position as number,
          url: x.shown!.url,
          label: s(x.o.raw.advertised_price_text) ?? String(x.shown!.price),
          // Copied from what the offer says about itself, as the gauge does. They stay on the line.
          marks: [...(x.shown!.memberOnly ? ['member_only' as const] : []), ...(x.shown!.marketplace ? ['marketplace' as const] : [])],
        })),
      excluded: offers
        .filter((o) => !o.inMedian)
        .map((o) => ({
          retailer: o.retailer,
          code: o.exclusionReason ?? 'other',
          note: o.exclusionReason ?? '',
          label: String(o.price),
          url: o.url,
        })),
      shelf:
        v.shelf && v.shelf.position !== null && v.shelf.zone !== null && v.shelf.pct !== null
          ? { position: v.shelf.position, zone: v.shelf.zone, pct: v.shelf.pct }
          : null,
      shelfLabel: v.shelf?.label ?? '',
      sizeAssumed: v.sizeAssumed,
      confidence: v.confidence,
      shortfalls: [],
    };
  } else if (v && v.noVerdictReason) {
    noLineReason = (NO_LINE_CODES.has(v.noVerdictReason) ? v.noVerdictReason : 'no_offers_on_line') as AnswerBlock['noLineReason'];
  } else {
    /* NO LINE AND NO REASON IS THE ONE PAIR THE BLOCK MAY NEVER CARRY.
       `app/public/js/grounded.js` prints its "why there is no line" note only
       for these two codes, so a null reason beside a null verdict draws
       nothing at all: the defect that file's own comment records. Gemini can
       produce it (`verdict_available` false with a null `no_verdict_reason`,
       or true with a null median: the schema makes neither field agree with
       the other), so the reader closes it rather than the model. */
    noLineReason = !run.shelfPriceCents ? 'no_shelf_size' : 'no_offers_on_line';
  }

  const facts: AnswerBlock['facts'][number][] = [];
  if (a) {
    for (const field of ['name', 'brand', 'size'] as const) {
      const value = a.product[field];
      if (value === null) continue;
      const url = cleanUrl(a.product.sources[field]);
      facts.push({ field, value, url, hasLink: url !== null });
    }
  }
  return {
    kind: 'prices',
    checked: false,
    description: a?.product.description ?? null,
    offers,
    reviews,
    verdict,
    noLineReason,
    searchQueries: run.searchQueries,
    citations: run.citations,
    name: a?.product.name ?? null,
    brand: a?.product.brand ?? null,
    size: a?.product.size ?? null,
    facts,
    model: run.model,
    lowConfidence: run.lowConfidence,
    confidenceReasons: run.confidenceReasons,
    parseStatus: run.parseStatus,
    shelfPriceSent: run.shelfPriceCents !== null,
    alternatives: a?.alternatives.items ?? [],
    alternativesStatus: a?.alternatives.status ?? 'missing',
  };
}

/** The label the phone names the product by, and what the price pad is opened with. */
export function labelOf(run: GeminiRun): { label: string; brand: string | null; name: string | null; size: string | null } | null {
  const p = run.answer?.product;
  if (!p || !p.name) return null;
  const fold = (x: string) => x.toLowerCase();
  const label = [p.brand && !fold(p.name).includes(fold(p.brand)) ? p.brand : null, p.name, p.size].filter(Boolean).join(' ');
  return { label, brand: p.brand, name: p.name, size: p.size };
}

/* ------------------------------------------------- the hidden math check */

export interface MathMismatch {
  readonly field: string;
  readonly stated: number | string | boolean | null;
  readonly recomputed: number | string | boolean | null;
}

/** A part of the check that was left out, and why. A skip is a mark, never a guess and never a pass. */
export interface MathSkip {
  readonly field: string;
  readonly reason: string;
}

export interface MathCheck {
  /** False when the answer carried no math at all, so there was nothing to check. */
  readonly checked: boolean;
  readonly mismatches: readonly MathMismatch[];
  /** Parts of the check that could not be run (dollar mode: no shelf price, another currency, no size). */
  readonly skipped: readonly MathSkip[];
}

/** What the hidden check knows beyond Gemini's answer: what the user typed, and the user's currency. */
export interface MathContext {
  /** The shelf price the user typed, in the currency's minor unit; null or absent when they typed none. */
  readonly shelfPriceCents?: number | null;
  /** The user's currency (ISO code) as the scan request carried it; null or absent when unknown. */
  readonly currency?: string | null;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const close = (stated: number, computed: number, abs: number, rel: number): boolean =>
  Math.abs(stated - computed) <= Math.max(abs, Math.abs(computed) * rel);

/**
 * ITEM 14. Re-runs the arithmetic Gemini claims to have done, on the inputs it
 * returned, with the user's own thresholds. Never shown to anyone: its only
 * output is a mark on the stored call, so a wrong answer can be found later
 * along with the exact prompt. Tolerances allow for rounding, not for error.
 *
 * Dollar mode (`thresholds.unit === 'amount'`) is checked from three things Shin
 * does hold: Gemini's own median, the shelf price the user typed (`ctx`), and the
 * user's dollar amounts. The zone is recomputed in money at the shelf's size and
 * a mismatch is marked the same way percent mode marks one. A part that cannot be
 * run (no typed price, a currency that differs or is unknown, no way to get the
 * shelf's size) is listed in `skipped` with its reason: never guessed, never a pass.
 */
export function checkMath(answer: ReadAnswer | null, thresholds: Thresholds, ctx: MathContext = {}): MathCheck {
  const v = answer?.verdict ?? null;
  if (!answer || !v) return { checked: false, mismatches: [], skipped: [] };
  const out: MathMismatch[] = [];
  const onLine = answer.offers.filter((o) => o.inMedian && o.unitPrice !== null && o.unitPrice > 0);
  // One offer is a verdict now (its median is that price); only none is not.
  const median = onLine.length >= 1 ? medianOf(onLine.map((o) => o.unitPrice as number)) : null;

  if (v.available && onLine.length < 1) out.push({ field: 'verdict_available', stated: true, recomputed: false });
  if (!v.available && onLine.length >= 1 && v.noVerdictReason !== 'no_shelf_size') {
    out.push({ field: 'verdict_available', stated: false, recomputed: true });
  }
  if (median === null || !v.available) return { checked: true, mismatches: out, skipped: [] };

  if (v.offersInMedian !== null && v.offersInMedian !== onLine.length) {
    out.push({ field: 'offers_in_median', stated: v.offersInMedian, recomputed: onLine.length });
  }
  if (v.median === null || !close(v.median, median, 0.005, 0.005)) {
    out.push({ field: 'median_unit_price', stated: v.median, recomputed: median });
  }
  /* Dollar mode: the zone is recomputed in money from Gemini's median, the typed shelf
     price and the user's amounts. The position and span numbers rest on percents Gemini
     derived itself and are not checked in this mode. */
  if (thresholds.unit === 'amount') {
    const dollar = checkDollarZone(answer, v, thresholds, ctx);
    if (dollar.mismatch) out.push(dollar.mismatch);
    return { checked: true, mismatches: out, skipped: dollar.skip ? [dollar.skip] : [] };
  }
  const pctOf = (price: number): number => (median === 0 ? 0 : ((price - median) / median) * 100);
  const shelfPct = v.shelf && v.shelf.unitPrice !== null ? pctOf(v.shelf.unitPrice) : null;
  const allAbs = [...onLine.map((o) => Math.abs(pctOf(o.unitPrice as number))), ...(shelfPct === null ? [] : [Math.abs(shelfPct)])];
  let span = Math.ceil(Math.max(...allAbs, 1.5 * thresholds.underPct, 1.5 * thresholds.overPct) / 5) * 5;
  if (span <= 0) span = 5;
  const positionOf = (pct: number): number => 50 + (pct / span) * 50;

  if (v.spanPct === null || !close(v.spanPct, span, 0.5, 0)) out.push({ field: 'span_pct', stated: v.spanPct, recomputed: span });
  const under = 50 - (thresholds.underPct / span) * 50;
  const over = 50 + (thresholds.overPct / span) * 50;
  if (v.zoneUnderBoundary === null || !close(v.zoneUnderBoundary, under, 1, 0)) {
    out.push({ field: 'zone_under_boundary', stated: v.zoneUnderBoundary, recomputed: under });
  }
  if (v.zoneOverBoundary === null || !close(v.zoneOverBoundary, over, 1, 0)) {
    out.push({ field: 'zone_over_boundary', stated: v.zoneOverBoundary, recomputed: over });
  }
  if (v.shelf && shelfPct !== null) {
    if (v.shelf.pct === null || !close(v.shelf.pct, shelfPct, 0.5, 0)) {
      out.push({ field: 'shelf.pct_vs_median', stated: v.shelf.pct, recomputed: shelfPct });
    }
    const zone = shelfPct <= -thresholds.underPct ? 'under_your_line' : shelfPct > thresholds.overPct ? 'over_your_line' : 'middle';
    if (v.shelf.zone !== zone) out.push({ field: 'shelf.zone', stated: v.shelf.zone, recomputed: zone });
    if (v.shelf.position === null || !close(v.shelf.position, positionOf(shelfPct), 1, 0)) {
      out.push({ field: 'shelf.position', stated: v.shelf.position, recomputed: positionOf(shelfPct) });
    }
  }
  for (const o of onLine) {
    const want = positionOf(pctOf(o.unitPrice as number));
    if (o.position === null || !close(o.position, want, 1, 0)) {
      out.push({ field: `offer.position:${o.retailer ?? '?'}`, stated: o.position, recomputed: want });
    }
  }
  return { checked: true, mismatches: out, skipped: [] };
}

/**
 * The dollar-mode half of the hidden check. The thresholds are money per item at the
 * shelf's size (`great`, `good`, `bad`), so the median has to be put at that size:
 * median unit price times the size in comparison units. The size is 1 when the
 * comparison unit is "item", and otherwise the typed shelf price over Gemini's own
 * shelf unit price (price / (price per 100 g) = hundreds of grams). Then the shelf's
 * distance from that median, in money, is placed on the user's lines exactly as the
 * percent mode places a percent: at or below minus the good amount is under the line,
 * above the bad amount is over it, otherwise middle.
 *
 * Rounding: Gemini rounds its unit prices, and the size here is derived from a rounded
 * one, so a shelf price within 1 percent of the median (at least one cent) of a line is
 * not called wrong on either side of it. That band is rounding, not error.
 */
function checkDollarZone(
  answer: ReadAnswer,
  v: ReadVerdict,
  thresholds: Thresholds,
  ctx: MathContext,
): { mismatch: MathMismatch | null; skip: MathSkip | null } {
  const skip = (reason: string) => ({ mismatch: null, skip: { field: 'shelf.zone', reason } });
  const a = thresholds.amounts;
  if (!a) return skip('no_dollar_amounts');
  const cents = ctx.shelfPriceCents;
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) return skip('no_shelf_price');
  if (!v.shelf || v.shelf.zone === null) return skip('no_stated_shelf_zone');
  if (v.median === null || !(v.median > 0)) return skip('no_stated_median');

  // Same currency only: the typed price is in the user's currency, and so must Gemini's be.
  const user = ctx.currency?.trim().toUpperCase() || null;
  if (user === null) return skip('user_currency_unknown');
  const theirs = new Set(
    [answer.shelfCurrency, ...answer.offers.filter((o) => o.inMedian).map((o) => o.currency)].filter((c): c is string => c !== null),
  );
  if (theirs.size === 0) return skip('gemini_currency_unstated');
  if ([...theirs].some((c) => c !== user)) return skip('currency_differs');

  const price = cents / 100;
  let sizeUnits: number;
  if (v.comparisonUnit?.trim().toLowerCase() === 'item') {
    sizeUnits = 1;
  } else if (v.shelf.unitPrice !== null && v.shelf.unitPrice > 0) {
    sizeUnits = price / v.shelf.unitPrice;
  } else {
    return skip('shelf_size_unknown');
  }
  const medianAtSize = v.median * sizeUnits;
  const zoneAt = (diff: number): string => (diff <= -a.good ? 'under_your_line' : diff > a.bad ? 'over_your_line' : 'middle');
  const diff = price - medianAtSize;
  const eps = Math.max(0.01, 0.01 * medianAtSize);
  const allowed = new Set([zoneAt(diff), zoneAt(diff - eps), zoneAt(diff + eps)]);
  if (allowed.has(v.shelf.zone)) return { mismatch: null, skip: null };
  return { mismatch: { field: 'shelf.zone', stated: v.shelf.zone, recomputed: zoneAt(diff) }, skip: null };
}
