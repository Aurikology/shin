// App Store screenshots of the live Pexi app, at Apple's exact pixel sizes, in the order and with the
// frames docs/store/listing.md's caption table names (rewritten 2026-11-24 for build 10+ screens:
// the five-screen welcome, the Type name chip, Settings in place of You).
// Usage: node scripts/appstore-screenshots.cjs iphone|iphone63|ipad [scene ...]   (no scenes = all)
// Output: docs/store/screenshots/<slot>/<nn>-<scene>.png, each checked for Apple's exact pixel size.
// Needs Playwright with Chromium: require('playwright') through NODE_PATH, or a global install.
//
// THE WRITE GUARD. Scenes run on the live server as a device whose id starts "probe-appstore-shots-".
// A shelf price typed on the pad would be saved as a real shopper price (app/src/shopper-contribution.ts)
// and filed by /api/scan-price, so every request is routed through a guard first: the price, asking
// price and shop are stripped from query strings and JSON bodies, and every write that files a price,
// rating or correction is answered locally and never sent. The verdict is still the real one: the
// phone places the typed price on the live answer's own range (camera.js, shopperFor). The run
// prints what the guard stripped and blocked; a request carrying a price it could not strip is
// aborted, and the run fails.
//
// The price typed in frames 1 and 2 is a real shelf price from the live answer, never a made-up one:
// $4.99 is Loblaws Toronto's sale price for Lactantia Butter 454 g seen 2026-11-21 (re-read it with
// a GET of /api/identify?gtin=0066096123306 before recapturing; change PRICE if it has moved).
const path = require('path');
const fs = require('fs');
const os = require('os');
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  const root = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim();
  return require(path.join(root, 'playwright'));
}
const { chromium } = loadPlaywright();
const SHOTS = path.join(__dirname, '..', 'docs', 'store', 'screenshots');
const SLOT_DIR = { iphone: 'iphone-6.9', iphone63: 'iphone-6.3', ipad: 'ipad-13-held' };

const DEVICES = {
  // iPhone 6.9" slot: 1260 x 2736 (420 x 912 at 3x). The app's column is 420 wide, so no side strips.
  iphone: { viewport: { width: 420, height: 912 }, deviceScaleFactor: 3, want: [1260, 2736],
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' },
  // iPhone 6.3" slot (the one App Store Connect shows first): 1206 x 2622 (402 x 874 at 3x).
  iphone63: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, want: [1206, 2622],
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' },
  // iPad 13" slot: 2064 x 2752 (1032 x 1376 at 2x).
  ipad: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, want: [2064, 2752],
    ua: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' },
};
const BASE = 'https://relay.anjiawenda.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRODUCT = { query: 'lactantia salted butter 454g', pick: /^Lactantia Butter 454 g/, price: '4.99' };
const SAVED = [
  PRODUCT,
  { query: 'cheerios', pick: /^Cheerios 570 g/ },
  { query: 'kraft dinner original', pick: /^Kraft Dinner/ },
];

// Store plans for the paywall shot (the in-app purchase review screenshot, not the store set).
const PLANS_FILE = path.join(SHOTS, 'plans.json');

/* ------------------------------------------------------------------ the write guard */

const guardLog = [];
let guardFailed = false;
const PRICE_KEYS = ['shelfPriceCents', 'askingCents', 'priceCents', 'storeName'];
const BLOCK = /\/api\/(scan-price|correction|scan-rating|price-report|offer|review|watch)/;
async function guard(ctx) {
  await ctx.route(BASE + '/api/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET' && BLOCK.test(url)) {
      guardLog.push('blocked ' + new URL(url).pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"stored":false}' });
    }
    const opts = {};
    if (PRICE_KEYS.some((k) => url.includes(k))) {
      const u = new URL(url);
      for (const k of PRICE_KEYS) u.searchParams.delete(k);
      opts.url = u.toString();
      guardLog.push('stripped the price from ' + u.pathname);
    }
    const body = req.postData();
    if (body && PRICE_KEYS.some((k) => body.includes(k))) {
      try {
        const j = JSON.parse(body);
        for (const k of PRICE_KEYS) delete j[k];
        opts.postData = JSON.stringify(j);
        guardLog.push('stripped the price from the body of ' + new URL(url).pathname);
      } catch {
        guardFailed = true;
        guardLog.push('ABORTED, a price it could not strip: ' + new URL(url).pathname);
        return route.abort();
      }
    }
    const out = (opts.url ?? url) + (opts.postData ?? '');
    if (PRICE_KEYS.some((k) => out.includes(k))) {
      guardFailed = true;
      guardLog.push('ABORTED, a price still in ' + new URL(url).pathname);
      return route.abort();
    }
    return route.continue(opts);
  });
}

