/**
 * Turning a crop into fields. Decisions 16, 21 and, for the tag, 10.
 *
 * WHY FIELDS AND NOT PROSE (decision 16). A sentence has to be parsed, and a
 * parser over model prose is a second thing that can be wrong, silently, on the
 * inputs nobody tested. Worse, prose hides ambiguity: "looks like a jar of Kraft
 * peanut butter, possibly the smooth one" collapses into one string, and the
 * doubt in it is gone by the time anything downstream reads it. Structured
 * output makes the doubt a field.
 *
 * WHY BOTH CROPS IN ONE CALL (decision 10). The product and its shelf tag are
 * two crops of one moment. Sent together, the model can use each to read the
 * other -- a size on the tag confirms the size on the box -- and it costs one
 * round trip instead of two, which is most of decision 48's latency budget.
 *
 * WHY THE TIERS SHARE EVERYTHING BUT THE MODEL (decision 21). Same schema, same
 * prompt, same handling. Basic is not a cut-down experience, it is the same
 * experience with a smaller model behind it. A tier that feels broken does not
 * sell an upgrade; it teaches people the product does not work.
 *
 * WHAT THIS FILE STOPPED KNOWING, 2026-09-13 (beta plan item 22). It no longer
 * imports an SDK. The prompts, the schemas, the two clocks, the retry policy,
 * the call-count cap and the dollar cap are all still here, unchanged; the wire
 * is behind `provider.ts` and one adapter per vendor under `providers/`. The
 * levers added alongside it (`provider.ts`'s usage record, prompt caching,
 * output ceilings, cheap-first escalation) are every one of them OFF unless an
 * environment variable turns them on, so an empty environment sends exactly the
 * request this file sent before any of it existed.
 */

import { loadDotEnv } from './env.ts';
import {
  addUsage,
  classifyProviderError,
  type CacheHint,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
  type TokenUsage,
} from './provider.ts';
import { AnthropicProvider, anthropicClient, type MessagesClient } from './providers/anthropic.ts';
import { GeminiProvider } from './providers/gemini.ts';
import { XaiProvider } from './providers/xai.ts';

/**
 * Still exported from here, 2026-09-13.
 *
 * The type moved to `providers/anthropic.ts` when item 22 split the vendor out,
 * but `cap.ts`, `describe.ts`, `app/server.ts` and three test files all import
 * it from this module. A re-export costs nothing and keeps the refactor from
 * reaching into four packages it has no business editing.
 */
export type { MessagesClient } from './providers/anthropic.ts';
export type { Provider, ProviderRequest, ProviderResponse, TokenUsage } from './provider.ts';

export type Tier = 'basic' | 'pro';

/*
 * Decision 21: the only difference between the tiers.
 *
 * Pro was Opus 5 until 2026-09-05. Priced out at the crop this app actually
 * sends (1568px long edge, so 2,459 image tokens), one Opus identification cost
 * $0.0169 against Sonnet's $0.0068, and at 20 scans a week that is $17.58 a year
 * of inference per user against a subscription the whole category prices at $10
 * to $20. Reading a brand and a size off a label is not the kind of problem the
 * top tier is for. Opus is worth spending on the hard fallback after a cheaper
 * model comes back unsure, which is a different call than a default.
 */
const MODEL: Record<Tier, string> = {
  basic: 'claude-haiku-4-5',
  pro: 'claude-sonnet-5',
};

/**
 * WHAT WENT WRONG, AS A FIELD RATHER THAN A SENTENCE (added 2026-09-08).
 *
 * The beta readiness audit found every failure on this path reaching the user
 * as one sentence: the photo could not be read. That sentence is fine for the
 * person holding the phone and useless to us, because an outage on our side
 * and a genuinely dark photo then become the same row in the scan log. A beta
 * run inside an outage would read back as a beta full of bad photographers.
 *
 * So the class is a field, kept separate from the copy. The copy may stay
 * identical for every model failure (hard rule 3: nothing is aimed at the
 * user, and "our rate limit is full" is not a repair anybody can perform)
 * while the log gets the distinction the copy deliberately does not carry.
 *
 * `unreadable_photo` is the only member here that is about the photograph.
 * Every other member is about us or about the wire.
 */
export type FailureClass =
  | 'unreadable_photo'
  | 'model_timeout'
  | 'model_rate_limited'
  | 'model_outage'
  | 'model_malformed'
  | 'model_client_error'
  | 'spend_cap_reached';

/** Every throw out of `read()` is one of these, so a caller never has to guess. */
export class ModelCallError extends Error {
  readonly failure: FailureClass;
  /** How many API calls were actually spent before giving up. */
  readonly attempts: number;

  constructor(failure: FailureClass, message: string, attempts = 0) {
    super(message);
    this.name = 'ModelCallError';
    this.failure = failure;
    this.attempts = attempts;
  }
}

/** The class of anything thrown, whether or not it came from this file. */
export function failureOf(err: unknown): FailureClass {
  return err instanceof ModelCallError ? err.failure : classify(err);
}

