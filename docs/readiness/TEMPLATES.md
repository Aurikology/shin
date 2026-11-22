# Pexi reply templates and fact sheets (2026-11-18)

Used by `RUNBOOK.md` (R18, R19, R21, R22, R53, R57, R62, R64, R78, R87). **A person sends every reply; the system never
does.** Replies are short, plain and friendly. Replace the <angle brackets>. Reply in the shopper's language when you can
(French versions need Aurik, `needs-jamin.md`). Never paste a device id, key or database row into a reply. Keep the
support address as the only sender: `usepexiapp@gmail.com`.

Part A is for shoppers. Part B is the fact sheets and replies for retailers, partners, press and investors.

# Part A: shoppers

## Cancel my subscription
> Hi <name>, here is how to cancel Pexi Plus on your iPhone: Settings, tap your name, Subscriptions, Pexi, Cancel
> Subscription. You keep Plus until the end of the period you already paid for. Deleting the app does not cancel it.
> Anything else I can sort out? Pexi

## Refund request
> Hi <name>, sorry it did not work out. Apple handles every Pexi Plus payment, so the refund comes from Apple: go to
> reportaproblem.apple.com, sign in, find Pexi Plus and choose Request a refund. We support your request. If Apple
> asks, tell them you are asking for a refund of a Pexi Plus subscription. Pexi

## Delete my data
> Hi <name>, yes, we can delete it. Open Pexi, go to the You screen and tap Delete my data. That prepares an email to us
> with your phone's ID so we can find the right records (we do not ask for your name). We confirm the deletion in
> writing once it is done. Pexi
>
> Internal: start the clock the day it arrives and follow `docs/privacy/data-requests.md`. Do not tell them a reinstall
> gives a new ID; it does not, and deleting scans restarts the weekly free allowance.

## A price looks wrong
> Hi <name>, thanks for telling us. Which product (a photo of the barcode is perfect), which store, and what price did you
> see on the shelf? We will check and fix it, and we will tell you what we found. Pexi
>
> Internal: R23 steps. If the wrong number is a shopper's typed price: `scripts/security/remove-shopper-input.mjs`.

## Restore my Plus (new phone, reinstall, or Plus is not on)
> Hi <name>, let us get you back to Plus. On the phone, open Pexi, go to the You screen, tap Pexi Plus, then Restore
> Purchases, signed in with the same Apple ID you paid with. Plus comes back within a minute. If it does not, reply
> with the Apple receipt email or order number and we will look it up. Pexi
>
> Internal: with RevenueCat set to Transfer (fix-money, needs-jamin.md R21), Plus moves to the phone that restores and the old phone drops to the free limit; say so if they ask. Look an order up in RevenueCat, Customers, by transaction id.

## I paid and it is still limited
> Hi <name>, thanks for your patience. Please wait about 10 minutes, then scan again. If it still shows the limit, open
> the You screen, tap Pexi Plus, then Restore Purchases. If that does not do it, send us the order number from Apple's
> receipt email and we will fix it by hand. Pexi
>
> Internal: R19 steps. The server remembers "not Plus" for up to 10 minutes (`app/src/scan-quota.ts:49`).

## Refund or purchase by a child
> Hi <name>, thank you for writing. We are sorry your child bought this. Pexi Plus is billed by Apple, and only Apple can
> refund it: go to reportaproblem.apple.com, sign in with the Apple ID on the phone, find Pexi Plus and request a refund.
> We fully support your request. To stop it renewing: Settings, your name, Subscriptions, Pexi, Cancel Subscription.
> If you would also like your child's information deleted, open Pexi, go to the You screen and tap Delete my data, or
> reply here and we will guide you. Pexi
>
> Internal: reply the same day; never contest a parent's refund (legal review, question 7). Deletion:
> `docs/privacy/data-requests.md` section 1b. Record: `docs/privacy/children-record.md`.

## A parent asks what Pexi collects about a child
> Hi <name>, Pexi does not ask for a name, email, birth date or account. It makes a random ID on the phone and records
> what is scanned or typed, how the app is used, and a standard server log. Location is off unless it is turned on, and
> then only a rough one-kilometre square is sent. We do not show ads and we do not sell data. You can have everything tied to
> the phone deleted: open Pexi, go to the You screen and tap Delete my data, or reply here. The full policy is at <privacy page link>. Pexi
>
> Internal: R53. Jamin answers a regulator himself.

