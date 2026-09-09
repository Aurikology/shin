/**
 * The only interface band 1 gets. No camera, no mascot, no screens.
 *
 *   node src/cli.ts price "kraft dinner original 225g" --asking 2.00 --seller Metro --category grocery
 *   node src/cli.ts corpus [--write] [--as-of 2026-09-03T18:00:00Z]
 *   node src/cli.ts explain [category]
 *   node src/cli.ts sources
 */

import type { CategoryId } from './contract.ts';
import { CATEGORY_IDS } from './contract.ts';
import { CATEGORY_RULES } from './categories.ts';
import { priceIt, renderResult } from './spine.ts';
import { defaultDeps } from './sources/registry.ts';
import { dollarsToCents } from './money.ts';
import {
  formatReport,
  loadCorpus,
  repoRoot,
  runCorpus,
  writeScoreboard,
} from './harness.ts';

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function has(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

async function main(): Promise<number> {
  const [, , command = 'help', ...rest] = process.argv;

  if (command === 'price') {
    const text = rest.find((a) => !a.startsWith('--'));
    if (text === undefined) {
      console.error('usage: price "<what it is>" --asking <dollars> [--seller <name>] [--category <id>]');
      return 2;
    }
    const askingRaw = flag(rest, 'asking');
    // Caught here as well as in the spine, so the person typing gets told which
    // of the two things went wrong. "2,00" is a French-Canadian decimal comma and
    // is exactly what a shelf-tag reader would hand us.
    if (askingRaw !== undefined && !Number.isFinite(Number(askingRaw))) {
      console.error(`could not read "${askingRaw}" as a price. Use a dot for the decimal, as in 2.00`);
      return 2;
    }
    const category = flag(rest, 'category') as CategoryId | undefined;
    if (category !== undefined && !CATEGORY_IDS.includes(category)) {
      console.error(`unknown category "${category}". one of: ${CATEGORY_IDS.join(', ')}`);
      return 2;
    }
    const result = await priceIt(
      {
        text,
        category,
        askingCents: askingRaw === undefined ? undefined : dollarsToCents(Number(askingRaw)),
        askingSeller: flag(rest, 'seller'),
        asOf: flag(rest, 'as-of'),
      },
      defaultDeps(),
    );
    console.log(renderResult(result));
    // A refusal is a correct outcome, not a failure. Exit 0 either way, or every
    // caller learns to treat "Shin declined" as something to retry around.
    return 0;
  }

  if (command === 'corpus') {
    const corpus = loadCorpus();
    const report = await runCorpus(corpus, defaultDeps(), flag(rest, 'as-of'));
    console.log(formatReport(report));
    if (has(rest, 'write')) {
      const written = writeScoreboard(report, repoRoot());
      console.log(`\nwrote ${written.json}\nappended ${written.md}`);
    }
    return 0;
  }

  if (command === 'explain') {
    const which = rest.find((a) => !a.startsWith('--')) as CategoryId | undefined;
    const ids = which ? [which] : CATEGORY_IDS;
    for (const id of ids) {
      const rule = CATEGORY_RULES[id];
      if (!rule) {
        console.error(`unknown category "${id}"`);
        return 2;
      }
      console.log(`${rule.label} (${rule.id})`);
      if (rule.unsupported) {
        console.log(`  UNSERVED. ${rule.unsupported.why}`);
        console.log(`  reversed by: ${rule.unsupported.reversedBy}`);
      } else {
        console.log(`  usually needs ${rule.minPoints} points from ${rule.minDistinctSellers} seller(s), newest within ${rule.maxAgeDays}d`);
        console.log(`  with less than that it still answers, at low confidence, off the single price judge; only no price at all refuses`);
        console.log(`  counts: ${rule.usableKinds.join(', ')}   identity floor: ${rule.identityFloor}`);
        console.log(`  why: ${rule.reasoning}`);
      }
      console.log('');
    }
    return 0;
  }

  if (command === 'sources') {
    for (const s of defaultDeps().sources) {
      const a = s.available();
      console.log(
        `${s.id.padEnd(12)} ${a.ok ? 'available  ' : 'unavailable'} ${s.verified ? 'verified  ' : 'UNVERIFIED'} ${s.categories.join(',')}${a.ok ? '' : `: ${a.reason}`}`,
      );
    }
    return 0;
  }

  console.log(
    [
      'shin price spine (band 1)',
      '',
      '  price "<what it is>" --asking <dollars> [--seller <name>] [--category <id>]',
      '  corpus [--write] [--as-of <iso>]',
      '  explain [category]',
      '  sources',
    ].join('\n'),
  );
  return command === 'help' ? 0 : 2;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exitCode = 1;
  },
);
