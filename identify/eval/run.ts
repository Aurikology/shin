/**
 * Eval runner for the photo path's identify stage.
 *
 * Lane D of docs/the-photo-path.md section 4. The contract is section 3's last
 * bullet: `identify/eval/manifest.json`, `identify/eval/photos/*.jpg`, and this
 * file printing top-1, top-3, pass-2 rate, p50/p95 ms and cost.
 *
 * Loads manifest.json, runs each row's photo through IdentifyStage.fromCrop
 * against a CatalogueLookup adapter over the local catalogue (mirrors how
 * app/server.ts wires catalogue/src for /api/identify: schema.ts to open the
 * db, search.ts's Catalogue class to search, embed.ts for the embedder).
 *
 * Coded against identify/src's CURRENT signatures on purpose, not the v2
 * shape docs/the-photo-path.md section 2 describes: lane A is rewriting
 * identify/src while this lane runs, and this file's only defense against
 * that is importing as little of it as possible and reading anything section
 * 3 calls "gains optional" (like `passes`) defensively rather than assuming
 * it exists yet.
 *
 * --dry-run swaps in a fake Identifier that echoes the manifest's own
 * brand/name/size back, as if a vision model had read the label perfectly.
 * That exercises the whole pipeline except the vision call itself -- the
 * catalogue cascade, the confidence fusion, the size-question logic -- with
 * no network call to Anthropic at all. Its top-1 number is a ceiling on what
 * the real model could ever reach through this catalogue, not a measurement
 * of the model.
 *
 * Real mode calls identify/src/model.ts's Identifier once per row and needs
 * credentials this machine does not have (hard rule: no key here). It checks
 * for them once, before row 1, and refuses with one sentence rather than
 * discovering the gap on row 17 -- "must never spend on a partial manifest."
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

import { IdentifyStage, type CatalogueLookup, type CatalogueResult, type IdentifyOutcome } from '../src/identify.ts';
import {
  Identifier,
  type IdentifiedFields,
  type ModelReading,
  type PickCandidateRow,
  type PickReading,
  type Tier,
} from '../src/model.ts';
import { LIST_PRICES_USD_PER_MTOK, addUsage, costUsd, NO_USAGE, type TokenUsage } from '../src/provider.ts';
import { grokModelFor } from '../src/providers/xai.ts';

import { openCatalogueReadOnly } from '../../catalogue/src/schema.ts';
import { Catalogue, type Candidate } from '../../catalogue/src/search.ts';
import { defaultEmbedder } from '../../catalogue/src/embed.ts';

const HERE = new URL('.', import.meta.url);
const evalPath = (p: string) => fileURLToPath(new URL(p, HERE));

// ---------------------------------------------------------------- CLI args

export interface Args {
  tier: Tier;
  limit: number | null;
  only: string | null;
  dryRun: boolean;
  /** --matrix: score every provider/tier cell and rank by cost per CORRECT answer. */
  matrix: boolean;
  providers: string[];
  tiers: Tier[];
  /**
   * --fake-catalogue: score against the manifest itself instead of opening
   * `catalogue/data/catalogue.db`.
   *
   * ADDED 2026-09-13 UNDER PROTEST, and only for the matrix plumbing proof. The
   * checked-in catalogue.db is from 2026-09-09 and `catalogue/src/search.ts` has
   * since grown a `generic_name` column, so every query through the real
   * catalogue dies with `no such column: generic_name` -- before this lane
   * touched anything, on plain `--dry-run --limit 3` at bfd79be. Rebuilding that
   * database is a 7.8 GB reload in a package this lane does not own.
   *
   * A NUMBER OUT OF THIS FLAG IS NOT AN EVAL RESULT. The manifest is both the
   * question and the answer key here, so top-1 is near-trivially perfect and
   * means nothing about retrieval. It exists so the matrix can be shown to walk
   * the cells, price each half at the right model's rate, and divide. Never
   * quote a top-1 from a run carrying this flag.
   */
  fakeCatalogue: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  let tier: Tier = 'pro';
  let limit: number | null = null;
  let only: string | null = null;
  let dryRun = false;
  let matrix = false;
  let providers = ['anthropic'];
  let tiers: Tier[] = ['basic', 'pro'];
  let fakeCatalogue = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--tier') {
      const v = argv[(i += 1)];
      if (v !== 'basic' && v !== 'pro') throw new Error(`--tier must be basic or pro, got ${v}`);
      tier = v;
    } else if (a === '--limit') {
      const v = Number(argv[(i += 1)]);
      if (!Number.isFinite(v) || v <= 0) throw new Error('--limit must be a positive number');
      limit = v;
    } else if (a === '--only') {
      only = argv[(i += 1)];
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--matrix') {
      matrix = true;
    } else if (a === '--fake-catalogue') {
      fakeCatalogue = true;
    } else if (a === '--providers') {
      providers = (argv[(i += 1)] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (providers.length === 0) throw new Error('--providers needs at least one name');
    } else if (a === '--tiers') {
      const parsed = (argv[(i += 1)] ?? '').split(',').map((s) => s.trim());
      for (const t of parsed) if (t !== 'basic' && t !== 'pro') throw new Error(`--tiers takes basic/pro, got ${t}`);
      tiers = parsed as Tier[];
      if (tiers.length === 0) throw new Error('--tiers needs at least one tier');
    } else {
      throw new Error(`unrecognised argument: ${a}`);
    }
  }
  return { tier, limit, only, dryRun, matrix, providers, tiers, fakeCatalogue };
}

