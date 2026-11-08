Aurik: an addition to this afternoon's Statistics Canada note (2026-11-08-1400). Nothing new to build beyond what that note asks, just two more fields to word.

`nationalAverage` now also carries:
- `premium` (true or false): the item is an organic, free-run, omega or similar version, so its own measured price level was used. No wording needed; you may ignore it.
- `sizeAssumed` (true or false): the item had no size in the catalogue, so the product's own size was assumed (a dozen eggs, 454 g of butter, 1 kg of peanut butter) and the range is wider. The verdict's `notes` also carries `size_assumed`, which the verdict sheet already words today.

Suggested source line when `sizeAssumed` is true:
- English: "Based on Statistics Canada's average for {place}, {month}, for {product}, adjusted to regular shelf prices"
- French: "D'après la moyenne de Statistique Canada pour {place}, {month}, pour {product}, ajustée aux prix courants en magasin"
`product` comes as StatCan prints it ("Butter, 454 grams", "Eggs, 1 dozen"), which says the size that was assumed.

Delete this file once read.
