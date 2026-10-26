// Every frame of "Steal or rip-off?", a 16 s looping reel, drawn with canvas 2D.
// renderFrame(ctx, frame) is pure: the same frame number always draws the same picture.
//
// A guessing game, cut to the music (music.mjs, a produced Lyria instrumental): a thing on a
// shelf and its tag, "Steal or rip-off?", a 3-2-1 over the track's ticking intro, and the
// answer on the drop: the phone scans the tag and the app's real verdict sheet comes up,
// Pexi reacts. Two rounds answered, the sign-off on the break, then "Your turn": a third
// item counts down and cuts back to round one before the answer, so the reel loops on an
// open question (the reason to rewatch, or to comment a guess).
// Built on the Pexi Ads flat-field system: a new solid field per shot, verdict colours only
// inside the app's own sheet, Pexi bare, Outfit headlines, Inter Tight lines.
//    0.0 sneakers $180, 3-2-1      3.0 the drop: Bad price, "Hard pass."
//    5.0 headphones $119, 3-2-1    7.0 the drop: Great price, "Somebody made a mistake."
//   10.0 sign-off (the break)     12.0 "Your turn": serum $34, 3-2-1, cut to frame one
(function () {
const W = 1080, H = 1920, FPS = 30, DUR = 16;
const SAFE = { x0: 154, y0: 285, x1: 925, y1: 1635 };

// app/public/css/tokens.css, the mascot colours from js/face-art.js
const C = {
  night: '#0D0B13', ink: '#F7F5F2', inkDark: '#0B0C0E', paper: '#F7F6F9',
  muted: '#A5ADB8', mutedDark: '#5B6470', brand: '#E5165E', navy: '#12233A',
  good: '#12B76A', goodBright: '#38E08B', goodOn: '#04140C',
  walk: '#C23619', walkBright: '#FF6A45',
  fair: '#E8A020', fairBright: '#FFC24D', fairOn: '#1F1400',
  cyan: '#2BB5F0', orange: '#F26B1D',
};
const FD = "'Outfit'", FU = "'Inter Tight'", FM = "'IBM Plex Mono'";
// Cut to the track: each round's answer lands on a drop (TIMING in render.mjs can move them).
const T = { q1: 0, d1: 3.0, q2: 5.0, d2: 7.0, sign: 10.0, q3: 12.0 };
let IMG = {};
let LOG = null;
let BUF = null;

// ---------- maths ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const eOut = x => 1 - Math.pow(1 - clamp(x), 3);
const eExpo = x => { x = clamp(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); };
const eInOut = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eBack = (x, s = 1.4) => { x = clamp(x); const c = s + 1; return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
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
  display: (s) => `800 ${s}px ${FD}`,
  ui: (s, w = 500) => `${w} ${s}px ${FU}`,
  mono: (s) => `600 ${s}px ${FM}`,
};
// One word gliding in: rises 70 px, sharpens from a 16 px blur, fades up. Leaves the same way.
function glide(t, t0, t1 = Infinity, dur = 0.55) {
  const pin = eExpo((t - t0) / dur), pout = t1 === Infinity ? 0 : eInOut((t - t1) / 0.35);
  return { a: clamp(pin) * (1 - pout), dy: (1 - pin) * 70 - pout * 50, blur: (1 - pin) * 16 + pout * 14 };
}
// A headline: lines of words, each word staggered 70 ms. `color(word)` picks a word's colour.
function headline(ctx, lines, cx, cy, size, t, t0, t1, color, font = FONTS.head, lh = 0.98) {
  ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const setF = (s) => { ctx.font = font(s); ctx.letterSpacing = `${-0.04 * s}px`; };
  // fit: the widest line never runs past a 740 px column
  setF(size);
  const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
  if (widest > 740) size = Math.floor(size * 740 / widest);
  setF(size);
  const top = cy - (lines.length * size * lh) / 2;
  let k = 0;
  lines.forEach((line, li) => {
    const words = line.split(' '), sp = ctx.measureText(' ').width;
    const ws = words.map(w => ctx.measureText(w).width), total = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    let x = cx - total / 2; const y = top + (li + 0.8) * size * lh;
    const m = ctx.measureText(line);
    words.forEach((w, i) => {
      const g = glide(t, t0 + k * 0.07, t1 == null ? Infinity : t1 + k * 0.03); k++;
      if (g.a > 0.01) {
        ctx.save(); ctx.globalAlpha = g.a; if (g.blur > 0.3) ctx.filter = `blur(${g.blur.toFixed(1)}px)`;
        ctx.fillStyle = color(w); ctx.fillText(w, x, y + g.dy); ctx.restore();
        if (g.a > 0.5) reg(ctx, 'text', w, x, y - m.actualBoundingBoxAscent, x + ws[i], y + m.actualBoundingBoxDescent);
      }
      x += ws[i] + sp;
    });
  });
  ctx.restore();
}
// A single centred line, faded and blurred in.
function line1(ctx, text, cx, y, font, color, t, t0, t1) {
  const g = glide(t, t0, t1 == null ? Infinity : t1);
  if (g.a <= 0.01) return;
  ctx.save(); ctx.font = font; ctx.textAlign = 'center'; ctx.globalAlpha = g.a;
  if (g.blur > 0.3) ctx.filter = `blur(${g.blur.toFixed(1)}px)`;
  ctx.fillStyle = color; ctx.fillText(text, cx, y + g.dy * 0.6);
  const m = ctx.measureText(text);
  ctx.restore();
  if (g.a > 0.5) reg(ctx, 'text', text, cx - m.width / 2, y - m.actualBoundingBoxAscent, cx + m.width / 2, y + m.actualBoundingBoxDescent);
}

// The logo going forward: "pexi" in a bold grotesque, a round pink full stop.
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

const hex2rgba = (h) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},`;

// ---------- objects ----------
// The mascot, as it ships, floating: a soft shadow below, a slow bob, an optional squash on a change.
const FACE_FRAC = 81 / 88;
function face(ctx, img, cx, cy, size, t, o = {}) {
  const bob = o.still ? 0 : Math.sin(t * 2.2 + (o.phase || 0)) * size * 0.022;
  const sq = o.squash || 0;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  // contact shadow
  const sh = ctx.createRadialGradient(cx, cy + size * 0.56, 0, cx, cy + size * 0.56, size * 0.42);
  sh.addColorStop(0, `rgba(0,0,0,${o.dark ? 0.55 : 0.22})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.translate(cx, cy + size * 0.56); ctx.scale(1, 0.22); ctx.translate(-cx, -(cy + size * 0.56));
  ctx.fillStyle = sh; ctx.fillRect(cx - size, cy, size * 2, size * 1.2); ctx.restore();
  ctx.translate(cx, cy + bob); ctx.rotate(o.rot || 0); ctx.scale(1 + sq, 1 - sq);
  if (o.blur) ctx.filter = `blur(${o.blur.toFixed(1)}px)`;
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
  const r = size * FACE_FRAC / 2;
  if ((o.alpha ?? 1) > 0.5) reg(ctx, 'face', 'mascot', cx - r, cy - r, cx + r, cy + r);
}
// Two faces crossfading, with a small squash on the swap: Pexi changes its mind, it does not cut.
function faceSwap(ctx, a, b, cx, cy, size, t, t0, o = {}) {
  const p = clamp((t - t0) / 0.18);
  const sq = t >= t0 && t < t0 + 0.35 ? 0.06 * Math.sin((t - t0) / 0.35 * Math.PI) : 0;
  if (p < 1) face(ctx, a, cx, cy, size, t, { ...o, alpha: 1 - p, squash: sq });
  if (p > 0) face(ctx, b, cx, cy, size, t, { ...o, alpha: p, squash: sq });
}
// A neon ring drawing itself round (cx, cy).
function neonRing(ctx, cx, cy, r, p, col = C.brand, wobble = 0, t = 0) {
  if (p <= 0) return;
  ctx.save(); ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    const n = 120, end = Math.floor(n * clamp(p));
    for (let i = 0; i <= end; i++) {
      const a = -Math.PI / 2 + i / n * Math.PI * 2;
      const rr_ = r * (1 + wobble * Math.sin(a * 5 + t * 2) * 0.04);
      const x = cx + Math.cos(a) * rr_, y = cy + Math.sin(a) * rr_;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
  };
  for (const [w, a, b] of [[34, 0.18, 40], [16, 0.5, 18], [6, 1, 0]]) {
    path(); ctx.lineWidth = w; ctx.strokeStyle = w === 6 ? '#FFD1E1' : col; ctx.globalAlpha = a;
    ctx.shadowColor = col; ctx.shadowBlur = b; ctx.stroke();
  }
  ctx.restore();
}
// Three things people actually scan, as studio product shots (products/*.png: generated in
// Gemini, unbranded, background cut out). Each keeps the footprint the old drawings had, so
// every call site still places it the same way: (cx, cy) is the object's centre at s = 1.
function contactShadow(ctx, y, w, a = 0.26) {
  ctx.save(); ctx.translate(0, y); ctx.scale(1, 0.13);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(20,20,45,${a})`); g.addColorStop(1, 'rgba(20,20,45,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w, 0, 7); ctx.fill(); ctx.restore();
}
// Draw a cut-out photo h px tall with its top at y, centred on x.
function product(ctx, img, x, y, h) {
  const w = h * img.width / img.height;
  ctx.drawImage(img, x - w / 2, y, w, h);
}
// A leather sneaker, side on, toe to the right. About 640 x 288 at s = 1.
function sneaker(ctx, cx, cy, s) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  contactShadow(ctx, 126, 320);
  product(ctx, IMG.shoe, 10, -170, 288);
  ctx.restore();
}
// Over-ear headphones, three-quarter. About 400 x 520 at s = 1.
function headphones(ctx, cx, cy, s) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  contactShadow(ctx, 330, 230, 0.35);
  product(ctx, IMG.headphones, 0, -210, 520);
  ctx.restore();
}
// A face serum in an amber dropper bottle. About 150 x 480 at s = 1.
function serum(ctx, cx, cy, s) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  contactShadow(ctx, 246, 120, 0.32);
  product(ctx, IMG.serum, 0, -250, 480);
  ctx.restore();
}
// A price tag on a thread, swinging gently.
function tag(ctx, hx, hy, ang, w, h, price) {
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
  const shape = () => { ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(16, -h / 2); ctx.lineTo(w - 70, -h / 2); ctx.quadraticCurveTo(w - 40, -h / 2, w - 40, -h / 2 + 30); ctx.lineTo(w - 40, h / 2 - 30); ctx.quadraticCurveTo(w - 40, h / 2, w - 70, h / 2); ctx.lineTo(16, h / 2); ctx.closePath(); };
  ctx.save(); ctx.shadowColor = 'rgba(30,40,80,.22)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 24; shape(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fillStyle = C.paper; ctx.fill();
  ctx.font = FONTS.display(Math.round(h * 0.56)); ctx.textAlign = 'center'; ctx.fillStyle = C.navy;
  ctx.fillText(price, (16 + w - 40) / 2 + 6, h * 0.2);
  ctx.restore();
}
function pill(ctx, text, cx, cy, size, fill, on, s = 1, glow) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.font = FONTS.display(size); const w = ctx.measureText(text).width + size * 1.1, h = size * 1.55;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 70; }
  rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = fill; ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = on; ctx.textAlign = 'center'; ctx.fillText(text, 0, size * 0.36);
  reg(ctx, 'text', text, -w / 2, -h / 2, w / 2, h / 2);
  ctx.restore();
}
// The pointer, and the ring a tap leaves.
function cursor(ctx, x, y, t, tapAt = []) {
  for (const ta of tapAt) {
    const k = t - ta;
    if (k >= 0 && k < 0.5) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, 20 + k * 160, 0, 7); ctx.lineWidth = 6 * (1 - k / 0.5); ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k / 0.5)})`; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore(); }
  }
  const pressed = tapAt.some(ta => t >= ta - 0.05 && t < ta + 0.1);
  const s = pressed ? 0.86 : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * 1.5, s * 1.5);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 34); ctx.lineTo(8, 26); ctx.lineTo(14, 40); ctx.lineTo(20, 37); ctx.lineTo(14, 24); ctx.lineTo(25, 24); ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.strokeStyle = C.inkDark; ctx.stroke();
  ctx.restore();
}
const path2 = (pts, t) => { // piecewise eased path [[t, x, y], ...]
  if (t <= pts[0][0]) return [pts[0][1], pts[0][2]];
  for (let i = 1; i < pts.length; i++) if (t < pts[i][0]) { const [t0, x0, y0] = pts[i - 1], [t1, x1, y1] = pts[i]; const p = eInOut((t - t0) / (t1 - t0)); return [lerp(x0, x1, p), lerp(y0, y1, p)]; }
  const l = pts[pts.length - 1]; return [l[1], l[2]];
};

