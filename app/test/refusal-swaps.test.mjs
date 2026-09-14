/**
 * A refusal that cannot call the price still hands over something priced.
 *
 * THE FOUNDER'S SENTENCE, VERBATIM: "if there is no comparison say that it is
 * expensive and there is no comparison, we can offer another item for this
 * that is worth their money but not identical."
 *
 * Half of that ships and half of it cannot, and the split is the whole reason
 * this file exists rather than a couple of lines in `price-only.test.mjs`.
 *
 * WHAT CANNOT SHIP: the word "expensive". With no comparison set there is no
 * basis for it, which is the repo's hard rule 2 and also Competition Act
 * s.74.01(1)(b) -- a representation about an ordinary price made with no
 * adequate and proper test behind it. voice.js's own header promise says the
 * same thing in smaller letters: the attitude changes the words and never the
 * number, and a tier word is a number in disguise.
 * docs/plan-always-a-price.md section 3 then draws the line for the whole
 * system: only a real verdict may say good, fair, high, walk away, deal or
 * cheaper. Everything else is a reference and states what it rests on.
 *
 * WHAT SHIPS: the substitute. It is the half that was always the useful half,
 * because a priced thing beside the shelf is a fact, and "expensive" was only
 * ever a feeling about one.
 *
 * So the assertions here are mostly negative, and deliberately: what makes
 * this feature correct is a list of things it must never do. Never a tier
 * word, in any of the six voice variants. Never the server's "Cheaper <leaf>"
 * heading on a sheet that judged nothing. Never a box that could not fill --
 * no code, no price, no swaps. Never a refusal promoted into a verdict: the
 * sheet keeps `data-tier="unknown"`, its one action, and no share or watch.
 *
 * NOTHING HERE HAS BEEN SEEN IN A BROWSER. The sheet builders are pure and
 * exported, so they are rendered for real; the fetch that fills the box lives
 * inside `render(root, ctx)`'s closure, which this package has no DOM to
 * mount, so that half is asserted against the source. The same trade
 * `price-only.test.mjs` and `cheaper-rings.test.mjs` already make.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { refusalSheet, cheaperList, isThinReason } from '../public/js/screens/camera.js';
import { say } from '../public/js/voice.js';
import { PERSONALITIES } from '../public/js/voice.js';
import { t } from '../public/js/ui-strings.js';

const CAMERA = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8');

/** The locale swap `voice.test.mjs` and `price-only.test.mjs` both use. */
function inLocale(id, fn) {
  const hadStore = 'localStorage' in globalThis;
  const before = hadStore ? globalThis.localStorage : undefined;
  const cell = new Map([['shin.locale', id]]);
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
  try {
    return fn();
  } finally {
    if (hadStore) globalThis.localStorage = before;
    else delete globalThis.localStorage;
  }
}

const refusal = (reason, extra = {}) => ({
  kind: 'refusal',
  reason,
  detail: 'Only one shop has a price for this, so there is nothing to compare against.',
  identity: { id: 'p1', label: 'Kraft Dinner 225 g' },
  evidence: [],
  ...extra,
});

/** A thin reason, taken from the screen's own list so this cannot drift. */
const THIN = 'too_few_points';
const NOT_THIN = ['no_identity', 'identity_unsure', 'category_unsupported', 'model_timeout'];

const OPTS = { priceRoute: true, swapCode: '0064100144521', askingCents: 599 };

const count = (html, needle) => html.split(needle).length - 1;

/* ------------------------------------------------------------------ *
 * The box: drawn when it can fill, and never when it cannot.
 * ------------------------------------------------------------------ */

test('the list this test uses really is a thin reason and the others really are not', () => {
  assert.ok(isThinReason(THIN), `${THIN} is no longer a thin reason; this whole file is testing nothing`);
  for (const r of NOT_THIN) {
    assert.ok(!isThinReason(r), `${r} became a thin reason; the fixtures here need rethinking`);
  }
});

test('a thin refusal with a code and an asking price offers swaps', () => {
  const html = refusalSheet(refusal(THIN), null, [], null, OPTS);
  assert.match(html, /data-cheaper/, 'no slot for the swaps, so nothing can be offered');
});

test('a thin refusal with no code offers nothing, because the lookup is keyed on one', () => {
  const html = refusalSheet(refusal(THIN), null, [], null, { ...OPTS, swapCode: null });
  assert.doesNotMatch(
    html,
    /data-cheaper/,
    'a box that could never fill. /api/alternatives takes a barcode; with none there is no query to send.',
  );
});

