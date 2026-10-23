// Every frame of "Introducing Pexi", a 16 s reel, drawn with canvas 2D.
// renderFrame(ctx, frame) is pure: the same frame number always draws the same picture.
//
// The structure follows a reference Aurik picked (the "Moolah" app-concept reel by
// @visualsbywlroo): "Introducing" on black, then hard cuts between flat, saturated colour
// fields, a tilted phone in every other shot, a big two-line white headline ranged left
// then right, one object popping in on white with sparkles, 3D-stacked cards, tumbling
// pills, and the logo beside the mascot on the end card. Only the structure and look are
// borrowed; every picture is Pexi's own (the mascot faces as they ship, the app's real
// verdict sheets from sheet.mjs, the studio product shots), on Pexi's palette.
//    0.0 intro    1.0 notif    2.0 pop     3.0 obj     4.0 list    5.0 head1  "Your new price checker"
//    6.0 stack    7.0 picker   8.0 scan    9.0 tumble 10.0 head2  "Scan anything"   11.5 splash   12.5 end
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
  cyan: '#2BB5F0',
};
// Outfit (fonts/, OFL) for headlines: the free geometric sans closest to the reference's.
// Inter Tight for interface text and the wordmark, Plex Mono for the handle.
const FD = "'Outfit'", FU = "'Inter Tight'", FM = "'IBM Plex Mono'";
// Every cut on the 120 BPM beat (sfx.mjs), like the reference.
const T = { intro: 0, notif: 1.0, pop: 2.0, obj: 3.0, list: 4.0, head1: 5.0, stack: 6.0, picker: 7.0, scan: 8.0, tumble: 9.0, head2: 10.0, splash: 11.5, end: 12.5 };

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
// What the camera sees: a soft shelf, the bottle and its tag, the app's chrome over it.
function cameraFeed(ctx, s, t, scanning) {
  const g = ctx.createLinearGradient(0, 0, 0, s.h);
  g.addColorStop(0, '#DCE9F2'); g.addColorStop(1, '#B9CBD8'); ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
  [['rgba(255,255,255,.7)', 0.2, 0.25, 160], ['rgba(242,107,29,.25)', 0.85, 0.35, 140], ['rgba(43,181,240,.25)', 0.15, 0.75, 180]].forEach(([c, x, y, r]) => {
    const rg = ctx.createRadialGradient(s.w * x, s.h * y, 0, s.w * x, s.h * y, r); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, s.w, s.h);
  });
  const k = s.w / 540;
  // a plain shelf
  const sy0 = s.h * 0.53;
  const shelf = ctx.createLinearGradient(0, sy0, 0, sy0 + 60 * k); shelf.addColorStop(0, '#F3F1EC'); shelf.addColorStop(1, '#CFCAC0');
  ctx.fillStyle = shelf; ctx.fillRect(0, sy0, s.w, 60 * k); ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, sy0 + 60 * k, s.w, s.h);
  sneaker(ctx, s.w * 0.5, sy0 - 64 * k, 0.72 * k);
  tag(ctx, s.w * 0.56, s.h * 0.33, -0.1 + 0.03 * Math.sin(t * 2), 200 * k, 112 * k, '$180');
  if (scanning) {
    const cx = s.w / 2, cy = s.h * 0.42, hw = 235 * k, hh = 170 * k, L = 50 * k;
    ctx.lineWidth = 7 * k; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw, cy + sy * (hh - L)); ctx.lineTo(cx + sx * hw, cy + sy * hh); ctx.lineTo(cx + sx * (hw - L), cy + sy * hh); ctx.stroke(); }
  }
  logo(ctx, s.w / 2, 96 * k, 40 * k, C.inkDark);
  // the shutter: the app's pink ring
  const sy = s.h - 120 * k;
  ctx.beginPath(); ctx.arc(s.w / 2, sy, 46 * k, 0, 7); ctx.lineWidth = 8 * k; ctx.strokeStyle = C.brand; ctx.stroke();
  ctx.beginPath(); ctx.arc(s.w / 2, sy, 34 * k, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
}

