/**
 * Stage 12: week two, and what the app has become.
 *
 * This is the state the whole walkthrough is designed backwards from, so the
 * screen has one job: show what actually happened, and never dress it up.
 *
 * Every number here is counted off the store on this device. Nothing is
 * estimated, projected, annualised, or turned into money. HARD RULE 2 forbids a
 * savings claim until one has been measured, and "you saved $X" on a habit
 * screen is exactly the claim the Competition Act wants tested first. So the
 * screen counts events instead: scans made, things saved, times Shin said walk
 * away, times he refused, watched prices that moved. Those are observations, and
 * each tile says where it was counted from.
 *
 * When the picture is thin, the screen says the picture is thin. Two scans is
 * two scans and is not a trend.
 */

/** Below this many scans, nothing here is a pattern and the screen says so. */
const THIN_AT = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** store.js keeps this many history rows. Past it, derived counts are floors. */
const HISTORY_CAP = 100;

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

function verdicts(history) {
  return history.filter((h) => h && h.result && h.result.kind === 'verdict');
}

function tierCount(history, tier) {
  return verdicts(history).filter((h) => h.result.tier === tier).length;
}

function daysSince(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

/**
 * Every number on this screen, with the field it was counted from.
 *
 * Written as one object so the provenance list at the bottom cannot drift from
 * the tiles above it: both read this.
 */
function count(state) {
  const history = Array.isArray(state.history) ? state.history : [];
  const drops = Array.isArray(state.drops) ? state.drops : [];
  const watchlist = Array.isArray(state.watchlist) ? state.watchlist : [];

  const withinWeek = history.filter((h) => {
    const t = Date.parse(h && h.at);
    return Number.isFinite(t) && Date.now() - t <= WEEK_MS;
  });

  const identities = new Set();
  for (const h of history) {
    if (h && h.result && h.result.identity && h.result.identity.id) identities.add(h.result.identity.id);
  }

  const movedIds = new Set();
  for (const d of drops) if (d && d.id) movedIds.add(d.id);

  const oldest = history.length > 0 ? history[history.length - 1].at : null;

  return {
    scans: state.scanCount ?? 0,
    stored: history.length,
    scansThisWeek: withinWeek.length,
    saved: watchlist.length,
    walkAway: tierCount(history, 'walk_away'),
    good: tierCount(history, 'good'),
    fair: tierCount(history, 'fair'),
    refused: history.filter((h) => h && h.result && h.result.kind === 'refusal').length,
    moved: movedIds.size,
    movements: drops.length,
    simulatedMovements: drops.filter((d) => d && d.source === 'simulated').length,
    shares: state.shareCount ?? 0,
    corrections: Array.isArray(state.corrections) ? state.corrections.length : 0,
    distinct: identities.size,
    daysRunning: oldest === null ? null : daysSince(oldest),
    capped: history.length >= HISTORY_CAP,
  };
}

function tile(value, label, source) {
  return `
    <div class="w2-tile">
      <div class="w2-value num">${esc(value)}</div>
      <div class="w2-label">${esc(label)}</div>
      <div class="w2-source">${esc(source)}</div>
    </div>`;
}

function ratio(top, bottom) {
  if (!bottom) return 'no scans yet';
  return `${top} of ${bottom}`;
}

export default {
  id: 'weektwo',
  title: 'Week two',

  render(root, ctx) {
    const state = ctx.store.get();
    const n = count(state);
    const thin = n.scans < THIN_AT || n.daysRunning === null || n.daysRunning < 7;

    root.innerHTML = `
      <section class="w2-head">
        <p class="kicker">Week two</p>
        <h1>What Shin has actually seen.</h1>
        <p class="muted">Counted on this device, from what happened. Nothing on this screen is
          an estimate, and no number here is in dollars.</p>
      </section>

      ${
        thin
          ? `<p class="note w2-thin">${
              n.scans === 0
                ? 'Nothing has been scanned yet, so there is nothing to read. Every number below is zero because zero is what happened.'
                : `${n.scans} ${n.scans === 1 ? 'scan' : 'scans'}${
                    n.daysRunning === null
                      ? ''
                      : n.daysRunning === 0
                        ? (n.scans === 1 ? ', today,' : ', all of them today,')
                        : ` over ${n.daysRunning} ${n.daysRunning === 1 ? 'day' : 'days'}`
                  } is a thin picture. It is enough to see the loop working and nowhere near enough to be a habit or a trend.`
            }</p>`
          : ''
      }

      <div class="w2-grid">
        ${tile(n.scans, n.scans === 1 ? 'scan made' : 'scans made', 'the scan counter')}
        ${tile(n.saved, n.saved === 1 ? 'thing watched' : 'things watched', 'the watchlist, right now')}
        ${tile(n.walkAway, n.walkAway === 1 ? 'time Shin said walk away' : 'times Shin said walk away', 'stored verdicts')}
        ${tile(n.moved, n.moved === 1 ? 'watched price moved' : 'watched prices moved', 'recorded movements')}
      </div>

      <section class="card w2-block">
        <h3>What Shin said, across ${n.stored} stored ${n.stored === 1 ? 'scan' : 'scans'}</h3>
        ${bar('Good price', n.good, n.stored, 'good')}
        ${bar('About right', n.fair, n.stored, 'fair')}
        ${bar('Walk away', n.walkAway, n.stored, 'walk')}
        ${bar('Could not price it', n.refused, n.stored, 'none')}
        <p class="small muted w2-foot">${
          n.refused > 0
            ? `${n.refused} of those ${
                n.refused === 1 ? 'was a refusal' : 'were refusals'
              }. A refusal is a correct answer here, not a miss.`
            : 'Shin has not had to refuse anything yet.'
        }${
          n.scans !== n.stored
            ? ` The counter says ${n.scans} scans and ${n.stored} are stored, because only the last ${HISTORY_CAP} are kept.`
            : ''
        }</p>
      </section>

      <section class="card w2-block">
        <h3>The three numbers worth instrumenting</h3>
        <p class="small muted w2-lede">The walkthrough names these three as the ones no benchmark
          can supply. Each is counted here from stored scans, and each is a floor rather than a
          finished figure.</p>
        <dl class="w2-dl">
          <div class="w2-dt">
            <dt>Scans in the last seven days</dt>
            <dd class="num">${n.scansThisWeek}</dd>
          </div>
          <p class="w2-note small">Counted from the timestamp on each stored scan. Whether a
            purchase followed is not asked and not recorded, so the split the document wants is
            not available yet.</p>
          <div class="w2-dt">
            <dt>Scans that ended in a save</dt>
            <dd class="num">${esc(ratio(n.saved, n.scans))}</dd>
          </div>
          <p class="w2-note small">Reads the watchlist as it stands now. Removing a save is not
            recorded anywhere, so this is a floor and not a rate.</p>
          <div class="w2-dt">
            <dt>Distinct products over total scans</dt>
            <dd class="num">${esc(ratio(n.distinct, n.stored))}</dd>
          </div>
          <p class="w2-note small">Counted on the product identity each scan resolved to. Near one
            to one means the same thing is rarely scanned twice, which is the number that decides
            whether caching rescues the cost per scan.</p>
        </dl>
      </section>

      <section class="card w2-block">
        <h3>Where week two is supposed to be</h3>
        <p class="small muted w2-lede">Five states from the walkthrough, each against what this
          device has actually recorded.</p>
        ${check(
          'Scanning four to ten things a week',
          n.scansThisWeek >= 4,
          `${n.scansThisWeek} in the last seven days`,
        )}
        ${check(
          'A collection of about a dozen things',
          n.saved >= 12,
          `${n.saved} saved`,
        )}
        ${check(
          'At least one price drop, and it was right',
          // Whether a drop was right is not something this app watched. When
          // every movement on record was simulated in the app, the honest mark
          // is the one that says the app cannot see it, not a tick.
          n.moved === 0 ? false : n.simulatedMovements >= n.movements ? null : true,
          n.moved === 0
            ? 'none recorded'
            : `${n.movements} ${n.movements === 1 ? 'movement' : 'movements'} across ${n.moved} ${
                n.moved === 1 ? 'item' : 'items'
              }${
                n.simulatedMovements > 0
                  ? `, ${n.simulatedMovements} of them simulated in the app rather than observed at a seller, so nothing here shows one was right`
                  : ''
              }`,
        )}
        ${check('A Shin card sent or posted', n.shares > 0, `${n.shares} shared`)}
        ${check(
          'Can name Shin’s angry face without opening the app',
          null,
          'the app cannot see this one, so it is not counted',
        )}
      </section>

      <button class="btn btn-primary" type="button" data-go="scan">Scan something</button>
      <div class="w2-secondary">
        <button class="btn-link" type="button" data-go="home">Back to the collection</button>
      </div>

      <section class="card w2-block w2-provenance">
        <p class="kicker plain">Where each number came from</p>
        <ul class="small w2-list">
          <li><b>Scans made:</b> the counter the app adds one to every time a verdict is shown.</li>
          <li><b>Things watched:</b> the length of the watchlist as it stands now.</li>
          <li><b>Walk away, good price, about right, could not price:</b> counted one by one over
            the ${n.stored} stored ${n.stored === 1 ? 'scan' : 'scans'}.</li>
          <li><b>Watched prices moved:</b> distinct items with a recorded movement, counted once
            each however many times the price stepped.</li>
          <li><b>Cards shared:</b> the share counter.</li>
          <li><b>Corrections sent:</b> ${n.corrections} recorded.</li>
        </ul>
        <p class="note legal small">No amount saved appears anywhere on this screen, and none
          will until it has been measured. Counting what a person did is not the same claim as
          telling them what it was worth, and only the first one has evidence behind it.</p>
      </section>`;

    function onClick(event) {
      const goer = event.target.closest('[data-go]');
      if (goer) ctx.go(goer.dataset.go);
    }
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  },
};

/** A count with its share of stored scans, drawn rather than described. */
function bar(label, value, total, tone) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return `
    <div class="w2-bar">
      <div class="w2-bar-top">
        <span>${esc(label)}</span>
        <span class="num">${esc(value)}</span>
      </div>
      <div class="w2-bar-track"><div class="w2-bar-fill w2-fill-${esc(tone)}" style="width:${pct}%"></div></div>
    </div>`;
}

/** yes / not yet / cannot be seen. The third is a real answer, so it looks different. */
function check(label, met, detail) {
  const mark = met === null ? '&#8226;' : met ? '&#10003;' : '&#183;';
  const cls = met === null ? 'unseen' : met ? 'met' : 'unmet';
  return `
    <div class="w2-check w2-check-${cls}">
      <span class="w2-check-mark" aria-hidden="true">${mark}</span>
      <span>
        <span class="w2-check-label">${esc(label)}</span>
        <span class="w2-check-detail small">${esc(detail)}</span>
      </span>
    </div>`;
}