// ---------------------------------------------------------------- manifest

interface ManifestRow {
  readonly code: string;
  readonly file: string;
  readonly brand: string | null;
  readonly name: string | null;
  readonly size: string | null;
  // 'produce' and 'tech' added 2026-09-11, item 14b of the beta build plan:
  // 20 slots of each, manifest.json rows already there, photo files not.
  // Loose produce carries no barcode by design (item 20's own point), so a
  // produce row's `code`/`brand`/`category` are legitimately null rather than
  // a placeholder waiting on a lookup.
  readonly kind: 'plain' | 'size-pair' | 'store-brand' | 'multipack' | 'produce' | 'tech';
  readonly category: string | null;
}

function loadManifest(args: Args): ManifestRow[] {
  const all = JSON.parse(readFileSync(evalPath('manifest.json'), 'utf8')) as ManifestRow[];
  let rows = all;
  if (args.only) rows = rows.filter((r) => r.code === args.only);
  if (args.limit) rows = rows.slice(0, args.limit);
  if (rows.length === 0) throw new Error('no manifest rows selected (check --only / --limit)');
  return rows;
}

// ------------------------------------------------ catalogue lookup adapter
//
// Mirrors app/server.ts's attachCatalogue(): open the db read-only through
// catalogue/src/schema.ts, search through catalogue/src/search.ts's
// Catalogue class. Unlike the server this is a one-shot batch script with
// nothing else competing for the thread, so there is no need for
// service.ts's worker; it is a straight, sequential await per row.
//
// vectors: false throughout. The local embedder (catalogue/src/embed.ts)
// would otherwise run its ONNX pipeline on first use, and the lane contract
// allows network for Open Food Facts images only, not a first-run model
// pull. Text + brand + size is what fromCrop's own cascade sends today.

function toCandidate(c: Candidate) {
  return {
    code: c.code,
    name: c.name,
    brands: c.brands,
    quantity: c.quantity,
    sizeValue: c.sizeValue,
    sizeUnit: c.sizeUnit,
    categoryPath: c.categoryPath,
    allergens: c.allergens,
    signals: {
      similarity: c.signals.similarity,
      brandAgrees: c.signals.brandAgrees,
      sizeAgrees: c.signals.sizeAgrees,
    },
  };
}

function makeLookup(catalogue: Catalogue): CatalogueLookup {
  return async (query): Promise<CatalogueResult> => {
    const result = await catalogue.search({
      text: query.text,
      gtin: query.gtin,
      brand: query.brand,
      sizeValue: query.sizeValue,
      sizeUnit: query.sizeUnit,
      limit: query.limit,
      vectors: false,
    });
    return {
      band: result.band,
      matchedBy: result.matchedBy,
      candidates: result.candidates.map(toCandidate),
      ring: result.ring
        ? { label: result.ring.label, members: result.ring.members.map(toCandidate) }
        : null,
    };
  };
}

/**
 * A catalogue made out of the manifest, for `--fake-catalogue` only.
 *
 * Token overlap, nothing cleverer: the point is to return SOME ranked list with
 * SOME similarity so the cascade, the union, the pick pass and the cost model
 * all run. See `Args.fakeCatalogue` for why this exists and why no number out of
 * it may be quoted.
 */
function manifestLookup(all: readonly ManifestRow[]): CatalogueLookup {
  const rows = all.filter((r) => r.code != null);
  const textOf = (r: ManifestRow) => [r.brand, r.name, r.size].filter(Boolean).join(' ').toLowerCase();
  const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9.]+/i).filter(Boolean));

  return async (query) => {
    if (query.gtin) {
      const hit = rows.find((r) => r.code === query.gtin);
      return {
        band: hit ? 'confident' : 'miss',
        matchedBy: hit ? 'gtin' : 'none',
        candidates: hit ? [asCandidate(hit, 1)] : [],
        ring: null,
      };
    }
    const wanted = tokens(query.text ?? '');
    if (wanted.size === 0) return { band: 'miss', matchedBy: 'none', candidates: [], ring: null };

    const scored = rows
      .map((r) => {
        const have = tokens(textOf(r));
        let shared = 0;
        for (const t of wanted) if (have.has(t)) shared += 1;
        return { row: r, score: shared / Math.max(wanted.size, have.size) };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 10);

    return {
      // Never 'confident'. The real band is a calibrated thing the catalogue
      // computes; this fake has no calibration and claiming one would be an
      // invention. The side effect is the useful one: an ambiguous band always
      // sends a multi-candidate row to the pick pass, so the cost model's pick
      // half is exercised rather than sitting at zero.
      band: scored.length > 0 ? 'ambiguous' : 'miss',
      matchedBy: scored.length > 0 ? 'hybrid' : 'none',
      candidates: scored.map((s) => asCandidate(s.row, s.score, query)),
      ring: null,
    };
  };
}

