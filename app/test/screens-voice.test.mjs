/**
 * The rule voice.js has opened with since the file existed, finally enforced.
 *
 * "NO STRING SHIN SAYS IS WRITTEN INSIDE A SCREEN. If a screen needs a new
 * line, it gets a new key here with all three variants, or it does not ship."
 * Nothing ever checked it. `test/voice.test.mjs` checks the table against
 * itself, thoroughly, and has never opened a screen file, so the rule held
 * exactly as long as whoever was writing a screen remembered it. Roughly
 * thirty-seven shopper-facing strings were live across eight of the ten
 * screens when this file was written, and licences.js carried a written
 * exemption from the rule that it had granted itself.
 *
 * WHERE THE LINE IS, and this file is the thing that makes it a line rather
 * than an opinion:
 *
 *   In voice.js: anything in the first person, anything that judges, advises,
 *   apologises, or narrates what Shin is doing.
 *
 *   In the screen: structural labels, headings, button text, kickers, and
 *   factual captions that do not speak as Shin.
 *
 * TWO RULES, DELIBERATELY DIFFERENT IN KIND.
 *
 * Rule 1 is hard and has no allowlist. A first-person pronoun inside a string
 * literal in a screen is Shin talking, with no case where it is not, so there
 * is nothing to argue about and no place to record an argument.
 *
 * Rule 2 is soft and allowlisted, and the allowlist is the artefact. A
 * four-word sentence in a screen is usually Shin and sometimes chrome, and the
 * only way to tell is for a person to say which. Every entry carries a reason
 * beside it, so the boundary above is written down against real strings rather
 * than described in the abstract, and the next inline sentence fails until
 * somebody either moves it into voice.js or justifies it here as chrome.
 *
 * DEFECTS.md standard 3, and D-040 under it: a test covers the model it was
 * given, and the screen is not obliged to be that model. Both rules here were
 * negative-tested by putting a violation back and watching them go red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SCREENS = fileURLToPath(new URL('../public/js/screens', import.meta.url));
const FILES = readdirSync(SCREENS).filter((f) => f.endsWith('.js')).sort();

/* ------------------------------------------------------------------ *
 * Reading the string literals out of a screen.
 * ------------------------------------------------------------------ */

/**
 * Every string literal in a source file, with the line it opens on.
 *
 * Not a JS parser, and it has to survive three things a regex would not:
 * comments full of prose about the very strings being looked for, template
 * literals holding this app's entire markup, and regex literals with quotes
 * inside them (`camera.js` has `.replace(/"/g, ...)`, which a naive scanner
 * reads as the start of a string and then loses the rest of the file).
 *
 * So it is a small state machine over code, line comment, block comment,
 * regex, the two quote forms, and template literals whose `${}` pushes back
 * into code. An interpolation becomes a NUL in the extracted text, which the
 * segmenter below uses as a boundary: nothing else in these files contains
 * one, and it cannot be confused with content.
 *
 * A `/` is a regex only where an operand cannot already have ended, which is
 * the same test an actual tokeniser makes, plus the keywords after which a
 * slash still opens one.
 */
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await', 'instanceof',
]);

