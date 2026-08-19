#!/usr/bin/env python3
"""Allowlisted NPU / TPU / FPGA / GPU PCI inventory for live Acceleration.

Discovers cards from sysfs, never from a catalog. Performance counters that
the kernel does not export stay ``None``. Issues are derived from link
downshift, AER, missing driver, and missing IOMMU — not invented utilization.
"""

from __future__ import annotations

import os
import re
from typing import Any

HEX = re.compile(r"0x([0-9a-fA-F]+)")
NUM = re.compile(r"(\d+(?:\.\d+)?)")

# Families advertised as waitingForHardware when absent.
FAMILIES = (
    "npu-gaudi",
    "npu-qaic",
    "tpu-coral",
    "fpga-alveo",
    "fpga-intel-dfl",
    "gpu-nvidia",
)

GAUDI_IDS = {
    "1063": "Intel Gaudi 3 PCIe",
    "1060": "Intel Gaudi 3 OAM",
    "1020": "Intel Gaudi 2",
}

DISPLAY_CLASSES = {"030000", "030200"}  # VGA / 3D controller
NIC_PREFIX = "02"


def _read(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read().strip()
    except OSError:
        return None


def _hex_id(raw: str | None) -> str | None:
    if not raw:
        return None
    match = HEX.search(raw)
    return match.group(1).lower() if match else raw.lower().lstrip("0x")


def _int_or_none(raw: str | None) -> int | None:
    if raw is None:
        return None
    match = NUM.search(raw.replace(",", ""))
    if not match:
        return None
    try:
        return int(float(match.group(1)))
    except ValueError:
        return None


def _float_or_none(raw: str | None) -> float | None:
    if raw is None:
        return None
    match = NUM.search(raw)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def _link_gt(raw: str | None) -> float | None:
    return _float_or_none(raw)


def _aer_total(path: str) -> int | None:
    text = _read(path)
    if text is None:
        return None
    total = 0
    found = False
    for line in text.splitlines():
        nums = NUM.findall(line.replace(",", ""))
        if not nums:
            continue
        found = True
        total += int(float(nums[-1]))
    if not found:
        try:
            return int(text)
        except ValueError:
            return None
    return total


def _driver_name(dev_dir: str) -> str | None:
    link = os.path.join(dev_dir, "driver")
    try:
        return os.path.basename(os.path.realpath(link))
    except OSError:
        return None


def _iommu_group(dev_dir: str) -> str | None:
    link = os.path.join(dev_dir, "iommu_group")
    if not os.path.lexists(link):
        return None
    try:
        return os.path.basename(os.path.realpath(link))
    except OSError:
        return None


def _temperature_c(dev_dir: str) -> int | None:
    hwmon = os.path.join(dev_dir, "hwmon")
    if not os.path.isdir(hwmon):
        return None
    try:
        names = os.listdir(hwmon)
    except OSError:
        return None
    for name in sorted(names):
        milli = _int_or_none(_read(os.path.join(hwmon, name, "temp1_input")))
        if milli is not None:
            return milli // 1000
    return None


def _class_code(raw: str | None) -> str:
    hid = _hex_id(raw) or ""
    return hid.zfill(6)[-6:]


def classify(vendor: str, device: str, class_code: str, *, dfl: bool) -> tuple[str, str, str] | None:
    """Return (kind, model, family) or None if the function is not an accelerator."""
    if vendor == "1da3" and device in GAUDI_IDS:
        return "npu", GAUDI_IDS[device], "npu-gaudi"
    if vendor == "17cb" and device == "a100":
        return "npu", "Qualcomm Cloud AI 100", "npu-qaic"
    if vendor == "1ac1" and device == "089a":
        return "tpu", "Google Coral Edge TPU", "tpu-coral"
    if vendor == "10ee":
        return "fpga", "AMD Alveo / Xilinx FPGA", "fpga-alveo"
    if dfl and vendor == "8086":
        return "fpga", "Intel FPGA (DFL)", "fpga-intel-dfl"
    if vendor == "10de" and class_code in DISPLAY_CLASSES:
        return "gpu", "NVIDIA GPU", "gpu-nvidia"
    if vendor == "1002" and class_code in DISPLAY_CLASSES:
        return "gpu", "AMD GPU", "gpu-amd"
    return None


def _dfl_bdfs(sys_root: str) -> set[str]:
    found: set[str] = set()
    region_root = os.path.join(sys_root, "class", "fpga_region")
    if not os.path.isdir(region_root):
        return found
    try:
        names = os.listdir(region_root)
    except OSError:
        return found
    pci_root = os.path.realpath(os.path.join(sys_root, "bus", "pci", "devices"))
    for name in names:
        link = os.path.join(region_root, name, "device")
        try:
            target = os.path.realpath(link)
        except OSError:
            continue
        bdf = os.path.basename(target)
        if os.path.dirname(target) == pci_root or bdf.count(":") == 2:
            found.add(bdf)
    return found


def _pci_devices(sys_root: str) -> list[str]:
    root = os.path.join(sys_root, "bus", "pci", "devices")
    if not os.path.isdir(root):
        return []
    try:
        return sorted(os.listdir(root))
    except OSError:
        return []


def inspect_device(sys_root: str, bdf: str, *, dfl: bool) -> dict[str, Any] | None:
    dev_dir = os.path.join(sys_root, "bus", "pci", "devices", bdf)
    vendor = _hex_id(_read(os.path.join(dev_dir, "vendor")))
    device = _hex_id(_read(os.path.join(dev_dir, "device")))
    class_code = _class_code(_read(os.path.join(dev_dir, "class")))
    if not vendor or not device:
        return None
    if class_code.startswith(NIC_PREFIX) and vendor != "1ac1":
        return None
    classified = classify(vendor, device, class_code, dfl=dfl)
    if classified is None:
        return None
    kind, model, family = classified
    driver = _driver_name(dev_dir) if os.path.lexists(os.path.join(dev_dir, "driver")) else None
    numa_raw = _read(os.path.join(dev_dir, "numa_node"))
    numa_node = _int_or_none(numa_raw)
    if numa_node is not None and numa_node < 0:
        numa_node = None
    current_speed = _read(os.path.join(dev_dir, "current_link_speed"))
    max_speed = _read(os.path.join(dev_dir, "max_link_speed"))
    current_width = _int_or_none(_read(os.path.join(dev_dir, "current_link_width")))
    max_width = _int_or_none(_read(os.path.join(dev_dir, "max_link_width")))
    cur_gt = _link_gt(current_speed)
    max_gt = _link_gt(max_speed)
    link_downshifted = bool(
        (cur_gt is not None and max_gt is not None and cur_gt + 0.05 < max_gt)
        or (current_width is not None and max_width is not None and current_width < max_width)
    )
    aer_corr = _aer_total(os.path.join(dev_dir, "aer_dev_correctable"))
    aer_fatal = _aer_total(os.path.join(dev_dir, "aer_dev_fatal"))
    aer_nonfatal = _aer_total(os.path.join(dev_dir, "aer_dev_nonfatal"))
    aer_unc = None
    if aer_fatal is not None or aer_nonfatal is not None:
        aer_unc = (aer_fatal or 0) + (aer_nonfatal or 0)
    issues: list[str] = []
    if driver is None:
        issues.append("no-driver")
    if _iommu_group(dev_dir) is None:
        issues.append("no-iommu")
    if link_downshifted:
        issues.append("pcie-link-downshifted")
    if aer_corr is not None and aer_corr > 0:
        issues.append("aer-correctable")
    if aer_unc is not None and aer_unc > 0:
        issues.append("aer-uncorrectable")
    return {
        "id": bdf,
        "bdf": bdf,
        "kind": kind,
        "model": model,
        "family": family,
        "vendorId": vendor,
        "deviceId": device,
        "classCode": class_code,
        "driver": driver,
        "boundTo": driver,
        "numaNode": numa_node,
        "iommuGroup": _iommu_group(dev_dir),
        "currentLinkSpeed": current_speed,
        "currentLinkWidth": current_width,
        "maxLinkSpeed": max_speed,
        "maxLinkWidth": max_width,
        "linkDownshifted": link_downshifted,
        "aerCorrectable": aer_corr,
        "aerUncorrectable": aer_unc,
        "temperatureC": _temperature_c(dev_dir),
        "runtimeStatus": _read(os.path.join(dev_dir, "power", "runtime_status")),
        "utilizationPercent": None,
        "memoryGiB": None,
        "issues": issues,
    }


def discover(sys_root: str = "/sys") -> list[dict[str, Any]]:
    dfl = _dfl_bdfs(sys_root)
    devices: list[dict[str, Any]] = []
    seen: set[str] = set()
    for bdf in _pci_devices(sys_root):
        rec = inspect_device(sys_root, bdf, dfl=bdf in dfl)
        if rec is None:
            continue
        devices.append(rec)
        seen.add(bdf)
    for bdf in sorted(dfl - seen):
        rec = inspect_device(sys_root, bdf, dfl=True)
        if rec is not None:
            devices.append(rec)
    return devices


def live_dashboard(sys_root: str = "/sys", proc_root: str = "/proc") -> dict[str, Any]:
    del proc_root  # reserved for IRQ-rate sampling later
    try:
        devices = discover(sys_root)
    except Exception as exc:  # noqa: BLE001
        return {
            "available": False,
            "error": str(exc),
            "devices": [],
            "issues": [],
            "waitingForHardware": list(FAMILIES),
            "passThrough": [],
        }
    present = {str(dev.get("family")) for dev in devices}
    waiting = [family for family in FAMILIES if family not in present]
    cluster_issues: list[str] = []
    for dev in devices:
        for issue in dev.get("issues") or []:
            cluster_issues.append(f"{dev['bdf']}: {issue}")
    pass_through = [
        {
            "id": dev["bdf"],
            "kind": dev["kind"],
            "model": dev["model"],
            "boundTo": dev["driver"] or "unbound",
            "driver": dev["driver"] or "none",
            "utilizationPercent": dev["utilizationPercent"],
            "memoryGiB": dev["memoryGiB"],
            "numaNode": dev["numaNode"],
            "temperatureC": dev["temperatureC"],
            "linkDownshifted": dev["linkDownshifted"],
            "currentLinkSpeed": dev["currentLinkSpeed"],
            "issues": dev["issues"],
            "aerCorrectable": dev["aerCorrectable"],
            "aerUncorrectable": dev["aerUncorrectable"],
            "runtimeStatus": dev["runtimeStatus"],
        }
        for dev in devices
    ]
    return {
        "available": True,
        "id": "acceleration",
        "title": "Acceleration & Hardware Pass-Through",
        "devices": devices,
        "passThrough": pass_through,
        "issues": cluster_issues,
        "waitingForHardware": waiting,
        "error": None,
    }


def environment_summary(sys_root: str = "/sys") -> dict[str, Any]:
    """Compact add-in card pulse for the same tick as CPU / RAM / watts.

    Dashboards that already render host hardware (ticker, Processor & Memory,
    Resource Monitor, Environment Intel, Operations) consume this object so
    FPGA / GPU / NPU / TPU metrics appear automatically next to those KPIs.
    Utilization is never invented here — hottestC stays None without hwmon.
    """
    dash = live_dashboard(sys_root=sys_root)
    devices = dash.get("devices") or []
    by_kind: dict[str, int] = {}
    temps: list[int] = []
    compact: list[dict[str, Any]] = []
    for dev in devices:
        kind = str(dev.get("kind") or "other")
        by_kind[kind] = by_kind.get(kind, 0) + 1
        temp = dev.get("temperatureC")
        if isinstance(temp, (int, float)):
            temps.append(int(temp))
        compact.append(
            {
                "id": dev.get("bdf") or dev.get("id"),
                "kind": kind,
                "model": dev.get("model"),
                "temperatureC": temp,
                "linkDownshifted": dev.get("linkDownshifted"),
                "issues": list(dev.get("issues") or []),
                "currentLinkSpeed": dev.get("currentLinkSpeed"),
                "driver": dev.get("driver"),
            }
        )
    return {
        "available": bool(dash.get("available", True)),
        "cards": len(devices),
        "issues": len(dash.get("issues") or []),
        "hottestC": max(temps) if temps else None,
        "byKind": by_kind,
        "waitingForHardware": list(dash.get("waitingForHardware") or []),
        "devices": compact,
        "error": dash.get("error"),
    }


if __name__ == "__main__":
    import json
    import sys

    root = sys.argv[1] if len(sys.argv) > 1 else "/sys"
    json.dump(live_dashboard(sys_root=root), sys.stdout, indent=2)
    sys.stdout.write("\n")
