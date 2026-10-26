// The music: produced instrumentals from Google's Lyria (Gemini API), in place of the beat
// sfx.mjs used to synthesise. The picture is cut to the track (its beats and its drop), the
// way an editor cuts to music, not the other way round.
//   node --env-file=../../.env music.mjs <outDir> [style ...]
// Writes <outDir>/music-<style>.mp3 for each style (all of them by default). A file already
// there is kept, so a rerun only pays for the styles that are missing. Needs a paid-tier
// GEMINI_API_KEY (Lyria has no free tier; the clip model is about $0.04 a track). Every track
// carries Google's SynthID watermark: post with Instagram's AI label on.
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || 'out');
const MODEL = 'lyria-3-clip-preview';

// One brief, three sounds. Each asks for the same shape so any of them fits the cut: a
// ticking 3 s countdown with no kick, the drop on the reveal, a groove that holds, a
// second break and drop for round two. 120 BPM keeps every cut on the 0.5 s grid.
const SHAPE = `Instrumental only, no vocals, no vocal chops. Exactly 120 BPM, 4/4, a steady grid with no tempo changes.
[0:00 - 0:03] Countdown: a ticking clock, tight hi-hats and a rising filtered riff, no kick yet, tension like a game show question.
[0:03 - 0:10] Drop: the full beat hits hard on 0:03, punchy kick and bass, the main hook riff, bouncy and confident.
[0:10 - 0:12] Break: the beat cuts out, only the ticking riff, building again.
[0:12 - 0:24] Second drop: the full beat back on 0:12, the hook riff again with extra energy.
[0:24 - 0:30] Outro: the groove keeps going so it can loop, no fade out, no ending hit.`;
const STYLES = {
  club: `Playful Jersey club and bouncy electronic pop for a short social video ad: skippy club kick pattern, bright plucked synths, a cheeky whistle-like lead, glossy modern mix, loud and punchy on phone speakers. ${SHAPE}`,
  phonk: `Cowbell phonk for a short social video ad, but playful rather than dark: distorted 808 bass, Memphis cowbell melody, crisp trap hi-hats, swagger and attitude, loud and punchy on phone speakers. ${SHAPE}`,
  quirky: `Quirky comedic hip-hop for a short social video ad: pizzicato strings and marimba over a hard boom-bap beat with a deep sub bass, mischievous and funny, like a game show with attitude, loud and punchy on phone speakers. ${SHAPE}`,
};

async function make(prompt) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: prompt }),
  });
  if (!r.ok) throw new Error(`Lyria ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  const steps = j.steps || [];
  const audio = steps.flatMap(s => s.content || []).filter(c => c.type === 'audio').pop();
  if (!audio) throw new Error('Lyria returned no audio: ' + JSON.stringify(j).slice(0, 400));
  const text = steps.flatMap(s => s.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  return { buf: Buffer.from(audio.data, 'base64'), text };
}

fs.mkdirSync(out, { recursive: true });
const want = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(STYLES);
for (const s of want) {
  const file = path.join(out, `music-${s}.mp3`);
  if (fs.existsSync(file)) { console.log(`${s}: kept`); continue; }
  const { buf, text } = await make(STYLES[s]);
  fs.writeFileSync(file, buf);
  if (text) fs.writeFileSync(path.join(out, `music-${s}.txt`), text);
  console.log(`${s}: ${(buf.length / 1024).toFixed(0)} KB`);
}
