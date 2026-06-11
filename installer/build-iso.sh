#!/usr/bin/env bash
# build-iso.sh — produces the harvester-nexus install ISO.
#
# Pipeline:
#   1. Build the cockpit production bundle (npm run build).
#   2. Stage the overlay tree:
#        installer/overlay/                  → /
#        dist/                               → /usr/share/nexus-cockpit/dist/
#        installer/manifests/                → /usr/share/nexus-cockpit/manifests/
#        installer/installer-config/         → /etc/nexus/installer/
#   3. Clone harvester-installer (master) and merge the staged overlay
#      into `package/harvester-os/files/` (COPY files/ / in the OS Dockerfile).
#      Do NOT use iso/rootfs/ — elemental only overlays iso/boot assets.
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

# Docker 29+ host daemons require >= 1.44 — force negotiation before any harvester-installer scripts run.
export DOCKER_API_VERSION=${DOCKER_API_VERSION:-1.44}
# harvester-installer master requires go >= 1.26; auto-download if the image Go is older.
export GOTOOLCHAIN=${GOTOOLCHAIN:-auto}
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH}"

YQ_VERSION=${YQ_VERSION:-v4.52.5}

ensure_toolchain() {
  if ! command -v yq >/dev/null 2>&1; then
    if [[ "${SKIP_ISO_STAGE:-0}" == "1" ]]; then
      log "yq not required for overlay-only stage · skipping install"
      return 0
    fi
    log "yq not found — installing to /usr/local/bin (rebuild iso-builder to bake this in)"
    local arch=${ARCH:-amd64}
    curl -sfL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${arch}" \
      -o /usr/local/bin/yq
    chmod +x /usr/local/bin/yq
  fi
  if [[ "${SKIP_ISO_STAGE:-0}" == "1" ]]; then
    log "overlay-only mode · skipping helm/docker/go toolchain check"
    return 0
  fi
  local tool
  for tool in yq helm docker go git; do
    command -v "${tool}" >/dev/null || fail "${tool} missing from iso-builder PATH — run: cd installer && make iso-builder"
  done
  log "toolchain OK · $(yq --version 2>&1 | head -1)"
}

ensure_toolchain

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

# Cockpit production bundle — expanded tree for overlay/simulator checks,
# plus a single dist.tar.zst for docker build (avoids huge COPY layers).
COCKPIT_ROOT="${NEXUS_OVERLAY}/usr/share/nexus-cockpit"
COCKPIT_STAGING=$(mktemp -d)
cleanup_cockpit_staging() { rm -rf "${COCKPIT_STAGING}"; }
trap cleanup_cockpit_staging EXIT

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude 'nexus-overlay/' \
    --exclude '*.map' \
    "${REPO_ROOT}/dist/" "${COCKPIT_STAGING}/"
else
  mkdir -p "${COCKPIT_STAGING}"
  cp -a "${REPO_ROOT}/dist/." "${COCKPIT_STAGING}/"
  rm -rf "${COCKPIT_STAGING}/nexus-overlay"
fi
[[ -f "${COCKPIT_STAGING}/index.html" ]] || fail "cockpit build missing index.html in dist/"

mkdir -p "${COCKPIT_ROOT}"
copy_tree "${COCKPIT_STAGING}" "${COCKPIT_ROOT}/dist"
tar -C "${COCKPIT_STAGING}" -czf "${COCKPIT_ROOT}/dist.tar.gz" .
log "cockpit bundle packed · $(du -h "${COCKPIT_ROOT}/dist.tar.gz" | awk '{print $1}') dist.tar.gz"

# Bootstrap manifests.
copy_tree "${INSTALLER_DIR}/manifests" "${NEXUS_OVERLAY}/usr/share/nexus-cockpit/manifests"

# Wizard question file + post-install hook.
copy_tree "${INSTALLER_DIR}/installer-config" "${NEXUS_OVERLAY}/etc/nexus/installer"

# Stamp the version into the overlay so it surfaces in the cockpit's
# About panel + the install-record yaml.
printf '%s\n' "${VERSION}" > "${NEXUS_OVERLAY}/etc/nexus/version"

[[ -f "${NEXUS_OVERLAY}/usr/share/nexus-cockpit/dist/index.html" ]] \
  || fail "cockpit bundle missing index.html under usr/share/nexus-cockpit/dist/"

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

