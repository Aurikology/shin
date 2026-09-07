import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGUE, CATEGORIES, match, verdict, formatPrice } from '../src/catalogue.js'
import { findBox, identify } from '../src/scan.js'

test('24 products, 3 per category, valid price ranges', () => {
  assert.equal(CATALOGUE.length, 24)
  assert.equal(CATEGORIES.length, 8)
  for (const cat of CATEGORIES) {
    const inCat = CATALOGUE.filter((p) => p.category === cat)
    assert.equal(inCat.length, 3, `expected 3 products in ${cat}`)
  }
  for (const p of CATALOGUE) {
    assert.ok(p.low <= p.going, `${p.id}: low <= going`)
    assert.ok(p.going <= p.high, `${p.id}: going <= high`)
    assert.ok(p.name.length < 24, `${p.id}: name under 24 chars`)
  }
})

test('exactly three thin products (sellers under 2)', () => {
  const thin = CATALOGUE.filter((p) => p.sellers < 2)
  assert.equal(thin.length, 3)
})

test('match() finds a product or returns null', () => {
  const p = match('bananas')
  assert.equal(p.id, 'bananas')
  assert.equal(match('not-a-real-id'), null)
})

test('verdict tier thresholds at the boundaries', () => {
  const product = { going: 100, low: 50, high: 150, sellers: 5 }
  assert.equal(verdict(95, product).tier, 'good') // pct exactly -0.05
  assert.equal(verdict(105, product).tier, 'walk') // pct exactly 0.05
  assert.equal(verdict(104.9, product).tier, 'fair') // pct 0.049
})

test('delighted requires asking <= low, not just a steep pct', () => {
  const product = { going: 100, low: 60, high: 140, sellers: 5 }
  const hit = verdict(50, product) // pct -0.5, asking <= low
  assert.equal(hit.state, 'delighted')
  const miss = verdict(65, product) // pct -0.35, but asking > low
  assert.equal(miss.state, 'good')
  assert.equal(miss.tier, 'good')
})

test('angry requires asking > high, not just a steep pct', () => {
  const product = { going: 100, low: 60, high: 140, sellers: 5 }
  const hit = verdict(160, product) // pct 0.6, asking > high
  assert.equal(hit.state, 'angry')
  const miss = verdict(140, product) // pct 0.4, but asking == high, not over
  assert.equal(miss.state, 'walk')
  assert.equal(miss.tier, 'walk')
})

test('thin never produces an intense state', () => {
  const product = { going: 100, low: 60, high: 140, sellers: 1 }
  const delightedShape = verdict(40, product) // would be delighted if not thin
  assert.equal(delightedShape.thin, true)
  assert.notEqual(delightedShape.state, 'delighted')
  assert.equal(delightedShape.state, delightedShape.tier)

  const angryShape = verdict(160, product) // would be angry if not thin
  assert.equal(angryShape.thin, true)
  assert.notEqual(angryShape.state, 'angry')
  assert.equal(angryShape.state, angryShape.tier)
})

test('formatPrice always shows two decimals', () => {
  assert.equal(formatPrice(1.5), '$1.50')
  assert.equal(formatPrice(0.4), '$0.40')
  assert.equal(formatPrice(12), '$12.00')
  assert.equal(formatPrice(1.469), '$1.47')
})

// A canvas stub that fails loudly if identify() ever touches it. The scripted
// path (seq 1..8) must resolve without reading pixels.
const untouchableCanvas = {
  width: 64,
  height: 64,
  getContext() {
    throw new Error('identify() should not read the canvas on the scripted path')
  },
}

test('identify() walks the fixed eight-scan script through verdict()', () => {
  const expected = ['delighted', 'walk', 'fair', null, 'angry', 'good', 'thin', null]

  expected.forEach((want, i) => {
    const seq = i + 1
    const result = identify(untouchableCanvas, seq)

    assert.ok(Array.isArray(result.candidates))
    assert.equal(typeof result.seller, 'string')
    assert.equal(typeof result.asking, 'number')

    if (want === null) {
      assert.equal(result.found, false, `seq ${seq} should be a refusal`)
      return
    }

    assert.equal(result.found, true, `seq ${seq} should resolve`)
    assert.equal(result.candidates.length, 3)
    assert.equal(result.candidates[0].id, result.candidates[0].id) // shape sanity

    const product = match(result.candidates[0].id)
    assert.ok(product, `seq ${seq} candidate should match a catalogue product`)
    const v = verdict(result.asking, product)

    if (want === 'thin') {
      assert.equal(v.thin, true, `seq ${seq} should be a thin verdict`)
      assert.notEqual(v.state, 'delighted')
      assert.notEqual(v.state, 'angry')
    } else {
      assert.equal(v.state, want, `seq ${seq} expected state ${want}, got ${v.state}`)
    }
  })
})

test('every fourth scan is a refusal, seq 1..8', () => {
  for (let seq = 1; seq <= 8; seq += 1) {
    const result = identify(untouchableCanvas, seq)
    assert.equal(result.found, seq % 4 !== 0)
  }
})

test('identify() beyond seq 8 does not throw and returns a valid shape', () => {
  const readableCanvas = {
    width: 4,
    height: 4,
    getContext() {
      return {
        getImageData() {
          const data = new Uint8ClampedArray(4 * 4 * 4).fill(128)
          return { data }
        },
      }
    },
  }
  for (let seq = 9; seq <= 20; seq += 1) {
    const result = identify(readableCanvas, seq)
    assert.equal(typeof result.found, 'boolean')
    assert.ok(Array.isArray(result.candidates))
    assert.equal(result.candidates.length, 3)
    assert.equal(typeof result.asking, 'number')
    assert.equal(typeof result.seller, 'string')
  }
})

test('findBox returns the centre box when getContext is absent', () => {
  const box = findBox({ width: 32, height: 32 })
  assert.deepEqual(box, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })
})

test('findBox returns the centre box when reading pixels throws (tainted canvas)', () => {
  const tainted = {
    width: 32,
    height: 32,
    getContext() {
      return {
        getImageData() {
          throw new Error('tainted canvas')
        },
      }
    },
  }
  const box = findBox(tainted)
  assert.deepEqual(box, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })
})

test('findBox stays inside the frame and above the minimum size', () => {
  const width = 64
  const height = 64
  const canvas = {
    width,
    height,
    getContext() {
      return {
        getImageData() {
          const data = new Uint8ClampedArray(width * height * 4)
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const i = (y * width + x) * 4
              // A bright, noisy patch near the centre so it wins the score.
              const centre = Math.abs(x - width / 2) < 10 && Math.abs(y - height / 2) < 10
              const v = centre ? (x * 37 + y * 53) % 255 : 20
              data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
            }
          }
          return { data }
        },
      }
    },
  }
  const box = findBox(canvas)
  assert.ok(box.x >= 0 && box.y >= 0)
  assert.ok(box.x + box.w <= 1 + 1e-9)
  assert.ok(box.y + box.h <= 1 + 1e-9)
  assert.ok(box.w >= 0.3 - 1e-9)
  assert.ok(box.h >= 0.3 - 1e-9)
})
