// The voiceover: an AI voice (Gemini TTS, voice Leda, a young woman, unless VO_VOICE names
// another, e.g. Puck, a young man) explaining the reel,
// one clip per shot so each line lands on its cut. Clips are cached in <outDir>/vo/ by
// a hash of voice + style + text, so a rebuild only calls the API for lines that changed.
//   node --env-file=../../.env vo.mjs <outDir>
// Writes <outDir>/vo.wav (48 kHz stereo, the length of the reel) and <outDir>/vo.json, or
// vo-<voice>.wav / .json for a voice other than Leda,
// (each line's start and end). No burned-in subtitles: the reel's own headlines carry the
// words, and the phone fills the safe box in nearly every shot (Aurik, 2026-10-27).
// Needs GEMINI_API_KEY. The voice is synthetic: post with Instagram's AI label on.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const out = path.resolve(process.argv[2] || 'out');
const MODEL = 'gemini-3.8-flash-tts', VOICE = process.env.VO_VOICE || 'Leda';
const NAME = VOICE === 'Leda' ? 'vo' : 'vo-' + VOICE.toLowerCase();
const STYLE = 'upbeat, playful and a little sassy, like a friend letting you in on a secret; quick social-video narrator pace, speaking rapidly';
const SR = 48000, DUR = 30, N = SR * DUR;

// `at` is the shot's start (scene.js T). A line never starts before its shot, and never
// before the previous line has finished plus a breath.
const LINES = [
  { at: 0.15, text: 'Overpaying? Meet Pexi.' },
  { at: 2.6, text: 'He checks prices for you.' },
  { at: 5.1, text: 'Your new price pal. Point your phone at the tag.' },
  { at: 8.0, text: 'Like these sneakers.' },
  { at: 9.6, text: 'Scan it...' },
  { at: 12.1, text: 'A hundred eighty? Usually one-twenty. Hard pass.' },
  { at: 15.1, text: 'Shoes, headphones, skincare.' },
  { at: 17.6, text: 'And he comes in three moods.' },
  { at: 19.8, text: 'Dry, sweet, or brutal. You pick.' },
  { at: 22.6, text: 'Snacks, toys, coffee...' },
  { at: 24.6, text: 'Scan anything. Catch the steals.' },
  { at: 27.1, text: 'Pexi. Know if it\'s a rip-off.', noCaption: true },
];

// The free tier allows 3 requests a minute: on a 429, wait as long as it says and retry.
async function synth(text, tries = 6) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: VOICE }] },
    }),
  });
  if (r.status === 429 && tries > 1) {
    const m = /retry in (?:(\d+)m)?(\d+)s/.exec(await r.text());
    const s = (m ? Number(m[1] || 0) * 60 + Number(m[2]) : 30) + 2;
    process.stdout.write(`  rate-limited, waiting ${s}s\n`);
    await new Promise(res => setTimeout(res, s * 1000));
    return synth(text, tries - 1);
  }
  if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const audio = j.steps?.flatMap(s => s.content || []).find(c => c.type === 'audio');
  if (!audio) throw new Error('TTS returned no audio');
  return Buffer.from(audio.data, 'base64');
}