## Pexi is English only (a French-speaking shopper)
> Hi <name>, thank you for telling us. Pexi is in English for now. <If Jamin has decided on French: A French version is
> on its way. If not: We have noted your request.> The privacy policy is also available in French at <link>. Pexi
>
> Internal: R43; do not promise a date.

## I have no signal in the store
> Hi <name>, Pexi checks prices live, so it needs a connection to answer. A moment of signal at the shelf is enough, and
> scans go through as soon as you have one. Pexi

## Pexi is for Canada (a shopper outside Canada)
> Hi <name>, Pexi covers Canadian stores and Canadian prices today, so it will not have answers elsewhere yet. Thanks for
> trying it. Pexi

## Thank you for a good review
> Thanks <name>, that made our day. If you find a price that looks off, tell us and we will fix it. Pexi

---

# Part B: businesses, press and investors

Replies in this part are signed by Jamin Xu. A person sends them. Operational facts only: what we show, where it came from,
and what we will do. No legal opinion goes in a reply; if a message cites a law, a lawyer reads it first and the answer is
"we have received your message and will respond by <date>".

## Retailer or brand asks about, or objects to, a shown price (R57)

> Hi <name>, thank you for getting in touch. Pexi shows shoppers prices from public product and price sources and from
> prices shoppers enter, with the store and the date each was seen. To look into <product> at <store>, could you send
> the barcode, the date and the price you expect? We will check it and write back within three business days. If a price
> is wrong we correct it; if you would like us to stop showing your store's prices, tell us and we will look at that and
> reply with what we can do and by when. Jamin Xu, Pexi

Internal steps for R57: find the rows (barcode and seller) in the price data; if wrong, hide or correct; if a stop
request, copy the prices file first, then remove that seller's rows and switch the source off in `config.env`,
restart, and scan the product to confirm. Write the date and what was removed in the vendor table (`HANDOVER.md`).
Never reply with an opinion on terms of use or licences.

## Fact sheet: how each verdict is computed (R62)

**For Jamin to give to a challenger. Facts below are read from `price/src/verdict.ts` and `price/src/estimate.ts` on
2026-11-18. Nothing here is a claim of accuracy beyond what is labelled MEASURED.**

Pexi gives a shopper one of three verdict tiers, "good price", "about what others charge" or "high price" (the exact words depend on the voice setting, for example "Good price" or "Take it", in `app/public/js/voice.js`), always with the numbers that produced it.

1. **A shelf price compared with recorded prices (arithmetic, no model).**
   - Pexi holds prices seen at named shops with the date each was seen. It builds a range from the cheapest to the
     dearest regular price. Sale prices and regular prices are never mixed.
   - The shelf price's place in that range decides the tier: the cheapest third is "good", the middle third "about what others charge", the dearest third "high". When every shop has the same price, a lower
     price is "good", an equal one "about what others charge", a higher one "high".
   - The screen names the cheapest and the dearest shop with their prices and shows how old the newest price is. After
     21 days it says the newest price is over three weeks old.
   - There is no average anywhere: every number shown is a real price at a named shop.
   - A confidence number sits beside the verdict: 0.5 from one shop, 0.7 from two, 0.82 from three, 0.9 from four or more;
     minus 0.15 if the newest price is over 21 days old, minus 0.2 if only sale prices exist, minus 0.1 if any price was
     matched by name rather than by barcode.
2. **A typical range when no shop price is held (statistics).** A centre and a spread are fitted on log price using the
   first rung of this ladder that has evidence: the item's own prices, the same product in another size, the leaf
   category, the parent category, the brand's usual premium, Statistics Canada's monthly average for 110 staples, a model
   estimate, then the widest category or department. Less evidence means a wider range and a lower confidence, never a hidden
   answer.
3. **A model estimate (only if the shopper said yes at first launch).** Claude receives a product's name, brand, size,
   category and country (never the device id, an image or the location) and returns a price range. It is labelled
   as AI-made, saved by Pexi, and capped at 1,000 asks a month.

