/**
 * Stage 10: the home screen, after scan one.
 *
 * Two states, one module, and the app picks between them on its own. Day one
 * there is nothing to show, so the screen is one button and that button is the
 * camera. Once things have been saved, the collection is the more valuable
 * surface and the camera becomes a button on it.
 *
 * The switch point is three saves, which is the walkthrough's adaptive row and
 * its mock caption ("the collection earns the top of the screen once it has
 * three items in it"). Below three saves the scan card keeps the top; at three
 * the collection takes it. The document flags the adaptive home as one of its
 * four design judgments with nothing behind it, so the threshold is written in
 * one place here and is a one-line change when a real number turns up.
 *
 * Nothing on this screen states or implies an amount saved. A price movement is
 * a movement of a price, shown per item and never totalled.
 */

/** Three saves and the collection takes the top of the screen. */
const ADAPTIVE_AT = 3;
/** How many past scans the recents strip shows. */
const RECENTS = 4;

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

function firstNumber(...values) {
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function firstString(...values) {
  for (const v of values) if (typeof v === 'string' && v.trim() !== '') return v;
  return null;
}

/** Newest history row that resolved to this product. History is newest first. */
function historyFor(state, id) {
  if (!id) return null;
  return (
    state.history.find(
      (h) => h && h.result && h.result.identity && h.result.identity.id === id,
    ) ?? null
  );
}

/**
 * A watchlist entry, read tolerantly.
 *
 * The save button belongs to another screen, so the exact shape it writes is not
 * this screen's to decide. Everything below falls back to the history row for
 * the same product, which store.js does define: { at, result, query }.
 */
function normalizeWatch(entry, state) {
  const id = firstString(entry.id, entry.productId);
  const past = historyFor(state, id);
  const identity = entry.identity ?? (past && past.result ? past.result.identity : null) ?? {};
  const pastQuery = (past && past.query) || {};
  const pastResult = (past && past.result) || {};
  return {
    id,
    label: firstString(entry.label, entry.title, entry.name, identity.label, id) ?? 'Saved item',
    category: firstString(entry.category, identity.category, pastQuery.category),
    text: firstString(entry.text, entry.query && entry.query.text, pastQuery.text, identity.label, id),
    gtin: firstString(entry.gtin, identity.gtin, pastQuery.gtin),
    savedCents: firstNumber(
      entry.askingCents,
      entry.priceCents,
      entry.amountCents,
      pastQuery.askingCents,
      pastResult.askingCents,
    ),
    tier: firstString(entry.tier, pastResult.kind === 'verdict' ? pastResult.tier : null),
    savedAt: firstString(entry.savedAt, entry.at),
  };
}

/** Newest recorded price movement for a product, or null. Drops are stage 11's. */
function dropFor(state, id) {
  if (!id || !Array.isArray(state.drops)) return null;
  const mine = state.drops
    .filter((d) => d && d.id === id && typeof d.toCents === 'number')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return mine[0] ?? null;
}

function ago(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** The query that re-opens a product on another screen. */
function paramsFor(item) {
  const params = { id: item.id };
  if (item.text) params.text = item.text;
  if (item.category) params.category = item.category;
  if (item.gtin) params.gtin = item.gtin;
  if (typeof item.currentCents === 'number') params.askingCents = item.currentCents;
  return params;
}

export default {
  id: 'home',
  title: 'Home',

  render(root, ctx) {
    const state = ctx.store.get();
    const { shin } = ctx;
    const watching = (state.watchlist ?? []).map((w) => normalizeWatch(w, state));
    for (const item of watching) {
      const drop = dropFor(state, item.id);
      item.drop = drop;
      item.currentCents = firstNumber(drop && drop.toCents, item.savedCents);
      item.currentTier = firstString(drop && drop.tier, item.tier);
      item.movedCents =
        typeof item.savedCents === 'number' && typeof item.currentCents === 'number'
          ? item.savedCents - item.currentCents
          : null;
    }

    const fresh =
      (state.scanCount ?? 0) === 0 &&
      watching.length === 0 &&
      (state.history ?? []).length === 0;

    let alive = true;
    root.innerHTML = fresh ? emptyHome() : returningHome(state, watching, shin);

    if (fresh) {
      // What Shin can answer for today, counted from the real catalogue rather
      // than asserted. If the call fails the line simply does not appear.
      ctx.api
        .catalogue()
        .then((cat) => {
          if (!alive) return;
          const slot = root.querySelector('[data-shelf]');
          if (!slot || !cat || !Array.isArray(cat.items)) return;
          // The shelf and the answer rate are two different numbers, and only
          // one of them is a promise. Saying "7 things" when 5 of them refuse
          // is the app overstating its own coverage to the person relying on
          // it, so the count that leads is the count that can be delivered.
          const shelf = cat.items.length;
          const can = typeof cat.answerableCount === 'number' ? cat.answerableCount : null;
          slot.innerHTML =
            can === null
              ? `Shin has ${shelf} things on the shelf, priced by hand on ${esc(cat.recordedAt)}.`
              : `Shin has ${shelf} things on the shelf, priced by hand on ${esc(cat.recordedAt)},
                 and can give a real verdict on ${can} of them today. On the rest he says so
                 instead of guessing, which is the whole point of him.`;
        })
        .catch(() => {});
    }

    root.addEventListener('click', onClick);
    function onClick(event) {
      const goer = event.target.closest('[data-go]');
      if (!goer) return;
      const raw = goer.dataset.params;
      let params = {};
      if (raw) {
        try {
          params = JSON.parse(raw);
        } catch {
          params = {};
        }
      }
      ctx.go(goer.dataset.go, params);
    }

    return () => {
      alive = false;
      root.removeEventListener('click', onClick);
    };
  },
};

/* --- state one: nothing has happened yet --- */

function emptyHome() {
  return `
    <section class="home-empty">
      <p class="kicker">Shin</p>
      <h1>Nothing scanned yet.</h1>
      <p class="muted">Point Shin at a price tag or a listing. He will tell you whether the
        number in front of you is a fair one, or tell you he cannot price it, which is the
        other honest answer.</p>
      <button class="btn btn-primary" type="button" data-go="scan">Scan something</button>
      <p class="note" data-shelf>Shin only answers for things he has real prices for.</p>
    </section>`;
}

/* --- state two: there is a collection, and it is the reason to come back --- */

function returningHome(state, watching, shin) {
  const collectionFirst = watching.length >= ADAPTIVE_AT;
  const blocks = collectionFirst
    ? [shinSays(state, watching, shin), watchCard(watching, shin), scanCard(watching), recentCard(state)]
    : [shinSays(state, watching, shin), scanCard(watching), watchCard(watching, shin), recentCard(state)];
  return `${blocks.filter(Boolean).join('')}
    <p class="note home-note">${
      collectionFirst
        ? 'Your collection sits above the camera because it has three things in it. That switch is the app changing shape, not a setting.'
        : `The camera stays on top until ${ADAPTIVE_AT} things are saved. Then the collection takes over.`
    }</p>`;
}

/**
 * One thing Shin has to say, and only when something is true to say.
 *
 * A recorded price movement wins, because that is the whole reason a save is
 * worth making. Otherwise the last verdict speaks.
 */
function shinSays(state, watching, shin) {
  const moved = watching
    .filter((w) => w.drop && typeof w.movedCents === 'number' && w.movedCents > 0)
    .sort((a, b) => String(b.drop.at).localeCompare(String(a.drop.at)))[0];

  if (moved) {
    return `
      <button class="card home-says home-says-live" type="button" data-go="notify" data-params='${esc(
        JSON.stringify(paramsFor(moved)),
      )}'>
        <span class="home-says-face">${shin.faceSvg(moved.currentTier ?? 'good', 56)}</span>
        <span>
          <span class="home-says-line">${esc(moved.label)} is ${esc(
            shin.cad(moved.movedCents),
          )} lower than when you saved it.</span>
          <span class="small muted home-says-sub">Now ${esc(shin.cad(moved.currentCents))}, was ${esc(
            shin.cad(moved.savedCents),
          )}. Tap to see what Shin makes of the new price.</span>
        </span>
      </button>`;
  }

  const lastVerdict = (state.history ?? []).find((h) => h && h.result && h.result.kind === 'verdict');
  if (!lastVerdict) return '';
  const tier = shin.tierOf(lastVerdict.result.tier);
  const line = (lastVerdict.result.lines ?? [])[0] ?? '';
  return `
    <section class="card home-says">
      <div class="home-says-face">${shin.faceSvg(lastVerdict.result.tier, 56)}</div>
      <div>
        <p class="home-says-line">${esc(tier.word)} on ${esc(
          lastVerdict.result.identity ? lastVerdict.result.identity.label : 'the last thing you scanned',
        )}.</p>
        <p class="small muted home-says-sub">${esc(line)}</p>
      </div>
    </section>`;
}

function watchCard(watching, shin) {
  if (watching.length === 0) {
    return `
      <section class="card">
        <h3>Nothing saved yet</h3>
        <p class="small muted">Saving something is what turns Shin from a camera into a thing
          worth reopening. He watches the price and comes back when it moves.</p>
      </section>`;
  }

  const rows = watching
    .map((item) => {
      const price =
        typeof item.currentCents === 'number' ? shin.cad(item.currentCents) : 'no price recorded';
      const move =
        typeof item.movedCents === 'number' && item.movedCents !== 0
          ? `<span class="home-move ${item.movedCents > 0 ? 'down' : 'up'}">${
              item.movedCents > 0 ? '&#9660;' : '&#9650;'
            } ${shin.cad(Math.abs(item.movedCents))}</span>`
          : '';
      const tierClass = item.currentTier ? ` home-tier-${esc(item.currentTier)}` : '';
      return `
        <button class="home-row" type="button" data-go="verdict" data-params='${esc(
          JSON.stringify(paramsFor(item)),
        )}'>
          <span class="home-row-main">
            <span class="home-row-label">${esc(item.label)}</span>
            <span class="home-row-meta${tierClass}">${
              item.currentTier ? esc(tierWord(item.currentTier)) : 'not priced yet'
            }${item.savedAt ? ` &middot; saved ${esc(ago(item.savedAt))}` : ''}</span>
          </span>
          <span class="home-row-price num">${esc(price)}${move}</span>
        </button>`;
    })
    .join('');

  const first = watching[0];
  return `
    <section class="card home-watch">
      <h3>${watching.length} ${watching.length === 1 ? 'thing' : 'things'} you are watching</h3>
      ${rows}
      <div class="home-watch-foot">
        <button class="btn-link" type="button" data-go="actions" data-params='${esc(
          JSON.stringify(paramsFor(first)),
        )}'>What you can do with a save</button>
        <button class="btn-link" type="button" data-go="notify" data-params='${esc(
          JSON.stringify(paramsFor(first)),
        )}'>Show me a price drop</button>
      </div>
    </section>`;
}

function scanCard(watching) {
  const lead =
    watching.length >= ADAPTIVE_AT
      ? ''
      : '<p class="small muted">The camera keeps the top of the screen while the collection is small.</p>';
  return `
    <section class="home-scan">
      ${lead}
      <button class="btn btn-primary" type="button" data-go="scan">Scan something</button>
    </section>`;
}

function recentCard(state) {
  const rows = (state.history ?? []).slice(0, RECENTS);
  if (rows.length === 0) return '';
  const items = rows
    .map((h) => {
      const result = h.result ?? {};
      const label =
        (result.identity && result.identity.label) ||
        (h.query && h.query.text) ||
        'something Shin could not name';
      const verdict =
        result.kind === 'verdict'
          ? `<span class="tag home-tag home-tier-${esc(result.tier)}">${esc(
              tierWord(result.tier),
            )}</span>`
          : '<span class="tag home-tag">could not price</span>';
      return `
        <button class="home-recent-row" type="button" data-go="verdict" data-params='${esc(
          JSON.stringify({
            id: result.identity ? result.identity.id : undefined,
            text: (h.query && h.query.text) || (result.identity && result.identity.label),
            category: (h.query && h.query.category) || (result.identity && result.identity.category),
            askingCents: (h.query && h.query.askingCents) ?? result.askingCents,
          }),
        )}'>
          <span class="home-recent-label">${esc(label)}</span>
          ${verdict}
          <span class="home-recent-when faint small">${esc(ago(h.at))}</span>
        </button>`;
    })
    .join('');
  return `
    <section class="card home-recent">
      <h3>Recently scanned</h3>
      ${items}
    </section>`;
}

function tierWord(tier) {
  return { good: 'Good price', fair: 'About right', walk_away: 'Walk away' }[tier] ?? 'Scanned';
}
