#!/usr/bin/env python3
"""Apply Kubernetes manifests on the Harvester node (kubectl apply)."""

from __future__ import annotations

import json
import subprocess
import tempfile
from typing import Any

from cluster_metrics import _find_kubeconfig


def _kubectl_json(kubeconfig: str, *args: str) -> dict[str, Any] | None:
    cmd = ["kubectl", "--kubeconfig", kubeconfig, *args, "-o", "json"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
        if proc.returncode != 0:
            return None
        return json.loads(proc.stdout or "{}")
    except (json.JSONDecodeError, subprocess.TimeoutExpired, OSError):
        return None


def apply_manifest_yaml(manifest_yaml: str, dry_run: bool = False) -> dict[str, Any]:
    kubeconfig = _find_kubeconfig()
    if not kubeconfig:
        return {"success": False, "error": "kubeconfig not found on node", "output": ""}

    manifest_yaml = (manifest_yaml or "").strip()
    if not manifest_yaml:
        return {"success": False, "error": "empty manifest", "output": ""}

    cmd = ["kubectl", "--kubeconfig", kubeconfig, "apply", "-f", "-"]
    if dry_run:
        cmd.append("--dry-run=server")

    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as tmp:
            tmp.write(manifest_yaml)
            tmp_path = tmp.name
        cmd = ["kubectl", "--kubeconfig", kubeconfig, "apply", "-f", tmp_path]
        if dry_run:
            cmd.append("--dry-run=server")
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=False)
        ok = proc.returncode == 0
        return {
            "success": ok,
            "error": None if ok else (proc.stderr.strip() or proc.stdout.strip() or "kubectl apply failed"),
            "output": (proc.stdout or proc.stderr or "").strip(),
            "dryRun": dry_run,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "kubectl apply timed out", "output": ""}
    except OSError as exc:
        return {"success": False, "error": str(exc), "output": ""}


def attach_workload_network(payload: dict[str, Any]) -> dict[str, Any]:
    kubeconfig = _find_kubeconfig()
    if not kubeconfig:
        return {"success": False, "error": "kubeconfig not found on node", "output": ""}

    kind = (payload.get("kind") or "vm").lower()
    namespace = payload.get("namespace") or "default"
    name = payload.get("machineName") or payload.get("name") or ""
    interface_name = payload.get("interfaceName") or "net1"
    network_attachment = payload.get("networkAttachment") or ""
    model = payload.get("model") or "virtio"

    if not name or not network_attachment:
        return {"success": False, "error": "machineName and networkAttachment required", "output": ""}

    if kind == "vm":
        vm = _kubectl_json(kubeconfig, "get", "virtualmachines.kubevirt.io", name, "-n", namespace)
        if not vm:
            return {"success": False, "error": "VirtualMachine %s/%s not found" % (namespace, name), "output": ""}
        spec = vm.get("spec") or {}
        template = spec.get("template") or {}
        tpl_spec = template.get("spec") or {}
        networks = list(tpl_spec.get("networks") or [])
        domain = tpl_spec.get("domain") or {}
        devices = domain.get("devices") or {}
        interfaces = list(devices.get("interfaces") or [])

        if any(net.get("name") == interface_name for net in networks):
            return {"success": False, "error": "interface %s already exists" % interface_name, "output": ""}

        networks.append({"name": interface_name, "multus": {"networkName": network_attachment, "default": len(networks) == 0}})
        interfaces.append({"name": interface_name, "model": model, "bridge": {}})
        tpl_spec["networks"] = networks
        domain.setdefault("devices", {})["interfaces"] = interfaces
        tpl_spec["domain"] = domain
        template["spec"] = tpl_spec
        spec["template"] = template
        vm["spec"] = spec
        return _apply_json(kubeconfig, vm)

    if kind in ("pod", "lxc", "docker"):
        pod = _kubectl_json(kubeconfig, "get", "pod", name, "-n", namespace)
        if not pod:
            return {"success": False, "error": "Pod %s/%s not found" % (namespace, name), "output": ""}
        meta = pod.setdefault("metadata", {})
        annotations = dict(meta.get("annotations") or {})
        raw = annotations.get("k8s.v1.cni.cncf.io/networks", "[]")
        try:
            networks = json.loads(raw)
            if not isinstance(networks, list):
                networks = []
        except json.JSONDecodeError:
            networks = []
        networks.append({"name": network_attachment, "interface": interface_name})
        annotations["k8s.v1.cni.cncf.io/networks"] = json.dumps(networks)
        if payload.get("ovsBridge"):
            annotations["nexus.nexus.io/ovs-bridge"] = str(payload.get("ovsBridge"))
        meta["annotations"] = annotations
        pod["metadata"] = meta
        return _apply_json(kubeconfig, pod)

    return {"success": False, "error": "unsupported workload kind: %s" % kind, "output": ""}


def _apply_json(kubeconfig: str, obj: dict[str, Any]) -> dict[str, Any]:
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
            json.dump(obj, tmp)
            tmp_path = tmp.name
        proc = subprocess.run(
            ["kubectl", "--kubeconfig", kubeconfig, "apply", "-f", tmp_path],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        ok = proc.returncode == 0
        return {
            "success": ok,
            "error": None if ok else (proc.stderr.strip() or proc.stdout.strip() or "kubectl apply failed"),
            "output": (proc.stdout or proc.stderr or "").strip(),
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "kubectl apply timed out", "output": ""}
    except OSError as exc:
        return {"success": False, "error": str(exc), "output": ""}
