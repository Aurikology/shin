/**
 * The switch for what shoppers teach the answer (security finding F9, 2026-11-16): `SHIN_SHOPPER_VOICE=off` stops
 * typed prices and learned barcode picks from changing any shown answer. They are still stored, so turning it
 * back on loses nothing; scripts/security/remove-shopper-input.mjs takes one product's rows out.
 */
import * as settings from '../../settings/src/index.ts';

export function shopperVoiceOff(env: NodeJS.ProcessEnv = process.env): boolean {
  return (settings.SHIN_SHOPPER_VOICE(env) ?? '').trim().toLowerCase() === 'off';
}
