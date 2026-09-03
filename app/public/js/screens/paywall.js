/**
 * Stage 09: the paywall, and where it goes.
 *
 * AFTER VALUE, NEVER BEFORE. Enforced here rather than asserted: this screen
 * will not open until a verdict exists, and nothing on the scan, the verdict or
 * the share path routes into it. Cal AI put a paid subscription behind a free
 * first experience and ran near $50M ARR; Yuka reached 80 million users free and
 * monetises depth instead. Both work. A wall in front of the first scan kills
 * the video funnel, which is the channel this product is built on.
 *
 * The lean shown here is the stage 09 table's first row, free scans and paid
 * extras, because it keeps the viral act free. The scan limit row is named and
 * rejected on the table's own catch: it caps the window shopper, who is the
 * primary user.
 *
 * BE HONEST ON SCREEN ABOUT WHERE THIS SITS. The floor lists the paywall under
 * "Not in v1" alongside accounts and onboarding, so this screen is the shape of
 * the decision, not a till. The unlock takes no payment and asks for nothing.
 *
 * HARD RULE 2: no savings figure anywhere. A subscription price justified by an
 * amount saved would be a performance claim, and none has been measured. What is
 * shown instead is what this app has actually counted.
 */

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

const DEMO_DAYS = 30;

/** The stage 09 table, narrowed to the rows that decide this screen. */
const MODELS = [
  {
    name: 'Free scans, paid extras',
    shape: 'Unlimited verdicts. Pay for watches at volume, dupes, resale maths.',
    lean: true,
    catch: 'The scan cost falls on us, and window shoppers scan most.',
  },
  {
    name: 'Scan limit',
    shape: 'A free daily allowance, then subscribe. What Price Snap does.',
    lean: false,
    catch: 'Caps the window shopper, who is the best user this app has.',
  },
  {
    name: 'Affiliate on the watch',
    shape: 'Commission fires when a price drop notification converts.',
    lean: false,
    catch: 'Longer payback, but the honest verdict and the revenue point the same way.',
  },
];

export default {
  id: 'paywall',
  title: 'Shin Pro',

  render(root, ctx) {
    const s = ctx.store.get();
    const first = s.history[0];
    if (!first) {
      // The placement rule, made literal. Nothing to charge for yet.
      ctx.replace('scan');
      return;
    }

    const walkAways = s.history.filter((h) => h.result && h.result.tier === 'walk_away').length;
    const counted = [
      ['Scans made', s.scanCount],
      ['Things watched', s.watchlist.length],
      ['Walk aways called', walkAways],
      ['Cards sent', s.shareCount],
    ];

    root.innerHTML = `
      <p class="kicker">Stage 09 &middot; making money without lying</p>

      <p class="note legal pw-honest"><b>Not in version one.</b> The floor puts the paywall on the
        same line as accounts and onboarding: not built, on purpose. This screen is the shape of
        the decision so it can be argued with. It takes no payment, asks for no card, and sends
        nothing anywhere.</p>

      <h2 class="pw-title">You already had the part that matters.</h2>
      <p class="muted pw-sub">The wall goes after value or it goes nowhere. The scan, the verdict,
        the honest refusal and the share card stay free, because those are what a video makes
        someone install the app for.</p>

      <div class="card pw-counted">
        <p class="kicker plain">What you have done so far</p>
        <dl class="pw-counts">
          ${counted
            .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`)
            .join('')}
        </dl>
        <p class="small faint pw-nofigure">No amount saved is shown here or anywhere else in
          Shin. That number has never been measured, and a performance claim needs proper testing
          behind it before it is published. These are the things that were counted.</p>
      </div>

      <h3 class="pw-h3">What would sit behind it</h3>
      <ul class="pw-behind">
        <li><b>Watches at volume.</b> A handful stay free. A wishlist that is checked every day
          costs something to check.</li>
        <li><b>Dupes.</b> A different item, similar enough, cheaper. No competitor ships this.</li>
        <li><b>Resale maths.</b> Buy price, sale price, fees, shipping, what is left.</li>
      </ul>
      <p class="note">What never goes behind it: the scan, the three faces, the refusal when Shin
        cannot price something, and the share card.</p>

      <h3 class="pw-h3">The models, and what each one costs</h3>
      <div class="pw-models">
        ${MODELS.map(
          (m) => `<div class="pw-model${m.lean ? ' pw-lean' : ''}">
            <p class="pw-model-name">${esc(m.name)}${
              m.lean ? '<span class="tag pw-tag">Current lean</span>' : ''
            }</p>
            <p class="small">${esc(m.shape)}</p>
            <p class="small faint pw-catch">The catch: ${esc(m.catch)}</p>
          </div>`,
        ).join('')}
      </div>

      <p class="note">One scan is estimated to run roughly $0.008 at the cheapest tier and $0.040
        at the top. That is derived from published per token rates and our own assumptions, and it
        has not been measured against a real bill. It is why a free forever everything has a
        limit somewhere.</p>

      <div id="pw-cta"></div>

      <button type="button" class="btn-link" id="pw-back">Back to what you can do</button>
    `;

    const cta = root.querySelector('#pw-cta');

    function paintCta() {
      const pro = ctx.store.isPro();
      const until = ctx.store.get().proUntil;
      cta.innerHTML = pro
        ? `<div class="card pw-on">
             <p class="kicker plain">Demo unlock is on</p>
             <p>Pro is switched on until
               <b class="num">${esc(new Date(until).toLocaleDateString(undefined, {
                 year: 'numeric', month: 'short', day: 'numeric',
               }))}</b>.
               Nothing was charged and nothing was collected. It is a flag in this browser and it
               is the only thing this screen can actually do.</p>
             <button type="button" class="btn btn-quiet" id="pw-off">Turn the demo off</button>
           </div>`
        : `<button type="button" class="btn btn-primary" id="pw-on">Unlock Pro (demo, no payment)</button>
           <p class="small faint pw-fine">Flips a switch in this browser for ${DEMO_DAYS} days.
             No card, no account, no request leaves this device. There is nothing to cancel.</p>`;

      const on = cta.querySelector('#pw-on');
      if (on) {
        on.addEventListener('click', () => {
          const until2 = new Date(Date.now() + DEMO_DAYS * 86400000).toISOString();
          ctx.store.update({ proUntil: until2 });
        });
      }
      const off = cta.querySelector('#pw-off');
      if (off) off.addEventListener('click', () => ctx.store.update({ proUntil: null }));
    }

    paintCta();
    root.querySelector('#pw-back').addEventListener('click', () => ctx.go('actions'));
    return ctx.store.subscribe(paintCta);
  },
};
