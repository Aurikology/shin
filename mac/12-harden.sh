#!/bin/sh
# mac/12-harden.sh -- R55 and findings D3, D4: firewall on, SSH narrowed, Screen Sharing decision, data files
# private, and an audit of what is listening. Run AFTER mac/10-boot-survival.sh (the server must already be a
# daemon whose health it can check).
#
#   sh mac/12-harden.sh --audit                 read-only: prints what is true now. No sudo needed. Changes nothing.
#   sudo sh mac/12-harden.sh --dry-run          says what the apply would do. Changes nothing.
#   sudo sh mac/12-harden.sh                    apply: firewall, SSH drop-in, file modes
#   sudo sh mac/12-harden.sh --ssh-keys-only    ALSO turn off SSH password login (refused unless the service user has a key)
#   sudo sh mac/12-harden.sh --screen-sharing-off   ALSO turn Screen Sharing (VNC, port 5900) off
#   sudo sh mac/12-harden.sh --undo             remove what this script added (firewall off, SSH drop-in gone, Screen Sharing back)
#
# What it does, and what it deliberately does not:
#   1. FIREWALL. Turns the macOS application firewall on and lists node and cloudflared as allowed. The firewall
#      filters only INCOMING connections, and the site reaches the server through the outbound tunnel on loopback,
#      so it should not notice. It does not trust that: after turning it on it checks the server's health locally AND
#      through the public hostname, and if either fails it turns the firewall back off and exits 1 (loudly), so a
#      firewall mistake cannot take the site down overnight. NOT VERIFIED on this Mac: how the firewall treats an
#      unsigned daemon's listener; that check is the safety net for it. Source: Apple Platform Deployment, "Use the
#      application firewall", and socketfilterfw(8) behaviour as documented there.
#   2. SSH (Remote Login). Adds /etc/ssh/sshd_config.d/100-shin.conf: PermitRootLogin no, AllowUsers <service user>.
#      sshd -t must pass or the drop-in is removed again. A Mac's sshd reads its config on every new connection, so
#      there is nothing to restart and an open session is not cut. With --ssh-keys-only it also sets
#      PasswordAuthentication no and KbdInteractiveAuthentication no, but ONLY if ~/.ssh/authorized_keys has a key,
#      otherwise it refuses (that would lock Jamin out). Left off by default because it is not known whether the
#      pre-boot FileVault unlock over SSH (README: "What still needs a person") needs password login.
#   3. SCREEN SHARING. Left as it is unless --screen-sharing-off. It is Jamin's call (needs-jamin.md).
#   4. FILE MODES. Data files in SHIN_DATA_DIR and the backup folder to owner-only (600, folders 700). The service
#      user is the only one who needs them. The daemons also carry Umask 077 so NEW files start private.
#   5. LISTENERS. Prints every TCP listener and who owns it; flags anything that is not on the expected list
#      (SHIN_EXPECTED_PORTS, default 22 4173 5900 and loopback-only ones). It never kills anything: the unidentified
#      node process on port 8787 (D3 finding) is for a person to name.
#   6. D4 (server not an admin user). NOT done by a script: it moves the live data and the Git, tunnel and
#      Tailscale logins to a new account, which needs passwords. The audit reports the current state; the plan is in
#      mac/README.md ("Moving the server off the admin account") and docs/readiness/needs-jamin.md.
#
# Overrides for tests: SHIN_CONFIG_FILE, SHIN_SERVICE_USER, SHIN_SERVICE_HOME, SHIN_SSHD_DIR, SHIN_SOCKETFILTERFW,
# SHIN_EXPECTED_PORTS, SHIN_HARDEN_SETTLE_SECONDS (default 5).

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DRY=0
MODE=apply
KEYS_ONLY=0
SCREEN_OFF=0
for _a in "$@"; do
  case "$_a" in
    --dry-run) DRY=1 ;;
    --audit) MODE=audit ;;
    --undo) MODE=undo ;;
    --ssh-keys-only) KEYS_ONLY=1 ;;
    --screen-sharing-off) SCREEN_OFF=1 ;;
    *) echo "usage: [sudo] sh 12-harden.sh [--audit | --dry-run | --undo] [--ssh-keys-only] [--screen-sharing-off]" >&2; exit 2 ;;
  esac
done

CONFIG_FILE="${SHIN_CONFIG_FILE:-$SCRIPT_DIR/config.env}"
SVC_USER="${SHIN_SERVICE_USER:-worker}"
SSHD_DIR="${SHIN_SSHD_DIR:-/etc/ssh/sshd_config.d}"
FW="${SHIN_SOCKETFILTERFW:-/usr/libexec/ApplicationFirewall/socketfilterfw}"
SETTLE="${SHIN_HARDEN_SETTLE_SECONDS:-5}"
DROPIN="$SSHD_DIR/100-shin.conf"

say() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf '12-harden.sh: %s\n' "$*" >&2; exit 1; }
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
cfg() {
  [ -f "$CONFIG_FILE" ] || return 0
  grep -E "^[[:space:]]*$1=" "$CONFIG_FILE" | tail -n 1 | sed -e 's/^[^=]*=//' -e 's/[[:space:]]#.*$//' -e "s/^['\"]//" -e "s/['\"][[:space:]]*\$//"
}

HOME_DIR="${SHIN_SERVICE_HOME:-/Users/$SVC_USER}"
DATA_DIR=$(cfg SHIN_DATA_DIR); [ -n "$DATA_DIR" ] || DATA_DIR="$HOME_DIR/shin-data"
BACKUP_DIR=$(cfg SHIN_BACKUP_DIR); [ -n "$BACKUP_DIR" ] || BACKUP_DIR="$HOME_DIR/shin-backup"
PORT=$(cfg PORT); [ -n "$PORT" ] || PORT=4173
HOST=$(cfg SHIN_TUNNEL_HOSTNAME)
NODE=$(cfg NODE_BIN)
if [ -z "$NODE" ]; then
  for _n in /opt/homebrew/bin/node /usr/local/bin/node; do [ -x "$_n" ] && { NODE=$_n; break; }; done
fi
CFD=$(command -v cloudflared 2>/dev/null || true)
[ -n "$CFD" ] || for _c in /opt/homebrew/bin/cloudflared /usr/local/bin/cloudflared; do [ -x "$_c" ] && { CFD=$_c; break; }; done
EXPECTED="${SHIN_EXPECTED_PORTS:-22 4173 5900}"

health_ok() {
  curl -sf --max-time 8 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 || return 1
  if [ -n "$HOST" ]; then curl -sf --max-time 15 "https://$HOST/api/health" >/dev/null 2>&1 || return 1; fi
  return 0
}

# ------------------------------------------------------------------------------------------------ audit
audit() {
  say "== AUDIT (read-only)"
  say "-- firewall:"
  "$FW" --getglobalstate 2>&1 || say "   could not read it (is this a Mac?)"
  say "-- Remote Login (SSH): $(systemsetup -getremotelogin 2>&1 | head -n 1 || true) (needs sudo to read; no answer is not 'off')"
  if [ -f "$DROPIN" ]; then say "   SSH drop-in present: $DROPIN"; else say "   SSH drop-in NOT present (sshd accepts any account that can log in)"; fi
  say "-- Screen Sharing: $(launchctl print-disabled system 2>/dev/null | grep -i screensharing || echo 'state not readable (needs sudo)')"
  say "-- admin: $(dseditgroup -o checkmember -m "$SVC_USER" admin 2>&1 | head -n 1 || true)"
  say "   (D4: the server runs as $SVC_USER. 'yes' means an admin account runs it; plan in mac/README.md.)"
  say "-- file modes (want 600 files, 700 folders):"
  for _d in "$DATA_DIR" "$BACKUP_DIR"; do
    [ -d "$_d" ] || { say "   $_d: not there"; continue; }
    say "   $_d: folder $(stat -f '%Lp' "$_d" 2>/dev/null || stat -c '%a' "$_d" 2>/dev/null)"
    find "$_d" -maxdepth 2 -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.log' -o -name '*.sqlite' \) 2>/dev/null | while read -r _f; do
      _m=$(stat -f '%Lp' "$_f" 2>/dev/null || stat -c '%a' "$_f" 2>/dev/null)
      [ "$_m" = 600 ] || printf '   %s  %s\n' "$_m" "$_f"
    done
  done
  say "-- listeners (TCP):"
  _out=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | tail -n +2 || true)
  if [ -z "$_out" ]; then
    say "   none readable (run with sudo to see root-owned ones like sshd)"
  else
    printf '%s\n' "$_out" | while read -r _cmd _pid _u _fd _t _dev _sz _node _name _rest; do
      _port=${_name##*:}
      _known=0
      for _e in $EXPECTED; do [ "$_e" = "$_port" ] && _known=1; done
      case "$_name" in 127.0.0.1:*|"[::1]:"*|localhost:*) _known=1 ;; esac
      if [ "$_known" = 1 ]; then
        printf '   ok       %-10s pid %-6s %s\n' "$_cmd" "$_pid" "$_name"
      else
        _line=$(ps -o command= -p "$_pid" 2>/dev/null | cut -c1-110 || true)
        _cwd=$(lsof -a -p "$_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)
        printf '   UNKNOWN  %-10s pid %-6s %s\n            command: %s\n            folder:  %s\n' "$_cmd" "$_pid" "$_name" "$_line" "$_cwd"
      fi
    done
  fi
}

if [ "$MODE" = audit ]; then audit; exit 0; fi

