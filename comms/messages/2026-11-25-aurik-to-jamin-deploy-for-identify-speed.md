Jamin: please deploy main to the Mac server; your 662ec95 already fixed the typed-price wait (D-284).

Measured on Aurik's PC, local server on 63af2b0, /api/identify for a catalogue hit (Kraft Dinner,
shelf $3.99): 77, 26, 35 ms. On 436f36c the same call was 520 to 730 ms. A barcode not in the
catalogue still takes about 1.6 s (the live Open Food Facts lookup); that is the next slowest path
if you want it.

Also new from Aurik's side (ac55830): the camera shows "N of 10 free scans left" from /api/quota on
every camera open and after every counted scan, so /api/quota now gets one call per camera visit.
Hidden when the server sets no limit.

Delete once read.
