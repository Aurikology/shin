/**
 * What the server tells every installed app at start-up: the oldest build it still supports, and a
 * list of features to switch off (R13 and R14, docs/readiness/REGISTER.md).
 *
 * WHY. A bad iPhone build, or a server change an old build cannot follow, takes days to fix through
 * Apple review. This is the way to deal with it in minutes: set `SHIN_APP_MIN_VERSION` and every
 * build below it shows a plain "Please update Pexi" screen; set `SHIN_APP_FEATURES_OFF` and the
 * named features disappear from every build that reads it. Both are settings (settings/src/index.ts),
 * read on every request, so a change needs the server's environment changed and the process
 * restarted, and no new app build.
 *
 * THE VERSION IS THE APP'S OWN `APP_VERSION` (app/public/js/version.js), the string the You page
 * prints and every scan row records: `YYYY-MM-DD.N`. It is bumped by hand for each TestFlight build,
 * so bumping it is part of cutting a build.
 *
 * FAILING SOFT. A value that does not parse is ignored, never treated as "block everybody": one
 * typo in a setting must not lock every phone out. The client does the same for a missing or failed
 * answer (app/public/js/remote-status.js).
 */
import * as settings from '../../settings/src/index.ts';

export interface AppStatus {
  /** The oldest APP_VERSION still supported, or null for "every build is". */
  readonly minVersion: string | null;
  /** Feature names the app should hide. Names the app does not know are ignored by the app. */
  readonly featuresOff: readonly string[];
}

const VERSION = /^\d{4}-\d{2}-\d{2}\.\d{1,4}$/;
const FEATURE = /^[a-z][a-z0-9_-]{0,31}$/;

export function readAppStatus(env: NodeJS.ProcessEnv = process.env): AppStatus {
  const min = settings.SHIN_APP_MIN_VERSION(env)?.trim() ?? '';
  const off = (settings.SHIN_APP_FEATURES_OFF(env) ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => FEATURE.test(s));
  return { minVersion: VERSION.test(min) ? min : null, featuresOff: [...new Set(off)] };
}
