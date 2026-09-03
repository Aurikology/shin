/**
 * Stage 02: Shin says hello, briefly. One screen, under eight seconds, then gone.
 *
 * The job is to transfer recognition from the video into the app so the person
 * knows they are in the right place. It does not explain the product. They
 * already know what it does, that is why they installed it.
 *
 * Built as the cheapest option in the walkthrough's own table: one static card,
 * Shin, three lines, one button. The three lines are the screen copy verbatim.
 *
 * The face is the friendly one on purpose. HARD RULE 4: the aggression points at
 * the price, the store or the brand, never at the person holding the phone, and
 * this screen is the only one where Shin is looking straight at them.
 */

export default {
  id: 'intro',
  title: 'Shin says hello',

  render(root, ctx) {
    root.innerHTML = `
      <div class="in-wrap">
        <div class="in-face">${ctx.shin.faceSvg('good', 132)}</div>

        <h1 class="in-hi">Hi. I&rsquo;m Shin.</h1>
        <p class="in-line">Point me at anything with a price on it and I&rsquo;ll tell you if
          you&rsquo;re getting ripped off.</p>
        <p class="in-line">I&rsquo;m going to be honest even when it&rsquo;s annoying.</p>

        <div class="in-act">
          <button class="btn btn-primary" id="in-go" type="button">Alright</button>
          <button class="btn-link" id="in-skip" type="button">Skip, just open the camera</button>
        </div>

        <p class="in-judgment">
          <span class="tag">Design judgment</span>
          This stage is one of the four in the walkthrough with nothing behind it. Nine of its
          thirteen stages rest on external evidence; the Shin introduction is not one of them.
          Treat this screen as a guess, including whether it should exist at all.
        </p>
      </div>
    `;

    root.querySelector('#in-go').addEventListener('click', () => ctx.go('setup'));
    root.querySelector('#in-skip').addEventListener('click', () => ctx.go('scan'));
  },
};
