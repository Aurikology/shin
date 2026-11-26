#!/usr/bin/env bash
# linux/provision.sh -- first-boot setup of the Pexi server on Ubuntu 24.04 LTS (OVHcloud VPS-2, Beauharnois).
#
#   bash linux/provision.sh              run once as the image's default user (it uses sudo); safe to re-run
#   bash linux/provision.sh --dry-run    print what it would do, change nothing
#
# What it does, in order (every step checks first, so a second run changes nothing):
#   1. the `pexi` service user (no login shell, no sudo) and its folders under /var/lib/pexi, /opt/pexi, /etc/pexi
#   2. packages: git, sqlite3, restic, curl, ufw, unattended-upgrades, rsync, jq, cloudflared (Cloudflare's apt repo)
#   3. Node, pinned (NODE_VERSION below), from nodejs.org's tarball, checked against the published SHA-256 list
#   4. timezone America/Toronto, a 4 GB swap file, journald capped at 500 MB and 14 days (the Mac's log retention)
#   5. firewall: deny all incoming except SSH (web traffic arrives through the Cloudflare tunnel, which dials OUT)
#   6. SSH: keys only, no root login, no passwords (a drop-in file, checked with `sshd -t` before it is applied)
#   7. unattended security upgrades, automatic reboot at 04:00 America/Toronto when one needs it
#
# Not done here (needs a person or a secret): /etc/pexi/pexi.env values, the tunnel login, the deploy key,
# the restic password. linux/CUTOVER.md says when.
#
# Locked-out guard: the SSH change is skipped unless the default user already has an authorized key.

set -euo pipefail

NODE_VERSION="${NODE_VERSION:-24.14.0}"
TIMEZONE="${PEXI_TIMEZONE:-America/Toronto}"
SWAP_FILE=/swapfile
SWAP_MB="${PEXI_SWAP_MB:-4096}"
PEXI_USER=pexi
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

say() { printf '== %s\n' "$*"; }
# Run a command, or only show it under --dry-run.
do_() {
  if [ "$DRY" = 1 ]; then printf '   [dry-run] %s\n' "$*"; else "$@"; fi
}
# Write stdin to a root-owned file only when the content differs (keeps re-runs quiet and idempotent).
put_file() {
  local dest=$1 mode=${2:-0644} tmp
  tmp=$(mktemp)
  cat > "$tmp"
  if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
    rm -f "$tmp"
    return 0
  fi
  if [ "$DRY" = 1 ]; then
    printf '   [dry-run] would write %s\n' "$dest"
    rm -f "$tmp"
    return 0
  fi
  sudo install -D -m "$mode" -o root -g root "$tmp" "$dest"
  rm -f "$tmp"
  printf '   wrote %s\n' "$dest"
}

if [ "$(id -u)" = 0 ]; then
  echo "run this as the default user (ubuntu), not root: it uses sudo" >&2
  exit 1
fi
if ! grep -q '^ID=ubuntu' /etc/os-release || ! grep -q '^VERSION_ID="24.04"' /etc/os-release; then
  echo "warning: this was written for Ubuntu 24.04 LTS; continuing anyway" >&2
fi
sudo -v

# ---- 1. service user and folders ------------------------------------------------------------------
say "service user and folders"
if ! id "$PEXI_USER" >/dev/null 2>&1; then
  do_ sudo useradd --system --create-home --home-dir /home/pexi --shell /usr/sbin/nologin "$PEXI_USER"
fi
# /var/lib/pexi    live data (the Mac's ~/shin-data): databases, catalogue, photos, health markers, backups
# /opt/pexi        code: live (what runs), stage (where a commit is tested first), state (deploy state)
# /etc/pexi        pexi.env (mode 0600, owned by pexi), restic password file
for d in /var/lib/pexi /var/lib/pexi/health /var/lib/pexi/backup /var/lib/pexi/inbox /opt/pexi /opt/pexi/state /var/log/pexi; do
  do_ sudo install -d -m 0750 -o "$PEXI_USER" -g "$PEXI_USER" "$d"
done
do_ sudo install -d -m 0750 -o root -g "$PEXI_USER" /etc/pexi

# ---- 2. packages ----------------------------------------------------------------------------------
say "packages"
export DEBIAN_FRONTEND=noninteractive
do_ sudo apt-get update -y
do_ sudo apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg git sqlite3 restic rsync jq ufw unattended-upgrades apt-listchanges tzdata xz-utils build-essential

say "cloudflared (Cloudflare's apt repo)"
if [ ! -f /usr/share/keyrings/cloudflare-main.gpg ]; then
  if [ "$DRY" = 1 ]; then
    echo "   [dry-run] would fetch https://pkg.cloudflare.com/cloudflare-main.gpg"
  else
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  fi
fi
put_file /etc/apt/sources.list.d/cloudflared.list 0644 <<'EOF'
deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main
EOF
if ! command -v cloudflared >/dev/null 2>&1; then
  do_ sudo apt-get update -y
  do_ sudo apt-get install -y cloudflared
fi

# ---- 3. Node, pinned ------------------------------------------------------------------------------
say "node v$NODE_VERSION"
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64) NODE_ARCH=arm64 ;;
  *) echo "unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac
