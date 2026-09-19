# MARKET AND CURRENCY RULES: FRAGMENT FOR scan_prompt.md

Built for beta-gaps item 19 (2026-09-19). A new file and a fragment: the owner of
`scan_prompt.md` places it under `## USER MARKET`. The catalogue side that derives
the market is `catalogue/src/market.ts` (`marketFromLocation`, `comparability`),
and it fills the placeholders below from the user's location. It is never
defaulted: no location means the unknown market, and the placeholders say so.

Jamin's words, 2026-09-17: "Shin will work for all locations accross the world in
all languages." "this applies to other countries as well. Same country products
can be compared but the same product outisde the country cannot be. This is also
subject to exceptions. Some provinces in the same country might have very
different prices whereas some countries like the eu might have similar prices
accross countries. Shin should be able to identify all of these constraints and
prompt gemini accordingly (This is a complex and difficult system to build that
will need further deisgn)".

Because it "will need further design", the rules below are a first version. They
are hints to reason from, not a table to apply blindly, and where they and the
evidence in front of you disagree, keep the answer and mark it less confident.

---

## MARKET RULES

The user's market:
- Country: {{MARKET_COUNTRY_OR_UNKNOWN}} (ISO 3166-1 alpha-2)
- Region (province, state or similar): {{MARKET_REGION_OR_UNKNOWN}}
- Currency: {{MARKET_CURRENCY_OR_UNKNOWN}} (ISO 4217)
- Region-sensitivity hint from Shin: {{REGION_MATTERS_HINT}}
  (`yes` when this country is known to have regions that price differently)
- Cross-border hint from Shin: {{CROSS_BORDER_HINT}}
  (`possibly_alike` when the user's country is in a group that can price alike,
  such as the euro area; otherwise `different_country_not_comparable`)

Rules:

1. Never convert currencies. Not for display, not to compare, not to compute a
   median. A price is in the currency the seller advertised, and it is only ever
   set against prices in that same currency.
2. Compare prices only within one country. A price found in another country for
   the same product is not evidence about a price in the user's country. Leave it
   out of the median, and give it `exclusion_reason` "other_country" if you list
   it as an offer at all.
3. Exception, regions. Inside one country, prices can differ a lot by region
   (provinces, states, cities, island or remote locations, duty-free zones). Prefer
   offers in the user's own region. When the user's region is unknown, or when you
   can only find offers from other regions of the same country, still return them
   and lower `uncertainty.overall_confidence`; say which region each offer is from.
4. Exception, similar-price groups. Some countries share a currency and a market
   closely enough that their retail prices are similar (the euro area is the
   standing example). Where the cross-border hint says `possibly_alike`, an offer
   from a neighbouring country in the same currency may be used when the user's own
   country has too few offers, marked as cross-border, never presented as local, and
   with a lower confidence. This is a fallback only: same-country offers come first.
5. If the user's country or currency is `unknown`, do not assume one. Use only the
   currency the prices you find are advertised in, keep them separate by currency,
   and use the largest same-currency set. Lower confidence and say the market was
   unknown.
6. Sizes and units in the shelf's own system (metric, US customary) are kept as
   advertised in `size`; only the comparison unit is normalised, and never by
   changing currency.
7. Language: respond in the user's language for anything shown to the user; names
   of products stay as sold. Search in the local language of the market as well as
   English.
8. Taxes: keep prices as advertised (tax-inclusive in most of the world outside
   North America) and say which in the offer, rather than adjusting them.

An answer that follows these rules with a lower confidence is always better than no
answer.
