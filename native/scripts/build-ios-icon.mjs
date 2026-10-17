/**
 * ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png, the one
 * 1024x1024 icon Apple asks for, rendered from app/public/icon.svg.
 *
 * Why this exists: `cap add ios` writes Capacitor's own placeholder into that
 * slot, and the placeholder is what a tester sees on the home screen and what
 * App Store Connect shows beside the build. The web icon is already generated
 * from the same SVG by app/scripts/build-icon.mjs (at 180 for the home-screen
 * raster), so this renders the same vector at the size Apple wants rather than
 * scaling a 180 up.
 *
 * No alpha channel. Apple rejects an app icon that carries one, even when
 * every pixel in it is opaque, so the render is flattened through BMP with
 * macOS's own sips (lossless, and already on every Mac) and the result is
 * checked here rather than at upload time.
 *
 *   node native/scripts/build-ios-icon.mjs            rewrite the icon
 *   node native/scripts/build-ios-icon.mjs --check     fail if it has drifted
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const SVG = join(repoRoot, 'app', 'public', 'icon.svg');
const ICON = join(nativeRoot, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');
const SIZE = 1024;

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

/** Width, height and colour type straight out of the PNG header (IHDR). */
function pngHeader(bytes) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(sig)) return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}

/** What Apple will accept: the right size, and no alpha channel (2 = RGB, 3 = palette). */
function problems(bytes) {
  const h = pngHeader(bytes);
  if (!h) return 'not a PNG';
  if (h.width !== SIZE || h.height !== SIZE) return `${h.width}x${h.height}, not ${SIZE}x${SIZE}`;
  if (h.colorType === 4 || h.colorType === 6) return 'has an alpha channel, which Apple rejects';
  if (bytes.length < 4000) return `only ${bytes.length} bytes, which is one flat colour, not an icon`;
  return null;
}

function render() {
  const browser = CANDIDATES.find((p) => existsSync(p));
  if (!browser) throw new Error(`no headless browser found. Set CHROME_PATH. Tried:\n  ${CANDIDATES.join('\n  ')}`);
  const dir = mkdtempSync(join(tmpdir(), 'pexi-ios-icon-'));
  try {
    copyFileSync(SVG, join(dir, 'icon.svg'));
    const page = join(dir, 'shot.html');
    writeFileSync(page, [
      '<!doctype html><meta charset="utf-8">',
      '<style>',
      '  html,body{margin:0;padding:0;background:#0B0C0E;overflow:hidden}',
      `  img{display:block;width:${SIZE}px;height:${SIZE}px}`,
      '</style>',
      `<img src="icon.svg" width="${SIZE}" height="${SIZE}" alt="">`,
    ].join('\n'));

    const shot = join(dir, 'shot.png');
    execFileSync(browser, [
      '--headless',
      '--disable-gpu',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      `--screenshot=${shot}`,
      `--window-size=${SIZE},${SIZE}`,
      `file:///${page.replace(/\\/g, '/')}`,
    ], { stdio: 'pipe' });

    // PNG -> BMP -> PNG drops the alpha channel without touching a pixel.
    const bmp = join(dir, 'flat.bmp');
    const flat = join(dir, 'flat.png');
    execFileSync('/usr/bin/sips', ['-s', 'format', 'bmp', shot, '--out', bmp], { stdio: 'pipe' });
    execFileSync('/usr/bin/sips', ['-s', 'format', 'png', bmp, '--out', flat], { stdio: 'pipe' });

    const bytes = readFileSync(flat);
    const problem = problems(bytes);
    if (problem) throw new Error(`the render is not a usable icon: ${problem}`);
    return bytes;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isCheck = process.argv.includes('--check');
if (isCheck) {
  if (!existsSync(ICON)) {
    console.error('AppIcon-512@2x.png is missing. Run node native/scripts/build-ios-icon.mjs');
    process.exit(1);
  }
  const problem = problems(readFileSync(ICON));
  if (problem) {
    console.error(`AppIcon-512@2x.png is not usable: ${problem}`);
    process.exit(1);
  }
  console.log(`AppIcon-512@2x.png ok: ${SIZE}x${SIZE}, no alpha`);
} else {
  const bytes = render();
  writeFileSync(ICON, bytes);
  console.log(`wrote the iOS app icon, ${SIZE}x${SIZE}, ${bytes.length} bytes, no alpha`);
}
