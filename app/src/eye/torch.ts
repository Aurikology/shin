/**
 * The torch setting, as a decision.
 *
 * Jamin, 2026-09-17: "This should be a setting the user can do. They should
 * have the option to set the torch to automatically turn on at a certain
 * brightness level (we can give a slider and the slide starts at our default
 * brightness level). Or, they can have it not automatically turn on which in
 * that case, we will give prompts on screen for when its too dark to see an
 * item".
 *
 * TWO MODES AND NOTHING ELSE.
 *   auto  the torch comes on by itself once the frame has stayed darker than
 *         the user's threshold for a moment; it goes back out when the aisle
 *         is clearly bright again. No too-dark prompt: the app is already
 *         doing something about it.
 *   off   the torch is never switched on by the app. When the frame stays
 *         darker than the threshold the screen says so, which is the only
 *         thing this mode adds.
 *
 * The threshold is a mean luminance of the scan frame on a 0 to 255 scale.
 * `DEFAULT_TORCH_THRESHOLD` is Shin's own current default, the number the
 * camera used before this was a setting, so a user who never opens the
 * setting gets the behaviour the app already had.
 *
 * Pure, and the clock comes in as an argument, so the test can walk a dark
 * aisle in a millisecond.
 */

export type TorchMode = 'auto' | 'off';

/** Mean luminance below which the aisle is too dark to read a label. Shin's default. */
export const DEFAULT_TORCH_THRESHOLD = 52;
/** How long it has to stay dark first, so a passing shadow does not flash the torch. */
export const DARK_HOLD_MS = 700;
/** The slider's ends. Below 10 nothing is ever dark; above 120 a lit shop counts as dark. */
export const TORCH_THRESHOLD_MIN = 10;
export const TORCH_THRESHOLD_MAX = 120;

export interface TorchSetting {
  readonly mode: TorchMode;
  readonly threshold: number;
}

/** Whatever storage handed back, made safe. An unknown mode is auto: the old behaviour. */
export function normaliseTorchSetting(raw: { mode?: unknown; threshold?: unknown } | null | undefined): TorchSetting {
  const mode: TorchMode = raw?.mode === 'off' ? 'off' : 'auto';
  const n = Number(raw?.threshold);
  const threshold = Number.isFinite(n)
    ? Math.min(TORCH_THRESHOLD_MAX, Math.max(TORCH_THRESHOLD_MIN, Math.round(n)))
    : DEFAULT_TORCH_THRESHOLD;
  return { mode, threshold };
}

export interface TorchInput {
  readonly setting: TorchSetting;
  /** Mean luminance of the frame just read, 0 to 255. */
  readonly mean: number;
  readonly now: number;
  /** When it first went dark and has stayed dark, or null if it is not dark. */
  readonly darkSince: number | null;
  readonly torchOn: boolean;
  /** The torch was the thing blowing the label out, so it stays off this session. */
  readonly blocked: boolean;
}

export interface TorchDecision {
  readonly darkSince: number | null;
  /** What to do to the hardware now, or null to leave it. */
  readonly action: 'on' | 'off' | null;
  /** Whether the screen should be saying it is too dark. Only ever true in `off` mode. */
  readonly tooDark: boolean;
}

export function decideTorch(i: TorchInput): TorchDecision {
  const dark = i.mean < i.setting.threshold;
  const darkSince = dark ? (i.darkSince ?? i.now) : null;
  const heldDark = dark && darkSince !== null && i.now - darkSince >= DARK_HOLD_MS;

  if (i.setting.mode === 'off') {
    // Never touches the hardware: the user chose to light the shelf themselves.
    return { darkSince, action: null, tooDark: heldDark };
  }

  let action: 'on' | 'off' | null = null;
  if (heldDark && !i.torchOn && !i.blocked) action = 'on';
  // A margin above the threshold before it goes out, or a torch that lifts the
  // frame just over the line would switch itself off and back on forever.
  else if (!dark && i.torchOn && i.mean > i.setting.threshold * 1.6) action = 'off';
  return { darkSince, action, tooDark: false };
}
