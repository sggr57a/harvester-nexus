#!/usr/bin/env python3
"""Collect cluster-wide metrics for the Nexus cockpit (Harvester / RKE2)."""

from __future__ import annotations

import importlib.util
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any

from cluster_filters import is_user_namespace

STATE_FILE = os.environ.get(
    "NEXUS_TELEMETRY_STATE",
    "/var/lib/nexus/telemetry-state.json",
)

KUBECONFIG_CANDIDATES = [
    os.environ.get("KUBECONFIG", ""),
    "/etc/rancher/rke2/rke2.yaml",
    "/etc/rancher/k3s/k3s.yaml",
    "/var/lib/rancher/rke2/agent/kubelet.kubeconfig",
]


def _find_kubeconfig() -> str | None:
    for path in KUBECONFIG_CANDIDATES:
        if path and os.path.isfile(path):
            return path
    return None


def _kubectl_json(kubeconfig: str, *args: str) -> dict[str, Any] | list[Any] | None:
    cmd = ["kubectl", "--kubeconfig", kubeconfig, "-o", "json", *args]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=45, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None


def _kubectl_raw_json(kubeconfig: str, path: str) -> dict[str, Any] | list[Any] | None:
    cmd = ["kubectl", "--kubeconfig", kubeconfig, "get", "--raw", path]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=45, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None


def _parse_cpu_cores(value: str) -> float:
    if value.endswith("n"):
        return float(value[:-1]) / 1_000_000_000.0
    if value.endswith("u"):
        return float(value[:-1]) / 1_000_000.0
    if value.endswith("m"):
        return float(value[:-1]) / 1000.0
    return float(value)


def _parse_bytes(value: str) -> float:
    if value.endswith("Ki"):
        return float(value[:-2]) * 1024.0
    if value.endswith("Mi"):
        return float(value[:-2]) * 1024.0 * 1024.0
    if value.endswith("Gi"):
        return float(value[:-2]) * 1024.0 * 1024.0 * 1024.0
    if value.endswith("Ti"):
        return float(value[:-2]) * 1024.0 * 1024.0 * 1024.0 * 1024.0
    return float(value)


def _count_running_pods(kubeconfig: str) -> int:
    data = _kubectl_json(kubeconfig, "get", "pods", "-A")
    if not isinstance(data, dict):
        return 0
    count = 0
    for pod in data.get("items") or []:
        meta = pod.get("metadata") or {}
        if not is_user_namespace(meta.get("namespace", "")):
            continue
        if (pod.get("status") or {}).get("phase") == "Running":
            count += 1
    return count


def _count_kubevirt_vms(kubeconfig: str) -> int:
    data = _kubectl_json(
        kubeconfig,
        "get",
        "virtualmachines.kubevirt.io",
        "-A",
    )
    if not isinstance(data, dict):
        return 0
    count = 0
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        if is_user_namespace(meta.get("namespace", "")):
            count += 1
    return count


def _count_active_migrations(kubeconfig: str) -> int:
    data = _kubectl_json(
        kubeconfig,
        "get",
        "virtualmachineinstancemigration.kubevirt.io",
        "-A",
    )
    if not isinstance(data, dict):
        return 0
    count = 0
    for item in data.get("items") or []:
        phase = ((item.get("status") or {}).get("phase") or "").lower()
        if phase and phase not in ("succeeded", "failed"):
            count += 1
    return count


def _node_capacity_usage(kubeconfig: str) -> tuple[float | None, float | None, int]:
    """Cluster CPU/RAM utilisation, or (None, None) when metrics-server is absent.

    Returning 0.0 for "no data" made the cockpit render a confident 0% CPU on
    clusters with no metrics pipeline, which is indistinguishable from a genuinely
    idle cluster.
    """
    nodes = _kubectl_json(kubeconfig, "get", "nodes")
    if not isinstance(nodes, dict):
        return None, None, 0

    node_items = nodes.get("items") or []
    node_count = len(node_items)

    metrics = _kubectl_raw_json(kubeconfig, "/apis/metrics.k8s.io/v1beta1/nodes")
    usage_by_name: dict[str, dict[str, str]] = {}
    if isinstance(metrics, dict):
        for item in metrics.get("items") or []:
            meta = item.get("metadata") or {}
            name = meta.get("name")
            if name:
                usage_by_name[name] = item.get("usage") or {}

    cpu_used = 0.0
    cpu_cap = 0.0
    mem_used = 0.0
    mem_cap = 0.0

    for node in node_items:
        status = node.get("status") or {}
        capacity = status.get("capacity") or {}
        cpu_cap += _parse_cpu_cores(str(capacity.get("cpu", "0")))
        mem_cap += _parse_bytes(str(capacity.get("memory", "0")))

        meta = node.get("metadata") or {}
        name = meta.get("name") or ""
        usage = usage_by_name.get(name) or {}
        if usage:
            cpu_used += _parse_cpu_cores(str(usage.get("cpu", "0")))
            mem_used += _parse_bytes(str(usage.get("memory", "0")))

    if not usage_by_name:
        # Capacity is known from the node objects, but utilisation requires the
        # metrics API. Report unavailable rather than 0%.
        return None, None, node_count

    cpu_percent = round((cpu_used / cpu_cap) * 100.0, 1) if cpu_cap > 0 else None
    ram_percent = round((mem_used / mem_cap) * 100.0, 1) if mem_cap > 0 else None
    return cpu_percent, ram_percent, node_count


