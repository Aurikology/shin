/**
 * Stage 05: what it thinks it is.
 *
 * This screen exists because of one measured failure. The hand pilot answered a
 * used Canon EOS R6 query with an R6 Mark II bundled with lenses at nearly
 * triple, and every price attached to it was accurate. Identity is the step that
 * decides whether anything downstream is right, so it is shown before any
 * verdict and it is always contestable.
 *
 * The engine returns exactly one of two things, both as a normal 200, and both
 * are correct answers: a verdict, or a refusal. Nothing in here may render a
 * refusal as a failure. A wrong verdict is worse than no verdict, so "I cannot
 * price this, and here is why" is the success state this screen was built for,
 * and each of the eight reasons gets its own repair path rather than one shared
 * apology.
 *
 * The only thing that is treated as an error is the request itself not
 * completing, which is the app breaking rather than Shin declining.
 */

const CATEGORY_FALLBACK = {
  grocery: 'Groceries and household',
  tech: 'New tech',
  used: 'Used goods',
  furniture: 'New furniture',
  produce: 'Fresh produce',
};

const KIND_WORD = {
  regular: 'regular shelf price',
  promotional: 'on promotion',
  asking: 'asking price',
  sold: 'sold for',
  list: 'manufacturer list',
};

/** Shin's line for each refusal. The detail underneath is the engine's own. */
const HEADLINE = {
  no_identity: 'I cannot place this one.',
  identity_unsure: 'Hold on, which one is this?',
  category_unsupported: 'I do not price this kind of thing yet.',
  no_source_response: 'I know the thing. Nobody has a price for it.',
  too_few_points: 'Not enough prices to call it.',
  points_too_stale: 'The prices I have are too old to trust.',
  comparison_incoherent: 'These prices do not agree with each other.',
  no_asking_price: 'I need the price on the tag.',
};

function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function parsePrice(raw) {
  const cleaned = String(raw ?? '').trim().replace(/^\$/, '').replace(/,/g, '.').replace(/\s/g, '');
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const dollars = Number(cleaned);
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : null;
}

function categoryLabel(id) {
  return CATEGORY_FALLBACK[id] ?? id;
}

/**
 * The engine appends its recorded doubt in brackets. Split it out so the
 * sentence reads and the note keeps its own weight. The words are not changed.
 */
function splitDetail(detail) {
  const m = /^([\s\S]*?)\s\(([\s\S]{40,})\)$/.exec(String(detail ?? ''));
  return m ? { lead: m[1], note: m[2] } : { lead: String(detail ?? ''), note: null };
}

