#!/usr/bin/env bash
# verify-installed.sh — run on an installed Harvester-Nexus node to confirm
# the Nexus overlay was baked into the ISO (not stock Harvester).
set -euo pipefail

fail=0
check() {
  local label=$1 path=$2
  if [[ -e "${path}" ]]; then
    printf 'OK   %s (%s)\n' "${label}" "${path}"
  else
    printf 'MISS %s (%s)\n' "${label}" "${path}"
    fail=$((fail + 1))
  fi
}

printf '=== Harvester-Nexus install verification ===\n\n'

check 'nexus-cockpit launcher' /usr/bin/nexus-cockpit
check 'nexus-bootstrap' /usr/bin/nexus-bootstrap
check 'nexus-postinstall' /usr/bin/nexus-postinstall
check 'cockpit systemd unit' /etc/systemd/system/nexus-cockpit.service
check 'Nexus config' /etc/nexus/config.yaml
check 'Nexus version stamp' /etc/nexus/version
check 'python server script' /usr/lib/nexus/serve-cockpit.py
check 'cluster metrics collector' /usr/lib/nexus/cluster_metrics.py
check 'cockpit bundle tarball' /usr/share/nexus-cockpit/dist.tar.gz
if [[ -f /usr/share/nexus-cockpit/dist/index.html ]]; then
  printf 'OK   cockpit index.html (squashfs) (/usr/share/nexus-cockpit/dist/index.html)\n'
elif [[ -f /var/lib/nexus/cockpit-dist/index.html ]]; then
  printf 'OK   cockpit index.html (runtime) (/var/lib/nexus/cockpit-dist/index.html)\n'
else
  printf 'MISS cockpit index.html (need dist/ in squashfs or extract to /var/lib/nexus/cockpit-dist)\n'
  fail=$((fail + 1))
fi
check 'OEM enable stage' /system/oem/92_nexus.yaml

printf '\n'
if mountpoint -q /usr/local 2>/dev/null; then
  printf 'Note: /usr/local is a persistent Elemental mount — Nexus files must NOT live there.\n\n'
fi

if [[ "${fail}" -eq 0 ]]; then
  printf 'Result: Nexus overlay IS installed. Run: sudo nexus-cockpit --status\n'
  exit 0
fi

printf 'Result: Nexus overlay NOT installed (%d checks failed).\n' "${fail}"
printf '\n'
printf 'This node was installed from stock Harvester or an ISO built before\n'
printf 'the Nexus overlay used /usr/share + /usr/bin (not /usr/local).\n'
printf 'Rebuild and reinstall:\n'
printf '  git pull origin cursor/fix-iso-entrypoint-d930\n'
printf '  cd installer && make iso-builder && make iso\n'
printf '\n'
printf 'Use the produced dist/harvester-nexus-*.iso — not upstream harvester.iso.\n'
exit 1
