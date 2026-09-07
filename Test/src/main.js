// The lead module. Drives every screen, owns every mascot instance, and is the only
// module that reads LINES. Everything else is a part with a fixed interface.
import { createMascot } from './mascot/mascot.js'
import { line } from './mascot/lines.js'
import { startCamera } from './camera.js'
import { createFeed } from './feed.js'
import { createDemoShelf } from './demo-shelf.js'
import { findBox, identify } from './scan.js'
import { match, verdict, formatPrice, CATALOGUE } from './catalogue.js'
import { iconCanvas } from './icons.js'
import { sfx } from './audio.js'
import { digitise, sweep, lockBrackets, flash, riffle } from './ui/scanfx.js'

const $ = (id) => document.getElementById(id)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const HUE = {
  idle: '#7FD1FF',
  thinking: '#7FD1FF',
  asking: '#7FD1FF',
  pleased: '#7FD1FF',
  nudging: '#7FD1FF',
  asleep: '#7FD1FF',
  proud: '#7FD1FF',
  good: '#38E08B',
  delighted: '#38E08B',
  fair: '#FFC24D',
  walk: '#FF6A45',
  angry: '#FF6A45',
  unknown: '#93A0AC',
}

const TIER_WORD = { good: 'GOOD', fair: 'FAIR', walk: 'HIGH' }
const FILM_MODES = ['pixel', 'gb', 'clean']
const FILM_LABEL = { pixel: 'PIXEL', gb: 'GB', clean: 'CLEAN' }

// ---------- persisted preferences ----------
const store = {
  get(k, d) {
    try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v) } catch { return d }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode, fine */ }
  },
}

const state = {
  personality: store.get('pc.personality', null),
  film: store.get('pc.film', 'pixel'),
  muted: store.get('pc.muted', false),
  seq: 0,
  feed: null,
  camera: null,
  shelf: null,
  scanning: false,
  escalated: false,
  escalateTimer: null,
  current: null, // { result, candidateIndex, product, verdict }
  watched: false,
}

// ---------- mascots ----------
const faces = {}
function mountFace(name, hostId, size, opts = {}) {
  const host = $(hostId)
  const m = createMascot({ size, personality: state.personality || 'warm', hue: HUE.idle, state: 'idle', ...opts })
  host.replaceChildren(m.el)
  faces[name] = m
  return m
}

function setPersonalityEverywhere(p) {
  state.personality = p
  store.set('pc.personality', p)
  Object.values(faces).forEach((m) => m.setPersonality(p))
}

function say(key, vars) {
  return line(key, state.personality || 'warm', vars)
}

// ---------- typewriter ----------
const typing = new WeakMap()
function typeText(el, text, { cps = 45, sound = true } = {}) {
  const prev = typing.get(el)
  if (prev) prev.cancel()
  el.textContent = ''
  if (reduced()) { el.textContent = text; return Promise.resolve() }
  let i = 0
  let stopped = false
  const p = new Promise((resolve) => {
    const tick = () => {
      if (stopped) return
      i += 1
      el.textContent = text.slice(0, i)
      if (sound && i % 2 === 0) sfx.type()
      if (i < text.length) setTimeout(tick, 1000 / cps)
      else resolve()
    }
    tick()
  })
  typing.set(el, { cancel: () => { stopped = true; el.textContent = text } })
  return p
}

// ---------- screens ----------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.dataset.screen !== name })
  $('app').dataset.screen = name
}

// ---------- boot ----------
async function boot() {
  showScreen('boot')
  mountFace('boot', 'boot-face', 96)
  sfx.setMuted(state.muted)
  syncSoundButton()
  await Promise.race([document.fonts?.ready, wait(900)].filter(Boolean))
  await wait(1200)
  if (state.personality) primer()
  else picker()
}

// ---------- attitude picker ----------
function picker() {
  showScreen('picker')
  const cards = [...document.querySelectorAll('.picker-card')]
  cards.forEach((card) => {
    const p = card.dataset.personality
    const host = card.querySelector('.picker-face')
    const m = createMascot({ size: 96, personality: p, hue: HUE.fair, state: 'fair' })
    host.replaceChildren(m.el)
    faces[`picker-${p}`] = m
    card.querySelector('.picker-line').textContent = line('picker', p)
    card.classList.remove('is-picked', 'is-faded')
    card.disabled = false
  })
  let done = false
  cards.forEach((card) => {
    card.onclick = async () => {
      if (done) return
      done = true
      sfx.unlock()
      sfx.blip()
      const p = card.dataset.personality
      const m = faces[`picker-${p}`]
      cards.forEach((c) => { c.disabled = true; if (c !== card) c.classList.add('is-faded') })
      card.classList.add('is-picked')
      m.setState('pleased')
      m.nod()
      sfx.nod()
      card.querySelector('.picker-line').textContent = line('picked', p)
      setPersonalityEverywhere(p)
      await wait(700)
      primer()
    }
  })
}

