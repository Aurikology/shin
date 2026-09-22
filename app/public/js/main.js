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
import { primeOfflineAisle } from './offline-aisle.js';
import { refreshCell } from './geocell.js';
import { APP_VERSION } from './version.js';
// Everything the client does, collected. Side-effect import: track.js arms
// its own app_open event, screen_view listener, tap capture, visibility and
// error listeners the moment it loads, per its own header.
import './track.js';

import camera from './screens/camera.js';
import onboarding from './screens/onboarding.js';
import permissions from './screens/permissions.js';
import setup from './screens/setup.js';
import consent from './screens/consent.js';
import watchlist from './screens/watchlist.js';
import correct from './screens/correct.js';
import share from './screens/share.js';
import you from './screens/you.js';
import pastscans from './screens/pastscans.js';
import removed from './screens/removed.js';
import market from './screens/market.js';
import licences from './screens/licences.js';
import savings from './screens/savings.js';
import { firstScreen, replayUrlFor } from './onboarding-flow.js';
import { FLAGS } from './flags.js';

for (const s of [camera, onboarding, permissions, setup, consent, watchlist, correct, share, you, pastscans, removed, market, licences, savings]) {
  router.register(s);
}

/**
 * The version the You page prints. It is version.js's APP_VERSION and nothing
 * else: this used to be a second hand-set string here, it sat at 2026-09-06.1
 * while version.js moved to 2026-09-11.1, and testers were shown the older one.
 * Two hand-set copies of one fact drift; one cannot.
 */
export const BUILD_STAMP = APP_VERSION;

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

/**
 * Item 6b: the consent screen sits between the attitude picker and the
 * camera, once, ever. An install that already ran setup before this item
 * existed has `seenIntro` true and `consentSeen` false, and that state must
 * still land on consent rather than skip it -- the flag this checks is its
 * own, never folded into `seenIntro`, for exactly that reason.
 */
/**
 * The order itself lives in onboarding-flow.js so a test can hold it: the
 * welcome flow once (Jamin's Welcome screen tab), then setup, then consent,
 * then the camera. Each of the four has its own flag and none is folded into
 * another.
 */
/* `FLAGS.onboarding` false swaps the welcome flow for the permission screen
   (screens/permissions.js), which is that flow's own step 24 standing on its
   own: switching the flow off must not take the camera and location ask with
   it. The rest of the order is untouched. */
const first = firstScreen(store.get(), { onboarding: FLAGS.onboarding !== false });
/* `?onboarding=1` replays the welcome once, for someone who has finished it
   already; the flow module decides, and the URL is rewritten so a reload does
   not start it again. First-run behaviour above is untouched. */
const replayUrl = replayUrlFor(location.search, store.get());
if (replayUrl) history.replaceState({}, '', replayUrl);
router.start(document.getElementById('screen'), { store, api, shin, build: BUILD_STAMP }, first);

/* Item 11a: if location consent already carries over from an earlier
   session, get a cell warm before the first scan of this one rather than
   waiting for the first identify call to discover it has none. Never
   awaited and never blocking: a slow or denied OS prompt must not hold up
   the viewfinder, which is exactly why `currentCell()` (what api.js reads)
   is synchronous and this is the only thing that fills it. */
if (store.consent().location) void refreshCell();

/* Corrections typed where there was no signal go out now. After the router
   starts and never awaited: this is somebody's earlier aisle, not this screen's
   business, and a phone that is still offline must reach the viewfinder exactly
   as fast as one that is not. */
void flushCorrections();

/* The barcode pack, fetched once and kept, so the aisle with no signal still
   gets an answer to "what is this". Same rules as the line above: after the
   router, never awaited, and it waits for an idle moment of its own before it
   spends anything, because the viewfinder outranks it. */
primeOfflineAisle();

/*
 * The offline shell. Registered after the router for the same reason as the two
 * lines above: the viewfinder comes first and nothing here may hold it up. What
 * it buys is the app starting at all with no signal, which the pack above needs
 * and cannot provide by itself.
 *
 * ITEM 2c: NOT INSIDE THE NATIVE WRAPPER. `sw.js`'s own fetch handler already
 * lets every `/api/` path and every cross-origin request straight through
 * unmodified (checked: `if (url.pathname.startsWith('/api/')) return;` and
 * `if (url.origin !== self.location.origin) return;`), so a registered worker
 * cannot serve a stale price or a stale photo route inside a wrapper pointed
 * at `SHIN_API_BASE` -- it would be harmless there. It still is not
 * registered there: rule 3 ("Everything else same-origin is served from cache
 * first") caches the wrapper's own bundled HTML and JS beside whatever the
 * wrapper's own asset loader is doing, buying this app nothing (the wrapper
 * already ships those files, offline, by construction) while adding a second
 * mechanism that can serve a stale asset after an app-store update replaces
 * the bundle underneath it. A wrapper is detectable by `window.SHIN_API_BASE`
 * being set, per the wrapper lane's own contract.
 */
if ('serviceWorker' in navigator && !window.SHIN_API_BASE) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* An unsupported browser or a private window. The app is the same app. */
    });
  });
}
