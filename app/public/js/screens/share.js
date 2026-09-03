/**
 * Stage 08: the share, which is the growth engine.
 *
 * Version one is a STILL CARD, not a rendered clip. That is the floor's own
 * line and it is not relitigated here: the 9:16 auto clip is the highest
 * leverage row in the stage 08 table and also the expensive one, so it waits on
 * evidence that a card gets shared at all.
 *
 * Wordle's counterintuitive detail is copied exactly. Josh Wardle left the link
 * out because a link generated a preview that "felt spammy", and the grid spread
 * further with no attribution than it would have with one. So the frame carries
 * Shin, the two prices, the item, and the wordmark small in the corner. There is
 * NO DOWNLOAD LINK IN THE FRAME, and that absence is the feature.
 *
 * The card is drawn on a canvas rather than in DOM, so what the user sees on
 * this screen is the exported PNG pixel for pixel rather than an approximation
 * of it.
 *
 * HARD RULE 2: the card shows two prices and never the arithmetic between them.
 * A difference presented as an amount saved is a performance claim, and no
 * savings figure here has been measured.
 */

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

const W = 1080;
const H = 1920;

/** Design tokens, read live so the card matches the theme the user is in. */
function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    paper: pick('--paper', '#FBFAF7'),
    surface: pick('--surface', '#FFFFFF'),
    sunk: pick('--surface-sunk', '#F3F1EC'),
    ink: pick('--ink', '#16130F'),
    muted: pick('--ink-muted', '#6E6660'),
    faint: pick('--ink-faint', '#98908A'),
    rule: pick('--rule', '#E4DFD8'),
    accent: pick('--accent', '#E5165E'),
    tierInk: {
      good: pick('--good', '#1C7C4A'),
      fair: pick('--mid', '#8A6E1E'),
      walk: pick('--bad', '#BE3218'),
    },
    tierBg: {
      good: pick('--good-soft', '#E4F2E9'),
      fair: pick('--mid-soft', '#F6EEDA'),
      walk: pick('--bad-soft', '#FBE7E2'),
    },
  };
}

/**
 * Shin's face as a bitmap.
 *
 * Two things have to be fixed up before that markup is a standalone document,
 * and both were found by looking at the exported PNG rather than by reading the
 * code. faceSvg paints with CSS custom properties, which do not resolve inside
 * an <img>, so they are substituted with their computed values. And it carries
 * no xmlns, which inline HTML does not need and an image document does: without
 * it the load fails silently and the face comes out of the fallback path with no
 * eyebrows, which is a different mood from the one Shin was in.
 *
 * If the image still will not decode the caller falls back to canvas primitives,
 * because a card with no face is not a Shin card.
 */
