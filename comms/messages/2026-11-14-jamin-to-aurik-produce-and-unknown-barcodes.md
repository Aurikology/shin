# Jamin to Aurik: unknown barcodes, scans with no price, produce

Jamin, 2026-11-14: *"for now, delegate all front end work to aurik and all backend to me"*. So the screens are mainly yours and the server, data and prices are Jamin's (his Claude sessions). Not exclusive: if a screen blocks other work, Jamin's side may build it, and a note will say so. This adds to this afternoon's note (`2026-11-14-jamin-to-aurik-screen-problems-from-the-store.md`), from Jamin scanning at Foody Mart (photos beside this file).

Why the middle sections matter: of 176 real scans since October (63 phones), only 27% were answered from a real shop price. Jamin, 2026-11-15: *"pexi doesn't have most of the price of the items in a grocery store, [how] can we communicate that to customers. and not let [them] get fatigue from scanning and not finding an answer"*. His answer to the plan below: *"work on all 5"*. The server half of each is live; the screen half is yours.

## 1. Say what Pexi knows before the price pad (new ruling)

RULINGS, "The shopper learns Pexi does not know a product before typing a price". His words: *"the user only knows pexi doesn't have a product after they put in a price"*. This reverses the 2026-11-12 call that kept the price first (D-264). The name preview (`identify` with `preview=1`, about half a second) now answers both questions before the pad opens:
- `outcome` `not_in_catalogue`: Pexi does not know the product. Say so, and offer typing the name (2).
- new `priceKnown` (boolean, live): Pexi knows the product but has no shop or shopper price yet. Say "No price here yet: add the shelf price and Pexi will know it next time" and open the pad for that, not for a verdict.

## 2. Offer typing the name wherever a scan finds nothing

His words: *"the problem is that users don't know this feature exists"*. Wherever a scan ends without a product (1 above, an unreadable barcode, a miss), the sheet itself offers "Type the name" with the field ready, not only the keyboard button in the corner.

## 3. A missed price counts for something

Live on the server: a shelf price typed for a product identified by barcode is saved as a shopper price that the next shopper's answer uses (trust rule in docs/decisions.md 2026-11-15: one per phone per product per day, a typo guard at x0.33 / x3 of the known centre, shopper prices count as one shop at most and never lift confidence above low). The answer carries:
- `contributed` (true when this price was saved), `pricesAdded` (this phone's running total).
- `contributedWhy` when not saved: `not_identified`, `weighed_label`, `already_today`, `typo_guard`, `probe_device`, `bad_price`, `store_unavailable`.

Screen ask: when `contributed` is true, say it was saved for the next shopper, and show the running count somewhere it builds ("You've added 6 prices"). A scan with no price should feel like progress, not a dead end.

## 4. Point new shoppers at what Pexi knows well

Measured 2026-11-15 on the live price data (last 120 days, 44,478 priced products): strongest at Loblaws (11,699 products), No Frills (11,351), Save-On-Foods (10,989), Metro (10,241), Galleria (9,109) and Walmart (8,227); thin at Sobeys (865) and T&T (250). Best aisles: frozen, dairy, ready meals, desserts, drinks; weakest: spreads. Screen ask: the first-run screens and tips steer early scans there, in the seller's voice ("Works best on packaged groceries at Loblaws, No Frills, Metro, Walmart and Save-On-Foods"), never as a list of gaps.

## 5. Notice a run of misses

Longest run of scans with no shop price on one phone: 12 in a row. Screen ask: after two scans in a row with no price (`priceKnown` false or `not_in_catalogue`), say once per session: "Pexi's strongest on packaged groceries. Try a box or can." Never a third silent miss.

## 6. Amount for things sold by weight or count

His words: *"the product that was pulled up with the text field should also be able to be scaled according to how much the user wants to buy"*. Produce is priced per lb ("$1.58 LB, Reg $2.99"). Needs an amount the shopper sets (lb or kg, or a count for "each" items) and the total for that amount beside the per-lb verdict, which stays per lb. Live fields on a produce answer: `identity.unit` and `answer.unit` = `'lb'`, `identity.plu` (the printed code), `identity.organic`, `verdict.perUnit.label` = `'per lb'`, `verdict.scaledTo` = `'1 lb'`.

## 7. Produce and unknown barcodes (information, live)

- The orange's sticker is a GS1 DataBar; your reader decodes it (checked on the photo with the app's zxing-wasm) to `(01)09354765000036`, the grower's own number, not the produce code. Cara Cara's produce code is 3110, on the shelf tag.
- The server now knows the 1,520 produce codes: typing or scanning 3110 answers "Cara Cara Orange", 4011 "Bananas" (live: 88 cents/lb from 4 shops), priced per lb from Project Hammer's loose produce where shops have it, else the Statistics Canada average.
- An unknown barcode is named from what shoppers picked after scanning it, once 2 or more phones agree (`identitySource` / `answerPath` = `shopper_picks`, never "sure"). That covers grower stickers.
- A price range is never wider than one product's prices across shops: the instant noodles answer drew $2.35 to $20.70 around one $6.95 price; it now reads $4.99 to $9.73.

Delete this file once read.