/* ------------------------------------------------------------------ steps */

async function onboard(page) {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await sleep(3000);
  const agree = page.locator('[data-act="agree-go"]');
  if (await agree.count()) await agree.click();
  for (let i = 0; i < 12; i++) { // the five-screen welcome, then the walkthrough (as scripts/webkit-sweep.mjs)
    const opt = page.locator('#screen .onb-opt:visible').first();
    if (await opt.count()) await opt.click().catch(() => {});
    const c = page.locator('#screen button:visible', { hasText: /Continue|Get started|Start|Allow|OK|Next/ }).first();
    if (!(await c.count())) break;
    await c.click().catch(() => {});
    await sleep(700);
  }
  await sleep(1500);
  const on = await page.evaluate(() => document.querySelector('#screen')?.dataset.screen);
  if (on !== 'camera') throw new Error('setup did not reach the camera (on ' + on + ')');
}

async function search(page, query) {
  await page.locator('[data-act="manual-search"]').click();
  await sleep(800);
  await page.fill('[data-textroute-input]', query);
  await sleep(3500);
}

async function pick(page, item) {
  await search(page, item.query);
  await page.getByRole('button', { name: item.pick }).first().click();
  await sleep(3500);
}

async function verdict(page, item) {
  await pick(page, item);
  for (const k of item.price.replace('.', '')) {
    await page.getByRole('button', { name: k, exact: true }).click({ timeout: 5000 });
    await sleep(200);
  }
  await page.locator('[data-act="pad-confirm"]').click();
  await answered(page);
}

// Wait for the answer itself (its Save button), never a fixed delay: the live answer takes 2 to 10 s.
async function answered(page) {
  await page.locator('[data-act="dist-save"]:visible').first().waitFor({ timeout: 30000 });
  await sleep(1500); // the bell's draw and the mascot settle
}

async function skipped(page, item) {
  await pick(page, item);
  await page.locator('.sheet button:visible', { hasText: /^\s*Skip\s*$/ }).first().click();
  await answered(page);
}

