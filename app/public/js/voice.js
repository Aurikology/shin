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

  /* --- the intense forms, AVATAR.md section 3 rows 21 and 24. Gated in
   * camera.js on threshold, confidence, and (angry only) a visible seller;
   * the word and tier colour stay the plain tier's, only the face and this
   * line change. Aggression lands on the store or the price, never the
   * user reading the screen. --- */
  verdict_steal: {
    deadpan: () => 'Nobody else is near that.',
    warm: () => 'Oh, that is a proper find. Nobody else is close.',
    blunt: () => 'Somebody in that store made a mistake. Enjoy it.',
  },
  verdict_ripoff: {
    deadpan: () => 'Nobody else charges that.',
    warm: () => 'No. That is not a price, that is a hope.',
    blunt: () => 'That is a robbery with a barcode on it.',
  },

  /* --- the verdict word, which is the largest text on the screen --- */
  word_good: { deadpan: () => 'Take it', warm: () => 'Good price', blunt: () => 'Take it' },
  word_fair: { deadpan: () => 'About right', warm: () => 'About right', blunt: () => 'Fine' },
  word_walk_away: { deadpan: () => 'Walk away', warm: () => 'I would wait', blunt: () => 'Walk away' },

  /*
   * --- the peek primary, USAGE.md section 7 ---
   *
   * All three tiers say save, never watch. This used to split on tier ("Save
   * it" on `good`, "Watch it" on `fair`/`walk_away`) on the theory that
   * fair/walk-away items are kept for reference rather than acted on now, but
   * "Watch it" promises the same live price tracking "Watching" (the old page
   * name) promised, and the founder's objection to that name applies here
   * one screen earlier in the flow: this app does not watch a price over
   * time, in v1 it saves a snapshot of it, on every tier, so the button may
   * only ever say what the tap actually does. Nine strings, three tiers times
   * three personalities. There is no feed in v1, so none of these may promise
   * to notify, nudge or shout either.
   */
  peek_good: {
    deadpan: () => 'Save it',
    warm: () => 'Save it, easily',
    blunt: () => 'Save it. Now.',
  },
  peek_fair: {
    deadpan: () => 'Save it',
    warm: () => 'Save it, just in case',
    blunt: () => 'Save it.',
  },
  peek_walk_away: {
    deadpan: () => 'Save it',
    warm: () => 'Save it, just in case',
    blunt: () => 'Save it.',
  },
  /**
   * Row 32: the label once the tap has landed. A state, not a personality
   * line. Says "Saved" rather than "Watching": there is no re-queryable
   * source in v1 (FLAGS.feed), so a word that promises to look again would
   * be a promise this build cannot keep.
   */
  peek_watching: {
    deadpan: () => 'Saved',
    warm: () => 'Saved',
    blunt: () => 'Saved',
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
    warm: () => 'Nothing here yet. Save something and I keep the price, the seller and the day.',
    blunt: () => 'Empty. Nothing to watch yet.',
  },
  /**
   * The watchlist header's own callback, a 64px face-and-bubble above the
   * rows: the most recently saved item, read back from facts already on
   * screen. Not a live promise -- item, price, seller and day, the same
   * three things `watching` above already commits to being able to say.
   */
  watchlist_callback: {
    deadpan: (f) => `${f.item}. ${f.price}${f.seller ? `, ${f.seller}` : ''}, saved ${f.day}.`,
    warm: (f) => `Still have ${f.item} saved, ${f.price}${f.seller ? ` at ${f.seller}` : ''}, ${f.day}.`,
    blunt: (f) => `${f.item}. ${f.price}${f.seller ? `, ${f.seller}` : ''}. ${f.day}.`,
  },
  /**
   * A saved row opened with no matching scan left in history (the watch
   * entry itself carries no verdict, only what was saved at the time). Says
   * exactly what is left to show: the row's own fields, nothing invented.
   */
  watchlist_saved_only: {
    deadpan: (f) => `${f.price}${f.seller ? `, ${f.seller}` : ''}, saved ${f.day}.`,
    warm: (f) => `You saved this at ${f.price}${f.seller ? ` from ${f.seller}` : ''}, ${f.day}.`,
    blunt: (f) => `${f.price}${f.seller ? `, ${f.seller}` : ''}. Saved ${f.day}.`,
  },
  /** The plain admission that goes with `watchlist_saved_only`: no verdict on file. */
  watchlist_no_history_note: {
    deadpan: () => 'No verdict on file for this one anymore. This is only what you saved.',
    warm: () => 'I do not have the original verdict anymore, only what you saved.',
    blunt: () => 'No verdict saved. Just the price.',
  },

  /* --- corrections --- */
  /*
   * Added 2026-09-06. These four arrived written once each, inline in a screen
   * and in lib/persistence.js, during the UI pass -- which is the thing the
   * capitals at the top of this file forbid. Three variants each, so they ship.
   *
   * The register, from PERSONALITIES above: Deadpan states it and stops, Warm
   * is on your side about it, Blunt is short. Blunt is short at the situation
   * and never at the person -- CLAUDE.md hard rule 4, the aggression points at
   * the price, the store or the brand.
   *
   * The fact is identical in all three of each: same requirement, same
   * consequence. Only the words move.
   */
  storage_not_kept: {
    deadpan: () => 'This browser is not letting me keep anything. It works until you close the tab, then it is gone.',
    warm: () => 'Heads up, this browser will not let me save anything. It all still works, it just will not be here next time.',
    blunt: () => 'This browser blocks saving. Nothing here survives the tab closing.',
  },
  correct_gate_both: {
    deadpan: () => 'I need the price and the shop before I can file this.',
    warm: () => 'Just the price and the shop, then I can file it.',
    blunt: () => 'Price and shop. Then I can file it.',
  },
  correct_gate_price: {
    deadpan: () => 'Type the price on the tag.',
    warm: () => 'Pop in the price from the tag.',
    blunt: () => 'The price. Off the tag.',
  },
  correct_gate_seller: {
    deadpan: () => 'Name the shop. A price with no shop cannot be compared to anything later.',
    warm: () => 'Which shop was it? A price on its own cannot be compared to anything later.',
    blunt: () => 'Which shop. A price with no shop is useless later.',
  },
  correct_ask: {
    deadpan: () => 'What does it actually say?',
    warm: () => 'What is on the tag?',
    blunt: () => 'What does it say?',
  },
  /**
   * REWRITTEN when the corrections were actually wired, because the old line
   * had become false in the other direction.
   *
   * It used to say "counts once a second tag agrees", written when a correction
   * was collected and applied to nothing, and carefully hedged so it could not
   * claim to have changed a verdict. Two things happened since. The correction
   * now reaches the spine as a price point, and the thresholds came out
   * (2026-09-05, always answer and let the confidence carry the doubt), so a
   * single correction already moves the next verdict on that product. Telling
   * somebody their contribution is waiting for a second witness, when it is
   * already being used, is as wrong as overclaiming and it is wrong in the
   * direction that makes people stop bothering.
   *
   * What a second reading does is move the confidence band off low, which is
   * what the second half of the line now says.
   */
  correct_thanks: {
    deadpan: () => 'Recorded. It counts from now. A second tag makes it firm.',
    warm: () => 'Thank you, that is recorded. It counts from your next scan, and it gets firmer when someone else sees the same price.',
    blunt: () => 'Got it. Counts now. Firmer when a second one agrees.',
  },
  /**
   * The correction screen's own fineprint, moved out of correct.js: no line
   * Shin says may be written inside a screen file. Says what is now actually
   * true, against the item and seller already on screen: the correction is
   * filed against that product, at that shop, and counts when a second reading
   * agrees. See `correct_thanks` above for why the wording stays as it is.
   */
  correct_fineprint: {
    deadpan: (f) => `Recorded against ${f.label}${f.seller ? `, at ${f.seller}` : ''}. It counts from now, firmer when a second tag agrees.`,
    warm: (f) => `That is recorded against ${f.label}${f.seller ? `, at ${f.seller}` : ''}. It counts from your next scan, and firms up when someone else sees the same price.`,
    blunt: (f) => `Recorded, ${f.label}${f.seller ? `, at ${f.seller}` : ''}. Counts now, firmer when a second one agrees.`,
  },

  /**
   * --- the asking price pad, AVATAR.md section 3 row 14 ---
   * USAGE.md A1 0:13.4: the pad rises with this line above it, and its own key
   * is the continue, so this is the only string on that screen.
   */
  price_pad_prompt: {
    deadpan: () => 'What does the tag say?',
    warm: () => 'What is on the tag?',
    blunt: () => 'Tag price. Type it.',
  },

  /**
   * --- the going-rate card, AVATAR.md section 3 row 26 ---
   * USAGE.md section 2: no asking price supplied, so this is the range, not a
   * verdict. Never promises to look again.
   */
  going_rate: {
    deadpan: () => 'I know what this goes for. I do not know what they are asking.',
    warm: () => 'I know what this goes for. Tell me the tag and I will judge it.',
    blunt: () => 'I know the going rate. I do not know their number.',
  },

  /**
   * --- the working sheet's three named steps, AVATAR.md section 3 rows 16-18 ---
   * Advanced on real events only (identification chosen, price request sent,
   * response received), never on a timer that pretends. OLMA audit row 47.
   */
  working_step1: {
    deadpan: () => 'Identifying it',
    warm: () => 'Working out what this is',
    blunt: () => 'Figuring out what it is',
  },
  working_step2: {
    deadpan: () => 'Looking for prices',
    warm: () => 'Off to find some prices',
    blunt: () => 'Hunting prices',
  },
  working_step3: {
    deadpan: () => 'Checking the sellers',
    warm: () => 'Checking who has it',
    blunt: () => 'Checking who sells it',
  },
  /** AVATAR.md row 19: past the 0.8s budget, still under the 6s cap. */
  working_slow: {
    deadpan: () => 'Still on it.',
    warm: () => 'Still on it, sorry.',
    blunt: () => 'Slow one.',
  },

  /**
   * --- the hint pill's one unprompted escalation, AVATAR.md section 3 row 9 ---
   * Fires once per camera session, after four seconds of nothing detected.
   * USAGE.md B1 0:13.9, OLMA audit row 34.
   *
   * Never offers reading a screenshot: there is no gallery route, no image
   * input and no vision model in this build, so that was a promise the app
   * could not keep (the founder's own catch). The two things it now offers,
   * pointing the camera at the item and typing what it is, are both real:
   * the second is the no-identity refusal's own repair, camera.js's
   * `data-act="typeit"`.
   */
  hint_escalated: {
    deadpan: () => 'No tag on it? Point at the thing itself, or type what it is.',
    warm: () => 'No tag on it? Point at the thing itself, or tell me what it is instead.',
    blunt: () => 'No barcode there. Try the thing itself, or type it.',
  },

  /**
   * --- the text route out of a refusal, AVATAR.md section 3 row 41 ---
   * OLMA audit rows 17, 88, 89: naming brand and model is what makes a typed
   * name hit the fixed corpus instead of failing silently.
   */
  text_route_prompt: {
    deadpan: () => 'Name it. Brand and model gets closest.',
    warm: () => 'Name it for me. Brand and model gets closest.',
    blunt: () => 'Brand and model. Type.',
  },

  /**
   * --- the thumbs feedback toast, AVATAR.md section 3 row 35 ---
   * Earns nothing (GAMIFICATION.md M12). Undo lives beside it for four seconds,
   * OLMA audit row 65. camera.js's own comment on the tap handler is explicit:
   * "it earns nothing and writes nothing but this local signal", so the warm
   * line may not claim it teaches Shin anything; nothing is stored anywhere.
   */
  feedback_ack: {
    deadpan: () => 'Noted.',
    warm: () => 'Thank you for saying so.',
    blunt: () => 'Good. Noted.',
  },

  /**
   * --- "Recently removed" section header, AVATAR.md section 3 row 46 ---
   * State idle, face-row 28px, no animation.
   */
  removed_retention: {
    deadpan: () => 'Kept for 30 days.',
    warm: () => 'I keep these for 30 days in case you change your mind.',
    blunt: () => '30 days, then gone.',
  },
  /** The empty body of "Recently removed": the same 48px component as the
   * header above it, not a bare icon-less line. */
  removed_empty: {
    deadpan: () => 'Nothing removed.',
    warm: () => 'Nothing removed. Nothing lost, either.',
    blunt: () => 'Nothing removed.',
  },

  /**
   * --- "Past scans", empty state, AVATAR.md section 3 row 48 ---
   * State asleep, face-verdict 96px, sleep-breath, loops.
   */
  pastscans_empty: {
    deadpan: () => 'Nothing scanned yet.',
    warm: () => 'Nothing yet. It fills up on its own.',
    blunt: () => 'Nothing yet.',
  },
  /**
   * Past scans header, a 64px callback to the most recent row: item and the
   * word already resolved by the screen (a verdict's word, or "refused").
   */
  pastscans_callback: {
    deadpan: (f) => `Last one: ${f.item}, ${f.verdict}.`,
    warm: (f) => `Last time, ${f.item}: ${f.verdict}.`,
    blunt: (f) => `${f.item}. ${f.verdict}.`,
  },

  /**
   * --- market picker, opened, AVATAR.md section 3 row 54 ---
   * State asking, face-page 48px, face-morph.
   *
   * market.js's own file comment is explicit: naming a market "changes
   * nothing in the engine today." Saying every verdict is "measured against"
   * or "judged against" it would be a claim about how the comparison works
   * that is not true yet, so this says what is actually true: the pick is
   * recorded and shown, not yet part of the comparison itself.
   */
  market_ask: {
    deadpan: () => 'Where do you shop? I record it. It does not change what I compare yet.',
    warm: () => 'Where do you shop? I will keep it on file, even though it does not change what I compare yet.',
    blunt: () => 'Where do you shop? Recorded. Does nothing yet.',
  },

  /**
   * --- the attitude picker's own bubble, setup screen ---
   * Each of the three faces on setup speaks its own personality's line
   * regardless of which personality is currently picked, so a visitor can
   * hear the difference before choosing. Same wording as PERSONALITIES'
   * `.sample` field (that field only feeds the picker's own data table;
   * this key is what a screen is allowed to hand to `say`).
   */
  attitude_sample: {
    deadpan: () => 'Two dollars. It’s $1.47.',
    warm: () => 'Ooh, that’s steep. I’d wait.',
    blunt: () => 'They’re robbing you.',
  },
  /**
   * The setup picker's own acknowledgement: spoken by whichever personality
   * was just picked, morphed to `pleased` in place (setup.js). Each variant
   * is that personality talking about itself, so the sound of the choice is
   * the last thing heard before the camera opens.
   */
  attitude_pick: {
    deadpan: () => 'Noted. This is how I sound now.',
    warm: () => 'Good, this is me from here on.',
    blunt: () => 'Locked in. This is my voice now.',
  },

  /* you, lane C */
  /**
   * --- You page header bubble, AVATAR.md You row ---
   * State fair (idle-breath) most weeks, proud (proud-hold) when
   * store.goodFindThisWeek() is true. Facts come straight from
   * store.weeklyStats(): scanned and callable, already counted, never
   * projected or ranked here.
   */
  you_weekly: {
    deadpan: (f) => (f.scanned === 0
      ? 'Nothing scanned this week.'
      : `${f.scanned} scanned this week. ${f.callable} I could call.`),
    warm: (f) => (f.scanned === 0
      ? 'Nothing scanned yet this week.'
      : `${f.scanned} scanned this week. I could call ${f.callable} of them.`),
    blunt: (f) => (f.scanned === 0
      ? 'Nothing this week.'
      : `${f.scanned} this week. ${f.callable} I could call.`),
  },

  /* camera, lane B */
  /**
   * --- the docked camera hint, replaces the old inline "Point at a price
   * tag" string that lived in camera.js. Idle, 64px, docked top-left under
   * the wordmark. ---
   */
  cam_aim_hint: {
    deadpan: () => 'Point at a price tag.',
    warm: () => 'Point me at a price tag.',
    blunt: () => 'Tag. Point at it.',
  },
  /*
   * --- the four measured lines. Every one of them is produced by a number
   * taken off the live frame, never by a timer and never on arrival, and every
   * one names a single thing to do. Hard rule 4 applies with force here: the
   * aggression points at the price, the store or the brand, never at the user,
   * and a person who has framed a shot badly is the easiest target in the app.
   * So none of these say what went wrong. They say what to do next. ---
   */
  /** A barcode is decoding and has not agreed with itself enough times yet. */
  cam_hold_still: {
    deadpan: () => 'Barcode. Hold it there.',
    warm: () => 'I can see the barcode. Hold it there.',
    blunt: () => 'Got a barcode. Hold.',
  },
  /** The label is blown out by a reflection, which one small movement fixes. */
  cam_glare: {
    deadpan: () => 'Shine on the label. Tilt it a little.',
    warm: () => 'The light is bouncing off the label. Tilt it a little.',
    blunt: () => 'Too much shine. Tilt it.',
  },
  /**
   * The object is too small in frame to carry its own fine print, and the
   * camera has already spent whatever zoom it had.
   */
  cam_closer: {
    deadpan: () => 'A step closer and I can read it.',
    warm: () => 'One step closer and I can read the label.',
    blunt: () => 'Closer. I cannot read that.',
  },
  /**
   * More than one thing is in frame. Said once per camera session, because it
   * teaches a control rather than fixing a shot, and a control only needs
   * teaching once.
   */
  cam_pick_one: {
    deadpan: () => 'More than one thing here. Tap the one you mean.',
    warm: () => 'I can see a few things. Tap the one you mean.',
    blunt: () => 'Several here. Tap yours.',
  },
  /**
   * --- torch acknowledged, one short line, then back to whichever hint was
   * already showing. State idle, no animation of its own. ---
   */
  cam_torch_on: {
    deadpan: () => 'Torch on.',
    warm: () => 'Torch on, that should help.',
    blunt: () => 'Light on.',
  },
  /**
   * --- second visit, the docked camera's first bubble instead of the aim
   * hint, for one appearance. Facts arrive already formatted: item, seller
   * (may be empty), asking (may be empty, a formatted amount), word (the
   * verdict's own word, or "Refused"). ---
   */
  cam_second_visit: {
    deadpan: (f) => `Last time: ${f.item}${f.seller ? ` at ${f.seller}` : ''}${f.asking ? `, ${f.asking}` : ''}. ${f.word}.`,
    warm: (f) => `Last time you scanned ${f.item}${f.seller ? ` at ${f.seller}` : ''}${f.asking ? `, ${f.asking}` : ''}. ${f.word}.`,
    blunt: (f) => `Last one: ${f.item}${f.asking ? `, ${f.asking}` : ''}. ${f.word}.`,
  },
  /**
   * --- the candidate list's own head, reframed off the unsure refusal it
   * used to borrow: this is a plain question, not Shin failing to separate
   * two things. State asking, 64px, face-morph. ---
   */
  cam_candidate_prompt: {
    deadpan: () => 'Which one is it?',
    warm: () => 'Which one of these is it?',
    blunt: () => 'Pick one.',
  },
  /**
   * --- the category refusal's repair, now a short list on the same sheet
   * instead of a navigation away that lost the framed photo. Intro line
   * only; the categories themselves are chrome (server data, not Shin
   * talking). ---
   */
  refuse_category_repair: {
    deadpan: () => 'Here is what I price.',
    warm: () => 'Here is what I can help you with instead.',
    blunt: () => 'I price these instead.',
  },
  /**
   * --- row 14, the privacy line, at the moment camera permission is asked.
   * Shown while `getUserMedia` is in flight; swapped for the real idle
   * content the instant it resolves either way. What it claims is checked
   * against api.js: no photo field is ever sent to the server. ---
   */
  cam_privacy_line: {
    deadpan: () => 'Your camera stays on your phone. Only the price ever leaves it.',
    warm: () => 'Nothing from your camera leaves your phone, only the price does.',
    blunt: () => 'Camera stays local. Only the price goes out.',
  },
};

/**
 * Say one line.
 *
 * @param {string} key   a key in LINES
 * @param {object} [facts]  already-formatted strings, never raw numbers
 * @param {string} [who]  personality override; defaults to the user's own
 *   pick. Only for a screen that shows more than one personality's voice at
 *   once (the attitude picker); every other call site omits it and gets the
 *   same behaviour as before this parameter existed.
 */
export function say(key, facts = {}, who) {
  // watching is the only key with a dark alternate. A screen always asks for
  // watching; whether it gets the row-32 save line or the row-33 promise is
  // this one switch, never a second call site.
  const resolvedKey = key === 'watching' && FLAGS.feed ? 'watching_feed' : key;
  const row = LINES[resolvedKey];
  if (!row) return '';
  const speaker = who && PERSONALITIES.some((p) => p.id === who) ? who : personality();
  const fn = row[speaker] ?? row[DEFAULT_PERSONALITY];
  return typeof fn === 'function' ? fn(facts) : '';
}

/** The verdict word for a tier, which is the biggest text on the surface. */
export function wordFor(tierId) {
  return say(`word_${tierId}`) || 'About right';
}
