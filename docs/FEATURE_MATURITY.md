# Feature maturity

Nexus keeps scaffolding that can work with more work. This matrix is the
honest contract for what a Harvester-based install actually does today.
Labels:

| Label | Meaning |
| :--- | :--- |
| **live** | Harvester-native path covered by installer contracts / simulator / tests |
| **experimental** | Real code exists, but it is not a first-boot Harvester fact |
| **scaffold** | Generators, YAML, and UI exist; no Harvester-native controller |
| **waiting-for-hardware** | Needs the device (CXL, PMem, GPU, FPGA, vfio) |

Cockpit demo dashboards still show the full catalog (Portworx, Vitastor,
Incus rows, synthetic IOPS). That is demo telemetry, not cluster state.
See [`src/lib/dashboards.ts`](../src/lib/dashboards.ts).

## Compute

| Feature | Maturity | Notes |
| :--- | :--- | :--- |
| KubeVirt VMs | live | Harvester/KubeVirt on the installed node |
| Native Kubernetes pods | live | Cluster workloads |
| Incus / LXC system containers | scaffold | Wizard + manifest generators; no Incus controller on Harvester |
| Incus snapshot XDR responses | scaffold | YAML emitters only |

## Storage

| Feature | Maturity | Notes |
| :--- | :--- | :--- |
| Longhorn | live | Default Harvester CSI |
| local-path | live | Including AnyRAID's provisioner |
| NFS / iSCSI (catalog + CSI templates) | live | Standard in-tree / CSI templates |
| AnyRAID | experimental | LVM planner + StorageClass `anyraid-default` with provisioner `rancher.io/local-path`. **Not** `anyraid.csi.nexus.io`. Operator-triggered; default install leaves it off |
| Portworx | scaffold | Catalog + operator YAML generator; external product |
| Vitastor | scaffold | Catalog + CSI template strings; no in-tree controller |
| Ceph / Rook, NVMe-oF, RDMA, ZFS, GlusterFS, OpenEBS, SMB | scaffold or experimental | Registered in `config.yaml`; only the selected default backend is provisioned at first boot |

## Security (XDR / MDR)

| Feature | Maturity | Notes |
| :--- | :--- | :--- |
| Hardened first-boot stack | experimental | [`installer/manifests/20-xdr-stack.yaml`](../installer/manifests/20-xdr-stack.yaml): Falco, Tetragon, Wazuh agent+manager, Suricata, Hubble relay, Trivy operator, OpenSearch, Polaris, kube-bench, Grype, Syft |
| 17-sensor FOSS catalog + Maximum profile | scaffold | Wizard / engine catalog (MISP, OpenCanary, OpenSCAP, Lynis, kube-hunter, …). Not all 17 deploy on every install |
| Live alert ingest into SOC views | experimental | Wired for the applied sensors; demo mode still uses `XdrEngine` simulation |
| Automated response actions | scaffold / experimental | Manifest emitters exist (Cilium isolate, KubeVirt snapshot, …). Incus snapshot is scaffold |

## Platform / cockpit

| Feature | Maturity | Notes |
| :--- | :--- | :--- |
| Generated cockpit password + force rotate | live | `/etc/nexus/cockpit-password`; no shipped `admin`/`admin` on the install-node path |
| Demo SPA `admin`/`admin` | live (browser demo only) | [`src/lib/auth.ts`](../src/lib/auth.ts) when telemetry is demo |
| Measured host telemetry (nullable metrics) | live | Missing sensors are `null`, never invented |
| ISO overlay + first-boot bootstrap (simulated) | live | `make simulate` |
| Memory tiering (CXL / PMem / zswap) | waiting-for-hardware | Agent + dashboards; no extra guest RAM without the device |
| GPU / FPGA vfio pass-through | waiting-for-hardware | Needs IOMMU + the card |
| SPDK / DPDK / vhost-user fast paths | waiting-for-hardware | Boot flags exist; need the NIC / NVMe path |
