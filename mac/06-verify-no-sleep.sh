#!/bin/sh
# 1f. The Mac never sleeps on power and stays on the charger.
#
# Not run. Cannot be run from Windows: pmset only reads the Mac's own power
# settings.
#
# UPDATED after the Mac inventory: a session on the Mac already ran
# `pmset -g` and it came back already correct on AC power -- SleepDisabled 1,
# sleep 0, disksleep 0, hibernatemode 3, powernap 1, womp 1, displaysleep 30.
# So this item is a VERIFY step, not a SET step. Do not run pmset -c ...
# commands that change values that already measured correct; changing a
# setting that does not need changing is itself a risk (an unrelated later
# pmset run, done carelessly, could reset the AC profile if a script here
# assumed nothing was set yet and clobbered it).
#
# What "wrong" looks like, so the Mac session knows a real failure from a
# clean pass: any of sleep, disksleep or SleepDisabled reading a nonzero
# minute value on the AC (-c) line, or SleepDisabled reading 0 or missing,
# would mean the Mac can go to sleep while on the charger -- which is the
# exact failure mode item 1f exists to prevent (a closed lid or a walk to
# campus taking the beta down while the You screen still claims it is up).
# displaysleep is not part of that failure mode (the screen going dark does
# not stop the server process) so a nonzero displaysleep value is not a
# failure here.

echo "This script is not run. It is the exact command list for the Mac session."
echo

echo "Verify (do not use -c to set anything unless this actually shows a"
echo "problem):"
echo "  pmset -g"
echo
echo "Read from the \"AC Power\" block specifically (not the \"Battery\""
echo "block, if the Mac ever runs on one):"
echo "  sleep 0"
echo "  disksleep 0"
echo "  SleepDisabled 1"
echo
echo "Expected: all three of those exact lines under AC Power, matching the"
echo "inventory (sleep 0, disksleep 0, hibernatemode 3, powernap 1, womp 1,"
echo "displaysleep 30, SleepDisabled 1)."
echo
echo "If any of sleep, disksleep or SleepDisabled do NOT match (this would"
echo "mean something changed the profile since the inventory ran), the fix"
echo "is:"
echo "  sudo pmset -c sleep 0 disksleep 0"
echo "  sudo pmset -a disablesleep 1"
echo "Then re-run pmset -g and confirm the three lines again before"
echo "treating item 1f as done."
