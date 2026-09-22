/**
 * The Gemini grounded block: the ONLY file in public/js that reads inside the
 * `grounded` wire.
 *
 * WHY THE "ONLY" MATTERS. When Shin's own price sources have nothing, the
 * server asks Gemini, and Gemini answers from a Google Search. What comes
 * back is a Grounded Result under the Gemini API terms
 * (https://ai.google.dev/gemini-api/terms, eff. 2026-03-23), and the display
 * rules there are a contract rather than a preference. Keeping every read of
 * that wire in one file is what makes the contract checkable: a reviewer can
 * read this file and know that nothing else in the client reformats a
 * grounded price, re-sorts a grounded list, or attaches anything of ours to a
 * grounded link. Everything downstream of here is handed plain, already
 * extracted values (see `price-line.js`, which never sees the wire at all).
 *
 * THE FOUR TERMS THIS FILE IS SHAPED BY, each quoted and then answered:
 *
 * 1. "will not modify, or intersperse any other content with, the Grounded
 *    Results or Search Suggestions"
 *    -> Every field below is written with `textContent`, in the order the
 *       wire gave it. There is no `.sort`, no `.slice`, no `money()`, no
 *       `Intl.NumberFormat` anywhere in this file. A price renders as the
 *       exact bytes Gemini returned. Re-sorting cheapest-first, or turning
 *       "4.49" into "$4.49", is "modify" -- it changes what the reader is
 *       told the search said.
 *    -> "intersperse" is answered as DOM STRUCTURE, not as good intentions:
 *       Shin's own sentences (the section heading, the no-link heads-up) are
 *       SIBLINGS of `[data-grounded]`, never children of it. The root holds
 *       wire content and nothing else, so the separation survives a later
 *       edit by someone who has not read this header.
 *
 * 2. "will not place any interstitial content between any Link or Search
 *    Suggestions and the associated destination page, redirect end users away
 *    from the destination pages, or minimize, remove, or otherwise inhibit
 *    the full and complete display of any destination page"
 *    -> An anchor takes the wire's `url` verbatim into `href`. No appended
 *       query parameter, no `utm_`, no affiliate `tag=`, no `/r/` redirect
 *       hop, no `target` interstitial, no iframe, no confirm-before-you-leave
 *       sheet. `test/grounded-client.test.mjs` greps this file for each of
 *       those shapes, because the tempting version of every one of them is a
 *       one-line change.
 *
 * 3. "you will not track whether those interactions were specifically with a
 *    given Search Suggestion or Grounded Result... including any specific
 *    Link"
 *    -> The root carries `data-no-track`, and `track.js`'s document-level tap
 *       listener returns on any ancestor with that attribute, as its first
 *       statement. Nothing in this subtree carries `data-act`, which is the
 *       other thing that listener reads. Screen-level events still fire: that
 *       the result screen was open is ours to know, which link was pressed is
 *       not.
 *
 * 4. Search Suggestions must be shown with every grounded answer.
 *    -> They are shown whenever they arrive. REVERSED 2026-09-15: this file
 *       used to render NOTHING when they were missing. Jamin that day: "don't
 *       prevent something from functioning just because of legal issues", and
 *       "Having a response that is not checked is infinitely better than...
 *       told the app doesn't know". So a block with no suggestions now renders
 *       its prices and reviews without them. A terms crossing, left working.
 *    -> `suggestionsHtml` is this file's single `innerHTML` assignment, and
 *       its right-hand side is the wire's value with no method call on it. It
 *       is Google's own rendered HTML; escaping it or rebuilding it from its
 *       parts would be "modify". That is the one and only place in this
 *       client where unescaped remote HTML is assigned, and it is why the
 *       rest of the file is so strict: everything else is `textContent`, so
 *       the exception is visible rather than lost among others.
 *
 * NOT TRANSLATED AFTER THE FACT, and this is a deliberate exception to the
 * rule that every Shin string has French. The server asks Gemini for the
 * reader's language, so a French reader's grounded block arrives in French
 * from Google. Running it back through a translation once it is here would be
 * "modify" under term 1. So: Shin's sentences AROUND the block are translated
 * (they live in `ui-strings.js`), and the block's own words are whatever
 * Google sent, in whatever language Google sent them. Written down here
 * rather than left silent, because the French coverage test cannot see an
 * absence it was never told about.
 *
 * THE HEADS-UP ON A MISSING LINK is the founder's own call, 2026-09-14: "we
 * will accept all answers gemini gives, just give a heads up that something
 * doesn't have a link". So a `hasLink === false` offer or review is still
 * shown, in its wire position, with its price and its words intact. The
 * heads-up is a short plain sentence of Shin's, and by term 1 it goes OUTSIDE
 * the root with the rest of Shin's sentences.
 */

