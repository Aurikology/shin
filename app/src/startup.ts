/**
 * One sentence and an exit, instead of a stack trace. Plan item 1i, and plan
 * item 19c names the same thing as a tester-visible defect.
 *
 * WHAT IS BROKEN TODAY. `server.listen(PORT)` has no error handler, so a port
 * that is already taken is an unhandled `error` event: Node prints
 * `Error: listen EADDRINUSE: address already in use :::4173` with a stack, a
 * `syscall`, an `errno` and a `code`, and exits non-zero. On his Mac, under a
 * process manager, that is what a restart loop looks like in a log file, and
 * the actual cause (a second copy of the server is already running) is one
 * line of nine. Every restart writes the same nine lines again.
 *
 * WHAT THIS FILE IS. Two pure functions that turn a machine state into a
 * sentence somebody can act on, and nothing else. They do not exit, do not
 * log, and do not read the environment except where they are handed it, so
 * they are testable without a subprocess and without a port.
 *
 * THE SENTENCES NAME THE FIX. "Port 4173 is already in use" is a diagnosis;
 * "stop the other copy or set PORT to a different number" is the thing the
 * person at the terminal actually needs. Every sentence here carries both.
 *
 * ON WHICH MISSING DATABASE COUNTS, which is the whole subtlety of this item.
 * This server boots with no catalogue on purpose, and says so: the screens
 * have to come up on a machine that does not have a 4.13 GB file, or nobody
 * can work on the screens. So "a missing database" cannot mean "a database
 * file that is not there", or the guard would refuse to start on every
 * development machine in the project and on the test suite. It means one of
 * two things, and both are always a mistake rather than a configuration:
 *
 *   1. A path was set whose DIRECTORY does not exist. A file that is missing
 *      inside a directory that exists is a database not copied yet. A file
 *      missing because its parent is not there is a typo, or an external
 *      volume that did not mount, and on the Mac that second one is the
 *      failure mode: the catalogue lives on a disk, the disk is not mounted,
 *      and today the server comes up and quietly answers nothing.
 *   2. A database that the operator explicitly listed as required, through
 *      SHIN_REQUIRE_DB. That is what the Mac's process manager sets, and it is
 *      how a deployment says "on this machine, a catalogue is not optional".
 *
 * Both rules leave every existing test untouched: `photo-route.test.ts` points
 * SHIN_CATALOGUE at a file that does not exist inside a directory that does,
 * on purpose, and that is case 1's exclusion written as a test somebody else
 * already wrote.
 */

import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

/** The databases this server can be pointed at, by the name the operator types. */
export const DATABASE_ENV: Readonly<Record<string, string>> = {
  catalogue: 'SHIN_CATALOGUE',
  prices: 'SHIN_PRICES',
  corrections: 'SHIN_CORRECTIONS',
  scans: 'SHIN_SCANS',
  gaps: 'SHIN_GAPS',
};

/**
 * Turns a failed `listen` into a sentence, or null when it is not a state this
 * knows how to explain.
 *
 * A null is not "fine". It means the generic branch should print the error as
 * it is, because inventing a friendly sentence for an error nobody has seen is
 * how a real cause gets hidden behind a guess.
 */
export function listenProblem(err: unknown, port: number): string | null {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === 'EADDRINUSE') {
    return `Port ${port} is already in use, so Shin did not start. Stop whatever is on it, or set PORT to a free number.`;
  }
  if (code === 'EACCES') {
    return `This account is not allowed to listen on port ${port}, so Shin did not start. Set PORT to a number above 1024.`;
  }
  if (code === 'EADDRNOTAVAIL') {
    return `The address for port ${port} is not available on this machine, so Shin did not start. Check the host it was told to bind.`;
  }
  return null;
}

export interface StartupEnv {
  readonly [key: string]: string | undefined;
}

/** Injectable so the tests do not have to build directory trees on disk. */
export interface FileFacts {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
}

export const realFiles: FileFacts = {
  exists: (path) => existsSync(path),
  isDirectory: (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
};

/**
 * Every reason this process should not start, as sentences, in the order they
 * were found. An empty array is a machine that is ready.
 *
 * It returns all of them rather than the first, because the Mac is being set
 * up once and finding out about three wrong paths one restart at a time is
 * three trips to a laptop that is deliberately never touched again.
 */
export function startupProblems(env: StartupEnv = process.env, files: FileFacts = realFiles): string[] {
  const problems: string[] = [];

  const portRaw = env.PORT;
  if (portRaw !== undefined && portRaw.trim() !== '') {
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      problems.push(`PORT is set to "${portRaw}", which is not a port number. Set it to a whole number from 0 to 65535.`);
    }
  }

  /*
   * Case 2 first, because it is the explicit one: whatever the operator listed
   * must be there as a file, no exceptions and no rules about directories.
   */
  const required = (env.SHIN_REQUIRE_DB ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');
  for (const name of required) {
    const variable = DATABASE_ENV[name];
    if (!variable) {
      problems.push(
        `SHIN_REQUIRE_DB names "${name}", which is not a database this server knows. It knows ${Object.keys(DATABASE_ENV).join(', ')}.`,
      );
      continue;
    }
    const path = env[variable];
    if (!path || path.trim() === '') {
      problems.push(`${name} was listed in SHIN_REQUIRE_DB but ${variable} is not set, so there is no file to check.`);
      continue;
    }
    if (!files.exists(path)) {
      problems.push(`The ${name} database is not at ${path}, and SHIN_REQUIRE_DB says this machine must have it.`);
    }
  }

  /*
   * Case 1: a path whose parent directory is not there. Always a typo or an
   * unmounted disk, never a database that has not been copied yet, which is
   * exactly why a missing FILE inside a directory that exists is allowed
   * through. See the header.
   */
  for (const [name, variable] of Object.entries(DATABASE_ENV)) {
    const path = env[variable];
    if (!path || path.trim() === '') continue;
    if (files.exists(path)) continue;
    const parent = dirname(path);
    if (!files.isDirectory(parent)) {
      problems.push(
        `${variable} points at ${path}, and the folder ${parent} does not exist. Check the path, or mount the disk it is on.`,
      );
    }
  }

  return problems;
}
