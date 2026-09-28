# Screenshot matcher, version 1 test (2026-09-28)

The prototype behind "Test results, version 1" in `docs/screenshot-matcher-design-2026-09-28.md`.
Python 3 with PyMuPDF; reads `data/WalmartScreenShots/*.pdf` and `catalogue/data/catalogue.db`
read-only. Every script reads and writes files in this folder.

1. `OUT=walmart-rows.json python extract.py`: stage 1, one row per product link in the PDFs.
2. `python pipeline.py [sku ...]`: stages 3 and 4, writes `stage3.json` and `stage4.json`.
3. `python make_review.py`: stage 5 input, six 50-row sheets for Gemini (example: `gemini-chunk-example.txt`);
   Gemini's replies are in `gemini-answers/`, with `letters.json` mapping each letter back to a barcode.
4. `python evaluate.py truth.json`: scores stages 3 and 4 on the 20 tuning products.
5. `python score_all.py`: scores every stage on the held-out key `key-truth.jsonl` (barcodes read
   from walmart.ca product pages in Chrome; the product list is `key-urls.txt`).
