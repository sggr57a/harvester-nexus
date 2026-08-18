#!/usr/bin/env python3
"""Collect runtime alerts from deployed XDR sensor pods.

The cockpit previously counted Falco / Tetragon / Suricata / Wazuh pods
and then ingested only Kubernetes Warning events, every one hardcoded
to ``sensorSeverity: 'medium'``. This module reads the actual alert
streams those pods emit and preserves the severity the sensor assigned.

Each parser is a pure function over a log line so it can be unit-tested
without a cluster. Collection shells out to ``kubectl logs`` (and, when
stdout is empty, ``kubectl exec`` of the well-known alert files).
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from datetime import datetime
from typing import Any, Callable

NS = "nexus-xdr"
SENSOR_LABELS = (
    "falco",
    "tetragon",
    "suricata",
    "wazuh-agent",
    "wazuh-manager",
)

# Paths inside the upstream images when stdout is not JSON.
_SENSOR_FILES = {
    "suricata": ("/var/log/suricata/eve.json",),
    "wazuh-manager": (
        "/var/ossec/logs/alerts/alerts.json",
        "/var/ossec/logs/alerts/alerts.log",
    ),
}

_RFC3339 = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)"
)

FALCO_PRIORITY = {
    "emergency": "critical",
    "alert": "critical",
    "critical": "critical",
    "error": "high",
    "warning": "medium",
    "notice": "low",
    "informational": "info",
    "debug": "info",
}

WAZUH_LEVEL_TO_SEV = (
    (15, "critical"),
    (12, "high"),
    (8, "medium"),
    (4, "low"),
    (0, "info"),
)

# Kubernetes Warning reasons that are more than a scheduling hiccup.
K8S_HIGH_REASONS = {
    "oomkilling",
    "failed",
    "failedmount",
    "failedcreate",
    "evicted",
    "node-not-ready",
    "nodenotready",
}
K8S_MEDIUM_REASONS = {
    "backoff",
    "unhealthy",
    "failedscheduling",
    "inspectfailed",
    "killing",
    "networknotready",
}


def _json_object(line: str) -> dict[str, Any] | None:
    text = line.strip()
    if not text or text[0] not in "{[":
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _parse_ts(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        ts = float(value)
        return int(ts * 1000) if ts < 10_000_000_000 else int(ts)
    text = str(value).strip()
    match = _RFC3339.match(text)
    if not match:
        return None
    stamp = match.group("date").replace(" ", "T")
    if stamp.endswith("Z"):
        stamp = stamp[:-1] + "+00:00"
    if "." in stamp:
        head, rest = stamp.split(".", 1)
        tz_index = max(rest.rfind("+"), rest.rfind("-"))
        if tz_index > 0:
            frac, tz = rest[:tz_index], rest[tz_index:]
        else:
            frac, tz = rest, "+00:00"
        stamp = head + "." + (frac + "000000")[:6] + tz
    elif "+" not in stamp[10:] and "-" not in stamp[10:]:
        stamp = stamp + "+00:00"
    try:
        return int(datetime.fromisoformat(stamp).timestamp() * 1000)
    except ValueError:
        return None


def _event(
    *,
    source: str,
    endpoint_id: str,
    kind: str,
    severity: str,
    payload: dict[str, Any],
    process: str | None = None,
    remote_ip: str | None = None,
    remote_host: str | None = None,
    event_hash: str | None = None,
    timestamp_ms: int | None = None,
    message: str = "",
    namespace: str = "",
    name: str = "",
) -> dict[str, Any]:
    ident_src = "|".join(
        [
            source,
            endpoint_id,
            kind,
            str(timestamp_ms or ""),
            message or json.dumps(payload, sort_keys=True)[:160],
        ]
    )
    ident = "%s-%s" % (source, hashlib.sha1(ident_src.encode("utf-8")).hexdigest()[:16])
    clean_payload: dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(value, (str, int, float, bool)):
            clean_payload[key] = value
        elif isinstance(value, list) and all(isinstance(v, str) for v in value):
            clean_payload[key] = value
        elif value is not None:
            clean_payload[key] = str(value)
    event: dict[str, Any] = {
        "id": ident,
        "source": source,
        "endpointId": endpoint_id or "cluster",
        "kind": kind,
        "timestampMs": timestamp_ms or 0,
        "payload": clean_payload,
        "sensorSeverity": severity,
        "message": message,
        "namespace": namespace,
        "name": name,
    }
    if process:
        event["process"] = process
    if remote_ip:
        event["remoteIp"] = remote_ip
    if remote_host:
        event["remoteHost"] = remote_host
    if event_hash:
        event["hash"] = event_hash
    return event


def wazuh_level_to_severity(level: Any) -> str:
    try:
        numeric = int(level)
    except (TypeError, ValueError):
        return "medium"
    for threshold, label in WAZUH_LEVEL_TO_SEV:
        if numeric >= threshold:
            return label
    return "info"


def suricata_severity(value: Any) -> str:
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        return "medium"
    if numeric <= 1:
        return "high"
    if numeric == 2:
        return "medium"
    return "low"


def k8s_reason_severity(reason: str, message: str = "") -> str:
    """Derive severity from a Warning event — never a single hardcoded value."""
    token = (reason or "").replace(" ", "").lower()
    blob = "%s %s" % (token, (message or "").lower())
    if token in K8S_HIGH_REASONS or "oom" in blob:
        return "high"
    if token in K8S_MEDIUM_REASONS:
        return "medium"
    return "low"


def falco_kind(rule: str, output_fields: dict[str, Any]) -> str:
    blob = " ".join(
        [
            (rule or "").lower(),
            str(output_fields.get("evt.type", "")).lower(),
            str(output_fields.get("fd.type", "")).lower(),
        ]
    )
    if "exec" in blob or "spawn" in blob:
        return "process-exec"
    if "open" in blob or "write" in blob:
        return "file-write" if "write" in blob else "file-open"
    if "connect" in blob or "accept" in blob or "network" in blob:
        return "network-connect"
    if "dns" in blob:
        return "dns-query"
    return "syscall"


def parse_falco_line(line: str) -> dict[str, Any] | None:
    data = _json_object(line)
    if not data:
        return None
    # Falco JSON: { output, priority, rule: str, time, output_fields }.
    # Reject Suricata / Wazuh / Tetragon shapes that also happen to be JSON.
    if isinstance(data.get("rule"), dict) or data.get("event_type") == "alert":
        return None
    if "process_exec" in data or "process_kprobe" in data or "process_connect" in data:
        return None
    if "rule" not in data and "output" not in data:
        return None
    fields = data.get("output_fields") or {}
    if not isinstance(fields, dict):
        fields = {}
    rule = str(data.get("rule") or "falco")
    priority = str(data.get("priority") or data.get("priority_label") or "Warning").lower()
    ns = str(fields.get("k8s.ns.name") or fields.get("ka.target.namespace") or "")
    pod = str(fields.get("k8s.pod.name") or fields.get("container.name") or "")
    proc = str(fields.get("proc.name") or fields.get("proc.exepath") or "") or None
    path = str(fields.get("fd.name") or fields.get("fd.path") or "")
    message = str(data.get("output") or rule)
    payload = {
        "rule": rule,
        "output": message,
        "path": path,
        "container": str(fields.get("container.id") or ""),
    }
    return _event(
        source="falco",
        endpoint_id=pod or ns or "host",
        kind=falco_kind(rule, fields),
        severity=FALCO_PRIORITY.get(priority, "medium"),
        payload=payload,
        process=proc,
        timestamp_ms=_parse_ts(data.get("time") or data.get("timestamp")),
        message=message,
        namespace=ns,
        name=pod or rule,
    )


def parse_tetragon_line(line: str) -> dict[str, Any] | None:
    data = _json_object(line)
    if not data:
        return None
    process_block = None
    kind = "syscall"
    if "process_exec" in data:
        process_block = (data.get("process_exec") or {}).get("process") or {}
        kind = "process-exec"
    elif "process_kprobe" in data:
        block = data.get("process_kprobe") or {}
        process_block = block.get("process") or {}
        fn = str(block.get("function_name") or "")
        if "connect" in fn or "tcp" in fn:
            kind = "network-connect"
        elif "open" in fn:
            kind = "file-open"
        else:
            kind = "syscall"
    elif "process_connect" in data:
        process_block = (data.get("process_connect") or {}).get("process") or {}
        kind = "network-connect"
    else:
        return None
    if not isinstance(process_block, dict):
        process_block = {}
    pod_info = process_block.get("pod") or {}
    if not isinstance(pod_info, dict):
        pod_info = {}
    ns = str(pod_info.get("namespace") or "")
    pod = str(pod_info.get("name") or "")
    binary = str(process_block.get("binary") or process_block.get("arguments") or "")
    proc = binary.rsplit("/", 1)[-1] if binary else None
    message = binary or kind
    return _event(
        source="tetragon",
        endpoint_id=pod or ns or "host",
        kind=kind,
        severity="medium" if kind == "process-exec" else "low",
        payload={
            "binary": binary,
            "function": str((data.get("process_kprobe") or {}).get("function_name") or ""),
            "policy": str(data.get("node_name") or ""),
        },
        process=proc,
        timestamp_ms=_parse_ts(data.get("time") or process_block.get("start_time")),
        message=message,
        namespace=ns,
        name=pod or binary,
    )


def parse_suricata_line(line: str) -> dict[str, Any] | None:
    data = _json_object(line)
    if not data or data.get("event_type") not in (None, "alert"):
        # Accept alert events; skip flow/dns/http noise.
        if data and data.get("event_type") and data.get("event_type") != "alert":
            return None
        if not data or "alert" not in data:
            return None
    alert = data.get("alert") or {}
    if not isinstance(alert, dict) or not alert:
        return None
    signature = str(alert.get("signature") or "suricata alert")
    category = str(alert.get("category") or "")
    severity = suricata_severity(alert.get("severity"))
    src = str(data.get("src_ip") or "")
    dest = str(data.get("dest_ip") or "")
    host = str(data.get("http", {}).get("hostname") or "") if isinstance(data.get("http"), dict) else ""
    return _event(
        source="suricata",
        endpoint_id=dest or "edge",
        kind="ids-signature",
        severity=severity,
        payload={
            "signature": signature,
            "category": category,
            "sid": alert.get("signature_id") or alert.get("gid") or "",
            "dest_port": data.get("dest_port") or "",
        },
        remote_ip=src or None,
        remote_host=host or None,
        timestamp_ms=_parse_ts(data.get("timestamp")),
        message=signature,
        namespace="",
        name=signature,
    )


def parse_wazuh_line(line: str) -> dict[str, Any] | None:
    data = _json_object(line)
    if not data:
        return None
    rule = data.get("rule")
    if not isinstance(rule, dict):
        return None
    level = rule.get("level")
    description = str(rule.get("description") or "wazuh alert")
    agent = data.get("agent") if isinstance(data.get("agent"), dict) else {}
    agent_name = str((agent or {}).get("name") or "")
    data_block = data.get("data") if isinstance(data.get("data"), dict) else {}
    groups = rule.get("groups") if isinstance(rule.get("groups"), list) else []
    group_blob = " ".join(str(g) for g in groups).lower()
    kind = "auth"
    if "syscheck" in group_blob or "fim" in group_blob:
        kind = "file-write"
    elif "vulnerability" in group_blob or "cve" in group_blob:
        kind = "cve-detected"
    elif "web" in group_blob or "ids" in group_blob or "attack" in group_blob:
        kind = "ids-signature"
    elif "syslog" in group_blob or "sudo" in group_blob:
        kind = "auth"
    mitre = rule.get("mitre") if isinstance(rule.get("mitre"), dict) else {}
    techniques = mitre.get("technique") if isinstance(mitre, dict) else None
    src_ip = str((data_block or {}).get("srcip") or data.get("srcip") or "") or None
    return _event(
        source="wazuh-manager",
        endpoint_id=agent_name or "host",
        kind=kind,
        severity=wazuh_level_to_severity(level),
        payload={
            "ruleId": str(rule.get("id") or ""),
            "description": description,
            "level": int(level) if str(level).isdigit() else 0,
            "groups": [str(g) for g in groups][:8],
            "techniques": [str(t) for t in techniques][:8] if isinstance(techniques, list) else [],
        },
        remote_ip=src_ip,
        timestamp_ms=_parse_ts(data.get("timestamp") or data.get("id")),
        message=description,
        namespace="",
        name=agent_name or str(rule.get("id") or "wazuh"),
    )


def parse_k8s_warning(item: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    meta = item.get("metadata") or {}
    involved = item.get("involvedObject") or {}
    reason = str(item.get("reason") or "")
    message = str(item.get("message") or reason or "warning")
    ns = str(meta.get("namespace") or involved.get("namespace") or "")
    name = str(involved.get("name") or meta.get("name") or "")
    return _event(
        source="kubernetes-audit",
        endpoint_id=ns or name or "cluster",
        kind="kube-api",
        severity=k8s_reason_severity(reason, message),
        payload={"message": message, "reason": reason, "type": str(item.get("type") or "Warning")},
        timestamp_ms=_parse_ts((meta.get("creationTimestamp") or item.get("eventTime") or item.get("lastTimestamp"))),
        message=message,
        namespace=ns,
        name=name,
    )


_PARSERS: dict[str, Callable[[str], dict[str, Any] | None]] = {
    "falco": parse_falco_line,
    "tetragon": parse_tetragon_line,
    "suricata": parse_suricata_line,
    "wazuh-agent": parse_wazuh_line,
    "wazuh-manager": parse_wazuh_line,
}


def _kubectl(kubeconfig: str, args: list[str], timeout: int = 20) -> str:
    cmd = ["kubectl", "--kubeconfig", kubeconfig, *args]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if proc.returncode != 0:
        return (proc.stdout or "") + (proc.stderr or "")
    return proc.stdout or ""


def _logs_for_sensor(kubeconfig: str, sensor: str, tail: int = 80) -> str:
    text = _kubectl(
        kubeconfig,
        [
            "logs",
            "-n",
            NS,
            "-l",
            "app.kubernetes.io/name=%s" % sensor,
            "--tail=%d" % tail,
            "--prefix=false",
        ],
        timeout=15,
    )
    if text.strip():
        return text
    for path in _SENSOR_FILES.get(sensor, ()):
        text = _kubectl(
            kubeconfig,
            [
                "exec",
                "-n",
                NS,
                "deploy/%s" % sensor if sensor.endswith("manager") else "ds/%s" % sensor,
                "--",
                "sh",
                "-c",
                "tail -n %d %s 2>/dev/null || true" % (tail, path),
            ],
            timeout=15,
        )
        if text.strip():
            return text
    return ""


def _parse_lines(sensor: str, text: str) -> list[dict[str, Any]]:
    parser = _PARSERS.get(sensor)
    if parser is None:
        return []
    events: list[dict[str, Any]] = []
    for line in text.splitlines():
        event = parser(line)
        if event:
            events.append(event)
    return events


def collect_sensor_events(kubeconfig: str, limit: int = 80) -> list[dict[str, Any]]:
    """Pull recent alerts from each deployed sensor plus Kubernetes warnings."""
    events: list[dict[str, Any]] = []
    seen: set[str] = set()
    for sensor in ("falco", "tetragon", "suricata", "wazuh-manager", "wazuh-agent"):
        raw = _logs_for_sensor(kubeconfig, sensor)
        for event in _parse_lines(sensor, raw):
            if event["id"] in seen:
                continue
            seen.add(event["id"])
            events.append(event)

    warnings = _kubectl(
        kubeconfig,
        ["get", "events", "-A", "--field-selector=type=Warning", "-o", "json"],
        timeout=20,
    )
    try:
        payload = json.loads(warnings) if warnings.strip().startswith("{") else {}
    except json.JSONDecodeError:
        payload = {}
    if isinstance(payload, dict):
        for item in (payload.get("items") or [])[-40:]:
            event = parse_k8s_warning(item)
            if event and event["id"] not in seen:
                seen.add(event["id"])
                events.append(event)

    events.sort(key=lambda e: e.get("timestampMs") or 0)
    return events[-limit:]


def collect_sensor_health(kubeconfig: str) -> dict[str, Any]:
    raw = _kubectl(kubeconfig, ["get", "pods", "-n", NS, "-o", "json"], timeout=20)
    try:
        data = json.loads(raw) if raw.strip().startswith("{") else {}
    except json.JSONDecodeError:
        data = {}
    by_sensor: dict[str, dict[str, int | bool]] = {
        name: {"healthy": 0, "total": 0, "ingesting": False} for name in SENSOR_LABELS
    }
    healthy = 0
    total = 0
    if isinstance(data, dict):
        for item in data.get("items") or []:
            meta = item.get("metadata") or {}
            labels = meta.get("labels") or {}
            name = labels.get("app.kubernetes.io/name") or meta.get("name", "")
            key = None
            for sensor in SENSOR_LABELS:
                if sensor in str(name):
                    key = sensor
                    break
            total += 1
            running = (item.get("status") or {}).get("phase") == "Running"
            if running:
                healthy += 1
            if key:
                by_sensor[key]["total"] = int(by_sensor[key]["total"]) + 1
                if running:
                    by_sensor[key]["healthy"] = int(by_sensor[key]["healthy"]) + 1
    return {
        "sensorsHealthy": healthy,
        "sensorsTotal": total,
        "deployed": total > 0,
        "bySensor": by_sensor,
    }
