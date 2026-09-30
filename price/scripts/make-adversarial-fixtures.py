"""Adversarial printout PDFs from the third audit of the printout reader (2026-09-28).

Writes <out>/<case>.pdf and <out>/expect.json ({case: {note, expect: {product id: true price in
cents, or null / a word when no single true shelf price exists}}}). Copied from the auditor's
harness so the cases stand as a test (price/test/capture-printout.test.ts, "ADVERSARIAL"): no
case may store price_verified = 1 with a wrong price, and no product link may vanish.

Windows fonts (Arial, Times) are used where the case needs a glyph Helvetica lacks (en dash,
no-break and thin spaces, other scripts' digits); where those font files are missing the case
falls back to Helvetica, which can change what the text layer holds for those few cases.

Usage: python make-adversarial-fixtures.py <out dir>
"""
import json, os, sys
import pymupdf

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
BASE = 'https://www.walmart.ca/en/ip/'
W, H = 612, 792
COLS = [20, 217, 414]
ROWS = [40, 290, 540]
TW, TH = 190, 240
ARIAL = r'C:\Windows\Fonts\arial.ttf'
TIMES = r'C:\Windows\Fonts\times.ttf'
expect = {}
notes = {}


def put(p, x, y, s, size=9, font='helv', rotate=0, render=0):
    if font == 'arial' and not os.path.exists(ARIAL):
        font = 'helv'
    if font == 'times' and not os.path.exists(TIMES):
        font = 'helv'
    if font == 'arial':
        p.insert_text((x, y), s, fontsize=size, fontname='ar', fontfile=ARIAL, rotate=rotate, render_mode=render)
    elif font == 'times':
        p.insert_text((x, y), s, fontsize=size, fontname='tm', fontfile=TIMES, rotate=rotate, render_mode=render)
    else:
        p.insert_text((x, y), s, fontsize=size, fontname='helv', rotate=rotate, render_mode=render)


def link(p, rect, slug, pid, uri=None):
    p.insert_link({'kind': pymupdf.LINK_URI, 'from': pymupdf.Rect(*rect), 'uri': uri or (BASE + slug + '/' + pid)})


def tile(p, col, row, slug, pid, lines, rect=None, links=None, uri=None):
    """lines: (dy, text) or (dy, text, {size, dx, font, rotate, render})."""
    x, y = COLS[col], ROWS[row]
    for ln in lines:
        dy, s = ln[0], ln[1]
        o = ln[2] if len(ln) > 2 else {}
        put(p, x + 8 + o.get('dx', 0), y + dy, s, o.get('size', 9), o.get('font', 'helv'), o.get('rotate', 0), o.get('render', 0))
    for r in links or [rect or (x, y, x + TW, y + TH)]:
        link(p, r, slug, pid, uri)


cases = {}


def case(name, note):
    def deco(fn):
        cases[name] = (fn, note)
        return fn
    return deco


def pid(n):
    return '60009%08d' % n

# ---- overlap family ----------------------------------------------------------
@case('c01_neigh_rect_short', 'A out of stock, A rect reaches down over B price; B link covers only B title, not its price')
def _(p):
    tile(p, 0, 0, 'Alpha-Soap-Bar', pid(1), [(130, 'Out of stock'), (165, 'Alpha Soap Bar')],
         rect=(20, 40, 210, 360))
    # B tile: price at dy 40 (y=330) inside A's rect; B's link only its title area (y 420..470)
    tile(p, 0, 1, 'Beta-Shampoo', pid(2), [(40, '6$ 47'), (165, 'Beta Shampoo')], rect=(20, 440, 210, 470))
    return {pid(1): None, pid(2): 647}

@case('c02_unlinked_tile', 'text-only tile (no link) whose price sits inside A (out of stock) rect')
def _(p):
    tile(p, 0, 0, 'Alpha-Candle', pid(3), [(130, 'Out of stock'), (165, 'Alpha Candle')], rect=(20, 40, 210, 340))
    put(p, 28, 325, '9$ 97')          # sponsored tile, no link
    put(p, 28, 360, 'Sponsored Gamma Lamp')
    return {pid(3): None}