/*
 * THE PER-CALL TIMEOUT, 2026-09-08.
 *
 * docs/the-moonshot.md section 1 item 8 sets the cold path, the one with no
 * tag and no barcode where this file is nearly the whole cost, at under 1
 * second p50 and 2 seconds p99, and quotes his own words for the bar: results
 * return in 1 second. Everything downstream of this call is small and
 * measured: a catalogue lookup at 24 to 113 ms and verdict arithmetic under
 * 20 ms. So the model call owns the budget. A call still open at 1.8 seconds
 * has already lost the p99 bar, and continuing to wait on it only decides how
 * long the screen goes on implying it is still working.
 *
 * WIDENED TO 3,500 ms, 2026-09-09 (docs/the-photo-path.md section 2).
 *
 * The 1,800 figure had no measurement behind it. It was arithmetic off a 2
 * second p99 bar that was itself an aspiration, and no photograph has ever gone
 * through the real API from this machine, so nothing in this repo has ever
 * observed how long the call actually takes.
 *
 * What changed is that the path is now two vision calls, not one: an extract
 * pass and, when pass one does not settle it, a pick pass over the catalogue
 * rows. Two calls cannot both fit inside a clock that was already a guess.
 * 3,500 for the extract and 3,000 for the pick sit inside the 8,000 ms call cap
 * with the photo budget at 7,000.
 *
 * REVERSES IF: a real key exists and a measured p95 comes in under this. The
 * number is a placeholder until then and should be re-measured, not defended.
 *
 * Read from the environment on each call rather than captured at import, so a
 * deployment can widen it without a rebuild and a test can shorten it without
 * mocking a clock.
 */
const TIMEOUT_MS = 3_500;

/*
 * The pick pass has its own clock, and its own model.
 *
 * Its own clock because it is a different question with a different answer
 * size: the extract pass transcribes a label, the pick pass returns an index
 * and a sentence. Sharing one number would have meant the smaller call
 * inheriting the larger call's allowance for no reason.
 *
 * Its own model because the pick is where the precision comes from. It runs at
 * most once per scan, only on the scans that did not settle on pass one, and it
 * is the call that turns a ranked guess into a chosen row, so both tiers get
 * Sonnet 5 for it rather than the tier's own model.
 */
const PICK_MODEL = 'claude-sonnet-5';
const PICK_TIMEOUT_MS = 3_000;

/*
 * THE RETRY POLICY, 2026-09-08.
 *
 * Two attempts, not three. A retry costs a whole second attempt inside a two
 * second bar, so there is room for exactly one, and the backoff has to be
 * shorter than anything a person would experience as a wait.
 *
 * Retried: 429, 5xx, and a network error carrying no status at all (a reset
 * socket, a DNS failure, a TLS handshake). Those are the three shapes where
 * the identical request sent again can succeed.
 *
 * NOT retried, deliberately:
 *   - a 4xx other than 429. The request is wrong; sending it again spends
 *     money to be told so twice.
 *   - a malformed response. The model answered, and it answered badly. The
 *     same prompt again is not a fix, it is a coin flip billed twice.
 *   - a timeout. This is the one that looks transient and is not affordable:
 *     the first attempt has already spent the entire p99 budget, so a second
 *     would be answering a screen the person stopped looking at.
 *
 * The SDK ships its own retry loop, maxRetries defaulting to 2. It is switched
 * off in the constructor and again at every call site, because two retry
 * policies stacked means the visible one is not the one that runs.
 */
const MAX_ATTEMPTS = 2;
const RETRY_ONLY_WITHIN_MS = 1_500;
const BACKOFF_MS = 200;
const BACKOFF_CAP_MS = 400;

/*
 * THE SPENDING CAP, 2026-09-08.
 *
 * Also the audit's finding: nothing anywhere refused to keep calling. The
 * thing this guards against is not a busy day, it is a loop -- a retry storm,
 * a stuck client, a script left pointed at the endpoint -- and the difference
 * between the two is that a loop does not stop on its own.
 *
 * A per-process count over a UTC day is the cheap version that needs no shared
 * state. A real per-account ceiling lives at the billing account and is not
 * this file's to enforce; this one exists so a single runaway process cannot
 * be the way we find out.
 *
 * The number is a ceiling, not a forecast. Decision 21's own costing puts a
 * pro identification at $0.0068, so 2,000 calls is roughly $14 of inference in
 * a day out of one process: far above anything one server should legitimately
 * be doing here, and far below a number anybody would rather learn from a bill.
 */
const DAILY_CALL_CAP = 2_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * An environment flag. Off unless it is explicitly one of these four words.
 *
 * Every lever added by beta plan item 21 is off by default and reads through
 * here, so the shipped behaviour with an empty environment is byte for byte the
 * behaviour that was there before the levers existed. That is not caution for
 * its own sake: none of the levers has ever been measured, because there is no
 * key on this machine, and a default-on lever would mean the first real
 * measurement was taken through an unproven change.
 */
function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/* ------------------------------------------------------------- item 21 levers
 *
 * THE OUTPUT CEILINGS. Small on purpose: the schema bounds the answer and a
 * large ceiling only buys the chance of a slow response inside a budget that is
 * already mostly spent. Exposed as tunables because the right ceiling is a
 * measurement nobody has taken -- a truncated answer reads as `model_malformed`
 * downstream, so a ceiling set too low would look like a model that cannot
 * follow a schema.
 */
const MAX_TOKENS_EXTRACT = 1_024;
const MAX_TOKENS_TAG = 512;
const MAX_TOKENS_PICK = 512;

/*
 * USAGE CAPTURE. Off by default. When on, `ModelReading.usage` and
 * `PickReading.usage` carry what the provider actually reported, so a cost can
 * be computed from a measurement instead of from `eval/run.ts`'s static
 * $0.0068-per-call guess. Nothing has ever been measured through it: there is no
 * key, so every usage record this repo has ever produced is four nulls from a
 * fake client.
 */
function usageEnabled(): boolean {
  return envFlag('SHIN_MODEL_USAGE');
}

