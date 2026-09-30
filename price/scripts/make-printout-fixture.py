"""Build a synthetic Walmart category printout PDF for the printout-intake tests.

NOT a real printout. The 29 real printouts are not on the development machine this was written
on, so this mimics the layout the prototype reader (research/screenshot-matcher-v1/extract.py)
handles: one product = one link rectangle to /en/ip/<slug>/<id>, the words inside it are the
tile, and prices spelled the way the printout text layer spells them (`5$ 98`, `$598`).

Every awkward case the intake has to survive is placed on purpose; the test file names each one.

Usage: python make-printout-fixture.py <out.pdf>
"""
import sys

import pymupdf

BASE = 'https://www.walmart.ca/en/ip/'
W, H = 612, 792
COLS = [20, 217, 414]      # tile left edges, 190 wide
ROWS = [40, 290, 540]      # tile top edges, 240 tall
TW, TH = 190, 240


def text(page, x, y, s, size=9):
    page.insert_text((x, y), s, fontsize=size, fontname='helv')


def tile(page, col, row, slug, pid, lines, rect=None, links=None):
    """lines: [(dy, text)]. rect: link rectangle override. links: several rectangles, one product."""
    x, y = COLS[col], ROWS[row]
    for dy, s in lines:
        text(page, x + 8, y + dy, s)
    uri = BASE + slug + '/' + pid
    for r in links or [rect or pymupdf.Rect(x, y, x + TW, y + TH)]:
        page.insert_link({'kind': pymupdf.LINK_URI, 'from': r, 'uri': uri})


def main(out):
    doc = pymupdf.open()
    p = doc.new_page(width=W, height=H)
    # A navigation link: not a product, must not become a tile.
    text(p, 22, 25, 'Grocery')
    p.insert_link({'kind': pymupdf.LINK_URI, 'from': pymupdf.Rect(20, 12, 90, 30),
                   'uri': 'https://www.walmart.ca/en/browse/grocery/10019'})

    # Row 0
    # B: its printed name sits low in the tile, where tile A's link rectangle reaches up over it.
    # No unit price on B, so the only thing A's rectangle borrows is B's name.
    tile(p, 0, 0, 'Heinz-Tomato-Ketchup-1-L', '6000191260001',
         [(130, '4$ 97'), (165, 'Heinz Tomato Ketchup 1 L'), (215, 'Add')])
    # S1: the `5$ 98` spelling, a unit price in cents.
    tile(p, 1, 0, 'Great-Value-Spaghetti-900-g', '6000200000011',
         [(130, '1$ 98'), (165, 'Great Value Spaghetti 900 g'), (185, '22¢/100g'), (215, 'Add')])
    # S2: the `$598` spelling, a unit price in dollars.
    tile(p, 2, 0, 'Barilla-Penne-Rigate-500-g', '6000200000022',
         [(130, '$598'), (165, 'Barilla Penne Rigate 500 g'), (185, '$1.20/100g'), (215, 'Add')])

    # Row 1
    # A: the neighbour-name case. Its link rectangle starts 90 pt above its own tile, so B's
    # printed name is inside it and comes FIRST in reading order.
    x, y = COLS[0], ROWS[1]
    tile(p, 0, 1, 'Catelli-Smart-Spaghetti-375-g', '6000200000033',
         [(130, '2$ 47'), (165, 'Catelli Smart Spaghetti 375 g'), (185, '65.9¢/100g'), (215, 'Add')],
         rect=pymupdf.Rect(x, ROWS[0] + 160, x + TW, y + TH))
    # R: Rollback with a "was" price.
    tile(p, 1, 1, 'Kraft-Smooth-Peanut-Butter-1-kg', '6000200000044',
         [(20, 'Rollback'), (130, '3$ 47'), (145, 'Was $4.27'), (165, 'Kraft Smooth Peanut Butter 1 kg'),
          (185, '34.7¢/100g'), (215, 'Add')])
    # D: price / size disagrees with the printed unit price (4.99 / 650 ml is 76.8¢/100ml).
    tile(p, 2, 1, 'Classico-Tomato-Basil-Pasta-Sauce-650-ml', '6000200000055',
         [(130, '4$ 99'), (165, 'Classico Tomato Basil Pasta Sauce 650 ml'), (185, '$2.62/100ml'), (215, 'Add')])

    # Row 2
    # O: no price at all: dropped from observations with a logged reason, kept in raw.
    tile(p, 0, 2, 'Ronzoni-Lasagna-454-g', '6000200000066',
         [(130, 'Out of stock'), (165, 'Ronzoni Lasagna 454 g')])
    # Wt: sold by weight.
    tile(p, 1, 2, 'Banana-Bunch', '6000200000077',
         [(115, 'avg price'), (130, '$152'), (165, 'Bananas, bunch'), (185, '72¢/lb'), (215, 'Add')])

    p2 = doc.new_page(width=W, height=H)
    # S1 again, same price: merged into one observation, never two.
    tile(p2, 0, 0, 'Great-Value-Spaghetti-900-g', '6000200000011',
         [(130, '1$ 98'), (165, 'Great Value Spaghetti 900 g'), (185, '22¢/100g'), (215, 'Add')])
    # P: one product, two links (image above, title below).
    x, y = COLS[1], ROWS[0]
    tile(p2, 1, 0, 'Tide-Pods-Original-Laundry-Detergent-Pacs-42-Count', '6000200000088',
         [(130, '10$ 97'), (165, 'Tide Pods Original 42 Count'), (185, '26.1¢/ea'), (215, 'Add')],
         links=[pymupdf.Rect(x, y, x + TW, y + 100), pymupdf.Rect(x, y + 100, x + TW, y + TH)])
    # S2 again at a different price: two prices for one product in one day is flagged.
    tile(p2, 2, 0, 'Barilla-Penne-Rigate-500-g', '6000200000022',
         [(130, '$549'), (165, 'Barilla Penne Rigate 500 g'), (185, '$1.10/100g'), (215, 'Add')])

    doc.set_metadata({'title': 'Pasta & Pasta Sauce | Walmart Canada',
                      'creationDate': "D:20260927231000-04'00'"})
    doc.save(out)


if __name__ == '__main__':
    main(sys.argv[1])
