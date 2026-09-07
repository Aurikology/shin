// The scan effects. Digitise, sweep, lock, flash, riffle. Everything steps, nothing tweens.
import './scanfx.css'
import { iconCanvas } from '../icons.js'

const CARD_COLOURS = { body: '#F7F5F2', ground: '#0B0C0E' }

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Draws img into ctx cover-fit (crops to fill dw by dh, keeps aspect), no smoothing.
function drawCover(ctx, img, dw, dh) {
  const sw = img.width
  const sh = img.height
  if (!sw || !sh || !dw || !dh) return
  const scale = Math.max(dw / sw, dh / sh)
  const cw = dw / scale
  const ch = dh / scale
  const sx = (sw - cw) / 2
  const sy = (sh - ch) / 2
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, dw, dh)
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, dw, dh)
}

// One digitise frame at a given pixel-size factor. factor 1 draws the frozen frame
// straight through (its native pixel size). factor > 1 downsamples through a tiny
// intermediate canvas first, then blows that back up with smoothing off, so the
// blocks are visibly bigger, then draws it cover-fit onto the feed canvas.
function digitiseStep(ctx, feedCanvas, frozen, factor) {
  const dw = feedCanvas.width
  const dh = feedCanvas.height
  if (factor <= 1) {
    drawCover(ctx, frozen, dw, dh)
    return
  }
  const iw = Math.max(1, Math.round(frozen.width / factor))
  const ih = Math.max(1, Math.round(frozen.height / factor))
  const tiny = document.createElement('canvas')
  tiny.width = iw
  tiny.height = ih
  const tctx = tiny.getContext('2d')
  tctx.imageSmoothingEnabled = false
  tctx.drawImage(frozen, 0, 0, frozen.width, frozen.height, 0, 0, iw, ih)
  drawCover(ctx, tiny, dw, dh)
}

// Animates the digitise payoff on feedCanvas: pixel size steps up then back down,
// six deliberate frames, ending on the frozen frame at its native size.
export function digitise(feedCanvas, frozenLowRes, { duration = 600 } = {}) {
  return new Promise((resolve) => {
    if (!frozenLowRes || !frozenLowRes.width || !frozenLowRes.height) {
      resolve()
      return
    }
    const ctx = feedCanvas.getContext('2d')
    const steps = [1, 2, 4, 8, 4, 1]
    const stepMs = duration / steps.length
    let i = 0
    const tick = () => {
      digitiseStep(ctx, feedCanvas, frozenLowRes, steps[i])
      i += 1
      if (i < steps.length) setTimeout(tick, stepMs)
      else resolve()
    }
    tick()
  })
}

// One pass of the scan line, top to bottom, 500ms.
export function sweep(overlayEl) {
  return new Promise((resolve) => {
    const el = overlayEl.querySelector('#sweep')
    if (!el) {
      resolve()
      return
    }
    el.hidden = false
    el.classList.remove('is-sweeping')
    void el.offsetWidth // reflow, so a repeat call restarts the animation
    el.classList.add('is-sweeping')
    setTimeout(() => {
      el.classList.remove('is-sweeping')
      el.hidden = true
      resolve()
    }, 500)
  })
}

// Reads an element's box relative to a positioned ancestor, in pixels.
function rectRelativeTo(el, parent) {
  const r = el.getBoundingClientRect()
  const p = parent.getBoundingClientRect()
  return { left: r.left - p.left, top: r.top - p.top, width: r.width, height: r.height }
}

// Contracts the reticle from wherever it is onto box (fractions of overlayEl), 300ms,
// then a two-frame flash of the bracket colour to white and back.
export function lockBrackets(overlayEl, box) {
  return new Promise((resolve) => {
    const reticle = overlayEl.querySelector('#reticle')
    if (!reticle) {
      resolve()
      return
    }
    const W = overlayEl.clientWidth
    const H = overlayEl.clientHeight

    // Capture wherever the reticle currently renders (its centred default position
    // may come from a transform) and pin that down as explicit inline values first,
    // so the transition below has a real starting point instead of jumping.
    const start = rectRelativeTo(reticle, overlayEl)
    reticle.style.transform = 'none'
    reticle.style.left = `${start.left}px`
    reticle.style.top = `${start.top}px`
    reticle.style.width = `${start.width}px`
    reticle.style.height = `${start.height}px`
    void reticle.offsetWidth // force reflow before the class/target change

    reticle.classList.add('is-locked')
    reticle.style.left = `${box.x * W}px`
    reticle.style.top = `${box.y * H}px`
    reticle.style.width = `${box.w * W}px`
    reticle.style.height = `${box.h * H}px`

    setTimeout(() => {
      reticle.classList.add('is-flash')
      setTimeout(() => {
        reticle.classList.remove('is-flash')
        resolve()
      }, 160) // two frames, held then released, no fade
    }, 300)
  })
}

// White full-cover flash, 120ms. Not a promise, fire and forget like a shutter.
export function flash(overlayEl) {
  const el = overlayEl.querySelector('#flash')
  if (!el) return
  el.style.opacity = reducedMotion() ? '0.4' : '1'
  el.hidden = false
  setTimeout(() => {
    el.hidden = true
    el.style.opacity = ''
  }, 120)
}

// Picks `count` indices spread evenly across [0, total - 1], forcing the last one
// to landOn when landOn is a real index (>= 0). Leaves the spread alone otherwise.
function spreadIndices(total, count, landOn) {
  const idx = []
  const last = Math.max(0, total - 1)
  for (let i = 0; i < count; i++) {
    idx.push(count > 1 ? Math.round((i * last) / (count - 1)) : last)
  }
  if (landOn >= 0) idx[count - 1] = landOn
  return idx
}

function buildRiffleCard(cardData, indexNumber, total, extraClasses) {
  const card = document.createElement('div')
  card.className = ['riffle-card', ...extraClasses].join(' ')

  const iconWrap = document.createElement('div')
  iconWrap.className = 'riffle-card-icon'
  iconWrap.appendChild(iconCanvas(cardData.icon, 32, CARD_COLOURS))

  const label = document.createElement('div')
  label.className = 'riffle-card-label'
  label.textContent = cardData.label

  const idxEl = document.createElement('div')
  idxEl.className = 'riffle-card-index'
  idxEl.textContent = `${String(indexNumber).padStart(2, '0')} / ${total}`

  card.append(iconWrap, label, idxEl)
  return card
}

// Riffles through the catalogue as a stack of cards in the centre of containerEl,
// eight cards at 60ms each, landing on landOn (or a blank card if landOn is -1).
export function riffle(containerEl, { cards, landOn }) {
  return new Promise((resolve) => {
    const total = cards.length
    const steps = spreadIndices(total, 8, landOn)
    const isBlankFinal = landOn === -1
    const reduced = reducedMotion()

    function renderStep(i, isLast) {
      const dataIndex = steps[i]
      const isBlank = isLast && isBlankFinal
      const cardData = isBlank ? { icon: 'unknown', label: 'NO MATCH' } : cards[dataIndex]
      const extra = []
      if (isBlank) extra.push('is-blank')
      if (isLast && !isBlank) extra.push('is-landed')
      if (!reduced) extra.push('is-entering')
      const card = buildRiffleCard(cardData, dataIndex + 1, total, extra)
      containerEl.replaceChildren(card)
    }

    if (reduced) {
      renderStep(7, true)
      setTimeout(resolve, 200)
      return
    }

    let i = 0
    const step = () => {
      const isLast = i === 7
      renderStep(i, isLast)
      if (isLast) setTimeout(resolve, 200)
      else { i += 1; setTimeout(step, 60) }
    }
    step()
  })
}
