#!/usr/bin/env python3
"""Open vSwitch operations via ovs-vsctl / ovs-ofctl on the Harvester node."""

from __future__ import annotations

import re
import shutil
import subprocess
from typing import Any


def _ovs_available() -> bool:
    return shutil.which("ovs-vsctl") is not None


def _run(cmd: list[str], timeout: int = 60) -> tuple[bool, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
        out = (proc.stdout or proc.stderr or "").strip()
        return proc.returncode == 0, out
    except (subprocess.TimeoutExpired, OSError) as exc:
        return False, str(exc)


def run_ovs_commands(commands: list[str]) -> dict[str, Any]:
    if not commands:
        return {"success": False, "error": "no commands", "output": ""}
    if not _ovs_available():
        return {
            "success": False,
            "error": "ovs-vsctl not found on node — install openvswitch-switch",
            "output": "",
        }

    outputs: list[str] = []
    for raw in commands:
        cmd = raw.strip()
        if not cmd:
            continue
        if cmd.startswith("ovs-vsctl"):
            parts = _tokenize_ovs_cmd(cmd)
        elif cmd.startswith("ovs-ofctl"):
            parts = _tokenize_ovs_cmd(cmd)
        else:
            return {"success": False, "error": "unsupported command: %s" % cmd[:80], "output": "\n".join(outputs)}
        ok, out = _run(parts)
        outputs.append(out)
        if not ok:
            return {"success": False, "error": out or "command failed: %s" % cmd[:120], "output": "\n".join(outputs)}
    return {"success": True, "error": None, "output": "\n".join(outputs)}


def _tokenize_ovs_cmd(cmd: str) -> list[str]:
    # Preserve quoted OpenFlow match/actions strings.
    parts: list[str] = []
    current: list[str] = []
    in_quote = False
    quote_char = ""
    for ch in cmd:
        if in_quote:
            current.append(ch)
            if ch == quote_char:
                in_quote = False
            continue
        if ch in ('"', "'"):
            in_quote = True
            quote_char = ch
            current.append(ch)
            continue
        if ch.isspace():
            if current:
                parts.append("".join(current))
                current = []
            continue
        current.append(ch)
    if current:
        parts.append("".join(current))
    return parts


def collect_ovs_inventory() -> dict[str, Any]:
    if not _ovs_available():
        return {"available": False, "bridges": [], "ports": [], "flows": []}

    ok, br_out = _run(["ovs-vsctl", "list-br"])
    if not ok:
        return {"available": False, "bridges": [], "ports": [], "flows": [], "error": br_out}

    bridges: list[dict[str, Any]] = []
    ports: list[dict[str, Any]] = []
    flows: list[dict[str, Any]] = []

    for br in [line.strip() for line in br_out.splitlines() if line.strip()]:
        _, fail_mode = _run(["ovs-vsctl", "get", "bridge", br, "fail_mode"])
        _, dp_type = _run(["ovs-vsctl", "get", "bridge", br, "datapath_type"])
        _, port_list = _run(["ovs-vsctl", "list-ports", br])
        port_names = [p.strip() for p in port_list.splitlines() if p.strip()]
        _, flow_dump = _run(["ovs-ofctl", "-O", "OpenFlow13", "dump-flows", br])
        flow_lines = [ln for ln in flow_dump.splitlines() if "priority=" in ln]
        bridges.append(
            {
                "id": br,
                "name": br,
                "failMode": fail_mode.strip('"'),
                "datapathType": dp_type.strip('"') or "system",
                "portCount": len(port_names),
                "flowCount": len(flow_lines),
                "status": "up",
            }
        )
        for port_name in port_names:
            _, tag_out = _run(["ovs-vsctl", "get", "port", port_name, "tag"])
            tag_val = tag_out.strip()
            tag = int(tag_val) if tag_val.isdigit() else None
            _, type_out = _run(["ovs-vsctl", "get", "interface", port_name, "type"])
            ports.append(
                {
                    "id": "%s/%s" % (br, port_name),
                    "bridge": br,
                    "name": port_name,
                    "portType": type_out.strip('"') or "system",
                    "tag": tag,
                    "rxMbps": 0,
                    "txMbps": 0,
                    "status": "up",
                }
            )
        for idx, line in enumerate(flow_lines[:40]):
            parsed = _parse_flow_line(br, idx, line)
            if parsed:
                flows.append(parsed)

    return {"available": True, "bridges": bridges, "ports": ports, "flows": flows}


def _parse_flow_line(bridge: str, idx: int, line: str) -> dict[str, Any] | None:
    m = re.search(r"table=(\d+).*priority=(\d+).*?( actions=.*)$", line)
    if not m:
        return None
    table = int(m.group(1))
    priority = int(m.group(2))
    rest = line
    actions_idx = rest.find(" actions=")
    match = rest[:actions_idx].strip() if actions_idx >= 0 else rest
    actions = rest[actions_idx + len(" actions=") :].strip() if actions_idx >= 0 else ""
    return {
        "id": "%s-flow-%d" % (bridge, idx),
        "bridge": bridge,
        "table": table,
        "priority": priority,
        "match": match,
        "actions": actions,
    }
