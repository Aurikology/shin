/**
 * The client half of the Gemini grounded block, and the terms it has to keep.
 *
 * WHAT MAKES THIS FILE DIFFERENT FROM THE OTHER CLIENT SUITES. Most of them
 * check a rendered HTML string or the source of a screen, because this app has
 * no DOM in its test run by decision. That is enough when the promise is about
 * markup. Every promise below is about a CONTRACT with Google
 * (https://ai.google.dev/gemini-api/terms, eff. 2026-03-23), and the cost of
 * a false green here is the API key, so three of them are behavioural: a real
 * click through a real tree, and a real render into real nodes. `mini-dom.mjs`
 * is the two hundred lines of DOM that buys that, with no new dependency.
 *
 * THE FOUR TERMS, and which test holds each:
 *
 *   "will not modify, or intersperse any other content with, the Grounded
 *   Results or Search Suggestions"
 *     -> the root carries only wire text (no Shin string appears inside it),
 *        Shin's sentences are siblings, and `grounded.js` has no `.sort`,
 *        `.slice`, `cad()` or `Intl.NumberFormat`.
 *
 *   "will not place any interstitial content between any Link... and the
 *   associated destination page"
 *     -> every `href` is byte-identical to the wire's, and the source matches
 *        none of the five shapes that would break this.
 *
 *   "you will not track whether those interactions were specifically with a
 *   given Search Suggestion or Grounded Result"
 *     -> a tap inside the region records nothing; the identical button
 *        outside records one; and the guard's source position is asserted, so
 *        a refactor that demotes it below the `[data-act]` lookup fails even
 *        though both lines are still there.
 *
 *   Search Suggestions must be shown with every grounded answer.
 *     -> exactly one `innerHTML`, its right-hand side the bare wire value;
 *        and with no `suggestionsHtml` the whole block refuses to render.
 *
 * Plus the one term that rests on a single line nobody was protecting: "will
 * not cache", which in this client is `sw.js` returning early for `/api/`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser, click, MiniElement } from './mini-dom.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const GROUNDED_SRC = read('../public/js/grounded.js');
const TRACK_SRC = read('../public/js/track.js');
const SW_SRC = read('../public/sw.js');

/** Source with comments removed, for the checks that are about code. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

/* ------------------------------------------------------------- the wire -- */

/**
 * One grounded payload, shaped exactly as the server sends it.
 *
 * The strings are invented rather than borrowed from a real retailer, for one
 * reason that matters to a check below: the "no Shin string inside the root"
 * test compares the root's text against every string this app exports, and a
 * fixture that happened to reuse one of them would make that test pass or
 * fail for the wrong reason.
 */
const WIRE = () => ({
  kind: 'grounded',
  forDevice: 'dev-1',
  fetchedAt: '2026-09-14T18:00:00.000Z',
  block: {
    offers: [
      { retailer: 'Northfield Grocers', price: '4.49 CAD', url: 'https://northfield.example.ca/p/9912?v=2', sizeValue: '355', sizeUnit: 'mL', packCount: '6', hasLink: true },
      { retailer: 'Ridgeway Market', price: '6.99 CAD', url: 'https://ridgeway.example.ca/item/551', sizeValue: '4', sizeUnit: 'L', packCount: '1', hasLink: true },
      { retailer: 'Quarry Provisions', price: '5.25 CAD', url: null, sizeValue: '355', sizeUnit: 'mL', packCount: '6', hasLink: false },
    ],
    reviews: [
      { source: 'Harbourline Weekly', rating: '4.2', count: '318', summary: 'Testers ranked it second of nine.', url: 'https://harbourline.example.ca/r/citrus', hasLink: true },
      { source: 'Pinecrest Panel', rating: '3.8', count: '41', summary: 'Panel split on the aftertaste.', url: null, hasLink: false },
    ],
    description: 'A citrus soda sold in cans and in jugs.',
    verdict: {
      median: '5.25 CAD',
      unitLabel: '100 mL',
      span: 40,
      ticks: [
        { position: 0, label: '-20%' },
        { position: 25, label: '-10%' },
        { position: 50, label: 'middle' },
        { position: 75, label: '+10%' },
        { position: 100, label: '+20%' },
      ],
      // The gauge's own names, on the gauge's own 0 to 100 line (the median
      // at 50). This fixture said `goodBoundary: 0.375` until 2026-09-14,
      // which was a shape nothing emitted on a scale nothing used.
      zoneUnderBoundary: 37.5,
      zoneOverBoundary: 62.5,
      shelf: { position: 72, zone: 'over_your_line', pct: 18 },
      points: [
        { retailer: 'Northfield Grocers', position: 12, price: '4.49 CAD', label: '6 x 355 mL, $4.49' },
        { retailer: 'Ridgeway Market', position: 88, price: '6.99 CAD', label: '4 L, $6.99' },
        { retailer: 'Quarry Provisions', position: 50, price: '5.25 CAD', label: '6 x 355 mL, $5.25' },
      ],
      excluded: [{ retailer: 'Eastgate', why: 'no_size' }],
    },
  },
  suggestionsHtml: '<div class="gsc"><a href="https://www.google.com/search?q=citrus+soda">citrus soda</a></div>',
});

