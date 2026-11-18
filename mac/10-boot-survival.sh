#!/bin/sh
# mac/10-boot-survival.sh -- R04 + R08: the server, the tunnel and every job come back by themselves
# after ANY restart, with nobody logged in. Needs root (sudo): it writes into /Library/LaunchDaemons and
# /etc/sudoers.d. Jamin runs it once, or a Mac session runs it for him when he types his password.
#
#   sudo sh mac/10-boot-survival.sh --dry-run    read-only: say exactly what it would change
#   sudo sh mac/10-boot-survival.sh              install
#   sudo sh mac/10-boot-survival.sh --verify     read-only: is everything in the state it should be in? (exit 1 if not)
#   sudo sh mac/10-boot-survival.sh --rollback   put the old LaunchAgents back
#
# THE DESIGN, and why (sources are in mac/README.md, "What still needs a person"):
#   * LaunchAgents (what runs today) start only after someone logs in. LaunchDaemons start at boot. So every
#     job becomes a LaunchDaemon in /Library/LaunchDaemons with UserName=worker: same account, same files,
#     never root. (Apple, launchd.plist man page: UserName; "Creating Launch Daemons and Agents".)
#   * The disk must be encrypted (R08). On Apple silicon, FileVault means an UNPLANNED restart (a power cut)
#     stops at the unlock screen until a password is entered, so the server is down until then. That is the
#     price of encryption and cannot be scripted away. What this design does about it:
#       - planned restarts (updates) use `fdesetup authrestart` (mac/11-planned-restart.sh): comes back alone;
#       - unplanned ones: unlock from the home network over SSH (Apple: on Apple silicon with macOS 26 or later
#         FileVault can be unlocked over ssh after a restart, if Remote Login is on and the Mac has a network
#         connection); Tailscale is NOT running before the unlock, so this works from the LAN only;
#       - the MacBook Air battery rides out short power cuts.
#   * macOS updates download but do NOT install and restart by themselves, so no update ever restarts the Mac
#     into the unlock screen at 3 a.m. They are installed on purpose by mac/11-planned-restart.sh.
#   * The deploy account must still restart the server after a deploy. Root owns system jobs, so it gets ONE narrow
#     sudoers rule (/etc/sudoers.d/shin-deploy): kickstart/print of com.shin.server and `launchctl list`. Nothing else.
#
# What this does NOT do: turn FileVault on (it needs Jamin's password and shows a recovery key once; see
# docs/readiness/needs-jamin.md), or touch the firewall / SSH / Screen Sharing (mac/12-harden.sh).
#
# SAFETY: config.env is owned by the service user, so this script NEVER sources it as root (that would let the
# service account run commands as root). It reads the few values it needs with grep. Not run on a Mac from the PC
# where this was written; the dry-run and fake-command tests in mac/test/boot-survival.test.mjs cover the logic,
# launchctl's real behaviour is covered by --verify and the reboot drill in mac/README.md.
#
# Environment overrides (for tests): SHIN_DAEMON_DIR, SHIN_SUDOERS_DIR, SHIN_CONFIG_FILE, SHIN_SERVICE_USER,
# SHIN_SERVICE_HOME, SHIN_PLISTBUDDY, SHIN_TEST_NO_CHOWN=1, SHIN_KEEP_LEGACY_BACKUP=1 (keep ~/bin/shin-backup.sh as the nightly job).

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DRY=0
MODE=install
for _a in "$@"; do
  case "$_a" in
    --dry-run) DRY=1 ;;
    --verify) MODE=verify ;;
    --rollback) MODE=rollback ;;
    *) echo "usage: sudo sh 10-boot-survival.sh [--dry-run | --verify | --rollback]" >&2; exit 2 ;;
  esac
done

