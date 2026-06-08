#!/usr/bin/env python3
"""Live dashboard collectors for Nexus cockpit (Harvester / RKE2)."""

from __future__ import annotations

import json
from typing import Any

from cluster_metrics import (
    _count_active_migrations,
    _count_kubevirt_vms,
    _count_running_pods,
    _find_kubeconfig,
    _kubectl_json,
    _kubectl_raw_json,
    _load_state,
    _monitoring_addon_enabled,
    _node_capacity_usage,
    _parse_bytes,
    _save_state,
)


def _parse_gi(value: str) -> float:
    if value.endswith("Ti"):
        return float(value[:-2]) * 1024.0
    if value.endswith("Gi"):
        return float(value[:-2])
    if value.endswith("Mi"):
        return float(value[:-2]) / 1024.0
    if value.endswith("Ki"):
        return float(value[:-2]) / (1024.0 * 1024.0)
    try:
        return float(value) / (1024.0 ** 3)
    except ValueError:
        return 0.0


def _pvc_rows(kubeconfig: str) -> list[dict[str, Any]]:
    data = _kubectl_json(kubeconfig, "get", "pvc", "-A")
    if not isinstance(data, dict):
        return []
    rows: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        spec = item.get("spec") or {}
        status = item.get("status") or {}
        phase = status.get("phase", "Pending").lower()
        access = (spec.get("accessModes") or ["ReadWriteOnce"])[0]
        access_map = {
            "ReadWriteOnce": "RWO",
            "ReadOnlyMany": "ROX",
            "ReadWriteMany": "RWX",
        }
        rows.append(
            {
                "id": meta.get("uid") or meta.get("name", ""),
                "name": meta.get("name", ""),
                "namespace": meta.get("namespace", ""),
                "storageClass": spec.get("storageClassName") or "default",
                "sizeGiB": round(_parse_gi(str(spec.get("resources", {}).get("requests", {}).get("storage", "0"))), 1),
                "status": "bound" if phase == "bound" else "pending" if phase == "pending" else "released",
                "accessMode": access_map.get(access, "RWO"),
            }
        )
    return rows


def _storage_classes(kubeconfig: str) -> list[dict[str, Any]]:
    data = _kubectl_json(kubeconfig, "get", "storageclass")
    if not isinstance(data, dict):
        return []
    backends: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        name = meta.get("name", "")
        prov = (item.get("provisioner") or "").lower()
        kind = "file" if "nfs" in prov or "smb" in prov else "block"
        label = name
        if "longhorn" in prov:
            label = "Longhorn"
        elif "rook" in prov or "ceph" in prov:
            label = "Ceph RBD/CephFS"
        elif "local" in prov:
            label = "Local path"
        backends.append(
            {
                "id": name,
                "label": label,
                "kind": kind,
                "usagePercent": 0,
                "capacityTiB": 0,
                "iops": 0,
                "readMiBs": 0,
                "writeMiBs": 0,
                "driverHealth": "healthy",
                "csiTemplate": prov or name,
                "features": ["live"],
            }
        )
    return backends


def _longhorn_volumes(kubeconfig: str) -> list[dict[str, Any]]:
    data = _kubectl_json(kubeconfig, "get", "volumes.longhorn.io", "-n", "longhorn-system")
    if not isinstance(data, dict):
        return []
    vols: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        status = item.get("status") or {}
        robustness = status.get("robustness", "unknown")
        health = "healthy"
        if robustness in ("degraded", "faulted"):
            health = "critical" if robustness == "faulted" else "degraded"
        vols.append({"name": meta.get("name", ""), "health": health, "size": status.get("actualSize", 0)})
    return vols


def _vm_fleet(kubeconfig: str) -> list[dict[str, Any]]:
    vms = _kubectl_json(kubeconfig, "get", "virtualmachines.kubevirt.io", "-A")
    vmis = _kubectl_json(kubeconfig, "get", "virtualmachineinstances.kubevirt.io", "-A")
    vmi_by_key: dict[str, dict] = {}
    if isinstance(vmis, dict):
        for item in vmis.get("items") or []:
            meta = item.get("metadata") or {}
            key = "%s/%s" % (meta.get("namespace"), meta.get("name"))
            vmi_by_key[key] = item

    rows: list[dict[str, Any]] = []
    if not isinstance(vms, dict):
        return rows
    for item in vms.get("items") or []:
        meta = item.get("metadata") or {}
        key = "%s/%s" % (meta.get("namespace"), meta.get("name"))
        vmi = vmi_by_key.get(key) or {}
        vmi_status = vmi.get("status") or {}
        phase = (vmi_status.get("phase") or "stopped").lower()
        status = "running"
        if phase in ("migrating",):
            status = "migrating"
        elif phase in ("paused",):
            status = "paused"
        elif phase not in ("running",):
            status = "paused"
        node = vmi_status.get("nodeName") or "unscheduled"
        spec = item.get("spec") or {}
        template = spec.get("template") or {}
        domain = (template.get("spec") or {}).get("domain") or {}
        resources = domain.get("resources") or {}
        requests = resources.get("requests") or {}
        mem = _parse_bytes(str(requests.get("memory", "0Gi")))
        rows.append(
            {
                "id": meta.get("uid") or key,
                "name": meta.get("name", ""),
                "kind": "vm",
                "host": node,
                "cpuPercent": 0,
                "ramGiB": round(mem / (1024**3), 1),
                "ramAllocGiB": round(mem / (1024**3), 1),
                "status": status,
                "haEnabled": True,
                "affinity": "none",
            }
        )
    return rows


