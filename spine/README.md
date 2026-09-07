# The spine

Given a product identity, the spine returns a verdict object carrying the comparison set, the
number of points in it, the date of each, and the sentence for that category. Or it refuses.
That is the whole of it. No camera, no mascot, no screens.

This is band 1 of the plan in `pages/shin-terminating-loop.html`. Band 1's exit is one hundred
items run through it and then twenty of those verdicts checked against live sources by something
that did not build it. Neither has happened. Read "What this does not establish" at the bottom
before you quote any number from here.

## Running it

Node runs the TypeScript directly. There is no build step and no bundler. `package.json` declares
`"node": ">=22.18"`; everything below was run on **v24.14.0**. The two devDependencies are
`typescript` and `@types/node`, and they are only for `npm run typecheck`. Nothing at runtime
imports a package.

```
cd C:\shin\spine
npm test              # node --test "test/*.test.ts"
npm run typecheck     # tsc --noEmit
node src/cli.ts sources
node src/cli.ts explain [category]
node src/cli.ts corpus [--write] [--as-of <iso>]
node src/cli.ts price "<what it is>" --asking <dollars> [--seller <name>] [--category <id>]
```

`npm test` on 2026-09-03 ran 32 tests, 32 pass, 0 fail. `npm run typecheck` exits 0.

### The corpus run

`node src/cli.ts corpus`, real output:

```
Corpus run, as of 2026-09-03T18:00:00Z
  items      7 of 100 target  (gate NOT runnable)
  verdicts   2
  refusals   5
  coverage   28.6%  vs baseline 28.6%  ->  not above

  by item
    kd-original-225g       walk_away (medium, 3pts)
    poang-used             fair (low, 4pts)
    tide-simply-2720ml     refused: all_points_from_asking_seller
    navel-oranges-3lb      refused: category_unsupported
    canon-eos-r6-used      refused: identity_unsure
    sony-wh1000xm5         refused: unusable_price_kinds
    poang-new              refused: no_source_response

  refusals by reason
    all_points_from_asking_seller 1
    category_unsupported   1
    identity_unsure        1
    unusable_price_kinds   1
    no_source_response     1

  sources
    recorded               available, available
    bestbuy                unavailable, UNVERIFIED, BESTBUY_API_KEY is not set

  read this before quoting the number above
    - Corpus is 7 of 100. Band 1's kill gate is not runnable and this coverage figure settles nothing.
    - 3 of 7 judged prices are stated stand-ins rather than observed shelf prices.
    - Unverified adapters present and never run live: bestbuy.
    - Coverage is not correctness. Nothing here checks whether a verdict is right; that is twenty verdicts against live sources, by something that did not build this.
```

The run prints its own caveats. That is on purpose, in `harness.ts`, so a reader who sees only
the number still sees what limits it.

Note the flag. Plain `corpus` prints and writes nothing. `corpus --write` is what appends a row
to `../SCOREBOARD.md` and drops the full JSON in `../scoreboard/<date>-corpus.json`.

### One price call

`node src/cli.ts price "kraft dinner original 225g" --asking 2.00 --seller Metro --category grocery --as-of 2026-09-03T18:00:00Z`, real output:

```
WALK AWAY, Kraft Dinner Original Macaroni & Cheese 225g at $2.00
  Regular price is about $1.47 across 1 store. You are looking at $2.00.
  This week it is $0.55 at Loblaw banners (limit 8).
  confidence: medium, 3 prices across 3 sellers.
  disagreement: Prices for the same thing run $0.55 to $1.47 right now. That is a 2.67x spread, so there is no single right price to quote.
```

`--seller Metro` is doing work there. Metro's own $2.00 is dropped from the comparison set, so the
set is 3 points and not 4. Without that, the thing would be measured partly against itself, which
reads as fair every time and is the quietest way for this to be wrong.

`--as-of` overrides "now" everywhere, including staleness. Every observation in the store is dated
2026-09-03, and grocery refuses anything whose newest point is over 7 days old, so a call without
`--as-of` will start refusing on 2026-09-11. That is the design working, not a bug.

## The contract

`src/contract.ts`. Everything the spine returns is `SpineResult = Verdict | Refusal`, and there is
no third member.

```ts
export type SpineResult = Verdict | Refusal;
```