DAEMON_DIR="${SHIN_DAEMON_DIR:-/Library/LaunchDaemons}"
SUDOERS_DIR="${SHIN_SUDOERS_DIR:-/etc/sudoers.d}"
CONFIG_FILE="${SHIN_CONFIG_FILE:-$SCRIPT_DIR/config.env}"
SVC_USER="${SHIN_SERVICE_USER:-worker}"
OWNER_ROOT="root:wheel"
[ -n "${SHIN_TEST_NO_CHOWN:-}" ] && OWNER_ROOT=''

say() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf '10-boot-survival.sh: %s\n' "$*" >&2; exit 1; }
FAILS=0
fail() { printf 'FAIL: %s\n' "$*" >&2; FAILS=$((FAILS + 1)); }

run() {
  if [ "$DRY" = 1 ]; then
    printf 'would run:'
    for _x in "$@"; do printf ' %s' "$_x"; done
    printf '\n'
  else
    "$@"
  fi
}

# A value from config.env, read as text, never executed. Handles NAME=v, NAME='v', NAME="v", trailing " # comment".
cfg() {
  [ -f "$CONFIG_FILE" ] || return 0
  grep -E "^[[:space:]]*$1=" "$CONFIG_FILE" | tail -n 1 | sed -e 's/^[^=]*=//' -e 's/[[:space:]]#.*$//' -e "s/^['\"]//" -e "s/['\"][[:space:]]*\$//"
}

# Rewrite one line of config.env AS the service user, in place (cat > keeps the file's owner and mode;
# sed -i would leave a root-owned copy the server could no longer read). Same syntax on macOS and GNU.
set_domain() {
  run sudo -u "$SVC_USER" sh -c 't=$(mktemp) && sed "s/^SHIN_LAUNCHD_DOMAIN=.*/SHIN_LAUNCHD_DOMAIN=$2/" "$1" > "$t" && cat "$t" > "$1"; rc=$?; rm -f "$t"; exit $rc' sh "$CONFIG_FILE" "$1"
}

[ "$(uname -s)" = Darwin ] || [ "$DRY" = 1 ] || die "this is a macOS script"
if [ "$DRY" = 0 ] && [ "$(id -u)" != 0 ]; then
  die "run it with sudo (it installs system jobs). Try --dry-run first to see what it would do."
fi

SVC_UID=$(id -u "$SVC_USER" 2>/dev/null) || die "no account named '$SVC_USER' (set SHIN_SERVICE_USER)"
HOME_DIR="${SHIN_SERVICE_HOME:-/Users/$SVC_USER}"
REPO=$(cfg SHIN_REPO_DIR)
[ -n "$REPO" ] || REPO=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PORT=$(cfg PORT)
[ -n "$PORT" ] || PORT=4173
HOST=$(cfg SHIN_TUNNEL_HOSTNAME)
NODE=$(cfg NODE_BIN)
if [ -z "$NODE" ]; then
  for _n in /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$_n" ] && { NODE=$_n; break; }
  done
fi
AGENT_DIR="$HOME_DIR/Library/LaunchAgents"
DISABLED_DIR="$HOME_DIR/Library/LaunchAgents.shin-disabled"
LABELS="server checker integrity backup offsite logrotate hammer restoretest expiry"

say "== Mac: $(sysctl -n hw.model 2>/dev/null || echo unknown model), $(uname -m), macOS $(sw_vers -productVersion 2>/dev/null || echo ?)"
say "== service user: $SVC_USER (uid $SVC_UID), repo: $REPO, node: ${NODE:-NOT FOUND}, port: $PORT"
say "   Apple silicon is arm64 here. (On arm64 an unplanned restart with FileVault on stops at the unlock screen.)"

