/**
 * Stages 00 and 01: the two things that happen before the app.
 *
 * This is deliberately not app UI. Nobody ever sees these two stages inside the
 * product, so the screen presents them as a preview a person can look at: the
 * video that does the installing, and the store listing it lands on.
 *
 * Every line of copy here comes from the walkthrough. The one thing that is not
 * a quote is the note about the name, which is HARD RULE 1 and belongs on a
 * mock store listing more than anywhere else.
 */

const FORMATS = [
  {
    name: 'Ripoff hunt',
    what: 'Walk a store, scan the worst-value item on each aisle',
    why: 'Infinite supply, needs no script',
    build: 'Day one',
    when: 'now',
  },
  {
    name: 'Dupe reveal',
    what: 'Designer item, then the near-identical cheaper one',
    why: 'Furniture dupe hunting is already a mass behaviour',
    build: 'Day one',
    when: 'now',
  },
  {
    name: 'Guess the gap',
    what: 'Show the item, pause, let comments guess before the reveal',
    why: 'Comments are the ranking signal you want',
    build: 'Day one',
    when: 'now',
  },
  {
    name: 'Shin vs a store',
    what: 'Named retailer, Shin escalating across a whole basket',
    why: 'A villain travels; helpful data does not',
    build: 'After legal read',
    when: 'next',
  },
  {
    name: 'Scan my haul',
    what: 'Reader submits a photo, Shin grades it',
    why: 'Turns viewers into content supply',
    build: 'Week two',
    when: 'next',
  },
  {
    name: 'Stitch bait',
    what: 'Deliberately arguable verdict, invite disagreement',
    why: 'Rewatch and duet rather than a scroll past',
    build: 'Once brand can take it',
    when: 'later',
  },
];

const BEATS = [
  ['0 to 3s', 'Hand holding the item, price tag visible, no talking. The first three seconds set both click-through and install rate.'],
  ['3 to 8s', "The scan. Phone up, one tap, Shin's face appears already annoyed."],
  ['8 to 15s', 'The two numbers on screen together. This is the frame people screenshot.'],
  ['15 to 22s', 'The dupe, or the save. "Same thing, ninety cheaper, at the place two blocks over."'],
];

const LISTING = [
  ['Screenshot 1', 'The verdict screen, one item, both prices, Shin', 'Matches the video frame that got the tap'],
  ['Screenshot 2', 'The collection, filling up', 'Shows there is a reason to come back'],
  ['Screenshot 3', 'A dupe side by side', 'The feature no competitor ships'],
  ['Subtitle line', "Scan anything. Know if you're overpaying.", 'Avoid "the price is right", which is a protected TV property'],
  ['Preview video', 'The best-performing organic clip, unedited', 'Free, already validated'],
];

