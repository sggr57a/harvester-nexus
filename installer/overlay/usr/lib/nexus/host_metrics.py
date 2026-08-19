#!/usr/bin/env python3
"""Real node-local metrics read from kernel counters and platform sensors.

Every function here returns ``None`` when the underlying source is genuinely
unavailable rather than substituting a plausible-looking number. Callers are
expected to propagate the ``None`` so the cockpit can render "unavailable"
instead of a fabricated reading.

Sources, in preference order:

* power   — Intel RAPL (``/sys/class/powercap``), then IPMI DCMI via
            ``ipmitool``. RAPL measures package/DRAM domains only, so it is
            reported as a partial figure; IPMI DCMI reports whole-chassis draw.
* disk    — ``/proc/diskstats`` fields 4 and 8 (completed reads/writes),
            differenced against the previous sample.
* network — ``/proc/net/dev`` rx/tx byte counters, differenced likewise.

Rates need two samples, so the first call after boot returns ``None`` for the
rate metrics and seeds the cache. The cache is best-effort: if it cannot be
written, rates stay unavailable instead of raising.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from typing import Any

SAMPLE_FILE = os.environ.get("NEXUS_HOST_SAMPLE_FILE", "/var/lib/nexus/host-sample.json")
SAMPLE_FILE_FALLBACK = "/tmp/nexus-host-sample.json"
PARTITION_RE = re.compile(r"p\d+$")
SECTOR_BYTES = 512.0

# Virtual and loopback devices would double-count traffic that already
# traverses a physical NIC, so they are excluded from throughput totals.
VIRTUAL_NET_PREFIXES = (
    "lo", "veth", "docker", "flannel", "cni", "cali", "tunl", "kube-ipvs",
    "dummy", "virbr", "vxlan", "nodelocaldns", "br-", "ovs-", "genev",
)

# Partitions, loop/ram devices, and device-mapper targets sit on top of the
# physical block devices we already count.
VIRTUAL_DISK_PREFIXES = ("loop", "ram", "dm-", "sr", "zram", "md")


def _read_first_line(path: str) -> str | None:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.readline().strip()
    except OSError:
        return None


# ---------------------------------------------------------------- power


def _rapl_microjoules() -> int | None:
    """Sum energy counters across all RAPL top-level domains."""
    base = "/sys/class/powercap"
    if not os.path.isdir(base):
        return None
    total = 0
    found = False
    try:
        entries = sorted(os.listdir(base))
    except OSError:
        return None
    for entry in entries:
        # Only top-level packages (intel-rapl:N); subdomains double-count.
        if not entry.startswith("intel-rapl:") or entry.count(":") != 1:
            continue
        raw = _read_first_line(os.path.join(base, entry, "energy_uj"))
        if raw is None:
            continue
        try:
            total += int(raw)
            found = True
        except ValueError:
            continue
    return total if found else None


def _ipmi_watts() -> float | None:
    """Whole-chassis draw via IPMI DCMI, when a BMC is reachable."""
    if not shutil.which("ipmitool"):
        return None
    try:
        proc = subprocess.run(
            ["ipmitool", "dcmi", "power", "reading"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    for line in proc.stdout.splitlines():
        if "Instantaneous power reading" in line:
            parts = line.split(":", 1)
            if len(parts) != 2:
                continue
            token = parts[1].strip().split()
            if token:
                try:
                    return float(token[0])
                except ValueError:
                    return None
    return None


# ---------------------------------------------------------------- disk


def _is_partition(name: str) -> bool:
    """True for sda1 / nvme0n1p1 / mmcblk0p2 — not the parent device."""
    if name.startswith(("nvme", "mmcblk")):
        return bool(PARTITION_RE.search(name))
    return bool(name) and name[-1].isdigit()


def _diskstats(proc_root: str = "/proc") -> dict[str, tuple[int, int, int, int]] | None:
    """Return {device: (reads, writes, sectors_read, sectors_written)}."""
    path = os.path.join(proc_root, "diskstats")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return None
    out: dict[str, tuple[int, int, int, int]] = {}
    for line in lines:
        fields = line.split()
        if len(fields) < 10:
            continue
        name = fields[2]
        if name.startswith(VIRTUAL_DISK_PREFIXES) or _is_partition(name):
            continue
        try:
            out[name] = (int(fields[3]), int(fields[7]), int(fields[5]), int(fields[9]))
        except ValueError:
            continue
    return out or None


# ---------------------------------------------------------------- network


def _netdev(proc_root: str = "/proc") -> dict[str, tuple[int, int]] | None:
    """Return {iface: (rx_bytes, tx_bytes)} for physical interfaces."""
    path = os.path.join(proc_root, "net", "dev")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()[2:]
    except OSError:
        return None
    out: dict[str, tuple[int, int]] = {}
    for line in lines:
        name, _, rest = line.partition(":")
        iface = name.strip()
        if not iface or iface.startswith(VIRTUAL_NET_PREFIXES):
            continue
        fields = rest.split()
        if len(fields) < 9:
            continue
        try:
            out[iface] = (int(fields[0]), int(fields[8]))
        except ValueError:
            continue
    return out or None


# ---------------------------------------------------------------- sampling


def _resolve_sample_file(explicit: str | None = None) -> str:
    if explicit:
        return explicit
    env = os.environ.get("NEXUS_HOST_SAMPLE_FILE")
    if env:
        return env
    directory = os.path.dirname(SAMPLE_FILE)
    if directory:
        try:
            os.makedirs(directory, exist_ok=True)
            probe = SAMPLE_FILE + ".probe"
            with open(probe, "w", encoding="utf-8") as handle:
                handle.write("")
            os.remove(probe)
            return SAMPLE_FILE
        except OSError:
            return SAMPLE_FILE_FALLBACK
    return SAMPLE_FILE


def _load_sample(path: str) -> dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_sample(path: str, sample: dict[str, Any]) -> None:
    """Best-effort persist; a read-only /var must not break metrics."""
    try:
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(sample, fh)
        os.replace(tmp, path)
    except OSError:
        pass


def _rate(current: int, previous: int, seconds: float) -> float | None:
    """Per-second rate, discarding counter rollovers and device swaps."""
    if seconds <= 0 or current < previous:
        return None
    return (current - previous) / seconds


def collect_host_metrics(proc_root: str = "/proc", sample_file: str | None = None) -> dict[str, Any]:
    """Sample the host once and return real rates plus availability flags.

    Returns keys ``watts``, ``totalIops``, ``readIops``, ``writeIops``,
    ``readMiBs``, ``writeMiBs``, ``disks``, ``ingressMbps``, ``egressMbps``,
    each either a number / list or ``None``, and ``sources`` describing where
    each figure came from so the UI can be explicit about partial coverage.
    """
    now = time.time()
    path = _resolve_sample_file(sample_file)
    previous = _load_sample(path)
    prev_time = float(previous.get("timestamp") or 0.0)
    elapsed = now - prev_time if prev_time else 0.0

    rapl = _rapl_microjoules()
    disks = _diskstats(proc_root)
    nets = _netdev(proc_root)

    sample: dict[str, Any] = {"timestamp": now}
    if rapl is not None:
        sample["raplMicrojoules"] = rapl
    if disks:
        sample["disks"] = {k: list(v) for k, v in disks.items()}
    if nets:
        sample["nets"] = {k: list(v) for k, v in nets.items()}

    sources: dict[str, str] = {}

    # --- power: prefer whole-chassis IPMI, fall back to partial RAPL ---
    watts = _ipmi_watts()
    if watts is not None:
        sources["watts"] = "ipmi-dcmi"
    elif rapl is not None and elapsed > 0 and "raplMicrojoules" in previous:
        delta_uj = rapl - int(previous["raplMicrojoules"])
        if delta_uj >= 0:
            watts = round(delta_uj / 1_000_000.0 / elapsed, 1)
            sources["watts"] = "intel-rapl (package/DRAM domains only)"
    if watts is None:
        sources["watts"] = "unavailable"

    # --- disk IOPS + throughput ---
    total_iops: float | None = None
    read_iops: float | None = None
    write_iops: float | None = None
    read_mibs: float | None = None
    write_mibs: float | None = None
    disk_rows: list[dict[str, Any]] = []
    if disks and elapsed > 0 and isinstance(previous.get("disks"), dict):
        acc_r = acc_w = acc_sr = acc_sw = 0.0
        matched = False
        for device, counters in disks.items():
            reads, writes, sec_r, sec_w = counters
            prev_pair = previous["disks"].get(device)
            if not isinstance(prev_pair, list) or len(prev_pair) < 2:
                continue
            r = _rate(reads, int(prev_pair[0]), elapsed)
            w = _rate(writes, int(prev_pair[1]), elapsed)
            if r is None or w is None:
                continue
            sr = sw = None
            if len(prev_pair) >= 4:
                sr = _rate(sec_r, int(prev_pair[2]), elapsed)
                sw = _rate(sec_w, int(prev_pair[3]), elapsed)
            matched = True
            acc_r += r
            acc_w += w
            row: dict[str, Any] = {
                "device": device,
                "iops": round(r + w, 1),
                "readIops": round(r, 1),
                "writeIops": round(w, 1),
                "readMiBs": None if sr is None else round(sr * SECTOR_BYTES / (1024.0 * 1024.0), 2),
                "writeMiBs": None if sw is None else round(sw * SECTOR_BYTES / (1024.0 * 1024.0), 2),
            }
            disk_rows.append(row)
            if sr is not None:
                acc_sr += sr
            if sw is not None:
                acc_sw += sw
        if matched:
            total_iops = round(acc_r + acc_w, 1)
            read_iops = round(acc_r, 1)
            write_iops = round(acc_w, 1)
            if any(row.get("readMiBs") is not None for row in disk_rows):
                read_mibs = round(acc_sr * SECTOR_BYTES / (1024.0 * 1024.0), 2)
                write_mibs = round(acc_sw * SECTOR_BYTES / (1024.0 * 1024.0), 2)
            sources["totalIops"] = "/proc/diskstats"
    if total_iops is None:
        sources["totalIops"] = "unavailable (needs two samples)"

    # --- network throughput ---
    ingress_mbps: float | None = None
    egress_mbps: float | None = None
    if nets and elapsed > 0 and isinstance(previous.get("nets"), dict):
        rx_total = 0.0
        tx_total = 0.0
        matched = False
        for iface, (rx, tx) in nets.items():
            prev_pair = previous["nets"].get(iface)
            if not isinstance(prev_pair, list) or len(prev_pair) != 2:
                continue
            rx_rate = _rate(rx, int(prev_pair[0]), elapsed)
            tx_rate = _rate(tx, int(prev_pair[1]), elapsed)
            if rx_rate is None or tx_rate is None:
                continue
            rx_total += rx_rate
            tx_total += tx_rate
            matched = True
        if matched:
            ingress_mbps = round(rx_total * 8.0 / 1_000_000.0, 2)
            egress_mbps = round(tx_total * 8.0 / 1_000_000.0, 2)
            sources["network"] = "/proc/net/dev"
    if ingress_mbps is None:
        sources["network"] = "unavailable (needs two samples)"

    _save_sample(path, sample)

    return {
        "watts": watts,
        "totalIops": total_iops,
        "readIops": read_iops,
        "writeIops": write_iops,
        "readMiBs": read_mibs,
        "writeMiBs": write_mibs,
        "disks": disk_rows,
        "ingressMbps": ingress_mbps,
        "egressMbps": egress_mbps,
        "sources": sources,
    }
