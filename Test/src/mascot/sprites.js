// The mascot's feature art and pixel drawing helpers.
// Body is a full-size 32 by 32 map (see body.js). Every other feature is a small
// offset layer: { x, y, rows }, rows being equal-length strings of palette chars.
// Zones (grid coordinates, column then row): brows rows 7 to 10 (left cols 8 to 13,
// right cols 18 to 23), eyes rows 11 to 16 (left cols 9 to 13, right cols 18 to 22),
// mouth rows 19 to 23 cols 10 to 21. Extras may sit anywhere on the 32 grid.
export { BODY } from './body.js'

export const GRID = 32

export const PALETTE = {
  '.': null,
  O: 'ground',
  B: 'body',
  H: 'hi',
  S: 'shade',
  F: 'ground',
  W: '#F7F5F2',
  Y: '#FFC24D',
  C: '#7FD1FF',
  R: '#FF6A45',
}

// ---------- small builders (module load time only, no document access) ----------
const d = (n) => '.'.repeat(n)
const mirror = (s) => s.split('').reverse().join('')

function blankRows(w, h) {
  return Array.from({ length: h }, () => '.'.repeat(w))
}

// Overlays a small pattern onto a base grid of rows at (x0, y0). Pattern chars of
// '.' are treated as transparent and do not overwrite the base.
function stampRows(rows, x0, y0, pattern) {
  const grid = rows.map((r) => r.split(''))
  pattern.forEach((prow, ri) => {
    for (let ci = 0; ci < prow.length; ci += 1) {
      const ch = prow[ci]
      if (ch === '.') continue
      const gy = y0 + ri
      const gx = x0 + ci
      if (gy >= 0 && gy < grid.length && gx >= 0 && gx < grid[0].length) grid[gy][gx] = ch
    }
  })
  return grid.map((row) => row.join(''))
}

// ---------- eyes: x = 9, width 14 (left zone 5, gap 4, right zone 5) ----------
const EYE_X = 9

function eyeLayer(y, rows) {
  return { x: EYE_X, y, rows }
}

const IDLE_EYES = eyeLayer(11, [
  '.WFF.' + d(4) + '.WFF.',
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
])

const GOOD_EYES = eyeLayer(12, [
  '.WFF.' + d(4) + '.WFF.',
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
])

const THINKING_EYES = eyeLayer(11, [
  '.FFW.' + d(4) + '.FFW.',
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
])

const ASKING_EYES = eyeLayer(11, [
  'WFFF.' + d(4) + 'WFFF.',
  'FFFF.' + d(4) + 'FFFF.',
  'FFFF.' + d(4) + 'FFFF.',
  'FFFF.' + d(4) + 'FFFF.',
])

const DELIGHTED_EYES = eyeLayer(12, [
  '.FFF.' + d(4) + '.FFF.',
  'FF.FF' + d(4) + 'FF.FF',
])

const PROUD_EYES = eyeLayer(11, [
  '.FFF.' + d(4) + '.FFF.',
  'FF.FF' + d(4) + 'FF.FF',
])

const FAIR_EYES = eyeLayer(11, [
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
])

const WALK_EYES = eyeLayer(13, [
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
])

// The two innermost pixels sit near the bridge of the nose, so the slit reads as
// converging inward, fierce and focused rather than merely narrow.
const ANGRY_EYES = eyeLayer(13, [
  d(3) + 'F' + d(6) + 'F' + d(3),
  '.FFF.' + d(4) + '.FFF.',
])

const UNKNOWN_EYES = eyeLayer(12, [
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
])

const PLEASED_EYES = eyeLayer(12, [
  '..FF.' + d(4) + '.FF..',
  '.FFF.' + d(4) + '.FFF.',
])

const NUDGING_EYES = eyeLayer(11, [
  '..WFF' + d(4) + '..WFF',
  '..FFF' + d(4) + '..FFF',
  '..FFF' + d(4) + '..FFF',
  '..FFF' + d(4) + '..FFF',
])

export const EYES_CLOSED = eyeLayer(13, [
  'FFFFF' + d(4) + 'FFFFF',
])

export const EYES_HALF = eyeLayer(12, [
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
  '.FFF.' + d(4) + '.FFF.',
])

// ---------- brows: x = 8, width 16 (left zone 6, gap 4, right zone 6) ----------
const BROW_X = 8

function browLayer(y, rows) {
  return { x: BROW_X, y, rows }
}

const NEUTRAL_BROW = browLayer(8, [
  'FFFFFF' + d(4) + 'FFFFFF',
  'FFFFFF' + d(4) + 'FFFFFF',
])

