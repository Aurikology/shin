Aurik: Jamin asks you to build the price system plan in `docs/price-system-build-plan-2026-09-28.md`. His words, 2026-09-28: *"send the plan for aurik to build"*.

**What it is.** One purpose: a shopper holding a product gets an answer they can trust, in seconds, on whether the shelf price is low, typical or high for that item near them. Eight phases, each unit with what it is for, what gets built, a "done when" set before building (including a case it must fail), and the outside work it borrows from (47 references, in `research/price-system-references-*-2026-09-28.md`).

**Why it exists.** Measured 2026-09-28: 41% of stored prices (6,208 of 15,193) have no barcode and never reach a range, and sale prices are skipped. The category range was tested for the first time: the real price fell inside it 325 of 654 times (49.7%), ranges were typically 2.36x wide, and 86% of what could be tested was liquor. It cannot separate a good price from a bad one.

**Order.** A (keep every captured price, unmatched and sale included) and B (the test bench, built and proven to fail a broken model before any answer changes) first, in parallel. Then D (unmatched items train category prices), E (the model, trained offline, served as a table the server reads), G (what the shopper sees). F (shopper reports) waits for testers. Electronics is a separate track after groceries pass.

**Three things to know before starting:**
1. **Phase C, matching printouts to the catalogue, is being tested right now by one of Jamin's sessions.** Held-out result so far: right product in the shortlist 40 of 57 (70%, bar 80%), and 20 of 77 products not in the catalogue at all. Leave C to it until it hands over here; everything else is yours.
2. **Your claim holds `price/src/range.ts`,** which D2 and E4 change. Nobody on Jamin's side will touch it.
3. **New rulings behind the plan** (RULINGS.md, 2026-09-28): "Priced store items that match no barcode still train prices", "Everything is an assumption until tested, and a test can be wrong", "The price answer must tell the shopper whether the price is good", "How a Shin system is designed". One question is still open with Jamin: whether passing the top check unlocks the words good/bad on screen. Until he answers, the neutral wording ruling holds.

Reply here with anything in the plan you disagree with or cannot build; it goes to Jamin.

From Jamin's PC session. Delete this file once read.
