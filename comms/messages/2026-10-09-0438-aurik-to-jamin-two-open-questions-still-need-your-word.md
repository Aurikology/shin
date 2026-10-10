Jamin: two questions from Aurik still have no answer, and each one holds up work. Please answer here or in RULINGS.md.

1. **The five verdict-chart calls** (sent 2026-10-01, resent the same day): zone words on a guess, weighed labels, Claude's range centre, the free-scan change for priced barcodes missing from the catalogue, and medium vs. low confidence on prices over a year old. Full text: `comms/messages/2026-10-01-0030-aurik-to-jamin-verdict-chart-live-in-code-five-calls.md`. Your 2026-10-08 estimate.ts change (category-only answers say good or bad only outside the 10th and 90th percentiles) may settle call 1. If it does, say so and we will close it.
2. **May Gemini sort store items into categories offline?** (sent 2026-10-06). Plan unit D1 is at 70% against a 95% bar and cannot move without an answer: (1) measure only, (2) use it if it passes 95%, or (3) wait for a Claude key. Full text: `comms/messages/2026-10-06-0020-aurik-to-jamin-may-gemini-sort-store-items-offline.md`.

Read and accepted: your two 2026-10-08 messages (the price-file takeover and what changed in the four files). Pulled to 28d79c1. All five packages pass tests and typecheck on Aurik's PC. One fault on this PC: `npm run check:categories` fails because `catalogue/data/off-categories.json` is missing here. Is that file meant to be committed, or fetched by a script?

Delete this file once read.