// ---------- primer ----------
function primer() {
  showScreen('primer')
  const m = mountFace('primer', 'primer-face', 48)
  m.setState('asking')
  typeText($('primer-line'), say('primer'))
  $('primer-allow').onclick = async () => {
    sfx.unlock(); sfx.blip()
    $('primer-allow').disabled = true
    try {
      state.camera = await startCamera($('cam-video'))
      openCamera($('cam-video'), false)
    } catch (err) {
      console.warn('camera unavailable, using the demo shelf', err)
      openCamera(null, true)
    }
  }
  $('primer-skip').onclick = () => { sfx.unlock(); sfx.blip(); openCamera(null, true) }
}

// ---------- camera ----------
function openCamera(video, demo) {
  showScreen('camera')
  const canvas = $('feed')
  let source = video
  if (demo) {
    state.shelf = createDemoShelf()
    state.shelf.start()
    source = state.shelf.canvas
  }
  state.feed = createFeed(source, canvas, { mode: state.film })
  state.feed.start()
  $('film-btn').textContent = FILM_LABEL[state.film]

  if (state.camera?.torch?.supported) {
    const tb = $('torch-btn')
    tb.hidden = false
    let on = false
    tb.onclick = () => { on = !on; state.camera.torch.set(on); tb.classList.toggle('is-on', on); sfx.blip() }
  }

  mountFace('hint', 'hint-face', 28)
  mountFace('chip', 'chip-face', 28)
  mountFace('working', 'working-face', 76)
  faces.hint.el.onclick = () => pokeInPill(faces.hint, $('hint-line'))

  $('film-btn').onclick = () => {
    sfx.blip()
    const i = (FILM_MODES.indexOf(state.feed.mode) + 1) % FILM_MODES.length
    state.film = FILM_MODES[i]
    store.set('pc.film', state.film)
    state.feed.setMode(state.film)
    $('film-btn').textContent = FILM_LABEL[state.film]
  }
  $('sound-btn').onclick = () => {
    sfx.unlock()
    state.muted = !state.muted
    store.set('pc.muted', state.muted)
    sfx.setMuted(state.muted)
    syncSoundButton()
    if (!state.muted) sfx.blip()
  }
  $('shutter').onclick = () => { sfx.unlock(); scan() }
  $('chip-notit').onclick = (e) => { e.stopPropagation(); sfx.blip(); notIt() }
  $('sheet-again').onclick = () => { sfx.blip(); resetToIdle() }
  $('sheet-secondary').onclick = () => sheetSecondary()
  wireSheetDrag()

  idle(demo ? 'denied' : 'aim')
}

function syncSoundButton() {
  const b = $('sound-btn')
  b.classList.toggle('is-muted', state.muted)
  b.querySelector('.hud-icon').dataset.icon = state.muted ? 'mute' : 'sound'
  paintHudIcons()
}

function paintHudIcons() {
  document.querySelectorAll('.hud-icon').forEach((span) => {
    const name = span.dataset.icon
    if (span.dataset.painted === name) return
    span.dataset.painted = name
    span.replaceChildren(iconCanvas(name, 24, { body: '#F7F5F2', ground: '#0B0C0E' }))
  })
}

function idle(lineKey) {
  const pill = $('hint-pill')
  pill.hidden = false
  pill.classList.remove('is-leaving')
  faces.hint.setHue(HUE.idle)
  faces.hint.setState('idle')
  typeText($('hint-line'), say(lineKey), { sound: false })
  $('shutter').disabled = false
  clearTimeout(state.escalateTimer)
  if (!state.escalated) {
    state.escalateTimer = setTimeout(() => {
      if (state.scanning || state.escalated) return
      state.escalated = true
      faces.hint.setState('asking')
      typeText($('hint-line'), say('escalated'), { sound: false })
    }, 4000)
  }
}

function pokeInPill(m, textEl) {
  if (state.scanning) return
  sfx.unlock(); sfx.blip()
  m.poke()
  const keys = ['poke1', 'poke2', 'poke3']
  const key = keys[Math.floor(Math.random() * keys.length)]
  const before = textEl.textContent
  typeText(textEl, say(key), { sound: false })
  setTimeout(() => { if (!state.scanning) typeText(textEl, before, { sound: false }) }, 1600)
}

