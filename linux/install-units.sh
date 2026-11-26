#!/usr/bin/env bash
# linux/install-units.sh -- install (or refresh) the systemd units from the live clone. Run with sudo.
#
#   sudo bash /opt/pexi/live/linux/install-units.sh                     core units, collectors left off
#   sudo bash /opt/pexi/live/linux/install-units.sh --with-collectors   also enable kroger, hammer, openprices timers
#   sudo bash /opt/pexi/live/linux/install-units.sh --dry-run
#
# Enables: pexi-server, pexi-deploy.timer, integrity, backup, offsite, logrotate, restoretest, deadman timers.
# Does NOT enable pexi-tunnel (the cutover does, see linux/CUTOVER.md) and does not start the server unless
# /etc/pexi/pexi.env has been filled in (it refuses to start a server with the template's blanks).
# Re-run after a deploy that changed linux/systemd/ (the deploy checker cannot reload systemd: it has no root).

set -euo pipefail

SRC="${PEXI_LIVE:-/opt/pexi/live}/linux"
DEST=/etc/systemd/system
ENV_FILE=/etc/pexi/pexi.env
DRY=0
COLLECTORS=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --with-collectors) COLLECTORS=1 ;;
    *) echo "usage: install-units.sh [--with-collectors] [--dry-run]" >&2; exit 2 ;;
  esac
done

run() { if [ "$DRY" = 1 ]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi; }

[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
[ -d "$SRC/systemd" ] || { echo "no $SRC/systemd: clone the repo into /opt/pexi/live first" >&2; exit 1; }
id pexi >/dev/null 2>&1 || { echo "no pexi user: run linux/provision.sh first" >&2; exit 1; }

echo "== units"
for f in "$SRC"/systemd/*.service "$SRC"/systemd/*.timer; do
  run install -m 0644 -o root -g root "$f" "$DEST/$(basename "$f")"
done
run systemctl daemon-reload
if [ "$DRY" = 0 ]; then
  # A typo in a unit shows here, not at 04:00. (Warnings about units not on disk yet are expected for pexi-alert@.)
  systemd-analyze verify "$DEST"/pexi-*.service "$DEST"/pexi-*.timer 2>&1 | grep -v 'pexi-alert@' || true
fi

echo "== sudoers: pexi may restart the server unit and nothing else"
SUDOERS_TMP=$(mktemp)
printf 'pexi ALL=(root) NOPASSWD: /usr/bin/systemctl restart pexi-server.service, /usr/bin/systemctl is-active pexi-server.service\n' > "$SUDOERS_TMP"
if [ "$DRY" = 0 ]; then
  visudo -cf "$SUDOERS_TMP" >/dev/null
  install -m 0440 -o root -g root "$SUDOERS_TMP" /etc/sudoers.d/pexi-deploy
fi
rm -f "$SUDOERS_TMP"

echo "== /etc/pexi"
if [ ! -f "$ENV_FILE" ]; then
  run install -m 0600 -o pexi -g pexi "$SRC/pexi.env.example" "$ENV_FILE"
  echo "   created $ENV_FILE from the template: fill the blanks, then run this script again"
fi
[ "$DRY" = 1 ] || { chown pexi:pexi "$ENV_FILE"; chmod 0600 "$ENV_FILE"; }

echo "== enable timers"
TIMERS="pexi-deploy pexi-integrity pexi-backup pexi-offsite pexi-logrotate pexi-restoretest pexi-deadman"
[ "$COLLECTORS" = 1 ] && TIMERS="$TIMERS pexi-kroger pexi-hammer pexi-openprices"
for t in $TIMERS; do run systemctl enable --now "$t.timer"; done

echo "== server"
# Template blanks mean a half-filled file; refuse to start rather than run with no API key.
if [ "$DRY" = 0 ] && grep -qE '^(ANTHROPIC_API_KEY|SHIN_NETWORK_SALT|SHIN_ADMIN_TOKEN)=$' "$ENV_FILE"; then
  echo "   NOT started: $ENV_FILE still has blank secrets (ANTHROPIC_API_KEY, SHIN_NETWORK_SALT, SHIN_ADMIN_TOKEN)"
  run systemctl enable pexi-server.service
else
  run systemctl enable --now pexi-server.service
fi

echo "done. Check: systemctl list-timers 'pexi-*' ; systemctl status pexi-server"