// ---------- the phone ----------
const PH = { cx: 540, cy: 1150, w: 540 };
PH.h = PH.w * 844 / 390;
function phone(ctx, cx, cy, w, h, rot, content) {
  const b = 16, r = w * 0.15;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.save(); ctx.shadowColor = 'rgba(20,20,50,.35)'; ctx.shadowBlur = 90; ctx.shadowOffsetY = 50;
  rr(ctx, -w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b, r + b); ctx.fillStyle = '#121216'; ctx.fill(); ctx.restore();
  rr(ctx, -w / 2 - b + 2, -h / 2 - b + 2, w + 2 * b - 4, h + 2 * b - 4, r + b - 2); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.stroke();
  ctx.save(); rr(ctx, -w / 2, -h / 2, w, h, r); ctx.clip(); ctx.translate(-w / 2, -h / 2);
  const log = LOG; LOG = null; content({ x: 0, y: 0, w, h }); LOG = log;
  ctx.restore();
  rr(ctx, -64, -h / 2 + 18, 128, 36, 18); ctx.fillStyle = '#000'; ctx.fill();
  ctx.restore();
}
// ---------- flat pieces ----------
// A flat colour field: the whole look is solid brand colour, no gradients.
function field(ctx, col) { ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); }
// A four-point sparkle, the reference's one ornament.
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
function diamond(ctx, x, y, r, col, rot = 0) {
  if (r <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  ctx.moveTo(0, -r * 1.4); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.4); ctx.lineTo(-r, 0); ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.restore();
}
// Something popping in: overshoots, settles, never blurred (the flat look is crisp).
const popS = (t, t0, d = 0.5) => eBack((t - t0) / d, 2.2);
// A slow drift so a held shot never sits frozen.
const drift = (t, k = 1) => Math.sin(t * 1.1 + k) * 10;
// A two-line headline the reference way: huge, line one off the left edge, line two off the
// right edge, each word rising out of a mask. It bleeds past the safe box on purpose, as the
// reference does, so its words are not logged for the safe-box check.
function bleedHead(ctx, l1, l2, y, size, t, t0, col = '#fff') {
  const set = (c) => { c.font = FONTS.head(size); c.letterSpacing = `${-0.04 * size}px`; c.textBaseline = 'alphabetic'; };
  const lines = [[l1, 'left', -size * 0.05, y], ...(l2 ? [[l2, 'right', W + size * 0.1, y + size * 0.92]] : [])];
  let k = 0;
  for (const [txt, al, x0, by] of lines) {
    ctx.save(); set(ctx);
    const words = txt.split(' '), sp = ctx.measureText(' ').width, ws = words.map(w => ctx.measureText(w).width);
    const total = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    let x = al === 'left' ? x0 : x0 - total;
    words.forEach((w, i) => {
      const p = eExpo((t - t0 - k++ * 0.12) / 0.7);
      if (p > 0.01) {
        ctx.save(); ctx.fillStyle = col;
        ctx.beginPath(); ctx.rect(x - 40, by - size * 1.05, ws[i] + 80, size * 1.35); ctx.clip();
        ctx.fillText(w, x, by + (1 - p) * size * 1.1); ctx.restore();
      }
      x += ws[i] + sp;
    });
    ctx.restore();
  }
}
// A one-word headline set huge and centred, inside the safe box.
function wordHead(ctx, word, y, size, t, t0, col) {
  ctx.save(); ctx.font = FONTS.head(size); ctx.letterSpacing = `${-0.04 * size}px`; ctx.textAlign = 'center';
  const p = eExpo((t - t0) / 0.7), m = ctx.measureText(word);
  ctx.beginPath(); ctx.rect(0, y - size * 1.05, W, size * 1.35); ctx.clip();
  ctx.fillStyle = col; ctx.fillText(word, 540, y + (1 - p) * size * 1.1);
  ctx.restore();
  if (p > 0.6) reg(ctx, 'text', word, 540 - m.width / 2, y - m.actualBoundingBoxAscent, 540 + m.width / 2, y + m.actualBoundingBoxDescent);
}
// The phone, tilted back in 3D: a skew reads as perspective in a flat frame.
function tiltPhone(ctx, cx, cy, s, rot, skew, content) {
  ctx.save(); ctx.translate(cx, cy); ctx.transform(1, skew * 0.4, -skew, 1, 0, 0); ctx.scale(s, s);
  phone(ctx, 0, 0, PH.w, PH.h, rot, content);
  ctx.restore();
}
// Text inside a phone screen (not checked against the safe box: the phone carries it).
function txt(ctx, s, x, y, font, col, al = 'left') { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = al; ctx.fillText(s, x, y); }
function screenTitle(ctx, s, title, on, chip) {
  rr(ctx, 30, 104, 58, 58, 16); ctx.fillStyle = chip; ctx.fill();
  ctx.beginPath(); ctx.moveTo(66, 118); ctx.lineTo(52, 133); ctx.lineTo(66, 148); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.stroke();
  txt(ctx, title, 106, 150, FONTS.head(50), on);
}
const VERDICT = {
  bad: { word: 'Bad price', fill: C.walk, on: '#fff' },
  fair: { word: 'Reasonable', fill: C.fair, on: C.fairOn },
  great: { word: 'Great price', fill: C.good, on: C.goodOn },
};
function verdictPill(ctx, v, x, y, size) {
  const V = VERDICT[v]; ctx.save(); ctx.font = FONTS.ui(size, 700);
  const w = ctx.measureText(V.word).width + size * 1.2, h = size * 1.7;
  rr(ctx, x, y - h / 2, w, h, h / 2); ctx.fillStyle = V.fill; ctx.fill();
  ctx.fillStyle = V.on; ctx.textAlign = 'left'; ctx.fillText(V.word, x + size * 0.6, y + size * 0.36);
  ctx.restore();
}
// A real verdict sheet over a dimmed camera view, the way the app shows it.
function sheetScreen(ctx, s, t, img, behind) {
  behind(s);
  ctx.fillStyle = 'rgba(11,12,14,.35)'; ctx.fillRect(0, 0, s.w, s.h);
  const k = s.w / img.width; ctx.drawImage(img, 0, 0, s.w, img.height * k);
}

