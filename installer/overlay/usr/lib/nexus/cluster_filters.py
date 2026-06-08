#!/usr/bin/env python3
"""Filters for separating platform infrastructure from user workloads."""

from __future__ import annotations

# Harvester / RKE2 / Rancher / Nexus platform namespaces — not end-user workloads.
PLATFORM_NAMESPACES = frozenset(
    {
        "kube-system",
        "kube-public",
        "kube-node-lease",
        "longhorn-system",
        "harvester-system",
        "cattle-system",
        "cattle-fleet-system",
        "cattle-fleet-local-system",
        "cattle-fleet-clusters-system",
        "cattle-monitoring-system",
        "cattle-logging-system",
        "cattle-dashboards",
        "cattle-provisioning-capi-system",
        "cattle-ui-plugin-system",
        "cattle-global-data",
        "cattle-impersonation-system",
        "nexus-system",
        "nexus-xdr",
        "nexus-cockpit",
    }
)


def is_user_namespace(namespace: str) -> bool:
    ns = (namespace or "").strip()
    if not ns:
        return False
    if ns in PLATFORM_NAMESPACES:
        return False
    if ns.startswith("kube-"):
        return False
    if ns.startswith("cattle-"):
        return False
    return True
