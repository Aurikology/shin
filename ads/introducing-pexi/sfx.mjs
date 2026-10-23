// Synthesises the soundtrack for "Introducing Pexi" (copied from ../launch-meet-pexi,
// retimed to this reel's cuts): a 120 BPM beat (kick, clap, hats, a bass line)
// under the hits the picture lands on. The beep, scratch, rumble and ding are
// the reel's own (ads/reel-rip-off-hunt/sfx.mjs). Everything sits on the 0.5 s
// grid, so a trending sound laid over the effects-only mix lines up too.
//   node sfx.mjs <outDir>     writes mix.wav (beat + hits) and hits.wav (hits only)
import fs from 'node:fs';
import path from 'node:path';

const SR = 48000, DUR = 16, N = SR * DUR;
const TAU = Math.PI * 2;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

function track() { return { L: new Float32Array(N), R: new Float32Array(N) }; }
function add(tr, at, buf, gain = 1, pan = 0) {
  const o = Math.round(at * SR);
  const gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < buf.length && o + i < N; i++) { if (o + i < 0) continue; tr.L[o + i] += buf[i] * gl; tr.R[o + i] += buf[i] * gr; }
}
function onePoleLP(x, fc) { const a = Math.exp(-TAU * fc / SR); let y = 0; const out = new Float32Array(x.length); for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; out[i] = y; } return out; }
function onePoleHP(x, fc) { const lp = onePoleLP(x, fc); return x.map((v, i) => v - lp[i]); }
function bandpass(x, fcAt, q) {
  const out = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const w = TAU * fcAt(i) / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}
const buf = (dur, fn) => { const n = Math.round(dur * SR), b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = fn(i / SR, i); return b; };

// ---------- the beat ----------
const kick = () => buf(0.45, t => Math.sin(TAU * (48 * t + 110 * (1 - Math.exp(-t * 28)) / 28)) * Math.exp(-t * 7) * Math.min(1, t / 0.002) + (t < 0.006 ? rnd() * 0.4 : 0));
const hat = (open = false) => { const d = open ? 0.18 : 0.05; return onePoleHP(buf(d, t => rnd() * Math.exp(-t * (open ? 18 : 70))), 7000); };
const clap = () => bandpass(buf(0.22, t => rnd() * (Math.exp(-t * 22) + 0.6 * Math.exp(-Math.max(0, t - 0.012) * 60) * (t > 0.012 ? 1 : 0))), () => 1400, 0.8);
const bass = (f, dur) => onePoleLP(buf(dur, t => {
  const env = Math.min(1, t / 0.005) * Math.min(1, (dur - t) / 0.03);
  return env * (((t * f) % 1) * 2 - 1) * 0.7 + env * Math.sin(TAU * f * t);
}), 380);
const pad = (fs_, dur) => onePoleLP(buf(dur, t => {
  const env = Math.min(1, t / 0.08) * Math.min(1, (dur - t) / 0.3);
  let s = 0; for (const f of fs_) s += Math.sin(TAU * f * t + 0.6 * Math.sin(TAU * f * 0.5 * t)) + 0.3 * (((t * f * 1.003) % 1) * 2 - 1);
  return env * s / fs_.length;
}), 2400);