function faceImage(shin, tierId, size) {
  const cs = getComputedStyle(document.documentElement);
  const svg = shin
    .faceSvg(tierId, size)
    .replace(/var\((--[a-z0-9-]+)\)/gi, (_, name) => (cs.getPropertyValue(name) || '').trim() || '#000')
    .replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * The same face in canvas primitives, on the same 88 unit grid shin.js draws on
 * and with its exact coordinates, so a fallback face is the same face and not a
 * near miss. The brows are the expression, so they are here too.
 */
function drawFallbackFace(g, tierId, cx, cy, r, t) {
  const key = tierId === 'walk_away' ? 'walk' : tierId === 'good' ? 'good' : 'fair';
  const k = r / 41;
  const X = (x) => cx + (x - 44) * k;
  const Y = (y) => cy + (y - 44) * k;
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = t.tierBg[key];
  g.fill();
  g.lineWidth = 2.5 * k;
  g.strokeStyle = t.tierInk[key];
  g.stroke();

  g.lineCap = 'round';
  g.lineWidth = 3.2 * k;
  g.beginPath();
  if (key === 'good') {
    g.moveTo(X(24), Y(30)); g.quadraticCurveTo(X(31), Y(26), X(38), Y(29));
    g.moveTo(X(50), Y(29)); g.quadraticCurveTo(X(57), Y(26), X(64), Y(30));
    g.moveTo(X(28), Y(58)); g.quadraticCurveTo(X(44), Y(72), X(60), Y(58));
  } else if (key === 'walk') {
    g.moveTo(X(24), Y(26)); g.lineTo(X(38), Y(33));
    g.moveTo(X(64), Y(26)); g.lineTo(X(50), Y(33));
    g.moveTo(X(28), Y(68)); g.quadraticCurveTo(X(44), Y(54), X(60), Y(68));
  } else {
    g.moveTo(X(24), Y(31)); g.lineTo(X(38), Y(31));
    g.moveTo(X(50), Y(31)); g.lineTo(X(64), Y(31));
    g.moveTo(X(29), Y(62)); g.lineTo(X(59), Y(62));
  }
  g.stroke();

  g.beginPath();
  g.arc(X(31), Y(43), 4.2 * k, 0, Math.PI * 2);
  g.arc(X(57), Y(43), 4.2 * k, 0, Math.PI * 2);
  g.fillStyle = t.tierInk[key];
  g.fill();
  g.restore();
}

function wrap(g, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (g.measureText(last).width > maxWidth) {
      let cut = last;
      while (cut.length > 1 && g.measureText(`${cut}...`).width > maxWidth) cut = cut.slice(0, -1);
      lines[maxLines - 1] = `${cut}...`;
    }
  }
  return lines;
}

const display = (weight, px) =>
  `${weight} ${px}px "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif`;
