/**
 * Every user-facing string Shin says, keyed by state and personality.
 *
 * The user picks Shin's attitude at setup and can change it any time. That is a
 * recorded decision (docs/decisions.md, 2026-09-03) and it is the reason this
 * file exists: the cost of the choice is that every string is written three
 * times, and the way to stop that cost leaking into the screens is to put all
 * three here and let a screen ask for one.
 *
 * NO STRING SHIN SAYS IS WRITTEN INSIDE A SCREEN. If a screen needs a new line,
 * it gets a new key here with all three variants, or it does not ship.
 *
 * The promise under the picker is that the attitude changes the words and never
 * the number. Nothing in this file may take a price, a count, a seller or a date
 * and alter it. Those arrive already formatted and are only ever interpolated.
 */

import * as store from './store.js';
import { FLAGS } from './flags.js';

export const PERSONALITIES = [
  {
    id: 'deadpan',
    name: 'Deadpan',
    blurb: 'States the number and stops.',
    sample: '“Two dollars. It’s $1.47.”',
  },
  {
    id: 'warm',
    name: 'Warm',
    blurb: 'On your side about it.',
    sample: '“Ooh, that’s steep. I’d wait.”',
  },
  {
    id: 'blunt',
    name: 'Blunt',
    blurb: 'Short, and a bit rude.',
    sample: '“They’re robbing you.”',
  },
];

/**
 * Deadpan is the default at first run, because a price tool that is wrong while
 * being cute is worse than one that is wrong while being flat.
 */
export const DEFAULT_PERSONALITY = 'deadpan';

export function personality() {
  const who = store.get().personality;
  return PERSONALITIES.some((p) => p.id === who) ? who : DEFAULT_PERSONALITY;
}

export function setPersonality(id) {
  if (!PERSONALITIES.some((p) => p.id === id)) return;
  store.update({ personality: id });
}

/**
 * The table. Every entry is a function of the already-formatted facts, so no
 * line here can invent or reshape a number.
 */
