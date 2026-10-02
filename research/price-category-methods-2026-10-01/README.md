# Methods for the price category requirements, 2026-10-01

His words, 2026-10-01: *"Now resesarch method for how to achieve each of these requiremnts"*, of
docs/price-category-requirements-2026-10-01.md (the reference, RULINGS.md "The price category
requirements are the reference").

Research only: nothing here is built or chosen. Four Sonnet research workers, one per pair of
sections, each giving 1 to 3 methods per requirement with a URL, evidence, fit to Shin's data size,
and the pass test run with it, sources marked opened / search summary / unverified.

| File | Requirements |
|---|---|
| methods-categories-and-placement.md | 1.1 to 1.8, 2.1 to 2.4 |
| methods-item-range-and-accuracy.md | 3.1 to 3.9, 7.1 to 7.8 |
| methods-intake-and-customer-data.md | 4.1 to 4.8, 5.1 to 5.8 |
| methods-claude-answers-and-limits.md | 6.1 to 6.7, 8.1 to 8.4 |
| taxonomies-and-prior-art.md | category trees (Open Food Facts, GS1 GPC, Google), pooling, conformal |

## Checked by the coordinator, not on the workers' word

- 7.1 as written ("within 5 points in every category with 30+ test items"): a perfectly calibrated
  80% range lands within 5 points on 30 items with probability 0.506 (binomial, computed), so it fails
  a correct system about half the time per category.
- 2.2 as written (95%+ on 50 hand-checked items): 48 of 50 right has a one-sided 95% lower bound of
  0.879 (Clopper-Pearson, computed); proving 95% with zero errors needs 59 items.
- Claude per-call cost, about $0.0006 at 300 input and 60 output tokens on Haiku 4.5 ($1 / $5 per
  million): the worker's arithmetic, re-done here; not measured.

## Requirement problems the research found (his call; requirements unchanged)

1. 7.1's per-category tolerance and 2.2's sample size cannot tell a passing system from a failing one
   (above).
2. 6.6 (offline Gemini Pro seeding of empty categories) against 8.3 (no Gemini output in any shopper
   answer): a seeded range a shopper sees is Gemini output. Both are his words.
3. 1.1 (exactly one category at every level) against 2.3 (place only as deep as sure); and 2.1 is met
   trivially if placement may stop at the root.
4. 3.3 (no all-of-Shin median) against the built verdict ladder's last rung, global_prior.
5. 4.8 (no source without a licence) would stop today's hand-saved Walmart pages; Project Hammer
   states no licence.
6. 5.3: fake accounts can corroborate each other unless "independent" is defined.
7. 5.1 / 5.6: store plus time can identify a person even without GPS.
8. 5.8: a shopper who sees the verdict first is not giving an independent call.
9. 7.5 and the sale filters cannot run yet: no Ontario grocery rows, and no item has prices on repeat
   dates.
