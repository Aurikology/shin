"""Read one saved-as-PDF store page into raw JSON. Reads; never interprets.

Called by price/src/capture-printout.ts (unit A2 of docs/price-system-build-plan-2026-09-28.md).
Why a Python script and not TypeScript: the PDF has to be opened by a PDF library, PyMuPDF is
the one the printout prototype (research/screenshot-matcher-v1/extract.py) was measured with, and
Node has no PDF reader in this repo. So this file does the one thing only a PDF library can do,
and every decision (which link is a product, which line is the price, what the name is) is made
in TypeScript, next to the store, where the rebuild check can re-run it from the stored raw rows
without Python.

Output (stdout, UTF-8 JSON):
  sha256, page_count, doc_title (PDF metadata), creation_date (PDF metadata, verbatim),
  mtime (file modification time, ISO, UTC),
  links: one entry per URI link on every page, in page order:
    page (1-based), bbox [x0, y0, x1, y1], uri,
    words: every word whose centre lies inside the link rectangle, verbatim, in reading order,
           as [x0, y0, x1, y1, text, block, line, word, info] (PyMuPDF get_text("words")),
           where info is {"r": render type, "u": upright, "f": font, "s": size} from the text
           trace span holding the word's centre (render type 3 is invisible text), or null when
           no span holds it,
    near:  the words whose centre lies OUTSIDE the rectangle but that touch it: a word whose box
           crosses the rectangle's edge, or any word of a text block that has a word inside.
           Same shape. Kept so a price straddling the tile edge is seen, never silently cut off.
    image: path of the tile crop PNG, or null when --images was not given.

A word is kept on every link whose rectangle holds its centre, so a link rectangle that overlaps
the neighbouring tile carries the neighbour's words too. That is deliberate: raw is what the page
said, and the neighbour-name defect is handled where the name is chosen (from the link, never the
printed words), not by quietly trimming the evidence.

Usage: python read-printout.py <file.pdf> [--images <dir>]
"""
import datetime
import hashlib
import json
import os
import sys

import pymupdf


def r2(v):
    return round(float(v), 2)


def main(argv):
    if len(argv) < 2:
        sys.stderr.write('usage: read-printout.py <file.pdf> [--images <dir>]\n')
        return 2
    path = argv[1]
    images = None
    if '--images' in argv:
        images = argv[argv.index('--images') + 1]
        os.makedirs(images, exist_ok=True)
    with open(path, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    doc = pymupdf.open(path)
    meta = doc.metadata or {}
    out = {
        'sha256': sha,
        'page_count': doc.page_count,
        'doc_title': meta.get('title') or None,
        'creation_date': meta.get('creationDate') or None,
        'mtime': datetime.datetime.fromtimestamp(os.path.getmtime(path), datetime.timezone.utc)
        .isoformat(timespec='seconds')
        .replace('+00:00', 'Z'),
        'links': [],
    }
    n = 0
    for page in doc:
        words = page.get_text('words', sort=True)
        spans = page.get_texttrace()

        def info(w):
            cx = (w[0] + w[2]) / 2
            cy = (w[1] + w[3]) / 2
            for sp in spans:
                b = sp['bbox']
                if b[0] - 0.5 <= cx <= b[2] + 0.5 and b[1] - 0.5 <= cy <= b[3] + 0.5:
                    d = sp['dir']
                    return {'r': sp['type'], 'u': abs(d[0] - 1) < 1e-3 and abs(d[1]) < 1e-3,
                            'f': sp['font'], 's': r2(sp['size'])}
            return None

        # Once per word per page, not once per link: a saved page holds thousands of words and spans.
        infos = {id(w): info(w) for w in words}

        def row(w):
            return [r2(w[0]), r2(w[1]), r2(w[2]), r2(w[3]), w[4], w[5], w[6], w[7], infos[id(w)]]

        for link in page.get_links():
            uri = link.get('uri')
            if not uri:
                continue
            rect = link['from']
            inside = []
            near = []
            blocks = set()
            for w in words:
                cx = (w[0] + w[2]) / 2
                cy = (w[1] + w[3]) / 2
                if rect.x0 <= cx <= rect.x1 and rect.y0 <= cy <= rect.y1:
                    inside.append(row(w))
                    blocks.add(w[5])
            for w in words:
                cx = (w[0] + w[2]) / 2
                cy = (w[1] + w[3]) / 2
                if rect.x0 <= cx <= rect.x1 and rect.y0 <= cy <= rect.y1:
                    continue
                crosses = w[0] < rect.x1 and w[2] > rect.x0 and w[1] < rect.y1 and w[3] > rect.y0
                if crosses or w[5] in blocks:
                    near.append(row(w))
            image = None
            if images:
                n += 1
                image = os.path.join(images, f'{sha[:12]}-p{page.number + 1}-{n}.png')
                page.get_pixmap(clip=rect, dpi=96).save(image)
            out['links'].append({
                'page': page.number + 1,
                'bbox': [r2(rect.x0), r2(rect.y0), r2(rect.x1), r2(rect.y1)],
                'uri': uri,
                'words': inside,
                'near': near,
                'image': image,
            })
    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
