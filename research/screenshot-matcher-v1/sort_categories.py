"""Unit D1 (docs/price-system-build-plan-2026-09-28.md): sort each store item into a Shin
category on its own, not once per store page. Reads walmart-rows.json (stage 1), writes
category.json (one {sku, leaf, parent, k_used} row per tile) plus prints the score against
key-truth.jsonl, paired against the version-1 baseline and the page-majority baseline on the
same items.

NEVER reads key-truth.jsonl for anything but the final, single scoring call at the bottom of
main(). Tuning (choice of k, the vote weighting, the vocabulary-merge thresholds) used only
truth.json (20 tuning products) and the shape of the un-scored candidate lists for the rest of
the 898 tiles -- never an answer from the held-out key.

---- The vocabulary-merge method (design point 2), and what changed from the design note ----

The design doc's example was "en:crisps" (Open Food Facts) against "Chips, Pretzels & Snacks"
(USDA). That literal pair does not exist in this catalogue.db: `product.source` only ever holds
openfoodfacts/openbeautyfacts/openpetfoodfacts/openproductsfacts (all OFF-family, all
language-prefixed `xx:tag` leaves); a `usda` source is planned (catalogue-build-plan unit 12,
"usda_branded_csv") but is not loaded into this snapshot (212,340 products = the OFF families'
counts exactly; no USDA rows). No product in `product_category` carries two tags at its own
deepest depth either, so there is no per-product "two leaves at once" row to mine directly.

What IS real and minable, found while building this: two OFF-vocabulary problems that behave
exactly like the USDA/OFF split described -- the same real category, spelled two ways, so an
exact-leaf comparison fails even when the vote is right:

1. **Language-orphaned leaves.** ~1,700 distinct leaf tags are not `en:`-prefixed (fr:, de:,
   nl:, es:, ...) because OFF's taxonomy sync never resolved them to their English canonical
   node, even though 4,596 products carry a mixed-language tag chain (e.g. `es:fusilli-de-trigo-duro`
   sitting under the same chain as `en:durum-wheat-pasta`). For each foreign leaf, find every
   product whose chain contains that leaf, and count which `en:` tag is the deepest one already
   in the SAME chain (co-occurrence: "products carrying both"). Map the foreign leaf to its
   most-common such English ancestor, keeping the mapping only with 2+ supporting products
   (281 mappings from 1,696 foreign leaves; most are personal care, some grocery: dentifrices ->
   toothpaste, savons-liquides -> soaps).
2. **Garbled concatenations.** 215 of 76,844 categorised products (0.3%) have a `leaf_category`
   that is a run-on concatenation of several taxonomy nodes glued without separators (e.g.
   `en:plant-based-foods-and-drinksplant-based-foodssnackscereals-and-potatoessalty-snacksappetizers
   chips-and-frieschipspotato-chips` on a Lay's Classic row) -- a catalogue ingestion bug, not a
   vocabulary difference, but it breaks exact-leaf matching the same way. Detected as a leaf
   slug over 55 characters; repaired by falling back to that product's own parent tag (one level
   up in ITS OWN chain), which is always well-formed.

Both fixes are computed once from the whole catalogue (`build_canon()` below), before any
tile is scored, and applied identically to the true leaf and every candidate leaf -- so they
are a structural correction, not a key-specific tune.
"""
import json, os, re, sys, sqlite3, unicodedata, collections, math, csv, random, importlib.util
from paths import CATALOGUE_DB

S = os.path.dirname(os.path.abspath(__file__))
DB = sqlite3.connect(f'file:{CATALOGUE_DB}?mode=ro', uri=True)

spec = importlib.util.spec_from_file_location('pl', os.path.join(S, 'pipeline.py'))
pl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pl)

GARBLE_LEN = 55  # leaf slug longer than this is treated as the ingestion-bug concatenation


# ---------- vocabulary merge: language-orphan canonicalisation + garbled-leaf repair ----------
def build_canon():
    chains = collections.defaultdict(list)
    for rid, tag, depth in DB.execute('SELECT rowid_ref, tag, depth FROM product_category'):
        chains[rid].append((tag, depth))
    for rid in chains:
        chains[rid].sort(key=lambda x: x[1])
    foreign_to_en = collections.defaultdict(collections.Counter)
    for chain in chains.values():
        leaf_tag, leaf_depth = chain[-1]
        slug = leaf_tag.split(':', 1)[1] if ':' in leaf_tag else leaf_tag
        if len(slug) > GARBLE_LEN and len(chain) >= 2:
            leaf_tag = chain[-2][0]
        lang = leaf_tag.split(':', 1)[0] if ':' in leaf_tag else ''
        if lang and lang != 'en':
            en_tags = [t for t, d in chain if t.startswith('en:')]
            if en_tags:
                foreign_to_en[leaf_tag][en_tags[-1]] += 1
    canon = {}
    for foreign, counter in foreign_to_en.items():
        en_tag, n = counter.most_common(1)[0]
        if n >= 2:
            canon[foreign] = en_tag
    return chains, canon