# ---------------------------------------------------------------------------------------------- verify
if [ "$MODE" = verify ]; then
  for _l in $LABELS; do
    if launchctl print "system/com.shin.$_l" >/dev/null 2>&1; then say "ok    daemon com.shin.$_l is loaded"; else fail "daemon com.shin.$_l is NOT loaded in the system domain"; fi
    if launchctl print "gui/$SVC_UID/com.shin.$_l" >/dev/null 2>&1; then fail "the old agent com.shin.$_l is still loaded (two copies would fight)"; fi
  done
  if launchctl print system/com.shin.server 2>/dev/null | grep -q 'state = running'; then say "ok    server process is running"; else fail "server daemon is not in state running"; fi
  if [ -f "$DAEMON_DIR/com.shin.tunnel.plist" ] || [ -f "$DAEMON_DIR/com.cloudflare.cloudflared.plist" ]; then say "ok    tunnel is a boot-time daemon"; else fail "the tunnel is still a login-time agent (nobody logged in = site down)"; fi
  [ -f "$SUDOERS_DIR/shin-deploy" ] && say "ok    sudoers rule present" || fail "no $SUDOERS_DIR/shin-deploy (the deployer cannot restart the server)"
  if [ -f "$SUDOERS_DIR/shin-deploy" ]; then
    sudo -n -u "$SVC_USER" sudo -n /bin/launchctl print system/com.shin.server >/dev/null 2>&1 && say "ok    $SVC_USER can restart the server without a password" || fail "$SVC_USER cannot run the sudoers rule"
  fi
  [ "$(cfg SHIN_LAUNCHD_DOMAIN)" = system ] && say "ok    config.env says SHIN_LAUNCHD_DOMAIN=system" || fail "config.env lacks SHIN_LAUNCHD_DOMAIN=system (the deployer would look in the wrong place)"
  if curl -sf --max-time 10 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then say "ok    local /api/health answers"; else fail "local /api/health does not answer on port $PORT"; fi
  if [ -n "$HOST" ]; then
    if curl -sf --max-time 15 "https://$HOST/api/health" >/dev/null 2>&1; then say "ok    public https://$HOST/api/health answers (tunnel up)"; else fail "public https://$HOST/api/health does not answer"; fi
  fi
  fdesetup status 2>/dev/null | grep -q 'FileVault is On' && say "ok    FileVault is On" || fail "FileVault is OFF (R08): Jamin must turn it on, see docs/readiness/needs-jamin.md"
  _au=$(defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticallyInstallMacOSUpdates 2>/dev/null || echo unset)
  [ "$_au" = 0 ] && say "ok    macOS updates do not install and restart by themselves" || fail "AutomaticallyInstallMacOSUpdates is '$_au', expected 0"
  say "   autorestart after a power cut: $(pmset -g 2>/dev/null | grep -i autorestart || echo 'not reported (laptops often do not)')"
  [ "$FAILS" = 0 ] && { say "VERIFY: all good"; exit 0; }
  say "VERIFY: $FAILS problem(s) above"
  exit 1
fi