// ---------- the hits ----------
function beep() {
  return buf(0.12, t => Math.min(1, t / 0.003) * Math.min(1, (0.12 - t) / 0.02) * (0.75 * Math.sin(TAU * 2350 * t) + 0.25 * Math.sin(TAU * 4700 * t)));
}
function scratch() {
  const srcN = SR * 2, src = new Float32Array(srcN);
  for (let i = 0; i < srcN; i++) {
    const t = i / SR;
    let s = 0; for (const f of [98, 147, 196, 247]) s += ((t * f) % 1) * 2 - 1;
    src[i] = 0.2 * s + 0.35 * rnd() + 0.6 * Math.sin(TAU * 55 * t) * Math.exp(-((t % 0.25) * 18));
  }
  const dur = 0.42, n = Math.round(dur * SR), out = new Float32Array(n), vel = new Float32Array(n);
  let pos = 0.6 * SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const v = t < 0.08 ? 2.6 * Math.sin(Math.PI * t / 0.08)
      : t < 0.16 ? -3.2 * Math.sin(Math.PI * (t - 0.08) / 0.08)
      : t < 0.24 ? 3.0 * Math.sin(Math.PI * (t - 0.16) / 0.08)
      : -2.4 * Math.sin(Math.PI * (t - 0.24) / 0.18);
    pos += v; vel[i] = Math.abs(v);
    const p = Math.max(0, Math.min(srcN - 2, pos)), k = Math.floor(p), fr = p - k;
    out[i] = (src[k] * (1 - fr) + src[k + 1] * fr) * Math.min(1, vel[i] / 0.8);
  }
  const bp = bandpass(out, i => 500 + 1700 * vel[i], 1.4);
  for (let i = 0; i < n; i++) { const t = i / SR; bp[i] = Math.tanh(bp[i] * 2.2) * Math.min(1, (dur - t) / 0.03); }
  return bp;
}
function rumble(dur) {
  const n = Math.round(dur * SR), noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = rnd();
  const low = onePoleLP(onePoleLP(noise, 140), 140);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.06) * Math.min(1, (dur - t) / 0.45);
    const growl = (((t * 62 * (1 + 0.04 * Math.sin(TAU * 3 * t))) % 1) * 2 - 1) * (0.6 + 0.4 * Math.sin(TAU * 9 * t));
    out[i] = env * (0.9 * Math.sin(TAU * 46 * t + 2 * Math.sin(TAU * 7 * t)) + 5.5 * low[i] + 0.35 * growl);
  }
  const shaped = onePoleLP(out, 420);
  for (let i = 0; i < n; i++) shaped[i] = Math.tanh(shaped[i] * 1.6);
  return shaped;
}
function ding() {
  const dur = 1.6, n = Math.round(dur * SR), out = new Float32Array(n);
  const ka = new Float32Array(Math.round(0.06 * SR));
  for (let i = 0; i < ka.length; i++) ka[i] = rnd() * Math.exp(-i / SR * 70);
  const kaBp = bandpass(ka, () => 3200, 0.9);
  for (let i = 0; i < kaBp.length; i++) out[i] += 1.6 * kaBp[i];
  const bell = (start, f0, g) => {
    const parts = [[1, 1, 1.5], [2.0, 0.5, 1.0], [2.76, 0.4, 0.7], [4.07, 0.22, 0.5], [5.4, 0.14, 0.32]];
    for (let i = Math.round(start * SR); i < n; i++) {
      const t = i / SR - start;
      let s = 0; for (const [r, a, d] of parts) s += a * Math.sin(TAU * f0 * r * t + (r === 2.0 ? 0.3 * Math.sin(TAU * 4 * t) : 0)) * Math.exp(-t / d);
      out[i] += g * s * Math.min(1, t / 0.002);
    }
  };
  bell(0.05, 1568, 0.45);
  bell(0.11, 2093, 0.55);
  return out;
}
// a stamp landing: a low thump with a slap on top
const thud = () => buf(0.3, t => Math.sin(TAU * (60 * t + 90 * (1 - Math.exp(-t * 40)) / 40)) * Math.exp(-t * 14) + rnd() * Math.exp(-t * 90) * 0.6);
// a caption landing: a short pitched pop
const pop = (f = 900) => buf(0.09, t => Math.sin(TAU * (f * t + f * 0.8 * (1 - Math.exp(-t * 60)) / 60)) * Math.exp(-t * 45));
// a rise into a cut: filtered noise sweeping up
function whoosh(dur = 0.4) {
  const x = buf(dur, t => rnd() * Math.sin(Math.PI * t / dur));
  return bandpass(x, i => 400 + 5000 * Math.pow(i / x.length, 2), 1.2);
}