const SCENES = {
  async verdict(page) { await verdict(page, PRODUCT); },
  async chart(page) {
    await verdict(page, PRODUCT);
    await page.getByRole('button', { name: 'Show more' }).first().click().catch(() => {});
    await sleep(2500);
  },
  async search(page) {
    await search(page, 'kraft peanut butter');
    await page.locator('.sheet button:visible', { hasText: /peanut butter/i }).nth(2).waitFor({ timeout: 20000 });
    await sleep(800);
  },
  async ranges(page) {
    await page.getByRole('button', { name: 'Close the camera' }).click(); await sleep(1500);
    await page.getByRole('button', { name: 'Settings', exact: true }).click(); await sleep(2000);
    await page.locator('.setting', { hasText: 'Set your price ranges' }).first().scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('.setting')].find((e) => /Set your price ranges/.test(e.textContent));
      el?.scrollIntoView({ block: 'center' });
    });
    await sleep(1200);
  },
  async saved(page) {
    for (const item of SAVED) {
      // The butter at its real sale price (PRODUCT), so the list shows one under the usual; the rest skip the pad.
      if (item.price) await verdict(page, item); else await skipped(page, item);
      // A DOM click: a pointer click lands on the sheet's hit layer while the bell animates.
      const label = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('[data-act="dist-save"], [data-act="range-save"]')].find((e) => e.offsetParent);
        btn?.click();
        return btn ? btn.textContent.trim() : null;
      });
      if (!label) throw new Error('no Save button on the answer for ' + item.query);
      await page.waitForFunction((before) => {
        const btn = [...document.querySelectorAll('[data-act="dist-save"], [data-act="range-save"]')].find((e) => e.offsetParent);
        return !btn || btn.textContent.trim() !== before;
      }, label, { timeout: 5000 }).catch(() => { throw new Error('Save it did not change for ' + item.query); });
      await sleep(1200);
      await page.goto(BASE + '/', { waitUntil: 'load' }); await sleep(2500);
    }
    await page.getByRole('button', { name: 'Close the camera' }).click(); await sleep(1500);
    await page.getByRole('button', { name: 'Saved items', exact: true }).click(); await sleep(2500);
  },
  async paywall(page) {
    const plans = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8'));
    await page.addInitScript((plans) => {
      // Stand-in for the native store plugin, answering with the plans exactly as App Store Connect lists them.
      const pkgs = plans.map((p) => ({ identifier: p.slot, packageType: p.slot.toUpperCase(), product: p.product }));
      const offering = { identifier: 'default', availablePackages: pkgs };
      for (const p of pkgs) offering[p.identifier] = p;
      const Purchases = {
        configure: async () => ({}), setLogLevel: async () => ({}), logIn: async () => ({}),
        getOfferings: async () => ({ all: { default: offering }, current: offering }),
        getCustomerInfo: async () => ({ customerInfo: { entitlements: { active: {} } } }),
        addCustomerInfoUpdateListener: async () => 'x', isConfigured: async () => ({ isConfigured: true }),
      };
      window.SHIN_RC_KEYS = { ios: 'screenshot-stand-in' };
      window.Capacitor = {
        getPlatform: () => 'ios', isNativePlatform: () => true, isPluginAvailable: (n) => n === 'Purchases',
        Plugins: { Purchases }, registerPlugin: (n) => (n === 'Purchases' ? Purchases : {}),
      };
    }, plans);
    await page.goto(BASE + '/?s=paywall', { waitUntil: 'load' });
    await sleep(4000);
  },
};
// Store order = the caption table in docs/store/listing.md; the paywall is the purchase review shot.
const ORDER = ['verdict', 'chart', 'search', 'ranges', 'saved', 'paywall'];

(async () => {
  const [device, ...wanted] = process.argv.slice(2);
  const d = DEVICES[device];
  if (!d) { console.error('usage: node scripts/appstore-screenshots.cjs iphone|iphone63|ipad [scene ...]'); process.exit(2); }
  const scenes = wanted.length ? wanted : ORDER;
  const outDir = path.join(SHOTS, SLOT_DIR[device]);
  fs.mkdirSync(outDir, { recursive: true });
  let failed = 0;
  for (const name of scenes) {
    // A fresh profile per scene, so the saved list holds only what its scene saved.
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pexi-appstore-shots-'));
    const ctx = await chromium.launchPersistentContext(profile, {
      viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true,
      userAgent: d.ua, locale: 'en-CA', timezoneId: 'America/Toronto',
    });
    await ctx.addInitScript(() => {
      try {
        if (!localStorage.getItem('shin.deviceId')) localStorage.setItem('shin.deviceId', 'probe-appstore-shots-' + crypto.randomUUID());
      } catch {}
    });
    await guard(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(name, 'pageerror:', String(e).slice(0, 200)));
    try {
      if (name !== 'paywall') await onboard(page);
      await SCENES[name](page);
      const file = path.join(outDir, String(ORDER.indexOf(name) + 1).padStart(2, '0') + '-' + name + '.png');
      await page.screenshot({ path: file });
      // Check the pixel size Apple will see, from the PNG header itself.
      const buf = fs.readFileSync(file);
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      const ok = w === d.want[0] && h === d.want[1];
      if (!ok) failed++;
      console.log((ok ? 'OK  ' : 'BAD ') + file + ' ' + w + 'x' + h);
    } catch (e) {
      failed++;
      console.log('FAIL', name, String(e).slice(0, 300));
    }
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  console.log('guard: ' + (guardLog.length ? [...new Set(guardLog)].join('; ') : 'nothing to strip or block'));
  if (guardFailed) { console.error('the write guard aborted a request carrying a price'); failed++; }
  if (failed) { console.error(failed + ' scene(s) failed'); process.exit(1); }
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
