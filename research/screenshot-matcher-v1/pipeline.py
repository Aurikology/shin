"""Stages 1, 3 and 4 of docs/screenshot-matcher-design-2026-09-28.md (Shin), prototype.

Reads walmart-rows.json (stage 1 output: one row per product tile), writes stage3.json
(top-10 candidates per tile with features) and stage4.json (checker verdict per tile).
Never reads the answer key.
"""
import sqlite3, json, re, os, unicodedata, collections, sys

S = os.path.dirname(os.path.abspath(__file__))
DB = sqlite3.connect(r'file:C:\shin\catalogue\data\catalogue.db?mode=ro', uri=True)
COLS = ['code', 'name', 'brands', 'quantity', 'size_value', 'size_unit', 'sold_in_canada', 'source', 'image_url']
SEL = 'SELECT p.' + ', p.'.join(COLS) + ' FROM product_fts f JOIN product p ON p.rowid = f.rowid WHERE product_fts MATCH ? ORDER BY rank LIMIT ?'

# ---------- stage 1 text repair ----------
def clean(t):
    t = unicodedata.normalize('NFKC', t or '')
    t = t.replace('\u2019', "'").replace('\u2018', "'").replace('\u2011', '-').replace('\ufffd', '')
    t = re.sub(r'[®™*©]', '', t)
    return re.sub(r'\s+', ' ', t).strip(' ,|-')

MISMATCH = []
JUNK = re.compile(r'^(add|\+\s*\d+ options?|options|[\d.]+\s*¢\s*/.*|\$.*|best seller|rollback|sponsored)$', re.I)

def full_title(printed, slug):
    """The printed tile title is often cut short; the product link carries the whole title as a
    dash-separated slug. Keep the printed text (it has punctuation and decimals) and add the
    slug words it is missing."""
    p = clean(printed)
    if JUNK.match(p) or len(re.findall(r'[A-Za-z]{2,}', p)) < 1:
        p = ''
    s = re.sub(r'(\d)-(\d+)-(kg|g|ml|l|lb|oz)\b', r'\1.\2 \3', slug or '', flags=re.I)
    s = re.sub(r'\b(\w)-s\b', r"\1's", s)
    s = s.replace('-', ' ')
    have = set(fold(p).split())
    sw = [fold(w) for w in s.split() if fold(w)]
    # A link rectangle can overlap the neighbouring tile's text, so the printed name may belong
    # to another product. The link is exact; when the two disagree, keep the link title only.
    if p and sw and sum(1 for w in sw[:6] if w in have) < min(2, len(sw[:6])):
        MISMATCH.append((printed, slug))
        p, have = '', set()
    extra = [w for w in s.split() if fold(w) and fold(w) not in have]
    return clean((p + ' ' + ' '.join(extra)).strip())

