// Every frame of "Pexi reacts", a 16 s looping reel, drawn with canvas 2D.
// renderFrame(ctx, frame) is pure: the same frame number always draws the same picture.
//
// The format is October 2026's "My reaction to ___" Reels trend (Later, 23 Oct; NewEngen,
// 1 Oct): one held caption, a number that climbs round by round, a reaction that grows with
// it, the biggest saved for last, on original audio. Pexi's version: the same sneaker, its
// asking price climbing, Pexi going from a flat stare to furious, then a twist (a steal) for
// the biggest reaction, the sign-off, and the price counting back up into frame one.
// Flat-field house style from the Pexi Ads design system: a new solid field every round,
// verdict hues only on that verdict's round, Pexi bare, Outfit headlines, Inter Tight lines.
//    0.0 $120 idle   2.0 $150 fair   4.0 $180 side-eye   6.0 $260 angry   8.5 $59 delighted
//   11.0 sign-off   13.5 the count back up to $120, cutting into frame one
(function () {
const W = 1080, H = 1920, FPS = 30, DUR = 16;
const SAFE = { x0: 154, y0: 285, x1: 925, y1: 1635 };

// app/public/css/tokens.css; field-* from the design system
const C = {
  night: '#0D0B13', ink: '#F7F5F2', muted: '#A5ADB8', brand: '#E5165E', navy: '#12233A',
  mist: '#F1F1F4', cyan: '#2BB5F0', orange: '#F26B1D',
  good: '#12B76A', goodOn: '#04140C', walk: '#C23619', fair: '#E8A020', fairOn: '#1F1400', fairBright: '#FFC24D',
};
const FD = "'Outfit'", FU = "'Inter Tight'", FM = "'IBM Plex Mono'";
const T = { r1: 0, r2: 2.0, r3: 4.0, r4: 6.0, twist: 8.5, sign: 11.0, count: 13.5 };
const USUAL = 'Usually about $120';

let IMG = {};
let LOG = null;

// ---------- maths ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const eExpo = x => { x = clamp(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); };
const eInOut = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eBack = (x, s = 1.4) => { x = clamp(x); const c = s + 1; return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
const popS = (t, t0, d = 0.5) => eBack((t - t0) / d, 2.2);
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function reg(ctx, kind, label, x0, y0, x1, y1) {
  if (!LOG) return;
  const m = ctx.getTransform();
  const p = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  LOG.push({ kind, label, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
}

// ---------- type ----------
const FONTS = {
  head: (s) => `800 ${s}px ${FD}`,
  ui: (s, w = 500) => `${w} ${s}px ${FU}`,
  mono: (s) => `600 ${s}px ${FM}`,
};
// Centred text, logged for the safe-box check.
function ctext(ctx, s, x, y, font, col, track = 0) {
  ctx.save(); ctx.font = font; ctx.letterSpacing = `${track}px`; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.fillText(s, x, y);
  const m = ctx.measureText(s); ctx.restore();
  reg(ctx, 'text', s, x - m.width / 2, y - m.actualBoundingBoxAscent, x + m.width / 2, y + m.actualBoundingBoxDescent);
}
// A word rising out of a mask from below (the house motion for words).
function rise(ctx, s, x, y, size, font, col, t, t0, track) {
  const p = eExpo((t - t0) / 0.6);
  if (p <= 0.01) return;
  ctx.save(); ctx.beginPath(); ctx.rect(0, y - size * 1.05, W, size * 1.35); ctx.clip();
  ctx.font = font; ctx.letterSpacing = `${track}px`; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.fillText(s, x, y + (1 - p) * size * 1.1);
  const m = ctx.measureText(s); ctx.restore();
  if (p > 0.6) reg(ctx, 'text', s, x - m.width / 2, y - m.actualBoundingBoxAscent, x + m.width / 2, y + m.actualBoundingBoxDescent);
}

// The Wordmark: "pexi" in Inter Tight 700 with a round brand full stop.
function logo(ctx, cx, cy, size, inkCol = C.ink) {
  ctx.save(); ctx.font = FONTS.ui(size, 700); ctx.letterSpacing = `${-0.035 * size}px`; ctx.textBaseline = 'alphabetic';
  const w = ctx.measureText('pexi').width, r = size * 0.085, gap = size * 0.05;
  const total = w + gap + 2 * r, x0 = cx - total / 2, by = cy + size * 0.28;
  ctx.fillStyle = inkCol; ctx.textAlign = 'left'; ctx.fillText('pexi', x0, by);
  ctx.beginPath(); ctx.arc(x0 + w + gap + r, by - r, r, 0, 7); ctx.fillStyle = C.brand; ctx.fill();
  const m = ctx.measureText('pexi');
  reg(ctx, 'text', 'pexi.', x0, by - m.actualBoundingBoxAscent, x0 + total, by + m.actualBoundingBoxDescent);
  ctx.restore();
}

// ---------- objects ----------
function field(ctx, col) { ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); }
function sparkle(ctx, x, y, r, col, rot = 0) {
  if (r <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    ctx.quadraticCurveTo(0, 0, Math.cos(a) * r, Math.sin(a) * r);
    ctx.quadraticCurveTo(0, 0, Math.cos(a + Math.PI / 2) * r, Math.sin(a + Math.PI / 2) * r);
  }
  ctx.fillStyle = col; ctx.fill(); ctx.restore();
}
function contactShadow(ctx, y, w, a = 0.26) {
  ctx.save(); ctx.translate(0, y); ctx.scale(1, 0.13);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(20,20,45,${a})`); g.addColorStop(1, 'rgba(20,20,45,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w, 0, 7); ctx.fill(); ctx.restore();
}
// The studio sneaker (../launch-meet-pexi/products/shoe.png), about 640 x 288 at s = 1, floating.
function sneaker(ctx, cx, cy, s, t) {
  ctx.save(); ctx.translate(cx, cy + Math.sin(t * 1.6) * 8); ctx.scale(s, s);
  contactShadow(ctx, 126, 320);
  const img = IMG.shoe, h = 288, w = h * img.width / img.height;
  ctx.drawImage(img, 10 - w / 2, -170, w, h);
  ctx.restore();
  reg(ctx, 'product', 'sneaker', cx - 300 * s, cy - 170 * s, cx + 320 * s, cy + 130 * s);
}
// Pexi, bare, as he ships: scaled, never redrawn. `shake` jolts him, `squash` lands him.
const FACE_FRAC = 81 / 88;
function pexi(ctx, img, cx, cy, size, t, t0, o = {}) {
  const q = popS(t, t0, 0.45);
  if (q <= 0) return;
  const tl = t - t0, bob = Math.sin(t * 2.2) * size * 0.02;
  let dx = 0, rot = Math.sin(t * 2.4) * 0.04;
  if (o.shake) { const k = clamp(1 - (tl - 0.3) / 0.9); dx = Math.sin(tl * 70) * 16 * k * (tl > 0.3 ? 1 : 0); rot += Math.sin(tl * 55) * 0.05 * k * (tl > 0.3 ? 1 : 0); }
  ctx.save(); ctx.translate(cx + dx, cy + bob); ctx.rotate(rot); ctx.scale(q, q);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
  const r = size * FACE_FRAC / 2;
  if (q > 0.6) reg(ctx, 'face', 'mascot', cx - r, cy - r, cx + r, cy + r);
}
const VERDICT = {
  bad: { word: 'Bad price', fill: C.walk, on: '#fff' },
  fair: { word: 'Reasonable', fill: C.fair, on: C.fairOn },
  great: { word: 'Great price', fill: C.good, on: C.goodOn },
};
// The verdict pill, the app's words, popping in. On the field of its own colour it takes a
// white ring so it still reads.
function verdict(ctx, v, cx, cy, t, t0, ring) {
  const q = popS(t, t0, 0.45); if (q <= 0) return;
  const V = VERDICT[v], size = 46;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(q, q);
  ctx.font = FONTS.ui(size, 700); const w = ctx.measureText(V.word).width + size * 1.3, h = size * 1.7;
  rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = V.fill; ctx.fill();
  if (ring) { ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke(); }
  ctx.fillStyle = V.on; ctx.textAlign = 'center'; ctx.fillText(V.word, 0, size * 0.36);
  if (q > 0.6) reg(ctx, 'text', V.word, -w / 2, -h / 2, w / 2, h / 2);
  ctx.restore();
}
// Pexi's spoken line (ad-say): Inter Tight 700 on a white pill, popping in.
function say(ctx, s, cx, cy, t, t0) {
  const q = popS(t, t0, 0.45); if (q <= 0) return;
  const size = 46;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(q, q); ctx.rotate(-0.03);
  ctx.font = FONTS.ui(size, 700); ctx.letterSpacing = `${-0.02 * size}px`;
  const w = ctx.measureText(s).width + size * 1.2, h = size * 1.75;
  ctx.save(); ctx.shadowColor = 'rgba(10,10,30,.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  ctx.fillStyle = C.navy; ctx.textAlign = 'center'; ctx.fillText(s, 0, size * 0.36);
  if (q > 0.6) reg(ctx, 'text', s, -w / 2, -h / 2, w / 2, h / 2);
  ctx.restore();
}

// ---------- the round ----------
// Every round is the same frame, so only the price, the face and the field change: the
// trend's held caption on top, the price slammed in huge, the sneaker, Pexi, the verdict.
// `held` is true when the caption was already on screen at the cut (so it does not rise again).
function caption(ctx, t, t0, ink, held) {
  const tc = held ? -10 : t0;
  rise(ctx, "Pexi's reaction to", 540, 390, 70, FONTS.head(70), ink, t, tc, -2.8);
  rise(ctx, 'sneaker prices', 540, 470, 70, FONTS.head(70), ink, t, tc + 0.08, -2.8);
}
function price(ctx, s, t, t0, ink, size = 250) {
  // slams down from 1.18x about its middle, so it never grows into the caption
  const p = clamp((t - t0) / 0.22), k = 1 + 0.18 * (1 - eExpo(p));
  if (t < t0) return;
  ctx.save(); ctx.translate(540, 610); ctx.scale(k, k); ctx.globalAlpha = clamp(0.6 + p * 2);
  ctextNoLog(ctx, s, 0, 90, FONTS.head(size), ink, -0.04 * size);
  ctx.restore();
  if (p >= 1) { ctx.save(); ctx.font = FONTS.head(size); ctx.letterSpacing = `${-0.04 * size}px`; const m = ctx.measureText(s); ctx.restore(); reg(ctx, 'text', s, 540 - m.width / 2, 700 - m.actualBoundingBoxAscent, 540 + m.width / 2, 700 + m.actualBoundingBoxDescent); }
}
function ctextNoLog(ctx, s, x, y, font, col, track) { ctx.font = font; ctx.letterSpacing = `${track}px`; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.fillText(s, x, y); }
function round(ctx, t, r) {
  field(ctx, r.field);
  caption(ctx, t, r.t0, r.ink, true);
  price(ctx, r.price, t, r.t0, r.ink);
  ctext(ctx, USUAL, 540, 790, FONTS.ui(38, 600), r.sub);
  sneaker(ctx, 540, 960, 0.72, t);
  pexi(ctx, IMG[r.face], 540, 1310, r.size, t, r.t0 + 0.12, { shake: r.shake });
  verdict(ctx, r.verdict, 540, 1580, t, r.t0 + 0.3, r.ring);
  if (r.say) say(ctx, r.say, 540, 1110, t, r.t0 + 0.75);
}
// The four climbing rounds and the twist. Faces grow with the reaction.
const ROUNDS = {
  r1: { t0: T.r1, price: '$120', face: 'bluntIdle', size: 270, verdict: 'fair', field: C.mist, ink: C.navy, sub: '#5B6470' },
  r2: { t0: T.r2, price: '$150', face: 'bluntFair', size: 310, verdict: 'bad', field: C.cyan, ink: C.navy, sub: '#0A4A66' },
  r3: { t0: T.r3, price: '$180', face: 'bluntNudging', size: 360, verdict: 'bad', field: C.orange, ink: C.navy, sub: '#5A2306' },
  r4: { t0: T.r4, price: '$260', face: 'bluntAngry', size: 430, verdict: 'bad', field: C.walk, ink: '#fff', sub: '#FFD2C6', shake: true, ring: true, say: 'That price is a joke.' },
  twist: { t0: T.twist, price: '$59', face: 'bluntDelighted', size: 460, verdict: 'great', field: C.good, ink: C.navy, sub: '#06321C', ring: true, say: 'Somebody made a mistake.' },
};
function twist(ctx, t) {
  round(ctx, t, ROUNDS.twist);
  // the biggest reaction: a burst of sparkles round Pexi
  const pts = [[260, 1180, 34, '#fff'], [820, 1210, 28, C.navy], [300, 1480, 22, C.navy], [800, 1470, 36, '#fff'], [220, 900, 20, '#fff'], [860, 880, 24, C.navy]];
  pts.forEach(([x, y, r, c], i) => sparkle(ctx, x, y, r * popS(t, T.twist + 0.35 + i * 0.06), c, t * 0.6 + i));
}

// ---------- the sign-off and the loop ----------
// Inside the loop, not an end card: Pexi and the Wordmark, the endline, the handle.
function sign(ctx, t) {
  const tl = t - T.sign;
  field(ctx, C.night);
  pexi(ctx, IMG.bluntDelighted, 330, 930, 240, t, T.sign);
  const g = eExpo((tl - 0.1) / 0.6);
  if (g > 0.01) {
    ctx.save(); ctx.globalAlpha = g; ctx.translate((1 - g) * 40, 0);
    ctx.font = FONTS.ui(150, 700); ctx.letterSpacing = `${-0.035 * 150}px`;
    const w = ctx.measureText('pexi').width + 30;
    logo(ctx, 480 + w / 2, 900, 150);
    ctx.restore();
  }
  rise(ctx, "Know if it's a rip-off.", 540, 1150, 46, FONTS.ui(46, 600), C.ink, t, T.sign + 0.6, 0);
  sparkle(ctx, 860, 760, 26 * popS(t, T.sign + 0.9), C.brand, t * 0.5);
  sparkle(ctx, 210, 1110, 20 * popS(t, T.sign + 1.0), C.fairBright, t * 0.5);
  rise(ctx, '@pexi.app', 540, 1500, 36, FONTS.mono(36), C.ink, t, T.sign + 1.1, 0);
}
// The lead back into frame one: the caption rises again on pink and the price counts up,
// landing on $120 at the loop point, where round one slams it.
function count(ctx, t) {
  const tl = t - T.count;
  field(ctx, C.brand);
  caption(ctx, t, T.count, '#fff', false);
  const p = eInOut((tl - 0.6) / 1.8), n = Math.round(120 * p);
  if (tl > 0.5) ctext(ctx, '$' + n, 540, 700, FONTS.head(250), '#fff', -10);
  const q = popS(t, T.count, 0.5);
  if (q > 0) { ctx.save(); ctx.translate(540, 960); ctx.scale(q, q); ctx.translate(-540, -960); sneaker(ctx, 540, 960, 0.72, t); ctx.restore(); }
  rise(ctx, 'Round two?', 540, 1400, 64, FONTS.head(64), '#FFD6E4', t, T.count + 0.9, -2.5);
}

// ---------- the timeline ----------
const SCENES = [
  { start: T.r1, draw: (c, t) => round(c, t, ROUNDS.r1) }, { start: T.r2, draw: (c, t) => round(c, t, ROUNDS.r2) },
  { start: T.r3, draw: (c, t) => round(c, t, ROUNDS.r3) }, { start: T.r4, draw: (c, t) => round(c, t, ROUNDS.r4) },
  { start: T.twist, draw: twist }, { start: T.sign, draw: sign }, { start: T.count, draw: count },
];
function renderFrame(ctx, f, log) {
  LOG = log || null;
  const t = f / FPS;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.letterSpacing = '0px';
  SCENES[SCENES.findLastIndex(s => t >= s.start)].draw(ctx, t);
  LOG = null;
}

window.LAUNCH = { renderFrame, SAFE, W, H, FPS, DUR, T, setImages: (o) => { IMG = o; } };
})();
