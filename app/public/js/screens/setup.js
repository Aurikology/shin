/**
 * Stage 03: setup, and how little of it you can get away with.
 *
 * The walkthrough allows one to three screens. The floor cuts it to one, because
 * "onboarding beyond city" is on its not-in-v1 line. So one question survives,
 * and it survives because without a region key no price is correct.
 *
 * The legal wall in this stage is the reason there is no savings number on this
 * screen, and it is reproduced rather than summarised. HARD RULE 2: no savings
 * claim until it is measured.
 */

const CITIES = ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Ottawa', 'Halifax'];

/* Asked later, not here. The "when" column is the whole point of the table. */
const LATER = [
  ['Stores you shop', 'After first scan', 'Improves results but is not required for one'],
  ['What you&rsquo;re into', 'After first scan', 'Seeds the browse feed; nothing breaks without it'],
  ['Notifications', 'After the first save', 'Ask when the value is obvious, not before'],
  ['Buyer or reseller', 'Optional, in settings', 'Changes the maths, not the product'],
];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export default {
  id: 'setup',
  title: 'Setup',

  render(root, ctx) {
    const saved = ctx.store.get().city;

    root.innerHTML = `
      <p class="kicker">One question, then the camera</p>
      <h1>Where do you shop?</h1>
      <p class="su-why">Prices differ enough between banners in the same city that a verdict
        without a region key is guessing, and Canadian produce swings hard with imports and
        season. City is the one thing Shin cannot infer for you.</p>

      <label class="field" for="su-city">City or postal code</label>
      <input type="text" id="su-city" name="city" autocomplete="address-level2"
             placeholder="Toronto, or M5V 2T6" value="${saved ? esc(saved) : ''}">
      <div class="su-chips">
        ${CITIES.map((c) => `<button type="button" class="su-chip" data-city="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <p class="su-err" id="su-err" hidden>Type a city, or tap Skip and Shin will ask again later.</p>

      <button class="btn btn-primary" id="su-save" type="button">Save and start scanning</button>
      <button class="btn-link" id="su-skip" type="button">Skip for now</button>

      <div class="su-legal">
        <h3>Legal wall, not a preference</h3>
        <p>Do not put an untested savings figure on this screen. Section 74.01(1)(b) of the
          Competition Act requires a performance claim be backed by adequate and proper testing
          done before the claim is made, and it covers in-app and website copy. "People save
          $1,000 a year" with no users is exactly the exposed case, and the number is
          suspiciously close to the Dalhousie food price report&rsquo;s projection that a family
          of four will pay $994.63 <em>more</em> in 2026.</p>
        <p>The replacement is better content anyway: a real measured spread with two named
          stores. "The same four items were $18 apart at two stores 1.6 km from each other" is
          checkable, specific, and legal.</p>
        <p class="su-legal-note">That sentence is the walkthrough&rsquo;s example of the right
          shape, not a measurement this app has taken. Nothing goes on this screen until it has
          been measured, which is why the space above the question is empty.</p>
      </div>

      <p class="su-cap">Asked later, not here</p>
      <ul class="su-later">
        ${LATER.map(([q, when, why]) => `
          <li>
            <div class="su-later-top"><b>${q}</b><span class="tag">${when}</span></div>
            <p>${why}</p>
          </li>`).join('')}
      </ul>

      <p class="su-judgment">
        <span class="tag">Design judgment</span>
        The order of these questions is one of the four things in the walkthrough with nothing
        behind it. That city comes first is argued, not tested; everything below the line is a
        guess about when to ask, and the floor rules the rest of it out of version one anyway.
      </p>
    `;

    const input = root.querySelector('#su-city');
    const err = root.querySelector('#su-err');

    root.querySelector('.su-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-city]');
      if (!chip) return;
      input.value = chip.dataset.city;
      err.hidden = true;
      input.focus();
    });

    input.addEventListener('input', () => { err.hidden = true; });

    root.querySelector('#su-save').addEventListener('click', () => {
      const city = input.value.trim();
      if (!city) {
        err.hidden = false;
        input.focus();
        return;
      }
      ctx.store.update({ city, seenIntro: true });
      ctx.go('scan');
    });

    root.querySelector('#su-skip').addEventListener('click', () => {
      ctx.store.update({ seenIntro: true });
      ctx.go('scan');
    });
  },
};
