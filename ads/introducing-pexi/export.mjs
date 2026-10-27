// Assembles the frames and the soundtrack into the deliverables:
//   introducing-pexi.mp4          picture + beat + hits, the one to post
//   introducing-pexi-voice*.mp4   picture + beat + hits + a voiceover, one per vo*.wav
//   introducing-pexi-hits.mp4     picture + hits only, for laying a trending sound over in-app
//   introducing-pexi-silent.mp4   picture + a silent track (some uploaders refuse no audio at all)
//   contact-sheet.png      2 frames a second with the safe box drawn on
//   node export.mjs <outDir>      reads <outDir>/frames, mix.wav, hits.wav
// ffmpeg is $FFMPEG if set, else `ffmpeg` on PATH.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const out = path.resolve(process.argv[2] || 'out');
const FF = process.env.FFMPEG || 'ffmpeg';
const ff = (args) => execFileSync(FF, ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const vid = ['-framerate', '30', '-i', path.join(out, 'frames', '%04d.png')];
const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '30', '-movflags', '+faststart'];
const aac = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest'];
ff([...vid, '-i', path.join(out, 'mix.wav'), ...enc, ...aac, path.join(out, 'introducing-pexi.mp4')]);
ff([...vid, '-i', path.join(out, 'hits.wav'), ...enc, ...aac, path.join(out, 'introducing-pexi-hits.mp4')]);
// One per voiceover from vo.mjs (vo.wav -> -voice, vo-puck.wav -> -voice-puck): the mix
// ducks ~8 dB under the voice, which sits on top.
for (const f of fs.readdirSync(out).filter(f => /^vo(-[a-z]+)?\.wav$/.test(f))) ff([...vid, '-i', path.join(out, 'mix.wav'), '-i', path.join(out, f),
  '-filter_complex', '[2:a]asplit[vo][key];[1:a][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[bed];[bed][vo]amix=inputs=2:normalize=0:weights=0.8 1,alimiter=limit=0.95[a]',
  '-map', '0:v', '-map', '[a]', ...enc, ...aac, path.join(out, `introducing-pexi-voice${f.slice(2, -4)}.mp4`)]);
ff([...vid, '-f', 'lavfi', '-t', '30', '-i', 'anullsrc=r=48000:cl=stereo', ...enc, ...aac, path.join(out, 'introducing-pexi-silent.mp4')]);
ff([...vid, '-vf', 'select=not(mod(n\\,15)),drawbox=x=154:y=285:w=771:h=1350:color=yellow@0.9:t=6,scale=216:384,tile=12x4:padding=4:color=white',
  '-frames:v', '1', '-update', '1', path.join(out, 'contact-sheet.png')]);
console.log('done');
