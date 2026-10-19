// Assembles the frames and the soundtrack into the deliverables:
//   meet-pexi.mp4          picture + beat + hits, the one to post
//   meet-pexi-hits.mp4     picture + hits only, for laying a trending sound over in-app
//   meet-pexi-silent.mp4   picture + a silent track (some uploaders refuse no audio at all)
//   contact-sheet.png      2 frames a second with the safe box drawn on
//   node export.mjs <outDir>      reads <outDir>/frames, mix.wav, hits.wav
// ffmpeg is $FFMPEG if set, else `ffmpeg` on PATH.
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const out = path.resolve(process.argv[2] || 'out');
const FF = process.env.FFMPEG || 'ffmpeg';
const ff = (args) => execFileSync(FF, ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const vid = ['-framerate', '30', '-i', path.join(out, 'frames', '%04d.png')];
const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '30', '-movflags', '+faststart'];
const aac = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest'];
ff([...vid, '-i', path.join(out, 'mix.wav'), ...enc, ...aac, path.join(out, 'meet-pexi.mp4')]);
ff([...vid, '-i', path.join(out, 'hits.wav'), ...enc, ...aac, path.join(out, 'meet-pexi-hits.mp4')]);
ff([...vid, '-f', 'lavfi', '-t', '20', '-i', 'anullsrc=r=48000:cl=stereo', ...enc, ...aac, path.join(out, 'meet-pexi-silent.mp4')]);
ff([...vid, '-vf', 'select=not(mod(n\\,15)),drawbox=x=154:y=285:w=771:h=1350:color=yellow@0.9:t=6,scale=216:384,tile=12x4:padding=4:color=white',
  '-frames:v', '1', '-update', '1', path.join(out, 'contact-sheet.png')]);
console.log('done');
