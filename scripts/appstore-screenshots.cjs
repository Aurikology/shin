// App Store screenshots of the live Pexi app, at Apple's exact pixel sizes.
// Usage: node scripts/appstore-screenshots.cjs iphone|ipad [scene ...]   (no scenes = all)
// Output: docs/store/screenshots/<slot>/<nn>-<scene>.png, each checked for Apple's exact pixel size.
// Needs Playwright with Chromium (a global install is found through `npm root -g`).
// Scenes run on the live server as a device whose id starts "probe-appstore-shots-". A scene never
// types a shelf price: a typed price is a real witness in the live data, so answers use Skip.
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

// Store plans for the paywall shot, copied from App Store Connect (names and Canadian prices).
const PLANS_FILE = path.join(SHOTS, 'plans.json');

async function clickText(page, re) {
  const ok = await page.evaluate((src) => {
    const re = new RegExp(src);
    const b = [...document.querySelectorAll('button, a, [role=button]')].find((e) => e.offsetParent && re.test(e.innerText.trim()));
    if (!b) return false;
    b.click();
    return true;
  }, re.source);
  if (!ok) throw new Error('no visible button matching ' + re);
}

async function onboard(page) {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await sleep(3000);
  if (!/s=agree|s=permissions|s=consent/.test(page.url()) && !(await page.$('input[type=checkbox]'))) return;
  await page.evaluate(() => {
    document.querySelector('input[type=checkbox]')?.click();
    document.querySelectorAll('input[type=radio]')[0]?.click();
  });
  await sleep(400);
  await clickText(page, /^Continue$/); await sleep(2500);
  await clickText(page, /^Continue$/); await sleep(2500);
  await clickText(page, /^Continue$/); await sleep(3000);
}

async function search(page, query) {
  await page.click('[aria-label="Manual Search"]');
  await sleep(800);
  const inp = page.locator('input:visible').first();
  await inp.fill(query);
  await sleep(3000);
}

async function answer(page, query, pick) {
  await search(page, query);
  await clickText(page, new RegExp('^' + pick));
  await sleep(3000);
  await clickText(page, /^Skip$/);
  await sleep(9000);
}

const SCENES = {
  async camera(page) { await sleep(1500); },
  async cheerios(page) { await answer(page, 'cheerios', 'Cheerios 570 g'); },
  async butterlist(page) {
    await answer(page, 'lactantia salted butter 454g', 'Lactantia Butter 454 g');
    // Pull the sheet up to show the shop-by-shop list.
    await clickText(page, /^Show more$/).catch(async () => {
      await page.evaluate(() => document.querySelector('[aria-label="Show more"]')?.click());
    });
    await sleep(2500);
  },
  async search(page) { await search(page, 'peanut butter'); },
  async you(page) { await clickText(page, /^You$/); await sleep(3000); },
  async paywall(page, ctxInfo) {
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
const ORDER = ['camera', 'cheerios', 'butterlist', 'search', 'you', 'paywall'];

(async () => {
  const [device, ...wanted] = process.argv.slice(2);
  const d = DEVICES[device];
  if (!d) { console.error('usage: node capture.cjs iphone|ipad [scene ...]'); process.exit(2); }
  const scenes = wanted.length ? wanted : ORDER;
  const outDir = path.join(SHOTS, SLOT_DIR[device]);
  fs.mkdirSync(outDir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'pexi-appstore-shots-profile-' + device), {
    viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true,
    userAgent: d.ua, locale: 'en-CA', timezoneId: 'America/Toronto',
  });
  await ctx.addInitScript(() => {
    try {
      if (!localStorage.getItem('shin.deviceId')) localStorage.setItem('shin.deviceId', 'probe-appstore-shots-' + crypto.randomUUID());
    } catch {}
  });
  let failed = 0;
  for (const name of scenes) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(name, 'pageerror:', String(e).slice(0, 200)));
    try {
      if (name !== 'paywall') { await onboard(page); }
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
    await page.close();
  }
  await ctx.close();
  if (failed) { console.error(failed + ' scene(s) failed'); process.exit(1); }
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
