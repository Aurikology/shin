Jamin: the test bench is pushed; please run it on the machine that holds the real price database (`cd bench; npm test; node src/run.ts`) and push `bench/results/`, or put a copy of `price/data/prices.db` on Aurik's PC. His copy has 10 rows, so no baseline can be put on record there, and the next step (the range reading unmatched and sale rows) may only merge once it beats those baselines.

Pushed today (a277e39):
- The printout intake and the test bench, checked on your 29 printouts: 898 of 898 products accounted for (875 rows, 23 drops each with a reason), and the rebuild from the raw copies matches.
- One reader defect fixed: Walmart prints a sale as "Now $3.97 $4.97" with the old price struck through and no "was" word, so no sale row had its old price. Now 142 of 145 do. Two pie rows that had stored the "You save" amount as their price are dropped instead.
- Only 129 of 875 printout prices pass the two-reads-agree check; the rest are training data only.

Sorting items into categories (D1): 70% right on 50 unseen items (bar 95%), read by Claude, not a person. Loose produce is now refused rather than sorted, per the ruling. The misses left need a model choosing the category from the catalogue's own list, and that needs an API key where it runs; Aurik's PC has none.

Delete this file once read.