const UP_BOTH_BROW = browLayer(7, [
  'FFFFFF' + d(4) + 'FFFFFF',
  'FFFFFF' + d(4) + 'FFFFFF',
])

const RELAXED_BROW = browLayer(9, [
  'FFFFFF' + d(4) + 'FFFFFF',
  'FFFFFF' + d(4) + 'FFFFFF',
])

const RAISED_LEFT_BROW = browLayer(7, [
  'FFFFFF' + d(4) + d(6),
  'FFFFFF' + d(4) + 'FFFFFF',
  d(6) + d(4) + 'FFFFFF',
])

const RAISED_RIGHT_BROW = browLayer(7, [
  d(6) + d(4) + 'FFFFFF',
  'FFFFFF' + d(4) + 'FFFFFF',
  'FFFFFF' + d(4) + d(6),
])

const FLAT_APART_BROW = browLayer(8, [
  '.FFFF.' + d(4) + '.FFFF.',
  '.FFFF.' + d(4) + '.FFFF.',
])

// Each side's segment mirrors to the other, so the taper reads as anatomically
// correct: outer end high, inner end (toward the nose) low.
const ANGLED_IN_SEGS = ['FF....', '..FF..', '....FF']
const ANGLED_IN_BROW = browLayer(7, ANGLED_IN_SEGS.map((s) => s + d(4) + mirror(s)))

const HEAVY_ANGLED_SEGS = ['FFF...', '.FFF..', '..FFF.']
const HEAVY_ANGLED_BROW = browLayer(7, HEAVY_ANGLED_SEGS.map((s) => s + d(4) + mirror(s)))

// ---------- mouths: x = 10, width 12 ----------
const MOUTH_X = 10

function mouthLayer(y, rows) {
  return { x: MOUTH_X, y, rows }
}

const SMALL_FLAT_MOUTH = mouthLayer(20, [
  d(4) + 'FFFF' + d(4),
  d(4) + 'FFFF' + d(4),
])

const SMALL_OPEN_MOUTH = mouthLayer(19, [
  d(4) + 'FFFF' + d(4),
  d(4) + 'F..F' + d(4),
  d(4) + 'FFFF' + d(4),
])

const WIDE_SMILE_MOUTH = mouthLayer(19, [
  '.' + 'F' + d(8) + 'F' + '.',
  '.' + '.' + 'F' + d(6) + 'F' + '.' + '.',
  '.' + '.' + '.' + 'F'.repeat(6) + '.' + '.' + '.',
])

const BIG_SMILE_TEETH_MOUTH = mouthLayer(19, [
  'F' + d(10) + 'F',
  '.' + 'F' + 'W'.repeat(8) + 'F' + '.',
  '.' + 'F'.repeat(10) + '.',
])

const STRAIGHT_MOUTH = mouthLayer(20, [
  '.' + 'F'.repeat(10) + '.',
  '.' + 'F'.repeat(10) + '.',
])

const DOWNTURN_MOUTH = mouthLayer(19, [...WIDE_SMILE_MOUTH.rows].reverse())

const GRIT_TEETH_MOUTH = mouthLayer(20, [
  '.' + 'F'.repeat(10) + '.',
  '.' + 'F' + 'W'.repeat(8) + 'F' + '.',
])

const SMALL_LINE_OFFSET_MOUTH = mouthLayer(20, [
  d(1) + 'FFFF' + d(7),
  d(1) + 'FFFF' + d(7),
])

const SMALL_CLOSED_MOUTH = mouthLayer(20, [
  d(3) + 'F' + d(4) + 'F' + d(3),
  d(3) + '.FFFF.' + d(3),
])

const TINY_O_MOUTH = mouthLayer(21, [
  d(5) + 'FF' + d(5),
  d(5) + 'FF' + d(5),
])

// ---------- extras: free placement on the 32 grid ----------
const SWEAT_EXTRA = { x: 25, y: 9, rows: ['.C', 'CC', 'CC', 'C.'] }

const QUESTION_EXTRA = {
  x: 22,
  y: 1,
  rows: ['.WW.', 'W..W', '...W', '..W.', d(4), '..W.'],
}

const SPARKLE = ['.Y.', 'YYY', '.Y.']
const DELIGHT_SPARKLES = {
  x: 2,
  y: 1,
  rows: [
    d(1) + 'Y' + d(24) + 'Y' + d(1),
    'YYY' + d(22) + 'YYY',
    d(1) + 'Y' + d(24) + 'Y' + d(1),
  ],
}

const STEAM_EXTRA = { x: 13, y: 0, rows: ['.R..R.', 'R..R..', '.R..R.'] }

