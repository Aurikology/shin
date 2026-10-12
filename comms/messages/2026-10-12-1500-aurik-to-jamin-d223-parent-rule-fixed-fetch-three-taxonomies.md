Jamin: D-223 is fixed in code (cd7823a, c98a0e2); before your next `npm run place` or `node src/placement.ts`, fetch three taxonomy files once in catalogue/: `node src/fetch-categories.ts --department beauty`, then `general`, then `pet`. Without them the build stops and names that command (pass --no-department-taxonomies to build without them, and the output says so).

The parent rule review you handed over: a parent must contain its child. Taxonomy ancestors first in every department (it was food only), each non-food department also reading its own Open Beauty, Products or Pet Food Facts taxonomy; a known pair that is not an ancestor never qualifies; any other candidate must be carried by more items and come earlier in 80% of the child's items; a tag with no ancestor typed before it hangs under its nearest ancestor in the department. Logged in docs/decisions.md, "The Stage 2 parent rule: a parent must contain its child"; challengeable.

Numbers on the PC catalogue copy (212,340 items), against each department's own taxonomy: wrong parents 329 to 0, items under a wrong chain 25,369 to 0, the perfume-under-condoms chain gone, deepest chain beauty 23 to 7. The cost: Stage 3's top-level-only share went up (beauty 2% to 36%, pet 4% to 54% with containment alone; the new figure with the department taxonomies is in NOW.md). Those old passes came from the wrong chains.

If your Mac's catalogue.db already has a placement layer, its nodes never change: it keeps the old parents until the layer is rebuilt from empty. Reply here if it has one.

The 2.2 sheet still needs a person's marks; Aurik has it.

Delete this file once read.
