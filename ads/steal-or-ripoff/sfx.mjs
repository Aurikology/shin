// The sound effects for "Steal or rip-off?" (instruments from ../introducing-pexi/sfx.mjs):
// a tick on every countdown number, the shutter and beep on each answer, a slam under the
// Bad price, a ding on the Great price, pops for Pexi and his lines. The music is a separate
// produced track (music.mjs); export.mjs lays these hits over it. Every hit sits on the
// 0.5 s grid the picture is cut to, so an in-app sound laid over hits.wav lines up too.
//   node sfx.mjs <outDir>     writes hits.wav
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
const hits = track();
// whooshes into each cut (the one at 16.0 is the loop point, heard at 0.0)
for (const at of [5.0, 10.0, 12.0, 16.0]) add(hits, at - 0.15, whoosh(0.3), 0.26);
// a countdown: three ticks rising, then the shutter, the beep and the answer landing
function answer(ta, bad) {
  for (let i = 0; i < 3; i++) add(hits, ta - 1.5 + i * 0.5, tick(), 0.35 + i * 0.05);
  add(hits, ta, click(), 0.7); add(hits, ta + 0.02, beep(), 0.4);
  if (bad) { add(hits, ta + 0.05, thud(), 0.6); add(hits, ta + 0.15, pop(500), 0.3); }
  else { add(hits, ta + 0.05, ding(), 0.5); add(hits, ta + 0.15, pop(1100), 0.25); }
  add(hits, ta + 0.5, pop(bad ? 800 : 1200), 0.22);
}
answer(3.0, true); answer(7.0, false);
// sign-off
add(hits, 10.05, pop(1200), 0.25); add(hits, 10.45, pop(1400), 0.18);
// your turn: the words, the line, the countdown with no answer (the loop cuts it off)
add(hits, 12.1, pop(900), 0.25); add(hits, 13.1, pop(1000), 0.2);
for (let i = 0; i < 3; i++) add(hits, 14.5 + i * 0.5, tick(), 0.35 + i * 0.05);

function write(file, parts) {
  const L = new Float32Array(N), R = new Float32Array(N);
  for (const p of parts) for (let i = 0; i < N; i++) { L[i] += p.L[i]; R[i] += p.R[i]; }
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
write(path.join(out, 'hits.wav'), [hits]);
console.log('wrote hits.wav');
