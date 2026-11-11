/**
 * Choosing: the start state of a run, and each step, from a seeded random source.
 *
 * COVERAGE-GUIDED. `tried` counts, across the whole crawl, how often each (screen, element) has been
 * acted on. An element's weight falls as its count rises, so the crawl keeps going to things it has
 * not tried. A new run does not start from zero: it inherits the counts of every run before it.
 */
import { keyOf } from './world.mjs';
import { realFlags } from './world.mjs';
import { planFaults } from './routes.mjs';
import { BARCODES, NAMES, PRICES, PAD_PRICES, NUMBERS } from './data.mjs';

/** Screens a run may open on by URL, as the app's own deep links do. Resolved at start from the router. */
export const URL_SCREENS = ['camera', 'you', 'pastscans', 'watchlist', 'savings', 'paywall', 'licences', 'removed', 'share', 'correct', 'market', 'setup', 'onboarding', 'permissions', 'consent', 'agree', 'nonexistent'];

/** A start state, drawn from the seed's stream. */
export async function chooseStart(rng) {
  const base = await realFlags();
  const flags = {};
  for (const k of Object.keys(base)) flags[k] = rng.chance(0.5);
  const lang = rng.chance(0.3) ? 'fr' : 'en';
  // French needs the language flag on or the locale is pinned to English: keep the pair honest.
  if (lang === 'fr') flags.languages = true;
  const first = rng.chance(0.35);
  return {
    first,
    consent: { photos: rng.chance(0.5), location: rng.chance(0.5) },
    claude: rng.chance(0.7),
    plus: rng.chance(0.3),
    flags,
    lang,
    clockDays: rng.pick([0, 0, 8, 100]),
    search: rng.chance(0.3) ? `?s=${rng.pick(URL_SCREENS)}` : '',
    faults: planFaults(rng),
    // Drawn last so the older draws keep their values: developer switches (the pack read is a developer-phone feature).
    packRead: rng.chance(0.4),
    dev: rng.chance(0.3),
  };
}

const weightFor = (tries) => 1 / (1 + tries) ** 2;

/**
 * The step chooser for one run. `tried` is shared by the whole crawl (or the whole worker).
 */
export function makeChooser(rng, tried) {
  const bump = (k) => tried.set(k, (tried.get(k) ?? 0) + 1);
  const tries = (k) => tried.get(k) ?? 0;
  let prevTap = null;

  return async function choose({ app, actions }) {
    const screen = app.screen ?? 'none';
    const cands = [];
    const add = (step, tkey, w) => cands.push({ step, tkey, w });

    const seenKeys = new Map();
    for (const el of actions) {
      if (el.hasAttribute('data-pad')) continue; // pad digits are typed by the price step, not tapped one by one
      const key = keyOf(el);
      const tag = el.localName;
      const type = (el.getAttribute('type') ?? '').toLowerCase();
      const tkey = `${screen}/${app.state ?? ''}/${key}`;
      const nth = seenKeys.get(key) ?? 0;
      seenKeys.set(key, nth + 1);
      if (tag === 'textarea' || (tag === 'input' && /^(text|search|number|email|tel|url|password|)$/.test(type))) {
        const pool = type === 'number' ? [...NUMBERS, ...PRICES] : (rng.chance(0.25) ? PRICES : NAMES);
        add({ k: 'type', key, nth, text: rng.pick(pool), enter: rng.chance(0.35) }, tkey, weightFor(tries(tkey)) * 1.5);
      } else if (tag === 'input' && type === 'range') {
        add({ k: 'slider', key, nth, frac: rng.pick([0, 0.25, 0.5, 1]) }, tkey, weightFor(tries(tkey)));
      } else {
        add({ k: 'tap', key, nth }, tkey, weightFor(tries(tkey)) * (prevTap === key ? 0.4 : 1) * (key.includes('|pad-confirm|') ? 4 : 1));
      }
    }
    if (app.cam && app.hub.handlers) {
      for (const b of BARCODES) {
        const tkey = `${screen}/ready/${b.kind}`;
        add({ k: 'ready', code: b.code }, `${tkey}/${b.code}`, weightFor(tries(`${tkey}/${b.code}`)) * 0.7);
      }
      for (const b of BARCODES) {
        const hk = `${screen}/hold/${b.code}`;
        add({ k: 'hold', code: b.code }, hk, weightFor(tries(hk)) * 0.4);
      }
      for (const key of [null, 'hold', 'glare', 'closer', 'pick', 'centre_left', 'centre_right', 'centre_up', 'centre_down', 'dark']) {
        const ck = `${screen}/coach/${key}`;
        add({ k: 'coach', key }, ck, weightFor(tries(ck)) * 0.12);
      }
      for (const b of BARCODES) {
        const uk = `${screen}/unreadable/${b.code}`;
        add({ k: 'unreadable', code: b.code }, uk, weightFor(tries(uk)) * 0.15);
      }
      add({ k: 'torchEvent', on: true }, `${screen}/torchEvent/on`, 0.1);
      add({ k: 'torchEvent', on: false }, `${screen}/torchEvent/off`, 0.1);
      add({ k: 'lost' }, `${screen}/lost`, 0.1);
    }
    if (app.root.querySelector('[data-pad]')) {
      const text = rng.pick(PAD_PRICES);
      add({ k: 'price', text }, `${screen}/price`, 1.2);
    }
    add({ k: 'back' }, 'back', 0.35);
    add({ k: 'wait' }, 'wait', 0.12);

    const picked = rng.weighted(cands, cands.map((c) => c.w));
    bump(picked.tkey);
    prevTap = picked.step.k === 'tap' ? picked.step.key : null;
    return picked.step;
  };
}