// ---------- flat pieces ----------
// A flat colour field: the whole look is solid brand colour, no gradients.
function field(ctx, col) { ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); }
// A four-point sparkle, the reference's one ornament.
function sparkle(ctx, x, y, r, col, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    ctx.quadraticCurveTo(0, 0, Math.cos(a) * r, Math.sin(a) * r);
    ctx.quadraticCurveTo(0, 0, Math.cos(a + Math.PI / 2) * r, Math.sin(a + Math.PI / 2) * r);
  }
  ctx.fillStyle = col; ctx.fill(); ctx.restore();
}
// Something popping in: overshoots, settles, never blurred (the flat look is crisp).
const popS = (t, t0, d = 0.4) => eBack((t - t0) / d, 2.2);
// A two-line headline the reference way: line one ranged left, line two ranged right, white,
// huge, each word gliding up. Fits the safe box.
function bigHead(ctx, l1, l2, y, size, t, t0, col = '#fff') {
  ctx.save(); ctx.font = FONTS.head(size); ctx.letterSpacing = `${-0.035 * size}px`;
  const fit = Math.max(ctx.measureText(l1).width, l2 ? ctx.measureText(l2).width : 0);
  if (fit > 765) size = Math.floor(size * 765 / fit);
  ctx.restore();
  const set = (c) => { c.font = FONTS.head(size); c.letterSpacing = `${-0.035 * size}px`; c.textBaseline = 'alphabetic'; };
  const lines = [[l1, 'left', 158, y], ...(l2 ? [[l2, 'right', 922, y + size * 0.95]] : [])];
  let k = 0;
  for (const [txt, al, x0, by] of lines) {
    ctx.save(); set(ctx);
    const words = txt.split(' '), sp = ctx.measureText(' ').width, ws = words.map(w => ctx.measureText(w).width);
    const total = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    let x = al === 'left' ? x0 : x0 - total;
    const m = ctx.measureText(txt);
    words.forEach((w, i) => {
      const p = eExpo((t - t0 - k++ * 0.08) / 0.5);
      if (p > 0.01) {
        ctx.save(); ctx.globalAlpha = clamp(p * 1.5); ctx.fillStyle = col;
        ctx.beginPath(); ctx.rect(x - 20, by - size, ws[i] + 40, size * 1.3); ctx.clip();
        ctx.fillText(w, x, by + (1 - p) * size * 0.9); ctx.restore();
        if (p > 0.6) reg(ctx, 'text', w, x, by - m.actualBoundingBoxAscent, x + ws[i], by + m.actualBoundingBoxDescent);
      }
      x += ws[i] + sp;
    });
    ctx.restore();
  }
}
// The phone, tilted back in 3D: a vertical squash and a skew read as perspective in a flat frame.
function tiltPhone(ctx, cx, cy, s, rot, skew, content) {
  ctx.save(); ctx.translate(cx, cy); ctx.transform(1, skew * 0.4, -skew, 1, 0, 0); ctx.scale(s, s);
  phone(ctx, 0, 0, PH.w, PH.h, rot, content);
  ctx.restore();
}
// Text inside a phone screen (not checked against the safe box: the phone carries it).
function txt(ctx, s, x, y, font, col, al = 'left') { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = al; ctx.fillText(s, x, y); }
// An iOS-style status row and a back-button title, drawn in the screen's own pixels.
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

