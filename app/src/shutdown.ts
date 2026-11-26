/**
 * DRAIN, DON'T KILL. Every deploy restarts the server with `launchctl kickstart -k`, which sends
 * SIGTERM and, after the job's ExitTimeOut, SIGKILL. With no handler the process died on the spot:
 * a shopper's scan that was half answered got a dropped connection, and a database write in flight
 * was cut. This module is the handler's whole logic, kept apart from server.ts so a test can start a
 * real server, send it SIGTERM and watch a slow request still finish.
 *
 * The order: stop accepting new connections; close idle keep-alive connections; let the requests
 * already in flight finish (up to `graceMs`, 20 seconds by default in server.ts, under launchd's
 * ExitTimeOut of 30); then close the databases and exit 0. If the deadline passes with requests still
 * open, or a second signal arrives while draining, the open sockets are cut, the databases are still
 * closed, one console.error line names how many requests were open, and the exit code is 1.
 */
import type { Server } from 'node:http';

// 12 s: the installed launchd ExitTimeOut is still 15 (the 30 in mac/launchd needs an admin reload), so the drain must finish first.
export const DEFAULT_GRACE_MS = 12_000;

/** The grace period: SHIN_DRAIN_MS when it is a positive number of milliseconds, else 12 s. */
export function graceFromEnv(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.SHIN_DRAIN_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRACE_MS;
}

export interface ShutdownOptions {
  /** Every listener to stop (the IPv4 and the IPv6 loopback servers). */
  readonly servers: readonly Server[];
  /** How long in-flight requests get before their sockets are cut. */
  readonly graceMs: number;
  /** Run once, after the servers are closed, each in its own try: a failing one never blocks the rest. */
  readonly closers: readonly (() => void)[];
  readonly exit: (code: number) => void;
  readonly log?: (message: string) => void;
  /** Where the "requests still open" line goes; console.error by default. */
  readonly error?: (message: string) => void;
}

export function createShutdown(opts: ShutdownOptions): (signal: string) => Promise<void> {
  let started = false;
  let force: (() => void) | undefined;
  const log = opts.log ?? (() => {});
  const error = opts.error ?? ((m: string) => console.error(m));

  // Requests in flight, counted from the moment the shutdown is built so none is missed.
  const open = new Set<object>();
  for (const s of opts.servers) {
    s.on('request', (_req, res) => {
      open.add(res);
      res.once('close', () => open.delete(res));
    });
  }

  return async (signal: string): Promise<void> => {
    if (started) {
      // A second signal: stop waiting.
      force?.();
      return;
    }
    started = true;
    log(`${signal}: draining. No new connections; letting ${open.size} request(s) in flight finish (up to ${opts.graceMs} ms).`);
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
    for (const s of opts.servers) s.closeIdleConnections();
    let reason: 'deadline' | 'second signal' | undefined;
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        reason = 'deadline';
        resolve();
      }, opts.graceMs);
      force = () => {
        reason ??= 'second signal';
        resolve();
      };
    });
    await Promise.race([Promise.all(closed), limit]);
    clearTimeout(timer);
    clearInterval(sweep);
    let code = 0;
    if (reason) {
      code = 1;
      error(`Pexi: drain ended by ${reason} with ${open.size} request(s) still open; cutting them.`);
      for (const s of opts.servers) s.closeAllConnections();
    }
    for (const close of opts.closers) {
      try {
        close();
      } catch (err) {
        log(`a database did not close cleanly: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    log(code === 0 ? 'drained; exiting.' : 'exiting with errors.');
    opts.exit(code);
  };
}