const RAINDROP_EXTRA = { x: 25, y: 10, rows: ['.C', 'CC'] }

const Z_GLYPH = ['CCC', '.C.', 'CCC']
const ZZZ_EXTRA = {
  x: 22,
  y: 1,
  rows: stampRows(stampRows(blankRows(9, 8), 0, 5, Z_GLYPH), 5, 0, Z_GLYPH),
}

const PROUD_SPARKLE = { x: 24, y: 2, rows: SPARKLE }

// ---------- the thirteen states ----------
export const STATES = {
  idle: { brows: NEUTRAL_BROW, eyes: IDLE_EYES, mouth: SMALL_FLAT_MOUTH, extra: null },
  thinking: { brows: RAISED_LEFT_BROW, eyes: THINKING_EYES, mouth: null, extra: SWEAT_EXTRA },
  asking: { brows: UP_BOTH_BROW, eyes: ASKING_EYES, mouth: SMALL_OPEN_MOUTH, extra: QUESTION_EXTRA },
  good: { brows: RELAXED_BROW, eyes: GOOD_EYES, mouth: WIDE_SMILE_MOUTH, extra: null },
  delighted: { brows: UP_BOTH_BROW, eyes: DELIGHTED_EYES, mouth: BIG_SMILE_TEETH_MOUTH, extra: DELIGHT_SPARKLES },
  fair: { brows: NEUTRAL_BROW, eyes: FAIR_EYES, mouth: STRAIGHT_MOUTH, extra: null },
  walk: { brows: ANGLED_IN_BROW, eyes: WALK_EYES, mouth: DOWNTURN_MOUTH, extra: null },
  angry: { brows: HEAVY_ANGLED_BROW, eyes: ANGRY_EYES, mouth: GRIT_TEETH_MOUTH, extra: STEAM_EXTRA },
  unknown: { brows: FLAT_APART_BROW, eyes: UNKNOWN_EYES, mouth: SMALL_LINE_OFFSET_MOUTH, extra: RAINDROP_EXTRA },
  pleased: { brows: RELAXED_BROW, eyes: PLEASED_EYES, mouth: SMALL_CLOSED_MOUTH, extra: null },
  nudging: { brows: RAISED_RIGHT_BROW, eyes: NUDGING_EYES, mouth: SMALL_CLOSED_MOUTH, extra: null },
  asleep: { brows: null, eyes: EYES_CLOSED, mouth: TINY_O_MOUTH, extra: ZZZ_EXTRA },
  proud: { brows: UP_BOTH_BROW, eyes: PROUD_EYES, mouth: WIDE_SMILE_MOUTH, extra: PROUD_SPARKLE },
}

// ---------- think dots: three frames, filling left to right in the mouth zone ----------
function dotsRow(positions) {
  const arr = new Array(12).fill('.')
  positions.forEach((p) => { arr[p] = 'F'; arr[p + 1] = 'F' })
  return arr.join('')
}

export const THINK_DOTS = [
  { x: MOUTH_X, y: 20, rows: [dotsRow([2]), dotsRow([2])] },
  { x: MOUTH_X, y: 20, rows: [dotsRow([2, 5]), dotsRow([2, 5])] },
  { x: MOUTH_X, y: 20, rows: [dotsRow([2, 5, 8]), dotsRow([2, 5, 8])] },
]

// ---------- rendering ----------
// Fills one scale by scale rectangle per non transparent pixel. PALETTE values that
// are token names resolve through `colours`; hex values (starting with '#') are
// used as is.
export function drawMap(ctx, map, colours, scale, ox = 0, oy = 0) {
  const { x = 0, y = 0, rows } = map
  for (let r = 0; r < rows.length; r += 1) {
    const line = rows[r]
    for (let c = 0; c < line.length; c += 1) {
      const ch = line[c]
      if (ch === '.') continue
      const token = PALETTE[ch]
      if (token == null) continue
      const colour = token[0] === '#' ? token : colours[token]
      if (!colour) continue
      ctx.fillStyle = colour
      ctx.fillRect((ox + x + c) * scale, (oy + y + r) * scale, scale, scale)
    }
  }
}

// Darkens toward black (amount negative) or lightens toward white (amount
// positive). amount is clamped to -1..1. Returns a '#rrggbb' string.
export function tint(hex, amount) {
  const a = Math.max(-1, Math.min(1, amount))
  const n = parseInt(hex.replace('#', ''), 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  if (a >= 0) {
    r += (255 - r) * a
    g += (255 - g) * a
    b += (255 - b) * a
  } else {
    r *= 1 + a
    g *= 1 + a
    b *= 1 + a
  }
  const toHex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
