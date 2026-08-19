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
import shutil
import subprocess
import time
from typing import Any

SAMPLE_FILE = os.environ.get("NEXUS_HOST_SAMPLE_FILE", "/var/lib/nexus/host-sample.json")

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


def _diskstats() -> dict[str, tuple[int, int]] | None:
    """Return {device: (reads_completed, writes_completed)} for real devices."""
    try:
        with open("/proc/diskstats", "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return None
    out: dict[str, tuple[int, int]] = {}
    for line in lines:
        fields = line.split()
        if len(fields) < 8:
            continue
        name = fields[2]
        if name.startswith(VIRTUAL_DISK_PREFIXES):
            continue
        # Skip partitions (sda1) in favour of their parent device (sda).
        if name[-1].isdigit() and not name.startswith("nvme"):
            continue
        try:
            out[name] = (int(fields[3]), int(fields[7]))
        except ValueError:
            continue
    return out or None


# ---------------------------------------------------------------- network


def _netdev() -> dict[str, tuple[int, int]] | None:
    """Return {iface: (rx_bytes, tx_bytes)} for physical interfaces."""
    try:
        with open("/proc/net/dev", "r", encoding="utf-8") as fh:
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


def _load_sample() -> dict[str, Any]:
    try:
        with open(SAMPLE_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_sample(sample: dict[str, Any]) -> None:
    """Best-effort persist; a read-only /var must not break metrics."""
    try:
        directory = os.path.dirname(SAMPLE_FILE)
        if directory:
            os.makedirs(directory, exist_ok=True)
        tmp = SAMPLE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(sample, fh)
        os.replace(tmp, SAMPLE_FILE)
    except OSError:
        pass


def _rate(current: int, previous: int, seconds: float) -> float | None:
    """Per-second rate, discarding counter rollovers and device swaps."""
    if seconds <= 0 or current < previous:
        return None
    return (current - previous) / seconds


def collect_host_metrics() -> dict[str, Any]:
    """Sample the host once and return real rates plus availability flags.

    Returns keys ``watts``, ``totalIops``, ``ingressMbps``, ``egressMbps``,
    each either a number or ``None``, and ``sources`` describing where each
    figure came from so the UI can be explicit about partial coverage.
    """
    now = time.time()
    previous = _load_sample()
    prev_time = float(previous.get("timestamp") or 0.0)
    elapsed = now - prev_time if prev_time else 0.0

    rapl = _rapl_microjoules()
    disks = _diskstats()
    nets = _netdev()

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

    # --- disk IOPS ---
    total_iops: float | None = None
    if disks and elapsed > 0 and isinstance(previous.get("disks"), dict):
        accumulated = 0.0
        matched = False
        for device, (reads, writes) in disks.items():
            prev_pair = previous["disks"].get(device)
            if not isinstance(prev_pair, list) or len(prev_pair) != 2:
                continue
            r = _rate(reads, int(prev_pair[0]), elapsed)
            w = _rate(writes, int(prev_pair[1]), elapsed)
            if r is None or w is None:
                continue
            accumulated += r + w
            matched = True
        if matched:
            total_iops = round(accumulated, 1)
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

    _save_sample(sample)

    return {
        "watts": watts,
        "totalIops": total_iops,
        "ingressMbps": ingress_mbps,
        "egressMbps": egress_mbps,
        "sources": sources,
    }
