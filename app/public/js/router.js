/**
 * The router, and the screen contract every screen module implements.
 *
 * A screen module default-exports:
 *   { id, title, render(root, ctx) }
 * where `ctx` is { go, params, store, api, shin }. `render` fills `root` and may
 * return a cleanup function.
 *
 * Screens never import one another. They move by calling ctx.go(id, params),
 * which is what keeps the walkthrough's branches (06b off 06, the paywall off
 * 07) from turning into a tangle.
 */

const routes = new Map();
let current = null;
let cleanup = null;
let rootEl = null;
let ctxBase = null;

export function register(screen) {
  routes.set(screen.id, screen);
}

export function screens() {
  return [...routes.values()];
}

export function currentId() {
  return current;
}

export function go(id, params = {}) {
  if (!routes.has(id)) {
    console.warn(`no screen "${id}"`);
    return;
  }
  const next = new URLSearchParams();
  next.set('s', id);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) next.set(k, String(v));
  }
  history.pushState({ id, params }, '', `?${next.toString()}`);
  paint(id, params);
}

/** Replace without adding a history entry. Used when a screen redirects itself. */
export function replace(id, params = {}) {
  const next = new URLSearchParams();
  next.set('s', id);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) next.set(k, String(v));
  }
  history.replaceState({ id, params }, '', `?${next.toString()}`);
  paint(id, params);
}

function paint(id, params) {
  const screen = routes.get(id);
  if (!screen) return;
  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch (err) {
      console.error('cleanup failed for', current, err);
    }
  }
  cleanup = null;
  current = id;
  rootEl.innerHTML = '';
  rootEl.dataset.screen = id;
  document.title = screen.title ? `${screen.title} · Shin` : 'Shin';
  try {
    cleanup = screen.render(rootEl, { ...ctxBase, go, replace, params }) ?? null;
  } catch (err) {
    console.error('render failed for', id, err);
    rootEl.innerHTML = `<div class="screen-error">
      <h2>That screen did not open.</h2>
      <p>${String(err && err.message ? err.message : err)}</p>
    </div>`;
  }
  rootEl.scrollTop = 0;
  window.dispatchEvent(new CustomEvent('shin:navigated', { detail: { id, params } }));
}

export function start(root, base, fallbackId) {
  rootEl = root;
  ctxBase = base;
  window.addEventListener('popstate', () => {
    const q = new URLSearchParams(location.search);
    const id = q.get('s');
    const params = Object.fromEntries([...q.entries()].filter(([k]) => k !== 's'));
    paint(routes.has(id) ? id : fallbackId, params);
  });
  const q = new URLSearchParams(location.search);
  const id = q.get('s');
  const params = Object.fromEntries([...q.entries()].filter(([k]) => k !== 's'));
  paint(routes.has(id) ? id : fallbackId, params);
}