// ---------- the score ----------
// a soft UI click (the cursor) and a tick (a checklist line done)
const click = () => buf(0.04, t => (rnd() * 0.5 + Math.sin(TAU * 3200 * t)) * Math.exp(-t * 160));
const tick = () => buf(0.25, t => (Math.sin(TAU * 1760 * t) + 0.4 * Math.sin(TAU * 2640 * t)) * Math.exp(-t * 18) * 0.6);
const boop = (f0, f1) => buf(0.45, t => Math.sin(TAU * (f0 * t + (f1 - f0) * t * t / 0.9)) * Math.exp(-t * 6) * Math.min(1, t / 0.01));
const music = track(), hits = track();
// a light groove, Am F C G, 120 BPM: soft kick on the beat, shaker on the off-beat, bass and a pad
const ROOTS = [55, 43.65, 65.41, 49.0];
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
const BEAT_END = 12.5;
for (let b = 0; b * 0.5 < BEAT_END; b++) {
  const t = b * 0.5, bar = Math.floor(t / 2) % 4;
  const full = t >= 1.0;
  add(music, t, kick(), full ? 0.55 : 0.3);
  if (full) { add(music, t + 0.25, hat(), 0.08, -0.25); add(music, t + 0.125, hat(), 0.035, 0.25); add(music, t + 0.375, hat(), 0.035, 0.25); }
  add(music, t, bass(ROOTS[bar] * (b % 4 === 2 ? 2 : 1), 0.42), 0.22);
  if (t % 2 === 0) add(music, t, pad(CHORDS[bar], 2.0), 0.13);
}
add(music, BEAT_END, pad([220, 261.6, 329.6, 440], 3.2), 0.2);
add(music, BEAT_END + 0.5, pad([329.6, 440, 523.3], 2.8), 0.12);

// every cut: a short whoosh into it
for (const at of [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.5, 12.5]) add(hits, at - 0.15, whoosh(0.3), 0.26);
// intro: the word lands
add(hits, 0.1, pop(900), 0.22);
// notif: the wallpaper faces pop, the notification lands
for (let k = 0; k < 6; k++) add(hits, 1.15 + k * 0.06, pop(700 + k * 90), 0.12);
add(hits, 1.55, ding(), 0.3);
// pop: the verdict card lifts out with a low boop
add(hits, 2.35, boop(320, 160), 0.5); add(hits, 2.35, pop(600), 0.25);
// obj: the shoe pops, the sparkles tick in
add(hits, 3.0, pop(500), 0.35); for (let k = 0; k < 4; k++) add(hits, 3.15 + k * 0.07, tick(), 0.18);
// list: three cards stack in
for (let k = 0; k < 3; k++) add(hits, 4.25 + k * 0.12, pop(800 + k * 150), 0.2);
// head1: the words land
add(hits, 5.05, pop(700), 0.25); add(hits, 5.13, pop(800), 0.25); add(hits, 5.21, pop(900), 0.25);
// stack: three cards
for (let k = 0; k < 3; k++) add(hits, 6.1 + k * 0.1, pop(600 + k * 120), 0.22);
// picker: the tap on Blunt
add(hits, 7.75, click(), 0.6); add(hits, 7.78, pop(1000), 0.2);
// scan: the shutter tap, the beep
add(hits, 8.85, click(), 0.6); add(hits, 8.87, beep(), 0.4);
// tumble: each pill lands
for (let k = 0; k < 8; k++) add(hits, 9.4 + k * 0.06, thud(), 0.12, (k % 2 ? 0.3 : -0.3));
// head2: the great price
add(hits, 10.1, pop(900), 0.25); add(hits, 10.6, ding(), 0.45);
// splash and the end
add(hits, 11.6, pop(1100), 0.3);
add(hits, 12.6, ding(), 0.4); add(hits, 12.8, pop(1300), 0.25);

function write(file, parts) {
  const L = new Float32Array(N), R = new Float32Array(N);
  for (const p of parts) for (let i = 0; i < N; i++) { L[i] += p.L[i]; R[i] += p.R[i]; }
  // fade the last 0.3 s so the file never ends on a click
  for (let i = N - Math.round(0.3 * SR); i < N; i++) { const g = (N - i) / (0.3 * SR); L[i] *= g; R[i] *= g; }
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = Math.pow(10, -1 / 20) / peak;
  const data = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
const out = process.argv[2] || 'out';
fs.mkdirSync(out, { recursive: true });
write(path.join(out, 'mix.wav'), [music, hits]);
write(path.join(out, 'hits.wav'), [hits]);
console.log('wrote mix.wav and hits.wav');
