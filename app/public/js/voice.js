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
 * WHERE THE LINE IS, decided 2026-09-07 and enforced by test/screens-voice.test.mjs:
 *
 *   In voice.js: anything in the first person, anything that judges, advises,
 *   apologises, or narrates what Shin is doing.
 *
 *   In the screen: structural labels, headings, button text, kickers, and
 *   factual captions that do not speak as Shin.
 *
 * That boundary retired a self-authored exemption in licences.js which held that
 * "a fetch narration is not a verdict" and so could live in the screen. It
 * appears in no design document, and under the line above a fetch narration
 * written in the first person is Shin talking whether or not it is a verdict.
 * Both of that screen's lines are keys here now, with the four other screens
 * that had been copying the same exemption without ever writing it down.
 *
 * The promise under the picker is that the attitude changes the words and never
 * the number. Nothing in this file may take a price, a count, a seller or a date
 * and alter it. Those arrive already formatted and are only ever interpolated.
 */

import * as store from './store.js';
import { FLAGS } from './flags.js';
import { locale, DEFAULT_LOCALE } from './lib/locale.js';
import { LINES_FR, BARE_FR, PERSONALITIES_FR } from './voice-fr.js';

/**
 * The English personality cards. `personalityCopy(id)` below is how a screen
 * gets them, because the name, the blurb and the sample are all read by
 * somebody and all three have to move with the language. The array itself is
 * kept, and kept English, because the ids are the contract every other file
 * holds and test/voice.test.mjs reads them off it.
 */
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
 * One personality's card, in the language in force.
 *
 * The setup screen and the You screen both print a name, a one-line blurb and
 * a sample of each voice. Those were read straight off `PERSONALITIES` above,
 * which is English, so a French user picking an attitude read three English
 * cards and then heard French. A screen asks for this instead and never holds
 * either table.
 *
 * Falls back to the English card field by field rather than wholesale: a
 * French table missing one blurb should lose that blurb, not the whole card.
 */
export function personalityCopy(id) {
  const en = PERSONALITIES.find((p) => p.id === id);
  if (!en) return null;
  const fr = locale() === 'fr' ? PERSONALITIES_FR[id] : null;
  return {
    id,
    name: fr?.name ?? en.name,
    blurb: fr?.blurb ?? en.blurb,
    sample: fr?.sample ?? en.sample,
  };
}

/**
 * The table. Every entry is a function of the already-formatted facts, so no
 * line here can invent or reshape a number.
 */
