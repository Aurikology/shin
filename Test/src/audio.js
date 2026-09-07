// Chiptune sound effects, WebAudio only, no samples and no files. Nothing plays before
// unlock() runs on a user gesture, and nothing plays while muted. Every method is a safe
// no-op if AudioContext is unavailable or anything here throws.

const AudioCtx = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext)

// A4 concert pitch, equal temperament, just the notes this file uses.
const NOTE = {
  B3: 246.94,
  C5: 523.25,
  D4: 293.66,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A3: 220.00,
}

let ctx = null
let master = null
let unlocked = false
let isMuted = false
let lastTypeAt = -1

function safe(fn) {
  try { fn() } catch { /* never throw, sound is decoration */ }
}

function canPlay() {
  return !!ctx && unlocked && !isMuted
}

// One oscillator voice: short attack, then a stepped (not smooth) decay to silence.
// freqEnd, when given, steps the pitch from freq to freqEnd across the note instead of
// holding it, in a few discrete jumps rather than a slide.
function noteAt(time, { type = 'square', freq, freqEnd, dur, peak = 1 } = {}) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, time)
  if (typeof freqEnd === 'number' && freqEnd !== freq) {
    const steps = 4
    for (let i = 1; i <= steps; i += 1) {
      const f = freq + (freqEnd - freq) * (i / steps)
      osc.frequency.setValueAtTime(f, time + (dur * i) / (steps + 1))
    }
  }

  const gain = ctx.createGain()
  const attack = Math.min(0.008, dur * 0.2)
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.linearRampToValueAtTime(peak, time + attack)
  const steps = 5
  for (let i = 1; i <= steps; i += 1) {
    const t = time + attack + ((dur - attack) * i) / steps
    gain.gain.setValueAtTime(Math.max(peak * (1 - i / steps), 0.0001), t)
  }
  gain.gain.setValueAtTime(0.0001, time + dur + 0.01)

  osc.connect(gain)
  gain.connect(master)
  osc.start(time)
  osc.stop(time + dur + 0.03)
}

// A short burst of random samples for the shutter click.
function noiseBurst(time, dur, peak = 1) {
  const rate = ctx.sampleRate
  const len = Math.max(1, Math.floor(rate * dur))
  const buffer = ctx.createBuffer(1, len, rate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1

  const src = ctx.createBufferSource()
  src.buffer = buffer

  const gain = ctx.createGain()
  const steps = 4
  gain.gain.setValueAtTime(peak, time)
  for (let i = 1; i <= steps; i += 1) {
    gain.gain.setValueAtTime(Math.max(peak * (1 - i / steps), 0.0001), time + (dur * i) / steps)
  }
  gain.gain.setValueAtTime(0.0001, time + dur + 0.01)

  src.connect(gain)
  gain.connect(master)
  src.start(time)
  src.stop(time + dur + 0.03)
}

// Plays a list of note specs back to back, each starting when the previous ends.
function playSeq(notes, gap = 0.01) {
  let t = ctx.currentTime
  notes.forEach((n) => {
    noteAt(t, n)
    t += n.dur + gap
  })
}

function unlock() {
  safe(() => {
    if (!AudioCtx) return
    if (!ctx) {
      ctx = new AudioCtx()
      master = ctx.createGain()
      master.gain.value = 0.18
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    unlocked = true
  })
}

function blip() {
  safe(() => {
    if (!canPlay()) return
    noteAt(ctx.currentTime, { type: 'square', freq: 880, dur: 0.06 })
  })
}

function shutter() {
  safe(() => {
    if (!canPlay()) return
    const t = ctx.currentTime
    noiseBurst(t, 0.03, 0.9)
    noteAt(t, { type: 'square', freq: 1200, freqEnd: 300, dur: 0.09 })
  })
}

function tick() {
  safe(() => {
    if (!canPlay()) return
    noteAt(ctx.currentTime, { type: 'triangle', freq: 1500, dur: 0.025, peak: 0.3 })
  })
}

function step() {
  safe(() => {
    if (!canPlay()) return
    playSeq([
      { type: 'square', freq: 660, dur: 0.04 },
      { type: 'square', freq: 990, dur: 0.04 },
    ], 0)
  })
}

function land(tier) {
  safe(() => {
    if (!canPlay()) return
    const seqs = {
      good: [
        { type: 'square', freq: NOTE.C5, dur: 0.07 },
        { type: 'square', freq: NOTE.E5, dur: 0.07 },
        { type: 'square', freq: NOTE.G5, dur: 0.07 },
      ],
      fair: [
        { type: 'square', freq: NOTE.E5, dur: 0.07 },
        { type: 'square', freq: NOTE.E5, dur: 0.07 },
      ],
      walk: [
        { type: 'square', freq: NOTE.E5, dur: 0.07 },
        { type: 'square', freq: NOTE.C5, dur: 0.07 },
      ],
      unknown: [
        { type: 'triangle', freq: NOTE.A3, dur: 0.22, peak: 0.5 },
      ],
    }
    playSeq(seqs[tier] || seqs.unknown)
  })
}

function match() {
  safe(() => {
    if (!canPlay()) return
    playSeq([
      { type: 'square', freq: NOTE.C5, dur: 0.05 },
      { type: 'square', freq: NOTE.D5, dur: 0.05 },
      { type: 'square', freq: NOTE.E5, dur: 0.05 },
      { type: 'square', freq: NOTE.G5, dur: 0.12 },
    ])
  })
}

function nomatch() {
  safe(() => {
    if (!canPlay()) return
    playSeq([
      { type: 'triangle', freq: NOTE.D4, dur: 0.12, peak: 0.55 },
      { type: 'triangle', freq: NOTE.B3, dur: 0.12, peak: 0.55 },
    ], 0.02)
  })
}

function nod() {
  safe(() => {
    if (!canPlay()) return
    noteAt(ctx.currentTime, { type: 'triangle', freq: 1046, dur: 0.05 })
  })
}

function type() {
  safe(() => {
    if (!canPlay()) return
    const t = ctx.currentTime
    if (t - lastTypeAt < 0.03) return
    lastTypeAt = t
    noteAt(t, { type: 'square', freq: 2000, dur: 0.012, peak: 0.22 })
  })
}

function setMuted(b) {
  safe(() => { isMuted = !!b })
}

export const sfx = {
  unlock,
  blip,
  shutter,
  tick,
  step,
  land,
  match,
  nomatch,
  nod,
  type,
  setMuted,
  get muted() { return isMuted },
}
