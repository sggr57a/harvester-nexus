# Nexus-flavored ISO builder image.
#
# Layers on top of Harvester's upstream iso-builder so we inherit the
# whole base-OS construction toolchain (xorriso, mksquashfs, dracut,
# rauc, combustion-rs, ...) and just add the Node toolchain we need to
# build the cockpit production bundle + the yq we need to merge install-
# time wizard answers.
#
# Built and tagged by `make iso-builder`. Run with
# `make iso` to produce the final harvester-nexus-*.iso.

FROM rancher/harvester-installer:master-head AS base

LABEL org.opencontainers.image.title="harvester-nexus-iso-builder"
LABEL org.opencontainers.image.description="Builds the Harvester-Nexus install ISO with bundled cockpit + XDR + AnyRAID overlays."
LABEL org.opencontainers.image.source="https://github.com/sggr57a/harvester-nexus"
LABEL org.opencontainers.image.licenses="Apache-2.0"

# Node.js + yq for the cockpit build + wizard-answer merge. SUSE base
# uses zypper; if the upstream image switches to apt the install line
# below auto-adapts.
RUN set -eux; \
    if command -v zypper >/dev/null; then \
      zypper --non-interactive in -y nodejs20 npm yq curl jq xorriso rsync; \
    elif command -v apt-get >/dev/null; then \
      apt-get update -y && apt-get install -y --no-install-recommends \
        curl ca-certificates yq xorriso rsync gnupg; \
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; \
      apt-get install -y nodejs; \
    else \
      printf 'unsupported base image package manager\n' >&2; exit 1; \
    fi; \
    node --version; npm --version; yq --version; xorriso --version | head -1

# Copy the cockpit source into the builder so the Nexus overlay can be
# produced in-place. (Real build mounts the source via -v instead, but
# keeping a copy here lets developers run `docker run --rm` standalone.)
WORKDIR /src
ENV HARVESTER_NEXUS_OVERLAY=/build/nexus-overlay
ENV HARVESTER_NEXUS_DIST=/build/dist
RUN mkdir -p ${HARVESTER_NEXUS_OVERLAY} ${HARVESTER_NEXUS_DIST}

# The actual build script is shipped with the repo and invoked at
# container runtime so changes don't require an image rebuild.
ENTRYPOINT ["/src/installer/build-iso.sh"]
