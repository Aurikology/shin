// The charming fallback for a laptop with no camera: a procedural pixel-art shop shelf.
// Everything is drawn with fillRect, nothing is a fillText, and it runs at 12fps so the whole
// app reads at one consistent frame rate.

const W = 240
const H = 426
const FPS = 12

const BACKDROP = '#121316'
const WALL_BAND = '#181A1F'
const WOOD = '#8A5A34'
const WOOD_HI = '#B37B4A'
const WOOD_SHADE = '#5C3A20'
const WOOD_OUTLINE = '#241407'
const TAG_PAPER = '#F2ECD8'
const TAG_INK = '#1B1B1B'
const SALE_RED = '#E5473A'

// three-pixel-wide, five-pixel-tall digits, drawn as rectangles only.
const DIGITS = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '..#', '..#', '..#'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  '.': ['...', '...', '...', '...', '.#.'],
  $: ['.#.', '###', '.#.', '###', '.#.'],
}

function drawDigits(ctx, text, x, y, scale, color) {
  ctx.fillStyle = color
  let cx = x
  for (const ch of String(text)) {
    const glyph = DIGITS[ch]
    if (glyph) {
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col] === '#') ctx.fillRect(cx + col * scale, y + row * scale, scale, scale)
        }
      }
    }
    cx += 4 * scale // 3 wide plus 1 gap
  }
  return cx
}

// a chunky "3D" rectangle with the same bevel language as the rest of the app: a lighter
// top-left edge and a darker bottom-right edge.
function chunkyRect(ctx, x, y, w, h, s, colors) {
  ctx.fillStyle = colors.outline
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = colors.body
  ctx.fillRect(x + s, y + s, w - 2 * s, h - 2 * s)
  ctx.fillStyle = colors.hi
  ctx.fillRect(x + s, y + s, w - 2 * s, s)
  ctx.fillRect(x + s, y + s, s, h - 2 * s)
  ctx.fillStyle = colors.shade
  ctx.fillRect(x + s, y + h - 2 * s, w - 2 * s, s)
  ctx.fillRect(x + w - 2 * s, y + s, s, h - 2 * s)
}

function drawBox(ctx, x, y, w, h, s, colors) {
  chunkyRect(ctx, x, y, w, h, s, colors)
}

function drawCarton(ctx, x, y, w, h, s, colors) {
  const roofH = Math.max(s * 2, Math.round(h * 0.22))
  chunkyRect(ctx, x + s, y, w - 2 * s, roofH, s, colors)
  chunkyRect(ctx, x, y + roofH - s, w, h - roofH + s, s, colors)
}

function drawBag(ctx, x, y, w, h, s, colors) {
  const topW = Math.max(s * 2, Math.round(w * 0.7))
  const topH = Math.max(s * 2, Math.round(h * 0.3))
  chunkyRect(ctx, x + Math.round((w - topW) / 2), y, topW, topH, s, colors)
  chunkyRect(ctx, x, y + topH - s, w, h - topH + s, s, colors)
}

function drawCan(ctx, x, y, w, h, s, colors) {
  const rim = Math.max(s, Math.round(w * 0.16))
  chunkyRect(ctx, x + rim, y, w - 2 * rim, s * 2, s, colors)
  chunkyRect(ctx, x, y + s * 2, w, h - s * 4, s, colors)
  chunkyRect(ctx, x + rim, y + h - s * 2, w - 2 * rim, s * 2, s, colors)
}

function drawBottle(ctx, x, y, w, h, s, colors) {
  const neckW = Math.max(s * 2, Math.round(w * 0.42))
  const neckH = Math.max(s * 2, Math.round(h * 0.24))
  chunkyRect(ctx, x + Math.round((w - neckW) / 2), y, neckW, neckH, s, colors)
  chunkyRect(ctx, x, y + neckH - s, w, h - neckH + s, s, colors)
}

const SHAPES = { box: drawBox, carton: drawCarton, bag: drawBag, can: drawCan, bottle: drawBottle }

function drawBarcode(ctx, x, y, w, h) {
  ctx.fillStyle = TAG_PAPER
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = TAG_INK
  let cx = x + 1
  let i = 0
  while (cx < x + w - 1) {
    const barW = (i % 3 === 0) ? 2 : 1
    ctx.fillRect(cx, y + 1, barW, h - 2)
    cx += barW + 1
    i += 1
  }
}

