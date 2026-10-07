/**
 * Pexi Plus purchases, through RevenueCat's native plugin (2026-09-21,
 * docs/mvp-plan.md "Subscription").
 *
 * HOW THE PLUGIN IS REACHED WITHOUT A BUNDLER. This app is plain ES modules
 * served as they are, so `import { Purchases } from '@revenuecat/purchases-capacitor'`
 * cannot resolve here. Inside the wrapper, native/scripts/sync-web.mjs puts
 * Capacitor's own browser build (`@capacitor/core/dist/capacitor.js`) in front
 * of main.js, which gives `window.Capacitor.registerPlugin`. RevenueCat's JS
 * package is a thin wrapper over `registerPlugin('Purchases')` with the same
 * method names and the same argument objects, so registering it here reaches
 * the same native code.
 *
 * IN A PLAIN BROWSER there is no native plugin and nothing to buy with:
 * `purchasesPlugin()` answers null and the subscription screen says
 * "Subscribe in the app" instead of failing.
 *
 * THE APP USER ID IS THE DEVICE ID (device.js), the same one every API call
 * carries, so the server can look the subscription up for the device that is
 * asking to skip the limit.
 *
 * THE KEYS are RevenueCat's public SDK keys, one per store, set on
 * `window.SHIN_RC_KEYS = { ios, android }` by sync-web.mjs from
 * native/config/revenuecat.config.json (gitignored; the committed file is the
 * .example beside it). Public SDK keys are meant to ship inside an app; they
 * are kept out of git anyway so nobody copies a real one into a test.
 *
 * Every function takes `win` so a test can hand it a fake window.
 */

import { getDeviceId } from './device.js';
import { PLUS } from './plus-config.js';
import { readSetting, writeSetting } from './lib/persistence.js';

const PLUS_KEY = 'shin.plus';

/** 'ios', 'android' or 'web'. Anything Capacitor does not report as a store platform is the web. */
export function platformOf(win = globalThis.window) {
  const cap = win?.Capacitor;
  const p = typeof cap?.getPlatform === 'function' ? cap.getPlatform() : 'web';
  return p === 'ios' || p === 'android' ? p : 'web';
}

/** The native Purchases plugin, or null in a browser or a wrapper built without it. */
export function purchasesPlugin(win = globalThis.window) {
  const cap = win?.Capacitor;
  if (!cap || platformOf(win) === 'web') return null;
  if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable('Purchases')) return null;
  if (cap.Plugins?.Purchases) return cap.Plugins.Purchases;
  if (typeof cap.registerPlugin === 'function') return cap.registerPlugin('Purchases');
  return null;
}

/** Whether this device's Plus entitlement was last seen active. Read on every API call. */
export function plusActive() {
  return readSetting(PLUS_KEY, '') === '1';
}

function rememberPlus(on) {
  writeSetting(PLUS_KEY, on ? '1' : '0');
  return on;
}

/** Whether a RevenueCat CustomerInfo holds the active `plus` entitlement. */
export function entitlementActive(customerInfo) {
  return Boolean(customerInfo?.entitlements?.active?.[PLUS.entitlement]);
}

let configured = null;

/**
 * Configures RevenueCat once per page, and answers the plugin, or null when
 * there is no store here (a browser) or no key for this platform. A failed
 * configure is not cached, so the next screen open tries again.
 */
export function ensureConfigured(win = globalThis.window) {
  const plugin = purchasesPlugin(win);
  if (!plugin) return Promise.resolve(null);
  const key = win?.SHIN_RC_KEYS?.[platformOf(win)];
  if (typeof key !== 'string' || key.trim() === '') return Promise.resolve(null);
  if (!configured) {
    configured = Promise.resolve(plugin.configure({ apiKey: key.trim(), appUserID: getDeviceId().id }))
      .then(() => plugin)
      .catch((err) => {
        configured = null;
        throw err;
      });
  }
  return configured;
}

/** For tests: forget the configured plugin. */
export function resetPurchasesForTests() {
  configured = null;
}

/**
 * The two plans, with the store's own price strings, or why there are none.
 *
 *   { store: false }                    no store here: say "Subscribe in the app"
 *   { store: true, plans: [] }          the store answered with nothing to sell
 *   { store: true, plans: [{ id, priceString, pkg }, ...] }
 *
 * Throws when the store could not be reached; the screen offers Try again.
 * The offering is `PLUS.offering` ("default"), falling back to the current
 * one. A package is matched by product id first (Android ids carry a base
 * plan after a colon, `shin_plus_monthly:monthly`), then by RevenueCat's own
 * monthly/annual slot. A package with no price string is left out rather than
 * drawn with a blank price.
 */
export async function loadPlans(win = globalThis.window) {
  const plugin = await ensureConfigured(win);
  if (!plugin) return { store: false, plans: [] };
  const offerings = await plugin.getOfferings();
  const offering = offerings?.all?.[PLUS.offering] ?? offerings?.current ?? null;
  const pkgs = Array.isArray(offering?.availablePackages) ? offering.availablePackages : [];
  const byProduct = (id) => pkgs.find((p) => {
    const pid = p?.product?.identifier;
    return typeof pid === 'string' && (pid === id || pid.startsWith(`${id}:`));
  });
  const plans = [];
  for (const [id, productId, slot] of [['monthly', PLUS.products.monthly, 'monthly'], ['yearly', PLUS.products.yearly, 'annual']]) {
    const pkg = byProduct(productId) ?? offering?.[slot] ?? null;
    const priceString = pkg?.product?.priceString;
    if (typeof priceString === 'string' && priceString.trim() !== '') plans.push({ id, priceString: priceString.trim(), pkg });
  }
  return { store: true, plans };
}

function cancelled(err) {
  return err?.userCancelled === true || err?.code === '1' || err?.code === 1;
}

/** Buys one plan. `{ plus, cancelled }`; any other failure throws. */
export async function subscribe(pkg, win = globalThis.window) {
  const plugin = await ensureConfigured(win);
  if (!plugin) return { plus: false, cancelled: false, store: false };
  try {
    const out = await plugin.purchasePackage({ aPackage: pkg });
    return { plus: rememberPlus(entitlementActive(out?.customerInfo)), cancelled: false, store: true };
  } catch (err) {
    if (cancelled(err)) return { plus: plusActive(), cancelled: true, store: true };
    throw err;
  }
}

/** Restore purchases. `{ plus }`: whether the store found an active Plus for this account. */
export async function restore(win = globalThis.window) {
  const plugin = await ensureConfigured(win);
  if (!plugin) return { plus: false, store: false };
  const out = await plugin.restorePurchases();
  return { plus: rememberPlus(entitlementActive(out?.customerInfo)), store: true };
}

/**
 * At launch, inside the wrapper only: asks the store whether Plus is active
 * and remembers the answer, so an expiry or a refund is seen without the
 * person opening anything. Never throws; no store means nothing changes.
 */
export async function refreshPlus(win = globalThis.window) {
  try {
    const plugin = await ensureConfigured(win);
    if (!plugin) return plusActive();
    const out = await plugin.getCustomerInfo();
    return rememberPlus(entitlementActive(out?.customerInfo));
  } catch {
    return plusActive();
  }
}
