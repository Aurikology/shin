/**
 * Item 20: the on-device kind classifier's routing seam.
 *
 * WHAT THIS FILE OWNS, and what it does not. `classifyKind` is the seam every
 * photo capture is supposed to run through before any paid model call: 20c
 * says produce goes to the produce refusal with the typed-price path, tech
 * goes to the pro tier, packaged goes to the basic tier, and 20d asks for a
 * measurement of routing accuracy and credits saved once that is wired.
 * `camera.js`'s `handlePhotoCapture` calls this first and branches on
 * `routeForKind`'s answer; nothing about that call site changes the day a real
 * model lands here.
 *
 * WHAT IS NOT HERE, reported once rather than hidden behind a try/catch that
 * quietly does nothing. 20a says vendor EfficientNet-Lite0's model file ONLY
 * if it is already in this repo. It is not: the whole tree was searched for a
 * filename containing "efficientnet", "lite0", or the extension ".tflite" and
 * found none (the object-detector model `eye-attach.js` optionally loads,
 * `efficientdet_lite0.tflite`, is a different model doing a different job --
 * finding a box on the shelf, not naming what is in it -- and it is also
 * absent from this repo today, by the same search). Hard rule "no network
 * calls beyond npm install" means it cannot be fetched here either. This is
 * reported as the one thing this pass could not finish.
 *
 * ITS KNOCK-ON EFFECT ON 20b. The plan's "map the 1,000 labels" means the
 * exact label ORDER a specific trained checkpoint's output uses, which ships
 * with that checkpoint's own label file -- two models trained on the same
 * 1,000 ImageNet classes do not promise the same output index for "banana".
 * Typing out a confident index-to-category map with no model and no label
 * file to check it against is exactly the "confidently wrong" failure this
 * repo's priority order puts first (CLAUDE.md, calibration). So `LABEL_WORDS`
 * below keys off the label's own TEXT, not a numeric index: it is a real
 * routing table for anything that already has a label string (every route
 * that already resolves a catalogue product has one), and it becomes the
 * on-device classifier's routing table, unchanged in shape, the day the model
 * and its label file ship together.
 */

export const KIND = Object.freeze({ FRUIT: 'fruit', PACKAGED: 'packaged', TECH: 'tech', OTHER: 'other' });

/*
 * Representative keyword sets, not the plan's 1,000-label index map -- see
 * the file header for why. Each is a substring match against a lower-cased
 * label, which is deliberately loose: "granny smith apple" still contains
 * "apple", "cellular telephone" still contains "phone" once normalised below.
 * Kept short and named rather than exhaustive, so the day the real label file
 * lands, replacing this table is a data change, not a rewrite of the caller.
 */
const FRUIT_WORDS = [
  'banana', 'apple', 'orange', 'lemon', 'lime', 'grape', 'pear', 'peach', 'plum', 'strawberry',
  'pineapple', 'mango', 'melon', 'watermelon', 'fig', 'pomegranate', 'avocado', 'kiwi', 'cherry',
  'apricot', 'blackberry', 'raspberry', 'blueberry', 'cantaloupe', 'custard apple', 'jackfruit',
];
const TECH_WORDS = [
  'laptop', 'notebook computer', 'phone', 'smartphone', 'desktop computer', 'monitor', 'keyboard',
  'mouse', 'joystick', 'remote control', 'camera', 'projector', 'printer', 'modem', 'router',
  'hard disc', 'headset', 'microphone', 'speaker', 'television', 'cassette player', 'cd player',
  'ipod', 'tablet', 'game controller',
];
const PACKAGED_WORDS = [
  'cereal', 'can, tin', ' can', 'carton', 'packet', 'bottle', 'pretzel', 'bagel', 'cracker',
  'chocolate', 'candy', 'pizza', 'cheeseburger', 'hotdog', 'hot dog', 'french loaf', 'consomme',
  'espresso', 'ice cream', 'trifle', 'guacamole',
];

function matches(word, list) {
  return list.some((w) => word.includes(w));
}

/** Text in, one of the four kinds out. Never throws; an unrecognised or empty label is `other`, never a guess. */
export function kindForLabel(label) {
  if (!label || typeof label !== 'string') return KIND.OTHER;
  const w = label.toLowerCase();
  if (matches(w, FRUIT_WORDS)) return KIND.FRUIT;
  if (matches(w, TECH_WORDS)) return KIND.TECH;
  if (matches(w, PACKAGED_WORDS)) return KIND.PACKAGED;
  return KIND.OTHER;
}

/**
 * 20c: runs on the crop before any model call. `runner`, when given, is
 * `(cropBlob) => Promise<string label>` -- the real on-device classifier's
 * eventual shape. With no runner (today, because 20a's model is missing) this
 * always resolves to `other`, which `routeForKind` turns into "call the model
 * exactly as before": a missing classifier degrading to "ask the paid model
 * anyway" rather than to a guessed kind, because a wrong produce/tech split
 * changes which tier a photo call spends money on, and priority 1 (the
 * confidence carries the doubt) rules out guessing a route the same way it
 * rules out guessing a price.
 */
export async function classifyKind(cropBlob, runner = null) {
  if (typeof runner !== 'function') return KIND.OTHER;
  try {
    const label = await runner(cropBlob);
    return kindForLabel(label);
  } catch {
    return KIND.OTHER;
  }
}

/**
 * 20c's tier/route table. `route: 'model_call'` means proceed exactly as the
 * caller already would; `tier` is a hint only, `undefined` meaning "leave the
 * caller's own default alone". `route: 'produce_refusal'` means stop before
 * spending a model call at all.
 */
export function routeForKind(kind) {
  switch (kind) {
    case KIND.FRUIT: return { route: 'produce_refusal', tier: undefined };
    case KIND.TECH: return { route: 'model_call', tier: 'pro' };
    case KIND.PACKAGED: return { route: 'model_call', tier: 'basic' };
    default: return { route: 'model_call', tier: undefined };
  }
}
