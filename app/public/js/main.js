/**
 * Wires the shell together and registers every screen the app has.
 *
 * The list is the array below and nowhere else. This comment used to state a
 * count, the count was wrong, and it was logged as a defect (D-029) for the
 * same reason a shipped command's stale requirements were (D-020): a number
 * written in prose beside the thing it counts drifts the first time the thing
 * changes and nothing fails. So the count is not stated here, or anywhere else
 * in prose. Read the array.
 *
 * What is worth saying, because the array cannot say it: the list used to be in
 * walkthrough order, which is the order a story is told and not the order an app
 * is used, and it was cut back hard. The camera is first because the camera is
 * the app: cold start lands on a live viewfinder with the shutter under the
 * thumb, and everything else is reached from there.
 *
 * The one thing that can stand in front of the camera is the attitude question,
 * asked once. Camera permission is deliberately not asked here; it is asked at
 * the first shutter press, which is the only moment the request makes sense to
 * the person being asked.
 */

import * as router from './router.js';
import { startThemeColourSync } from './lib/theme.js';
import * as store from './store.js';
import * as api from './api.js';
import * as shin from './shin.js';
import { flushCorrections } from './corrections.js';

import camera from './screens/camera.js';
import setup from './screens/setup.js';
import watchlist from './screens/watchlist.js';
import correct from './screens/correct.js';
import share from './screens/share.js';
import you from './screens/you.js';
import pastscans from './screens/pastscans.js';
import removed from './screens/removed.js';
import market from './screens/market.js';
import licences from './screens/licences.js';

for (const s of [camera, setup, watchlist, correct, share, you, pastscans, removed, market, licences]) {
  router.register(s);
}

/**
 * The simplest honest version route (build pass 2026-09-04): hand-set here,
 * labelled as such on the You page, rather than read from a server endpoint
 * that does not exist yet. Update this string when this pass's code changes.
 */
export const BUILD_STAMP = '2026-09-06.1';

/* Theme: three states, and no button in the chrome for it. The switch lives on
   the You screen, because it is a setting and not a primary act. */
try {
  const saved = localStorage.getItem('shin.theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch { /* private window */ }

/* And the browser's own chrome follows the choice, not just the system
   preference -- the two theme-color metas in index.html are media-qualified and
   cannot see an explicit pick, so forcing light left a near-black status bar
   over a cream page. Started after the line above so the first paint of the
   chrome is already the right colour. */
startThemeColourSync();

const first = store.get().seenIntro ? 'camera' : 'setup';
router.start(document.getElementById('screen'), { store, api, shin, build: BUILD_STAMP }, first);

/* Corrections typed where there was no signal go out now. After the router
   starts and never awaited: this is somebody's earlier aisle, not this screen's
   business, and a phone that is still offline must reach the viewfinder exactly
   as fast as one that is not. */
void flushCorrections();
