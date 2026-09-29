"""Final scoring of the matcher test on the held-out answer key (key-truth.jsonl).
Stages 3 and 4 from stage3.json/stage4.json, stage 5 from review/answer*.txt, stage 6 accept rule."""
import json, os, re, glob, sqlite3, math, collections
from paths import CATALOGUE_DB
S = os.path.dirname(os.path.abspath(__file__))
DB = sqlite3.connect(f"file:{CATALOGUE_DB}?mode=ro", uri=True)
def n(c): return (c or '').lstrip('0')
def wilson(k, m, z=1.96):
    if m == 0: return float('nan'), float('nan')
    p = k / m; d = 1 + z*z/m; c = p + z*z/(2*m); h = z*math.sqrt(p*(1-p)/m + z*z/(4*m*m))
    return (c - h) / d, (c + h) / d

truth = {}
for l in open(os.path.join(S, 'key-truth.jsonl'), encoding='utf-8'):
    if l.strip():
        r = json.loads(l)
        if r.get('upc') and r.get('status', 'ok') == 'ok':
            truth[r['sku']] = r['upc']
s3 = {x['sku']: x for x in json.load(open(os.path.join(S, 'stage3.json'), encoding='utf-8'))}
s4 = {x['sku']: x for x in json.load(open(os.path.join(S, 'stage4.json'), encoding='utf-8'))}
letters = json.load(open(os.path.join(S, 'review', 'letters.json')))
by_sku = {v['sku']: (pid, v['letters']) for pid, v in letters.items()}

gem = {}
for f in sorted(glob.glob(os.path.join(S, 'review', 'answer*.txt'))):
    for line in open(f, encoding='utf-8-sig', errors='replace'):
        m = re.match(r'\s*`*\s*(P\d{3})\s*,\s*([A-J]|NONE|UNSURE)\b\s*,?\s*(.*)', line.strip(), re.I)
        if m:
            gem.setdefault(m.group(1).upper(), (m.group(2).upper(), m.group(3)))

keys = [k for k in truth if k in s4]
incat = {k for k in keys if DB.execute('SELECT 1 FROM product WHERE code IN (?,?,?)', (truth[k], truth[k].zfill(13), truth[k].zfill(14))).fetchone()}
print(f'held-out key rows scored: {len(keys)} (in catalogue {len(incat)}, not in catalogue {len(keys)-len(incat)})')
r10 = sum(1 for k in incat if any(n(c['code']) == n(truth[k]) for c in s3[k]['cands']))
rs = sum(1 for k in incat if any(n(c['code']) == n(truth[k]) for c in s4[k]['survivors']))
print(f'stage 3: right product in top 10: {r10}/{len(incat)} = {r10/max(1,len(incat)):.0%}')
print(f'stage 4: right product still among survivors after rule rejects: {rs}/{len(incat)}')
vc = collections.Counter(s4[k]['verdict'] for k in keys)
print('stage 4 verdicts:', dict(vc))
sing = [k for k in keys if s4[k]['verdict'] == 'single']
sw = sum(1 for k in sing if n(s4[k]['pick']) != n(truth[k]))
print(f'stage 4 alone (accept "single"): {len(sing)} accepted, {sw} wrong, 95% range of wrong rate {wilson(sw, len(sing))[0]:.1%} to {wilson(sw, len(sing))[1]:.1%}')

have = [k for k in keys if k in by_sku and by_sku[k][0] in gem]
print(f'\nstage 5: Gemini answered {len(have)} of {len(keys)} key rows')
gc = collections.Counter()
for k in have:
    pid, lt = by_sku[k]
    a, _ = gem[pid]
    if a in ('NONE', 'UNSURE'):
        gc[a + (' (truth was in list)' if any(n(c) == n(truth[k]) for c in lt.values()) else ' (truth not in list)')] += 1
    else:
        gc['letter right' if n(lt.get(a)) == n(truth[k]) else 'letter wrong'] += 1
for k2, v in sorted(gc.items()): print(f'   {k2}: {v}')

def accept(k):
    """Stage 6 rule from the design: single + Gemini agrees; or any other verdict + Gemini picks a letter."""
    pid, lt = by_sku.get(k, (None, {}))
    a = gem.get(pid, (None, ''))[0] if pid else None
    if not a or a in ('NONE', 'UNSURE'):
        return None
    code = lt.get(a)
    v = s4[k]
    if v['verdict'] == 'single':
        return code if n(code) == n(v['pick']) else None
    return code
acc = [(k, accept(k)) for k in have]
acc = [(k, c) for k, c in acc if c]
aw = [k for k, c in acc if n(c) != n(truth[k])]
lo, hi = wilson(len(aw), len(acc))
print(f'\nstage 6 (design rule): accepted {len(acc)} of {len(have)} ({len(acc)/max(1,len(have)):.0%} coverage), wrong {len(aw)}, 95% range of wrong rate {lo:.1%} to {hi:.1%}')
print(f'   bar: upper end at most 2% -> {"MET" if hi <= 0.02 else "NOT MET"}')
neg = [k for k in have if k not in incat]
print(f'   negative controls (true product not in catalogue): {len(neg)}, given a price anyway: {sum(1 for k in neg if accept(k))}')
for k in aw[:15]:
    pid, lt = by_sku[k]
    t = DB.execute('SELECT name,brands,quantity FROM product WHERE code IN (?,?,?)', (truth[k], truth[k].zfill(13), truth[k].zfill(14))).fetchone()
    p = DB.execute('SELECT name,brands,quantity FROM product WHERE code = ?', (accept(k),)).fetchone()
    print(f'   WRONG {s4[k]["title"][:60]!r}\n      picked {p}\n      true   {t}\n      gemini: {gem[pid][1][:80]}')
