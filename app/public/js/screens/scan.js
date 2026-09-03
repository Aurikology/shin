/**
 * Stage 04: the first scan.
 *
 * The walkthrough's one hard fact about this screen: most people install this on
 * a couch, from a video, with nothing in front of them to scan. So it has to
 * work with nothing to point at, and it has to work in one action.
 *
 * The floor settles the input question and this screen obeys it: barcode and
 * screenshot only, live photo recognition is out of v1. It is the weakest
 * component at 77% top-1 and the problem statement deliberately does not require
 * it. There is therefore no camera in here, and pretending otherwise would be
 * the first lie the app tells.
 *
 * The seven-item shelf is shown rather than hidden. An app that pretends to know
 * everything and then fails is worse than one that shows its shelf, and seven is
 * not a demo limit: it is what has been priced by hand.
 *
 * The price on the tag is collected here because the engine refuses without one,
 * and it is collected as part of the scan rather than as a form field: the thing
 * and its tag are one observation.
 */

const CATEGORY_FALLBACK = {
  grocery: 'Groceries and household',
  tech: 'New tech',
  used: 'Used goods',
  furniture: 'New furniture',
  produce: 'Fresh produce',
};

/** Stores that actually appear in the hand-recorded set, plus the two marketplaces. */
const STORE_CHIPS = ['Metro', 'Walmart', 'Loblaws', 'Sobeys', 'Best Buy', 'Kijiji'];