@case('c03_overlap_right', 'A rect extends 70pt right into B; B price left-aligned near B left edge; both priced')
def _(p):
    tile(p, 0, 0, 'Left-Thing', pid(4), [(130, '2$ 97'), (165, 'Left Thing')], rect=(20, 40, 287, 280))
    tile(p, 1, 0, 'Right-Thing', pid(5), [(130, '8$ 47', {'dx': 0}), (165, 'Right Thing')])
    return {pid(4): 297, pid(5): 847}

@case('c04_overlap_left', 'B rect extends 70pt left into A; A price right-aligned')
def _(p):
    tile(p, 0, 0, 'Left-Two', pid(6), [(130, '3$ 17', {'dx': 150}), (165, 'Left Two')])
    tile(p, 1, 0, 'Right-Two', pid(7), [(130, '4$ 27'), (165, 'Right Two')], rect=(147, 40, 407, 280))
    return {pid(6): 317, pid(7): 427}

@case('c05_overlap_up_centre', 'B rect extends up 100pt into A; A price centred at bottom; A out-of-stock variant not')
def _(p):
    tile(p, 0, 0, 'Top-One', pid(8), [(60, 'Top One'), (225, '5$ 55', {'dx': 70})])
    tile(p, 0, 1, 'Bottom-One', pid(9), [(130, '1$ 11'), (165, 'Bottom One')], rect=(20, 190, 210, 530))
    return {pid(8): 555, pid(9): 111}

@case('c06_overlap_diag', 'A rect extends right AND down into B (diagonal); B out of stock; C below-right priced')
def _(p):
    tile(p, 0, 0, 'Diag-A', pid(10), [(130, '7$ 77'), (165, 'Diag A')], rect=(20, 40, 300, 380))
    tile(p, 1, 1, 'Diag-B', pid(11), [(10, '6$ 66', {'dx': 0}), (165, 'Diag B')])
    return {pid(10): 777, pid(11): 666}

@case('c07_overlap_same_edges', 'A and B share x edges and bottom; A starts 100 above B. B price at B centre')
def _(p):
    tile(p, 0, 0, 'Same-A', pid(12), [(60, 'Same A'), (80, '2$ 22')], rect=(20, 40, 210, 530))
    tile(p, 0, 1, 'Same-B', pid(13), [(130, '3$ 33'), (165, 'Same B')])
    return {pid(12): 222, pid(13): 333}

# ---- superscripts ------------------------------------------------------------
@case('c08_sup_borderline_raised', '"$5" 14pt + "98" 11.8pt (ratio .843) same baseline')
def _(p):
    x, y = COLS[0] + 8, ROWS[0] + 130
    put(p, x, y, '$5', 14); put(p, x + 16.5, y, '98', 11.8)
    put(p, x, y + 35, 'Sup Borderline'); link(p, (20, 40, 210, 280), 'Sup-Borderline', pid(14))
    return {pid(14): 598}

@case('c09_sup_nooverlap_unit', '"$5" 14pt + "98" 7pt raised above (no y overlap) + "$0.50/sheet" below in tile')
def _(p):
    x, y = COLS[0] + 8, ROWS[0] + 130
    put(p, x, y, '$5', 14); put(p, x + 16.5, y - 11, '98', 7)
    put(p, x, y + 18, '$0.50/sheet'); put(p, x, y + 35, 'Paper Towel')
    link(p, (20, 40, 210, 280), 'Paper-Towel', pid(15))
    return {pid(15): 598}

@case('c10_sup_nooverlap_was', '"$5" + "98" raised no overlap, same line "Was $6.47"')
def _(p):
    x, y = COLS[0] + 8, ROWS[0] + 130
    put(p, x, y, '$5', 14); put(p, x + 16.5, y - 11, '98', 7); put(p, x + 40, y, 'Was $6.47', 9)
    put(p, x, y + 35, 'Dish Soap'); link(p, (20, 40, 210, 280), 'Dish-Soap', pid(16))
    return {pid(16): 598}

