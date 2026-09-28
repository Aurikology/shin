"""Stage 5 input: chunked review sheets for Gemini, for the 300 answer-key products.
Candidates are lettered; Gemini never sees a barcode or the answer key."""
import json, os
S = os.path.dirname(os.path.abspath(__file__))
s4 = {x['sku']: x for x in json.load(open(os.path.join(S, 'stage4.json'), encoding='utf-8'))}
skus = [l.split()[0] for l in open(os.path.join(S, 'key-urls.txt')) if l.strip()]

HEADER = """I am checking whether store listings match products in a catalogue. For each listing below, pick the catalogue candidate that is exactly the same product: same brand, same product, same flavour or variant, same size and pack count.
Rules:
- If the listing shows a size and a candidate shows a different size, that candidate is wrong.
- A candidate with no size can still be right if everything else matches.
- If no candidate is the same product, answer NONE.
- If two or more candidates could be it and nothing in the text separates them, answer UNSURE.
- Do not search the web. Judge only from the text.
Reply with ONLY CSV lines, no header, no other text, one line per listing in the same order:
id,answer,reason
where answer is one candidate letter, NONE or UNSURE, and reason is under 12 words.

"""
LET = 'ABCDEFGHIJ'
lines, key = [], {}
for i, sku in enumerate(skus, 1):
    x = s4.get(sku)
    if not x:
        continue
    pid = f'P{i:03d}'
    price = f"${x['price']/100:.2f}" if x['price'] else 'n/a'
    cands = x['survivors']
    key[pid] = {'sku': sku, 'letters': {LET[j]: c['code'] for j, c in enumerate(cands)}}
    parts = []
    for j, c in enumerate(cands):
        size = c['quantity'] or (f"{c['size_value']} {c['size_unit']}" if c['size_value'] else 'no size')
        parts.append(f"  {LET[j]}) {c['name']} | brand: {c['brands'] or 'none'} | size: {size} | {'sold in Canada' if c['canada'] else 'not sold in Canada'}")
    body = '\n'.join(parts) if parts else '  (no candidates)'
    lines.append(f"{pid} | listing: {x['title']} | price {price}\n{body}")
CH = 50
os.makedirs(os.path.join(S, 'review'), exist_ok=True)
for n in range(0, len(lines), CH):
    open(os.path.join(S, 'review', f'chunk{n // CH + 1}.txt'), 'w', encoding='utf-8').write(HEADER + '\n\n'.join(lines[n:n + CH]))
json.dump(key, open(os.path.join(S, 'review', 'letters.json'), 'w'), indent=0)
print(len(lines), 'listings in', (len(lines) + CH - 1) // CH, 'chunks;',
      max(os.path.getsize(os.path.join(S, 'review', f)) for f in os.listdir(os.path.join(S, 'review')) if f.startswith('chunk')), 'bytes max')
