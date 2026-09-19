# ALTERNATIVES: FRAGMENT FOR scan_prompt.md

Built for beta-gaps item 18 (2026-09-19). This is a new file and a fragment, not
part of the live prompt: the owner of `scan_prompt.md` places it, and adds the
`alternatives` array to `response_schema.json`. The catalogue side that reads the
answer is `catalogue/src/alternative-modes.ts` (`parseAlternativesAnswer`), which
accepts the snake_case names below and repairs or drops a bad row instead of
failing the scan.

Why alternatives ride in the one scan call: Shin does not consult its own catalogue
to answer a scan (the rule of one Gemini call per scan), so the competing options
come from the same answer as the product, the prices and the price math.

Jamin's words behind it, 2026-09-17: Shin "should also find competitive
alternatives. This can be anywhere from recommending non organics for an organic
product scan: non organic spinach for 2 dollar less, or tech products: buy the
used version for 200 dollars less. or: buy the new model for 200 dollars more".
Two scenarios: validation ("a farm product comparison might be useful", "even a
used item on ebay might provide them with validation that a product is not a good
price") and switching ("genuinely considering buying something or traveling to
another store to get a cheaper alternative ... they would definitly not accept a
farm alternative if they are buying in a supermarket"; "someone buying from a farm
might consider buying from a supermarket"). "There needs to be constraints in
place for things like buying things in massive bulk." And his standing note: his
examples are not the only aspects of the problem.

Constraint origin is marked. `[JAMIN]` is his own example. `[SUGGESTED]` was
reasoned from his notes and is open to strike.

---

## ALTERNATIVES

Also return `alternatives`: other things the user could buy instead of the scanned
item, or could weigh it against. Alternatives are NOT part of the median above and
never change `price_verdict`.

### Mode

Mode for this scan: {{ALTERNATIVES_MODE}} (`validation` or `switching`).
Where the user shops (store type, if known): {{USER_STORE_TYPE_OR_UNKNOWN}}
Condition the user is buying (`new`, `used`, `refurbished` or unknown): {{USER_CONDITION_OR_UNKNOWN}}
How far the user will travel, km (if known): {{USER_MAX_TRAVEL_KM_OR_NULL}}
Has a paid membership (warehouse club etc.), if known: {{USER_HAS_MEMBERSHIP_OR_NULL}}
Attributes the user requires (vegan, gluten-free, organic...), if any: {{USER_REQUIRED_ATTRIBUTES_OR_NONE}}

The two modes are different jobs, not a strict and a loose setting.

- `validation`: the user is asking "is this a good price?". Evidence they would
  never actually switch to is still useful here: a farm price, a used listing, a
  bulk-pack unit price. Include it, and mark it in `constraint_notes`. A used
  listing must never be used to judge a new item as a bargain or a rip-off: mark it
  `used_price_is_evidence_only`.
- `switching`: the user is genuinely considering buying the alternative, or going
  to another store for it. Return only what they would really accept. Leave out
  anything the constraints below rule out. Do not pad the list.

### Constraints

Apply every constraint, and decide sensibly on a constraint not listed: the list
is a starting set. If you cannot tell whether a constraint applies (you do not
know the store type, or the condition), keep the alternative and say so in
`constraint_notes` with `unverified`. Never drop an alternative only because a
fact is missing.

1. [JAMIN] Bulk. A pack five or more times the size of the scanned one (or the
   scanned one being five or more times the alternative) is cheaper per unit by
   nature. `switching`: leave it out. `validation`: include it, note `bulk_pack`
   (the alternative is the big one) or `original_is_bulk`.
2. [JAMIN] Farm versus store. `switching`: a user in a supermarket or other store
   does not accept a farm, farmers' market or direct-from-producer alternative;
   leave it out. `validation`: include it, note `farm_price_is_evidence`. A user
   who is buying at a farm may accept a supermarket option, in either mode.
3. [JAMIN] New versus used. A user buying new does not accept used or refurbished
   in `switching`; leave it out. In `validation` include it, note
   `used_price_is_evidence_only`. A user buying used may be shown a new option.
4. [SUGGESTED] Travel. `switching` only: leave out an alternative farther than
   the user's stated travel distance, when both are known.
5. [SUGGESTED] Membership. An alternative that needs a paid membership is not a
   price every shopper can pay. `switching`: leave it out unless the user has one.
   `validation`: include it, note `membership_needed`.
6. [SUGGESTED] Required attributes. In `switching`, never offer an alternative
   that lacks an attribute the user requires (a vegan user is never offered a
   non-vegan one). If it is not known to have the attribute, keep it and note
   `attributes_unverified`.
7. [SUGGESTED] Upgrades. A newer model that costs MORE is an upgrade, not
   evidence about the scanned price. `switching`: include it, kind `newer_model`,
   note `upgrade_costs_more`. `validation`: leave it out.
8. Same kind of thing. A different product is only an alternative if a shopper
   would use it for the same purpose. Do not offer a cheaper thing that is not
   the same job.

### Currency and market

Every alternative price is the seller's own price in the seller's own currency, in
the user's market. Never convert a currency. Leave out any alternative you can
only find priced in another country's currency. See the market rules.

### Output shape

`alternatives` is an array, at most 5, best first, possibly empty. An empty array
is a correct answer when nothing fits; do not invent one to fill it. Each item:

```
{
  "name": "product as sold",
  "brand": "brand or null",
  "kind": "same_product | substitute | used_copy | newer_model | other",
  "store_name": "seller name or null",
  "store_type": "supermarket | big_box | pharmacy | warehouse_club | convenience | farm | farmers_market | specialty | online_retailer | online_marketplace | other | unknown",
  "condition": "new | used | refurbished | unknown",
  "price_cents": 0,
  "currency": "ISO 4217 code the seller quotes",
  "size": { "value": 0, "unit": "as advertised: g, kg, ml, l, oz, lb, fl oz, item..." },
  "unit_price_cents": null,
  "membership_required": null,
  "distance_km": null,
  "attributes": ["organic", "vegan"],
  "url": "source url or null",
  "constraint_notes": ["bulk_pack"]
}
```

`kind`: `same_product` is the same product at another seller; `substitute` is
another product of the same kind (non-organic for organic); `used_copy` is a used
copy of the same product; `newer_model` is an upgrade.
`price_cents` is an integer in the currency's minor unit as the seller advertises
it. Keep the advertised `size` exactly; give `unit_price_cents` in the comparison
unit only if you can do it without guessing (per 100 g, per 100 mL, or per item;
tech is never compared by weight). Null is always allowed; a field you do not know
is null, never invented.
