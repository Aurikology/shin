/**
 * Ask the catalogue something from a terminal.
 *
 * This exists so that stage 1's "done when" can be checked the way its consumer
 * will meet it, rather than by a test asserting against a fixture the same
 * commit created. Type half a garbled French name; see whether the English row
 * comes back. Ask for something that does not exist; see whether the neighbour
 * ring is named honestly.
 *
 *   node src/cli.ts "cereales avoine"
 *   node src/cli.ts --gtin 0068100084245
 */

import { openCatalogue } from './schema.ts';
import { defaultEmbedder } from './embed.ts';
import { loadRingTaxonomy } from './category-taxonomy.ts';
import { Catalogue, labelForTag, type Candidate } from './search.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';

function show(c: Candidate, i: number): void {
  const s = c.signals;
  const bits = [
    s.similarity !== null ? `sim ${s.similarity.toFixed(3)}` : null,
    s.textRank !== null ? `text #${s.textRank}` : null,
    s.vectorRank !== null ? `vec #${s.vectorRank}` : null,
    c.soldInCanada ? 'CA' : null,
  ].filter(Boolean);
  const size = c.sizeValue ? `${c.sizeValue}${c.sizeUnit}` : (c.quantity ?? '');
  console.log(`  ${i + 1}. ${c.brands ? `${c.brands} — ` : ''}${c.name}  ${size}`);
  console.log(`     ${c.code}  ${bits.join('  ')}`);
  if (c.nameFr && c.nameFr !== c.name) console.log(`     fr: ${c.nameFr}`);
  if (c.leafCategory) console.log(`     ${labelForTag(c.leafCategory)}`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const gtinFlag = args.indexOf('--gtin');
  const db = openCatalogue(DB_PATH);
  const embedder = defaultEmbedder();
  const cat = new Catalogue(db, embedder, loadRingTaxonomy());

  const started = Date.now();
  const result =
    gtinFlag >= 0
      ? await cat.search({ gtin: args[gtinFlag + 1] })
      : await cat.search({ text: args.join(' '), limit: 5 });
  const ms = Date.now() - started;

  console.log(`band: ${result.band}   matched by: ${result.matchedBy}   ${ms}ms   [${embedder.id}]`);
  if (result.candidates.length === 0) console.log('  no candidates');
  result.candidates.forEach(show);

  if (result.ring) {
    console.log(
      `\nring: ${result.ring.label}  (${result.ring.distanceOut} step${result.ring.distanceOut === 1 ? '' : 's'} out)`,
    );
    result.ring.members.forEach(show);
  }
  return 0;
}

main().then((c) => process.exit(c));
