# mac/lib/health.sh -- sourced by the mac/ shell jobs, never run by itself.
#
# The caller sets SCRIPT_DIR (the mac/ folder) and has sourced config.env.
#   health_ok   <job> [detail]
#   health_fail <job> [detail]
# Both go through mac/lib/health.mjs (marker files, state flag, one mailbox message per
# failing streak). If node itself is unusable the fallback still leaves a .FAILED file, so
# a broken node can never turn a failure into silence.

_health_dir() {
  printf '%s' "${SHIN_HEALTH_DIR:-${SHIN_DATA_DIR:-$HOME/shin-data}/health}"
}

_health() {
  _h_cmd=$1; _h_job=$2; _h_detail=${3:-}
  if "${NODE_BIN:-node}" "$SCRIPT_DIR/lib/health.mjs" "$_h_cmd" "$_h_job" "$_h_detail" 2>/dev/null; then
    return 0
  fi
  _h_dir=$(_health_dir)
  mkdir -p "$_h_dir" 2>/dev/null || return 0
  if [ "$_h_cmd" = "fail" ]; then
    printf '%s %s FAILED: %s (written by the sh fallback, node unusable)\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$_h_job" "$_h_detail" > "$_h_dir/$_h_job.FAILED"
  else
    rm -f "$_h_dir/$_h_job.FAILED"
  fi
  return 0
}

health_ok() { _health ok "$1" "${2:-}"; }
health_fail() { _health fail "$1" "${2:-}"; }