const mono = (weight, px) => `${weight} ${px}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
const body = (weight, px) => `${weight} ${px}px Newsreader, Georgia, "Times New Roman", serif`;

/** The whole frame. Everything the card says is drawn here and nowhere else. */
async function drawCard(canvas, card, shin) {
  const t = tokens();
  const g = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;
  const tierKey = card.tierId === 'walk_away' ? 'walk' : card.tierId === 'good' ? 'good' : 'fair';

  g.fillStyle = t.paper;
  g.fillRect(0, 0, W, H);
  g.fillStyle = t.tierBg[tierKey];
  g.fillRect(0, 0, W, 980);

  const pad = 96;
  const mid = W / 2;
  g.textAlign = 'center';

  // Kicker.
  g.fillStyle = t.tierInk[tierKey];
  g.font = mono(600, 30);
  if ('letterSpacing' in g) g.letterSpacing = '10px';
  g.fillText('SHIN SAYS', mid, 168);
  if ('letterSpacing' in g) g.letterSpacing = '0px';

  // The face, which is the token the whole card exists to carry.
  const faceSize = 420;
  const img = await faceImage(shin, card.tierId, faceSize);
  if (img) g.drawImage(img, mid - faceSize / 2, 226, faceSize, faceSize);
  else drawFallbackFace(g, card.tierId, mid, 226 + faceSize / 2, faceSize / 2, t);

  // The verdict word.
  g.fillStyle = t.tierInk[tierKey];
  g.font = display(800, 112);
  g.fillText(card.word, mid, 800);

  // The item.
  g.fillStyle = t.ink;
  g.font = display(600, 46);
  const nameLines = wrap(g, card.label, W - pad * 2, 2);
  nameLines.forEach((line, i) => g.fillText(line, mid, 892 + i * 58));

  // The two prices. Both of them, never the difference between them.
  const boxTop = 1060;
  const boxH = 300;
  g.fillStyle = t.surface;
  g.strokeStyle = t.rule;
  g.lineWidth = 2;
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(pad, boxTop, W - pad * 2, boxH, 28);
  else g.rect(pad, boxTop, W - pad * 2, boxH);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(W / 2, boxTop + 46);
  g.lineTo(W / 2, boxTop + boxH - 46);
  g.strokeStyle = t.rule;
  g.stroke();

  const col = (x, kicker, value, sub, valueColor) => {
    g.textAlign = 'center';
    g.fillStyle = t.faint;
    g.font = mono(600, 24);
    if ('letterSpacing' in g) g.letterSpacing = '5px';
    g.fillText(kicker, x, boxTop + 88);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.fillStyle = valueColor;
    g.font = display(800, value.length > 7 ? 62 : 84);
    g.fillText(value, x, boxTop + 190);
    g.fillStyle = t.muted;
    g.font = body(400, 26);
    wrap(g, sub, W / 2 - pad - 24, 2).forEach((line, i) =>
      g.fillText(line, x, boxTop + 238 + i * 34),
    );
  };
  col(W * 0.27, 'ON THE TAG', card.askingText, card.askingSub, t.ink);
  col(W * 0.73, 'ELSEWHERE', card.elsewhereText, card.elsewhereSub, t.tierInk[tierKey]);

  // Shin's own sentence, which is the part people quote.
  g.textAlign = 'center';
  g.fillStyle = t.ink;
  g.font = body(400, 38);
  wrap(g, card.line, W - pad * 2, 3).forEach((line, i) => g.fillText(line, mid, 1470 + i * 52));

  if (card.confidence) {
    g.fillStyle = t.faint;
    g.font = body(400, 27);
    wrap(g, card.confidence, W - pad * 2, 2).forEach((line, i) =>
      g.fillText(line, mid, 1660 + i * 38),
    );
  }

  // The wordmark, small, in the corner. No link, on purpose.
  g.textAlign = 'left';
  g.font = display(800, 46);
  g.fillStyle = t.ink;
  g.fillText('shin', pad, H - 96);
  g.fillStyle = t.accent;
  g.fillText('.', pad + g.measureText('shin').width, H - 96);

  g.textAlign = 'right';
  g.fillStyle = t.faint;
  g.font = mono(400, 24);
  g.fillText(card.stamp, W - pad, H - 100);
}

/** What the card would say if it had to be typed into a message box. */
function cardText(card) {
  return [
    `Shin says: ${card.word}.`,
    card.label,
    `On the tag: ${card.askingText}${card.askingSub ? ` (${card.askingSub})` : ''}`,
    `Elsewhere: ${card.elsewhereText}${card.elsewhereSub ? ` (${card.elsewhereSub})` : ''}`,
    '',
    card.line,
  ]
    .filter((l) => l !== null && l !== undefined)
    .join('\n');
}

export default {
  id: 'share',
  title: 'Share',

  render(root, ctx) {
    const first = ctx.store.get().history[0];
    if (!first) {
      ctx.replace('scan');
      return;
    }

    const result = first.result ?? {};
    const query = first.query ?? {};
    const refused = result.kind === 'refusal';
    const cad = ctx.shin.cad;
    const identity = result.identity ?? null;
    const tierId = refused ? 'fair' : (result.tier ?? 'fair');
    const tier = ctx.shin.tierOf(tierId);
    const spread = result.spread ?? null;
    const askingCents =
      typeof result.askingCents === 'number'
        ? result.askingCents
        : typeof query.askingCents === 'number'
          ? query.askingCents
          : null;

    const elsewhere = spread
      ? spread.lowCents === spread.highCents
        ? { text: cad(spread.lowCents), sub: 'one price, one seller' }
        : { text: cad(spread.medianCents), sub: `${cad(spread.lowCents)} to ${cad(spread.highCents)} seen` }
      : { text: 'no data', sub: 'nothing Shin would stand behind' };

    const card = {
      tierId,
      word: refused ? 'No call' : tier.word,
      label: identity ? identity.label : (query.text ?? 'Something on a shelf'),
      askingText: askingCents !== null ? cad(askingCents) : 'no price',
      askingSub: result.askingSource ? `at ${result.askingSource}` : query.askingSeller ? `at ${query.askingSeller}` : '',
      elsewhereText: elsewhere.text,
      elsewhereSub: elsewhere.sub,
      line: refused
        ? (result.detail ?? 'Shin would not call this one.')
        : (result.lines ?? []).join(' '),
      confidence: refused ? '' : ctx.shin.confidenceLine(result.confidence),
      stamp: new Date(first.at ?? Date.now()).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    };

    root.innerHTML = `
      <p class="kicker">Stage 08 &middot; the growth engine</p>
      <h2 class="shr-title">One card, and no link on it.</h2>
      <p class="muted small shr-intro">Wordle's emoji grid spread further with no link in it than
        it would have with one, because a link makes a preview that reads as spam. So this frame
        carries Shin, both prices and the item, and nothing that points home.</p>

      <div class="shr-frame">
        <canvas id="shr-canvas" class="shr-canvas"
                role="img" aria-label="${esc(`Shin card. ${card.word}. ${card.label}. On the tag ${card.askingText}. Elsewhere ${card.elsewhereText}.`)}"></canvas>
        <p class="shr-fallback" id="shr-fallback" hidden></p>
      </div>

      <button type="button" class="btn btn-primary" id="shr-save">Save the card as an image</button>
      <button type="button" class="btn btn-quiet" id="shr-copy">Copy it as text instead</button>
      <p class="shr-status" id="shr-status" role="status"></p>

      <div class="card shr-next">
        <p class="kicker plain">What is not built</p>
        <p><b>The rendered 9:16 clip does not exist.</b> The item, the reveal timed, Shin's
          reaction animated, captions burned in: that is the highest leverage row in the share
          table and it is also the expensive one.</p>
        <p class="shr-gate">It is gated on this still card being shared at all. Cards sent so far:
          <span class="num" id="shr-count">0</span>. If that number stays at zero, a clip nobody
          asked for would not have been watched either, and building it first would be a guess
          dressed as a plan.</p>
      </div>
    `;

    const canvas = root.querySelector('#shr-canvas');
    const status = root.querySelector('#shr-status');
    const countEl = root.querySelector('#shr-count');
    const fallbackEl = root.querySelector('#shr-fallback');
    let alive = true;

    function paintCount() {
      countEl.textContent = String(ctx.store.get().shareCount ?? 0);
    }
    paintCount();
    const stop = ctx.store.subscribe(paintCount);

    (async () => {
      try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        if (!alive) return;
        await drawCard(canvas, card, ctx.shin);
      } catch (err) {
        console.error('card draw failed', err);
        if (!alive) return;
        canvas.hidden = true;
        fallbackEl.hidden = false;
        fallbackEl.textContent = cardText(card);
      }
    })();

    root.querySelector('#shr-save').addEventListener('click', async () => {
      status.textContent = 'Rendering...';
      try {
        await drawCard(canvas, card, ctx.shin);
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob gave nothing'))), 'image/png');
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shin-${(card.label || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        ctx.store.update((s) => ({ ...s, shareCount: (s.shareCount ?? 0) + 1 }));
        status.textContent = 'Saved to your downloads. Post it wherever you like.';
      } catch (err) {
        console.error('png export failed', err);
        try {
          await navigator.clipboard.writeText(cardText(card));
          ctx.store.update((s) => ({ ...s, shareCount: (s.shareCount ?? 0) + 1 }));
          status.textContent = 'The image would not export here, so the text version is on your clipboard.';
        } catch {
          fallbackEl.hidden = false;
          fallbackEl.textContent = cardText(card);
          status.textContent = 'Neither the image nor the clipboard worked. The text is above, copy it by hand.';
        }
      }
    });

    root.querySelector('#shr-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(cardText(card));
        ctx.store.update((s) => ({ ...s, shareCount: (s.shareCount ?? 0) + 1 }));
        status.textContent = 'Copied as text.';
      } catch (err) {
        console.error('clipboard copy failed', err);
        fallbackEl.hidden = false;
        fallbackEl.textContent = cardText(card);
        status.textContent = 'The clipboard is blocked here. The text is above.';
      }
    });

    return () => {
      alive = false;
      stop();
    };
  },
};
