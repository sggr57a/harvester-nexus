#!/usr/bin/env python3
"""Live dashboard collectors for Nexus cockpit (Harvester / RKE2)."""

from __future__ import annotations

import importlib.util
import json
import os
from typing import Any

from cluster_filters import is_user_namespace
from cluster_metrics import (
    _collect_accelerator_summary,
    _count_active_migrations,
    _find_kubeconfig,
    _kubectl_json,
    _kubectl_raw_json,
    _load_state,
    _monitoring_addon_enabled,
    _node_capacity_usage,
    _parse_bytes,
    _parse_cpu_cores,
    _save_state,
)

try:
    from network_collectors import collect_networking_slice
except ImportError:
    collect_networking_slice = None  # type: ignore[assignment,misc]


def _collect_acceleration() -> dict[str, Any]:
    """Live NPU / TPU / FPGA / GPU PCI inventory. Never fabricates utilization."""
    try:
        spec = importlib.util.spec_from_file_location(
            "nexus_accelerator_inventory",
            os.path.join(os.path.dirname(__file__), "accelerator_inventory.py"),
        )
        if spec is None or spec.loader is None:
            raise ImportError("accelerator_inventory module missing")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.live_dashboard()
    except Exception as exc:  # noqa: BLE001
        return {
            "available": False,
            "error": str(exc),
            "devices": [],
            "passThrough": [],
            "issues": [],
            "waitingForHardware": [],
        }


def _collect_processor_memory() -> dict[str, Any]:
    """Live NUMA / tier / swap / zswap / PSI snapshot. Never applies sysctls."""
    try:
        spec = importlib.util.spec_from_file_location(
            "nexus_memory_tiering",
            os.path.join(os.path.dirname(__file__), "memory_tiering.py"),
        )
        if spec is None or spec.loader is None:
            raise ImportError("memory_tiering module missing")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.live_dashboard()
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "error": str(exc), "memoryTiers": [], "numaZones": [], "waitingForHardware": []}


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
        namespace = meta.get("namespace", "")
        if not is_user_namespace(namespace):
            continue
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


def _storage_classes(kubeconfig: str, used_classes: set[str]) -> list[dict[str, Any]]:
    if not used_classes:
        return []
    data = _kubectl_json(kubeconfig, "get", "storageclass")
    if not isinstance(data, dict):
        return []
    backends: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        name = meta.get("name", "")
        if name not in used_classes:
            continue
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


