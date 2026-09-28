"""Stage 5, barcode variant: same candidates and ids as the first review, but each candidate shows
its barcode, for the held-out key products only. Two instruction sets: from memory, and with search."""
import json, os
S = os.path.dirname(os.path.abspath(__file__))
s4 = {x['sku']: x for x in json.load(open(os.path.join(S, 'stage4.json'), encoding='utf-8'))}
letters = json.load(open(os.path.join(S, 'review', 'letters.json')))
key = {json.loads(l)['sku'] for l in open(os.path.join(S, 'key-truth.jsonl'), encoding='utf-8') if l.strip()}

COMMON = """I am checking whether store listings match products in a catalogue. For each listing below, pick the catalogue candidate that is exactly the same product: same brand, same product, same flavour or variant, same size and pack count.
Each candidate shows its barcode (UPC/EAN). Several candidates often have the same name; the barcode is what tells them apart. Use what you know about each barcode: which company it belongs to and which exact product and size it is.
Rules:
- If the listing shows a size and a candidate's barcode or text is a different size, that candidate is wrong.
- If no candidate is the same product, answer NONE.
- If you cannot tell which barcode is the listed product, answer UNSURE. Do not guess.
"""
MEMORY = "- Do not search the web. Answer only from what you already know.\n"
SEARCH = "- You may search the web to look up the barcodes.\n"
TAIL = """Reply with ONLY CSV lines, no header, no other text, one line per listing in the same order:
id,answer,reason
where answer is one candidate letter, NONE or UNSURE, and reason is under 15 words.

"""
LET = 'ABCDEFGHIJ'
blocks = []
for pid, v in letters.items():
    if v['sku'] not in key:
        continue
    x = s4[v['sku']]
    price = f"${x['price']/100:.2f}" if x['price'] else 'n/a'
    parts = []
    for j, c in enumerate(x['survivors']):
        assert v['letters'][LET[j]] == c['code']
        size = c['quantity'] or (f"{c['size_value']} {c['size_unit']}" if c['size_value'] else 'no size')
        parts.append(f"  {LET[j]}) barcode {c['code']} | {c['name']} | brand: {c['brands'] or 'none'} | size: {size}")
    blocks.append(f"{pid} | listing: {x['title']} | price {price}\n" + ('\n'.join(parts) or '  (no candidates)'))
os.makedirs(os.path.join(S, 'review_bc'), exist_ok=True)
half = (len(blocks) + 1) // 2
for tag, rule in (('mem', MEMORY), ('web', SEARCH)):
    for i, part in enumerate((blocks[:half], blocks[half:]), 1):
        open(os.path.join(S, 'review_bc', f'{tag}{i}.txt'), 'w', encoding='utf-8').write(COMMON + rule + TAIL + '\n\n'.join(part))
print(len(blocks), 'listings; files:', sorted(os.listdir(os.path.join(S, 'review_bc'))))
