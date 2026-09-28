import json, os, sqlite3
S = os.path.dirname(os.path.abspath(__file__))
DB = sqlite3.connect(r'file:C:\shin\catalogue\data\catalogue.db?mode=ro', uri=True)
def n(c): return (c or '').lstrip('0')
truth = {r['sku']: r for r in (json.loads(l) for l in open(os.path.join(S, 'key-truth.jsonl'), encoding='utf-8') if l.strip())}
s3 = {x['sku']: x for x in json.load(open(os.path.join(S, 'stage3.json'), encoding='utf-8'))}
for k, r in truth.items():
    row = DB.execute('SELECT code,name,brands,quantity,sold_in_canada,source FROM product WHERE code IN (?,?,?)', (r['upc'], r['upc'].zfill(13), r['upc'].zfill(14))).fetchone()
    if not row:
        continue
    if any(n(c['code']) == n(r['upc']) for c in s3[k]['cands']):
        continue
    print(f"MISS {s3[k]['title'][:70]!r}\n   true {row}\n   top  {[(c['name'][:25], c['brands']) for c in s3[k]['cands'][:3]]}")
print('--- not in catalogue:')
for k, r in truth.items():
    if not DB.execute('SELECT 1 FROM product WHERE code IN (?,?,?)', (r['upc'], r['upc'].zfill(13), r['upc'].zfill(14))).fetchone():
        print('  ', r['upc'], r['title'][:70])
