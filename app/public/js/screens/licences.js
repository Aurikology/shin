/**
 * Where this comes from. The data-and-licences screen.
 *
 * Nearly everything in this app is somebody else's open data: the product
 * names, the sizes, the allergens, the prices, and the store names attached to
 * those prices. All of it is published under licences that require credit, and
 * before this screen existed the app gave none, anywhere. That is a licence
 * problem rather than a manners problem, which is why this is a real screen
 * with a real route and not a line of small print nobody can reach.
 *
 * The list is NOT written here. It is fetched from the server, where it lives
 * as a fixed list a person edits deliberately. Two reasons it is not duplicated
 * into this file: a second copy drifts the first time somebody updates one of
 * them, and the copy that would go stale is the one making the legal statement.
 *
 * WHAT THIS SCREEN DOES WHEN THE FETCH FAILS. It says so, and offers to try
 * again, and does not quietly render an empty page. An empty attribution screen
 * looks identical to an app with nothing to attribute, which is the one wrong
 * impression this screen exists to prevent. It cannot fall back to a built-in
 * list, because the whole point of the single source is that there isn't one.
 *
 * Animation: the rows lift in once, 200ms, staggered 40ms. This screen is seen
 * rarely, usually once, which is the only reason it animates at all. The line
 * on the market screen that leads here does not animate, because that one is
 * seen on every visit.
 */

import * as api from '../api.js';

/* Escaped because these strings come off the wire. Nothing in the list is user
   input today, but a screen that interpolates a fetched string into innerHTML
   without escaping is one data change away from being wrong about that. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sourceRow(entry, i) {
  return `
    <li class="lic-row" style="--i:${i}">
      <p class="lic-name">${esc(entry.name)}</p>
      <p class="lic-what">${esc(entry.what)}</p>
      <p class="lic-terms">
        <span class="lic-licence">${esc(entry.licence)}</span>
        <a class="lic-link" href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">Open</a>
      </p>
    </li>`;
}

export default {
  id: 'licences',
  title: 'Where this comes from',

  render(root, ctx) {
    function shell(inner) {
      root.innerHTML = `
        <div class="page page-list">
          <header class="page-head">
            <button type="button" class="linky pback" data-act="back">Back</button>
            <p class="kicker">Data and licences</p>
            <h1>Where this comes from</h1>
          </header>
          ${inner}
        </div>`;
    }

    function paintLoading() {
      shell('<p class="fineprint lic-state">Loading the list of sources.</p>');
    }

    function paintFailed() {
      shell(`
        <p class="lic-state lic-failed">
          The list of sources could not be loaded, so it is not being shown rather
          than shown incomplete.
        </p>
        <p class="fineprint">
          This app is built on open data from Open Food Facts, Open Prices,
          OpenStreetMap and Open Icecat. The full list, with each licence, is what
          failed to load.
        </p>
        <button type="button" class="rowbtn lic-retry" data-act="retry">
          <span>Try again</span>
        </button>`);
    }

    function paintList(sources) {
      shell(`
        <p class="lic-intro">
          Product details, prices and store names in this app are open data,
          collected and published by other people. Each source below sets its own
          terms for reuse, and this is the credit those terms ask for.
        </p>

        <ul class="lic-list">
          ${sources.map(sourceRow).join('')}
        </ul>

        <p class="fineprint lic-foot">
          Shin is not affiliated with any of them. Prices are what somebody
          recorded on the day shown beside them, not an offer, and not checked
          with the shop.
        </p>`);
    }

    let dead = false;

    async function load() {
      paintLoading();
      try {
        const res = await api.attribution();
        if (dead) return;
        const sources = res && Array.isArray(res.sources) ? res.sources : [];
        /* An empty list is a failure, not an answer. The server holds a fixed
           list that is never empty, so zero rows means we did not really get it,
           and rendering "no sources" would state the opposite of the truth. */
        if (sources.length === 0) paintFailed();
        else paintList(sources);
      } catch {
        if (!dead) paintFailed();
      }
    }

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="back"]')) { ctx.go('market'); return; }
      if (e.target.closest('[data-act="retry"]')) load();
    });

    load();
    return () => { dead = true; };
  },
};