A `Verdict` carries the identity, the category, the asking price and where it came from, the tier
(`good` | `fair` | `walk_away`), the sentence lines, the whole comparison set, the point count, the
oldest and newest observation dates, the spread, a confidence band with a plain sentence naming what
limits it, and a disagreement or null.

A `Refusal` carries one of eleven closed reasons (`no_identity`, `identity_unsure`,
`category_unsupported`, `no_source_response`, `too_few_points`, `unusable_price_kinds`,
`points_future_dated`, `points_too_stale`, `all_points_from_asking_seller`,
`comparison_incoherent`, `no_asking_price`), one sentence written for the user, the identity if
there was one, and whatever evidence was found. A refusal still shows its work.

**Four of those reasons are one filter condition each, and that is the point of them.** The
comparison set is filtered on usable price kind, not future dated, inside the history window, and
not the seller being judged. Until 2026-09-07 all four empty results came back as
`too_few_points`, which names a count, and self-exclusion had no message at all and was reported
as an age problem. That is D-011 and D-012. `too_few_points` now means a count and nothing else,
and nothing produces it today.

A refusal may also carry `evidenceNote`: research prose explaining why a stored identity was
doubted. It is evidence, not copy, it runs to hundreds of characters, and it belongs behind a
disclosure rather than in the sentence. It used to be concatenated into `detail` and shown to a
shopper mid aisle, which is D-013.

Two outcomes and no third, because the third one is "best guess with a shrug" and that is exactly
what the hand pilot did when it answered a Canon EOS R6 query with an R6 Mark II bundle at nearly
triple. Every price it returned was accurate and all of them were about a different camera. The
union makes that output unrepresentable rather than discouraged.

**`src/contract.ts` must not change casually.** The band 3 four-lane split rests on it holding, and
a later user interface will read these shapes directly. Add fields, never repurpose them, and never
widen a union without saying what the consumer does with the new member. A new refusal reason is a
queue item, not a one-line addition, because each reason is a different repair path in front of a
person.

## One question per category

The categories are not one comparison with different numbers. They ask different questions, and
`src/categories.ts` exists because that was the pilot's finding. `node src/cli.ts explain` prints
each rule with its reasoning.

**Grocery** compares the regular shelf price against this week's promotion, and returns two lines
rather than one, never an average. One 225g box of Kraft Dinner ran from $0.55 on a limit-8
promotion to $1.47 regular in the same week, and both numbers were real. Averaging them produces a
verdict that is wrong in both directions. The regular line is the one still true next week; the
promotional line is the one that makes someone move. Two points from two sellers, newest within
7 days, because promotions turn over weekly.

**Tech** compares against other retailers, and nothing else. Three points from three distinct
sellers with the newest within 3 days, which is the strictest set here because this is the
best-served category and a thin comparison has no excuse. Manufacturer list price is excluded from
`usableKinds` on purpose: the pilot found $429.99 list for the WH-1000XM5 and zero live retailer
prices, and list alone is not a comparison. That item still refuses today, with
`unusable_price_kinds`.

**Used** compares against live comparable asking prices, and treats them as what they are. An
asking price is what a seller hopes for, so it leans high by construction, and the reference is the
25th percentile rather than the median. Two or more `sold` prices displace the asking set entirely,
because a sold price records what someone was actually willing to pay. The identity floor is 0.90,
the highest of any served category, because the worst pilot failure was here and it was an identity
failure rather than a price one.

**Furniture** compares an item against its own history, because there is no second seller. Nobody
else sells a POÄNG. `minDistinctSellers` is 1 and that is the whole point of the category. Five
points across a 365 day window, because a rolling promotion is only visible against a baseline, and
IKEA promotions never appear on the product page.

**Produce is deliberately unserved**, and it refuses as a category before any request is spent on
it, with `category_unsupported`. Three problems stack: a PLU names a category rather than a product
(4011 has meant "bananas" since 1990), package formats break unit comparison, and the public price
series measures underlying inflation rather than the shelf this week. Its thresholds are written
down anyway, for the day it is promoted. The reversing condition is in the code, not in a document:
crowdsourced shelf-price volume in one city reaching the point where a produce item has two
independent reports more often than not. That is band 2.3, and produce is the first thing promoted
if it survives.

Every threshold, from `src/categories.ts`:

