#!/usr/bin/env bash
# build-iso.sh — produces the harvester-nexus install ISO.
#
# Pipeline:
#   1. Build the cockpit production bundle (npm run build).
#   2. Stage the overlay tree:
#        installer/overlay/                  → /
#        dist/                               → /usr/local/share/nexus-cockpit/dist/
#        installer/manifests/                → /usr/local/share/nexus-cockpit/manifests/
#        installer/installer-config/         → /etc/nexus/installer/
#   3. Clone harvester-installer (master) and merge the staged overlay
#      into its `iso/rootfs/` tree so the contents land in the final
#      squashfs image.
#   4. Inject the wizard question file into the installer's question
#      database so the operator sees the Nexus questions inline.
#   5. Run harvester-installer's `scripts/ci` to produce the ISO.
#   6. Copy `harvester-amd64.iso` → `dist/harvester-nexus-<version>.iso`.
#
# When run on a build host without the iso-builder image, set
# SKIP_ISO_STAGE=1 to stop after step 2 so the overlay can be inspected.

set -euo pipefail

REPO_ROOT=${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
INSTALLER_DIR=${REPO_ROOT}/installer
BUILD_DIR=${BUILD_DIR:-/build}
NEXUS_OVERLAY=${HARVESTER_NEXUS_OVERLAY:-${BUILD_DIR}/nexus-overlay}
DIST=${HARVESTER_NEXUS_DIST:-${BUILD_DIR}/dist}
VERSION=${NEXUS_VERSION:-$(cat "${REPO_ROOT}/installer/VERSION" 2>/dev/null || echo "1.0.0+nexus.1")}
HARVESTER_INSTALLER_REPO=${HARVESTER_INSTALLER_REPO:-https://github.com/harvester/harvester-installer.git}
HARVESTER_INSTALLER_REF=${HARVESTER_INSTALLER_REF:-master}

mkdir -p "${NEXUS_OVERLAY}" "${DIST}"

log()  { printf '[%s] [build-iso] %s\n' "$(date -Iseconds)" "$*"; }
fail() { printf '[%s] [build-iso] FATAL %s\n' "$(date -Iseconds)" "$*" >&2; exit 1; }

log "harvester-nexus iso builder · version=${VERSION}"
log "REPO_ROOT=${REPO_ROOT}"
log "BUILD_DIR=${BUILD_DIR}"

# ============================================================
# Stage 1 — cockpit production bundle
# ============================================================
log "stage 1 · building cockpit production bundle"
cd "${REPO_ROOT}"
if [[ ! -d node_modules ]]; then
  log "installing npm dependencies"
  npm ci --no-audit --no-fund
fi
npm run build
[[ -d dist ]] || fail "cockpit build produced no dist/"

# ============================================================
# Stage 2 — stage the overlay tree
# ============================================================
log "stage 2 · staging overlay tree at ${NEXUS_OVERLAY}"
rm -rf "${NEXUS_OVERLAY}"
mkdir -p "${NEXUS_OVERLAY}"

# Copy helper — prefers rsync when available, falls back to cp -a so the
# script works in minimal sandboxes (CI agents, slim alpine images, ...).
copy_tree() {
  local src=$1 dst=$2
  mkdir -p "${dst}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --info=stats0 "${src}/" "${dst}/"
  else
    # Trailing /. on the source copies the contents (not the dir itself)
    # which mirrors rsync's `src/` → `dst/` semantics.
    cp -a "${src}/." "${dst}/"
  fi
}

# Static overlay (systemd units, scripts, /etc/nexus/).
copy_tree "${INSTALLER_DIR}/overlay" "${NEXUS_OVERLAY}"

# Cockpit production bundle (everything under dist/) goes inside the overlay.
copy_tree "${REPO_ROOT}/dist" "${NEXUS_OVERLAY}/usr/local/share/nexus-cockpit/dist"

# Bootstrap manifests.
copy_tree "${INSTALLER_DIR}/manifests" "${NEXUS_OVERLAY}/usr/local/share/nexus-cockpit/manifests"

# Wizard question file + post-install hook.
copy_tree "${INSTALLER_DIR}/installer-config" "${NEXUS_OVERLAY}/etc/nexus/installer"

# Stamp the version into the overlay so it surfaces in the cockpit's
# About panel + the install-record yaml.
printf '%s\n' "${VERSION}" > "${NEXUS_OVERLAY}/etc/nexus/version"

log "stage 2 complete · overlay has $(find "${NEXUS_OVERLAY}" -type f | wc -l) files"

if [[ "${SKIP_ISO_STAGE:-0}" == "1" ]]; then
  log "SKIP_ISO_STAGE=1 set · stopping after overlay stage"
  cp -r "${NEXUS_OVERLAY}" "${DIST}/nexus-overlay"
  log "overlay copied to ${DIST}/nexus-overlay"
  exit 0
fi

# ============================================================
# Stage 3 — clone harvester-installer and merge the overlay
# ============================================================
log "stage 3 · cloning harvester-installer (${HARVESTER_INSTALLER_REF})"
INSTALLER_SRC=${BUILD_DIR}/harvester-installer
rm -rf "${INSTALLER_SRC}"
git clone --branch "${HARVESTER_INSTALLER_REF}" --single-branch --depth 1 \
  "${HARVESTER_INSTALLER_REPO}" "${INSTALLER_SRC}"

log "stage 3 · merging Nexus overlay into installer rootfs"
INSTALLER_ROOTFS=${INSTALLER_SRC}/package/harvester-os/iso/rootfs
copy_tree "${NEXUS_OVERLAY}" "${INSTALLER_ROOTFS}"

# ============================================================
# Stage 4 — inject Nexus wizard questions
# ============================================================
log "stage 4 · injecting Nexus wizard questions"
INSTALLER_QUESTIONS=${INSTALLER_SRC}/pkg/console/questions
mkdir -p "${INSTALLER_QUESTIONS}"
cp "${INSTALLER_DIR}/installer-config/nexus-wizard-questions.yaml" \
  "${INSTALLER_QUESTIONS}/nexus-questions.yaml"

# Inject a one-liner into the installer's main question loader so it
# pulls our extra questions after the base Harvester ones.
HOOK_MARK="// HARVESTER_NEXUS_QUESTIONS_INJECTED"
QUESTIONS_GO=${INSTALLER_SRC}/pkg/console/questions.go
if [[ -f "${QUESTIONS_GO}" ]] && ! grep -q "${HOOK_MARK}" "${QUESTIONS_GO}"; then
  printf '\n%s\nfunc init() { loadExtraQuestions("nexus-questions.yaml") }\n' "${HOOK_MARK}" \
    >> "${QUESTIONS_GO}"
  log "stage 4 · question hook injected"
else
  log "stage 4 · question hook already present (or installer layout changed)"
fi

# ============================================================
# Stage 5 — run the upstream Harvester ISO build
# ============================================================
log "stage 5 · running harvester-installer/scripts/ci"
# harvester-installer/scripts/build clones ../harvester and runs git there;
# mark both repos safe when running as root inside Docker.
git config --global --add safe.directory "${INSTALLER_SRC}" || true
git config --global --add safe.directory "$(dirname "${INSTALLER_SRC}")/harvester" || true
git config --global --add safe.directory "$(dirname "${INSTALLER_SRC}")/addons" || true
cd "${INSTALLER_SRC}/scripts"
./ci

# ============================================================
# Stage 6 — copy + rename the produced ISO
# ============================================================
log "stage 6 · staging artifacts at ${DIST}"
mkdir -p "${DIST}"
cp "${INSTALLER_SRC}/dist/artifacts/"*.iso "${DIST}/harvester-nexus-${VERSION}.iso"
cp -r "${INSTALLER_SRC}/dist/harvester-cluster-repo" "${DIST}/"
sha256sum "${DIST}/harvester-nexus-${VERSION}.iso" > "${DIST}/harvester-nexus-${VERSION}.iso.sha256"

log "harvester-nexus iso built · ${DIST}/harvester-nexus-${VERSION}.iso"
log "sha256: $(awk '{print $1}' "${DIST}/harvester-nexus-${VERSION}.iso.sha256")"
