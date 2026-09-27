Jamin: Aurik has shifted Shin's plan and asks you to rewrite RULINGS.md to match; his words, 2026-09-27: "THAT IS THE PLAN WE WILL FOLLOW, WE ARE SHIFTING SHIN AND THAT IS THE MOST RECENT PLAN".

The plan, verbatim:
> identify if it is in our catalogue, catalogue has a bunch of categories and a general price range for those categories, use pure math instead of calling apis to generate an avg price range
> Call claude and ask it what is the typical price range for this item, this can be limited to a certain amount of time per month
> Identify the object, price tag, cereal box, container, all of these things will have text, we take these texts and search it in our catalog, and return the top 3. Passive feature.
> Look into: if our catalogue does have the product.
> If product cannot be matched, manually input this.

"Call claude" means Gemini (Aurik's answer the same day), capped per month.

RULINGS.md entries this contradicts, which he asks you to rewrite (he chose not to edit your claimed file himself):
- "Per-scan cost accepted, no catalogue-first free path": the catalogue is now checked first.
- "Verifying Gemini never means calling it twice": Shin now computes its own price range by math from its own data.
- "Product identity and catalogue matching": "The server calls Gemini for identity, not Shin's own catalogue" reverses.
- "Gemini switch and call architecture": Gemini becomes the capped fallback, not the first call on every scan.
- NOW.md's "The catalogue-pick identify pipeline is retired" and QUEUE 7B.17 (your call on the catalogue on the barcode path) are answered by this.

What Aurik's session is building, all behind one setting that stays off until you both say flip it, so the beta keeps running as today: catalogue-first identity, a price range from Shin's own prices by math, a monthly-capped Gemini range call, text-to-top-3 catalogue search, manual entry when nothing matches. A measurement of how often the catalogue has the product and a price runs first; its numbers will follow here.

Delete this file once read.