def _pod_fleet(kubeconfig: str) -> list[dict[str, Any]]:
    data = _kubectl_json(kubeconfig, "get", "pods", "-A")
    if not isinstance(data, dict):
        return []
    rows: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        status = item.get("status") or {}
        if status.get("phase") != "Running":
            continue
        spec = item.get("spec") or {}
        containers = spec.get("containers") or []
        mem = 0.0
        for c in containers:
            mem += _parse_bytes(str((c.get("resources") or {}).get("requests", {}).get("memory", "0")))
        rows.append(
            {
                "id": meta.get("uid") or meta.get("name", ""),
                "name": meta.get("name", ""),
                "kind": "pod",
                "host": spec.get("nodeName") or "pending",
                "cpuPercent": 0,
                "ramGiB": round(max(mem, 512 * 1024 * 1024) / (1024**3), 2),
                "ramAllocGiB": round(max(mem, 512 * 1024 * 1024) / (1024**3), 2),
                "status": "running",
                "haEnabled": bool(spec.get("ownerReferences")),
                "affinity": "none",
            }
        )
    return rows[:120]


def _migration_rows(kubeconfig: str) -> list[dict[str, Any]]:
    data = _kubectl_json(kubeconfig, "get", "virtualmachineinstancemigration.kubevirt.io", "-A")
    if not isinstance(data, dict):
        return []
    rows: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        status = item.get("status") or {}
        phase = (status.get("phase") or "").lower()
        if phase in ("succeeded", "failed", ""):
            continue
        spec = item.get("spec") or {}
        rows.append(
            {
                "id": meta.get("uid") or meta.get("name", ""),
                "workload": spec.get("vmiName") or meta.get("name", ""),
                "kind": "vm",
                "source": status.get("sourceNode") or "?",
                "target": status.get("targetNode") or "?",
                "progress": 50 if phase == "running" else 20,
                "preservesMemory": True,
                "estimatedSeconds": 60,
            }
        )
    return rows


def _prometheus_query(kubeconfig: str, query: str) -> float | None:
    import urllib.parse

    encoded = urllib.parse.quote(query)
    path = (
        "/api/v1/namespaces/cattle-monitoring-system/services/"
        "http:rancher-monitoring-prometheus:9090/proxy/api/v1/query?query="
        + encoded
    )
    data = _kubectl_raw_json(kubeconfig, path)
    if not isinstance(data, dict):
        return None
    result = data.get("data", {}).get("result") or []
    if not result:
        return None
    value = result[0].get("value")
    if not value or len(value) < 2:
        return None
    try:
        return float(value[1])
    except (TypeError, ValueError):
        return None


def _prometheus_series(kubeconfig: str, query: str, points: int = 24) -> list[float]:
    import time
    import urllib.parse

    end = int(time.time())
    start = end - points * 60
    encoded = urllib.parse.quote(query)
    path = (
        "/api/v1/namespaces/cattle-monitoring-system/services/"
        "http:rancher-monitoring-prometheus:9090/proxy/api/v1/query_range?query="
        + encoded
        + "&start=%d&end=%d&step=60" % (start, end)
    )
    data = _kubectl_raw_json(kubeconfig, path)
    if not isinstance(data, dict):
        return []
    result = data.get("data", {}).get("result") or []
    if not result:
        return []
    values = result[0].get("values") or []
    samples: list[float] = []
    for pair in values:
        if len(pair) >= 2:
            try:
                samples.append(float(pair[1]))
            except (TypeError, ValueError):
                samples.append(0.0)
    return samples[-points:]


def _xdr_sensor_health(kubeconfig: str) -> dict[str, Any]:
    data = _kubectl_json(kubeconfig, "get", "pods", "-n", "nexus-xdr")
    healthy = 0
    total = 0
    if isinstance(data, dict):
        for item in data.get("items") or []:
            total += 1
            status = item.get("status") or {}
            phase = status.get("phase")
            if phase == "Running":
                healthy += 1
    return {"sensorsHealthy": healthy, "sensorsTotal": total, "deployed": total > 0}


def _k8s_security_events(kubeconfig: str) -> list[dict[str, Any]]:
    data = _kubectl_json(kubeconfig, "get", "events", "-A", "--field-selector=type=Warning")
    if not isinstance(data, dict):
        return []
    events: list[dict[str, Any]] = []
    for item in (data.get("items") or [])[:20]:
        meta = item.get("metadata") or {}
        events.append(
            {
                "message": item.get("message") or item.get("reason") or "warning",
                "source": item.get("source") or {},
                "namespace": meta.get("namespace", ""),
                "name": meta.get("name", ""),
            }
        )
    return events


