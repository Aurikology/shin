"""Score stage 3 (recall@10) and stage 4 (verdicts) against an answer key.
Usage: python evaluate.py truth.json|key-truth.jsonl [--show]"""
import json, os, sys, sqlite3, collections, math
S = os.path.dirname(os.path.abspath(__file__))
DB = sqlite3.connect(r'file:C:\shin\catalogue\data\catalogue.db?mode=ro', uri=True)

def load_truth(p):
    p = os.path.join(S, p)
    if p.endswith('.jsonl'):
        rows = [json.loads(l) for l in open(p, encoding='utf-8') if l.strip()]
    else:
        rows = json.load(open(p, encoding='utf-8'))
    return {r['sku']: r['upc'] for r in rows if r.get('upc')}

def n(c): return (c or '').lstrip('0')

def wilson_upper(k, m, z=1.96):
    if m == 0: return float('nan')
    p = k / m
    return (p + z*z/(2*m) + z*math.sqrt(p*(1-p)/m + z*z/(4*m*m))) / (1 + z*z/m)

def main():
    truth = load_truth(sys.argv[1])
    show = '--show' in sys.argv
    s3 = {x['sku']: x for x in json.load(open(os.path.join(S, 'stage3.json'), encoding='utf-8'))}
    s4 = {x['sku']: x for x in json.load(open(os.path.join(S, 'stage4.json'), encoding='utf-8'))}
    keys = [k for k in truth if k in s3]
    incat = {k for k in keys if DB.execute('SELECT 1 FROM product WHERE ltrim(code,"0") = ?', (n(truth[k]),)).fetchone()}
    r10 = sum(1 for k in keys if k in incat and any(n(c['code']) == n(truth[k]) for c in s3[k]['cands']))
    print(f'key rows {len(keys)}; true barcode in catalogue {len(incat)}; not in catalogue (negative controls) {len(keys)-len(incat)}')
    print(f'stage 3 recall@10 (of in-catalogue): {r10}/{len(incat)} = {r10/max(1,len(incat)):.0%}')
    by = collections.defaultdict(lambda: [0, 0, 0])  # right, wrong, right-in-survivors
    for k in keys:
        v = s4[k]
        ok = v['pick'] and n(v['pick']) == n(truth[k])
        insurv = any(n(c['code']) == n(truth[k]) for c in v['survivors'])
        b = by[v['verdict']]
        b[0] += bool(ok); b[1] += bool(v['pick'] and not ok); b[2] += insurv
    for vname, (r, w, ins) in sorted(by.items()):
        tot = sum(1 for k in keys if s4[k]['verdict'] == vname)
        print(f'  {vname:8} {tot:4}  pick right {r}  pick wrong {w}  truth among survivors {ins}')
    neg = [k for k in keys if k not in incat]
    print(f'negative controls answered none: {sum(1 for k in neg if s4[k]["verdict"] == "none")}/{len(neg)}; '
          f'given a pick: {sum(1 for k in neg if s4[k]["pick"])}')
    acc = [k for k in keys if s4[k]['verdict'] == 'single']
    wrong = sum(1 for k in acc if n(s4[k]['pick']) != n(truth[k]))
    print(f'stage 4 alone, accept single only: {len(acc)} accepted, {wrong} wrong, upper 95% {wilson_upper(wrong, len(acc)):.1%}')
    if show:
        for k in keys:
            v = s4[k]
            ok = v['pick'] and n(v['pick']) == n(truth[k])
            if not ok:
                t = DB.execute('SELECT code,name,brands,quantity,sold_in_canada FROM product WHERE ltrim(code,"0")=?', (n(truth[k]),)).fetchone()
                print(f"\n[{v['verdict']}] {v['title'][:70]}\n   TRUE {t}\n   " + '\n   '.join(
                    f"{c['code']} {c['name'][:40]!r} {c['brands']!r} q={c['quantity']!r} b={c['brand']} s={c['size']} v={c['variant_clash']} {c['score']}"
                    for c in s3[k]['cands'][:4]))

if __name__ == '__main__':
    main()
