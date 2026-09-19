# Beta readiness audit

Date: 2026-09-08. Scope: every package (app, spine, price, catalogue, identify), the App
Store and Google Play submission processes, and the project's own status files, checked
against the founder's own bar for beta: every screen working, and every process involved
including both store submissions.

Method: read the real source of every package, ran every test suite directly, queried both
live databases directly, and researched the two stores' current requirements from their own
developer documentation. Findings below are what the code and the data actually show, not
what any status file claims about them.

## Correction to an earlier claim

An earlier pass reported the product catalogue as missing from the machine, based on a dated
note in the project's own log. That note was accurate for its date and has since been
overtaken by real work. Queried directly: `catalogue/data/catalogue.db` is a real 4.13 GB
file holding 5,182,591 rows, 618,364 of them marked sold in Canada, 718,662 of them embedded
for semantic search, broken down by source as icecat 4,972,252, openfoodfacts 122,154,
openbeautyfacts 48,943, openproductsfacts 26,948, openpetfoodfacts 12,294. A real search
against it returns real ranked results.

## Identification is not the wall. Getting a price for what's identified is.

The price database holds exactly 896 observations covering exactly 438 distinct products,
queried directly, against a catalogue of 5.18 million rows. That is roughly seven
hundredths of one percent. Most of those 896 come from a crowd receipt feed that cannot be
queried on demand for something just scanned. The mechanism that could grow this
automatically, searching Walmart's own site, is dead: Walmart's robots file disallows
crawling their search pages for every automated agent, stated directly in the crawler's own
code comments. The designed replacement (reading their sitemap instead) exists only as a
comment, not as code. Two other price sources (eBay, Best Buy) have working code but no
evidence anywhere of ever having been run against the real, live services, only against
canned test data.

## Even where a price could exist, most categories are refused by design

The catalogue's real taxonomy has over twenty thousand distinct product types. The pricing
logic understands five buckets: grocery, tech, used, furniture, and produce, and produce is
refused outright. Toys, building materials, lighting, office supplies, vehicles, clothing,
sporting goods, and medical equipment all fall through to an explicit "we know what this is,
we cannot price it yet." This is a deliberate scope limit, not a bug, but it means a large
share of what the catalogue can already name will not produce a verdict until the mapping is
extended.

## A fix the founder personally asked for was never wired into the app that ships

The founder corrected the pricing philosophy earlier: never refuse if there is at least one
seller's data to work with. A function was rewritten to match that instruction. Confirmed
directly: that function is called nowhere in the app that runs, only in its own test. The
production path still runs a separate, older set of category rules that refuse outright in
several real, common cases, meaning the exact outcome the founder called the worst possible
result is still happening in the shipped code today.

## Every screen, checked against its own code

Ten screens exist: camera, setup, saved, correct, share, you, past scans, recently removed,
market, licences. All ten are registered correctly by the router, with no orphaned files and
nothing registered that does not exist. The whole app package typechecks clean and all 288 of
its tests pass, run directly.

Two real gaps found. A price correction can be saved with no product attached to it, if
someone reports a wrong price from the settings screen before ever making a scan. The server
has no protection against crashing outright at startup, for example if a port is already in
use; everything inside a single request is well guarded, but nothing outside a request is.

Also worth recording: two of the three personality voices have no visual art of their own yet
and silently reuse the third's face, disclosed directly in the code as a known gap. And test
coverage is thinner behaviorally than the passing count suggests: half the screens have no
test that mounts them and checks their behavior, only checks that user-typed text cannot be
used to inject markup. Today's "every screen works" is true because the code was read
directly, not because an automated test would catch a future regression.

## Neither store submission process has actually started

No native app project exists anywhere in the repo: no Android manifest, no iOS project file,
no bundle identifier, confirmed by a direct search that returned nothing. Both stores require
an actual installable build before their review process can begin at all, which is a
prerequisite to every other requirement below.

Once a native build exists, in order: a privacy policy has to exist, and it does not; the
in-app privacy text currently tells users the opposite of the real data policy (it says
scans stay on the device; the real policy is that all scanned data is collected centrally to
train the models and to answer other users), so writing the policy document is not enough on
its own, the screen text has to change with it. The name has not cleared for public store use
under the project's own hard rule on trademark clearance. Account deletion and a way for a
reviewer to access the app without a real phone number are both requirements the project's own
planning already names as needed, and neither is built.

Only after all of that does Google Play's own beta mechanism become relevant, and it is a
firm platform rule, not a suggestion: a new developer account must run a closed test with
twelve real testers opted in continuously for fourteen straight days before Google will grant
production access. That clock cannot start until the native build exists. Apple's own review
queue for a new app runs roughly two to five days after submission, industry-reported rather
than a number Apple states itself. A paid tier, if built, would need to use each store's own
billing system rather than an external processor; no billing code exists yet, so this is not
a current blocker, only a constraint on however it gets built.

## Bottom line, in the order that actually gates the rest

1. No installable app exists for either store. This blocks the review process itself,
   before any other store requirement matters.
2. The in-app privacy claim is false relative to the real data policy. This has to be fixed
   before any beta user's data is collected, independent of the stores.
3. Price coverage is close to zero relative to catalogue size, and its main growth path is
   currently dead with no replacement built. This is the real ceiling on "hundreds of
   thousands of items," not the catalogue itself.
4. The pricing philosophy the founder already corrected was never connected to the shipping
   app. This should be fixed regardless of scale, since it is already wrong today.
5. The app's screens themselves are in good shape; the remaining gaps there are narrow and
   named above, not structural.
