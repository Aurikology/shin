/**
 * The design document is not allowed to state a colour value.
 *
 * `docs/design/DESIGN.md` opens by declaring itself the source for colour, and
 * for a week it was: it carried a two-theme hex table for every token. Then the
 * 2026-09-05 and 2026-09-06 palette passes moved the tokens and did not move the
 * table, and on 2026-09-11 ten of its eleven two-theme rows disagreed with the
 * file that ships. A build lane then read `--ink-faint` out of that table,
 * reported it failing contrast on every ground, changed two lines on the
 * strength of it and filed a third as a defect. Every number was three days
 * stale and the token had cleared 4.5 everywhere since the day it was fixed.
 * That is D-085, and build standard 4 is what it earned: a claim about a value
 * is computed from the declaration, never read from prose near it.
 *
 * A rule nobody can run is a rule that lasts until the next hurry, so this is
 * the runnable half. The document now owns what each token is FOR and
 * `tokens.css` owns what each token IS, and the seam between them is that the
 * document may not contain a colour literal at all.
 *
 * Why the whole file and not just section 1: the drift did not respect section
 * boundaries either. A hex in the motion table or a component note is the same
 * failure with a different heading over it.
 *
 * If you are here because this test went red: you almost certainly want to name
 * the token instead. If you genuinely need to show a value in prose, the answer
 * is still no, because the value is one `grep` away in a file that cannot be
 * wrong about itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DESIGN = fileURLToPath(new URL('../../docs/design/DESIGN.md', import.meta.url));
const TOKENS = fileURLToPath(new URL('../public/css/tokens.css', import.meta.url));

const design = readFileSync(DESIGN, 'utf8').replace(/\r\n/g, '\n');
const tokens = readFileSync(TOKENS, 'utf8').replace(/\r\n/g, '\n');

/** Every `#abc` / `#aabbcc` / `#aabbccdd` in the document, with its line number. */
function hexLiterals(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{2})?)?\b/g)) {
      out.push({ line: i + 1, value: m[0], text: line.trim().slice(0, 100) });
    }
  });
  return out;
}

test('DESIGN.md states no colour value; tokens.css is the only place a colour lives', () => {
  const found = hexLiterals(design);
  assert.deepEqual(
    found,
    [],
    `DESIGN.md contains ${found.length} colour literal(s). Name the token instead.\n` +
      found.map((f) => `  line ${f.line}: ${f.value}  in: ${f.text}`).join('\n'),
  );
});

/**
 * The other half of the same seam. The document is allowed, and expected, to
 * name tokens; it is not allowed to name one that does not exist, because a
 * reader who greps for it finds nothing and invents a value.
 */
test('every token DESIGN.md names in a token table is declared in tokens.css', () => {
  const declared = new Set([...tokens.matchAll(/^\s*--([a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
  assert.ok(declared.size > 20, 'parsed suspiciously few tokens; the parser is wrong, not the doc');

  // Only the rows of a two-column token table: `| `name` | use |`. Prose that
  // mentions a token in passing is not the contract and is not checked here.
  const named = [...design.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|/gm)].map((m) => m[1]);
  assert.ok(named.length > 5, 'found no token tables in DESIGN.md; has the format changed?');

  // A verdict state names a family (`good` -> --good, --good-on, --good-bright)
  // rather than a single declaration, so a family counts as declared when any
  // member of it is.
  const isDeclared = (name) =>
    declared.has(name) ||
    declared.has(`${name}-bright`) ||
    declared.has(`${name}-on`) ||
    [...declared].some((d) => d.startsWith(`${name}-`));

  const missing = [...new Set(named)].filter((n) => !isDeclared(n));
  assert.deepEqual(missing, [], `DESIGN.md names token(s) that tokens.css does not declare: ${missing.join(', ')}`);
});
