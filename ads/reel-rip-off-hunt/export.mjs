// Assembles the rendered frames into the deliverables:
//   per variant: a 4 fps contact sheet (with the safe box drawn on), an MP4 with
//   the sound effects and a silent MP4. Also a seam strip: last 3 frames, then first 3.
//   node export.mjs <framesDir> <sfx.wav> <outDir> [sheetsOnly]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [framesDir, wav, outDir, sheetsOnly] = process.argv.slice(2);
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
fs.mkdirSync(outDir, { recursive: true });
const pad = (n) => String(n).padStart(4, '0');
const src = (v, f) => path.join(framesDir, f < 30 ? v : 'common', pad(f) + '.png');

for (const v of ['A', 'B', 'C']) {
  // one folder per variant holding all 450 frames, hard-linked, so ffmpeg reads a plain sequence
  const seq = path.join(framesDir, 'seq-' + v);
  fs.rmSync(seq, { recursive: true, force: true }); fs.mkdirSync(seq);
  for (let f = 0; f < 450; f++) fs.linkSync(src(v, f), path.join(seq, pad(f) + '.png'));

  // contact sheet: 4 frames a second = 60 cells, with the safe box drawn on each
  const sheetList = path.join(seq, 'sheet.txt');
  const picks = [...Array(60).keys()].map(k => Math.round(k * 7.5));
  fs.writeFileSync(sheetList, picks.map(f => `file '${pad(f)}.png'\nduration 1`).join('\n') + '\n');
  ff(['-f', 'concat', '-safe', '0', '-i', sheetList,
    '-vf', 'drawbox=x=154:y=285:w=771:h=1350:color=yellow@0.9:t=6,scale=216:384,tile=10x6:padding=4:color=white', '-frames:v', '1', '-update', '1',
    path.join(outDir, `contact-sheet-${v}.png`)]);
  if (sheetsOnly) continue;

  const vid = ['-framerate', '30', '-i', path.join(seq, '%04d.png')];
  const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '30', '-movflags', '+faststart'];
  ff([...vid, '-i', wav, ...enc, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', '15', path.join(outDir, `pexi-reel-${v}-sfx.mp4`)]);
  // silent: a silent audio track rather than none, which every uploader accepts
  ff([...vid, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', ...enc, '-c:a', 'aac', '-b:a', '128k', '-t', '15', path.join(outDir, `pexi-reel-${v}-silent.mp4`)]);
}
// the loop seam, A: frames 447 448 449 | 0 1 2
const seamList = path.join(framesDir, 'seam.txt');
fs.writeFileSync(seamList, [447, 448, 449, 0, 1, 2].map(f => `file '${src('A', f).replaceAll('\\', '/')}'\nduration 1`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', seamList, '-vf', 'scale=360:640,tile=6x1:padding=6:color=white', '-frames:v', '1', '-update', '1', path.join(outDir, 'loop-seam-A.png')]);
console.log('done');
