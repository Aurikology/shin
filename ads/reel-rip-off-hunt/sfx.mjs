// Synthesises the Reel's sound-effects track: a scanner beep per scan, a record
// scratch on each price reveal, an angry rumble under the two bad prices and a
// cash-register ding on the great price. No music. Every hit sits on the 0.5 s
// grid (120 BPM) so a trending song laid over it in Instagram lines up.
//   node sfx.mjs <out.wav>
import fs from 'node:fs';

const SR = 48000, DUR = 15, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
const TAU = Math.PI * 2;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

function add(at, buf, gain = 1, pan = 0) {
  const o = Math.round(at * SR);
  const gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < buf.length && o + i < N; i++) { L[o + i] += buf[i] * gl; R[o + i] += buf[i] * gr; }
}
function onePoleLP(x, fc) { const a = Math.exp(-TAU * fc / SR); let y = 0; const out = new Float32Array(x.length); for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; out[i] = y; } return out; }
// resonant band-pass (RBJ biquad), centre frequency can move per sample
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

function beep() {
  const n = Math.round(0.12 * SR), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = Math.min(1, t / 0.003) * Math.min(1, (0.12 - t) / 0.02);
    b[i] = env * (0.75 * Math.sin(TAU * 2350 * t) + 0.25 * Math.sin(TAU * 4700 * t));
  }
  return b;
}

function scratch() {
  // a source with some musical body, read back at the speed of a hand on a platter
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
    // forward, back, forward, then a long drag back: "wicka-wicka-wiiip"
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

function rumble(dur, surges = []) {
  const n = Math.round(dur * SR), noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = rnd();
  const low = onePoleLP(onePoleLP(noise, 140), 140);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = Math.min(1, t / 0.06) * Math.min(1, (dur - t) / 0.45);
    for (const s of surges) if (t >= s && t < s + 0.35) env *= 1 + 0.9 * (1 - (t - s) / 0.35);
    const growl = (((t * 62 * (1 + 0.04 * Math.sin(TAU * 3 * t))) % 1) * 2 - 1) * (0.6 + 0.4 * Math.sin(TAU * 9 * t));
    out[i] = env * (0.9 * Math.sin(TAU * 46 * t + 2 * Math.sin(TAU * 7 * t)) + 5.5 * low[i] + 0.35 * growl);
  }
  const shaped = onePoleLP(out, 420);
  for (let i = 0; i < n; i++) shaped[i] = Math.tanh(shaped[i] * 1.6);
  return shaped;
}

function ding() {
  const dur = 1.6, n = Math.round(dur * SR), out = new Float32Array(n);
  // "ka": the drawer, a short bright noise burst with two clicks
  const ka = new Float32Array(Math.round(0.06 * SR));
  for (let i = 0; i < ka.length; i++) ka[i] = rnd() * Math.exp(-i / SR * 70);
  const kaBp = bandpass(ka, () => 3200, 0.9);
  for (let i = 0; i < kaBp.length; i++) out[i] += 1.6 * kaBp[i];
  // "ching": two bell strikes, inharmonic partials decaying at their own rates
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

// ---- the score ----
add(3.0, beep(), 0.5);            // scan 1
add(5.5, beep(), 0.5);            // scan 2, faster
add(9.5, beep(), 0.5);            // scan 3
add(3.5, scratch(), 0.8, -0.15);  // $8.99 vs $1.49
add(6.0, scratch(), 0.8, 0.15);   // $14.99 vs $3.20
add(10.0, scratch(), 0.8, 0);     // $19 vs $79
add(3.0, rumble(1.95, [0.5, 1.0, 1.5]), 0.55);
add(6.0, rumble(2.95, [0, 1.0, 1.5, 2.0, 2.5]), 0.8);
add(10.5, ding(), 0.7);           // great price

// normalise to -1 dBFS and write 16-bit stereo
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
fs.writeFileSync(process.argv[2] || 'sfx.wav', Buffer.concat([h, data]));
console.log('peak before normalise', peak.toFixed(3));
