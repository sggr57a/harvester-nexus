#!/usr/bin/env bash
# Emit a traceable Nexus ISO version for CI builds on main.
# Usage: NEXUS_VERSION=$(installer/ci-version.sh)

set -euo pipefail

REPO_ROOT=${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
BASE=$(tr -d '[:space:]' < "${REPO_ROOT}/installer/VERSION")

RUN_NUMBER=${GITHUB_RUN_NUMBER:-0}
if [[ -n "${GITHUB_SHA:-}" ]]; then
  SHORT_SHA=${GITHUB_SHA:0:7}
elif command -v git >/dev/null 2>&1 && git -C "${REPO_ROOT}" rev-parse HEAD >/dev/null 2>&1; then
  SHORT_SHA=$(git -C "${REPO_ROOT}" rev-parse --short=7 HEAD)
else
  SHORT_SHA=local
fi

if [[ "${RUN_NUMBER}" != "0" ]]; then
  printf '%s.main.%s.%s\n' "${BASE}" "${RUN_NUMBER}" "${SHORT_SHA}"
else
  printf '%s.local.%s\n' "${BASE}" "${SHORT_SHA}"
fi
