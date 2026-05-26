# Nexus

Nexus is a next-generation, high-performance, open-source hyperconverged infrastructure (HCI) platform. Branching from the harvester-nexus architecture and built on a rock-solid SLE Micro base, nexus breaks down the structural silos between traditional virtual machines, Kubernetes guest clusters, and high-efficiency system containers.

By unifying the bare-metal agility of Proxmox and Incus (LXC) with the massive cloud-native orchestration of Kubernetes (KubeVirt) and VMware vSphere class enterprise storage/scheduling, nexus represents the ultimate consolidation of computing, storage, and specialized hardware accelerators, including a HUD interface, wizard-driven machine provisioning, Kubernetes manifest generation, storage backend provisioning, and multi-cluster deployment workflows.

> **Version 2.0** lands the features described in [`UPDATED.md`](./UPDATED.md): the Poly-Compute Engine, the Universal Storage Fabric (now including Vitastor with SPDK bypass), hyper-efficient data path acceleration (SPDK / DPDK / vhost-user / NUMA pinning / 1 GiB hugepages), and advanced acceleration (GPU + FPGA + smart-NIC pass-through, nested virtualization for AI / ML). See the [Nexus 2.0 release](#nexus-20-release) section.

## Nexus 2.0 release

Highlights:

- **Poly-Compute Engine dashboard** — runs KubeVirt VMs, Incus / LXC system containers, and native Kubernetes pods on the same bare-metal loop. Includes mixed-mode density per node and topology-aware scheduling policies (NUMA-local DRAM affinity, 1 GiB hugepages for KubeVirt, nested-virt opt-in pools, cross-socket cost penalty).
- **Universal Storage Fabric** — every storage backend in the catalog is wired to Nexus's CSI / direct-host integration paths, including **Vitastor** with SPDK userspace queues, NVMe-oF / RDMA with userspace bypass, ZFS with copy-on-write + zstd + ARC cache, iSCSI multipath via `vfio-pci`, and NFS / SMB through the subpath volume driver for RWX shares.
- **Acceleration & Hardware Pass-Through dashboard** — SPDK userspace NVMe-oF queues, DPDK polled-mode ring buffers, vhost-user fast paths, topology-aware NUMA pinning with 1 GiB hugepages, GPU / FPGA / smart-NIC / TPU pass-through (vfio-pci / SR-IOV / mdev), and L1 nested virtualization for training, inference, sandbox, and CI pools.
- **Machine Wizard 2.0** — extends the install YAML with `poly_compute` and `hardware_acceleration` blocks and adds boot-parameter switches such as `nexus.poly_compute=kubevirt,incus,pods`, `nexus.acceleration.spdk=true`, `nexus.acceleration.hugepages_1g=64`, and `nexus.acceleration.gpu_passthrough=true`. Validation refuses a config that turns off every runtime or enables GPU pass-through without NUMA pinning.
- **Themable cockpit** — four cool-tone switchable themes (Route Grid, Arctic Hologram, Arctic Command, Ice Spectrum) so all dashboards adapt to operator preference. Theme selection persists in `localStorage`.
- **Geometric glass cockpit expansion** — redesigned instrument widgets, environment intelligence, and activity command dashboards for transparent control-room mockups.

## Overview

Nexus is the updated Harvester fork with:

- Extended storage backend support: iSCSI, GlusterFS, Longhorn, OpenEBS, Portworx, NVMe-oF, RDMA, Ceph, ZFS, **ZFS AnyRAID** (heterogeneous-capacity drives in a single slab-based pool), NFS, SMB, Vitastor, and local storage.
- Networking and service mesh support: Istio, Linkerd, Cilium, Service, Ingress, and NetworkPolicy.
- Security and compliance scaffolding: RBAC, Pod Security Standards, service accounts, and workload annotations.
- Observability tooling templates: Prometheus monitoring, Fluentd / Loki / Splunk logging.
- GitOps support: ArgoCD, Flux, Jenkins X integration manifests.
- Multi-cluster provisioning: federated deployment templates and cluster targeting.

## Features

### Cockpit & visualization
- **Mission Control** overview dashboard with multi-ring radial gauges, live oscilloscope waveforms, dial cluster, vertical level meters, ring meters, anomaly stream, 3D isometric cluster map, GitOps sync bank, GPU memory grid, API rate gauges, stacked area chart, sankey flow, percentile bands, and a dense stat grid.
- **Telemetry Wave** dashboard with high-density annotated oscilloscope traces (per-channel `MIN / AVG / MAX / NOW` readouts), 64-bin FFT spectrum bands with peak hold, and rolling latency histograms with `MEAN / P50 / P95 / P99` callouts for SPDK / DPDK / vhost-user / RDMA paths.
- **Networking dashboard** with a big **Threat-Intel Map** (MDR/XDR overlay): 50 country outlines as ghostly faded base + outline-only highlight for active source/threat countries, scarlet-red attack trajectories converging on the Frankfurt VIP, 80+ city lights, 60+ inter-DC network paths, threat hotspots, Iron-Man unfold info panels, MITRE kill-chain strip, DEFCON + 8 live XDR stat tiles. Followed by a sonar-style **Cluster Radar** widget (concentric tier rings + rotating sweep + traffic chords + tier roll-up + top talkers + flagged nodes).
- **HUD Dashboard** with instrument-style topology, radial gauges, scoped traces, segmented throughput bars, control toggles, event feed, and cluster stat tiles.
- **Environment Intelligence** and **Activity Command** dashboards for facility telemetry, automation queues, approvals, migrations, backups, and security scan activity.
- **Live Environment Ticker** banner above every dashboard with rolling cluster-wide stats (workloads, IOPS, ingress / egress Mb/s, CPU %, DRAM %, power, in-flight migrations, open CVEs, trust score).
- **Four cool-tone cockpit themes** (Route Grid, Arctic Hologram, Arctic Command, Ice Spectrum) with persistent `localStorage` selection; every panel, gauge, control, and background adapts to the active theme. Theme picker is a compact dropdown in the sidebar.
- Eight additional themed data dashboards: Networking, Storage, Machines & Containers, Processor & Memory, Poly-Compute Engine, Acceleration, Operations & Compliance, and Resource Monitoring.

### Wizards & workflows
- In-tree Harvester platform source under `platform/harvester` so Nexus is tracked as a standalone system instead of a UI-only add-on.
- Nexus new-machine wizard for Harvester create/join/binaries install flows with generated automatic install configuration.
- Manifest Wizard embedded inside the unified Setup Wizard as an optional setup section, allowing workload manifest generation without leaving the provisioning flow.
- Wizard-driven workload and manifest configuration.
- Storage selection for local, NFS, SMB, Ceph, NVMe-oF, RDMA, ZFS, **ZFS AnyRAID**, iSCSI, GlusterFS, Longhorn, OpenEBS, Portworx, and Vitastor (with SPDK userspace bypass). The AnyRAID wizard step accepts heterogeneous drive capacities, computes the effective usable capacity from a slab-based redundancy plan, and renders a `StorageClass` whose parameters carry the per-disk inventory through to the CSI driver.
- Auto-generated `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, and `CronJob` manifests.
- PVC, Service, Ingress, NetworkPolicy, RBAC, monitoring, logging, GitOps, and multi-cluster manifest generation.
- Service mesh integration support for Istio, Linkerd, and Cilium.

### Editor & integration
- CodeMirror YAML editor preview with live validation and dark-mode styling.
- Live-adapter operation planning for Kubernetes API validation, `kubectl` apply/test runs, `vcluster` workflows, and CSI templates sourced from the imported Harvester tree.
- Kubernetes validation and live preview combining local structural prechecks with Nexus live-adapter endpoints and server-side dry-run command generation.
- Manifest apply / test runner commands generated for `kubectl auth can-i`, server-side dry-run, diff, apply, and rollout status.
- Virtual-cluster support generating `vcluster` create/connect operations from multi-cluster targets.
- Storage backend templates that include CSI StorageClass, VolumeSnapshotClass, PVC manifests, and Harvester chart references under `platform/harvester/deploy/charts/harvester`.

## Install on a fresh Ubuntu host

The Nexus cockpit ships as a React + TypeScript single-page app built with Vite. The instructions below get you from a clean Ubuntu 22.04 / 24.04 box to a running Nexus dev server on `http://localhost:4173`.

### 1. System prerequisites

```bash
sudo apt update
sudo apt install -y git curl build-essential ca-certificates
```

### 2. Install Node.js 20.x

The project requires **Node.js ≥ 20** (matches `vite@5` and `vitest@4`). Use one of these:

**Option A — nvm (recommended for development):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
```

**Option B — NodeSource APT (system install):**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Confirm the install:

```bash
node --version   # v20.x or higher
npm --version    # 10.x or higher
```

### 3. Clone the repository

```bash
git clone https://github.com/sggr57a/harvester-nexus.git
cd harvester-nexus
```

> To run the bleeding-edge branch instead of `main`, check it out:
> `git checkout cursor/multi-theme-live-mockup-d3bc`

### 4. Install JavaScript dependencies

```bash
npm install
```

This installs React, Vite, CodeMirror, Vitest, TypeScript, and the rest of the toolchain (~280 packages).

### 5. Run the dev server

```bash
npm run dev
```

Open `http://localhost:4173` in any browser. **Demo credentials**: `admin` / `demo`.

> The dev server binds to port **4173** (not the default Vite 5173) — see `vite.config.ts`.

### 6. Verify the build

```bash
npx tsc --noEmit     # type-check the project
npm run test         # run the Vitest suite (51 tests)
npm run build        # production build into ./dist
npm run preview      # preview the production bundle on :4173
```

### 7. Optional — Playwright capture scripts

The `scripts/` folder contains optional Playwright-based mockup-capture scripts (`smoke-shot.mjs`, `record-mockups.mjs`, `capture.mjs`, `capture-login.mjs`). Install Chromium for Playwright before first use:

```bash
npx playwright install chromium
node scripts/capture.mjs
```

### 8. Optional — run inside Docker

If you'd rather not install Node on the host:

```bash
docker run --rm -it -p 4173:4173 -v "$PWD":/app -w /app node:20-bookworm \
  bash -c "npm install && npm run dev -- --host 0.0.0.0"
```

Open `http://localhost:4173` from your host browser.

### Repository layout

```
src/                          React + TypeScript source
  App.tsx                     Top-level shell + cockpit nav
  lib/themes.ts               4-theme catalog
  lib/liveTelemetry.ts        1.6 s live tick hook
  components/                 Login, launch, theme picker, wizards
  components/dashboards/      MissionControl, TelemetryWave,
                              Dashboards, Widgets (KpiTile,
                              DialGauge, AnnotatedOscilloscope,
                              ThreatIntelMap, ClusterRadar, …)
  styles.css                  Single-file CSS with all theme tokens
platform/harvester/           In-tree Harvester platform source
                              (Go; not built by the frontend demo)
scripts/                      Optional Playwright capture scripts
docs/mockups/                 Reference screenshots & videos
```

## Verified build

- `npx tsc --noEmit` — clean type-check
- `npm run test` — 51 / 51 Vitest tests pass
- `npm run build` — production bundle succeeds

## Demo installation

This prototype is intended as a front-end Nexus demo for Harvester-style workload generation. After launching the app locally, use the **Setup Wizard** to provision the bare-metal install plan, then optionally open the embedded **Manifest Wizard** to select storage, networking, security, monitoring, GitOps, and multi-cluster options. The generated manifests appear in the built-in CodeMirror YAML editor; the **Cluster Console** view shows the live-adapter Kubernetes API validation, `kubectl` apply/test run, and `vcluster` operations.

### GitHub branch and pull request

The latest cockpit work is on:

- Branch: <https://github.com/sggr57a/harvester-nexus/tree/cursor/multi-theme-live-mockup-d3bc>
- Default branch: <https://github.com/sggr57a/harvester-nexus/tree/main>

The Harvester platform fork still lives on:

- Branch: <https://github.com/sggr57a/harvester/tree/nexus>
- Pull request: <https://github.com/sggr57a/harvester/pull/1>