test('a thin refusal with no asking price offers nothing, because there is no cut-off', () => {
  for (const askingCents of [undefined, null, Number.NaN, '599']) {
    const html = refusalSheet(refusal(THIN), null, [], null, { ...OPTS, askingCents });
    assert.doesNotMatch(
      html,
      /data-cheaper/,
      `askingCents ${String(askingCents)}: "cheaper than what?" has no answer, so the rows would mean nothing`,
    );
  }
});

test('the other refusals offer no swaps, because they are a different failure', () => {
  for (const reason of NOT_THIN) {
    const html = refusalSheet(refusal(reason), { category: 'grocery' }, ['Groceries'], null, OPTS);
    assert.doesNotMatch(
      html,
      /data-cheaper/,
      `${reason}: no identity and unsure-which-one do not know what the swaps would be swaps FOR, and an unsupported category has already said it will not price this kind of thing.`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * The line. This is the one the law is about.
 * ------------------------------------------------------------------ */

/**
 * Every word that grades a price, in both languages.
 *
 * The list is docs/plan-always-a-price.md section 3's own ("never the words
 * good, fair, high, walk away, deal or cheaper") plus the three from the
 * brief, plus the French of each. Word boundaries rather than substrings, so
 * "prononcer" is not read as a hit on "cher" -- an over-firing rule gets an
 * exception per false positive and then dies.
 */
const GRADING_WORDS = {
  en: [
    'good', 'fair', 'high', 'higher', 'walk away', 'deal', 'cheap', 'cheaper',
    'expensive', 'overpriced', 'steal', 'steep', 'bargain', 'rip-off', 'ripoff',
    'robbery', 'over the usual', 'under the usual',
  ],
  fr: [
    'cher', 'chère', 'chers', 'chères', 'bon prix', 'aubaine', 'salé', 'salée',
    'élevé', 'élevée', 'rabais', 'vol', 'volent', 'laisse faire',
    'au-dessus du prix', 'en dessous du prix',
  ],
};

/*
 * "au-dessus" ON ITS OWN IS NOT ON THE LIST, and leaving it off is a decision
 * rather than an oversight. The French for a parent swap is "une catégorie
 * au-dessus": one category up, which is a statement about how WIDE the claim
 * is, not about whether a price is high. That badge is the thing D-036 asked
 * for and it has to survive this rule. What is forbidden is the price reading,
 * "au-dessus du prix", so that is what is listed.
 */

const boundaried = (word) => new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu');

/**
 * The words a person actually reads, with the markup taken out.
 *
 * Attribute names and class names are not prose: `data-cheaper` and
 * `class="cheaper"` are the identifiers this feature is BUILT from, and a rule
 * that read them as Shin calling something cheap would fire on every correct
 * version of the code. Tags out first, then scan what is left.
 */
const textOf = (html) => html.replace(/<[^>]*>/g, ' ');

test('the absence rule can actually see a grading word', () => {
  // A canary. A regex that matched nothing would pass the checks below while
  // proving nothing at all about them.
  assert.match('That is expensive.', boundaried('expensive'));
  assert.match("Ouf, c'est salé.", boundaried('salé'));
  assert.doesNotMatch('I cannot pronounce it.', boundaried('cher'));
  assert.doesNotMatch('quelque chose de semblable', boundaried('cher'));
  // And the markup really is gone before anything is scanned.
  assert.doesNotMatch(textOf('<div class="cheaper" data-cheaper>Similar</div>'), boundaried('cheaper'));
  assert.match(textOf('<p>That is cheaper</p>'), boundaried('cheaper'));
});

/**
 * Every line this feature puts on a sheet that judged nothing.
 *
 * `refuse_thin_swaps` is the sentence over the swaps. `cam_similar_failed` is
 * the sentence INSTEAD of them, when the lookup threw, and it is on this list
 * for a reason worth writing down: it is a sentence about a SEARCH, not about
 * a price, and it was still wrong. The default it replaces reads "I could not
 * check for a cheaper one", and a shopper skimming that on a refusal does not
 * parse it as a statement about a request that failed -- they read that Shin
 * was pricing this against something. What the sentence is about matters less
 * than the sheet it is read on.
 */
const NO_COMPARISON_KEYS = ['refuse_thin_swaps', 'cam_similar_failed', 'cam_similar_none'];

test('every no-comparison line grades nothing, in all three personalities and both locales', () => {
  const bad = [];
  for (const id of ['en', 'fr']) {
    inLocale(id, () => {
      for (const key of NO_COMPARISON_KEYS) {
        for (const who of PERSONALITIES.map((p) => p.id)) {
          const line = say(key, {}, who);
          assert.ok(line, `${key}/${id}/${who} is empty; a missing key is silent on the screen`);
          for (const word of GRADING_WORDS[id]) {
            if (boundaried(word).test(line)) bad.push(`${key} ${id}/${who}: "${word}" in ${JSON.stringify(line)}`);
          }
        }
      }
    });
  }
  assert.deepEqual(bad, [], [
    'Shin graded a price with no comparison behind it.',
    '',
    'There is no comparison set on this sheet, so there is no basis for any of these',
    'words. Hard rule 2 forbids it and Competition Act s.74.01(1)(b) calls it a',
    'representation about an ordinary price with no adequate and proper test behind',
    'it. docs/plan-always-a-price.md section 3 says the same: only a verdict may use',
    'them. The substitute below the line is what carries the value; the line itself',
    'says there is nothing to compare to, and stops.',
    '',
    ...bad,
  ].join('\n'));
});

test('the no-comparison line is spoken only when there is actually something to hand over', () => {
  const withSwaps = refusalSheet(refusal(THIN), null, [], null, OPTS);
  const without = refusalSheet(refusal(THIN), null, [], null, { ...OPTS, swapCode: null });
  assert.ok(
    withSwaps.includes(say('refuse_thin_swaps')),
    'the swaps are offered and nothing says so',
  );
  assert.ok(
    !without.includes(say('refuse_thin_swaps')),
    'the line ends by pointing at rows that are not there, which is the line breaking its own promise in the same breath',
  );
});

test('the promise is taken back when the swaps it pointed at do not arrive', () => {
  /* Seen in a browser, 2026-09-14, both locales: the sheet said "here is
     something similar that has a price on it" and the box under it said "I
     could not check for something similar". The line is written before the
     lookup answers, so the only honest shape is one the lookup can undo. */
  const withSwaps = refusalSheet(refusal(THIN), null, [], null, OPTS);
  assert.match(
    withSwaps,
    /<p class="said" data-swap-promise>/,
    'the promise line has no handle, so nothing can remove it when the box comes back empty or the call fails',
  );
  const fill = CAMERA.slice(CAMERA.indexOf('async function fillCheaper('), CAMERA.indexOf('function dropSwapPromise('));
  assert.match(
    fill,
    /r\.alternatives\.length === 0\) dropSwapPromise\(root\)/,
    'an empty answer leaves the promise standing over an empty box',
  );
  assert.match(
    fill.slice(fill.indexOf('} catch {')),
    /dropSwapPromise\(root\)/,
    'a failed lookup leaves the promise standing over the failure sentence',
  );
  assert.match(
    CAMERA,
    /function dropSwapPromise\(root\) \{\s*for \(const el of root\.querySelectorAll\('\[data-swap-promise\]'\)\) el\.remove\(\);/,
    'the remover and the handle disagree on the attribute name',
  );
});

/* ------------------------------------------------------------------ *
 * The heading. "Cheaper <leaf>" is arithmetic, and there is none here.
 * ------------------------------------------------------------------ */

test('the swaps under a refusal are headed as a reference, not as a comparison', () => {
  for (const id of ['en', 'fr']) {
    inLocale(id, () => {
      const html = refusalSheet(refusal(THIN), null, [], null, OPTS);
      assert.ok(
        html.includes(t('cam_similar_priced')),
        `${id}: the refusal's swap block is not headed by cam_similar_priced`,
      );
      // From the OPENING ANGLE of the slot's own tag, not from the attribute
      // name: slicing mid-tag leaves "data-cheaper>" standing in front of the
      // text and the rule then fires on the identifier it was told to ignore.
      const at = html.indexOf('data-cheaper');
      const block = textOf(html.slice(html.lastIndexOf('<', at)));
      for (const word of GRADING_WORDS[id]) {
        assert.doesNotMatch(
          block,
          boundaried(word),
          `${id}: "${word}" over a list on a sheet that judged nothing`,
        );
      }
    });
  }
});

test('the all-looser note has a version with no comparison word in it', () => {
  const parent = {
    product: { name: 'Bartlett Pears', nameFr: null, brands: null, quantity: null },
    line: '$0.39 per 100 g at Fortinos, Kingston.',
    ring: 'parent',
    ringTag: 'en:dried-fruits',
  };
  for (const id of ['en', 'fr']) {
    inLocale(id, () => {
      const ref = cheaperList(t('cam_similar_priced'), [parent], { allLooserKey: 'cam_swap_all_looser_ref' });
      assert.ok(ref.includes(t('cam_swap_all_looser_ref')), `${id}: the reference note is not rendered`);
      const refText = textOf(ref);
      for (const word of GRADING_WORDS[id]) {
        assert.doesNotMatch(refText, boundaried(word), `${id}: "${word}" in the reference block`);
      }
      // And the verdict path is untouched: no argument, the old line, word for word.
      const verdict = cheaperList('Cheaper dried fruits', [parent]);
      assert.ok(
        verdict.includes(t('cam_swap_all_looser')),
        `${id}: the verdict's own all-looser line moved; that is arithmetic against a number it judged and it was not asked to change`,
      );
    });
  }
});

/* ------------------------------------------------------------------ *
 * A refusal with swaps under it is still a refusal.
 * ------------------------------------------------------------------ */

test('offering a substitute does not promote the refusal into a verdict', () => {
  const html = refusalSheet(refusal(THIN), null, [], null, OPTS);
  assert.match(html, /data-tier="unknown"/, 'a sheet that judged nothing drew a tier');
  assert.doesNotMatch(html, /data-act="share"/, 'nothing to share: there is no verdict on this sheet');
  assert.doesNotMatch(html, /data-act="watch"/, 'nothing to follow: there is no verdict on this sheet');
  assert.equal(
    count(html, 'class="pill'),
    1,
    'USAGE.md section 4 and section 7 both give a refusal exactly one action, and the swaps are not a second one',
  );
});

/* ------------------------------------------------------------------ *
 * The wiring, read off the source. This is the negative test that matters.
 * ------------------------------------------------------------------ */

test('the refusal path actually asks for the alternatives', () => {
  assert.match(
    CAMERA,
    /void fillCheaper\(slot, swapCode, askingCents/,
    [
      'Nothing on the refusal path calls /api/alternatives any more, so the slot the',
      'sheet draws stays on its placeholder forever and "we can offer another item for',
      'this" is a box that never fills. Delete this line and this test goes red, which',
      'is the only reason it is written against the source.',
    ].join('\n'),
  );
});

test('the refusal path asks for them with its own heading, not the server\'s', () => {
  const call = CAMERA.slice(CAMERA.indexOf('void fillCheaper(slot, swapCode, askingCents'));
  assert.match(
    call.slice(0, 300),
    /heading: t\('cam_similar_priced'\)/,
    'the server heading is "Cheaper <leaf>", which is a claim about a number this sheet never judged',
  );
  assert.match(
    call.slice(0, 300),
    /emptyKey: 'cam_similar_none'/,
    'an empty answer would fall back to the verdict wording, which says "cheaper"',
  );
  assert.match(
    call.slice(0, 300),
    /allLooserKey: 'cam_swap_all_looser_ref'/,
    'the all-looser note would fall back to the verdict wording, which says "cheaper"',
  );
  assert.match(
    call.slice(0, 300),
    /failKey: 'cam_similar_failed'/,
    'a lookup that threw would fall back to cam_cheaper_failed, which puts the word on a sheet that judged nothing',
  );
});

test('the verdict path keeps its own failure line, byte for byte', () => {
  // The refusal got a second sentence; the verdict was not asked to change.
  // `cam_cheaper_failed` is correct under a number that was actually settled.
  for (const id of ['en', 'fr']) {
    inLocale(id, () => {
      for (const who of PERSONALITIES.map((p) => p.id)) {
        assert.notEqual(
          say('cam_cheaper_failed', {}, who),
          say('cam_similar_failed', {}, who),
          `${id}/${who}: the two failure lines collapsed into one, so one of the two paths is now saying the wrong thing`,
        );
      }
    });
  }
  assert.match(
    CAMERA,
    /say\(opts\.failKey \?\? 'cam_cheaper_failed'\)/,
    'the default is no longer the verdict line, so every caller that passes no key changed behaviour',
  );
});

test('the code handed to the lookup is null on every reason that is not thin', () => {
  assert.match(
    CAMERA,
    /const swapCode = isThinReason\(result\.reason\) \? codeOf\(result, item\) : null;/,
    'the guard at the call site and the guard in refusalSheet have to agree, or one of them draws a box the other never fills',
  );
});
