# Branch: `harvester-nexus-unified`

**Harvester Nexus Unified Edition** — standalone development line.

| | |
|---|---|
| **Status** | Active development · **not for merge into `main`** |
| **Version** | `2.1.0+nexus.unified.1` (see `installer/VERSION`) |
| **ISO build** | [docs/HARVESTER-NEXUS-UNIFIED.md](docs/HARVESTER-NEXUS-UNIFIED.md) |
| **New repo export** | [docs/EXPORT-NEW-REPO.md](docs/EXPORT-NEW-REPO.md) |

## Quick start

```bash
git checkout harvester-nexus-unified
cd installer && make iso-builder && make iso BUILD_VERSION="$(./ci-version.sh)"
```

## Surfaces

- **Harvester** — native VM/Host/Volume/Image/Network controls (upstream-aligned)
- **Nexus Ops** — Mission Control, XDR, poly-compute, wizards, telemetry HUD