/*
 * PROMPT CACHING. Off by default, and the caveat is bigger than the lever.
 *
 * Pass 2 re-sends the same image (about 2,459 tokens at the 1568 px crop), and
 * that image is the only prefix on this path worth caching at all. As the two
 * passes were written it CANNOT be cached: the render order is tools, then
 * system, then messages, and pass 1 (`SYSTEM`) and pass 2 (`PICK_SYSTEM`) use
 * different system prompts, so the prefix has already diverged before the image
 * is reached. A cache breakpoint after a diverged prefix hits nothing.
 *
 * So the lever restructures both passes onto ONE shared system prefix
 * (`SHARED_SYSTEM`) and moves each pass's own instruction into the user turn
 * AFTER the image, leaving exactly one `cache_control: {type:'ephemeral'}`
 * breakpoint on the image block.
 *
 * TWO THINGS THAT ARE STILL TRUE WITH THE LEVER ON.
 *
 * First, caches are model-scoped. On the basic tier the extract runs on Haiku
 * and the pick runs on Sonnet, so a cross-pass hit is impossible in principle,
 * not merely unlikely -- the restructure buys nothing there and the lever should
 * not be expected to. Only the pro tier (Sonnet on both passes) can hit at all,
 * and only on the scans where pass 2 actually runs.
 *
 * Second, there is a MINIMUM CACHEABLE PREFIX, somewhere in the 512 to 4,096
 * token range depending on the model, below which a breakpoint is silently
 * ignored. `SHARED_SYSTEM` plus one 2,459-token image is comfortably inside that
 * range for the larger models and may or may not clear it for the smaller ones.
 * Which side of the line a given model sits on has not been checked here.
 *
 * NO SAVING IS CLAIMED. A cache hit is visible only as a non-zero
 * `cache_read_input_tokens`, that field only arrives with the usage lever on,
 * and no call has ever been made. Anyone quoting a percentage off this lever
 * before that number exists is quoting an aspiration.
 */
function cacheEnabled(): boolean {
  return envFlag('SHIN_MODEL_PROMPT_CACHE');
}

/*
 * CHEAP-FIRST ESCALATION. Off by default on Anthropic, ON by default on Gemini.
 *
 * When basic's extract pass comes back saying `low` about itself, run the
 * extract once more on the pro model and keep that answer instead. The pick pass
 * is untouched: it already runs conditionally, on its own condition, decided in
 * `identify.ts`, and two conditional escalations stacked would make the number
 * of calls per scan a thing nobody can read off one file.
 *
 * A second call is a second charge against both caps, which is correct -- the
 * invoice does not care why a request was sent. If the escalated call fails for
 * any reason the first answer stands, because priority 1 is always answer.
 */
/*
 * WHY THE DEFAULT DEPENDS ON THE PROVIDER (2026-09-14, the founder's ruling
 * that identification runs cheap and re-runs on the bigger model only when the
 * cheap answer says `low` about itself).
 *
 * On Gemini the cheap model IS the plan: `providers/gemini.ts` maps the basic
 * tier to `gemini-3.5-flash-lite` and the pro tier to `gemini-3.8-flash`, so
 * escalation is the second half of a ruling whose first half is already in the
 * model table, and shipping only the first half would be shipping a cheaper
 * answer with nothing catching the ones it got wrong. On Anthropic nothing was
 * ruled and nothing changes: the flag stays off unless it is set, and an
 * environment that has never heard of Gemini sends exactly the calls it sent
 * yesterday.
 *
 * `SHIN_MODEL_ESCALATE` still wins in BOTH directions, which is why this reads
 * the variable itself instead of calling `envFlag`: `envFlag` cannot tell "not
 * set" from "set to 0", and here those have to mean different things.
 */
