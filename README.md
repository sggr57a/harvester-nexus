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
- **Themable cockpit** — three switchable themes (Route Grid, Emerald Console, Solar Flare) so all 2.0 dashboards adapt to operator preference. Theme selection persists in `localStorage`.

## Overview

Nexus is the updated Harvester fork with:

- Extended storage backend support: iSCSI, GlusterFS, Longhorn, OpenEBS, Portworx, NVMe-oF, RDMA, Ceph, ZFS, NFS, SMB, and local storage.
- Networking and service mesh support: Istio, Linkerd, Cilium, Service, Ingress, and NetworkPolicy.
- Security and compliance scaffolding: RBAC, Pod Security Standards, service accounts, and workload annotations.
- Observability tooling templates: Prometheus monitoring, Fluentd/Loki/Splunk logging.
- GitOps support: ArgoCD, Flux, Jenkins X integration manifests.
- Multi-cluster provisioning: federated deployment templates and cluster targeting.

## What is included

- In-tree Harvester platform source under `platform/harvester` so Nexus is tracked as a standalone system instead of a UI-only add-on.
- Nexus new-machine wizard for Harvester create/join/binaries install flows with generated automatic install configuration.
- Wizard-driven workload and manifest configuration.
- Storage selection for local, NFS, SMB, Ceph, NVMe-oF, RDMA, ZFS, iSCSI, GlusterFS, Longhorn, OpenEBS, and Portworx.
- Auto-generated `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, and `CronJob` manifests.
- PVC, Service, Ingress, NetworkPolicy, RBAC, monitoring, logging, GitOps, and multi-cluster manifest generation.
- Service mesh integration support for Istio, Linkerd, and Cilium.
- CodeMirror YAML editor preview with dark mode styling.
- Live-adapter operation planning for Kubernetes API validation, `kubectl` apply/test runs, `vcluster` workflows, and CSI templates sourced from the imported Harvester tree.

## Quick start

1. Install dependencies: `npm install`
2. Run the dev server: `npm run dev`
3. Open the browser at `http://localhost:4173`

## Verified build

- Production build passes with `npm run build`.
- The generated bundle is ready for local demo and review.

## Demo installation

This prototype is intended as a front-end Nexus demo for Harvester-style workload generation. After launching the app locally, use the wizard to select storage, networking, security, monitoring, GitOps, and multi-cluster options, then review generated manifests in the built-in YAML editor.

### Run locally

1. Clone or navigate to the project folder.
2. Install dependencies: `npm install`
3. Start the app: `npm run dev`
4. Open the browser at `http://localhost:4173`

### GitHub branch and pull request

The updated Nexus version is available on the `nexus` branch in the forked repository:

- `https://github.com/sggr57a/harvester/tree/nexus`
- Pull request: `https://github.com/sggr57a/harvester/pull/1`

### Run locally

1. Clone or navigate to the project folder.
2. Install dependencies: `npm install`
3. Start the app: `npm run dev`
4. Open the browser at `http://localhost:4173`

### GitHub branch and pull request

The updated Nexus version is available on the `nexus` branch in the forked repository:

- `https://github.com/sggr57a/harvester/tree/nexus`

A pull request can be created from this branch to merge Nexus back into the main repository.

## Completed next steps

- Kubernetes validation and live preview now combine local structural prechecks with Nexus live-adapter endpoints and server-side dry-run command generation.
- Manifest apply / test runner commands are generated for `kubectl auth can-i`, server-side dry-run, diff, apply, and rollout status.
- Virtual cluster support generates `vcluster` create/connect operations from multi-cluster targets.
- Editor enhancements are implemented with CodeMirror YAML editing.
- Storage backend templates include CSI StorageClass, VolumeSnapshotClass, PVC manifests, and Harvester source references under `platform/harvester/deploy/charts/harvester`.
