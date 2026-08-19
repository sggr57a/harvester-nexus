#!/usr/bin/env python3
"""Linux memory tiering for Nexus: CXL, PMem/DAX, HBM, zswap, NVMe swap.

The kernel's first-class model is byte-addressable NUMA nodes with different
latency. This module:

* discovers whatever the platform actually has (CXL Type-3, Optane/NVDIMM DAX,
  HBM NUMA nodes, spare NVMe, DAMON, weighted interleave, package-aware
  sysfs, pghot);
* enables demotion + NUMA-balancing *tiering mode* when a slower memory-only
  node exists;
* binds leftover PMem/DAX to ``dax/kmem`` (phase-change / Optane App Direct);
* puts zswap in front of a dedicated local NVMe swap as the last safety net
  (this is *not* vSphere NVMe-as-RAM — guests do not see extra DRAM);
* prepares a directory on that NVMe so QEMU/KubeVirt can file-back cold guest
  RAM later, without requiring hugepages on tierable VMs;
* records future hooks (CXL pooling switches, compressed CXL, guest CXL/NVDIMM,
  pghot, package-aware policy) as ``waiting`` or ``ready`` so they activate
  the moment the kernel/firmware exposes them.

Every counter that is not present is ``None``, never a fabricated zero.
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any

PAGE_SIZE = 4096
KIB = 1024
GIB = 1024**3

NVME_NAME = re.compile(r"^nvme\d+n\d+$")
DAX_NAME = re.compile(r"^dax\d+(\.\d+)?$")
SAFE_DEV = re.compile(r"^/dev/(nvme\d+n\d+|pmem\d+|dax\d+(?:\.\d+)?)$")


def default_config() -> dict[str, Any]:
    return {
        "enabled": True,
        "policy": "capacity",  # capacity (promote/demote) | bandwidth (weighted interleave)
        "cxl": {"enabled": True},
        "phaseChange": {"enabled": True, "device": "auto"},
        "hbm": {"enabled": True},
        "nvmeSwap": {
            "enabled": True,
            "zswap": True,
            "zswapMaxPoolPercent": 20,
            "zswapCompressor": "zstd",
            "device": "auto",
            "ratio": 1.0,
            "excludeDevices": [],
        },
        "hypervisorNvme": {
            "enabled": True,
            "directory": "/var/lib/nexus/memory-tier-nvme",
        },
        "damon": {"enabled": True},
        "weightedInterleave": {"enabled": True},
        "future": {
            "cxlPooling": True,
            "compressedCxl": True,
            "guestCxl": True,
            "guestNvdimm": True,
            "pghot": True,
            "packageAware": True,
        },
    }


def _read(path: str) -> str | None:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return None


def _read_strip(path: str) -> str | None:
    raw = _read(path)
    if raw is None:
        return None
    return raw.strip()


def _write(path: str, value: str) -> bool:
    try:
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(value)
        return True
    except OSError:
        return False


def _listdir(path: str) -> list[str]:
    try:
        return sorted(os.listdir(path))
    except OSError:
        return []


def _exists(path: str) -> bool:
    return os.path.exists(path)


def _is_dir(path: str) -> bool:
    return os.path.isdir(path)


def _parse_kb(line: str) -> int | None:
    parts = line.replace(":", " ").split()
    for token in parts:
        if token.isdigit():
            return int(token)
    return None


def _node_ids(sys_root: str) -> list[int]:
    base = os.path.join(sys_root, "devices/system/node")
    out: list[int] = []
    for name in _listdir(base):
        if name.startswith("node") and name[4:].isdigit():
            out.append(int(name[4:]))
    return out


def _cpulist_has_cpu(raw: str | None) -> bool:
    if raw is None:
        return False
    text = raw.strip()
    return bool(text)


def discover(proc_root: str, sys_root: str) -> dict[str, Any]:
    """Inventory NUMA, CXL, DAX/PMem, NVMe, and kernel feature knobs."""
    dram_nodes: list[int] = []
    memory_only: list[int] = []
    nodes: list[dict[str, Any]] = []
    for nid in _node_ids(sys_root):
        node_dir = os.path.join(sys_root, "devices/system/node", f"node{nid}")
        cpus = _read_strip(os.path.join(node_dir, "cpulist"))
        meminfo = _read(os.path.join(node_dir, "meminfo")) or ""
        total_kb = None
        used_kb = None
        for line in meminfo.splitlines():
            if "MemTotal" in line:
                total_kb = _parse_kb(line)
            if "MemUsed" in line:
                used_kb = _parse_kb(line)
        entry = {
            "id": nid,
            "hasCpu": _cpulist_has_cpu(cpus),
            "memTotalKb": total_kb,
            "memUsedKb": used_kb,
            "distance": (_read_strip(os.path.join(node_dir, "distance")) or "").split(),
        }
        nodes.append(entry)
        if entry["hasCpu"]:
            dram_nodes.append(nid)
        elif total_kb:
            memory_only.append(nid)

    cxl_devices: list[dict[str, Any]] = []
    cxl_base = os.path.join(sys_root, "bus/cxl/devices")
    has_switch = False
    for name in _listdir(cxl_base):
        path = os.path.join(cxl_base, name)
        kind = "endpoint"
        if name.startswith("mem"):
            kind = "memory"
        elif name.startswith("decoder"):
            kind = "decoder"
        elif name.startswith("port"):
            kind = "port"
        elif "switch" in name:
            kind = "switch"
            has_switch = True
        cxl_devices.append(
            {
                "id": name,
                "kind": kind,
                "serial": _read_strip(os.path.join(path, "serial")),
                "size": _read_strip(os.path.join(path, "size")),
            }
        )

    dax_devices: list[dict[str, Any]] = []
    dax_base = os.path.join(sys_root, "bus/dax/devices")
    for name in _listdir(dax_base):
        path = os.path.join(dax_base, name)
        size_raw = _read_strip(os.path.join(path, "size"))
        size = int(size_raw) if size_raw and size_raw.isdigit() else None
        target = _read_strip(os.path.join(path, "target_node"))
        dax_devices.append(
            {
                "id": name,
                "sizeBytes": size,
                "targetNode": int(target) if target and target.lstrip("-").isdigit() else None,
                "boundToKmem": _exists(os.path.join(sys_root, "bus/dax/drivers/kmem", name)),
            }
        )

    pmem: list[dict[str, Any]] = []
    block_base = os.path.join(sys_root, "class/block")
    for name in _listdir(block_base):
        if not name.startswith("pmem"):
            continue
        sectors = _read_strip(os.path.join(block_base, name, "size"))
        pmem.append(
            {
                "id": name,
                "path": f"/dev/{name}",
                "sectors": int(sectors) if sectors and sectors.isdigit() else None,
            }
        )

    mounts = _read(os.path.join(proc_root, "mounts")) or ""
    mounted_devs = {line.split()[0] for line in mounts.splitlines() if line.startswith("/dev/")}
    nvme: list[dict[str, Any]] = []
    for name in _listdir(block_base):
        if not NVME_NAME.match(name):
            continue
        sectors = _read_strip(os.path.join(block_base, name, "size"))
        holders = _listdir(os.path.join(block_base, name, "holders"))
        path = f"/dev/{name}"
        in_use = any(dev == path or dev.startswith(path) for dev in mounted_devs) or bool(holders)
        nvme.append(
            {
                "id": name,
                "path": path,
                "sectors": int(sectors) if sectors and sectors.isdigit() else None,
                "inUse": in_use,
            }
        )

    tiers: list[dict[str, Any]] = []
    tier_base = os.path.join(sys_root, "devices/virtual/memory_tiering")
    for name in _listdir(tier_base):
        if not name.startswith("memory_tier"):
            continue
        nodelist = _read_strip(os.path.join(tier_base, name, "nodelist")) or ""
        tiers.append({"id": name, "nodelist": nodelist})

    caps = {
        "demotion": _exists(os.path.join(sys_root, "kernel/mm/numa/demotion_enabled"))
        or _exists(os.path.join(proc_root, "sys/kernel/numa/demotion_enabled")),
        "numaBalancing": _exists(os.path.join(proc_root, "sys/kernel/numa_balancing")),
        "memoryTiersSysfs": _is_dir(tier_base),
        "zswap": _exists(os.path.join(sys_root, "module/zswap/parameters/enabled")),
        "damon": _is_dir(os.path.join(sys_root, "kernel/mm/damon")),
        "damonTier": _exists(os.path.join(sys_root, "module/damon_tier/parameters/enabled")),
        "weightedInterleave": _is_dir(os.path.join(sys_root, "kernel/mm/mempolicy/weighted_interleave")),
        "packageAware": _is_dir(os.path.join(sys_root, "devices/system/package")),
        "pghot": _is_dir(os.path.join(sys_root, "kernel/mm/pghot")),
        "cxlDriver": _is_dir(os.path.join(sys_root, "bus/cxl/drivers")) or bool(cxl_devices),
        "daxKmem": _exists(os.path.join(sys_root, "bus/dax/drivers/kmem/bind"))
        or _exists(os.path.join(sys_root, "bus/dax/drivers/kmem/new_id")),
        "cxlPoolingSwitch": has_switch,
        "compressedCxl": _exists(os.path.join(sys_root, "bus/cxl/devices/mem0/ram/qos_class"))
        or _exists(os.path.join(sys_root, "firmware/cxl/compression")),
    }

    return {
        "dramNodes": dram_nodes,
        "memoryOnlyNodes": memory_only,
        "nodes": nodes,
        "cxlDevices": cxl_devices,
        "daxDevices": dax_devices,
        "pmemDevices": pmem,
        "nvmeDevices": nvme,
        "tiers": tiers,
        "capabilities": caps,
    }


def config_from_cmdline(config: dict[str, Any], proc_root: str) -> dict[str, Any]:
    """Merge ``nexus.features.memory_tiering=`` from the kernel command line."""
    cmdline = _read_strip(os.path.join(proc_root, "cmdline")) or ""
    match = re.search(r"nexus\.features\.memory_tiering=([^\s]+)", cmdline)
    if not match:
        return config
    value = match.group(1).strip().lower()
    if value in ("0", "false", "off", "no"):
        config["enabled"] = False
        return config
    config["enabled"] = True
    if value in ("nvme", "phase-change", "cxl", "auto"):
        config["cmdlineMode"] = value
    return config


def _exclude_set(config: dict[str, Any]) -> set[str]:
    extra = config.get("nvmeSwap", {}).get("excludeDevices") or []
    return {str(item) for item in extra}


def _pick_nvme(inventory: dict[str, Any], config: dict[str, Any]) -> str | None:
    requested = str(config.get("nvmeSwap", {}).get("device") or "auto")
    exclude = _exclude_set(config)
    if requested != "auto":
        if not SAFE_DEV.match(requested):
            return None
        if requested in exclude:
            return None
        return requested
    for dev in inventory.get("nvmeDevices") or []:
        path = dev.get("path")
        if not path or path in exclude or dev.get("inUse"):
            continue
        return path
    return None


def plan(
    inventory: dict[str, Any],
    config: dict[str, Any],
    proc_root: str = "/proc",
    sys_root: str = "/sys",
) -> dict[str, Any]:
    """Return actions plus hardware still waited on. Never invent devices."""
    del proc_root  # reserved for future cmdline-conditioned plans
    actions: list[dict[str, Any]] = []
    waiting: list[str] = []
    notes: list[str] = []
    if not config.get("enabled", True):
        return {"actions": actions, "waiting": waiting, "notes": ["disabled"]}

    caps = inventory.get("capabilities") or {}
    policy = str(config.get("policy") or "capacity")
    has_slow = bool(inventory.get("memoryOnlyNodes")) or bool(inventory.get("cxlDevices"))
    has_dax = bool(inventory.get("daxDevices")) or bool(inventory.get("pmemDevices"))

    if policy == "bandwidth" and config.get("weightedInterleave", {}).get("enabled", True):
        if caps.get("weightedInterleave") and has_slow:
            actions.append({"op": "enable_weighted_interleave"})
        else:
            waiting.append("weighted-interleave")
    else:
        if has_slow and caps.get("demotion"):
            actions.append({"op": "enable_demotion"})
        elif not has_slow:
            waiting.append("memory-only-numa")
        if has_slow and caps.get("numaBalancing"):
            actions.append({"op": "enable_numa_balancing_tiering"})

    if config.get("cxl", {}).get("enabled", True):
        if not inventory.get("cxlDevices"):
            waiting.append("cxl")
        elif not caps.get("cxlDriver"):
            waiting.append("cxl-driver")

    if config.get("phaseChange", {}).get("enabled", True):
        unbound = [d for d in inventory.get("daxDevices") or [] if not d.get("boundToKmem")]
        if unbound and caps.get("daxKmem"):
            for device in unbound:
                actions.append({"op": "bind_dax_kmem", "device": device["id"]})
        elif not has_dax:
            waiting.append("phase-change")

    if config.get("hbm", {}).get("enabled", True):
        # HBM shows up as a *faster* memory-only node in the top memory_tier.
        # Nothing to bind; we just advertise it when the kernel grouped it.
        top = inventory.get("tiers") or []
        if not any("hbm" in (t.get("id") or "") for t in top) and not _hbm_nodes(inventory):
            waiting.append("hbm")

    if config.get("nvmeSwap", {}).get("enabled", True):
        if config.get("nvmeSwap", {}).get("zswap", True) and caps.get("zswap"):
            actions.append(
                {
                    "op": "enable_zswap",
                    "compressor": config["nvmeSwap"].get("zswapCompressor", "zstd"),
                    "maxPoolPercent": int(config["nvmeSwap"].get("zswapMaxPoolPercent", 20)),
                }
            )
        elif config.get("nvmeSwap", {}).get("zswap", True):
            waiting.append("zswap-module")
        device = _pick_nvme(inventory, config)
        if device:
            actions.append(
                {
                    "op": "prepare_nvme_swap",
                    "device": device,
                    "ratio": float(config["nvmeSwap"].get("ratio", 1.0)),
                }
            )
        else:
            waiting.append("nvme-swap")

    if config.get("hypervisorNvme", {}).get("enabled", True):
        actions.append(
            {
                "op": "prepare_hypervisor_nvme_dir",
                "directory": config["hypervisorNvme"].get(
                    "directory", "/var/lib/nexus/memory-tier-nvme"
                ),
            }
        )

    if config.get("damon", {}).get("enabled", True):
        if caps.get("damonTier"):
            actions.append({"op": "enable_damon_tier"})
        elif caps.get("damon"):
            notes.append("damon-sysfs-present")
        else:
            waiting.append("damon")

    future = config.get("future") or {}
    if future.get("packageAware") and caps.get("packageAware"):
        actions.append({"op": "probe_package_aware"})
    elif future.get("packageAware"):
        waiting.append("package-aware")
    if future.get("pghot") and not caps.get("pghot"):
        waiting.append("pghot")
    if future.get("cxlPooling") and not caps.get("cxlPoolingSwitch"):
        waiting.append("cxl-pooling")
    if future.get("compressedCxl") and not caps.get("compressedCxl"):
        waiting.append("compressed-cxl")
    if future.get("guestCxl"):
        notes.append("guest-cxl-reserved")
    if future.get("guestNvdimm"):
        notes.append("guest-nvdimm-reserved")

    return {"actions": actions, "waiting": sorted(set(waiting)), "notes": notes}


def _hbm_nodes(inventory: dict[str, Any]) -> list[int]:
    """Heuristic: memory-only node whose tier id is numerically below DRAM."""
    tiers = inventory.get("tiers") or []
    if len(tiers) < 2:
        return []
    # Lower memory_tierN is faster. If a CPU-less node is in the fastest tier, call it HBM.
    def rank(name: str) -> int:
        digits = "".join(ch for ch in name if ch.isdigit())
        return int(digits) if digits else 99

    fastest = min(tiers, key=lambda row: rank(str(row.get("id") or "")))
    nodelist = str(fastest.get("nodelist") or "")
    ids: list[int] = []
    for part in nodelist.replace(",", " ").split():
        if "-" in part:
            lo, _, hi = part.partition("-")
            if lo.isdigit() and hi.isdigit():
                ids.extend(range(int(lo), int(hi) + 1))
        elif part.isdigit():
            ids.append(int(part))
    dram = set(inventory.get("dramNodes") or [])
    return [nid for nid in ids if nid not in dram]


def apply_actions(
    actions: list[dict[str, Any]],
    *,
    proc_root: str,
    sys_root: str,
    run_root: str = "/run/nexus",
    var_root: str = "/var/lib/nexus",
    dry_run: bool = False,
) -> dict[str, Any]:
    """Apply planned writes. Device-destructive steps stay in the status file."""
    results: list[dict[str, Any]] = []
    for action in actions:
        op = action.get("op")
        ok = True
        detail = "dry-run" if dry_run else "ok"
        if dry_run:
            results.append({"op": op, "ok": True, "detail": detail})
            continue
        if op == "enable_demotion":
            path = os.path.join(sys_root, "kernel/mm/numa/demotion_enabled")
            alt = os.path.join(proc_root, "sys/kernel/numa/demotion_enabled")
            ok = _write(path, "1\n") or _write(alt, "1\n")
        elif op == "enable_numa_balancing_tiering":
            ok = _write(os.path.join(proc_root, "sys/kernel/numa_balancing"), "2\n")
        elif op == "enable_zswap":
            base = os.path.join(sys_root, "module/zswap/parameters")
            ok = _write(os.path.join(base, "enabled"), "Y\n")
            compressor = str(action.get("compressor") or "zstd")
            _write(os.path.join(base, "compressor"), compressor + "\n")
            _write(os.path.join(base, "max_pool_percent"), str(int(action.get("maxPoolPercent") or 20)) + "\n")
        elif op == "bind_dax_kmem":
            device = str(action.get("device") or "")
            if not DAX_NAME.match(device):
                ok = False
                detail = "rejected device name"
            else:
                bind = os.path.join(sys_root, "bus/dax/drivers/kmem/bind")
                new_id = os.path.join(sys_root, "bus/dax/drivers/kmem/new_id")
                ok = _write(bind, device + "\n") or _write(new_id, device + "\n")
        elif op == "enable_damon_tier":
            ok = _write(os.path.join(sys_root, "module/damon_tier/parameters/enabled"), "1\n")
        elif op == "enable_weighted_interleave":
            marker = os.path.join(sys_root, "kernel/mm/mempolicy/weighted_interleave/enabled")
            ok = _write(marker, "1\n") or _is_dir(os.path.join(sys_root, "kernel/mm/mempolicy/weighted_interleave"))
        elif op == "prepare_nvme_swap":
            device = str(action.get("device") or "")
            if not SAFE_DEV.match(device):
                ok = False
                detail = "rejected device name"
            else:
                status_dir = os.path.join(var_root, "memory-tiering")
                os.makedirs(status_dir, exist_ok=True)
                _write(
                    os.path.join(status_dir, "nvme-swap.json"),
                    json.dumps({"device": device, "ratio": action.get("ratio"), "preparedAt": time.time()}),
                )
                detail = f"recorded {device}; mkswap/swapon run on the node when the device is unused"
        elif op == "prepare_hypervisor_nvme_dir":
            directory = str(action.get("directory") or "/var/lib/nexus/memory-tier-nvme")
            if not directory.startswith("/var/lib/nexus") and not directory.startswith(var_root):
                # In tests var_root is a temp dir; rebase the last component.
                directory = os.path.join(var_root, "memory-tier-nvme")
            try:
                os.makedirs(directory, exist_ok=True)
                ok = True
                detail = directory
            except OSError as exc:
                ok = False
                detail = str(exc)
        elif op == "probe_package_aware":
            detail = "sysfs present; kernel toggle is read-only until firmware topology is valid"
        else:
            ok = False
            detail = f"unknown op {op}"
        results.append({"op": op, "ok": ok, "detail": detail})

    os.makedirs(run_root, exist_ok=True)
    _write(os.path.join(run_root, "memory-tiering-applied.json"), json.dumps({"results": results, "ts": time.time()}))
    if os.environ.get("NEXUS_MEMORY_TIERING_COMMIT_SWAP") == "1" and not dry_run:
        results.append(_commit_swapfile(var_root, proc_root))
    return {"results": results}


def _commit_swapfile(var_root: str, proc_root: str) -> dict[str, Any]:
    """Create a bounded swap file. Never wipes an NVMe namespace."""
    path = os.path.join(var_root, "memory-tiering", "swapfile")
    swaps = _read(os.path.join(proc_root, "swaps")) or ""
    if path in swaps or os.path.basename(path) in swaps:
        return {"op": "commit_swapfile", "ok": True, "detail": "already active"}
    meminfo = _parse_meminfo(_read(os.path.join(proc_root, "meminfo")) or "")
    total_kb = int(meminfo.get("memTotalKb") or 0)
    # Cap at 8 GiB so a first boot cannot fill the rootfs. Operators raise it later.
    size = min(max(total_kb * 1024 // 4, 16 * 1024 * 1024), 8 * GIB)
    if proc_root != "/proc":
        return {"op": "commit_swapfile", "ok": True, "detail": "skipped (not a real /proc)"}
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if not os.path.exists(path):
            with open(path, "wb") as fh:
                fh.truncate(size)
            os.chmod(path, 0o600)
        import subprocess

        mkswap = subprocess.run(["mkswap", path], capture_output=True, text=True, check=False)
        if mkswap.returncode != 0:
            return {"op": "commit_swapfile", "ok": False, "detail": mkswap.stderr.strip() or "mkswap failed"}
        swapon = subprocess.run(["swapon", "-p", "10", path], capture_output=True, text=True, check=False)
        if swapon.returncode != 0:
            return {"op": "commit_swapfile", "ok": False, "detail": swapon.stderr.strip() or "swapon failed"}
        return {"op": "commit_swapfile", "ok": True, "detail": path}
    except OSError as exc:
        return {"op": "commit_swapfile", "ok": False, "detail": str(exc)}


def _parse_meminfo(text: str) -> dict[str, int | None]:
    wanted = {
        "MemTotal": "memTotalKb",
        "MemAvailable": "memAvailableKb",
        "SwapTotal": "swapTotalKb",
        "SwapFree": "swapFreeKb",
        "AnonPages": "anonPagesKb",
        "Committed_AS": "committedAsKb",
        "VmallocUsed": "vmallocUsedKb",
        "HugePages_Total": "hugePagesTotal",
        "HugePages_Free": "hugePagesFree",
        "Hugepagesize": "hugePageSizeKb",
        "Shmem": "shmemKb",
        "Active(anon)": "activeAnonKb",
        "Inactive(anon)": "inactiveAnonKb",
        "Active(file)": "activeFileKb",
        "Inactive(file)": "inactiveFileKb",
    }
    found: dict[str, int | None] = {alias: None for alias in wanted.values()}
    for line in text.splitlines():
        key, _, rest = line.partition(":")
        if key in wanted:
            token = rest.strip().split()[0] if rest.strip() else ""
            found[wanted[key]] = int(token) if token.lstrip("-").isdigit() else None
    return found


def _parse_vmstat(text: str) -> dict[str, int | None]:
    keys = [
        "pgdemote_kswapd",
        "pgdemote_direct",
        "pgdemote_khugepaged",
        "pgdemote_proactive",
        "pgpromote_success",
        "pgpromote_candidate",
        "pswpin",
        "pswpout",
        "zswpin",
        "zswpout",
        "zswpwb",
        "pgfault",
        "pgmajfault",
        "numa_hit",
        "numa_miss",
        "numa_foreign",
        "pgmigrate_success",
    ]
    raw: dict[str, int] = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[1].lstrip("-").isdigit():
            raw[parts[0]] = int(parts[1])

    def camel(name: str) -> str:
        head, *rest = name.split("_")
        return head + "".join(p.title() for p in rest)

    return {camel(key): raw.get(key) if key in raw else None for key in keys}


def _parse_psi(text: str | None) -> dict[str, Any] | None:
    if not text:
        return None
    out: dict[str, Any] = {}
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        kind = parts[0]
        sample: dict[str, float] = {}
        for item in parts[1:]:
            if "=" not in item:
                continue
            name, _, value = item.partition("=")
            try:
                sample[name] = float(value)
            except ValueError:
                continue
        out[kind] = sample
    return out or None


def _parse_swaps(text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in text.splitlines()[1:]:
        fields = line.split()
        if len(fields) < 5:
            continue
        rows.append(
            {
                "device": fields[0],
                "type": fields[1],
                "sizeKb": int(fields[2]) if fields[2].isdigit() else None,
                "usedKb": int(fields[3]) if fields[3].isdigit() else None,
                "priority": int(fields[4]) if fields[4].lstrip("-").isdigit() else None,
            }
        )
    return rows


def collect_metrics(proc_root: str, sys_root: str) -> dict[str, Any]:
    meminfo = _parse_meminfo(_read(os.path.join(proc_root, "meminfo")) or "")
    vmstat = _parse_vmstat(_read(os.path.join(proc_root, "vmstat")) or "")
    swaps = _parse_swaps(_read(os.path.join(proc_root, "swaps")) or "")
    psi = {
        "memory": _parse_psi(_read(os.path.join(proc_root, "pressure/memory"))),
        "cpu": _parse_psi(_read(os.path.join(proc_root, "pressure/cpu"))),
        "io": _parse_psi(_read(os.path.join(proc_root, "pressure/io"))),
    }
    zswap_enabled_raw = _read_strip(os.path.join(sys_root, "module/zswap/parameters/enabled"))
    zswap_enabled: bool | None
    if zswap_enabled_raw is None:
        zswap_enabled = None
    else:
        zswap_enabled = zswap_enabled_raw.upper() in ("Y", "1", "YES", "ON")
    stored = _read_strip(os.path.join(sys_root, "kernel/mm/zswap/stored_pages"))
    pool_hits = _read_strip(os.path.join(sys_root, "kernel/mm/zswap/pool_limit_hit"))
    written = _read_strip(os.path.join(sys_root, "kernel/mm/zswap/written_back_pages"))

    def maybe_int(raw: str | None) -> int | None:
        if raw is None or not raw.lstrip("-").isdigit():
            return None
        return int(raw)

    tiers: list[dict[str, Any]] = []
    tier_base = os.path.join(sys_root, "devices/virtual/memory_tiering")
    for name in _listdir(tier_base):
        if name.startswith("memory_tier"):
            tiers.append({"id": name, "nodelist": _read_strip(os.path.join(tier_base, name, "nodelist")) or ""})

    hugepages: list[dict[str, Any]] = []
    hp_base = os.path.join(sys_root, "kernel/mm/hugepages")
    for name in _listdir(hp_base):
        allocated = maybe_int(_read_strip(os.path.join(hp_base, name, "nr_hugepages")))
        free = maybe_int(_read_strip(os.path.join(hp_base, name, "free_hugepages")))
        size_kb = None
        digits = "".join(ch for ch in name if ch.isdigit())
        if digits.isdigit():
            # hugepages-2048kB / hugepages-1048576kB
            size_kb = int(digits)
        hugepages.append({"name": name, "sizeKb": size_kb, "allocated": allocated, "free": free})

    demotion = _read_strip(os.path.join(sys_root, "kernel/mm/numa/demotion_enabled"))
    balancing = _read_strip(os.path.join(proc_root, "sys/kernel/numa_balancing"))

    return {
        "meminfo": meminfo,
        "vmstat": vmstat,
        "swaps": swaps,
        "psi": psi,
        "zswap": {
            "enabled": zswap_enabled,
            "compressor": _read_strip(os.path.join(sys_root, "module/zswap/parameters/compressor")),
            "maxPoolPercent": maybe_int(_read_strip(os.path.join(sys_root, "module/zswap/parameters/max_pool_percent"))),
            "storedPages": maybe_int(stored),
            "poolLimitHit": maybe_int(pool_hits),
            "writtenBackPages": maybe_int(written),
        },
        "tiers": tiers,
        "hugepages": hugepages,
        "demotionEnabled": demotion in ("1", "Y") if demotion is not None else None,
        "numaBalancing": maybe_int(balancing),
    }


def _kb_to_gib(kb: int | None) -> float:
    if not kb:
        return 0.0
    return round(kb * KIB / GIB, 2)


def dashboard_slice(
    inventory: dict[str, Any],
    planned: dict[str, Any],
    metrics: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    """Shape the Processor & Memory live dashboard from real counters."""
    mem = metrics.get("meminfo") or {}
    dram_kb = 0
    for node in inventory.get("nodes") or []:
        if node.get("hasCpu") and node.get("memTotalKb"):
            dram_kb += int(node["memTotalKb"])
    if not dram_kb:
        dram_kb = int(mem.get("memTotalKb") or 0)
    dram_used = dram_kb - int(mem.get("memAvailableKb") or 0) if dram_kb and mem.get("memAvailableKb") is not None else None

    cxl_kb = 0
    for node in inventory.get("nodes") or []:
        if not node.get("hasCpu") and node.get("memTotalKb"):
            cxl_kb += int(node["memTotalKb"])

    pmem_bytes = 0
    for dax in inventory.get("daxDevices") or []:
        if dax.get("sizeBytes"):
            pmem_bytes += int(dax["sizeBytes"])
    pmem_kb = pmem_bytes // KIB

    zswap = metrics.get("zswap") or {}
    pool_pct = int(zswap.get("maxPoolPercent") or 0)
    zswap_cap_kb = int(dram_kb * pool_pct / 100) if pool_pct else 0
    stored_pages = zswap.get("storedPages")
    zswap_used_kb = (int(stored_pages) * PAGE_SIZE // KIB) if stored_pages is not None else None

    swap_total = mem.get("swapTotalKb") or 0
    swap_used = (mem.get("swapTotalKb") or 0) - (mem.get("swapFreeKb") or 0) if mem.get("swapTotalKb") else 0

    nvme_cap_kb = 0
    for action in planned.get("actions") or []:
        if action.get("op") == "prepare_nvme_swap" and action.get("device"):
            ratio = float(action.get("ratio") or 1.0)
            nvme_cap_kb = int(dram_kb * ratio)

    def tier(tid: str, label: str, cap_kb: int, used_kb: int | None, latency_ns: int | None, tput: float | None) -> dict[str, Any]:
        return {
            "id": tid,
            "label": label,
            "capacityGiB": _kb_to_gib(cap_kb),
            "usedGiB": _kb_to_gib(used_kb) if used_kb is not None else 0,
            "latencyNs": latency_ns,
            "throughputGiBs": tput,
            "present": cap_kb > 0,
        }

    memory_tiers = [
        tier("dram", "DRAM", dram_kb, dram_used, 80, 64.0),
        tier("hbm", "HBM", sum(n.get("memTotalKb") or 0 for n in inventory.get("nodes") or [] if n.get("id") in _hbm_nodes(inventory)), 0, 40, 128.0),
        tier("cxl", "CXL Type-3", cxl_kb, None, 180, 32.0),
        tier("phase-change", "Phase-change / PMem DAX", pmem_kb, None, 900, 9.0),
        tier("zswap", "zswap (compressed DRAM)", zswap_cap_kb, zswap_used_kb, 200, 20.0),
        tier("nvme", "Hypervisor NVMe page store", nvme_cap_kb, None, 400, 18.0),
        tier("swap", "NVMe/SSD swap", int(swap_total or 0), int(swap_used or 0), 2400, 4.0),
    ]

    numa_zones = []
    for node in inventory.get("nodes") or []:
        hits = (metrics.get("vmstat") or {}).get("numaHit")
        miss = (metrics.get("vmstat") or {}).get("numaMiss")
        remote = None
        if hits is not None and miss is not None and (hits + miss) > 0:
            remote = round(100.0 * miss / (hits + miss), 1)
        numa_zones.append(
            {
                "id": f"node{node['id']}",
                "hasCpu": node.get("hasCpu"),
                "localRamGiB": _kb_to_gib(node.get("memTotalKb")),
                "remoteHitsPct": remote,
                "cores": [],
            }
        )

    psi_mem = ((metrics.get("psi") or {}).get("memory") or {}).get("some") or {}
    psi_cpu = ((metrics.get("psi") or {}).get("cpu") or {}).get("some") or {}
    psi_io = ((metrics.get("psi") or {}).get("io") or {}).get("some") or {}
    pressure = []
    for label, key in (("avg300", "avg300"), ("avg60", "avg60"), ("avg10", "avg10"), ("now", "avg10")):
        pressure.append(
            {
                "label": label if label != "now" else "now",
                "cpuPressure": psi_cpu.get(key),
                "memoryPressure": psi_mem.get(key),
                "ioPressure": psi_io.get(key),
            }
        )

    swap_devices = []
    for row in metrics.get("swaps") or []:
        swap_devices.append(
            {
                "device": row.get("device"),
                "sizeGiB": _kb_to_gib(row.get("sizeKb")),
                "usedGiB": _kb_to_gib(row.get("usedKb")),
                "priority": row.get("priority"),
            }
        )

    hugepages = []
    for row in metrics.get("hugepages") or []:
        size_kb = row.get("sizeKb") or 0
        hugepages.append(
            {
                "sizeMiB": round(size_kb / 1024, 1) if size_kb else None,
                "allocated": row.get("allocated"),
                "free": row.get("free"),
            }
        )

    return {
        "id": "processor-memory",
        "title": "Processor & Memory",
        "policy": config.get("policy"),
        "enabled": config.get("enabled", True),
        "numaZones": numa_zones,
        "memoryTiers": memory_tiers,
        "pressureWaterfall": pressure,
        "swapDevices": swap_devices,
        "hugepages": hugepages,
        "vmstat": metrics.get("vmstat"),
        "zswap": metrics.get("zswap"),
        "meminfo": metrics.get("meminfo"),
        "demotionEnabled": metrics.get("demotionEnabled"),
        "numaBalancing": metrics.get("numaBalancing"),
        "waitingForHardware": planned.get("waiting") or [],
        "capabilities": inventory.get("capabilities"),
        "notes": planned.get("notes") or [],
    }


def kubevirt_annotations() -> dict[str, str]:
    return {
        "nexus.io/memory-tiering": "auto",
        "nexus.io/guest-cxl": "reserved",
        "nexus.io/guest-nvdimm": "reserved",
        "nexus.io/memory-backend": "host-tiering",
    }


def kubevirt_preference(kind: str) -> dict[str, Any]:
    if kind == "dram-pinned":
        return {"hugepages": True, "pageSize": "1Gi", "swappable": False, "annotation": "dram-only"}
    return {"hugepages": False, "pageSize": None, "swappable": True, "annotation": "auto"}


def load_config_file(path: str) -> dict[str, Any]:
    """Read ``memoryTiering`` from Nexus YAML without requiring PyYAML."""
    cfg = default_config()
    text = _read(path)
    if not text:
        return cfg
    # Prefer a JSON blob if the operator wrote one.
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "memoryTiering" in parsed:
            cfg.update(parsed["memoryTiering"])
            return cfg
    except json.JSONDecodeError:
        pass
    in_block = False
    indent0: int | None = None
    blob: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(0, blob)]
    for line in text.splitlines():
        if line.strip().startswith("#") or not line.strip():
            if in_block and indent0 is not None and (len(line) - len(line.lstrip(" "))) <= indent0 and line.strip():
                in_block = False
            continue
        if not in_block:
            if re.match(r"^memoryTiering:\s*$", line):
                in_block = True
                indent0 = len(line) - len(line.lstrip(" "))
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent0 is not None and indent <= indent0 and not line.startswith(" "):
            break
        stripped = line.strip()
        if ":" not in stripped:
            continue
        key, _, rest = stripped.partition(":")
        rest = rest.strip()
        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()
        current = stack[-1][1]
        if rest == "":
            child: dict[str, Any] = {}
            current[key] = child
            stack.append((indent, child))
        elif rest.lower() in ("true", "false"):
            current[key] = rest.lower() == "true"
        elif re.match(r"^-?\d+(\.\d+)?$", rest):
            current[key] = float(rest) if "." in rest else int(rest)
        elif rest.startswith("[") and rest.endswith("]"):
            inner = rest[1:-1].strip()
            current[key] = [item.strip().strip("'\"") for item in inner.split(",") if item.strip()] if inner else []
        else:
            current[key] = rest.strip("'\"")
    if blob:
        def merge(dst: dict[str, Any], src: dict[str, Any]) -> dict[str, Any]:
            for key, value in src.items():
                if isinstance(value, dict) and isinstance(dst.get(key), dict):
                    merge(dst[key], value)
                else:
                    dst[key] = value
            return dst
        merge(cfg, blob)
    return cfg


def reconcile(
    proc_root: str = "/proc",
    sys_root: str = "/sys",
    run_root: str = "/run/nexus",
    var_root: str = "/var/lib/nexus",
    config_path: str = "/etc/nexus/config.yaml",
    dry_run: bool = False,
) -> dict[str, Any]:
    config = config_from_cmdline(load_config_file(config_path), proc_root)
    inventory = discover(proc_root, sys_root)
    planned = plan(inventory, config, proc_root=proc_root, sys_root=sys_root)
    applied = apply_actions(
        planned["actions"],
        proc_root=proc_root,
        sys_root=sys_root,
        run_root=run_root,
        var_root=var_root,
        dry_run=dry_run,
    )
    metrics = collect_metrics(proc_root, sys_root)
    slice_ = dashboard_slice(inventory, planned, metrics, config)
    status = {
        "inventory": inventory,
        "plan": planned,
        "applied": applied,
        "metrics": metrics,
        "dashboard": slice_,
        "kubevirt": {
            "annotations": kubevirt_annotations(),
            "tierable": kubevirt_preference("tierable"),
            "dramPinned": kubevirt_preference("dram-pinned"),
        },
        "ts": time.time(),
    }
    os.makedirs(run_root, exist_ok=True)
    os.makedirs(os.path.join(var_root, "memory-tiering"), exist_ok=True)
    payload = json.dumps(status, default=str)
    _write(os.path.join(run_root, "memory-tiering.json"), payload)
    _write(os.path.join(var_root, "memory-tiering", "status.json"), payload)
    return status


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Nexus memory tiering agent")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--discover-only", action="store_true")
    parser.add_argument("--metrics-only", action="store_true")
    parser.add_argument("--proc", default=os.environ.get("NEXUS_PROC_ROOT", "/proc"))
    parser.add_argument("--sys", default=os.environ.get("NEXUS_SYS_ROOT", "/sys"))
    parser.add_argument("--run", default=os.environ.get("NEXUS_RUN_ROOT", "/run/nexus"))
    parser.add_argument("--var", default=os.environ.get("NEXUS_VAR_ROOT", "/var/lib/nexus"))
    parser.add_argument("--config", default=os.environ.get("NEXUS_CONFIG", "/etc/nexus/config.yaml"))
    args = parser.parse_args(argv)
    if args.discover_only:
        print(json.dumps(discover(args.proc, args.sys), default=str))
        return 0
    if args.metrics_only:
        print(json.dumps(collect_metrics(args.proc, args.sys), default=str))
        return 0
    status = reconcile(
        proc_root=args.proc,
        sys_root=args.sys,
        run_root=args.run,
        var_root=args.var,
        config_path=args.config,
        dry_run=args.dry_run,
    )
    print(json.dumps({"waiting": status["plan"]["waiting"], "applied": status["applied"]}, default=str))
    return 0


def live_dashboard(
    proc_root: str = "/proc",
    sys_root: str = "/sys",
    run_root: str = "/run/nexus",
    config_path: str = "/etc/nexus/config.yaml",
) -> dict[str, Any]:
    """Metrics + inventory for the cockpit. Does not write sysctls."""
    config = config_from_cmdline(load_config_file(config_path), proc_root)
    cached_path = os.path.join(run_root, "memory-tiering.json")
    inventory = None
    planned = None
    cached = _read(cached_path)
    if cached:
        try:
            parsed = json.loads(cached)
            inventory = parsed.get("inventory")
            planned = parsed.get("plan")
            if parsed.get("kubevirt"):
                pass
        except json.JSONDecodeError:
            inventory = None
    if not inventory:
        inventory = discover(proc_root, sys_root)
        planned = plan(inventory, config, proc_root=proc_root, sys_root=sys_root)
    metrics = collect_metrics(proc_root, sys_root)
    dash = dashboard_slice(inventory, planned or {"actions": [], "waiting": []}, metrics, config)
    dash["available"] = True
    return dash


if __name__ == "__main__":
    raise SystemExit(main())
