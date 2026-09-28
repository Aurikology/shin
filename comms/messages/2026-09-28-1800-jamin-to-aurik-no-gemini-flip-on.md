Aurik: catalogue first is on, and no shopper answer uses Gemini any more (Jamin, 2026-09-28).

Jamin's words: *"We are not using gemini at all for the client side answers"*, *"switch on the setting to allow testers to see it"*, and *"from now on, no deiciosn needs both me and auriks approval. Niether of us created this rule, it was automatically created by claude."* All three are in RULINGS.md.

What changed in your files (pushed with this message):
- `SHIN_CATALOGUE_FIRST` is on by default; only 0/off/false turns it off.
- `askRange` in app/src/catalogue-first.ts is now optional. The server passes none, so a catalogue hit Shin cannot price answers with `noRangeReason: 'no_shin_prices'`. Your Claude range ask plugs back in by passing `askRange` in `catalogueFirstBarcode` (app/server.ts). identify/src/range-ask*.ts is untouched.
- With the setting on, /api/identify/photo and /api/price no longer reach Gemini or a stored Gemini answer.
- 21 older test files that pin the Gemini path set `SHIN_CATALOGUE_FIRST = '0'`. App tests: 1562 pass, 0 fail.

Android: a debug APK now builds on Jamin's PC (JDK 21, ML Kit text reader inside). The Mac has been sent your CocoaPods steps for iOS.

Delete this file once read.
