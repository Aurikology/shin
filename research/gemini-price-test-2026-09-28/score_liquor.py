import json, csv, os, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
key = {r['id']: r for r in json.load(open(os.path.join(HERE, 'liquor_answer_key.json'), encoding='utf-8'))}
JUNK = {51, 170}
ans = {int(r['id']): r for r in csv.DictReader(open(os.path.join(HERE, (__import__('sys').argv[1] if len(__import__('sys').argv)>1 else 'gemini_run2.csv'))))}

scorable = [i for i in key if i not in JUNK]
answered = [i for i in scorable if i in ans]
print(f'scorable {len(scorable)}, answered {len(answered)}, skipped {len(scorable) - len(answered)}')

def report(label, ids):
    if not ids:
        return
    inside, within20, ratios, widths = 0, 0, [], []
    for i in ids:
        real = key[i]['cents'] / 100
        lo, ty, hi = (float(ans[i][k]) for k in ('low', 'typical', 'high'))
        inside += lo <= real <= hi
        within20 += abs(ty - real) / real <= 0.20
        ratios.append(ty / real)
        widths.append((hi - lo) / ty)
    n = len(ids)
    print(f'{label}: n={n}  real price inside range {inside} ({inside/n:.0%})  '
          f'typical within 20% {within20} ({within20/n:.0%})  '
          f'median typical/real {st.median(ratios):.2f}  '
          f'worst low {min(ratios):.2f} worst high {max(ratios):.2f}  '
          f'median range width {st.median(widths):.0%} of typical')

report('ALL', answered)
report('BC (no size in name)', [i for i in answered if key[i]['prov'] == 'BC'])
report('NB (size in name)', [i for i in answered if key[i]['prov'] == 'NB'])
report('under $30 real', [i for i in answered if key[i]['cents'] < 3000])
report('$30-$100 real', [i for i in answered if 3000 <= key[i]['cents'] < 10000])
report('$100+ real', [i for i in answered if key[i]['cents'] >= 10000])

print('\nworst 8 misses (typical/real):')
worst = sorted(answered, key=lambda i: abs(__import__('math').log(float(ans[i]['typical']) / (key[i]['cents'] / 100))), reverse=True)[:8]
for i in worst:
    print(f"  {i} {key[i]['prov']} {key[i]['name'][:55]:55} real {key[i]['cents']/100:>9.2f}  gemini {ans[i]['low']}-{ans[i]['high']}")
skipped = [i for i in scorable if i not in ans]
print('\nskipped ids:', skipped)