function escalationEnabled(): boolean {
  const raw = process.env.SHIN_MODEL_ESCALATE?.trim().toLowerCase();
  if (raw === undefined || raw === '') return geminiSelected();
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

const spend = { day: '', calls: 0 };

/** The UTC day the cap resets on. Not local: two machines have to agree. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Charges one call against the day's cap, or refuses.
 *
 * Charged per attempt rather than per `read()`, because a retry is a real
 * request that a real invoice will show, and a cap counting only first
 * attempts would be wrong by exactly the factor a retry storm multiplies by.
 */
function reserveCall(): boolean {
  const day = today();
  if (spend.day !== day) {
    spend.day = day;
    spend.calls = 0;
  }
  if (spend.calls >= envInt('SHIN_MODEL_DAILY_CALLS', DAILY_CALL_CAP)) return false;
  spend.calls += 1;
  return true;
}

/** What has been spent in the current window. For a health endpoint, and for tests. */
export function modelSpend(): { day: string; calls: number; cap: number } {
  return { day: spend.day, calls: spend.calls, cap: envInt('SHIN_MODEL_DAILY_CALLS', DAILY_CALL_CAP) };
}

/** Starts a fresh window. A test uses this; a long-lived process never needs to. */
export function resetModelSpend(): void {
  spend.day = '';
  spend.calls = 0;
}

/**
 * Maps anything thrown by a provider or by the wire onto the vocabulary above.
 *
 * The body moved to `provider.ts` on 2026-09-13 (item 22) so that a second
 * vendor's adapter classes a 429 the same way this one always has, instead of
 * each adapter growing its own opinion about what a 503 means. The union itself
 * stays declared in this file: it is the copy `spine/src/run.ts` and
 * `app/src/scans.ts` restate by hand and that `model.test.ts` checks by reading
 * this source.
 */
function classify(err: unknown): FailureClass {
  return classifyProviderError(err);
}

const RETRYABLE: ReadonlySet<FailureClass> = new Set<FailureClass>([
  'model_rate_limited',
  'model_outage',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The model's own view of itself, as a word.
 *
 * An enum and not a number, changed 2026-09-09. Asked for a number, a model
 * produces one that looks like a probability and is not one; the digits after
 * the decimal point are invented and they invite arithmetic that means nothing.
 * Three words is the resolution the thing actually has. Decision 18 still
 * treats it as one signal out of six either way, so the loss of imaginary
 * precision costs nothing downstream.
 */
export type SelfConfidence = 'high' | 'medium' | 'low';

/**
 * The enum turned back into the number the six-signal score expects.
 *
 * Kept at this boundary on purpose. `confidence.ts` weighs a 0..1 self-report
 * against five independent signals and has no business knowing that the model
 * now answers in words, so the translation happens once, here, where the words
 * come in. The numbers are the middles of the three thirds, not measurements.
 */
export function selfConfidenceNumber(value: unknown): number {
  // A number that arrives anyway is honoured rather than discarded: an older
  // fixture, or a model that ignored the enum, should not silently score zero.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  if (value === 'high') return 0.9;
  if (value === 'medium') return 0.6;
  if (value === 'low') return 0.3;
  return 0.3;
}

export interface IdentifiedFields {
  /**
   * TRANSCRIPTION BEFORE INTERPRETATION (2026-09-09).
   *
   * Every line legible on the front of the pack, verbatim, in reading order,
   * before any field below is filled. The research pass was blunt about this:
   * a model asked for a brand straight away supplies a plausible one, and a
   * model made to write down what it can actually see first supplies fewer.
   * It is also the raw material the third catalogue query runs on, which is the
   * query that survives the brand being read wrong.
   */
  front_text: string[];
  /**
   * Digits legible under a barcode, and only that. Never inferred, never
   * completed from memory. Checked against the GS1 check digit before it is
   * believed; see `gtin.ts`.
   */
  barcode_digits: string | null;
  /** Null when the model genuinely cannot tell, which is a real answer. */
  brand: string | null;
  /** The product line as printed, without the brand and without the size. */
  name: string | null;
  /** Flavour, variant, formulation: the word that separates two identical boxes. */
  variant: string | null;
  size_value: number | null;
  size_unit: 'g' | 'kg' | 'ml' | 'l' | 'ea' | null;
  /**
   * How many are in the pack when it is a multipack, null when it is one item.
   * A six pack judged against single-unit prices reads "walk away" every time,
   * which is the same failure decision 19 already caught for sizes.
   */
  count: number | null;
  category: string | null;
  /** Which language the front of the pack was actually read in. */
  language_seen: 'en' | 'fr' | 'both' | null;
  /** Other readings it considered. Decision 17 needs these to exist. */
  alternates: { name: string; why: string }[];
  /** The model's own view. Decision 18 treats this as ONE signal, never the answer. */
  self_confidence: SelfConfidence;
  /** Why it is unsure, in the user's words, for the ambiguous screen. */
  uncertainty: string | null;
}

export interface TagFields {
  /** Everyday shelf price in cents. */
  regular_cents: number | null;
  /** Time-boxed promotion in cents. */
  promotional_cents: number | null;
  /** Loyalty or member price in cents, which is neither of the above. */
  member_cents: number | null;
  /** As printed, e.g. "$1.29 / 100 g". Not recomputed. */
  unit_price_text: string | null;
  /** "limit 4", when the tag caps it. */
  limit: string | null;
  currency: string | null;
}

export interface ModelReading {
  readonly product: IdentifiedFields;
  readonly tag: TagFields | null;
  readonly model: string;
  readonly ms: number;
  /**
   * Set by the identify stage when `barcode_digits` passed its check digit and
   * the catalogue answered on it. It says the code came off the photograph
   * rather than off a scanner, which is the difference between a fact we read
   * and a fact we were handed, and the scan log wants to be able to tell them
   * apart later when the top-1 number is being explained.
   */
  readonly barcodeFromPhoto?: string;
  /**
   * What the calls behind this reading actually cost, in tokens (item 21).
   *
   * Optional, and undefined unless `SHIN_MODEL_USAGE` is on. Undefined means
   * "not captured", which is a different thing from "reported as zero" -- see
   * `TokenUsage` in provider.ts for why that distinction is kept all the way
   * down. When the extract escalates, this is the sum of both calls.
   */
  readonly usage?: TokenUsage;
}

/**
 * One catalogue row as the pick pass sees it.
 *
 * Compact on purpose: the row goes into a prompt alongside a 2,459 token image,
 * and allergens, category paths and retrieval signals are not things a model
 * looking at a photograph can check. Only what is printed on a pack is sent,
 * because only that is checkable against the picture.
 */
export interface PickCandidateRow {
  readonly index: number;
  readonly code: string;
  readonly brand: string | null;
  readonly name: string;
  /**
   * The row's other names, added 2026-09-14 for D-099. Optional because most
   * rows carry neither, and a row whose second name repeats `name` is sent
   * without them: see `pickRows`, which is the only thing that fills these in.
   *
   * They exist because `name` is not reliably where a flavour is written down.
   * The cherry can is "Cherry-flavoured calorie-free cola" in English and
   * "Coca-cola cerise" in French, and a pick pass shown only the first has no
   * way to tell it from the plain can sitting next to it in the list.
   */
  readonly nameFr?: string | null;
  readonly genericName?: string | null;
  readonly size: string | null;
  readonly category: string | null;
}

export interface PickFields {
  chosen_index: number | null;
  confidence: SelfConfidence;
  why: string;
  /** Decision 19: the indexes that are the same product in different sizes. */
  size_question: number[] | null;
}

export interface PickReading {
  readonly pick: PickFields;
  readonly model: string;
  readonly ms: number;
  /** As `ModelReading.usage`: undefined unless `SHIN_MODEL_USAGE` is on. */
  readonly usage?: TokenUsage;
}

/**
 * The schema, written out rather than generated.
 *
 * Every field is required and nullable rather than optional. An optional field
 * lets the model omit what it is unsure about, which reads downstream as "not
 * applicable" instead of "did not know" -- and those two need different screens.
 */
const PRODUCT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // ORDER IS THE POINT (2026-09-09). A structured answer is generated in the
  // order the schema lists it, so putting the transcription first is not
  // presentation: it makes the model write down what it can see before it is
  // asked what it thinks, and every interpreted field below is then conditioned
  // on text it has already committed to rather than on the picture alone.
  required: [
    'front_text', 'barcode_digits',
    'brand', 'name', 'variant', 'size_value', 'size_unit', 'count',
    'category', 'language_seen', 'self_confidence', 'alternates', 'uncertainty',
  ],
  properties: {
    front_text: { type: 'array', maxItems: 12, items: { type: 'string' } },
    barcode_digits: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    name: { type: ['string', 'null'] },
    variant: { type: ['string', 'null'] },
    size_value: { type: ['number', 'null'] },
    size_unit: { type: ['string', 'null'], enum: ['g', 'kg', 'ml', 'l', 'ea', null] },
    count: { type: ['integer', 'null'] },
    category: { type: ['string', 'null'] },
    language_seen: { type: ['string', 'null'], enum: ['en', 'fr', 'both', null] },
    self_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    alternates: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why'],
        properties: { name: { type: 'string' }, why: { type: 'string' } },
      },
    },
    uncertainty: { type: ['string', 'null'] },
  },
} as const;