def _monitoring_addon_enabled(kubeconfig: str) -> bool:
    data = _kubectl_json(
        kubeconfig,
        "get",
        "addons.harvesterhci.io",
        "rancher-monitoring",
        "-n",
        "harvester-system",
    )
    if not isinstance(data, dict):
        return False
    spec = data.get("spec") or {}
    status = data.get("status") or {}
    return bool(spec.get("enabled")) and status.get("status") == "AddonDeploySuccessful"


def _harvester_ready(kubeconfig: str) -> bool:
    """True when every node reports Ready and kube-system has no failed pods.

    The previous implementation matched the pod names ``rke2-server`` and
    ``rke2-ingress-nginx``, so readiness never became true on a K3s-based
    cluster even though the installer supports both distributions. Node
    conditions are distribution-agnostic.
    """
    nodes = _kubectl_json(kubeconfig, "get", "nodes")
    if not isinstance(nodes, dict):
        return False
    node_items = nodes.get("items") or []
    if not node_items:
        return False
    for node in node_items:
        conditions = (node.get("status") or {}).get("conditions") or []
        ready = any(
            c.get("type") == "Ready" and c.get("status") == "True" for c in conditions
        )
        if not ready:
            return False

    pods = _kubectl_json(kubeconfig, "get", "pods", "-n", "kube-system")
    if not isinstance(pods, dict):
        return False
    items = pods.get("items") or []
    if not items:
        return False
    for pod in items:
        phase = (pod.get("status") or {}).get("phase")
        if phase in ("Failed", "Unknown"):
            return False
    return True


def _collect_accelerator_summary() -> dict[str, Any]:
    """Add-in card pulse for the environment tick. Never invents utilization."""
    try:
        spec = importlib.util.spec_from_file_location(
            "nexus_accelerator_inventory",
            os.path.join(os.path.dirname(__file__), "accelerator_inventory.py"),
        )
        if spec is None or spec.loader is None:
            raise ImportError("accelerator_inventory module missing")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.environment_summary()
    except Exception as exc:  # noqa: BLE001
        return {
            "available": False,
            "cards": 0,
            "issues": 0,
            "hottestC": None,
            "byKind": {},
            "waitingForHardware": [],
            "devices": [],
            "error": str(exc),
        }


def _collect_host_metrics() -> dict[str, Any]:
    """Real power / disk / network readings, or nulls when unavailable."""
    try:
        spec = importlib.util.spec_from_file_location(
            "nexus_host_metrics", os.path.join(os.path.dirname(__file__), "host_metrics.py")
        )
        if spec is None or spec.loader is None:
            raise ImportError("host_metrics module missing")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.collect_host_metrics()
    except Exception:  # noqa: BLE001
        return {
            "watts": None,
            "totalIops": None,
            "ingressMbps": None,
            "egressMbps": None,
            "sources": {"host": "unavailable (host_metrics failed to load)"},
        }