function asCandidate(row: ManifestRow, similarity: number, query?: { brand?: string; sizeValue?: number }) {
  const size = parseSize(row.size);
  return {
    code: row.code as string,
    name: row.name ?? '',
    brands: row.brand,
    quantity: row.size,
    sizeValue: size.value,
    sizeUnit: size.unit,
    categoryPath: row.category ? [row.category] : [],
    allergens: [] as string[],
    signals: {
      similarity,
      brandAgrees: query?.brand ? query.brand.toLowerCase() === (row.brand ?? '').toLowerCase() : null,
      sizeAgrees: query?.sizeValue != null ? query.sizeValue === size.value : null,
    },
  };
}

// ------------------------------------------- best-effort size parsing (dry-run only)
//
// Not shipped anywhere real: the live pipeline gets size from the vision
// model reading the label, never from a manifest string. This only feeds the
// fake Identifier below, so the catalogue side has something to pin size
// against for the size-pair rows, which are the whole point of that bucket.
// Good enough for "750 mL" / "1.5 litre" / "5 x 40 g. Net: 200 g"; not a
// general quantity parser.
//
// `count` is new (2026-09-09, the multipack pin fix): a multipack prints its
// PER-UNIT size ("4 x 100 g"), the catalogue stores the NET ("400 g" for that
// same row), and identify.ts's `fromCrop` now does that multiplication itself
// given `size_value` (the unit) and `count`. So this function surfaces both,
// not a pre-multiplied net: `value`/`unit` stay the net for anything that
// wants it, `unitSize` is the per-item number a real reading would put in
// `size_value`, and `count` is the N a real reading would put in `count`.
// Handles "N x M unit", "N × M unit" and "NxM unit" (French labels use the
// same shape, no separate case needed); an explicit "Net: ..." on the pack
// (Kashi's "5 x 40 g.  Net: 200 g") is authoritative for the net, count and
// unitSize still come from the "N x M" match alongside it.
function parseSize(
  raw: string | null,
): { value: number | null; unit: 'g' | 'ml' | null; count: number | null; unitSize: number | null } {
  if (!raw) return { value: null, unit: null, count: null, unitSize: null };
  const unitAlt =
    '(kilograms|kilogram|kgs|kg|grams|gram|g|millilitres|milliliters|milliliter|ml|litres|litre|liters|liter|l)';

  const convert = (rawUnit: string, value: number): { value: number; unit: 'g' | 'ml' } => {
    const unit = rawUnit.toLowerCase();
    if (unit.startsWith('kg') || unit.startsWith('kilo')) return { value: value * 1000, unit: 'g' };
    if (unit === 'l' || unit.startsWith('lit')) return { value: value * 1000, unit: 'ml' };
    if (unit.startsWith('ml') || unit.startsWith('milli')) return { value, unit: 'ml' };
    return { value, unit: 'g' };
  };

  const countMatch = raw.match(new RegExp(`([\\d.]+)\\s*[x×]\\s*([\\d.]+)\\s*${unitAlt}\\b`, 'i'));
  const netMatch = raw.match(new RegExp(`net:?\\s*([\\d.]+)\\s*${unitAlt}\\b`, 'i'));
  const m = netMatch ?? raw.match(new RegExp(`([\\d.]+)\\s*${unitAlt}\\b`, 'i'));
  if (!m) return { value: null, unit: null, count: null, unitSize: null };

  const converted = convert(m[2], parseFloat(m[1]));
  if (!countMatch) return { value: converted.value, unit: converted.unit, count: null, unitSize: converted.value };

  const count = parseFloat(countMatch[1]);
  const unitSize = convert(countMatch[3], parseFloat(countMatch[2]));
  const net = netMatch ? converted : { value: unitSize.value * count, unit: unitSize.unit };
  return { value: net.value, unit: net.unit, count, unitSize: unitSize.value };
}

// ------------------------------------------------------ fake model, --dry-run
//
// A subclass, not a plain object: IdentifyStage's constructor takes an
// Identifier, and a class with ECMAScript `#private` fields (model.ts's
// `#client`) is nominally typed, so only a real Identifier or a subclass
// satisfies it structurally. Extending it and overriding `read()` and
// `pick()` is the only way to stand in without touching identify/src.
//
// `read()` deliberately never fills `barcode_digits`: a photo-read barcode
// short-circuits straight to a catalogue-by-code lookup and skips the text
// cascade entirely (identify.ts's gtin shortcut), which is exactly the
// catalogue-side logic this eval exists to exercise. `pick()` acts as an
// oracle -- it points at whichever candidate the cascade actually returned
// for the expected code, if any -- so a dry run measures what the catalogue
// cascade and the pick-selection logic can do given a perfect read, which is
// a ceiling on the real model's number, not a stand-in for it.
class FakeIdentifier extends Identifier {
  readonly #row: ManifestRow;

