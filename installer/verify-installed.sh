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

check 'nexus-cockpit launcher' /usr/local/bin/nexus-cockpit
check 'nexus-bootstrap' /usr/local/bin/nexus-bootstrap
check 'nexus-postinstall' /usr/local/bin/nexus-postinstall
check 'cockpit systemd unit' /etc/systemd/system/nexus-cockpit.service
check 'Nexus config' /etc/nexus/config.yaml
check 'Nexus version stamp' /etc/nexus/version
check 'cockpit bundle tarball' /usr/local/share/nexus-cockpit/dist.tar.gz
check 'cockpit index.html' /usr/local/share/nexus-cockpit/dist/index.html
check 'OEM enable stage' /system/oem/92_nexus.yaml

printf '\n'
if [[ "${fail}" -eq 0 ]]; then
  printf 'Result: Nexus overlay IS installed. Run: sudo nexus-cockpit --status\n'
  exit 0
fi

printf 'Result: Nexus overlay NOT installed (%d checks failed).\n' "${fail}"
printf '\n'
printf 'This node was installed from stock Harvester or an ISO built before\n'
printf 'the Nexus overlay merge fix. Rebuild and reinstall:\n'
printf '  git pull origin cursor/fix-iso-entrypoint-d930\n'
printf '  cd installer && make iso-builder && make iso\n'
printf '\n'
printf 'Use the produced dist/harvester-nexus-*.iso — not upstream harvester.iso.\n'
exit 1
