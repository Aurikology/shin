/**
 * Gap 54 and 67: the thread that prices a scanned barcode the catalogue knows, so the server's own
 * thread stays free to answer everybody else. Started by `barcode-pool.ts`, several at once.
 *
 * WHY. A barcode scan's answer is `answerBarcodeFromCatalogue` (catalogue-first.ts): the barcode
 * lookup, then the range ladder over Pexi's prices and the verdict's estimate, which reads every
 * category pool and re-samples its width. All of it is synchronous (node:sqlite, and plain
 * arithmetic over thousands of prices). On the request thread one scan held every other shopper:
 * the Mac load test broke at 256 continuous users with barcode scans in the mix, while 6 of its 8
 * cores sat idle. A profile of 64 shoppers scanning on the PC put 60% of the server's time in
 * `estimate` and 33% in the range ladder.
 *
 * WHAT RUNS HERE, AND WHAT DOES NOT. Only a barcode the catalogue holds (or a loose-produce code),
 * through the very same `answerBarcodeFromCatalogue`, with the same inputs the request thread would
 * have built: this thread's own read-only handles on the same catalogue, prices and corrections
 * files, the same taxonomy, the same Statistics Canada table. A barcode the catalogue lacks is sent
 * straight back unanswered: its next steps (Open Food Facts over the network, a saved Claude
 * reading, shoppers' learned picks, the frame) belong to the request thread, which answers it as
 * before. The two things this thread cannot do itself, the paid Claude range ask and the name
 * search that sorts an uncategorised product, are asked of the request thread by message
 * (`call`), so the money guard and the search pool stay in one place.
 *
 * What the request thread keeps counting is sent back with every answer: the category checks the
 * answer made (replayed into the server's own guard, which logs, counts and files them), the
 * prices-file state for /api/health, and this thread's fault counts.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { openCatalogueReadOnly } from '../../catalogue/src/schema.ts';
import { Catalogue } from '../../catalogue/src/search.ts';
import { defaultEmbedder } from '../../catalogue/src/embed.ts';
import { loadTable as loadStatcanTable, nationalAverageFor } from '../../price/src/statcan.ts';
import { rangeFaults } from '../../price/src/range.ts';
import { shopperVoiceFor } from '../../price/src/shopper-prices.ts';
import { answerBarcodeFromCatalogue, catalogueFaults, isRow, type BarcodeDeps } from './catalogue-first.ts';
import { createCategoryGuard, type CategoryGuard, type RungUse } from './category-guard.ts';
import { pricesStateOf } from './prices-health.ts';
import type { BarcodeJob, WorkerToMain, MainToWorker } from './barcode-pool.ts';

if (!parentPort) throw new Error('barcode-worker.ts must be started as a worker (barcode-pool.ts starts it)');
const port = parentPort;

const { cataloguePath, pricesPath, taxonomyPath } = workerData as { cataloguePath: string; pricesPath: string; taxonomyPath: string | null };

const catalogueDb = openCatalogueReadOnly(cataloguePath);
// As app/server.ts builds `fastLookup`: byGtin does no embedding, and the embedder loads nothing until used.
// Only byGtin is used here, which reads no taxonomy: `null` says so, and keeps each thread from logging its absence.
const lookup = new Catalogue(catalogueDb, defaultEmbedder(), null) as unknown as { byGtin(code: string): unknown };

/*
 * The server's guard, loaded from the same taxonomy file, silent: it only works out the fault kind
 * an answer records. Every check is also handed back, and the server's own guard replays it, so
 * the log line, the count in /api/health and the faults file are written once, on that thread.
 */
const quietGuard: CategoryGuard | null = taxonomyPath ? createCategoryGuard({ taxonomyPath, log: () => {} }) : null;
/** One per job: jobs interleave while one waits on the request thread, so each keeps its own list. */
function recordingGuard(uses: RungUse[]): CategoryGuard | undefined {
  if (!quietGuard) return undefined;
  return {
    taxonomy: () => quietGuard.taxonomy(),
    check: (use) => {
      uses.push(use);
      return quietGuard.check(use);
    },
    health: () => quietGuard.health(),
  };
}

const statcanRung: NonNullable<BarcodeDeps['nationalAverage']> = (q) => nationalAverageFor(q, loadStatcanTable());

