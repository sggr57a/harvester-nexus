#!/usr/bin/env bash
# Emit a traceable Nexus ISO version for CI and local builds.
# Usage: NEXUS_VERSION=$(installer/ci-version.sh)
#
# CI (GitHub Actions):
#   main            → 1.0.0+nexus.1.main.<run>.<sha>
#   cursor/foo-5878 → 1.0.0+nexus.1.cursor-foo-5878.<run>.<sha>
#
# Local:
#   → 1.0.0+nexus.1.local.<sha>  or  ….<branch-slug>.local.<sha>

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

slugify_branch() {
  local raw=${1:-local}
  printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}

BRANCH=${GITHUB_REF_NAME:-}
if [[ -z "${BRANCH}" ]] && command -v git >/dev/null 2>&1; then
  BRANCH=$(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || true)
fi
BRANCH_SLUG=$(slugify_branch "${BRANCH:-local}")

if [[ "${RUN_NUMBER}" != "0" ]]; then
  if [[ "${BRANCH}" == "main" ]]; then
    printf '%s.main.%s.%s\n' "${BASE}" "${RUN_NUMBER}" "${SHORT_SHA}"
  else
    printf '%s.%s.%s.%s\n' "${BASE}" "${BRANCH_SLUG}" "${RUN_NUMBER}" "${SHORT_SHA}"
  fi
else
  if [[ "${BRANCH}" == "main" || -z "${BRANCH}" ]]; then
    printf '%s.local.%s\n' "${BASE}" "${SHORT_SHA}"
  else
    printf '%s.%s.local.%s\n' "${BASE}" "${BRANCH_SLUG}" "${SHORT_SHA}"
  fi
fi
