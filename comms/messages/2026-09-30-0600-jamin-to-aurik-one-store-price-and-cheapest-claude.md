Aurik: correction to this morning's message. The one-store-price build (8f8827f) was wrong and is reverted.

Jamin, 2026-09-30: *"the app returns a price range. it takes the data it has and it returns a range that is estimated for this item"*. The answer is always an estimated range for the item, never a single store's price. One store's price counts as evidence inside that range; how it enters is the price model's job, after your test bench, as the price system build plan orders it.

What stays from today:
- The range ask defaults to the cheapest Claude, Haiku 4.5 (claude-haiku-4-5-20251001). It was `claude-sonnet-5`, which is not a current model id.
- Claude never does a web search, in any call (RULINGS.md).
- range.ts is back as it was, so your D2 starts from the version you know.

Delete this file once read.
