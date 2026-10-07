/**
 * D40: the embedding model is pre-loaded at boot only when meaning search is on.
 * With it off (the shipped state: 515 thousand rows embedded is past the ceiling)
 * nothing embeds a query, and the boot pre-load logged a Protobuf load failure for
 * a model file that is damaged on this machine and not on the answer path.
 *
 * By source: standing up the real worker needs the 4 GB catalogue and a model
 * download. Run by hand against the real files, the default start logged
 * "catalogue warm did not land ... model.onnx failed: Protobuf parsing failed"
 * and the start with `{ warm: false }` logged nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SERVICE = read('../../catalogue/src/service.ts');
const SERVER = read('../server.ts');

test('D40: the service sends no warm job when told warm is false', () => {
  assert.match(SERVICE, /opts: \{ warm\?: boolean \} = \{\}/);
  assert.match(SERVICE, /opts\.warm === false \? Promise\.resolve\(undefined\) : send/);
});

test('D40: the server decides meaning search first and starts the service with that answer', () => {
  const vectors = SERVER.indexOf('vectorsOn =\n');
  const start = SERVER.indexOf('startCatalogueService(CATALOGUE_DB, { warm: vectorsOn })');
  assert.ok(vectors > 0 && start > vectors, 'the service must start after vectorsOn is known');
  assert.doesNotMatch(SERVER, /startCatalogueService\(CATALOGUE_DB\)/);
});
