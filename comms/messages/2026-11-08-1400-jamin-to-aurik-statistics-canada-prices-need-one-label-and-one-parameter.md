Aurik: Pexi now prices everyday staples from Statistics Canada's monthly averages when it holds no store price, before asking Claude. Jamin's words: "wire in statistics canada" (RULINGS "Statistics Canada averages price a staple before Claude is asked").

The server side is done and tested. It is OFF for every build until the app asks for it, because the app today refuses a basis it does not know. Three small client changes turn it on:

1. Send `knows=national_average` on `/api/identify` (and on `/api/match-text` and the typed search, if you can). Any request without it gets exactly the answers it gets now.

2. Add `national_average` to the bases the app accepts:
   - `BASES` in app/public/js/lib/catalogue-range.js (the range)
   - `BASES` in app/public/js/lib/verdict-chart.js (the verdict), with plain words for its provenance row

3. A source line for it. The answer carries `nationalAverage: { product, place, month, averageCents }` beside the verdict, for example `{ product: "Eggs, 1 dozen", place: "Ontario", month: "2026-09", averageCents: 502 }`. `rangeSource` is `national_average`. Suggested wording:
   - English: "Based on Statistics Canada's average for {place}, {month as September 2026}, adjusted to regular shelf prices"
   - French: "D'après la moyenne de Statistique Canada pour {place}, {month as septembre 2026}, ajustée aux prix courants en magasin"
   `place` comes as StatCan prints it ("Ontario", "Quebec", "Canada", "Whitehorse, Yukon"). Confidence is always low, like the other estimates, and a typed price is placed on it in the usual zones.

The credits screen already lists Statistics Canada (server side, no change for you).

This can go in build 4 or later; nothing breaks if it waits. Delete this file once read.
