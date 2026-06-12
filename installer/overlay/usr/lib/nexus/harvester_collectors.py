#!/usr/bin/env python3
"""Harvester Steve API collectors for Nexus unified cockpit."""

from __future__ import annotations

import json
import subprocess
from typing import Any
from urllib.parse import quote

from cluster_metrics import _find_kubeconfig


def _kubectl_json(args: list[str]) -> Any:
    kubeconfig = _find_kubeconfig()
    if not kubeconfig:
        return None
    cmd = ["kubectl", "--kubeconfig", kubeconfig, *args, "-o", "json"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
        if proc.returncode != 0:
            return None
        return json.loads(proc.stdout or "{}")
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        return None


def _age_from_ts(ts: str | None) -> str:
    if not ts:
        return "—"
    return ts[:10]


def _vm_state(vm: dict[str, Any]) -> str:
    printable = vm.get("status", {}).get("printableStatus", "")
    if printable in ("Running", "Starting"):
        return "running"
    if printable in ("Stopped", "Halted"):
        return "stopped"
    if printable in ("Migrating",):
        return "migrating"
    if printable in ("Paused",):
        return "paused"
    if printable in ("Error", "Failed"):
        return "error"
    return "pending"


STEVE_TYPE_MAP: dict[str, tuple[str, str]] = {
    "kubevirt.io.virtualmachine": ("virtualmachines", "kubevirt.io"),
    "harvesterhci.io.host": ("hosts", "harvesterhci.io"),
    "harvesterhci.io.volume": ("persistentvolumeclaims", ""),
    "harvesterhci.io.virtualmachineimage": ("virtualmachineimages", "harvesterhci.io"),
    "namespace": ("namespaces", ""),
    "harvesterhci.io.storage": ("storageclasses", ""),
    "harvesterhci.io.networkattachmentdefinition": ("networkattachmentdefinitions", "harvesterhci.io"),
    "harvesterhci.io.setting": ("settings", "harvesterhci.io"),
    "harvesterhci.io.addon": ("addons", "harvesterhci.io"),
}


def _rows_from_items(resource_type: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in items:
        meta = item.get("metadata", {})
        row: dict[str, Any] = {
            "id": meta.get("uid") or meta.get("name", ""),
            "name": meta.get("name", ""),
            "namespace": meta.get("namespace"),
            "type": resource_type,
            "state": "ready",
            "age": _age_from_ts(meta.get("creationTimestamp")),
        }
        if resource_type == "kubevirt.io.virtualmachine":
            row["state"] = _vm_state(item)
            spec = item.get("spec", {}).get("template", {}).get("spec", {})
            domain = spec.get("domain", {})
            resources = domain.get("resources", {}).get("requests", {})
            row["cpu"] = resources.get("cpu", "—")
            row["memory"] = resources.get("memory", "—")
            row["node"] = item.get("status", {}).get("nodeName")
        if resource_type == "harvesterhci.io.volume":
            status = item.get("status", {})
            row["state"] = "ready" if status.get("phase") == "Bound" else "pending"
            row["storageClass"] = item.get("spec", {}).get("storageClassName")
            row["size"] = item.get("spec", {}).get("resources", {}).get("requests", {}).get("storage")
        rows.append(row)
    return rows


def collect_resource_list(resource_type: str) -> dict[str, Any]:
    mapped = STEVE_TYPE_MAP.get(resource_type)
    if not mapped:
        return {
            "type": resource_type,
            "dataSource": "live",
            "rows": [],
            "total": 0,
            "clusterVersion": "unknown",
        }

    resource, group = mapped
    api_path = f"/apis/{group}/v1/{resource}" if group else f"/api/v1/{resource}"
    payload = _kubectl_json(["get", "--raw", api_path])
    items = payload.get("items", []) if isinstance(payload, dict) else []

    version_payload = _kubectl_json(["get", "--raw", "/version"])
    cluster_version = "unknown"
    if isinstance(version_payload, dict):
        cluster_version = version_payload.get("gitVersion", "unknown")

    rows = _rows_from_items(resource_type, items)
    return {
        "type": resource_type,
        "dataSource": "live",
        "rows": rows,
        "total": len(rows),
        "clusterVersion": cluster_version,
    }


def collect_dashboard() -> dict[str, Any]:
    nodes = _kubectl_json(["get", "nodes"]) or {}
    vms = _kubectl_json(["get", "virtualmachines.kubevirt.io", "-A"]) or {}
    pvcs = _kubectl_json(["get", "pvc", "-A"]) or {}
    images = _kubectl_json(["get", "virtualmachineimages.harvesterhci.io", "-A"]) or {}

    node_items = nodes.get("items", []) if isinstance(nodes, dict) else []
    vm_items = vms.get("items", []) if isinstance(vms, dict) else []
    pvc_items = pvcs.get("items", []) if isinstance(pvcs, dict) else []
    image_items = images.get("items", []) if isinstance(images, dict) else []

    return {
        "dataSource": "live",
        "clusterVersion": "live-cluster",
        "nodeCount": len(node_items),
        "vmCount": len(vm_items),
        "volumeCount": len(pvc_items),
        "imageCount": len(image_items),
        "cpuPercent": 0,
        "ramPercent": 0,
        "storageUsedTiB": 0,
        "storageTotalTiB": 0,
        "recentEvents": [],
    }