NODE_DIR="/opt/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  if [ "$DRY" = 1 ]; then
    echo "   [dry-run] would download node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz and verify its SHA-256"
  else
    work=$(mktemp -d)
    base="https://nodejs.org/dist/v${NODE_VERSION}"
    tarball="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
    curl -fsSL --max-time 300 -o "$work/$tarball" "$base/$tarball"
    curl -fsSL --max-time 60 -o "$work/SHASUMS256.txt" "$base/SHASUMS256.txt"
    (cd "$work" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c -)
    sudo tar -xJf "$work/$tarball" -C /opt
    rm -rf "$work"
  fi
fi
do_ sudo ln -sfn "$NODE_DIR/bin/node" /usr/local/bin/node
do_ sudo ln -sfn "$NODE_DIR/bin/npm" /usr/local/bin/npm
do_ sudo ln -sfn "$NODE_DIR/bin/npx" /usr/local/bin/npx
if [ "$DRY" = 0 ]; then
  have=$(/usr/local/bin/node --version)
  [ "$have" = "v$NODE_VERSION" ] || { echo "node is $have, wanted v$NODE_VERSION" >&2; exit 1; }
  echo "   node $have, sqlite3 $(sqlite3 --version | cut -d' ' -f1)"
fi

# ---- 4. timezone, swap, journald ------------------------------------------------------------------
say "timezone $TIMEZONE"
if [ "$(timedatectl show -p Timezone --value 2>/dev/null || true)" != "$TIMEZONE" ]; then
  do_ sudo timedatectl set-timezone "$TIMEZONE"
fi

say "swap file ${SWAP_MB} MB"
if ! swapon --show=NAME --noheadings | grep -qx "$SWAP_FILE"; then
  if [ ! -f "$SWAP_FILE" ]; then
    do_ sudo fallocate -l "${SWAP_MB}M" "$SWAP_FILE"
    do_ sudo chmod 600 "$SWAP_FILE"
    do_ sudo mkswap "$SWAP_FILE"
  fi
  do_ sudo swapon "$SWAP_FILE"
fi
if ! grep -qE "^$SWAP_FILE[[:space:]]" /etc/fstab; then
  if [ "$DRY" = 1 ]; then
    echo "   [dry-run] would add the swap file to /etc/fstab"
  else
    echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
  fi
fi
# Keep the server in RAM; swap is the safety net, not the working set.
put_file /etc/sysctl.d/90-pexi.conf 0644 <<'EOF'
vm.swappiness = 10
vm.vfs_cache_pressure = 50
EOF
[ "$DRY" = 1 ] || sudo sysctl --system >/dev/null

say "journald cap"
# 14 days matches the Mac's log retention (SHIN_LOG_KEEP_DAYS default 14); 500 MB keeps a runaway log from filling the 75 GB disk.
put_file /etc/systemd/journald.conf.d/pexi.conf 0644 <<'EOF'
[Journal]
Storage=persistent
SystemMaxUse=500M
SystemKeepFree=5G
MaxRetentionSec=14day
EOF
[ "$DRY" = 1 ] || sudo systemctl restart systemd-journald

# ---- 5. firewall ----------------------------------------------------------------------------------
say "firewall (deny incoming, allow SSH only)"
if [ "$DRY" = 1 ]; then
  echo "   [dry-run] ufw default deny incoming / allow outgoing / allow OpenSSH / enable"
else
  sudo ufw default deny incoming >/dev/null
  sudo ufw default allow outgoing >/dev/null
  sudo ufw limit OpenSSH >/dev/null   # allow 22/tcp, rate-limited against password guessing
  sudo ufw --force enable >/dev/null
  sudo ufw status verbose | sed 's/^/   /'
fi

# ---- 6. SSH ---------------------------------------------------------------------------------------
say "ssh: keys only, no root, no passwords"
if [ ! -s "$HOME/.ssh/authorized_keys" ]; then
  echo "   SKIPPED: $HOME/.ssh/authorized_keys is empty, so turning passwords off could lock you out" >&2
  SSH_SKIPPED=1
else
  SSH_SKIPPED=0
  put_file /etc/ssh/sshd_config.d/00-pexi-hardening.conf 0644 <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
EOF
  if [ "$DRY" = 0 ]; then
    sudo sshd -t
    sudo systemctl reload ssh
    # sshd uses the FIRST value it reads, and cloud-init can drop a 50-*.conf that says PasswordAuthentication yes.
    # The 00- name sorts first; this proves the effective setting.
    eff=$(sudo sshd -T | awk '/^passwordauthentication /{print $2}')
    [ "$eff" = "no" ] || { echo "sshd still allows passwords ($eff)" >&2; exit 1; }
    echo "   effective: passwordauthentication $eff, permitrootlogin $(sudo sshd -T | awk '/^permitrootlogin /{print $2}')"
  fi
fi

# ---- 7. unattended upgrades -----------------------------------------------------------------------
say "unattended security upgrades, reboot window 04:00 $TIMEZONE"
put_file /etc/apt/apt.conf.d/20auto-upgrades 0644 <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
# Ubuntu's stock 50unattended-upgrades already enables the -security pocket; this drop-in sorts later and wins.
put_file /etc/apt/apt.conf.d/52pexi-unattended 0644 <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
# The reboot time is read as the machine's local time, which is why the timezone is set first.
[ "$DRY" = 1 ] || sudo systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

say "done"
if [ "${SSH_SKIPPED:-0}" = 1 ]; then
  echo "NOTE: SSH hardening was skipped (no authorized key). Add your key, then run this script again."
fi
echo "Next: linux/CUTOVER.md step 2 (install the units with: sudo bash linux/install-units.sh)."
