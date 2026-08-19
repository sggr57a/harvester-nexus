# Harvester-Nexus ISO build targets.
#
# Common workflows:
#   make overlay      stage the nexus overlay (no Docker required)
#   make simulate     end-to-end install simulation (no Docker required)
#   make iso-builder  build the harvester-nexus-iso-builder image (needs docker)
#   make iso          build the harvester-nexus-*.iso (needs docker + ~30 min)
#   make clean        remove dist/, build/, and node_modules/

REPO_ROOT       := $(shell cd .. && pwd)
INSTALLER_DIR   := $(REPO_ROOT)/installer
VERSION         := $(shell cat $(INSTALLER_DIR)/VERSION)
# Override at build time: `make iso BUILD_VERSION=3.0.0+nexus.1.main.42.abc1234`
BUILD_VERSION   ?= $(VERSION)
# Docker tags cannot contain '+'; keep the human-readable VERSION for ISO filenames.
DOCKER_TAG      := $(subst +,-,$(VERSION))
# Override at build time for CI: BUILD_DIR=/var/lib/docker/nexus-ci/build
BUILD_DIR       ?= $(REPO_ROOT)/build
DIST            ?= $(REPO_ROOT)/dist
ISO_BUILDER_IMG := harvester-nexus-iso-builder:$(DOCKER_TAG)-go1.26
ISO_FILE        := $(DIST)/harvester-nexus-$(BUILD_VERSION).iso

ISO_RUN = docker run --rm --privileged \
	  --entrypoint /bin/bash \
	  -v /var/run/docker.sock:/var/run/docker.sock \
	  -v $(REPO_ROOT):/src \
	  -v $(BUILD_DIR):/build \
	  -v $(DIST):/build/dist \
	  -e BUILD_DIR=/build \
	  -e HARVESTER_NEXUS_DIST=/build/dist \
	  -e REPO_ROOT=/src \
	  -e NEXUS_VERSION=$(BUILD_VERSION) \
	  -e DOCKER_API_VERSION=1.44 \
	  -e DOCKER_BUILDKIT=0 \
	  -e GOTOOLCHAIN=local \
	  $(ISO_BUILDER_IMG)

.PHONY: overlay
overlay:
	@echo ">> staging Nexus overlay (no Docker)"
	@SKIP_ISO_STAGE=1 BUILD_DIR=$(BUILD_DIR) HARVESTER_NEXUS_DIST=$(DIST) \
	  HARVESTER_NEXUS_OVERLAY=$(BUILD_DIR)/nexus-overlay \
	  REPO_ROOT=$(REPO_ROOT) \
	  $(INSTALLER_DIR)/build-iso.sh

.PHONY: simulate
simulate: overlay
	@echo ">> running install simulator"
	@node $(INSTALLER_DIR)/simulator/simulate.mjs

.PHONY: iso-rebuild
iso-rebuild:
	@echo ">> force-rebuilding iso-builder image $(ISO_BUILDER_IMG) (no cache)"
	@docker build --pull --no-cache \
	  --build-arg GO_TOOLCHAIN_REV=3 \
	  -t $(ISO_BUILDER_IMG) -f $(INSTALLER_DIR)/Dockerfile $(REPO_ROOT)
	@$(MAKE) verify-iso-builder

ISO_BUILDER_PATH := /usr/local/go/bin:/usr/local/bin:/usr/sbin:/sbin:/usr/bin:/bin

.PHONY: iso-builder
iso-builder:
	@echo ">> building iso-builder image $(ISO_BUILDER_IMG)"
	@docker build --pull \
	  --build-arg GO_TOOLCHAIN_REV=3 \
	  -t $(ISO_BUILDER_IMG) -f $(INSTALLER_DIR)/Dockerfile $(REPO_ROOT)
	@$(MAKE) verify-iso-builder

.PHONY: verify-iso-builder
verify-iso-builder:
	@echo ">> verifying iso-builder toolchain (Go 1.26+, mkfs.vfat required)"
	@docker run --rm --entrypoint /bin/bash $(ISO_BUILDER_IMG) -c \
	  'export PATH=$(ISO_BUILDER_PATH); \
	   go version | grep -qE "go1\\.(2[6-9]|[3-9][0-9])" || { echo "FATAL: iso-builder Go too old: $$(go version)"; exit 1; }; \
	   command -v mkfs.vfat >/dev/null || { echo "FATAL: mkfs.vfat missing from iso-builder (run: make iso-rebuild)"; exit 1; }; \
	   yq --version && helm version --short && docker --version && go version' \
	  || { echo ">> iso-builder image missing or toolchain incomplete — run: make iso-rebuild"; exit 1; }

.PHONY: iso
iso: iso-builder
	@echo ">> building ISO via $(ISO_BUILDER_IMG)"
	@mkdir -p $(DIST) $(BUILD_DIR)
	@$(ISO_RUN) /src/installer/build-iso.sh
	@echo ">> ISO produced: $(ISO_FILE)"
	@ls -lh $(ISO_FILE)

.PHONY: iso-only
iso-only: verify-iso-builder
	@echo ">> building ISO via $(ISO_BUILDER_IMG) (reusing existing iso-builder image)"
	@mkdir -p $(DIST) $(BUILD_DIR)
	@$(ISO_RUN) /src/installer/build-iso.sh
	@echo ">> ISO produced: $(ISO_FILE)"
	@ls -lh $(ISO_FILE)

.PHONY: clean
clean:
	@rm -rf $(BUILD_DIR) $(DIST) $(REPO_ROOT)/node_modules

.PHONY: tests
tests:
	@echo ">> running installer tests"
	@cd $(REPO_ROOT) && npm test -- installer

.PHONY: help
help:
	@grep -hE '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) || \
	  printf 'targets:\n  overlay\n  simulate\n  iso-builder\n  iso\n  clean\n  tests\n  help\n'
