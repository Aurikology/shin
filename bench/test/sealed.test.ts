import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_GIT } from './fixture.ts';
import { applyGuard, createSealed, guardSealed, loadSealed, logPathFor, readLog } from '../src/sealed.ts';

function withTmp(fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'bench-sealed-'));
  try {
    fn(join(dir, 'sealed.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const rows = [{ key: '111' }, { key: '222' }, { key: '333' }, { key: null }];

test('no batch ever: nothing is excluded; --open-sealed refuses; an explicit path refuses', () => {
  withTmp((path) => {
    const g = guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT });
    assert.equal(g.mode, 'none');
    assert.equal(g.sha256, null);
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, openSealed: true, write: true }), /no sealed batch/);
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, explicitPath: true }), /was given but no file/);
  });
});

test('without the flag the sealed keys are removed, the file is untouched, and its sha256 is reported', () => {
  withTmp((path) => {
    createSealed(path, ['000111', '222'], 'test batch', '2026-10-01', FAKE_GIT);
    const before = readFileSync(path, 'utf8');
    const g = guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT });
    assert.equal(g.mode, 'excluded');
    assert.match(g.sha256!, /^[0-9a-f]{64}$/);
    assert.deepEqual(applyGuard(rows, g).map((r) => r.key), ['333', null]);
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});

test('opened once: stamped and logged before scoring, only sealed keys scored, a second opening refuses', () => {
  withTmp((path) => {
    createSealed(path, ['111', '222'], 'test batch', '2026-10-01', FAKE_GIT);
    const g = guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, openSealed: true, write: true, note: 'first look', now: () => '2026-11-01T00:00:00.000Z' });
    assert.equal(g.mode, 'opened');
    assert.deepEqual(applyGuard(rows, g).map((r) => r.key), ['111', '222']);
    assert.deepEqual(loadSealed(path)!.opened, { on: '2026-11-01T00:00:00.000Z', note: 'first look' });
    assert.deepEqual(readLog(path).map((e) => e.event), ['created', 'opened']);
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, openSealed: true, write: true }), /already opened on 2026-11-01/);
    assert.equal(guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT }).mode, 'excluded');
  });
});

test('--open-sealed with --no-write is refused, and does not count as the opening', () => {
  withTmp((path) => {
    createSealed(path, ['111'], 'a', undefined, FAKE_GIT);
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, openSealed: true, write: false }), /no-write/);
    assert.equal(loadSealed(path)!.opened, null);
    assert.equal(guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, openSealed: true, write: true }).mode, 'opened');
  });
});

test('erasing the opened stamp by hand is caught', () => {
  withTmp((path) => {
    createSealed(path, ['111'], 'a', undefined, FAKE_GIT);
    guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, openSealed: true, write: true });
    const b = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...b, opened: null }, null, 2) + '\n');
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT }), /edited after its last logged event/);
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, openSealed: true, write: true }), /edited/);
  });
});

test('editing the keys by hand is caught', () => {
  withTmp((path) => {
    createSealed(path, ['111', '222'], 'a', undefined, FAKE_GIT);
    const b = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...b, keys: ['111'] }, null, 2) + '\n');
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT }), /edited/);
  });
});

test('editing, dropping or forging a log line is caught', () => {
  withTmp((path) => {
    createSealed(path, ['111'], 'a', undefined, FAKE_GIT);
    guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT, openSealed: true, write: true });
    const lines = readFileSync(logPathFor(path), 'utf8').trim().split('\n');
    // Drop the "opened" line and restore the pre-opening file: the chain still verifies, but the file hash does not match.
    writeFileSync(logPathFor(path), lines[0] + '\n');
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT }), /edited/);
    // A line whose content was changed does not verify.
    const e = JSON.parse(lines[1]!);
    writeFileSync(logPathFor(path), lines[0] + '\n' + JSON.stringify({ ...e, on: '2020-01-01' }) + '\n');
    assert.throws(() => readLog(path), /does not verify/);
    // An appended line with a wrong prev does not verify.
    writeFileSync(logPathFor(path), lines.join('\n') + '\n');
    appendFileSync(logPathFor(path), JSON.stringify({ ...e, prev: 'x' }) + '\n');
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT }), /does not verify/);
  });
});

test('a batch file deleted after creation refuses at its path, and cannot be re-created there', () => {
  withTmp((path) => {
    createSealed(path, ['111'], 'a', undefined, FAKE_GIT);
    unlinkSync(path);
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT }), /its file is gone/);
    assert.throws(() => createSealed(path, ['999'], 'b', undefined, FAKE_GIT), /already created/);
  });
});

test('a batch file written by hand, with no log, is refused', () => {
  withTmp((path) => {
    writeFileSync(path, JSON.stringify({ created: 'x', note: '', keys: ['1'], opened: null }));
    assert.throws(() => guardSealed(path, { configuredPath: path, noSealed: true, git: FAKE_GIT }), /no log/);
  });
});

test('a sealed batch is never replaced in place', () => {
  withTmp((path) => {
    createSealed(path, ['111'], 'a', undefined, FAKE_GIT);
    assert.throws(() => createSealed(path, ['999'], 'b', undefined, FAKE_GIT), /already exists/);
  });
});

test('a guard not issued by guardSealed is refused', () => {
  assert.throws(() => applyGuard(rows, { mode: 'none', sha256: null }), /not issued/);
});