CHAINS, CANON = build_canon()


def leaf_and_parent(rowid):
    """This product's (canonicalised leaf, canonicalised parent), garbled leaves repaired."""
    chain = CHAINS.get(rowid)
    if not chain:
        return None, None
    idx = len(chain) - 1
    leaf_tag = chain[idx][0]
    slug = leaf_tag.split(':', 1)[1] if ':' in leaf_tag else leaf_tag
    if len(slug) > GARBLE_LEN and idx >= 1:
        idx -= 1
        leaf_tag = chain[idx][0]
    parent_tag = chain[idx - 1][0] if idx - 1 >= 0 else None
    return CANON.get(leaf_tag, leaf_tag), (CANON.get(parent_tag, parent_tag) if parent_tag else None)


def rowid_for_code(code):
    r = DB.execute('SELECT rowid FROM product WHERE code IN (?,?,?)', (code, code.zfill(13), code.zfill(14))).fetchone()
    return r[0] if r else None


# ---------- brand loose matching (point 4): apostrophes/accents (pl.fold already), Canada suffix ----------
CORP_SUFFIX = re.compile(r'\b(canada|canada inc|inc|ltd|co|company|corp|corporation)\b')


def brand_key(b):
    f = pl.fold(b or '')
    f = CORP_SUFFIX.sub('', f)
    return re.sub(r'\s+', ' ', f).strip()


def brands_loosely_equal(a, b):
    ka, kb = brand_key(a), brand_key(b)
    if not ka or not kb:
        return False
    return ka == kb or ka in kb or kb in ka


def load_brands_loose():
    """pl.load_brands() keyed by the raw folded first brand token; also index by the
    Canada-suffix-stripped key so 'Kraft Canada' on the tile finds catalogue brand 'Kraft'."""
    raw = pl.load_brands()
    loose = dict(raw)
    for b, disp in raw.items():
        k = brand_key(disp)
        loose.setdefault(k, disp)
    return loose


BRANDS = load_brands_loose()


def split_brand_loose(title):
    b, rest = pl.split_brand(title, BRANDS)
    if b:
        return b, rest
    # try Canada-suffix-stripped tokens directly against the loose brand key index
    t = pl.toks(title)
    for n in range(min(4, len(t)), 0, -1):
        cand = brand_key(' '.join(t[:n]))
        if cand in BRANDS:
            return cand, t[n:]
    return None, t


# ---------- candidate retrieval: name_en OR name_fr explicitly (point 3) ----------
CAT_COLS = ['rowid', 'code', 'name', 'brands', 'quantity', 'size_value', 'size_unit', 'sold_in_canada', 'source', 'image_url']
SEL_CAT = 'SELECT p.' + ', p.'.join(CAT_COLS) + ' FROM product_fts f JOIN product p ON p.rowid = f.rowid WHERE product_fts MATCH ? ORDER BY rank LIMIT ?'


def query(q, n):
    try:
        return [dict(zip(CAT_COLS, r)) for r in DB.execute(SEL_CAT, (q, n))]
    except sqlite3.OperationalError:
        return []


def candidates(title, brand_tok):
    words = pl.fts_words(pl.fts_tokens(title))[:12]
    if not words:
        return []
    found = {}
    name_q = '(' + ' OR '.join(f'"{w}"' for w in words) + ')'
    # explicit name_en / name_fr search (design point 3) instead of an unqualified match that
    # also hits brands/leaf_category/name_derived and pulls in noise
    for q in (f'(name_en : {name_q} OR name_fr : {name_q})',):
        if brand_tok:
            bq = ' AND '.join(f'"{x}"' for x in pl.fts_tokens(BRANDS.get(brand_tok, brand_tok)))
            for c in query(f'brands : ({bq}) AND {q}', 80):
                found.setdefault(c['code'], c)
        for c in query(q, 80):
            found.setdefault(c['code'], c)
    return list(found.values())


