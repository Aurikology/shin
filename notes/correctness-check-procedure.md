# Correctness check procedure (plan item 37)

A procedure for the six beta testers and whoever reads the scoreboard, not code. Matches plan
item 37 exactly: photograph the shelf tag, compare twenty verdicts against the shelf and a
second store, record the rate beside coverage.

## What each tester does, every beta scan

1. Scan the product as normal and let the app show its verdict (good price / fair / high, or
   its honest "no price yet").
2. Before moving on, take one more photo: the shelf tag itself, showing the price as printed or
   displayed at the shelf right now. This is the "price seen," and it is a separate photo from
   whatever the app's own scan used.
3. Keep that shelf-tag photo attached to that scan (same session, same product, same visit) so
   it can be matched back to the scan row later. If the app has no attachment point for this
   yet, testers keep it in a dated folder or message thread named by device and date; do not
   let it become a stray photo nobody can trace back to a scan.

## The twenty-verdict comparison

4. Once twenty scans across the six testers have both a verdict and a shelf-tag photo, pull
   those twenty scan rows and their shelf photos together.
5. For each of the twenty, compare three numbers side by side: the price the app used to make
   its call, the price on the shelf-tag photo, and the price at a second store for the same
   product (a second physical store visit or a second tracked price already in the system for
   that product, whichever is faster to get honestly; name which one was used for each row).
6. Mark each of the twenty as correct or wrong. Correct means the app's verdict (good/fair/high)
   would not have changed if it had used the shelf price and the second-store price instead of
   whatever it actually used. Wrong means it would have changed, or the app named a price that
   was not the one on the shelf.
7. A row with no second-store price available is not silently dropped; it is marked "shelf only,
   second store unavailable" and still counts toward coverage of the check, just not toward the
   two-source comparison. Do not throw away a partial row; a partial row is still a finding
   about how often a second price could be found at all.

## Recording the rate

8. Correctness rate = correct rows / twenty, stated as a fraction and a percentage, e.g. "17/20,
   85%."
9. Record it on the scoreboard beside coverage, not folded into it: coverage says how many
   products have a price at all, correctness says how often the price used was right. A high
   coverage number next to a low correctness number is itself a finding, and neither should be
   allowed to stand in for the other.
10. Record the date range the twenty scans came from and which testers contributed them, so a
    later re-run of this same check can be told apart from this one, and so a skewed sample
    (all twenty from one tester, one store, or one day) is visible rather than hidden inside a
    single number.

## What this check does not claim

Twenty scans is a spot check, not a statistical guarantee; it says whether the method is
basically sound, not what the true error rate is across the whole catalogue. If the rate comes
back low, the finding is "the pricing pipeline is wrong often enough to distrust," not "the
pricing pipeline is wrong at exactly this rate everywhere."
