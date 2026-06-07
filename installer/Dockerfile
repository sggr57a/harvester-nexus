# Nexus-flavored ISO builder image.
#
# IMPORTANT: rancher/harvester-installer:<tag> is a FROM-scratch image that
# contains ONLY /usr/bin/harvester-installer — no shell, no package manager.
# The ISO build needs the full Dapper toolchain from harvester-installer's
# Dockerfile.dapper (Go, xorriso, squashfs, Helm, Docker CLI, …) plus Node.js
# for the cockpit production bundle.
#
# Built and tagged by `make iso-builder`. Run with `make iso`.

FROM registry.suse.com/bci/golang:1.25

SHELL ["/bin/bash", "-c"]

ARG ARCH=amd64
ENV ARCH=${ARCH}

# ISO build toolchain — mirrors harvester-installer/Dockerfile.dapper.
# mtools + dosfstools are required by luet-makeiso >= 0.4.0 for hybrid ISOs.
RUN zypper -n rm container-suseconnect && \
    zypper -n install \
      bash \
      git \
      curl \
      docker \
      gzip \
      tar \
      wget \
      zstd \
      squashfs \
      xorriso \
      awk \
      jq \
      mtools \
      dosfstools \
      unzip \
      rsync \
      patch

# Node.js 20 — the golang BCI image does not ship nodejs20 in its default
# zypper repos; install the official upstream binary (same approach as yq/Helm).
ARG NODE_VERSION=20.18.3
RUN NODE_ARCH=$([ "${ARCH}" = "arm64" ] && echo arm64 || echo x64) && \
    curl -sfLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" && \
    tar -xJf "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /usr/local --strip-components=1 && \
    rm "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" && \
    node --version && npm --version

# yq (same source/version family as upstream harvester-installer)
ARG YQ_VERSION=v4.52.5
ARG YQ_SUM_amd64=75d893a0d5940d1019cb7cdc60001d9e876623852c31cfc6267047bc31149fa9
ARG YQ_SUM_arm64=90fa510c50ee8ca75544dbfffed10c88ed59b36834df35916520cddc623d9aaa
ENV YQ_SUM="YQ_SUM_${ARCH}"
RUN curl -sfL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${ARCH}" \
      -o /usr/bin/yq && \
    echo "${!YQ_SUM}  /usr/bin/yq" | sha256sum -c - && \
    chmod +x /usr/bin/yq

# Helm (required by harvester-installer scripts/ci → build-bundle)
ARG HELM_VERSION=v3.20.0
ARG HELM_SUM_amd64=dbb4c8fc8e19d159d1a63dda8db655f9ffa4aac1b9a6b188b34a40957119b286
ARG HELM_SUM_arm64=bfb14953295d5324d47ab55f3dfba6da28d46c848978c8fbf412d4271bdc29f1
ENV HELM_SUM="HELM_SUM_${ARCH}"
RUN mkdir /usr/tmp && cd /usr/tmp && \
    curl -sfLO "https://get.helm.sh/helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" && \
    echo "${!HELM_SUM}  helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" | sha256sum -c - && \
    tar xzf "helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" --strip-components=1 && \
    mv helm /usr/bin/helm && \
    rm -rf /usr/tmp

LABEL org.opencontainers.image.title="harvester-nexus-iso-builder"
LABEL org.opencontainers.image.description="Builds the Harvester-Nexus install ISO with bundled cockpit + XDR + AnyRAID overlays."
LABEL org.opencontainers.image.source="https://github.com/sggr57a/harvester-nexus"
LABEL org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /src
ENV HARVESTER_NEXUS_OVERLAY=/build/nexus-overlay
ENV HARVESTER_NEXUS_DIST=/build/dist
RUN mkdir -p "${HARVESTER_NEXUS_OVERLAY}" "${HARVESTER_NEXUS_DIST}"

# Explicit bash — do not rely on /bin/sh or a script shebang inside a
# scratch-derived image (the old base had no shell at all).
ENTRYPOINT ["/bin/bash", "/src/installer/build-iso.sh"]
