/**
 * Bundle the camera modules and copy the WebAssembly they need.
 *
 * Stage 0 of the build plan: the app used to have no dependencies and no build
 * step, and that was a real design choice. It ends here, because a barcode
 * reader and an on-device detector cannot be served from a folder of
 * hand-written files. This is the smallest honest version of that: one bundle,
 * built from `src/eye/`, written into `public/js/`, imported by the existing
 * hand-written screens as an ordinary module. Nothing else about the app changes
 * and no framework arrives with it.
 *
 * The WebAssembly is copied rather than inlined. A base64 .wasm inside the
 * bundle blocks the first paint on a download the camera does not need until the
 * user actually points it at something.
 */

import { build } from 'esbuild';
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'public', 'js');
const vendorDir = join(outDir, 'vendor');

async function copyIfPresent(from, to, what) {
  try {
    await stat(from);
  } catch {
    console.warn(`  skipped ${what}: not found at ${from}`);
    return false;
  }
  await cp(from, to, { recursive: true });
  console.log(`  copied ${what}`);
  return true;
}

async function main() {
  await mkdir(vendorDir, { recursive: true });

  const result = await build({
    entryPoints: [join(root, 'src', 'eye', 'index.ts')],
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    platform: 'browser',
    outdir: outDir,
    entryNames: 'eye',
    chunkNames: 'chunks/[name]-[hash]',
    sourcemap: true,
    // Not minified. This is read and argued with far more often than it is
    // shipped over a slow link, and the entry chunk is small either way.
    minify: false,
    metafile: true,
    // Splitting is required, not a preference. The detector loads MediaPipe with
    // a dynamic import so that a blocked or slow model download degrades to
    // saliency-only instead of to no camera at all. With splitting off, esbuild
    // inlines that import into the entry chunk, the lazy path disappears, and
    // every session pays for MediaPipe up front whether it works or not. The
    // first build here shipped 866 kB in one file for exactly that reason.
    splitting: true,
    external: [],
    logLevel: 'warning',
  });

  const outputs = Object.entries(result.metafile.outputs)
    .filter(([name]) => name.endsWith('.js'))
    .sort((a, b) => b[1].bytes - a[1].bytes);
  for (const [name, out] of outputs) {
    console.log(`  ${(out.bytes / 1024).toFixed(0).padStart(5)} kB  ${name}`);
  }
  const entry = outputs.find(([name]) => name.endsWith('eye.js'));
  if (entry) {
    console.log(`entry chunk ${(entry[1].bytes / 1024).toFixed(0)} kB (what loads before the camera runs)`);
  }

  await copyIfPresent(
    join(root, 'node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm'),
    join(vendorDir, 'zxing_reader.wasm'),
    'zxing reader wasm',
  );
  await copyIfPresent(
    join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
    join(vendorDir, 'mediapipe-wasm'),
    'mediapipe wasm',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
