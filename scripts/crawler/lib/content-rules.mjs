/**
 * CONTENT RULES: what the words on a screen say, checked against what is on the same screen and what the
 * app was launched with. The older crawler rules ask whether a screen is blank, dead, or prints "undefined";
 * these ask whether a screen that looks fine is telling the shopper something untrue.
 *
 *   count-line   A count printed over a list (the verdict's "11 prices from 4 shops", or any heading
 *                "N items" / "N results") must equal the rows of the list it labels. D-259: "7 prices
 *                from 7 shops" above a 12-row list. A count that is a different number from the rows
 *                under it is a wrong answer however clean the layout is.
 *   flag-copy    Copy that depends on a feature flag must match the flag the app was launched with. The
 *                flags that change what the shopper READS are (flags.js):
 *                  photoId   off: no frame leaves the phone, so no screen may say a scan "sends a picture"
 *                            (D-265); on: the "never a picture" line is the false one.
 *                  languages off: English is pinned, so no screen may offer French by name.
 *                Add a flag here when a flag's off state changes a sentence, with the sentence it must
 *                never show.
 *
 * Pure: every input is an argument (the root element, the start flags, the screen label, a text reader), so
 * app/test/crawler.test.mjs can hand it a hand-built screen and watch it fail.
 */

const toInt = (s) => Number.parseInt(String(s).replace(/[,\s]/g, ''), 10);

/** The rows an element's list shows: its direct <li> rows, or every <li> when the list nests them. */
function rowsOf(list) {
  return list.querySelectorAll('li');
}

/**
 * count-line. Two shapes:
 *  1. the verdict's basis line, `[data-vd-basis]`, "N price(s) from M shop(s)", over the list `[data-vd-dots]`
 *     that sits in the same sheet: N must equal the rows, and M cannot be more than the rows or fewer than one;
 *  2. a heading or line that is only "N items" / "N results" (any case), followed by a list: N must equal its rows.
 */
export function countLineFindings(root, { text }) {
  const out = [];
  for (const line of root.querySelectorAll('[data-vd-basis]')) {
    const m = /^\s*(\d[\d,]*)\s+prices?\s+from\s+(\d[\d,]*)\s+shops?/i.exec(text(line));
    if (!m) continue;
    const sheet = line.parentNode;
    const list = sheet?.querySelector('[data-vd-dots]') ?? null;
    if (!list) continue; // no list under it: the line counts something that is not drawn, which is allowed
    const rows = rowsOf(list).length;
    const prices = toInt(m[1]);
    const shops = toInt(m[2]);
    if (prices !== rows) out.push({ rule: 'count-line', message: `the line says ${prices} prices, the list under it has ${rows} rows` });
    else if (shops < 1 || shops > rows) out.push({ rule: 'count-line', message: `the line says ${shops} shops for a list of ${rows} rows` });
  }
  for (const el of root.querySelectorAll('h1, h2, h3, h4, p, span, div')) {
    if (el.children.length > 0) continue; // a leaf: the count line is a line of its own
    const m = /^\s*(\d[\d,]*)\s+(items?|results?)\s*$/i.exec(text(el));
    if (!m) continue;
    let next = el.nextElementSibling ?? null;
    while (next && !/^(ul|ol)$/i.test(next.localName)) next = next.nextElementSibling ?? null;
    if (!next) continue;
    const rows = rowsOf(next).length;
    if (toInt(m[1]) !== rows) out.push({ rule: 'count-line', message: `the line says ${toInt(m[1])} ${m[2].toLowerCase()}, the list under it has ${rows} rows` });
  }
  return out;
}

/** Sentences a flag's state makes false. `when` is the flag value that makes `say` the lie. */
export const FLAG_COPY = [
  { flag: 'photoId', when: false, say: /\bscan sends a picture\b/i, why: 'photo scanning is off, so no picture is sent, but the screen says a scan sends one (D-265)' },
  { flag: 'photoId', when: true, say: /\bnever a picture\b|\bno picture\.?\s*$/i, only: /^camera/, why: 'photo scanning is on, but the camera screen says no picture is ever sent' },
  { flag: 'languages', when: false, say: /\bfran[cç]ais\b/i, why: 'languages is off and English is pinned, but a screen offers French' },
];

/** flag-copy. `flags` is the start state's flags; `screen` is the screen label ("camera/idle"). */
export function flagCopyFindings(root, { flags, screen, text }) {
  const out = [];
  if (!flags) return out;
  const said = text(root);
  for (const r of FLAG_COPY) {
    if (flags[r.flag] !== r.when) continue;
    if (r.only && !r.only.test(screen ?? '')) continue;
    const hit = r.say.exec(said);
    if (hit) out.push({ rule: 'flag-copy', message: `"${hit[0]}" on screen with ${r.flag} ${r.when ? 'on' : 'off'}: ${r.why}` });
  }
  return out;
}

/** Every content finding for the screen as it stands. */
export function contentFindings(root, { flags, screen, text }) {
  return [...countLineFindings(root, { text }), ...flagCopyFindings(root, { flags, screen, text })];
}