const TAG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['regular_cents', 'promotional_cents', 'member_cents', 'unit_price_text', 'limit', 'currency'],
  properties: {
    regular_cents: { type: ['integer', 'null'] },
    promotional_cents: { type: ['integer', 'null'] },
    member_cents: { type: ['integer', 'null'] },
    unit_price_text: { type: ['string', 'null'] },
    limit: { type: ['string', 'null'] },
    currency: { type: ['string', 'null'] },
  },
} as const;

const SYSTEM = `You read photographs of retail products and Canadian shelf tags.

Transcribe first, reason second. Fill front_text before anything else: every line
of text legible on the front of the pack, verbatim, in reading order, exactly as
printed and without translating or tidying it. Up to twelve lines. Then, and only
then, fill the interpreted fields, and fill them from the lines you just wrote
down rather than from what the packaging looks like.

barcode_digits is for digits you can actually read printed under a barcode. Read
them left to right and report them as one run of digits. If any digit is not
legible, or there is no barcode in frame, barcode_digits is null. Never infer,
complete, or recall a barcode number: a guessed one is worse than none, because
it will be believed.

Report only what is legible in the image. If the brand is not readable, brand is
null; do not infer it from the packaging style. If you cannot separate two
readings, put both in alternates and say why in uncertainty.

Size is part of what the product IS: a 500 ml and a 1 L of the same thing are
different products. Read the declared net quantity as printed and report its own
unit: g, kg, ml, l, or "ea" for a countable item. Do not convert between them.
If the pack is a multipack, count is how many units are inside and size_value is
the size of one unit; count is null for a single item.

Canadian packaging is bilingual. Read whichever language is clearer and report the
product name in English when both are present. Say in language_seen which you
actually read: en, fr, or both.

self_confidence is one of high, medium or low, and it is about the identification
as a whole, not about any single field.

Shelf tags in Canada often carry several prices at once: an everyday price, a
time-boxed sale price, and a loyalty-card price. These are three different
numbers and must never be merged. Report each only if it is actually printed.`;

/**
 * Pass two, and the reason the cascade above is allowed to be generous.
 *
 * The retrieval half of this path is tuned to recall: three queries, a union,
 * ten rows. That is deliberately more than one answer, and something has to
 * choose. A vision model choosing between ten concrete rows while looking at
 * the packaging is a much easier question than the open one pass one asked, and
 * it is the step the research pass credits for most of the gap between a
 * single-pass 60-70 % and a cascade's 85-92 %.
 *
 * It is allowed to answer null. A pick that cannot refuse is a ranker with
 * extra steps, and the null is what separates "the catalogue does not have
 * this" from "the catalogue has it and here it is".
 */