def _security_posture(kubeconfig: str) -> dict[str, Any]:
    """Derive CVE count and a trust score from real scanner output.

    ``trustScore`` was previously a hardcoded 85 that nothing ever wrote. It
    is now computed from Trivy VulnerabilityReports when the operator has
    deployed them, and is ``None`` otherwise, so the cockpit does not present
    a constant as a measurement.
    """
    reports = _kubectl_json(kubeconfig, "get", "vulnerabilityreports.aquasecurity.github.io", "-A")
    if not isinstance(reports, dict):
        return {
            "openCves": None,
            "trustScore": None,
            "source": "unavailable (Trivy VulnerabilityReports not present)",
        }

    critical = high = medium = low = 0
    for item in reports.get("items") or []:
        summary = (item.get("report") or {}).get("summary") or {}
        critical += int(summary.get("criticalCount", 0) or 0)
        high += int(summary.get("highCount", 0) or 0)
        medium += int(summary.get("mediumCount", 0) or 0)
        low += int(summary.get("lowCount", 0) or 0)

    open_cves = critical + high + medium + low
    # Weighted deduction, floored at 0: criticals dominate, lows barely move it.
    penalty = critical * 10 + high * 3 + medium * 0.5 + low * 0.1
    trust = max(0, min(100, int(round(100 - penalty))))
    return {
        "openCves": open_cves,
        "trustScore": trust,
        "source": "trivy-operator",
        "cveBreakdown": {
            "critical": critical,
            "high": high,
            "medium": medium,
            "low": low,
        },
    }


def _load_state() -> dict[str, Any]:
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {"tick": 0}


def _save_state(state: dict[str, Any]) -> None:
    """Best-effort persist. A non-writable state dir must not 503 the endpoint."""
    try:
        directory = os.path.dirname(STATE_FILE)
        if directory:
            os.makedirs(directory, exist_ok=True)
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
        os.replace(tmp, STATE_FILE)
    except OSError as exc:
        sys.stderr.write("nexus-metrics: state persist failed (%s); continuing\n" % exc)


def collect_environment() -> dict[str, Any]:
    kubeconfig = _find_kubeconfig()
    if not kubeconfig:
        raise RuntimeError("kubeconfig not found")

    cpu_percent, ram_percent, node_count = _node_capacity_usage(kubeconfig)
    pod_count = _count_running_pods(kubeconfig)
    vm_count = _count_kubevirt_vms(kubeconfig)
    active_migrations = _count_active_migrations(kubeconfig)
    monitoring = _monitoring_addon_enabled(kubeconfig)
    cluster_ready = _harvester_ready(kubeconfig)
    host = _collect_host_metrics()
    security = _security_posture(kubeconfig)
    accelerators = _collect_accelerator_summary()

    state = _load_state()
    tick = int(state.get("tick", 0)) + 1
    state["tick"] = tick
    _save_state(state)

    total_workloads = pod_count + vm_count

    return {
        "totalWorkloads": total_workloads,
        # Read straight from kernel counters on this node. null means the
        # source is genuinely unavailable — never substitute a plausible
        # number, and never depend on another endpoint having run first.
        "totalIops": host.get("totalIops"),
        "ingressMbps": host.get("ingressMbps"),
        "egressMbps": host.get("egressMbps"),
        "cpuPercent": cpu_percent,
        "ramPercent": ram_percent,
        "watts": host.get("watts"),
        "activeMigrations": active_migrations,
        "openCves": security.get("openCves"),
        "trustScore": security.get("trustScore"),
        "tick": tick,
        "source": "metrics-server" if cpu_percent is not None else "kube-api",
        "clusterReady": cluster_ready,
        "monitoringEnabled": monitoring,
        "nodeCount": node_count,
        "podCount": pod_count,
        "vmCount": vm_count,
        # Same poll as CPU / RAM so every hardware dashboard can render
        # FPGA / GPU / NPU / TPU without a second round trip.
        "accelerators": accelerators,
        # Per-metric provenance so the cockpit can label partial coverage
        # rather than presenting every figure as equally authoritative.
        "metricSources": {
            **host.get("sources", {}),
            "cpu": "metrics-server" if cpu_percent is not None else "unavailable (metrics-server not installed)",
            "security": security.get("source", "unavailable"),
            "accelerators": "sysfs-pci" if accelerators.get("available") else "unavailable",
        },
    }


def live_health() -> dict[str, Any]:
    kubeconfig = _find_kubeconfig()
    if not kubeconfig:
        return {
            "live": False,
            "clusterReady": False,
            "monitoringEnabled": False,
            "message": "kubeconfig not found on node",
        }
    try:
        monitoring = _monitoring_addon_enabled(kubeconfig)
        ready = _harvester_ready(kubeconfig)
        return {
            "live": True,
            "clusterReady": ready,
            "monitoringEnabled": monitoring,
            "message": None if ready else "cluster API reachable; core pods still starting",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "live": False,
            "clusterReady": False,
            "monitoringEnabled": False,
            "message": str(exc),
        }
