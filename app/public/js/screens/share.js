/**
 * The share card.
 *
 * The frame is 4:5, not 9:16. It is a card people post, and 4:5 is the tallest
 * shape that survives a feed crop on every platform at once, so one export
 * covers all of them.
 *
 * Wordle's counterintuitive detail is kept exactly. Josh Wardle left the link
 * out because a link generated a preview that read as spam, and the grid spread
 * further with no attribution than it would have with one. So the frame carries
 * Shin's face, the verdict word, both prices and the item, with the wordmark
 * small in the corner. THERE IS NO LINK IN THE FRAME, and that absence is the
 * feature.
 *
 * HARD RULE: two prices, never the arithmetic between them. A difference shown
 * as an amount saved is a performance claim, and no savings figure here has been
 * measured against anything.
 *
 * The card is drawn on a canvas rather than in DOM, so what is on screen is the
 * exported PNG pixel for pixel rather than an approximation of it.
 */

import { faceSvg, cad, confidenceOf, tierOf, sellerOf, SIZE_TOKENS } from '../shin.js';
import { wordFor, say } from '../voice.js';

const W = 1080;
const H = 1350;

/** Read the live theme, so the card matches the app the user is looking at. */
function palette(tierId) {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  const map = {
    good: ['--good', '#12B76A'],
    fair: ['--fair', '#E8A020'],
    walk_away: ['--walk', '#F0431F'],
    unknown: ['--unknown', '#78848F'],
  };
  const [tv, tf] = map[tierId] ?? map.unknown;
  return {
    ground: pick('--ground', '#0B0C0E'),
    surface: pick('--surface', '#16181C'),
    hairline: pick('--hairline', '#2E333A'),
    ink: pick('--ink', '#F7F5F2'),
    muted: pick('--ink-muted', '#A5ADB8'),
    faint: pick('--ink-faint', '#6E7783'),
    brand: pick('--brand', '#E5165E'),
    tier: pick(tv, tf),
  };
}

/**
 * Shin's face as a bitmap.
 *
 * faceSvg paints with whatever colour it is handed, so it is handed a literal
 * here: CSS custom properties do not resolve inside an <img> and would come out
 * black on black. The xmlns it already carries is the other half of this, and it
 * is why the face has eyebrows on the exported card.
 */
