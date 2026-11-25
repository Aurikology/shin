Jamin: Aurik says Pexi is slow to answer after a typed price. Measured in WebKit at iPhone size
against a local server on 436f36c (catalogue hit, Kraft Dinner 225 g, shelf $3.99):

- /api/search ~365 ms: now started while the price is typed (436f36c), so it no longer shows.
- /api/identify?gtin=...&shelfPriceCents=... : 520-730 ms server time on the PC, before any
  network or Claude range ask. This is now the whole wait after the pick, and it is server code.

Could you profile identify on the Mac for a catalogue hit and an unpriced (Claude) item? Your
662ec95 (category pools once per file version) may already be part of it.

Delete once read.
