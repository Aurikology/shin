# Item 35: Walmart, the blocked state and the affiliate API

Read 2026-09-11. Recording facts with sources per the ask; the founder decides what
follows from them, this file does not recommend drop or build.

## What is already true and already built (context, not this item's finding)

`price/src/walmart.ts` and `price/src/walmart-sitemap.ts` already exist in this repo,
dated 2026-09-05 and 2026-09-08, and already read Walmart Canada's own product pages and
product sitemap without any key, login, or affiliate account: the product page embeds a
`__NEXT_DATA__` JSON block with the UPC, and the sitemap at
`https://www.walmart.ca/sitemap-product-1p-en.xml` lists ~217,660 first-party product
URLs under `/en/ip/*/*`, a path `robots.txt` explicitly Allows even though it Disallows
the bare `/en/ip/*` and `/search?*`. That is the route their terms actually permit for
reading prices, and it is not the affiliate API. This item is about the other route: the
official affiliate/partner channel, and whether it helps at all.

## The blocked state, sourced

1. **The public-facing affiliate sign-up page on walmart.ca is bot-gated.** Fetched
   `https://www.walmart.ca/en/cp/affiliate-program/6000208941216` 2026-09-11 (plain
   `curl`, browser user-agent, no login): the response is not the affiliate page, it is a
   human-verification challenge, body text "Please press and hold the button below to
   verify yourself so we can keep spam bots off of Walmart.ca." This is Walmart's own
   bot-defense (Akamai/PerimeterX-class), not a robots.txt rule; it means an automated
   client cannot even read the sign-up terms, let alone apply, without a real browser and
   a human present.
2. **`developer.walmartlabs.com`, the domain most public write-ups still cite for the
   "Walmart Open API" / affiliate API, no longer resolves.** `curl` returned
   `getaddrinfo ENOTFOUND developer.walmartlabs.com` 2026-09-11. The live successor is
   `walmart.io`.
3. **Walmart Marketplace Canada (`developer.walmart.com/ca/ca-mp/`) is a seller
   onboarding program, not a price-data or affiliate API.** It is for merchants who want
   to list products for sale on walmart.ca, checked by reading the page title and section
   headers 2026-09-11; it has no relevance to reading competitors' prices and is not the
   thing item 27/29-style affiliate work would use.

## The US-only affiliate API, sourced

`walmart.io` hosts the real, current "Affiliate API" / "Content Provider API"
documentation (`https://www.walmart.io/docs/affiliate/`). Fetched 2026-09-11: the page
itself is a JavaScript single-page app and did not render usable text through a plain
fetch (confirmed by reading the raw response: it is the app shell plus a bundle map, no
API reference text), so the exact field list could not be read live this session. What
is independently confirmable without an account:
- The domain and every reference to it (`walmart.io`, previously `developer.walmartlabs.com`)
  markets itself against **Walmart.com**, the US storefront, throughout its own meta tags
  ("Walmart I/O is the developer portal... We provide tools to services at Walmart.com").
  Read 2026-09-11.
- Third-party affiliate directories describe Walmart's **Canadian** affiliate program as a
  *separate* program run through general affiliate networks (Rakuten Advertising,
  FlexOffers), not through walmart.io. FlexOffers' own page
  (`https://www.flexoffers.com/affiliate-programs/walmart-canada-affiliate-program/`,
  read 2026-09-11) advertises "product feeds" for the Walmart Canada program but does not
  state, anywhere on that page, whether those feeds carry price or barcode/UPC fields.
  That is an unverified claim, not a confirmed one: it names "product feeds" as a
  benefit of joining, nothing more specific.

So the accurate way to state this, without over-claiming: the affiliate API most
sources call "the Walmart Open API" is built around Walmart.com (US) products and is
marketed and documented as a US product; a nominally separate Walmart Canada affiliate
program exists through third-party affiliate networks, but no source opened this
session confirms it exposes a machine-readable price/barcode feed rather than just
tracked links and banners. This is unknown, not zero: the way to find out is to apply
through Rakuten Advertising's Walmart Canada listing and read the actual data-feed
schema it hands an accepted affiliate, which is a sign-up step this lane was told not to
take.

## The route their terms actually permit

The one already built and running in this repo: reading `walmart.ca`'s own product
pages and first-party sitemap, which `robots.txt` affirmatively Allows for the
`/en/ip/*/*` path shape (quoted in `walmart-sitemap.ts`'s own header, verified against
the live file 2026-09-08 per that file, not re-verified this session). No affiliate
account, no key, and it already returns the UPC. Nothing found this session changes that
conclusion or supersedes it.

Sources: https://www.walmart.ca/en/cp/affiliate-program/6000208941216 (2026-09-11),
https://developer.walmart.com/ca/ca-mp/ (2026-09-11), https://www.walmart.io/docs/affiliate/
(2026-09-11, page shell only), https://www.flexoffers.com/affiliate-programs/walmart-canada-affiliate-program/
(2026-09-11), `price/src/walmart-sitemap.ts` (repo file, headers dated 2026-09-08).