// ---------- the scan ----------
async function scan() {
  if (state.scanning) return
  state.scanning = true
  clearTimeout(state.escalateTimer)
  $('shutter').disabled = true
  const overlay = $('overlay')
  const canvas = $('feed')

  sfx.shutter()
  flash(overlay)
  const pill = $('hint-pill')
  pill.classList.add('is-leaving')
  setTimeout(() => { pill.hidden = true }, 120)

  const frozen = state.feed.freeze()
  const box = findBox(frozen)
  state.seq += 1
  const result = identify(frozen, state.seq)
  state.current = { result, candidateIndex: 0, product: null, verdict: null }

  // working panel
  const working = $('working')
  working.hidden = false
  faces.working.setHue(HUE.idle)
  faces.working.setState('thinking')
  const stepEl = $('working-step')
  swapStep(stepEl, say('step1'))

  await digitise(canvas, frozen, { duration: 600 })
  swapStep(stepEl, say('step2'))
  await sweep(overlay)
  swapStep(stepEl, say('step3'))
  await lockBrackets(overlay, box)
  await wait(200)

  working.hidden = true

  if (!result.found) {
    await runRiffle(-1)
    return refuse()
  }

  showChip(box)
  await wait(900)
  await resolveCandidate()
}

function swapStep(el, text) {
  el.classList.remove('is-swapping')
  void el.offsetWidth
  el.classList.add('is-swapping')
  el.textContent = text
  sfx.step()
}

function showChip(box) {
  const chip = $('chip')
  const overlay = $('overlay')
  const H = overlay.clientHeight
  chip.style.top = `${Math.round((box.y + box.h) * H) + 10}px`
  chip.hidden = false
  faces.chip.setHue(HUE.idle)
  faces.chip.setState('thinking')
  const label = state.current.result.candidates[state.current.candidateIndex].label
  typeText($('chip-text'), say('chip', { name: label }), { sound: false })
}

async function notIt() {
  const cur = state.current
  if (!cur || !cur.result.found) return
  cur.candidateIndex = (cur.candidateIndex + 1) % cur.result.candidates.length
  faces.chip.setState('asking')
  typeText($('chip-text'), say('wrong'), { sound: false })
  hideSheet()
  await wait(500)
  faces.chip.setState('thinking')
  const label = cur.result.candidates[cur.candidateIndex].label
  typeText($('chip-text'), say('chip', { name: label }), { sound: false })
  await wait(600)
  await resolveCandidate()
}

async function resolveCandidate() {
  const cur = state.current
  const cand = cur.result.candidates[cur.candidateIndex]
  const product = match(cand.id)
  const landOn = product ? CATALOGUE.findIndex((p) => p.id === product.id) : -1
  await runRiffle(landOn)
  if (!product) return refuse()
  cur.product = product
  cur.verdict = verdict(cur.result.asking, product)
  showVerdict()
}

async function runRiffle(landOn) {
  const el = $('riffle')
  el.hidden = false
  const cards = CATALOGUE.map((p) => ({ icon: p.category, label: p.name }))
  await riffle(el, { cards, landOn })
  if (landOn >= 0) sfx.match(); else sfx.nomatch()
  await wait(350)
  el.hidden = true
}

// ---------- the sheet ----------
function showVerdict() {
  const { result, product, verdict: v } = state.current
  const sheet = $('sheet')
  const stateName = v.thin ? v.tier : v.state
  sheet.dataset.tier = v.tier
  sheet.dataset.thin = v.thin ? 'true' : 'false'
  sheet.dataset.kind = 'verdict'

  const m = faces.sheet || mountFace('sheet', 'sheet-face', 96)
  m.setHue(HUE[stateName])
  m.setState(stateName, { intense: !v.thin && (v.state === 'delighted' || v.state === 'angry') })
  m.el.onclick = () => { sfx.blip(); m.nod() }

  const vars = { tag: formatPrice(result.asking), going: formatPrice(product.going), name: product.name, seller: result.seller }
  const key = v.thin ? `${v.tier}_thin` : v.state
  $('sheet-headline').textContent = say(key, vars)

  $('product-icon').replaceChildren(iconCanvas(product.category, 48, { body: HUE[stateName], ground: '#0B0C0E' }))
  $('product-name').textContent = product.name
  $('product-size').textContent = product.size
  $('tier-chip').textContent = TIER_WORD[v.tier]
  $('prices').hidden = false
  $('price-tag').textContent = formatPrice(result.asking)
  $('price-going').textContent = formatPrice(product.going)
  $('price-seller').textContent = result.seller
  $('provenance').textContent = v.thin
    ? `GOING RATE FROM 1 SELLER. THIN.`
    : `GOING RATE IS THE MEDIAN OF ${product.sellers} SELLERS. LOW ${formatPrice(product.low)}, HIGH ${formatPrice(product.high)}.`
  $('repair').hidden = true

  state.watched = false
  const sec = $('sheet-secondary')
  sec.textContent = 'WATCH'
  sec.disabled = false
  sec.dataset.role = 'watch'

  riseSheet(false)
  sfx.land(v.tier)
}

