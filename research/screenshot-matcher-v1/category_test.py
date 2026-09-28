"""Can the matcher's shortlist put a store product in the right subcategory, even when the exact
barcode is wrong? Truth = the category tags of the product's true barcode (held-out key).
Baseline to beat = the most common category on the same printout page (says if categories are too coarse)."""
import json, os, re, sqlite3, collections
S = os.path.dirname(os.path.abspath(__file__))
DB = sqlite3.connect(r'file:C:\shin\catalogue\data\catalogue.db?mode=ro', uri=True)

def tags(code):
    r = DB.execute('SELECT rowid, leaf_category FROM product WHERE code IN (?,?,?)', (code, code.zfill(13), code.zfill(14))).fetchone()
    if not r:
        return None, None
    t = {tag: d for tag, d in DB.execute('SELECT tag, depth FROM product_category WHERE rowid_ref = ?', (r[0],))}
    return r[1], t

def agree(ta, tb):
    """Deepest shared tag depth, and each side's own deepest depth."""
    if not ta or not tb:
        return None
    shared = set(ta) & set(tb)
    return max((ta[t] for t in shared), default=-1), max(ta.values()), max(tb.values())

truth = {}
for l in open(os.path.join(S, 'key-truth.jsonl'), encoding='utf-8'):
    try:
        r = json.loads(l)
    except ValueError:
        continue
    if r.get('upc'):
        truth[r['sku']] = r['upc']
s3 = {x['sku']: x for x in json.load(open(os.path.join(S, 'stage3.json'), encoding='utf-8'))}
rows = {x['sku']: x for x in json.load(open(os.path.join(S, 'walmart-rows.json'), encoding='utf-8'))}

# baseline: most common leaf among top-1 candidates of all products on the same printout file
page_leaf = collections.defaultdict(collections.Counter)
for sku, x in s3.items():
    if x['cands']:
        leaf, _ = tags(x['cands'][0]['code'])
        if leaf:
            page_leaf[rows[sku]['file']][leaf] += 1

res = collections.Counter()
detail = []
for sku, upc in truth.items():
    tleaf, tt = tags(upc)
    if not tt:
        res['truth not in catalogue or no category'] += 1
        continue
    res['scored'] += 1
    cands = s3[sku]['cands']
    # method A: top-1 candidate's category
    aleaf, at = tags(cands[0]['code']) if cands else (None, None)
    # method B: most common leaf among top 5 candidates (vote)
    votes = collections.Counter(l for l, _ in (tags(c['code']) for c in cands[:5]) if l)
    bleaf = votes.most_common(1)[0][0] if votes else None
    # baseline
    pl = page_leaf[rows[sku]['file']].most_common(1)
    cleaf = pl[0][0] if pl else None
    res['A exact leaf'] += (aleaf == tleaf)
    res['B exact leaf'] += (bleaf == tleaf)
    res['baseline exact leaf'] += (cleaf == tleaf)
    g = agree(tt, at)
    if g:
        shared, tdepth, _ = g
        res['A parent level (one above truth leaf) or better'] += shared >= tdepth - 1
    res['truth depth sum'] += max(tt.values())
    detail.append((s3[sku]['title'][:45], tleaf, aleaf, bleaf))
print(dict(res))
n = res['scored']
for k in ('A exact leaf', 'B exact leaf', 'baseline exact leaf', 'A parent level (one above truth leaf) or better'):
    print(f'{k}: {res[k]}/{n} = {res[k]/max(1,n):.0%}')
print('mean truth depth', round(res['truth depth sum'] / max(1, n), 1))
for d in detail[:25]:
    print('  ', d)

# size coverage across all products: can the price become a unit price?
sys_path = os.path.join(S, 'pipeline.py')
import importlib.util
spec = importlib.util.spec_from_file_location('pl', sys_path); pl = importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)
have = 0; weight = 0
for r in rows.values():
    t = pl.full_title(r['name'] or '', r['slug'])
    if pl.sizes(t):
        have += 1
print(f'size readable from the printout title or link: {have}/{len(rows)}')