export function literals(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  const stack = [{ kind: 'code', depth: 0 }];
  /* 'o' means an operand just ended, so a `/` here is division, not a regex. */
  let prevSig = '';
  let prevWord = '';

  while (i < n) {
    const top = stack[stack.length - 1];
    const c = src[i];

    if (top.kind === 'tpl') {
      if (c === '\\') { top.text += src[i + 1] ?? ''; i += 2; continue; }
      if (c === '`') {
        stack.pop();
        out.push({ line: top.line, text: top.text });
        i++; prevSig = 'o'; prevWord = '';
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        top.text += '\u0000';
        stack.push({ kind: 'code', depth: 0 });
        i += 2;
        continue;
      }
      if (c === '\n') line++;
      top.text += c; i++;
      continue;
    }

    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }
    if (c === '/' && (prevSig !== 'o' || REGEX_KEYWORDS.has(prevWord))) {
      i++;
      let inClass = false;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { i++; break; }
        else if (d === '\n') line++;
        i++;
      }
      while (i < n && /[a-z]/.test(src[i])) i++;
      prevSig = 'o'; prevWord = '';
      continue;
    }

    if (c === "'" || c === '"') {
      const q = c;
      const startLine = line;
      i++;
      let text = '';
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { text += src[i + 1] === 'n' ? '\n' : (src[i + 1] ?? ''); i += 2; continue; }
        if (src[i] === '\n') line++;
        text += src[i]; i++;
      }
      i++;
      out.push({ line: startLine, text });
      prevSig = 'o'; prevWord = '';
      continue;
    }

    if (c === '`') { stack.push({ kind: 'tpl', text: '', line }); i++; continue; }

    if (/[A-Za-z_$]/.test(c)) {
      let w = '';
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) { w += src[i]; i++; }
      prevSig = 'o'; prevWord = w;
      continue;
    }
    if (/[0-9]/.test(c)) {
      while (i < n && /[0-9.eExXa-fA-F_]/.test(src[i])) i++;
      prevSig = 'o'; prevWord = '';
      continue;
    }

    if (c === '{') { top.depth++; prevSig = '{'; prevWord = ''; i++; continue; }
    if (c === '}') {
      if (top.depth === 0 && stack.length > 1) { stack.pop(); i++; continue; }
      top.depth--; prevSig = 'o'; prevWord = ''; i++;
      continue;
    }
    if (c === ')' || c === ']') { prevSig = 'o'; prevWord = ''; i++; continue; }
    prevSig = c; prevWord = ''; i++;
  }
  return out;
}

/**
 * The readable runs inside one literal.
 *
 * A screen's whole `root.innerHTML` is a single template literal holding the
 * entire page, so the literal is the wrong unit to judge: taken whole, every
 * screen is one enormous string with forty periods in it. What a person reads
 * is the text between the markup, so tags are boundaries, interpolations are
 * boundaries, and HTML comments are dropped outright, being notes to the next
 * reader of the file rather than anything the screen shows.
 */
