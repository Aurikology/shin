import pymupdf, glob, re, os, json
from paths import WALMART_PDFS
# One row per Walmart product: id, name (from the tile text), price in cents, file.
OUT = os.path.abspath(os.environ['OUT'])  # resolved before the chdir, so it never lands in the PDF folder
os.chdir(WALMART_PDFS)
out = {}
SKIP = re.compile(r'^(Add|Best seller|Save with.*|Delivery.*|Pickup.*|\+ tax|Final cost by weight|Rollback|Flyer feature|Options|Sponsored|Was.*|Clearance|Reduced price|New|Popular pick|\d+|avg price.*|Only \d+ left|In-store.*|Out of stock|More options.*)$')
for f in sorted(glob.glob('*.pdf')):
    d = pymupdf.open(f)
    for p in d:
        for l in p.get_links():
            m = re.search(r'/ip/([^/]+)/([0-9A-Za-z]+)', l.get('uri') or '')
            if not m:
                continue
            sku = m.group(2)
            t = p.get_textbox(l['from'])
            lines = [x.strip() for x in t.split('\n') if x.strip()]
            price = None
            name = None
            for x in lines:
                pm = re.search(r'(\d+)\$ ?(\d\d)', x) or re.search(r'\$(\d+)(\d\d)\b', x)
                if pm and price is None:
                    price = int(pm.group(1)) * 100 + int(pm.group(2))
                    continue
                if name is None and not SKIP.match(x) and '$' not in x and len(x) > 3:
                    name = x
            row = out.setdefault(sku, {'sku': sku, 'slug': m.group(1), 'name': None, 'price': None, 'file': f})
            if name and (row['name'] is None or len(name) > len(row['name'])):
                row['name'] = name
            if price and row['price'] is None:
                row['price'] = price
rows = list(out.values())
json.dump(rows, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('rows', len(rows), 'named', sum(1 for r in rows if r['name']), 'priced', sum(1 for r in rows if r['price']))
for r in rows[:12]:
    print(r['sku'], r['price'], r['name'], '|', r['slug'][:40])
