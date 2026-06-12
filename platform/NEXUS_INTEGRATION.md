# Nexus platform integration

This directory carries the Harvester platform source imported from `https://github.com/harvester/harvester` on the `master` branch.

- Imported commit: `462ac0ce enhancement: Support Storage Migration for Restored VMs`
- Source root used by Nexus UI helpers: `platform/harvester`
- Nexus-owned UI and workflow code remains at the repository root under `src/`.
- Harvester UI navigation reference: `https://github.com/harvester/harvester-ui-extension` (Vue/Rancher Steve stack)

The goal is for Nexus to be a branded Harvester-derived system with the platform source available in-tree, not a browser-only add-on layered outside the product.

## Unified cockpit (Harvester + Nexus)

The React SPA at `src/` now exposes **both surfaces** in one themed shell:

| Surface | Purpose |
|---------|---------|
| **Harvester** | Native Harvester navigation (Dashboard, Hosts, VMs, Volumes, Images, Networks, Backup, Monitoring, Advanced) with upstream-equivalent VM action controls |
| **Nexus Ops** | Mission Control, XDR, poly-compute, wizards, and all Nexus-specific HUD dashboards |

- Navigation catalog: `src/lib/harvester/harvesterNav.ts` (mirrors `harvester-ui-extension/pkg/harvester/config/harvester-cluster.js`)
- Resource views: `src/components/harvester/HarvesterViews.tsx`
- Live Steve API BFF: `installer/overlay/usr/lib/nexus/harvester_collectors.py` → `/api/v1/harvester/*`
- Deep-link to stock Harvester dashboard at `:443` remains available per resource view