function faceImage(expression, size, ink, who) {
  const svg = faceSvg(expression, { size, ink, who });
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(g, text, maxWidth, maxLines) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
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
const ui = (weight, px) => `${weight} ${px}px "Instrument Sans", "Helvetica Neue", Arial, sans-serif`;
const mono = (weight, px) => `${weight} ${px}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;

async function drawCard(canvas, card) {
  const t = palette(card.tierId);
  const g = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;

  const pad = 88;
  const mid = W / 2;

  g.fillStyle = t.ground;
  g.fillRect(0, 0, W, H);

  // The tier band. Solid when Shin is sure, hollow when the evidence is thin:
  // the same rule the sheet follows, so a screenshot and the app agree.
  const solid = card.level === 'certain' || card.level === 'sure';
  if (solid) {
    g.fillStyle = t.tier;
    g.fillRect(0, 0, W, 760);
  } else {
    g.strokeStyle = t.tier;
    g.lineWidth = 6;
    g.setLineDash(card.level === 'refuses' ? [22, 16] : []);
    g.strokeRect(3, 3, W - 6, 757);
    g.setLineDash([]);
  }
  const onBand = solid ? card.tierOn : t.tier;

  g.textAlign = 'center';

  // The face, which is the token the card exists to carry. AVATAR.md row 49:
  // face-share, 220px, the one size token above face-verdict.
  const faceSize = SIZE_TOKENS['face-share'];
  const img = await faceImage(card.expression, faceSize, onBand, card.who);
  if (img) g.drawImage(img, mid - faceSize / 2, 108, faceSize, faceSize);

  // The verdict word, the largest text on the card.
  g.fillStyle = onBand;
  g.font = display(800, 108);
  g.fillText(card.word, mid, 520);

  // Shin's own sentence, which is the part people quote.
  g.font = ui(500, 38);
  wrap(g, card.line, W - pad * 2, 2).forEach((l, i) => g.fillText(l, mid, 588 + i * 50));

  // The item.
  g.fillStyle = t.ink;
  g.font = display(700, 46);
  wrap(g, card.label, W - pad * 2, 2).forEach((l, i) => g.fillText(l, mid, 872 + i * 56));

  // The two prices, both of them, never the difference between them.
  const boxTop = 960;
  const boxH = 230;
  g.fillStyle = t.surface;
  g.strokeStyle = t.hairline;
  g.lineWidth = 2;
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(pad, boxTop, W - pad * 2, boxH, 26);
  else g.rect(pad, boxTop, W - pad * 2, boxH);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(mid, boxTop + 40);
  g.lineTo(mid, boxTop + boxH - 40);
  g.stroke();

  const col = (x, kicker, value, sub, valueColor) => {
    g.fillStyle = t.faint;
    g.font = mono(600, 22);
    if ('letterSpacing' in g) g.letterSpacing = '5px';
    g.fillText(kicker, x, boxTop + 66);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.fillStyle = valueColor;
    g.font = display(800, value.length > 7 ? 56 : 76);
    g.fillText(value, x, boxTop + 148);
    g.fillStyle = t.muted;
    g.font = ui(400, 24);
    wrap(g, sub, mid - pad - 30, 1).forEach((l) => g.fillText(l, x, boxTop + 190));
  };
  col(W * 0.27, 'ON THE TAG', card.askingText, card.askingSub, t.ink);
  col(W * 0.73, 'ELSEWHERE', card.elsewhereText, card.elsewhereSub, t.tier);

  // How sure Shin was, on the card, because a screenshot outlives the screen.
  g.fillStyle = t.faint;
  g.font = mono(500, 24);
  g.fillText(card.confidence, mid, boxTop + boxH + 62);

  // The wordmark, small, in the corner. No link, on purpose.
  g.textAlign = 'left';
  g.font = display(800, 42);
  g.fillStyle = t.ink;
  g.fillText('shin', pad, H - 62);
  g.fillStyle = t.brand;
  g.fillText('.', pad + g.measureText('shin').width, H - 62);

  g.textAlign = 'right';
  g.fillStyle = t.faint;
  g.font = mono(400, 22);
  g.fillText(card.stamp, W - pad, H - 66);
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
  ].join('\n');
}

export default {
  id: 'share',
  title: 'Share',

  render(root, ctx) {
    const entry = ctx.store.get().history.find(
      (h) => h.result?.kind === 'verdict' && (!ctx.params.id || h.result.identity?.id === ctx.params.id),
    );
    if (!entry) {
      ctx.replace('camera');
      return;
    }

    const v = entry.result;
    const conf = confidenceOf(v);
    const tier = tierOf(v.tier);
    const cs = getComputedStyle(document.documentElement);
    const onVar = { good: '--good-on', fair: '--fair-on', walk_away: '--walk-on' }[v.tier] ?? '--unknown-on';

    const card = {
      tierId: v.tier,
      tierOn: (cs.getPropertyValue(onVar) || '').trim() || '#FFFFFF',
      expression: tier.face,
      who: undefined,
      level: conf.level,
      word: wordFor(v.tier),
      line: say(v.tier, { asking: cad(v.askingCents), usual: cad(v.spread.medianCents) }),
      label: v.identity.label,
      askingText: cad(v.askingCents),
      askingSub: sellerOf(v) ? `at ${sellerOf(v)}` : '',
      elsewhereText: cad(v.spread.medianCents),
      elsewhereSub:
        v.spread.lowCents === v.spread.highCents
          ? 'one price, one seller'
          : `${cad(v.spread.lowCents)} to ${cad(v.spread.highCents)}`,
      confidence: conf.label.toUpperCase(),
      stamp: new Date(entry.at ?? Date.now()).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      }),
    };

    root.innerHTML = `
      <div class="page page-share">
        <header class="page-head">
          <p class="kicker">No link in the frame, on purpose</p>
          <h1>Post it</h1>
        </header>

        <p class="fineprint">A link would make a preview that reads as spam.</p>

        <div class="shr-frame">
          <canvas class="shr-canvas"
                  role="img"
                  aria-label="Shin card. ${card.word}. ${card.label}. On the tag ${card.askingText}. Elsewhere ${card.elsewhereText}."></canvas>
          <pre class="shr-fallback" hidden></pre>
        </div>

        <div class="page-foot">
          <button type="button" class="cta" data-act="save">Save the image</button>
          <button type="button" class="linky" data-act="copy">Copy as text</button>
          <button type="button" class="linky" data-act="back">Back to the camera</button>
        </div>
        <p class="shr-status" role="status"></p>
      </div>`;

    const canvas = root.querySelector('.shr-canvas');
    const fallback = root.querySelector('.shr-fallback');
    const status = root.querySelector('.shr-status');
    let alive = true;

    (async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
        if (!alive) return;
        await drawCard(canvas, card);
      } catch (err) {
        console.error('card draw failed', err);
        if (!alive) return;
        canvas.hidden = true;
        fallback.hidden = false;
        fallback.textContent = cardText(card);
      }
    })();

    root.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'back') { ctx.go('camera'); return; }

      if (act === 'copy') {
        try {
          await navigator.clipboard.writeText(cardText(card));
          ctx.store.update((s) => ({ ...s, shareCount: (s.shareCount ?? 0) + 1 }));
          status.textContent = 'Copied as text.';
        } catch {
          fallback.hidden = false;
          fallback.textContent = cardText(card);
          status.textContent = 'The clipboard is blocked here, so the text is above.';
        }
        return;
      }

      if (act === 'save') {
        status.textContent = 'Rendering...';
        try {
          await drawCard(canvas, card);
          const blob = await new Promise((res, rej) => {
            canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob gave nothing'))), 'image/png');
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `shin-${card.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          ctx.store.update((s) => ({ ...s, shareCount: (s.shareCount ?? 0) + 1 }));
          status.textContent = 'Saved to your downloads.';
        } catch (err) {
          console.error('png export failed', err);
          fallback.hidden = false;
          fallback.textContent = cardText(card);
          status.textContent = 'The image would not export here. The text version is above.';
        }
      }
    });

    return () => { alive = false; };
  },
};
