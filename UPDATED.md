# Harvester - Nexus

Nexus is a next-generation, high-performance, open-source hyperconverged infrastructure (HCI) platform. Branching from the `harvester-nexus` architecture and built on a rock-solid **SLE Micro** base, nexus breaks down the structural silos between traditional virtual machines, Kubernetes guest clusters, and high-efficiency system containers. 

By unifying the bare-metal agility of **Proxmox** and **Incus (LXC)** with the massive cloud-native orchestration of **Kubernetes (KubeVirt)** and **VMware vSphere** class enterprise storage/scheduling, nexus represents the ultimate consolidation of computing, storage, and specialized hardware accelerators.

---

## 🚀 Key Architectural Pillars

### 1. Unified Poly-Compute Engine
Run heterogeneous compute topologies on a single bare-metal node loop without performance penances:
*   **Virtual Machines (KubeVirt):** Heavyweight enterprise workloads with full operating system stacks, kernel independence, and live-migration capabilities.
*   **System Containers (Incus/LXC Engines):** Lightweight, dense, bare-metal speed instances sharing the host kernel but maintaining separate user spaces—ideal for high-density microservices, build systems, and native I/O tasks.
*   **Native K8s Pods:** Standard containerized applications running directly on the orchestration backplane.

### 2. Universal Storage Fabric (USF)
`gemini-omni` decouples the storage runtime from proprietary boundaries, allowing operators to spin up virtual disks or system containers utilizing any modern storage architecture concurrently:

| Storage Type | Integration Path | Target Workload | Key Feature |
| :--- | :--- | :--- | :--- |
| **Longhorn** | Native CSI Fabric | Replicated Cloud-Native VMs | Built-in incremental snapshots & backups |
| **Ceph (RBD/FS)** | Native CRDs / Vitastor | High-Scale Distributed Clusters | Userspace SPDK bypasses host kernel block layer |
| **ZFS Pools** | Direct Host Local Device | Ultra-low Latency System Containers | Native Copy-on-Write, inline zstd compression, ARC cache |
| **iSCSI / Block** | Multipath `vfio-pci` | Legacy SAN Migrations | Raw block volume mapping with hardware failover |
| **NFS / SMB** | Subpath Volume Driver | Shared Media / Document Stores | Distributed RWX (ReadWriteMany) file shares |

### 3. Hyper-Efficient Data Path & Hardware Acceleration
Traditional hypervisors waste critical processing cycles translating hardware commands. Nexus routes processing requests straight to the silicon:
*   **Storage Bypass:** Uses **SPDK (Storage Performance Development Kit)** to direct NVMe-over-Fabrics commands from userspace directly to the network mesh.
*   **Processing & Memory Memory Pinning:** Full Topology-Aware Scheduling aligns CPU cores, `1GiB` Hugepages, and PCI-e fabrics to the **same physical NUMA node** to eradicate cross-socket latency bottlenecks.
*   **Network Line-Speed:** Implements **vhost-user** and DPDK ring buffers to bypass legacy virtual ethernet (`veth`) overhead.

### 4. Advanced Acceleration: Pass-Through & Nested Virtualization
Designed specifically for modern AI, ML, and deep-learning training and inference pipelines:
