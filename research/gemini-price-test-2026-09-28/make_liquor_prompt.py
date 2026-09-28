import sqlite3, random, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
db = sqlite3.connect('file:C:/shin/price/data/prices.db?mode=ro', uri=True)
random.seed(20260928)

rows = []
for seller, prov in (('bcldb', 'BC'), ('anbl', 'NB')):
    got = db.execute(
        "select code, seller_name, price_cents from observation "
        "where seller=? and kind='regular' and price_cents>0 and seller_name is not null and trim(seller_name)<>''",
        (seller,)).fetchall()
    for code, name, cents in random.sample(got, 100):
        rows.append({'prov': prov, 'code': code or '', 'name': name.strip(), 'cents': cents})
random.shuffle(rows)
for i, r in enumerate(rows, 1):
    r['id'] = i

head = """You are estimating Canadian retail shelf prices. For each product below, give the regular (not sale) shelf price range, in Canadian dollars, at the provincial liquor store named: BC = BC Liquor Stores (price before tax), NB = ANBL / NB Liquor (price as listed, tax included). A barcode is given when known. If the size is not in the name, assume the size that product is most commonly sold in.

Rules:
- Answer every line, even when unsure. Never skip a product and never say you do not know; a wide range is better than no range.
- Do not search the web. Use what you already know.
- low = the lowest regular price a shopper would plausibly see, high = the highest, typical = your single best guess.

Output ONLY a CSV block, no commentary, one line per product, in this exact format:
id,low,typical,high
1,12.99,14.99,16.99

Products (id | province | barcode | name):
"""
body = "\n".join(f"{r['id']} | {r['prov']} | {r['code']} | {r['name']}" for r in rows)
with open(os.path.join(HERE, 'liquor_prompt.txt'), 'w', encoding='utf-8') as f:
    f.write(head + body + "\n")
with open(os.path.join(HERE, 'liquor_answer_key.json'), 'w', encoding='utf-8') as f:
    json.dump(rows, f)
print(len(rows), 'rows;', sum(r['prov'] == 'BC' for r in rows), 'BC')
