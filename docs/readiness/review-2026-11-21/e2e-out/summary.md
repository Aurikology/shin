# Phone end-to-end run against https://relay.anjiawenda.com

**FAIL: 1 of 28 steps**, 2026-11-21T16:08:00.144Z, app from C:\shin

Negative control: caught (a disallowed header on every API call was reported as a failure).

| Combination | Step | Result | API calls | Detail |
|---|---|---|---|---|
| claude-yes.location-on.en | fresh install: first screen | PASS | 8 | on camera |
| claude-yes.location-on.en | scan a known barcode (0068100084245) | FAIL | 3 | console: Access to fetch at 'https://relay.anjiawenda.com/api/event' from origin 'https://localhost' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resourc; POST /api/event never completed (net::ERR_FAILED); blocked POST /api/event (321 B body): MissingAllowOriginHeader; the answer was 502 from cloudflare (cf-ray), no allow-origin (warnings: console.error: Failed to load resource: net::ERR_FAILED) |
| claude-yes.location-on.en | typed search "oreo" | PASS | 3 | ended on sheet.padsheet[unknown] |
| claude-yes.location-on.en | typed search "cheerois" | PASS | 2 | ended on sheet.padsheet[unknown] |
| claude-yes.location-on.en | typed search "kraft dinner original 225g" | PASS | 2 | ended on sheet.padsheet[unknown] |
| claude-yes.location-on.en | typed search "zzqxwv" | PASS | 2 | ended on sheet.padsheet[unknown] |
| claude-yes.location-on.en | every button on Scan, Saved and You | PASS | 41 | 40 controls tapped |
| claude-yes.location-on.en.returning | returning user opens the app | PASS | 5 | on camera |
| claude-yes.location-on.en.returning | scan an unknown barcode (0064100111998) | PASS | 4 | ended on sheet.textroute[unknown] (warnings: console.error: scan ended with no name: {code: 0064100111998, reasons: Array(2)}) |
| claude-yes.location-on.en.returning | typed search "oreo" | PASS | 3 | ended on sheet.working[unknown] |
| claude-yes.location-on.en.returning | typed search "cheerois" | PASS | 3 | ended on sheet.candidates.typedpick[unknown] |
| claude-yes.location-on.en.returning | typed search "kraft dinner original 225g" | PASS | 2 | ended on sheet.candidates.typedpick[unknown] |
| claude-yes.location-on.en.returning | typed search "zzqxwv" | PASS | 4 | ended on sheet.catalogue[unknown] |
| claude-yes.location-on.en.returning | every button on Scan, Saved and You | PASS | 44 | 36 controls tapped |
| claude-no.location-off.en | fresh install: first screen | PASS | 8 | on camera |
| claude-no.location-off.en | scan a known barcode (0068100084245) | PASS | 2 | ended on sheet.padsheet[unknown] |
| claude-no.location-off.en | typed search "oreo" | PASS | 2 | ended on sheet.padsheet[unknown] |
| claude-no.location-off.en | typed search "cheerois" | PASS | 2 | ended on sheet.padsheet[unknown] |
| claude-no.location-off.en | typed search "kraft dinner original 225g" | PASS | 2 | ended on sheet.padsheet[unknown] |
| claude-no.location-off.en | typed search "zzqxwv" | PASS | 3 | ended on sheet.padsheet[unknown] |
| claude-no.location-off.en | every button on Scan, Saved and You | PASS | 41 | 40 controls tapped |
| claude-no.location-off.en.returning | returning user opens the app | PASS | 5 | on camera |
| claude-no.location-off.en.returning | scan an unknown barcode (0064100111998) | PASS | 3 | ended on sheet.textroute[unknown] |
| claude-no.location-off.en.returning | typed search "oreo" | PASS | 2 | ended on sheet.candidates.typedpick[unknown] |
| claude-no.location-off.en.returning | typed search "cheerois" | PASS | 2 | ended on sheet.candidates.typedpick[unknown] |
| claude-no.location-off.en.returning | typed search "kraft dinner original 225g" | PASS | 3 | ended on sheet.candidates.typedpick[unknown] |
| claude-no.location-off.en.returning | typed search "zzqxwv" | PASS | 4 | ended on sheet.working[unknown] |
| claude-no.location-off.en.returning | every button on Scan, Saved and You | PASS | 43 | 36 controls tapped |