function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Dollars as typed to whole cents. Returns null when it does not read as money. */
function parsePrice(raw) {
  const cleaned = String(raw ?? '').trim().replace(/^\$/, '').replace(/,/g, '.').replace(/\s/g, '');
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

export default {
  id: 'scan',
  title: 'Scan',

  render(root, ctx) {
    const params = ctx.params ?? {};

    const state = {
      // Which input path is open. The shelf is open by default because it is the
      // only one that works on a couch with nothing typed.
      path: ['shelf', 'barcode', 'shot'].includes(params.path) ? params.path : 'shelf',
      itemId: null,
      barcode: '',
      price: params.cents ? (Number(params.cents) / 100).toFixed(2) : '',
      seller: params.seller ?? '',
      shotName: null,
      shotUrl: null,
      catalogue: null,
      catalogueError: null,
      loading: true,
      error: '',
    };

    let disposed = false;

    // Loaded, never assumed. If the shelf cannot be read, the screen says so
    // rather than showing an empty list that looks like an app with no data.
    ctx.api
      .catalogue()
      .then((data) => {
        if (disposed) return;
        state.catalogue = data;
        state.loading = false;
        paint();
      })
      .catch((err) => {
        if (disposed) return;
        state.catalogueError = err && err.message ? err.message : String(err);
        state.loading = false;
        paint();
      });

    function items() {
      return state.catalogue?.items ?? [];
    }

    function selected() {
      return items().find((i) => i.id === state.itemId) ?? null;
    }

    function categoryLabel(id) {
      return CATEGORY_FALLBACK[id] ?? id;
    }

    function shelfRows() {
      const list = items();
      if (state.loading) return '<p class="sc-loading">Reading the shelf.</p>';
      if (state.catalogueError) {
        return `<p class="sc-fail">The shelf did not load: ${esc(state.catalogueError)}.
          Nothing here is guessed to fill the gap.</p>`;
      }
      if (list.length === 0) return '<p class="sc-fail">The shelf is empty.</p>';
      return list
        .map((item) => {
          const on = item.id === state.itemId;
          const points =
            item.pointCount === 0
              ? 'no prices on file'
              : `${item.pointCount} hand-recorded price${item.pointCount === 1 ? '' : 's'}`;
          const declined = item.category === 'produce';
          // Five of the seven refuse. A shelf that lists them all identically
          // walks the user into a dead end and only tells them afterwards, so
          // the row says up front which ones end in an answer. The flag is the
          // server's, measured by actually pricing each item, not guessed here
          // from the point count.
          const answers = item.answerable === true;
          const known = typeof item.answerable === 'boolean';
          return `
            <button type="button" class="sc-item${on ? ' is-on' : ''}" data-pick="${esc(item.id)}"
                    aria-pressed="${on}">
              <span class="sc-item-label">${esc(item.label)}</span>
              <span class="sc-item-meta">
                <span class="tag">${esc(categoryLabel(item.category))}</span>
                <span class="sc-item-points">${points}</span>
                ${declined ? '<span class="tag sc-tag-no">Shin declines this category</span>' : ''}
                ${
                  known && !declined
                    ? answers
                      ? '<span class="tag sc-tag-yes">Shin can price this</span>'
                      : '<span class="tag sc-tag-no">Not enough to price it yet</span>'
                    : ''
                }
              </span>
            </button>`;
        })
        .join('');
    }

    function barcodePanel() {
      const withCode = items().filter((i) => i.gtin).length;
      const total = items().length;
      const honesty = state.loading
        ? '<p class="sc-loading">Checking which items carry a barcode.</p>'
        : withCode === 0
          ? `<p class="note">None of the ${total} hand-priced items carries a barcode yet, so a
             number typed here will come back as "I cannot place this". That is the honest answer
             and not a bug. The barcode path is the one that skips recognition entirely, so it
             stays on the screen and gets its codes when the feed does.</p>`
          : `<p class="note">${withCode} of the ${total} items carry a barcode. The rest have to be
             picked by name.</p>`;
      return `
        <label class="field" for="sc-barcode">The barcode under the price</label>
        <input type="text" id="sc-barcode" inputmode="numeric" autocomplete="off"
               placeholder="0 68100 08424 5" value="${esc(state.barcode)}">
        ${honesty}`;
    }

    function shotPanel() {
      const preview = state.shotUrl
        ? `<figure class="sc-shot">
             <img src="${esc(state.shotUrl)}" alt="The screenshot you picked">
             <figcaption>${esc(state.shotName)}</figcaption>
           </figure>`
        : '';
      return `
        <input type="file" id="sc-shot-input" accept="image/*" class="sc-file">
        <label class="btn btn-quiet sc-file-btn" for="sc-shot-input">
          ${state.shotUrl ? 'Pick a different screenshot' : 'Choose a screenshot'}
        </label>
        ${preview}
        <p class="note">Reading the product and the price out of an image is not built. Shin is not
          going to pretend it looked. The picture stays on your phone, nothing is uploaded, and it
          is here as your reminder while you tell Shin which of the seven it is.</p>
        <div class="sc-shelf">${shelfRows()}</div>`;
    }

    function panel() {
      if (state.path === 'barcode') return barcodePanel();
      if (state.path === 'shot') return shotPanel();
      return `<div class="sc-shelf">${shelfRows()}</div>`;
    }

    function readyMessage() {
      if (state.path === 'barcode') {
        return state.barcode.trim() === '' ? 'Type the barcode, or pick from the shelf.' : '';
      }
      return state.itemId === null ? 'Pick one of the seven first.' : '';
    }

    function paint() {
      const pick = selected();
      const notIt = params.notit
        ? `<div class="sc-notit">
             <strong>Not ${esc(params.was ?? 'that one')}.</strong>
             Noted. Pick the right one and Shin will start again.
           </div>`
        : '';
      const shelfLine = state.catalogue
        ? `Shin knows ${items().length} things, and that is the whole shelf, priced by
           hand on ${esc(state.catalogue.recordedAt)}.${
             typeof state.catalogue.answerableCount === 'number'
               ? ` He can give a real verdict on ${state.catalogue.answerableCount} of them. The rest
                   are marked, because finding out at the end is worse than knowing now.`
               : ''
           }`
        : 'Shin knows a short list of things, and it is about to show you all of it.';

      root.innerHTML = `
        <div class="sc-wrap">
          <p class="kicker">Stage 04 &middot; the first scan</p>
          <h1>What are you looking at?</h1>
          <p class="sc-lede">${shelfLine}</p>
          ${notIt}

          <div class="sc-paths" role="group" aria-label="How to tell Shin what this is">
            <button type="button" data-path="shelf" class="${state.path === 'shelf' ? 'is-on' : ''}"
                    aria-pressed="${state.path === 'shelf'}">Shin&rsquo;s shelf</button>
            <button type="button" data-path="barcode" class="${state.path === 'barcode' ? 'is-on' : ''}"
                    aria-pressed="${state.path === 'barcode'}">Barcode</button>
            <button type="button" data-path="shot" class="${state.path === 'shot' ? 'is-on' : ''}"
                    aria-pressed="${state.path === 'shot'}">Screenshot</button>
          </div>

          <div class="card sc-panel">${panel()}</div>

          <div class="sc-ticket">
            <p class="sc-ticket-head">
              ${pick ? esc(pick.label) : state.path === 'barcode' && state.barcode.trim() !== ''
                ? `Barcode ${esc(state.barcode)}`
                : 'Nothing picked yet'}
            </p>
            <div class="sc-money">
              <label class="field" for="sc-price">The price on the tag</label>
              <div class="sc-amount">
                <span class="sc-cur">$</span>
                <input type="text" id="sc-price" inputmode="decimal" autocomplete="off"
                       placeholder="2.00" value="${esc(state.price)}">
              </div>
            </div>
            <label class="field" for="sc-seller">Where you are standing</label>
            <input type="text" id="sc-seller" autocomplete="off" placeholder="Metro"
                   value="${esc(state.seller)}">
            <div class="sc-chips">
              ${STORE_CHIPS.map(
                (s) =>
                  `<button type="button" class="sc-chip${
                    s.toLowerCase() === state.seller.trim().toLowerCase() ? ' is-on' : ''
                  }" data-seller="${esc(s)}">${esc(s)}</button>`,
              ).join('')}
            </div>
            <p class="note">Shin takes this store out of the comparison, so a price is never judged
              against itself. Without the tag price there is nothing to judge, and Shin will say so
              rather than pick a number to judge.</p>
          </div>

          ${state.error ? `<p class="sc-err" role="alert">${esc(state.error)}</p>` : ''}

          <button class="btn btn-primary" id="sc-go" type="button">Check this price</button>
          <p class="sc-hint">${esc(readyMessage())}</p>
          <button class="btn-link" id="sc-demo" type="button">
            Try the one that always works
          </button>
          <p class="sc-hint sc-hint-quiet">Fills in a hand-priced box of Kraft Dinner and a
            stand-in tag price of $2.00 at Metro. The $2.00 is typed for you, not observed.</p>

          <details class="sc-prov">
            <summary>Where these seven prices came from</summary>
            <p>${esc(state.catalogue?.provenance ?? 'The shelf has not loaded, so its provenance is not shown.')}</p>
            <p class="sc-prov-floor">No live camera in this version. Recognising an object from a
              photo is the weakest part of the idea, so v1 takes a barcode or a screenshot and asks
              you to confirm the rest.</p>
          </details>
        </div>
      `;

      bind();
    }

    function bind() {
      root.querySelectorAll('[data-path]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.path = btn.dataset.path;
          state.error = '';
          paint();
        });
      });

      root.querySelectorAll('[data-pick]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const picked = state.itemId !== btn.dataset.pick;
          state.itemId = picked ? btn.dataset.pick : null;
          state.error = '';
          paint();
          // Picking the thing and reading its tag is one motion, so the tag
          // comes to the user rather than waiting to be scrolled to.
          if (picked) {
            root.querySelector('.sc-ticket')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        });
      });

      root.querySelectorAll('[data-seller]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.seller = state.seller.trim().toLowerCase() === btn.dataset.seller.toLowerCase()
            ? ''
            : btn.dataset.seller;
          paint();
        });
      });

      const price = root.querySelector('#sc-price');
      if (price) {
        price.addEventListener('input', () => {
          state.price = price.value;
          state.error = '';
        });
        price.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submit();
        });
      }

      const seller = root.querySelector('#sc-seller');
      if (seller) {
        seller.addEventListener('input', () => {
          state.seller = seller.value;
          // Kept in step without a repaint, which would take the focus out of
          // the field mid-word.
          const typed = state.seller.trim().toLowerCase();
          root.querySelectorAll('[data-seller]').forEach((chip) => {
            chip.classList.toggle('is-on', chip.dataset.seller.toLowerCase() === typed);
          });
        });
      }

      const barcode = root.querySelector('#sc-barcode');
      if (barcode) {
        barcode.addEventListener('input', () => {
          state.barcode = barcode.value;
          state.error = '';
        });
        barcode.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submit();
        });
      }

      const shot = root.querySelector('#sc-shot-input');
      if (shot) {
        shot.addEventListener('change', () => {
          const file = shot.files && shot.files[0];
          if (!file) return;
          if (state.shotUrl) URL.revokeObjectURL(state.shotUrl);
          state.shotUrl = URL.createObjectURL(file);
          state.shotName = file.name;
          paint();
        });
      }

      root.querySelector('#sc-go')?.addEventListener('click', submit);
      root.querySelector('#sc-demo')?.addEventListener('click', demo);
    }

    function demo() {
      const kd = items().find((i) => i.id === 'kd-original-225g')
        ?? items().find((i) => i.pointCount >= 2);
      if (!kd) {
        state.error = 'The shelf has not loaded, so there is nothing to demonstrate with.';
        paint();
        return;
      }
      ctx.go('identify', {
        text: kd.label,
        category: kd.category,
        cents: 200,
        seller: 'Metro',
        via: 'demo',
      });
    }

    function submit() {
      const cents = parsePrice(state.price);
      if (state.price.trim() !== '' && cents === null) {
        state.error = 'That price did not read as a number. Type it with a dot for the decimal.';
        paint();
        return;
      }

      const params_ = { via: state.path };
      if (state.path === 'barcode' && state.barcode.trim() !== '') {
        params_.gtin = state.barcode.trim();
      }
      const pick = selected();
      if (pick) {
        params_.text = pick.label;
        params_.category = pick.category;
      }
      if (!params_.gtin && !params_.text) {
        state.error =
          state.path === 'barcode'
            ? 'Type a barcode, or switch to the shelf and pick one of the seven.'
            : 'Pick one of the seven first. Shin will not go looking for something it has no prices for.';
        paint();
        return;
      }
      if (cents !== null) params_.cents = cents;
      if (state.seller.trim() !== '') params_.seller = state.seller.trim();

      ctx.go('identify', params_);
    }

    paint();

    return () => {
      disposed = true;
      if (state.shotUrl) URL.revokeObjectURL(state.shotUrl);
    };
  },
};
