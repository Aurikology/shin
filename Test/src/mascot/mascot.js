// The mascot renderer and animation engine. Composes the body plus feature layers
// from sprites.js onto a canvas, and owns every animation the mascot performs.
import './mascot.css'
import { GRID, BODY, STATES, EYES_CLOSED, EYES_HALF, THINK_DOTS, drawMap, tint } from './sprites.js'

const IDLE_STATES = new Set(['idle', 'asking'])

// warm at the short end, deadpan at the long end, per the brief's 4 to 9 second window.
const BLINK_RANGE = {
  warm: [4000, 6000],
  blunt: [5000, 7500],
  deadpan: [7000, 9000],
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// Grows a layer by one pixel on each side, then fills the four neighbours of every
// F or W pixel (from the original, unshifted position) into that new border. Used
// for the warm personality's eye dilation.
function growEyesWarm(layer) {
  if (!layer) return layer
  const w = layer.rows[0] ? layer.rows[0].length : 0
  const h = layer.rows.length
  const nw = w + 2
  const nh = h + 2
  const grid = []
  for (let y = 0; y < nh; y += 1) grid.push(new Array(nw).fill('.'))
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ch = layer.rows[y][x]
      if (ch !== '.') grid[y + 1][x + 1] = ch
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ch = layer.rows[y][x]
      if (ch === 'F' || ch === 'W') {
        const gy = y + 1
        const gx = x + 1
        const neighbours = [[gy - 1, gx], [gy + 1, gx], [gy, gx - 1], [gy, gx + 1]]
        for (const [ny, nx] of neighbours) {
          if (ny >= 0 && ny < nh && nx >= 0 && nx < nw && grid[ny][nx] === '.') grid[ny][nx] = ch
        }
      }
    }
  }
  return { x: layer.x - 1, y: layer.y - 1, rows: grid.map((r) => r.join('')) }
}

// Grows a layer by one row at the bottom, then fills the pixel below every non
// transparent pixel. Used for the blunt personality's brow dilation.
function growBrowsBlunt(layer) {
  if (!layer) return layer
  const w = layer.rows[0] ? layer.rows[0].length : 0
  const h = layer.rows.length
  const grid = []
  for (let y = 0; y < h + 1; y += 1) grid.push(new Array(w).fill('.'))
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) grid[y][x] = layer.rows[y][x]
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ch = layer.rows[y][x]
      if (ch !== '.' && grid[y + 1][x] === '.') grid[y + 1][x] = ch
    }
  }
  return { x: layer.x, y: layer.y, rows: grid.map((r) => r.join('')) }
}

// Drops the top row of a layer. Used for the deadpan personality's half lidded eyes.
function cropTopRow(layer) {
  if (!layer) return layer
  return { x: layer.x, y: layer.y + 1, rows: layer.rows.slice(1) }
}

