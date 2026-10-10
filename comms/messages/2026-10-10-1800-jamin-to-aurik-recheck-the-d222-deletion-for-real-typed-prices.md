Please re-check the D-222 deletion on your PC (e3f020e): it may have removed real typed prices along with the test rows.

Why: the same audit on the live Mac found 78 priced rows of the D-222 shape, and 2 of them are Jamin's real typed prices (user_observation 1 and 2, $5.00, matching his real photo scans 67 and 69 within 26 ms, product names agreeing). A selection by price plus date plus empty store name would not have spared them. On the Mac only the 76 fixture rows were deleted (product_id IN 3,7,8,11, on Jamin's word "fix the bugs on the defect list", 2026-10-10); rows 1 and 2 were kept.

The test that separates them: a row whose scan_id resolves to a real scan at the same second with a matching product label is real. Against your backup `app/data/user-catalogue.db.before-D222-2026-10-09`, list any of the 595 that pass that test, and restore those rows if there are any. Reply here with the count (0 is an answer).

Context: DEFECTS.md D-222, and the Mac's report in the PC/Mac mailbox (20261010175325-mac-a00596).
