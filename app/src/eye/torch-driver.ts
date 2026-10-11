/**
 * The torch, as hardware.
 *
 * `torch.ts` decides (a pure function of the frame brightness and the user's
 * setting). This file does: it owns the one piece of state that has to match a
 * real LED, and it is the only place that calls `applyConstraints` for it.
 *
 * Jamin, 2026-10-10: "the flash system is broken on the app". Found by driving
 * the real screen with a stubbed video track (docs and tests in
 * `test/torch-driver.test.ts`):
 *
 *   1. `applyConstraints({advanced:[{torch}]})` RESOLVES on a phone with no
 *      torch (an unsatisfiable `advanced` constraint is skipped, never
 *      rejected), so the old code latched the icon, brightened the feed and
 *      said "Torch on." with the light off. Support is now read from
 *      `getCapabilities().torch` first.
 *   2. Auto mode called the hardware on every frame until the first call came
 *      back: four to five stacked calls on a healthy phone, 150 in three
 *      seconds on one that refuses. One call at a time, and a refusal is final.
 *   3. A tap on the button lost to the app: auto switched a manual torch off
 *      in any lit aisle, switched it straight back on after the shopper turned
 *      it off in the dark, and the glare rule put out a torch the shopper had
 *      just lit. A manual tap now wins until the next manual tap.
 *   4. A phone that drops the torch (app to the background, the camera taken
 *      by a call, the track ending) left the icon lit over a dark LED. The
 *      state is re-applied when the camera comes back, or reported off.
 *   5. On a phone with no torch, auto mode gave the shopper nothing at all. It
 *      now falls back to the too-dark line, the same as the `off` setting.
 */

import { decideTorch, normaliseTorchSetting, type TorchSetting } from './torch.ts';

/** The slice of a MediaStreamTrack the torch needs, so a test can hand in a stub. */
export interface TorchTrack {
  getCapabilities?(): object | undefined;
  applyConstraints(constraints: MediaTrackConstraints): Promise<void>;
  readonly muted?: boolean;
  readonly readyState?: string;
}

export interface TorchDriverOptions {
  /** The live video track, or null when there is none. Read at every use. */
  readonly track: () => TorchTrack | null | undefined;
  /** The real torch state changed (or was found to be wrong). */
  readonly onChange?: (on: boolean) => void;
  /** The user's setting, as storage handed it back. */
  readonly setting?: { mode?: unknown; threshold?: unknown };
}

export class TorchDriver {
  readonly #track: TorchDriverOptions['track'];
  readonly #onChange: (on: boolean) => void;
  #setting: TorchSetting;
  #on = false;
  /** The shopper's last tap: true or false once they have tapped, null before. Beats the app. */
  #pinned: boolean | null = null;
  /** The torch itself was blowing the label out, so auto keeps it off this session. */
  #blocked = false;
  /** The hardware refused once; auto does not ask again. */
  #refused = false;
  #darkSince: number | null = null;
  #tooDark = false;
  /** Hardware calls run one at a time, in the order they were asked for. */
  #queue: Promise<unknown> = Promise.resolve();
  #inFlight = 0;

  constructor(options: TorchDriverOptions) {
    this.#track = options.track;
    this.#onChange = options.onChange ?? (() => {});
    this.#setting = normaliseTorchSetting(options.setting);
  }

  /** Whether the torch is lit, as far as the hardware last said. */
  get on(): boolean {
    return this.#on;
  }

  /** The frame has stayed dark and the app is not the one lighting it. */
  get tooDark(): boolean {
    return this.#tooDark;
  }

  /**
   * Whether this camera has a torch: true, false, or null when the track cannot
   * say (no `getCapabilities`), in which case asking is the only way to find out.
   */
  get supported(): boolean | null {
    const track = this.#track();
    if (!track) return null;
    if (typeof track.getCapabilities !== 'function') return null;
    const caps = track.getCapabilities();
    if (!caps) return null;
    return (caps as { torch?: unknown }).torch === true;
  }

