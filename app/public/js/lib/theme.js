/**
 * Keep the browser's own chrome the same colour as the app.
 *
 * index.html ships two `theme-color` metas, one per `prefers-color-scheme`.
 * That is the right no-JS default and it is what a cold start uses. It is also
 * only half the story, because the theme has three states, not two: an explicit
 * light or dark choice on the You screen wins over the system preference, and a
 * media-qualified meta cannot see that choice. So someone who forced light kept
 * a near-black status bar above a cream page.
 *
 * Rather than inserting an un-qualified meta -- which always matches, so it
 * would have to sit first in the head and would then beat the media pair even
 * in system mode -- both metas are rewritten to the colour actually in force.
 * In system mode they go back to being a pair, and the no-JS default is intact.
 *
 * The colour is read from `--ground` rather than written down here. tokens.css
 * moved its grounds twice in two days, and a second copy of a colour is a copy
 * that drifts: share.js was still carrying an --ink-faint that had been
 * replaced the day before, and nothing noticed.
 */

const FALLBACK = { dark: '#0B0C0E', light: '#F3F1EC' };

/** The ground in force right now, straight from the cascade. */
function groundColour() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim();
  if (value) return value;
  // Only reachable if this runs before the stylesheets parse.
  return FALLBACK[effectiveTheme()] ?? FALLBACK.dark;
}

/** 'light' or 'dark': the explicit choice if there is one, else the system's. */
function effectiveTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply() {
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (!metas.length) return;
  const explicit = document.documentElement.dataset.theme;

  if (explicit === 'light' || explicit === 'dark') {
    // One choice is in force, so both metas say the same thing and whichever
    // the browser picks is right.
    const colour = groundColour();
    for (const m of metas) m.setAttribute('content', colour);
    return;
  }

  // System mode: hand the pair back its own answers, so the browser decides.
  for (const m of metas) {
    const media = m.getAttribute('media') || '';
    if (media.includes('light')) m.setAttribute('content', FALLBACK.light);
    else if (media.includes('dark')) m.setAttribute('content', FALLBACK.dark);
    else m.setAttribute('content', groundColour());
  }
}

/**
 * Start syncing, and keep syncing. Watches `data-theme` on the root rather than
 * asking the You screen to call anything, so the one place that sets the theme
 * stays the only place that knows about the theme.
 */
export function startThemeColourSync() {
  apply();
  new MutationObserver(apply).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  // A system-preference change while the app is open, with no explicit choice.
  const mq = matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener?.('change', apply);
}