def fold(t):
    t = ''.join(c for c in unicodedata.normalize('NFD', t or '') if not (0x300 <= ord(c) <= 0x36f))
    t = t.lower().replace("'s ", 's ').replace("'", '')
    t = re.sub(r'[^a-z0-9%.\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def toks(t):
    out = [x.strip('.') for x in fold(t).split() if x.strip('.')]
    s = set(out)
    # the same milk written two ways: "2%" on the shelf, "partly skimmed" in the catalogue
    if 'partly' in s or ('skimmed' in s and 'partly' in s):
        out += ['1%', '2%'] if not (s & {'1%', '2%'}) else []
    elif 'skim' in s or 'skimmed' in s:
        out += ['0%']
    if 'homogenized' in s or 'homo' in s:
        out += ['3.25%']
    if s & {'1%', '2%'}:
        out += ['partly', 'skimmed']
    return out

def fts_tokens(t):
    """What SQLite's unicode61 tokenizer makes of the text: "Campbell's" is "campbell" and "s"."""
    t = ''.join(c for c in unicodedata.normalize('NFD', t or '') if not (0x300 <= ord(c) <= 0x36f))
    return [w for w in re.split(r'[^0-9a-z]+', t.lower()) if w]

SIZE_TOK = re.compile(r'^(\d+(\.\d+)?(g|kg|ml|l|lb|lbs|oz)?|g|kg|ml|l|lb|lbs|oz|x)$')

# ---------- sizes ----------
UNIT = {'l': ('ml', 1000), 'lt': ('ml', 1000), 'liter': ('ml', 1000), 'liters': ('ml', 1000), 'litre': ('ml', 1000),
        'litres': ('ml', 1000), 'ml': ('ml', 1), 'cl': ('ml', 10), 'g': ('g', 1), 'gr': ('g', 1), 'kg': ('g', 1000),
        'lb': ('g', 453.6), 'lbs': ('g', 453.6), 'oz': ('g', 28.35), 'fl oz': ('ml', 29.57), 'onz': ('g', 28.35)}
SZ = re.compile(r'(?:(\d+)\s*(?:x|/)\s*)?(\d+(?:[.,]\d+)?)\s*(fl oz|kg|g|gr|ml|cl|lt|l|liters?|litres?|lbs?|oz|onz)\b', re.I)
def sizes(t):
    out = set()
    for m in SZ.finditer((t or '').lower()):
        u, k = UNIT[m.group(3)]
        v = float(m.group(2).replace(',', '.')) * k
        if v <= 0:
            continue
        out.add((u, v))
        if m.group(1):
            out.add((u, v * int(m.group(1))))
    return out
def cand_sizes(c):
    s = sizes(c['quantity']) | sizes(c['name'])
    if c['size_value'] and c['size_unit']:
        s |= sizes(f"{c['size_value']} {c['size_unit']}")
    return s
def size_rel(a, b):
    if not a or not b:
        return 'unknown'
    for ua, va in a:
        for ub, vb in b:
            if ua == ub and abs(va - vb) <= max(3, 0.04 * max(va, vb)):
                return 'agree'
    # g vs ml on liquids is not a clash we can judge
    if not ({u for u, _ in a} & {u for u, _ in b}):
        return 'unknown'
    return 'conflict'

# ---------- variants ----------
GROUPS = [
    {'0%', '1%', '2%', '3.25%', '3.8%', '0.5%', 'skim', 'homogenized', 'whole'},
    {'smooth', 'crunchy', 'chunky', 'creamy'},
    {'vanilla', 'strawberry', 'raspberry', 'blueberry', 'peach', 'cherry', 'lemon', 'lime', 'mango', 'chocolate',
     'caramel', 'coconut', 'banana', 'apple', 'cinnamon', 'honey', 'maple', 'plain', 'original', 'mixed', 'berry',
     'chicken', 'beef', 'vegetable', 'mushroom', 'tomato', 'garlic', 'onion', 'cheddar', 'cheese', 'bbq', 'pork',
     'shrimp', 'turkey', 'basil', 'alfredo', 'marinara', 'pesto', 'spicy', 'mild', 'medium', 'hot'},
    {'white', 'brown', 'red', 'green', 'black', 'golden', 'yellow'},
]
ONE_SIDED = {'organic', 'lactose', 'gluten', 'unsweetened', 'light', 'lite', 'diet', 'zero', 'decaf', 'reduced',
             'sodium', 'salted', 'unsalted', 'fat', 'free', 'sugar', 'kosher', 'vegan', 'protein', 'keto'}

def variant_clash(title_t, cand_t):
    ts, cs = set(title_t), set(cand_t)
    for g in GROUPS:
        a, b = ts & g, cs & g
        if a and b and not (a & b):
            return f'{"/".join(sorted(a))} vs {"/".join(sorted(b))}'
    extra = (cs & ONE_SIDED) - ts
    if extra:
        return 'catalogue says ' + '/'.join(sorted(extra))
    return None

# ---------- brands ----------
def load_brands():
    cnt = collections.Counter()
    raw = {}
    for (b,) in DB.execute("SELECT brands FROM product WHERE sold_in_canada = 1 AND brands IS NOT NULL AND brands != ''"):
        first = fold(b.split(',')[0])
        if 2 <= len(first) <= 40:
            cnt[first] += 1
            raw.setdefault(first, b.split(',')[0])
    return {b: raw[b] for b, n in cnt.items() if n >= 3}

def split_brand(title, brands):
    t = toks(title)
    for n in range(min(4, len(t)), 0, -1):
        cand = ' '.join(t[:n])
        if cand in brands:
            return cand, t[n:]
    return None, t

def brand_rel(title_brand, title_t, c):
    cb = fold((c['brands'] or '').split(',')[0])
    if not cb:
        return 'unknown'
    cbt = cb.split()
    if all(x in set(title_t) for x in cbt):
        return 'agree'
    if title_brand and (title_brand in cb or cb in title_brand):
        return 'agree'
    return 'conflict'

# ---------- stage 3 ----------
STOP = {'and', 'with', 'the', 'of', 'in', 'for', 'a', 'de', 'et', 'la', 'le', 'du', 'pack', 'size', 'family', 'each',
        'sold', 'singles', 'bag', 'bottle', 'jar', 'can', 'box', 'ct', 'count', 'x'}

def fts_words(ws):
    return [w for w in dict.fromkeys(re.sub(r'[^a-z0-9]', '', w) for w in ws) if len(w) > 1 and w not in STOP and not w.isdigit()]

def query(q, n):
    try:
        return [dict(zip(COLS, r)) for r in DB.execute(SEL, (q, n))]
    except sqlite3.OperationalError:
        return []

def candidates(title, brands):
    b, rest = split_brand(title, brands)
    words = fts_words(fts_tokens(' '.join(rest)))[:10]
    found = {}
    if b and words:
        bq = ' AND '.join(f'"{x}"' for x in fts_tokens(brands[b]))
        for c in query(f'brands : ({bq}) AND ({" OR ".join(chr(34) + w + chr(34) for w in words)})', 120):
            found.setdefault(c['code'], c)
    allw = fts_words(fts_tokens(title))[:12]
    if allw:
        # all product words required first, then any
        for q in (' AND '.join(f'"{w}"' for w in allw[:6]), ' OR '.join(f'"{w}"' for w in allw)):
            for c in query(q, 60):
                found.setdefault(c['code'], c)
    return b, list(found.values())

def score(title_t, title_brand, tsz, c):
    ct = toks(c['name'])
    if not ct:
        return None
    ts = set(title_t)
    cov_c = sum(1 for x in ct if x in ts) / len(ct)            # catalogue name words present in title
    pt = [x for x in title_t if x not in STOP and not SIZE_TOK.match(x) and len(x) > 1]
    cset = set(ct) | set(toks(c['brands'] or ''))
    missing_variants = [x for x in pt if x not in cset and (x in ONE_SIDED or any(x in g for g in GROUPS))]
    cov_t = sum(1 for x in pt if x in set(ct) | set(toks(c['brands'] or ''))) / max(1, len(pt))
    br = brand_rel(title_brand, title_t, c)
    sz = size_rel(tsz, cand_sizes(c))
    vc = variant_clash(title_t, ct)
    s = 2.0 * cov_c + 1.0 * cov_t + {'agree': 1.5, 'unknown': 0, 'conflict': -3}[br] \
        + {'agree': 1.5, 'unknown': 0, 'conflict': -2}[sz] + (0.5 if c['sold_in_canada'] else -0.5) \
        + (-1.5 if vc else 0) + (0.2 if c['source'] == 'openfoodfacts' else 0) - 0.4 * len(missing_variants)
    return {'code': c['code'], 'name': c['name'], 'brands': c['brands'], 'quantity': c['quantity'],
            'size_value': c['size_value'], 'size_unit': c['size_unit'], 'canada': c['sold_in_canada'],
            'image_url': c['image_url'], 'score': round(s, 3), 'cov_c': round(cov_c, 2), 'cov_t': round(cov_t, 2),
            'brand': br, 'size': sz, 'variant_clash': vc, 'unconfirmed': missing_variants}

# ---------- stage 4 ----------
def verdict(title_t, cands):
    # Hard clashes only. Weak word overlap is not a reason to drop a candidate; it only keeps
    # a candidate from being accepted without review (see the 'single' test below).
    keep = [c for c in cands if c['brand'] != 'conflict' and c['size'] != 'conflict' and not c['variant_clash']
            and c['cov_c'] > 0]
    # a US-only row loses to a Canadian row with the same folded name
    can_names = {fold(c['name']) for c in keep if c['canada']}
    keep = [c for c in keep if c['canada'] or fold(c['name']) not in can_names]
    if not keep:
        return 'none', []
    best = keep[0]['score']
    top = [c for c in keep if c['score'] >= best - 0.25]
    # Every survivor goes forward so the reviewer can choose among all of them; the verdict is
    # about how clearly the text alone separates the leader.
    if len(top) == 1:
        t = top[0]
        ok = t['size'] == 'agree' and t['cov_t'] >= 0.6 and not t['unconfirmed'] and t['brand'] == 'agree'
        return ('single' if ok else 'weak'), keep[:10]
    sig = {(fold(c['name']), fold(c['brands'] or ''), c['size']) for c in top}
    return ('tie' if len(sig) == 1 else 'several'), keep[:10]

def main():
    rows = [r for r in json.load(open(os.path.join(S, 'walmart-rows.json'), encoding='utf-8')) if r['name']]
    only = set(sys.argv[1:])
    if only:
        rows = [r for r in rows if r['sku'] in only]
    brands = load_brands()
    print('brand dictionary', len(brands), file=sys.stderr)
    s3, s4 = [], []
    for i, r in enumerate(rows):
        title = full_title(r['name'], r['slug'])
        tb, raw = candidates(title, brands)
        tt = toks(title)
        tsz = sizes(title)
        scored = [x for x in (score(tt, tb, tsz, c) for c in raw) if x]
        scored.sort(key=lambda x: -x['score'])
        top10 = scored[:10]
        s3.append({'sku': r['sku'], 'title': title, 'brand': tb, 'price': r['price'], 'cands': top10})
        v, keep = verdict(tt, top10)
        s4.append({'sku': r['sku'], 'title': title, 'price': r['price'], 'verdict': v,
                   'pick': keep[0]['code'] if v in ('single', 'weak') else None, 'survivors': keep})
        if i % 100 == 0:
            print(i, file=sys.stderr)
    json.dump(s3, open(os.path.join(S, 'stage3.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(s4, open(os.path.join(S, 'stage4.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(collections.Counter(x['verdict'] for x in s4))
    print('printed name disagreed with link title, link used:', len(MISMATCH))
    for a, b in MISMATCH[:8]:
        print('   ', a[:50], '||', b[:50])

if __name__ == '__main__':
    main()
