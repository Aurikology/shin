// Draws a live source (camera video or the demo shelf canvas) into a display canvas at one
// of three film looks. Everything is cover-fit cropped to the canvas aspect, downscaled onto a
// small reused offscreen canvas, then blown back up with smoothing off so it reads as pixel art.

const GB_PALETTE = ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F'] // dark to light
const BAYER2 = [
  [0, 2],
  [3, 1],
]

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const GB_RGB = GB_PALETTE.map(hexToRgb)

// The cover-fit crop of a sw by sh source into a dw by dh destination: the largest centred
// region of the source whose aspect matches the destination, so nothing is stretched.
function coverCrop(sw, sh, dw, dh) {
  const srcAspect = sw / sh
  const dstAspect = dw / dh
  let cw
  let ch
  if (srcAspect > dstAspect) {
    ch = sh
    cw = sh * dstAspect
  } else {
    cw = sw
    ch = sw / dstAspect
  }
  return { sx: (sw - cw) / 2, sy: (sh - ch) / 2, sw: cw, sh: ch }
}

// Ordered 2x2 dither of a luminance value (0..255) into one of 4 shade levels (0..3).
function quantiseLevel(luma, x, y) {
  const scaled = (luma / 255) * 3 // continuous 0..3
  const base = Math.floor(scaled)
  const frac = scaled - base
  const threshold = (BAYER2[y & 1][x & 1] + 0.5) / 4
  const level = frac > threshold ? base + 1 : base
  return clamp(level, 0, 3)
}

function copyCanvas(src) {
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  out.getContext('2d').drawImage(src, 0, 0)
  return out
}

export function createFeed(source, canvasEl, { mode = 'pixel' } = {}) {
  let currentMode = mode
  let running = false
  let paused = false
  let rafId = null
  let resizeObserver = null

  const ctx = canvasEl.getContext('2d', { alpha: false })
  ctx.imageSmoothingEnabled = false

  const off = document.createElement('canvas')
  const offCtx = off.getContext('2d', { willReadFrequently: true })

  function sourceSize() {
    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
      return { w: source.videoWidth, h: source.videoHeight }
    }
    return { w: source.width, h: source.height }
  }

  function resizeCanvas() {
    const rect = canvasEl.getBoundingClientRect()
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2)
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w
      canvasEl.height = h
    }
  }

  function attachResize() {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resizeCanvas())
      resizeObserver.observe(canvasEl)
    } else {
      window.addEventListener('resize', resizeCanvas)
    }
  }

  function detachResize() {
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
    window.removeEventListener('resize', resizeCanvas)
  }

  function offscreenHeightFor(m, dh) {
    // clamped so the look stays chunky even on a tall, high-dpr backing store
    if (m === 'pixel') return clamp(Math.round(dh / 4), 160, 220)
    if (m === 'gb') return clamp(Math.round(dh / 5), 110, 170)
    return dh // clean: full res, no downscale
  }

  function drawOneFrame(destOffCtx, destCanvas, m, dw, dh) {
    const { w: sw, h: sh } = sourceSize()
    if (!sw || !sh) return false
    const offH = offscreenHeightFor(m, dh)
    const offW = Math.max(1, Math.round(offH * (dw / dh)))
    if (destCanvas.width !== offW || destCanvas.height !== offH) {
      destCanvas.width = offW
      destCanvas.height = offH
    }
    const crop = coverCrop(sw, sh, offW, offH)
    destOffCtx.imageSmoothingEnabled = m === 'clean'
    destOffCtx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, offW, offH)
    if (m === 'gb') applyGbQuantise(destOffCtx, offW, offH)
    return true
  }

  function applyGbQuantise(offscreenCtx, w, h) {
    const imageData = offscreenCtx.getImageData(0, 0, w, h)
    const data = imageData.data
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        const rgb = GB_RGB[quantiseLevel(luma, x, y)]
        data[i] = rgb[0]
        data[i + 1] = rgb[1]
        data[i + 2] = rgb[2]
      }
    }
    offscreenCtx.putImageData(imageData, 0, 0)
  }

  function drawFrame() {
    const dw = canvasEl.width
    const dh = canvasEl.height
    if (!dw || !dh) return
    const ok = drawOneFrame(offCtx, off, currentMode, dw, dh)
    if (!ok) return
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, dw, dh)
  }

  function loop() {
    if (!running || paused) { rafId = null; return }
    drawFrame()
    rafId = requestAnimationFrame(loop)
  }

  function start() {
    running = true
    paused = false
    resizeCanvas()
    attachResize()
    if (!rafId) rafId = requestAnimationFrame(loop)
  }

  function stop() {
    running = false
    paused = false
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    detachResize()
  }

  function setMode(m) {
    currentMode = m
  }

  function freeze() {
    paused = true
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    if (currentMode === 'clean') {
      // the live offscreen is full res in clean mode, scan still needs a low-res frame
      const dw = canvasEl.width || 1
      const dh = canvasEl.height || 1
      const lowRes = document.createElement('canvas')
      const lowCtx = lowRes.getContext('2d')
      drawOneFrame(lowCtx, lowRes, 'pixel', dw, dh)
      return lowRes
    }
    return copyCanvas(off)
  }

  function resume() {
    if (!running) return
    paused = false
    if (!rafId) rafId = requestAnimationFrame(loop)
  }

  return {
    start,
    stop,
    setMode,
    get mode() { return currentMode },
    freeze,
    resume,
  }
}
