/**
 * Stage 07: what they can do about it.
 *
 * One primary action and three secondary, which is the walkthrough's own shape
 * for this screen. The primary is SAVE AND WATCH, not buy, and that is not a
 * style choice: the primary user is a window shopper, 58.6% of cart abandonment
 * is people who were only browsing, and Keepa's 4 million users plus
 * camelcamelcamel's 800,000 are all watching things they have not bought. For a
 * buyer "you are being ripped off" is a dead end. For a window shopper it is the
 * payoff, and the next move is to save it.
 *
 * The three secondary actions are taken from the stage 07 table and the floor,
 * not invented here:
 *   1. Find it cheaper      stage 07 table, tagged Core, "same item, other
 *                           stores", noted as actionable standing in a store.
 *   2. Price match script   stage 07 table, tagged Small, "show this to the
 *                           cashier here"; several Canadian banners price match.
 *   3. Send the card        the floor's Share line and stage 08, the still card.
 *                           This is the one that routes to another screen.
 * The correction branch is deliberately NOT here. Stage 06b calls it "a branch
 * off the verdict, not a step after it", so it hangs off the verdict screen.
 *
 * HARD RULE 2, no savings claim until it is measured: this screen never prints a
 * saved amount, a difference between two prices, or a yearly figure. Where a
 * number belongs it is a thing actually counted, which is what the footer shows.
 */

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