const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chosen_index', 'confidence', 'why', 'size_question'],
  properties: {
    chosen_index: { type: ['integer', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    why: { type: 'string' },
    size_question: { type: ['array', 'null'], maxItems: 4, items: { type: 'integer' } },
  },
} as const;

const PICK_SYSTEM = `You are shown a photograph of a retail product and a numbered
list of candidate rows from a product catalogue. Choose the row that IS the
product in the photograph.

Choose a row only if the text printed on the packaging matches that row. Matching
packaging style, category, or general appearance is not a match. If no row
matches the printed text, chosen_index is null. Answering null is a correct and
expected answer; a wrong row is worse than no row.

A row carries brand, name, size and category, and some rows also carry nameFr,
the row's French name, and genericName, a short description. Read all of them as
one row: a flavour or edition word is often printed in only one of the names.

When more than one row could be the product, prefer the row whose size matches
the net quantity printed on the pack.

If two or more rows are the same product in different sizes and the size printed
on the pack is not legible, do not choose between them: put their indexes in
size_question and leave chosen_index null. The person holding the phone will be
asked which one it is.

why is one short sentence naming the printed text that decided it.`;

/* ------------------------------------------------- the cacheable arrangement
 *
 * The same two prompts, cut differently, for the prompt-cache lever above.
 * Reached only when `SHIN_MODEL_PROMPT_CACHE` is on; with the lever off the
 * passes send `SYSTEM` and `PICK_SYSTEM` exactly as they always have, and the
 * text below is dead weight rather than a live second prompt.
 *
 * `SHARED_SYSTEM` has to be byte-identical between the passes or the whole point
 * is lost, so it holds only what is genuinely common: what the model is looking
 * at, the rule against inventing anything, and the two facts about Canadian
 * packaging (bilingual faces, and size being part of the identity) that both
 * passes need. Everything that is about ONE pass moved into that pass's
 * instruction, which is sent after the image.
 */
const SHARED_SYSTEM = `You read photographs of retail products and Canadian shelf tags.

Report only what is legible in the image. Never infer, complete, or recall
something that is not printed: a guessed answer is worse than none, because it
will be believed.

Size is part of what the product IS: a 500 ml and a 1 L of the same thing are
different products. Read the declared net quantity as printed and do not convert
between units.

Canadian packaging is bilingual. Read whichever language is clearer and report
the product name in English when both are present.

You will be shown the photograph first, and then the question to answer about it.`;

const EXTRACT_INSTRUCTION = `Identify this product.

Transcribe first, reason second. Fill front_text before anything else: every line
of text legible on the front of the pack, verbatim, in reading order, exactly as
printed and without translating or tidying it. Up to twelve lines. Then, and only
then, fill the interpreted fields, and fill them from the lines you just wrote
down rather than from what the packaging looks like.

barcode_digits is for digits you can actually read printed under a barcode. Read
them left to right and report them as one run of digits. If any digit is not
legible, or there is no barcode in frame, barcode_digits is null.

If the brand is not readable, brand is null; do not infer it from the packaging
style. If you cannot separate two readings, put both in alternates and say why in
uncertainty.

Report the size in its own unit: g, kg, ml, l, or "ea" for a countable item. If
the pack is a multipack, count is how many units are inside and size_value is the
size of one unit; count is null for a single item.

Say in language_seen which language you actually read: en, fr, or both.

self_confidence is one of high, medium or low, and it is about the identification
as a whole, not about any single field.`;

const TAG_INSTRUCTION = `Read every price printed on this shelf tag.

Shelf tags in Canada often carry several prices at once: an everyday price, a
time-boxed sale price, and a loyalty-card price. These are three different
numbers and must never be merged. Report each only if it is actually printed.`;

const PICK_INSTRUCTION = `You are shown a photograph of a retail product and a numbered
list of candidate rows from a product catalogue. Choose the row that IS the
product in the photograph.

Choose a row only if the text printed on the packaging matches that row. Matching
packaging style, category, or general appearance is not a match. If no row
matches the printed text, chosen_index is null. Answering null is a correct and
expected answer; a wrong row is worse than no row.

A row carries brand, name, size and category, and some rows also carry nameFr,
the row's French name, and genericName, a short description. Read all of them as
one row: a flavour or edition word is often printed in only one of the names.

When more than one row could be the product, prefer the row whose size matches
the net quantity printed on the pack.

If two or more rows are the same product in different sizes and the size printed
on the pack is not legible, do not choose between them: put their indexes in
size_question and leave chosen_index null. The person holding the phone will be
asked which one it is.

why is one short sentence naming the printed text that decided it.`;

function schemaFormat(name: string, schema: unknown) {
  return { type: 'json_schema' as const, name, schema: schema as Record<string, unknown> };
}

/**
 * Which system prompt and which user text a pass sends, given the cache lever.
 *
 * One function so the two arrangements cannot drift apart: with the lever off,
 * the pass-specific prompt is the system prompt and the user turn is the short
 * line it has always been; with it on, the system prompt is `SHARED_SYSTEM` for
 * every pass and the specific instruction is prepended to the user turn, which
 * puts it after the image and therefore after the cache breakpoint.
 */
function arrange(
  legacySystem: string,
  legacyUser: string,
  instruction: string,
  payload = '',
): { system: string; user: string; cache: CacheHint } {
  if (!cacheEnabled()) {
    return { system: legacySystem, user: legacyUser + payload, cache: 'none' };
  }
  return { system: SHARED_SYSTEM, user: instruction + payload, cache: 'after_image' };
}

/** True when the environment has actually asked for Gemini. Read in two places, so it is written once. */
function geminiSelected(): boolean {
  return process.env.SHIN_MODEL_PROVIDER?.trim().toLowerCase() === 'gemini';
}

/**
 * Which provider is behind the seam. `anthropic` unless explicitly told
 * otherwise, so an unset environment is today's behaviour exactly.
 *
 * THE GEMINI BRANCH, 2026-09-14. Two conditions, not one: the environment has
 * to name Gemini AND a `GEMINI_API_KEY` has to exist. Named with no key returns
 * the Anthropic provider completely unchanged, byte for byte, because a machine
 * that has the setting and not the secret is a machine mid-rollout and the
 * worst thing to hand it is a provider that refuses every scan. There is no
 * warning logged on that path on purpose: it would fire once per call.
 *
 * WHY THE KEYS ARE NOT SHARED. `apiKey` here is, and always has been, the
 * ANTHROPIC key (`Identifier`'s constructor takes one and passes it straight
 * through). It is not handed to `GeminiProvider`, which reads `GEMINI_API_KEY`
 * for itself. Crossing the two would send one vendor's secret to the other,
 * which is both an authentication failure and a disclosure.
 *
 * NO CLAUDE BEHIND GEMINI, 2026-09-15. Jamin: *"claude should not be taking
 * over"*. With Gemini named and keyed, Gemini alone answers; a Gemini failure
 * surfaces as its own failure instead of a Claude answer. `withFallback` stays
 * in provider.ts, unused here, so putting Claude back is one line.
 */
export function makeProvider(apiKey?: string): Provider {
  const named = process.env.SHIN_MODEL_PROVIDER?.trim().toLowerCase();
  if (named === 'xai') return new XaiProvider({ apiKey });
  if (named === 'gemini') {
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) return new GeminiProvider({ apiKey: geminiKey });
  }
  return new AnthropicProvider(anthropicClient(apiKey));
}

