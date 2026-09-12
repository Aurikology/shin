# Item 28: Canadian Tire developer portal

Read 2026-09-11. No account created, no key requested, no terms accepted.

## What it is

`https://developer.cantire.com/` is a Mashery-hosted API portal (Mashery is a third-party
API-gateway product; the portal's own theme files identify it as
"Portal Theme Starter Kit v2.7.14"). Fetched directly (`curl`, no login) 2026-09-11.

The homepage reads, verbatim:

> "Welcome to the Canadian Tire developer program! Discover the world of our APIs."

with four tiles: Register, Read the Docs, Make a Call, Get Support.

## What it exposes

The only service listed anywhere on the portal, in the documentation page
(`/docs`) and in the interactive API tester (`/interactive-documentation`), is
one thing: **the "Echo" service**.

Quoted from `/docs`, read 2026-09-11:

> "The 'Echo' service provides an API that returns in the response what it is sent."

Its three operations are `/echo/post` (returns whatever body you POST back to you),
`/echo/ip` (returns your own source IP), and one more of the same shape. There is no
product, price, inventory, or store-location endpoint documented anywhere on the
portal. This is a sandbox/test stub, not a product API. The interactive tester
(`/interactive-documentation`) confirms this: its only selectable entry is
"Echo Service", labelled "No description set."

## Registration

Fetched `/member/register` 2026-09-11 (no form submitted, no account created). The page
reads, verbatim and in full for the content area:

> "Registration is currently disabled."

So even the Echo stub cannot be keyed today. There is nothing to sign up for.

## Conclusion

The Canadian Tire developer portal is not a live product/price data source. It is a
Mashery instance that has been reduced to (or never grew past) a test echo endpoint, with
new registration turned off. This is a fact about the portal today, not about Canadian
Tire's internal systems: the storefront itself (`www.canadiantire.ca`) does carry a real,
unauthenticated, working product/search/price API, already wired into this repo at
`price/src/canadiantire.ts` by reading the site's own client-side calls (subscription key
lifted from the anonymous page, not from this portal). That route has nothing to do with
`developer.cantire.com`.

## The condition that reopens this

Reopens if either of these becomes true, checked by re-fetching the same three URLs
(`/`, `/docs`, `/member/register`):
1. `/member/register` stops saying "Registration is currently disabled," or
2. the documentation or interactive-API page lists a second service beside "Echo Service"
   (a product, price, or inventory endpoint).

Until one of those changes, there is nothing here to build against.

Sources: https://developer.cantire.com/ (2026-09-11), https://developer.cantire.com/docs
(2026-09-11), https://developer.cantire.com/interactive-documentation (2026-09-11),
https://developer.cantire.com/member/register (2026-09-11, followed one redirect).