  /** A new setting, live. Going to `off` puts out a torch the app lit; a shopper's own stays. */
  setSetting(setting: { mode?: unknown; threshold?: unknown }): void {
    this.#setting = normaliseTorchSetting(setting);
    this.#darkSince = null;
    this.#tooDark = false;
    if (this.#setting.mode === 'off' && this.#on && this.#pinned === null) void this.#set(false);
  }

  /** The shopper tapped the button. Resolves to whether the torch is now in the state asked for. */
  set(on: boolean): Promise<boolean> {
    return this.#set(on, true);
  }

  /** One frame's mean luminance, 0 to 255, from the frame loop. */
  light(mean: number, now: number): void {
    // No torch to light (or one that refused): the shopper gets the too-dark
    // line instead, exactly as in the `off` setting.
    const noHardware = this.supported === false || this.#refused;
    const setting: TorchSetting = noHardware ? { ...this.#setting, mode: 'off' } : this.#setting;
    const decision = decideTorch({
      setting,
      mean,
      now,
      darkSince: this.#darkSince,
      torchOn: this.#on,
      blocked: this.#blocked,
    });
    this.#darkSince = decision.darkSince;
    // A lit torch on a still-dark frame has nothing more to say about the light.
    this.#tooDark = decision.tooDark && !this.#on;
    // The shopper's tap stands. And one call at a time: a frame arrives every
    // sixteen milliseconds, the hardware answers in a hundred.
    if (!decision.action || this.#pinned !== null || this.#inFlight > 0) return;
    void this.#set(decision.action === 'on');
  }

  /** How much of the target box is blown out, 0 to 1. A torch that causes it goes out, unless the shopper lit it. */
  glare(amount: number): void {
    if (!this.#on || amount < 0.2 || this.#pinned === true) return;
    this.#blocked = true;
    void this.#set(false);
  }

  /**
   * The camera came back (app foregrounded, track unmuted): a phone drops the
   * torch when it takes the camera away. Put it back, or say it is off.
   */
  resync(): Promise<void> {
    if (!this.#on) return Promise.resolve();
    const track = this.#track();
    if (track?.muted) return Promise.resolve(); // the unmute will call this again
    const next = this.#queue.then(async () => {
      if (!this.#on) return;
      const live = this.#track();
      try {
        if (!live || live.readyState === 'ended') throw new Error('track gone');
        await live.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      } catch {
        this.#on = false;
        this.#onChange(false);
      }
    });
    this.#queue = next;
    return next;
  }

  /** The track ended under us: whatever was lit is not. */
  trackEnded(): void {
    if (!this.#on) return;
    this.#on = false;
    this.#onChange(false);
  }

  /** The camera stopped; the torch went with it. No event: the screen is leaving. */
  reset(): void {
    this.#on = false;
    this.#pinned = null;
    this.#blocked = false;
    this.#darkSince = null;
    this.#tooDark = false;
  }

  #set(on: boolean, manual = false): Promise<boolean> {
    if (manual) this.#pinned = on;
    this.#inFlight += 1;
    const run = this.#queue.then(async (): Promise<boolean> => {
      const track = this.#track();
      if (!track) return this.#fail(manual);
      if (!on && !this.#on) return true;
      if (on && this.supported === false) return this.#fail(manual);
      try {
        await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      } catch {
        // Not an error the shopper hears from here: the screen decides what to say.
        return this.#fail(manual);
      }
      this.#on = on;
      this.#onChange(on);
      return true;
    });
    const settled = run.finally(() => {
      this.#inFlight -= 1;
    });
    this.#queue = settled;
    return settled;
  }

  #fail(manual: boolean): boolean {
    this.#refused = true;
    // A refused tap pins nothing: the shopper did not get what they asked for.
    if (manual) this.#pinned = null;
    return false;
  }
}