**What is measured.**
- MEASURED: the launch accuracy gate of 2026-11-14 (375 fresh products, `docs/decisions.md`): 0 barcodes naming a
  different product, 0 of 375 wrong on a full name, 8 of 375 (2.1%) wrong on any typed form, 18 of 4,236 asks errored
  (0.4%), 0 model calls. This measures whether the right *product* is named, not whether the price tier is right.
- NOT MEASURED: how often the price range or the tier matches what a shop actually charges next week. No hit rate exists
  and none should be quoted. (`RULINGS.md:462`: no savings claim ships until it is measured.)
- NOT MEASURED: any amount a shopper saved.

## Partnership or advertising enquiry (R64)

> Hi <name>, thank you for thinking of Pexi. We are not taking on partners or placement right now, and Pexi does not show
> ads, but we have kept your note and will come back to you if that changes. If you would like us to keep it on file,
> three questions help us: what would you like to do together, what would each side give and receive, and what
> information would you want from or give to Pexi? Jamin Xu, Pexi

Internal: R64. Nothing that changes ranking or sells placement without Jamin's written decision (the public line is "no
ads"). A data licence is a separate decision.

## Press or creator enquiry (R78)

> Hi <name>, thanks for reaching out. Here is a short note on Pexi: <paste the one-pager below>. I am happy to answer
> questions by email or on a call; our screenshots are attached. Jamin Xu, Pexi

**One-pager (edit before sending; every line is sourced from the store listing and rulings).**
- **What it is.** Pexi is an iPhone app for Canadian shoppers: scan a barcode in the aisle and see whether the shelf price is
  good, about average or high, with the cheapest and dearest recorded shop prices named and dated.
- **Cost.** Free for 10 barcode scans a week. Pexi Plus is CA$3.99 a month or CA$29.99 a year for 100 scans a week.
- **Privacy.** No account, no name or email, no ads. A random ID on the phone; deletion from inside the app.
- **Who.** Published by Jamin Xu (Ontario) with Aurik. Spokesperson: Jamin Xu, `usepexiapp@gmail.com`.
- **Screenshots and logo.** `docs/store/screenshots/` (confirm the set is current before sending).
- **What not to say.** No savings figure, no accuracy figure (neither is measured). Anything outside this page: ask Jamin.

If a screenshot of a wrong verdict is spreading: see `RUNBOOK.md` R78. Reply once, plainly: "Thanks for flagging this. We
checked and <what we found>. We have fixed it and we are sorry for the trouble." Do not argue and do not delete anything.

## Investor, accelerator or buyer asks the basics (R87)

> Hi <name>, thank you for your interest in Pexi. Here are the basics: <fill the table below>. Happy to talk; what would
> you like to know first? Jamin Xu

| Question | Answer today | Source or status |
|---|---|---|
| What is it | Canada-only iPhone price-check app; scan a barcode, get a verdict | store listing |
| Who publishes it | Jamin Xu, an individual developer (Ontario). Business name registration is not done yet | privacy page; R46 |
| Who owns the code | **Jamin fills in.** The AMD agreement may affect this: read it first | R54 |
| Aurik's role and stake | **Jamin fills in** (no written agreement is on file) | R42 |
| Domain | anjiawenda.com, renews 2027-08-19, held in Jamin's Cloudflare account | `C:\ACT\NOW.md` |
| Accounts | Apple Developer, RevenueCat, Cloudflare, Anthropic, GitHub, Gmail: names in `HANDOVER.md`, never shared | |
| Revenue and users | **Jamin fills in at the time.** Nothing is quoted from this file | |
| Data sources and terms | Open Food Facts (ODbL), Project Hammer, Open Prices, Icecat, USDA, BC liquor prices, Statistics Canada, shopper-entered prices. Terms differ by source and were not reviewed for investor purposes | `docs/security-check/legal-review-2026-11-17.md` |
| Open legal items | GST/HST registration, business name, PEXI trademark, Terms redraft, transfer assessments, French listing | legal review ranked actions |
| What runs where | One server on a MacBook Air in Ontario behind Cloudflare; no cloud copy yet | `mac/README.md` |

Never send accounts, keys, the database or a backup to an investor. A person sends every reply.