const LINES_EN = {
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
  /*
   * --- the photo route's own refusal title, added with the photo path ---
   * A model that timed out, went down, is over its rate limit, or is over its
   * daily spend cap never got a real look at the picture, so titling it like
   * `refuse_unknown` ("I do not know this one") would blame the photo for an
   * outage that has nothing to do with it. Hard rule 3: the aggression, such
   * as it is, points at the reader, never at the shot the shopper took.
   */
  refuse_unavailable: {
    deadpan: () => 'The photo reader is not answering',
    warm: () => 'The photo reader is not answering right now',
    blunt: () => 'Reader is down',
  },
  refuse_unavailable_why: {
    deadpan: () => 'This is the reader, not your photo. The barcode and typing it still work.',
    warm: () => 'This is on my end, not your photo. The barcode or typing it will still get you an answer.',
    blunt: () => 'My fault, not your shot. Try the barcode or type it.',
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
   * --- the price written down off a photo nobody could identify, 2026-09-13 ---
   *
   * The exact inverse of `going_rate` above, and the pair is worth reading
   * together: there, Shin has the comparison set and not the tag; here, Shin
   * has the tag and no idea what the thing is. Both are honest halves, and
   * neither is a verdict.
   *
   * THIS LINE MAY NEVER JUDGE, hedge, or approximate, and that is not a style
   * note. The recorded decision is that a low-confidence identity must not
   * produce a verdict, and an unidentified product has no comparison set at
   * all -- there is no number to be near. "About right" or "roughly" here
   * would be a verdict with the confidence filed off, which is worse than
   * saying nothing, because the shopper cannot tell it from the real thing.
   *
   * So it states two facts and stops: the price is written down, and Shin
   * cannot call this one, because Shin does not know what it is. The reason is
   * given rather than implied; "I cannot judge this" with no because reads as
   * a malfunction, and this is not one.
   */
  price_only_recorded: {
    deadpan: (f) => `Written down. ${f.price}${f.seller ? ` at ${f.seller}` : ''}. I do not know what this is, so I have nothing to compare it to.`,
    warm: (f) => `I have written that down. ${f.price}${f.seller ? ` at ${f.seller}` : ''}. I still do not know what this is, so there is nothing to compare it against yet, but the price is not lost.`,
    blunt: (f) => `Written down. ${f.price}${f.seller ? ` at ${f.seller}` : ''}. No idea what it is, so no call from me.`,
  },

  /**
   * --- the shop shortlist, 2026-09-13 ---
   *
   * Asked once per shop and then never again: the tap is remembered against
   * the coarse cell, so the second visit opens with the right shop already
   * chosen. Both lines say what the list IS rather than instructing -- the
   * shortlist is a question a person answers, and Shin's own note on it is
   * why the list is short, not an order to pick from it.
   *
   * `shop_none_nearby` has to be honest about a thing this app cannot fix:
   * the shop data is OpenStreetMap's, so a shop nobody has mapped is a shop
   * that is not on the list, and the price is still worth writing down.
   */
  shop_pick_prompt: {
    deadpan: () => 'The shops around here. Tap the one you are in and I will remember it.',
    warm: () => 'Here are the shops around you. Tap the one you are standing in and I will remember it, so I will not ask again next time you come here.',
    blunt: () => 'Shops near you. Tap yours. I will remember.',
  },
  shop_none_nearby: {
    deadpan: () => 'No shops mapped around here. The price is still worth writing down without one.',
    warm: () => 'I cannot find any shops mapped around here, which usually means nobody has added them to the map yet. The price is still worth writing down without one.',
    blunt: () => 'Nothing mapped here. Write the price down anyway.',
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
  /**
   * The same header when `store.goodFindThisWeek()` is true, which is the
   * condition you.js already uses to pick the `proud` face and the
   * `proud-hold` animation. Before this key that face was handed `you_weekly`,
   * a line written for `fair`, so the proud state shipped with a borrowed
   * cell. DESIGN.md section 3: a state with a missing cell does not ship.
   *
   * Same two facts, same arithmetic, no third number. The good find is not
   * counted here, because nothing in this file may count anything; the fact
   * that there was one is carried by the branch that chose this key.
   */
  you_weekly_proud: {
    deadpan: (f) => `${f.scanned} scanned this week. ${f.callable} I could call, and one of them was a good price.`,
    warm: (f) => `${f.scanned} scanned this week, and I could call ${f.callable} of them. One was a properly good price.`,
    blunt: (f) => `${f.scanned} this week. ${f.callable} callable, and one was a good price.`,
  },
  /**
   * --- the You page's coverage block, three states ---
   *
   * The block asks the engine to price everything it knows and prints how many
   * it can actually answer for. All three of these were written inline in
   * you.js: they narrate what Shin is doing and then judge what Shin can do,
   * which is both halves of the boundary at the top of this file.
   *
   * The refused line takes the count already computed by the screen. It is
   * interpolated and never derived here.
   */
  you_coverage_loading: {
    deadpan: () => 'Asking the engine…',
    warm: () => 'Let me go and ask the engine…',
    blunt: () => 'Asking. One moment…',
  },
  you_coverage_refused: {
    deadpan: (f) => `${f.refused} of the things I know about, I will refuse on, because the evidence behind them is not enough to call. That is measured by pricing every one of them, not counted off a list.`,
    warm: (f) => `There are ${f.refused} I know about and will still refuse on, because what is behind them is not enough to call. I measure that by pricing every one of them rather than counting a list.`,
    blunt: (f) => `${f.refused} of them I will refuse on. Not enough behind them. Measured by pricing every one, not counted off a list.`,
  },
  you_coverage_failed: {
    deadpan: () => 'I could not reach my own engine to check.',
    warm: () => 'I could not reach my own engine to check, and I would rather say that than put a number up I did not measure.',
    blunt: () => 'My own engine did not answer. No count until it does.',
  },

  /*
   * The scan log's four, migrated 2026-09-08 when main's block met this rule.
   *
   * They arrived on main as sentences written inside `you.js`, which is legal
   * on a branch that does not have this file's rule and is not legal here. The
   * two that carry a number take it as a fact rather than building the sentence
   * at the call site, so the screen holds no copy at all: `you_scans_named`
   * gets "12 scans", already pluralised, and never the bare integer.
   *
   * Both fact-carrying keys are in BARE. A rate the server could not put a
   * denominator under is the normal case on a new install, so a caller here
   * getting its facts wrong is a live possibility rather than a theoretical
   * one, and D-021 says the screen must not show the word "undefined" for it.
   */
  you_scans_none: {
    deadpan: (f) =>
      `Nothing scanned yet${f.problem}. Every scan from now on is written down, so these numbers start the first time you point me at something.`,
    warm: (f) =>
      `Nothing scanned yet${f.problem}. Everything from here is written down, so these fill in the first time you point me at something.`,
    blunt: (f) => `Nothing yet${f.problem}. Scan something and this starts counting.`,
  },
  you_scans_named: {
    deadpan: (f) =>
      `Out of ${f.scans} anyone has made, that is how often I could say what the thing was. Being able to name it is not the same as being able to price it, and this number is the first one, which is the larger of the two.`,
    warm: (f) =>
      `Out of ${f.scans} anyone has made, that is how often I could tell you what the thing was. Naming it is not the same as pricing it, and this is the naming one, which is always the kinder number.`,
    blunt: (f) => `${f.scans}. That is how often I knew what it was. Knowing is not pricing.`,
  },
  you_scans_dropped: {
    deadpan: (f) => `${f.scans} could not be written down: ${f.why}. The numbers above are missing them.`,
    warm: (f) => `${f.scans} did not make it into the log: ${f.why}. The numbers above are missing them, so treat them as a floor.`,
    blunt: (f) => `${f.scans} lost: ${f.why}. The numbers above are short by that much.`,
  },
  you_scanlog_failed: {
    deadpan: () => 'I could not read my own scan log.',
    warm: () => 'I could not read my own scan log, and I would rather say so than show you a number I did not read.',
    blunt: () => 'My own scan log did not answer.',
  },

  /*
   * The cheaper-options slot's failure, migrated 2026-09-08 with the four above.
   *
   * A lookup that threw is not "there is nothing cheaper", and the slot has to
   * say which of the two it is: leaving the searching line up reads as a search
   * still running, and printing the empty sentence claims a result nobody got.
   */
  cam_cheaper_failed: {
    deadpan: () => 'I could not check for a cheaper one.',
    warm: () => 'I could not check for a cheaper one just now. Worth another try.',
    blunt: () => 'Could not check for a cheaper one.',
  },

  /*
   * "Not this?", added 2026-09-08 when the ranked search finally got a caller.
   *
   * `cam_notthis_offer` is the only one of the four a shopper sees without
   * asking for it, and it is deliberately not an apology. It appears only when
   * the search came back `ambiguous`, meaning there really were other plausible
   * rows; after a confident answer it would be Shin hedging about something he
   * is not actually unsure of, which costs trust in every other answer he gives.
   *
   * `cam_notthis_empty` exists because the second ask can legitimately return
   * nothing new: identify and search run the same query, so the one row already
   * on screen can be the whole of it. Saying so is better than an empty list,
   * which reads as a failure.
   */
  cam_notthis_offer: {
    deadpan: () => 'Not this one?',
    warm: () => 'Not this one? There were others close to it.',
    blunt: () => 'Wrong one? There were others.',
  },
  cam_notthis_prompt: {
    deadpan: (f) => `Everything I found for "${f.query}".`,
    warm: (f) => `Here is everything I found for "${f.query}". Pick the right one and I will price that instead.`,
    blunt: (f) => `All of it, for "${f.query}". Pick one.`,
  },
  cam_notthis_empty: {
    deadpan: (f) => `That is the only thing I have for "${f.query}".`,
    warm: (f) => `That really is the only thing I have for "${f.query}", so the first answer was not a guess between several.`,
    blunt: (f) => `Only one. "${f.query}" gets you that and nothing else.`,
  },
  cam_notthis_keep: {
    deadpan: () => 'The first answer stands',
    warm: () => 'I will stay with the first one',
    blunt: () => 'Fine. The first one.',
  },
  /*
   * The type-it route's no-match refusal, migrated 2026-09-09. It was written
   * inline in camera.js with the typed text interpolated before its final
   * period, which is the one shape the voice test could not see: `segments`
   * splits at the interpolation and neither half ends in a period. The test
   * judges literals whole now, and this was the first thing it found.
   */
  cam_text_no_match: {
    deadpan: (f) => `Nothing in what Shin has been taught matches "${f.query}".`,
    warm: (f) => `I could not find anything I know that matches "${f.query}". Try the barcode, or a different word or two.`,
    blunt: (f) => `"${f.query}" matches nothing I know.`,
  },
  cam_notthis_failed: {
    deadpan: () => 'I could not go back and look again.',
    warm: () => 'I could not go back and look again just now. The first answer still stands.',
    blunt: () => 'Could not look again.',
  },

  /* --- the three list screens, lane C ---
   *
   * Saved, Past scans and Recently removed each had a reading line and a
   * failure line written inside the screen, in the first person, copied from
   * one screen to the next. One key per surface rather than one key with the
   * name of the list interpolated: a noun dropped into a sentence makes the
   * voice depend on a fact, which is the defect D-021 was, and the saving
   * would have been three strings.
   *
   * Hard rule 3 governs the failure lines. A read that did not work is the
   * app's fault and never the reader's, so none of these six may imply the
   * person holding the phone broke something.
   */
  /**
   * Keep it, landed. AVATAR.md section 3 row 40, and these three are the
   * contract's own words rather than a rewrite of them.
   *
   * The sentence has to do two things at once and the second is the one that
   * makes it honest: it confirms the number is written down, and it repeats
   * that Shin still cannot call it. A thin refusal that ends in a thank-you
   * reads as though the refusal was solved. It was not. What changed is that
   * the price is no longer only in the shopper's head.
   */
  keep_it_ack: {
    deadpan: (f) => `Written down. ${f.asking} at ${f.seller}, ${f.day}. I still cannot call it.`,
    warm: (f) => `Written down, ${f.asking} at ${f.seller}, ${f.day}. I still cannot call it, but it is not lost.`,
    blunt: () => 'Written down. Still cannot call it.',
  },
  /**
   * The camera's own two, migrated 2026-09-07 with the five above.
   *
   * `cam_sources_failed` is the sixth copy of the same sentence the five list
   * screens carried, and it was the worst of the six: the screen concatenated
   * `String(err.message ?? err)` onto the end, so a raw JavaScript error
   * reached a shopper's refusal sheet. That is the same class as D-011, an
   * internal string on the screen of someone who cannot act on it. The error
   * belongs in the console, where somebody can.
   */
  cam_sources_failed: {
    deadpan: () => 'I could not reach my own sources just now.',
    warm: () => 'I could not reach my own sources just now. Not your doing, and worth another try.',
    blunt: () => 'My own sources did not answer. Try me again.',
  },
  /**
   * The offline aisle's own ending, added 2026-09-07 when the pack landed.
   *
   * Its sibling above is for sources that did not answer; this one is for the
   * scan that never asked them, because the phone had no signal and the pack on
   * the phone answered instead. The pack knows what the thing is and can never
   * know what it costs, and the sentence has to say both halves: a shopper told
   * only "I cannot price this" would reasonably think the name was a guess.
   * It arrived inline on the refusal sheet and was moved here with the six, so
   * the three tones apply to it like everything else a shopper reads.
   */
  cam_offline_no_price: {
    deadpan: () =>
      'No signal, so I am working off what this phone already had. That tells me what it is and never what it costs, because prices move every week and a stale one is worse than none. Ask me again where there is a bar of signal.',
    warm: () =>
      'No signal, so this is what the phone already had saved. It is enough to name the thing, never enough to price it -- prices move every week and a stale one would mislead you. Catch me again with a bar of signal.',
    blunt: () =>
      'No signal. The phone knows what this is. It cannot know what it costs, and a stale price is worse than none.',
  },
  /*
   * --- the photo route's own six, added with the photo path
   * (docs/the-photo-path.md section 3) ---
   *
   * `cam_photo_offline` is this app's own words for spine's own fixed line,
   * "You are offline, so we kept the photo." (spine/src/run.ts REFUSALS.offline):
   * the request never reached the server, the crop is queued rather than lost,
   * and the sentence has to say both halves the same way `cam_offline_no_price`
   * does above it.
   *
   * `cam_photo_unreadable` is the honest miss: the photo made it to the model
   * and the model could not read it. Reason stays `no_identity` on the sheet,
   * because that is what actually happened.
   *
   * The four `cam_photo_model_*` lines are the reader itself not answering --
   * timed out, down, over its rate limit, or over its daily spend cap. None of
   * them says the raw class, and none of them reads as the shopper's photo
   * being at fault (hard rule 3): each one repeats what still works right now,
   * the barcode or typing it, so a refusal is never a dead end.
   */
  cam_photo_offline: {
    deadpan: () => 'You are offline, so I kept the photo. I will finish this once you are back on.',
    warm: () => 'No signal, so I kept your photo safe. I will pick this back up the moment you are online again.',
    blunt: () => 'Offline. Photo kept. I will finish this once you are back.',
  },
  cam_photo_unreadable: {
    deadpan: () => 'That photo did not read clearly enough to say what it is. Try again, or type what it is.',
    warm: () => 'I could not read that photo clearly enough to say what it is. Try again, or tell me what it is.',
    blunt: () => 'Could not read that photo. Try again, or type it.',
  },
  /*
   * Item 20c: the produce branch of the on-device kind classifier, before any
   * paid model call. Reason stays `category_unsupported` on the sheet, the
   * same one the priced side of this app already uses for a category it will
   * not judge -- this is the same honest refusal, only reached from a photo
   * rather than a barcode or a typed name.
   */
  cam_photo_produce: {
    deadpan: () => 'That looks like fresh produce. I do not price that from a photo; type the price off the sign instead.',
    warm: () => 'That looks like fresh produce, so a photo will not get you a verdict there. Type the price off the sign and I will note it.',
    blunt: () => 'Produce. No photo verdict for that. Type the price.',
  },
  cam_photo_model_timeout: {
    deadpan: () => 'The photo reader took too long to answer this one. The barcode and typing it still work.',
    warm: () => 'The photo reader took too long on this one, not your shot. The barcode or typing it will still get you an answer.',
    blunt: () => 'Reader timed out. Try the barcode or type it.',
  },
  cam_photo_model_outage: {
    deadpan: () => 'The photo reader is down right now. The barcode and typing it still work.',
    warm: () => 'The photo reader is down right now, not your shot. The barcode or typing it will still get you an answer.',
    blunt: () => 'Reader is down. Try the barcode or type it.',
  },
  cam_photo_model_rate_limited: {
    deadpan: () => 'Too many photos are going through right now. The barcode and typing it still work.',
    warm: () => 'Photos are backed up right now, not your shot. The barcode or typing it will still get you an answer.',
    blunt: () => 'Too busy right now. Try the barcode or type it.',
  },
  cam_photo_spend_cap_reached: {
    deadpan: () => 'Today’s photo reads are used up. The barcode and typing it still work.',
    warm: () => 'Today’s photo reads are already used up, not your shot. The barcode or typing it will still get you an answer.',
    blunt: () => 'Out of photo reads today. Try the barcode or type it.',
  },
  /**
   * The last row of the stand-in candidate list, under "Something else". It
   * promises a refusal rather than pretending, which is the honest thing for a
   * list that cannot yet be produced by a camera.
   */
  cam_candidate_none: {
    deadpan: () => 'I will almost certainly refuse',
    warm: () => 'I will probably have to refuse this one',
    blunt: () => 'I will refuse. Fair warning.',
  },
  watchlist_loading: {
    deadpan: () => 'Reading what you saved…',
    warm: () => 'Fetching what you saved…',
    blunt: () => 'Reading your saves…',
  },
  watchlist_failed: {
    deadpan: () => 'I could not read what you saved.',
    warm: () => 'I could not read what you saved back. Give me another go at it.',
    blunt: () => 'Cannot read what you saved. Try me again.',
  },
  pastscans_loading: {
    deadpan: () => 'Reading your past scans…',
    warm: () => 'Getting your past scans together…',
    blunt: () => 'Reading your scans…',
  },
  pastscans_failed: {
    deadpan: () => 'I could not read your past scans.',
    warm: () => 'I could not read your past scans back. Give me another go at it.',
    blunt: () => 'Cannot read your past scans. Try me again.',
  },
  removed_loading: {
    deadpan: () => 'Reading what was removed…',
    warm: () => 'Looking up what was removed…',
    blunt: () => 'Reading the removed list…',
  },
  removed_failed: {
    deadpan: () => 'I could not read what was removed.',
    warm: () => 'I could not read what was removed back. Give me another go at it.',
    blunt: () => 'Cannot read the removed list. Try me again.',
  },

  /**
   * --- the reopened verdict's own footer, three call sites, one key ---
   *
   * "This is what Shin said at the time. Read-only." was written three times,
   * twice in pastscans.js and once in watchlist.js, and it is Shin narrating
   * the state of its own record. One key is a real deduplication rather than a
   * bookkeeping one: the three copies were already free to drift.
   *
   * All three variants keep the two things the note does: it was said then,
   * and nothing on this card can be acted on now.
   */
  read_only_note: {
    deadpan: () => 'This is what I said at the time. Nothing here can be changed.',
    warm: () => 'This is what I said at the time, kept as it was. Nothing on this card changes.',
    blunt: () => 'What I said then. Nothing to change here.',
  },

  /**
   * --- the refusal reasons, as a heading on a reopened refusal ---
   *
   * pastscans.js carried these as a plain map called REFUSAL_LABEL, described
   * in its own comment as "plain screen labels, not Shin speaking". They are
   * duplicated copy: this file already owns eight refusal keys covering the
   * same eight reasons, written three times each, and the map wrote each of
   * them a ninth time in one voice.
   *
   * Read `refusalLabel(reason)` below rather than these keys directly, so a
   * reason with no key of its own still gets the plain word.
   *
   * Hard rule 3: "no asking price" and "could not identify it" are the two
   * that would be easiest to write at the person who scanned. Neither of them
   * names anybody. The refusal is the app's, and it says so.
   */
  refusal_label_no_identity: {
    deadpan: () => 'Refused. I could not identify it.',
    warm: () => 'Refused, because I could not work out what it was.',
    blunt: () => 'Refused. No idea what it was.',
  },
  refusal_label_identity_unsure: {
    deadpan: () => 'Refused. I was not sure which one it was.',
    warm: () => 'Refused, because I could not tell which one of them it was.',
    blunt: () => 'Refused. Could not pick which one.',
  },
  refusal_label_category_unsupported: {
    deadpan: () => 'Refused. I do not price that kind of thing.',
    warm: () => 'Refused, because that is a kind of thing I skip.',
    blunt: () => 'Refused. Not something I do.',
  },
  refusal_label_no_source_response: {
    deadpan: () => 'Refused. No source answered me.',
    warm: () => 'Refused, because nowhere I asked came back with a price.',
    blunt: () => 'Refused. Nobody answered.',
  },
  refusal_label_too_few_points: {
    deadpan: () => 'Refused. Not enough evidence to call it.',
    warm: () => 'Refused, because there was not enough behind it to call.',
    blunt: () => 'Refused. Too little to go on.',
  },
  refusal_label_points_too_stale: {
    deadpan: () => 'Refused. The prices I had were too old.',
    warm: () => 'Refused, because everything I had on it was too old to trust.',
    blunt: () => 'Refused. Old prices only.',
  },
  refusal_label_comparison_incoherent: {
    deadpan: () => 'Refused. The prices disagreed with each other.',
    warm: () => 'Refused, because the prices I found did not agree with each other.',
    blunt: () => 'Refused. The prices contradicted each other.',
  },
  refusal_label_no_asking_price: {
    deadpan: () => 'Refused. No asking price to judge.',
    warm: () => 'Refused, because there was no tag price to judge it against.',
    blunt: () => 'Refused. No price to judge.',
  },
  /*
   * The three the engine gained when D-012 was fixed. That defect was four
   * filter conditions sharing two messages, so the refusal named the wrong
   * cause; splitting the conditions is only half a fix until each one can say
   * what it actually was, which is these.
   *
   * Hard rule 3 does real work on the last of them. Every price coming from
   * the shop the person is standing in is a fact about where the price data
   * comes from, not a mistake anybody made by walking into that shop, so none
   * of its three variants may read as though the wrong store was picked.
   */
  refusal_label_unusable_price_kinds: {
    deadpan: () => 'Refused. The prices I found were all the wrong kind to compare.',
    warm: () => 'Refused, because the only prices I could find were list prices with no shop behind them.',
    blunt: () => 'Refused. List prices only. Nobody is actually selling it at those.',
  },
  refusal_label_points_future_dated: {
    deadpan: () => 'Refused. Every price I found is dated later than this.',
    warm: () => 'Refused, because every price I hold for it is dated in the future, and that cannot be right.',
    blunt: () => 'Refused. All the prices are dated in the future.',
  },
  refusal_label_all_points_from_asking_seller: {
    deadpan: () => 'Refused. Every price I found is from this same shop, so there is nothing to compare it against.',
    warm: () => 'Refused, because every price I found comes from this same shop. Comparing a shop against itself would tell you nothing.',
    blunt: () => 'Refused. This shop is the only one I have prices from. Nothing to compare.',
  },
  /*
   * The four the photo route can return as `failure`, added with the photo
   * path. These are not members of spine's `RefusalReason` union -- they are
   * `FailureClass` codes from the identify layer, reused as the sheet's own
   * `reason` for a photo capture the model itself never finished -- so
   * `refusal-voice.test.mjs`'s sweep of that union does not (and should not)
   * cover them. camera.js passes the failure code straight through as
   * `r.reason`, and D-011 is exactly what happens if a code like that reaches
   * `refusalLabel` with no row here: it falls to the bare "Refused" instead of
   * printing itself, but the itemname line is still better for saying what
   * happened, so these four exist.
   */
  refusal_label_model_timeout: {
    deadpan: () => 'Refused. The photo reader took too long.',
    warm: () => 'Refused, because the photo reader took too long to answer.',
    blunt: () => 'Refused. Reader timed out.',
  },
  refusal_label_model_outage: {
    deadpan: () => 'Refused. The photo reader is down.',
    warm: () => 'Refused, because the photo reader is down right now.',
    blunt: () => 'Refused. Reader is down.',
  },
  refusal_label_model_rate_limited: {
    deadpan: () => 'Refused. Too many photos right now.',
    warm: () => 'Refused, because too many photos are going through right now.',
    blunt: () => 'Refused. Too busy right now.',
  },
  refusal_label_spend_cap_reached: {
    deadpan: () => 'Refused. Today’s photo reads are used up.',
    warm: () => 'Refused, because today’s photo reads are already used up.',
    blunt: () => 'Refused. Out of photo reads today.',
  },

  /**
   * --- the licences screen, two states ---
   *
   * That screen carried its own exemption in its file comment, and it is the
   * reason the boundary at the top of this file is written down: it argued
   * that "a fetch narration is not a verdict" and so could live in the screen.
   * Both lines are first person and both narrate what Shin is doing, so both
   * are here. The exemption is deleted.
   *
   * The failure line keeps the thing that matters about it: an empty
   * attribution screen looks identical to an app with nothing to attribute,
   * so all three variants say the list is being withheld rather than shown
   * short. The aggression, such as it is, points at the fetch.
   */
  licences_loading: {
    deadpan: () => 'Asking for the list of sources…',
    warm: () => 'Let me go and fetch the list of sources…',
    blunt: () => 'Getting the source list…',
  },
  licences_failed: {
    deadpan: () => 'I could not reach the list of sources to credit them. It is not being shown at all rather than shown short.',
    warm: () => 'I could not reach the list of sources to credit them. I would rather show you none of it than a short version that credits the wrong people.',
    blunt: () => 'Could not reach the source list. None of it goes up rather than half of it.',
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
   * content the instant it resolves either way.
   *
   * REWRITTEN 2026-09-11 (item 6e). The line this replaced said "your camera
   * stays on your phone, only the price ever leaves it," which was true the
   * day it was written and stopped being true the day the photo route
   * shipped: `identifyPhoto` in api.js sends the picture itself, as base64,
   * to be read. What is still true, and what this line says instead: a
   * barcode read never sends a picture, only the decoded code, and a photo
   * scan's picture is kept on the server afterward only when Photos is on
   * (item 6, the consent screen and the You screen's withdrawal toggle) --
   * otherwise it is read once, to answer this scan, and not retained. ---
   */
  cam_privacy_line: {
    deadpan: () => 'A barcode never sends a picture, only the code. A photo is sent to be read, and kept afterward only if Photos is on.',
    warm: () => 'Scanning a barcode never sends a picture, just the code. A photo scan sends the picture so I can read it, and I only keep it afterward if you have Photos turned on.',
    blunt: () => 'Barcode: no picture sent. Photo: sent to be read, kept only if Photos is on.',
  },
  /*
   * Item 6: the consent screen's own copy, and the You screen's withdrawal
   * section reads the same two description keys so the sentence explaining a
   * toggle cannot drift between the two places it appears. This is policy
   * text, not Shin having a personality about privacy, so the three voices
   * below say the same thing in close to the same words on purpose -- the
   * opposite intent from a verdict line, and the same intent the existing
   * data paragraph on the You screen was written with.
   */
  consent_intro: {
    deadpan: () => 'Every scan is written down: the product and the price you saw, always, so the next person who scans it gets an answer. Two more things are off unless you turn them on.',
    warm: () => 'Every scan gets written down: what you scanned and the price you saw, always, so the next person who scans the same thing gets an answer too. Two more things below are off unless you switch them on.',
    blunt: () => 'Every scan is logged: product and price, always. Two more things below are off by default.',
  },
  consent_photos_desc: {
    deadpan: () => 'Keeps the picture from a photo scan, tied to that scan, so a wrong answer can be checked later. Off, the picture is read once to answer the scan and is not kept. The risk: a kept photo can show what is near you in the shot.',
    warm: () => 'Keeps the picture from a photo scan, tied to that scan, so a wrong answer can be checked later. Off, the picture is only read once, to answer that scan, and then it is gone. The risk is that a kept photo can show whatever else was in the shot around you.',
    blunt: () => 'Keeps the photo, tied to the scan, so a wrong answer can be checked. Off: read once, not kept. Risk: a kept photo can show what is near you.',
  },
  consent_location_desc: {
    deadpan: () => 'Keeps a rough area, about a kilometre wide, never your exact spot, so a price can be matched to a nearby store. Off, no location is kept at all. The risk: even a rough area narrows down where you shop.',
    warm: () => 'Keeps a rough area, about a kilometre wide, never your exact spot, so a price can be matched to the store you were near. Off, nothing about where you are is kept. The risk is that even a rough area says something about where you shop.',
    blunt: () => 'Keeps a rough area, about a kilometre wide, never your exact spot. Off: nothing kept. Risk: even a rough area narrows down where you shop.',
  },
  /**
   * Item 8d: the You screen's rated-count row. Shin's own voice, same family
   * as `you_scans_named` above it: a fact about this device's own record,
   * narrated rather than printed as a bare caption, so it reads as the same
   * kind of sentence as the rest of the page rather than switching registers
   * for one row.
   */
  you_ratings_none: {
    deadpan: () => 'None yet. A thumb on any verdict counts here.',
    warm: () => 'None yet, but a thumb on any verdict starts this counting.',
    blunt: () => 'None yet. Rate one.',
  },
  /*
   * The You screen's own copy of the data paragraph, item 6e's replacement
   * for "Everything stays on this device," which stopped being true the day
   * the photo route and the hosted tunnel (plan item 1) shipped.
   */
  you_data_intro: {
    deadpan: () => 'Every scan is written down: the product and the price you saw, always. A barcode never sends a picture, only the decoded code.',
    warm: () => 'Every scan gets written down, the product and the price you saw, always. Scanning a barcode never sends a picture, just the code.',
    blunt: () => 'Every scan is logged: product and price, always. Barcode scans never send a picture.',
  },
  consent_footer: {
    deadpan: () => 'Only this app and the person running it can see any of this. Change either choice any time on the You page.',
    warm: () => 'Only this app and the person running it can see any of this, and you can change either choice any time from the You page.',
    blunt: () => 'Only this app and whoever runs it sees this. Change it any time on the You page.',
  },
};

/**
 * What a line falls back to when a fact it needed did not arrive.
 *
 * D-021: seven of the keys above interpolate a fact with no guard, so a caller
 * that omits one ships "Saved at undefined, Metro, undefined." to the screen.
 * A blank bubble would be honest but leaves a hole where Shin was, so every
 * key that can break this way names the sentence it can still say with nothing
 * in hand. These are deliberately weaker than the real lines: they are what is
 * left when the facts are gone, not a second voice.
 *
 * A key not listed here degrades to nothing, which is the same thing an
 * unknown key has always done.
 */
const BARE_EN = {
  cam_text_no_match: {
    deadpan: () => 'Nothing in what Shin has been taught matches that.',
    warm: () => 'I could not find anything I know that matches that. Try the barcode, or a different word or two.',
    blunt: () => 'That matches nothing I know.',
  },
  /* "Not this?" asks its own question back at the shopper, so the fallback has
     to stay a question. Dropping the query is survivable; dropping the ask is
     a list of products with nothing saying what to do with them. */
  cam_notthis_prompt: {
    deadpan: () => 'Everything I found.',
    warm: () => 'Here is everything I found. Pick the right one and I will price that instead.',
    blunt: () => 'All of it. Pick one.',
  },
  cam_notthis_empty: {
    deadpan: () => 'That is the only thing I have.',
    warm: () => 'That really is the only thing I have, so the first answer was not a guess between several.',
    blunt: () => 'Only one. That is it.',
  },
  /* The price is the fact this line exists to report, so losing it is the one
     degradation that costs something real. What survives is still true and
     still the whole point: it is written down, and Shin cannot call it. The
     number is on the sheet beside this bubble either way. */
  price_only_recorded: {
    deadpan: () => 'Written down. I do not know what this is, so I have nothing to compare it to.',
    warm: () => 'I have written it down. I still do not know what this is, so there is nothing to compare it against yet.',
    blunt: () => 'Written down. No idea what it is, so no call from me.',
  },
  /* The scan log's two fact carriers. What is left when the count is gone is
     the sentence about what the count means, which is the half a reader cannot
     work out for themselves. */
  you_scans_named: {
    deadpan: () => 'That is how often I could say what the thing was. Naming it is not pricing it.',
    warm: () => 'That is how often I could say what the thing was. Naming it is not the same as pricing it.',
    blunt: () => 'How often I knew what it was. Knowing is not pricing.',
  },
  you_scans_dropped: {
    deadpan: () => 'Some scans could not be written down, so the numbers above are missing them.',
    warm: () => 'Some scans did not make it into the log, so the numbers above are missing them.',
    blunt: () => 'Some scans were lost. The numbers above are short.',
  },
  /* The three verdict lines come first because they are the ones that must
     never go quiet. The tier word, the price and the rail are all still on the
     screen when Shin's sentence loses its facts, so the fallback carries the
     call and drops the numbers rather than the other way round. */
  good: {
    deadpan: () => 'That is under the usual.',
    warm: () => 'Good spot. That is under the usual.',
    blunt: () => 'Buy it. Now.',
  },
  fair: {
    deadpan: () => 'That is the going rate.',
    warm: () => 'That is about what it goes for. You are fine.',
    blunt: () => 'Fine. Whatever.',
  },
  walk_away: {
    deadpan: () => 'That is over the usual.',
    warm: () => 'Ooh, that is steep for this one.',
    blunt: () => 'They are robbing you.',
  },
  refuse_category: {
    deadpan: () => 'Not something I price',
    warm: () => 'I skip this kind of thing',
    blunt: () => 'Not this. No.',
  },
  correct_fineprint: {
    deadpan: () => 'Recorded. It counts from now, firmer when a second tag agrees.',
    warm: () => 'That is recorded. It counts from your next scan, and firms up when someone else sees the same price.',
    blunt: () => 'Recorded. Counts now, firmer when a second one agrees.',
  },
  you_weekly: {
    deadpan: () => 'Your week is on file.',
    warm: () => 'I have your week, I just cannot read it back right now.',
    blunt: () => 'Week is there. Cannot read it.',
  },
  /* The good find is what put this key on screen rather than `you_weekly`, so
     it is the one thing the fallback keeps when the counts are gone. */
  you_weekly_proud: {
    deadpan: () => 'You found a good price this week.',
    warm: () => 'You found a good price this week. I have the rest of it, I just cannot read it back.',
    blunt: () => 'Good week. Cannot read the numbers back.',
  },
  /* The coverage block prints its two counts directly above this sentence, so
     the fallback drops the number and keeps the reason. */
  you_coverage_refused: {
    deadpan: () => 'Some of what I know about, I will still refuse on, because the evidence is not enough to call.',
    warm: () => 'There are some I know about and will still refuse on, because what is behind them is not enough to call.',
    blunt: () => 'Some of them I refuse on. Not enough behind them.',
  },
  keep_it_ack: {
    deadpan: () => 'Written down. I still cannot call it.',
    warm: () => 'Written down. I still cannot call it, but it is not lost.',
    blunt: () => 'Written down. Still cannot call it.',
  },
  watching: {
    deadpan: () => 'Saved.',
    warm: () => 'Saved. I have it.',
    blunt: () => 'Saved.',
  },
  watching_feed: {
    deadpan: () => 'Watching this one.',
    warm: () => 'Watching. I will tell you if it drops.',
    blunt: () => 'Watching it.',
  },
  dropped: {
    deadpan: () => 'The price moved.',
    warm: () => 'This one moved since you saved it.',
    blunt: () => 'It moved.',
  },
  watchlist_callback: {
    deadpan: () => 'Something is saved here.',
    warm: () => 'You have something saved here.',
    blunt: () => 'Saved. Details are gone.',
  },
  watchlist_saved_only: {
    deadpan: () => 'Saved, and the details did not survive.',
    warm: () => 'This one is saved, but I have lost what came with it.',
    blunt: () => 'Saved. Nothing else left.',
  },
  pastscans_callback: {
    deadpan: () => 'There is a scan behind this.',
    warm: () => 'You have scanned before. I cannot read the last one back.',
    blunt: () => 'Scanned before. Cannot read it back.',
  },
  cam_second_visit: {
    deadpan: () => 'You have been here before.',
    warm: () => 'Good to see you again.',
    blunt: () => 'Back again.',
  },
};

/**
 * The tables, keyed locale first.
 *
 * LOCALE IS THE OUTER KEY AND THE PERSONALITY IS THE INNER ONE, which is the
 * one structural decision this change had to make and it is not arbitrary.
 * The personality contract is the older and the louder of the two: the file
 * opens on it, three test files assert it, and `say(key, facts, who)` takes it
 * as an argument. Putting the locale outside it leaves every one of those
 * untouched and adds exactly one lookup in front. The other way round would
 * have made every key in the file a three-way branch with a language inside
 * it, which is a table nobody can read and a diff nobody can review.
 *
 * A key missing from the French table falls through to English rather than to
 * an empty bubble. That is a visible defect and not a hidden one: a screen
 * that suddenly speaks English is obvious to the person holding the phone,
 * where silence is not, and test/voice.test.mjs fails on the missing key long
 * before anybody sees it.
 */
const LINES = { en: LINES_EN, fr: LINES_FR };
const BARE = { en: BARE_EN, fr: BARE_FR };

/** The row for a key in the language in force, or the English row behind it. */
function rowFor(table, key) {
  const here = table[locale()] ?? table[DEFAULT_LOCALE];
  return here?.[key] ?? table[DEFAULT_LOCALE][key] ?? null;
}

/**
 * A rendered line that carries a missing fact. A template literal turns an
 * absent value into the word itself, so this is exact rather than a heuristic:
 * no line in this file contains either word, checked.
 */
const MISSING_FACT = /\bundefined\b|\bnull\b|\bNaN\b/;

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
  const row = rowFor(LINES, resolvedKey);
  if (!row) return '';
  const speaker = who && PERSONALITIES.some((p) => p.id === who) ? who : personality();
  const fn = row[speaker] ?? row[DEFAULT_PERSONALITY];
  if (typeof fn !== 'function') return '';
  /* A caller may hand null rather than omitting the argument, and a default
     parameter only fires on undefined. watchlist.js did exactly that and threw
     a TypeError reading a field off null, which is D-021's missing guard
     wearing a different failure. */
  const out = fn(facts ?? {});
  if (!MISSING_FACT.test(out)) return out;
  /* D-021. The broken sentence is a perfectly non-empty string, so nothing
     downstream can tell it from a good one. It is loud in the console and
     quiet on the screen, which is the right way round: the person holding the
     phone did not cause this and cannot fix it. */
  const bare = rowFor(BARE, resolvedKey);
  const spare = bare ? (bare[speaker] ?? bare[DEFAULT_PERSONALITY]) : null;
  console.error(`voice: "${resolvedKey}" spoke without its facts and produced: ${out}`);
  return typeof spare === 'function' ? spare() : '';
}

/** The verdict word for a tier, which is the biggest text on the surface. */
export function wordFor(tierId) {
  return say(`word_${tierId}`) || FALLBACKS[locale()]?.word || FALLBACKS[DEFAULT_LOCALE].word;
}

/**
 * The two words that are printed when the table has nothing.
 *
 * They are in this file rather than in ui-strings.js, which owns the rest of
 * the chrome, because the import would run the other way: ui-strings.js is
 * screen furniture and voice.js may not depend on it. Two strings times two
 * languages is the whole of the duplication and it buys the layering back.
 */
const FALLBACKS = {
  en: { word: 'About right', refused: 'Refused' },
  fr: { word: 'C’est correct', refused: 'Refusé' },
};

/**
 * The heading on a reopened refusal, for one of the eight reasons the engine
 * can return.
 *
 * Shaped like `wordFor` on purpose: a screen hands over a reason code and gets
 * a sentence, and never holds a table of its own. A reason with no key here
 * falls back to the plain word rather than to nothing, because a refusal card
 * with no heading is worse than one that does not say why.
 *
 * `say` returns '' for an unknown key, so a new reason code added to the engine
 * shows "Refused" until it gets three variants here, which is the failure this
 * file wants: quiet on the screen, obvious in the table.
 */
export function refusalLabel(reason) {
  return say(`refusal_label_${reason}`)
    || FALLBACKS[locale()]?.refused
    || FALLBACKS[DEFAULT_LOCALE].refused;
}
