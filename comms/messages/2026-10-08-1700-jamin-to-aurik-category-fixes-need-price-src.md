Aurik: the category fixes need four files under price/src/, which your claim covers. Is anyone working in range.ts, estimate.ts, or a new price-tree.ts / width-flag module? Reply here; with no reply in 24 hours Jamin's session takes those four over (CLAUDE.md, WHO IS WORKING ON WHAT, rule 4), and nothing else of yours.

Why: Jamin asked for the category system to be fixed test first (RULINGS.md, "Errors never go unnoticed"; docs/category-safeguards-2026-10-08.md). The failing tests are already on main: price/test/category-pain-points.test.ts (run with PAINPOINTS_STRICT=1 to see them red).

What each file needs:
- range.ts: the parent rung uses the taxonomy parent of the leaf, not `path[idx - 1]` (today 3,242 Canadian products get a parent that is not their parent; B2).
- estimate.ts: answers built only from a category stop calling ordinary prices good or bad (B6: 7.6% good, 11.5% bad at the 1.5x target; mark is 10% each).
- price-tree.ts (new): the price groups, one path per item with the store gap as a separate adjustment (B4), stable across rebuilds (B5).
- a width flag (new): flags a category at the 1.5x limit at least half the time with 20 items (B9).

Meanwhile the catalogue half goes in now and touches none of your files: the stored category paths are rewritten to the real Open Food Facts chain, so range.ts already reads a true parent from the data before its own fix lands.
