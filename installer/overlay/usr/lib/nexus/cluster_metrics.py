#!/usr/bin/env python3
"""Collect cluster-wide metrics for the Nexus cockpit (Harvester / RKE2)."""

from __future__ import annotations

import json
import os
import ssl
import subprocess
import urllib.error
import urllib.request
from typing import Any

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
    items = data.get("items") or []
    return sum(1 for pod in items if (pod.get("status") or {}).get("phase") == "Running")


def _count_kubevirt_vms(kubeconfig: str) -> int:
    data = _kubectl_json(
        kubeconfig,
        "get",
        "virtualmachines.kubevirt.io",
        "-A",
    )
    if not isinstance(data, dict):
        return 0
    return len(data.get("items") or [])


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


def _node_capacity_usage(kubeconfig: str) -> tuple[float, float, int]:
    nodes = _kubectl_json(kubeconfig, "get", "nodes")
    if not isinstance(nodes, dict):
        return 0.0, 0.0, 0

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

    cpu_percent = round((cpu_used / cpu_cap) * 100.0, 1) if cpu_cap > 0 else 0.0
    ram_percent = round((mem_used / mem_cap) * 100.0, 1) if mem_cap > 0 else 0.0
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
    data = _kubectl_json(kubeconfig, "get", "pods", "-n", "kube-system")
    if not isinstance(data, dict):
        return False
    names = " ".join(
        ((item.get("metadata") or {}).get("name") or "")
        for item in (data.get("items") or [])
    )
    return "rke2-server" in names or "rke2-ingress-nginx" in names


def _load_state() -> dict[str, Any]:
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {"tick": 0}


def _save_state(state: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state, fh)
    os.replace(tmp, STATE_FILE)


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

    state = _load_state()
    tick = int(state.get("tick", 0)) + 1
    state["tick"] = tick
    _save_state(state)

    total_workloads = pod_count + vm_count
    watts = node_count * 220

    return {
        "totalWorkloads": total_workloads,
        "totalIops": int(state.get("totalIops", 0)),
        "ingressMbps": int(state.get("ingressMbps", 0)),
        "egressMbps": int(state.get("egressMbps", 0)),
        "cpuPercent": cpu_percent,
        "ramPercent": ram_percent,
        "watts": watts,
        "activeMigrations": active_migrations,
        "openCves": int(state.get("openCves", 0)),
        "trustScore": int(state.get("trustScore", 85)),
        "tick": tick,
        "source": "metrics-server" if cpu_percent > 0 else "harvester",
        "clusterReady": cluster_ready,
        "monitoringEnabled": monitoring,
        "nodeCount": node_count,
        "podCount": pod_count,
        "vmCount": vm_count,
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
