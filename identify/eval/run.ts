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

import {
  IdentifyStage,
  union,
  type CatalogueLookup,
  type CatalogueResult,
  type IdentifyOutcome,
} from '../src/identify.ts';
import {
  ATTRIBUTIONS,
  attribute,
  namedACatalogueRow,
  pct,
  summarise,
  summariseByKind,
  type Expectation,
  type StageMetrics,
  type StageObservation,
} from './metrics.ts';
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

export interface ManifestRow {
  /**
   * Null on a refuse row. Declared `string` until 2026-09-14, which was simply
   * untrue -- the twenty produce rows have carried `code: null` since they were
   * added, and every read site in this file already guarded with `== null`. The
   * type was the last place still asserting the manifest was all barcodes.
   */
  readonly code: string | null;
  readonly file: string;
  readonly brand: string | null;
  readonly name: string | null;
  readonly size: string | null;
  // 'produce' and 'tech' added 2026-09-11, item 14b of the beta build plan:
  // 20 slots of each, manifest.json rows already there, photo files not. The
  // tech twenty were re-selected and photographed on 2026-09-14; the produce
  // twenty are a refusal test and stay without photos on purpose.
  // Loose produce carries no barcode by design (item 20's own point), so a
  // produce row's `code`/`brand`/`category` are legitimately null rather than
  // a placeholder waiting on a lookup.
  readonly kind: 'plain' | 'size-pair' | 'store-brand' | 'multipack' | 'produce' | 'tech';
  /**
   * THE NEGATIVE-SET CONTRACT (2026-09-14). What a correct answer to this row
   * looks like: `'identify'` means name this code, `'refuse'` means name NOTHING.
   *
   * The twenty `kind: 'produce'` rows carry `'refuse'`. D-096 records why: they
   * have `code: null` by design, loose produce has no barcode and no catalogue
   * row, and they are already the closest thing this eval has to a negative set.
   * Photographing them as a retrieval test would ask a question with no right
   * answer; scoring them as a refusal test asks the one question the eval could
   * not previously ask at all.
   *
   * The twenty `kind: 'tech'` rows stay `'identify'` and, since 2026-09-14, they
   * carry photos. They used to be placeholders: twenty codes absent from the
   * catalogue and from both Open Facts APIs, so that every one of them would
   * have scored `cascade_miss` by construction the day a photo landed (D-096).
   * They were re-selected from the catalogue's own Open Products Facts rows, by
   * the same buckets and the same recorded reasoning as the first forty, and
   * `README-selection.md` carries the bucket list, the licence and the source
   * URL of every photograph. `checkAnswerKey` below is what caught the
   * placeholders and it still runs on any row that has no photo yet.
   */
  readonly expect: Expectation;
  readonly category: string | null;
}

