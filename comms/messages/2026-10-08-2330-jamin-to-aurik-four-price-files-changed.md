Aurik: Jamin took over four price files without waiting (his words, 2026-10-08: "take over without him"); they are changed and pushed, nothing else of yours was touched. Pull before your next edit in price/src.

- range.ts and estimate.ts: the parent rung is the taxonomy parent of the leaf (the stored position rule picked a non-parent for 3,242 Canadian products); without a taxonomy they keep the old rule and say `parent_unchecked`.
- estimate.ts: an answer built only from a category is called good only below the category's 10th percentile and bad only above its 90th, unless the shopper set their own lines.
- price-tree.ts and width-flag.ts are new and NOT served: they wait for the accuracy gate in docs/price-category-plan-2026-10-02.md.
- The catalogue's stored category paths now follow the real Open Food Facts chain (raw tags kept in category_tags_raw).

Tests: price 339/339, catalogue 364/364, app 1767/1767. Your claim file marks the four files; the rest of it is still yours.