| category | counts as usable | min points | min sellers | newest within | history window | identity floor |
| --- | --- | --- | --- | --- | --- | --- |
| grocery | regular, promotional | 2 | 2 | 7d | 14d | 0.80 |
| tech | regular, promotional | 3 | 3 | 3d | 30d | 0.85 |
| used | asking, sold | 4 | 2 | 30d | 90d | 0.90 |
| furniture | regular, promotional | 5 | 1 | 21d | 365d | 0.85 |
| produce | unserved | 4 | 3 | 3d | 7d | 0.95 |

Two thresholds are global: a same-kind spread of 8x or more makes the set incoherent and the spine
refuses, and a spread of 2x or more raises a `wide_spread` disagreement that is shown rather than
smoothed away.

## Source adapters

`src/sources/source.ts` is the interface. Five members:

```ts
readonly id: string;
readonly label: string;
readonly categories: readonly CategoryId[];
readonly verified: boolean;
available(): SourceAvailability;
identify(query: SpineQuery): Promise<ProductIdentity | null>;
prices(identity: ProductIdentity, asOf: string): Promise<readonly PricePoint[]>;
```

`identify` and `prices` are separate because they are two different failures with two different
repairs, and a combined `lookup()` hides which one happened. `available()` returning
`{ ok: false, reason }` is a normal reportable state and not an error; a source without credentials
is skipped, and the reason is printed.

Order in `src/sources/registry.ts` is trust order, because `resolveIdentity` breaks confidence ties
by taking the first source. Recorded observations come first, then observed prices, then the two
live adapters. eBay is last of all, because of the kind of number it returns rather than anything
about the adapter: it can only see what strangers are ASKING, which the contract defines as
upward-biased and never a clearing price, so it breaks no ties.

- **`recorded`** reads `data/observations.json`. Every price in it was read off a public Canadian
  source by a person on 2026-09-03 and carries that date. It touches no network, which is why the
  spine is runnable and testable today with no credential. It is `verified: true`.
- **`bestbuy`** is `verified: false`. **It is written and it has never been run against a live
  endpoint.** Nobody here has held a key, so no request has ever left this machine to
  `api.bestbuy.com`. `node src/cli.ts sources` prints it as `unavailable UNVERIFIED` because
  `BESTBUY_API_KEY` is not set, and the corpus report names it in its caveats.
- **`ebay`** is `verified: false`, same status and same reason. Set `EBAY_APP_ID` and
  `EBAY_CERT_ID` to turn it on, which are the names eBay's own console uses; `EBAY_CLIENT_ID` and
  `EBAY_CLIENT_SECRET` are accepted too. `EBAY_DEV_ID` is not used at all: it belongs to the older
  Trading API and plays no part in the OAuth exchange.

  Two things nothing loads for you. Node does not read `.env` on its own, so a runner needs
  `--env-file=.env`. And `EBAY_ENV=sandbox` switches the host, because sandbox and production are
  separate keysets against separate hosts and sending one to the other is a bare 401.

  **A sandbox run can never set `verified: true`.** The sandbox is a functional fixture with a
  small set of seeded listings, not a copy of eBay, so a green sandbox call proves the credentials,
  the OAuth exchange, the request shape and the parsing, and proves nothing about whether real
  Canadian listings come back or what they cost. Only a production run whose result goes in the
  scoreboard can flip that flag.

  If eBay answers `invalid_client`, the thrown error now names what to check. The mistake that
  happened here first time: the Dev ID pasted into the secret, because it is visible in the console
  while the Cert ID sits behind a "show" toggle, and both are UUID-shaped. The App ID and Cert ID
  carry an `SBX` or `PRD` stamp matching the keyset; the Dev ID does not.

  It covers `used` and `tech`, deliberately never `grocery`,
  because eBay grocery listings are bulk, imported or collectible packaging and none of those is a
  comparable for a box on a Canadian shelf.

  **It cannot tell you what anything sold for.** Sold and completed listings are behind eBay's
  Marketplace Insights API, a Limited Release that eBay describes as restricted and not open to new
  users. The free Browse key does not reach it, so every point is `kind: 'asking'`. This is the same
  wall the 2026-09-03 pilot hit from the other side, when it recorded eBay sold listings "under
  US$2,000" for a used Canon and correctly refused to use it: a bound, in the wrong currency.

  Four filters, each preventing a wrong number rather than a noisy one. Requests go to the Canadian
  marketplace and each item's own currency is checked against CAD anyway. Auctions are excluded at
  the query, because a $1 opening bid is not an asking price and would drag a verdict to walk-away
  on a number nobody will pay. The point is the delivered price, item plus stated shipping, and a
  listing whose shipping is not stated is skipped rather than assumed free. Items shipping from
  outside Canada are dropped, since duties and weeks of delay are not in the price.

  Its daily budget is 5,000 calls for the whole application rather than per user, which is roughly
  2,500 scans a day across everyone at once before eBay's free Application Growth Check is needed.