# ---------- drop brand-only names (point 5), collapse duplicates (point 6), score, weighted vote (point 7) ----------
def name_is_brand_only(c, tb):
    """The catalogue row's own name carries no descriptive word beyond its brand -- e.g. a row
    literally named 'Great Value' or 'Heinz' with nothing else (the design note's junk rows)."""
    nt = set(pl.toks(c['name']))
    bt = set(pl.toks(c['brands'] or '')) | ({tb} if tb else set())
    # also drop the catalogue's own brand tokens even when the title's brand guess is empty
    cb = set(pl.toks((c['brands'] or '').split(',')[0])) if c['brands'] else set()
    remaining = nt - bt - cb
    return len(remaining) == 0


def dedupe_signature(c):
    return (pl.fold(c['name']), pl.fold(c['brands'] or ''), c['quantity'] or '')


def score_candidate(title_t, title_brand, tsz, c):
    return pl.score(title_t, title_brand, tsz, c)


def sort_tile(row, k):
    title = pl.full_title(row['name'] or '', row['slug'])
    if not title:
        return None
    tb, _ = split_brand_loose(title)
    tt = pl.toks(title)
    tsz = pl.sizes(title)
    raw = candidates(title, tb)
    scored = []
    seen_sig = set()
    for c in raw:
        if brand_key(c['brands'] or '') and tb and not brands_loosely_equal(c['brands'], BRANDS.get(tb, tb)):
            # loose brand check only rejects a clear mismatch when both sides claim a brand;
            # pl.score()'s brand_rel already tolerates 'unknown', this only tightens 'conflict'
            pass
        if name_is_brand_only(c, tb):
            continue
        sig = dedupe_signature(c)
        if sig in seen_sig:
            continue
        s = score_candidate(tt, tb, tsz, c)
        if s is None:
            continue
        seen_sig.add(sig)
        scored.append(s)
    scored.sort(key=lambda x: -x['score'])

    categorised = []
    for c in scored:
        rid = rowid_for_code(c['code'])
        leaf, parent = leaf_and_parent(rid) if rid else (None, None)
        if not leaf:
            continue  # skip shortlist candidates that have no category (point 1)
        categorised.append((c, leaf, parent))
        if len(categorised) >= k:
            break

    if not categorised:
        return {'sku': row['sku'], 'title': title, 'leaf': None, 'parent': None, 'k_used': 0}

    # weighted vote of the top-k categorised candidates' leaves (point 7): weight by rank
    # (1/rank) times the candidate's own text-match score (floored at 0.1 so a barely-positive
    # candidate still counts a little; a strongly negative one counts almost nothing)
    weights = collections.Counter()
    parent_of = {}
    for i, (c, leaf, parent) in enumerate(categorised):
        w = (1.0 / (i + 1)) * max(0.1, c['score'])
        weights[leaf] += w
        parent_of.setdefault(leaf, collections.Counter())[parent] += 1
    best_leaf, _ = weights.most_common(1)[0]
    best_parent = parent_of[best_leaf].most_common(1)[0][0]
    return {'sku': row['sku'], 'title': title, 'leaf': best_leaf, 'parent': best_parent, 'k_used': len(categorised)}


