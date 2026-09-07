// Placeholder identification. Deterministic so the demo is repeatable: the first eight
// scans walk a fixed script that guarantees every verdict state, then settles into a
// pseudo-random walk seeded by the scan count and the frame's own average colour.
import { CATALOGUE, CATEGORIES, match, verdict } from './catalogue.js'

const STORES = [
  'Corner Mart', 'Big Box Foods', 'Valu Depot', 'Fresh & Sons',
  'Night Owl', 'Pantry Plus', 'Metro Bin', 'Shelfwise',
]

// Find the highest-contrast region near the centre of a low-res frame.
export function findBox(lowResCanvas) {
  const fallback = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }
  try {
    const ctx = lowResCanvas.getContext && lowResCanvas.getContext('2d')
    if (!ctx) return fallback
    const width = lowResCanvas.width
    const height = lowResCanvas.height
    if (!width || !height) return fallback
    const { data } = ctx.getImageData(0, 0, width, height)

    const GRID = 8
    const cols = GRID
    const rows = GRID
    const cellW = width / cols
    const cellH = height / rows

    // Mean luminance and variance per cell.
    const mean = new Float64Array(cols * rows)
    const variance = new Float64Array(cols * rows)

    for (let cy = 0; cy < rows; cy += 1) {
      for (let cx = 0; cx < cols; cx += 1) {
        const x0 = Math.floor(cx * cellW)
        const x1 = Math.floor((cx + 1) * cellW)
        const y0 = Math.floor(cy * cellH)
        const y1 = Math.floor((cy + 1) * cellH)
        let sum = 0
        let count = 0
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const i = (y * width + x) * 4
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
            sum += lum
            count += 1
          }
        }
        const m = count ? sum / count : 0
        mean[cy * cols + cx] = m
        let vsum = 0
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const i = (y * width + x) * 4
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
            vsum += (lum - m) * (lum - m)
          }
        }
        variance[cy * cols + cx] = count ? vsum / count : 0
      }
    }

    // Score: variance plus edge energy against the right and below neighbours,
    // weighted by a gaussian favouring the centre.
    const score = new Float64Array(cols * rows)
    const cxCentre = (cols - 1) / 2
    const cyCentre = (rows - 1) / 2
    const sigma = GRID / 3
    for (let cy = 0; cy < rows; cy += 1) {
      for (let cx = 0; cx < cols; cx += 1) {
        const idx = cy * cols + cx
        let edge = 0
        if (cx + 1 < cols) edge += Math.abs(mean[idx] - mean[cy * cols + (cx + 1)])
        if (cy + 1 < rows) edge += Math.abs(mean[idx] - mean[(cy + 1) * cols + cx])
        const raw = variance[idx] + edge
        const dx = cx - cxCentre
        const dy = cy - cyCentre
        const distSq = dx * dx + dy * dy
        const weight = Math.exp(-distSq / (2 * sigma * sigma))
        score[idx] = raw * weight
      }
    }

    // Pick the best cell.
    let bestIdx = 0
    for (let i = 1; i < score.length; i += 1) {
      if (score[i] > score[bestIdx]) bestIdx = i
    }
    const bestScore = score[bestIdx]
    const threshold = bestScore * 0.4

    // Grow a rectangle outward from the best cell: flood fill to orthogonal
    // neighbours whose score is still above the threshold.
    const visited = new Uint8Array(cols * rows)
    const queue = [bestIdx]
    visited[bestIdx] = 1
    let minCol = bestIdx % cols
    let maxCol = minCol
    let minRow = Math.floor(bestIdx / cols)
    let maxRow = minRow

    while (queue.length) {
      const idx = queue.shift()
      const col = idx % cols
      const row = Math.floor(idx / cols)
      minCol = Math.min(minCol, col)
      maxCol = Math.max(maxCol, col)
      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, row)
      const neighbours = []
      if (col > 0) neighbours.push(idx - 1)
      if (col < cols - 1) neighbours.push(idx + 1)
      if (row > 0) neighbours.push(idx - cols)
      if (row < rows - 1) neighbours.push(idx + cols)
      for (const n of neighbours) {
        if (visited[n]) continue
        visited[n] = 1
        if (score[n] > threshold) queue.push(n)
      }
    }

    let x = minCol / cols
    let y = minRow / rows
    let w = (maxCol - minCol + 1) / cols
    let h = (maxRow - minRow + 1) / rows

    // Enforce a minimum: at least 30% of the shorter side, as a fraction.
    const shorter = Math.min(width, height)
    const minFracW = (shorter * 0.3) / width
    const minFracH = (shorter * 0.3) / height
    if (w < minFracW) {
      const cx0 = x + w / 2
      w = minFracW
      x = cx0 - w / 2
    }
    if (h < minFracH) {
      const cy0 = y + h / 2
      h = minFracH
      y = cy0 - h / 2
    }

    // Clamp inside the frame.
    w = Math.min(w, 1)
    h = Math.min(h, 1)
    x = Math.max(0, Math.min(x, 1 - w))
    y = Math.max(0, Math.min(y, 1 - h))

    return { x, y, w, h }
  } catch {
    return fallback
  }
}