function refuse() {
  const sheet = $('sheet')
  sheet.dataset.tier = 'unknown'
  sheet.dataset.thin = 'false'
  sheet.dataset.kind = 'refusal'

  const m = faces.sheet || mountFace('sheet', 'sheet-face', 96)
  m.setHue(HUE.unknown)
  m.setState('unknown')
  m.el.onclick = () => { sfx.blip(); m.slowBlink() }

  const cur = state.current
  const stepName = cur && cur.result.found ? 'Matching' : 'Identifying'
  const detail = cur && cur.result.found ? `0 OF ${CATALOGUE.length} CARDS FIT.` : 'NOTHING I RECOGNISE IN FRAME.'
  $('sheet-headline').textContent = say('refuse')
  $('product-icon').replaceChildren(iconCanvas('unknown', 48, { body: HUE.unknown, ground: '#0B0C0E' }))
  $('product-name').textContent = cur && cur.result.found ? cur.result.candidates[cur.candidateIndex].label : 'UNKNOWN THING'
  $('product-size').textContent = say('refuse_why', { step: stepName })
  $('tier-chip').textContent = 'NO CALL'
  $('prices').hidden = true
  $('provenance').textContent = `${detail} TYPE IT AND I WILL LOOK.`
  $('repair').hidden = true

  const sec = $('sheet-secondary')
  sec.textContent = 'TYPE IT'
  sec.disabled = false
  sec.dataset.role = 'type'

  riseSheet(true)
  m.slowBlink()
}

function riseSheet(refusal) {
  const sheet = $('sheet')
  sheet.hidden = false
  sheet.classList.remove('is-landing', 'is-landing-refusal', 'is-dismissed')
  void sheet.offsetWidth
  sheet.classList.add(refusal ? 'is-landing-refusal' : 'is-landing')
  sheet.style.transform = ''
}

function hideSheet() {
  const sheet = $('sheet')
  if (sheet.hidden) return
  sheet.classList.add('is-dismissed')
  setTimeout(() => { sheet.hidden = true; sheet.classList.remove('is-dismissed') }, 200)
}

function sheetSecondary() {
  const sec = $('sheet-secondary')
  sfx.blip()
  if (sec.dataset.role === 'watch') {
    if (state.watched) return
    state.watched = true
    sec.textContent = 'WATCHING'
    sec.disabled = true
    toast('pleased', say('watched'))
    sfx.nod()
  } else {
    $('repair').hidden = false
    $('repair-input').focus()
    faces.sheet.setState('asking')
    $('sheet-headline').textContent = say('typeit')
    $('repair-input').onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); toast('pleased', say('typed')); sfx.nod(); $('repair-input').blur() }
    }
  }
}

function toast(faceState, text) {
  const t = $('toast')
  const m = faces.toast || mountFace('toast', 'toast-face', 62)
  m.setHue(HUE[faceState] || HUE.idle)
  m.setState(faceState)
  m.nod()
  $('toast-text').textContent = text
  t.hidden = false
  t.classList.remove('is-out')
  clearTimeout(t._timer)
  t._timer = setTimeout(() => {
    t.classList.add('is-out')
    setTimeout(() => { t.hidden = true }, 200)
  }, 1600)
}

function wireSheetDrag() {
  const sheet = $('sheet')
  const grip = sheet.querySelector('.sheet-grip')
  let startY = null
  const onDown = (e) => { startY = e.clientY; sheet.style.transition = 'none' }
  const onMove = (e) => {
    if (startY === null) return
    const dy = Math.max(0, e.clientY - startY)
    sheet.style.transform = `translateY(${Math.round(dy / 8) * 8}px)`
  }
  const onUp = (e) => {
    if (startY === null) return
    const dy = e.clientY - startY
    startY = null
    sheet.style.transition = ''
    sheet.style.transform = ''
    if (dy > 90) { sfx.blip(); resetToIdle() }
  }
  ;[grip, sheet.querySelector('.sheet-head')].forEach((h) => {
    h.addEventListener('pointerdown', onDown)
  })
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

function resetToIdle() {
  hideSheet()
  $('chip').hidden = true
  $('working').hidden = true
  $('riffle').hidden = true
  const reticle = $('reticle')
  reticle.classList.remove('is-locked')
  reticle.style.cssText = ''
  state.feed.resume()
  state.scanning = false
  state.current = null
  idle('aim')
}

// ---------- go ----------
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true })
boot()
