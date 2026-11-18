/**
 * R17 and R67: a typed name whose lookup never reached Pexi (no signal, a server fault, a web page
 * where the answer should be) is NEVER shown as "nothing matches". It gets the same sheet the barcode
 * path gives, and Try again re-runs the typed search. These pin the wiring in the typed path of
 * screens/camera.js, the way the other camera suites pin source-level rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('../public/js/screens/camera.js', import.meta.url)), 'utf8');
const start = SRC.indexOf('async function runTypedSearch');
const typedBody = start < 0 ? '' : SRC.slice(start, start + 14000);

test('the typed search sorts a failed lookup into busy, server fault or no connection', () => {
  assert.ok(typedBody.length > 1000, 'could not find runTypedSearch');
  assert.match(typedBody, /typedBusy = isBusy\(err\)/);
  assert.match(typedBody, /typedFault = isServerFault\(err\)/);
  assert.match(typedBody, /typedOffline = !typedBusy && !typedFault/);
});

test('each of the three has its own sheet, and all three come before the "nothing matches" refusal', () => {
  const sheets = typedBody.indexOf('busySheet() : typedFault ? serverFaultSheet() : needsConnectionSheet()');
  const noMatch = typedBody.indexOf("reason: 'no_identity'");
  assert.ok(sheets > 0, 'the three sheets are not chosen in the typed path');
  assert.ok(noMatch > sheets, 'the no-match refusal is reached before the failure sheets');
});

test('Try again on a failed typed search runs the typed search again, not a barcode lookup', () => {
  assert.match(SRC, /lastLookup = \{ typed: true, text, cents, asked \}/);
  assert.match(SRC, /if \(again\.typed\) \{[\s\S]*?runTypedSearch\(again\.text, again\.cents, again\.asked/);
});
