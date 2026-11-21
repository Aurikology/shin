/**
 * DRAIN, DON'T KILL. Every deploy restarts the server with `launchctl kickstart -k`, which sends
 * SIGTERM and, after the job's ExitTimeOut, SIGKILL. With no handler the process died on the spot:
 * a shopper's scan that was half answered got a dropped connection, and a database write in flight
 * was cut. This module is the handler's whole logic, kept apart from server.ts so a test can start a
 * real server, send it SIGTERM and watch a slow request still finish.
 *
 * The order: stop accepting new connections; let the requests already in flight finish (up to
 * `graceMs`, 8 seconds in server.ts, under launchd's ExitTimeOut of 15); then force-close whatever is
 * left, close the databases cleanly, and exit 0. A second signal while draining does nothing: the
 * drain is already as fast as it will safely go.
 */
import type { Server } from 'node:http';

export interface ShutdownOptions {
  /** Every listener to stop (the IPv4 and the IPv6 loopback servers). */
  readonly servers: readonly Server[];
  /** How long in-flight requests get before their sockets are cut. */
  readonly graceMs: number;
  /** Run once, after the servers are closed, each in its own try: a failing one never blocks the rest. */
  readonly closers: readonly (() => void)[];
  readonly exit: (code: number) => void;
  readonly log?: (message: string) => void;
}

export function createShutdown(opts: ShutdownOptions): (signal: string) => Promise<void> {
  let started = false;
  const log = opts.log ?? (() => {});
  return async (signal: string): Promise<void> => {
    if (started) return;
    started = true;
    log(`${signal}: no new connections; letting requests in flight finish (up to ${opts.graceMs} ms).`);
    const closed = opts.servers.map(
      (s) =>
        new Promise<void>((resolve) => {
          if (!s.listening) return resolve();
          s.close(() => resolve());
        }),
    );
    // Keep-alive sockets that are idle would hold close() open; sweep them until the servers are done.
    const sweep = setInterval(() => {
      for (const s of opts.servers) s.closeIdleConnections();
    }, 50);
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, opts.graceMs);
    });
    await Promise.race([Promise.all(closed), limit]);
    clearTimeout(timer);
    clearInterval(sweep);
    if (timedOut) {
      log(`${opts.graceMs} ms passed with requests still open; cutting them.`);
      for (const s of opts.servers) s.closeAllConnections();
    }
    for (const close of opts.closers) {
      try {
        close();
      } catch (err) {
        log(`a database did not close cleanly: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    log('drained; exiting.');
    opts.exit(0);
  };
}