/**
 * The wire above plus two of Shin's own rows for stores the search also
 * quoted, as the server marks them (`sameStoreAsGemini`, src/same-store.ts).
 * One carries its date and one does not, so both sentences are rendered.
 */
const SAME_STORE_WIRE = () => {
  const wire = WIRE();
  wire.block.offers.push(
    { retailer: 'Northfield Grocers Canada', price: 4.29, currency: 'CAD', seenOn: '2026-09-20', url: null, hasLink: false, trusted: false, source: 'shin_own_data', sameStoreAsGemini: true },
    { retailer: 'Ridgeway Market', price: 6.5, currency: 'CAD', url: null, hasLink: false, trusted: false, source: 'shin_own_data', sameStoreAsGemini: true },
    { retailer: 'Lakeshore Depot', price: 5.1, currency: 'CAD', seenOn: '2026-09-18', url: null, hasLink: false, trusted: false, source: 'shin_own_data' },
  );
  return wire;
};

/* --------------------------------------------------------- the renderer -- */

async function renderRoot(wire = WIRE()) {
  const doc = makeDocument();
  const restore = installBrowser({ doc, storage: makeStorage() });
  try {
    const { groundedRoot } = await import('../public/js/grounded.js');
    return { doc, root: groundedRoot(wire, { doc }) };
  } finally {
    restore();
  }
}

async function renderSection(wire = WIRE(), opts = {}) {
  const doc = makeDocument();
  const storage = makeStorage();
  // The reader's language lives in the page's own storage, which exists only
  // for the length of a render, so it is chosen here and not by `setLocale`.
  if (opts.locale) storage.setItem('shin.locale', opts.locale);
  const restore = installBrowser({ doc, storage });
  try {
    const { groundedSection } = await import('../public/js/grounded.js');
    return { doc, section: groundedSection(wire, { doc, ...opts }) };
  } finally {
    restore();
  }
}

/* ============================================================ the guard == */

/**
 * The behavioural half. A grep would pass on a `track.js` whose guard had been
 * moved below the `track()` call, which is the exact refactor this is here to
 * stop, so the click is real and the queue is read back from storage.
 */
test('a tap inside a no-track region records nothing, and the same button outside records one', async () => {
  const doc = makeDocument();
  const storage = makeStorage();
  const restore = installBrowser({ doc, storage });
  try {
    // Imported AFTER the browser globals are in place: track.js gates all of
    // its listener wiring on `window` and `document` existing at module load,
    // which its own header explains at length.
    await import('../public/js/track.js');

    const region = doc.createElement('div');
    region.setAttribute('data-no-track', '');
    const inside = doc.createElement('button');
    inside.setAttribute('data-act', 'x');
    inside.textContent = 'inside';
    region.appendChild(inside);
    doc.body.appendChild(region);

    const outside = doc.createElement('button');
    outside.setAttribute('data-act', 'x');
    outside.textContent = 'outside';
    doc.body.appendChild(outside);

    const taps = () => {
      const raw = storage.getItem('shin.track.queue');
      if (!raw) return [];
      return JSON.parse(raw).filter((e) => e.type === 'tap');
    };

    const before = taps().length;
    click(inside);
    assert.equal(
      taps().length,
      before,
      'a tap on a button inside [data-no-track] was recorded. The Gemini terms forbid tracking whether an interaction was with a given Grounded Result or Link, and this is that.',
    );

    click(outside);
    assert.equal(
      taps().length,
      before + 1,
      'the identical button OUTSIDE the region recorded nothing either, so the guard is not a guard, it is an off switch for tap tracking.',
    );
    assert.equal(taps()[taps().length - 1].payload.label, 'x');
  } finally {
    restore();
  }
});

/**
 * The ordering half, and the reason it is a separate test.
 *
 * Both strings can be present and the guard can still be useless: a refactor
 * that computes the label first and returns afterwards leaks exactly what the
 * term forbids. Asserting the source POSITION is the only version of this
 * check that survives that edit.
 */
test('the no-track guard runs before the [data-act] lookup, not merely somewhere in the same listener', () => {
  const src = code(TRACK_SRC);
  const guard = src.indexOf("target.closest('[data-no-track]')");
  const lookup = src.indexOf("target.closest('[data-act]')");
  assert.ok(guard > -1, 'the [data-no-track] guard is gone from track.js entirely.');
  assert.ok(lookup > -1, "the [data-act] lookup is gone; this test's landmark no longer exists, so fix the test rather than deleting it.");
  assert.ok(
    guard < lookup,
    'the [data-no-track] guard now sits BELOW the [data-act] lookup. Both lines are present, which is why a grep would not have caught this, and the listener now computes a label for a Grounded Result before deciding not to record it.',
  );
});

/* ======================================================== the root shape = */

