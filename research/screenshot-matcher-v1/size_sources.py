"""Where can a size come from, counted per product: link/title (already), unit price printed on the tile."""
import pymupdf, glob, re, os, json, importlib.util
from paths import WALMART_PDFS
S = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pl', os.path.join(S, 'pipeline.py')); pl = importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)
os.chdir(WALMART_PDFS)
UNIT = re.compile(r'(\d+(?:\.\d+)?)\s*[¢c]\s*/\s*(\d+)\s*(g|ml|kg|l)\b|\$\s?\d+(?:\.\d+)?\s*/\s*(\d+)?\s*(g|ml|kg|l|lb|ea)\b', re.I)
tile_unit = {}
tile_text = {}
for f in sorted(glob.glob('*.pdf')):
    d = pymupdf.open(f)
    for p in d:
        for l in p.get_links():
            m = re.search(r'/ip/[^/]+/([0-9A-Za-z]+)', l.get('uri') or '')
            if not m:
                continue
            t = p.get_textbox(l['from'])
            tile_text.setdefault(m.group(1), t)
            u = UNIT.search(t)
            if u and m.group(1) not in tile_unit:
                tile_unit[m.group(1)] = u.group(0)
rows = json.load(open(os.path.join(S, 'walmart-rows.json'), encoding='utf-8'))
has_title = {r['sku'] for r in rows if pl.sizes(pl.full_title(r['name'] or '', r['slug']))}
has_unit = set(tile_unit)
allk = {r['sku'] for r in rows}
print('products', len(allk))
print('size in title or link', len(has_title))
print('unit price printed on tile', len(has_unit), 'of which no title size', len(has_unit - has_title))
print('either', len(has_title | has_unit), f'= {len(has_title | has_unit)/len(allk):.0%}')
print('examples of tile unit text:', list(tile_unit.values())[:8])
# what do the no-size tiles look like
no = [r for r in rows if r['sku'] not in has_title | has_unit][:12]
for r in no:
    print('  NO SIZE:', pl.full_title(r['name'] or '', r['slug'])[:80])
