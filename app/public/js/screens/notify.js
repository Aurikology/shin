/**
 * Stage 11: the notification that brings them back.
 *
 * This is the screen a price-drop notification opens, and the drop is the whole
 * retention mechanism. It is also the one thing on this screen that is not
 * built: there is no push infrastructure, no device token, and no job that runs
 * while the app is closed. So the screen says that out loud, in the panel at the
 * bottom, and names what would have to exist.
 *
 * What is real here: the item comes off the watchlist, the new price goes
 * through the same price spine every other verdict goes through, and the
 * movement is written into the store so week two counts it. What is simulated:
 * the asking price itself, cut by a fixed step below the price last seen. That
 * cut is stated on screen rather than dressed up as an observation.
 *
 * Nothing here says an amount was saved. It says a price moved, which is a
 * different sentence and the only one that has been measured.
 */

/** How far below the last seen price the simulated drop lands. */
const CUT = 0.22;

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

function historyFor(state, id) {
  if (!id) return null;
  return (
    state.history.find((h) => h && h.result && h.result.identity && h.result.identity.id === id) ??
    null
  );
}

/** The save, read tolerantly, then filled in from the history row for the same product. */
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
    savedAt: firstString(entry.savedAt, entry.at),
    // The store the price was seen in, without which the re-price compares the
    // item to its own shelf. Falls back to the recorded scan so saves made
    // before the field existed still price correctly. "given" is the literal
    // stand-in the spine uses when no store was named, never a seller.
    seller: (() => {
      const found = firstString(
        entry.seller,
        entry.askingSeller,
        pastQuery.askingSeller,
        pastResult.askingSource,
      );
      return found === 'given' ? undefined : found;
    })(),
  };
}

function newestDrop(state, id) {
  if (!Array.isArray(state.drops)) return null;
  return (
    state.drops
      .filter((d) => d && d.id === id && typeof d.toCents === 'number')
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] ?? null
  );
}

/** The three lines from the walkthrough, strongest first, picked by what happened. */
function headline(item, tier, fromCents, toCents, cad) {
  const off = cad(fromCents - toCents);
  if (tier === 'good') return `${item.label} hit your number. ${cad(toCents)}.`;
  if (tier === 'fair') return `${item.label} is ${off} off. Go.`;
  return `Remember the ${item.label} I told you not to buy? Still overpriced. Told you.`;
}

