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
DIST            := $(REPO_ROOT)/dist
BUILD_DIR       := $(REPO_ROOT)/build
ISO_BUILDER_IMG := harvester-nexus-iso-builder:$(VERSION)
ISO_FILE        := $(DIST)/harvester-nexus-$(VERSION).iso

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

.PHONY: iso-builder
iso-builder:
	@echo ">> building iso-builder image $(ISO_BUILDER_IMG)"
	@docker build -t $(ISO_BUILDER_IMG) -f $(INSTALLER_DIR)/Dockerfile $(REPO_ROOT)

.PHONY: iso
iso: iso-builder
	@echo ">> building ISO via $(ISO_BUILDER_IMG)"
	@mkdir -p $(DIST) $(BUILD_DIR)
	@docker run --rm --privileged \
	  -v /var/run/docker.sock:/var/run/docker.sock \
	  -v $(REPO_ROOT):/src \
	  -v $(DIST):/build/dist \
	  -e BUILD_DIR=/build \
	  -e REPO_ROOT=/src \
	  -e NEXUS_VERSION=$(VERSION) \
	  $(ISO_BUILDER_IMG)
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
