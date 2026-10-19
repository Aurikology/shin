// Every frame of "Meet Pexi", the 24 s launch video that says what the app is,
// drawn with canvas 2D. renderFrame(ctx, frame) is pure: the same frame number
// always draws the same picture.
//
// The arc, from the research behind it (result-first hook in the first 1.5 s,
// brand by 3 s, the real product as proof, captions that work with the sound
// off, one ask at the end):
//    0.0  hook      airport water at $8.99, "Bad price" slams on at 1.5 s
//    2.5  meet      "Meet Pexi." the mascot and the wordmark
//    4.5  scan      the phone comes up and scans the bottle
//    6.0  sheet     the app's REAL verdict sheet slides up (sheet.mjs captures it)
//   11.0  range     three scans: bad, reasonable, great
//   17.0  voices    the three personalities
//   20.5  share     "Send this to the friend who always overpays."
//   22.5  end       icon, wordmark, "Scan anything."
//
// Drawing helpers are copied from ads/reel-rip-off-hunt/scene.js, so the two ads
// share one look. Colours are app/public/css/tokens.css plus the mascot colours
// from js/face-art.js; the faces are app/public/faces/*; the fonts are the app's.
(function () {
const W = 1080, H = 1920, FPS = 30, DUR = 24;
const SAFE = { x0: 154, y0: 285, x1: 925, y1: 1635 };

const C = {
  ground: '#0B0C0E', surface: '#16181C', raised: '#22262C', hair: '#2E333A',
  ink: '#F7F5F2', inkMuted: '#A5ADB8', brand: '#E5165E', faceInk: '#12233A',
  good: '#12B76A', goodBright: '#38E08B', goodOn: '#04140C',
  walk: '#C23619', walkBright: '#FF6A45', fair: '#E8A020', fairBright: '#FFC24D', fairOn: '#1F1400',
  cyan: '#2BB5F0', cyanDeep: '#1E93C9', orange: '#F26B1D',
};
const SKIN = '#E9A97F', SKIN_SH = '#C98458', NAIL = '#F7D2B8';
const FD = "'Bricolage Grotesque'", FU = "'Instrument Sans'", FM = "'IBM Plex Mono'";

const T = { meet: 2.5, scan: 4.5, sheet: 6.0, zoom: 8.5, range: 11.0, voices: 17.0, share: 20.5, end: 22.5 };

let IMG = {};
let LOG = null;

// ---------- small maths ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const eOut = x => 1 - Math.pow(1 - clamp(x), 3);
const eInOut = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eBack = (x, s = 1.9) => { x = clamp(x); const c = s + 1; return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
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
function fitCards(ctx, cards, maxW, maxH, maxSize, lh = 1.0, maxLines = 4) {
  const opts = cards.map(c => partitions(c.split(' '), 4));
  let best = null;
  const rec = (i, chosen) => {
    if (i === cards.length) {
      const lines = chosen.flat();
      if (lines.length > maxLines) return;
      setFont(ctx, 100);
      const widest = Math.max(...lines.map(l => lineWidth(ctx, l)));
      const s = Math.min(maxSize, Math.floor(100 * maxW / widest), Math.floor(maxH / (lines.length * lh)));
      const balance = Math.min(...lines.map(l => lineWidth(ctx, l))) / widest;
      const score = (s - 12 * lines.length) * 1000 + balance;
      if (!best || score > best.score) best = { score, size: s, cards: chosen.map(x => x.slice()) };
      return;
    }
    for (const o of opts[i]) rec(i + 1, [...chosen, o]);
  };
  rec(0, []);
  return best;
}
const FIT_CACHE = new Map();
function fitCached(ctx, texts, maxW, maxH, maxSize) {
  const k = JSON.stringify([texts, maxW, maxH, maxSize]);
  if (!FIT_CACHE.has(k)) FIT_CACHE.set(k, fitCards(ctx, texts, maxW, maxH, maxSize));
  return FIT_CACHE.get(k);
}

// One line, centred on cx, baseline y. Words with a $ take the highlight colour.
function textLine(ctx, line, cx, y, size, o = {}) {
  setFont(ctx, size, o.weight || 800, o.family || FD);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (o.tracking) ctx.letterSpacing = `${o.tracking * size}px`;
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
  ctx.letterSpacing = '0px';
}

// Big caption cards. `cards` is a list of {text, scale}; scale null = not on screen yet.
function captions(ctx, cards, cx, cy, maxW, maxH, maxSize) {
  const fit = fitCached(ctx, cards.map(c => c.text), maxW, maxH, maxSize);
  const lh = fit.size;
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
// A caption card that slams in at `at`.
const cap = (text, t, at) => ({ text, scale: t >= at ? slam(t - at, 0.55, 0.16, 1.2) : null });

function wordmark(ctx, cx, cy, size, pill = true) {
  // the app's wordmark (camera.css .wordmark): "pexi" in ink, the full stop in brand pink
  setFont(ctx, size, 800, FD);
  ctx.save(); ctx.letterSpacing = `${-0.03 * size}px`;
  const w = lineWidth(ctx, 'pexi.'), wp = lineWidth(ctx, 'pexi');
  if (pill) { ctx.fillStyle = 'rgba(11,12,14,.86)'; rr(ctx, cx - w / 2 - size * 0.55, cy - size * 0.72, w + size * 1.1, size * 1.3, size * 0.65); ctx.fill(); }
  ctx.textAlign = 'left'; const by = cy + size * 0.3;
  ctx.fillStyle = C.ink; ctx.fillText('pexi', cx - w / 2, by);
  ctx.fillStyle = C.brand; ctx.fillText('.', cx - w / 2 + wp, by);
  const m = ctx.measureText('pexi.');
  reg(ctx, 'text', 'pexi.', cx - w / 2, by - m.actualBoundingBoxAscent, cx + w / 2, by + m.actualBoundingBoxDescent);
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
  g.addColorStop(0, 'rgba(11,12,14,.6)'); g.addColorStop(1, 'rgba(11,12,14,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 900);
}
// The verdict atmosphere (brand book "Colour"): rays and a glow in the verdict hue, pulsing on the beat.
function verdictGround(ctx, t, glow, cx, cy, spin = 0.4, strength = 1) {
  ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H);
  const pulse = 0.75 + 0.25 * Math.sin(t * Math.PI * 4);
  ctx.save(); ctx.globalAlpha = clamp(0.5 * pulse * strength); ctx.fillStyle = glow;
  for (let i = 0; i < 14; i++) { const a = t * spin + i * Math.PI / 7; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 2400, a, a + Math.PI / 14); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const g = ctx.createRadialGradient(cx, cy, 100, cx, cy, 1300);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(11,12,14,0)');
  ctx.save(); ctx.globalAlpha = clamp(0.75 * pulse * strength); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}
// Neutral rays for the scenes that are not a verdict: no hue may mean anything here.
function neutralGround(ctx, t, cx, cy) {
  ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.fillStyle = C.surface;
  for (let i = 0; i < 16; i++) { const a = t * 0.25 + i * Math.PI / 8; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 2400, a, a + Math.PI / 16); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const g = ctx.createRadialGradient(cx, cy, 80, cx, cy, 1100);
  g.addColorStop(0, 'rgba(11,12,14,0)'); g.addColorStop(1, 'rgba(11,12,14,.9)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function flash(ctx, t, at, dur = 0.17, a = 0.85) {
  if (t >= at && t < at + dur) { ctx.fillStyle = `rgba(255,255,255,${a * (1 - (t - at) / dur)})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- hands and the bottle (from the reel) ----------
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

// The bottle shot: hook and the camera view behind the scan. `t` is video time.
function bottleSwing(t) {
  let a = 0;
  for (const [k, A] of [[0.0, 0.2], [1.5, 0.14]]) if (t >= k) a += A * Math.exp(-5 * (t - k)) * Math.sin(2 * Math.PI * 2.2 * (t - k));
  return a;
}
function bottleShot(ctx, t) {
  const z = 1 + 0.03 * t;
  const sx = 7 * Math.sin(2 * Math.PI * t / 1.5), sy = 5 * Math.sin(2 * Math.PI * t / 3 + 1);
  sunburst(ctx, 540, 1150, t * 0.22, C.cyan, C.cyanDeep);
  topShade(ctx);
  ctx.save(); ctx.translate(540 + sx, 1150 + sy); ctx.scale(z, z); ctx.translate(-540, -1150);
  bottleInHand(ctx, 360, 1290);
  tag(ctx, 452, 1004, 0.14 + bottleSwing(t), 440, 250, '$8.99', 1, [395, 985]);
  ctx.restore();
}

// ---------- the mascot ----------
const FACE_FRAC = 81 / 88; // the disc is r 40.5 + ring in an 88 box
function face(ctx, img, cx, cy, size, rot = 0, alpha = 1) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(11,12,14,.4)'; ctx.beginPath(); ctx.arc(size * 0.02, size * 0.036, size * FACE_FRAC / 2, 0, 7); ctx.fill();
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  const r = size * FACE_FRAC / 2;
  if (alpha > 0.5) reg(ctx, 'face', 'mascot', -r, -r, r, r);
  ctx.restore();
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

// ---------- verdict parts (from the reel) ----------
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
function bubble(ctx, lines, ts, top = 1292) {
  if (ts < 0) return;
  const s = slam(ts, 0.6, 0.16, 1.2);
  const size = 66, lh = 76, h = lines.length * lh + 64;
  ctx.save(); ctx.translate(540, top); ctx.scale(s, s); ctx.translate(-540, -top);
  ctx.beginPath(); ctx.moveTo(470, top + 6); ctx.lineTo(430, top - 44); ctx.lineTo(540, top + 6); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ink(ctx, 8);
  rr(ctx, 172, top, 736, h, 40); ctx.fillStyle = '#fff'; ctx.fill(); ink(ctx, 8);
  ctx.fillStyle = '#fff'; ctx.fillRect(436, top - 4, 100, 14);
  setFont(ctx, 66);
  const fit = Math.min(size, size * 640 / Math.max(...lines.map(l => lineWidth(ctx, l))));
  lines.forEach((l, i) => textLine(ctx, l, 540, top + 32 + i * lh + size * 0.8, fit, { fill: C.faceInk }));
  ctx.restore();
}

// ---------- 0.0 the hook ----------
function hook(ctx, t) {
  bottleShot(ctx, t);
  if (t >= 1.5) { ctx.save(); ctx.globalAlpha = clamp((t - 1.5) / 0.1) * 0.35; ctx.fillStyle = C.walk; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  captions(ctx, [cap('Is $8.99 for water', t, 0), cap('a rip-off?', t, 0.5)], 540, 560, 740, 420, 150);
  if (t >= 1.5) {
    // the result first: the verdict lands on the tag before anything is explained
    const [jx, jy] = t < 1.8 ? jitter(t, 10 * (1 - (t - 1.5) / 0.3), 4) : [0, 0];
    ctx.save(); ctx.translate(jx, jy);
    stamp(ctx, 'Bad price', 560, 1330, -0.08, C.walk, '#FFFFFF', t - 1.5, 112);
    ctx.restore();
  }
  wordmark(ctx, 540, 1560, 62);
  flash(ctx, t, 1.5, 0.12, 0.6);
}

// ---------- 2.5 meet Pexi ----------
function meet(ctx, t) {
  const tl = t - T.meet;
  neutralGround(ctx, t, 540, 960);
  captions(ctx, [cap('Meet Pexi.', t, T.meet)], 540, 420, 740, 200, 170);
  const s = slam(tl - 0.1, 0.3, 0.2, 2.2);
  if (s != null) {
    const hop = tl > 0.5 ? -Math.abs(Math.sin((tl - 0.5) * Math.PI * 2)) * 18 : 0;
    face(ctx, IMG.deadpanPleased, 540, 930 + hop, 560 * s, 0.04 * Math.sin(tl * 6));
  }
  captions(ctx, [cap('It checks prices for you.', t, T.meet + 0.9)], 540, 1400, 760, 200, 96);
  flash(ctx, t, T.meet, 0.15, 0.7);
}

// ---------- 4.5 the scan, 6.0 the real sheet ----------
const PH = { x: 250, y: 600, w: 580, h: 580 * 844 / 390, bez: 20, r: 62 };
function phoneFrame(ctx, sc, content) {
  const b = sc.bez;
  ctx.fillStyle = 'rgba(11,12,14,.5)'; rr(ctx, sc.x - b + 16, sc.y - b + 26, sc.w + 2 * b, sc.h + 2 * b, sc.r + b); ctx.fill();
  rr(ctx, sc.x - b, sc.y - b, sc.w + 2 * b, sc.h + 2 * b, sc.r + b); ctx.fillStyle = C.raised; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#3A4048'; ctx.stroke();
  ctx.save(); rr(ctx, sc.x, sc.y, sc.w, sc.h, sc.r); ctx.clip(); content(sc); ctx.restore();
  // the notch pill
  rr(ctx, sc.x + sc.w / 2 - 70, sc.y + 18, 140, 34, 17); ctx.fillStyle = '#000'; ctx.fill();
}
function cameraView(ctx, t, sc, scanning) {
  const k = 0.66 * sc.w / 580;
  ctx.save();
  ctx.translate(sc.x + sc.w / 2, sc.y + sc.h * 0.42); ctx.scale(k, k); ctx.translate(-575, -1130);
  bottleShot(ctx, t);
  ctx.restore();
  ctx.fillStyle = 'rgba(11,12,14,.18)'; ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
  const u = sc.w / 580;
  const cx = sc.x + sc.w / 2, cy = sc.y + sc.h * 0.42, hw = 245 * u, hh = 175 * u, L = 60 * u;
  if (scanning) {
    ctx.lineWidth = 10 * u; ctx.strokeStyle = C.ink; ctx.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath(); ctx.moveTo(cx + sx * hw, cy + sy * (hh - L)); ctx.lineTo(cx + sx * hw, cy + sy * hh); ctx.lineTo(cx + sx * (hw - L), cy + sy * hh); ctx.stroke();
    }
    const ly = cy + hh * 0.9 * Math.sin((t - T.scan) * 5);
    ctx.save(); ctx.shadowColor = C.brand; ctx.shadowBlur = 30; ctx.fillStyle = C.brand; ctx.fillRect(cx - hw + 10, ly - 4, 2 * hw - 20, 8); ctx.restore();
  }
  // the camera chrome: wordmark at the top, the pink shutter ring at the bottom
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 12;
  wordmark(ctx, cx, sc.y + 100 * u, 40 * u, false);
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, sc.y + sc.h - 110 * u, 44 * u, 0, 7); ctx.lineWidth = 9 * u; ctx.strokeStyle = C.brand; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, sc.y + sc.h - 110 * u, 32 * u, 0, 7); ctx.fillStyle = C.ink; ctx.fill();
}
function scanAndSheet(ctx, t) {
  neutralGround(ctx, t, 540, 1100);
  // phone rises, then (8.5) the camera pushes in on the verdict
  const rise = eOut((t - T.scan) / 0.32);
  // the push-in holds the phone's top edge still, so it never climbs into the caption
  const zoom = lerp(1, 1.3, eInOut((t - T.zoom) / 0.6));
  const zc = { x: 540, y: 640 };
  ctx.save();
  ctx.translate(zc.x, zc.y); ctx.scale(zoom, zoom); ctx.translate(-zc.x, -zc.y);
  const sc = { ...PH, y: PH.y + (1 - rise) * 1400 };
  const log = LOG; LOG = null;
  phoneFrame(ctx, sc, (s) => {
    const sheetUp = t >= T.sheet;
    cameraView(ctx, t, s, !sheetUp);
    if (sheetUp) {
      const p = eOut((t - T.sheet) / 0.35);
      ctx.fillStyle = `rgba(11,12,14,${0.35 * p})`; ctx.fillRect(s.x, s.y, s.w, s.h);
      const img = IMG.sheet, k = s.w / img.width;
      ctx.drawImage(img, s.x, s.y + (1 - p) * s.h * 0.75, s.w, img.height * k);
    }
    if (t >= T.sheet - 0.05 && t < T.sheet + 0.15) { ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - (t - T.sheet + 0.05) / 0.2)})`; ctx.fillRect(s.x, s.y, s.w, s.h); }
  });
  // the hand holding it
  if (zoom < 1.2) {
    for (let i = 0; i < 3; i++) { rr(ctx, sc.x - sc.bez - 34, sc.y + sc.h * 0.55 + i * 92, 70, 78, 36); ctx.fillStyle = SKIN; ctx.fill(); ink(ctx, 7); }
    thumb(ctx, sc.x + sc.w + sc.bez - 6, sc.y + sc.h * 0.68, 190, 70, 0.18);
  }
  ctx.restore();
  LOG = log;
  // captions over the top of the phone
  let cards;
  if (t < T.sheet) cards = [cap('Scan anything.', t, T.scan + 0.15)];
  else if (t < T.zoom) cards = [cap('Pexi checks what', t, T.sheet + 0.2), cap('it normally costs', t, T.sheet + 0.45)];
  else cards = [cap("and if it's", t, T.zoom), cap('a rip-off.', t, T.zoom + 0.5)];
  captions(ctx, cards, 540, 440, 760, 280, 112);
}

// ---------- 11.0 the range: bad, reasonable, great ----------
const RANGE = [
  { at: 11.0, item: 'Wireless earbuds', here: '$89', normal: '$59', stamp: 'Bad price', fill: C.walk, on: '#FFFFFF',
    hereCol: C.walkBright, glow: C.walk, face: 'bluntAngry', line: ['"They\'re robbing you."'], shake: 7 },
  { at: 13.0, item: 'Peanut butter, 1 kg', here: '$6.29', normal: '$5.99', stamp: 'Reasonable', fill: C.fair, on: C.fairOn,
    hereCol: C.fairBright, glow: C.fair, face: 'bluntFair', line: ['"Fine. Buy it."'], shake: 0 },
  { at: 15.0, item: 'Honey oat cereal', here: '$3.49', normal: '$6.00', stamp: 'Great price', fill: C.good, on: C.goodOn,
    hereCol: C.goodBright, glow: C.good, face: 'bluntDelighted', line: ['"Somebody made a mistake.', 'Enjoy it."'], shake: 0, delight: true },
];
const MASCOT = { x: 540, y: 590, size: 460 };
function range(ctx, t) {
  const S = [...RANGE].reverse().find(s => t >= s.at);
  const tl = t - S.at;
  verdictGround(ctx, t, S.glow, MASCOT.x, MASCOT.y, S.delight ? 0.9 : 0.4);
  const [jx, jy] = S.shake ? jitter(t, tl < 0.3 ? S.shake * 2 : S.shake * 0.5, 2) : [0, 0];
  ctx.save(); ctx.translate(jx, jy);
  // mascot
  let sc = slam(tl, 1.17, 0.16, 2.0) || 1, dy = 0;
  if (S.delight) {
    sc = lerp(0.35, 1, eBack(tl / 0.22, 2.0));
    dy = -Math.abs(Math.sin(tl * Math.PI * 2)) * 22;
    if (tl < 0.5) { ctx.beginPath(); ctx.arc(MASCOT.x, MASCOT.y, 120 + tl * 1600, 0, 7); ctx.lineWidth = 40 * (1 - tl / 0.5); ctx.strokeStyle = C.goodBright; ctx.stroke(); }
    const r = rng(33);
    for (let i = 0; i < 8; i++) {
      const a = r() * 6.28, d = 250 + r() * 80, ph = (tl * 2 + r()) % 1;
      sparkle(ctx, MASCOT.x + Math.cos(a) * d, MASCOT.y + Math.sin(a) * d * 0.8 + dy, 20 + 24 * Math.sin(ph * Math.PI), tl * 2 + i, i % 2 ? C.fairBright : C.ink);
    }
  }
  const rot = S.shake ? jitter(t + 3, 0.08, 9)[0] / 10 : 0.03 * Math.sin(tl * 5);
  const size = MASCOT.size * sc;
  face(ctx, IMG[S.face], MASCOT.x, MASCOT.y + dy, size, rot);
  if (S.shake && tl > 0.05) {
    const pop = 1 + 0.25 * Math.abs(Math.sin(t * Math.PI * 4));
    vein(ctx, MASCOT.x + size * 0.36, MASCOT.y - size * 0.34, 42 * pop, 0.2);
  }
  // what is being priced, so the face has a target (brand book "The target rule")
  textLine(ctx, S.item, 540, 876, 46, { fill: C.ink, weight: 600, family: FU });
  // the two numbers
  card(ctx, 175, 905, 350, 250, S.here, 'here', S.hereCol, slam(tl - 0.2, 1.22, 0.16), S.hereCol);
  card(ctx, 555, 905, 350, 250, S.normal, 'normally', C.ink, slam(tl - 0.267, 1.22, 0.16), C.hair);
  if (tl >= 0.267) {
    ctx.save(); ctx.translate(540, 1030); const vs = slam(tl - 0.267, 0.3, 0.16, 2.5); ctx.scale(vs, vs);
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fillStyle = C.fairBright; ctx.fill(); ink(ctx, 7);
    textLine(ctx, 'vs', 0, 13, 40, { fill: C.faceInk });
    ctx.restore();
  }
  stamp(ctx, S.stamp, 540, 1255, -0.07, S.fill, S.on, tl - 0.5);
  bubble(ctx, S.line, tl - 0.9, 1360);
  if (S.delight) confetti(ctx, tl - 0.5, 55, MASCOT.x, MASCOT.y, 1000, 1500);
  ctx.restore();
  flash(ctx, t, S.at, 0.12, 0.7);
}

// ---------- 17.0 the three personalities ----------
const VOICES = [
  { who: 'Deadpan', face: 'deadpanWalk', lines: ['"Two dollars.', 'It\'s $1.47."'] },
  { who: 'Warm', face: 'warmWalk', lines: ['"Ooh, that\'s steep.', 'I\'d wait."'] },
  { who: 'Blunt', face: 'bluntWalk', lines: ['"They\'re robbing you."'] },
];
function voices(ctx, t) {
  const tl = t - T.voices;
  neutralGround(ctx, t, 540, 960);
  captions(ctx, [cap('Pick how blunt', t, T.voices), cap('Pexi is.', t, T.voices + 0.3)], 540, 450, 720, 300, 140);
  VOICES.forEach((v, i) => {
    const at = 0.5 + i * 0.5, s = slam(tl - at, 0.4, 0.18, 2.0);
    if (s == null) return;
    const y = 800 + i * 290;
    ctx.save(); ctx.translate(540, y); ctx.scale(s, s); ctx.translate(-540, -y);
    face(ctx, IMG[v.face], 290, y, 230, 0.03 * Math.sin(tl * 5 + i));
    // the bubble, its tail pointing at the face
    const bx = 418, bw = 507, bh = 92 + v.lines.length * 60, by = y - bh / 2;
    ctx.beginPath(); ctx.moveTo(bx + 6, y - 22); ctx.lineTo(bx - 34, y + 6); ctx.lineTo(bx + 6, y + 26); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ink(ctx, 7);
    rr(ctx, bx, by, bw, bh, 34); ctx.fillStyle = '#fff'; ctx.fill(); ink(ctx, 7);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx - 4, y - 18, 14, 40);
    ctx.save(); ctx.textAlign = 'left';
    setFont(ctx, 30, 600, FM); ctx.letterSpacing = '3px'; ctx.fillStyle = C.inkMuted;
    const label = v.who.toUpperCase();
    textLine(ctx, label, bx + 34 + lineWidth(ctx, label) / 2, by + 50, 30, { fill: '#5B6675', weight: 600, family: FM, tracking: 0.1 });
    setFont(ctx, 54);
    const size = Math.min(54, 54 * (bw - 68) / Math.max(...v.lines.map(l => lineWidth(ctx, l))));
    v.lines.forEach((l, j) => { setFont(ctx, size); textLine(ctx, l, bx + 34 + lineWidth(ctx, l) / 2, by + 112 + j * 60, size, { fill: C.faceInk }); });
    ctx.restore();
    ctx.restore();
  });
  flash(ctx, t, T.voices, 0.12, 0.6);
}

// ---------- 20.5 the ask, 22.5 the end card ----------
function share(ctx, t) {
  const tl = t - T.share;
  neutralGround(ctx, t, 540, 1250);
  captions(ctx, [cap('Send this to the friend', t, T.share), cap('who always overpays.', t, T.share + 0.5)], 540, 640, 760, 560, 150);
  const s = slam(tl - 1.0, 0.3, 0.2, 2.2);
  if (s != null) face(ctx, IMG.bluntPleased, 540, 1260 - Math.abs(Math.sin((tl - 1) * Math.PI * 2)) * 16, 380 * s, 0.04 * Math.sin(tl * 6));
  flash(ctx, t, T.share, 0.12, 0.6);
}
function endCard(ctx, t) {
  const tl = t - T.end;
  ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(540, 820, 50, 540, 820, 900);
  g.addColorStop(0, 'rgba(34,38,44,1)'); g.addColorStop(1, 'rgba(11,12,14,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const s = slam(tl, 0.3, 0.2, 2.2);
  // the app icon, as a home-screen tile
  ctx.save(); ctx.translate(540, 760); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(ctx, -150 + 10, -150 + 18, 300, 300, 68); ctx.fill();
  ctx.save(); rr(ctx, -150, -150, 300, 300, 68); ctx.clip(); ctx.drawImage(IMG.icon, -150, -150, 300, 300); ctx.restore();
  rr(ctx, -150, -150, 300, 300, 68); ctx.lineWidth = 3; ctx.strokeStyle = C.hair; ctx.stroke();
  reg(ctx, 'face', 'icon', -150, -150, 150, 150);
  ctx.restore();
  const ws = slam(tl - 0.25, 0.4, 0.18, 2.4);
  if (ws != null) { ctx.save(); ctx.translate(540, 1080); ctx.scale(ws, ws); ctx.translate(-540, -1080); wordmark(ctx, 540, 1080, 170, false); ctx.restore(); }
  const ts = slam(tl - 0.6, 0.55, 0.16, 1.2);
  if (ts != null) { ctx.save(); ctx.translate(540, 1270); ctx.scale(ts, ts); ctx.translate(-540, -1270); textLine(ctx, 'Scan anything.', 540, 1295, 84, { fill: C.ink }); ctx.restore(); }
  flash(ctx, t, T.end, 0.15, 0.7);
}

function renderFrame(ctx, f, log) {
  LOG = log || null;
  const t = f / FPS;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (t < T.meet) hook(ctx, t);
  else if (t < T.scan) meet(ctx, t);
  else if (t < T.range) scanAndSheet(ctx, t);
  else if (t < T.voices) range(ctx, t);
  else if (t < T.share) voices(ctx, t);
  else if (t < T.end) share(ctx, t);
  else endCard(ctx, t);
  LOG = null;
}

window.LAUNCH = { renderFrame, SAFE, W, H, FPS, DUR, T, setImages: (o) => { IMG = o; } };
})();