/**
 * A pass, as this file describes one. The clock supplies the signal, so the
 * request is built without one and `withTimeout` completes it.
 */
type PassRequest = Omit<ProviderRequest, 'signal'>;

export class Identifier {
  readonly #provider: Provider;

  /**
   * `client` is still an Anthropic-shaped `MessagesClient`, unchanged, because
   * every existing test and `cap.ts`'s `withSpendCap` wrapper builds one. Given
   * one, it is wrapped in the Anthropic adapter; given none, the provider named
   * by `SHIN_MODEL_PROVIDER` (default `anthropic`) is built. `provider` is the
   * new door: a caller that has its own adapter hands it straight in.
   */
  constructor(apiKey?: string, client?: MessagesClient, provider?: Provider) {
    // A bare constructor also picks up an OAuth profile, so an unset env var
    // does not mean there are no credentials. And a repo-root .env is read
    // first (env.ts), so a founder can drop the key in a file the repo
    // already ignores.
    if (!apiKey && !client && !provider) loadDotEnv();
    this.#provider = provider ?? (client ? new AnthropicProvider(client) : makeProvider(apiKey));
  }

  /**
   * One call, one or two images.
   *
   * The output ceiling is small on purpose: the schema bounds the answer, and a
   * large ceiling only buys the chance of a slow response inside a four second
   * budget. It is `SHIN_MODEL_MAX_TOKENS_EXTRACT` now (item 21), defaulting to
   * the 1,024 it has always been.
   *
   * Throws `ModelCallError` and nothing else. Added 2026-09-08: before this,
   * whatever the SDK threw travelled up unclassified and the caller turned all
   * of it into one sentence about the photo.
   */
  async read(
    productPng: Uint8Array,
    tagPng: Uint8Array | null,
    tier: Tier,
  ): Promise<ModelReading> {
    const started = Date.now();
    let model = MODEL[tier];

    const extract = arrange(SYSTEM, 'Identify this product.', EXTRACT_INSTRUCTION);
    const extractRequest: PassRequest = {
      model,
      images: [{ bytes: productPng, mediaType: mediaTypeOf(productPng) }],
      system: extract.system,
      user: extract.user,
      schema: schemaFormat('product_identity', PRODUCT_SCHEMA),
      maxOutputTokens: envInt('SHIN_MODEL_MAX_TOKENS_EXTRACT', MAX_TOKENS_EXTRACT),
      cache: extract.cache,
    };

    /*
     * THE ONE PASS WHOSE FAILURE IS A REFUSAL gets a clock per vendor, 2026-09-15.
     * With a fallback pair the first vendor has `SHIN_MODEL_TIMEOUT_MS` and the
     * second gets the same again, so a Gemini that hangs still leaves Claude
     * time to answer: 3.5 s + 3.5 s at the defaults, inside the ten seconds
     * Jamin set ("wait 10 seconds, only to get told the app doesn't know").
     * The other passes keep one clock: their failure keeps the answer already
     * read, so a second vendor there would only lengthen the wait.
     */
    const clock = envInt('SHIN_MODEL_TIMEOUT_MS', TIMEOUT_MS);
    const paired = this.#provider.name.includes('+fallback:');
    const product = paired
      ? await this.#send<IdentifiedFields>({ ...extractRequest, vendorTimeoutMs: clock }, clock * 2)
      : await this.#send<IdentifiedFields>(extractRequest);
    let fields = product.value;
    let usage = product.usage;

    /*
     * CHEAP-FIRST ESCALATION (item 21). Off unless SHIN_MODEL_ESCALATE is set.
     *
     * Only from basic, and only on the model's own `low`. `medium` is left
     * alone deliberately: the enum exists because a model asked for a number
     * invents precision it does not have, and escalating on the middle word
     * would spend a second call on most of the scans that were already fine.
     */
    if (escalationEnabled() && tier === 'basic' && fields.self_confidence === 'low') {
      try {
        const escalated = await this.#send<IdentifiedFields>({ ...extractRequest, model: MODEL.pro });
        fields = escalated.value;
        usage = addUsage(usage, escalated.usage);
        model = MODEL.pro;
      } catch {
        // Priority 1 is always answer. The cheap reading is unconfident, not
        // absent, and it is a better outcome than a refusal built out of a
        // failure on a call the user never asked for.
      }
    }

    let tag: TagFields | null = null;
    if (tagPng) {
      const tagPass = arrange(SYSTEM, 'Read every price printed on this shelf tag.', TAG_INSTRUCTION);
      const tagAnswer = await this.#send<TagFields>({
        model,
        images: [{ bytes: tagPng, mediaType: mediaTypeOf(tagPng) }],
        system: tagPass.system,
        user: tagPass.user,
        schema: schemaFormat('shelf_tag', TAG_SCHEMA),
        maxOutputTokens: envInt('SHIN_MODEL_MAX_TOKENS_TAG', MAX_TOKENS_TAG),
        cache: tagPass.cache,
      });
      tag = tagAnswer.value;
      usage = addUsage(usage, tagAnswer.usage);
    }

    return {
      product: fields,
      tag,
      model,
      ms: Date.now() - started,
      ...(usageEnabled() ? { usage } : {}),
    };
  }

  /**
   * Pass two: the same image again, plus the rows the cascade found.
   *
   * Same image and not a second photograph. The person took one picture and the
   * cost of re-sending it is cache-friendly tokens, where the cost of asking
   * for another is the scan.
   *
   * Sonnet 5 on both tiers (`SHIN_MODEL_PICK` overrides). It runs only on the
   * scans pass one did not settle, so it is a fraction of a call per scan on
   * average, and it is the call the accuracy actually comes from. It is charged
   * against the same daily cap as every other call, because the invoice does
   * not care which pass a request belonged to.
   *
   * Throws `ModelCallError` and nothing else, exactly like `read()`.
   */
  async pick(
    productPng: Uint8Array,
    candidates: readonly PickCandidateRow[],
    tier: Tier,
  ): Promise<PickReading> {
    const started = Date.now();
    const model = process.env.SHIN_MODEL_PICK?.trim() || PICK_MODEL;
    // `tier` is accepted and deliberately unused for the model choice: the
    // signature says the pick is a tiered operation so a later tier split needs
    // no caller change, and decision 21 says basic is the same experience with
    // a smaller model, not a worse pick.
    void tier;

    const rows = candidates.map((c) => ({
      index: c.index,
      code: c.code,
      brand: c.brand,
      name: c.name,
      // Copied through only when the caller supplied them, so a row with no
      // second name is sent as the same five keys it always was.
      ...(c.nameFr != null ? { nameFr: c.nameFr } : {}),
      ...(c.genericName != null ? { genericName: c.genericName } : {}),
      size: c.size,
      category: c.category,
    }));

    const payload = `Candidate rows:\n${JSON.stringify(rows)}\n\nWhich row is the product in the photograph?`;
    const pass = arrange(PICK_SYSTEM, '', PICK_INSTRUCTION + '\n\n', payload);

    const answer = await this.#send<PickFields>(
      {
        model,
        images: [{ bytes: productPng, mediaType: mediaTypeOf(productPng) }],
        system: pass.system,
        user: pass.user,
        schema: schemaFormat('catalogue_pick', PICK_SCHEMA),
        maxOutputTokens: envInt('SHIN_MODEL_MAX_TOKENS_PICK', MAX_TOKENS_PICK),
        cache: pass.cache,
      },
      envInt('SHIN_MODEL_PICK_TIMEOUT_MS', PICK_TIMEOUT_MS),
    );

    return {
      pick: answer.value,
      model,
      ms: Date.now() - started,
      ...(usageEnabled() ? { usage: answer.usage } : {}),
    };
  }

  /**
   * The whole call policy in one place: cap, timeout, classify, retry once.
   *
   * In that order on purpose. The cap is checked before the socket is opened,
   * because a cap that refuses after the request went out is a log line rather
   * than a cap.
   *
   * The clock is a parameter with a default rather than a constant, because the
   * two passes are different sizes of question and each reads its own env var.
   */
  async #send<T>(
    request: PassRequest,
    clockMs = envInt('SHIN_MODEL_TIMEOUT_MS', TIMEOUT_MS),
  ): Promise<ProviderResponse<T>> {
    const attempts = Math.max(1, envInt('SHIN_MODEL_ATTEMPTS', MAX_ATTEMPTS));
    const timeoutMs = clockMs;
    let spent = 0;
    let last: ModelCallError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (!reserveCall()) {
        // Out of budget on the first attempt is a refusal of its own class.
        // Out of budget mid-retry is not: the thing that actually went wrong
        // is the transient failure we were retrying, and relabelling it would
        // hide an outage behind a billing message.
        if (last) break;
        throw new ModelCallError(
          'spend_cap_reached',
          `daily model call cap reached (${modelSpend().calls} calls on ${modelSpend().day})`,
          spent,
        );
      }
      spent += 1;

      const attemptStarted = Date.now();
      try {
        return await withTimeout<T>(this.#provider, request, timeoutMs);
      } catch (err) {
        const failure = failureOf(err);
        last = new ModelCallError(failure, err instanceof Error ? err.message : String(err), spent);
        if (!RETRYABLE.has(failure) || attempt === attempts) break;
        // 2026-09-15: a retry only after a FAST failure. A 5xx that took
        // seconds to arrive, retried, stacks a second wait on the first and
        // pushes a scan past the ten seconds Jamin set.
        if (Date.now() - attemptStarted > RETRY_ONLY_WITHIN_MS) break;
        await sleep(Math.min(BACKOFF_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS));
      }
    }

    throw last ?? new ModelCallError('model_outage', 'the model call made no attempt', spent);
  }
}

