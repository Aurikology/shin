"""Check the tile unit price against price / size where a tile has both.
Agreement means the unit price was read from its own tile and parsed right."""
import pymupdf, glob, re, os, json, importlib.util
from paths import WALMART_PDFS
S = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pl', os.path.join(S, 'pipeline.py')); pl = importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)
os.chdir(WALMART_PDFS)
U1 = re.compile(r'(\d+(?:\.\d+)?)\s*¢\s*/\s*(\d*)\s*(g|ml|kg|l)\b', re.I)
U2 = re.compile(r'\$\s?(\d+(?:\.\d+)?)\s*/\s*(\d*)\s*(g|ml|kg|l|lb)\b', re.I)
BASE = {'g': ('g', 1), 'kg': ('g', 1000), 'ml': ('ml', 1), 'l': ('ml', 1000), 'lb': ('g', 453.6)}
def unit_cents_per_100(t):
    m = U1.search(t)
    if m:
        cents = float(m.group(1)); qty = float(m.group(2) or 1); u, k = BASE[m.group(3).lower()]
    else:
        m = U2.search(t)
        if not m:
            return None
        cents = float(m.group(1)) * 100; qty = float(m.group(2) or 1); u, k = BASE[m.group(3).lower()]
    return u, cents / (qty * k) * 100
unit = {}
for f in sorted(glob.glob('*.pdf')):
    for p in pymupdf.open(f):
        for l in p.get_links():
            m = re.search(r'/ip/[^/]+/([0-9A-Za-z]+)', l.get('uri') or '')
            if m and m.group(1) not in unit:
                u = unit_cents_per_100(p.get_textbox(l['from']))
                if u:
                    unit[m.group(1)] = u
rows = json.load(open(os.path.join(S, 'walmart-rows.json'), encoding='utf-8'))
agree = off = 0; bad = []
for r in rows:
    if r['sku'] not in unit or not r['price']:
        continue
    sz = pl.sizes(pl.full_title(r['name'] or '', r['slug']))
    u, printed = unit[r['sku']]
    same = [v for uu, v in sz if uu == u]
    if not same:
        continue
    computed = [r['price'] / v * 100 for v in same]
    if any(abs(c - printed) <= max(1, 0.03 * printed) for c in computed):
        agree += 1
    else:
        off += 1; bad.append((pl.full_title(r['name'] or '', r['slug'])[:55], r['price'], printed, [round(c, 1) for c in computed]))
print(f'tiles with both a size and a unit price: {agree + off}; unit price agrees with price/size: {agree}; disagrees: {off}')
for b in bad[:15]:
    print('  ', b)
