// Every frame of the Pexi "rip-off hunt" Reel, drawn with canvas 2D.
// renderFrame(ctx, frame, variant) is pure: the same frame number always draws
// the same picture, which is what lets the last frame be built to flow into
// the first. Colours are copied from app/public/css/tokens.css, the faces are
// app/public/faces/blunt/{angry,delighted}.svg, the fonts are the app's own.
(function () {
const W = 1080, H = 1920, FPS = 30;
const SAFE = { x0: 154, y0: 285, x1: 925, y1: 1635 };

// app/public/css/tokens.css, plus the mascot colours from js/face-art.js
const C = {
  ground: '#0B0C0E', surface: '#16181C', raised: '#22262C', hair: '#2E333A',
  ink: '#F7F5F2', inkMuted: '#A5ADB8', brand: '#E5165E', faceInk: '#12233A',
  good: '#12B76A', goodBright: '#38E08B', goodOn: '#04140C',
  walk: '#C23619', walkBright: '#FF6A45', fair: '#E8A020', fairBright: '#FFC24D',
  cyan: '#2BB5F0', cyanDeep: '#1E93C9', orange: '#F26B1D',
};
const SKIN = '#E9A97F', SKIN_SH = '#C98458', NAIL = '#F7D2B8';
const FD = "'Bricolage Grotesque'", FU = "'Instrument Sans'";

const HOOKS = {
  A: 'POV: you scan the airport water',
  B: "Scan anything. Pexi tells you if you're getting ripped off.",
  C: 'This app just exposed this price',
};

let IMG = {};
let SHIFT = 0; // test hook: moves the captions sideways so the safe-box check can be made to fail
let LOG = null;

// ---------- small maths ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const eOut = x => 1 - Math.pow(1 - clamp(x), 3);
const eIn = x => Math.pow(clamp(x), 3);
const eBack = (x, s = 1.9) => { x = clamp(x); const c = s + 1; return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
// a slam: starts at `from`, lands on 1 with a small overshoot
const slam = (ts, from, dur = 0.17, s = 1.9) => ts < 0 ? null : lerp(from, 1, eBack(ts / dur, s));
function jitter(t, amp, seed = 0) {
  return [amp * (0.6 * Math.sin(t * 93 + seed) + 0.4 * Math.sin(t * 151 + seed * 2.1)),
          amp * (0.6 * Math.sin(t * 107 + seed * 3.3) + 0.4 * Math.sin(t * 173 + seed))];
}
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function ink(ctx, w = 8) { ctx.lineWidth = w; ctx.strokeStyle = C.faceInk; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }

// ---------- safe-box log ----------
function reg(ctx, kind, label, x0, y0, x1, y1) {
  if (!LOG) return;
  const m = ctx.getTransform();
  const p = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  LOG.push({ kind, label, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
}

// ---------- text ----------
function setFont(ctx, size, weight = 800, fam = FD) { ctx.font = `${weight} ${size}px ${fam}`; }
function lineWidth(ctx, s) { return ctx.measureText(s).width; }

// Every way to break `words` into at most maxLines lines.
function partitions(words, maxLines) {
  const out = [];
  const n = words.length;
  for (let mask = 0; mask < (1 << (n - 1)); mask++) {
    const lines = []; let cur = [words[0]];
    for (let i = 1; i < n; i++) { if (mask & (1 << (i - 1))) { lines.push(cur.join(' ')); cur = [words[i]]; } else cur.push(words[i]); }
    lines.push(cur.join(' '));
    if (lines.length <= maxLines) out.push(lines);
  }
  return out;
}
// Biggest single size at which every card fits maxW and all lines together fit maxH.
function fitCards(ctx, cards, maxW, maxH, maxSize, lh = 1.0, maxLines = 5) {
  const opts = cards.map(c => partitions(c.split(' '), 4));
  let best = null;
  const rec = (i, chosen) => {
    if (i === cards.length) {
      const lines = chosen.flat();
      if (lines.length > maxLines) return;
      setFont(ctx, 100);
      const widest = Math.max(...lines.map(l => lineWidth(ctx, l)));
      const s = Math.min(maxSize, Math.floor(100 * maxW / widest), Math.floor(maxH / (lines.length * lh)));
      // prefer bigger type, then fewer lines, then balanced lines
      const balance = Math.min(...lines.map(l => lineWidth(ctx, l))) / widest;
      // a line costs 12 px of type: "airport / water" on two lines reads worse than slightly smaller type
      const score = (s - 12 * lines.length) * 1000 + balance;
      if (!best || score > best.score) best = { score, size: s, cards: chosen.map(x => x.slice()) };
      return;
    }
    for (const o of opts[i]) rec(i + 1, [...chosen, o]);
  };
  rec(0, []);
  return best;
}

// One line, centred on cx, baseline y. Words with a $ take the highlight colour.
function textLine(ctx, line, cx, y, size, o = {}) {
  setFont(ctx, size, o.weight || 800, o.family || FD);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const words = line.split(' ');
  const sp = lineWidth(ctx, ' ');
  const ws = words.map(w => lineWidth(ctx, w));
  const total = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
  const m = ctx.measureText(line);
  reg(ctx, 'text', line, cx - total / 2, y - m.actualBoundingBoxAscent, cx + total / 2, y + m.actualBoundingBoxDescent);
  const xs = []; let x = cx - total / 2;
  for (let i = 0; i < words.length; i++) { xs.push(x); x += ws[i] + sp; }
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  if (o.stroke) {
    ctx.lineWidth = o.strokeW || size * 0.17;
    if (o.shadow) { ctx.strokeStyle = o.shadow; ctx.fillStyle = o.shadow; words.forEach((w, i) => { ctx.strokeText(w, xs[i], y + size * 0.075); ctx.fillText(w, xs[i], y + size * 0.075); }); }
    ctx.strokeStyle = o.stroke; words.forEach((w, i) => ctx.strokeText(w, xs[i], y));
  }
  words.forEach((w, i) => { ctx.fillStyle = (o.hl && w.includes('$')) ? o.hl : (o.fill || C.ink); ctx.fillText(w, xs[i], y); });
}

// Big caption cards. `cards` is a list of {text, scale} where scale null = not on screen yet.
function captions(ctx, cards, cx, cy, maxW, maxH, maxSize) {
  const fit = fitCards(ctx, cards.map(c => c.text), maxW, maxH, maxSize, 1.0, 4);
  const lh = fit.size * 1.0;
  const lines = [];
  fit.cards.forEach((ls, ci) => ls.forEach(l => lines.push({ l, ci })));
  const top = cy - (lines.length * lh) / 2;
  lines.forEach((ln, i) => {
    const sc = cards[ln.ci].scale;
    if (sc == null) return;
    const ly = top + i * lh + lh * 0.5;
    ctx.save(); ctx.translate(cx, ly); ctx.scale(sc, sc); ctx.translate(-cx, -ly);
    textLine(ctx, ln.l, cx, ly + fit.size * 0.36, fit.size, { stroke: C.ground, shadow: C.ground, hl: C.fairBright });
    ctx.restore();
  });
}

function wordmark(ctx, cx, cy, size) {
  // the app's wordmark (camera.css .wordmark), here all in the brand pink
  setFont(ctx, size, 800, FD);
  ctx.save(); ctx.letterSpacing = `${-0.03 * size}px`;
  const w = lineWidth(ctx, 'pexi.');
  ctx.fillStyle = 'rgba(11,12,14,.86)'; rr(ctx, cx - w / 2 - size * 0.55, cy - size * 0.72, w + size * 1.1, size * 1.3, size * 0.65); ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = C.brand; ctx.fillText('pexi.', cx, cy + size * 0.3);
  const m = ctx.measureText('pexi.');
  reg(ctx, 'text', 'pexi.', cx - w / 2, cy + size * 0.3 - m.actualBoundingBoxAscent, cx + w / 2, cy + size * 0.3 + m.actualBoundingBoxDescent);
  ctx.restore();
}

// ---------- backgrounds ----------
function sunburst(ctx, cx, cy, a0, c1, c2, n = 18) {
  ctx.fillStyle = c1; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c2;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * 2 * Math.PI / n;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 2600, a, a + Math.PI / n); ctx.closePath(); ctx.fill();
  }
  const g = ctx.createRadialGradient(cx, cy, 200, cx, cy, 1400);
  g.addColorStop(0, 'rgba(11,12,14,0)'); g.addColorStop(1, 'rgba(11,12,14,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function topShade(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 900);
  g.addColorStop(0, 'rgba(11,12,14,.55)'); g.addColorStop(1, 'rgba(11,12,14,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 900);
}

// ---------- hands ----------
function sleeve(ctx, pts, cuffAt) {
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  ctx.fillStyle = SKIN; ctx.fill(); ink(ctx);
  if (cuffAt) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = C.raised; ctx.fillRect(cuffAt[0], cuffAt[1], cuffAt[2], cuffAt[3]);
    ctx.fillStyle = C.brand; ctx.fillRect(cuffAt[0], cuffAt[1], cuffAt[2], 22);
    ctx.restore();
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ink(ctx);
  }
}
function fingerH(ctx, x, y, w, h, tipLeft = true) {
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = SKIN; ctx.fill(); ink(ctx, 7);
  ctx.fillStyle = SKIN_SH; rr(ctx, x + 10, y + h - 16, w - 20, 9, 4); ctx.fill();
  const nx = tipLeft ? x + h * 0.16 : x + w - h * 0.16 - h * 0.55;
  rr(ctx, nx, y + h * 0.2, h * 0.55, h * 0.6, h * 0.24); ctx.fillStyle = NAIL; ctx.fill();
}
function thumb(ctx, cx, cy, len, wid, ang) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
  rr(ctx, -wid / 2, -len / 2, wid, len, wid / 2); ctx.fillStyle = SKIN; ctx.fill(); ink(ctx, 7);
  rr(ctx, -wid * 0.3, -len / 2 + wid * 0.15, wid * 0.6, wid * 0.62, wid * 0.25); ctx.fillStyle = NAIL; ctx.fill();
  ctx.restore();
}

// ---------- objects ----------
function bottle(ctx) {
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-42, -300); ctx.lineTo(-42, -268); ctx.bezierCurveTo(-42, -228, -100, -214, -100, -160);
    ctx.lineTo(-100, 270); ctx.quadraticCurveTo(-100, 312, -58, 312); ctx.lineTo(58, 312); ctx.quadraticCurveTo(100, 312, 100, 270);
    ctx.lineTo(100, -160); ctx.bezierCurveTo(100, -214, 42, -228, 42, -268); ctx.lineTo(42, -300); ctx.closePath();
  };
  body(); ctx.fillStyle = 'rgba(236,248,255,.95)'; ctx.fill();
  ctx.save(); body(); ctx.clip();
  ctx.fillStyle = 'rgba(43,181,240,.42)'; ctx.fillRect(-120, -150, 240, 480);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; rr(ctx, -80, -150, 18, 400, 9); ctx.fill();
  ctx.fillStyle = C.ink; ctx.fillRect(-120, -80, 240, 150);   // blank label, no brand
  ctx.fillStyle = C.cyan; ctx.fillRect(-120, -18, 240, 26);
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(-100, -80); ctx.lineTo(100, -80); ctx.moveTo(-100, 70); ctx.lineTo(100, 70); ink(ctx, 6);
  body(); ink(ctx);
  rr(ctx, -54, -372, 108, 76, 14); ctx.fillStyle = C.faceInk; ctx.fill(); ink(ctx);
  ctx.strokeStyle = '#2E4A6E'; ctx.lineWidth = 6;
  for (let x = -36; x <= 36; x += 18) { ctx.beginPath(); ctx.moveTo(x, -360); ctx.lineTo(x, -308); ctx.stroke(); }
}
function bottleInHand(ctx, cx, cy) {
  ctx.save(); ctx.translate(cx, cy);
  sleeve(ctx, [[70, 20], [200, 10], [360, 700], [110, 720]], [0, 470, 500, 400]);
  bottle(ctx);
  for (let i = 0; i < 4; i++) fingerH(ctx, -128, 46 + i * 64, 250, 62);
  thumb(ctx, 118, -2, 160, 60, -0.32);
  ctx.restore();
}

function bucketInHand(ctx, cx, cy) {
  ctx.save(); ctx.translate(cx, cy);
  const r = rng(7);
  // popcorn
  for (let i = 0; i < 26; i++) {
    const x = (r() * 2 - 1) * 210, dome = Math.sqrt(1 - Math.pow(x / 240, 2));
    const y = -240 - r() * 150 * dome - 10;
    const s = 34 + r() * 16;
    ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.arc(x + s * 0.7, y + s * 0.3, s * 0.75, 0, 7); ctx.arc(x - s * 0.6, y + s * 0.35, s * 0.7, 0, 7);
    ctx.fillStyle = '#FFF4DC'; ctx.fill(); ink(ctx, 5);
    ctx.beginPath(); ctx.arc(x + s * 0.2, y - s * 0.1, s * 0.3, 0, 7); ctx.fillStyle = C.fairBright; ctx.fill();
  }
  sleeve(ctx, [[150, 0], [300, -30], [420, 720], [170, 720]], [0, 440, 600, 400]);
  const body = () => { ctx.beginPath(); ctx.moveTo(-225, -230); ctx.lineTo(225, -230); ctx.lineTo(168, 270); ctx.lineTo(-168, 270); ctx.closePath(); };
  body(); ctx.fillStyle = C.ink; ctx.fill();
  ctx.save(); body(); ctx.clip();
  for (let i = 0; i < 9; i += 2) {
    const a = -225 + i * 50, b = -168 + i * 37.3;
    ctx.beginPath(); ctx.moveTo(a, -240); ctx.lineTo(a + 50, -240); ctx.lineTo(b + 37.3, 280); ctx.lineTo(b, 280); ctx.closePath();
    ctx.fillStyle = C.walk; ctx.fill();
  }
  ctx.restore();
  body(); ink(ctx);
  rr(ctx, -240, -258, 480, 44, 14); ctx.fillStyle = C.ink; ctx.fill(); ink(ctx);
  for (let i = 0; i < 4; i++) fingerH(ctx, 120, -10 + i * 64, 170, 62);
  thumb(ctx, 205, -70, 150, 60, 0.5);
  ctx.restore();
}

function jacketInHand(ctx, cx, cy) {
  ctx.save(); ctx.translate(cx - 560, cy - 1000);
  // hanger hook and bar
  ctx.beginPath(); ctx.moveTo(560, 470); ctx.lineTo(560, 540); ctx.moveTo(300, 650); ctx.lineTo(560, 560); ctx.lineTo(820, 650);
  ctx.lineWidth = 16; ctx.strokeStyle = C.faceInk; ctx.lineCap = 'round'; ctx.stroke();
  ctx.lineWidth = 8; ctx.strokeStyle = C.inkMuted; ctx.stroke();
  // sleeves
  const sl = (s) => { ctx.beginPath(); [[380, 618], [300, 645], [196, 1300], [312, 1324], [392, 820]].forEach(([x, y], i) => { x = s ? 1120 - x : x; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
  [0, 1].forEach(s => { sl(s); ctx.fillStyle = C.ink; ctx.fill(); ink(ctx);
    ctx.save(); sl(s); ctx.clip(); ctx.fillStyle = C.orange; ctx.fillRect(s ? 800 : 150, 1250, 170, 90); ctx.fillStyle = C.ink; ctx.fillRect(s ? 800 : 150, 1278, 170, 14); ctx.restore(); sl(s); ink(ctx); });
  // body
  const bd = () => { ctx.beginPath(); ctx.moveTo(380, 612); ctx.lineTo(740, 612); ctx.lineTo(772, 1390); ctx.lineTo(348, 1390); ctx.closePath(); };
  bd(); ctx.fillStyle = C.faceInk; ctx.fill();
  ctx.save(); bd(); ctx.clip(); ctx.fillStyle = C.orange; ctx.fillRect(300, 1320, 520, 80); ctx.fillStyle = C.ink; ctx.fillRect(300, 1346, 520, 14); ctx.restore();
  bd(); ctx.lineWidth = 8; ctx.strokeStyle = C.ground; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(560, 700); ctx.lineTo(560, 1320); ctx.setLineDash([10, 8]); ctx.lineWidth = 8; ctx.strokeStyle = C.inkMuted; ctx.stroke(); ctx.setLineDash([]);
  [[420, 1080], [650, 1080]].forEach(([x, y]) => { rr(ctx, x, y, 50, 120, 12); ctx.fillStyle = C.ink; ctx.fill(); });
  // collar
  ctx.beginPath(); ctx.moveTo(470, 600); ctx.lineTo(560, 710); ctx.lineTo(650, 600);
  ctx.lineWidth = 40; ctx.strokeStyle = C.ground; ctx.stroke(); ctx.lineWidth = 28; ctx.strokeStyle = C.orange; ctx.stroke();
  ctx.lineWidth = 8; ctx.strokeStyle = C.ink; ctx.stroke();
  // the hand on the hook, arm off the top
  sleeve(ctx, [[600, 380], [690, 430], [1000, -60], [820, -120]], [700, -200, 400, 380]);
  rr(ctx, 490, 380, 150, 110, 40); ctx.fillStyle = SKIN; ctx.fill(); ink(ctx);
  ctx.beginPath(); for (let i = 1; i < 4; i++) { ctx.moveTo(490 + i * 37, 392); ctx.lineTo(490 + i * 37, 430); } ink(ctx, 6);
  thumb(ctx, 530, 470, 110, 52, -1.25);
  ctx.restore();
}

// A price tag hanging from (hx, hy) by its hole, swinging by `ang`.
function tag(ctx, hx, hy, ang, w, h, price, priceScale = 1, anchor) {
  if (anchor) { ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.quadraticCurveTo((anchor[0] + hx) / 2, Math.max(anchor[1], hy) + 30, hx, hy); ctx.lineWidth = 5; ctx.strokeStyle = C.ink; ctx.stroke(); }
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
  const shape = () => { ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(20, -h / 2); ctx.lineTo(w - 70, -h / 2); ctx.quadraticCurveTo(w - 40, -h / 2, w - 40, -h / 2 + 30); ctx.lineTo(w - 40, h / 2 - 30); ctx.quadraticCurveTo(w - 40, h / 2, w - 70, h / 2); ctx.lineTo(20, h / 2); ctx.closePath(); };
  ctx.fillStyle = 'rgba(11,12,14,.3)'; ctx.save(); ctx.translate(10, 16); shape(); ctx.fill(); ctx.restore();
  shape(); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ink(ctx, 8);
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fillStyle = C.faceInk; ctx.fill();
  const pcx = (20 + w - 40) / 2 + 8;
  setFont(ctx, 100); const pw = lineWidth(ctx, price);
  const size = Math.min(h * 0.62, 100 * (w - 130) / pw);
  ctx.translate(pcx, 0); ctx.scale(priceScale, priceScale);
  textLine(ctx, price, 0, size * 0.36, size, { fill: C.faceInk });
  ctx.restore();
}

// ---------- the mascot ----------
const FACE_FRAC = 81 / 88; // the disc is r 40.5 + ring in an 88 box
function face(ctx, img, cx, cy, size, rot = 0, alpha = 1) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(11,12,14,.4)'; ctx.beginPath(); ctx.arc(10, 18, size * FACE_FRAC / 2, 0, 7); ctx.fill();
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  const r = size * FACE_FRAC / 2;
  if (alpha > 0.5) reg(ctx, 'face', 'mascot', -r, -r, r, r);
  ctx.restore();
}
function steam(ctx, cx, cy, size, t, amount) {
  for (const side of [-1, 1]) {
    const ex = cx + side * size * 0.29, ey = cy + size * 0.04;
    const N = 7;
    for (let i = 0; i < N; i++) {
      const p = (t * 1.9 + i / N) % 1;
      const x = ex + side * p * size * 0.42, y = ey - p * size * 0.62 - Math.sin(p * 9 + i) * 12;
      const r = size * (0.035 + 0.1 * p) * amount;
      ctx.globalAlpha = (1 - p) * 0.95;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.arc(x + r * 0.7, y + r * 0.2, r * 0.7, 0, 7);
      ctx.fillStyle = C.ink; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.faceInk; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
function vein(ctx, x, y, v, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  for (let k = 0; k < 4; k++) {
    ctx.save(); ctx.rotate(k * Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(v * 0.22, v * 0.95); ctx.quadraticCurveTo(v * 0.22, v * 0.22, v * 0.95, v * 0.22);
    ctx.lineCap = 'round'; ctx.lineWidth = v * 0.42; ctx.strokeStyle = C.faceInk; ctx.stroke();
    ctx.lineWidth = v * 0.26; ctx.strokeStyle = C.walkBright; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function sparkle(ctx, x, y, r, rot, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rad = i % 2 ? r * 0.28 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ink(ctx, 5);
  ctx.restore();
}
function confetti(ctx, ts, seed, ox, oy, spread, up) {
  if (ts < 0 || ts > 2.4) return;
  const r = rng(seed);
  const cols = [C.brand, C.fairBright, C.goodBright, C.cyan, C.ink, C.orange];
  for (let i = 0; i < 90; i++) {
    const vx = (r() * 2 - 1) * spread, vy = -(0.45 + r() * 1.1) * up;
    const x = ox + vx * ts, y = oy + vy * ts + 1500 * ts * ts;
    const w = 16 + r() * 18, h = 10 + r() * 10, rot = r() * 6 + ts * (r() * 14 - 7);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
  }
}

// ---------- product shots ----------
// The water-bottle shot opens the video and closes it. `tt` runs continuously
// across the loop point (t for the opening, t - 15 for the close), so the push,
// the sunburst and the handheld sway at the last frame lead into the first.
function bottleSwing(t) {
  let a = 0;
  for (const [k, A] of [[0.5, 0.2], [2.0, 0.08], [14.0, 0.16]]) if (t >= k) a += A * Math.exp(-5 * (t - k)) * Math.sin(2 * Math.PI * 2.2 * (t - k));
  return a;
}
const BOTTLE_TAG = { hx: 452, hy: 1004, w: 440, h: 250, rest: 0.14 };
function bottleShot(ctx, t, tt) {
  const z = 1 + 0.032 * tt;
  const sx = 7 * Math.sin(2 * Math.PI * tt / 1.5), sy = 5 * Math.sin(2 * Math.PI * tt / 3 + 1);
  sunburst(ctx, 540, 1150, tt * 0.22, C.cyan, C.cyanDeep);
  topShade(ctx);
  ctx.save(); ctx.translate(540 + sx, 1150 + sy); ctx.scale(z, z); ctx.translate(-540, -1150);
  bottleInHand(ctx, 360, 1290);
  const ps = t >= 2.0 && t < 2.5 ? slam(t - 2.0, 1.22, 0.2) : 1;
  tag(ctx, BOTTLE_TAG.hx, BOTTLE_TAG.hy, BOTTLE_TAG.rest + bottleSwing(t), BOTTLE_TAG.w, BOTTLE_TAG.h, '$8.99', ps, [395, 985]);
  // comment-your-guess question marks
  if (t >= 1.5 && t < 2.5) {
    [[255, 905, -0.3, 0], [840, 925, 0.25, 1], [600, 1240, 0.1, 2]].forEach(([x, y, r0, i]) => {
      const s = slam(t - 1.5 - i * 0.033, 0.2, 0.18, 2.4);
      if (s == null || s <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.rotate(r0 + 0.15 * Math.sin(t * 12 + i)); ctx.scale(s, s);
      textLine(ctx, '?', 0, 55, 150, { fill: C.fairBright, stroke: C.ground, shadow: C.ground });
      ctx.restore();
    });
  }
  ctx.restore();
}
function popcornShot(ctx, tl) {
  const z = 1 + 0.05 * tl;
  sunburst(ctx, 540, 1150, 1 + tl * 0.5, C.fairBright, C.fair);
  ctx.save(); ctx.translate(540, 1150); ctx.scale(z, z); ctx.translate(-540, -1150);
  const [jx, jy] = tl < 0.15 ? jitter(tl, 14 * (1 - tl / 0.15), 3) : [0, 0];
  ctx.translate(jx, jy);
  bucketInHand(ctx, 420, 1330);
  let sw = Math.exp(-5 * tl) * 0.22 * Math.sin(2 * Math.PI * 2.2 * tl);
  tag(ctx, 372, 1150, 0.08 + sw, 450, 240, '$14.99', slam(tl, 1.3, 0.18) || 1, [330, 1085]);
  ctx.restore();
}
function jacketShot(ctx, tl) {
  const z = 1 + 0.05 * tl;
  sunburst(ctx, 540, 1100, 2 + tl * 0.5, C.brand, '#B3104B');
  ctx.save(); ctx.translate(540, 1100); ctx.scale(z, z); ctx.translate(-540, -1100);
  const [jx, jy] = tl < 0.15 ? jitter(tl, 14 * (1 - tl / 0.15), 5) : [0, 0];
  ctx.translate(jx, jy);
  jacketInHand(ctx, 560, 1000);
  let sw = Math.exp(-5 * tl) * 0.22 * Math.sin(2 * Math.PI * 2.2 * tl);
  tag(ctx, 412, 900, 0.1 + sw, 400, 240, '$19', slam(tl, 1.3, 0.18) || 1, [520, 780]);
  ctx.restore();
}
const TAG_CENTRE = { bottle: [700, 1060], popcorn: [640, 1180], jacket: [640, 930] };
function productShot(ctx, S, t) {
  if (S.product === 'bottle') bottleShot(ctx, t, t);
  else if (S.product === 'popcorn') popcornShot(ctx, t - S.start);
  else jacketShot(ctx, t - S.start);
}

// ---------- the phone ----------
const SCREEN_SCAN = { x: 250, y: 450, w: 580, h: 1220, bez: 20, r: 62 };
const SCREEN_FULL = { x: 40, y: 70, w: 1000, h: 1790, bez: 34, r: 84 };
function lerpRect(a, b, g) { const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], g); return o; }

function phone(ctx, sc, content, handed) {
  const b = sc.bez;
  if (handed) {
    // the hand holding it: arm from the bottom, fingertips on the left edge, thumb on the right
    sleeve(ctx, [[sc.x + 150, sc.y + sc.h - 220], [sc.x + sc.w - 90, sc.y + sc.h - 250], [sc.x + sc.w + 30, 2100], [sc.x + 60, 2100]], [0, sc.y + sc.h + 120, W, 600]);
  }
  ctx.fillStyle = 'rgba(11,12,14,.45)'; rr(ctx, sc.x - b + 16, sc.y - b + 26, sc.w + 2 * b, sc.h + 2 * b, sc.r + b); ctx.fill();
  rr(ctx, sc.x - b, sc.y - b, sc.w + 2 * b, sc.h + 2 * b, sc.r + b); ctx.fillStyle = C.raised; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#3A4048'; ctx.stroke();
  ctx.save(); rr(ctx, sc.x, sc.y, sc.w, sc.h, sc.r); ctx.clip(); content(sc); ctx.restore();
  if (handed) {
    for (let i = 0; i < 3; i++) { rr(ctx, sc.x - b - 34, sc.y + sc.h * 0.55 + i * 92, 70, 78, 36); ctx.fillStyle = SKIN; ctx.fill(); ink(ctx, 7); }
    thumb(ctx, sc.x + sc.w + b - 6, sc.y + sc.h * 0.68, 190, 70, 0.18);
  }
}

function scanView(ctx, S, t, sc) {
  const [tx, ty] = TAG_CENTRE[S.product];
  const k = 0.95 * sc.w / 580;
  ctx.save();
  ctx.translate(sc.x + sc.w / 2, sc.y + sc.h / 2); ctx.scale(k, k); ctx.translate(-tx, -ty);
  productShot(ctx, S, t);
  ctx.restore();
  ctx.fillStyle = 'rgba(11,12,14,.18)'; ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
  const cx = sc.x + sc.w / 2, cy = sc.y + sc.h / 2, hw = 245 * sc.w / 580, hh = 175 * sc.w / 580, L = 60 * sc.w / 580;
  ctx.lineWidth = 10; ctx.strokeStyle = C.ink; ctx.lineCap = 'round';
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath(); ctx.moveTo(cx + sx * hw, cy + sy * (hh - L)); ctx.lineTo(cx + sx * hw, cy + sy * hh); ctx.lineTo(cx + sx * (hw - L), cy + sy * hh); ctx.stroke();
  }
  const sweep = S.product === 'popcorn' ? 9 : 5;
  const ly = cy + hh * 0.9 * Math.sin((t - S.phoneUp) * sweep);
  ctx.save(); ctx.shadowColor = C.brand; ctx.shadowBlur = 30; ctx.fillStyle = C.brand; ctx.fillRect(cx - hw + 10, ly - 4, 2 * hw - 20, 8); ctx.restore();
  // the app's camera chrome: wordmark at the top, the pink shutter ring at the bottom
  const u = sc.w / 580;
  setFont(ctx, 40 * u, 800, FD); ctx.textAlign = 'center';
  ctx.save(); ctx.letterSpacing = `${-1.2 * u}px`; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 12;
  const wx = cx, wy = sc.y + 70 * u;
  ctx.fillText('pexi', wx - 8 * u, wy); const pw = ctx.measureText('pexi').width; ctx.fillStyle = C.brand; ctx.textAlign = 'left'; ctx.fillText('.', wx - 8 * u + pw / 2, wy);
  const m = ctx.measureText('pexi');
  reg(ctx, 'text', 'pexi (phone)', wx - pw / 2 - 8 * u, wy - m.actualBoundingBoxAscent, wx + pw / 2 + 8 * u, wy);
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, sc.y + sc.h - 110 * u, 44 * u, 0, 7); ctx.lineWidth = 9 * u; ctx.strokeStyle = C.brand; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, sc.y + sc.h - 110 * u, 32 * u, 0, 7); ctx.fillStyle = C.ink; ctx.fill();
}

// ---------- the verdict screen ----------
function card(ctx, x, y, w, h, price, label, col, sc, border) {
  if (sc == null) return;
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(sc, sc); ctx.translate(-(x + w / 2), -(y + h / 2));
  rr(ctx, x, y, w, h, 30); ctx.fillStyle = C.surface; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = border; ctx.stroke();
  setFont(ctx, 100); const pw = lineWidth(ctx, price);
  const size = Math.min(132, 100 * (w - 96) / pw);
  textLine(ctx, price, x + w / 2, y + 122, size, { fill: col });
  textLine(ctx, label, x + w / 2, y + h - 38, 46, { fill: C.inkMuted, weight: 600, family: FU });
  ctx.restore();
}
function stamp(ctx, text, cx, cy, ang, fill, txt, ts, size = 104) {
  if (ts < 0) return;
  const s = slam(ts, 1.1, 0.14, 2.2);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.scale(s, s);
  setFont(ctx, size); const w = lineWidth(ctx, text) + 80, h = size * 1.32;
  ctx.fillStyle = C.ground; rr(ctx, -w / 2 + 10, -h / 2 + 14, w, h, 22); ctx.fill();
  rr(ctx, -w / 2, -h / 2, w, h, 22); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 10; ctx.strokeStyle = C.ink; ctx.stroke();
  textLine(ctx, text, 0, size * 0.36, size, { fill: txt });
  ctx.restore();
}
function bubble(ctx, lines, ts) {
  if (ts < 0) return;
  const s = slam(ts, 0.6, 0.16, 1.2);
  const size = 66, lh = 76, top = 1292, h = lines.length * lh + 64;
  ctx.save(); ctx.translate(540, top); ctx.scale(s, s); ctx.translate(-540, -top);
  ctx.beginPath(); ctx.moveTo(470, top + 6); ctx.lineTo(430, top - 44); ctx.lineTo(540, top + 6); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ink(ctx, 8);
  rr(ctx, 172, top, 736, h, 40); ctx.fillStyle = '#fff'; ctx.fill(); ink(ctx, 8);
  ctx.fillStyle = '#fff'; ctx.fillRect(436, top - 4, 100, 14);
  lines.forEach((l, i) => textLine(ctx, l, 540, top + 32 + i * lh + size * 0.8, size, { fill: C.faceInk }));
  ctx.restore();
}
function crack(ctx, ox, oy) {
  const r = rng(21);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2 + r() * 0.4; let x = ox, y = oy; const pts = [[x, y]];
    const segs = 5 + Math.floor(r() * 3), len = 120 + r() * 120;
    for (let j = 0; j < segs; j++) { const aa = a + (r() - 0.5) * 0.7; x += Math.cos(aa) * len; y += Math.sin(aa) * len; pts.push([x, y]); }
    for (const [lw, col] of [[11, 'rgba(11,12,14,.7)'], [5, 'rgba(255,255,255,.95)']]) {
      ctx.beginPath(); pts.forEach(([px, py], j) => j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
    }
  }
  ctx.beginPath(); ctx.arc(ox, oy, 46, 0, 7); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
  ctx.restore();
}

const MASCOT = { x: 540, y: 560, size: 500 };
function verdictView(ctx, S, t) {
  const tv = t - S.verdict;
  const delighted = S.delight != null && t >= S.delight;
  // ground + verdict glow + rays
  ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H);
  const glow = delighted ? C.good : C.walk;
  let pulse = 0.75 + 0.25 * Math.sin(t * Math.PI * 4);
  if (S.strobe && t >= S.strobe && t < S.strobe + 0.5) pulse = 1.4;
  ctx.save(); ctx.globalAlpha = clamp(0.5 * pulse); ctx.fillStyle = glow;
  for (let i = 0; i < 14; i++) { const a = t * (delighted ? 0.9 : 0.4) + i * Math.PI / 7; ctx.beginPath(); ctx.moveTo(MASCOT.x, MASCOT.y); ctx.arc(MASCOT.x, MASCOT.y, 2400, a, a + Math.PI / 14); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const g = ctx.createRadialGradient(MASCOT.x, MASCOT.y, 100, MASCOT.x, MASCOT.y, 1300);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(11,12,14,0)');
  ctx.save(); ctx.globalAlpha = clamp(0.75 * pulse); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  if (S.strobe && t >= S.strobe && t < S.strobe + 0.2) { ctx.fillStyle = `rgba(255,106,69,${0.55 * (1 - (t - S.strobe) / 0.2)})`; ctx.fillRect(0, 0, W, H); }

  // shake for everything below
  let amp = delighted ? 0 : S.shake;
  for (const e of S.surges || []) if (t >= e && t < e + 0.35) amp += 10 * (1 - (t - e) / 0.35);
  const [jx, jy] = jitter(t, amp, S.seed);
  ctx.save(); ctx.translate(jx, jy);

  // mascot
  let img = IMG.angry, sc = slam(tv - (S.mascotIn - S.verdict), 1.17, 0.16, 2.0) || 1, rot = 0, dy = 0;
  if (!delighted) rot = jitter(t + 3, 0.05 + S.shake * 0.004, 9)[0] / 10 * 2;
  if (S.lunge && t >= S.lunge) sc *= lerp(1, 1.08, eOut((t - S.lunge) / 0.12));
  if (delighted) {
    img = IMG.delighted;
    const td = t - S.delight;
    sc = lerp(0.35, 1, eBack(td / 0.22, 2.0));
    dy = -Math.abs(Math.sin(td * Math.PI * 2)) * 22; // hops on the 120 BPM beat
    // shockwave
    if (td < 0.5) { ctx.beginPath(); ctx.arc(MASCOT.x, MASCOT.y, 120 + td * 1600, 0, 7); ctx.lineWidth = 40 * (1 - td / 0.5); ctx.strokeStyle = C.goodBright; ctx.stroke(); }
    const r = rng(33);
    for (let i = 0; i < 8; i++) {
      const a = r() * 6.28, d = 280 + r() * 90, ph = (td * 2 + r()) % 1;
      sparkle(ctx, MASCOT.x + Math.cos(a) * d, MASCOT.y + Math.sin(a) * d * 0.8 + dy, 20 + 26 * Math.sin(ph * Math.PI), td * 2 + i, i % 2 ? C.fairBright : C.ink);
    }
  }
  const size = MASCOT.size * sc;
  if (S.mood === 'boil') {
    const amount = t >= 7.0 ? lerp(1, 1.9, eOut((t - 7.0) / 0.2)) : 1;
    steam(ctx, MASCOT.x, MASCOT.y + dy, size, t, amount);
  }
  face(ctx, img, MASCOT.x, MASCOT.y + dy, size, rot);
  if (S.mood === 'boil') {
    // flushes red on the 7.0 beat, in four frames, never a grey half-blend for long
    if (t >= 7.0) face(ctx, IMG.boil, MASCOT.x, MASCOT.y + dy, size, rot, clamp((t - 7.0) / 0.13));
  }
  if (!delighted && tv > 0.05) {
    const vs = S.mood === 'boil' ? 1.3 : 1;
    const pop = 1 + 0.25 * Math.abs(Math.sin(t * Math.PI * 4));
    vein(ctx, MASCOT.x + size * 0.36, MASCOT.y - size * 0.34, 46 * vs * pop, 0.2);
    if (S.mood === 'boil' && t >= 7.0) vein(ctx, MASCOT.x - size * 0.38, MASCOT.y - size * 0.3, 38 * pop, -0.4);
  }

  // the two numbers
  const tn = t - S.numbers;
  const hereCol = delighted ? C.goodBright : (S.mood === 'twist' ? C.ink : C.walkBright);
  const border = delighted ? C.goodBright : (S.mood === 'twist' ? C.hair : C.walkBright);
  card(ctx, 175, 840, 350, 250, S.here, 'here', hereCol, slam(tn, 1.22, 0.16), border);
  card(ctx, 555, 840, 350, 250, S.normal, 'normally', C.ink, slam(tn - 0.067, 1.22, 0.16), C.hair);
  if (tn >= 0.067) {
    ctx.save(); ctx.translate(540, 965); const vs = slam(tn - 0.067, 0.3, 0.16, 2.5); ctx.scale(vs, vs);
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fillStyle = C.fairBright; ctx.fill(); ink(ctx, 7);
    textLine(ctx, 'vs', 0, 13, 40, { fill: C.faceInk });
    ctx.restore();
  }
  // the verdict stamp
  if (S.stampText === 'Walk away.') stamp(ctx, S.stampText, 540, 1290, -0.09, C.walk, '#FFFFFF', t - S.stamp, 124);
  else if (delighted) stamp(ctx, S.stampText, 540, 1188, -0.07, C.good, C.goodOn, t - S.stamp);
  else stamp(ctx, S.stampText, 540, 1188, -0.07, C.walk, '#FFFFFF', t - S.stamp);
  if (S.line) bubble(ctx, S.line, t - S.lineAt);
  if (S.burst2) confetti(ctx, t - S.burst2, 77, 540, 1500, 700, 1700);
  if (delighted) confetti(ctx, t - S.delight, 55, MASCOT.x, MASCOT.y, 1000, 1500);
  ctx.restore();
  if (S.crack && t >= S.crack) crack(ctx, 790, 430);
}

// ---------- the three scans ----------
const SCANS = [
  { start: 2.5, end: 5.0, product: 'bottle', phoneUp: 2.5, rise: 0.2, verdict: 3.0, mascotIn: 3.0, numbers: 3.5, stamp: 4.0,
    here: '$8.99', normal: '$1.49', stampText: 'Bad price', mood: 'angry', shake: 7, seed: 1,
    line: ['"That is a robbery', 'with a barcode on it."'], lineAt: 4.0, surges: [4.5] },
  { start: 5.0, end: 9.0, product: 'popcorn', phoneUp: 5.5, rise: 0.1, verdict: 6.0, mascotIn: 6.0, numbers: 6.0, stamp: 6.5,
    here: '$14.99', normal: '$3.20', stampText: 'Walk away.', mood: 'boil', shake: 9, seed: 2,
    surges: [6.0, 7.0, 7.5, 8.0, 8.5], strobe: 7.5, crack: 8.0, lunge: 8.5 },
  { start: 9.0, end: 12.5, product: 'jacket', phoneUp: 9.5, rise: 0.2, verdict: 10.0, mascotIn: 10.0, numbers: 10.0, stamp: 10.5,
    delight: 10.5, here: '$19', normal: '$79', stampText: 'Great price', mood: 'twist', shake: 4, seed: 3,
    line: ['"Somebody in that store', 'made a mistake.', 'Enjoy it."'], lineAt: 11.0, burst2: 11.5 },
];

function scan(ctx, S, t) {
  if (t < S.phoneUp) { productShot(ctx, S, t); return; }
  if (t < S.verdict + 0.2) productShot(ctx, S, t);
  else { ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H); }
  const p = eOut((t - S.phoneUp) / S.rise);
  const rise = { ...SCREEN_SCAN, y: SCREEN_SCAN.y + (1 - p) * 500 };
  const gs = t >= S.verdict ? eOut((t - S.verdict) / 0.14) : 0;
  const sc = lerpRect(rise, SCREEN_FULL, gs);
  const k = sc.w / SCREEN_FULL.w;
  phone(ctx, sc, (s) => {
    if (t < S.verdict) scanView(ctx, S, t, s);
    else {
      ctx.save(); ctx.translate(s.x - SCREEN_FULL.x * k, s.y - SCREEN_FULL.y * k); ctx.scale(k, k);
      verdictView(ctx, S, t);
      ctx.restore();
    }
  }, gs < 0.5);
  if (gs >= 0.5) {
    // close-up: just the two thumbs on the bottom corners
    thumb(ctx, 70, 1830, 230, 86, 0.75);
    thumb(ctx, 1010, 1830, 230, 86, -0.75);
  }
  if (t >= S.verdict && t < S.verdict + 0.17) { ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - (t - S.verdict) / 0.17)})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- the timeline ----------
function captionsFor(t, variant) {
  if (t < 1.0) return [{ text: HOOKS[variant], scale: 1 }];
  if (t < 2.5) return [{ text: "Guess what it's actually worth.", scale: slam(t - 1.0, 0.55, 0.16, 1.2) }];
  if (t >= 12.5) {
    const pulse = t >= 14.5 && t < 14.8 ? 1 + 0.02 * Math.sin((t - 14.5) / 0.3 * Math.PI) : 1;
    return [{ text: 'Send this to the friend', scale: slam(t - 12.5, 0.55, 0.16, 1.2) * pulse },
            { text: 'who always pays $9 for water.', scale: t >= 13.0 ? slam(t - 13.0, 0.55, 0.16, 1.2) * pulse : null }];
  }
  return null;
}

function renderFrame(ctx, f, variant, log) {
  LOG = log || null;
  const t = f / FPS;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (t < 2.5 || t >= 12.5) {
    bottleShot(ctx, t, t < 2.5 ? t : t - 15);
    const cards = captionsFor(t, variant);
    // the end card's layout is used for the hooks too, so the text block sits in one place
    if (cards) captions(ctx, cards, 540 + SHIFT, 560, 740, 520, 160);
    const showMark = t < 2.5 || t >= 13.5;
    if (showMark) {
      const s = t >= 13.5 && t < 13.7 ? slam(t - 13.5, 0.3, 0.18, 2.6) : 1;
      ctx.save(); ctx.translate(540, 1585); ctx.scale(s, s); ctx.translate(-540, -1585);
      wordmark(ctx, 540, 1585, 62);
      ctx.restore();
    }
  } else {
    const S = SCANS.find(s => t >= s.start && t < s.end);
    scan(ctx, S, t);
  }
  LOG = null;
}

window.REEL = { renderFrame, SAFE, W, H, FPS, IMG, setImages: (o) => { IMG = o; }, setShift: (d) => { SHIFT = d; } };
})();