test('the grounded root is marked no-track and carries no data-act anywhere in its subtree', async () => {
  const { root } = await renderRoot();
  assert.ok(root, 'nothing rendered from a complete payload.');
  assert.ok(root.hasAttribute('data-no-track'), 'the root lost data-no-track, so track.js has nothing to stop on.');
  assert.ok(root.hasAttribute('data-grounded'));

  for (const node of root.all()) {
    assert.ok(
      !node.hasAttribute('data-act'),
      `<${node.tagName}> inside the grounded root carries data-act. That attribute is what track.js records taps BY, so it is a per-link event with a label on it.`,
    );
  }
  // The one string assigned as markup gets checked too: an attribute inside
  // Google's own HTML would be invisible to the walk above.
  assert.ok(!root.querySelector('.g-suggestions').innerHTMLRaw.includes('data-act'));
});

test("no string this app exports appears as text inside the grounded root", async () => {
  const [{ TABLES }, voice] = await Promise.all([
    import('../public/js/ui-strings.js'),
    import('../public/js/voice.js'),
  ]);

  const ours = new Set();
  const harvest = (value) => {
    if (typeof value === 'string') { if (value.trim() !== '') ours.add(value.trim()); return; }
    if (Array.isArray(value)) { for (const v of value) harvest(v); return; }
    if (value && typeof value === 'object') { for (const v of Object.values(value)) harvest(v); }
  };
  for (const table of Object.values(TABLES)) harvest(table);
  harvest(voice.PERSONALITIES);
  assert.ok(ours.size > 100, 'the harvest found almost nothing, so this test would pass against anything.');

  const { root } = await renderRoot();
  const leaves = root.all().filter((n) => n.childNodes.length === 0).map((n) => n.textContent.trim());

  /*
   * TWO CHECKS, NOT ONE, because a single substring sweep is both too weak
   * and too strong. Too strong: "of", "on" and "sold" are all chrome strings
   * in ui-strings.js, and a Grounded Result that happens to contain the word
   * "sold" has not had Shin's content interspersed with it. Too weak on its
   * own the other way: a short label moved INTO the root would slip past a
   * length cut-off. So a short string has to match a whole field exactly, and
   * anything sentence-length is banned as a substring anywhere in the root.
   */
  for (const s of ours) {
    assert.ok(
      !leaves.includes(s),
      `"${s}" is one of Shin's own strings and it is a whole field inside the grounded root. The heading and the heads-up belong beside the root, never in it.`,
    );
    if (s.length >= 12) {
      assert.ok(
        !leaves.join(' ').includes(s),
        `"${s}" is one of Shin's own sentences and it is inside the grounded root. The Gemini terms say we will not intersperse any other content with a Grounded Result.`,
      );
    }
  }
});

test("Shin's sentences sit beside the grounded root, not inside it", async () => {
  const { section } = await renderSection();
  assert.ok(section);
  const root = section.querySelector('[data-grounded]');
  assert.ok(root, 'the section has no grounded root in it at all.');

  const heading = section.querySelector('.grounded-heading');
  assert.ok(heading, 'the section heading is missing.');
  assert.equal(heading.parentNode, section, 'the heading was appended into the root instead of beside it.');

  // The founder, 2026-09-14: "we will accept all answers gemini gives, just
  // give a heads up that something doesn't have a link". Two rows in the
  // fixture have none: one offer and one review.
  const headsUp = section.querySelector('.grounded-nolink');
  assert.ok(headsUp, 'no heads-up at all for the two rows with no link.');
  assert.equal(headsUp.parentNode, section, 'the heads-up was appended into the grounded root.');
  assert.equal(headsUp.childNodes.length, 2, 'one heads-up per linkless row: one offer and one review in this fixture.');
  assert.ok(headsUp.textContent.includes('Quarry Provisions'));
  assert.ok(headsUp.textContent.includes('Pinecrest Panel'));

  // And the linkless rows are still SHOWN, with their prices. Accepting every
  // answer Gemini gives is the other half of the founder's sentence.
  assert.ok(root.textContent.includes('5.25 CAD'));
  assert.ok(root.textContent.includes('Pinecrest Panel'));
});

/* ============================================================== the links */

test('every href inside the root is byte-identical to the one on the wire', async () => {
  const wire = WIRE();
  const { root } = await renderRoot(wire);
  const anchors = root.querySelectorAll('a');
  const expected = [
    wire.block.offers[0].url,
    wire.block.offers[1].url,
    wire.block.reviews[0].url,
  ];
  assert.equal(anchors.length, expected.length, 'the anchor count changed; a linkless row grew a link or a linked row lost one.');
  for (let i = 0; i < anchors.length; i += 1) {
    assert.equal(
      anchors[i].getAttribute('href'),
      expected[i],
      'an href differs from the wire. Even a tracking parameter appended here is an interstitial between the Link and its destination page.',
    );
  }
});

