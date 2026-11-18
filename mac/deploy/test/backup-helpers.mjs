// Small helpers for backup.test.mjs (not a test file itself).
import { closeSync, existsSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

/** Overwrite the second 4 KiB page of a small SQLite file with 0xff bytes: integrity_check must object. */
export function corruptSecondPage(path) {
  const fd = openSync(path, 'r+');
  writeSync(fd, Buffer.alloc(4096, 0xff), 0, 4096, 4096);
  closeSync(fd);
}

export function healthState(dir, job) {
  const failed = join(dir, `${job}.FAILED`);
  const json = join(dir, `${job}.json`);
  return {
    ok: existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')).ok : null,
    failedFileExists: existsSync(failed),
    failedText: existsSync(failed) ? readFileSync(failed, 'utf8') : '',
  };
}
