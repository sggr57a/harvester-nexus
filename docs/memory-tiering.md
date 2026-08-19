# Memory tiering

Nexus uses the **Linux kernel memory-tier framework**, not VMware’s NVMe-as-RAM
page store. Byte-addressable devices become NUMA nodes; cold pages demote and
hot pages promote. Block devices (NVMe/SSD) are a last-resort **zswap + swap**
tier. Missing hardware is recorded as `waitingForHardware` and is enabled the
moment the firmware or kernel exposes it.

## What was added

| Path | Role |
|---|---|
| `installer/overlay/usr/lib/nexus/memory_tiering.py` | Discover, plan, apply, metrics |
| `installer/overlay/usr/bin/nexus-memory-tiering` | First-boot / timer / udev entrypoint |
| `installer/overlay/etc/systemd/system/nexus-memory-tiering.service` | Apply sysctls when the node boots |
| `installer/overlay/etc/systemd/system/nexus-memory-tiering.timer` | Re-scan every 5 minutes for hotplug |
| `installer/overlay/etc/udev/rules.d/99-nexus-memory-tiering.rules` | CXL / DAX / NVMe add → re-run |
| `installer/overlay/etc/sysctl.d/99-nexus-memory-tiering.conf` | `vm.swappiness=20` |
| `installer/overlay/etc/nexus/config.yaml` `memoryTiering:` | Install-time policy |
| `installer/manifests/50-memory-tiering.yaml` | KubeVirt annotation / preference hints |
| `GET /api/v1/telemetry/memory-tiering` | Live snapshot for the cockpit |
| Processor & Memory dashboard (live) | NUMA, tiers, PSI, swap, hugepages, vmstat, zswap |

The install wizard still writes `nexus.memory_tiering` and
`nexus.features.memory_tiering=…`. Those flags are now **consumed**.

## What was not added (and why)

- **vSphere-style NVMe Memory Tiering** (hypervisor classifies guest 4K pages
  onto a reserved NVMe partition, guests see DRAM+NVMe as one RAM pool) is
  **not** in Linux or KubeVirt. The closest host equivalent is making guest RAM
  swappable (no 1 GiB hugepages on *tierable* VMs) so zswap+NVMe swap can take
  cold QEMU pages. GPU / TDX / latency-critical VMs should stay
  `nexus.io/memory-tiering=dram-only` with hugepages.
- **Wiping a whole NVMe namespace** to make swap. The agent records a candidate
  unused NVMe and creates a **bounded swap file** (max 8 GiB) under
  `/var/lib/nexus/memory-tiering/swapfile`. Operators who want a dedicated
  partition run `mkswap` / `swapon` themselves.
- **New PCRAM SKUs.** Intel Optane PMem is EOL. `phase-change` is a **legacy
  DAX kmem** path for remaining DIMMs.

## Tiers (fast → slow)

1. **HBM** — faster CPU-less NUMA node when the kernel places it in a higher
   memory tier. Waiting if absent.
2. **DRAM** — local CPU nodes. Always present.
3. **CXL Type-3** — memory-only NUMA nodes / `/sys/bus/cxl`. Demotion +
   `kernel.numa_balancing=2` when a slower node exists.
4. **Phase-change / PMem** — `/dev/dax*` bound to `dax/kmem` (`system-ram`).
5. **zswap** — compressed DRAM pool in front of swap.
6. **Hypervisor NVMe directory** — `/var/lib/nexus/memory-tier-nvme` for a
   future QEMU `memory-backend-file` hook.
7. **Swap** — NVMe/SSD swap file or partition.

## Policies

- `capacity` (default) — demote cold pages, promote hot pages (working-set stays
  in DRAM).
- `bandwidth` — `MPOL_WEIGHTED_INTERLEAVE` instead of demotion; pages stay where
  they were allocated.

## Future hooks (no-op until sysfs appears)

- CXL pooling / switches (`/sys/bus/cxl/devices/switch*`)
- Compressed CXL QoS class
- DAMON and `damon_tier`
- `pghot` promotion
- Package-aware `/sys/devices/system/package/`
- Guest CXL / NVDIMM QEMU topology (`nexus.io/guest-cxl=reserved` until KubeVirt
  models the device)

## Metrics

Live payload includes:

- `meminfo` — MemTotal/Available, SwapTotal/Free, AnonPages, Committed_AS,
  VmallocUsed, Active/Inactive anon+file, Shmem, hugepages
- `vmstat` — pgdemote_*, pgpromote_*, pswpin/pswpout, zswpin/zswpout, pgfault /
  pgmajfault, numa_hit/miss/foreign, pgmigrate_success (`null` if the kernel
  has no such counter)
- `psi` — memory/cpu/io some+full avg10/60/300
- `zswap` — enabled, compressor, pool percent, stored_pages, writeback
- `/proc/swaps`, hugepage pools, memory_tier nodelists, demotion_enabled,
  numa_balancing

## KubeVirt

ConfigMap `nexus-memory-tiering` in `nexus-cockpit` documents:

- `nexus.io/memory-tiering=auto` — swappable guest RAM (no 1 GiB hugepages)
- `nexus.io/memory-tiering=dram-only` — hugepages, never demote
- `nexus.io/guest-cxl` / `nexus.io/guest-nvdimm` — reserved

1 GiB hugepages **pin DRAM** and prevent demotion of those pages. The default
poly-compute `hugepages1g` reservation is unchanged for DPDK/GPU VMs; only VMs
that opt into `auto` should skip hugepages.