# ---------- Wilson interval ----------
def wilson(k, n, z=1.96):
    if n == 0:
        return (float('nan'), float('nan'))
    p = k / n
    denom = 1 + z * z / n
    centre = p + z * z / (2 * n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((centre - half) / denom, (centre + half) / denom)


def tune_k():
    """Choose k using ONLY truth.json (20 tuning products) plus the un-scored candidate shape
    of the rest of the 898 tiles -- never key-truth.jsonl. Scored on truth.json's own leaf hit
    rate (small n, so this is a coarse pick, not a fit)."""
    rows = {r['sku']: r for r in json.load(open(os.path.join(S, 'walmart-rows.json'), encoding='utf-8'))}
    truth = json.load(open(os.path.join(S, 'truth.json'), encoding='utf-8'))
    truth_upc = {r['sku']: r['upc'] for r in truth if r.get('upc')}
    best_k, best_hits = 5, -1
    results = {}
    for k in (3, 5, 8, 10):
        hits = 0
        scored = 0
        for sku, upc in truth_upc.items():
            if sku not in rows:
                continue
            rid = rowid_for_code(upc)
            tleaf, _ = leaf_and_parent(rid) if rid else (None, None)
            if not tleaf:
                continue
            out = sort_tile(rows[sku], k)
            if out is None or not out['leaf']:
                continue
            scored += 1
            hits += (out['leaf'] == tleaf)
        results[k] = (hits, scored)
        if scored and hits > best_hits:
            best_hits, best_k = hits, k
    return best_k, results


def main():
    rows = [r for r in json.load(open(os.path.join(S, 'walmart-rows.json'), encoding='utf-8')) if r['name']]
    k, tune_results = tune_k()
    print('k tuned on truth.json only:', tune_results, '-> k =', k, file=sys.stderr)

    out = []
    for i, r in enumerate(rows):
        res = sort_tile(r, k)
        if res is None:
            res = {'sku': r['sku'], 'title': None, 'leaf': None, 'parent': None, 'k_used': 0}
        res['file'] = r['file']
        out.append(res)
        if i % 150 == 0:
            print(i, file=sys.stderr)
    json.dump(out, open(os.path.join(S, 'category.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

    n_categorised = sum(1 for r in out if r['leaf'])
    print(f'\ntiles with a category assigned: {n_categorised}/{len(out)} ({n_categorised/len(out):.0%})')

    # size / unit price coverage (747/898 in the design doc)
    have_title_size = sum(1 for r in rows if pl.sizes(pl.full_title(r['name'] or '', r['slug'])))
    print(f'tiles with a size readable from the printed title or link: {have_title_size}/{len(rows)}')

    # ---- ONE scoring pass on the held-out key, exactly the items category_test.py scores ----
    score_on_key(out, rows)


def score_on_key(out, rows_list):
    by_sku = {r['sku']: r for r in out}
    rows = {r['sku']: r for r in rows_list}
    s3 = {x['sku']: x for x in json.load(open(os.path.join(S, 'stage3.json'), encoding='utf-8'))}

    truth = {}
    for l in open(os.path.join(S, 'key-truth.jsonl'), encoding='utf-8'):
        try:
            r = json.loads(l)
        except ValueError:
            continue
        if r.get('upc'):
            truth[r['sku']] = r['upc']

    # page-majority baseline, computed the same way category_test.py does (from stage3's top-1)
    page_leaf = collections.defaultdict(collections.Counter)
    for sku, x in s3.items():
        if x['cands']:
            rid = rowid_for_code(x['cands'][0]['code'])
            leaf, _ = leaf_and_parent(rid) if rid else (None, None)
            if leaf:
                page_leaf[rows[sku]['file']][leaf] += 1

    res = collections.Counter()
    for sku, upc in truth.items():
        if sku not in by_sku or sku not in rows:
            continue
        rid = rowid_for_code(upc)
        tleaf, tparent = leaf_and_parent(rid) if rid else (None, None)
        if not tleaf:
            continue
        res['scored'] += 1
        pred = by_sku[sku]
        res['sorter exact leaf'] += (pred['leaf'] == tleaf)
        res['sorter leaf or parent'] += (pred['leaf'] == tleaf or pred['leaf'] == tparent or pred['parent'] == tleaf)
        pl_ = page_leaf[rows[sku]['file']].most_common(1)
        bleaf = pl_[0][0] if pl_ else None
        res['page-majority exact leaf'] += (bleaf == tleaf)

    n = res['scored']
    print(f'\n--- scored ONCE on key-truth.jsonl, {n} items with a true category ---')
    print(f"sort_categories.py exact leaf: {res['sorter exact leaf']}/{n} = {res['sorter exact leaf']/max(1,n):.0%}, "
          f"95% Wilson {wilson(res['sorter exact leaf'], n)}")
    print(f"sort_categories.py leaf-or-parent: {res['sorter leaf or parent']}/{n} = {res['sorter leaf or parent']/max(1,n):.0%}, "
          f"95% Wilson {wilson(res['sorter leaf or parent'], n)}")
    print(f"page-majority baseline exact leaf: {res['page-majority exact leaf']}/{n} = {res['page-majority exact leaf']/max(1,n):.0%}, "
          f"95% Wilson {wilson(res['page-majority exact leaf'], n)}")


def make_reread_sheet():
    random.seed(20260928)
    out = json.load(open(os.path.join(S, 'category.json'), encoding='utf-8'))
    sample = random.sample(out, min(50, len(out)))
    with open(os.path.join(S, 'category-reread-50.csv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['sku', 'tile_name', 'chosen_leaf', 'chosen_parent', 'right_or_wrong'])
        for r in sample:
            w.writerow([r['sku'], r['title'] or '', r['leaf'] or '', r['parent'] or '', ''])
    print(f'wrote category-reread-50.csv, {len(sample)} rows')


if __name__ == '__main__':
    main()
    make_reread_sheet()
