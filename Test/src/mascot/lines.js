// The mascot's voice. LINES[key][personality]. Every key has all three personalities or the
// state does not ship. No screen writes its own string. Templates use {tag} {going} {name}
// {seller} {step}; line() substitutes them.
//
// Hard rule: the aggression points at the price, the store, or the brand. Never at the user.
// Deadpan repeats the number and nothing else. Warm is kind and brief. Blunt is short and aims
// at the price or the store.
//
// Seed lines from the project's existing contract, keep them verbatim where a key matches:
//   picker      deadpan "Two dollars. It's $1.47."  warm "Ooh, that's steep. I'd wait."  blunt "They're robbing you."
//   picked      deadpan "Deadpan it is."  warm "Good pick. I will be gentle."  blunt "Good. Let's go."
//   primer      deadpan "I need the camera to read the thing."  warm "I need the camera to read the thing. That is all it is for."  blunt "Camera. For the thing. Nothing else."
//   denied      deadpan "No camera then. Demo shelf."  warm "No camera then. That is fine, I brought a shelf."  blunt "Fine. Fake shelf then."
//   aim         deadpan "Point at the thing."  warm "Point at the thing and I will do the rest."  blunt "Thing. Point."
//   escalated   deadpan "Nothing caught. Fill the frame with it and tap."  warm "Nothing caught yet? Fill the frame with it, then tap the button."  blunt "Fill the frame. Tap."
//   identifying deadpan "Reading it"  warm "Let me have a look"  blunt "Hang on"
//   chip        deadpan "{name}."  warm "{name}. That right?"  blunt "{name}. Right one?"
//   wrong       deadpan "Which one is it?"  warm "Point me at the right one."  blunt "Which one."
//   step1       deadpan "Identifying it"  warm "Working out what this is"  blunt "Figuring out what it is"
//   step2       deadpan "Looking for prices"  warm "Off to find some prices"  blunt "Hunting prices"
//   step3       deadpan "Checking the sellers"  warm "Checking who has it"  blunt "Checking who sells it"
//   slow        deadpan "Still on it."  warm "Still on it, sorry."  blunt "Slow one."
//   good        deadpan "{going} usually. This is {tag}."  warm "Good spot. That is under what it usually goes for."  blunt "Take it before they notice."
//   delighted   deadpan "Nobody else is near that."  warm "Oh, that is a proper find. Nobody else is close."  blunt "Somebody in that store made a mistake. Enjoy it."
//   fair        deadpan "That is the going rate, {going}."  warm "That is about what it goes for. You are fine."  blunt "Fine. Whatever."
//   walk        deadpan "{tag}. It is {going}."  warm "Ooh, that is steep. It usually goes for less."  blunt "They are robbing you."
//   angry       deadpan "Nobody else charges that."  warm "No. That is not a price, that is a hope."  blunt "That is a robbery with a barcode on it."
//   good_thin   deadpan "One seller says {going}. That is all I have."  warm "I only found one seller, so take this lightly."  blunt "One seller. Thin, but there it is."
//   fair_thin   same shape as good_thin
//   walk_thin   same shape as good_thin
//   refuse      deadpan "Not in my book."  warm "I do not have this one yet."  blunt "Not in my book. Not guessing."
//   refuse_why  deadpan "{step} came up empty."  warm "{step} came up empty, so I will not guess."  blunt "{step} came up empty."
//   typeit      deadpan "Type it. I will look."  warm "Type the name and I will look it up."  blunt "Type it."
//   typed       deadpan "Noted."  warm "Got it. I will look."  blunt "Noted."
//   watched     deadpan "Watching it."  warm "On my list. I will tell you if it moves."  blunt "Watching."
//   poke1       deadpan "Yes?"  warm "Hi. Point me at something."  blunt "What."
//   poke2       deadpan "Still here."  warm "Ready when you are."  blunt "Tap the button."
//   poke3       deadpan "That is my face."  warm "Careful, that is my face."  blunt "Oi. Face."
//
// Also required, one per state, for any screen that shows the bare state:
//   idle thinking asking pleased nudging asleep proud unknown
//
// TODO(agent): write LINES with every key above, all three personalities, and export line().

