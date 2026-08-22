# Nexus

Nexus is a next-generation, high-performance, open-source hyperconverged infrastructure (HCI) platform. Branching from the `harvester-nexus` architecture and built on a rock-solid **SLE Micro** base, nexus breaks down the structural silos between traditional virtual machines, Kubernetes guest clusters, and high-efficiency system containers.

By unifying Harvester-native **Kubernetes (KubeVirt)** with catalog scaffolding for **Proxmox** / **Incus (LXC)** agility and VMware vSphere–class storage/scheduling *ideas*, Nexus is a consolidation UI and installer overlay — not every catalog row is live on Harvester. See [`docs/FEATURE_MATURITY.md`](./docs/FEATURE_MATURITY.md).

---

## New Features

### 1. Unified Poly-Compute Engine
Run heterogeneous compute topologies on a single bare-metal node loop without performance penances:
*   **Virtual Machines (KubeVirt):** **live** — full OS stacks, kernel independence, live-migration on Harvester.
*   **System Containers (Incus/LXC Engines):** **scaffold** — wizard + generators; no Incus controller on Harvester. Kept for additional work.
*   **Native K8s Pods:** **live** — standard containerized applications on the cluster.

### 2. Universal Storage Fabric (USF)
Nexus decouples the storage *catalog* from a single vendor, but first-boot only provisions the selected default backend (Longhorn by default):

| Storage Type | Integration Path | Maturity | Key Feature |
| :--- | :--- | :--- | :--- |
| **Longhorn** | Native CSI Fabric | live | Built-in incremental snapshots & backups |
| **local-path / NFS / iSCSI** | CSI templates | live | Harvester-compatible paths |
| **AnyRAID** | StorageClass `anyraid-default` (`rancher.io/local-path`) | experimental | Heterogeneous-capacity slab planner; not `anyraid.csi.nexus.io` |
| **Ceph (RBD/FS)** | Rook / CRDs | scaffold | High-scale distributed clusters |
| **Vitastor** | CSI template strings | scaffold | Userspace SPDK idea; no in-tree controller |
| **Portworx** | Operator YAML generator | scaffold | External product; not first-boot |
| **ZFS Pools** | Direct host / CSI | scaffold | CoW, zstd, ARC when the pool exists |
| **NFS / SMB** | Subpath volume driver | live / scaffold | RWX shares where the CSI exists |

### 3. Hyper-Efficient Data Path & Hardware Acceleration
Traditional hypervisors waste critical processing cycles translating hardware commands. Nexus routes processing requests straight to the silicon **when the hardware is present** (`waiting-for-hardware`):
*   **Storage Bypass:** **SPDK** NVMe-over-Fabrics flags exist for when the path is available.
*   **Processing & Memory Pinning:** Topology-aware scheduling aligns CPU cores, `1GiB` hugepages, and PCIe to the same NUMA node.
*   **Network Line-Speed:** **vhost-user** and DPDK ring buffers are catalogued; they need the NIC.

### 4. Advanced Acceleration: Pass-Through & Nested Virtualization
Designed specifically for modern AI, ML, and deep-learning training and inference pipelines:
