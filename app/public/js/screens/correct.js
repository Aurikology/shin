/**
 * Stage 06b: Shin is wrong and the user knows it.
 *
 * This is a branch off the verdict, not a step after it. Prices are verifiable
 * and consequential: the seller will argue, and the shopper can check the claim
 * in ten seconds. So the most likely interaction after a bad scan is this one,
 * and it ships in v1 because it is the data pipeline rather than a nicety.
 *
 * Two rules hold this screen down.
 *
 * NEVER MAKE THE USER FEEL STUPID FOR HAVING BEEN RIGHT. One tap picks the
 * path, one field carries the fact, Shin concedes. There is no form, no
 * account, no "are you sure", and no wording anywhere that suggests the person
 * standing in the aisle got something wrong. The aggression in this product
 * points at the price, the store or the brand, and never at them.
 *
 * SAY WHAT ACTUALLY HAPPENS TO IT. Corrections are written to this phone and
 * are applied to nothing. No verdict moves, no comparison set changes, no
 * number is sent anywhere. Claiming otherwise would be a small lie in the one
 * place this product cannot afford one, so the screen says it plainly, twice:
 * before the correction is made and after it is stored.
 */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Dollars in, cents out. Returns null for anything that is not a usable
 * number, and the caller says so in words rather than inventing a figure.
 */
function toCents(raw) {
  const cleaned = String(raw ?? '').replace(/[$\s,]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 1000000) return null;
  return Math.round(value * 100);
}

/** The disagreement paths. Each one buys a different thing, so each is its own. */
function pathsFor(result) {
  const paths = [
    {
      id: 'item',
      title: 'That is not what I am holding',
      sub: 'The name is wrong, so the price under it is about something else',
      field: 'text',
      label: 'What is it, then',
      placeholder: 'The name on the box',
      cta: 'Tell Shin',
    },
    {
      id: 'price',
      title: 'The price here is different',
      sub: 'The shelf in front of you beats anything Shin can look up',
      field: 'price',
      label: 'What does the tag say',
      placeholder: 'e.g. 4.99',
      cta: 'Set the record straight',
    },
    {
      id: 'range',
      title: 'I see these for less all the time',
      sub: 'Shin may be reading the wrong part of the country',
      field: 'note',
      label: 'Anything Shin should know',
      placeholder: 'Optional. Where, and roughly what for',
      cta: 'Send it',
    },
  ];
  if (result?.identity?.category === 'used') {
    paths.push({
      id: 'fake',
      title: 'This listing looks fake',
      sub: 'Far under the going rate is the strongest counterfeit signal there is',
      field: 'note',
      label: 'What looks off',
      placeholder: 'Optional',
      cta: 'Flag it',
    });
  }
  return paths;
}

export default {
  id: 'correct',
  title: 'Shin is wrong',

  render(root, ctx) {
    const entry = ctx.store.get().history[0];
    if (!entry || !entry.result) {
      ctx.replace('scan');
      return;
    }

    const result = entry.result;
    const { faceSvg, cad } = ctx.shin;
    // A refusal can reach this screen too, and it is the likeliest place to
    // arrive from one: Shin declined, and the user knows what the thing is.
    // In that case there is no identity and no asking price, so fall back to
    // what the user asked with rather than printing a blank.
    const identity = result.identity ?? { label: entry.query?.text ?? null };
    const askingCents =
      typeof result.askingCents === 'number' ? result.askingCents : entry.query?.askingCents ?? null;
    const paths = pathsFor(result);
    const seller =
      result.askingSource && result.askingSource !== 'given' ? result.askingSource : null;

    let chosen = paths.some((p) => p.id === ctx.params.fix) ? ctx.params.fix : null;
    let error = '';
    let done = null;

    const heading = () => `
      <p class="kicker plain">Shin is wrong</p>
      <h2 class="c-head">What has Shin got wrong?</h2>
      <div class="c-subject">
        <span class="c-subject-name">${esc(identity.label ?? 'This item')}</span>
        <span class="c-subject-price num">${
          typeof askingCents === 'number' ? esc(cad(askingCents)) : 'no price'
        }${
          seller ? ` at ${esc(seller)}` : ''
        }</span>
      </div>`;

    const fieldFor = (path) => {
      if (path.field === 'text') {
        return `<label class="field" for="c-in">${esc(path.label)}</label>
          <input id="c-in" type="text" autocomplete="off" placeholder="${esc(path.placeholder)}"
                 value="${esc(identity.label ?? '')}">`;
      }
      if (path.field === 'price') {
        return `<label class="field" for="c-in">${esc(path.label)}</label>
          <input id="c-in" type="text" inputmode="decimal" autocomplete="off"
                 placeholder="${esc(path.placeholder)}">
          <label class="field" for="c-store">Which store</label>
          <input id="c-store" type="text" autocomplete="off" placeholder="The one you are standing in"
                 value="${esc(seller ?? '')}">`;
      }
      return `<label class="field" for="c-in">${esc(path.label)}</label>
        <input id="c-in" type="text" autocomplete="off" placeholder="${esc(path.placeholder)}">`;
    };

    const paint = () => {
      if (done) {
        root.innerHTML = `
          <section class="c-thanks">
            <div class="c-thanks-face">${faceSvg('fair', 76)}</div>
            <h2 class="c-thanks-head">Fair. Noted.</h2>
            <p class="c-thanks-said">${esc(done.said)}</p>
          </section>
          <p class="note legal">Written down on this phone, and nowhere else. It has not changed the
            verdict you just saw, and it has not changed anyone else's. Shin will not pretend a number
            it has not used.</p>
          <p class="c-count">${esc(String(ctx.store.get().corrections.length))} correction${
            ctx.store.get().corrections.length === 1 ? '' : 's'
          } saved here so far.</p>
          <div class="c-acts">
            <button class="btn btn-primary" data-go="verdict" type="button">Back to the verdict</button>
            <button class="btn btn-quiet" data-go="scan" type="button">Scan something else</button>
          </div>`;
        return;
      }

      root.innerHTML = `
        ${heading()}
        <div class="c-paths">
          ${paths
            .map((p) => {
              const open = p.id === chosen;
              return `
                <div class="c-path${open ? ' is-open' : ''}">
                  <button class="c-path-head" type="button" data-pick="${esc(p.id)}"
                          aria-expanded="${open}">
                    <span class="c-path-title">${esc(p.title)}</span>
                    <span class="c-path-sub">${esc(p.sub)}</span>
                  </button>
                  ${
                    open
                      ? `<div class="c-path-body">
                           ${fieldFor(p)}
                           ${error ? `<p class="c-error">${esc(error)}</p>` : ''}
                           <button class="btn btn-primary" type="button" data-send="${esc(p.id)}">${esc(p.cta)}</button>
                         </div>`
                      : ''
                  }
                </div>`;
            })
            .join('')}
        </div>
        <p class="note legal">Corrections are collected, not applied. Nothing here changes a verdict
          today, yours included. It is the start of the shelf-price layer, and saying it already works
          would be exactly the kind of claim this app exists to argue with.</p>
        <div class="c-acts">
          <button class="btn-link" data-go="verdict" type="button">Never mind, back to the verdict</button>
        </div>`;

      const input = root.querySelector('#c-in');
      if (input && chosen) input.focus();
    };

    const send = (pathId) => {
      const path = paths.find((p) => p.id === pathId);
      if (!path) return;
      const value = (root.querySelector('#c-in')?.value ?? '').trim();
      const store = (root.querySelector('#c-store')?.value ?? '').trim();

      const record = {
        at: new Date().toISOString(),
        path: path.id,
        verdictAt: entry.at,
        productId: identity.id ?? null,
        productLabel: identity.label ?? null,
        category: identity.category ?? null,
        shinSaidCents: askingCents,
        shinSaidSeller: seller,
        applied: false,
      };
      let said = '';

      if (path.id === 'item') {
        if (!value) {
          error = 'Shin needs a name to write down.';
          paint();
          return;
        }
        record.saidLabel = value;
        said = `It is ${value}. Shin had it down as ${identity.label ?? 'something else'}.`;
      } else if (path.id === 'price') {
        const cents = toCents(value);
        if (cents === null) {
          error = 'Shin needs a plain number to write down. Something like 4.99.';
          paint();
          return;
        }
        record.saidCents = cents;
        record.saidSeller = store || null;
        said = `${cad(cents)}${store ? ` at ${store}` : ''}, on the tag, today.`;
      } else if (path.id === 'range') {
        record.note = value || null;
        said = value
          ? `These go for less than Shin thinks. ${value}`
          : 'These go for less than Shin thinks.';
      } else {
        record.note = value || null;
        said = value ? `That listing looks fake. ${value}` : 'That listing looks fake.';
      }

      error = '';
      ctx.store.update((s) => ({ ...s, corrections: [record, ...s.corrections] }));
      done = { said };
      paint();
    };

    const onClick = (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        chosen = chosen === pick.dataset.pick ? null : pick.dataset.pick;
        error = '';
        paint();
        return;
      }
      const sendBtn = e.target.closest('[data-send]');
      if (sendBtn) {
        send(sendBtn.dataset.send);
        return;
      }
      const go = e.target.closest('[data-go]');
      if (go) ctx.go(go.dataset.go);
    };

    const onKey = (e) => {
      if (e.key === 'Enter' && chosen && e.target.matches('#c-in, #c-store')) {
        e.preventDefault();
        send(chosen);
      }
    };

    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    paint();

    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
    };
  },
};
