#!/usr/bin/env python3
"""Collect Kubernetes + Open vSwitch networking state for Nexus dashboards."""

from __future__ import annotations

import json
from typing import Any

from cluster_filters import is_user_namespace
from cluster_metrics import _find_kubeconfig, _kubectl_json
from ovs_operations import collect_ovs_inventory


def _nad_vlan_id(labels: dict[str, str]) -> int:
    raw = labels.get("network.harvesterhci.io/vlan-id") or labels.get("nexus.nexus.io/vlan-id") or "0"
    try:
        return int(raw)
    except ValueError:
        return 0


def _collect_nads(kubeconfig: str) -> list[dict[str, Any]]:
    data = _kubectl_json(kubeconfig, "get", "network-attachment-definitions.k8s.cni.cncf.io", "-A")
    if not isinstance(data, dict):
        return []
    rows: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        labels = meta.get("labels") or {}
        net_type = labels.get("network.harvesterhci.io/type", "Custom")
        rows.append(
            {
                "id": meta.get("uid") or meta.get("name", ""),
                "name": meta.get("name", ""),
                "namespace": meta.get("namespace", "default"),
                "clusterNetwork": labels.get("network.harvesterhci.io/clusternetwork", ""),
                "vlanId": _nad_vlan_id(labels),
                "ovsBridge": labels.get("nexus.nexus.io/ovs-bridge", ""),
                "networkType": net_type,
            }
        )
    return rows


def _collect_vlans_from_nads(nads: list[dict[str, Any]], kubeconfig: str) -> list[dict[str, Any]]:
    vms = _kubectl_json(kubeconfig, "get", "virtualmachines.kubevirt.io", "-A")
    pods = _kubectl_json(kubeconfig, "get", "pods", "-A")
    vm_count: dict[str, int] = {}
    pod_count: dict[str, int] = {}

    if isinstance(vms, dict):
        for item in vms.get("items") or []:
            meta = item.get("metadata") or {}
            if not is_user_namespace(meta.get("namespace", "")):
                continue
            spec = item.get("spec") or {}
            nets = (spec.get("template") or {}).get("spec") or {}
            for net in nets.get("networks") or []:
                multus = net.get("multus") or {}
                key = multus.get("networkName", "")
                if key:
                    vm_count[key] = vm_count.get(key, 0) + 1

    if isinstance(pods, dict):
        for item in pods.get("items") or []:
            meta = item.get("metadata") or {}
            if not is_user_namespace(meta.get("namespace", "")):
                continue
            ann = (meta.get("annotations") or {}).get("k8s.v1.cni.cncf.io/networks", "")
            if ann:
                pod_count["multus"] = pod_count.get("multus", 0) + 1

    lanes: list[dict[str, Any]] = []
    for nad in nads:
        if nad.get("vlanId", 0) <= 0 and nad.get("networkType") != "L2VlanNetwork":
            continue
        ref = "%s/%s" % (nad["namespace"], nad["name"])
        lanes.append(
            {
                "id": nad["id"],
                "name": nad["name"],
                "vlanId": nad.get("vlanId") or 0,
                "cidr": "",
                "pods": pod_count.get(ref, pod_count.get("multus", 0)),
                "vms": vm_count.get(ref, 0),
                "egressMbps": 0,
                "ingressMbps": 0,
            }
        )
    return lanes


def _collect_ingress(kubeconfig: str) -> list[dict[str, Any]]:
    data = _kubectl_json(kubeconfig, "get", "ingress.networking.k8s.io", "-A")
    if not isinstance(data, dict):
        return []
    rows: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        if not is_user_namespace(meta.get("namespace", "")):
            continue
        spec = item.get("spec") or {}
        rules = spec.get("rules") or []
        host = (rules[0] or {}).get("host", meta.get("name", ""))
        labels = meta.get("labels") or {}
        mesh = labels.get("nexus.nexus.io/mesh", "cilium")
        rows.append(
            {
                "id": meta.get("uid") or meta.get("name", ""),
                "host": host,
                "service": meta.get("name", ""),
                "rps": 0,
                "p95Latency": 0,
                "meshProvider": mesh if mesh in ("istio", "linkerd", "cilium") else "cilium",
                "tls": "managed" if spec.get("tls") else "manual",
            }
        )
    return rows