const LINES = {
  /* --- the three verdicts --- */
  good: {
    deadpan: (f) => `${f.usual} usually. This is ${f.asking}.`,
    warm: (f) => `Good spot. That is under the usual ${f.usual}.`,
    blunt: () => 'Buy it. Now.',
  },
  fair: {
    deadpan: (f) => `That is the going rate, ${f.usual}.`,
    warm: () => 'That is about what it goes for. You are fine.',
    blunt: () => 'Fine. Whatever.',
  },
  walk_away: {
    deadpan: (f) => `${f.asking}. It is ${f.usual}.`,
    warm: (f) => `Ooh, that is steep. It usually goes for ${f.usual}.`,
    blunt: () => 'They are robbing you.',
  },

  /* --- the verdict word, which is the largest text on the screen --- */
  word_good: { deadpan: () => 'Take it', warm: () => 'Good price', blunt: () => 'Take it' },
  word_fair: { deadpan: () => 'About right', warm: () => 'About right', blunt: () => 'Fine' },
  word_walk_away: { deadpan: () => 'Walk away', warm: () => 'I would wait', blunt: () => 'Walk away' },

  /*
   * --- the peek primary, USAGE.md section 7 ---
   *
   * Keyed by tier, not by personality, on whether it says save or watch: Save
   * it on `good`, Watch it on `fair` and `walk_away`, because telling someone
   * to watch a price that is already good is telling them to wait for no
   * reason. Nine strings, three tiers times three personalities. There is no
   * feed in v1, so none of these may promise to notify, nudge or shout; the
   * button names the act the tap performs, nothing more.
   */
  peek_good: {
    deadpan: () => 'Save it',
    warm: () => 'Save it, easily',
    blunt: () => 'Save it. Now.',
  },
  peek_fair: {
    deadpan: () => 'Watch it',
    warm: () => 'Watch it, just in case',
    blunt: () => 'Watch it.',
  },
  peek_walk_away: {
    deadpan: () => 'Watch it',
    warm: () => 'Watch it, just in case',
    blunt: () => 'Watch it.',
  },
  /** Row 32: the label once the tap has landed. A state, not a personality line. */
  peek_watching: {
    deadpan: () => 'Watching',
    warm: () => 'Watching',
    blunt: () => 'Watching',
  },

  /* --- refusals, which are the most common outcome and get the same care --- */
  refuse_unknown: {
    deadpan: () => 'I do not know this one',
    warm: () => 'I have not learned this one yet',
    blunt: () => 'No clue',
  },
  refuse_unknown_why: {
    deadpan: () => 'I have no prices for it, so I am not going to guess.',
    warm: () => 'I have nothing to compare it against, and guessing would not help you.',
    blunt: () => 'Nothing to compare it to. Teach me.',
  },
  /*
   * Not knowing the thing and not being sure which thing it is are different
   * refusals, and saying "I have no prices for it" when the engine found plenty
   * but could not pin the identity is the app misreporting its own reason.
   */
  refuse_unsure: {
    deadpan: () => 'I am not sure which one this is',
    warm: () => 'I think I know this, but not closely enough',
    blunt: () => 'Which one is it?',
  },
  refuse_unsure_why: {
    deadpan: () => 'The wrong match would price a different product, so pick it and I will.',
    warm: () => 'Pricing the wrong version would be worse than not answering. Point me at the right one.',
    blunt: () => 'Wrong match, wrong price. Pick it.',
  },
  refuse_category: {
    deadpan: (f) => `Not ${f.category}`,
    warm: (f) => `I skip ${f.category}`,
    blunt: (f) => `${f.category}? No.`,
  },
  refuse_thin: {
    deadpan: () => 'Not enough to call it',
    warm: () => 'I would rather not say yet',
    blunt: () => 'Not enough. Ask me later.',
  },
  /** The evidence line under a refusal, when something was found but not enough. */
  refuse_evidence_some: {
    deadpan: () => 'What I did find, which was not enough to call it.',
    warm: () => 'Here is what I did find. It was just not enough to call it.',
    blunt: () => 'What I found. Not enough.',
  },
  /**
   * The evidence line under a refusal, when nothing was found at all.
   * USAGE.md section 4 row 4: "the line that must never change is the one
   * already in camera.js", so all three personalities read the same.
   */
  refuse_evidence_none: {
    deadpan: () => 'I found nothing at all for this. That is a gap in what I have been taught, not a fact about the market.',
    warm: () => 'I found nothing at all for this. That is a gap in what I have been taught, not a fact about the market.',
    blunt: () => 'I found nothing at all for this. That is a gap in what I have been taught, not a fact about the market.',
  },

  /* --- the states between shutter and answer --- */
  reading: {
    deadpan: () => 'Reading the tag',
    warm: () => 'Let me have a look',
    blunt: () => 'Hang on',
  },

  /*
   * --- what a save is worth ---
   *
   * AVATAR.md section 3 rows 32 and 33 are two different promises. `watching`
   * (row 32) is the v1 form: it says what was just saved, in facts already on
   * screen (asking price, seller, day), and nothing it cannot check again.
   * `watching_feed` (row 33) is the dark form: it promises to look again, which
   * only a re-queryable source can honour. `say()` below picks between them on
   * FLAGS.feed so a screen never has to know which one it is asking for.
   */
  watching: {
    deadpan: (f) => `Saved at ${f.asking}${f.seller ? `, ${f.seller}` : ''}, ${f.day}.`,
    warm: () => 'Saved. I have the number and the day.',
    blunt: (f) => `Saved. ${f.asking}${f.seller ? `, ${f.seller}` : ''}.`,
  },
  /** Ships only with a re-queryable source. FLAGS.feed gates it. Never call this key directly. */
  watching_feed: {
    deadpan: (f) => `Watching. I will say something under ${f.usual}.`,
    warm: () => 'Watching. I will tell you if it drops under the usual.',
    blunt: () => 'Watching. I will shout if it drops.',
  },
  /**
   * Row 45, "dark, not v1". A real drop needs a source re-queried on a
   * schedule, which does not exist, so this key is only ever read behind
   * FLAGS.feed (see watchlist.js). Never call it with FLAGS.feed off.
   */
  dropped: {
    deadpan: (f) => `${f.asking} at ${f.seller}. You watched it at ${f.usual}.`,
    warm: (f) => `It dropped. ${f.asking} at ${f.seller}, down from what you saw.`,
    blunt: (f) => `It dropped. ${f.asking}. They were pushing it before.`,
  },

  /** Row 42: the watchlist, empty. Not dark, ships in v1 as written in AVATAR.md. */
  watchlist_empty: {
    deadpan: () => 'Nothing here yet.',
    warm: () => 'Nothing here yet. Save something and I will keep an eye on it.',
    blunt: () => 'Empty. Nothing to watch yet.',
  },

  /* --- corrections --- */
  correct_ask: {
    deadpan: () => 'What does it actually say?',
    warm: () => 'What is on the tag?',
    blunt: () => 'What does it say?',
  },
  correct_thanks: {
    deadpan: () => 'Recorded. Yours beats mine.',
    warm: () => 'Thank you, that helps. Yours beats mine.',
    blunt: () => 'Got it. Yours wins.',
  },
};

/**
 * Say one line.
 *
 * @param {string} key   a key in LINES
 * @param {object} [facts]  already-formatted strings, never raw numbers
 */
export function say(key, facts = {}) {
  // watching is the only key with a dark alternate. A screen always asks for
  // watching; whether it gets the row-32 save line or the row-33 promise is
  // this one switch, never a second call site.
  const resolvedKey = key === 'watching' && FLAGS.feed ? 'watching_feed' : key;
  const row = LINES[resolvedKey];
  if (!row) return '';
  const fn = row[personality()] ?? row[DEFAULT_PERSONALITY];
  return typeof fn === 'function' ? fn(facts) : '';
}

/** The verdict word for a tier, which is the biggest text on the surface. */
export function wordFor(tierId) {
  return say(`word_${tierId}`) || 'About right';
}
