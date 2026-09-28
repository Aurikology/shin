/**
 * Room on the disk, and a daily ceiling on the pictures that fill it.
 *
 * D-160 (2026-09-22): one client wrote 42 MB of shutter frames in 788 ms
 * under forty made-up press ids, and nothing stopped it; at that rate a
 * 250 GB disk goes in about eighty minutes. D-162: the shelf cap was per
 * device id, and ids are free to invent, so it bought nothing against a
 * client that rotates them, and its counter never let go of a day.
 *
 * THREE BOUNDS, and each one covers a way round the others:
 *   per device per day   a stuck phone cannot take everybody's share;
 *   everybody per day    inventing device ids stops helping, because the
 *                        total is counted across all of them;
 *   free disk            whatever the counts say, nothing is written when
 *                        the disk is nearly full, so the server that also
 *                        holds the scan log keeps room to write it.
 *
 * THE COUNTER HOLDS ONE DAY. When the UTC day changes the whole thing is
 * replaced, so it never grows past one day's accepted pictures. Kept in
 * memory: a restart forgets it, which only ever lets a few more through,
 * and the disk bound still holds across a restart.
 */
import { statfsSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Below this much free space, no picture is written. */
export const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;

/** Free bytes on the disk that holds `dir`, or null when it cannot be read. */
export function freeBytes(dir: string): number | null {
  try {
    let at = resolve(dir);
    while (!existsSync(at)) {
      const up = dirname(at);
      if (up === at) return null;
      at = up;
    }
    const s = statfsSync(at);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/**
 * Is there room to write under `dir`? A disk that cannot be read answers no:
 * a picture not kept is one picture lost, a full disk is the whole server.
 */
export function diskHasRoom(dir: string, free: (dir: string) => number | null = freeBytes): boolean {
  const n = free(dir);
  return n !== null && n >= MIN_FREE_BYTES;
}

export interface DailyLimits {
  readonly perDevice: number;
  readonly total: number;
  /** Bytes accepted across all devices in a day. */
  readonly totalBytes: number;
}

export type CapVerdict = 'ok' | 'device' | 'total';

/** One day's count of accepted pictures, per device and in all. */
export class DailyCounter {
  private day = '';
  private total = 0;
  private bytes = 0;
  private perDevice = new Map<string, number>();

  readonly limits: DailyLimits;

  constructor(limits: DailyLimits) {
    this.limits = limits;
  }

  private roll(day: string): void {
    if (day === this.day) return;
    // A new day replaces the old one outright: this is the eviction.
    this.day = day;
    this.total = 0;
    this.bytes = 0;
    this.perDevice = new Map();
  }

  /** Would one more picture of `size` bytes from `device` on `day` fit? Counts nothing. */
  check(device: string, size: number, day: string): CapVerdict {
    this.roll(day);
    if (this.total >= this.limits.total || this.bytes + size > this.limits.totalBytes) return 'total';
    if ((this.perDevice.get(device) ?? 0) >= this.limits.perDevice) return 'device';
    return 'ok';
  }

  /** How many pictures this device has had accepted today. */
  used(device: string, day: string): number {
    this.roll(day);
    return this.perDevice.get(device) ?? 0;
  }

  /** Count one accepted picture. */
  add(device: string, size: number, day: string): void {
    this.roll(day);
    this.total += 1;
    this.bytes += size;
    this.perDevice.set(device, (this.perDevice.get(device) ?? 0) + 1);
  }

  /** Distinct devices held right now. For the eviction test. */
  size(): number {
    return this.perDevice.size;
  }

  reset(): void {
    this.day = '';
    this.total = 0;
    this.bytes = 0;
    this.perDevice = new Map();
  }
}