function loadManifest(args: Args): ManifestRow[] {
  const raw = JSON.parse(readFileSync(evalPath('manifest.json'), 'utf8')) as ManifestRow[];
  /*
   * `expect` is required in the file and every row carries it. This normalises
   * anyway rather than trusting the cast above, because the failure of a missing
   * `expect` is silent and asymmetric: undefined !== 'refuse', so a refuse row
   * that lost its field would be scored as an identify row against a null code,
   * which `attribute()` now throws on. Defaulting from the presence of a code is
   * the same rule the file itself follows.
   */
  const all: ManifestRow[] = raw.map((r) => {
    const expect: Expectation =
      r.expect === 'identify' || r.expect === 'refuse' ? r.expect : r.code == null ? 'refuse' : 'identify';
    if (expect === 'identify' && r.code == null) {
      throw new Error(`manifest row ${r.file} expects an identification but carries no code`);
    }
    return { ...r, expect };
  });
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

/* ==========================================================================
 * THE PROBE: watching the stages from outside identify/src.
 *
 * Added 2026-09-13. The problem it solves: `IdentifyOutcome` tells you what
 * shipped and nothing about how. It does not carry the candidate set the cascade
 * produced, whether the pick pass fired, what the pick itself chose, or whether
 * a barcode short-circuited the whole text path. Without those four facts a
 * wrong answer is one undifferentiated thing, and "the row was never retrieved"
 * and "the row was retrieved and the second model call picked another" get the
 * same row in the report despite needing opposite work.
 *
 * It reads them from the two seams the eval already owns rather than by changing
 * a type `app/server.ts` consumes: the `CatalogueLookup` it hands the stage, and
 * the `Identifier` it hands the stage. Every query and every pick goes through
 * this file on its way in and out, so nothing has to be inferred.
 *
 * Rows run strictly sequentially (`pass()` awaits each one), so a single mutable
 * "current row" probe is safe; it is deliberately not a map keyed by row,
 * because that would quietly keep working if the loop ever went concurrent and
 * start attributing one row's queries to another.
 * ========================================================================== */

interface Probe {
  /** Lookups carrying a `gtin`, i.e. the barcode short-circuit's own query. */
  gtinQueries: number;
  /** ...of which resolved to at least one row, which is what short-circuits. */
  gtinHits: number;
  /** The three text queries' results, in the order they came back. */
  cascade: CatalogueResult[];
  pickFired: boolean;
  pickErrored: boolean;
  pickRows: readonly PickCandidateRow[] | null;
  pickedIndex: number | null;
}

function newProbe(): Probe {
  return {
    gtinQueries: 0,
    gtinHits: 0,
    cascade: [],
    pickFired: false,
    pickErrored: false,
    pickRows: null,
    pickedIndex: null,
  };
}

function probingLookup(inner: CatalogueLookup, current: () => Probe | null): CatalogueLookup {
  return async (query) => {
    const result = await inner(query);
    const p = current();
    if (p) {
      if (query.gtin != null) {
        p.gtinQueries += 1;
        if (result.candidates.length > 0) p.gtinHits += 1;
      } else {
        p.cascade.push(result);
      }
    }
    return result;
  };
}

/**
 * What the probe saw, turned into the row the metrics read.
 *
 * The candidate set is `union()` imported from identify.ts and applied to the
 * very results this probe watched, not a re-implementation: recall has to be
 * about the list production actually built.
 */
function observationOf(
  row: ManifestRow,
  outcome: IdentifyOutcome,
  probe: Probe,
): StageObservation | null {
  /*
   * UNTIL 2026-09-14 THIS LINE READ `if (row.code == null) return null;` and the
   * comment said a row with no expected code has no right answer to be found or
   * missed. The first half was true and the conclusion was wrong. A loose-produce
   * row has no right CODE, and it has a very definite right ANSWER: don't name
   * one. Dropping the row here is what made the false-positive rate unmeasurable
   * -- not because the data was missing, but because the runner threw it away.
   *
   * What is still true is that an `identify` row with no code cannot be scored
   * at all, and that one really does get dropped.
   */
  if (row.expect === 'identify' && row.code == null) return null;
  const shortCircuit = probe.gtinHits > 0 && probe.cascade.length === 0;
  const cascadeCodes = probe.cascade.length
    ? union(probe.cascade).candidates.map((c) => c.code)
    : [];
  const pickedCode =
    probe.pickedIndex !== null && probe.pickRows
      ? (probe.pickRows.find((r) => r.index === probe.pickedIndex)?.code ?? null)
      : null;
  return {
    code: row.code,
    expect: row.expect,
    kind: row.kind,
    outcome: outcome.kind,
    chosenCode: outcome.kind === 'identified' ? outcome.chosen.code : null,
    // Read off the outcome, not re-derived: the band that reaches the screen is
    // the one the negative set has to judge, including the pick's cap.
    confidenceBand: outcome.kind === 'identified' ? outcome.confidence.band : null,
    barcodeShortCircuit: shortCircuit,
    cascadeRan: probe.cascade.length > 0,
    cascadeCodes,
    pickFired: probe.pickFired,
    pickErrored: probe.pickErrored,
    pickedCode,
  };
}

/**
 * The real Identifier, with the pick call observed on the way past.
 *
 * A subclass for the same reason `FakeIdentifier` is one: `IdentifyStage`'s
 * constructor takes an `Identifier` and that class has `#private` fields, so
 * only a subclass satisfies it. `read()` is untouched; `pick()` calls straight
 * through to the real one and records what went in and what came back.
 */
class RecordingIdentifier extends Identifier {
  readonly #probe: () => Probe | null;

  constructor(probe: () => Probe | null) {
    super();
    this.#probe = probe;
  }

  override async pick(
    productPng: Uint8Array,
    candidates: readonly PickCandidateRow[],
    tier: Tier,
  ): Promise<PickReading> {
    const p = this.#probe();
    if (p) {
      p.pickFired = true;
      p.pickRows = candidates;
    }
    try {
      const reading = await super.pick(productPng, candidates, tier);
      if (p) p.pickedIndex = reading.pick.chosen_index;
      return reading;
    } catch (err) {
      if (p) p.pickErrored = true;
      throw err;
    }
  }
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
export class FakeIdentifier extends Identifier {
  readonly #row: ManifestRow;
  readonly #probe: () => Probe | null;

  constructor(row: ManifestRow, probe: () => Probe | null = () => null) {
    // A fake key skips the SDK's credential resolution outright (apiKey set
    // means the lazy chain never runs), so construction never touches the
    // network or the credential chain -- and both overrides below never call
    // the real client, so the client field this builds is never used either.
    super('fake-key-dry-run');
    this.#row = row;
    this.#probe = probe;
  }

  async read(): Promise<ModelReading> {
    /*
     * NOTHING TO READ IS A READING (2026-09-14).
     *
     * A refuse row whose brand, name and code are ALL null is a photograph of a
     * thing the manifest cannot describe. The echo below would turn that into a
     * `front_text` of `[]` and a product of nulls anyway, but writing it out is
     * the point: the fake must never invent a brand or a name for a row that
     * carries none, because the negative set's whole question is what happens
     * when there is nothing to go on. `fromCrop` sees an empty `readAs` and
     * returns `unreadable`, which is the honest outcome for an unlabelled thing.
     */
    if (this.#row.expect === 'refuse' && !this.#row.brand && !this.#row.name && !this.#row.code) {
      return {
        product: {
          front_text: [],
          barcode_digits: null,
          brand: null,
          name: null,
          variant: null,
          size_value: null,
          size_unit: null,
          count: null,
          category: null,
          language_seen: null,
          alternates: [],
          self_confidence: 'low',
          uncertainty: 'dry-run: manifest row carries no brand, name or code to echo',
        },
        tag: null,
        model: 'fake:dry-run',
        ms: 0,
      };
    }
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

  override async pick(
    _productPng: Uint8Array,
    candidates: readonly PickCandidateRow[],
  ): Promise<PickReading> {
    /*
     * A DRY RUN MUST NOT BE ABLE TO MANUFACTURE A PASSING NEGATIVE SET.
     *
     * The oracle below works by looking for `this.#row.code` among the
     * candidates. On a refuse row that code is null, nothing matches, and the
     * oracle would abstain -- handing back `chosen_index: null`, low confidence,
     * which `namedACatalogueRow` reads as a correct refusal. Every produce row
     * would then score as a refusal, the false-positive rate would print 0%, and
     * the number would be a property of this class rather than of the product.
     *
     * There is no honest oracle for a refuse row: the oracle's entire basis is
     * knowing the right answer, and here the right answer is "no row", which is
     * not a thing that can be pointed at in a candidate list. So it does not
     * abstain. It takes the cascade's top candidate at medium confidence -- the
     * PESSIMISTIC substitute -- which scores as a false positive whenever the
     * cascade returned anything at all. That number is not a measurement either,
     * and the report says so in as many words; what it cannot do is flatter.
     */
    if (this.#row.expect === 'refuse') {
      const top = candidates[0];
      const p2 = this.#probe();
      if (p2) {
        p2.pickFired = true;
        p2.pickRows = candidates;
        p2.pickedIndex = top?.index ?? null;
      }
      return {
        pick: {
          chosen_index: top?.index ?? null,
          confidence: 'medium',
          why: 'dry-run: no oracle exists for a refuse row, so the cascade top is taken rather than a refusal manufactured',
          size_question: null,
        },
        model: 'fake:dry-run',
        ms: 0,
      };
    }
    const match = candidates.find((c) => c.code === this.#row.code);
    const p = this.#probe();
    if (p) {
      p.pickFired = true;
      p.pickRows = candidates;
      p.pickedIndex = match?.index ?? null;
    }
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
  /** 'identify' or 'refuse'. Refuse rows are never in the top-1 denominator. */
  expect: Expectation;
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
  /**
   * The stage split (2026-09-13): what the cascade produced and what the pick
   * did with it, watched through the probe above. Null for a row carrying no
   * expected code, which the split cannot say anything about.
   */
  obs: StageObservation | null;
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

/* ==========================================================================
 * IS THE ANSWER KEY ITSELF STILL TRUE? (2026-09-14, D-096)
 *
 * A PENDING row asserts nothing, which is why the runner can carry forty of them
 * without breaking anyone's run -- and it is also why nobody noticed that twenty
 * of them point at products that do not exist. All twenty `tech` codes are
 * absent from the 212,340-row catalogue and from both Open Facts APIs; each one
 * carries a brand, a name and a category, so nothing in the file suggests they
 * are placeholders. The consequence is not "cannot fetch": if photos ever
 * landed, all twenty would score `cascade_miss` BY CONSTRUCTION, and the stage
 * split would send whoever read it to fix a cascade that was working perfectly.
 *
 * So the runner checks, and says so itself. A defect row is a thing somebody has
 * to go and read; a line in the output is a thing the next person cannot miss.
 * It uses the lookup the run already holds -- no second catalogue connection,
 * and no network -- and it runs with `probe` unset, so none of these queries
 * land in a row's stage observation.
 * ========================================================================== */

interface AnswerKeyCheck {
  /** PENDING rows carrying a code, i.e. rows this can say anything about. */
  readonly checked: number;
  /** ...of which the catalogue does not hold. An unusable answer key. */
  readonly absent: number;
  readonly absentSample: readonly string[];
  /** Set when the catalogue could not be asked at all. Then `absent` is 0. */
  readonly error: string | null;
}

async function checkAnswerKey(
  rows: readonly ManifestRow[],
  lookup: CatalogueLookup,
): Promise<AnswerKeyCheck> {
  const pendingWithCodes = rows.filter(
    (r): r is ManifestRow & { code: string } => r.code != null && !existsSync(evalPath(r.file)),
  );
  const absent: string[] = [];
  try {
    for (const r of pendingWithCodes) {
      const hit = await lookup({ gtin: r.code, limit: 1 });
      if (hit.candidates.length === 0) absent.push(r.code);
    }
  } catch (err) {
    return {
      checked: pendingWithCodes.length,
      absent: 0,
      absentSample: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    checked: pendingWithCodes.length,
    absent: absent.length,
    absentSample: absent.slice(0, 3),
    error: null,
  };
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

  const answerKey = await checkAnswerKey(rows, lookup);
  const { results, pending, pendingByKind } = await pass(args, rows, lookup, args.tier);
  report(args, results, pending, pendingByKind, answerKey);
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
): Promise<{ results: RowResult[]; pending: number; pendingByKind: Record<string, number> }> {
  // One real Identifier and one IdentifyStage shared across every row, same
  // as production would use one per process. The fake model needs to know
  // which row it is answering for, so dry-run builds a fresh one per row
  // instead (cheap; it makes no I/O of its own).
  let probe: Probe | null = null;
  const watched = probingLookup(lookup, () => probe);
  const sharedModel = args.dryRun ? null : new RecordingIdentifier(() => probe);
  const sharedStage = sharedModel ? new IdentifyStage(watched, sharedModel) : null;

  const results: RowResult[] = [];
  let pending = 0;
  const pendingByKind: Record<string, number> = {};

  for (const row of rows) {
    // Item 14b's produce and tech slots: manifest.json already carries the
    // row, the photo does not exist yet. Skipped, not a crash, and not
    // counted toward top-1/top-3/pass-2 for the rows that DO have a photo --
    // "adding the photos is the only remaining step" only holds if a bare
    // manifest entry can sit here without breaking the run for everyone else.
    if (!existsSync(evalPath(row.file))) {
      pending += 1;
      pendingByKind[row.kind] = (pendingByKind[row.kind] ?? 0) + 1;
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
    probe = newProbe();
    const stage =
      sharedStage ?? new IdentifyStage(watched, new FakeIdentifier(row, () => probe));
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
      expect: row.expect,
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
      obs: observationOf(row, outcome, probe),
    });
  }

  return { results, pending, pendingByKind };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function percentile(sortedMs: readonly number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[idx];
}

/* ==========================================================================
 * THE STAGE SPLIT REPORT.
 *
 * Everything below prints the two stages separately, because end-to-end top-1
 * cannot tell "the catalogue cascade never surfaced the right row" from "the row
 * was surfaced and the pick pass chose another", and those two have opposite
 * fixes: one is a catalogue-and-query problem, the other a prompt-and-model one.
 * ========================================================================== */

function interval(m: StageMetrics): string {
  return `[${(m.top1Interval.low * 100).toFixed(1)}%, ${(m.top1Interval.high * 100).toFixed(1)}%]`;
}

function reportStages(
  args: Args,
  results: readonly RowResult[],
  pendingByKind: Record<string, number>,
  answerKey: AnswerKeyCheck | null,
): StageMetrics | null {
  const obs = results.map((r) => r.obs).filter((o): o is StageObservation => o !== null);
  console.log('');
  console.log('================ STAGE SPLIT ================');
  if (obs.length === 0) {
    console.log('no scoreable row carried an expected code, so nothing can be split.');
    return null;
  }

  /*
   * PROVENANCE, first, because a number whose provenance the reader cannot see
   * is worse than no number.
   *
   * In --dry-run the FakeIdentifier returns a perfect reading of the manifest's
   * own answer and its pick() is an ORACLE: it points at whichever candidate
   * carries the expected code. So the cascade numbers below are REAL -- they are
   * the live catalogue answering real queries built from a perfect label read,
   * which is the retrieval ceiling. The pick numbers are NOT: an oracle that
   * already knows the answer measures nothing about a model that does not.
   */
  if (args.dryRun) {
    console.log('DRY RUN PROVENANCE:');
    console.log('  cascade recall / MRR : REAL. Real catalogue, real queries, from a perfect label read.');
    console.log('                         This is the retrieval CEILING, not what a real model would get.');
    console.log('  pick precision       : NOT MEANINGFUL. The dry-run pick is an oracle that is handed the');
    console.log('                         expected code, so it is 100% by construction and measures nothing.');
    console.log('  end-to-end top-1     : the ceiling too, for the same reason.');
    console.log('  negative set         : PLUMBING, NOT MEASUREMENT. There is no oracle for a row whose right');
    console.log('                         answer is "name nothing", so the dry-run pick takes the cascade top');
    console.log('                         rather than manufacturing a refusal. Every number in the NEGATIVE SET');
    console.log('                         block below shows that the path runs; none of them is a rate.');
  }
  if (args.fakeCatalogue) {
    console.log('--fake-catalogue: the cascade numbers below are the manifest graded against itself. Not results.');
  }

  const m = summarise(obs);
  console.log('');
  console.log(`scored rows: ${m.scored}  (expect:'identify' only; the negative set has its own block below)`);
  if (m.scored === 0) {
    console.log(
      "  no expect:'identify' row was scored, so every retrieval figure below is over an empty denominator.",
    );
  }
  console.log(
    `end-to-end top-1: ${m.top1}/${m.scored} (${pct(m.top1, m.scored)})  95% Wilson ${interval(m)}`,
  );
  console.log(
    `  n=${m.scored} is small. The interval, not the point estimate, is what this sample supports.`,
  );
  console.log(
    `barcode short-circuit: ${m.barcodeShortCircuit}/${m.scored} (${pct(m.barcodeShortCircuit, m.scored)}) -- excluded from every cascade and pick figure below`,
  );
  console.log('');
  console.log(`cascade (denominator ${m.cascade.denominator}: rows where the three-query cascade actually ran)`);
  console.log(`  recall@1 : ${m.cascade.recall1}/${m.cascade.denominator} (${pct(m.cascade.recall1, m.cascade.denominator)})`);
  console.log(`  recall@3 : ${m.cascade.recall3}/${m.cascade.denominator} (${pct(m.cascade.recall3, m.cascade.denominator)})`);
  console.log(`  recall@10: ${m.cascade.recall10}/${m.cascade.denominator} (${pct(m.cascade.recall10, m.cascade.denominator)})  <- the retrieval ceiling: no pick can beat this`);
  console.log(`  MRR      : ${m.cascade.mrr.toFixed(4)}  (reciprocal rank, not mAP: one correct row per photo makes mAP the same number under a misleading name)`);
  console.log('');
  console.log(
    `pick precision: ${m.pick.precision === null ? 'n/a' : pct(m.pick.correct, m.pick.denominator)} (${m.pick.correct}/${m.pick.denominator})`,
  );
  console.log(
    '  denominator = the right row WAS in the candidate set AND the pick fired and returned.',
  );
  console.log(
    '  a scan where pass one settled and the pick never ran is not a pick success and is not counted.',
  );

  console.log('');
  console.log('failure attribution');
  for (const a of ATTRIBUTIONS) {
    if (a === 'correct') continue;
    console.log(`  ${pad(a, 24)}${m.attribution[a]}`);
  }
  const failures = obs.filter((o) => attribute(o) !== 'correct');
  if (failures.length === 0) {
    console.log('  (no failures in this run)');
  } else {
    for (const o of failures) {
      // A false_positive row has no expected code, so it has no rank -- there is
      // nothing it could have been ranked at. Printing 'absent' there would read
      // as a retrieval miss, which is the one thing it is not.
      const rank = o.code === null ? null : o.cascadeCodes.indexOf(o.code);
      const rankLabel = rank === null ? 'no expected row' : rank === -1 ? 'rank absent' : `rank ${rank + 1}`;
      console.log(
        `  ${pad(o.code ?? '(no code)', 15)}${pad(o.kind, 12)}${pad(attribute(o), 24)}${pad(rankLabel, 17)}shipped ${o.chosenCode ?? '(none)'}`,
      );
    }
  }

  /*
   * The rows the cascade did NOT rank first and that shipped correct anyway.
   *
   * These are the difference between recall@1 and top-1, and in a dry run they
   * are the rows the ORACLE rescued -- which means they are exactly the rows at
   * risk the moment a real model takes the oracle's place. Printed because a
   * 100% top-1 sitting on a 95% recall@1 is not the same thing as a 100% top-1
   * sitting on a 100% recall@1, and nothing else in the report says which it is.
   */
  const rescued = obs.filter(
    (o): o is StageObservation & { code: string } =>
      o.expect === 'identify' &&
      o.code !== null &&
      !o.barcodeShortCircuit &&
      o.chosenCode === o.code &&
      o.cascadeCodes.indexOf(o.code) > 0,
  );
  console.log('');
  console.log(
    `carried by the pick pass: ${rescued.length} (cascade did not rank the right row first; the answer still shipped correct)`,
  );
  for (const o of rescued) {
    console.log(
      `  ${pad(o.code, 15)}${pad(o.kind, 12)}cascade rank ${o.cascadeCodes.indexOf(o.code) + 1}`,
    );
  }

  console.log('');
  console.log('by bucket');
  console.log(
    pad('kind', 13) +
      pad('rows', 6) +
      pad('top1', 12) +
      pad('r@1', 10) +
      pad('r@3', 10) +
      pad('r@10', 10) +
      pad('MRR', 8) +
      pad('pick', 10),
  );
  for (const [kind, k] of summariseByKind(obs)) {
    // A bucket made entirely of refuse rows has no top-1 and no recall; it is
    // reported in the NEGATIVE SET block instead of as a row of zeroes here.
    if (k.scored === 0 && k.negative.scored > 0) continue;
    console.log(
      pad(kind, 13) +
        pad(String(k.scored), 6) +
        pad(`${k.top1}/${k.scored}`, 12) +
        pad(`${k.cascade.recall1}/${k.cascade.denominator}`, 10) +
        pad(`${k.cascade.recall3}/${k.cascade.denominator}`, 10) +
        pad(`${k.cascade.recall10}/${k.cascade.denominator}`, 10) +
        pad(k.cascade.mrr.toFixed(3), 8) +
        pad(k.pick.precision === null ? 'n/a' : `${k.pick.correct}/${k.pick.denominator}`, 10),
    );
  }
  for (const [kind, n] of Object.entries(pendingByKind).sort()) {
    console.log(
      pad(kind, 13) + pad(String(n), 6) + 'PENDING: manifest slots with no photo yet. Neither a success nor a failure.',
    );
  }

  /*
   * THE GAP, printed rather than commented, because a limitation that lives only
   * in the source is a limitation nobody reading the number will ever see.
   */
  /* ------------------------------------------------------------------ negative set
   *
   * "Does Shin know what it is" is not answerable today: the image catalogue is
   * empty (D-098) and no real model has ever run here. "Does Shin know when it
   * does NOT know" is answerable, and this block is where it gets answered.
   */
  const neg = m.negative;
  const refusePending = pendingByKind['produce'] ?? 0;
  console.log('');
  console.log('================ NEGATIVE SET: does Shin know when it does not know? ================');
  console.log(
    `  refuse rows scored (had a photo): ${neg.scored}      refuse slots still PENDING (no photo): ${refusePending}`,
  );
  console.log(
    '  a refuse row is correct when NOTHING is named: not_in_catalogue, unreadable, or an unsure',
  );
  console.log('  band with no confident pick. Naming any catalogue row is a false positive.');
  console.log('');
  if (neg.scored === 0) {
    /*
     * THE ZERO-DENOMINATOR RULE, and the reason it is a branch and not a format
     * string: 0/0 rendered as "0.0%" is the most flattering lie this report
     * could tell, because a false-positive rate of zero is exactly what a
     * working refusal path looks like.
     */
    console.log('  false-positive rate : NOT COMPUTED -- denominator is 0, and 0/0 is not 0%.');
    console.log('  correct-refusal rate: NOT COMPUTED -- same denominator.');
  } else {
    console.log(
      `  false-positive rate : ${pct(neg.falsePositives, neg.scored)} (${neg.falsePositives}/${neg.scored})` +
        (neg.falsePositiveInterval
          ? `  95% Wilson [${(neg.falsePositiveInterval.low * 100).toFixed(1)}%, ${(neg.falsePositiveInterval.high * 100).toFixed(1)}%]`
          : ''),
    );
    console.log(
      `  correct-refusal rate: ${pct(neg.correctRefusals, neg.scored)} (${neg.correctRefusals}/${neg.scored})`,
    );
    console.log(
      `  refused by           : not_in_catalogue ${neg.refusedBy.notInCatalogue}, unreadable ${neg.refusedBy.unreadable}, unsure-no-pick ${neg.refusedBy.unsureNoConfidentPick}`,
    );
    const fps = obs.filter((o) => o.expect === 'refuse' && namedACatalogueRow(o));
    for (const o of fps) {
      console.log(
        `    FALSE POSITIVE  ${pad(o.kind, 12)}named ${o.chosenCode ?? '(none)'} at band ${o.confidenceBand ?? 'n/a'}`,
      );
    }
    if (args.dryRun) {
      console.log('');
      console.log('  DRY RUN: the two rates above are PLUMBING, NOT MEASUREMENT. No model was asked anything;');
      console.log('  the fake pick takes the cascade top on a refuse row precisely so a dry run cannot');
      console.log('  manufacture a clean negative set. Do not quote either number.');
    }
  }

  /*
   * THE GAP, printed rather than commented, because a limitation that lives only
   * in the source is a limitation nobody reading the number will ever see.
   */
  console.log('');
  console.log('WHERE THE NEGATIVE SET ACTUALLY STANDS');
  console.log(
    `  The negative set now EXISTS in the manifest: ${neg.scored + refusePending} rows carry expect:'refuse', the twenty`,
  );
  console.log(
    '  loose-produce slots that have no barcode and no catalogue row (D-096). So the false-positive',
  );
  console.log(
    `  rate is DEFINED -- and it is still UNMEASURED, because ${refusePending} of those rows hold no photo.`,
  );
  console.log(
    '  The change from yesterday is the honest one and it is not a number: the eval could not ask',
  );
  console.log(
    '  the question before and can now, so what is missing is photographs and a key, not a metric.',
  );
  console.log(
    `  Until they land: the 'not_in_catalogue' branch fired ${m.notInCatalogue} time(s) on the positive set, which is`,
  );
  console.log('  what you would expect from rows that are all in the catalogue by construction.');

  /*
   * AND WHETHER THE ANSWER KEY IS STILL TRUE. D-096 lives in DEFECTS.md, which
   * is a file somebody has to go and read; this is the same fact where the
   * number is.
   */
  if (answerKey) {
    console.log('');
    if (answerKey.error !== null) {
      console.log(
        `  ANSWER KEY UNCHECKED: the catalogue could not be asked about the ${answerKey.checked} PENDING coded row(s) (${answerKey.error}).`,
      );
    } else if (answerKey.absent > 0) {
      console.log(
        `  ANSWER KEY BROKEN (D-096): ${answerKey.absent} of ${answerKey.checked} PENDING rows carry a code the catalogue does NOT hold` +
          `${answerKey.absentSample.length ? ` (e.g. ${answerKey.absentSample.join(', ')})` : ''} --`,
      );
      console.log(
        '  if photos landed tomorrow every one of them would score cascade_miss by construction, blaming a',
      );
      console.log(
        '  cascade that is working. Those rows need re-selecting from the catalogue before they are shot.',
      );
    } else if (answerKey.checked > 0) {
      console.log(
        `  answer key: all ${answerKey.checked} PENDING coded rows resolve in the catalogue; they are photo-ready.`,
      );
    }
  }

  return m;
}

function report(
  args: Args,
  results: RowResult[],
  pending = 0,
  pendingByKind: Record<string, number> = {},
  answerKey: AnswerKeyCheck | null = null,
): void {
  console.log(
    pad('code', 15) +
      pad('expect', 10) +
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
        pad(r.expect, 10) +
        pad(r.kind, 12) +
        pad(r.outcome, 15) +
        pad(r.top1 ? 'yes' : 'no', 6) +
        pad(r.top3 ? 'yes' : 'no', 6) +
        pad(String(r.ms), 7) +
        pad(r.pin, 10),
    );
  }

  /*
   * THE TOP-1 DENOMINATOR IS THE POSITIVE SET ONLY (2026-09-14).
   *
   * A refuse row cannot score top-1 -- there is no code for it to be top-1 of --
   * so leaving it in `n` would deflate top-1 by however many produce photos
   * exist, and the deflation would look like a retrieval regression. The rows
   * still cost a model call each, so `n` stays whole for cost and timing below.
   */
  const idResults = results.filter((r) => r.expect === 'identify');
  const n = idResults.length;
  const calls = results.length;
  const refuseScored = results.length - n;
  const top1n = idResults.filter((r) => r.top1).length;
  const top3n = idResults.filter((r) => r.top3).length;
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
      ? // `calls`, not `n`: a refuse row is outside the top-1 denominator but it
        // is not free -- it makes the same extract call as any other photo.
        `~$${(calls * SONNET_COST_PER_CALL + pickCost).toFixed(4)} (${calls} extract calls + ${pickCalls} pick calls, both at model.ts's $0.0068/call estimate)`
      : `extract cost unknown (no published basic/haiku figure in model.ts); ${pickCalls} pick calls (always Sonnet 5) ~$${pickCost.toFixed(4)}`;

  console.log('');
  console.log(
    `rows run: ${calls}  (identify ${n}, refuse ${refuseScored})  tier: ${args.tier}  dry-run: ${args.dryRun}`,
  );
  console.log(`top-1: ${top1n}/${n} (${pct(top1n, n)})   <- expect:'identify' rows only`);
  console.log(`top-3: ${top3n}/${n} (${pct(top3n, n)})`);
  console.log(`unreadable: ${unreadable}/${calls}`);
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

  const stages = reportStages(args, results, pendingByKind, answerKey);

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
          rowsRun: calls,
          /** `expect:'identify'` rows: the denominator top1/top3 are over. */
          rows: n,
          refuseRowsScored: refuseScored,
          top1: top1n,
          top3: top3n,
          unreadable,
          pass2OfKnown: withPasses.length ? pass2n : null,
          pass2Denominator: withPasses.length,
          p50Ms: percentile(times, 50),
          p95Ms: percentile(times, 95),
          pending,
        },
        /*
         * The stage split, saved so the interval travels with the number. A
         * point estimate off 40 photos quoted without its interval is the exact
         * misreading this section exists to prevent, so the JSON carries
         * `top1Interval` next to `top1` rather than leaving it on stdout.
         */
        stages,
        stageNotes: {
          dryRunPickIsAnOracle: args.dryRun,
          cascadeNumbersReal: !args.fakeCatalogue,
          negativeSet:
            "defined and unmeasured: the twenty loose-produce rows now carry expect:'refuse', so a false " +
            'positive has a definition and a denominator, but none of them holds a photo yet. The rate is ' +
            'null, not zero.',
          // Saved as a flag and not only as a sentence, so anything reading this
          // file later can refuse to plot the rate rather than having to parse
          // prose to find out it is plumbing.
          negativeSetMeasured: !args.dryRun && (stages?.negative.scored ?? 0) > 0,
          answerKey,
        },
        pendingByKind,
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
