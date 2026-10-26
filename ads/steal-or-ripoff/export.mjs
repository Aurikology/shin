// Assembles the frames and the sound into the deliverables:
//   steal-or-ripoff-<style>.mp4   picture + a music track + hits, one per music-<style>.mp3 (the ones to post)
//   steal-or-ripoff-hits.mp4      picture + hits only, for laying a sound over in-app
//   contact-sheet.png             2 frames a second with the safe box drawn on
//   node export.mjs <outDir> [musicStart=0]
// musicStart is where in each track the reel's 16 s begin (a track's countdown should sit
// under 0-3 s, its drop on 3.0). Reads <outDir>/frames, hits.wav and any music-*.mp3.
// ffmpeg is $FFMPEG if set, else `ffmpeg` on PATH.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const out = path.resolve(process.argv[2] || 'out');
const start = Number(process.argv[3] || 0);
const FF = process.env.FFMPEG || 'ffmpeg';
const ff = (args) => execFileSync(FF, ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const vid = ['-framerate', '30', '-i', path.join(out, 'frames', '%04d.png')];
const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '30', '-movflags', '+faststart'];
const aac = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', '16'];
ff([...vid, '-i', path.join(out, 'hits.wav'), ...enc, ...aac, path.join(out, 'steal-or-ripoff-hits.mp4')]);
// The track sits under the hits; 16 s of it from musicStart, no fade (the reel loops), loudness
// brought to about -14 LUFS, where Reels plays.
for (const f of fs.readdirSync(out).filter(f => /^music-[a-z0-9]+\.mp3$/.test(f))) {
  ff([...vid, '-ss', String(start), '-i', path.join(out, f), '-i', path.join(out, 'hits.wav'),
    '-filter_complex', '[1:a]atrim=0:16,asetpts=PTS-STARTPTS,aresample=48000[m];[m][2:a]amix=inputs=2:normalize=0:weights=0.9 0.8,loudnorm=I=-14:TP=-1:LRA=11[a]',
    '-map', '0:v', '-map', '[a]', ...enc, ...aac, path.join(out, `steal-or-ripoff-${f.slice(6, -4)}.mp4`)]);
}
ff([...vid, '-vf', 'select=not(mod(n\\,15)),drawbox=x=154:y=285:w=771:h=1350:color=yellow@0.9:t=6,scale=216:384,tile=8x4:padding=4:color=white',
  '-frames:v', '1', '-update', '1', path.join(out, 'contact-sheet.png')]);
console.log('done');
