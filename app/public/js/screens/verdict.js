/**
 * Stage 06: the verdict.
 *
 * This is the load-bearing screen. If a defensible price cannot be shown well
 * here, every other screen in the product is decoration. So the whole top of
 * this screen is two things and nothing else: Shin's face and the price. They
 * have to land at arm's length, in three seconds, in a screenshot, on a phone
 * held by someone who did not install the app.
 *
 * Three rules this file is built around.
 *
 * 1. THE ENGINE OWNS THE SENTENCE. `result.lines` is already written per
 *    category, and the categories do not share a sentence: grocery gets regular
 *    price against this week's promotion, tech gets other retailers, used goods
 *    get live comparable listings, furniture gets its own history because
 *    nobody else sells the item. Those lines are rendered exactly as given.
 *    Nothing here averages, rounds, re-words or invents a number. The one
 *    "typically costs" figure this screen never shows is the one that would
 *    have been wrong on the pilot's very first item.
 *
 * 2. CONFIDENCE AND DISAGREEMENT ARE NOT DECORATION. Both are on the screen,
 *    unfolded, above the evidence drawer. A 3.6x weekly swing is information,
 *    and hiding it to look confident is the exact failure this product exists
 *    to avoid.
 *
 * 3. THE AGGRESSION POINTS AT THE PRICE, THE STORE OR THE BRAND, NEVER AT THE
 *    USER. Nothing on this screen tells the shopper what they should have done.
 *    Groceries are non-discretionary and the person standing there did not set
 *    the price.
 */

/**
 * What each category is actually compared against. Shown in the evidence
 * drawer, so the user can check that Shin answered the right question, not
 * merely that it produced a number.
 */
const CATEGORY = {
  grocery: {
    label: 'Groceries and household',
    basis: 'Compared on regular shelf price against this week\'s promotion, kept apart, never averaged into one number.',
  },
  tech: {
    label: 'New tech',
    basis: 'Compared against what other retailers charge for the same thing.',
  },
  used: {
    label: 'Used goods',
    basis: 'Compared against live comparable listings. Those are asking prices, so they lean high.',
  },
  furniture: {
    label: 'New furniture',
    basis: 'Compared against its own price history, because nobody else sells this item.',
  },
  produce: {
    label: 'Fresh produce',
    basis: 'Fresh produce moves week to week for reasons that are not promotions, so it is held to a higher bar.',
  },
};

/**
 * The five kinds of number, kept visibly apart. Collapsing them is the most
 * expensive mistake available here: a limit-8 loss leader and a regular shelf
 * price are not the same offer, and a verdict that averages them is wrong in
 * both directions.
 */