test('grounded.js contains none of the five shapes that would come between a link and its destination', () => {
  const src = code(GROUNDED_SRC);
  for (const [pattern, why] of [
    [/\/r\//, 'a redirect hop'],
    [/utm_/, 'a campaign parameter'],
    [/[?&]tag=/, 'an affiliate tag'],
    [/redirect/i, 'a redirect'],
    [/<iframe/i, 'an iframe wrapper'],
  ]) {
    assert.doesNotMatch(
      src,
      pattern,
      `grounded.js now contains ${why}. The terms forbid placing interstitial content between a Link and its destination page or redirecting end users away from it.`,
    );
  }
});

test('grounded.js never reformats or reorders what it was given', () => {
  const src = code(GROUNDED_SRC);
  for (const [pattern, why] of [
    [/\.sort\s*\(/, 're-ordering the rows changes what the reader is told the search found'],
    [/\.slice\s*\(/, 'cutting the list short is "inhibit the full and complete display"'],
    [/\bcad\s*\(/, "formatting a grounded price with Shin's own currency helper is modifying it"],
    [/Intl\.NumberFormat/, 'reformatting a number is modifying it'],
  ]) {
    assert.doesNotMatch(src, pattern, `grounded.js uses something it must not: ${why}.`);
  }
});

/* ==================================================== the one innerHTML == */

test('grounded.js assigns innerHTML exactly once, and assigns the wire value with nothing done to it', () => {
  const src = code(GROUNDED_SRC);
  const assignments = [...src.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)];
  assert.equal(
    assignments.length,
    1,
    `grounded.js has ${assignments.length} innerHTML assignments. Exactly one is allowed: Google's own rendered Search Suggestions. Every other field is textContent, so the exception stays visible.`,
  );
  assert.equal(
    assignments[0][1].trim(),
    'suggestionsHtml',
    'the innerHTML assignment has something applied to the wire value. Escaping it shows the reader markup instead of the suggestions; trimming, replacing or rebuilding it is "modify".',
  );
});

/*
 * REVERSED 2026-09-15. This test used to require that a block with no Search
 * Suggestions render nothing. Jamin's ruling that day ("don't prevent
 * something from functioning just because of legal issues") made the answer
 * outrank the term, so the prices and reviews now render without them.
 */
test('with no Search Suggestions the block still renders its prices and reviews, with no empty suggestions box', async () => {
  for (const missing of [undefined, null, '', 0]) {
    const wire = WIRE();
    wire.suggestionsHtml = missing;
    const { root } = await renderRoot(wire);
    assert.ok(root, 'a grounded block with no Search Suggestions was thrown away');
    assert.equal(root.querySelectorAll('.g-offer').length, 3);
    assert.equal(root.querySelector('.g-suggestions'), null);
  }
});

test('the price line gets the gauge zone edges, the unchecked label and the borrowed-size note sit outside the root', async () => {
  const wire = WIRE();
  wire.block.checked = false;
  wire.block.verdict.sizeAssumed = true;
  const { section } = await renderSection(wire);
  const zones = section.querySelectorAll('.pl-zone');
  assert.ok((zones[0].getAttribute('style') ?? '').includes('width:37.5%'), 'the under-your-line zone ignored zoneUnderBoundary');
  const root = section.querySelector('[data-grounded]');
  const unchecked = section.querySelector('.grounded-unchecked');
  assert.ok(unchecked, 'an unchecked block carried no label saying so');
  assert.ok(section.querySelector('.grounded-size-assumed'));
  assert.ok(!root.querySelectorAll('p').some((p) => p === unchecked), 'the label is inside the root');
});

test('a barcode block names the product fact by fact, and a fact with no link gets the heads-up', async () => {
  const wire = WIRE();
  wire.block = {
    kind: 'barcode',
    checked: false,
    name: 'Tidewater Citrus Soda',
    facts: [
      { field: 'name', value: 'Tidewater Citrus Soda', url: 'https://tidewater.example.ca/p', hasLink: true },
      { field: 'size', value: '2 L', url: null, hasLink: false },
    ],
    offers: [],
    reviews: [],
  };
  const { section } = await renderSection(wire);
  const facts = section.querySelectorAll('.g-fact');
  assert.equal(facts.length, 2);
  assert.equal(facts[0].querySelector('a').getAttribute('href'), 'https://tidewater.example.ca/p');
  const nolink = section.querySelector('.grounded-nolink').childNodes;
  assert.equal(nolink.length, 1);
  assert.match(nolink[0].textContent, /2 L/);
});

/* =========================================================== the caching = */

test('sw.js still returns for /api/ before it touches a cache', () => {
  const fetchHandler = SW_SRC.slice(SW_SRC.indexOf("addEventListener('fetch'"));
  assert.ok(fetchHandler.length > 200, 'the fetch handler could not be found in sw.js.');
  const apiReturn = fetchHandler.indexOf("startsWith('/api/')");
  const firstCache = fetchHandler.indexOf('caches.');
  assert.ok(apiReturn > -1, 'the /api/ early return is gone from the service worker fetch handler.');
  assert.ok(
    apiReturn < firstCache,
    'the service worker reaches a cache before it has ruled out an /api/ request. Google\'s "will not cache" term rests on that one line, and a grounded answer arrives through /api/.',
  );
});

/* ========================================================= the price line */

const labelOf = (group, points, merged) =>
  (group.members.length === 1 ? String(points[group.members[0]].label) : merged(group.members.length));

test('at 390px no two price-line labels on the same side overlap', async () => {
  const pl = await import('../public/js/price-line.js');
  const { t } = await import('../public/js/ui-strings.js');
  const merged = (n) => t('priceline_merged', { n: String(n) });

  // Three fixtures, worst case last: dots piled on one spot are exactly the
  // case the merge rule exists for, and a layout that only works on evenly
  // spread points is a layout that works on nothing real.
  const sets = [
    WIRE().block.verdict.points,
    [0.0, 0.2, 0.4, 0.6, 0.8, 1.0].map((position, i) => ({ position, label: `${i + 1} x 355 mL, $${i}.49` })),
    [0.50, 0.505, 0.51, 0.515, 0.52, 0.9].map((position, i) => ({ position, label: `${i + 1} x 1.89 L, $1${i}.99` })),
  ];

  for (const points of sets) {
    const groups = pl.layoutMarkers(points, 390);
    assert.ok(groups.length > 0);
    const boxes = groups.map((g) => {
      const inner = 390 - pl.TRACK_INSET * 2;
      const centre = pl.TRACK_INSET + g.position * inner;
      // Centred and NOT clamped, because the CSS does not clamp: `.pl-label`
      // is centred on its marker with translateX(-50%) and nothing pulls it
      // back from an edge. A test that clamped would be measuring a layout
      // the browser never draws, which is how the first version of this
      // reported clean while the 390px render pass found an overlap.
      const w = pl.labelWidth(labelOf(g, points, merged));
      const left = centre - w / 2;
      return { left, right: left + w, side: g.side };
    });
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (boxes[i].side !== boxes[j].side) continue;
        const gap = Math.max(boxes[i].left, boxes[j].left) - Math.min(boxes[i].right, boxes[j].right);
        assert.ok(
          gap >= pl.MIN_GAP_PX - 0.001,
          `two labels on the ${boxes[i].side} side overlap at 390px (gap ${gap.toFixed(1)}px). Every dot has to keep its quantity on it, so the fix is to merge or to flip a side, never to drop a label.`,
        );
      }
    }
    // And every dot is still accounted for: merging hides nothing, it groups.
    const shown = groups.reduce((n, g) => n + g.members.length, 0);
    assert.equal(shown, points.length, 'a dot went missing between the wire and the layout.');
  }
});

test('a dot sits where the wire put it, and moves when the wire moves it', async () => {
  const wire = WIRE();
  const first = await renderSection(wire);
  const shelfOne = first.section.querySelector('.pl-shelf').getAttribute('data-position');

  const moved = WIRE();
  // The gauge's scale: 21 out of 100, which draws at the fraction 0.21. The
  // two numbers looking alike is why this test caught the scale mistake and
  // also why it has to say which is which.
  moved.block.verdict.shelf.position = 21;
  moved.block.verdict.points[0].position = 34;
  const second = await renderSection(moved);
  const shelfTwo = second.section.querySelector('.pl-shelf').getAttribute('data-position');
  const dotTwo = second.section.querySelector('.pl-dot-big').getAttribute('style');

  assert.notEqual(
    shelfOne,
    shelfTwo,
    'the large dot did not move when the wire position changed, so the client is computing a position of its own. Working out where a grounded price sits is this app analysing a Grounded Result, which the terms forbid, and it is a second copy of arithmetic the server already did.',
  );
  assert.equal(shelfTwo, '21', 'the marker must record the wire position as sent, unconverted.');
  assert.ok(dotTwo.includes('0.21'), 'the large dot is not drawn at the wire position (21 of 100 is the fraction 0.21).');
  assert.ok(
    second.section.querySelectorAll('.pl-marker').some((m) => (m.getAttribute('style') ?? '').includes('0.34')),
    'a store dot ignored its wire position too.',
  );
});

test('every dot carries its quantity, the large one included, and the zones carry words', async () => {
  const { section } = await renderSection(WIRE(), { shelfLabel: '6 x 355 mL, $6.19' });
  const labels = section.querySelectorAll('.pl-label').map((n) => n.textContent);
  assert.ok(labels.some((l) => l.includes('6 x 355 mL, $4.49')), "a store dot lost the wire's own quantity label.");
  assert.ok(labels.some((l) => l.includes('4 L, $6.99')));

  const shelf = section.querySelector('.pl-shelf-label').textContent;
  assert.ok(
    shelf.includes('6 x 355 mL, $6.19'),
    'the large dot has no quantity on it. The founder: "there also needs to be measures in place that label each dot on the graph with its actrual quantity", and the scanned item is a dot on the graph.',
  );
  assert.ok(shelf.includes('18%'), 'the large dot lost the reading the server sent with it.');

  const words = section.querySelectorAll('.pl-zone-word').map((n) => n.textContent).filter(Boolean);
  assert.equal(words.length, 3, 'a zone is identified by colour alone. Three zones, three words, always.');
  assert.deepEqual(words, ['under your line', 'in the middle', 'over your line']);

  const caption = section.querySelector('.pl-caption').textContent;
  assert.equal(caption, 'Per 100 mL, 3 prices found');
  assert.ok(!/factually/i.test(caption), 'the word "factually" is a claim about correctness that nothing here has measured.');
});

test('the zone words and the large dot reading name the user\'s line, never a grading of the price', async () => {
  const { setLocale } = await import('../public/js/ui-strings.js');
  /*
   * The same ban list test/refusal-swaps.test.mjs keeps, applied to the words
   * this feature introduces. It is copied rather than imported because that
   * file does not export it, and a divergence between the two would be caught
   * the moment either is edited: both lists come from
   * docs/plan-always-a-price.md section 3 plus hard rule 2.
   */
  const BANNED = {
    en: ['good', 'fair', 'high', 'higher', 'walk away', 'deal', 'cheap', 'cheaper', 'expensive',
      'overpriced', 'steal', 'steep', 'bargain', 'rip-off', 'ripoff', 'robbery',
      'over the usual', 'under the usual'],
    fr: ['cher', 'chère', 'chers', 'chères', 'bon prix', 'aubaine', 'salé', 'salée', 'élevé',
      'élevée', 'rabais', 'vol', 'volent', 'laisse faire', 'au-dessus du prix', 'en dessous du prix'],
  };
  const boundaried = (w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu');
  // The canary test/refusal-swaps.test.mjs keeps too: a regex that matched
  // nothing would pass every assertion below while proving nothing.
  assert.match('That is expensive.', boundaried('expensive'));
  assert.doesNotMatch('quelque chose de semblable', boundaried('cher'));

  const bad = [];
  for (const id of ['en', 'fr']) {
    setLocale(id);
    const { section } = await renderSection(WIRE(), { locale: id, shelfLabel: '6 x 355 mL, $6.19' });
    const words = [
      ...section.querySelectorAll('.pl-zone-word').map((n) => n.textContent),
      ...section.querySelectorAll('.pl-label').map((n) => n.textContent),
      section.querySelector('.pl-caption').textContent,
      section.querySelector('.grounded-heading').textContent,
      section.querySelector('.grounded-nolink').textContent,
      /*
       * D-113's two new sentences. They are absent from THIS fixture, which
       * draws a full line, so they are collected from a second render below
       * as well -- but they are named here so that the next person adding a
       * selector to this list finds them already in it.
       */
      ...[...section.querySelectorAll('.grounded-no-line')].map((n) => n.textContent),
      ...[...section.querySelectorAll('.grounded-line-thin')].map((n) => n.textContent),
    ];
    // The no-line sentences, rendered for real, in the same locale.
    const noLine = NO_LINE_WIRE('no_offers_on_line');
    const { section: bare } = await renderSection(noLine, { locale: id });
    for (const n of [...bare.querySelectorAll('.grounded-no-line')]) words.push(n.textContent);
    // The same-store line, with and without a date, rendered for real.
    const { section: twice } = await renderSection(SAME_STORE_WIRE(), { locale: id });
    const twiceLines = [...(twice.querySelector('.grounded-same-store')?.querySelectorAll('li') ?? [])];
    assert.equal(twiceLines.length, 2, `${id}: the same-store lines did not render, so the ban check saw nothing`);
    for (const n of twiceLines) words.push(n.textContent);
    for (const line of words) {
      for (const word of BANNED[id]) {
        if (boundaried(word).test(line)) bad.push(`${id}: "${word}" in ${JSON.stringify(line)}`);
      }
    }
  }
  setLocale('en');
  assert.deepEqual(bad, [], [
    'The price line graded a price.',
    'The zones name the range the USER set ("under your line", "sous ta limite"), never Shin\'s reading of the number.',
    'Hard rule 2: Competition Act s.74.01(1)(b) requires adequate and proper testing behind a performance claim.',
    'Change the string, never this list.',
  ].join('\n'));
});

test('the setup screen asks for both lines and stores them where the price line reads them', async () => {
  const src = read('../public/js/screens/setup.js');
  /* Three ranges and a unit now: setup draws lib/range-picker.js, which asks the
     three questions and stores them under the names the price line reads. */
  const picker = read('../public/js/lib/range-picker.js');
  assert.match(src, /rangePickerHtml/, 'the setup screen no longer draws the price ranges.');
  assert.match(picker, /ranges_\$\{kind\}_q/, 'the picker no longer asks each range its question.');
  const ranges = read('../public/js/lib/ranges.js');
  assert.match(ranges, /lineUnderPct/);
  assert.match(ranges, /lineOverPct/);

  const store = await import('../public/js/store.js');
  /* D10 (2026-10-06): the store holds nothing until the shopper chooses; the one
     default set (good 20, bad 20, great 30) is lib/ranges.js's DEFAULT_PERCENTS. */
  assert.equal(store.get().lineUnderPct, null, 'an unset line is stored as the shopper\'s own number, never a default.');
  assert.equal(store.get().lineOverPct, null);
  const { rangesOf, DEFAULT_PERCENTS } = await import('../public/js/lib/ranges.js');
  assert.equal(DEFAULT_PERCENTS.good, 20);
  assert.equal(DEFAULT_PERCENTS.bad, 20);
  assert.equal(rangesOf(store.get()).good, 20, 'an unset store reads the one default set.');
  assert.equal(rangesOf(store.get()).great, 30);
  assert.ok(store.LINE_CHOICES.includes(20), 'twenty is not among the values on offer, so the default cannot be chosen back.');

  // And the You page can change them, which is what setup's own fineprint
  // promises. A promise with no control behind it is a defect.
  const you = read('../public/js/screens/you.js');
  assert.match(you, /rangePickerHtml\(store\.get\(\), 'you'\)/);
  assert.match(you, /handleRangeClick/);
});

test('the verdict sheet actually reaches the grounded block', () => {
  const camera = read('../public/js/screens/camera.js');
  assert.match(camera, /import \{ mountGrounded \} from '\.\.\/grounded\.js';/);
  assert.match(camera, /data-grounded-slot/, 'the sheet has no container to mount into.');
  // Both mount sites: the scan itself, and the repaint the save does.
  // Three since 2026-09-15: the refusal sheet mounts it too, so a refusal
  // for want of sellers still shows what the web search found.
  // Four since 2026-09-19: the Gemini answer sheet, which is what `/api/price`
  // now returns, mounts its own block the same way.
  // Five since 2026-09-23: a typed search answered from Shin's own prices
  // draws the Gemini answer sheet itself (showOwnData), so it mounts there too.
  assert.equal(
    (camera.match(/(?<!function )fillGrounded\(slot, \w+\);/g) ?? []).length,
    5,
    'one of the five sheet renders (the Gemini answer, the typed own-data answer, the verdict, its repaint on save, the refusal) no longer mounts the grounded block.',
  );
  // Two sections, never one list: the grounded slot sits outside provenance().
  assert.ok(
    camera.indexOf('${provenance(') < camera.indexOf('${groundedSlot()}'),
    "the grounded section moved above Shin's own price list; they are two sections and the reader has to be able to tell them apart.",
  );
});

test('the mini DOM this file relies on actually reports a failure', () => {
  // A harness canary. Every behavioural test above is only worth what this is.
  const doc = makeDocument();
  const outer = doc.createElement('div');
  outer.setAttribute('data-no-track', '');
  const inner = doc.createElement('button');
  outer.appendChild(inner);
  doc.body.appendChild(outer);
  assert.equal(inner.closest('[data-no-track]'), outer, 'closest does not walk ancestors, so the guard test proves nothing.');
  assert.equal(doc.createElement('span').closest('[data-no-track]'), null);
  assert.ok(inner instanceof MiniElement);

  let seen = 0;
  doc.addEventListener('click', () => { seen += 1; }, { capture: true });
  click(inner);
  assert.equal(seen, 1, 'a capture-phase listener on the document never fired, so the tap tests never exercised track.js at all.');
});

/* ------------------------------------------------------------------ D-113 */

/** The same wire with no line on it, and a stated reason there is none. */
const NO_LINE_WIRE = (reason) => {
  const wire = WIRE();
  return {
    ...wire,
    block: { ...wire.block, verdict: null, noLineReason: reason },
  };
};

/** The same wire with one price on the line: a median of one, marked as one seller's. */
const ONE_PRICE_WIRE = () => {
  const wire = WIRE();
  return {
    ...wire,
    block: {
      ...wire.block,
      verdict: {
        ...wire.block.verdict,
        median: '4.49 CAD',
        n: 1,
        shelf: { position: 50, zone: 'middle', pct: 0 },
        points: [{ retailer: 'Northfield Grocers', position: 50, price: '4.49 CAD', label: '6 x 355 mL, $4.49', marks: [] }],
        excluded: [],
      },
    },
  };
};

test('a scan with only one price draws a line and says it is one seller\'s price', async () => {
  /*
   * D-113 withheld the line for a single offer; the owner reversed it on
   * 2026-09-19 ("the one price becomes the median"). The line is drawn, and
   * the shopper is told that the middle is that one price, in place of a
   * caption about "1 prices".
   */
  const { setLocale } = await import('../public/js/ui-strings.js');
  for (const [id, note, caption] of [
    ['en', 'Only one price found, so the middle is that price.', 'Per 100 mL, one price found'],
    ['fr', 'Un seul prix trouvé, donc le milieu est ce prix.', 'Par 100 mL, un seul prix trouvé'],
  ]) {
    setLocale(id);
    const { section } = await renderSection(ONE_PRICE_WIRE(), { locale: id, shelfLabel: '6 x 355 mL, $4.49' });
    assert.equal(section.querySelector('.grounded-no-line'), null, `${id}: a single price is not a reason to withhold the line`);
    assert.equal(section.querySelector('.pl-caption').textContent, caption, `${id}: the caption counts one price in the singular`);
    assert.equal(section.querySelector('.grounded-line-thin').textContent, note, `${id}: one price was not marked as one seller's price`);
    assert.ok(section.querySelectorAll('.g-offer').length > 0, 'the offers are still on screen');
  }
  setLocale('en');
});

test('a members-only or marketplace price is marked on its dot and on the list, outside the Google root', async () => {
  const { setLocale } = await import('../public/js/ui-strings.js');
  const wire = WIRE();
  wire.block.offers[1] = { ...wire.block.offers[1], memberOnly: true };
  wire.block.offers[2] = { ...wire.block.offers[2], marketplace: true };
  wire.block.verdict.points[1] = { ...wire.block.verdict.points[1], marks: ['member_only'] };
  wire.block.verdict.points[2] = { ...wire.block.verdict.points[2], marks: ['marketplace'] };
  for (const [id, labels, listed] of [
    ['en', ['4 L, $6.99 · members only', '6 x 355 mL, $5.25 · marketplace seller'],
      ['Members only: Ridgeway Market', 'Marketplace seller: Quarry Provisions']],
    ['fr', ['4 L, $6.99 · réservé aux membres', '6 x 355 mL, $5.25 · vendeur de la place de marché'],
      ['Réservé aux membres : Ridgeway Market', 'Vendeur de la place de marché : Quarry Provisions']],
  ]) {
    setLocale(id);
    const { section } = await renderSection(wire, { locale: id, shelfLabel: '6 x 355 mL, $6.19' });
    const dots = section.querySelectorAll('.pl-label').map((n) => n.textContent);
    for (const l of labels) assert.ok(dots.includes(l), `${id}: no dot labelled ${JSON.stringify(l)}, got ${JSON.stringify(dots)}`);
    assert.ok(dots.includes('6 x 355 mL, $4.49'), `${id}: an unmarked price gained a mark`);
    const list = section.querySelector('.grounded-marks');
    assert.ok(list, `${id}: the marked offers are not listed`);
    assert.deepEqual([...list.querySelectorAll('li')].map((n) => n.textContent), listed, `${id}: the list of marked offers is wrong`);
    // Shin's own text, never inside Google's no-track block.
    assert.equal(list.closest('[data-no-track]'), null, 'the marks went inside the Google-owned block');
  }
  setLocale('en');
  // Nothing marked, no list: an unmarked wire adds nothing.
  const { section: plain } = await renderSection(WIRE(), {});
  assert.equal(plain.querySelector('.grounded-marks'), null);
});

test("Shin's own row for a store the search also quoted gets one dated line, outside the Google root, and every row stays", async () => {
  const { setLocale } = await import('../public/js/ui-strings.js');
  for (const [id, listed] of [
    ['en', [
      'Northfield Grocers Canada: Shin’s own record for this store, seen 2026-09-20. Not checked.',
      'Ridgeway Market: Shin’s own record for this store. Not checked.',
    ]],
    ['fr', [
      'Northfield Grocers Canada : relevé de Shin pour ce magasin, vu le 2026-09-20. Pas vérifié.',
      'Ridgeway Market : relevé de Shin pour ce magasin. Pas vérifié.',
    ]],
  ]) {
    setLocale(id);
    const { section } = await renderSection(SAME_STORE_WIRE(), { locale: id });
    const list = section.querySelector('.grounded-same-store');
    assert.ok(list, `${id}: the same-store rows are not mentioned`);
    assert.deepEqual([...list.querySelectorAll('li')].map((n) => n.textContent), listed, `${id}: the same-store lines are wrong`);
    assert.equal(list.closest('[data-no-track]'), null, 'the same-store line went inside the Google-owned block');
    assert.equal(section.querySelectorAll('.g-offer').length, 6, `${id}: a row was dropped; both sources must stay on screen`);
  }
  setLocale('en');
  // Nothing marked, no list.
  const { section: plain } = await renderSection(WIRE(), {});
  assert.equal(plain.querySelector('.grounded-same-store'), null);
});

test('each reason for having no line gets its own sentence, never a shrug', async () => {
  const seen = new Set();
  for (const reason of ['no_shelf_size', 'no_offers_on_line']) {
    const { section } = await renderSection(NO_LINE_WIRE(reason), {});
    const note = section.querySelector('.grounded-no-line');
    assert.ok(note, `no sentence for ${reason}`);
    seen.add(note.textContent);
  }
  assert.equal(seen.size, 2, 'two different causes must not collapse into one sentence');
  for (const line of seen) {
    assert.doesNotMatch(line, /shin (does not|doesn't) know|unknown|error/i, 'rule 6: never tell the shopper the app does not know');
  }
  // The retired reason says nothing, and does not draw a sentence off a stale wire.
  const { section: stale } = await renderSection(NO_LINE_WIRE('single_offer'), {});
  assert.equal(stale.querySelector('.grounded-no-line'), null);
});
