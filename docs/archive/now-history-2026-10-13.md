# NOW.md history, moved out 2026-10-13 (line cap)

## Tester-launch fixes, 2026-09-28 (Jamin: *"do all 1-12 including the iphone build, switching the new catalogue path on"*)

**Pushed and checked on the PC** (1d9dd38, d155d3c; per-row detail in `DEFECTS.md`): device
isolation (D-145, D-155, D-156, D-158, D-159 closed for bound devices; D-157 partly: an invented
device id still gets fleet figures), frame caps (D-160, D-162), nothing written before the invite
gate (D-161), settings file (D-146), provider failure wording (D-150), buy and restore taps
recorded, location asked once (D-139), shelf stream off without photo ID and photo consent off by
default (D-148), photos under SHIN_DATA_DIR (D-163, code), the 0068100084245 "Kraft Dinner" cache
row (a leaked test fixture; deleted on the PC), terms and privacy at /legal/ (D-144), app name Shin
and id com.useshinapp.shin (Android; iOS on the Mac), store listing and privacy declarations, an
Android debug APK built on this PC. App tests 1558 of 1558; 9 of 9 live server checks.

**Not done yet:** the Mac has not picked up either mail (iPhone build + paid-key check,
20260928053407-pc-806590; pull, restart, photo move, cache row, 20260928063225-pc-252cb2): no
Mac session was open. Catalogue first is on in code (2026-09-28); the Mac has not yet restarted onto it.
Nothing has been opened on a real phone.