log "stage 3 · patching collect-deps.sh (reliable rancher-charts index extraction)"
install -m 0755 "${INSTALLER_DIR}/patches/collect-deps.sh" "${INSTALLER_SRC}/scripts/collect-deps.sh"

log "stage 3 · patching harvester-os Dockerfile (extract cockpit tarball after COPY files/)"
bash "${INSTALLER_DIR}/patches/apply-harvester-os-dockerfile.sh" \
  "${INSTALLER_SRC}/package/harvester-os/Dockerfile"

log "stage 3 · merging Nexus overlay into harvester-os/files (installed rootfs)"
INSTALLER_FILES=${INSTALLER_SRC}/package/harvester-os/files
[[ -d "${INSTALLER_FILES}" ]] || fail "harvester-installer layout changed: missing ${INSTALLER_FILES}"

# Docker COPY files/ / is fragile with many small SPA assets — ship the tarball only.
rm -rf "${NEXUS_OVERLAY}/usr/share/nexus-cockpit/dist"
copy_tree "${NEXUS_OVERLAY}" "${INSTALLER_FILES}"

verify_overlay_merge() {
  local root=$1
  local missing=0
  for path in \
    usr/bin/nexus-cockpit \
    usr/bin/nexus-bootstrap \
    usr/bin/nexus-postinstall \
    usr/lib/nexus/serve-cockpit.py \
    usr/lib/nexus/cluster_metrics.py \
    etc/systemd/system/nexus-cockpit.service \
    system/oem/92_nexus.yaml \
    etc/nexus/config.yaml \
    usr/share/nexus-cockpit/dist.tar.gz; do
    if [[ ! -e "${root}/${path}" ]]; then
      log "overlay verify FAILED · missing ${path}"
      missing=$((missing + 1))
    fi
  done
  [[ "${missing}" -eq 0 ]] || fail "Nexus overlay merge incomplete (${missing} paths missing under ${root})"
  log "overlay verify OK · Nexus files present under harvester-os/files"
}

verify_overlay_merge "${INSTALLER_FILES}"

# ============================================================
# Stage 4 — stage Nexus wizard questions (reference copy)
# ============================================================
log "stage 4 · staging Nexus wizard questions for /etc/nexus/installer"
# Upstream harvester-installer no longer ships pkg/console/questions.go;
# install-time TUI remains the stock Harvester wizard. Defaults live in
# /etc/nexus/config.yaml and can be overridden post-install via
# /etc/nexus/wizard-answers.yaml + nexus-postinstall.
install -d "${INSTALLER_FILES}/etc/nexus/installer"
cp "${INSTALLER_DIR}/installer-config/nexus-wizard-questions.yaml" \
  "${INSTALLER_FILES}/etc/nexus/installer/nexus-wizard-questions.yaml"

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
# BuildKit + docker.sock from inside the iso-builder container can fail with
# "error waiting for container: unexpected EOF" on COPY files/ / — use legacy builder.
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-0}"
export COMPOSE_DOCKER_CLI_BUILD=0
./ci

# ============================================================
# Stage 6 — copy + rename the produced ISO
# ============================================================
log "stage 6 · staging artifacts at ${DIST}"
mkdir -p "${DIST}"

ARTIFACTS_DIR="${INSTALLER_SRC}/dist/artifacts"
# amd64 builds produce two ISOs: the main installer and *-net-install.iso.
# cp with a glob fails when multiple sources target a single file path.
mapfile -t PRIMARY_ISOS < <(find "${ARTIFACTS_DIR}" -maxdepth 1 -type f -name '*.iso' ! -name '*-net-install.iso' | sort)
if [[ ${#PRIMARY_ISOS[@]} -ne 1 ]]; then
  fail "expected exactly one primary ISO in ${ARTIFACTS_DIR}, found ${#PRIMARY_ISOS[@]}: ${PRIMARY_ISOS[*]:-"(none)"}"
fi
cp "${PRIMARY_ISOS[0]}" "${DIST}/harvester-nexus-${VERSION}.iso"
cp -r "${INSTALLER_SRC}/dist/harvester-cluster-repo" "${DIST}/"
sha256sum "${DIST}/harvester-nexus-${VERSION}.iso" > "${DIST}/harvester-nexus-${VERSION}.iso.sha256"

log "harvester-nexus iso built · ${DIST}/harvester-nexus-${VERSION}.iso"
log "sha256: $(awk '{print $1}' "${DIST}/harvester-nexus-${VERSION}.iso.sha256")"