  constructor(row: ManifestRow) {
    // A fake key skips the SDK's credential resolution outright (apiKey set
    // means the lazy chain never runs), so construction never touches the
    // network or the credential chain -- and both overrides below never call
    // the real client, so the client field this builds is never used either.
    super('fake-key-dry-run');
    this.#row = row;
  }

  async read(): Promise<ModelReading> {
    // Filled the way a real reading would: `size_value` is the per-unit
    // number off the label (100 for "4 x 100 g"), `count` is the N, and
    // fromCrop's own `pinnedSize` multiplies them back to the net when it
    // builds the catalogue query -- this dry run exercises that production
    // multiplication rather than doing it here and leaving `count` null.
    const size = parseSize(this.#row.size);
    const product: IdentifiedFields = {
      front_text: [this.#row.brand, this.#row.name, this.#row.size].filter(
        (v): v is string => v != null,
      ),
      barcode_digits: null,
      brand: this.#row.brand,
      name: this.#row.name,
      variant: null,
      size_value: size.unitSize,
      size_unit: size.unit,
      count: size.count,
      category: this.#row.category,
      language_seen: 'en',
      alternates: [],
      self_confidence: 'high',
      uncertainty: null,
    };
    return { product, tag: null, model: 'fake:dry-run', ms: 0 };
  }

  async pick(_productPng: Uint8Array, candidates: readonly PickCandidateRow[]): Promise<PickReading> {
    const match = candidates.find((c) => c.code === this.#row.code);
    return {
      pick:
        match != null
          ? { chosen_index: match.index, confidence: 'high', why: 'dry-run oracle pick', size_question: null }
          : {
              chosen_index: null,
              confidence: 'low',
              why: 'dry-run: expected code not among the cascade candidates',
              size_question: null,
            },
      model: 'fake:dry-run',
      ms: 0,
    };
  }
}

// ------------------------------------------------------ credential preflight
//
// "the runner must refuse cleanly with one sentence when the SDK reports no
// credentials, and must never spend on a partial manifest": checked once,
// before row 1, not discovered on row 17.
//
// Reads the SDK's own resolved auth state rather than re-implementing
// Anthropic's credential chain (env var, OAuth profile, config file) by hand,
// which would drift from what identify/src/model.ts's Identifier actually
// does. That resolution is local-only -- env vars and files on disk -- and
// nothing here ever calls .messages.create(), so no request reaches the
// network either way. `_authState` is underscored rather than `#private`, so
// this reads real state rather than guessing, but it is still an internal of
// @anthropic-ai/sdk@0.124.0 (identify/package.json's pinned major) and could
// be renamed on a future bump; failure of any kind here is treated as "no
// credentials" rather than "assume yes," per the same must-never-spend rule.
async function hasCredentials(): Promise<boolean> {
  try {
    const client = new Anthropic({ maxRetries: 0 }) as unknown as {
      apiKey: string | null;
      authToken: string | null;
      _authState?: {
        resolution?: Promise<void> | null;
        error?: unknown;
        tokenCache?: unknown;
        provider?: unknown;
      };
    };
    if (client.apiKey != null || client.authToken != null) return true;
    const state = client._authState;
    if (!state) return false;
    if (state.resolution) await state.resolution;
    if (state.error) return false;
    return Boolean(state.tokenCache || state.provider);
  } catch {
    return false;
  }
}

// -------------------------------------------------------------------- run

interface RowResult {
  code: string | null;
  kind: ManifestRow['kind'];
  category: string | null;
  expectedBrand: string | null;
  expectedName: string | null;
  outcome: IdentifyOutcome['kind'];
  chosenCode: string | null;
  top1: boolean;
  top3: boolean;
  passes: 1 | 2 | undefined;
  ms: number;
  failure: string | null;
  /**
   * The size the cascade actually pinned against the catalogue, for display
   * only (2026-09-09, the multipack pin fix). Recomputed here from the same
   * reading the outcome already carries, mirroring identify.ts's own
   * (unexported) `pinnedSize`: a multipack's `size_value * count` when count
   * is 2 or more and the unit is g/kg/ml/l, `count` itself when the unit is
   * `ea` and no size was read, otherwise the size as read. A drift between
   * this and identify.ts would only mislabel a table cell -- the real pin
   * lives entirely inside `fromCrop`.
   */
  pin: string;
  /**
   * What the extract call actually cost in tokens, when `SHIN_MODEL_USAGE` was
   * on and a real provider answered. Null in every dry run and in every run with
   * the lever off, and null is treated as "not measured" by the cost model
   * below, never as zero.
   *
   * ONE GAP, NAMED: this is the EXTRACT pass only. `IdentifyOutcome` carries the
   * `ModelReading` but not the `PickReading`, so a pick call's real usage does
   * not reach here and is priced from the assumption table instead, even on a
   * measured run. Closing that means adding the pick's usage to the outcome in
   * `identify.ts`, which is a change to a type `app/server.ts` consumes and was
   * left for whoever owns that decision.
   */
  usage: TokenUsage | null;
}

// `passes` only exists on the 'identified' arm (lane A landed it while this
// lane was running). Read narrowly rather than casting now that it is real.
function passesOf(outcome: IdentifyOutcome): 1 | 2 | undefined {
  return outcome.kind === 'identified' ? outcome.passes : undefined;
}

function pinLabel(outcome: IdentifyOutcome): string {
  const p = outcome.reading?.product;
  if (!p) return '';
  if (p.size_unit === 'ea') {
    const v = p.size_value ?? p.count;
    return v !== null ? `${v} ea` : '';
  }
  if (
    p.count !== null &&
    p.count >= 2 &&
    p.size_value !== null &&
    (p.size_unit === 'g' || p.size_unit === 'kg' || p.size_unit === 'ml' || p.size_unit === 'l')
  ) {
    return `${p.size_value * p.count}${p.size_unit}`;
  }
  return p.size_value !== null ? `${p.size_value}${p.size_unit ?? ''}` : '';
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // The credential refusal is deliberate and it survives --matrix: a matrix run
  // is N full passes over the manifest, so it is the LAST mode that should be
  // allowed to discover a missing key halfway through. --dry-run is the only
  // way past it, exactly as before.
  if (!args.dryRun) {
    const ok = await hasCredentials();
    if (!ok) {
      console.error(
        'No Anthropic credentials found on this machine, so the eval cannot call the real API; run with --dry-run instead.',
      );
      process.exit(1);
    }
  }

  const rows = loadManifest(args);
  let lookup: CatalogueLookup;
  if (args.fakeCatalogue) {
    console.log(
      'FAKE CATALOGUE: scoring against manifest.json itself. Accuracy numbers from this run are meaningless; only the plumbing is being exercised.',
    );
    lookup = manifestLookup(loadManifest({ ...args, limit: null, only: null }));
  } else {
    const db = openCatalogueReadOnly(evalPath('../../catalogue/data/catalogue.db'));
    const catalogue = new Catalogue(db, defaultEmbedder());
    lookup = makeLookup(catalogue);
  }

  if (args.matrix) {
    await runMatrix(args, rows, lookup);
    return;
  }

  const { results, pending } = await pass(args, rows, lookup, args.tier);
  report(args, results, pending);
}

/**
 * One full sweep of the manifest at one tier. Factored out of `run()` on
 * 2026-09-13 so `--matrix` can call it once per cell without duplicating the
 * scoring rules; the body below is the loop that was already there.
 */
async function pass(
  args: Args,
  rows: readonly ManifestRow[],
  lookup: CatalogueLookup,
  tier: Tier,
): Promise<{ results: RowResult[]; pending: number }> {
  // One real Identifier and one IdentifyStage shared across every row, same
  // as production would use one per process. The fake model needs to know
  // which row it is answering for, so dry-run builds a fresh one per row
  // instead (cheap; it makes no I/O of its own).
  const sharedModel = args.dryRun ? null : new Identifier();
  const sharedStage = sharedModel ? new IdentifyStage(lookup, sharedModel) : null;

  const results: RowResult[] = [];
  let pending = 0;

  for (const row of rows) {
    // Item 14b's produce and tech slots: manifest.json already carries the
    // row, the photo does not exist yet. Skipped, not a crash, and not
    // counted toward top-1/top-3/pass-2 for the rows that DO have a photo --
    // "adding the photos is the only remaining step" only holds if a bare
    // manifest entry can sit here without breaking the run for everyone else.
    if (!existsSync(evalPath(row.file))) {
      pending += 1;
      console.log(`PENDING  ${row.code ?? '(no code)'}  ${row.kind}  no photo yet at ${row.file}`);
      continue;
    }
    // A photo landed with no recorded answer at all -- name, brand and code
    // all null -- is a row someone dropped a file into without filling in
    // what it is a photo of. Scoring it would silently read as a miss
    // (correctly) or, worse, as a spurious top-1 if a future change ever lets
    // a null code compare equal to a null chosenCode. Flagged rather than run.
    if (row.name === null && row.brand === null && row.code === null) {
      console.log(`SKIP     ${row.file}  has a photo but no recorded answer (name/brand/code all null)`);
      continue;
    }

    const bytes = readFileSync(evalPath(row.file));
    const stage = sharedStage ?? new IdentifyStage(lookup, new FakeIdentifier(row));
    const started = Date.now();
    const outcome = await stage.fromCrop(bytes, null, tier, 100);
    const ms = Date.now() - started;

    const chosenCode = outcome.kind === 'identified' ? outcome.chosen.code : null;
    // Guarded on `row.code != null`: a produce row has no barcode by design,
    // and without this guard a null-code row would score top-1 the moment
    // the outcome also carries no chosen code (e.g. 'unreadable'), which is
    // an accident of both sides being null, not a match.
    const top1 = row.code != null && chosenCode === row.code;
    const top3 =
      row.code != null &&
      outcome.kind === 'identified' &&
      [outcome.chosen, ...outcome.alternates].slice(0, 3).some((c) => c.code === row.code);

    results.push({
      code: row.code,
      kind: row.kind,
      category: row.category,
      expectedBrand: row.brand,
      expectedName: row.name,
      outcome: outcome.kind,
      chosenCode,
      top1,
      top3,
      passes: passesOf(outcome),
      ms,
      failure: outcome.kind === 'unreadable' ? outcome.failure : null,
      pin: pinLabel(outcome),
      usage: outcome.reading?.usage ?? null,
    });
  }

  return { results, pending };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function percentile(sortedMs: readonly number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[idx];
}

function report(args: Args, results: RowResult[], pending = 0): void {
  console.log(
    pad('code', 15) +
      pad('kind', 12) +
      pad('outcome', 15) +
      pad('top1', 6) +
      pad('top3', 6) +
      pad('ms', 7) +
      pad('pin', 10),
  );
  for (const r of results) {
    console.log(
      pad(r.code ?? '(no code)', 15) +
        pad(r.kind, 12) +
        pad(r.outcome, 15) +
        pad(r.top1 ? 'yes' : 'no', 6) +
        pad(r.top3 ? 'yes' : 'no', 6) +
        pad(String(r.ms), 7) +
        pad(r.pin, 10),
    );
  }

  const n = results.length;
  const top1n = results.filter((r) => r.top1).length;
  const top3n = results.filter((r) => r.top3).length;
  const unreadable = results.filter((r) => r.outcome === 'unreadable').length;
  const withPasses = results.filter((r) => r.passes !== undefined);
  const pass2n = withPasses.filter((r) => r.passes === 2).length;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);

  // model.ts's own header comment (decision 21): a pro (Sonnet) identification
  // at the crop size this app sends, one product image, no tag, is priced at
  // $0.0068. No published per-call figure exists there for basic (Haiku)
  // extract. The pick pass (model.ts's `pick()`) runs on Sonnet 5 regardless
  // of tier and sends the same product image again, so it is priced against
  // the same $0.0068 figure -- there is no separate published number for it
  // either, and this is the closest documented stand-in.
  // ModelReading/PickReading expose no `usage` field, so all of this is that
  // static per-call estimate times call counts, not a real usage-derived
  // number.
  const SONNET_COST_PER_CALL = 0.0068;
  const pickCalls = withPasses.filter((r) => r.passes === 2).length;
  const pickCost = pickCalls * SONNET_COST_PER_CALL;
  const costNote = args.dryRun
    ? '$0 (dry-run: no model calls made)'
    : args.tier === 'pro'
      ? `~$${(n * SONNET_COST_PER_CALL + pickCost).toFixed(4)} (${n} extract calls + ${pickCalls} pick calls, both at model.ts's $0.0068/call estimate)`
      : `extract cost unknown (no published basic/haiku figure in model.ts); ${pickCalls} pick calls (always Sonnet 5) ~$${pickCost.toFixed(4)}`;

  console.log('');
  console.log(`rows: ${n}  tier: ${args.tier}  dry-run: ${args.dryRun}`);
  console.log(`top-1: ${top1n}/${n} (${((top1n / n) * 100).toFixed(1)}%)`);
  console.log(`top-3: ${top3n}/${n} (${((top3n / n) * 100).toFixed(1)}%)`);
  console.log(`unreadable: ${unreadable}/${n}`);
  console.log(
    withPasses.length
      ? `pass-2 rate: ${pass2n}/${withPasses.length} (${((pass2n / withPasses.length) * 100).toFixed(1)}%)`
      : "pass-2 rate: n/a (this outcome carries no 'passes' field yet)",
  );
  console.log(`p50 ms: ${percentile(times, 50)}  p95 ms: ${percentile(times, 95)}`);
  console.log(`estimated cost: ${costNote}`);
  if (pending > 0) {
    console.log(`pending (manifest slot, no photo yet): ${pending}`);
  }

  // A --fake-catalogue run writes NO results file. Its accuracy numbers are the
  // manifest graded against itself, so the only thing a saved artifact could do
  // is get quoted later as though it meant something. This repo has already had
  // a dry run's 40 of 40 read as a model score once; a second unquotable number
  // does not get a file to be found in. The banner on stdout is the whole output.
  if (args.fakeCatalogue) {
    console.log('');
    console.log('--fake-catalogue: no results file written, because this run graded the manifest against itself.');
    return;
  }

  mkdirSync(evalPath('results'), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outFile = evalPath(`results/${date}${args.dryRun ? "-dry-run" : ""}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        date,
        tier: args.tier,
        dryRun: args.dryRun,
        summary: {
          rows: n,
          top1: top1n,
          top3: top3n,
          unreadable,
          pass2OfKnown: withPasses.length ? pass2n : null,
          pass2Denominator: withPasses.length,
          p50Ms: percentile(times, 50),
          p95Ms: percentile(times, 95),
          pending,
        },
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${outFile}`);
}

/* ==========================================================================
 * THE COMPARATOR: cost per CORRECT identification, over a provider/tier matrix.
 *
 * Added 2026-09-13, beta plan item 21's last bullet.
 *
 * WHY NOT COST PER CALL. Cost per call ranks the cheapest model first, always,
 * and that ranking is wrong whenever the cheap model is wrong more often: eighty
 * calls at a third of the price that land sixty right answers cost MORE per
 * right answer than forty calls at full price that land thirty-eight. The only
 * number that can decide a tier is the one with the denominator in it.
 *
 * WHAT A DRY-RUN MATRIX DOES AND DOES NOT SHOW. In --dry-run every cell runs the
 * same `FakeIdentifier`, which reads the manifest's own answer back perfectly.
 * So every cell scores IDENTICALLY by construction, and the accuracy columns are
 * not a comparison of anything -- they are the catalogue cascade's ceiling,
 * printed once per cell. What the dry run proves is the plumbing: that the
 * matrix walks the cells, scores each one, prices each one with the right
 * model's rate, and divides. The comparison only becomes real with a key.
 * ========================================================================== */

/*
 * TOKEN ASSUMPTIONS. Only the first line is a measurement.
 *
 * `image` is the repo's own figure for a 1568 px long-edge crop
 * (docs/the-photo-path.md section 6). Everything under it is a GUESS typed in on
 * 2026-09-13 by reading the prompts and estimating; no call has ever been made
 * from this machine, so no prompt or completion has ever been counted. Every
 * dollar figure below that is derived from a cell WITHOUT measured usage
 * inherits these guesses and is labelled `assumed` in the output for exactly
 * that reason.
 */
const ASSUMED_TOKENS = {
  /** Measured in-repo: 1568 px long edge. */
  image: 2_459,
  /** PLACEHOLDER: system prompt plus the pass instruction. */
  prompt: 450,
  /** PLACEHOLDER: a filled PRODUCT_SCHEMA with twelve front_text lines. */
  extractOutput: 350,
  /** PLACEHOLDER: ten compact catalogue rows as JSON. */
  pickRows: 700,
  /** PLACEHOLDER: an index, a word and one sentence. */
  pickOutput: 60,
} as const;

interface Cell {
  provider: string;
  tier: Tier;
  extractModel: string;
  pickModel: string;
  results: RowResult[];
  pending: number;
}

/** Which models a cell actually runs, so each half is priced at its own rate. */
function modelsFor(provider: string, tier: Tier): { extract: string; pick: string } {
  const extract = tier === 'basic' ? 'claude-haiku-4-5' : 'claude-sonnet-5';
  // The pick runs on Sonnet 5 on both tiers (model.ts's PICK_MODEL), unless
  // SHIN_MODEL_PICK says otherwise, which is the same override the real call
  // reads.
  const pick = process.env.SHIN_MODEL_PICK?.trim() || 'claude-sonnet-5';
  if (provider === 'xai') return { extract: grokModelFor(extract), pick: grokModelFor(pick) };
  return { extract, pick };
}

function assumedUsage(kind: 'extract' | 'pick'): TokenUsage {
  return kind === 'extract'
    ? {
        inputTokens: ASSUMED_TOKENS.image + ASSUMED_TOKENS.prompt,
        outputTokens: ASSUMED_TOKENS.extractOutput,
        cacheReadTokens: null,
        cacheCreationTokens: null,
      }
    : {
        inputTokens: ASSUMED_TOKENS.image + ASSUMED_TOKENS.prompt + ASSUMED_TOKENS.pickRows,
        outputTokens: ASSUMED_TOKENS.pickOutput,
        cacheReadTokens: null,
        cacheCreationTokens: null,
      };
}

interface CellCost {
  /** Null when a model in this cell has no row in the price table. */
  usd: number | null;
  /** 'measured' only when every extract call reported real token counts. */
  basis: 'measured' | 'assumed' | 'partly measured';
}

function costOfCell(cell: Cell): CellCost {
  const scored = cell.results.length;
  const pickCalls = cell.results.filter((r) => r.passes === 2).length;
  const measured = cell.results.filter((r) => r.usage !== null && r.usage.inputTokens !== null);

  const extractUsage = measured.length
    ? // Real counts for the rows that reported them, the assumption for the rest.
      [
        ...measured.map((r) => r.usage as TokenUsage),
        ...Array.from({ length: scored - measured.length }, () => assumedUsage('extract')),
      ].reduce(addUsage, NO_USAGE)
    : Array.from({ length: scored }, () => assumedUsage('extract')).reduce(addUsage, NO_USAGE);

  const pickUsage = Array.from({ length: pickCalls }, () => assumedUsage('pick')).reduce(
    addUsage,
    NO_USAGE,
  );

  const extractCost = costUsd(cell.extractModel, extractUsage);
  const pickCost = pickCalls === 0 ? 0 : costUsd(cell.pickModel, pickUsage);
  const usd = extractCost === null || pickCost === null ? null : extractCost + pickCost;

  const basis: CellCost['basis'] =
    measured.length === 0 ? 'assumed' : measured.length === scored ? 'measured' : 'partly measured';
  // The pick half is never measured today (see RowResult.usage), so a cell that
  // ran any pick call cannot honestly claim to be fully measured.
  return { usd, basis: basis === 'measured' && pickCalls > 0 ? 'partly measured' : basis };
}

async function runMatrix(args: Args, rows: readonly ManifestRow[], lookup: CatalogueLookup): Promise<void> {
  const before = process.env.SHIN_MODEL_PROVIDER;
  const cells: Cell[] = [];

  try {
    for (const provider of args.providers) {
      for (const tier of args.tiers) {
        // Real mode selects the provider the same way production does: through
        // the env var model.ts reads at construction. In --dry-run the fake
        // identifier never reaches a provider at all, so this only labels the
        // row.
        process.env.SHIN_MODEL_PROVIDER = provider;
        const models = modelsFor(provider, tier);
        console.log(`\n--- ${provider} / ${tier}  (extract ${models.extract}, pick ${models.pick}) ---`);
        const { results, pending } = await pass(args, rows, lookup, tier);
        cells.push({ provider, tier, extractModel: models.extract, pickModel: models.pick, results, pending });
      }
    }
  } finally {
    if (before === undefined) delete process.env.SHIN_MODEL_PROVIDER;
    else process.env.SHIN_MODEL_PROVIDER = before;
  }

  reportMatrix(args, cells);
}

function reportMatrix(args: Args, cells: Cell[]): void {
  console.log('');
  console.log('cost per CORRECT identification');
  console.log(
    pad('provider', 11) +
      pad('tier', 7) +
      pad('extract model', 18) +
      pad('rows', 6) +
      pad('top1', 7) +
      pad('pick', 6) +
      pad('total $', 11) +
      pad('$/correct', 12) +
      pad('basis', 16),
  );

  const scored: { cell: Cell; perCorrect: number | null; cost: CellCost }[] = [];
  for (const cell of cells) {
    const cost = costOfCell(cell);
    const correct = cell.results.filter((r) => r.top1).length;
    const perCorrect = cost.usd === null || correct === 0 ? null : cost.usd / correct;
    scored.push({ cell, perCorrect, cost });
    console.log(
      pad(cell.provider, 11) +
        pad(cell.tier, 7) +
        pad(cell.extractModel, 18) +
        pad(String(cell.results.length), 6) +
        pad(`${correct}`, 7) +
        pad(String(cell.results.filter((r) => r.passes === 2).length), 6) +
        pad(cost.usd === null ? 'unknown' : `$${cost.usd.toFixed(4)}`, 11) +
        pad(perCorrect === null ? 'unknown' : `$${perCorrect.toFixed(5)}`, 12) +
        pad(cost.basis, 16),
    );
  }

  const ranked = scored.filter((s) => s.perCorrect !== null).sort((a, b) => a.perCorrect! - b.perCorrect!);
  console.log('');
  if (ranked.length === 0) {
    console.log('no cell could be priced: every model in the matrix is missing from the list-price table.');
  } else {
    console.log(
      `cheapest per correct answer: ${ranked[0].cell.provider}/${ranked[0].cell.tier} at $${ranked[0].perCorrect!.toFixed(5)}`,
    );
  }
  console.log(
    'prices are LIST prices typed in from a public page on 2026-09-13 and never checked against an invoice.',
  );
  console.log(
    `token counts marked 'assumed' come from a placeholder table (image ${ASSUMED_TOKENS.image} measured; prompt/output counts are guesses).`,
  );
  console.log('the pick pass is always priced from assumptions: its usage does not reach this runner yet.');
  if (args.dryRun) {
    console.log(
      'DRY RUN: every cell ran the same perfect fake reading, so the accuracy columns are identical by construction and compare nothing. This run proves the plumbing, not the models.',
    );
  }

  mkdirSync(evalPath('results'), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outFile = evalPath(`results/${date}-matrix${args.dryRun ? '-dry-run' : ''}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        date,
        dryRun: args.dryRun,
        assumedTokens: ASSUMED_TOKENS,
        listPrices: LIST_PRICES_USD_PER_MTOK,
        cells: scored.map(({ cell, perCorrect, cost }) => ({
          provider: cell.provider,
          tier: cell.tier,
          extractModel: cell.extractModel,
          pickModel: cell.pickModel,
          rows: cell.results.length,
          top1: cell.results.filter((r) => r.top1).length,
          top3: cell.results.filter((r) => r.top3).length,
          pickCalls: cell.results.filter((r) => r.passes === 2).length,
          totalUsd: cost.usd,
          usdPerCorrect: perCorrect,
          basis: cost.basis,
          pending: cell.pending,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${outFile}`);
}

/**
 * Runs only when this file IS the program, not when a test imports it.
 *
 * D-090: before this guard, `run()` fired at module load, so nothing could
 * import this file to check it, so nothing did -- and `eval/` sat outside
 * `tsconfig.json` as well. A broken string literal here passed both
 * `npm run typecheck` and all 96 tests and was caught only by executing the
 * file by hand. This is the single most decision-bearing script in the package
 * (QUEUE.md P2 names its number as what chooses the model tiers) and it was the
 * one thing nothing guarded. `eval/**` is in the include array now, and
 * `test/eval-run.test.ts` imports this module, which is what makes a parse
 * error fail a test run rather than wait for somebody to run the eval.
 */
const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  run().catch((err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
}