// A 16-bit PCM WAV (any rate, mono or stereo) to mono floats.
function readWav(buf) {
  let o = 12, fmt = null, data = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(o + 10), rate: buf.readUInt32LE(o + 12), bits: buf.readUInt16LE(o + 22) };
    if (id === 'data') data = buf.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('unexpected WAV');
  const n = Math.floor(data.length / 2 / fmt.ch), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); x[i] = s / fmt.ch / 32768; }
  return { rate: fmt.rate, x };
}
// Cut the silence the model leaves at each end, keeping 40 ms of air.
function trim(x, rate) {
  const th = 0.012, pad = Math.round(0.04 * rate);
  let a = 0, b = x.length - 1;
  while (a < b && Math.abs(x[a]) < th) a++;
  while (b > a && Math.abs(x[b]) < th) b--;
  return x.subarray(Math.max(0, a - pad), Math.min(x.length, b + pad));
}
function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.round(x.length * to / from), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * from / to, k = Math.floor(p), f = p - k; y[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; }
  return y;
}
function writeWav(file, x, rate) {
  const d = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(d.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, d]));
}
// The free tier also caps requests per day, so every missing line is asked for in ONE
// request, the lines separated by long pauses, and the audio is cut at the k-1 longest
// silences. Same voice, same take: the lines also match each other better this way.
function splitTake(x, rate, k) {
  const th = 0.012, win = Math.round(0.01 * rate), gaps = [];
  let run = 0;
  for (let i = 0; i < x.length; i += win) {
    let quiet = true; for (let j = i; j < Math.min(x.length, i + win); j++) if (Math.abs(x[j]) >= th) { quiet = false; break; }
    if (quiet) run += win; else { if (run > 0.15 * rate) gaps.push({ at: i - run / 2, len: run }); run = 0; }
  }
  const cuts = gaps.sort((a, b) => b.len - a.len).slice(0, k - 1).map(g => Math.round(g.at)).sort((a, b) => a - b);
  if (cuts.length !== k - 1) throw new Error(`take has ${cuts.length + 1} parts, expected ${k}`);
  const ends = [...cuts, x.length];
  return ends.map((e, i) => x.subarray(i ? ends[i - 1] : 0, e));
}

fs.mkdirSync(path.join(out, 'vo'), { recursive: true });
const fileFor = (i, line) => path.join(out, 'vo', `${String(i).padStart(2, '0')}-${crypto.createHash('sha1').update([MODEL, VOICE, STYLE, line.text].join('|')).digest('hex').slice(0, 10)}.wav`);
const missing = LINES.map((l, i) => [i, l]).filter(([i, l]) => !fs.existsSync(fileFor(i, l)));
// VO_EACH=1 asks for each line on its own instead: slower on the free tier, but a voice
// whose pauses inside a line run as long as the ones between lines cannot split a take.
if (missing.length && process.env.VO_EACH) {
  for (const [i, l] of missing) {
    process.stdout.write(`tts line ${i}\n`);
    const w = readWav(await synth(l.text));
    writeWav(fileFor(i, l), w.x, w.rate);
  }
} else if (missing.length) {
  process.stdout.write(`tts, one take: ${missing.map(([i]) => i).join(', ')}\n`);
  const take = readWav(await synth(missing.map(([, l]) => l.text).join(' <long pause> ')));
  const parts = missing.length === 1 ? [take.x] : splitTake(take.x, take.rate, missing.length);
  missing.forEach(([i, l], k) => writeWav(fileFor(i, l), parts[k], take.rate));
}
const L = new Float32Array(N);
const timeline = [];
let free = 0;
for (const [i, line] of LINES.entries()) {
  const w = readWav(fs.readFileSync(fileFor(i, line)));
  const clip = resample(trim(w.x, w.rate), w.rate, SR);
  const start = Math.max(line.at, free + 0.12), end = start + clip.length / SR;
  const o = Math.round(start * SR);
  for (let k = 0; k < clip.length && o + k < N; k++) L[o + k] += clip[k];
  free = end;
  timeline.push({ text: line.text, at: line.at, start: +start.toFixed(3), end: +end.toFixed(3), late: +(start - line.at).toFixed(2) });
}
if (free > DUR - 0.3 && !process.env.VO_DRY) throw new Error(`voiceover runs to ${free.toFixed(2)} s, past the ${DUR} s reel`);

// normalise speech to -3 dBFS peak
let peak = 0; for (const v of L) peak = Math.max(peak, Math.abs(v));
const g = peak > 0 ? 0.708 / peak : 1;
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) { const s = Math.max(-1, Math.min(1, L[i] * g)) * 32767; data.writeInt16LE(s | 0, i * 4); data.writeInt16LE(s | 0, i * 4 + 2); }
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(data.length, 40);
fs.writeFileSync(path.join(out, NAME + '.wav'), Buffer.concat([h, data]));
fs.writeFileSync(path.join(out, NAME + '.json'), JSON.stringify(timeline, null, 1));
for (const t of timeline) console.log(`${t.start.toFixed(2)}-${t.end.toFixed(2)}${t.late > 0.05 ? ` (late ${t.late}s)` : ''}  ${t.text}`);
