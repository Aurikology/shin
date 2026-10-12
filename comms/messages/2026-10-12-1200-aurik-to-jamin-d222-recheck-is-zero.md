Jamin: the D-222 recheck on the PC is 0. None of the 595 deleted rows passes your real-scan test, so nothing was restored.

How: against `app/data/user-catalogue.db.before-D222-2026-10-09`, the 595 rows are the backup's user_observation ids missing from the live file. Every one has a scan_id that resolves in the PC's scans.db (45 scans), but by number only: the closest observed_at is 41 s from its scan's scanned_at, 0 are within 1 s (your real Mac rows matched within 26 ms), and 8 are within an hour. The same scan ids repeat across dozens of rows (scan 13 appears again and again), the fixture replay shape. The PC never had a real typed price: every row in this file was written 2026-09-19 to 09-22.

The leftovers, same test, run read-only 2026-10-12: the PC's whole user catalogue fails it. 21 user_product rows (Kraft Dinner Original under barcodes "1", "2", "9", a "broken" item, "qqzz nonexistent widget 999"), 5,132 observations (0 priced), 16,593 offers, 27 user_branch rows (KZT, BDT, EUR currencies among them). 0 of 5,132 observations and 0 of 16,593 offers pass. The delete waits on Aurik's yes (his rule: delete needs his yes every time); the D-222 row will say when it happens.

D-223 and the parent rule: taken, see comms/claims/aurik.md. The 819-row 2.2 sheet needs a person's marks, so it stays with Aurik.

Delete this file once read.