export default {
  id: 'identify',
  title: 'What it thinks it is',

  render(root, ctx) {
    const p = ctx.params ?? {};

    let query = {
      text: p.text || undefined,
      gtin: p.gtin || undefined,
      category: p.category || undefined,
      askingCents:
        p.cents !== undefined && Number.isFinite(Number(p.cents)) ? Number(p.cents) : undefined,
      askingSeller: p.seller || undefined,
    };

    let alive = true;
    let timer = null;
    let shelf = null;
    let rules = null;
    let rulesLoaded = false;
    /** The identity id the user has already said yes to, so a loop is visible. */
    let confirmedId = null;

    // Both of these are shelf furniture for the repair paths, never the answer.
    // They load beside the price call rather than after it, so a refusal has its
    // alternatives ready the moment it lands. A refusal WAITS for them: rendering
    // before they land once printed "nothing is recorded that would reverse it"
    // over a category that has a recorded reversing condition, which is a false
    // sentence produced by a race rather than by the data.
    const shelfReady = ctx.api
      .catalogue()
      .then((d) => { shelf = d; })
      .catch(() => { shelf = null; });
    const rulesReady = ctx.api
      .categories()
      .then((d) => { rules = d; rulesLoaded = true; })
      .catch(() => { rules = null; rulesLoaded = false; });

    function askedLine() {
      const bits = [];
      if (query.gtin) bits.push(`barcode ${query.gtin}`);
      if (query.text) bits.push(`&ldquo;${esc(query.text)}&rdquo;`);
      if (query.askingCents !== undefined) bits.push(`at ${ctx.shin.cad(query.askingCents)}`);
      if (query.askingSeller) bits.push(`from ${esc(query.askingSeller)}`);
      const via = {
        shelf: 'Picked off Shin&rsquo;s shelf.',
        barcode: 'From a barcode.',
        shot: 'From a screenshot, with the item named by hand because reading it out of the picture is not built.',
        demo: 'The demo item, with a stand-in tag price.',
      }[p.via];
      return `${bits.join(' ')}${via ? ` <span class="id-via">${via}</span>` : ''}`;
    }

    function paintLoading() {
      root.innerHTML = `
        <div class="id-wrap">
          <p class="kicker">Stage 05 &middot; what it thinks it is</p>
          <div class="id-thinking">
            <div class="id-shin">&#129300;</div>
            <div>
              <h2 class="id-working">Shin is looking it up.</h2>
              <p class="id-asked">${askedLine()}</p>
            </div>
          </div>
          <div class="id-bar"><span></span></div>
          <p class="note">Identity first, prices second. A confident price attached to the wrong
            product is the worst thing this app can hand you, so it is the thing being settled
            right now.</p>
        </div>`;
    }

    async function run() {
      paintLoading();
      let result;
      try {
        result = await ctx.api.price(query);
      } catch (err) {
        if (!alive) return;
        paintBroken(err);
        return;
      }
      if (!alive) return;
      if (result && result.kind === 'verdict') {
        paintVerdict(result);
        return;
      }
      // A refusal is only as good as its repair path, and the repair path is
      // built out of the shelf and the category rules.
      await Promise.allSettled([shelfReady, rulesReady]);
      if (!alive) return;
      paintRefusal(result);
    }

    /* --- the request itself failed. Not a refusal, and not dressed up as one. --- */
    function paintBroken(err) {
      root.innerHTML = `
        <div class="id-wrap">
          <p class="kicker">Stage 05</p>
          <h1>That is on us, not on the price.</h1>
          <p>The lookup did not complete: ${esc(err && err.message ? err.message : err)}.</p>
          <p class="note">This is the app failing, not Shin declining to answer. Nothing was
            judged, so nothing is being shown.</p>
          <button class="btn btn-primary" id="id-retry" type="button">Try again</button>
          <button class="btn btn-quiet" id="id-back" type="button">Back to the shelf</button>
        </div>`;
      root.querySelector('#id-retry').addEventListener('click', run);
      root.querySelector('#id-back').addEventListener('click', backToScan);
    }

    /* --- a verdict: show what it is, then hand off --- */
    function paintVerdict(result) {
      // Stored before the handoff, because the verdict screen reads the result
      // out of history rather than being handed it through the URL.
      ctx.store.recordVerdict(result, query);

      const id = result.identity;
      const pct = Math.round((id.confidence ?? 0) * 100);
      root.innerHTML = `
        <div class="id-wrap">
          <p class="kicker">Stage 05 &middot; what it thinks it is</p>
          <div class="id-card">
            <p class="id-eyebrow">Shin has this as</p>
            <h1 class="id-name">${esc(id.label)}</h1>
            <p class="id-meta">
              <span class="tag">${esc(categoryLabel(id.category))}</span>
              <span class="id-conf">${pct}% sure it is this exact product</span>
            </p>
            <p class="id-because">${esc(ctx.shin.confidenceLine(result.confidence))}</p>
          </div>
          <div class="id-handoff"><span></span></div>
          <button class="btn btn-primary" id="id-see" type="button">See the verdict</button>
          <button class="btn-link" id="id-notit" type="button">Hold on, that is not it</button>
          <p class="note">Say so now if the name above is wrong. A verdict on the wrong product is
            the one failure this whole screen exists to catch, and every number after this point
            is about the thing named above.</p>
        </div>`;

      const goOn = () => {
        clearTimeout(timer);
        ctx.go('verdict', { id: id.id });
      };
      root.querySelector('#id-see').addEventListener('click', goOn);
      root.querySelector('#id-notit').addEventListener('click', () => {
        clearTimeout(timer);
        ctx.go('scan', { notit: 1, was: id.label, cents: result.askingCents, seller: p.seller ?? '' });
      });
      // Brief on purpose. The walkthrough is explicit that asking before the
      // reveal kills the reveal, so the name is shown and then it moves.
      timer = setTimeout(() => { if (alive) goOn(); }, 1400);
    }

    /**
     * "Which one is this?" is the wrong question to ask twice. Once the user has
     * answered it, the headline says what actually happened rather than asking
     * again over the same screen.
     */
    function headlineFor(r) {
      if (r.reason === 'identity_unsure' && r.identity && confirmedId === r.identity.id) {
        return 'You answered, and I still will not call it.';
      }
      return HEADLINE[r.reason] ?? 'I am not going to call this one.';
    }

    /* --- a refusal: the reason, in plain words, and a way out of it --- */
    function paintRefusal(r) {
      const { lead, note } = splitDetail(r.detail);
      const id = r.identity;
      const pct = id ? Math.round((id.confidence ?? 0) * 100) : null;

      root.innerHTML = `
        <div class="id-wrap id-refusal id-r-${esc(r.reason)}">
          <p class="kicker">Stage 05 &middot; Shin is not going to call this one</p>
          <div class="id-thinking">
            <div class="id-shin id-shin-flat">&#129300;</div>
            <h1 class="id-head">${esc(headlineFor(r))}</h1>
          </div>

          <p class="id-asked">You gave ${askedLine()}</p>
          <p class="id-detail">${esc(lead)}</p>
          ${note ? `<p class="id-note-recorded"><span class="tag">What happened last time</span>${esc(note)}</p>` : ''}

          ${
            id
              ? `<p class="id-closest">Closest match: <strong>${esc(id.label)}</strong>
                   <span class="tag">${esc(categoryLabel(id.category))}</span>
                   <span class="id-conf">${pct}% sure</span></p>`
              : ''
          }

          ${evidenceBlock(r)}

          <div class="id-repair">${repairBlock(r)}</div>

          <p class="id-floor">This is an answer, not a crash. Shin will not put a number on
            something it cannot stand behind.</p>
        </div>`;

      bindRepair(r);
    }

    function evidenceBlock(r) {
      const ev = r.evidence ?? [];
      if (ev.length === 0) return '';
      const rows = ev
        .map(
          (pt) => `
            <tr>
              <td>${esc(pt.seller)}</td>
              <td class="num">${ctx.shin.cad(pt.amountCents)}</td>
              <td>${esc(KIND_WORD[pt.kind] ?? pt.kind)}${pt.limit ? `, ${esc(pt.limit)}` : ''}</td>
              <td class="num">${esc(String(pt.observedAt).slice(0, 10))}</td>
            </tr>`,
        )
        .join('');
      // The heading is not one sentence for every reason. On a missing tag price
      // the set was fine and only the subject was absent, and calling that set
      // "not enough" would be Shin blaming its own data for the user's blank.
      const head =
        r.reason === 'no_asking_price'
          ? 'What Shin will compare against, the moment you give it a price'
          : 'What Shin did find, and it was not enough';
      return `
        <div class="id-evidence">
          <p class="id-ev-head">${head}</p>
          <table>
            <thead><tr><th>Seller</th><th>Price</th><th>Kind</th><th>Seen</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    /**
     * Other things on the shelf, for a "which one is it" fix.
     *
     * Three at most, because the walkthrough's own mock for this moment is three
     * alternatives and a way out, not a catalogue dump. They are labelled with
     * where they came from: on a seven-item shelf the nearest other used item
     * may be an armchair, and an unlabelled armchair under a camera looks like a
     * bug rather than an honest short list.
     */
    function alternatives(categoryId, excludeId) {
      const all = (shelf?.items ?? []).filter((i) => i.id !== excludeId);
      const sameCat = all.filter((i) => !categoryId || i.category === categoryId);
      const pool = sameCat.length > 0 ? sameCat : all;
      if (pool.length === 0) {
        return shelf
          ? ''
          : '<p class="id-alt-head">The shelf did not load, so there is nothing to offer instead.</p>';
      }
      const head =
        sameCat.length > 0 && categoryId
          ? `Other ${esc(categoryLabel(categoryId).toLowerCase())} Shin has priced by hand`
          : 'Or pick from the shelf';
      return `
        <p class="id-alt-head">${head}</p>
        ${pool
          .slice(0, 3)
          .map(
            (i) =>
              `<button type="button" class="btn btn-quiet id-alt" data-alt="${esc(i.id)}">${esc(i.label)}</button>`,
          )
          .join('')}`;
    }

    function ruleFor(categoryId) {
      return (rules ?? []).find((r) => r.id === categoryId) ?? null;
    }

    function repairBlock(r) {
      const id = r.identity;

      if (r.reason === 'no_asking_price') {
        return `
          <p class="id-fix-head">Type what the tag says and Shin will finish this.</p>
          <div class="id-amount">
            <span class="id-cur">$</span>
            <input type="text" id="id-price" inputmode="decimal" autocomplete="off" placeholder="2.00">
          </div>
          <label class="field" for="id-seller">Where you are standing</label>
          <input type="text" id="id-seller" autocomplete="off" placeholder="Metro"
                 value="${esc(query.askingSeller ?? '')}">
          <p class="id-err" id="id-price-err" hidden></p>
          <button class="btn btn-primary" id="id-price-go" type="button">Price it</button>`;
      }

      if (r.reason === 'identity_unsure') {
        if (confirmedId && id && confirmedId === id.id) {
          const rule = ruleFor(id.category);
          return `
            <p class="id-fix-head">Confirming does not move this one, and that is the honest
              outcome.</p>
            <p>You said it is the ${esc(id.label)} and Shin still will not price it. The doubt is in
              the record rather than in the match: this item was written down as ${Math.round(
                (id.confidence ?? 0) * 100,
              )}% certain by the person who priced it,
              and ${esc(categoryLabel(id.category).toLowerCase())} needs more certainty than that
              before a number goes on the screen${
                rule
                  ? `, plus ${rule.minPoints} prices from ${rule.minDistinctSellers} sellers inside ${rule.maxAgeDays} days`
                  : ''
              }.</p>
            <p class="note">This is the case the whole engine was built around. The version that
              guessed here returned prices for a different camera and every one of them was
              accurate.</p>
            ${alternatives(id.category, id.id)}
            <button class="btn btn-quiet" id="id-back" type="button">Scan something else</button>`;
        }
        return `
          <p class="id-fix-head">Is this it?</p>
          <button class="btn btn-primary" id="id-confirm" type="button">
            Yes, that is the ${esc(id ? id.label : 'one')}
          </button>
          ${id ? alternatives(id.category, id.id) : alternatives(null, null)}
          <button class="btn-link" id="id-back" type="button">None of these, take me back</button>`;
      }

      if (r.reason === 'no_identity') {
        return `
          <p class="id-fix-head">Tell Shin what it is and it will look again.</p>
          <input type="text" id="id-text" autocomplete="off" placeholder="Kraft Dinner 225g"
                 value="${esc(query.text ?? '')}">
          <button class="btn btn-primary" id="id-text-go" type="button">Look it up</button>
          ${alternatives(null, null)}
          <button class="btn-link" id="id-back" type="button">Show me the whole shelf</button>`;
      }

      if (r.reason === 'category_unsupported') {
        const rule = ruleFor(id?.category);
        return `
          <p class="id-fix-head">What would change this</p>
          <p>${esc(
            rule?.unsupported?.reversedBy ??
              (rulesLoaded
                ? 'Nothing is recorded that would reverse it yet.'
                : 'The reversing condition did not load, so it is not being quoted from memory here.'),
          )}</p>
          <p class="note">The whole category is declined, so trying a different orange will get the
            same answer. That is a decision with a condition on it rather than a gap.</p>
          <button class="btn btn-primary" id="id-back" type="button">Scan something else</button>`;
      }

      if (r.reason === 'comparison_incoherent') {
        return `
          <p class="id-fix-head">Most likely there are two products in that set.</p>
          <p>Pick the one you are actually holding and Shin will compare against that instead.</p>
          ${alternatives(id?.category, id?.id ?? null)}
          <button class="btn btn-quiet" id="id-back" type="button">Scan something else</button>`;
      }

      // no_source_response, too_few_points, points_too_stale. The repair is not
      // in the user's hands: it is a thinner set than the category allows.
      const rule = ruleFor(id?.category);
      return `
        <p class="id-fix-head">Nothing you can type fixes this one.</p>
        <p>${
          rule
            ? `${esc(rule.label)} needs ${rule.minPoints} usable prices from ${rule.minDistinctSellers} sellers, none older than ${rule.maxAgeDays} days. That bar is why this is blank rather than wrong.`
            : 'The set Shin has is thinner than the category allows, which is why this is blank rather than wrong.'
        }</p>
        <button class="btn btn-primary" id="id-back" type="button">Scan something else</button>
        <button class="btn btn-quiet" id="id-again" type="button">Ask again</button>`;
    }

    function bindRepair(r) {
      root.querySelector('#id-back')?.addEventListener('click', backToScan);
      root.querySelector('#id-again')?.addEventListener('click', run);

      root.querySelectorAll('[data-alt]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = (shelf?.items ?? []).find((i) => i.id === btn.dataset.alt);
          if (!item) return;
          confirmedId = null;
          query = { ...query, text: item.label, category: item.category, gtin: undefined };
          run();
        });
      });

      root.querySelector('#id-confirm')?.addEventListener('click', () => {
        if (!r.identity) return;
        confirmedId = r.identity.id;
        query = { ...query, text: r.identity.label, category: r.identity.category };
        run();
      });

      const textGo = root.querySelector('#id-text-go');
      if (textGo) {
        const field = root.querySelector('#id-text');
        const send = () => {
          const typed = field.value.trim();
          if (typed === '') return;
          query = { ...query, text: typed, gtin: undefined };
          run();
        };
        textGo.addEventListener('click', send);
        field.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      }

      const priceGo = root.querySelector('#id-price-go');
      if (priceGo) {
        const field = root.querySelector('#id-price');
        const sellerField = root.querySelector('#id-seller');
        const err = root.querySelector('#id-price-err');
        const send = () => {
          const cents = parsePrice(field.value);
          if (cents === null) {
            err.hidden = false;
            err.textContent = 'That did not read as a number. Type it with a dot for the decimal.';
            return;
          }
          query = {
            ...query,
            askingCents: cents,
            askingSeller: sellerField.value.trim() || undefined,
          };
          run();
        };
        priceGo.addEventListener('click', send);
        field.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      }
    }

    function backToScan() {
      ctx.go('scan', {
        cents: query.askingCents ?? '',
        seller: query.askingSeller ?? '',
      });
    }

    run();

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  },
};