export function segments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split(/<[^>]*>|\u0000/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function allSegments() {
  const out = [];
  for (const file of FILES) {
    const src = readFileSync(join(SCREENS, file), 'utf8').replace(/\r\n/g, '\n');
    for (const lit of literals(src)) {
      for (const text of segments(lit.text)) out.push({ file, line: lit.line, text });
      /*
       * THE BLIND SPOT THIS CLOSES. `segments` splits a literal at every
       * interpolation, so `Nothing matches "${text}".` became two runs, neither
       * ending in a period, and `isSentence` never saw it. Any inline Shin line
       * with a `${}` before its final period was invisible to this file --
       * verified by running `segments` over camera.js: the run was `Nothing in
       * what Shin has been taught matches "`, no full stop, no first person,
       * both rules missed it. So each literal is ALSO judged whole, every
       * interpolation stood in for by a word, and a sentence found that way is
       * reported against the same line. Duplicates with the split pass are
       * harmless: the allowlist is keyed on text, and a run that was already a
       * sentence is the same sentence whole.
       */
      for (const text of segments(lit.text.replace(/ /g, ' \u0002 '))) {
        // A scaffold like `${a}. ${b} ${c}` is all stand-ins and no words; it
        // is punctuation around values, not a sentence somebody wrote. Three
        // real words is the floor, so "Shin says: ${line}." (a label) drops
        // out and "Nothing in what Shin has been taught matches \"${text}\"."
        // stays in. The marker is shown as a word in the report.
        const real = text.replace(/\u0002/g, ' ').split(/\s+/).filter((w) => /[a-z]/i.test(w));
        if (real.length < 3) continue;
        out.push({ file, line: lit.line, text: text.replace(/\u0002/g, '{value}') });
      }
    }
  }
  return out;
}

const SEGMENTS = allSegments();

test('the scanner actually reads the screens', () => {
  // A scanner that silently stopped matching would make both rules below pass
  // for the wrong reason, which is the shape of the defect D-021's old test
  // had: green because it was measuring nothing.
  assert.ok(FILES.length >= 10, `only ${FILES.length} screen files found`);
  assert.ok(SEGMENTS.length > 200, `only ${SEGMENTS.length} text runs found; the scanner has probably stopped matching`);
  assert.ok(
    SEGMENTS.some((s) => s.file === 'setup.js' && s.text === 'Which Shin do you want?'),
    'the scanner cannot see a string it is standing on',
  );
});

/* ------------------------------------------------------------------ *
 * Rule 1: hard. No first person inside a screen.
 * ------------------------------------------------------------------ */

/**
 * `\bI\s` and `\bI'` catch the pronoun and its contractions; `my own` catches
 * the one possessive this app actually used ("my own engine", "my own
 * sources"). All three need the capital or the space, so none of them can fire
 * on an identifier, a CSS class or a data attribute, which is why this rule can
 * afford to have no allowlist at all.
 */
const FIRST_PERSON = /\bI\s|\bI['’]|\bmy own\b/;

/**
 * The one thing standing between Rule 1 and having no exceptions, and it is
 * deliberately shaped to delete itself.
 *
 * `camera.js` had two first-person strings when this file was written, named
 * here rather than quietly excluded by a filename filter, with a test that
 * asserted they were STILL PRESENT so the exception could not outlive the
 * violation it covered.
 *
 * **It worked.** Both were migrated the same day, that test went red exactly
 * as designed, and the list is empty. It is kept, empty, because the mechanism
 * is the useful part: the next time a lane cannot reach a file, the string
 * goes here with a reason and a deadline that enforces itself, instead of
 * becoming a permanent exception nobody revisits.
 */
const QUARANTINE = [];

test('no screen writes a first-person line inside a string', () => {
  const quarantined = new Set(QUARANTINE.map((q) => `${q.file}\u0001${q.text}`));
  const found = SEGMENTS
    .filter((s) => FIRST_PERSON.test(s.text))
    .filter((s) => !quarantined.has(`${s.file}\u0001${s.text}`))
    .map((s) => `${s.file}:${s.line}  ${JSON.stringify(s.text)}`);

  assert.deepEqual(found, [], [
    'A line Shin says is written inside a screen. It gets a key in voice.js with',
    'all three personalities, or it does not ship. There is no allowlist for this rule.',
    '',
    ...found,
  ].join('\n'));
});

test('the quarantine is still describing something real, and is empty', () => {
  const missing = QUARANTINE.filter(
    (q) => !SEGMENTS.some((s) => s.file === q.file && s.text === q.text),
  ).map((q) => `${q.file}: ${JSON.stringify(q.text)}`);

  assert.deepEqual(missing, [], [
    'A quarantined string is gone from the screen, which is good news and makes this',
    'entry a lie. Delete it from QUARANTINE in this file; Rule 1 then covers that',
    'file with no exceptions, which is the state this list exists to reach.',
    '',
    ...missing,
  ].join('\n'));
});

/* ------------------------------------------------------------------ *
 * Rule 2: soft. A sentence in a screen is chrome only if somebody said so.
 * ------------------------------------------------------------------ */

/**
 * The chrome, named, with why each one is not Shin talking.
 *
 * Matched on the file and the exact text run, never on a line number, because
 * line numbers move every time a comment is written above them and an
 * allowlist that goes stale silently is worse than no allowlist.
 *
 * Some entries below do not currently trip Rule 2 at all: a kicker or a
 * heading with no full stop in it is invisible to the rule as written. They
 * are here anyway, because this array is meant to be the written-down boundary
 * for the whole screen layer rather than a list of test suppressions, and the
 * cases that were argued about are worth recording whether or not the regex
 * happens to reach them. Nothing asserts an entry is used, for that reason.
 */
const ALLOWED = [
  { file: 'watchlist.js', text: '{value} , under the usual {value} .', why: 'Two prices and a relation word: a factual caption on a saved row, not Shin speaking. Surfaced by the whole-literal pass; the values are the sentence.' },
  { file: 'you.js', text: 'Build {value} · hand-set in main.js, not read from a running server.', why: 'A build stamp on the profile screen. Chrome, addressed to whoever is debugging, and it says where the number comes from.' },
  /* --- setup.js --- */
  {
    file: 'setup.js',
    text: 'One question, then the camera',
    why: 'Kicker. A structural promise about the screen\'s length, not Shin addressing anyone.',
  },
  {
    file: 'setup.js',
    text: 'Which Shin do you want?',
    why: 'The page heading, and it names Shin in the third person: the question the screen asks, not a thing Shin says about itself.',
  },
  {
    file: 'setup.js',
    text: 'Changeable any time. The attitude changes the words and never the number.',
    why: 'The promise printed under the picker, quoted as such in voice.js and in test/voice.test.mjs. It is a statement about the product, and a version of it that changed with the attitude would be self-refuting.',
  },

  /* --- share.js --- */
  {
    file: 'share.js',
    text: 'No link in the frame, on purpose',
    why: 'Kicker. A factual caption about what is on the card.',
  },
  {
    file: 'share.js',
    text: 'A link would make a preview that reads as spam.',
    why: 'The reason for the kicker above it. Explains a design decision to the person posting, in the app\'s voice rather than Shin\'s.',
  },
  {
    file: 'share.js',
    text: 'The clipboard is blocked here, so the text is above.',
    why: 'Status text reporting a browser outcome and naming the way round it. Borderline: it narrates, and if it ever apologises or judges it belongs in voice.js.',
  },
  {
    file: 'share.js',
    text: 'Saved to your downloads.',
    why: 'Status text. States where the file went and nothing else.',
  },
  {
    file: 'share.js',
    text: 'The image would not export here. The text version is above.',
    why: 'Status text, same reasoning as the clipboard line, and the same borderline note.',
  },

  /* --- market.js --- */
  {
    file: 'market.js',
    text: 'Recorded, not yet part of the comparison',
    why: 'Kicker. States what the pick does today, which is the honesty market_ask carries in Shin\'s own voice one line below it.',
  },
  {
    file: 'market.js',
    text: 'Does not change a verdict yet. Recorded for when it does.',
    why: 'Caption under the list. A fact about the engine, deliberately written with no subject so it is not a promise from Shin.',
  },
  {
    file: 'market.js',
    text: 'Prices and product details come from open data. See the sources and licences.',
    why: 'Button text. It is a control, and the second sentence is what the tap does.',
  },

  /* --- you.js --- */
  {
    file: 'you.js',
    text: 'A short buzz when a verdict or a refusal lands, on by default.',
    why: 'Caption under a settings row, describing what the toggle does.',
  },
  {
    file: 'you.js',
    text: 'Price verdicts are judged against typical prices in this market.',
    why: 'Caption under a settings row, describing what the value means.',
  },
  {
    file: 'you.js',
    text: 'Everything stays on this device. Nothing is sent anywhere but the local server that answers a scan.',
    why: 'The data paragraph. A statement of policy, which has to read identically whichever attitude is picked. D-031 is open against its accuracy; that is a truth problem, not a voice one.',
  },
  {
    file: 'you.js',
    text: 'No daily limit right now. Nothing is metered in this build; if that changes, the allowance will be one number, written once, shown wherever it applies.',
    why: 'The metering paragraph. Same reasoning: policy, not voice.',
  },
  {
    file: 'you.js',
    text: 'There is no privacy policy page and no terms page. When there is something legal worth reading, it will be here; until then the two paragraphs above are the whole of it.',
    why: 'The legal paragraph, same reasoning again. Its last clause used to read "the whole of what I do", which was first person and failed Rule 1; it now names the paragraphs instead of the speaker.',
  },
  {
    file: 'you.js',
    text: '· hand-set in main.js, not read from a running server.',
    why: 'Build footer. A caveat about a developer-facing number, and it says out loud that the number is hand-set.',
  },

  /* --- removed.js --- */
  {
    file: 'removed.js',
    text: 'Removed',
    why: 'The count label on a row, completed by the two dates interpolated after it. Structural, and it carries no sentence.',
  },

  /* --- licences.js --- */
  {
    file: 'licences.js',
    text: 'This app is built on open data from Open Food Facts, Open Prices, OpenStreetMap and Open Icecat. The full list, with each licence, is what failed to load.',
    why: 'The fallback credit under the failure line. It names sources, which is the legal statement this screen exists to make, and the statement may not vary with an attitude.',
  },
  {
    file: 'licences.js',
    text: 'Product details, prices and store names in this app are open data, collected and published by other people. Each source below sets its own terms for reuse, and this is the credit those terms ask for.',
    why: 'The attribution intro. Same reasoning: a licence statement, fixed wording on purpose.',
  },
  {
    file: 'licences.js',
    text: 'Shin is not affiliated with any of them. Prices are what somebody recorded on the day shown beside them, not an offer, and not checked with the shop.',
    why: 'The attribution footer, and a disclaimer. It names Shin in the third person, which is what a disclaimer about Shin has to do.',
  },

  /* --- camera.js, another lane's file this pass --- */
  {
    file: 'camera.js',
    text: 'This asking price is a stated stand-in, not a tag anyone read.',
    why: 'A label on a stand-in number, required in visible text by the 2026-09-04 build pass. Not this pass\'s file to move.',
  },
  {
    file: 'camera.js',
    text: 'Could not load the list just now.',
    why: 'Narration, and it should be a voice.js key. Not this pass\'s file to move; recorded here so it is countable rather than invisible.',
  },
  {
    file: 'camera.js',
    text: 'Stand-ins until the camera can read the item',
    why: 'Caption on the stand-in list. Same lane note. Reworded and set in the UI face 2026-09-11; it carries no full stop now, because a caption is not a sentence.',
  },
  {
    file: 'camera.js',
    text: 'I could not reach my own sources just now.',
    why: 'Also quarantined under Rule 1 above. Same lane note.',
  },
];

/** Four or more words with a full stop that ends a sentence rather than an abbreviation. */
function isSentence(text) {
  if (!/\.(\s|$)/.test(text)) return false;
  return text.split(/\s+/).filter(Boolean).length >= 4;
}

test('every sentence written inside a screen is either Shin\'s or explained', () => {
  const allowed = new Set(ALLOWED.map((a) => `${a.file}\u0001${a.text}`));
  const found = SEGMENTS
    .filter((s) => isSentence(s.text))
    .filter((s) => !allowed.has(`${s.file}\u0001${s.text}`))
    .map((s) => `${s.file}:${s.line}  ${JSON.stringify(s.text)}`);

  assert.deepEqual(found, [], [
    'A sentence is written inside a screen and nothing says why it is not Shin talking.',
    '',
    'Two ways out, and picking one is the point of this rule:',
    '  1. It is Shin. Give it a key in voice.js with all three personalities.',
    '  2. It is chrome. Add it to ALLOWED in this file WITH A REASON, using the',
    '     boundary at the top: structural labels, headings, button text, kickers',
    '     and factual captions that do not speak as Shin.',
    '',
    ...found,
  ].join('\n'));
});

test('every allowlist entry carries a reason somebody wrote', () => {
  const thin = ALLOWED
    .filter((a) => !a.why || a.why.trim().split(/\s+/).length < 5)
    .map((a) => `${a.file}: ${JSON.stringify(a.text)}`);
  assert.deepEqual(thin, [], [
    'An allowlist entry with no real reason is a suppression wearing the costume of a',
    'decision. Say why the string is chrome and not Shin.',
    '',
    ...thin,
  ].join('\n'));
});

/* ------------------------------------------------------------------ *
 * The keys this pass moved, asserted by name.
 * ------------------------------------------------------------------ */

/**
 * The same guard `test/voice.test.mjs` puts on the four keys the UI pass added.
 * The two rules above stop a string being written in a screen; this stops the
 * migrated keys being deleted from voice.js and the screens quietly falling
 * back to `say()`'s empty string, which is silent on the screen.
 */
test('the lines this pass migrated are keys in voice.js', async () => {
  const { say } = await import('../public/js/voice.js');
  const keys = [
    'you_coverage_loading', 'you_coverage_refused', 'you_coverage_failed',
    'you_weekly_proud',
    'watchlist_loading', 'watchlist_failed',
    'pastscans_loading', 'pastscans_failed',
    'removed_loading', 'removed_failed',
    'licences_loading', 'licences_failed',
    'read_only_note',
  ];
  for (const key of keys) {
    for (const who of ['deadpan', 'warm', 'blunt']) {
      const out = say(key, { scanned: '4', callable: '2', refused: '3' }, who);
      assert.ok(out && out.trim(), `${key}/${who} says nothing`);
    }
  }
});

/**
 * The eight refusal reasons the engine can return, each with its own line in
 * each voice, reached the way a screen reaches them. `refusalLabel` falls back
 * to the plain word, so asserting it returns something would pass on an empty
 * table; the assertion is that it returns something OTHER than the fallback.
 */
test('all eleven refusal reasons have a line of their own, in all three voices', async () => {
  const { say, refusalLabel } = await import('../public/js/voice.js');
  const REASONS = [
    'no_identity', 'identity_unsure', 'category_unsupported', 'no_source_response',
    'too_few_points', 'points_too_stale', 'comparison_incoherent', 'no_asking_price',
    // The three the engine gained when D-012's four filter conditions were
    // split apart. Every reason the engine can return is listed here, so a
    // reason without a line fails this file rather than reaching a screen as
    // the bare word.
    'unusable_price_kinds', 'points_future_dated', 'all_points_from_asking_seller',
  ];
  for (const who of ['deadpan', 'warm', 'blunt']) {
    const seen = new Set();
    for (const reason of REASONS) {
      const label = say(`refusal_label_${reason}`, {}, who);
      assert.ok(label && label.trim(),
        `${reason}/${who} has no line, so refusalLabel would fall back to the plain word`);
      assert.ok(!seen.has(label), `${reason}/${who} says the same thing as another reason: ${label}`);
      seen.add(label);
    }
  }
  // The helper itself, and the fallback that keeps a heading on the card when
  // the engine returns a reason code voice.js has never heard of.
  assert.ok(refusalLabel('no_identity').trim(), 'refusalLabel is not reaching the table');
  assert.equal(refusalLabel('a_reason_the_engine_does_not_have'), 'Refused',
    'an unknown reason must still put a heading on the card');
});

/** No em dashes anywhere, this repo's rule, comments included. */
test('nothing in the screen layer or in voice.js uses an em dash', () => {
  const files = [
    ...FILES.map((f) => ['screens/' + f, join(SCREENS, f)]),
    ['voice.js', fileURLToPath(new URL('../public/js/voice.js', import.meta.url))],
  ];
  const offenders = [];
  for (const [name, path] of files) {
    const src = readFileSync(path, 'utf8');
    if (src.includes('—')) offenders.push(name);
  }
  assert.deepEqual(offenders, [], `em dashes in: ${offenders.join(', ')}`);
});