// ---------- scenes ----------
// A. "Introducing", small and white on black.
function intro(ctx, t) {
  field(ctx, C.night);
  line1(ctx, 'Introducing', 540, 990, FONTS.head(76), '#fff', t, 0.1);
}
// B. A phone on pink, cropped by the frame, Pexi's faces as its wallpaper, a notification dropping in.
const WALL = [['bluntDelighted', 150, 260, 230, -0.2], ['warmWalk', 400, 170, 200, 0.15], ['deadpanPleased', 330, 440, 260, 0.05], ['bluntAngry', 110, 560, 170, 0.25], ['warmDelighted', 450, 640, 190, -0.15], ['deadpanWalk', 200, 820, 210, 0.1]];
function notif(ctx, t) {
  const tl = t - T.notif;
  field(ctx, C.brand);
  const p = eExpo(tl / 0.7);
  tiltPhone(ctx, lerp(760, 640, p), lerp(1500, 860, p), 1.35, 0.1, 0, (s) => {
    ctx.fillStyle = '#FF8DB5'; ctx.fillRect(0, 0, s.w, s.h);
    WALL.forEach(([k, x, y, sz, r], i) => {
      const q = popS(t, T.notif + 0.15 + i * 0.06);
      if (q > 0) { ctx.save(); ctx.translate(x, y); ctx.rotate(r + Math.sin(t * 2 + i) * 0.04); ctx.scale(q, q); ctx.drawImage(IMG[k], -sz / 2, -sz / 2, sz, sz); ctx.restore(); }
    });
    [[60, 120, 26, C.fairBright], [480, 340, 20, '#fff'], [90, 420, 18, C.cyan], [470, 900, 24, C.fairBright]].forEach(([x, y, r, c], i) => sparkle(ctx, x, y, r * popS(t, T.notif + 0.4 + i * 0.05), c, t));
    // the notification
    const n = eBack((t - T.notif - 0.55) / 0.45, 1.6);
    if (n > 0) {
      ctx.save(); ctx.translate(s.w / 2, 990); ctx.scale(n, n);
      ctx.shadowColor = 'rgba(80,0,30,.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
      rr(ctx, -250, -62, 500, 124, 30); ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      rr(ctx, -228, -40, 80, 80, 20); ctx.fillStyle = C.brand; ctx.fill();
      ctx.save(); rr(ctx, -228, -40, 80, 80, 20); ctx.clip(); ctx.drawImage(IMG.icon, -228, -40, 80, 80); ctx.restore();
      txt(ctx, 'Pexi', -130, -6, FONTS.ui(32, 700), C.inkDark);
      txt(ctx, 'That price is a joke.', -130, 34, FONTS.ui(28, 500), C.mutedDark);
      ctx.restore();
    }
  });
}
// C. The real verdict sheet on a white field; a black card lifts out of it, tilted.
function verdictPop(ctx, t) {
  const tl = t - T.pop;
  field(ctx, '#fff');
  const p = eExpo(tl / 0.6);
  tiltPhone(ctx, 540, lerp(1500, 1080, p), 0.92, 0, 0, (s) => {
    cameraFeed(ctx, s, t, false);
    ctx.fillStyle = 'rgba(11,12,14,.35)'; ctx.fillRect(0, 0, s.w, s.h);
    const img = IMG.sheetBad, k = s.w / img.width; ctx.drawImage(img, 0, 0, s.w, img.height * k);
  });
  // the card
  const q = eBack((tl - 0.35) / 0.5, 1.5);
  if (q > 0) {
    ctx.save(); ctx.translate(540, 760); ctx.rotate(lerp(0, -0.07, q)); ctx.scale(lerp(0.7, 0.95, q), lerp(0.7, 0.95, q));
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
    rr(ctx, -380, -150, 760, 300, 34); ctx.fillStyle = '#16161A'; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    txt(ctx, 'Running shoes', -330, -70, FONTS.ui(40, 600), '#fff');
    txt(ctx, '$180', -330, 40, FONTS.head(120), C.walkBright);
    txt(ctx, 'Usually about $120', -330, 108, FONTS.ui(34, 500), C.muted);
    verdictPill(ctx, 'bad', 70, -84, 34);
    sparkle(ctx, 300, 60, 34, '#fff', 0);
    reg(ctx, 'text', 'verdict card', -380, -150, 380, 150);
    ctx.restore();
  }
}
// D. One object on white, popping in with sparkles round it.
function object(ctx, t) {
  const tl = t - T.obj;
  field(ctx, '#fff');
  const q = popS(t, T.obj, 0.45);
  ctx.save(); ctx.translate(540, 960); ctx.scale(q, q); ctx.rotate(Math.sin(tl * 3) * 0.04); sneaker(ctx, 0, 0, 1.05); ctx.restore();
  [[240, 760, 46, C.inkDark], [860, 780, 30, C.good], [820, 1180, 40, C.brand], [300, 1160, 26, C.fair]].forEach(([x, y, r, c], i) =>
    sparkle(ctx, x, y, r * popS(t, T.obj + 0.15 + i * 0.07), c, Math.sin(t * 2 + i) * 0.2));
}
// E. A list of scans on an amber phone, cards stacked like the reference's budgets.
const SCANS = [
  { name: 'Running shoes', price: '$180', v: 'bad', card: '#fff', ink: C.inkDark, item: (c) => sneaker(c, 120, 92, 0.33) },
  { name: 'Headphones', price: '$119', v: 'great', card: '#16161A', ink: '#fff', item: (c) => headphones(c, 120, 70, 0.3) },
  { name: 'Face serum', price: '$34', v: 'fair', card: C.cyan, ink: C.navy, item: (c) => serum(c, 120, 80, 0.36) },
];
function list(ctx, t) {
  const tl = t - T.list;
  field(ctx, C.fair);
  const p = eExpo(tl / 0.6);
  tiltPhone(ctx, 560, lerp(1700, 1120, p), 1.05, -0.05, 0.08 * (1 - p) + 0.02, (s) => {
    ctx.fillStyle = C.brand; ctx.fillRect(0, 0, s.w, s.h);
    screenTitle(ctx, s, 'Recent scans', '#fff', 'rgba(255,255,255,.25)');
    SCANS.forEach((c, i) => {
      const q = eExpo((tl - 0.25 - i * 0.12) / 0.5), y = 200 + i * 300 + (1 - q) * 300;
      ctx.save(); ctx.globalAlpha = clamp(q * 1.5);
      rr(ctx, 26, y, s.w - 52, 270, 30); ctx.fillStyle = c.card; ctx.fill();
      ctx.save(); ctx.translate(26, y + 30); c.item(ctx); ctx.restore();
      txt(ctx, c.name, s.w - 56, y + 70, FONTS.ui(30, 600), c.ink, 'right');
      txt(ctx, c.price, s.w - 56, y + 150, FONTS.head(76), c.ink, 'right');
      ctx.save(); ctx.font = FONTS.ui(26, 700); const w = ctx.measureText(VERDICT[c.v].word).width + 31; ctx.restore();
      verdictPill(ctx, c.v, s.w - 56 - w, y + 214, 26);
      ctx.restore();
    });
  });
}
// F. The headline on red, the phone rising under it with the real sheet.
function headline1(ctx, t) {
  const tl = t - T.head1;
  field(ctx, C.walk);
  bigHead(ctx, 'Your new', 'price checker', 470, 170, t, T.head1 + 0.05);
  const p = eExpo((tl - 0.1) / 0.7);
  tiltPhone(ctx, 540, lerp(2100, 1430, p), 0.95, 0, 0, (s) => {
    cameraFeed(ctx, s, t, false);
    ctx.fillStyle = 'rgba(11,12,14,.35)'; ctx.fillRect(0, 0, s.w, s.h);
    const img = IMG.sheetBad, k = s.w / img.width; ctx.drawImage(img, 0, 0, s.w, img.height * k);
  });
}
// G. The three Pexis as cards, stacked and floating in 3D on white.
const VOICES = [
  { who: 'Deadpan', tag: 'Dry and exact', face: 'deadpanWalk', fill: C.fair, on: C.fairOn, sub: '#7A4B00' },
  { who: 'Warm', tag: 'Kind, never pushy', face: 'warmWalk', fill: C.brand, on: '#fff', sub: '#FFD6E4' },
  { who: 'Blunt', tag: 'No filter at all', face: 'bluntWalk', fill: C.cyan, on: C.navy, sub: '#0A4A66' },
];
function voiceCard(ctx, v, w, h) {
  rr(ctx, -w / 2, -h / 2, w, h, 30); ctx.fillStyle = v.fill; ctx.fill();
  txt(ctx, v.tag, -w / 2 + 40, -h / 2 + 62, FONTS.ui(30, 600), v.sub);
  txt(ctx, v.who, -w / 2 + 40, -h / 2 + 150, FONTS.head(88), v.on);
  ctx.drawImage(IMG[v.face], w / 2 - 210, -h / 2 + 10, h - 20, h - 20);
  sparkle(ctx, w / 2 - 230, -h / 2 + 50, 18, '#fff', 0);
}
function stack(ctx, t) {
  const tl = t - T.stack;
  field(ctx, '#fff');
  VOICES.forEach((v, i) => {
    const q = eExpo((tl - i * 0.1) / 0.6), y = 700 + i * 250 + (1 - q) * 500, x = 530 + (1 - q) * 120;
    ctx.save(); ctx.globalAlpha = clamp(q * 2);
    // the soft shadow each card throws to the lower left
    ctx.save(); ctx.translate(x - 60, y + 60); ctx.transform(1, -0.32, 0, 1, 0, 0); rr(ctx, -360, -100, 720, 200, 30); ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fill(); ctx.restore();
    ctx.translate(x, y + Math.sin(t * 2 + i) * 6); ctx.transform(1, -0.32, 0, 1, 0, 0);
    voiceCard(ctx, v, 720, 200);
    ctx.restore();
    if (q > 0.6) reg(ctx, 'text', v.who, x - 360, y - 215, x + 360, y + 215);
  });
}
// H. The same cards inside the app's picker, the cursor choosing Blunt.
function picker(ctx, t) {
  const tl = t - T.picker;
  field(ctx, '#F1F1F4');
  const tap = T.picker + 0.75;
  tiltPhone(ctx, 540, 1000, 1.0, 0, 0, (s) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, s.w, s.h);
    screenTitle(ctx, s, 'Pick your Pexi', C.inkDark, C.brand);
    txt(ctx, 'How should it talk to you?', 34, 220, FONTS.ui(28, 500), C.mutedDark);
    VOICES.forEach((v, i) => {
      const q = eExpo((tl - 0.05 - i * 0.08) / 0.5), y = 400 + i * 245;
      ctx.save(); ctx.globalAlpha = clamp(q * 1.5); ctx.translate(s.w / 2 + (1 - q) * 300, y);
      const sel = i === 2 && t >= tap;
      if (sel) { rr(ctx, -246, -111, 492, 222, 36); ctx.lineWidth = 8; ctx.strokeStyle = C.inkDark; ctx.stroke(); }
      ctx.scale(0.66, 1.0); voiceCard(ctx, v, 720, 200);
      ctx.restore();
    });
    ctx.save(); ctx.font = FONTS.ui(30, 500); ctx.restore();
    txt(ctx, 'See all moods', s.w / 2, 1120, FONTS.ui(28, 500), C.mutedDark, 'center');
  });
  const [x, y] = path2([[T.picker + 0.1, 980, 1780], [T.picker + 0.6, 700, 1390]], t);
  if (tl > 0.05) cursor(ctx, x, y, t, [tap]);
}
// I. "Scan" on cyan, the camera finding the shoe, the cursor tapping the shutter.
function scanScene(ctx, t) {
  const tl = t - T.scan;
  field(ctx, C.cyan);
  bigHead(ctx, 'Scan', null, 470, 230, t, T.scan + 0.05, C.navy);
  const p = eExpo((tl - 0.1) / 0.7);
  const shut = T.scan + 0.85;
  tiltPhone(ctx, 540, lerp(2100, 1260, p), 0.9, 0, 0, (s) => {
    cameraFeed(ctx, s, t, true);
    if (t >= shut) { const f = clamp(1 - (t - shut) / 0.25); ctx.fillStyle = `rgba(255,255,255,${0.9 * f})`; ctx.fillRect(0, 0, s.w, s.h); }
  });
  const [sx, sy] = [540, 1260 + (PH.h / 2 - 120) * 0.9];
  const [x, y] = path2([[T.scan + 0.35, 980, 1800], [T.scan + 0.75, sx + 6, sy - 4]], t);
  if (tl > 0.3) cursor(ctx, x, y, t, [shut]);
}
// J. Things people scan, as pills tumbling down and piling up.
const PILLS = [
  ['Sneakers', C.brand, '#fff', 360, 520, -0.35], ['Headphones', '#16161A', '#fff', 690, 640, 0.25],
  ['Skincare', C.cyan, C.navy, 380, 830, 0.18], ['Snacks', C.fair, C.fairOn, 760, 930, -0.3],
  ['Toys', C.good, C.goodOn, 290, 1060, -0.12], ['Tools', C.walk, '#fff', 560, 1200, 0.3],
  ['Gaming', '#FFC24D', C.fairOn, 740, 1420, -0.22], ['Coffee', C.navy, '#fff', 350, 1460, 0.15],
];
function tumble(ctx, t) {
  const tl = t - T.tumble;
  field(ctx, '#fff');
  PILLS.forEach(([word, fill, on, x, y, rot], i) => {
    const q = eBack((tl - i * 0.06) / 0.55, 1.3);
    if (q <= 0) return;
    const yy = lerp(-200, y, q), r = lerp(rot - 1.6, rot, eOut((tl - i * 0.06) / 0.6));
    ctx.save(); ctx.translate(x, yy); ctx.rotate(r);
    ctx.font = FONTS.head(60); const w = ctx.measureText(word).width + 90, h = 116;
    rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = fill; ctx.fill();
    if (fill === '#16161A') { ctx.lineWidth = 6; ctx.strokeStyle = C.good; ctx.stroke(); }
    ctx.fillStyle = on; ctx.textAlign = 'center'; ctx.fillText(word, 0, 21);
    if (q > 0.95) reg(ctx, 'text', word, -w / 2, -h / 2, w / 2, h / 2);
    ctx.restore();
  });
  [[200, 400, 30, C.fair], [880, 470, 24, C.brand], [940, 1100, 34, C.cyan], [170, 1300, 26, C.good]].forEach(([x, y, r, c], i) => sparkle(ctx, x, y, r * popS(t, T.tumble + 0.4 + i * 0.06), c, t * 0.6));
}
// K. "Scan anything" on green, the real great-price sheet.
function headline2(ctx, t) {
  const tl = t - T.head2;
  field(ctx, C.good);
  bigHead(ctx, 'Scan', 'anything', 470, 190, t, T.head2 + 0.05, C.goodOn);
  const p = eExpo((tl - 0.1) / 0.7);
  tiltPhone(ctx, 540, lerp(2100, 1430, p), 0.95, 0, 0, (s) => {
    ctx.fillStyle = '#DCE6EE'; ctx.fillRect(0, 0, s.w, s.h);
    headphones(ctx, s.w / 2, s.h * 0.3, 0.75);
    ctx.fillStyle = 'rgba(11,12,14,.35)'; ctx.fillRect(0, 0, s.w, s.h);
    const img = IMG.sheetGreat, k = s.w / img.width; ctx.drawImage(img, 0, 0, s.w, img.height * k);
  });
}
// L. The same words, the field flips to pink, the phone shows the launch screen.
function splash(ctx, t) {
  const tl = t - T.splash;
  field(ctx, C.brand);
  bigHead(ctx, 'Scan', 'anything', 470, 190, t, -10, '#fff');
  tiltPhone(ctx, 540, 1430, 0.95, 0, 0, (s) => {
    ctx.fillStyle = C.night; ctx.fillRect(0, 0, s.w, s.h);
    const q = popS(t, T.splash + 0.1, 0.45);
    ctx.save(); ctx.translate(s.w / 2, 480); ctx.scale(q, q); ctx.drawImage(IMG.bluntDelighted, -110, -110, 220, 220); ctx.restore();
    if (tl > 0.25) logo(ctx, s.w / 2, 680, 96);
  });
}
// M. The end card: Pexi and the wordmark side by side, one line, on black.
function end(ctx, t) {
  const tl = t - T.end;
  field(ctx, C.night);
  const q = popS(t, T.end + 0.05, 0.5);
  ctx.save(); ctx.translate(330, 930); ctx.scale(q, q); ctx.rotate(Math.sin(tl * 2.4) * 0.05); ctx.drawImage(IMG.bluntDelighted, -120, -120, 240, 240); ctx.restore();
  if (q > 0.5) reg(ctx, 'face', 'mascot', 230, 830, 430, 1030);
  const g = eExpo((tl - 0.2) / 0.5);
  if (g > 0.01) {
    ctx.save(); ctx.globalAlpha = g; ctx.translate((1 - g) * 40, 0);
    ctx.font = FONTS.ui(150, 700); ctx.letterSpacing = `${-0.035 * 150}px`;
    const w = ctx.measureText('pexi').width + 30;
    logo(ctx, 480 + w / 2, 900, 150);
    ctx.restore();
  }
  line1(ctx, "Know if it's a rip-off.", 668, 1010, FONTS.ui(42, 500), C.muted, t, T.end + 0.45);
  line1(ctx, '@pexi.app', 540, 1540, FONTS.mono(34), C.ink, t, T.end + 0.9);
}

// ---------- the timeline ----------
// Hard cuts on the beat, like the reference: a scene change is a new colour field, not a fade.
const SCENES = [
  { start: T.intro, draw: intro }, { start: T.notif, draw: notif }, { start: T.pop, draw: verdictPop },
  { start: T.obj, draw: object }, { start: T.list, draw: list }, { start: T.head1, draw: headline1 },
  { start: T.stack, draw: stack }, { start: T.picker, draw: picker }, { start: T.scan, draw: scanScene },
  { start: T.tumble, draw: tumble }, { start: T.head2, draw: headline2 }, { start: T.splash, draw: splash },
  { start: T.end, draw: end },
];
function renderFrame(ctx, f, log) {
  LOG = log || null;
  const t = f / FPS;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.letterSpacing = '0px';
  const S = SCENES[SCENES.findLastIndex(s => t >= s.start)];
  S.draw(ctx, t);
  LOG = null;
}

window.LAUNCH = { renderFrame, SAFE, W, H, FPS, DUR, T, setImages: (o) => { IMG = o; } };
})();