// Round to a plausible price ending in 9, 7, 5 or 0 cents.
function toPlausible(price) {
  const cents = Math.max(0, Math.round(price * 100))
  const dollars = Math.floor(cents / 100)
  const rem = cents % 100
  const lastDigit = rem % 10
  const allowed = [0, 5, 7, 9]
  let best = allowed[0]
  let bestDist = 10
  for (const a of allowed) {
    const dist = Math.abs(a - lastDigit)
    if (dist < bestDist) { bestDist = dist; best = a }
  }
  const newRem = rem - lastDigit + best
  return dollars + newRem / 100
}

function productById(id) {
  return CATALOGUE.find((p) => p.id === id)
}

function candidatesFor(id) {
  const product = productById(id)
  const others = CATALOGUE.filter((p) => p.category === product.category && p.id !== id)
  const picked = [product, others[0], others[1]].filter(Boolean)
  return picked.map((p) => ({ id: p.id, label: `${p.name} ${p.size}` }))
}

// The fixed eight-scan script. Each entry names the product and the asking price
// that, run through verdict(), produces the state the demo needs to show.
const SCRIPT = [
  { id: 'instant-noodle-cup', asking: 0.69, found: true, seller: STORES[0] }, // delighted
  { id: 'cola-can-pack', asking: 7.49, found: true, seller: STORES[1] }, // walk
  { id: 'potato-chips', asking: 3.49, found: true, seller: STORES[2] }, // fair
  { id: 'whole-milk', asking: 4.69, found: false, seller: STORES[3] }, // refusal
  { id: 'usb-c-cable', asking: 15.99, found: true, seller: STORES[4] }, // angry
  { id: 'bananas', asking: 1.59, found: true, seller: STORES[5] }, // good
  { id: 'trail-mix', asking: 5.99, found: true, seller: STORES[6] }, // thin
  { id: 'dish-soap', asking: 3.99, found: false, seller: STORES[7] }, // refusal
]

// A small integer hash, deterministic given the scan count and a frame sample.
function hashSeed(seq, avg) {
  let h = (seq * 2654435761 + avg * 97) >>> 0
  h = h ^ (h >>> 13)
  h = Math.imul(h, 2246822519) >>> 0
  h = h ^ (h >>> 16)
  return h >>> 0
}

// Average colour of a low-res frame, 0..255. Falls back to a neutral mid grey
// when the canvas cannot be read.
function averageColour(lowResCanvas) {
  try {
    const ctx = lowResCanvas.getContext && lowResCanvas.getContext('2d')
    if (!ctx) return 128
    const { width, height } = lowResCanvas
    if (!width || !height) return 128
    const { data } = ctx.getImageData(0, 0, width, height)
    let sum = 0
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i] + data[i + 1] + data[i + 2]
      count += 1
    }
    return count ? Math.round(sum / (count * 3)) : 128
  } catch {
    return 128
  }
}

const BUCKETS = ['good', 'fair', 'walk', 'delighted', 'angry']

function askingForBucket(bucket, product) {
  const { going, low, high } = product
  let raw
  if (bucket === 'delighted') raw = Math.min(low, going * 0.7)
  else if (bucket === 'good') raw = going * 0.85
  else if (bucket === 'fair') raw = going
  else if (bucket === 'walk') raw = going * 1.15
  else raw = Math.max(high * 1.05, going * 1.5) // angry
  return toPlausible(raw)
}

// seq is the 1-based scan count. found is false on every fourth scan.
export function identify(lowResCanvas, seq) {
  const scripted = seq >= 1 && seq <= 8 ? SCRIPT[seq - 1] : null

  if (scripted) {
    return {
      candidates: candidatesFor(scripted.id),
      asking: scripted.asking,
      seller: scripted.seller,
      found: scripted.found,
    }
  }

  const found = seq % 4 !== 0
  const avg = averageColour(lowResCanvas)
  const seed = hashSeed(seq, avg)

  const product = CATALOGUE[seed % CATALOGUE.length]
  const bucket = BUCKETS[Math.floor(seed / CATALOGUE.length) % BUCKETS.length]
  const asking = askingForBucket(bucket, product)
  const seller = STORES[Math.floor(seed / 7) % STORES.length]

  return {
    candidates: candidatesFor(product.id),
    asking,
    seller,
    found,
  }
}