export const LINES = {
  picker: {
    deadpan: "Two dollars. It's $1.47.",
    warm: "Ooh, that's steep. I'd wait.",
    blunt: "They're robbing you.",
  },
  picked: {
    deadpan: 'Deadpan it is.',
    warm: 'Good pick. I will be gentle.',
    blunt: "Good. Let's go.",
  },
  primer: {
    deadpan: 'I need the camera to read the thing.',
    warm: 'I need the camera to read the thing. That is all it is for.',
    blunt: 'Camera. For the thing. Nothing else.',
  },
  denied: {
    deadpan: 'No camera then. Demo shelf.',
    warm: 'No camera then. That is fine, I brought a shelf.',
    blunt: 'Fine. Fake shelf then.',
  },
  aim: {
    deadpan: 'Point at the thing.',
    warm: 'Point at the thing and I will do the rest.',
    blunt: 'Thing. Point.',
  },
  escalated: {
    deadpan: 'Nothing caught. Fill the frame with it and tap.',
    warm: 'Nothing caught yet? Fill the frame with it, then tap the button.',
    blunt: 'Fill the frame. Tap.',
  },
  identifying: {
    deadpan: 'Reading it',
    warm: 'Let me have a look',
    blunt: 'Hang on',
  },
  chip: {
    deadpan: '{name}.',
    warm: '{name}. That right?',
    blunt: '{name}. Right one?',
  },
  wrong: {
    deadpan: 'Which one is it?',
    warm: 'Point me at the right one.',
    blunt: 'Which one.',
  },
  step1: {
    deadpan: 'Identifying it',
    warm: 'Working out what this is',
    blunt: 'Figuring out what it is',
  },
  step2: {
    deadpan: 'Looking for prices',
    warm: 'Off to find some prices',
    blunt: 'Hunting prices',
  },
  step3: {
    deadpan: 'Checking the sellers',
    warm: 'Checking who has it',
    blunt: 'Checking who sells it',
  },
  slow: {
    deadpan: 'Still on it.',
    warm: 'Still on it, sorry.',
    blunt: 'Slow one.',
  },
  good: {
    deadpan: '{going} usually. This is {tag}.',
    warm: 'Good spot. That is under what it usually goes for.',
    blunt: 'Take it before they notice.',
  },
  delighted: {
    deadpan: 'Nobody else is near that.',
    warm: 'Oh, that is a proper find. Nobody else is close.',
    blunt: 'Somebody in that store made a mistake. Enjoy it.',
  },
  fair: {
    deadpan: 'That is the going rate, {going}.',
    warm: 'That is about what it goes for. You are fine.',
    blunt: 'Fine. Whatever.',
  },
  walk: {
    deadpan: '{tag}. It is {going}.',
    warm: 'Ooh, that is steep. It usually goes for less.',
    blunt: 'They are robbing you.',
  },
  angry: {
    deadpan: 'Nobody else charges that.',
    warm: 'No. That is not a price, that is a hope.',
    blunt: 'That is a robbery with a barcode on it.',
  },
  good_thin: {
    deadpan: 'One seller says {going}. That is all I have.',
    warm: 'I only found one seller, so take this lightly.',
    blunt: 'One seller. Thin, but there it is.',
  },
  fair_thin: {
    deadpan: 'One seller says {going}. Call it fair, thin data.',
    warm: 'Only one seller, but it looks about right.',
    blunt: 'One seller. Call it fair.',
  },
  walk_thin: {
    deadpan: 'One seller says {going}. That looks steep.',
    warm: 'Only one seller, but that looks steep to me.',
    blunt: 'One seller. Still looks steep.',
  },
  refuse: {
    deadpan: 'Not in my book.',
    warm: 'I do not have this one yet.',
    blunt: 'Not in my book. Not guessing.',
  },
  refuse_why: {
    deadpan: '{step} came up empty.',
    warm: '{step} came up empty, so I will not guess.',
    blunt: '{step} came up empty.',
  },
  typeit: {
    deadpan: 'Type it. I will look.',
    warm: 'Type the name and I will look it up.',
    blunt: 'Type it.',
  },
  typed: {
    deadpan: 'Noted.',
    warm: 'Got it. I will look.',
    blunt: 'Noted.',
  },
  watched: {
    deadpan: 'Watching it.',
    warm: 'On my list. I will tell you if it moves.',
    blunt: 'Watching.',
  },
  poke1: {
    deadpan: 'Yes?',
    warm: 'Hi. Point me at something.',
    blunt: 'What.',
  },
  poke2: {
    deadpan: 'Still here.',
    warm: 'Ready when you are.',
    blunt: 'Tap the button.',
  },
  poke3: {
    deadpan: 'That is my face.',
    warm: 'Careful, that is my face.',
    blunt: 'Oi. Face.',
  },

  // Bare states, for any screen that shows the mascot with no other line above it.
  idle: {
    deadpan: 'Ready. Point and tap.',
    warm: 'Ready when you are.',
    blunt: 'Point. Tap.',
  },
  thinking: {
    deadpan: 'Working.',
    warm: 'One moment.',
    blunt: 'Working on it.',
  },
  asking: {
    deadpan: 'Need the name.',
    warm: 'I just need the name.',
    blunt: 'Name. What is it.',
  },
  pleased: {
    deadpan: 'Got it.',
    warm: 'Nice one.',
    blunt: 'Good.',
  },
  nudging: {
    deadpan: 'It moved. {going} now.',
    warm: 'Heads up, it moved to {going}.',
    blunt: 'It moved. {going}.',
  },
  asleep: {
    deadpan: 'Nothing yet.',
    warm: 'Nothing to show yet.',
    blunt: 'Nothing yet.',
  },
  proud: {
    deadpan: 'Somebody else saw that price too.',
    warm: 'Somebody else spotted that price too.',
    blunt: 'Confirmed. Somebody else saw it.',
  },
  unknown: {
    deadpan: 'Not guessing.',
    warm: 'I will not guess on this one.',
    blunt: 'Not guessing.',
  },
}

export function line(key, personality, vars = {}) {
  const cell = LINES[key]?.[personality]
  if (cell === undefined) throw new Error(`missing line ${key}/${personality}`)
  return cell.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])))
}