@case('c11_sup_gap', '"$5" and "98" superscript, gap 12pt (beyond 0.6h), was price beside')
def _(p):
    x, y = COLS[0] + 8, ROWS[0] + 130
    put(p, x, y, '$5', 14); put(p, x + 28, y - 4, '98', 8); put(p, x, y + 15, 'Was $6.47')
    put(p, x, y + 35, 'Hand Soap'); link(p, (20, 40, 210, 280), 'Hand-Soap', pid(17))
    return {pid(17): 598}

# ---- split lines ------------------------------------------------------------
@case('c12_split_dot', '"$5." line, "98" next line')
def _(p):
    tile(p, 0, 0, 'Split-Dot', pid(18), [(130, '$5.'), (142, '98'), (165, 'Split Dot')])
    return {pid(18): 598}

@case('c13_split_bare_unit', '"$5" line, ".98" next line, "$1.20/100g" in tile')
def _(p):
    tile(p, 0, 0, 'Split-Bare', pid(19), [(130, '$5'), (142, '.98'), (155, '$1.20/100g'), (165, 'Split Bare')])
    return {pid(19): 598}

@case('c14_multi_split', '"2 for" line, "$5.00" next line')
def _(p):
    tile(p, 0, 0, 'Multi-Split', pid(20), [(118, '2 for'), (130, '$5.00'), (165, 'Multi Split')])
    return {pid(20): 250}

@case('c15_unit_split_oos', 'out of stock; "$1.20" line then "/100g" next line')
def _(p):
    tile(p, 0, 0, 'Unit-Split', pid(21), [(120, 'Out of stock'), (130, '$1.20'), (142, '/100g'), (165, 'Unit Split')])
    return {pid(21): None}

# ---- words -------------------------------------------------------------------
@case('c16_now_reg_save', '"Now $3.97" "Reg $5.97" "Save $2.00"')
def _(p):
    tile(p, 0, 0, 'Now-Reg', pid(22), [(120, 'Now $3.97'), (132, 'Reg $5.97'), (144, 'Save $2.00'), (165, 'Now Reg')])
    return {pid(22): 397}

@case('c17_save_first', '"Save $2.00" above "3$ 97"')
def _(p):
    tile(p, 0, 0, 'Save-First', pid(23), [(110, 'Save $2.00'), (130, '3$ 97'), (165, 'Save First')])
    return {pid(23): 397}

@case('c18_from', '"From $3.97" (variants)')
def _(p):
    tile(p, 0, 0, 'From-Tee', pid(24), [(130, 'From $3.97'), (165, 'From Tee')])
    return {pid(24): 'FROM'}

@case('c19_starting', '"Starting at $3.97"')
def _(p):
    tile(p, 0, 0, 'Starting-Tee', pid(25), [(130, 'Starting at $3.97'), (165, 'Starting Tee')])
    return {pid(25): 'FROM'}

@case('c20_range_full', '"$3.97 - $5.97"')
def _(p):
    tile(p, 0, 0, 'Range-Full', pid(26), [(130, '$3.97 - $5.97'), (165, 'Range Full')])
    return {pid(26): 'RANGE'}

@case('c21_range_half', '"$3.97 - 5.97"')
def _(p):
    tile(p, 0, 0, 'Range-Half', pid(27), [(130, '$3.97 - 5.97'), (165, 'Range Half')])
    return {pid(27): 'RANGE'}

@case('c22_range_endash', '"$3.97–5.97" (en dash, arial)')
def _(p):
    tile(p, 0, 0, 'Range-Dash', pid(28), [(130, '$3.97\u20135.97', {'font': 'arial'}), (165, 'Range Dash')])
    return {pid(28): 'RANGE'}

@case('c23_range_super', '"3$ 97 - 5$ 97" superscript spelling')
def _(p):
    tile(p, 0, 0, 'Range-Sup', pid(29), [(130, '3$ 97 - 5$ 97'), (165, 'Range Sup')])
    return {pid(29): 'RANGE'}