# --------------------------------------------------------------------------------------------- rollback
if [ "$MODE" = rollback ]; then
  for _l in $LABELS tunnel; do
    run launchctl bootout "system/com.shin.$_l" || true
    run rm -f "$DAEMON_DIR/com.shin.$_l.plist"
  done
  run rm -f "$SUDOERS_DIR/shin-deploy"
  if [ -d "$DISABLED_DIR" ]; then
    for _p in "$DISABLED_DIR"/*.plist; do
      [ -f "$_p" ] || continue
      run mv "$_p" "$AGENT_DIR/"
      run launchctl bootstrap "gui/$SVC_UID" "$AGENT_DIR/$(basename "$_p")" || true
    done
  fi
  if [ -f "$CONFIG_FILE" ] && [ "$DRY" = 0 ]; then
    set_domain gui || warn "could not edit config.env: set SHIN_LAUNCHD_DOMAIN=gui by hand"
  fi
  say "ROLLBACK done: the old LaunchAgents are back (they need $SVC_USER logged in, as before)."
  exit 0
fi

# ---------------------------------------------------------------------------------------------- install
[ -d "$SCRIPT_DIR/launchd-daemons" ] || die "$SCRIPT_DIR/launchd-daemons not found"
[ -n "$NODE" ] || { [ "$DRY" = 1 ] && warn "node not found: set NODE_BIN in config.env" || die "node not found: set NODE_BIN in config.env"; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/shin-boot.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

render() {
  sed -e "s|__SHIN_REPO_DIR__|$REPO|g" -e "s|__SHIN_USER__|$SVC_USER|g" -e "s|__SHIN_HOME__|$HOME_DIR|g" -e "s|__NODE_BIN__|$NODE|g" "$1"
}

retire_agent() { # retire_agent <label>: stop the login-time copy and move its plist aside (reversible)
  _agent="$AGENT_DIR/$1.plist"
  if [ ! -f "$_agent" ]; then say "   (no old agent for $1)"; return 0; fi
  run launchctl bootout "gui/$SVC_UID/$1" || true
  run mkdir -p "$DISABLED_DIR"
  [ -n "$OWNER_ROOT" ] && run chown "$SVC_USER" "$DISABLED_DIR"
  run mv "$_agent" "$DISABLED_DIR/"
}

put_daemon() { # put_daemon <rendered file> <label>
  run cp "$1" "$DAEMON_DIR/$2.plist"
  run chmod 644 "$DAEMON_DIR/$2.plist"
  [ -n "$OWNER_ROOT" ] && run chown "$OWNER_ROOT" "$DAEMON_DIR/$2.plist"
  run launchctl bootout "system/$2" || true
  if ! run launchctl bootstrap system "$DAEMON_DIR/$2.plist"; then fail "launchctl bootstrap $2 failed"; fi
}

say "== 1. log folders (a daemon cannot start if its log folder is missing)"
run mkdir -p "$REPO/mac/logs" "$HOME_DIR/.shin-deploy/logs"
[ -n "$OWNER_ROOT" ] && run chown "$SVC_USER" "$REPO/mac/logs" "$HOME_DIR/.shin-deploy/logs"

say "== 2. the sudoers rule that lets the deployer restart the server"
printf '# Managed by mac/10-boot-survival.sh. One narrow rule: the deploy account restarts the system-domain server job.\n%s ALL=(root) NOPASSWD: /bin/launchctl kickstart -k system/com.shin.server, /bin/launchctl print system/com.shin.server, /bin/launchctl list\n' "$SVC_USER" > "$WORK/shin-deploy"
if command -v visudo >/dev/null 2>&1; then
  visudo -cf "$WORK/shin-deploy" >/dev/null || die "the sudoers rule did not validate; nothing installed"
else
  warn "visudo not found, rule not validated"
fi
run mkdir -p "$SUDOERS_DIR"
run rm -f "$SUDOERS_DIR/shin-deploy"
run cp "$WORK/shin-deploy" "$SUDOERS_DIR/shin-deploy"
run chmod 440 "$SUDOERS_DIR/shin-deploy"
[ -n "$OWNER_ROOT" ] && run chown "$OWNER_ROOT" "$SUDOERS_DIR/shin-deploy"

say "== 3. tell the deployer the server is now a system job (config.env, edited as $SVC_USER so it stays $SVC_USER's file)"
if [ -f "$CONFIG_FILE" ]; then
  if grep -q '^SHIN_LAUNCHD_DOMAIN=' "$CONFIG_FILE"; then
    set_domain system
  else
    run sudo -u "$SVC_USER" sh -c "printf 'SHIN_LAUNCHD_DOMAIN=system\\n' >> '$CONFIG_FILE'"
  fi
else
  warn "no config.env at $CONFIG_FILE: add SHIN_LAUNCHD_DOMAIN=system to it by hand"
fi

say "== 4. render, validate and install the daemons (the server first: its old copy is stopped just before, a few seconds of downtime)"
for _l in $LABELS; do
  _label="com.shin.$_l"
  _src="$SCRIPT_DIR/launchd-daemons/$_label.plist"
  [ -f "$_src" ] || { fail "missing template $_src"; continue; }
  render "$_src" > "$WORK/$_label.plist"
  if grep -q '__[A-Z_]*__' "$WORK/$_label.plist"; then fail "$_label: a token was not replaced"; continue; fi
  if command -v plutil >/dev/null 2>&1; then plutil -lint "$WORK/$_label.plist" >/dev/null || { fail "$_label: plutil -lint rejected it"; continue; }; fi
  if [ "$_l" = backup ] && [ -n "${SHIN_KEEP_LEGACY_BACKUP:-}" ]; then
    say "   keeping the old ~/bin/shin-backup.sh job (SHIN_KEEP_LEGACY_BACKUP): $_label NOT installed"
    continue
  fi
  retire_agent "$_label"
  put_daemon "$WORK/$_label.plist" "$_label"
done

say "== 5. the tunnel"
if [ -f "$DAEMON_DIR/com.shin.tunnel.plist" ] || [ -f "$DAEMON_DIR/com.cloudflare.cloudflared.plist" ]; then
  say "   already a boot-time daemon, left alone"
else
  _t=''
  for _c in com.shin.tunnel com.cloudflare.cloudflared; do
    [ -f "$AGENT_DIR/$_c.plist" ] && { _t=$_c; break; }
  done
  if [ -z "$_t" ]; then
    warn "no tunnel job found in $AGENT_DIR or $DAEMON_DIR: the site stays down after a reboot until one exists (mac/01-cloudflare-tunnel.md)"
    fail "no tunnel job to convert"
  else
    say "   converting the login-time agent $_t into a daemon that runs as $SVC_USER (its own program and arguments are kept)"
    cp "$AGENT_DIR/$_t.plist" "$WORK/$_t.plist"
    PB="${SHIN_PLISTBUDDY:-/usr/libexec/PlistBuddy}"
    if [ -x "$PB" ]; then
      "$PB" -c "Delete :UserName" "$WORK/$_t.plist" >/dev/null 2>&1 || true
      "$PB" -c "Add :UserName string $SVC_USER" "$WORK/$_t.plist"
      "$PB" -c "Delete :LimitLoadToSessionType" "$WORK/$_t.plist" >/dev/null 2>&1 || true
      "$PB" -c "Add :EnvironmentVariables dict" "$WORK/$_t.plist" >/dev/null 2>&1 || true
      "$PB" -c "Delete :EnvironmentVariables:HOME" "$WORK/$_t.plist" >/dev/null 2>&1 || true
      "$PB" -c "Add :EnvironmentVariables:HOME string $HOME_DIR" "$WORK/$_t.plist"
    else
      fail "PlistBuddy not found: cannot convert the tunnel agent"
    fi
    plutil -lint "$WORK/$_t.plist" >/dev/null 2>&1 || fail "converted tunnel plist did not validate"
    retire_agent "$_t"
    put_daemon "$WORK/$_t.plist" "$_t"
  fi
fi

say "== 6. updates download but never restart the Mac by themselves; restart after a power cut"
for _kv in "AutomaticCheckEnabled true" "AutomaticDownload true" "CriticalUpdateInstall true" "ConfigDataInstall true" "AutomaticallyInstallMacOSUpdates false"; do
  set -- $_kv
  run defaults write /Library/Preferences/com.apple.SoftwareUpdate "$1" -bool "$2"
done
run pmset -a autorestart 1 || warn "pmset autorestart not accepted on this Mac (laptops may not support it); the battery covers short cuts"

say ""
say "FileVault: $(fdesetup status 2>/dev/null | head -n 1 || echo unknown)"
say "Next: Jamin turns FileVault on (docs/readiness/needs-jamin.md), then run mac/11-planned-restart.sh to install the pending macOS update"
say "and prove the restart works, then sudo sh mac/10-boot-survival.sh --verify."
if [ "$FAILS" != 0 ]; then
  say "DONE WITH $FAILS PROBLEM(S) above. Nothing is half-installed silently: fix them and re-run (it is safe to repeat)."
  exit 1
fi
[ "$DRY" = 1 ] && say "DRY RUN: nothing was changed." || say "DONE. Check: sudo sh mac/10-boot-survival.sh --verify"
