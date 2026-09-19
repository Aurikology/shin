/**
 * The barcode vote: a shift register of recent frames.
 *
 * Jamin, 2026-09-17: "The barcode should be automatically read out of every
 * single frame. However, it does not automatically pop up the results." and
 * "The frames should act like a shift register, the user might point it at a
 * barcode and decide they want to point it at another instead." and "Not all
 * frames will agree when scanning barcode, so set a bar where the majority of
 * frames agree".
 *
 * WHAT A FRAME IS HERE. Every decode pass is one entry, INCLUDING a pass that
 * found nothing. That is the point of "majority of frames": a code that
 * decodes on four frames out of ten has not agreed with itself, and counting
 * only the frames that decoded would call it unanimous.
 *
 * THE WINDOW SLIDES. Entries older than `windowMs` fall off the far end as new
 * ones arrive. Point at a different barcode and its share climbs while the old
 * one's decays, so the leader changes without anything being reset and without
 * the shopper doing anything. The leader only changes when another value has
 * strictly more frames, so two codes at equal share do not flip the focus on
 * every frame.
 *
 * NOTHING HERE EMITS A RESULT. `confirmed()` says a value has a majority; it
 * is the screen's button that turns that into a read, and the press is the only
 * thing that does. This file has no callback and no event on purpose.
 *
 * Pure: no DOM, no clock of its own (every method takes `now`), no zxing. That
 * is what lets the test drive a hundred frames in a millisecond.
 */

export interface VoteBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One barcode seen on one frame. */
export interface Sighting {
  readonly value: string;
  readonly format: string;
  readonly box: VoteBox | null;
}

export interface VoteTrack {
  readonly value: string;
  readonly format: string;
  /** Where it was on the most recent frame that saw it. */
  readonly box: VoteBox | null;
  /** How many frames in the window saw it. */
  readonly frames: number;
  /** Frames in the window, seen or not. */
  readonly total: number;
  /** The one the button would send: the leader of the window. */
  readonly focused: boolean;
  /** Focused AND holding a majority for long enough. The button shows for this one. */
  readonly confirmed: boolean;
  readonly lastSeen: number;
}

export interface VoteOptions {
  /** How much history counts, in ms. The notes say 1 to 2 seconds. */
  readonly windowMs?: number;
  /** The window has to span at least this long before anything is confirmed. */
  readonly minSpanMs?: number;
  /** Share of frames that must contain the value. Strictly more than this. */
  readonly majority?: number;
  /** Fewest frames in the window before a majority means anything. */
  readonly minFrames?: number;
  /** How long a code stays drawn after the last frame that saw it. */
  readonly lingerMs?: number;
}

export const VOTE_DEFAULTS = {
  windowMs: 1500,
  minSpanMs: 1000,
  majority: 0.5,
  minFrames: 5,
  lingerMs: 500,
} as const;

interface Entry {
  at: number;
  seen: Map<string, Sighting>;
}

export class BarcodeVote {
  readonly #windowMs: number;
  readonly #minSpanMs: number;
  readonly #majority: number;
  readonly #minFrames: number;
  readonly #lingerMs: number;
  #entries: Entry[] = [];
  #focus: string | null = null;

  constructor(options: VoteOptions = {}) {
    this.#windowMs = options.windowMs ?? VOTE_DEFAULTS.windowMs;
    this.#minSpanMs = options.minSpanMs ?? VOTE_DEFAULTS.minSpanMs;
    this.#majority = options.majority ?? VOTE_DEFAULTS.majority;
    this.#minFrames = options.minFrames ?? VOTE_DEFAULTS.minFrames;
    this.#lingerMs = options.lingerMs ?? VOTE_DEFAULTS.lingerMs;
  }

  /** One decode pass. Pass an empty array for a frame that found nothing. */
  push(now: number, sightings: readonly Sighting[]): void {
    const seen = new Map<string, Sighting>();
    for (const s of sightings) if (s.value) seen.set(s.value, s);
    this.#entries.push({ at: now, seen });
    this.#prune(now);
  }

  /** Every barcode seen recently enough to still be drawn, the focused one first. */
  tracks(now: number): VoteTrack[] {
    this.#prune(now);
    const total = this.#entries.length;
    if (total === 0) return [];

    const count = new Map<string, number>();
    const last = new Map<string, { at: number; s: Sighting }>();
    for (const e of this.#entries) {
      for (const [value, s] of e.seen) {
        count.set(value, (count.get(value) ?? 0) + 1);
        last.set(value, { at: e.at, s });
      }
    }

    // Leader by frames. The current focus keeps it on a tie; otherwise the most
    // recently seen wins, so a code that has just arrived beats one that has
    // just left at equal share.
    // Only codes still in view can lead. A code that has left the frame keeps
    // its old frames in the window for a moment, and letting it hold the focus
    // would make the shopper wait for its share to decay before the new code
    // they have pointed at could be the one the button sends.
    let leader: string | null = null;
    for (const [value, n] of count) {
      if (now - (last.get(value)?.at ?? 0) > this.#lingerMs) continue;
      if (leader === null) { leader = value; continue; }
      const best = count.get(leader) ?? 0;
      if (n > best) leader = value;
      else if (n === best && leader !== this.#focus && value === this.#focus) leader = value;
      else if (n === best && leader !== this.#focus && (last.get(value)?.at ?? 0) > (last.get(leader)?.at ?? 0)) leader = value;
    }
    this.#focus = leader;

    const spanOk = this.#entries[total - 1].at - this.#entries[0].at >= this.#minSpanMs;
    const out: VoteTrack[] = [];
    for (const [value, n] of count) {
      const seenLast = last.get(value)!;
      if (now - seenLast.at > this.#lingerMs) continue;
      const focused = value === leader;
      out.push({
        value,
        format: seenLast.s.format,
        box: seenLast.s.box,
        frames: n,
        total,
        focused,
        confirmed: focused && spanOk && total >= this.#minFrames && n / total > this.#majority,
        lastSeen: seenLast.at,
      });
    }
    out.sort((a, b) => Number(b.focused) - Number(a.focused) || b.frames - a.frames);
    return out;
  }

  /** The leading track, whether or not it has earned the button. Null when nothing is in view. */
  focus(now: number): VoteTrack | null {
    return this.tracks(now).find((t) => t.focused) ?? null;
  }

  /** The value the button would send, or null. This is the whole of "the button is showing". */
  confirmed(now: number): VoteTrack | null {
    const f = this.focus(now);
    return f && f.confirmed ? f : null;
  }

  reset(): void {
    this.#entries = [];
    this.#focus = null;
  }

  #prune(now: number): void {
    const cutoff = now - this.#windowMs;
    let i = 0;
    while (i < this.#entries.length && this.#entries[i].at < cutoff) i += 1;
    if (i > 0) this.#entries.splice(0, i);
  }
}
