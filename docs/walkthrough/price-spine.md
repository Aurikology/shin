# The price history spine's evaluation harness

This is not the pricing engine itself. It is the separate program that runs a fixed batch of
already-known items through that same pricing engine, unattended, and turns the result into one
report a person can read without having priced anything by hand that day. Everything below was
opened directly this session, and every command described was actually run against the code as it
exists today, on 2026-09-15, rather than assumed from a document describing it.

## What one run is built from

1. The harness does not simulate the pricing engine or fake its inputs. It calls the exact same
   function a live scan and the single-item command line tool both call, handed the exact same
   real dependency bundle a live run would use: a plain list of every real source of prices the
   product has today.

2. That dependency bundle is six real sources, wired together in a fixed order that is itself a
   decision about trust, not just a list:
   - A file of prices a person personally read off a public Canadian page or site on one specific
     day, with the date attached. It touches no network at all, so it is the one source that works
     with no credential, and it is confirmed by the fact that a person read the number, not by any
     code check.
   - Prices a shopper typed in themselves, from the tag standing in front of them. This source
     cannot identify a product at all, on purpose: a mistyped correction should never be able to
     point a later scan at the wrong item, so it only ever supplies a price once the item is
     already known some other way, and its own history records one real end-to-end submission that
     was checked by a person against the running system, which is why it is the one source
     confirmed as true rather than merely present.
   - A read-only connection to several hundred already-collected retail price rows sitting in a
     database the wider product already writes to. This is real, previously-collected market data,
     not a placeholder. But its own reading logic, matching a row to the right product and working
     out which shop it actually came from, has never itself been checked end to end by a person the
     way the hand-read file was, and it is flagged as unconfirmed for exactly that reason, never
     because the underlying numbers are doubted.
   - Three further sources, each fully written and each carrying real logic (currency checks,
     filters against known bad listing shapes, in one case explicit protection against a repeat of
     the human pilot's single worst failure), that have never made one live call to their real
     destinations, because nobody working on this has yet obtained a paid access credential for any
     of the three. One covers a big consumer electronics retailer's own catalogue. One covers a
     well-known auction marketplace, restricted to what people are currently asking rather than
     what anything actually sold for, because the free tier of that connection cannot see completed
     sales at all. The third exists specifically to reach completed, sold listings on that same
     marketplace, which the pricing rulebook ranks above every other kind of number, because it is
     the one kind that records what someone was actually willing to pay rather than what they
     hoped for.

3. A source with no working credential is not merely marked down, it is excluded from the run
   entirely before a single item is priced. Every run first drops any source that reports itself
   unreachable, and if that leaves nothing at all, the whole batch is refused outright rather than
   silently priced off less than was intended. So today, three of the six sources contribute
   literally nothing to any run of this harness, and their absence shows up only as a status line
   naming them, never as a difference in the prices actually used.

4. Being reachable and being confirmed are two separate facts, tracked separately, and a run
   prints both every single time rather than once during setup. A source can be reachable and
   still unconfirmed, which is exactly the crawled-database source above: it answers every query
   it is asked, and nobody has independently checked that what it answers is right. The report
   treats those two conditions as different things throughout, because an unconfirmed source that
   happens to return nothing is otherwise indistinguishable from a real absence of prices in the
   market, and the entire point of tracking the distinction is to stop that ambiguity from hiding
   inside a single number.

## What is fed in

5. The batch itself is seven real items, each one priced by hand by a person on one specific day,
   stored with the exact search text used to look it up, which of the five product categories it
   belongs to, the price it is being judged against, and, critically, where that judged price
   actually came from. For three of the seven, the batch says plainly that no real observed price
   existed for the item and a person entered a stated placeholder instead, naming the reason for
   each: no single listing was picked out of a wide-ranging used-goods market, no price at all
   could be found on several manufacturer pages for a piece of new furniture, and no real market
   price existed for the specific used item actually being asked about. That labelling exists so a
   reader of the eventual report is never left thinking a placeholder was something a shopper
   actually saw on a shelf.

6. Seven is explicitly not the real number this component is meant to run against. The batch file
   itself records the real target as one hundred, and every report a run produces refuses, in its
   own printed words, to call the batch's outcome a real pass or fail until that number is reached.
   Today it is not close: seven of the required one hundred.

7. Every item in the batch is judged at one fixed point in time, stamped into the batch itself
   rather than read off the clock the run happens to execute on. This matters because the pricing
   rules refuse anything whose newest price has gone stale, on a per-category window as short as
   three days for the best-served category. Without a fixed point in time, the exact same seven
   items would silently start refusing more, purely because more days had passed since they were
   hand-priced, which would make this component's own number drift for a reason that has nothing
   to do with whether the pricing logic actually works.

8. **The batch also carries its own comparison point, and that point is itself disputed, unresolved,
   and carried into the batch rather than quietly settled.** It records how many of the same seven
   items a human being, working by hand on the same day, managed to produce a usable price range
   for. That number is recorded as two of seven, and the batch file states outright that this is a
   judgment call: one internal planning write-up states the human pilot answered two of seven, a
   second write-up covering the identical run states one of seven, and that second write-up's own
   table actually shows two rows that were answered, directly contradicting its own summary
   sentence. The higher count is the one actually used by the harness. I checked the project's own
   defect log for whether this had since been resolved: it has not. The entry is still marked open,
   still asks for a person to say which write-up is correct, and states plainly that this leaves
   the real pass-or-fail bar uncertain by one whole item, since the stated exit condition for this
   entire component is to "comfortably beat" that same disputed number.

## What each item is put through

9. Every item passes through one shared sequence, in a fixed order, and the order is itself a
   design choice: what the item is gets settled completely before any price is looked at, because
   the worst thing the human pilot produced was a confident price attached to the wrong product, a
   used-camera search that returned a newer, lens-bundled version of the camera at nearly triple
   the price, with every individual number in that answer being accurate.

10. In order: the item's identity is resolved by asking every currently reachable source to
    identify it and taking whichever answer carries the highest stated confidence, ties broken by
    the trust order the source list is built in. If nothing resolves it, the run refuses outright.
    If it resolves to a whole category the pricing rulebook has decided not to serve at all (only
    fresh produce today, refused before a single price request is even made, because a shelf code
    for produce names a class of item rather than one product and the only source that could really
    answer is a shopper standing at the shelf), it refuses. If it resolves, but too weakly to trust
    a price against it, it refuses and names the closest match instead of a number, which is the
    exact repair the camera failure needed and did not have.

11. Past that point, every reachable source covering the item's category is asked for a price, and
    if literally nothing comes back, it refuses. What does come back is filtered down to what the
    category is even allowed to compare (a manufacturer's list price, for instance, counts for
    nothing in the electronics category, because a list price with no actual retailer behind it is
    not a comparison). A closed, documented defect records that this filtering used to collapse
    four separate conditions into two vague messages, so an item refused because its only prices
    belonged to the very shop being priced against was reported instead as though its prices were
    simply too old. Today each stage of the filter names itself as the actual cause when it is the
    one that empties the set.

12. **When that filtering leaves nothing to compare, the harness no longer refuses immediately, and
    this is a dated, deliberate policy change rather than a change in how much real price data
    exists.** It first tries to build a thinner, lower-confidence answer from whatever raw prices
    were actually found, naming the exact shortfall (too few points, too few distinct sellers, one
    seller's own history standing in for a real comparison) as part of that answer's stated
    confidence, and only refuses outright if even that fails, for instance when every price found is
    dated later than the moment being priced, or when the only prices left are single, typed
    numbers from one shopper each, with nothing else to check them against. The project's own test
    file for this exact behaviour states, about itself, that what changed was "the refusal, not the
    supply." Two of this harness's four current live answers in the seven-item batch exist only
    because of this change: each rests on exactly one held price, where the category's own rule
    would ordinarily have wanted it several times over.

13. Only after all of that does the category's own comparison rule actually produce a plain
    "good", "fair" or price-to-avoid judgment and its sentence, with every category asking a
    different question of the same prices: the same shelf price against this week's promotion for
    groceries, against every other retailer's price for electronics, against a spread of other
    people's asking prices for used goods, against the item's own price history where nothing else
    sells it at all, as with a piece of flat-pack furniture nobody else carries.

## What the harness measures

14. Against that shared sequence, the harness counts, for the fixed seven-item batch: how many
    items produced an actual priced answer, how many refused, and, for every refusal, the specific
    technical reason it refused, tallied by reason so a reader can see whether the batch's failures
    cluster on one cause or are spread out. It states its own answer rate as that count divided by
    seven, and states the human pilot's own rate immediately next to it, with a plain word for
    whether the run sits above, level with, or below the human one.

15. It states this in its own printed words every single time, rather than leaving a reader to
    assume it: this is a measure of how often the component will answer at all, never of whether an
    answer, once given, is correct. Nothing in this harness, or anywhere else opened this session,
    checks a produced price judgment against a real shelf or a real live listing. That check is a
    separate, still-planned step, a person with no connection to whoever built this taking a sample
    of the answers and going to check them against real prices, and it has not happened.

16. It also counts, separately, how many of the seven judged prices were something a person
    actually observed rather than a stated placeholder (four of seven today, the other three named
    above), and whether the batch has reached the real size needed before its human-baseline
    comparison can mean anything (it has not: seven of the required one hundred). And it restates,
    every time, which of the six connected sources have never been confirmed against their own live
    destination, by name, so an unconfirmed source silently returning nothing can never be mistaken
    for a category the market genuinely has no prices in.

## What a run actually outputs

17. Run plainly, the harness only prints its report to the terminal and writes nothing anywhere
    else; the moment that terminal closes, the result is gone and nothing about that specific run
    can be looked back on later. Run with one extra flag, it does the same printing and
    additionally writes one dated file capturing everything about that run in full, plus appends
    exactly one summary line to a separate, running, human-readable log that already holds every
    earlier recorded run, so a reader can see the whole history of this measurement over time
    without opening any of the dated files individually.

18. I ran the plain version myself this session, against the code exactly as it exists today. The
    report printed: the point in time every price was judged against; that the batch holds seven of
    the required one hundred items and that the real pass-or-fail comparison cannot be run yet;
    four items answered and three refused; an answer rate of about fifty-seven percent against the
    human pilot's roughly twenty-nine percent, labelled as sitting above it; then, one line per
    item, showing either the confidence level and how many prices it was weighed against, or the
    specific reason it refused; then a count of refusals grouped by reason; then, for every one of
    the six sources, whether it is currently reachable and whether it has ever been confirmed,
    printed even for the three that are not currently reachable at all, each one naming that a
    required paid credential is simply absent; and finally, always last, a fixed block of warnings
    the report writes about its own number: that the batch is too small for its comparison to
    settle anything yet, how many of the judged prices were placeholders rather than something
    actually seen, which sources have never been confirmed, and the same blanket reminder that none
    of this checks whether an answer was right.

19. Running the underlying automated test suite the same way, the same session, all two hundred
    and twenty-three checks currently written for this component passed, including one that locks
    the exact shape of this same seven-item comparison (which items answer, which refuse, and for
    which named reason) while deliberately never locking in the answer-rate number itself as
    something a test can force to pass, on the stated reasoning that doing so would let the
    pass-or-fail gate pass because a test asserted it, rather than because the batch actually
    cleared it.

## Where the written account and the running code disagree

20. An internal readme document for this component states, as a concrete worked example of its
    real output, a run that answered two of the seven items for a rate of about twenty-nine
    percent, exactly level with the human baseline. I ran the identical command against the code as
    it exists today and got four of seven, about fifty-seven percent, above the baseline, not level
    with it. This is not a difference in wording, it is a different number describing the same
    measurement. The documented example predates the policy change described above, and nobody has
    gone back to update it, even though the correct, current number is already sitting in the
    separate running log this same component maintains, and matches exactly what running the
    command produced for me just now.

21. The same readme document states this component's automated test suite as thirty-two tests, all
    passing, as of an earlier date. A separate internal planning document, written between then and
    now, states the identical fact as fifty-eight tests. Running the actual command myself this
    session gives two hundred and twenty-three. All three numbers describe the same command, at
    three different real points in the project's life, and none of the three documents has been
    corrected to say so. A reader who opens only the oldest of the three today is told something
    false about a number they could check themselves in seconds.

22. The single-item command line tool's own documented example output has also drifted from what
    the same command prints today, in wording rather than in substance: the exact phrasing of the
    regular-price sentence and the confidence line in that document no longer match, character for
    character, what the identical command against the identical item on the identical date produces
    now, even though the underlying judgment itself, a price-to-avoid verdict driven by the same
    numbers, has not changed. This is the same staleness pattern as the two points above, on a
    smaller and less consequential piece of text.

## Open decisions, named rather than resolved

23. Whether a seven-item result can stand in for anything at all before the real one-hundred-item
    batch exists is not settled by the code, which does both things at once: it computes and prints
    the human-baseline comparison on the seven-item batch every single time, and it also prints, in
    the same breath, that this comparison is not the real pass-or-fail gate yet. Nothing decides
    which of those two instructions a reader should act on if an answer were needed before the full
    batch is built.

24. The jump in this component's own headline number, from two of seven to four of seven, rests
    entirely on the decision to answer while holding a single price rather than refuse for want of
    more of them (item 12 above), not on any new price having actually been found. The project's
    own automated test file says this about itself in plain words. The harness's own printed
    warnings do not say this anywhere; a reader who reads only the report, and never the project's
    separate defect and planning records, has no way to learn that half of today's answers rest on
    exactly one held price under a recently loosened rule, rather than on the kind of multi-seller
    comparison the category rules were actually designed around.

25. The dependency bundle treats a source that has never been confirmed against its real
    destination exactly the same as a fully confirmed one for the purpose of actually pricing an
    item: both kinds of source's prices are gathered, filtered and judged by the identical code
    path, and the only thing distinguishing them anywhere in the output is a printed word next to
    the source's name and one line in the closing warnings, never a different weight inside the
    price judgment itself. I checked which source actually supplied the prices behind all four of
    today's answers: every one of them traces back to the hand-checked file, none to the unconfirmed
    database connection, so today's headline number happens not to rest on any unconfirmed source.
    But nothing in the mechanism guarantees that stays true as more real prices are added over time,
    and nothing in the report would visibly change on the day it stops being true.