export default {
  id: 'prelaunch',
  title: 'Before the app',

  render(root, ctx) {
    root.innerHTML = `
      <p class="kicker">Before the app</p>
      <h1>Two things happen before anyone opens this</h1>
      <p class="muted">The walkthrough starts one step earlier than the download, because the
        video is the first screen and it sets what every screen after it has to deliver.</p>

      <section class="pl-stage">
        <div class="pl-head">
          <span class="pl-num">00</span>
          <div>
            <h2>The video that does the installing</h2>
            <p class="pl-sub num">15 to 25 seconds &middot; TikTok, Reels, Shorts</p>
          </div>
        </div>
        <p class="pl-risk">Highest drop-off in the funnel</p>

        <blockquote class="pl-hook">
          <span class="tag">The hook</span>
          <p>Scan anything. Shin tells you if you&rsquo;re getting ripped off.</p>
        </blockquote>

        <p>The structure is already proven in this exact market, so copy it rather than invent
          one. The thrift-flip reveal runs: tension, price reveal, then the flip that shows the
          real number. Shin&rsquo;s reaction replaces the second price tag.</p>

        <ol class="pl-beats">
          ${BEATS.map(([t, line]) => `
            <li><span class="pl-beat-t num">${t}</span><span>${line}</span></li>`).join('')}
        </ol>

        <p class="pl-cap">Content formats to run</p>
        <ul class="pl-fmt">
          ${FORMATS.map((f) => `
            <li>
              <div class="pl-fmt-top">
                <b>${f.name}</b><span class="tag t-${f.when}">${f.build}</span>
              </div>
              <p>${f.what}</p>
              <p class="pl-why">${f.why}</p>
            </li>`).join('')}
        </ul>

        <div class="pl-flag">
          <h3>Correction, 2026-09-03: do not run this test on a new account</h3>
          <p>TikTok now shows a new video primarily to your existing followers first for the
            opening days, and only pushes it to non-followers if that seed audience engages fast.
            Completion and rewatch outrank follower count, which favours small accounts, but the
            seed still gates the test. <b>A brand new handle has no seed, so it can return
            near-zero views for reasons unrelated to whether the idea works</b>, which is a false
            negative on the one test everything else rests on.</p>
          <p>Both precedents launched borrowed. Duolingo&rsquo;s account already existed inside a
            company with an installed base. Cal AI&rsquo;s ladder started with fitness-influencer
            UGC, meaning other people&rsquo;s audiences, and only later went paid. So: run the
            test through three to five micro creators in thrifting, deal-hunting or Canadian
            grocery content at a small flat fee, or post where distribution is not follower-gated
            (Reddit, where a good post reaches strangers on day one). Run your own handle in
            parallel to build the seed you will need later, but do not read the result off it.</p>
        </div>

        <p class="note"><b>What the test decides:</b> run the same five scans with two captions,
          one neutral ("tells you if the price is right") and one with the villain ("tells you if
          you're getting ripped off"). Read views, rewatch, and how many comments ask what the app
          is. One week, no engineering, and it settles the brand.</p>
      </section>

      <section class="pl-stage">
        <div class="pl-head">
          <span class="pl-num">01</span>
          <div>
            <h2>The store listing</h2>
            <p class="pl-sub num">Six seconds of attention, arriving from a link</p>
          </div>
        </div>
        <p class="pl-risk">Install decision made on screenshot one</p>

        <p>Traffic arrives from a link in bio, not from search, which changes what the listing is
          for. It is not discovery, it is reassurance that the thing in the video is real.
          Screenshot one must be the verdict screen from the video they just watched, not a
          feature grid.</p>

        <div class="pl-listing">
          <div class="pl-listing-top">
            <div class="pl-icon">${ctx.shin.faceSvg('walk_away', 44)}</div>
            <div>
              <p class="pl-app-name">Shin</p>
              <p class="pl-app-sub">Scan anything. Know if you&rsquo;re overpaying.</p>
            </div>
          </div>
          <div class="pl-shots">
            <div class="pl-shot pl-shot-1">
              ${ctx.shin.faceSvg('walk_away', 34)}
              <span class="pl-shot-bar"></span>
              <span class="pl-shot-bar short"></span>
              <p>Verdict screen<br>one item, both prices</p>
            </div>
            <div class="pl-shot">
              <span class="pl-shot-bar"></span>
              <span class="pl-shot-bar"></span>
              <span class="pl-shot-bar short"></span>
              <p>The collection,<br>filling up</p>
            </div>
            <div class="pl-shot">
              <span class="pl-shot-split"><i></i><i></i></span>
              <p>A dupe,<br>side by side</p>
            </div>
          </div>
          <p class="pl-shot-note faint small">Placeholders. No number goes on a screenshot until
            the app has sourced it.</p>
        </div>

        <p class="pl-cap">Listing decisions</p>
        <dl class="pl-rows">
          ${LISTING.map(([k, v, note]) => `
            <div>
              <dt>${k}</dt>
              <dd>${v}<span class="pl-why">${note}</span></dd>
            </div>`).join('')}
        </dl>

        <p class="note legal">Nothing above goes up under a name that has not passed a trademark
          search in the software classes. Nongshim&rsquo;s SHIN RAMYUN is registered, so the
          listing is a mock until that search is done.</p>
      </section>

      <button class="btn btn-primary" id="pl-open" type="button">Open the app</button>
      <p class="faint small" style="text-align:center">Stage 02 is the first thing a real user sees.</p>
    `;

    root.querySelector('#pl-open').addEventListener('click', () => ctx.go('intro'));
  },
};
