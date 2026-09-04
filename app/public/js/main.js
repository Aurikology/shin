/**
 * Wires the shell together and registers the six screens.
 *
 * The list used to be fourteen and it used to be in walkthrough order, which is
 * the order a story is told and not the order an app is used. It is six now, and
 * the camera is first because the camera is the app: cold start lands on a live
 * viewfinder with the shutter under the thumb, and everything else is reached
 * from there.
 *
 * The one thing that can stand in front of the camera is the attitude question,
 * asked once. Camera permission is deliberately not asked here; it is asked at
 * the first shutter press, which is the only moment the request makes sense to
 * the person being asked.
 */

import * as router from './router.js';
import * as store from './store.js';
import * as api from './api.js';
import * as shin from './shin.js';

import camera from './screens/camera.js';
import setup from './screens/setup.js';
import watchlist from './screens/watchlist.js';
import correct from './screens/correct.js';
import share from './screens/share.js';
import you from './screens/you.js';

for (const s of [camera, setup, watchlist, correct, share, you]) router.register(s);

/* Theme: three states, and no button in the chrome for it. The switch lives on
   the You screen, because it is a setting and not a primary act. */
try {
  const saved = localStorage.getItem('shin.theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch { /* private window */ }

const first = store.get().seenIntro ? 'camera' : 'setup';
router.start(document.getElementById('screen'), { store, api, shin }, first);