function drawPriceTag(ctx, x, y, price, onSale, visible) {
  const w = 26
  const h = 12
  ctx.fillStyle = onSale ? SALE_RED : TAG_PAPER
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = TAG_INK
  ctx.fillRect(x, y, w, 1)
  ctx.fillRect(x, y + h - 1, w, 1)
  ctx.fillRect(x, y, 1, h)
  ctx.fillRect(x + w - 1, y, 1, h)
  if (!onSale || visible) {
    drawDigits(ctx, price, x + 2, y + 3, 1, onSale ? TAG_PAPER : TAG_INK)
  }
}

function buildProducts() {
  const kinds = ['box', 'can', 'bottle', 'bag', 'carton']
  const palettes = [
    { body: '#E8533F', hi: '#F2896F', shade: '#9E3324', outline: WOOD_OUTLINE },
    { body: '#3FA0E8', hi: '#7FC4F5', shade: '#255E8C', outline: WOOD_OUTLINE },
    { body: '#F2C14E', hi: '#F8DA8C', shade: '#A9822C', outline: WOOD_OUTLINE },
    { body: '#5FB85C', hi: '#96D794', shade: '#357A33', outline: WOOD_OUTLINE },
    { body: '#B166CC', hi: '#D3A0E0', shade: '#733F8A', outline: WOOD_OUTLINE },
    { body: '#4FD6C4', hi: '#8FE9DE', shade: '#2E8D80', outline: WOOD_OUTLINE },
  ]
  const shelfY = [96, 216, 336] // plank tops
  const layout = [
    ['box', 46, 0.9], ['can', 26, 0.7], ['bottle', 30, 0.95],
    ['bag', 40, 0.65], ['carton', 40, 0.85], ['box', 34, 0.6],
    ['bottle', 28, 0.9], ['can', 26, 0.6], ['box', 40, 0.8],
  ]
  const prices = ['1.29', '2.49', '3.99', '0.99', '4.49', '1.79', '2.99', '1.49', '5.29']
  const products = []
  let xCursor = [16, 16, 16]
  layout.forEach((spec, i) => {
    const [kind, w, hFrac] = spec
    const shelfIdx = i % 3
    const h = Math.round(58 * hFrac)
    const x = xCursor[shelfIdx]
    xCursor[shelfIdx] += w + 14
    const y = shelfY[shelfIdx] - h
    products.push({
      kind, x, y, w, h,
      colors: palettes[i % palettes.length],
      price: prices[i % prices.length],
      phase: i * 5,
      onSale: i === 2,
    })
  })
  return products
}

function drawShelf(ctx, y) {
  const plankH = 10
  chunkyRect(ctx, 0, y, W, plankH, 2, {
    outline: WOOD_OUTLINE, body: WOOD, hi: WOOD_HI, shade: WOOD_SHADE,
  })
  // two support brackets
  ctx.fillStyle = WOOD_SHADE
  ctx.fillRect(18, y + plankH, 6, 14)
  ctx.fillRect(W - 24, y + plankH, 6, 14)
}

function bobOffset(phase, frame) {
  const cyclePos = (frame + phase) % 48
  return cyclePos < 24 ? 0 : 1
}

export function createDemoShelf() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false

  const products = buildProducts()
  const shelfY = [96, 216, 336]

  let frame = 0
  let timer = null

  function draw() {
    ctx.fillStyle = BACKDROP
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = WALL_BAND
    ctx.fillRect(0, 40, W, 20)

    shelfY.forEach((y) => drawShelf(ctx, y))

    const saleVisible = Math.floor(frame / 6) % 2 === 0

    products.forEach((p) => {
      const bob = bobOffset(p.phase, frame)
      const py = p.y - bob
      const shape = SHAPES[p.kind] || drawBox
      shape(ctx, p.x, py, p.w, p.h, 2, p.colors)
      drawPriceTag(ctx, p.x + p.w - 22, py + p.h - 14, p.price, p.onSale, saleVisible)
      drawBarcode(ctx, p.x, py + p.h + 2, Math.min(20, p.w), 5)
    })

    frame += 1
  }

  function start() {
    if (timer) return
    draw()
    timer = setInterval(draw, 1000 / FPS)
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null }
  }

  return { canvas, start, stop }
}