@case('c24_each', '"$1.97 each", "$1.97 ea." on 2 products; "$1.97/ea" only on a third')
def _(p):
    tile(p, 0, 0, 'Each-One', pid(30), [(130, '$1.97 each'), (165, 'Each One')])
    tile(p, 1, 0, 'Each-Two', pid(31), [(130, '$1.97 ea.'), (165, 'Each Two')])
    tile(p, 2, 0, 'Each-Three', pid(32), [(130, '$1.97/ea'), (165, 'Each Three')])
    return {pid(30): 197, pid(31): 197, pid(32): None}

@case('c25_multi_limit', '"2/$5 limit 4"')
def _(p):
    tile(p, 0, 0, 'Multi-Limit', pid(33), [(130, '2/$5 limit 4'), (165, 'Multi Limit')])
    return {pid(33): 250}

@case('c26_name_price', 'printed name "Dollar Store $1 Candy" above price "2$ 97"; second tile oos with unit')
def _(p):
    tile(p, 0, 0, 'Dollar-Store-1-Candy', pid(34), [(100, 'Dollar Store $1 Candy'), (130, '2$ 97')])
    tile(p, 1, 0, 'Dollar-Store-Candy-Bag', pid(35), [(120, 'Out of stock'), (140, 'Dollar Store $1 Candy'), (152, '$0.50/sheet')])
    return {pid(34): 297, pid(35): None}

@case('c27_name_price_dec', 'oos tile whose printed name carries "$1.00" ("Gift Card $1.00 Bonus")')
def _(p):
    tile(p, 0, 0, 'Gift-Card-Bonus', pid(36), [(120, 'Out of stock'), (140, 'Gift Card $1.00 Bonus')])
    return {pid(36): None}

@case('c28_percent', '"25% off" badge, "Save 25%" and price')
def _(p):
    tile(p, 0, 0, 'Percent-Off', pid(37), [(20, '25% off'), (120, 'Save 25%'), (130, '4$ 47'), (165, 'Percent Off')])
    return {pid(37): 447}

@case('c29_other_font_beside', '"$5.98" in Times just outside the tile, tile has "3$ 97"; second tile oos with Times price 1pt inside its edge')
def _(p):
    tile(p, 0, 0, 'Font-One', pid(38), [(130, '3$ 97'), (165, 'Font One')])
    put(p, 212, 170, '$5.98', 12, 'times')
    tile(p, 1, 1, 'Font-Two', pid(39), [(120, 'Out of stock'), (165, 'Font Two')])
    put(p, 217 + 191 - 30, 290 + 200, '$5.98', 12, 'times')
    return {pid(38): 397, pid(39): None}

@case('c30_rotated', 'oos tile with rotated "$9.99" (90deg), second tile priced + rotated "$1.00"')
def _(p):
    tile(p, 0, 0, 'Rot-One', pid(40), [(120, 'Out of stock'), (165, 'Rot One'), (230, '$9.99', {'rotate': 90, 'dx': 160})])
    tile(p, 1, 0, 'Rot-Two', pid(41), [(130, '4$ 97'), (165, 'Rot Two'), (230, '$1.00', {'rotate': 90, 'dx': 160})])
    return {pid(40): None, pid(41): 497}

@case('c31_nolink_text', 'tile with text and no link, next to a normal tile')
def _(p):
    tile(p, 0, 0, 'Normal-Tile', pid(42), [(130, '3$ 97'), (165, 'Normal Tile')])
    put(p, 225, 170, '5$ 98'); put(p, 225, 205, 'Orphan Tile')
    return {pid(42): 397}

@case('c32_two_links_same', 'one product two links on one page, prices 3$ 97 and 4$ 97')
def _(p):
    tile(p, 0, 0, 'Twin-Link', pid(43), [(130, '3$ 97'), (165, 'Twin Link')])
    tile(p, 1, 0, 'Twin-Link', pid(43), [(130, '4$ 97'), (165, 'Twin Link')])
    return {pid(43): 'CONFLICT'}