[ "$(uname -s)" = Darwin ] || [ "$DRY" = 1 ] || die "this is a macOS script"
if [ "$DRY" = 0 ] && [ "$(id -u)" != 0 ]; then die "run it with sudo. Try --audit (no sudo) or --dry-run first."; fi

# ------------------------------------------------------------------------------------------------ undo
if [ "$MODE" = undo ]; then
  say "== undo"
  run "$FW" --setglobalstate off
  run rm -f "$DROPIN"
  run launchctl enable system/com.apple.screensharing
  say "File modes are left private on purpose (nothing needs them wider)."
  exit 0
fi

say "== service user: $SVC_USER, data: $DATA_DIR, backups: $BACKUP_DIR, node: ${NODE:-NOT FOUND}, cloudflared: ${CFD:-not found}"

# 1. firewall -------------------------------------------------------------------------------------
say "== 1. firewall on, node and cloudflared allowed, then prove the site still answers"
health_ok || { [ "$DRY" = 1 ] || die "the site does not answer BEFORE the change (local port $PORT or https://${HOST:-?}); fix that first so a failure afterwards is known to be the firewall"; }
run "$FW" --setglobalstate on
run "$FW" --setallowsigned on
[ -n "$NODE" ] && { run "$FW" --add "$NODE"; run "$FW" --unblockapp "$NODE"; }
[ -n "$CFD" ] && { run "$FW" --add "$CFD"; run "$FW" --unblockapp "$CFD"; }
if [ "$DRY" = 0 ]; then
  sleep "$SETTLE"
  if health_ok; then
    say "ok    the site still answers with the firewall on (local and through the tunnel)"
  else
    "$FW" --setglobalstate off || true
    die "the site stopped answering with the firewall on, so the firewall was turned OFF again. Nothing else was changed. Look at the server log, then try again."
  fi
fi

# 2. SSH ------------------------------------------------------------------------------------------
say "== 2. SSH: no root login, only $SVC_USER"
_conf="PermitRootLogin no
AllowUsers $SVC_USER
"
if [ "$KEYS_ONLY" = 1 ]; then
  grep -qE '^(ssh-|ecdsa-|sk-)' "$HOME_DIR/.ssh/authorized_keys" 2>/dev/null || die "--ssh-keys-only refused: $HOME_DIR/.ssh/authorized_keys holds no key, so turning passwords off would lock you out. Add your key first (ssh-copy-id) and test it."
  _conf="${_conf}PasswordAuthentication no
KbdInteractiveAuthentication no
"
fi
if [ "$DRY" = 1 ]; then
  printf 'would write %s:\n%s' "$DROPIN" "$_conf"
else
  mkdir -p "$SSHD_DIR"
  _had=0; [ -f "$DROPIN" ] && { _had=1; cp "$DROPIN" "$DROPIN.prev"; }
  printf '%s' "$_conf" > "$DROPIN"
  chmod 644 "$DROPIN"
  if sshd -t 2>/dev/null; then
    say "ok    sshd -t accepts it (a new SSH connection reads it; open sessions are not cut)"
    rm -f "$DROPIN.prev"
  else
    if [ "$_had" = 1 ]; then mv "$DROPIN.prev" "$DROPIN"; else rm -f "$DROPIN"; fi
    fail "sshd -t rejected the SSH drop-in; it was removed again"
  fi
fi

# 3. Screen Sharing -------------------------------------------------------------------------------
if [ "$SCREEN_OFF" = 1 ]; then
  say "== 3. Screen Sharing off (port 5900)"
  run launchctl disable system/com.apple.screensharing
  run launchctl bootout system/com.apple.screensharing
else
  say "== 3. Screen Sharing: left as it is (Jamin's call; --screen-sharing-off to turn it off)"
fi

# 4. file modes -----------------------------------------------------------------------------------
say "== 4. data and backup files owner-only"
for _d in "$DATA_DIR" "$BACKUP_DIR"; do
  if [ -d "$_d" ]; then
    run chmod 700 "$_d"
    run find "$_d" -type d -exec chmod 700 {} +
    run find "$_d" -type f -exec chmod 600 {} +
  else
    say "   $_d: not there, skipped"
  fi
done
[ -f "$CONFIG_FILE" ] && run chmod 600 "$CONFIG_FILE"

# 5. listeners ------------------------------------------------------------------------------------
say "== 5. listener audit"
audit | sed -n '/-- listeners/,$p'

if [ "$DRY" = 1 ]; then say "DRY RUN: nothing was changed."; exit 0; fi
if [ "$FAILS" -gt 0 ]; then say "HARDEN: $FAILS problem(s) above"; exit 1; fi
say "HARDEN: done. Next: sh $SCRIPT_DIR/12-harden.sh --audit, then the checklist in mac/README.md."
