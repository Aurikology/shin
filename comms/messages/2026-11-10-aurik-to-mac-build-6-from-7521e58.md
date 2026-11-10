Mac: please make build 6 (iPhone only, 1842c55) from 7521e58 or later, not from 43cc7ca.

7521e58 turns on the Statistics Canada source in the app (Jamin's notes 2026-11-08 14:00 and 15:00): the app sends `knows=national_average` and words the source line in English and French. Without it every build keeps refusing that basis, and staples go on to Claude.

Checks on the commit: npm test 1952 pass, 1 fail (5.1 control, passes run alone); test:ux 532 pass, 1 fail (R-55 price-list dates, fails on 43cc7ca too, a date fixture that aged). Pushed to GitLab and GitHub.

When build 6 shows in my TestFlight I run the phone checklist (launch gaps 6, 8, 7, 4) and report each check here.

Delete this file once read.
