/**
 * The stage map: every stage of the walkthrough, openable directly.
 *
 * This is the demo aid rather than a product screen. It exists so the whole
 * document can be walked in any order without clearing localStorage to get back
 * to the top of the funnel.
 *
 * The basis column is not decoration. The walkthrough is explicit that its
 * confidence is not uniform: of the 13 stages, 9 rest on external evidence and 4
 * are design judgment with nothing behind them. A screen that hides which is
 * which turns a guess into a spec.
 */

const STAGES = [
  {
    id: 'prelaunch',
    basis: 'evidence',
    stages: [
      { num: '00', title: 'The video that does the installing', sub: '15 to 25 seconds &middot; TikTok, Reels, Shorts' },
      { num: '01', title: 'The store listing', sub: 'Six seconds of attention, arriving from a link' },
    ],
  },
  {
    id: 'intro',
    basis: 'judgment',
    stages: [{ num: '02', title: 'Shin says hello, briefly', sub: 'One screen, under eight seconds' }],
  },
  {
    id: 'setup',
    basis: 'judgment',
    stages: [{ num: '03', title: 'Setup, and how little of it you can get away with', sub: 'One to three screens, skippable' }],
  },
  {
    id: 'scan',
    basis: 'evidence',
    stages: [{ num: '04', title: 'Getting them to a scan that works', sub: 'Camera opens immediately' }],
  },
  {
    id: 'identify',
    basis: 'evidence',
    stages: [{ num: '05', title: 'What it thinks it is', sub: 'Under two seconds to something on screen' }],
  },
  {
    id: 'verdict',
    basis: 'evidence',
    loadBearing: true,
    stages: [{ num: '06', title: "Shin's face and two numbers", sub: 'Must read in three seconds at arm&rsquo;s length' }],
  },
  {
    id: 'correct',
    basis: 'evidence',
    stages: [{ num: '06b', title: 'When Shin is wrong and the user knows it', sub: 'A branch off the verdict, not a step after it' }],
  },
  {
    id: 'actions',
    basis: 'evidence',
    stages: [{ num: '07', title: 'What they can do about it', sub: 'One primary action, three secondary' }],
  },
  {
    id: 'share',
    basis: 'evidence',
    stages: [{ num: '08', title: 'The share, which is the growth engine', sub: 'One tap, exports a vertical clip' }],
  },
  {
    id: 'paywall',
    basis: 'evidence',
    stages: [{ num: '09', title: 'The paywall, and where it goes', sub: 'After value, never before' }],
  },
  {
    id: 'home',
    basis: 'judgment',
    stages: [{ num: '10', title: 'The home screen, after scan one', sub: 'Changes shape once there is something to show' }],
  },
  {
    id: 'notify',
    basis: 'judgment',
    stages: [{ num: '11', title: 'The notification that brings them back', sub: 'The whole retention mechanism' }],
  },
  {
    id: 'weektwo',
    basis: 'evidence',
    stages: [{ num: '12', title: 'Week two, and what the app has become', sub: 'The state worth designing backwards from' }],
  },
];

export default {
  id: 'stagemap',
  title: 'Stages',

  render(root, ctx) {
    root.innerHTML = `
      <p class="kicker">The walkthrough, openable</p>
      <h1>Thirteen stages</h1>
      <p class="sm-lede">From the video that does the installing to the week-two habit. Tap any
        one to open it.</p>

      <div class="sm-key">
        <span><i class="sm-dot sm-dot-ev"></i>Rests on external evidence</span>
        <span><i class="sm-dot sm-dot-gu"></i>Design judgment, nothing behind it</span>
      </div>
      <p class="sm-caveat">Stages 06 through 09 hang off a verdict, so until you have scanned
        something they send you to the camera instead.</p>

      <ul class="sm-list">
        ${STAGES.map((row) => `
          <li>
            <button type="button" class="sm-row sm-${row.basis}" data-go="${row.id}">
              <span class="sm-stages">
                ${row.stages.map((s) => `
                  <span class="sm-stage">
                    <span class="sm-num num">${s.num}</span>
                    <span class="sm-body">
                      <span class="sm-title">${s.title}</span>
                      <span class="sm-sub">${s.sub}</span>
                    </span>
                  </span>`).join('')}
                ${row.loadBearing ? '<span class="sm-flag">Load-bearing, and it has now been tested</span>' : ''}
              </span>
              <span class="sm-basis">${row.basis === 'judgment' ? 'Guess' : 'Evidence'}</span>
            </button>
          </li>`).join('')}
      </ul>

      <div class="sm-note">
        <h3>Confidence is not uniform</h3>
        <p>Of the 13 stages, 9 rest on external evidence and 4 are design judgment with nothing
          behind them: the Shin introduction, the setup question ordering, the adaptive home
          screen, and the notification triggers beyond Duolingo&rsquo;s measured numbers. Treat
          those four as guesses.</p>
        <p>Separately, the grocery figures rest on a real feed at a real price while the
          furniture and tech stages rest on scrapers that were found but never validated. The
          pilot did not validate them either; it only established that the free alternative to
          them does not work.</p>
        <p>Stage 06 is load-bearing. If a defensible price range cannot be produced often enough,
          every other screen here is decoration. Seven items were priced by hand on 3 September
          2026: a range came out for two, a partial answer for three, and nothing usable for two.</p>
      </div>
    `;

    root.querySelector('.sm-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-go]');
      if (btn) ctx.go(btn.dataset.go);
    });
  },
};
