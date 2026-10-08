/**
 * Fetch the Open Food Facts category taxonomy for the category safeguards.
 *
 *   node src/fetch-categories.ts [source] [out]
 *
 * `source` is a URL (https://...) or a local path; it defaults to
 * https://static.openfoodfacts.org/data/taxonomies/categories.json. `out`
 * defaults to data/off-categories.json. The file is checked to be a non-empty
 * JSON object of tag -> entry BEFORE it replaces anything, and the sha256 and
 * date are printed so they can be recorded in category-baseline.json (the check
 * fails loudly when the file's hash is not the baseline's).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { taxonomyFromObject } from './category-taxonomy.ts';
import { createHash } from 'node:crypto';

export const DEFAULT_SOURCE = 'https://static.openfoodfacts.org/data/taxonomies/categories.json';

/** Read the bytes from a URL or a local path. */
export async function readSource(source: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`fetch ${source} answered ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(source);
}

/** Validate the bytes and write them to `out`. Returns the sha256. Throws before writing on a bad file. */
export function installTaxonomy(bytes: Buffer, out: string): { sha256: string; entries: number } {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const tax = taxonomyFromObject(JSON.parse(bytes.toString('utf8')) as unknown, sha256);
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.part`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, out);
  return { sha256, entries: tax.size };
}

async function main(argv: readonly string[]): Promise<number> {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = argv[0] ?? DEFAULT_SOURCE;
  const out = argv[1] ?? join(here, '..', 'data', 'off-categories.json');
  try {
    const { sha256, entries } = installTaxonomy(await readSource(source), out);
    console.log(`taxonomy: ${entries} entries from ${source} -> ${out}`);
    console.log(`sha256 ${sha256}`);
    console.log(`fetched ${new Date().toISOString().slice(0, 10)}   (record both in category-baseline.json)`);
    return 0;
  } catch (err) {
    console.error(`taxonomy fetch FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => {
    process.exitCode = c;
  });
}

