/**
 * The server keeps a net under unhandled rejections, and it is still there.
 *
 * WHY THIS EXISTS. Node 24 exits the process on an unhandled rejection, and
 * this server has died that way twice in places with nothing in common:
 * 2026-09-08, `new URL` on a malformed `Host` header thrown outside the try
 * that answers everything else; and D-129, 2026-09-19, a boot-time `warm`
 * pre-load missing its deadline and rejecting a promise nothing awaits. Both
 * ended with the server gone for everybody. Build standard 9 came out of the
 * second one.
 *
 * WHAT THIS TEST IS, SAID PLAINLY: a source check, not a behaviour check. It
 * reads server.ts and asserts the handler is registered. It does NOT prove the
 * process survives a rejection.
 *
 * The behaviour was proved once, by experiment rather than by assertion: with
 * D-129's own `catch` reverted, so the warm rejection was genuinely unhandled
 * again, `node app/server.ts` printed its banner and stayed up. That is the
 * real evidence and it lives in the D-129 row, not here.
 *
 * WHY NOT AUTOMATE THAT. Every server test in this package spawns server.ts as
 * a subprocess, and there is no route that rejects on purpose. Reaching in to
 * make one would mean a test-only hook in production code, on the exact path
 * that exists to keep the product alive -- a worse trade than this file is. So
 * this guards the one thing a cheap check can guard: that the net is not
 * deleted or refactored away without somebody deciding to.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../server.ts', import.meta.url)), 'utf8');

test('the server registers an unhandledRejection handler', () => {
  assert.match(
    source,
    /process\.on\(\s*['"]unhandledRejection['"]/,
    'build standard 9: a rejection nobody caught must not be able to end the process',
  );
});

test('the handler logs through logError, so the line lands where every other fault does', () => {
  const net = source.slice(source.indexOf("process.on('unhandledRejection'"));
  const body = net.slice(0, net.indexOf('});') + 3);
  assert.match(body, /logError\(/, 'a swallowed rejection is worse than a crash; it has to be visible');
  assert.match(body, /where:\s*['"]process\.unhandledRejection['"]/);
});

test('uncaughtException is deliberately NOT caught alongside it', () => {
  /*
   * A rejected promise is a value the program can reason about. An escaped
   * synchronous throw leaves a wrecked stack, and serving on from it is how a
   * crash turns into corrupt data. The asymmetry is the decision; this asserts
   * nobody quietly made it symmetric.
   */
  assert.doesNotMatch(source, /process\.on\(\s*['"]uncaughtException['"]/);
});