/**
 * One attempt, with the clock on it.
 *
 * Both halves are used: the abort signal so a client that honours it stops
 * spending a socket, and the race so the caller is freed on time even when it
 * does not. A client that ignores the signal would otherwise hold the screen
 * for as long as it liked while this file claimed to have a timeout.
 */
async function withTimeout<T>(
  provider: Provider,
  request: PassRequest,
  ms: number,
): Promise<ProviderResponse<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ModelCallError('model_timeout', `no answer from the model in ${ms} ms`, 1));
    }, ms);
  });

  try {
    return await Promise.race([
      provider.send<T>({ ...request, signal: controller.signal }),
      expired,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/*
 * The eye sends PNG (decision 12) and the route also admits JPEG by its
 * magic bytes, as do the eval photos from Open Food Facts. The media type
 * on the wire has to say which, or the API rejects the block. Sniffed here
 * rather than passed in, so no caller can lie about it. Added 2026-09-09
 * when lane D noticed the eval set is JPEG and this said PNG for everything.
 */
export function mediaTypeOf(bytes: Uint8Array): 'image/png' | 'image/jpeg' {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return 'image/png';
}

/**
 * The empty usage record, re-exported so a caller that wants to total up several
 * readings has a zero to start from without importing provider.ts.
 */
export { NO_USAGE } from './provider.ts';