export function createMascot({ size = 96, personality = 'warm', hue = '#7FD1FF', state = 'idle' } = {}) {
  const canvas = document.createElement('canvas')
  canvas.className = 'mascot'

  let sizePx = size
  let scale = Math.max(1, Math.floor(sizePx / GRID))
  let curHue = hue
  let curPersonality = personality
  let currentStateName = state
  let destroyed = false

  // What is actually drawn right now, which can lag the target state during a morph
  // or be temporarily overridden by a blink.
  const disp = { brows: null, eyes: null, mouth: null, extra: null, thinkFrame: null }

  // Timers. Nod, poke and intense hold clean themselves up via `timers`. Morph and
  // blink chains get their own slots so a new setState can cancel a stale one
  // without disturbing an unrelated in-flight nod or poke.
  const timers = new Set()
  let morphTimer = null
  let blinkChainTimers = []
  let autoBlinkTimer = null
  let thinkInterval = null

  function addTimer(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  function isRowSize() {
    return sizePx === 28
  }

  function colours() {
    return { ground: '#0B0C0E', body: curHue, hi: tint(curHue, 0.3), shade: tint(curHue, -0.3) }
  }

  function currentTargetEyes() {
    const target = STATES[currentStateName]
    return target ? target.eyes : null
  }

  function paintedEyes() {
    let layer = disp.eyes
    if (curPersonality === 'warm') layer = growEyesWarm(layer)
    else if (curPersonality === 'deadpan') layer = cropTopRow(layer)
    return layer
  }

  function paintedBrows() {
    return curPersonality === 'blunt' ? growBrowsBlunt(disp.brows) : disp.brows
  }

  function render() {
    if (destroyed) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const c = colours()
    drawMap(ctx, BODY, c, scale)
    if (disp.extra) drawMap(ctx, disp.extra, c, scale)
    const brows = paintedBrows()
    if (brows) drawMap(ctx, brows, c, scale)
    const eyes = paintedEyes()
    if (eyes) drawMap(ctx, eyes, c, scale)
    if (disp.mouth) drawMap(ctx, disp.mouth, c, scale)
    else if (disp.thinkFrame) drawMap(ctx, disp.thinkFrame, c, scale)
  }

  function stopThinkCycle() {
    if (thinkInterval) {
      clearInterval(thinkInterval)
      thinkInterval = null
    }
    disp.thinkFrame = null
  }

  function startThinkCycle() {
    stopThinkCycle()
    let i = 0
    disp.thinkFrame = THINK_DOTS[0]
    render()
    thinkInterval = setInterval(() => {
      i = (i + 1) % THINK_DOTS.length
      disp.thinkFrame = THINK_DOTS[i]
      render()
    }, 300)
  }

  function updateBreathAttr() {
    if (isRowSize() || reducedMotion()) {
      delete canvas.dataset.anim
      return
    }
    if (IDLE_STATES.has(currentStateName)) canvas.dataset.anim = 'breath'
    else if (currentStateName === 'asleep') canvas.dataset.anim = 'sleep'
    else delete canvas.dataset.anim
  }

  // Plays a transform based CSS animation class, pausing idle/sleep breathing for
  // its duration so the two don't fight over the `transform` property, then
  // recomputes breathing eligibility fresh once it ends.
  function playTransformAnim(cls, duration) {
    if (destroyed) return
    delete canvas.dataset.anim
    canvas.classList.remove(cls)
    void canvas.offsetWidth
    canvas.classList.add(cls)
    addTimer(() => {
      canvas.classList.remove(cls)
      updateBreathAttr()
    }, duration)
  }

  function clearAutoBlinkTimer() {
    if (autoBlinkTimer) {
      clearTimeout(autoBlinkTimer)
      timers.delete(autoBlinkTimer)
      autoBlinkTimer = null
    }
  }

  function scheduleAutoBlink() {
    clearAutoBlinkTimer()
    if (isRowSize()) return
    if (!IDLE_STATES.has(currentStateName)) return
    const range = BLINK_RANGE[curPersonality] || BLINK_RANGE.warm
    const delay = range[0] + Math.random() * (range[1] - range[0])
    autoBlinkTimer = setTimeout(() => {
      timers.delete(autoBlinkTimer)
      autoBlinkTimer = null
      blink()
      scheduleAutoBlink()
    }, delay)
    timers.add(autoBlinkTimer)
  }

  function clearBlinkChain() {
    blinkChainTimers.forEach((id) => clearTimeout(id))
    blinkChainTimers = []
  }

  function blink() {
    if (destroyed) return
    clearBlinkChain()
    disp.eyes = EYES_CLOSED
    render()
    blinkChainTimers.push(setTimeout(() => {
      disp.eyes = currentTargetEyes()
      render()
    }, 140))
  }

  function slowBlink() {
    if (destroyed) return
    clearBlinkChain()
    disp.eyes = EYES_HALF
    render()
    blinkChainTimers.push(setTimeout(() => {
      disp.eyes = EYES_CLOSED
      render()
      blinkChainTimers.push(setTimeout(() => {
        disp.eyes = EYES_HALF
        render()
        blinkChainTimers.push(setTimeout(() => {
          disp.eyes = currentTargetEyes()
          render()
        }, 130))
      }, 260))
    }, 130))
  }

  function nod() {
    if (destroyed || isRowSize() || reducedMotion()) return
    playTransformAnim('is-nod', 260)
  }

  function poke() {
    if (destroyed) return
    blink()
    if (!isRowSize() && !reducedMotion()) playTransformAnim('is-poke', 100)
  }

  function setState(nextState, { intense = false } = {}) {
    if (destroyed) return
    const target = STATES[nextState]
    if (!target) return
    currentStateName = nextState
    canvas.dataset.state = nextState
    if (morphTimer) { clearTimeout(morphTimer); morphTimer = null }
    clearBlinkChain()
    stopThinkCycle()

    const rm = reducedMotion()
    if (rm) {
      disp.eyes = target.eyes
      disp.brows = target.brows
      disp.mouth = target.mouth
      disp.extra = target.extra || null
      render()
      if (nextState === 'thinking') startThinkCycle()
    } else {
      disp.eyes = target.eyes
      disp.extra = target.extra || null
      render()
      const delay = intense ? 60 : 40
      morphTimer = setTimeout(() => {
        morphTimer = null
        disp.brows = target.brows
        disp.mouth = target.mouth
        render()
        if (nextState === 'thinking') startThinkCycle()
        if (intense) playTransformAnim('is-intense', 380)
      }, delay)
    }
    updateBreathAttr()
    scheduleAutoBlink()
  }

  function setHue(hex) {
    curHue = hex
    render()
  }

  function setSize(px) {
    sizePx = px
    scale = Math.max(1, Math.floor(sizePx / GRID))
    canvas.width = GRID * scale
    canvas.height = GRID * scale
    canvas.style.width = `${sizePx}px`
    canvas.style.height = `${sizePx}px`
    canvas.dataset.size = String(sizePx)
    updateBreathAttr()
    scheduleAutoBlink()
    render()
  }

  function setPersonality(p) {
    curPersonality = p
    render()
    scheduleAutoBlink()
  }

  function destroy() {
    destroyed = true
    if (morphTimer) clearTimeout(morphTimer)
    clearBlinkChain()
    clearAutoBlinkTimer()
    stopThinkCycle()
    timers.forEach((id) => clearTimeout(id))
    timers.clear()
    canvas.remove()
  }

  // initial paint
  canvas.dataset.size = String(sizePx)
  canvas.width = GRID * scale
  canvas.height = GRID * scale
  canvas.style.width = `${sizePx}px`
  canvas.style.height = `${sizePx}px`
  const initial = STATES[currentStateName] || STATES.idle
  disp.eyes = initial.eyes
  disp.brows = initial.brows
  disp.mouth = initial.mouth
  disp.extra = initial.extra || null
  canvas.dataset.state = currentStateName
  render()
  if (currentStateName === 'thinking') startThinkCycle()
  updateBreathAttr()
  scheduleAutoBlink()

  return {
    el: canvas,
    setState,
    setHue,
    setSize,
    setPersonality,
    blink,
    slowBlink,
    nod,
    poke,
    destroy,
  }
}
