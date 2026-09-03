/**
 * The app server. Static files plus a thin API over the real price spine.
 *
 * No framework and no dependencies, so `node server.ts` is the whole install
 * step. Node runs the TypeScript directly.
 *
 * The API is deliberately thin. Every judgement lives in ../spine and this file
 * is only allowed to move it, never to make it. If a rule about prices appears
 * in here, it is in the wrong place.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize as normalizePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceIt } from '../spine/src/spine.ts';
import { defaultDeps } from '../spine/src/sources/registry.ts';
import { RecordedSource } from '../spine/src/sources/recorded.ts';
import { CATEGORY_RULES } from '../spine/src/categories.ts';
import type { SpineQuery } from '../spine/src/contract.ts';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/**
 * The catalogue the app can actually answer for.
 *
 * Seven items, because seven is what has been priced by hand. This is exposed to
 * the client on purpose: a scan screen that pretends to know everything and then
 * fails is worse than one that shows its shelf.
 */
/**
 * Which of the recorded items Shin can actually answer for, asked by asking it.
 *
 * The count matters because a screen that says "Shin can answer for 7 things"
 * when 5 of them refuse is the app overstating its own coverage, which is the
 * one thing this product cannot do and still be worth opening. Two of the seven
 * come back with a verdict, which is the hand pilot's own headline rather than a
 * coincidence: two ranges, three partials, two blanks.
 *
 * It is measured on every request instead of hardcoded, so it corrects itself
 * the day an observation is added rather than going quietly stale.
 */
async function answerable(items: { id: string; label: string; category: string }[]) {
  const deps = defaultDeps();
  const results = await Promise.all(
    items.map(async (i) => {
      // A nominal asking price only decides the tier, never whether the answer
      // is a verdict or a refusal, which is the only thing being counted here.
      const r = await priceIt(
        { text: i.label, category: i.category as SpineQuery['category'], askingCents: 999 },
        deps,
      );
      return [i.id, r.kind === 'verdict'] as const;
    }),
  );
  return new Map(results);
}

async function catalogue() {
  const recorded = new RecordedSource();
  // The source keeps its store private, so read the same file it reads. Widening
  // the source interface to give a demo screen a product list would be the tail
  // wagging the dog.
  const store = JSON.parse(
    readFileSync(fileURLToPath(new URL('../spine/data/observations.json', import.meta.url)), 'utf8'),
  ) as { products: { id: string; label: string; category: string; gtin?: string; points: unknown[] }[] };
  const items = store.products.map((p) => ({
    id: p.id,
    label: p.label,
    category: p.category,
    gtin: p.gtin ?? null,
    pointCount: p.points.length,
  }));
  const canAnswer = await answerable(items);
  return {
    recordedAt: recorded.recordedAt,
    provenance: recorded.provenance,
    // The honest headline. `items.length` is the shelf; this is the answer rate.
    answerableCount: [...canAnswer.values()].filter(Boolean).length,
    items: items.map((i) => ({ ...i, answerable: canAnswer.get(i.id) === true })),
  };
}

function categories() {
  return Object.values(CATEGORY_RULES).map((r) => ({
    id: r.id,
    label: r.label,
    unsupported: r.unsupported ? { why: r.unsupported.why, reversedBy: r.unsupported.reversedBy } : null,
    minPoints: r.minPoints,
    minDistinctSellers: r.minDistinctSellers,
    maxAgeDays: r.maxAgeDays,
    reasoning: r.reasoning,
  }));
}

async function readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  const json = (status: number, body: unknown) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(payload);
  };

  try {
    if (url.pathname === '/api/catalogue') return json(200, await catalogue());
    if (url.pathname === '/api/categories') return json(200, categories());

    if (url.pathname === '/api/price') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readBody(req);
      if (body === null || typeof body !== 'object') {
        return json(400, { error: 'body did not parse as JSON' });
      }
      const q = body as Record<string, unknown>;
      const query: SpineQuery = {
        text: typeof q.text === 'string' ? q.text : undefined,
        gtin: typeof q.gtin === 'string' ? q.gtin : undefined,
        category: q.category as SpineQuery['category'],
        askingCents: typeof q.askingCents === 'number' ? q.askingCents : undefined,
        askingSeller: typeof q.askingSeller === 'string' ? q.askingSeller : undefined,
        asOf: typeof q.asOf === 'string' ? q.asOf : undefined,
      };
      // A refusal is a 200. It is a correct answer, and any client that treats
      // it as an error will start retrying around the one safety mechanism here.
      return json(200, await priceIt(query, defaultDeps()));
    }

    if (url.pathname.startsWith('/api/')) return json(404, { error: 'no such endpoint' });

    // Static. Path is normalised and then confined to public/ before any read.
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const resolved = join(PUBLIC_DIR, normalizePath(requested));
    if (!resolved.startsWith(PUBLIC_DIR.replace(/[\\/]$/, '') + sep)) {
      return json(403, { error: 'outside the public directory' });
    }
    const file = await readFile(resolved);
    res.writeHead(200, {
      'content-type': TYPES[extname(resolved)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(file);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'EISDIR') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('server error');
    console.error(err);
  }
});

server.listen(PORT, () => {
  console.log(`Shin is running.  http://localhost:${PORT}`);
  console.log('The engine behind it knows 7 products, because 7 is what has been priced by hand.');
});