def _collect_policy_matrix(kubeconfig: str) -> list[dict[str, Any]]:
    matrix: list[dict[str, Any]] = []
    for kind, api in (
        ("NetworkPolicy", "networkpolicies.networking.k8s.io"),
        ("CiliumNetworkPolicy", "ciliumnetworkpolicies.cilium.io"),
    ):
        data = _kubectl_json(kubeconfig, "get", api, "-A")
        if not isinstance(data, dict):
            continue
        for item in data.get("items") or []:
            meta = item.get("metadata") or {}
            if not is_user_namespace(meta.get("namespace", "")):
                continue
            labels = meta.get("labels") or {}
            zt = labels.get("nexus.nexus.io/zero-trust") == "true"
            matrix.append(
                {
                    "source": meta.get("namespace", ""),
                    "target": kind,
                    "allow": not zt,
                    "protocol": "tcp",
                }
            )
    return matrix[:24]


def _collect_tenants(kubeconfig: str) -> list[dict[str, Any]]:
    data = _kubectl_json(kubeconfig, "get", "namespaces")
    if not isinstance(data, dict):
        return []
    rows: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        meta = item.get("metadata") or {}
        labels = meta.get("labels") or {}
        tenant = labels.get("nexus.nexus.io/tenant")
        if not tenant:
            continue
        ann = meta.get("annotations") or {}
        vlan_raw = ann.get("nexus.nexus.io/vlan-ids", "")
        vlan_ids = [int(v) for v in vlan_raw.split(",") if v.strip().isdigit()]
        rows.append(
            {
                "id": meta.get("uid") or meta.get("name", ""),
                "name": tenant,
                "namespace": meta.get("name", ""),
                "vlanIds": vlan_ids,
                "policyCount": 0,
                "workloads": 0,
            }
        )
    return rows


def _port_groups_from_nads(nads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for nad in nads:
        vlan_id = nad.get("vlanId") or 0
        if vlan_id <= 0 and nad.get("networkType") != "L2VlanNetwork":
            continue
        rows.append(
            {
                "id": nad.get("id") or nad.get("name", ""),
                "name": nad.get("name", ""),
                "bridge": nad.get("ovsBridge") or nad.get("clusterNetwork") or "default",
                "vlanId": vlan_id,
                "cidr": "",
                "vms": 0,
                "pods": 0,
            }
        )
    return rows


def _virtual_bridges_from_nads(nads: list[dict[str, Any]], ovs_bridges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for br in ovs_bridges:
        name = br.get("name", "")
        if name:
            seen.add(name)
            rows.append(
                {
                    "id": br.get("id") or name,
                    "name": name,
                    "kind": "openvswitch",
                    "bridgeName": name,
                    "vlanAware": True,
                    "portCount": br.get("portCount") or 0,
                    "status": br.get("status") or "up",
                }
            )
    for nad in nads:
        bridge = nad.get("ovsBridge") or nad.get("clusterNetwork")
        if not bridge or bridge in seen:
            continue
        seen.add(bridge)
        kind = "openvswitch" if nad.get("ovsBridge") else "harvester-clusternetwork"
        rows.append(
            {
                "id": bridge,
                "name": bridge,
                "kind": kind,
                "bridgeName": bridge,
                "vlanAware": True,
                "portCount": 0,
                "status": "up",
            }
        )
    return rows


def _sdn_zones_from_overlays(overlays: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": item.get("id") or item.get("name", ""),
            "name": item.get("name", ""),
            "zoneType": item.get("protocol", "vxlan").lower(),
            "vni": item.get("vni") or 0,
            "tenant": item.get("tenant") or "default",
            "nodeCount": 0,
        }
        for item in overlays
    ]


def collect_networking_slice(kubeconfig: str | None = None) -> dict[str, Any]:
    kubeconfig = kubeconfig or _find_kubeconfig()
    if not kubeconfig:
        return {"available": False}

    ovs = collect_ovs_inventory()
    nads = _collect_nads(kubeconfig)
    vlans = _collect_vlans_from_nads(nads, kubeconfig)
    overlays = [
        {
            "id": nad["id"],
            "name": nad["name"],
            "protocol": nad.get("networkType", "OverlayNetwork"),
            "vni": nad.get("vlanId") or 0,
            "tenant": (nad.get("namespace") or "default"),
        }
        for nad in nads
        if nad.get("networkType") == "OverlayNetwork"
    ]

    return {
        "available": True,
        "ovsAvailable": ovs.get("available", False),
        "virtualSwitches": ovs.get("bridges") or [],
        "ovsPorts": ovs.get("ports") or [],
        "ovsFlows": ovs.get("flows") or [],
        "virtualBridges": _virtual_bridges_from_nads(nads, ovs.get("bridges") or []),
        "portGroups": _port_groups_from_nads(nads),
        "sdnZones": _sdn_zones_from_overlays(overlays),
        "vlans": vlans,
        "overlays": overlays,
        "ingressRoutes": _collect_ingress(kubeconfig),
        "policyMatrix": _collect_policy_matrix(kubeconfig),
        "tenants": _collect_tenants(kubeconfig),
        "nads": nads,
    }