export default {
  id: 'notify',
  title: 'Price drop',

  render(root, ctx) {
    const { shin } = ctx;
    const state = ctx.store.get();
    const watchlist = (state.watchlist ?? []).map((w) => normalizeWatch(w, state));

    if (watchlist.length === 0) {
      root.innerHTML = `
        <section class="notify-empty">
          <p class="kicker">The return trigger</p>
          <h1>Nothing is being watched.</h1>
          <p class="muted">A price drop needs a price Shin is already watching. Scan something
            and save it, and this screen becomes the reason you open the app again.</p>
          <button class="btn btn-primary" type="button" data-go="scan">Scan something</button>
        </section>`;
      root.addEventListener('click', onClick);
      return () => root.removeEventListener('click', onClick);
    }

    const wanted = ctx.params && ctx.params.id;
    const item = watchlist.find((w) => w.id === wanted) ?? watchlist[0];
    // A movement already recorded is replayed rather than deepened. Opening this
    // screen twice is one drop, not two, and week two counts drops.
    const seen = newestDrop(state, item.id);
    const startCents = firstNumber(
      seen && seen.fromCents,
      item.savedCents,
      ctx.params && Number(ctx.params.askingCents),
    );

    let alive = true;
    root.innerHTML = `<section class="notify-wait"><p class="kicker">Price drop</p>
      <h1>Shin is re-checking ${esc(item.label)}.</h1>
      <p class="muted">Asking the same price spine every other verdict comes from.</p></section>`;

    if (typeof startCents !== 'number') {
      root.innerHTML = `
        <section class="notify-empty">
          <p class="kicker">Price drop</p>
          <h1>No price to move.</h1>
          <p class="muted">${esc(item.label)} was saved without a price on it, so there is
            nothing for a drop to be measured against. Scan it again with the price showing.</p>
          <button class="btn btn-primary" type="button" data-go="scan">Scan it again</button>
        </section>`;
      root.addEventListener('click', onClick);
      return () => {
        alive = false;
        root.removeEventListener('click', onClick);
      };
    }

    let fromCents = startCents;
    if (seen && typeof seen.toCents === 'number') fire(startCents, seen.toCents);
    else fire(startCents);

    /**
     * Ask the spine what the item is worth at a lower price.
     *
     * `forced` replays a movement already on record instead of cutting a new
     * one, so the verdict on screen is recomputed live while the store gains
     * nothing. A new cut only happens when the button is pressed.
     */
    function fire(from, forced) {
      const toCents =
        typeof forced === 'number' ? forced : Math.max(1, Math.round(from * (1 - CUT)));
      ctx.api
        .price({
          text: item.text ?? item.label,
          gtin: item.gtin ?? undefined,
          category: item.category ?? undefined,
          askingCents: toCents,
          // Carry the store forward or the item gets compared to itself. This
          // is the defect the spine already guards against, arriving through
          // the caller instead: drop the seller here and Metro's own $2.00
          // shelf price counts as a competing quote, which pushes the "regular
          // price" up and quietly makes every drop look better than it is.
          askingSeller: item.seller ?? item.askingSeller ?? undefined,
        })
        .then((result) => {
          if (!alive) return;
          if (result && result.kind === 'verdict') {
            record(item, from, toCents, result);
            fromCents = toCents;
            paintVerdict(item, from, toCents, result);
          } else {
            // Nothing is recorded, but the simulated tag keeps stepping down, so
            // cutting again is a real second question rather than the same one.
            fromCents = toCents;
            paintRefusal(item, from, toCents, result);
          }
        })
        .catch((err) => {
          if (!alive) return;
          root.innerHTML = `
            <section class="notify-empty">
              <p class="kicker">Price drop</p>
              <h1>The price check did not come back.</h1>
              <p class="muted">${esc(err && err.message ? err.message : String(err))}</p>
              <button class="btn btn-primary" type="button" data-go="home">Back to home</button>
            </section>`;
        });
    }

    /**
     * Write the movement down once. Opening this screen twice is not two drops,
     * so the same product at the same price is recorded once and week two counts
     * movements rather than visits.
     */
    function record(target, from, to, result) {
      ctx.store.update((s) => {
        const drops = Array.isArray(s.drops) ? s.drops : [];
        if (drops.some((d) => d && d.id === target.id && d.toCents === to)) return s;
        return {
          ...s,
          drops: [
            {
              id: target.id,
              label: target.label,
              at: new Date().toISOString(),
              fromCents: from,
              toCents: to,
              tier: result.tier,
              line: (result.lines ?? [])[0] ?? '',
              /** Simulated in the app, never observed at a seller. Said on screen too. */
              source: 'simulated',
              query: {
                text: target.text ?? target.label,
                category: target.category ?? null,
                gtin: target.gtin ?? null,
              },
            },
            ...drops,
          ].slice(0, 100),
        };
      });
    }

    function paintVerdict(target, from, to, result) {
      const tier = shin.tierOf(result.tier);
      const lines = (result.lines ?? []).map((l) => `<p class="notify-line">${esc(l)}</p>`).join('');
      const confidence = shin.confidenceLine(result.confidence);
      const params = {
        id: target.id,
        text: target.text ?? target.label,
        category: target.category ?? undefined,
        askingCents: to,
      };
      root.innerHTML = `
        <section class="notify-push" aria-label="What the notification said">
          <div class="notify-push-head">
            <span class="notify-push-app">shin.</span>
            <span class="notify-push-when">now</span>
          </div>
          <p class="notify-push-body">${esc(
            headline(target, result.tier, from, to, shin.cad),
          )}</p>
        </section>

        <section class="card notify-verdict notify-tier-${esc(result.tier)}">
          <div class="notify-face">${shin.faceSvg(result.tier, 84)}</div>
          <p class="notify-word">${esc(tier.word)}</p>
          <div class="notify-prices">
            <span class="notify-was num">${esc(shin.cad(from))}</span>
            <span class="notify-arrow" aria-hidden="true">&rarr;</span>
            <span class="notify-now num">${esc(shin.cad(to))}</span>
          </div>
          <p class="notify-move num">${esc(shin.cad(from - to))} lower than the price you last saw</p>
          ${lines}
          ${confidence ? `<p class="small muted notify-conf">${esc(confidence)}</p>` : ''}
        </section>

        <button class="btn btn-primary" type="button" data-go="verdict" data-params='${esc(
          JSON.stringify(params),
        )}'>See the full verdict</button>
        <div class="notify-secondary">
          <button class="btn-link" type="button" data-cut>Cut the price again</button>
          <button class="btn-link" type="button" data-go="home">Back to home</button>
        </div>

        ${honesty(target, to, true)}`;
    }

    function paintRefusal(target, from, to, result) {
      const detail =
        result && result.kind === 'refusal'
          ? result.detail
          : 'The spine returned something this screen does not know how to read.';
      root.innerHTML = `
        <section class="card notify-refusal">
          <p class="kicker">Price drop, unconfirmed</p>
          <h2>Shin will not price ${esc(target.label)} at ${esc(shin.cad(to))}.</h2>
          <p>${esc(detail)}</p>
          <p class="small muted">Nothing was written down. A movement Shin cannot stand behind is
            not a movement, and week two will not count this one.</p>
        </section>
        <button class="btn btn-primary" type="button" data-go="home">Back to home</button>
        <div class="notify-secondary">
          <button class="btn-link" type="button" data-cut>Cut the price again</button>
        </div>
        ${honesty(target, to, false)}`;
    }

    function honesty(target, to, priced) {
      return `
        <section class="card notify-honest">
          <p class="kicker plain">What is real on this screen</p>
          <p class="small">${
            priced ? 'The verdict above is real' : 'The refusal above is real'
          }: ${esc(
            target.label,
          )} went through the same price spine as every other scan, at ${esc(shin.cad(to))}.
          The asking price is not. It was cut ${Math.round(
            CUT * 100,
          )}% below the price last seen, in this browser, to make the loop visible.</p>
          <p class="note legal small">There is no notification here. Nothing was delivered, because
            nothing in this app can deliver anything.</p>
          <p class="small muted">What would have to exist for a real one:</p>
          <ul class="notify-todo small">
            <li>A server that re-prices every saved item on a schedule. Today prices come from one
              hand-recorded pass, so there is nothing to re-price against.</li>
            <li>A push credential and a per-device token. The floor says no accounts in v1, so this
              is a device registration rather than a login.</li>
            <li>A threshold per save, so a one cent move never sends.</li>
            <li>A send budget. Over-sending is how a person turns notifications off forever, and
              that switch does not come back.</li>
          </ul>
        </section>`;
    }

    function onClick(event) {
      const cut = event.target.closest('[data-cut]');
      if (cut) {
        fire(fromCents);
        return;
      }
      const goer = event.target.closest('[data-go]');
      if (!goer) return;
      let params = {};
      if (goer.dataset.params) {
        try {
          params = JSON.parse(goer.dataset.params);
        } catch {
          params = {};
        }
      }
      ctx.go(goer.dataset.go, params);
    }

    root.addEventListener('click', onClick);
    return () => {
      alive = false;
      root.removeEventListener('click', onClick);
    };
  },
};