/** The date a price was observed, said the way a person says it. */
function observed(iso) {
  if (!iso) return 'undated';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const KIND_WORD = {
  regular: 'regular',
  promotional: 'on promo',
  asking: 'asking',
  sold: 'sold for',
  list: 'list price',
};

/**
 * The threshold Shin suggests for the watch.
 *
 * Only ever a number that exists in the comparison set: no percentage off the
 * tag, because that number would be arithmetic dressed as evidence, and HARD
 * RULE 3 is about exactly that.
 *
 * The median is only usable when every price in the set is the same kind of
 * price. On a grocery item the set holds a regular shelf price beside a capped
 * loss leader, and their median is a number nobody charges: on Kraft Dinner it
 * lands on a promotion and would have been described to the user as "the middle
 * of what these actually go for". That is the single blended number stage 06
 * rules out for grocery, arrived at from the other direction. So when the set
 * mixes kinds, the target is the cheapest REGULAR price, described as what it
 * is, and the promotion is left to the verdict lines where it is labelled.
 */
function watchTarget(result) {
  const spread = result && result.spread;
  const asking = typeof result?.askingCents === 'number' ? result.askingCents : null;
  if (!spread || asking === null) return null;

  const set = Array.isArray(result.comparisonSet) ? result.comparisonSet : [];
  const kinds = new Set(set.map((p) => p.kind));

  if (kinds.size > 1) {
    const regular = set.filter((p) => p.kind === 'regular').map((p) => p.amountCents);
    if (regular.length > 0) {
      const cents = Math.min(...regular);
      if (cents < asking) {
        return { cents, why: 'the cheapest ordinary shelf price anyone was charging' };
      }
      return null;
    }
    // Nothing regular to anchor on. The lowest number here is a promotion, and
    // it has to be named as one rather than passed off as the going rate.
    if (spread.lowCents < asking) {
      return { cents: spread.lowCents, why: 'the best advertised promotion, not an everyday price' };
    }
    return null;
  }

  if (spread.medianCents < asking) {
    return { cents: spread.medianCents, why: 'the middle of what these actually go for' };
  }
  if (spread.lowCents < asking) {
    return { cents: spread.lowCents, why: 'the lowest price anyone was seen charging' };
  }
  return null;
}

/**
 * The history row this screen is about.
 *
 * Screens that route here pass the item's id, because the home screen's
 * watchlist and its recent list both open a specific scan rather than the last
 * one. Reading `history[0]` unconditionally is silently wrong in exactly the
 * way this product cannot afford: tapping the POANG chair and being shown the
 * Kraft Dinner verdict looks like a working app and is a lie about a price.
 *
 * No id, or an id nothing matches, falls back to the most recent scan, which is
 * what a scan that just finished wants.
 */
function entryFor(ctx) {
  const history = ctx.store.get().history;
  const wanted = ctx.params && ctx.params.id;
  if (wanted) {
    const hit = history.find(
      (h) => h && h.result && h.result.identity && h.result.identity.id === wanted,
    );
    if (hit) return hit;
  }
  return history[0];
}

export default {
  id: 'actions',
  title: 'What you can do',

  render(root, ctx) {
    const first = entryFor(ctx);
    if (!first) {
      ctx.replace('scan');
      return;
    }

    const result = first.result ?? {};
    const query = first.query ?? {};
    const refused = result.kind === 'refusal';
    const identity = result.identity ?? null;
    const cad = ctx.shin.cad;

    const askingCents =
      typeof result.askingCents === 'number'
        ? result.askingCents
        : typeof query.askingCents === 'number'
          ? query.askingCents
          : null;

    const tierId = refused ? 'fair' : (result.tier ?? 'fair');
    const tier = ctx.shin.tierOf(tierId);
    const label = identity ? identity.label : (query.text ?? 'That thing you scanned');
    const watchable = Boolean(identity && identity.id);
    const watchId = watchable ? identity.id : null;
    const target = refused ? null : watchTarget(result);

    const comps = (result.comparisonSet ?? result.evidence ?? [])
      .slice()
      .sort((a, b) => a.amountCents - b.amountCents);

    root.innerHTML = `
      <p class="kicker">Stage 07 &middot; after the verdict</p>

      <div class="card act-head">
        <div class="act-face">${ctx.shin.faceSvg(tierId, 62)}</div>
        <div>
          <h2 class="act-title">${esc(label)}</h2>
          <p class="act-verdict small">
            <span class="tag act-tier act-tier-${esc(tier.face)}">${esc(refused ? 'No call' : tier.word)}</span>
            ${askingCents !== null ? `<span class="num act-asking">${esc(cad(askingCents))} on the tag</span>` : ''}
          </p>
        </div>
      </div>

      ${
        refused
          ? `<p class="note">${esc(result.detail ?? 'Shin would not call this one.')}
             You can still keep an eye on it.</p>`
          : ''
      }

      <h3 class="act-lede">Not buying it today is a normal answer. Keep it anyway.</h3>

      <button type="button" class="btn btn-primary act-watch" id="act-watch"
              ${watchable ? '' : 'disabled'}></button>

      <p class="act-buys" id="act-buys"></p>

      <p class="kicker plain act-or">Or</p>
      <div class="btn-row act-secondary">
        <button type="button" class="btn btn-quiet" data-panel="cheaper">Find it cheaper</button>
        <button type="button" class="btn btn-quiet" data-panel="script">Price match script</button>
        <button type="button" class="btn btn-quiet" data-go="share">Send the card</button>
      </div>

      <div class="act-panel" id="act-panel" hidden></div>

      <div class="card act-counted">
        <p class="kicker plain">What this app has actually counted</p>
        <dl class="act-counts" id="act-counts"></dl>
        <p class="note legal">No amount saved appears anywhere in Shin, here or on any other
          screen. Nothing has measured one yet, and a performance claim needs proper testing
          behind it before it is published. Counted things are shown instead.</p>
      </div>
    `;

    /* --- the primary action, and it has to survive a reload --- */

    const watchBtn = root.querySelector('#act-watch');
    const buys = root.querySelector('#act-buys');

    function paintWatch() {
      const on = watchable && ctx.store.isWatched(watchId);
      watchBtn.textContent = !watchable
        ? 'Nothing here to watch yet'
        : on
          ? 'Watching this. Tap to stop.'
          : 'Save and watch';
      watchBtn.classList.toggle('btn-primary', !on);
      watchBtn.classList.toggle('btn-quiet', on);
      watchBtn.setAttribute('aria-pressed', String(on));
      buys.innerHTML = !watchable
        ? 'Shin never worked out what this was, so there is nothing to follow.'
        : on
          ? `Saved. ${
              target
                ? `Shin watches for <span class="num">${esc(cad(target.cents))}</span> or lower, ${esc(target.why)}.`
                : 'Shin watches this one for a drop.'
            } The drop notification is the only reason to open this app again, and it is the point of saving.`
          : `Saving does one thing and it is the whole loop: ${
              target
                ? `when this hits <span class="num">${esc(cad(target.cents))}</span> or lower, ${esc(target.why)}, Shin tells you.`
                : 'Shin tells you when the price moves.'
            } You do not have to decide today.`;
    }

    watchBtn.addEventListener('click', () => {
      if (!watchable) return;
      ctx.store.toggleWatch({
        id: watchId,
        label,
        askingCents,
        tier: refused ? null : (result.tier ?? null),
        category: identity.category ?? query.category ?? null,
        // The store this price was seen in. Re-pricing the item later without
        // it puts this shop's own shelf price into the set it is judged
        // against, which reads as a competitor and flatters every later drop.
        // `askingSource` is the literal string "given" when no store was
        // named, and that must never be treated as a seller.
        seller:
          query.askingSeller ??
          (result.askingSource && result.askingSource !== 'given' ? result.askingSource : null),
      });
    });

    /* --- the three secondary actions --- */

    const panel = root.querySelector('#act-panel');
    let open = null;

    function cheaperHtml() {
      if (comps.length === 0) {
        return `<p class="muted">Shin has no other prices for this one. That is a blank, not a
          zero, and it is recorded as a blank.</p>`;
      }
      return `
        <p class="kicker plain">Same item, everywhere Shin has seen it</p>
        <ul class="act-list">
          ${comps
            .map(
              (p) => `<li>
                <span class="act-seller">${esc(p.seller)}</span>
                <span class="num act-price">${esc(cad(p.amountCents))}</span>
                <span class="act-meta small faint">${esc(KIND_WORD[p.kind] ?? p.kind)}${
                  p.limit ? `, ${esc(p.limit)}` : ''
                } &middot; seen ${observed(p.observedAt)}</span>
              </li>`,
            )
            .join('')}
        </ul>
        <p class="note">No distances yet. These sellers are banners, not the branch down the
          road, and Shin will not put a store on a map it has not checked.</p>`;
    }

    function scriptHtml() {
      /*
       * The ask is built on a REGULAR competitor price wherever one exists, not
       * on the cheapest number in the set. A capped promotion is a different
       * offer, which is the whole reason grocery gets two verdict lines, and
       * walking up to a desk quoting a limit 8 loss leader is how a user gets
       * told no while holding our script.
       */
      const regular = comps.filter((p) => p.kind === 'regular');
      const promo = comps.find((p) => p.kind === 'promotional');
      // A manufacturer list price is not a retailer price and never goes in the
      // ask. Quoting one at a desk is asking to be corrected in public.
      const best = regular[0] ?? comps.find((p) => p.kind !== 'list') ?? null;
      if (!best) {
        return `<p class="muted">A price match needs a price a shop actually charged, and Shin
          does not have one for this item. ${
            comps.some((p) => p.kind === 'list')
              ? 'The only number here is a manufacturer list price, which no desk will match against.'
              : ''
          }</p>`;
      }
      const script =
        `Hi, could you price match this? ${label} is ${cad(best.amountCents)} at ` +
        `${best.seller}${best.kind === 'promotional' ? ' on promotion' : ''}` +
        `${best.limit ? ` (${best.limit})` : ''}, seen on ${best.observedAt}. ` +
        `This one is marked ${askingCents !== null ? cad(askingCents) : 'higher'}. ` +
        `Would you match it?`;
      return `
        <p class="kicker plain">Show this to the cashier</p>
        <blockquote class="act-script" id="act-script">${esc(script)}</blockquote>
        <button type="button" class="btn btn-quiet act-copy" id="act-copy">Copy the script</button>
        ${
          promo && best.kind !== 'promotional'
            ? `<p class="small muted">There is also ${esc(cad(promo.amountCents))} at
               ${esc(promo.seller)}${promo.limit ? `, ${esc(promo.limit)}` : ''}. That one is a
               promotion, and most match policies do not touch those, so it is left out of the
               ask on purpose.</p>`
            : ''
        }
        <p class="note">Several Canadian banners price match and each writes its own rules,
          usually about promos, competitors and dates. Shin quotes the price it saw and the day
          it saw it. It does not promise the desk will say yes.</p>`;
    }

    function paintPanel(which) {
      if (open === which) {
        open = null;
        panel.hidden = true;
        panel.innerHTML = '';
        return;
      }
      open = which;
      panel.hidden = false;
      panel.innerHTML = `<div class="card act-panel-card">${
        which === 'cheaper' ? cheaperHtml() : scriptHtml()
      }</div>`;
      const copy = panel.querySelector('#act-copy');
      if (copy) {
        copy.addEventListener('click', async () => {
          const text = panel.querySelector('#act-script').textContent;
          try {
            await navigator.clipboard.writeText(text);
            copy.textContent = 'Copied';
          } catch {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(panel.querySelector('#act-script'));
            sel.removeAllRanges();
            sel.addRange(range);
            copy.textContent = 'Selected. Copy it by hand.';
          }
        });
      }
    }

    root.querySelector('.act-secondary').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.go) {
        ctx.go(btn.dataset.go);
        return;
      }
      if (btn.dataset.panel) {
        paintPanel(btn.dataset.panel);
        for (const b of root.querySelectorAll('[data-panel]')) {
          b.setAttribute('aria-expanded', String(b.dataset.panel === open));
        }
      }
    });

    /* --- counted, never claimed --- */

    const counts = root.querySelector('#act-counts');
    function paintCounts() {
      const s = ctx.store.get();
      const walkAways = s.history.filter((h) => h.result && h.result.tier === 'walk_away').length;
      const rows = [
        ['Scans made', s.scanCount],
        ['Things you are watching', s.watchlist.length],
        ['Times Shin said walk away', walkAways],
        ['Cards sent', s.shareCount],
      ];
      counts.innerHTML = rows
        .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`)
        .join('');
    }

    paintWatch();
    paintCounts();
    const stop = ctx.store.subscribe(() => {
      paintWatch();
      paintCounts();
    });
    return stop;
  },
};
