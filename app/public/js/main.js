/**
 * Wires the shell together and registers every screen in walkthrough order.
 *
 * The order of this list is the user journey from the video that installs the
 * app to the week-two habit. Adding a screen means adding a stage, which is a
 * queue decision rather than a coding one.
 */

import * as router from './router.js';
import * as store from './store.js';
import * as api from './api.js';
import * as shin from './shin.js';

import prelaunch from './screens/prelaunch.js';
import intro from './screens/intro.js';
import setup from './screens/setup.js';
import scan from './screens/scan.js';
import identify from './screens/identify.js';
import verdict from './screens/verdict.js';
import correct from './screens/correct.js';
import actions from './screens/actions.js';
import share from './screens/share.js';
import paywall from './screens/paywall.js';
import home from './screens/home.js';
import notify from './screens/notify.js';
import weektwo from './screens/weektwo.js';
import stagemap from './screens/stagemap.js';

const SCREENS = [
  prelaunch, intro, setup, scan, identify, verdict, correct,
  actions, share, paywall, home, notify, weektwo, stagemap,
];
for (const s of SCREENS) router.register(s);

/* --- theme, three states, the same as the walkthrough --- */
const THEMES = ['system', 'light', 'dark'];
function applyTheme(next) {
  if (next === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  try { localStorage.setItem('shin.theme', next); } catch { /* private window */ }
}
let theme = (() => {
  try { return localStorage.getItem('shin.theme') ?? 'system'; } catch { return 'system'; }
})();
applyTheme(theme);
document.getElementById('btn-theme').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  applyTheme(theme);
});

document.getElementById('btn-map').addEventListener('click', () => router.go('stagemap'));

/* --- the tab bar, which appears only once there is something to come back to --- */
const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'scan', label: 'Scan' },
  { id: 'weektwo', label: 'You' },
];
const tabbar = document.getElementById('tabbar');

function paintTabs() {
  const s = store.get();
  // Stage 10: the home screen changes shape once there is something to show.
  // Before the first scan there is nowhere to go but forward, so no bar at all.
  const earned = s.scanCount > 0 || s.watchlist.length > 0;
  tabbar.hidden = !earned;
  if (!earned) { tabbar.innerHTML = ''; return; }
  const currentScreen = router.currentId();
  tabbar.innerHTML = TABS.map(
    (t) => `<button type="button" data-go="${t.id}" aria-current="${t.id === currentScreen}">${t.label}</button>`,
  ).join('');
}
tabbar.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-go]');
  if (btn) router.go(btn.dataset.go);
});
store.subscribe(paintTabs);
window.addEventListener('shin:navigated', paintTabs);

/* --- go --- */
const first = store.get().seenIntro ? 'home' : 'prelaunch';
router.start(document.getElementById('screen'), { store, api, shin }, first);
paintTabs();
