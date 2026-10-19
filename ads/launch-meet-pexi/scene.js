// Every frame of "Meet Pexi", the 20 s launch video, drawn with canvas 2D.
// renderFrame(ctx, frame) is pure: the same frame number always draws the same picture.
//
// The look follows the reference he picked (a Klarna concept reel by @olafmotion):
// soft pastel light fields and a deep dark with one glow, tight grotesque type that glides
// in with motion blur, the product floating with no hands, a cursor tapping real UI,
// a glowing checklist, and an end card that is the logo and one line. Calm easing,
// few words. The content is Pexi's own: the mascot faces as they ship, the app's REAL
// verdict sheet (sheet.mjs), staged prices, made-up stores.
//    0.0  hook      "$180 for these?"  the same shoes might be cheaper elsewhere; the verdict at 2.0
//    2.6  meet      a neon ring draws round Pexi.  "Meet Pexi."
//    4.6  scan      the phone floats in, the cursor taps the shutter
//    5.9  check     reading the barcode / finding the typical price / comparing stores
//    7.3  sheet     the real verdict sheet rises, the camera pushes in
//    9.2  range     headphones (bad), face serum (reasonable), the same shoes elsewhere (great)
//   13.7  picker    "Pick your Pexi."  the cursor picks deadpan, warm, blunt
//   16.7  end       the icon, the logo, one line
(function () {
const W = 1080, H = 1920, FPS = 30, DUR = 20;
const SAFE = { x0: 154, y0: 285, x1: 925, y1: 1635 };

// app/public/css/tokens.css, the mascot colours from js/face-art.js
const C = {
  ground: '#0B0C0E', night: '#0D0B13', paper: '#F7F6F9', ink: '#F7F5F2', inkDark: '#0B0C0E',
  muted: '#A5ADB8', mutedDark: '#5B6470', brand: '#E5165E', navy: '#12233A',
  good: '#12B76A', goodBright: '#38E08B', goodOn: '#04140C',
  walk: '#C23619', walkBright: '#FF6A45',
  fair: '#E8A020', fairBright: '#FFC24D', fairOn: '#1F1400',
  cyan: '#2BB5F0',
};
// Inter Tight for everything set: a tight, clean grotesque (fonts/, OFL). Plex Mono for small labels.
const FD = "'Inter Tight'", FU = "'Inter Tight'", FM = "'IBM Plex Mono'";
const T = { meet: 2.6, scan: 4.6, check: 5.9, sheet: 7.3, range: 9.2, picker: 13.7, end: 16.7 };

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

// ---------- grounds ----------
// Light: paper with three soft colour fields drifting (cyan, pink, lavender), never a verdict hue.
function lightGround(ctx, t, seed = 0) {
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  const blobs = [['rgba(43,181,240,', 180, 360, 760], ['rgba(229,22,94,', 930, 640, 700], ['rgba(150,140,240,', 300, 1640, 820], ['rgba(229,22,94,', 900, 1720, 520]];
  blobs.forEach(([c, x, y, r], i) => {
    const bx = x + 70 * Math.sin(t * 0.5 + i * 1.7 + seed), by = y + 60 * Math.cos(t * 0.4 + i * 2.3 + seed);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, c + (i === 3 ? '.16)' : '.30)')); g.addColorStop(1, c + '0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  });
}
// Dark: near-black with one soft glow. The glow takes the verdict hue only on a verdict.
function darkGround(ctx, t, glow = 'rgba(229,22,94,', gx = 540, gy = 900, strength = 1, r = 900) {
  ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, H);
  const pulse = 0.9 + 0.1 * Math.sin(t * Math.PI);
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
  g.addColorStop(0, glow + (0.42 * strength * pulse).toFixed(3) + ')'); g.addColorStop(0.55, glow + (0.12 * strength).toFixed(3) + ')'); g.addColorStop(1, glow + '0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
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
// Three things people actually scan, drawn to look like objects rather than icons:
// soft gradients, a highlight, a contact shadow, no outlines, no brand anywhere.
function contactShadow(ctx, y, w, a = 0.26) {
  ctx.save(); ctx.translate(0, y); ctx.scale(1, 0.13);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(20,20,45,${a})`); g.addColorStop(1, 'rgba(20,20,45,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w, 0, 7); ctx.fill(); ctx.restore();
}
// A running shoe, side on, toe to the right. About 610 x 290 at s = 1.
function sneaker(ctx, cx, cy, s) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  contactShadow(ctx, 122, 330);
  const upper = () => {
    ctx.beginPath(); ctx.moveTo(-270, 44);
    ctx.bezierCurveTo(-294, -10, -284, -84, -250, -114);
    ctx.bezierCurveTo(-224, -132, -188, -126, -168, -106);
    ctx.bezierCurveTo(-138, -82, -98, -80, -70, -102);
    ctx.lineTo(-52, -152); ctx.bezierCurveTo(-42, -172, -10, -174, 2, -152);
    ctx.bezierCurveTo(44, -110, 124, -62, 204, -32);
    ctx.bezierCurveTo(274, -8, 308, 20, 302, 50); ctx.lineTo(-270, 50); ctx.closePath();
  };
  const sole = () => {
    ctx.beginPath(); ctx.moveTo(-292, 38);
    ctx.bezierCurveTo(-302, 80, -296, 114, -262, 118); ctx.lineTo(232, 118);
    ctx.bezierCurveTo(292, 118, 320, 92, 314, 52); ctx.bezierCurveTo(302, 38, 262, 36, 200, 42);
    ctx.lineTo(-150, 44); ctx.bezierCurveTo(-232, 42, -282, 28, -292, 38); ctx.closePath();
  };
  // the opening, seen past the collar
  ctx.beginPath(); ctx.moveTo(-170, -104); ctx.bezierCurveTo(-140, -122, -96, -124, -68, -104); ctx.bezierCurveTo(-98, -86, -140, -86, -170, -104); ctx.fillStyle = '#2C2B30'; ctx.fill();
  // upper
  let g = ctx.createLinearGradient(0, -170, 0, 50); g.addColorStop(0, '#FBFAF7'); g.addColorStop(1, '#D9D5CC');
  upper(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); upper(); ctx.clip();
  // overlays: heel counter, toe cap, eyestay, in a deep navy suede
  const suede = ctx.createLinearGradient(0, -150, 0, 50); suede.addColorStop(0, '#2A3A5C'); suede.addColorStop(1, '#17223A');
  ctx.fillStyle = suede;
  ctx.beginPath(); ctx.moveTo(-300, 60); ctx.lineTo(-300, -140); ctx.bezierCurveTo(-230, -120, -190, -40, -200, 60); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(320, 60); ctx.lineTo(320, -40); ctx.bezierCurveTo(250, -40, 200, 0, 190, 60); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-60, -160); ctx.bezierCurveTo(10, -120, 110, -60, 210, -24); ctx.lineTo(196, 8); ctx.bezierCurveTo(100, -30, 10, -84, -70, -122); ctx.closePath(); ctx.fill();
  // two side lines, stitched: generic, nobody's mark
  ctx.setLineDash([9, 7]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,40,70,.35)';
  for (const d of [0, 18]) { ctx.beginPath(); ctx.moveTo(-190, 20 - d); ctx.bezierCurveTo(-80, -10 - d, 60, -20 - d, 180, 14 - d); ctx.stroke(); }
  ctx.setLineDash([]);
  // soft top light
  const hl = ctx.createLinearGradient(0, -170, 0, -40); hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.fillRect(-300, -180, 620, 140);
  ctx.restore();
  // laces
  for (let i = 0; i < 6; i++) {
    const x = -28 + i * 38, y = -132 + i * 21;
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.5);
    rr(ctx, -22, -6, 44, 12, 6); ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2; ctx.fill();
    ctx.restore();
  }
  // pull tab
  rr(ctx, -268, -138, 26, 52, 8); ctx.fillStyle = '#E5E1D8'; ctx.fill();
  // midsole and outsole
  g = ctx.createLinearGradient(0, 36, 0, 118); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#E3E0DA');
  sole(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); sole(); ctx.clip();
  ctx.fillStyle = '#B77D4A'; ctx.fillRect(-320, 100, 660, 30);
  ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(-320, 92, 660, 8);
  ctx.restore();
  ctx.restore();
}
// Over-ear headphones, front on. About 470 x 500 at s = 1.
function headphones(ctx, cx, cy, s) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  contactShadow(ctx, 250, 260, 0.35);
  // headband
  ctx.lineCap = 'round';
  let g = ctx.createLinearGradient(-220, -200, 220, 0); g.addColorStop(0, '#E9E3D9'); g.addColorStop(0.5, '#D4CBBD'); g.addColorStop(1, '#B9AE9E');
  ctx.beginPath(); ctx.arc(0, 30, 205, Math.PI * 1.04, Math.PI * 1.96); ctx.lineWidth = 46; ctx.strokeStyle = g; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 30, 205, Math.PI * 1.15, Math.PI * 1.85); ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 30, 182, Math.PI * 1.12, Math.PI * 1.88); ctx.lineWidth = 16; ctx.strokeStyle = '#3A3733'; ctx.stroke();
  for (const sx of [-1, 1]) {
    // slider
    const m = ctx.createLinearGradient(sx * 200 - 10, 0, sx * 200 + 10, 0); m.addColorStop(0, '#9DA3AA'); m.addColorStop(0.5, '#EEF0F2'); m.addColorStop(1, '#8A9097');
    rr(ctx, sx * 205 - 9, 10, 18, 110, 9); ctx.fillStyle = m; ctx.fill();
    // cup
    ctx.save(); ctx.translate(sx * 200, 190);
    g = ctx.createLinearGradient(-90, -130, 90, 130); g.addColorStop(0, '#EFE9E0'); g.addColorStop(0.55, '#CFC5B6'); g.addColorStop(1, '#A99D8B');
    ctx.beginPath(); ctx.ellipse(0, 0, 84, 128, 0, 0, 7); ctx.fillStyle = g; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // cushion on the inner side
    ctx.beginPath(); ctx.ellipse(-sx * 46, 0, 40, 116, 0, 0, 7); ctx.fillStyle = '#2E2C29'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-sx * 40, -10, 18, 80, 0, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
    // highlight
    ctx.beginPath(); ctx.ellipse(sx * 28, -50, 22, 56, sx * 0.25, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
// A face serum in an amber dropper bottle. About 200 x 470 at s = 1.
function serum(ctx, cx, cy, s) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  contactShadow(ctx, 232, 150, 0.32);
  // bulb
  let g = ctx.createLinearGradient(-40, 0, 40, 0); g.addColorStop(0, '#26252A'); g.addColorStop(0.35, '#4A4950'); g.addColorStop(1, '#141417');
  rr(ctx, -38, -250, 76, 120, 38); ctx.fillStyle = g; ctx.fill();
  // collar, ribbed
  g = ctx.createLinearGradient(-54, 0, 54, 0); g.addColorStop(0, '#DCDAD5'); g.addColorStop(0.4, '#FFFFFF'); g.addColorStop(1, '#BDB9B2');
  rr(ctx, -54, -150, 108, 62, 10); ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.07)'; for (let x = -46; x <= 46; x += 8) ctx.fillRect(x, -146, 3, 54);
  // glass
  const body = () => rr(ctx, -92, -92, 184, 320, 34);
  g = ctx.createLinearGradient(-92, 0, 92, 0); g.addColorStop(0, '#8E4A16'); g.addColorStop(0.3, '#C97A30'); g.addColorStop(0.7, '#B5651E'); g.addColorStop(1, '#6E3410');
  body(); ctx.fillStyle = g; ctx.shadowColor = 'rgba(80,40,10,.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save(); body(); ctx.clip();
  ctx.fillStyle = 'rgba(255,190,110,.25)'; ctx.fillRect(-92, 10, 184, 220);
  ctx.fillStyle = 'rgba(255,255,255,.42)'; rr(ctx, -70, -80, 14, 290, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.15)'; rr(ctx, 52, -60, 8, 240, 4); ctx.fill();
  ctx.restore();
  // label: plain, no brand
  rr(ctx, -66, 30, 132, 150, 8); ctx.fillStyle = '#F5F0E7'; ctx.fill();
  ctx.fillStyle = '#3A2A1C'; ctx.textAlign = 'center';
  ctx.font = `700 24px 'Inter Tight'`; ctx.letterSpacing = '3px'; ctx.fillText('FACE', 0, 92); ctx.fillText('SERUM', 0, 122);
  ctx.font = `500 18px 'Inter Tight'`; ctx.letterSpacing = '1px'; ctx.fillStyle = '#8A7B6A'; ctx.fillText('30 mL', 0, 158);
  ctx.letterSpacing = '0px';
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
const SHUTTER = () => [PH.cx, PH.cy + PH.h / 2 - 120];

// ---------- scenes ----------
function hook(ctx, t) {
  lightGround(ctx, t);
  headline(ctx, ['$180', 'for these?'], 540, 520, 220, t, 0.05, null, w => w.includes('$') ? C.brand : C.inkDark);
  line1(ctx, 'The same pair might be cheaper', 540, 800, FONTS.ui(46), C.mutedDark, t, 0.5);
  line1(ctx, 'somewhere else.', 540, 860, FONTS.ui(46), C.mutedDark, t, 0.58);
  // the shoe floats up into place
  const p = eExpo((t - 0.3) / 0.9), y = lerp(1300, 0, p);
  ctx.save(); ctx.globalAlpha = clamp(p * 1.4);
  if (p < 0.95) ctx.filter = `blur(${((1 - p) * 18).toFixed(1)}px)`;
  const fy = 8 * Math.sin(t * 2);
  sneaker(ctx, 530, 1180 + y + fy, 1.0);
  tag(ctx, 600, 1010 + y + fy, -0.12 + 0.05 * Math.sin(t * 2.6) * Math.exp(-t * 0.5), 300, 170, '$180');
  ctx.restore();
  // the result, first
  if (t >= 2.0) {
    const s = lerp(0.6, 1, eBack((t - 2.0) / 0.35, 1.6));
    pill(ctx, 'Bad price', 540, 1480, 64, C.walk, '#FFFFFF', s, 'rgba(194,54,25,.6)');
  }
}
function meet(ctx, t) {
  const tl = t - T.meet;
  darkGround(ctx, t, 'rgba(229,22,94,', 540, 860, clamp(tl / 0.6), 760);
  const fp = eExpo((tl - 0.1) / 0.6);
  face(ctx, IMG.deadpanPleased, 540, 860, lerp(380, 460, fp), t, { alpha: fp, dark: true, blur: (1 - fp) * 14 });
  neonRing(ctx, 540, 860, 290, eInOut((tl - 0.2) / 0.8), C.brand, 1, t);
  headline(ctx, ['Meet Pexi.'], 540, 1300, 160, t, T.meet + 0.55, null, w => C.ink);
}
function scan(ctx, t) {
  const tl = t - T.scan;
  lightGround(ctx, t, 2);
  headline(ctx, ['Scan anything.'], 540, 400, 140, t, T.scan + 0.1, null, () => C.inkDark);
  const p = eExpo(tl / 0.7);
  const cy = lerp(PH.cy + 900, PH.cy, p), rot = lerp(-0.12, -0.02, p);
  ctx.save(); if (p < 0.97) ctx.filter = `blur(${((1 - p) * 20).toFixed(1)}px)`;
  phone(ctx, PH.cx, cy, PH.w, PH.h, rot, (s) => {
    cameraFeed(ctx, s, t, true);
    if (t >= T.check - 0.28) { ctx.fillStyle = `rgba(255,255,255,${0.9 * clamp(1 - (t - T.check + 0.28) / 0.25)})`; ctx.fillRect(0, 0, s.w, s.h); }
  });
  ctx.restore();
  // the cursor comes in from the right and taps the shutter
  const [sx, sy] = SHUTTER();
  const [x, y] = path2([[T.scan + 0.5, 980, 1700], [T.scan + 1.0, sx + 6, sy - 4]], t);
  if (t > T.scan + 0.45) cursor(ctx, x, y, t, [T.check - 0.3]);
}
const CHECKS = ['Reading the barcode', 'Finding the typical price', 'Comparing stores'];
function check(ctx, t) {
  const tl = t - T.check;
  darkGround(ctx, t, 'rgba(229,22,94,', 540, 1000, 0.8, 820);
  // the item, small and soft, behind the list
  ctx.save(); ctx.globalAlpha = 0.35; ctx.filter = 'blur(6px)'; sneaker(ctx, 540, 1430, 0.6); ctx.restore();
  faceSwap(ctx, IMG.bluntIdle, IMG.bluntThinking, 540, 640, 260, t, T.check + 0.2, { dark: true });
  const step = 0.38;
  CHECKS.forEach((txt, i) => {
    const on = tl - 0.15 - i * step;
    if (on < 0) return;
    const shift = Math.min(i, Math.max(0, Math.floor((tl - 0.15) / step))) ;
    const y = 960 + i * 92 - clamp((tl - 0.15 - (CHECKS.length - 1) * step) / 0.4) * 0;
    const g = glide(t, T.check + 0.15 + i * step, Infinity, 0.4);
    const done = tl > 0.15 + (i + 1) * step - 0.05;
    ctx.save(); ctx.globalAlpha = g.a * (done || i === CHECKS.length - 1 ? 1 : 0.85);
    if (g.blur > 0.3) ctx.filter = `blur(${g.blur.toFixed(1)}px)`;
    // the tick
    const ix = 250, iy = y - 18 + g.dy * 0.5;
    ctx.beginPath(); ctx.arc(ix, iy, 22, 0, 7); ctx.fillStyle = done ? C.brand : 'rgba(255,255,255,.12)'; ctx.fill();
    if (done) { ctx.beginPath(); ctx.moveTo(ix - 10, iy); ctx.lineTo(ix - 3, iy + 8); ctx.lineTo(ix + 11, iy - 8); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(ix, iy, 13, -Math.PI / 2 + t * 9, t * 9 + 1.6); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    ctx.font = FONTS.ui(52); ctx.textAlign = 'left'; ctx.fillStyle = done ? C.ink : C.muted;
    if (done) { ctx.shadowColor = 'rgba(229,22,94,.55)'; ctx.shadowBlur = 24; }
    ctx.fillText(txt, 296, y + g.dy * 0.5);
    const w = ctx.measureText(txt).width;
    ctx.restore();
    if (g.a > 0.5) reg(ctx, 'text', txt, ix - 22, y - 50, 296 + w, y + 12);
    void shift;
  });
}
function sheet(ctx, t) {
  const tl = t - T.sheet;
  lightGround(ctx, t, 4);
  headline(ctx, ['It knows what it', 'normally costs.'], 540, 420, 124, t, T.sheet + 0.15, null, () => C.inkDark);
  const push = lerp(1, 1.22, eInOut((tl - 1.0) / 0.8));
  const top = PH.cy - PH.h / 2;
  ctx.save(); ctx.translate(540, top); ctx.scale(push, push); ctx.translate(-540, -top);
  phone(ctx, PH.cx, PH.cy, PH.w, PH.h, -0.02 * (1 - eInOut(tl / 0.6)), (s) => {
    cameraFeed(ctx, s, t, false);
    const p = eExpo(tl / 0.6);
    ctx.fillStyle = `rgba(11,12,14,${0.35 * p})`; ctx.fillRect(0, 0, s.w, s.h);
    const img = IMG.sheet, k = s.w / img.width;
    ctx.drawImage(img, 0, (1 - p) * s.h * 0.7, s.w, img.height * k);
  });
  ctx.restore();
}
const RANGE = [
  { at: T.range, item: 'Wireless headphones', here: '$249', normal: '$179', word: 'Bad price', fill: C.walk, on: '#FFFFFF', bright: C.walkBright, face: 'bluntAngry', line: '"Hard pass."', draw: (c) => headphones(c, 540, 520, 0.78) },
  { at: T.range + 1.5, item: 'Face serum, 30 mL', here: '$34', normal: '$32', word: 'Reasonable', fill: C.fair, on: C.fairOn, bright: C.fairBright, face: 'bluntFair', line: '"Fair enough."', draw: (c) => serum(c, 540, 540, 0.82) },
  { at: T.range + 3.0, item: 'The same shoes, another store', here: '$79', normal: '$120', word: 'Great price', fill: C.good, on: C.goodOn, bright: C.goodBright, face: 'bluntDelighted', line: '"Somebody made a mistake."', draw: (c) => sneaker(c, 520, 600, 0.82) },
];
function range(ctx, t) {
  const i = RANGE.findLastIndex(r => t >= r.at), S = RANGE[i], P = RANGE[i - 1];
  const tl = t - S.at, x = eInOut(tl / 0.4);
  // the glow eases from the last verdict's hue to this one's
  darkGround(ctx, t, hex2rgba(S.fill), 540, 700, P ? x : clamp(tl / 0.4), 900);
  if (P && x < 1) { ctx.save(); ctx.globalAlpha = 1 - x; darkGround(ctx, t, hex2rgba(P.fill), 540, 700, 1, 900); ctx.restore(); }
  const t1 = i < RANGE.length - 1 ? RANGE[i + 1].at - 0.25 : null;
  // the thing being priced, gliding in and out
  const g = glide(t, S.at, t1 == null ? Infinity : t1, 0.5);
  if (g.a > 0.01) { ctx.save(); ctx.globalAlpha = g.a; if (g.blur > 0.3) ctx.filter = `blur(${g.blur.toFixed(1)}px)`; ctx.translate(0, g.dy); S.draw(ctx); ctx.restore(); }
  // Pexi beside it, reacting
  if (P) faceSwap(ctx, IMG[P.face], IMG[S.face], 790, 720, 230, t, S.at, { dark: true });
  else { const fp = eExpo(tl / 0.5); face(ctx, IMG[S.face], 790, 720, 230, t, { dark: true, alpha: fp, blur: (1 - fp) * 12 }); }
  line1(ctx, S.item, 540, 916, FONTS.ui(46), C.muted, t, S.at + 0.05, t1);
  line1(ctx, S.here, 540, 1100, FONTS.display(170), S.bright, t, S.at + 0.12, t1);
  line1(ctx, `normally ${S.normal}`, 540, 1180, FONTS.ui(46), C.ink, t, S.at + 0.2, t1);
  if (tl >= 0.35) {
    const out = t1 != null ? 1 - eInOut((t - t1) / 0.25) : 1;
    pill(ctx, S.word, 540, 1320, 62, S.fill, S.on, lerp(0.7, 1, eBack((tl - 0.35) / 0.3, 1.8)) * out, hex2rgba(S.fill) + '.7)');
  }
  line1(ctx, S.line, 540, 1490, FONTS.ui(50), C.ink, t, S.at + 0.6, t1);
  // a steal gets a little lift: soft sparks rising
  if (S.word === 'Great price' && tl > 0.35) {
    for (let k = 0; k < 14; k++) {
      const ph = ((tl - 0.35) * 0.7 + k / 14) % 1, xx = 540 + Math.sin(k * 2.4) * 330, yy = 860 - ph * 520;
      ctx.save(); ctx.globalAlpha = (1 - ph) * 0.8; ctx.fillStyle = k % 2 ? C.goodBright : '#fff'; ctx.shadowColor = C.goodBright; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(xx, yy, 5 + (k % 3) * 2, 0, 7); ctx.fill(); ctx.restore();
    }
  }
}
const VOICES = [
  { who: 'Deadpan', face: 'deadpanWalk', line: '"Two dollars. It\'s $1.47."', x: 300 },
  { who: 'Warm', face: 'warmWalk', line: '"Ooh, that\'s steep. I\'d wait."', x: 540 },
  { who: 'Blunt', face: 'bluntWalk', line: '"That price is a joke."', x: 780 },
];
function picker(ctx, t) {
  const tl = t - T.picker;
  lightGround(ctx, t, 6);
  headline(ctx, ['Pick your Pexi.'], 540, 400, 140, t, T.picker + 0.1, null, () => C.inkDark);
  const taps = [T.picker + 0.7, T.picker + 1.5, T.picker + 2.3];
  const sel = taps.filter(ta => t >= ta).length - 1;
  // the big one shows the current pick
  if (sel >= 0) {
    const cur = VOICES[sel], prev = VOICES[Math.max(0, sel - 1)];
    if (sel === 0) { const fp = eExpo((t - taps[0]) / 0.4); face(ctx, IMG[cur.face], 540, 800, 380, t, { alpha: fp, blur: (1 - fp) * 10 }); }
    else faceSwap(ctx, IMG[prev.face], IMG[cur.face], 540, 800, 380, t, taps[sel]);
    // the speech bubble
    const g = glide(t, taps[sel] + 0.05, sel < 2 ? taps[sel + 1] - 0.15 : Infinity, 0.4);
    if (g.a > 0.01) {
      ctx.save(); ctx.globalAlpha = g.a; if (g.blur > 0.3) ctx.filter = `blur(${g.blur.toFixed(1)}px)`;
      ctx.font = FONTS.ui(50); const w = ctx.measureText(cur.line).width + 80, by = 1080 + g.dy * 0.4;
      ctx.shadowColor = 'rgba(30,30,70,.16)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
      rr(ctx, 540 - w / 2, by, w, 112, 56); ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.beginPath(); ctx.moveTo(520, by + 2); ctx.lineTo(540, by - 22); ctx.lineTo(560, by + 2); ctx.fill();
      ctx.fillStyle = C.navy; ctx.textAlign = 'center'; ctx.fillText(cur.line, 540, by + 72);
      ctx.restore();
      if (g.a > 0.5) reg(ctx, 'text', cur.line, 540 - w / 2, 1080, 540 + w / 2, 1192);
    }
  }
  // the three swatches
  VOICES.forEach((v, i) => {
    const g = glide(t, T.picker + 0.15 + i * 0.08, Infinity, 0.5);
    const y = 1430 + g.dy;
    ctx.save(); ctx.globalAlpha = g.a;
    if (i === sel) { ctx.beginPath(); ctx.arc(v.x, y, 92, 0, 7); ctx.lineWidth = 7; ctx.strokeStyle = C.inkDark; ctx.stroke(); }
    ctx.drawImage(IMG[v.face], v.x - 76, y - 76, 152, 152);
    ctx.font = FONTS.mono(26); ctx.letterSpacing = '3px'; ctx.textAlign = 'center'; ctx.fillStyle = i === sel ? C.inkDark : C.mutedDark;
    ctx.fillText(v.who.toUpperCase(), v.x, y + 140);
    ctx.restore();
    if (g.a > 0.5) reg(ctx, 'face', v.who, v.x - 92, y - 92, v.x + 92, y + 150);
  });
  const [cx, cy] = path2([[T.picker + 0.2, 960, 1800], [T.picker + 0.6, VOICES[0].x + 20, 1450], [T.picker + 1.2, VOICES[0].x + 20, 1450], [T.picker + 1.45, VOICES[1].x + 20, 1450], [T.picker + 2.0, VOICES[1].x + 20, 1450], [T.picker + 2.25, VOICES[2].x + 20, 1450]], t);
  if (tl > 0.2) cursor(ctx, cx, cy, t, taps);
}
function end(ctx, t) {
  const tl = t - T.end;
  darkGround(ctx, t, 'rgba(229,22,94,', 540, 820, clamp(tl / 0.8), 820);
  // the app icon, as a home-screen tile, ringed in neon
  const ip = eExpo((tl - 0.05) / 0.6);
  ctx.save(); ctx.globalAlpha = ip; ctx.translate(540, 780); ctx.scale(lerp(0.85, 1, ip), lerp(0.85, 1, ip));
  if (ip < 0.97) ctx.filter = `blur(${((1 - ip) * 14).toFixed(1)}px)`;
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  rr(ctx, -130, -130, 260, 260, 60); ctx.fillStyle = '#000'; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save(); rr(ctx, -130, -130, 260, 260, 60); ctx.clip(); ctx.drawImage(IMG.icon, -130, -130, 260, 260); ctx.restore();
  ctx.restore();
  if (ip > 0.5) reg(ctx, 'face', 'icon', 410, 650, 670, 910);
  neonRing(ctx, 540, 780, 215, eInOut((tl - 0.2) / 0.9), C.brand, 1, t);
  const lp = glide(t, T.end + 0.6, Infinity, 0.6);
  if (lp.a > 0.01) { ctx.save(); ctx.globalAlpha = lp.a; if (lp.blur > 0.3) ctx.filter = `blur(${lp.blur.toFixed(1)}px)`; ctx.translate(0, lp.dy * 0.6); logo(ctx, 540, 1150, 190); ctx.restore(); }
  line1(ctx, "Know if it's a rip-off.", 540, 1330, FONTS.ui(56), C.muted, t, T.end + 1.0);
  line1(ctx, '@pexi.app', 540, 1560, FONTS.mono(34), C.ink, t, T.end + 1.4);
}

// ---------- the timeline and its transitions ----------
const SCENES = [
  { start: 0, draw: hook }, { start: T.meet, draw: meet, enter: 'shrink' }, { start: T.scan, draw: scan, enter: 'zoom' },
  { start: T.check, draw: check, enter: 'zoom' }, { start: T.sheet, draw: sheet, enter: 'zoom' }, { start: T.range, draw: range, enter: 'shrink' },
  { start: T.picker, draw: picker, enter: 'zoom' }, { start: T.end, draw: end, enter: 'shrink' },
];
const TR = 0.45;
function renderFrame(ctx, f, log) {
  LOG = log || null;
  const t = f / FPS;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
  const i = SCENES.findLastIndex(s => t >= s.start), S = SCENES[i];
  S.draw(ctx, t);
  const k = (t - S.start) / TR;
  if (S.enter && k < 1) {
    // the outgoing scene, drawn into a buffer and laid over the incoming one
    if (!BUF) BUF = new OffscreenCanvas(W, H);
    const b = BUF.getContext('2d'); b.setTransform(1, 0, 0, 1, 0, 0); b.globalAlpha = 1; b.filter = 'none';
    const log2 = LOG; LOG = null; SCENES[i - 1].draw(b, t); LOG = log2;
    const p = eInOut(k);
    ctx.save();
    if (S.enter === 'shrink') {
      // the old scene shrinks into a rounded card and falls away, blurring
      const s = lerp(1, 0.62, p), r = lerp(0, 90, clamp(p * 3));
      ctx.globalAlpha = 1 - eOut(clamp((k - 0.35) / 0.65));
      ctx.translate(540, 960 + p * 260); ctx.scale(s, s); ctx.translate(-540, -960);
      if (p > 0.05) ctx.filter = `blur(${(p * 18).toFixed(1)}px)`;
      rr(ctx, 0, 0, W, H, r / s); ctx.clip(); ctx.drawImage(BUF, 0, 0);
    } else {
      // the old scene rushes past the camera
      const s = lerp(1, 1.35, p);
      ctx.globalAlpha = 1 - p;
      ctx.translate(540, 960); ctx.scale(s, s); ctx.translate(-540, -960);
      ctx.filter = `blur(${(p * 26).toFixed(1)}px)`;
      ctx.drawImage(BUF, 0, 0);
    }
    ctx.restore();
  }
  LOG = null;
}

window.LAUNCH = { renderFrame, SAFE, W, H, FPS, DUR, T, setImages: (o) => { IMG = o; } };
})();