/* The corrections file, read-only, for shoppers' prices. One handle per path, kept. */
const correctionHandles = new Map<string, DatabaseSync | null>();
function correctionsDb(path: string | null): DatabaseSync | null {
  if (!path) return null;
  if (!correctionHandles.has(path)) {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(path, { readOnly: true });
    } catch (err) {
      console.error(`[shopper-price-fault] barcode worker could not open ${path}: ${err instanceof Error ? err.message : String(err)}`);
      db = null;
    }
    correctionHandles.set(path, db);
  }
  return correctionHandles.get(path) ?? null;
}

/* Calls to the request thread: the Claude range ask and the name search. */
let callSeq = 0;
const calls = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
function callMain(job: number, fn: 'askRange' | 'sortName', arg: unknown): Promise<unknown> {
  const call = (callSeq += 1);
  return new Promise((resolve, reject) => {
    calls.set(call, { resolve, reject });
    const msg: WorkerToMain = { type: 'call', job, call, fn, arg };
    port.postMessage(msg);
  });
}

function isHit(job: BarcodeJob): boolean | 'failed' {
  if (job.canonical.how === 'plu' && job.canonical.plu) return true;
  try {
    // The very test answerBarcodeFromCatalogue makes, so a row it would call a miss is never answered here.
    return isRow(lookup.byGtin(job.canonical.gtin));
  } catch {
    return 'failed';
  }
}

async function answer(id: number, job: BarcodeJob): Promise<void> {
  const hit = isHit(job);
  if (hit !== true) {
    // Not ours: the request thread answers a miss (and a lookup that threw) exactly as before.
    const msg: WorkerToMain = { type: 'skip', id, why: hit === 'failed' ? 'lookup_failed' : 'miss' };
    port.postMessage(msg);
    return;
  }
  let prices: DatabaseSync | null = null;
  let pricesError: string | null = null;
  try {
    if (existsSync(pricesPath)) prices = new DatabaseSync(pricesPath, { readOnly: true });
  } catch (err) {
    pricesError = err instanceof Error ? err.message : String(err);
    prices = null;
  }
  const pricesState = pricesStateOf(prices, pricesPath);
  const uses: RungUse[] = [];
  const guard = recordingGuard(uses);
  try {
    const store = correctionsDb(job.correctionsPath);
    const deps: BarcodeDeps = {
      lookup,
      prices,
      catalogue: catalogueDb,
      ...(guard ? { categoryGuard: guard } : {}),
      country: job.country,
      currency: job.currency,
      asOf: job.asOf,
      ...(job.hasAskRange ? { askRange: (identity) => callMain(id, 'askRange', identity) as ReturnType<NonNullable<BarcodeDeps['askRange']>> } : {}),
      region: job.region,
      shopper: job.shopper,
      ...(job.hasSortName ? { sortName: (name: string) => callMain(id, 'sortName', name) as ReturnType<NonNullable<BarcodeDeps['sortName']>> } : {}),
      ...(job.claudeWaitMs !== undefined ? { claudeWaitMs: job.claudeWaitMs } : {}),
      ...(job.nationalAverage ? { nationalAverage: statcanRung } : {}),
      shopperVoice: (key) => (job.shopperVoiceOff ? null : shopperVoiceFor(store, key, new Date().toISOString().slice(0, 10))),
      ...(job.identity ? { identity: job.identity } : {}),
    };
    const out =await answerBarcodeFromCatalogue(job.canonical, deps);
    const msg: WorkerToMain = {
      type: 'answer',
      id,
      answer: out.answer,
      record: out.record,
      guardUses: uses,
      pricesState,
      pricesError,
      faults: { catalogue: catalogueFaults(), range: rangeFaults() },
    };
    port.postMessage(msg);
  } catch (err) {
    const msg: WorkerToMain = { type: 'error', id, error: err instanceof Error ? err.message : String(err) };
    port.postMessage(msg);
  } finally {
    try {
      prices?.close();
    } catch {
      /* already closed */
    }
  }
}

port.on('message', (msg: MainToWorker) => {
  if (msg.type === 'job') {
    void answer(msg.id, msg.job);
    return;
  }
  const waiting = calls.get(msg.call);
  if (!waiting) return;
  calls.delete(msg.call);
  if (msg.ok) waiting.resolve(msg.value);
  else waiting.reject(new Error(msg.error));
});