@case('c33_usd', 'US$5.98 / USD 5.98 / $5.98 USD / CA$5.98')
def _(p):
    tile(p, 0, 0, 'Usd-One', pid(44), [(130, 'US$5.98'), (165, 'Usd One')])
    tile(p, 1, 0, 'Usd-Two', pid(45), [(130, 'USD 5.98'), (165, 'Usd Two')])
    tile(p, 2, 0, 'Usd-Three', pid(46), [(130, '$5.98 USD'), (165, 'Usd Three')])
    tile(p, 0, 1, 'Cad-Four', pid(47), [(130, 'CA$5.98'), (165, 'Cad Four')])
    return {pid(44): 'USD', pid(45): None, pid(46): 'USD', pid(47): 598}

@case('c34_nbsp_thousands', '"1\u00a0299$ 00", "1 299$ 00", "$1 299.00", "$1\u2009299.00"')
def _(p):
    tile(p, 0, 0, 'Tv-Nbsp', pid(48), [(130, '1\u00a0299$ 00', {'font': 'arial'}), (165, 'Tv Nbsp')])
    tile(p, 1, 0, 'Tv-Space', pid(49), [(130, '1 299$ 00'), (165, 'Tv Space')])
    tile(p, 2, 0, 'Tv-Dollar-Space', pid(50), [(130, '$1 299.00'), (165, 'Tv Dollar Space')])
    tile(p, 0, 1, 'Tv-Thin', pid(51), [(130, '$1\u2009299.00', {'font': 'arial'}), (165, 'Tv Thin')])
    return {pid(48): 129900, pid(49): 129900, pid(50): 129900, pid(51): 129900}

@case('c35_thin_in_cents', '"5\u2009$\u200998", "$5\u00a0.98", "5$\u00a098"')
def _(p):
    tile(p, 0, 0, 'Thin-A', pid(52), [(130, '5\u2009$\u200998', {'font': 'arial'}), (165, 'Thin A')])
    tile(p, 1, 0, 'Thin-B', pid(53), [(130, '$5\u00a0.98', {'font': 'arial'}), (165, 'Thin B')])
    tile(p, 2, 0, 'Thin-C', pid(54), [(130, '5$\u00a098', {'font': 'arial'}), (165, 'Thin C')])
    return {pid(52): 598, pid(53): 598, pid(54): 598}

@case('c36_space_dollar', '"5 $ 98" (space before $), and same with "Was $6.47" beside')
def _(p):
    tile(p, 0, 0, 'Space-Dollar', pid(55), [(130, '5 $ 98'), (165, 'Space Dollar')])
    tile(p, 1, 0, 'Space-Dollar-Was', pid(56), [(130, '5 $ 98  Was $6.47'), (165, 'Space Dollar Was')])
    return {pid(55): 598, pid(56): 598}

@case('c37_unicode_minus', '"\u2212$1.00" coupon line above "4$ 97"; oos tile with only "\u2212$1.00"')
def _(p):
    tile(p, 0, 0, 'Minus-One', pid(57), [(110, '\u2212$1.00 coupon', {'font': 'arial'}), (130, '4$ 97'), (165, 'Minus One')])
    tile(p, 1, 0, 'Minus-Two', pid(58), [(120, 'Out of stock'), (130, '\u2212$1.00', {'font': 'arial'}), (165, 'Minus Two')])
    return {pid(57): 497, pid(58): None}

@case('c38_other_digits', '"$\u0665.\u0669\u0668" arabic-indic; "$\uff15.\uff19\uff18" fullwidth; "$1\u0665.98" mixed')
def _(p):
    tile(p, 0, 0, 'Arabic-Digits', pid(59), [(130, '$\u0665.\u0669\u0668', {'font': 'arial'}), (165, 'Arabic Digits')])
    tile(p, 1, 0, 'Mixed-Digits', pid(60), [(130, '$1\u0665.98', {'font': 'arial'}), (145, 'Was $19.99'), (165, 'Mixed Digits')])
    tile(p, 2, 0, 'Devanagari-Digits', pid(61), [(130, '$\u096b.\u096f\u096e', {'font': 'arial'}), (165, 'Devanagari Digits')])
    return {pid(59): None, pid(60): 1598, pid(61): None}