def collect_dashboards_live() -> dict[str, Any]:
    kubeconfig = _find_kubeconfig()
    if not kubeconfig:
        raise RuntimeError("kubeconfig not found")

    monitoring = _monitoring_addon_enabled(kubeconfig)
    cpu_percent, ram_percent, node_count = _node_capacity_usage(kubeconfig)
    pod_count = _count_running_pods(kubeconfig)
    vm_count = _count_kubevirt_vms(kubeconfig)
    migrations_count = _count_active_migrations(kubeconfig)

    total_iops = 0.0
    ingress_mbps = 0.0
    egress_mbps = 0.0
    cpu_series: list[float] = []
    ram_series: list[float] = []

    if monitoring:
        iops_val = _prometheus_query(
            kubeconfig,
            "sum(rate(node_disk_reads_completed_total[5m]) + rate(node_disk_writes_completed_total[5m]))",
        )
        if iops_val is not None:
            total_iops = iops_val
        rx = _prometheus_query(kubeconfig, "sum(rate(node_network_receive_bytes_total[5m]))")
        tx = _prometheus_query(kubeconfig, "sum(rate(node_network_transmit_bytes_total[5m]))")
        if rx is not None:
            ingress_mbps = rx * 8 / 1_000_000
        if tx is not None:
            egress_mbps = tx * 8 / 1_000_000
        cpu_series = _prometheus_series(
            kubeconfig,
            '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
        )
        ram_series = _prometheus_series(
            kubeconfig,
            "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
        )

    state = _load_state()
    tick = int(state.get("tick", 0)) + 1
    state["tick"] = tick
    state["totalIops"] = int(total_iops)
    state["ingressMbps"] = int(ingress_mbps)
    state["egressMbps"] = int(egress_mbps)
    _save_state(state)

    pvcs = _pvc_rows(kubeconfig)
    backends = _storage_classes(kubeconfig)
    longhorn = _longhorn_volumes(kubeconfig)
    fleet = _vm_fleet(kubeconfig) + _pod_fleet(kubeconfig)
    migrations = _migration_rows(kubeconfig)
    xdr = _xdr_sensor_health(kubeconfig)
    events = _k8s_security_events(kubeconfig)

    work_items = []
    for mig in migrations[:6]:
        work_items.append(
            {
                "id": mig["id"],
                "kind": "migration",
                "label": "Live migration process",
                "target": "%s / %s -> %s" % (mig["workload"], mig["source"], mig["target"]),
                "progress": mig["progress"],
                "status": "migrating",
            }
        )
    for pvc in pvcs[:4]:
        if pvc["status"] == "pending":
            work_items.append(
                {
                    "id": pvc["id"],
                    "kind": "persistent-volume",
                    "label": "Persistent volume activity",
                    "target": "%s / %s" % (pvc["storageClass"], pvc["name"]),
                    "progress": 40,
                    "status": "allocating",
                }
            )

    return {
        "environment": {
            "totalWorkloads": pod_count + vm_count,
            "totalIops": int(total_iops),
            "ingressMbps": int(ingress_mbps),
            "egressMbps": int(egress_mbps),
            "cpuPercent": cpu_percent,
            "ramPercent": ram_percent,
            "watts": node_count * 220,
            "activeMigrations": migrations_count,
            "openCves": int(state.get("openCves", 0)),
            "trustScore": int(state.get("trustScore", 85)),
            "tick": tick,
            "source": "mixed" if monitoring else "harvester",
            "clusterReady": True,
            "monitoringEnabled": monitoring,
            "nodeCount": node_count,
            "podCount": pod_count,
            "vmCount": vm_count,
        },
        "storage": {
            "pvcs": pvcs,
            "backends": backends,
            "longhornVolumes": longhorn,
        },
        "machines": {
            "fleet": fleet,
            "migrations": migrations,
        },
        "resourceMonitoring": {
            "workItems": work_items,
            "cpuSeries": cpu_series or [cpu_percent] * 12,
            "ramSeries": ram_series or [ram_percent] * 12,
            "memoryPressurePercent": ram_percent,
        },
        "xdr": {
            **xdr,
            "events": events,
        },
        "operations": {
            "grafanaUrl": "/api/v1/namespaces/cattle-monitoring-system/services/http:rancher-monitoring-grafana:80/proxy/",
            "alertmanagerUrl": "/api/v1/namespaces/cattle-monitoring-system/services/http:rancher-monitoring-alertmanager:9093/proxy/",
            "harvesterReadyZ": "/v1/harvester/readyz",
            "monitoringEnabled": monitoring,
        },
    }


def collect_environment_with_prometheus() -> dict[str, Any]:
    """Environment snapshot enriched with Prometheus when available."""
    live = collect_dashboards_live()
    return live["environment"]
