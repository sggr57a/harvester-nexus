#!/usr/bin/env python3
"""Apply Kubernetes manifests on the Harvester node (kubectl apply)."""

from __future__ import annotations

import subprocess
import tempfile
from typing import Any

from cluster_metrics import _find_kubeconfig


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
