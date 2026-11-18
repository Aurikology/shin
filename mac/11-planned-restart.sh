#!/bin/sh
# mac/11-planned-restart.sh -- restart the Mac ON PURPOSE (macOS updates, the monthly patch) without it stopping at
# the FileVault unlock screen. A person runs this at the Mac or over SSH; it asks for Jamin's password, so it
# cannot run by itself. Anything that restarts the Mac unplanned (a power cut) is NOT covered: see the table in
# mac/README.md ("What still needs a person").
#
#   sudo sh mac/11-planned-restart.sh --dry-run   say what it would do
#   sudo sh mac/11-planned-restart.sh             install pending updates, then an authenticated restart
#   sudo sh mac/11-planned-restart.sh --after     after the Mac is back: wait for the server, run the verify
#   (--yes skips the "are you sure" question)
#
# How the restart works:
#   * `fdesetup authrestart` (man fdesetup) restarts the Mac and passes the FileVault credential to the next boot
#     once, so the boot does not stop at the unlock screen. It asks for a FileVault-enabled user's password.
#   * On Apple silicon the credential is single-use, and Apple notes FileVault protections are reduced for that one
#     boot. Sources: fdesetup(8); Apple developer forums thread 774703.
#   * Pending macOS updates: `softwareupdate --install --all` WITHOUT --restart stages what needs a restart; this
#     script then restarts with authrestart. NOT VERIFIED on this Mac: whether a staged macOS update finishes
#     installing on an authrestart boot. --after therefore prints `softwareupdate --list` again: if the update is still
#     listed, run this once more, and if it still is, install it from System Settings > General > Software Update
#     (that one needs Jamin at the Mac and the password at the unlock screen afterwards).
#
# With FileVault OFF there is no unlock screen and a plain restart does the job; the script says so and uses one.
# The server, tunnel and jobs are LaunchDaemons (mac/10-boot-survival.sh) so they start by themselves at boot.
# Do not run it while a deploy is mid-way (the status page says "updating"): it would restart under the deploy.
#
# Overrides for tests: SHIN_AFTER_WAIT_SECONDS (default 300).

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DRY=0
YES=0
AFTER=0
for _a in "$@"; do
  case "$_a" in
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    --after) AFTER=1 ;;
    *) echo "usage: sudo sh 11-planned-restart.sh [--dry-run] [--yes] [--after]" >&2; exit 2 ;;
  esac
done

CONFIG_FILE="${SHIN_CONFIG_FILE:-$SCRIPT_DIR/config.env}"
say() { printf '%s\n' "$*"; }
die() { printf '11-planned-restart.sh: %s\n' "$*" >&2; exit 1; }
run() {
  if [ "$DRY" = 1 ]; then
    printf 'would run:'
    for _x in "$@"; do printf ' %s' "$_x"; done
    printf '\n'
  else
    "$@"
  fi
}
cfg() {
  [ -f "$CONFIG_FILE" ] || return 0
  grep -E "^[[:space:]]*$1=" "$CONFIG_FILE" | tail -n 1 | sed -e 's/^[^=]*=//' -e 's/[[:space:]]#.*$//' -e "s/^['\"]//" -e "s/['\"][[:space:]]*\$//"
}

if [ "$DRY" = 0 ] && [ "$(id -u)" != 0 ]; then die "run it with sudo"; fi

PORT=$(cfg PORT); [ -n "$PORT" ] || PORT=4173
FV=$(fdesetup status 2>/dev/null | head -n 1 || true)

if [ "$AFTER" = 1 ]; then
  say "== after the restart: $(sysctl -n kern.boottime 2>/dev/null || echo 'boot time unknown')"
  WAIT="${SHIN_AFTER_WAIT_SECONDS:-300}"
  _t=0
  until curl -sf --max-time 5 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; do
    [ "$_t" -ge "$WAIT" ] && die "the server did not answer on port $PORT within $WAIT seconds of this check starting. Run: sudo sh $SCRIPT_DIR/10-boot-survival.sh --verify"
    sleep 5
    _t=$((_t + 5))
  done
  say "ok    the server answers (after ${_t}s of waiting)"
  say "== updates still pending:"
  softwareupdate --list 2>&1 || true
  sh "$SCRIPT_DIR/10-boot-survival.sh" --verify
  exit $?
fi

say "== FileVault: ${FV:-unknown}"
say "== updates waiting:"
softwareupdate --list 2>&1 || true

if [ "$YES" = 0 ] && [ "$DRY" = 0 ]; then
  printf 'Restart this Mac now? The site is down for a few minutes. [y/N] '
  read -r _ans
  case "$_ans" in y|Y|yes) ;; *) die "cancelled, nothing changed" ;; esac
fi

say "== installing updates (no restart yet)"
run softwareupdate --install --all || die "softwareupdate failed; not restarting (the Mac is still up and serving)"

case "$FV" in
  *"is On"*)
    say "== authenticated restart: it will ask for the FileVault user's name and password"
    run fdesetup authrestart || die "authrestart failed; the Mac was NOT restarted. Do not use a plain restart: it would stop at the unlock screen"
    ;;
  *)
    say "== FileVault is not On, so a plain restart comes straight back"
    run shutdown -r now
    ;;
esac
say "After it is back (a few minutes): sudo sh mac/11-planned-restart.sh --after"
