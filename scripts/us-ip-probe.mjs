#!/usr/bin/env node
/**
 * One-off probe, run from a US cloud machine (.github/workflows/us-ip-probe.yml, manual trigger only):
 * do US retailers answer a barcode search with a price when the request comes from a US data-centre
 * address? Decides where Pexi's US price collectors can run (decide-log 2026-11-22). Read-only: a few
 * searches per site, spaced out; nothing is stored but this run's printout and screenshots.
 *
 * Two passes per site: a plain request (fetch with a browser User-Agent) and a real Chromium page.
 * For each it prints the HTTP status, whether the page looks like a bot block, the page title and the
 * first dollar amounts on the page. A price here is evidence only; nobody reads it as data.
 *
 * Playwright is not a repo dependency: PLAYWRIGHT_DIR=<folder with node_modules/playwright>.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const UPCS = ['049000028911', '016000275287', '013000006408', '037600105095'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const OUT = process.env.PROBE_OUT || 'probe-out';
mkdirSync(OUT, { recursive: true });

/** Kroger's site search takes "00" plus the UPC without its check digit (tested 2026-11-22). */
const krogerCode = (upc) => `00${upc.slice(0, 11)}`;
const SITES = [
  { name: 'target', url: (u) => `https://www.target.com/s?searchTerm=${u}` },
  { name: 'walmart', url: (u) => `https://www.walmart.com/search?q=${u}` },
  { name: 'kroger', url: (u) => `https://www.kroger.com/search?query=${krogerCode(u)}` },
  { name: 'amazon', url: (u) => `https://www.amazon.com/s?k=${u}` },
  { name: 'dollargeneral', url: (u) => `https://www.dollargeneral.com/search?q=${u}` },
];
const BLOCK = /robot or human|access denied|are you a human|captcha|px-captcha|blocked|unusual traffic|request unsuccessful|pardon our interruption/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dollars = (text) => [...new Set((text.match(/\$\s?\d{1,3}(?:,\d{3})*\.\d{2}/g) || []))].slice(0, 5).join(' ');
const line = (o) => console.log(JSON.stringify(o));

try {
  const ip = await fetch('https://ipinfo.io/json', { headers: { 'user-agent': UA } }).then((r) => r.json());
  line({ probe: 'origin', country: ip.country, region: ip.region, org: ip.org });
} catch (e) {
  line({ probe: 'origin', error: String(e) });
}

for (const site of SITES) {
  for (const upc of UPCS.slice(0, 2)) {
    try {
      const r = await fetch(site.url(upc), { headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow' });
      const body = await r.text();
      const title = (body.match(/<title[^>]*>([^<]*)/i) || [])[1] || '';
      line({ pass: 'plain', site: site.name, upc, status: r.status, finalUrl: r.url.slice(0, 80), blocked: BLOCK.test(title + body.slice(0, 4000)) || /blocked/.test(r.url), title: title.trim().slice(0, 80), bytes: body.length, dollars: dollars(body) });
    } catch (e) {
      line({ pass: 'plain', site: site.name, upc, error: String(e).slice(0, 120) });
    }
    await sleep(3000);
  }
}

const pwDir = process.env.PLAYWRIGHT_DIR;
if (!pwDir || !existsSync(join(pwDir, 'node_modules', 'playwright'))) {
  line({ pass: 'browser', error: 'PLAYWRIGHT_DIR not set; browser pass skipped' });
  process.exit(0);
}
const { chromium } = await import(pathToFileURL(join(pwDir, 'node_modules', 'playwright', 'index.mjs')).href);
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1280, height: 900 } });
for (const site of SITES) {
  for (const upc of UPCS) {
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(site.url(upc), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(8000);
      const text = await page.evaluate(() => document.body?.innerText || '');
      const title = await page.title();
      await page.screenshot({ path: join(OUT, `${site.name}-${upc}.png`) });
      line({ pass: 'browser', site: site.name, upc, status: resp?.status() ?? null, url: page.url().slice(0, 80), blocked: BLOCK.test(title + text.slice(0, 3000)), title: title.slice(0, 80), dollars: dollars(text) });
    } catch (e) {
      line({ pass: 'browser', site: site.name, upc, error: String(e).slice(0, 120) });
    } finally {
      await page.close();
    }
    await sleep(4000);
  }
}
await browser.close();
