# Harvester Nexus Unified — standalone branch

This edition combines **upstream Harvester native controls** (VMs, Hosts, Volumes, Images, Networks, Settings) with the **full Nexus cockpit** (Mission Control, XDR, poly-compute, wizards) in one themed shell.

> **Important:** This line of development lives on the **`harvester-nexus-unified`** branch only. It is **not** merged into `main`. Use this branch (or a repo exported from it) for unified-edition ISO builds and testing.

## Which branch to use

| Branch | Purpose |
|--------|---------|
| `main` | Standard Nexus 2.0 cockpit (no unified Harvester surface) |
| **`harvester-nexus-unified`** | Unified Harvester + Nexus edition (this document) |

```bash
git clone https://github.com/sggr57a/harvester-nexus.git
cd harvester-nexus
git checkout harvester-nexus-unified
```

## What is included

- **Harvester surface** — sidebar navigation mirroring `harvester-ui-extension` (Dashboard, Hosts, VMs, Volumes, Images, Networks, Backup, Monitoring, Advanced)
- **Nexus Ops surface** — all existing Nexus HUD dashboards and wizards
- **Nexus theming** — Route Grid / Arctic themes, metrics strip, HUD effects on Harvester resource views
- **Live cluster BFF** — `/api/v1/harvester/*` Steve API collectors in `installer/overlay/usr/lib/nexus/harvester_collectors.py`
- **Platform source** — `platform/harvester/` (upstream Harvester Go tree, in-tree)

Key code paths:

```
src/lib/harvester/              Navigation, VM actions, Steve client, demo catalog
src/components/harvester/       Dashboard + resource manager views
src/harvester-nexus.css         Nexus styling for Harvester controls
installer/overlay/usr/lib/nexus/harvester_collectors.py
```

## Build an ISO (local)

**Requirements:** Docker, native Linux (Ubuntu 24.10+ recommended), ~25 GB free disk, ~30–90 minutes.

```bash
# 1. Checkout the unified branch only
git checkout harvester-nexus-unified

# 2. Build the iso-builder image (once, or after installer/Dockerfile changes)
cd installer
make iso-builder

# 3. Produce the bootable ISO
make iso BUILD_VERSION="$(./ci-version.sh)"
```

**Output:** `dist/harvester-nexus-<version>.iso` plus `.sha256` checksum.

Example version string: `2.1.0+nexus.unified.1.harvester-nexus-unified.local.abc1234`

### Quick validation without Docker (~20 seconds)

```bash
cd installer
make overlay    # builds SPA + stages overlay
make simulate   # end-to-end install simulation
```

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `go.mod requires go >= 1.26` | `make iso-rebuild && make iso` |
| Docker API version error | Ensure Docker 29+ or set `DOCKER_API_VERSION=1.44` |
| Stale builder image | `make iso-rebuild` |

## Build an ISO (GitHub Actions)

Pushes to **`harvester-nexus-unified`** trigger `.github/workflows/build-iso.yml` on this branch only.

1. Push commits to `harvester-nexus-unified`
2. Open **Actions → Build install ISO**
3. Download from **Artifacts** or **Releases → Branch ISO harvester-nexus-unified #…**

Manual re-run: **Actions → Build install ISO → Run workflow** (select branch `harvester-nexus-unified`).

## Test the ISO in a VM

```bash
qemu-img create -f qcow2 harvester-nexus-unified.qcow2 200G

qemu-system-x86_64 \
  -enable-kvm -m 16384 -smp 8 -cpu host \
  -drive file=harvester-nexus-unified.qcow2,if=virtio \
  -cdrom dist/harvester-nexus-*.iso \
  -boot d \
  -netdev user,id=net0,hostfwd=tcp::8443-:8443,hostfwd=tcp::443-:443 \
  -device virtio-net,netdev=net0
```

1. Complete the Harvester install wizard on the virtual console
2. Open **https://127.0.0.1:8443** (Nexus unified cockpit)
3. Login: `admin` / `admin` (forced password change on first login)
4. Use sidebar toggle: **Harvester** (native controls) · **Nexus Ops** (extended HUD)

Verify overlay on an installed node:

```bash
sudo bash /path/to/installer/verify-installed.sh
```

## Do not merge into main

This branch is intentionally isolated. To bring changes back to `main` later, open a dedicated review PR — do not fast-forward or auto-merge the unified branch wholesale.
