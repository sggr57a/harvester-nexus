# NPU, TPU, and FPGA add-in cards

Nexus already *talks* about GPU / FPGA / smart-NIC / TPU pass-through
(`capability.fpga-passthrough`, wizard “GPU / FPGA pass-through”, Acceleration
dashboard). That path is **catalog + flags**. There is no host agent that
discovers a card, binds a driver, or advertises it to KubeVirt or kubelet.

This note is the allowlist and first-boot design so a plugged-in card can be
used **without supporting every vendor**. Missing hardware stays
`waitingForHardware`, same contract as memory tiering.

## What “use it right away” means

A PCIe add-in card is usable on a Nexus node in **exactly one** of two modes.
The same function cannot be bound to `vfio-pci` *and* a vendor kmod at once.

| Mode | Who runs inference | First-boot work | Live migration |
|---|---|---|---|
| **A — VFIO / VM** | Guest (KubeVirt or Incus) with the vendor’s guest driver | Enable Harvester `pcidevices-controller`, claim allowlisted BDFs, IOMMU on | No (device is pinned to the node) |
| **B — host shared / pod** | Native pod via a Kubernetes device plugin + vendor runtime | Load kmod (in-tree or DKMS), deploy that vendor’s DaemonSet, advertise an extended resource | No |

**Mode A is the default for “card in the slot, workloads tomorrow.”** Harvester
already implements it for any PCI device: enable the
[`pcidevices-controller` add-on](https://docs.harvesterhci.io/v1.4/advanced/addons/pcidevices),
create a `PCIDeviceClaim`, and attach `hostDevices` on the VM. Nexus should
auto-claim **only** the allowlisted vendor IDs below, then show them on the
Acceleration dashboard from live `PCIDevice` objects instead of the demo
Coral / Alveo U200 rows.

Mode B is opt-in per vendor when the operator wants pods (not VMs) to share the
card. Each vendor’s plugin is a separate DaemonSet; do not invent a generic NPU
plugin.

Firmware: IOMMU (VT-d / AMD-Vi) already in the Nexus platform table. Secure
Boot off remains required for unsigned DKMS (Coral gasket, Hailo PCIe, some
XRT).

## Allowlist (leaders only)

Do not add Tenstorrent, Groq, Graphcore, Huawei Ascend, Mythic, Lattice eval
boards, or every Alveo SKU. Three classes, five vendors.

### FPGA — AMD Alveo and Intel PAC / DFL

**AMD (Xilinx) Alveo** is the production PCIe FPGA line after the 2022
acquisition. Classic U-series cards (U55C, U250, U30) use **XRT** on the host
and the [AMD-Xilinx Kubernetes device plugin](https://docs.amd.com/r/en-US/Xilinx_Kubernetes_Device_Plugin/Xilinx_Kubernetes_Device_Plugin)
(`xilinx.com/fpga-…` or `amd.com/ama_u30` resources). There is still no
supported cluster *operator*; the plugin is a DaemonSet.

**Alveo V80** is the current high-end card (Versal HBM, PCIe Gen4 x16 or dual
Gen5 x8). It does **not** use XRT. Host management is AVED / AMI; XRT and AMI
must not run on the same host. For Nexus, V80 is **Mode A (VFIO)** unless the
operator installs AVED by hand.

PCI vendor: `10ee` (Xilinx). Discover with `lspci -nn -d 10ee:`.

**Intel FPGA** (Arria 10, Stratix 10 PAC; DFL-class Agilex) uses the in-tree
Linux **DFL** driver or out-of-tree OPAE, plus the
[Intel FPGA device plugin](https://intel.github.io/intel-device-plugins-for-kubernetes/cmd/fpga_plugin/README.html)
(`fpga.intel.com/…`). Modes: `af` (bitstream already on the card) or `region`
(plugin programs the region before the container starts). Intel’s own plugin
docs list Arria 10 and Stratix 10; treat newer DFL devices as “advertise if
sysfs appears,” same as CXL hooks.

PCI vendor: `8086` with DFL/OPAE class — **never** bind every Intel PCI
function. Match DFL sysfs (`/sys/class/fpga_region`, `/dev/dfl-*`) rather than
vendor ID alone.

### NPU — Intel Gaudi 3 PCIe (datacenter) and Qualcomm Cloud AI 100

**Intel Gaudi 3 PCIe (HL-338)** is the add-in NPU to ship first. Intel sells it
as a standard PCIe Gen5 card (not only OAM). Kubernetes path is the
[Gaudi Base Operator](https://docs.habana.ai/en/latest/Installation_Guide/Additional_Installation/Kubernetes_Installation/Kubernetes_Operator.html)
or the [gaudi-device-plugin](https://github.com/HabanaAI/gaudi-device-plugin)
DaemonSet. Pods request `habana.ai/gaudi`. Drivers: `habanalabs`,
`habanalabs_cn`, `habanalabs_ib`, `habanalabs_en`.

Intel also documents **VFIO into a VM** for Gaudi: isolate `1da3:` IDs, then
install Habana software in the guest
([Configuring VMs on Gaudi](https://docs.habana.ai/en/latest/Virtualization/Configuring_VMs_on_Gaudi.html)).

| SKU | PCI ID |
|---|---|
| Gaudi 2 | `1da3:1020` |
| Gaudi 3 OAM | `1da3:1060` |
| Gaudi 3 PCIe (HL-338) | `1da3:1063` |

**Do not confuse this with `npu.intel.com/accel`.** That Intel NPU plugin is
for **on-die** Core Ultra (Meteor Lake / Arrow Lake / Lunar Lake / Panther
Lake) NPUs, not an add-in card
([npu_plugin README](https://intel.github.io/intel-device-plugins-for-kubernetes/cmd/npu_plugin/README.html)).
Optional later for laptops/NUC nodes; out of scope for “add-on cards.”

**Qualcomm Cloud AI 100** is the other widely deployed PCIe inference NPU.
In-tree Linux driver is `qaic` (`CONFIG_DRM_ACCEL_QAIC`). All SKUs use PCI
`17cb:a100`. Device nodes: `/dev/accel/accel*`. Kubernetes: QAic device plugin
(`qualcomm.com/qaic` or `qaic-std` / `qaic-pro` / `qaic-ultra`). Platform SDK
still required on the node for firmware
([kernel AIC100 doc](https://docs.kernel.org/accel/qaic/aic100.html),
[QAic K8s plugin](https://quic.github.io/cloud-ai-sdk-pages/latest/Getting-Started/Deployment/Kubernetes/index)).

**Hailo-8 / Hailo-10** M.2 modules are popular at the edge (26 TOPS Hailo-8)
but Kubernetes support is community plugins, not a first-party operator.
Keep Hailo **waitingForHardware** unless an operator explicitly enables an
experimental plugin. Do not ship unsigned Hailo DKMS on the ISO by default.

### TPU — Google Coral Edge TPU only

Google **Cloud TPU** (v5e, Trillium, Ironwood, …) is a Google-operated
datacenter ASIC. It is **not** a PCIe card you install in a Harvester node
([Coral FAQ](https://gweb-coral-full.uc.r.appspot.com/docs/edgetpu/faq/)).
TPU v1 was a Google-internal PCIe card in 2015; that product is not sold.

The only Google TPU you can plug into a Nexus box is **Coral Edge TPU**:

- Mini PCIe accelerator
- M.2 A+E, B+M, dual Edge TPU
- ASUS AI Accelerator PCIe card that holds up to eight Coral M.2 modules

PCI ID: `1ac1:089a` (Global Unichip / Apex). Host driver: out-of-tree **gasket
+ apex** DKMS, node `/dev/apex_0`. Official packages lag kernels 6.8+; SLE
Micro / Harvester kernels will need a maintained DKMS fork or **Mode A**: VFIO
the function into a guest that runs Apex
([gasket-driver](https://github.com/google/gasket-driver), PCI `089a` reports
in [edgetpu#890](https://github.com/google-coral/edgetpu/issues/890)).

Default for Coral on Nexus: **Mode A**. Host DKMS on the ISO is a follow-up.

The demo dashboard’s “Google Coral Edge TPU” row is a placeholder; live mode
must show the real `1ac1:089a` device or `null` / waiting.

## Live metrics (implemented)

The Acceleration dashboard and Mission Control consume
`GET /api/v1/telemetry/accelerators` (also nested under dashboards as
`acceleration`). Host collector: `accelerator_inventory.py`.

Measured when sysfs exports them:

- PCIe current vs max link speed/width (downshift is an issue)
- AER correctable / uncorrectable totals
- `hwmon` temperature
- runtime power state
- bound driver, NUMA node, IOMMU group

Never measured (stays `null`, not `0`): vendor SMU utilization, HBM/DRAM on the
card, TOPS. Those need Gaudi/XRT/qaic/apex runtimes.

Issues raised: `no-driver`, `no-iommu`, `pcie-link-downshifted`,
`aer-correctable`, `aer-uncorrectable`. Missing allowlisted families are
`waitingForHardware` (`npu-gaudi`, `npu-qaic`, `tpu-coral`, `fpga-alveo`,
`fpga-intel-dfl`, `gpu-nvidia`).

## First-boot VFIO agent (proposed, not implemented)

Mirror `memory_tiering.py`:

1. **Discover** — parse `lspci -nn` + sysfs against the allowlist. Record
   IOMMU group, current kmod, NUMA node.
2. **Plan** — default `mode: vfio` for every matched card. `mode: shared` only
   when `acceleration.<vendor>Shared: true` in `/etc/nexus/config.yaml`.
3. **Apply (vfio)** — ensure `pcidevices-controller` Addon is enabled; create
   `PCIDeviceClaim` per BDF; do not bind NICs, storage controllers, or Intel
   IGP. IOMMU groups: claim the whole group or refuse.
4. **Apply (shared)** — deploy the **one** matching upstream DaemonSet
   (Gaudi plugin, Intel FPGA plugin, Xilinx FPGA plugin, QAic plugin). Never
   load XRT on a V80 node.
5. **Advertise** — node labels `nexus.io/accel.fpga=amd-alveo|intel-dfl`,
   `nexus.io/accel.npu=gaudi|qaic`, `nexus.io/accel.tpu=coral`. Metrics API
   `GET /api/v1/telemetry/accelerators` returns inventory + `waitingForHardware`.
6. **Cockpit** — Acceleration dashboard slices that payload. Wizard exposes
   detected cards and the vfio vs shared toggle. GPU passthrough stays NVIDIA
   / AMD GPU via the existing Harvester NVIDIA toolkit + PCIDevices path.

Boot params when vfio is selected, example:

```
intel_iommu=on iommu=pt vfio-pci.ids=1da3:1063,1ac1:089a,17cb:a100
```

AMD hosts use `amd_iommu=on`. Do not add `vfio-pci.ids` for Intel FPGA until
DFL discovery confirms an accelerator function (avoid stealing NICs).

## Wizard / config sketch

```yaml
acceleration:
  gpuPassthrough: false
  fpgaPassthrough: true          # Mode A for 10ee: and Intel DFL
  npuPassthrough: true           # Mode A for 1da3: and 17cb:a100
  tpuPassthrough: true           # Mode A for 1ac1:089a
  sharedPlugins:
    gaudi: false                 # habana.ai/gaudi for pods
    intelFpga: false             # fpga.intel.com
    xilinxFpga: false            # XRT U-series only, never V80
    qaic: false                  # qualcomm.com/qaic
```

Validation: shared + vfio for the same PCI ID is an error. GPU passthrough
still requires NUMA pinning (existing Machine Wizard rule).

## What Nexus will not do

- Flash Alveo shells or Gaudi CPLD as part of first boot.
- Support Google Cloud TPU (no physical card).
- Treat Intel Core Ultra NPU as an add-in card.
- Ship Hailo/Coral DKMS on the ISO until a signed, SLE Micro–tested package
  exists.
- Invent utilization % for vfio-bound devices (guest owns the counter). Host
  metrics stay `null` with `unavailableMetrics` listed.

## Sources

- [Harvester PCI Devices](https://docs.harvesterhci.io/v1.4/advanced/addons/pcidevices)
- [harvester/pcidevices](https://github.com/harvester/pcidevices)
- [AMD Alveo V80](https://www.amd.com/en/products/accelerators/alveo/v80.html)
- [AVED vs XRT on V80](https://xilinx.github.io/AVED/latest/How-to+install+and+run+a+pre-built+AVED+design+on+an+ALVEO+card.html)
- [Xilinx Kubernetes Device Plugin](https://docs.amd.com/r/en-US/Xilinx_Kubernetes_Device_Plugin/Xilinx_Kubernetes_Device_Plugin)
- [Intel FPGA device plugin](https://intel.github.io/intel-device-plugins-for-kubernetes/cmd/fpga_plugin/README.html)
- [Intel Gaudi products](https://www.intel.com/content/www/us/en/products/details/processors/ai-accelerators/gaudi.html)
- [Gaudi Kubernetes operator](https://docs.habana.ai/en/latest/Installation_Guide/Additional_Installation/Kubernetes_Installation/Kubernetes_Operator.html)
- [Gaudi VM / VFIO IDs](https://docs.habana.ai/en/latest/Virtualization/Configuring_VMs_on_Gaudi.html)
- [Intel NPU plugin (on-die)](https://intel.github.io/intel-device-plugins-for-kubernetes/cmd/npu_plugin/README.html)
- [Linux AIC100 / qaic](https://docs.kernel.org/accel/qaic/aic100.html)
- [Qualcomm Cloud AI Kubernetes](https://quic.github.io/cloud-ai-sdk-pages/latest/Getting-Started/Deployment/Kubernetes/index)
- [Coral products](https://gweb-coral-full.uc.r.appspot.com/products)
- [Coral vs Cloud TPU FAQ](https://gweb-coral-full.uc.r.appspot.com/docs/edgetpu/faq/)
- [Hailo-8 M.2](https://hailo.ai/products/ai-accelerators/hailo-8-m2-ai-acceleration-module/)