const KIND = {
  regular: { label: 'Regular price', firm: true, gloss: 'the everyday shelf price' },
  promotional: { label: 'On promotion', firm: false, gloss: 'time boxed, and it ends' },
  asking: { label: 'Asking price', firm: false, gloss: 'what a seller wants, not what it sold for' },
  sold: { label: 'Sold for', firm: true, gloss: 'what it actually cleared at' },
  list: { label: 'List price', firm: false, gloss: 'the manufacturer number, not a shop' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** "2026-09-03" to "3 Sep 2026", without letting a timezone move the day. */
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function daysAgo(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return null;
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86400000);
}

function ageWords(days) {
  if (days === null) return '';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** Freshness said in words, because a date nobody reads is not a disclosure. */
function oldestWords(days) {
  if (typeof days !== 'number' || !Number.isFinite(days)) return '';
  if (days <= 0) return 'all seen today';
  if (days === 1) return 'the oldest is a day old';
  return `the oldest is ${days} days old`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The rail: every price Shin found, plus the tag in front of the user, on one
 * line. It is not a summary and it invents nothing. Each tick is one real
 * observation, and the marker is the number on the shelf.
 */
function rail(result, cad) {
  const points = result.comparisonSet ?? [];
  const low = result.spread?.lowCents;
  const high = result.spread?.highCents;
  const asking = result.askingCents;
  if (typeof low !== 'number' || typeof high !== 'number' || typeof asking !== 'number') return '';

  const rawMin = Math.min(low, asking);
  const rawMax = Math.max(high, asking);
  const span = rawMax - rawMin;
  const pad = span > 0 ? span * 0.12 : Math.max(50, Math.abs(asking) * 0.2);
  const dMin = rawMin - pad;
  const dMax = rawMax + pad;
  const pct = (v) => ((v - dMin) / (dMax - dMin)) * 100;
  const clamp = (v) => Math.min(96, Math.max(4, v));

  const bandLeft = pct(low);
  const bandWidth = Math.max(1.5, pct(high) - pct(low));
  const youAt = pct(asking);

  const ticks = points
    .map((p) => {
      const k = KIND[p.kind] ?? KIND.regular;
      return `<span class="v-tick${k.firm ? '' : ' v-tick-soft'}" style="left:${pct(p.amountCents).toFixed(2)}%"
        title="${esc(p.seller)} ${esc(cad(p.amountCents))}, ${esc(k.label.toLowerCase())}"></span>`;
    })
    .join('');

  const outside = asking > high ? 'over' : asking < low ? 'under' : 'inside';

  return `
    <div class="v-rail" data-outside="${outside}">
      <div class="v-rail-you" style="left:${clamp(youAt).toFixed(2)}%">
        <span class="v-rail-you-label">your tag</span>
      </div>
      <div class="v-rail-track">
        <span class="v-rail-band" style="left:${bandLeft.toFixed(2)}%;width:${bandWidth.toFixed(2)}%"></span>
        ${ticks}
        <span class="v-rail-mark" style="left:${youAt.toFixed(2)}%"></span>
      </div>
      <div class="v-rail-ends">
        <span class="num" style="left:${clamp(bandLeft).toFixed(2)}%">${esc(cad(low))}</span>
        <span class="num" style="left:${clamp(pct(high)).toFixed(2)}%">${esc(cad(high))}</span>
      </div>
      <p class="v-rail-cap">Every price Shin found, lowest to highest. Nothing here is an average.</p>
    </div>`;
}

const DISAGREEMENT_HEAD = {
  wide_spread: (r) => `${r}x between the cheapest and the dearest, right now`,
  regular_vs_promotional: (r) => `The regular price and this week's promotion are ${r}x apart`,
  seller_conflict: (r) => `Sellers do not agree with each other, ${r}x apart`,
};

function disagreementBlock(d) {
  if (!d) return '';
  const head = (DISAGREEMENT_HEAD[d.kind] ?? DISAGREEMENT_HEAD.wide_spread)(d.ratio);
  return `
    <div class="v-dis">
      <p class="v-dis-head">${esc(head)}</p>
      <p class="v-dis-detail">${esc(d.detail)}</p>
    </div>`;
}

function evidenceRow(p, cad) {
  const k = KIND[p.kind] ?? KIND.regular;
  const days = daysAgo(p.observedAt);
  const bits = [];
  if (p.limit) bits.push(`<span class="v-chip v-chip-limit">${esc(p.limit)}</span>`);
  return `
    <li class="v-ev-row">
      <span class="v-ev-amount num">${esc(cad(p.amountCents))}</span>
      <span class="v-ev-body">
        <span class="v-ev-seller">${esc(p.seller)}</span>
        <span class="v-ev-kinds">
          <span class="v-chip${k.firm ? ' v-chip-firm' : ''}">${esc(k.label)}</span>
          ${bits.join('')}
        </span>
        <span class="v-ev-when">${esc(shortDate(p.observedAt))}, ${esc(ageWords(days))}</span>
        ${p.note ? `<span class="v-ev-note">${esc(p.note)}</span>` : ''}
      </span>
    </li>`;
}

function evidence(result, cad) {
  const points = [...(result.comparisonSet ?? [])].sort((a, b) => a.amountCents - b.amountCents);
  const cat = CATEGORY[result.identity?.category] ?? null;
  const seller = result.askingSource && result.askingSource !== 'given' ? result.askingSource : null;
  const kindsUsed = [...new Set(points.map((p) => p.kind))];

  return `
    <details class="v-ev">
      <summary>
        <span>Show me every price</span>
        <span class="v-ev-count num">${points.length}</span>
      </summary>
      <div class="v-ev-inner">
        ${cat ? `<p class="v-ev-basis"><b>${esc(cat.label)}.</b> ${esc(cat.basis)}</p>` : ''}
        <ul class="v-ev-list">${points.map((p) => evidenceRow(p, cad)).join('')}</ul>
        <dl class="v-ev-key">
          ${kindsUsed
            .map((id) => {
              const k = KIND[id] ?? KIND.regular;
              return `<div><dt>${esc(k.label)}</dt><dd>${esc(k.gloss)}</dd></div>`;
            })
            .join('')}
        </dl>
        <p class="v-ev-foot">
          Observed ${esc(shortDate(result.oldestObservedAt))}${
            result.oldestObservedAt !== result.newestObservedAt
              ? ` to ${esc(shortDate(result.newestObservedAt))}`
              : ''
          }.
          ${seller ? `Your tag at ${esc(seller)} is deliberately not in this list, so Shin is never comparing a price with itself.` : ''}
        </p>
      </div>
    </details>`;
}

/**
 * A refusal is a correct answer, not a failure, so it gets a real screen rather
 * than an error. The scan screen records whatever the engine returned, and "I
 * cannot price this, and here is why" is a success state in this product.
 */
function refusalView(result, ctx) {
  const { faceSvg, cad } = ctx.shin;
  const points = [...(result.evidence ?? [])].sort((a, b) => a.amountCents - b.amountCents);
  return `
    <section class="v-hero" data-tier="fair">
      <div class="v-face">${faceSvg('fair', 88)}</div>
      <div class="v-hero-txt">
        <p class="v-word">No verdict</p>
        <p class="v-price"><span class="v-at">Shin will not guess this one</span></p>
      </div>
    </section>
    <div class="v-lines"><p class="v-line">${esc(result.detail)}</p></div>
    ${
      points.length
        ? `<details class="v-ev"><summary><span>What Shin did find</span><span class="v-ev-count num">${points.length}</span></summary>
             <div class="v-ev-inner"><ul class="v-ev-list">${points.map((p) => evidenceRow(p, cad)).join('')}</ul></div>
           </details>`
        : '<p class="v-none">Nothing came back at all. That is recorded as nothing, not filled in.</p>'
    }
    <div class="v-acts">
      <button class="btn btn-primary" data-go="scan" type="button">Scan something else</button>
      <button class="btn-link" data-go="correct" type="button">I know what this is, let me tell Shin</button>
    </div>`;
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
  id: 'verdict',
  title: 'The verdict',

  render(root, ctx) {
    const entry = entryFor(ctx);
    if (!entry || !entry.result) {
      ctx.replace('scan');
      return;
    }

    const result = entry.result;
    const { faceSvg, tierOf, cad, confidenceLine } = ctx.shin;

    if (result.kind !== 'verdict') {
      root.innerHTML = refusalView(result, ctx);
      root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-go]');
        if (btn) ctx.go(btn.dataset.go);
      });
      return;
    }

    const tier = tierOf(result.tier);
    const identity = result.identity ?? {};
    const conf = result.confidence ?? null;
    const seller = result.askingSource && result.askingSource !== 'given' ? result.askingSource : null;
    const idShaky = typeof identity.confidence === 'number' && identity.confidence < 0.95;

    const confSpecifics = conf
      ? [
          plural(conf.pointCount, 'price', 'prices'),
          plural(conf.distinctSellers, 'seller', 'sellers'),
          oldestWords(conf.oldestPointAgeDays),
        ]
          .filter(Boolean)
          .join(', ')
      : '';

    root.innerHTML = `
      <section class="v-hero" data-tier="${esc(result.tier)}">
        <div class="v-face">${faceSvg(result.tier, 88)}</div>
        <div class="v-hero-txt">
          <p class="v-word">${esc(tier.word)}</p>
          <p class="v-price">
            <span class="v-amount num">${esc(cad(result.askingCents))}</span>
            ${seller ? `<span class="v-at">at ${esc(seller)}</span>` : '<span class="v-at">on the tag</span>'}
          </p>
        </div>
      </section>

      <button class="v-ident" type="button" data-fix="item">
        <span class="v-ident-name">${esc(identity.label ?? 'This item')}</span>
        <span class="v-ident-fix">${idShaky ? 'not sure, tap to fix' : 'tap to fix'}</span>
      </button>
      ${
        idShaky
          ? '<p class="v-ident-warn">Shin is not certain this is even the right item. The price is only as right as the name above it.</p>'
          : ''
      }

      <div class="v-lines">
        ${(result.lines ?? []).map((line) => `<p class="v-line">${esc(line)}</p>`).join('')}
      </div>

      ${rail(result, cad)}

      ${
        conf
          ? `<div class="v-conf" data-band="${esc(conf.band)}">
               <p class="v-conf-line">${esc(confidenceLine(conf))}</p>
               ${confSpecifics ? `<p class="v-conf-spec">${esc(confSpecifics)}.</p>` : ''}
             </div>`
          : ''
      }

      ${disagreementBlock(result.disagreement)}

      ${evidence(result, cad)}

      <div class="v-acts">
        <button class="btn btn-primary" data-go="actions" type="button">Save it and watch the price</button>
        <button class="btn btn-quiet" type="button" data-fix="price">Shin has this wrong</button>
      </div>
    `;

    const onClick = (e) => {
      const fix = e.target.closest('[data-fix]');
      if (fix) {
        ctx.go('correct', { fix: fix.dataset.fix });
        return;
      }
      const go = e.target.closest('[data-go]');
      if (go) ctx.go(go.dataset.go);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  },
};
