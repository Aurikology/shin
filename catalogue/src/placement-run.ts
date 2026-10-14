/**
 * One command for Stage 3 "Placing items" on a catalogue file (requirements 2.1 to
 * 2.4): the Stage 2 build, shopper picks in, the cascade, the 2.2 re-run record and
 * the 2.4 schedule check. See placement-cascade.ts for the cascade itself.
 *
 *   node src/placement-run.ts --db <COPY of catalogue.db> --vectors <name-index.db>
 *        [--scans <scans.db>] [--workers 8] [--bar 0.6] [--no-meaning] [--no-text]
 *        [--taxonomy <path> | --no-taxonomy] [--no-department-taxonomies]
 *        [--food-label-map <path> | --no-food-label-map] [--live]
 *        [--label-threshold <0..1>] [--model-dir <folder holding Xenova/multilingual-e5-small>]
 *
 * The meaning route needs every named item embedded first (name-meaning.ts embed);
 * a missing vector stops the run. --no-meaning runs without that route and SAYS so
 * in its output; it does not record a 2.2 re-run.
 *
 * The label route (label-classifier.ts, 2.1 "Next") names categories from their labels
 * alone, after the meaning route and before the Claude slot. It reads the same name
 * index; the category-label vectors are embedded here when --model-dir is given, else
 * they must already be in the index (a missing one stops the run). It runs ONLY with
 * --label-threshold: no threshold has been measured to reach the 95% bar (see
 * label-classifier.ts), so without the flag the route is off and the run says so.
 *
 * Exits 0 only when every item ended placed. Prints the top-level-only share against
 * the 5% bar; that share failing is reported loudly (exit 3), not hidden.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_ALIASES_PATH, DEFAULT_TAXONOMY_PATH, loadDepartmentTaxonomies, loadTaxonomy, type Taxonomy } from './category-taxonomy.ts';
import { buildPlacement, departmentOfSource, NO_DEPARTMENT } from './placement.ts';
import { FOOD_LABEL_MAP_PATH, loadFoodLabelMap, type FoodLabelMap } from './food-label-link.ts';
import {
  assertNotLiveCatalogue,
  barcodeRoute,
  labelledLeaves,
  neighbourRoute,
  PLACEMENT_CONFIDENCE_BAR,
  PlacementTree,
  runCascade,
  textNeighbours,
  type PlacementRoute,
  type TextQuery,
} from './placement-cascade.ts';
import { meaningNeighbours, onnxE5Embedder, openNameIndex } from './name-meaning.ts';
import { embedLabels, labelCandidates, labelRoute, loadLabelNames, type LabelCandidate } from './label-classifier.ts';
import { assertRescoreNotOverdue, ensureFeedbackSchema, ingestPicks, recordRescore } from './placement-feedback.ts';

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function main(argv: readonly string[]): Promise<number> {
  const dbPath = arg('--db', argv);
  if (!dbPath) {
    console.error('placement-run FAILED: --db <catalogue.db> is required');
    return 2;
  }
  const t0 = Date.now();
  const log = (l: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${l}`);
  try {
    assertNotLiveCatalogue(dbPath, { live: argv.includes('--live') });
    const workers = Number(arg('--workers', argv) ?? Math.max(1, cpus().length - 2));
    const bar = Number(arg('--bar', argv) ?? PLACEMENT_CONFIDENCE_BAR);
    let tax: Taxonomy | null = null;
    if (!argv.includes('--no-taxonomy')) tax = loadTaxonomy(arg('--taxonomy', argv) ?? DEFAULT_TAXONOMY_PATH, { aliasesPath: DEFAULT_ALIASES_PATH });
    const departmentTaxonomies = argv.includes('--no-department-taxonomies') ? null : loadDepartmentTaxonomies();
    if (!departmentTaxonomies) log('placement-run: --no-department-taxonomies: beauty, general and pet parents read the food taxonomy only');
    let foodLabelMap: FoodLabelMap | null = null;
    if (argv.includes('--no-food-label-map')) log('placement-run: --no-food-label-map: USDA labels hang off the food top, unlinked to the Open Food Facts tree');
    else foodLabelMap = loadFoodLabelMap(arg('--food-label-map', argv) ?? FOOD_LABEL_MAP_PATH);
    const db = new DatabaseSync(dbPath);
    try {
      buildPlacement(db, { taxonomy: tax, departmentTaxonomies, foodLabelMap, log });
      ensureFeedbackSchema(db);
      const scans = arg('--scans', argv);
      if (scans) log(`placement-run: picks ${JSON.stringify(ingestPicks(db, scans, { origin: 'scans' }))}`);
      else log('placement-run: no --scans given: no shopper picks read this run');

      const targets = db
        .prepare(`SELECT p.code, p.source, p.name, p.name_en, p.name_fr, p.brands FROM product p JOIN item_placement ip ON ip.code = p.code WHERE ip.placed_by <> 'path' ORDER BY p.rowid`)
        .all() as unknown as { code: string; source: string; name: string; name_en: string | null; name_fr: string | null; brands: string | null }[];
      const departments = [...new Set(targets.map((t) => departmentOfSource(t.source)).filter((d) => d !== NO_DEPARTMENT))].sort();
      log(`placement-run: ${targets.length} items to place, departments ${departments.join(', ')}`);

      const routes: PlacementRoute[] = [barcodeRoute(db)];
      const leaves = labelledLeaves(db);
      if (!argv.includes('--no-text')) {
        const queries: TextQuery[] = targets
          .filter((t) => departmentOfSource(t.source) !== NO_DEPARTMENT)
          .map((t) => ({ code: t.code, department: departmentOfSource(t.source), text: [t.brands, t.name_en || t.name_fr || t.name].filter(Boolean).join(' ') }));
        const table = await textNeighbours(db, queries, { workers, dbPath, log });
        routes.push(neighbourRoute('text', table, (key) => leaves.get(key) ?? null));
      } else log('placement-run: TEXT ROUTE OFF (--no-text)');

      let meaningRan = false;
      if (!argv.includes('--no-meaning')) {
        const vectors = arg('--vectors', argv);
        if (!vectors) throw new Error('--vectors <name-index.db> is required for the meaning route (or pass --no-meaning, said out loud)');
        const index = openNameIndex(vectors);
        const table = new Map<string, string[]>();
        const labels = new Map<string, number>();
        try {
          for (const department of departments) {
            const m = await meaningNeighbours(index, db, { department, k: 10, workers, log });
            log(`placement-run: meaning ${department}: ${m.targets} items matched against ${m.labelled} labelled examples (${m.model}); ${m.noText} with no name`);
            for (const [code, list] of m.neighbours) {
              table.set(code, list);
              for (const key of list) {
                const leaf = m.labelOf(key);
                if (leaf !== null) labels.set(key, leaf);
              }
            }
          }
        } finally {
          index.close();
        }
        routes.push(neighbourRoute('meaning', table, (key) => labels.get(key) ?? null));
        meaningRan = true;
      } else log('placement-run: MEANING ROUTE OFF (--no-meaning): this is not a 2.2 re-run');

      // 2.1 "Next": the label classifier, after name meaning and before the Claude slot.
      const thresholdArg = arg('--label-threshold', argv);
      if (thresholdArg !== undefined) {
        const vectors = arg('--vectors', argv);
        if (!vectors) throw new Error('--vectors <name-index.db> is required for the label route');
        const threshold = Number(thresholdArg);
        if (!(threshold > 0 && threshold <= 1)) throw new Error(`--label-threshold ${threshold} is not in (0, 1]`);
        const modelDir = arg('--model-dir', argv);
        const index = openNameIndex(vectors);
        const table = new Map<string, LabelCandidate[]>();
        try {
          const tree = PlacementTree.load(db);
          const embedder = modelDir ? await onnxE5Embedder(modelDir) : null;
          for (const department of departments) {
            const names = loadLabelNames(department);
            if (embedder) {
              const e = await embedLabels(index, tree, embedder, { department, names, log });
              log(`placement-run: labels ${department}: ${e.labels} (${e.embedded} embedded now)`);
            }
            const c = await labelCandidates(index, db, tree, { department, names, workers, log });
            log(`placement-run: label route ${department}: ${c.targets} items against ${c.labels} category labels (${c.model}); ${c.noText} with no name`);
            for (const [code, list] of c.candidates) table.set(code, list);
          }
        } finally {
          index.close();
        }
        routes.push(labelRoute(table, { threshold }));
        log(`placement-run: label route on, similarity threshold ${threshold}`);
      } else log('placement-run: LABEL ROUTE OFF: no --label-threshold given, and no threshold has been measured to reach 95% held-out accuracy');

      const summary = await runCascade(db, { routes, bar, log });
      if (meaningRan) recordRescore(db, `placement-run: meaning route re-run over ${summary.considered} items, bar ${bar}`);
      assertRescoreNotOverdue(db);
      log(`placement-run: SUMMARY ${JSON.stringify(summary)}`);
      if (!summary.topLevelOnly.meetsBar) {
        console.error(`placement-run: 2.1 top-level-only share ${(summary.topLevelOnly.share * 100).toFixed(2)}% is OVER the 5% bar`);
        return 3;
      }
      return 0;
    } finally {
      db.close();
    }
  } catch (err) {
    console.error(`placement-run FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
