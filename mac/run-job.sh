#!/bin/sh
# mac/run-job.sh -- the launchd entry point for the two node jobs, so they get config.env.
#
#   mac/run-job.sh integrity [--dry-run]   03:30 nightly: PRAGMA integrity_check on every database + disk space
#   mac/run-job.sh expiry    [--dry-run]   monthly: days left on certificate, profiles, App Store Connect key, Tailscale key
#
# launchd gives a job almost no environment, and the databases' paths live in mac/config.env. This
# sources it and runs the node script. If it cannot even do that, it records the job as FAILED itself,
# so a broken config is a red marker and not a silent no-op.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
JOB="${1:-}"
[ $# -gt 0 ] && shift

CONFIG_FILE="${SHIN_CONFIG_FILE:-$SCRIPT_DIR/config.env}"
if [ -f "$CONFIG_FILE" ]; then
  set -a
  . "$CONFIG_FILE"
  set +a
fi
# shellcheck source=lib/health.sh
. "$SCRIPT_DIR/lib/health.sh"

case "$JOB" in
  integrity) SCRIPT=nightly-checks.mjs; MARK=integrity ;;
  expiry) SCRIPT=expiry-check.mjs; MARK=certs ;;
  *)
    echo "usage: run-job.sh integrity|expiry [--dry-run]" >&2
    exit 2
    ;;
esac

if [ ! -f "$CONFIG_FILE" ]; then
  echo "run-job.sh: $CONFIG_FILE does not exist" >&2
  case " $* " in *" --dry-run "*) ;; *) health_fail "$MARK" "run-job.sh $JOB: no config.env at $CONFIG_FILE" ;; esac
  exit 1
fi

NODE="${NODE_BIN:-node}"
if ! command -v "$NODE" >/dev/null 2>&1; then
  echo "run-job.sh: node not found ($NODE); set NODE_BIN in config.env" >&2
  case " $* " in *" --dry-run "*) ;; *) health_fail "$MARK" "run-job.sh $JOB: node not found ($NODE)" ;; esac
  exit 1
fi

NODE_NO_WARNINGS=1
export NODE_NO_WARNINGS
exec "$NODE" "$SCRIPT_DIR/$SCRIPT" "$@"