// ---------- the game ----------
// What the phone's camera sees: a plain shelf, the item, its swinging tag, the app's chrome.
function cameraFeed(ctx, s, t, item, scanning) {
  ctx.fillStyle = '#D9E4EC'; ctx.fillRect(0, 0, s.w, s.h);
  const k = s.w / 540, sy0 = s.h * 0.56;
  ctx.fillStyle = '#EFEDE8'; ctx.fillRect(0, sy0, s.w, 60 * k);
  ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(0, sy0 + 60 * k, s.w, s.h);
  if (item.kind === 'shoe') sneaker(ctx, s.w * 0.5, sy0 - 60 * k, 0.72 * k);
  if (item.kind === 'headphones') headphones(ctx, s.w * 0.5, sy0 - 250 * k, 0.62 * k);
  if (item.kind === 'serum') serum(ctx, s.w * 0.5, sy0 - 190 * k, 0.75 * k);
  tag(ctx, s.w * 0.6, s.h * 0.3, -0.1 + 0.04 * Math.sin(t * 2.2), 210 * k, 116 * k, item.price);
  if (scanning) {
    const cx = s.w / 2, cy = s.h * 0.42, hw = 235 * k, hh = 200 * k, L = 50 * k;
    ctx.lineWidth = 7 * k; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw, cy + sy * (hh - L)); ctx.lineTo(cx + sx * hw, cy + sy * hh); ctx.lineTo(cx + sx * (hw - L), cy + sy * hh); ctx.stroke(); }
  }
  logo(ctx, s.w / 2, 96 * k, 40 * k, C.inkDark);
  const by = s.h - 120 * k;
  ctx.beginPath(); ctx.arc(s.w / 2, by, 46 * k, 0, 7); ctx.lineWidth = 8 * k; ctx.strokeStyle = C.brand; ctx.stroke();
  ctx.beginPath(); ctx.arc(s.w / 2, by, 34 * k, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
}
// One phone, straight, rising from below on its first shot and drifting after.
const PS = 0.8, PY = 1120;
function gamePhone(ctx, t, t0, rise, content) {
  const y = PY + (rise ? (1 - eExpo((t - t0) / 0.9)) * 1100 : 0) + drift(t, 2) * 0.6;
  ctx.save(); ctx.translate(540, y); ctx.scale(PS, PS);
  phone(ctx, 0, 0, PH.w, PH.h, 0, content);
  ctx.restore();
}
// The 3-2-1: a navy disc with the number popping in on each half beat.
function countdown(ctx, t, tAnswer) {
  for (let i = 0; i < 3; i++) {
    const t0 = tAnswer - 1.5 + i * 0.5;
    if (t < t0 || t >= t0 + 0.5) continue;
    const q = popS(t, t0, 0.3);
    ctx.save(); ctx.translate(540, 1330); ctx.scale(q, q);
    ctx.beginPath(); ctx.arc(0, 0, 110, 0, 7); ctx.fillStyle = C.navy; ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.font = FONTS.head(160); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(String(3 - i), 0, 57);
    if (q > 0.6) reg(ctx, 'text', String(3 - i), -110, -110, 110, 110);
    ctx.restore();
  }
}
// The question, set the reference way: two words a line, rising out of a mask.
function question(ctx, t, t0, col, held) {
  const set = (s) => { ctx.font = FONTS.head(s); ctx.letterSpacing = `${-0.04 * s}px`; ctx.textAlign = 'center'; };
  [['Steal or', 400], ['rip-off?', 505]].forEach(([w, y], i) => {
    const p = held ? 1 : eExpo((t - t0 - i * 0.1) / 0.6);
    if (p <= 0.01) return;
    ctx.save(); set(110); ctx.beginPath(); ctx.rect(0, y - 116, W, 150); ctx.clip();
    ctx.fillStyle = col; ctx.fillText(w, 540, y + (1 - p) * 120);
    const m = ctx.measureText(w); ctx.restore();
    if (p > 0.6) { ctx.save(); set(110); reg(ctx, 'text', w, 540 - m.width / 2, y - m.actualBoundingBoxAscent, 540 + m.width / 2, y + m.actualBoundingBoxDescent); ctx.restore(); }
  });
}
// Pexi's line on a white pill (ad-say).
function say(ctx, s, cx, cy, t, t0) {
  const q = popS(t, t0, 0.45); if (q <= 0) return;
  const size = 46;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(q, q); ctx.rotate(-0.04);
  ctx.font = FONTS.ui(size, 700); ctx.letterSpacing = `${-0.02 * size}px`;
  const w = ctx.measureText(s).width + size * 1.2, h = size * 1.75;
  ctx.save(); ctx.shadowColor = 'rgba(10,10,30,.3)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  ctx.fillStyle = C.navy; ctx.textAlign = 'center'; ctx.fillText(s, 0, size * 0.36);
  if (q > 0.6) reg(ctx, 'text', s, -w / 2, -h / 2, w / 2, h / 2);
  ctx.restore();
}
// The flash of the shutter on the drop.
function flash(ctx, t, t0) {
  const a = 1 - clamp((t - t0) / 0.25);
  if (t >= t0 && a > 0) { ctx.save(); ctx.globalAlpha = a * 0.85; field(ctx, '#fff'); ctx.restore(); }
}
const ITEMS = {
  shoe: { kind: 'shoe', price: '$180', sheet: 'sheetBad', face: 'bluntAngry', line: 'Hard pass.' },
  headphones: { kind: 'headphones', price: '$119', sheet: 'sheetGreat', face: 'bluntDelighted', line: 'Somebody made a mistake.' },
  serum: { kind: 'serum', price: '$34' },
};
// A round: the question and the camera, the countdown, then on the drop the scan, the real
// sheet rising, Pexi popping up over the phone's corner with his line. The angry face only
// ever appears with the item and its price on screen (the sheet carries both).
function round(ctx, t, item, tq, ta, fieldCol, ink, rise) {
  field(ctx, fieldCol);
  question(ctx, t, tq, ink, !rise);
  const answered = t >= ta;
  gamePhone(ctx, t, tq, rise, s => {
    if (!answered) { cameraFeed(ctx, s, t, item, t >= ta - 1.5); return; }
    const p = eExpo((t - ta) / 0.45);
    cameraFeed(ctx, s, t, item, false);
    ctx.fillStyle = `rgba(11,12,14,${0.4 * p})`; ctx.fillRect(0, 0, s.w, s.h);
    const img = IMG[item.sheet], k = s.w / img.width;
    ctx.drawImage(img, 0, (1 - p) * s.h * 0.6, s.w, img.height * k);
  });
  if (!answered) {
    countdown(ctx, t, ta);
    if (rise) reg(ctx, 'product', item.kind, 400, 700, 680, 1300);
    return;
  }
  flash(ctx, t, ta);
  face(ctx, IMG[item.face], 320, 1440, 320, t, { alpha: clamp(popS(t, ta + 0.15, 0.45) * 1.5), squash: 0 });
  say(ctx, item.line, 560, 1270, t, ta + 0.45);
}
function q1(ctx, t) { round(ctx, t, ITEMS.shoe, T.q1, T.d1, C.orange, C.navy, false); }
// Every shot's motion starts 0.25 s before its cut, so the cut lands on something already moving.
const LEAD = 0.25;
function q2(ctx, t) { round(ctx, t, ITEMS.headphones, T.q2 - LEAD, T.d2, C.cyan, C.navy, true); }
// The sign-off, inside the loop, on the track's break.
function sign(ctx, t) {
  const tl = t - T.sign;
  field(ctx, C.night);
  const q = popS(t, T.sign - LEAD, 0.5);
  if (q > 0) { ctx.save(); ctx.translate(330, 930); ctx.scale(q, q); ctx.rotate(Math.sin(tl * 2.4) * 0.05); ctx.drawImage(IMG.bluntDelighted, -120, -120, 240, 240); ctx.restore(); if (q > 0.5) reg(ctx, 'face', 'mascot', 230, 830, 430, 1030); }
  const g = eExpo((tl + LEAD) / 0.6);
  if (g > 0.01) {
    ctx.save(); ctx.globalAlpha = g; ctx.translate((1 - g) * 40, 0);
    ctx.font = FONTS.ui(150, 700); ctx.letterSpacing = `${-0.035 * 150}px`;
    const w = ctx.measureText('pexi').width + 30;
    logo(ctx, 480 + w / 2, 900, 150);
    ctx.restore();
  }
  line1(ctx, "Know if it's a rip-off.", 540, 1150, FONTS.ui(48, 600), C.ink, t, T.sign + 0.2);
  sparkle(ctx, 860, 760, 26 * popS(t, T.sign + 0.6), C.brand, t * 0.5);
  sparkle(ctx, 210, 1110, 20 * popS(t, T.sign + 0.7), C.fairBright, t * 0.5);
  line1(ctx, '@pexi.app', 540, 1500, FONTS.mono(38), C.ink, t, T.sign + 0.8);
}
// "Your turn": the third item counts down, and the reel cuts back to round one before the
// answer. The open question is the loop.
function q3(ctx, t) {
  const tl = t - T.q3, ta = T.q3 + 4.0;
  field(ctx, C.brand);
  wordHead(ctx, 'Your turn.', 470, 120, t, T.q3 - LEAD, '#fff');
  gamePhone(ctx, t, T.q3 - LEAD, true, s => cameraFeed(ctx, s, t, ITEMS.serum, tl > 2.5));
  countdown(ctx, t, ta);
  face(ctx, IMG.bluntThinking, 310, 1470, 280, t, { alpha: clamp(popS(t, T.q3 + 0.8, 0.45) * 1.5) });
  say(ctx, 'Comment your guess', 610, 1290, t, T.q3 + 1.1);
}

// ---------- the timeline ----------
const SCENES = [
  { start: T.q1, draw: q1 }, { start: T.q2, draw: q2 }, { start: T.sign, draw: sign }, { start: T.q3, draw: q3 },
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
