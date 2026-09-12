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

import { openCatalogueReadOnly } from '../../catalogue/src/schema.ts';
import { Catalogue, type Candidate } from '../../catalogue/src/search.ts';
import { defaultEmbedder } from '../../catalogue/src/embed.ts';

const HERE = new URL('.', import.meta.url);
const evalPath = (p: string) => fileURLToPath(new URL(p, HERE));

// ---------------------------------------------------------------- CLI args

interface Args {
  tier: Tier;
  limit: number | null;
  only: string | null;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let tier: Tier = 'pro';
  let limit: number | null = null;
  let only: string | null = null;
  let dryRun = false;
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
    } else {
      throw new Error(`unrecognised argument: ${a}`);
    }
  }
  return { tier, limit, only, dryRun };
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
  const db = openCatalogueReadOnly(evalPath('../../catalogue/data/catalogue.db'));
  const catalogue = new Catalogue(db, defaultEmbedder());
  const lookup = makeLookup(catalogue);

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
    const outcome = await stage.fromCrop(bytes, null, args.tier, 100);
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
    });
  }

  report(args, results, pending);
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

  mkdirSync(evalPath('results'), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outFile = evalPath(`results/${date}${args.dryRun ? '-dry-run' : ''}.json`);
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

run().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