@case('c39_hidden_text', 'oos tile with invisible (render mode 3) "$1.00"')
def _(p):
    tile(p, 0, 0, 'Hidden-Price', pid(62), [(120, 'Out of stock'), (140, '$1.00', {'render': 3}), (165, 'Hidden Price')])
    return {pid(62): None}

@case('c40_noslug_link', 'product link /en/ip/<id> with no slug; and /en/ip/<slug>/<id>/ trailing; /fr/ip/')
def _(p):
    tile(p, 0, 0, 'x', pid(63), [(130, '3$ 97'), (165, 'No Slug Product')], uri='https://www.walmart.ca/en/ip/' + pid(63))
    tile(p, 1, 0, 'x', pid(64), [(130, '4$ 97'), (165, 'Query Product')], uri='https://www.walmart.ca/en/ip/Query-Product/' + pid(64) + '?selectedSellerId=0')
    tile(p, 2, 0, 'x', pid(65), [(130, '5$ 97'), (165, 'Item Product')], uri='https://www.walmart.ca/ip/item/' + pid(65))
    return {pid(63): 397, pid(64): 497, pid(65): 597}

@case('c41_multi_hundred', '"100/$5.00" (per-100 pack price)')
def _(p):
    tile(p, 0, 0, 'Straws-Pack', pid(66), [(130, '100/$5.00'), (165, 'Straws Pack')])
    return {pid(66): 'PER100'}

@case('c42_rollback_was_order', '"Rollback" "Was $4.27" above "3$ 47"')
def _(p):
    tile(p, 0, 0, 'Roll-Was', pid(67), [(20, 'Rollback'), (115, 'Was $4.27'), (130, '3$ 47'), (165, 'Roll Was')])
    return {pid(67): 347}

@case('c43_regular_price', '"Regular price $5.97" alone (no sale price shown)')
def _(p):
    tile(p, 0, 0, 'Reg-Only', pid(68), [(115, 'Sale price'), (130, 'Regular price $5.97'), (165, 'Reg Only')])
    return {pid(68): 597}

@case('c44_sup_as_count', '"$5" 14pt then "24" 8pt raised (a pack count badge), true price $5.00? ambiguous design')
def _(p):
    x, y = COLS[0] + 8, ROWS[0] + 130
    put(p, x, y, '$12', 14); put(p, x + 25, y - 3, '48', 8)
    put(p, x, y + 35, 'Water 24 pack'); link(p, (20, 40, 210, 280), 'Water-24-Pack', pid(69))
    return {pid(69): 1248}

@case('c45_line_dup_word', 'price in one word "$5.98" and a second price "$0.98" as a deposit line "+ $0.10 deposit"')
def _(p):
    tile(p, 0, 0, 'Pop-Can', pid(70), [(130, '$5.98'), (142, '+ $0.10 deposit'), (165, 'Pop Can')])
    return {pid(70): 598}

@case('c46_price_dollarless_sup', '"5" 14pt + "98" 7pt raised, no $ sign (text layer lost $)')
def _(p):
    x, y = COLS[0] + 8, ROWS[0] + 130
    put(p, x, y, '5', 14); put(p, x + 9, y - 5, '98', 7); put(p, x, y + 15, '$1.20/100g')
    put(p, x, y + 35, 'No Dollar'); link(p, (20, 40, 210, 280), 'No-Dollar', pid(71))
    return {pid(71): None}

@case('c47_three_rects', 'three products whose rects all cover one price; C owns it')
def _(p):
    tile(p, 0, 0, 'Tri-A', pid(72), [(60, 'Tri A')], rect=(20, 40, 400, 280))
    tile(p, 1, 0, 'Tri-B', pid(73), [(60, 'Tri B')], rect=(100, 40, 400, 280))
    put(p, 300, 170, '7$ 07')
    tile(p, 2, 0, 'Tri-C', pid(74), [(60, 'Tri C')], rect=(280, 150, 320, 190))
    return {pid(72): None, pid(73): None, pid(74): 707}