import { t } from './ui-strings.js';
import { priceLine } from './price-line.js';

/**
 * The document to build in. Defaulted rather than imported so the tests can
 * hand in a minimal stand-in: this app carries zero runtime dependencies by
 * decision (see `test/sheet.test.mjs`'s header), so there is no jsdom to
 * mount, and a renderer that can only run in a browser is a renderer nothing
 * checks.
 */
const docOf = (opts) => opts.doc ?? globalThis.document;

/** A text node's worth of value, with nullish rendered as empty. */
const str = (value) => (value === null || value === undefined ? '' : String(value));

function el(doc, tag, className) {
  const node = doc.createElement(tag);
  if (className) node.setAttribute('class', className);
  return node;
}

/**
 * One field of the wire, as text, in place.
 *
 * `textContent` and never `innerHTML`: a retailer name or a review summary
 * from a search result is remote text, and this is also the line that makes
 * "will not modify" true field by field. No trimming, no casing, no currency
 * formatting; the bytes Gemini sent are the bytes rendered.
 */
function field(doc, parent, className, value) {
  const text = str(value);
  if (text === '') return null;
  const node = el(doc, 'span', className);
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

/**
 * The destination link for one grounded row, or plain text when there is none.
 *
 * `href` is assigned the wire's value and nothing else. There is deliberately
 * no helper between the wire and this assignment: a `linkFor()` that "just
 * normalises" a URL is exactly how an affiliate tag gets added eighteen
 * months from now by somebody who never read term 2.
 */
function linkOrText(doc, row, item, label) {
  const text = str(label);
  if (item.hasLink === true && typeof item.url === 'string' && item.url !== '') {
    const a = doc.createElement('a');
    a.setAttribute('href', item.url);
    a.setAttribute('rel', 'noopener');
    a.textContent = text;
    row.appendChild(a);
    return a;
  }
  const span = el(doc, 'span', 'g-name');
  span.textContent = text;
  row.appendChild(span);
  return span;
}

/**
 * The root: wire content only, in wire order, and the thing `track.js` refuses
 * to look inside.
 *
 * Exported so the tests can assert on it directly rather than digging it out
 * of the section, and so a future caller that wants the block without Shin's
 * chrome cannot be tempted to reach into this file's internals for it.
 */
export function groundedRoot(grounded, opts = {}) {
  if (!grounded || grounded.kind !== 'grounded') return null;
  const block = grounded.block;
  if (!block) return null;
  // Term 4, reversed 2026-09-15: suggestions shown when present, and their
  // absence no longer costs the answer. See the header.
  const suggestionsHtml = typeof grounded.suggestionsHtml === 'string' ? grounded.suggestionsHtml : '';

  const doc = docOf(opts);
  const root = el(doc, 'div', 'grounded');
  root.setAttribute('data-grounded', '');
  root.setAttribute('data-no-track', '');
  // Not a landmark of Shin's own: the block is one quoted answer, and giving
  // it a role with an accessible name would mean putting one of our words on
  // it, which is the heading's job and the heading is outside.
  if (grounded.fetchedAt) root.setAttribute('data-fetched-at', str(grounded.fetchedAt));
  if (grounded.forDevice) root.setAttribute('data-for-device', str(grounded.forDevice));

  /*
   * A barcode the catalogue did not know, named by the search: one row per
   * fact (name, brand, size), each linked to the page that states it when
   * there is one. Added 2026-09-15 with the barcode lookup going live.
   */
  const facts = Array.isArray(block.facts) ? block.facts : [];
  if (facts.length > 0) {
    const list = el(doc, 'ul', 'g-facts');
    for (let i = 0; i < facts.length; i += 1) {
      const fact = facts[i];
      const row = el(doc, 'li', 'g-fact');
      row.setAttribute('data-field', str(fact.field));
      linkOrText(doc, row, fact, fact.value);
      list.appendChild(row);
    }
    root.appendChild(list);
  }

  if (typeof block.description === 'string' && block.description !== '') {
    const p = el(doc, 'p', 'g-description');
    p.textContent = block.description;
    root.appendChild(p);
  }

  const offers = Array.isArray(block.offers) ? block.offers : [];
  if (offers.length > 0) {
    const list = el(doc, 'ol', 'g-offers');
    // A plain `for`, walking the array as it arrived. Not `.map`, not
    // `.sort`, not `.slice`: the order on screen is the order Google
    // returned, and a reviewer can see that from the loop itself.
    for (let i = 0; i < offers.length; i += 1) {
      const offer = offers[i];
      const row = el(doc, 'li', 'g-offer');
      linkOrText(doc, row, offer, offer.retailer);
      // The price exactly as returned. `money()` is not imported into this file
      // and must not be: "$4.49" where Gemini said "4.49 CAD" is a modified
      // Grounded Result, however much nicer it looks beside our own prices.
      field(doc, row, 'g-price', offer.price);
      field(doc, row, 'g-pack', offer.packCount);
      field(doc, row, 'g-size', offer.sizeValue);
      field(doc, row, 'g-unit', offer.sizeUnit);
      list.appendChild(row);
    }
    root.appendChild(list);
  }

  const reviews = Array.isArray(block.reviews) ? block.reviews : [];
  if (reviews.length > 0) {
    const list = el(doc, 'ol', 'g-reviews');
    for (let i = 0; i < reviews.length; i += 1) {
      const review = reviews[i];
      const row = el(doc, 'li', 'g-review');
      linkOrText(doc, row, review, review.source);
      field(doc, row, 'g-rating', review.rating);
      field(doc, row, 'g-count', review.count);
      field(doc, row, 'g-summary', review.summary);
      list.appendChild(row);
    }
    root.appendChild(list);
  }

  /*
   * Google's own rendered HTML, assigned whole.
   *
   * THE SINGLE `innerHTML` IN THIS FILE, and the test asserts both halves of
   * that sentence: exactly one assignment, and its right-hand side is the
   * bare wire value with no method call on it. `escapeHtml(suggestionsHtml)`
   * would show a reader the markup instead of the suggestions;
   * `suggestionsHtml.replace(...)` or `.trim()` would be "modify" and would
   * also be the first step of the change that eventually strips the
   * attribution. There is no safe-looking version of touching this string.
   */
  if (suggestionsHtml !== '') {
    const suggestions = el(doc, 'div', 'g-suggestions');
    suggestions.innerHTML = suggestionsHtml;
    root.appendChild(suggestions);
  }

  // A block with nothing in it at all is not an answer to show.
  if (root.childNodes && root.childNodes.length === 0) return null;

  return root;
}

/**
 * Which rows have no link, as plain labels for Shin to mention OUTSIDE the
 * root.
 *
 * This is the only place the wire is read for Shin's own prose, and it reads
 * exactly two things: whether a link is absent, and the name of the row it is
 * absent from. The name is needed because "one of these has no link" over six
 * rows is not a heads-up, it is a puzzle. (`markedOffers` below is the other
 * read, and reads the same way: two flags and a name.)
 */
function missingLinks(block) {
  const out = [];
  const offers = Array.isArray(block.offers) ? block.offers : [];
  for (let i = 0; i < offers.length; i += 1) {
    if (offers[i].hasLink === false) out.push(str(offers[i].retailer));
  }
  const reviews = Array.isArray(block.reviews) ? block.reviews : [];
  for (let i = 0; i < reviews.length; i += 1) {
    if (reviews[i].hasLink === false) out.push(str(reviews[i].source));
  }
  const facts = Array.isArray(block.facts) ? block.facts : [];
  for (let i = 0; i < facts.length; i += 1) {
    if (facts[i].hasLink === false) out.push(str(facts[i].value));
  }
  return out;
}

/**
 * Which offers need a membership or come from a marketplace seller, as plain
 * names and a string key, for Shin to say OUTSIDE the root, beside the
 * no-link heads-up. Both kinds of offer still count in the middle (owner,
 * 2026-09-19: "it should just be marked"); this is the mark on the list, and
 * the price line carries the same mark on its dot. It reads one flag per
 * kind and the retailer's name, nothing else, and adds nothing to the root.
 */
function markedOffers(block) {
  const out = [];
  const offers = Array.isArray(block.offers) ? block.offers : [];
  for (let i = 0; i < offers.length; i += 1) {
    if (offers[i].memberOnly === true) out.push({ key: 'grounded_mark_members', name: str(offers[i].retailer) });
    if (offers[i].marketplace === true) out.push({ key: 'grounded_mark_marketplace', name: str(offers[i].retailer) });
  }
  return out;
}

/**
 * Everything the result screen shows for a grounded answer: Shin's heading,
 * the untouched block, Shin's heads-up, and the price line.
 *
 * THE ORDER OF THE CHILDREN IS THE COMPLIANCE STORY. Heading first, then the
 * root, then Shin's sentences, then the price line. Nothing of Shin's is ever
 * appended INTO `root`, and there is no code path here that could: `root` is
 * finished by `groundedRoot` before this function has a string of its own.
 *
 * The price line is outside the root for the same reason, and for a second
 * one: it carries Shin's zone words, which are the user's own settings put
 * into English or French. Those are our words about the user's line, not
 * Google's words about a price.
 *
 * @param {object} grounded  the `grounded` member of a priced payload
 * @param {object} [opts]
 * @param {object} [opts.doc]  document to build in
 * @param {object} [opts.shelfLabel]  the scanned item's own quantity-and-price
 *   label, e.g. "6 x 355 mL, $4.49". Shin's own item, from Shin's own data,
 *   so Shin formats it; it is passed IN rather than built here.
 */
export function groundedSection(grounded, opts = {}) {
  const root = groundedRoot(grounded, opts);
  if (!root) return null;

  const doc = docOf(opts);
  /*
   * A section of its own, never a continuation of Shin's own price list.
   * Two sections, never one list: a reader has to be able to see which
   * numbers came from Shin's sources and which came from a Google search,
   * and a single merged list makes that unanswerable. It is also term 1
   * again, from the other side: merging our rows into Google's list is
   * interspersing our content with a Grounded Result.
   */
  const section = el(doc, 'section', 'grounded-section');
  section.setAttribute('aria-label', t('grounded_heading'));

  const heading = el(doc, 'h3', 'grounded-heading');
  heading.textContent = t('grounded_heading');
  section.appendChild(heading);

  /*
   * NOT CHECKED, said once, above the block. Jamin, 2026-09-15: an answer
   * that is not checked is better than none, so it shows, labelled. The
   * server marks every search block `checked: false`.
   */
  if (grounded.block.checked === false) {
    const note = el(doc, 'p', 'grounded-unchecked');
    note.textContent = t('grounded_unchecked');
    section.appendChild(note);
  }

  section.appendChild(root);

  const absent = missingLinks(grounded.block);
  if (absent.length > 0) {
    const list = el(doc, 'ul', 'grounded-nolink');
    for (let i = 0; i < absent.length; i += 1) {
      const li = el(doc, 'li', null);
      li.textContent = t('grounded_no_link', { name: absent[i] });
      list.appendChild(li);
    }
    section.appendChild(list);
  }

  const marked = markedOffers(grounded.block);
  if (marked.length > 0) {
    const list = el(doc, 'ul', 'grounded-marks');
    for (let i = 0; i < marked.length; i += 1) {
      const li = el(doc, 'li', null);
      li.textContent = t(marked[i].key, { name: marked[i].name });
      list.appendChild(li);
    }
    section.appendChild(list);
  }

  /*
   * The price line, drawn from the wire's own verdict.
   *
   * EVERY POSITION IS READ, NEVER COMPUTED. Working out where a grounded
   * price sits on a scale is this app analysing a Grounded Result, which is
   * what term 1 forbids; the server did that arithmetic and sent the answers,
   * and the client's whole job here is to draw them. So the values below are
   * lifted across one for one and handed to `price-line.js`, which has no
   * knowledge of the grounded wire and cannot reach back into it.
   */
  const verdict = grounded.block.verdict;
  /*
   * NO LINE IS AN ANSWER TOO, D-113.
   *
   * Until 2026-09-16 a null verdict rendered nothing at all, so a shopper who
   * had just waited for a search saw offers and no explanation of why the
   * line they had seen on a previous scan was missing. Worse, the case that
   * produced the null most often was a SINGLE offer, which before that date
   * did not produce a null at all: it drew a full line off a median of one
   * price, and told the shopper an ordinary $1.74 was 83% under the going
   * rate because one Walmart row said $9.97.
   *
   * The sentence is about the evidence, never about Shin's ignorance. The
   * offers, the reviews and the description are all already on screen above
   * it, which is what "always an answer" is protecting.
   *
   * A single offer is no longer one of the reasons (owner, 2026-09-19: "the
   * one price becomes the median"): it draws a line, and the thin note below
   * says it is one price.
   */
  if (!verdict) {
    const reason = grounded.block.noLineReason;
    const key =
      reason === 'no_shelf_size' ? 'grounded_no_line_size'
      : reason === 'no_offers_on_line' ? 'grounded_no_line_none'
      : null;
    if (key !== null) {
      const note = el(doc, 'p', 'grounded-no-line');
      note.textContent = t(key);
      section.appendChild(note);
    }
  }
  if (verdict) {
    /*
     * The gauge's own names. This call passed `goodBoundary` and
     * `badBoundary` until 2026-09-15, which `price-line.js` stopped reading
     * on 2026-09-14, so every grounded line drew one undivided zone.
     */
    const line = priceLine({
      median: verdict.median,
      unitLabel: verdict.unitLabel,
      span: verdict.span,
      ticks: verdict.ticks,
      zoneUnderBoundary: verdict.zoneUnderBoundary,
      zoneOverBoundary: verdict.zoneOverBoundary,
      shelf: verdict.shelf,
      points: verdict.points,
      excluded: verdict.excluded,
      shelfLabel: opts.shelfLabel ?? verdict.shelfLabel ?? null,
    }, { doc });
    if (line) section.appendChild(line);
    if (line && verdict.sizeAssumed === true) {
      const note = el(doc, 'p', 'grounded-size-assumed');
      note.textContent = t('grounded_size_assumed');
      section.appendChild(note);
    }
    /*
     * A line drawn on two prices, or on a set one claim was held out of, is
     * still a line -- but it is not the same line as one drawn on eight, and
     * saying so is the difference between an answer and a claim. The codes
     * are read off the server's own shortfall list; the sentence is this
     * client's, so it can be said in French.
     */
    if (line && (verdict.confidence === 'thin' || verdict.n === 1)) {
      const codes = Array.isArray(verdict.shortfalls) ? verdict.shortfalls.map((x) => x && x.code) : [];
      const note = el(doc, 'p', 'grounded-line-thin');
      // One price says it is ONE seller's price. Read off the count as well as
      // the code, because the one-call scan path carries no shortfall list.
      note.textContent = codes.indexOf('one_offer') !== -1 || verdict.n === 1
        ? t('grounded_line_one')
        : codes.indexOf('claim_held') !== -1
          ? t('grounded_line_held')
          : t('grounded_line_thin', { n: String(verdict.n) });
      section.appendChild(note);
    }
  }

  return section;
}

/**
 * Put the section into a container the screen already rendered.
 *
 * The screens in this app build HTML strings and assign them once; this block
 * cannot be built that way, because building it as a string would mean
 * escaping (modify) or concatenating (an `innerHTML` with the wire inside a
 * template, which is both a second `innerHTML` and an injection). So the
 * screen leaves an empty, marked container in its template and calls this
 * after the assignment. Returns the section, or null when there was nothing
 * to show, so a caller can hide its own surroundings.
 */
export function mountGrounded(container, grounded, opts = {}) {
  if (!container) return null;
  const section = groundedSection(grounded, { ...opts, doc: opts.doc ?? container.ownerDocument ?? globalThis.document });
  if (!section) return null;
  container.appendChild(section);
  return section;
}

/**
 * What the Gemini answer sheet's headline needs from the wire, lifted out as
 * plain values so `camera.js` never reads inside `grounded`.
 *
 * THIS IS A READ, NEVER A COMPUTATION (beta gaps, rule 6: the price does not
 * come from Shin, and Shin shows no price math it made itself). The zone is the
 * code Gemini put on the shelf price against the user's own lines, the median
 * and its unit are the ones Gemini stated, and the shelf label is Gemini's own
 * "quantity and price as sold". Nothing here adds, divides, compares or rounds;
 * a number is turned into text with `String` and no more.
 *
 * `hasContent` mirrors the one condition `groundedRoot` uses to decline to
 * render (no facts, description, offers, reviews or suggestions), so the sheet
 * can choose its plain "no answer" state without building DOM to find out.
 */
const ZONES = ['under_your_line', 'middle', 'over_your_line'];

/**
 * The wire's `fetchedAt`, kept only if a clock can read it.
 *
 * Three ways it is not a time: absent, not a string, or a string
 * `Date.parse` cannot make a number of. All three return null, and the caller
 * renders nothing rather than a label with a hole in it.
 */
function checkedAt(value) {
  if (typeof value !== 'string' || value === '') return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function geminiReading(grounded) {
  const empty = {
    hasContent: false, zone: null, median: null, unitLabel: null,
    shelfLabel: null, name: null, fetchedAt: null, lowConfidence: false, confidenceReasons: [], alternatives: [],
  };
  if (!grounded || grounded.kind !== 'grounded' || !grounded.block) return empty;
  const block = grounded.block;
  const has = (list) => Array.isArray(list) && list.length > 0;
  const hasContent = has(block.facts)
    || (typeof block.description === 'string' && block.description !== '')
    || has(block.offers)
    || has(block.reviews)
    || (typeof grounded.suggestionsHtml === 'string' && grounded.suggestionsHtml !== '');
  const verdict = block.verdict ?? null;
  const zone = verdict && verdict.shelf && ZONES.indexOf(verdict.shelf.zone) !== -1 ? verdict.shelf.zone : null;
  const median = verdict && typeof verdict.median === 'number' ? String(verdict.median) : null;
  const unitLabel = verdict && typeof verdict.unitLabel === 'string' && verdict.unitLabel !== '' ? verdict.unitLabel : null;
  const shelfLabel = verdict && typeof verdict.shelfLabel === 'string' && verdict.shelfLabel !== '' ? verdict.shelfLabel : null;
  return {
    hasContent,
    zone,
    median,
    unitLabel,
    shelfLabel,
    name: typeof block.name === 'string' && block.name !== '' ? block.name : null,
    /*
     * WHEN SHIN ASKED, and the one field here that is not Gemini's. Ruling 1
     * (docs/decisions.md) lets a repeat scan of a known barcode be served from
     * a stored answer on one condition: the price "is cached for six hours and
     * ALWAYS SHOWN WITH WHEN IT WAS CHECKED". The wire has carried the time
     * since the wire existed and only `data-fetched-at` ever read it, which is
     * an attribute and not a sentence, so nothing on screen said it.
     *
     * A time Shin cannot read is no time at all: an unparseable or missing
     * value comes back null and the sheet says nothing, because "checked
     * unknown" is worse than silence. Nothing is computed from it here; the
     * age is worked out where the sentence is built.
     */
    fetchedAt: checkedAt(grounded.fetchedAt),
    lowConfidence: block.lowConfidence === true,
    confidenceReasons: Array.isArray(block.confidenceReasons) ? block.confidenceReasons : [],
    alternatives: alternativesReading(block.alternatives),
  };
}

/**
 * Gemini's alternatives (item 18), lifted out as plain rows for the sheet. A
 * READ, never a computation: the price is the text Gemini returned for it and
 * nothing here parses, compares or converts it. A row with no name or no price
 * text is skipped rather than drawn half empty, and anything that is not a list
 * is no alternatives at all: there is no section then, and nothing is said about
 * it. At most five, in the order the answer gave them.
 */
function alternativesReading(list) {
  if (!Array.isArray(list)) return [];
  const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const rows = [];
  for (let i = 0; i < list.length && rows.length < 5; i += 1) {
    const a = list[i];
    if (!a || typeof a !== 'object') continue;
    const name = text(a.name);
    const price = text(a.priceText);
    if (name === null || price === null) continue;
    rows.push({
      name,
      brand: text(a.brand),
      kind: text(a.kind) ?? 'other',
      reason: text(a.reason),
      store: text(a.storeName),
      /* The row's link as the wire carried it (2026-09-21: every price on
         the answer shows its store and its link). Read, never built: only an
         http(s) value, and never one the wire itself marked as having none. */
      url: a.hasLink !== false && typeof a.url === 'string' && /^https?:\/\//i.test(a.url.trim()) ? a.url.trim() : null,
      price,
    });
  }
  return rows;
}