def _node_fleet(kubeconfig: str) -> list[dict[str, Any]]:
    nodes = _kubectl_json(kubeconfig, "get", "nodes")
    if not isinstance(nodes, dict):
        return []

    metrics = _kubectl_raw_json(kubeconfig, "/apis/metrics.k8s.io/v1beta1/nodes")
    usage_by_name: dict[str, dict[str, str]] = {}
    if isinstance(metrics, dict):
        for item in metrics.get("items") or []:
            meta = item.get("metadata") or {}
            name = meta.get("name")
            if name:
                usage_by_name[name] = item.get("usage") or {}

    rows: list[dict[str, Any]] = []
    for item in nodes.get("items") or []:
        meta = item.get("metadata") or {}
        name = meta.get("name") or ""
        if not name:
            continue
        status = item.get("status") or {}
        capacity = status.get("capacity") or {}
        cpu_cap = _parse_cpu_cores(str(capacity.get("cpu", "0")))
        mem_cap = _parse_bytes(str(capacity.get("memory", "0")))
        usage = usage_by_name.get(name) or {}
        cpu_used = _parse_cpu_cores(str(usage.get("cpu", "0"))) if usage else 0.0
        mem_used = _parse_bytes(str(usage.get("memory", "0"))) if usage else 0.0
        cpu_percent = round((cpu_used / cpu_cap) * 100.0, 1) if cpu_cap > 0 and usage else 0.0
        mem_gib = round(mem_used / (1024**3), 1) if usage else 0.0
        mem_cap_gib = round(mem_cap / (1024**3), 1) if mem_cap > 0 else 0.0
        conditions = status.get("conditions") or []
        ready = any(
            c.get("type") == "Ready" and c.get("status") == "True"
            for c in conditions
        )
        labels = meta.get("labels") or {}
        ha_enabled = (
            "node-role.kubernetes.io/control-plane" in labels
            or "node-role.kubernetes.io/master" in labels
        )
        rows.append(
            {
                "id": meta.get("uid") or ("node-%s" % name),
                "name": name,
                "kind": "node",
                "host": name,
                "cpuPercent": cpu_percent,
                "ramGiB": mem_gib,
                "ramAllocGiB": mem_cap_gib or mem_gib or 1.0,
                "status": "running" if ready else "paused",
                "haEnabled": ha_enabled,
                "affinity": "none",
            }
        )
    return rows


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
        namespace = meta.get("namespace", "")
        if not is_user_namespace(namespace):
            continue
        key = "%s/%s" % (namespace, meta.get("name"))
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
        networks = []
        tpl_spec = (template.get("spec") or {})
        for idx, net in enumerate(tpl_spec.get("networks") or []):
            iface_name = net.get("name") or ("net%d" % idx)
            networks.append({"name": iface_name, "type": "multus" if net.get("multus") else "pod"})
        rows.append(
            {
                "id": meta.get("uid") or key,
                "name": meta.get("name", ""),
                "kind": "vm",
                "host": node,
                "namespace": namespace,
                "cpuPercent": 0,
                "ramGiB": round(mem / (1024**3), 1),
                "ramAllocGiB": round(mem / (1024**3), 1),
                "status": status,
                "haEnabled": True,
                "affinity": "none",
                "networks": networks,
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
        namespace = meta.get("namespace", "")
        if not is_user_namespace(namespace):
            continue
        status = item.get("status") or {}
        if status.get("phase") != "Running":
            continue
        spec = item.get("spec") or {}
        containers = spec.get("containers") or []
        mem = 0.0
        for c in containers:
            mem += _parse_bytes(str((c.get("resources") or {}).get("requests", {}).get("memory", "0")))
        labels = meta.get("labels") or {}
        pod_kind = "lxc" if labels.get("nexus.nexus.io/workload-kind") == "lxc" else "pod"
        rows.append(
            {
                "id": meta.get("uid") or meta.get("name", ""),
                "name": meta.get("name", ""),
                "kind": pod_kind,
                "host": spec.get("nodeName") or "pending",
                "namespace": namespace,
                "cpuPercent": 0,
                "ramGiB": round(max(mem, 512 * 1024 * 1024) / (1024**3), 2),
                "ramAllocGiB": round(max(mem, 512 * 1024 * 1024) / (1024**3), 2),
                "status": "running",
                "haEnabled": bool(spec.get("ownerReferences")),
                "affinity": "none",
            }
        )
    return rows[:120]


def _count_user_running_pods(kubeconfig: str) -> int:
    data = _kubectl_json(kubeconfig, "get", "pods", "-A")
    if not isinstance(data, dict):
        return 0
    count = 0
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        if not is_user_namespace(meta.get("namespace", "")):
            continue
        if (item.get("status") or {}).get("phase") == "Running":
            count += 1
    return count


def _count_user_vms(kubeconfig: str) -> int:
    data = _kubectl_json(kubeconfig, "get", "virtualmachines.kubevirt.io", "-A")
    if not isinstance(data, dict):
        return 0
    count = 0
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        if is_user_namespace(meta.get("namespace", "")):
            count += 1
    return count


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


def _load_xdr_ingest():
    path = os.path.join(os.path.dirname(__file__), "xdr_ingest.py")
    spec = importlib.util.spec_from_file_location("nexus_xdr_ingest", path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


try:
    _xdr = _load_xdr_ingest()
except Exception:
    _xdr = None

collect_sensor_events = getattr(_xdr, "collect_sensor_events", None)
collect_sensor_health = getattr(_xdr, "collect_sensor_health", None)


def _xdr_sensor_health(kubeconfig: str) -> dict[str, Any]:
    if collect_sensor_health is not None:
        health = collect_sensor_health(kubeconfig)
        if isinstance(health, dict):
            return health
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


def _xdr_events(kubeconfig: str) -> list[dict[str, Any]]:
    """Falco / Tetragon / Suricata / Wazuh alerts, plus Kubernetes warnings.

    Severity is taken from the sensor (or derived from the Warning reason).
    Nothing here is hardcoded to ``medium``.
    """
    if collect_sensor_events is not None:
        events = collect_sensor_events(kubeconfig)
        if isinstance(events, list):
            return events
    return []


def collect_dashboards_live() -> dict[str, Any]:
    kubeconfig = _find_kubeconfig()
    if not kubeconfig:
        raise RuntimeError("kubeconfig not found")

    monitoring = _monitoring_addon_enabled(kubeconfig)
    cpu_percent, ram_percent, node_count = _node_capacity_usage(kubeconfig)
    pod_count = _count_user_running_pods(kubeconfig)
    vm_count = _count_user_vms(kubeconfig)
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
    used_classes = {pvc["storageClass"] for pvc in pvcs if pvc.get("storageClass")}
    backends = _storage_classes(kubeconfig, used_classes)
    longhorn = _longhorn_volumes(kubeconfig) if used_classes else []
    fleet = _node_fleet(kubeconfig) + _vm_fleet(kubeconfig) + _pod_fleet(kubeconfig)
    migrations = _migration_rows(kubeconfig)
    xdr = _xdr_sensor_health(kubeconfig)
    events = _xdr_events(kubeconfig)
    by_sensor = xdr.get("bySensor") if isinstance(xdr.get("bySensor"), dict) else {}
    for event in events:
        source = str(event.get("source") or "")
        if source in by_sensor and isinstance(by_sensor[source], dict):
            by_sensor[source]["ingesting"] = True
    networking = collect_networking_slice(kubeconfig) if collect_networking_slice else {"available": False}

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
            "accelerators": _collect_accelerator_summary(),
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
        "networking": networking if isinstance(networking, dict) else {"available": False},
        "processorMemory": _collect_processor_memory(),
        "acceleration": _collect_acceleration(),
    }


def collect_environment_with_prometheus() -> dict[str, Any]:
    """Environment snapshot enriched with Prometheus when available."""
    live = collect_dashboards_live()
    return live["environment"]