@case('c48_split_multi_overlap', 'B "2 for $5.00" at B left edge; A rect reaches right over "2 for" only (nobody wins), "$5.00" B-only')
def _(p):
    tile(p, 0, 0, 'Split-A', pid(75), [(130, '1$ 97'), (165, 'Split A')], rect=(20, 40, 240, 280))
    x, y = COLS[1] + 2, ROWS[0] + 130
    put(p, x, y, '2 for'); put(p, x + 40, y, '$5.00')
    put(p, x, y + 35, 'Split B'); link(p, (217, 40, 407, 280), 'Split-B', pid(76))
    return {pid(75): 197, pid(76): 250}

@case('c49_split_thousands_overlap', 'B "1 299$ 00" at B left edge, A rect covers the "1" only')
def _(p):
    tile(p, 0, 0, 'Split-C', pid(77), [(130, '1$ 97'), (165, 'Split C')], rect=(20, 40, 222, 280))
    x, y = COLS[1] + 1, ROWS[0] + 130
    put(p, x, y, '1'); put(p, x + 12, y, '299$ 00')
    put(p, x, y + 35, 'Split D'); link(p, (217, 40, 407, 280), 'Split-D', pid(78))
    return {pid(77): 197, pid(78): 129900}

@case('c50_space_dollar_unit', '"5 $ 98" then "$0.50/sheet" next line (same block)')
def _(p):
    tile(p, 0, 0, 'Space-Unit', pid(79), [(130, '5 $ 98'), (142, '$0.50/sheet'), (165, 'Space Unit')])
    return {pid(79): 598}

@case('c51_dollar_space_thousands_unit', '"$1 299.00" then "$0.50/sheet" next line')
def _(p):
    tile(p, 0, 0, 'Tv-Unit', pid(80), [(130, '$1 299.00'), (142, '$1.20/100g'), (165, 'Tv Unit')])
    return {pid(80): 129900}

@case('c52_split_was_overlap', 'B "Was $6.47" at B left edge with "Was" in overlap; B price "3$ 97" below')
def _(p):
    tile(p, 0, 0, 'Split-E', pid(81), [(130, '1$ 97'), (165, 'Split E')], rect=(20, 40, 232, 280))
    x, y = COLS[1] + 1, ROWS[0] + 100
    put(p, x, y, 'Was'); put(p, x + 22, y, '$6.47'); put(p, x + 60, y + 30, '3$ 97')
    put(p, x, y + 65, 'Split F'); link(p, (217, 40, 407, 280), 'Split-F', pid(82))
    return {pid(81): 197, pid(82): 397}

@case('c53_superscript_bare_block', 'no-overlap raised cents "$5"/"98" with unit price in same block (tight lines)')
def _(p):
    x, y = COLS[0] + 8, ROWS[0] + 130
    put(p, x, y, '$5', 12); put(p, x + 14, y - 10, '98', 6); put(p, x, y + 11, '$0.50/sheet')
    put(p, x, y + 22, 'Tissue Box'); link(p, (20, 40, 210, 280), 'Tissue-Box', pid(83))
    return {pid(83): 598}

@case('c54_rotated_pair', 'priced tile with price rotated 90 ("3$ 97" rotated), oos neighbour')
def _(p):
    tile(p, 0, 0, 'Rot-Price', pid(84), [(200, '3$ 97', {'rotate': 90, 'dx': 80}), (165, 'Rot Price')])
    return {pid(84): 397}


def main():
    for name, (fn, note) in cases.items():
        doc = pymupdf.open()
        p = doc.new_page(width=W, height=H)
        exp = fn(p)
        doc.set_metadata({'title': 'Audit | Walmart Canada', 'creationDate': "D:20260927231000-04'00'"})
        doc.save(os.path.join(OUT, name + '.pdf'))
        expect[name] = {'note': note, 'expect': exp}
    with open(os.path.join(OUT, 'expect.json'), 'w', encoding='utf-8') as f:
        json.dump(expect, f, ensure_ascii=False, indent=1)
    print(len(cases), 'cases')


main()