What `verified: false` means, plainly: the code path exists, its shape compiles, and nothing about
whether it returns a correct price, a wrong price, or anything at all has been established. It is
still open whether that base URL serves Canadian pricing and what one API token buys.

The flag exists because **an unverified adapter returning nothing is indistinguishable from a
category that genuinely has no prices.** Both produce an empty array, both produce the same
`no_source_response` refusal, and coverage drops identically. Without the flag surfaced in every
report, a broken adapter reads as an honest market finding forever. It must stay `false` until
someone runs it live with a real key and puts the result in the scoreboard.

It exists now for one reason: it is the second implementation of `PriceSource`, and an interface
with one implementation is not an interface. Adding it did not require changing `source.ts`. If it
had, that would have been the finding.

## What this does not establish

Be blunt with yourself about this file, because everything above is easy to mistake for progress.

**Coverage is not correctness.** The only number the spine produces is how often it answers at all.
Nothing anywhere in this repository checks whether an answer is right. The corpus run says so in its
own output.

**Nothing here has been checked against a live source.** Every price in `data/observations.json`
came from a person reading a page on one day. The one live adapter has never run. Four direct
retailer page fetches on 2026-09-03 returned zero prices: Loblaws, Best Buy Canada and Metro all
answered 403, and IKEA served its nav menu. That is why no scraping adapter exists.

**The corpus is 7 real hand-priced items against a target of 100, so the kill gate cannot be run.**
`gateRunnable` is `false` and will stay false until the corpus is filled. Band 1 is killed if it
cannot comfortably beat the pilot's 2 of 7. Today it produces exactly 2 of 7, which is 28.6%
against a 28.6% baseline, and is therefore not above it. That is not a passing result and it is not
a failing one either. It is the same measurement reproduced, which is all a 7 item corpus can
support. Filling it to 100 is hand work and it is queue item 1.2.

**3 of those 7 judged prices are stated stand-ins rather than observed shelf prices**, listed in
`data/corpus.json` under `askingProvenance` with the reason for each.

**The baseline itself has a known discrepancy.** The master plan records the pilot as 2 of 7 and the
session notes summarise it as 1 of 7 while their own table shows two rows that answered. 2 of 7 is
what the corpus uses, and the conflict is logged in `DEFECTS.md` rather than quietly resolved.

**The tier thresholds are judgment with the reasoning written beside them. They are not
benchmark-backed and must not be quoted as if they were.** Every number in the table above, every
identity floor, the 8x incoherence ratio, the 2x wide-spread ratio, the 1.02 and 1.08 and 1.1 and
1.15 multipliers inside the judges: all chosen by a person before the corpus was run. Choosing them
before the run is the only property that makes them honest, and the first one the scoreboard
contradicts should move.

**Confidence bands are a formula, not a calibrated model.** `confidenceOf` in `src/spine.ts` says so
in its own comment. Calibrating it is a band 4 item and it is gated on having verdicts to calibrate
against.

**The tests lock shape, not results.** `test/corpus.test.ts` deliberately does not assert a coverage
target. Asserting the number the kill gate is written against would turn the gate into something
that passes because a test says so.

## Files

```
src/contract.ts        the two outcomes and every shape. Do not change casually.
src/spine.ts           priceIt(). The order of its checks is the design.
src/categories.ts      one rule and one sentence per category, thresholds and reasoning.
src/money.ts           integer cents only. No float goes near a price.
src/harness.ts         the corpus run, the report, and the scoreboard writer.
src/cli.ts             the only interface band 1 gets.
src/sources/source.ts  the adapter interface, plus text normalisation and overlap.
src/sources/recorded.ts  hand observations. verified.
src/sources/bestbuy.ts   written, never run. verified: false.
data/observations.json   every price a person actually read, with its date.
data/corpus.json         the 7 items, the 100 target, and the recorded baseline.
test/                    32 tests. Shape, not scores.
```

Sitting above this folder: `../SCOREBOARD.md` is the run history, `../QUEUE.md` is what is next,
`../PASS.md` is the weekly pass record, and `../DEFECTS.md` is where known defects live.
