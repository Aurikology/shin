// settings/src/index.ts is the one module every setting Shin's live code
// reads lives in (CLAUDE.md, "some code is dependent on certain decisions...
// this creates a lot of piled up garbage"). This fails the build when:
//   (a) a key's ruling title is not a real RULINGS.md `### ` heading
//       (or the literal `'operational'`);
//   (b) a `SHIN_*` name on a RULINGS.md `Governs:` line has no matching key;
//   (c) `process.env.<NAME>` appears in live code outside the module, with
//       no allowed exception naming that exact file and why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSettingsKeys, parseRulingTitles, parseGovernsShinNames, liveFiles, findNamedProcessEnvReads } from '../settings-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const settingsPath = join('settings', 'src', 'index.ts');
const rulingsPath = 'RULINGS.md';

const moduleText = readFileSync(join(root, settingsPath), 'utf8');
const rulingsText = readFileSync(join(root, rulingsPath), 'utf8');
const keys = parseSettingsKeys(moduleText);

test('the settings module actually has keys (a check that finds nothing is not a check)', () => {
  assert.ok(keys.length > 10, `parsed ${keys.length} keys out of settings/src/index.ts -- the parser or the file is broken`);
});

test('every key not tagged operational names a real RULINGS.md ### heading', () => {
  const titles = parseRulingTitles(rulingsText);
  assert.ok(titles.size > 10, `parsed ${titles.size} ### headings out of RULINGS.md -- the parser or the file is broken`);
  const bad = keys.filter((k) => k.ruling !== 'operational' && !titles.has(k.ruling));
  assert.deepEqual(
    bad.map((k) => `${k.env} -> '${k.ruling}'`),
    [],
    "Each key's ruling must be 'operational' or an exact RULINGS.md ### title. Retitled or retired?",
  );
});

test('every SHIN_* name on a RULINGS.md Governs: line has a matching settings key', () => {
  const governsNames = parseGovernsShinNames(rulingsText);
  assert.ok(governsNames.size > 0, 'parsed zero SHIN_* names off Governs: lines -- the parser or the file is broken');
  const keyNames = new Set(keys.map((k) => k.env));
  const orphans = [...governsNames].filter((n) => !keyNames.has(n));
  assert.deepEqual(
    orphans,
    [],
    'A RULINGS.md Governs: line names a variable with no settings/src/index.ts key. Add the key, or the ' +
      'Governs: line named dead code -- fix the line (only the Governs: line; nothing else in RULINGS.md).',
  );
});

/**
 * Every directory this repo's live server code can reach. `test` and `eval`
 * directories are skipped by `liveFiles` itself; everything named below is a
 * file or directory this task found reads `process.env.X` but is not part of
 * the live server: a one-shot CLI tool run by hand, or a build script. Each
 * carries the reason it was found not to be live, so a future session does
 * not have to re-derive it.
 */
const ALLOWED_EXCEPTIONS = {
  'app/scripts/build-icon.mjs': 'a build-time icon generator (npm run icon); CHROME_PATH is a build tool knob, not a Shin setting',
  'price/src/crawl.ts': 'the Walmart sitemap crawler, run by hand (no npm script; never imported by app/identify/catalogue/spine)',
  'price/src/walmart.ts': 'only imported by crawl.ts and walmart-sitemap.ts, both run-by-hand crawlers, never by live server code',
  'price/src/bestbuy-ratings.ts':
    "its own header: 'WRITTEN, NEVER RUN... the hour a key lands, this is the function to run once by hand'; not imported anywhere",
  'catalogue/src/backfill-derived.ts': 'catalogue package.json "backfill:derived" script, run by hand',
  'catalogue/src/build-lexicon.ts': 'catalogue package.json "lexicon" script, run by hand',
  'catalogue/src/cli.ts': 'catalogue package.json "search" script, run by hand',
  'catalogue/src/crosslang-eval.ts': 'catalogue package.json "eval:crosslang" script, run by hand',
  'catalogue/src/embed-all.ts': 'catalogue package.json "embed" script, run by hand',
  'catalogue/src/gaps-from-scans.ts': 'run only via `node src/gaps-from-scans.ts` by hand per its own header; never imported by live code',
  'catalogue/src/implied-reference.ts': 'catalogue package.json "implied-reference" script, run by hand',
  'catalogue/src/load.ts': 'catalogue package.json "load" script, run by hand',
  'catalogue/src/size-fill.ts': "guards its own main() behind `process.argv[1].endsWith('size-fill.ts')`; never imported by live code",
};

test('process.env.<NAME> appears in live code only inside settings/src/index.ts or a listed exception', () => {
  const files = liveFiles(
    root,
    ['app/server.ts', 'app/src', 'identify/src', 'price/src', 'catalogue/src', 'spine/src'],
    [settingsPath, ...Object.keys(ALLOWED_EXCEPTIONS)],
  );
  const hits = findNamedProcessEnvReads(root, files);
  assert.deepEqual(
    hits.map((h) => `${h.path}:${h.line} process.env.${h.name}`),
    [],
    'A named process.env read sits outside settings/src/index.ts and outside the allowed-exceptions list in this test. ' +
      'Either move it through the module, or add it to ALLOWED_EXCEPTIONS with a reason.',
  );
});

test('every listed exception file still exists and still is not reachable from settings/src/index.ts itself', () => {
  // A guard against the exceptions list rotting: if a file was deleted, its
  // entry should be deleted with it, not carried as make-believe coverage.
  for (const path of Object.keys(ALLOWED_EXCEPTIONS)) {
    const files = liveFiles(root, [path], []);
    assert.ok(files.length > 0, `${path} is listed as an exception but no longer exists -- delete its entry`);
  }
});
